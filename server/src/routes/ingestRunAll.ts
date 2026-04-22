// Shared run-all logic extracted from ingest.ts so both the cron-auth'd
// /api/ingest/all/run and the admin-auth'd /api/admin/ingest/run-now can
// call the same function without duplicating code.

import { prisma } from '../lib/prisma.js';
import { listAdapters } from '../lib/ingest/adapters/index.js';
import { listJobAdapters } from '../lib/ingest/adapters/jobs/index.js';
import {
  createRun, enqueueJobs, pickBatch,
  markRunning, markDone, markFailed
} from '../lib/ingest/queue.js';
import { runPipelineForAdapter } from '../lib/ingest/pipeline.js';
import { runJobsPipelineForAdapter } from '../lib/ingest/jobsPipeline.js';
import { getAdapter } from '../lib/ingest/adapters/index.js';
import { getJobAdapter } from '../lib/ingest/adapters/jobs/index.js';
import { DRAIN_BATCH_SIZE } from '../lib/ingest/config.js';

// Prefix used to distinguish job adapter slugs from scholarship adapter slugs
// when stored in IngestJob.source.
const JOB_PREFIX = 'job:';

async function flagOn(flagKey: string): Promise<boolean> {
  const row = await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  return data[flagKey] === true;
}

// Drain helper — shared between both pipelines (mirrors ingest.ts drainBatch).
async function drainBatch(allowJobPrefix: boolean): Promise<{
  processed: number;
  totals: { itemsPublished: number; itemsQueued: number; itemsRejected: number; sourcesOk: number; sourcesFailed: number };
}> {
  const batch = await pickBatch(DRAIN_BATCH_SIZE);
  const totals = { itemsPublished: 0, itemsQueued: 0, itemsRejected: 0, sourcesOk: 0, sourcesFailed: 0 };
  let processed = 0;
  for (const job of batch) {
    await markRunning(job.id);
    if (job.source.startsWith(JOB_PREFIX)) {
      if (!allowJobPrefix) { continue; }
      const adapterId = job.source.slice(JOB_PREFIX.length);
      const adapter = getJobAdapter(adapterId);
      if (!adapter) {
        await markFailed(job.id, `unknown job adapter: ${adapterId}`);
        totals.sourcesFailed++;
        continue;
      }
      try {
        const r = await runJobsPipelineForAdapter(adapter);
        await markDone(job.id, { itemsFound: r.itemsFound, itemsPublished: r.itemsPublished, itemsQueued: r.itemsQueued });
        totals.itemsPublished += r.itemsPublished;
        totals.itemsQueued    += r.itemsQueued;
        totals.itemsRejected  += r.itemsRejected;
        totals.sourcesOk++;
      } catch (err) {
        await markFailed(job.id, (err as Error).message);
        totals.sourcesFailed++;
      }
    } else {
      const adapter = getAdapter(job.source);
      if (!adapter) {
        await markFailed(job.id, `unknown adapter: ${job.source}`);
        totals.sourcesFailed++;
        continue;
      }
      try {
        const r = await runPipelineForAdapter(adapter);
        await markDone(job.id, { itemsFound: r.itemsFound, itemsPublished: r.itemsPublished, itemsQueued: r.itemsQueued });
        totals.itemsPublished += r.itemsPublished;
        totals.itemsQueued    += r.itemsQueued;
        totals.itemsRejected  += r.itemsRejected;
        totals.sourcesOk++;
      } catch (err) {
        await markFailed(job.id, (err as Error).message);
        totals.sourcesFailed++;
      }
    }
    processed++;
  }
  return { processed, totals };
}

type PipelineResult = {
  enqueued: number;
  skipped?: string;
  processed?: number;
  totals?: { itemsPublished: number; itemsQueued: number; itemsRejected: number; sourcesOk: number; sourcesFailed: number };
  error?: string;
};

export async function runAll(
  which: 'scholarships' | 'opportunities' | 'all',
  triggeredBy: 'cron' | 'admin:ui' = 'cron'
): Promise<{ scholarships: PipelineResult; opportunities: PipelineResult }> {
  const runScholarships = which === 'scholarships' || which === 'all';
  const runOpportunities = which === 'opportunities' || which === 'all';

  let scholarships: PipelineResult = { enqueued: 0, skipped: 'not-selected' };
  let opportunities: PipelineResult = { enqueued: 0, skipped: 'not-selected' };

  if (runScholarships) {
    try {
      if (!(await flagOn('scholarships-ingest-enabled'))) {
        scholarships = { enqueued: 0, skipped: 'flag-off' };
      } else {
        const run = await createRun(triggeredBy === 'admin:ui' ? 'manual:api' : 'cron');
        const adapters = listAdapters();
        await enqueueJobs(run.id, adapters.map((a) => a.id));
        const drain = await drainBatch(false);
        scholarships = { enqueued: adapters.length, ...drain };
      }
    } catch (err) {
      console.error('[runAll] scholarships pipeline error:', err);
      scholarships = { enqueued: 0, error: (err as Error).message };
    }
  }

  if (runOpportunities) {
    try {
      if (!(await flagOn('opportunities-ingest-enabled'))) {
        opportunities = { enqueued: 0, skipped: 'flag-off' };
      } else {
        const run = await createRun(triggeredBy === 'admin:ui' ? 'manual:api' : 'cron');
        const adapters = listJobAdapters();
        await enqueueJobs(run.id, adapters.map((a) => `${JOB_PREFIX}${a.id}`));
        const drain = await drainBatch(true);
        opportunities = { enqueued: adapters.length, ...drain };
      }
    } catch (err) {
      console.error('[runAll] opportunities pipeline error:', err);
      opportunities = { enqueued: 0, error: (err as Error).message };
    }
  }

  return { scholarships, opportunities };
}
