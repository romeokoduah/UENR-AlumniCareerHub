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

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const cv = await prisma.cV.updateMany({
      where: { id: req.params.id, userId: req.auth!.sub },
      data: { title: req.body.title, template: req.body.template, data: req.body.data }
    });
    res.json({ success: true, data: cv });
  } catch (e) { next(e); }
});

export default router;
