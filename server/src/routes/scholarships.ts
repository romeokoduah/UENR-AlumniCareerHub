import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { arr, deserialize } from '../lib/serialize.js';

const router = Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, level, field, status } = req.query as Record<string, string>;
    const now = new Date();
    const items = await prisma.scholarship.findMany({
      where: {
        isApproved: true,
        ...(level && { level }),
        ...(field && { fieldOfStudy: { contains: field } }),
        ...(status === 'open' && { deadline: { gte: now } }),
        ...(status === 'closed' && { deadline: { lt: now } }),
        ...(q && {
          OR: [
            { title: { contains: q } },
            { provider: { contains: q } },
            { description: { contains: q } }
          ]
        })
      },
      orderBy: { deadline: 'asc' },
      take: 100
    });
    res.json({ success: true, data: deserialize(items) });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  title: z.string().min(3),
  provider: z.string().min(1),
  description: z.string().min(20),
  eligibility: z.string().min(5),
  deadline: z.string(),
  awardAmount: z.string().optional(),
  applicationUrl: z.string().url(),
  level: z.enum(['UNDERGRAD', 'MASTERS', 'PHD', 'POSTDOC', 'OTHER']),
  fieldOfStudy: z.string().optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).default([])
});

router.post('/', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body;
    const item = await prisma.scholarship.create({
      data: {
        title: data.title,
        provider: data.provider,
        description: data.description,
        eligibility: data.eligibility,
        deadline: new Date(data.deadline),
        awardAmount: data.awardAmount,
        applicationUrl: data.applicationUrl,
        level: data.level,
        fieldOfStudy: data.fieldOfStudy,
        location: data.location,
        tags: arr(data.tags),
        submittedById: req.auth!.sub,
        isApproved: req.auth!.role === 'ADMIN'
      }
    });
    res.status(201).json({ success: true, data: deserialize(item) });
  } catch (e) { next(e); }
});

export default router;
