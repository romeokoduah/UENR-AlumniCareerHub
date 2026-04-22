// Unified moderation history endpoint.
// Mounted at /api/admin/moderation-history.
// Auth: requireAuth + requireRole('ADMIN') — lighter gate than requireSuperuser;
// any admin can read the history log.
//
// GET /api/admin/moderation-history
//   query params:
//     kind     — optional: scholarship | opportunity | moderation (maps to AuditLog.targetType patterns)
//     action   — optional: approve | reject | bulk_approve | bulk_reject (substring match on action field)
//     actorId  — optional: filter by actor
//     limit    — default 50, max 200
//     cursor   — ISO datetime string for pagination (createdAt < cursor)
//
// POST /api/admin/moderation-history/:auditId/undo
//   Undo a recent (< 24h) approve/reject action. Restores previousStatus +
//   previousIsApproved from the audit metadata, then writes a new AuditLog
//   entry with action '<base>.undo'.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// ---- Canonical action names that belong to the moderation history --------
//
// This is the full set of action prefixes we index here. Any action that
// starts with one of these base strings is shown in history.
const HISTORY_ACTION_PREFIXES = [
  'scholarship.approve',
  'scholarship.reject',
  'scholarship.bulk_approve',
  'scholarship.bulk_reject',
  'opportunity.approve',
  'opportunity.reject',
  'opportunity.bulk_approve',
  'opportunity.bulk_reject',
  'moderation.'
];

// Undo-able base actions (without the .undo suffix).
const UNDOABLE_ACTIONS = new Set([
  'scholarship.approve',
  'scholarship.reject',
  'scholarship.bulk_approve',
  'scholarship.bulk_reject',
  'opportunity.approve',
  'opportunity.reject',
  'opportunity.bulk_approve',
  'opportunity.bulk_reject',
  'moderation.opportunity.approved',
  'moderation.scholarship.approved',
  'moderation.learning_resource.approved',
  'moderation.interview_question.approved',
  'moderation.achievement.approved',
  'moderation.portfolio.approved',
  'moderation.interview_question_flag.approved',
  'moderation.opportunity.rejected',
  'moderation.scholarship.rejected',
  'moderation.learning_resource.rejected',
  'moderation.interview_question.rejected',
  'moderation.achievement.rejected',
  'moderation.portfolio.rejected',
  'moderation.interview_question_flag.rejected',
  'moderation.bulk_approve',
  'moderation.bulk_reject'
]);

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// ---- Helper: batch-fetch target titles ----------------------------------

async function stitchTargetTitles(
  rows: Array<{ targetType: string | null; targetId: string | null }>
): Promise<Map<string, string | null>> {
  // Map of "<targetType>:<targetId>" -> title
  const result = new Map<string, string | null>();

  // Group ids by targetType
  const byType = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.targetType || !row.targetId) continue;
    const key = row.targetType;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(row.targetId);
  }

  for (const [type, ids] of byType.entries()) {
    const uniqueIds = [...new Set(ids)];
    let titleRows: Array<{ id: string; title: string }> = [];

    try {
      switch (type.toLowerCase()) {
        case 'scholarship':
          titleRows = await prisma.scholarship.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, title: true }
          });
          break;
        case 'opportunity':
          titleRows = await prisma.opportunity.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, title: true }
          });
          break;
        case 'learning_resource':
          titleRows = await prisma.learningResource.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, title: true }
          });
          break;
        case 'interview_question':
        case 'interview_question_flag': {
          const qRows = await prisma.interviewQuestion.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, prompt: true }
          });
          titleRows = qRows.map((q) => ({ id: q.id, title: q.prompt.slice(0, 120) }));
          break;
        }
        case 'achievement':
          titleRows = await prisma.achievement.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, title: true }
          });
          break;
        case 'portfolio':
          titleRows = await prisma.portfolio.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, title: true }
          });
          break;
        default:
          break;
      }
    } catch {
      // If the table lookup fails, leave titles as null — best effort.
    }

    for (const r of titleRows) {
      result.set(`${type}:${r.id}`, r.title);
    }
  }

  return result;
}

