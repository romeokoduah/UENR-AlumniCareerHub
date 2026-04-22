import { prisma } from '../prisma.js';
import { aiJson as realAiJson } from '../aiProvider.js';
import type { SourceAdapter, RawScholarship, VerificationSignals } from './types.js';
import { sanitizeTitle, sanitizeDescription } from './sanitize.js';
import { canonicalUrl } from './canonicalUrl.js';
import { isEnglish } from './language.js';
import { urlReachable } from './reach.js';
import { classifyScholarship } from './classify.js';
import { scoreConfidence, decisionFor } from './verify.js';
import { findDuplicate } from './dedup.js';

type PipelineDeps = {
  aiJson?: typeof realAiJson;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
};

type PipelineResult = {
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
};

async function getBotUserId(): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { email: 'ingestion-bot@uenr.local' } });
  return u?.id ?? null;
}

function levelFromText(text: string): 'UNDERGRAD' | 'MASTERS' | 'PHD' | 'POSTDOC' {
  const t = text.toLowerCase();
  if (/\bpostdoc/.test(t)) return 'POSTDOC';
  if (/\bphd|doctora/.test(t)) return 'PHD';
  if (/\bmasters?|msc|ma\b/.test(t)) return 'MASTERS';
  return 'UNDERGRAD';
}

function requiredFieldsOk(raw: RawScholarship): number {
  if (!raw.title?.trim()) return 0;
  if (!raw.applicationUrl?.trim()) return 0;
  if (!raw.description || raw.description.length < 100) return 0;
  return 1;
}

export async function runPipelineForAdapter(
  adapter: SourceAdapter,
  deps: PipelineDeps = {}
): Promise<PipelineResult> {
  const aiJson = deps.aiJson ?? realAiJson;
  const fetchFn = deps.fetchFn ?? fetch;

  const items = await adapter.fetch();
  const result: PipelineResult = {
    itemsFound: items.length,
    itemsPublished: 0,
    itemsQueued: 0,
    itemsRejected: 0
  };

  const botUserId = await getBotUserId();

  for (const raw of items) {
    const title = sanitizeTitle(raw.title);
    const description = sanitizeDescription(raw.description);
    const provider = sanitizeTitle(raw.providerName ?? adapter.displayName);
    const canonSourceUrl = canonicalUrl(raw.applicationUrl);

    // Dedup: pull a small candidate set. Canonical URL match is the
    // cheapest-first path; title fuzzy match needs provider equality.
    const candidates = await prisma.scholarship.findMany({
      where: {
        OR: [
          { applicationUrl: canonSourceUrl },
          { provider: { equals: provider, mode: 'insensitive' } }
        ]
      },
      select: { id: true, applicationUrl: true, provider: true, title: true, additionalSources: true }
    });
    const dupe = findDuplicate(candidates, {
      applicationUrl: canonSourceUrl || raw.applicationUrl,
      provider,
      title
    });

    const classifier = await classifyScholarship(
      { ...raw, title, description, providerName: provider },
      aiJson
    );
    const clsReach = await urlReachable(canonSourceUrl || raw.applicationUrl, fetchFn);
    const deadlineOk = classifier?.deadline.kind === 'date'
      ? (new Date(classifier.deadline.iso).getTime() > Date.now() ? 1 : 0)
      : classifier?.deadline.kind === 'rolling' ? 0.8 : 0;
    const categoryFacets = classifier
      ? [classifier.category.field, classifier.category.region, classifier.category.funding]
      : [null, null, null];
    const categoryFilled = categoryFacets.filter((v) => v !== null).length / categoryFacets.length;

    const signals: VerificationSignals = {
      urlReachable: clsReach ? 1 : 0,
      requiredFields: requiredFieldsOk(raw),
      isScholarship: classifier?.isScholarship ?? 0,
      deadlineOk,
      englishContent: isEnglish(`${title} ${description}`) ? 1 : 0,
      categoryExtracted: categoryFilled
    };
    const confidence = scoreConfidence(signals);
    const decision = decisionFor(confidence);

    if (decision === 'PUBLISHED') result.itemsPublished++;
    else if (decision === 'PENDING_REVIEW') result.itemsQueued++;
    else result.itemsRejected++;

    const deadlineDate = classifier?.deadline.kind === 'date'
      ? new Date(classifier.deadline.iso)
      : null;

    const data = {
      title,
      provider,
      description,
      eligibility: '',   // Phase 1 doesn't extract eligibility separately
      applicationUrl: canonSourceUrl || raw.applicationUrl,
      level: levelFromText(`${title} ${description}`),
      deadline: deadlineDate,
      tags: raw.tags ?? [],
      source: 'INGESTED' as const,
      status: decision,
      sourceUrl: canonSourceUrl || raw.applicationUrl,
      sourceName: adapter.id,
      confidence,
      verifierReason: classifier?.reasoning ?? '',
      ingestedAt: new Date(),
      category: classifier?.category as unknown as object ?? {},
      rawPayload: raw as unknown as object,
      isApproved: decision === 'PUBLISHED',
      submittedById: botUserId ?? undefined
    };

    if (dupe) {
      const dupeRow = candidates.find((c) => c.id === dupe.id);
      const addl = Array.from(new Set([...(dupeRow?.additionalSources ?? []), adapter.id]));
      await prisma.scholarship.update({
        where: { id: dupe.id },
        data: {
          ...data,
          additionalSources: addl
        }
      });
    } else {
      await prisma.scholarship.create({ data });
    }
  }

  return result;
}
