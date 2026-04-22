// Admin ingest-stats endpoint.
//
// Mounted at /api/admin/ingest-stats.
// Gated by requireAuth + requireRole('ADMIN') — same pattern as
// adminScholarshipsReview and adminOpportunitiesReview.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// GET /api/admin/ingest-stats
router.get('/', async (_req, res, next) => {
  try {
    // ── lastRuns ──────────────────────────────────────────────────────────────
    const lastRuns = await prisma.ingestRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        sourcesOk: true,
        sourcesFailed: true,
        itemsPublished: true,
        itemsQueued: true,
        itemsRejected: true,
        triggeredBy: true
      }
    });

    // ── jobsBreakdown ─────────────────────────────────────────────────────────
    // Fetch IngestJob rows from the last 7 days, then reduce to one entry per
    // source (keeping the most-recently-updated row).
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentJobs = await prisma.ingestJob.findMany({
      where: { updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      select: { source: true, status: true, attempts: true, updatedAt: true }
    });

    // Deduplicate by source — first occurrence is the most recent (sorted desc).
    const seen = new Set<string>();
    const jobsBreakdown: { source: string; lastStatus: string; attempts: number; updatedAt: Date }[] = [];
    for (const job of recentJobs) {
      if (!seen.has(job.source)) {
        seen.add(job.source);
        jobsBreakdown.push({
          source: job.source,
          lastStatus: job.status,
          attempts: job.attempts,
          updatedAt: job.updatedAt
        });
      }
    }

    // ── counts ────────────────────────────────────────────────────────────────
    const [schGroups, oppGroups] = await Promise.all([
      prisma.scholarship.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.opportunity.groupBy({ by: ['status'], _count: { id: true } })
    ]);

    function toCounts(groups: { status: string; _count: { id: number } }[]) {
      const map: Record<string, number> = {};
      for (const g of groups) map[g.status] = g._count.id;
      return {
        pendingReview: map['PENDING_REVIEW'] ?? 0,
        published: map['PUBLISHED'] ?? 0,
        rejected: map['REJECTED'] ?? 0,
        expired: map['EXPIRED'] ?? 0
      };
    }

    const counts = {
      scholarships: toCounts(schGroups as { status: string; _count: { id: number } }[]),
      opportunities: toCounts(oppGroups as { status: string; _count: { id: number } }[])
    };

    // ── flags ─────────────────────────────────────────────────────────────────
    const flagRow = await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } });
    const flagData = (flagRow?.data ?? {}) as Record<string, unknown>;
    const flags = {
      scholarshipsIngestEnabled: flagData['scholarships-ingest-enabled'] === true,
      opportunitiesIngestEnabled: flagData['opportunities-ingest-enabled'] === true
    };

    res.json({
      success: true,
      data: { lastRuns, jobsBreakdown, counts, flags }
    });
  } catch (e) { next(e); }
});

export default router;
