import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.cV.findMany({ where: { userId: req.auth!.sub }, orderBy: { updatedAt: 'desc' } });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const cv = await prisma.cV.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!cv) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CV not found' } });
    }
    res.json({ success: true, data: cv });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const cv = await prisma.cV.create({
      data: {
        userId: req.auth!.sub,
        title: req.body.title || 'Untitled CV',
        template: req.body.template || 'modern',
        data: req.body.data || {}
      }
    });
    res.status(201).json({ success: true, data: cv });
  } catch (e) { next(e); }
});

router.post('/:id/duplicate', requireAuth, async (req, res, next) => {
  try {
    const original = await prisma.cV.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!original) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CV not found' } });
    }
    const copy = await prisma.cV.create({
      data: {
        userId: req.auth!.sub,
        title: `${original.title} (Copy)`,
        template: original.template,
        data: original.data ?? {}
      }
    });
    res.status(201).json({ success: true, data: copy });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const data: { title?: string; template?: string; data?: any } = {};
    if (typeof req.body.title === 'string') data.title = req.body.title;
    if (typeof req.body.template === 'string') data.template = req.body.template;
    if (req.body.data !== undefined) data.data = req.body.data;

    await prisma.cV.updateMany({
      where: { id: req.params.id, userId: req.auth!.sub },
      data
    });
    const cv = await prisma.cV.findFirst({ where: { id: req.params.id, userId: req.auth!.sub } });
    res.json({ success: true, data: cv });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.cV.deleteMany({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (result.count === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CV not found' } });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

export default router;