// ---- GET / ---------------------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    const { kind, action, actorId, limit: limitRaw, cursor } = req.query as Record<string, string | undefined>;

    const limit = Math.min(Number(limitRaw) || 50, 200);
    const cursorDate = cursor ? new Date(cursor) : undefined;

    // Build action filter: all actions whose prefix matches our canonical list.
    // Further narrowed by query params.
    const actionContains: string[] = [];

    if (kind === 'scholarship') {
      actionContains.push('scholarship.approve', 'scholarship.reject', 'scholarship.bulk_approve', 'scholarship.bulk_reject');
    } else if (kind === 'opportunity') {
      actionContains.push('opportunity.approve', 'opportunity.reject', 'opportunity.bulk_approve', 'opportunity.bulk_reject');
    } else if (kind === 'moderation') {
      actionContains.push('moderation.');
    }
    // else: no kind filter — pull all

    // Sub-filter by action type (approve/reject/bulk_approve/bulk_reject/undo)
    let actionFilter: string | undefined;
    if (action) {
      // Map frontend-friendly terms to patterns we can match
      const map: Record<string, string> = {
        approve: '.approve',
        reject: '.reject',
        bulk_approve: '.bulk_approve',
        bulk_reject: '.bulk_reject',
        undo: '.undo'
      };
      actionFilter = map[action] ?? action;
    }

    // Fetch from AuditLog — Prisma doesn't support LIKE natively in all
    // adapters so we fetch a wider set and filter in JS.
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(actorId ? { actorId } : {}),
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3, // over-fetch to allow JS-level filtering
      select: {
        id: true,
        action: true,
        actorId: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true
      }
    });

    // JS-level filter: must match one of our canonical prefixes.
    const filtered = rows.filter((r) => {
      const matchesPrefix = HISTORY_ACTION_PREFIXES.some((pfx) => r.action.startsWith(pfx));
      if (!matchesPrefix) return false;

      if (actionContains.length > 0) {
        const matchesKind = actionContains.some((pfx) => r.action.startsWith(pfx));
        if (!matchesKind) return false;
      }

      if (actionFilter) {
        if (!r.action.includes(actionFilter)) return false;
      }

      return true;
    });

    const page = filtered.slice(0, limit);

    // Fetch actor names.
    const actorIds = [...new Set(page.map((r) => r.actorId))];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];
    const actorMap = new Map(actors.map((u) => [u.id, u]));

    // Fetch target titles (best-effort).
    const titleMap = await stitchTargetTitles(page);

    const now = Date.now();
    const items = page.map((r) => {
      const actor = actorMap.get(r.actorId);
      const actorName = actor
        ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email
        : r.actorId;
      const titleKey = r.targetType && r.targetId ? `${r.targetType}:${r.targetId}` : null;
      const targetTitle = titleKey ? (titleMap.get(titleKey) ?? null) : null;
      const age = now - new Date(r.createdAt).getTime();
      return {
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        actorName,
        targetType: r.targetType,
        targetId: r.targetId,
        targetTitle,
        metadata: r.metadata,
        createdAt: r.createdAt,
        canUndo: UNDOABLE_ACTIONS.has(r.action) && age < TWENTY_FOUR_HOURS
      };
    });

    const nextCursor =
      page.length === limit ? page[page.length - 1].createdAt.toISOString() : null;

    res.json({ success: true, data: { items, nextCursor } });
  } catch (e) { next(e); }
});

// ---- POST /:auditId/undo -------------------------------------------------

