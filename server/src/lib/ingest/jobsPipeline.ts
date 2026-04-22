// Jobs ingestion pipeline — mirrors pipeline.ts for scholarships, but adapted for
// Opportunity rows. Key differences:
//   - No AI classifier (Adzuna items ARE jobs by definition)
//   - Simplified confidence: urlReachable + requiredFields + englishContent + postedRecency
//   - Dedup by applicationUrl canonical OR by sourceName + externalId (stored in rawPayload)

import { prisma } from '../prisma.js';
import type { JobAdapter, RawJob } from './adapters/jobs/_base.js';
import { sanitizeTitle, sanitizeDescription } from './sanitize.js';
import { canonicalUrl } from './canonicalUrl.js';
import { isEnglish } from './language.js';
import { urlReachable } from './reach.js';
import { confidenceForJob, decisionForJob, postedRecencyScore } from './jobsVerify.js';

type JobsPipelineDeps = {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
};

type JobsPipelineResult = {
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
};

// Exported so tests can use a consistent bot user seed approach.
export async function getBotUserId(): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { email: 'ingestion-bot@uenr.local' } });
  return u?.id ?? null;
}

// Map the RawJob type string to the Prisma OpportunityType enum value.
// The schema uses NATIONAL_SERVICE which doesn't map from Adzuna, so default to FULL_TIME.
function mapOpportunityType(
  raw: RawJob['type']
): 'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'NATIONAL_SERVICE' | 'VOLUNTEER' | 'CONTRACT' {
  switch (raw) {
    case 'FULL_TIME':   return 'FULL_TIME';
    case 'PART_TIME':   return 'PART_TIME';
    case 'CONTRACT':    return 'CONTRACT';
    case 'INTERNSHIP':  return 'INTERNSHIP';
    case 'VOLUNTEER':   return 'VOLUNTEER';
    default:            return 'FULL_TIME';
  }
}

// Map RawJob locationType to the Prisma LocationType enum value.
function mapLocationType(
  raw: RawJob['locationType']
): 'REMOTE' | 'ONSITE' | 'HYBRID' {
  switch (raw) {
    case 'REMOTE': return 'REMOTE';
    case 'HYBRID': return 'HYBRID';
    default:       return 'ONSITE';
  }
}

function requiredFieldsOk(raw: RawJob): number {
  if (!raw.title?.trim()) return 0;
  if (!raw.applicationUrl?.trim()) return 0;
  if (!raw.company?.trim()) return 0;
  if (!raw.description || raw.description.length < 100) return 0;
  return 1;
}

export async function runJobsPipelineForAdapter(
  adapter: JobAdapter,
  deps: JobsPipelineDeps = {}
): Promise<JobsPipelineResult> {
  const fetchFn = deps.fetchFn ?? fetch;

  const items = await adapter.fetch();
  const result: JobsPipelineResult = {
    itemsFound: items.length,
    itemsPublished: 0,
    itemsQueued: 0,
    itemsRejected: 0
  };

  const botUserId = await getBotUserId();

  // Fan-out in parallel — same rationale as scholarship pipeline.
  const decisions = await Promise.all(items.map(async (raw): Promise<'PUBLISHED' | 'PENDING_REVIEW' | 'REJECTED'> => {
    const title = sanitizeTitle(raw.title);
    const description = sanitizeDescription(raw.description);
    const company = sanitizeTitle(raw.company);
    const canonSourceUrl = canonicalUrl(raw.applicationUrl);

    // Dedup: prefer canonical URL match; fall back to sourceName + externalId.
    const candidates = await prisma.opportunity.findMany({
      where: {
        OR: [
          { applicationUrl: canonSourceUrl || raw.applicationUrl },
          {
            sourceName: adapter.id,
            rawPayload: { path: ['externalId'], equals: raw.externalId }
          }
        ]
      },
      select: {
        id: true,
        applicationUrl: true,
        sourceName: true,
        additionalSources: true,
        rawPayload: true
      }
    });

    // Pick the first matching dupe (URL match is authoritative).
    const dupe = candidates.find((c) => {
      if (canonSourceUrl && canonicalUrl(c.applicationUrl ?? '') === canonSourceUrl) return true;
      if (c.sourceName === adapter.id) {
        const payload = c.rawPayload as Record<string, unknown> | null;
        if (payload?.externalId === raw.externalId) return true;
      }
      return false;
    }) ?? null;

    // Reachability probe — same HEAD-then-GET pattern as scholarship pipeline.
    const reachable = await urlReachable(canonSourceUrl || raw.applicationUrl, fetchFn);

    const signals = {
      urlReachable:   reachable ? 1 : 0,
      requiredFields: requiredFieldsOk(raw),
      englishContent: isEnglish(`${title} ${description}`) ? 1 : 0,
      postedRecency:  postedRecencyScore(raw.postedAt)
    };

    const confidence = confidenceForJob(signals);
    const decision   = decisionForJob(confidence);

    const data = {
      title,
      description,
      company,
      location: raw.location || '',
      locationType: mapLocationType(raw.locationType),
      type: mapOpportunityType(raw.type),
      salaryMin: raw.salaryMin ?? null,
      salaryMax: raw.salaryMax ?? null,
      currency: raw.currency ?? 'GHS',
      deadline: null,
      industry: raw.industry ?? null,
      applicationUrl: canonSourceUrl || raw.applicationUrl,
      isApproved: decision === 'PUBLISHED',
      isActive: true,
      source: 'INGESTED' as const,
      status: decision,
      sourceUrl: canonSourceUrl || raw.applicationUrl,
      sourceName: adapter.id,
      confidence,
      verifierReason: `urlReachable=${signals.urlReachable} requiredFields=${signals.requiredFields} english=${signals.englishContent} recency=${signals.postedRecency}`,
      ingestedAt: new Date(),
      category: raw.industry ? { industry: raw.industry } : {},
      rawPayload: { ...raw } as unknown as object,
      additionalSources: [] as string[],
      postedById: botUserId ?? null
    };

    if (dupe) {
      const addl = Array.from(new Set([...(dupe.additionalSources ?? []), adapter.id]));
      await prisma.opportunity.update({
        where: { id: dupe.id },
        data: { ...data, additionalSources: addl }
      });
    } else {
      await prisma.opportunity.create({ data });
    }

    return decision;
  }));

  for (const d of decisions) {
    if (d === 'PUBLISHED')       result.itemsPublished++;
    else if (d === 'PENDING_REVIEW') result.itemsQueued++;
    else                          result.itemsRejected++;
  }

  return result;
}
