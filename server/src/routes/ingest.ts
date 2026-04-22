import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { listAdapters, getAdapter } from '../lib/ingest/adapters/index.js';
import {
  createRun, enqueueJobs, pickBatch,
  markRunning, markDone, markFailed
} from '../lib/ingest/queue.js';
import { runPipelineForAdapter } from '../lib/ingest/pipeline.js';
import { DRAIN_BATCH_SIZE } from '../lib/ingest/config.js';

const router = Router();

async function flagOn(): Promise<boolean> {
  const row = await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  return data['scholarships-ingest-enabled'] === true;
}

function cronAuth(req: import('express').Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const hdr = req.headers.authorization ?? '';
  return hdr === `Bearer ${expected}`;
}

router.post('/scholarships/run', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn())) {
      return res.json({ success: true, data: { enqueued: 0, skipped: 'flag-off' } });
    }
    const run = await createRun(req.query.manual === 'true' ? 'manual:api' : 'cron');
    const adapters = listAdapters();
    await enqueueJobs(run.id, adapters.map((a) => a.id));
    return res.json({ success: true, data: { runId: run.id, enqueued: adapters.length } });
  } catch (e) { next(e); }
});

router.post('/drain', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn())) {
      return res.json({ success: true, data: { processed: 0, skipped: 'flag-off' } });
    }
    const batch = await pickBatch(DRAIN_BATCH_SIZE);
    let processed = 0;
    const totals = { itemsPublished: 0, itemsQueued: 0, itemsRejected: 0, sourcesOk: 0, sourcesFailed: 0 };
    for (const job of batch) {
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
        totals.itemsQueued += r.itemsQueued;
        totals.itemsRejected += r.itemsRejected;
        totals.sourcesOk++;
      } catch (err) {
        await markFailed(job.id, (err as Error).message);
        totals.sourcesFailed++;
      }
      processed++;
    }
    return res.json({ success: true, data: { processed, totals } });
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

export default router;