router.post('/:auditId/undo', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const actorId = req.auth!.sub;

    const entry = await prisma.auditLog.findUnique({ where: { id: auditId } });
    if (!entry) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Audit log entry not found' } });
    }

    // Must be within 24h.
    const age = Date.now() - new Date(entry.createdAt).getTime();
    if (age > TWENTY_FOUR_HOURS) {
      return res.status(422).json({ success: false, error: { code: 'TOO_OLD', message: 'Undo window has expired (24 hours)' } });
    }

    // Must be an undo-able action.
    if (!UNDOABLE_ACTIONS.has(entry.action)) {
      return res.status(422).json({ success: false, error: { code: 'NOT_UNDOABLE', message: 'This action cannot be undone' } });
    }

    const meta = entry.metadata as Record<string, unknown> | null;

    let restored = 0;

    // ---- Single-item scholarship/opportunity actions ---------------------
    if (entry.action === 'scholarship.approve' || entry.action === 'scholarship.reject') {
      if (!meta || meta.previousStatus === undefined || meta.previousIsApproved === undefined) {
        return res.status(422).json({ success: false, error: { code: 'MISSING_METADATA', message: 'Action predates undo support; cannot reverse' } });
      }
      if (!entry.targetId) {
        return res.status(422).json({ success: false, error: { code: 'MISSING_TARGET', message: 'No target id in audit entry' } });
      }
      await prisma.scholarship.update({
        where: { id: entry.targetId },
        data: { status: meta.previousStatus as string, isApproved: meta.previousIsApproved as boolean }
      });
      restored = 1;
    } else if (entry.action === 'opportunity.approve' || entry.action === 'opportunity.reject') {
      if (!meta || meta.previousStatus === undefined || meta.previousIsApproved === undefined) {
        return res.status(422).json({ success: false, error: { code: 'MISSING_METADATA', message: 'Action predates undo support; cannot reverse' } });
      }
      if (!entry.targetId) {
        return res.status(422).json({ success: false, error: { code: 'MISSING_TARGET', message: 'No target id in audit entry' } });
      }
      await prisma.opportunity.update({
        where: { id: entry.targetId },
        data: { status: meta.previousStatus as string, isApproved: meta.previousIsApproved as boolean }
      });
      restored = 1;
    }
    // ---- Bulk scholarship/opportunity actions ----------------------------
    else if (entry.action === 'scholarship.bulk_approve' || entry.action === 'scholarship.bulk_reject') {
      if (!meta || !Array.isArray(meta.previousStates)) {
        return res.status(422).json({ success: false, error: { code: 'MISSING_METADATA', message: 'Action predates undo support; cannot reverse' } });
      }
      for (const prev of meta.previousStates as Array<{ id: string; status: string; isApproved: boolean }>) {
        try {
          await prisma.scholarship.update({
            where: { id: prev.id },
            data: { status: prev.status, isApproved: prev.isApproved }
          });
          restored++;
        } catch { /* row deleted since — skip */ }
      }
    } else if (entry.action === 'opportunity.bulk_approve' || entry.action === 'opportunity.bulk_reject') {
      if (!meta || !Array.isArray(meta.previousStates)) {
        return res.status(422).json({ success: false, error: { code: 'MISSING_METADATA', message: 'Action predates undo support; cannot reverse' } });
      }
      for (const prev of meta.previousStates as Array<{ id: string; status: string; isApproved: boolean }>) {
        try {
          await prisma.opportunity.update({
            where: { id: prev.id },
            data: { status: prev.status, isApproved: prev.isApproved }
          });
          restored++;
        } catch { /* row deleted since — skip */ }
      }
    }
    // ---- Universal moderation single-item actions -----------------------
    else if (entry.action.startsWith('moderation.') && entry.targetId) {
      // For universal moderation single-item actions the metadata doesn't
      // currently carry previousStatus/previousIsApproved. Best-effort undo
      // based on action suffix: .approved → reverse, .rejected → reverse.
      // If metadata does carry previousStatus, use it.
      if (entry.action.endsWith('.approved')) {
        const kind = entry.targetType;
        if (kind === 'scholarship' || kind === 'opportunity' || kind === 'learning_resource' ||
            kind === 'interview_question' || kind === 'achievement' || kind === 'portfolio' ||
            kind === 'interview_question_flag') {
          try {
            switch (kind) {
              case 'scholarship':
                await prisma.scholarship.update({ where: { id: entry.targetId }, data: { isApproved: false } });
                break;
              case 'opportunity':
                await prisma.opportunity.update({ where: { id: entry.targetId }, data: { isApproved: false } });
                break;
              case 'learning_resource':
                await prisma.learningResource.update({ where: { id: entry.targetId }, data: { isApproved: false } });
                break;
              case 'interview_question':
              case 'interview_question_flag':
                await prisma.interviewQuestion.update({ where: { id: entry.targetId }, data: { isApproved: false } });
                break;
              case 'achievement':
                await prisma.achievement.update({ where: { id: entry.targetId }, data: { isApproved: false } });
                break;
              case 'portfolio':
                await prisma.portfolio.update({ where: { id: entry.targetId }, data: { isPublished: false } });
                break;
            }
            restored = 1;
          } catch { /* row gone */ }
        }
      } else if (entry.action.endsWith('.rejected')) {
        // Reject undo is limited — deletes can't be undone. For scholarship/opportunity
        // we can restore status to PENDING_REVIEW.
        const kind = entry.targetType;
        try {
          if (kind === 'scholarship') {
            await prisma.scholarship.update({ where: { id: entry.targetId }, data: { isApproved: false, status: 'PENDING_REVIEW' } });
            restored = 1;
          } else if (kind === 'opportunity') {
            await prisma.opportunity.update({ where: { id: entry.targetId }, data: { isApproved: false, status: 'PENDING_REVIEW' } });
            restored = 1;
          }
          // For delete-based rejections (learning_resource, interview_question, achievement),
          // the row is gone — we cannot undo.
        } catch { /* row gone */ }
      } else if (entry.action === 'moderation.bulk_approve' || entry.action === 'moderation.bulk_reject') {
        // Bulk moderation undo — no previousStates recorded currently;
        // tell the caller metadata is missing.
        return res.status(422).json({ success: false, error: { code: 'MISSING_METADATA', message: 'Action predates undo support; cannot reverse' } });
      }
    }

    // Write the undo audit entry.
    await logAudit({
      actorId,
      action: `${entry.action}.undo`,
      targetType: entry.targetType ?? undefined,
      targetId: entry.targetId ?? undefined,
      metadata: { undidAuditId: auditId, restored }
    });

    res.json({ success: true, data: { restored } });
  } catch (e) { next(e); }
});

export default router;
