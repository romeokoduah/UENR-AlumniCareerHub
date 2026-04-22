// server/scripts/ingest-smoke.ts
// One-shot script: flips the flag on, runs ingestion for the _mock adapter,
// then prints the resulting DB rows. Run locally with:
//   CRON_SECRET=x bun scripts/ingest-smoke.ts
// (from inside the server/ directory).

import { prisma } from '../src/lib/prisma.js';
import { listAdapters } from '../src/lib/ingest/adapters/index.js';
import { createRun, enqueueJobs, pickBatch, markRunning, markDone, markFailed } from '../src/lib/ingest/queue.js';
import { runPipelineForAdapter } from '../src/lib/ingest/pipeline.js';

async function main() {
  await prisma.siteContent.upsert({
    where: { key: 'feature-flags' },
    create: { key: 'feature-flags', data: { 'scholarships-ingest-enabled': true } },
    update: { data: { 'scholarships-ingest-enabled': true } }
  });

  const run = await createRun('manual:smoke');
  const adapters = listAdapters();
  await enqueueJobs(run.id, adapters.map((a) => a.id));
  const batch = await pickBatch(100);

  for (const job of batch) {
    await markRunning(job.id);
    const adapter = adapters.find((a) => a.id === job.source)!;
    try {
      const r = await runPipelineForAdapter(adapter);
      await markDone(job.id, r);
      console.log(`[smoke] ${adapter.id}: found=${r.itemsFound} published=${r.itemsPublished} queued=${r.itemsQueued} rejected=${r.itemsRejected}`);
    } catch (e) {
      await markFailed(job.id, (e as Error).message);
      console.error(`[smoke] ${adapter.id} FAILED:`, e);
    }
  }

  const rows = await prisma.scholarship.findMany({
    where: { source: 'INGESTED' },
    select: { title: true, provider: true, status: true, confidence: true, sourceName: true }
  });
  console.log('[smoke] DB state:', rows);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
