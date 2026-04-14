import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const mentors = await prisma.mentorProfile.findMany({
      where: { isActive: true },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, programme: true, graduationYear: true } } },
      orderBy: { averageRating: 'desc' }
    });
    res.json({ success: true, data: mentors });
  } catch (e) { next(e); }
});

const mentorSchema = z.object({
  expertise: z.array(z.string()),
  bio: z.string().min(20),
  currentRole: z.string(),
  company: z.string(),
  yearsExperience: z.number().int().min(0),
  mentoringTopics: z.array(z.string()),
  mentoringStyles: z.array(z.string()).default([]),
  availability: z.string().optional()
});

router.post('/profile', requireAuth, validate(mentorSchema), async (req, res, next) => {
  try {
    const data = req.body;
    const profile = await prisma.mentorProfile.upsert({
      where: { userId: req.auth!.sub },
      create: { ...data, userId: req.auth!.sub },
      update: data
    });
    res.json({ success: true, data: profile });
  } catch (e) { next(e); }
});

router.post('/:mentorId/request', requireAuth, async (req, res, next) => {
  try {
    const match = await prisma.mentorshipMatch.create({
      data: {
        mentorId: req.params.mentorId,
        menteeId: req.auth!.sub,
        goals: req.body.goals
      }
    });
    await prisma.notification.create({
      data: {
        userId: req.params.mentorId,
        type: 'MENTORSHIP_REQUEST',
        title: 'New mentorship request',
        message: 'A student has requested mentorship from you',
        link: `/mentorship/${match.id}`
      }
    });
    res.status(201).json({ success: true, data: match });
  } catch (e) { next(e); }
});

export default router;
