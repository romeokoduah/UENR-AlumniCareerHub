import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { listAdapters, getAdapter } from '../lib/ingest/adapters/index.js';
import { listJobAdapters, getJobAdapter } from '../lib/ingest/adapters/jobs/index.js';
import {
  createRun, enqueueJobs, pickBatch,
  markRunning, markDone, markFailed
} from '../lib/ingest/queue.js';
import { runPipelineForAdapter } from '../lib/ingest/pipeline.js';
import { runJobsPipelineForAdapter } from '../lib/ingest/jobsPipeline.js';
import { DRAIN_BATCH_SIZE } from '../lib/ingest/config.js';
import { runAll } from './ingestRunAll.js';

const router = Router();

// ---------------------------------------------------------------------------
// Feature-flag helpers
// ---------------------------------------------------------------------------

async function flagOn(flagKey: string): Promise<boolean> {
  const row = await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  return data[flagKey] === true;
}

function cronAuth(req: import('express').Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const hdr = req.headers.authorization ?? '';
  return hdr === `Bearer ${expected}`;
}

// ---------------------------------------------------------------------------
// Drain helpers
// ---------------------------------------------------------------------------

// Prefix used to distinguish job adapter slugs from scholarship adapter slugs
// when stored in IngestJob.source.
const JOB_PREFIX = 'job:';

// Scholarship drain — only processes IngestJob entries that are NOT job-prefixed.
async function drainBatch(): Promise<{
  processed: number;
  totals: { itemsPublished: number; itemsQueued: number; itemsRejected: number; sourcesOk: number; sourcesFailed: number };
}> {
  const batch = await pickBatch(DRAIN_BATCH_SIZE);
  const totals = { itemsPublished: 0, itemsQueued: 0, itemsRejected: 0, sourcesOk: 0, sourcesFailed: 0 };
  let processed = 0;
  for (const job of batch) {
    await markRunning(job.id);
    if (job.source.startsWith(JOB_PREFIX)) {
      // Job adapter — route to jobs pipeline.
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
      // Scholarship adapter.
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

// Scholarship-only drain — for the standalone /drain endpoint which predates jobs.
async function drainScholarshipBatch(): Promise<{
  processed: number;
  totals: { itemsPublished: number; itemsQueued: number; itemsRejected: number; sourcesOk: number; sourcesFailed: number };
}> {
  const batch = await pickBatch(DRAIN_BATCH_SIZE);
  const totals = { itemsPublished: 0, itemsQueued: 0, itemsRejected: 0, sourcesOk: 0, sourcesFailed: 0 };
  let processed = 0;
  for (const job of batch) {
    // Skip job-prefixed entries in scholarship-only drain.
    if (job.source.startsWith(JOB_PREFIX)) continue;
    await markRunning(job.id);
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
    processed++;
  }
  return { processed, totals };
}

// ---------------------------------------------------------------------------
// Existing scholarship endpoints (unchanged behavior)
// ---------------------------------------------------------------------------

router.post('/scholarships/run', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn('scholarships-ingest-enabled'))) {
      return res.json({ success: true, data: { enqueued: 0, skipped: 'flag-off' } });
    }
    const run = await createRun(req.query.manual === 'true' ? 'manual:api' : 'cron');
    const adapters = listAdapters();
    await enqueueJobs(run.id, adapters.map((a) => a.id));
    // Vercel Hobby allows only ONE cron per path per day; to cover the full
    // enqueue → drain flow in a single daily invocation, drain inline.
    // DRAIN_BATCH_SIZE (6) is sized for the 60s function ceiling; Slice B
    // may need a smarter multi-pass strategy once we have 18 adapters.
    const drain = await drainScholarshipBatch();
    return res.json({
      success: true,
      data: { runId: run.id, enqueued: adapters.length, ...drain }
    });
  } catch (e) { next(e); }
});

router.post('/drain', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn('scholarships-ingest-enabled'))) {
      return res.json({ success: true, data: { processed: 0, skipped: 'flag-off' } });
    }
    const drain = await drainScholarshipBatch();
    return res.json({ success: true, data: drain });
  } catch (e) { next(e); }
});

router.get('/health', async (_req, res, next) => {
  try {
    const lastRun = await prisma.ingestRun.findFirst({ orderBy: { startedAt: 'desc' } });
    const pending = await prisma.ingestJob.count({ where: { status: 'PENDING' } });
    return res.json({ success: true, data: { lastRun, pendingJobs: pending } });
  } catch (e) { next(e); }
});

router.post('/expire', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    // Flag-independent: we always want to expire stale rows so the public
    // page stays accurate even if ingestion is paused.
    const updated = await prisma.scholarship.updateMany({
      where: {
        status: 'PUBLISHED',
        deadline: { lt: new Date() }
      },
      data: { status: 'EXPIRED' }
    });
    return res.json({ success: true, data: { expired: updated.count } });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// New: opportunities endpoints
// ---------------------------------------------------------------------------

router.post('/opportunities/run', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn('opportunities-ingest-enabled'))) {
      return res.json({ success: true, data: { enqueued: 0, skipped: 'flag-off' } });
    }
    const run = await createRun(req.query.manual === 'true' ? 'manual:api' : 'cron');
    const adapters = listJobAdapters();
    // Store with "job:" prefix so the drain can distinguish from scholarship jobs.
    await enqueueJobs(run.id, adapters.map((a) => `${JOB_PREFIX}${a.id}`));
    const drain = await drainBatch();
    return res.json({
      success: true,
      data: { runId: run.id, enqueued: adapters.length, ...drain }
    });
  } catch (e) { next(e); }
});

router.post('/opportunities/expire', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    // Flag-independent: always expire stale opportunities.
    const updated = await prisma.opportunity.updateMany({
      where: {
        status: 'PUBLISHED',
        deadline: { lt: new Date() }
      },
      data: { status: 'EXPIRED' }
    });
    return res.json({ success: true, data: { expired: updated.count } });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// New: combined /all endpoints (Vercel Hobby 2-cron-entry targets)
// ---------------------------------------------------------------------------

router.post('/all/run', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    const data = await runAll('all', 'cron');
    return res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/all/expire', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    // Flag-independent: expire both tables unconditionally.
    const [schResult, oppResult] = await Promise.all([
      prisma.scholarship.updateMany({
        where: { status: 'PUBLISHED', deadline: { lt: new Date() } },
        data: { status: 'EXPIRED' }
      }),
      prisma.opportunity.updateMany({
        where: { status: 'PUBLISHED', deadline: { lt: new Date() } },
        data: { status: 'EXPIRED' }
      })
    ]);
    return res.json({
      success: true,
      data: { scholarships: schResult.count, opportunities: oppResult.count }
    });
  } catch (e) { next(e); }
});

export default router;
