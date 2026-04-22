import { prisma } from '../prisma.js';

export async function createRun(triggeredBy: string) {
  return prisma.ingestRun.create({ data: { triggeredBy } });
}

export async function finalizeRun(
  id: string,
  tallies: { sourcesAttempted: number; sourcesOk: number; sourcesFailed: number;
            itemsPublished: number; itemsQueued: number; itemsRejected: number }
) {
  return prisma.ingestRun.update({
    where: { id },
    data: { ...tallies, endedAt: new Date() }
  });
}

export async function enqueueJobs(runId: string, sources: string[]) {
  if (sources.length === 0) return;
  await prisma.ingestJob.createMany({
    data: sources.map((source) => ({ runId, source, status: 'PENDING' })),
    skipDuplicates: true
  });
}

export async function pickBatch(size: number) {
  return prisma.ingestJob.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: size
  });
}

export async function markRunning(id: string) {
  return prisma.ingestJob.update({
    where: { id },
    data: { status: 'RUNNING', attempts: { increment: 1 } }
  });
}

export async function markDone(id: string, tallies: {
  itemsFound?: number; itemsPublished?: number; itemsQueued?: number;
}) {
  return prisma.ingestJob.update({
    where: { id },
    data: { status: 'DONE', ...tallies }
  });
}

export async function markFailed(id: string, error: string) {
  return prisma.ingestJob.update({
    where: { id },
    data: { status: 'FAILED', error: error.slice(0, 500), attempts: { increment: 1 } }
  });
}
