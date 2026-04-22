import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../prisma.js';
import { createRun, enqueueJobs, pickBatch, markRunning, markDone, markFailed } from '../queue.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('queue primitives', () => {
  let runId: string;

  beforeEach(async () => {
    await prisma.ingestJob.deleteMany({ where: { source: { startsWith: 'test-' } } });
    const run = await createRun('manual:test');
    runId = run.id;
  });

  afterAll(async () => {
    await prisma.ingestJob.deleteMany({ where: { source: { startsWith: 'test-' } } });
    await prisma.ingestRun.deleteMany({ where: { triggeredBy: 'manual:test' } });
  });

  it('enqueueJobs creates PENDING rows idempotent by (runId, source)', async () => {
    await enqueueJobs(runId, ['test-a', 'test-b']);
    await enqueueJobs(runId, ['test-a', 'test-c']);
    const jobs = await prisma.ingestJob.findMany({ where: { runId } });
    expect(jobs.length).toBe(3);
    expect(jobs.filter((j) => j.status === 'PENDING').length).toBe(3);
  });

  it('pickBatch returns up to N PENDING jobs', async () => {
    await enqueueJobs(runId, ['test-1', 'test-2', 'test-3']);
    const batch = await pickBatch(2);
    expect(batch.length).toBe(2);
  });

  it('markRunning / markDone / markFailed transition state correctly', async () => {
    await enqueueJobs(runId, ['test-x']);
    const [job] = await pickBatch(1);
    await markRunning(job.id);
    let after = await prisma.ingestJob.findUnique({ where: { id: job.id } });
    expect(after?.status).toBe('RUNNING');
    await markDone(job.id, { itemsFound: 3, itemsPublished: 2, itemsQueued: 1 });
    after = await prisma.ingestJob.findUnique({ where: { id: job.id } });
    expect(after?.status).toBe('DONE');
    expect(after?.itemsPublished).toBe(2);

    await enqueueJobs(runId, ['test-y']);
    const [job2] = await pickBatch(1);
    await markFailed(job2.id, 'boom');
    after = await prisma.ingestJob.findUnique({ where: { id: job2.id } });
    expect(after?.status).toBe('FAILED');
    expect(after?.error).toBe('boom');
    expect(after?.attempts).toBe(1);
  });
});
