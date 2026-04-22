// Ad-hoc URL ingestion — crawls the seed URL's domain and runs the
// appropriate pipeline on all items found.
//
// Strategy:
//   • Crawl budget: 40 s from entry point
//   • Max pages:    30
//   • Concurrency:  5 parallel fetches per BFS batch
//   • Same-origin:  URL.host exact match enforced in crawler
//   • robots.txt:   respected (fail-open)
//   • Dedup:        by canonical applicationUrl before pipeline
//
// Exports: ingestAdhocUrl(url, kind) → AdhocResult (extended)

import { canonicalUrl } from './canonicalUrl.js';
import { robotsAllows, httpGet } from './adapters/_base.js';
import { crawlDomain } from './crawler.js';
import { runPipelineForAdapter } from './pipeline.js';
import { runJobsPipelineForAdapter } from './jobsPipeline.js';
import type { SourceAdapter, RawScholarship } from './types.js';
import type { JobAdapter, RawJob } from './adapters/jobs/_base.js';

export type AdhocResult = {
  crawled: number;
  pagesVisited: string[];
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
  ingestedSample: Array<{
    title: string;
    status: string;
    confidence?: number;
  }>;
  message?: string;
};

const CRAWL_BUDGET_MS = 40_000;
const MAX_CRAWL_PAGES = 30;

// ── Public API ────────────────────────────────────────────────────────────────

export async function ingestAdhocUrl(
  url: string,
  kind: 'scholarship' | 'job'
): Promise<AdhocResult> {
  const canonical = canonicalUrl(url);
  const effectiveUrl = canonical || url;

  // Check robots.txt for the seed URL (fail-open)
  const allowed = await robotsAllows(effectiveUrl).catch(() => true);
  if (!allowed) {
    const err = new Error('Site blocks ingestion bots');
    (err as any).statusCode = 403;
    throw err;
  }

  // Probe the seed URL to fail-fast on non-200 responses (preserves old behaviour).
  const seedProbe = await httpGet(effectiveUrl, { timeoutMs: 5000 });
  if (seedProbe.status === 0 || (!seedProbe.body && seedProbe.status !== 200)) {
    const err = new Error('Could not fetch URL');
    (err as any).statusCode = 400;
    throw err;
  }
  if (seedProbe.status < 200 || seedProbe.status >= 400) {
    const err = new Error(`Could not fetch URL (HTTP ${seedProbe.status})`);
    (err as any).statusCode = 400;
    throw err;
  }

  // Derive hostname for adapter display name
  let hostname = 'unknown';
  try { hostname = new URL(effectiveUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

  // Crawl the domain
  const startedAt = Date.now();
  const crawlResult = await crawlDomain(effectiveUrl, {
    maxPages: MAX_CRAWL_PAGES,
    deadlineMs: CRAWL_BUDGET_MS
  });

  const { pagesVisited, items: rawItems } = crawlResult;

  if (rawItems.length === 0) {
    return {
      crawled: pagesVisited.length,
      pagesVisited,
      itemsFound: 0,
      itemsPublished: 0,
      itemsQueued: 0,
      itemsRejected: 0,
      ingestedSample: [],
      message: 'No structured items could be extracted from this domain.'
    };
  }

  const adapterId = `adhoc:${hostname}:${startedAt}`;

  if (kind === 'scholarship') {
    const scholarships: RawScholarship[] = rawItems.map((item) => ({
      title: item.title,
      description: item.description || 'No description extracted.',
      applicationUrl: item.link,
      providerName: hostname,
      tags: []
    }));

    const frozen = scholarships.slice();
    const adapter: SourceAdapter = {
      id: adapterId,
      displayName: `Ad-hoc: ${hostname}`,
      url: effectiveUrl,
      kind: 'html',
      fetch: async () => frozen
    };

    const pipelineResult = await runPipelineForAdapter(adapter);

    return {
      crawled: pagesVisited.length,
      pagesVisited,
      ...pipelineResult,
      ingestedSample: frozen.slice(0, 5).map((s) => ({
        title: s.title,
        status: 'ingested',
        confidence: undefined
      }))
    };
  } else {
    // kind === 'job'
    const jobs: RawJob[] = rawItems.map((item) => ({
      externalId: item.link,
      title: item.title,
      description: item.description || 'No description extracted.',
      company: hostname,
      location: '',
      locationType: 'ONSITE' as const,
      type: 'FULL_TIME' as const,
      applicationUrl: item.link,
      currency: 'GHS'
    }));

    const frozen = jobs.slice();
    const adapter: JobAdapter = {
      id: adapterId,
      displayName: `Ad-hoc: ${hostname}`,
      url: effectiveUrl,
      kind: 'html',
      fetch: async () => frozen
    };

    const pipelineResult = await runJobsPipelineForAdapter(adapter);

    return {
      crawled: pagesVisited.length,
      pagesVisited,
      ...pipelineResult,
      ingestedSample: frozen.slice(0, 5).map((j) => ({
        title: j.title,
        status: 'ingested',
        confidence: undefined
      }))
    };
  }
}
