// Admin scholarship review queue.
//
// Mounted at /api/admin/scholarships. Every endpoint is gated by
// requireAuth + requireRole('ADMIN') — this is a lighter gate than
// requireSuperuser (which also checks isSuperuser=true in the DB) because
// scholarship review is a routine admin task, not a platform-wide
// superuser action.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// GET /api/admin/scholarships
// Returns all scholarships for the general management page (up to 500).
router.get('/', async (req, res, next) => {
  try {
    const { q, status } = req.query as Record<string, string>;
    const now = new Date();
    const items = await prisma.scholarship.findMany({
      where: {
        ...(status === 'approved' && { isApproved: true }),
        ...(status === 'pending' && { isApproved: false }),
        ...(status === 'expired' && { deadline: { lt: now } }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { provider: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } }
          ]
        })
      },
      orderBy: { createdAt: 'desc' },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } }
      },
      take: 500
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// GET /api/admin/scholarships/pending
// Returns up to 100 PENDING_REVIEW rows, newest first.
router.get('/pending', async (req, res, next) => {
  try {
    const items = await prisma.scholarship.findMany({
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

// ===== GENERAL-MANAGEMENT BULK ACTIONS (operate on any scholarship) =====

// POST /api/admin/scholarships/bulk/unapprove
router.post('/bulk/unapprove', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const result = await prisma.scholarship.updateMany({ where: { id: { in: ids } }, data: { isApproved: false } });
    await logAudit({ actorId: req.auth!.sub, action: 'scholarship.bulk_unapprove', metadata: { ids, updated: result.count } });
    res.json({ success: true, data: { updated: result.count, requested: ids.length } });
  } catch (e) { next(e); }
});

// POST /api/admin/scholarships/bulk/feature
router.post('/bulk/feature', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const result = await prisma.scholarship.updateMany({ where: { id: { in: ids } }, data: { isFeatured: true } });
    await logAudit({ actorId: req.auth!.sub, action: 'scholarship.bulk_feature', metadata: { ids, updated: result.count } });
    res.json({ success: true, data: { updated: result.count, requested: ids.length } });
  } catch (e) { next(e); }
});

// POST /api/admin/scholarships/bulk/unfeature
router.post('/bulk/unfeature', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const result = await prisma.scholarship.updateMany({ where: { id: { in: ids } }, data: { isFeatured: false } });
    await logAudit({ actorId: req.auth!.sub, action: 'scholarship.bulk_unfeature', metadata: { ids, updated: result.count } });
    res.json({ success: true, data: { updated: result.count, requested: ids.length } });
  } catch (e) { next(e); }
});

// POST /api/admin/scholarships/bulk/delete
router.post('/bulk/delete', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const result = await prisma.scholarship.deleteMany({ where: { id: { in: ids } } });
    await logAudit({ actorId: req.auth!.sub, action: 'scholarship.bulk_delete', metadata: { ids, deleted: result.count } });
    res.json({ success: true, data: { updated: result.count, requested: ids.length } });
  } catch (e) { next(e); }
});

