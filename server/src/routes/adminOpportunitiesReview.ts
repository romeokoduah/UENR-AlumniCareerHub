// Admin opportunity review queue.
//
// Mounted at /api/admin/opportunities. Every endpoint is gated by
// requireAuth + requireRole('ADMIN') — same pattern as the scholarships
// review router; opportunity review is a routine admin task.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// GET /api/admin/opportunities/pending
// Returns up to 100 PENDING_REVIEW rows, newest first.
router.get('/pending', async (req, res, next) => {
  try {
    const items = await prisma.opportunity.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { ingestedAt: 'desc' },
      take: 100
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// Shared schema for bulk operations — must be declared before /:id routes so
// that /bulk/approve and /bulk/reject are matched before Express tries to
// interpret "bulk" as an :id param.
const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, 'ids must not be empty').max(100, 'ids must not exceed 100')
});

// POST /api/admin/opportunities/bulk/approve
// Bulk-approve up to 100 PENDING_REVIEW opportunities in one DB round trip.
router.post('/bulk/approve', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const previous = await prisma.opportunity.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, isApproved: true }
    });
    const result = await prisma.opportunity.updateMany({
      where: { id: { in: ids }, status: 'PENDING_REVIEW' },
      data: { status: 'PUBLISHED', isApproved: true }
    });
    await logAudit({
      actorId: req.auth!.sub,
      action: 'opportunity.bulk_approve',
      metadata: {
        ids,
        updated: result.count,
        requested: ids.length,
        previousStates: previous.map((r) => ({ id: r.id, status: r.status, isApproved: r.isApproved }))
      }
    });
    res.json({ success: true, data: { updated: result.count, requested: ids.length } });
  } catch (e) { next(e); }
});

// POST /api/admin/opportunities/bulk/reject
// Bulk-reject up to 100 PENDING_REVIEW opportunities in one DB round trip.
router.post('/bulk/reject', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const previous = await prisma.opportunity.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, isApproved: true }
    });
    const result = await prisma.opportunity.updateMany({
      where: { id: { in: ids }, status: 'PENDING_REVIEW' },
      data: { status: 'REJECTED', isApproved: false }
    });
    await logAudit({
      actorId: req.auth!.sub,
      action: 'opportunity.bulk_reject',
      metadata: {
        ids,
        updated: result.count,
        requested: ids.length,
        previousStates: previous.map((r) => ({ id: r.id, status: r.status, isApproved: r.isApproved }))
      }
    });
    res.json({ success: true, data: { updated: result.count, requested: ids.length } });
  } catch (e) { next(e); }
});

// POST /api/admin/opportunities/:id/approve
// Publish the opportunity: status=PUBLISHED, isApproved=true.
router.post('/:id/approve', async (req, res, next) => {
  try {
    const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'opportunity.approve',
      targetType: 'Opportunity',
      targetId: req.params.id,
      metadata: { previousStatus: existing.status, previousIsApproved: existing.isApproved }
    });
    const updated = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: { status: 'PUBLISHED', isApproved: true }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /api/admin/opportunities/:id/reject
// Mark the opportunity as rejected.
router.post('/:id/reject', async (req, res, next) => {
  try {
    const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'opportunity.reject',
      targetType: 'Opportunity',
      targetId: req.params.id,
      metadata: { previousStatus: existing.status, previousIsApproved: existing.isApproved }
    });
    const updated = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', isApproved: false }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

const editSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(20).optional(),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  applicationUrl: z.string().url().optional(),
  company: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'NATIONAL_SERVICE', 'VOLUNTEER', 'CONTRACT']).optional(),
  locationType: z.enum(['REMOTE', 'ONSITE', 'HYBRID']).optional(),
  salaryMin: z.number().int().min(0).optional().nullable(),
  salaryMax: z.number().int().min(0).optional().nullable()
});

// POST /api/admin/opportunities/:id/edit
// Patch editable fields without changing the review status.
router.post('/:id/edit', validate(editSchema), async (req, res, next) => {
  try {
    const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });
    }
    const body = req.body as z.infer<typeof editSchema>;
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.applicationUrl !== undefined) updateData.applicationUrl = body.applicationUrl;
    if (body.company !== undefined) updateData.company = body.company;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.locationType !== undefined) updateData.locationType = body.locationType;
    if (body.salaryMin !== undefined) updateData.salaryMin = body.salaryMin;
    if (body.salaryMax !== undefined) updateData.salaryMax = body.salaryMax;

    const updated = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
