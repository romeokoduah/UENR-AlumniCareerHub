// Cover Letter CRUD endpoints — backs the Career Tools cover-letter builder.
// Each row is a draft scoped to the authenticated user; `data` holds the
// structured form fields so the editor can fully reconstruct the letter.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const dataSchema = z.record(z.any());

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  template: z.string().min(1).max(60).optional(),
  data: dataSchema.optional(),
  jobLinkId: z.string().nullable().optional()
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  template: z.string().min(1).max(60).optional(),
  data: dataSchema.optional(),
  jobLinkId: z.string().nullable().optional()
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.coverLetter.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.coverLetter.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Cover letter not found' }
      });
    }
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    const item = await prisma.coverLetter.create({
      data: {
        userId: req.auth!.sub,
        title: parsed.title || 'Untitled cover letter',
        template: parsed.template || 'classic-formal',
        data: parsed.data ?? {},
        jobLinkId: parsed.jobLinkId ?? null
      }
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);
    // Confirm ownership before mutating so we return 404 instead of silently
    // updating zero rows.
    const existing = await prisma.coverLetter.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub },
      select: { id: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Cover letter not found' }
      });
    }
    const item = await prisma.coverLetter.update({
      where: { id: existing.id },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        ...(parsed.template !== undefined ? { template: parsed.template } : {}),
        ...(parsed.data !== undefined ? { data: parsed.data } : {}),
        ...(parsed.jobLinkId !== undefined ? { jobLinkId: parsed.jobLinkId } : {})
      }
    });
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.coverLetter.deleteMany({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Cover letter not found' }
      });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

export default router;
