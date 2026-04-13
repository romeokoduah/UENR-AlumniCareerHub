import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.notification.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const n = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.auth!.sub },
      data: { isRead: true }
    });
    res.json({ success: true, data: n });
  } catch (e) { next(e); }
});

router.patch('/read-all', requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.auth!.sub, isRead: false },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
