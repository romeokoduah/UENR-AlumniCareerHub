import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' },
      include: {
        host: { select: { firstName: true, lastName: true, avatar: true } },
        _count: { select: { registrations: true } }
      }
    });
    res.json({ success: true, data: events });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const event = await prisma.event.create({
      data: {
        ...req.body,
        date: new Date(req.body.date),
        hostId: req.auth!.sub
      }
    });
    res.status(201).json({ success: true, data: event });
  } catch (e) { next(e); }
});

router.post('/:id/rsvp', requireAuth, async (req, res, next) => {
  try {
    const reg = await prisma.eventRegistration.create({
      data: { eventId: req.params.id, userId: req.auth!.sub }
    });
    res.status(201).json({ success: true, data: reg });
  } catch (e: any) {
    if (e.code === 'P2002') return res.json({ success: true, data: { alreadyRegistered: true } });
    next(e);
  }
});

export default router;
