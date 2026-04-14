import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, type, locationType, industry, skill } = req.query as Record<string, string>;
    const items = await prisma.opportunity.findMany({
      where: {
        isActive: true,
        isApproved: true,
        deadline: { gte: new Date() },
        ...(type && { type: type as any }),
        ...(locationType && { locationType: locationType as any }),
        ...(industry && { industry: { contains: industry, mode: 'insensitive' } }),
        ...(skill && { requiredSkills: { has: skill } }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } }
          ]
        })
      },
      orderBy: { createdAt: 'desc' },
      include: { postedBy: { select: { firstName: true, lastName: true, avatar: true } } },
      take: 100
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.get('/me/applications', requireAuth, async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { userId: req.auth!.sub },
      include: { opportunity: true },
      orderBy: { appliedAt: 'desc' }
    });
    res.json({ success: true, data: apps });
  } catch (e) { next(e); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const opp = await prisma.opportunity.findUnique({
      where: { id: req.params.id },
      include: { postedBy: { select: { id: true, firstName: true, lastName: true, avatar: true, currentCompany: true } } }
    });
    if (!opp) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    res.json({ success: true, data: opp });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(20),
  company: z.string().min(1),
  location: z.string().min(1),
  locationType: z.enum(['REMOTE', 'ONSITE', 'HYBRID']),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'NATIONAL_SERVICE', 'VOLUNTEER', 'CONTRACT']),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  deadline: z.string(),
  requiredSkills: z.array(z.string()).default([]),
  industry: z.string().optional(),
  experienceLevel: z.string().optional(),
  applicationUrl: z.string().url().optional()
});

router.post('/', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body;
    const opp = await prisma.opportunity.create({
      data: {
        ...data,
        deadline: new Date(data.deadline),
        postedById: req.auth!.sub
      }
    });
    res.status(201).json({ success: true, data: opp });
  } catch (e) { next(e); }
});

router.post('/:id/apply', requireAuth, async (req, res, next) => {
  try {
    const app = await prisma.application.create({
      data: {
        userId: req.auth!.sub,
        opportunityId: req.params.id,
        cvUrl: req.body.cvUrl,
        coverLetter: req.body.coverLetter
      }
    });
    res.status(201).json({ success: true, data: app });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_APPLIED', message: 'You already applied' } });
    }
    next(e);
  }
});

router.post('/:id/bookmark', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.bookmark.findUnique({
      where: { userId_opportunityId: { userId: req.auth!.sub, opportunityId: req.params.id } }
    });
    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return res.json({ success: true, data: { bookmarked: false } });
    }
    await prisma.bookmark.create({
      data: { userId: req.auth!.sub, opportunityId: req.params.id }
    });
    res.json({ success: true, data: { bookmarked: true } });
  } catch (e) { next(e); }
});

export default router;
