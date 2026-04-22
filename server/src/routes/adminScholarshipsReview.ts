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

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

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

// POST /api/admin/scholarships/:id/approve
// Publish the scholarship: status=PUBLISHED, isApproved=true.
router.post('/:id/approve', async (req, res, next) => {
  try {
    const existing = await prisma.scholarship.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scholarship not found' } });
    }
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

export default router;