// POST /api/admin/scholarships/bulk-create
// Bulk-create scholarships from CSV import. Published immediately.
const bulkCreateScholarshipItemSchema = z.object({
  title: z.string().min(3),
  provider: z.string().min(1),
  description: z.string().min(20),
  eligibility: z.string().min(5),
  deadline: z.string().nullable().optional(),
  awardAmount: z.string().nullable().optional(),
  applicationUrl: z.string().url(),
  level: z.enum(['UNDERGRAD', 'MASTERS', 'PHD', 'POSTDOC', 'OTHER']),
  fieldOfStudy: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

const bulkCreateScholarshipsSchema = z.object({
  items: z.array(z.record(z.unknown())).min(1).max(500)
});

router.post('/bulk-create', validate(bulkCreateScholarshipsSchema), async (req, res, next) => {
  try {
    const { items } = req.body as { items: Record<string, unknown>[] };
    const submittedById = req.auth!.sub;
    const rejected: Array<{ row: number; error: string }> = [];
    const toCreate: z.infer<typeof bulkCreateScholarshipItemSchema>[] = [];

    for (let i = 0; i < items.length; i++) {
      const parsed = bulkCreateScholarshipItemSchema.safeParse(items[i]);
      if (!parsed.success) {
        rejected.push({ row: i + 1, error: parsed.error.issues.map((e) => e.message).join('; ') });
      } else {
        toCreate.push(parsed.data);
      }
    }

    await prisma.scholarship.createMany({
      data: toCreate.map((item) => ({
        title: item.title,
        provider: item.provider,
        description: item.description,
        eligibility: item.eligibility,
        deadline: item.deadline ? new Date(item.deadline) : null,
        awardAmount: item.awardAmount ?? null,
        applicationUrl: item.applicationUrl,
        level: item.level,
        fieldOfStudy: item.fieldOfStudy ?? null,
        location: item.location ?? null,
        tags: item.tags ?? [],
        source: 'ADMIN',
        status: 'PUBLISHED',
        isApproved: true,
        submittedById
      }))
    });

    await logAudit({
      actorId: submittedById,
      action: 'scholarship.bulk_create',
      metadata: { created: toCreate.length, rejected: rejected.length }
    });

    res.status(201).json({ success: true, data: { created: toCreate.length, rejected } });
  } catch (e) { next(e); }
});

// POST /api/admin/scholarships/bulk/approve
// Bulk-approve up to 100 PENDING_REVIEW scholarships in one DB round trip.
router.post('/bulk/approve', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    // Capture previous states for audit metadata (undo support).
    const previous = await prisma.scholarship.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, isApproved: true }
    });
    const result = await prisma.scholarship.updateMany({
      where: { id: { in: ids }, status: 'PENDING_REVIEW' },
      data: { status: 'PUBLISHED', isApproved: true }
    });
    await logAudit({
      actorId: req.auth!.sub,
      action: 'scholarship.bulk_approve',
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

// POST /api/admin/scholarships/bulk/reject
// Bulk-reject up to 100 PENDING_REVIEW scholarships in one DB round trip.
router.post('/bulk/reject', validate(bulkSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof bulkSchema>;
    const previous = await prisma.scholarship.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, isApproved: true }
    });
    const result = await prisma.scholarship.updateMany({
      where: { id: { in: ids }, status: 'PENDING_REVIEW' },
      data: { status: 'REJECTED', isApproved: false }
    });
    await logAudit({
      actorId: req.auth!.sub,
      action: 'scholarship.bulk_reject',
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

// POST /api/admin/scholarships/:id/approve
// Publish the scholarship: status=PUBLISHED, isApproved=true.
router.post('/:id/approve', async (req, res, next) => {
  try {
    const existing = await prisma.scholarship.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scholarship not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'scholarship.approve',
      targetType: 'Scholarship',
      targetId: req.params.id,
      metadata: { previousStatus: existing.status, previousIsApproved: existing.isApproved }
    });
    const updated = await prisma.scholarship.update({
      where: { id: req.params.id },
      data: { status: 'PUBLISHED', isApproved: true }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /api/admin/scholarships/:id/reject
// Mark the scholarship as rejected.
router.post('/:id/reject', async (req, res, next) => {
  try {
    const existing = await prisma.scholarship.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scholarship not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'scholarship.reject',
      targetType: 'Scholarship',
      targetId: req.params.id,
      metadata: { previousStatus: existing.status, previousIsApproved: existing.isApproved }
    });
    const updated = await prisma.scholarship.update({
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
  level: z.enum(['UNDERGRAD', 'MASTERS', 'PHD', 'POSTDOC', 'OTHER']).optional()
});

// POST /api/admin/scholarships/:id/edit
// Patch editable fields without changing the review status.
router.post('/:id/edit', validate(editSchema), async (req, res, next) => {
  try {
    const existing = await prisma.scholarship.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scholarship not found' } });
    }
    const body = req.body as z.infer<typeof editSchema>;
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.applicationUrl !== undefined) updateData.applicationUrl = body.applicationUrl;
    if (body.level !== undefined) updateData.level = body.level;

    const updated = await prisma.scholarship.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ===== GENERAL MANAGEMENT SINGLE-ITEM ENDPOINTS =====

const updateScholarshipSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(20).optional(),
  provider: z.string().min(1).optional(),
  deadline: z.string().optional().nullable(),
  applicationUrl: z.string().url().optional(),
  level: z.enum(['UNDERGRAD', 'MASTERS', 'PHD', 'POSTDOC', 'OTHER']).optional(),
  isApproved: z.boolean().optional(),
  isFeatured: z.boolean().optional()
});

// PATCH /api/admin/scholarships/:id
router.patch('/:id', validate(updateScholarshipSchema), async (req, res, next) => {
  try {
    const existing = await prisma.scholarship.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scholarship not found' } });
    }
    const body = req.body as z.infer<typeof updateScholarshipSchema>;
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.provider !== undefined) updateData.provider = body.provider;
    if (body.deadline !== undefined) updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.applicationUrl !== undefined) updateData.applicationUrl = body.applicationUrl;
    if (body.level !== undefined) updateData.level = body.level;
    if (body.isApproved !== undefined) updateData.isApproved = body.isApproved;
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured;

    const updated = await prisma.scholarship.update({ where: { id: req.params.id }, data: updateData });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// DELETE /api/admin/scholarships/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.scholarship.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scholarship not found' } });
    }
    await prisma.scholarship.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
