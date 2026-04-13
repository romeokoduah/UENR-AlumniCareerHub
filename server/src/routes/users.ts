import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { arr, deserialize, parseArr } from '../lib/serialize.js';

const router = Router();

const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().url().optional(),
  bio: z.string().max(2000).optional(),
  programme: z.string().optional(),
  graduationYear: z.number().int().optional(),
  skills: z.array(z.string()).optional(),
  linkedinUrl: z.string().url().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  currentRole: z.string().optional(),
  currentCompany: z.string().optional(),
  visibility: z.enum(['public', 'members', 'private']).optional()
});

router.patch('/me', requireAuth, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const data = req.body;
    const profileComplete = Boolean(data.bio && data.programme && data.skills?.length);
    const { skills, ...rest } = data;
    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: {
        ...rest,
        ...(skills !== undefined && { skills: arr(skills) }),
        profileComplete: profileComplete || undefined
      }
    });
    const { passwordHash, ...safe } = user;
    res.json({ success: true, data: deserialize(safe) });
  } catch (e) { next(e); }
});

router.get('/directory', requireAuth, async (req, res, next) => {
  try {
    const { q, programme, year, industry, location } = req.query as Record<string, string>;
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['ALUMNI', 'STUDENT'] },
        visibility: { in: ['public', 'members'] },
        ...(programme && { programme }),
        ...(year && { graduationYear: Number(year) }),
        ...(location && { location: { contains: location } }),
        ...(industry && { currentCompany: { contains: industry } }),
        ...(q && {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { currentRole: { contains: q } }
          ]
        })
      },
      select: {
        id: true, firstName: true, lastName: true, avatar: true, programme: true,
        graduationYear: true, currentRole: true, currentCompany: true, location: true, role: true
      },
      take: 60
    });
    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { mentorProfile: true }
    });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    const { passwordHash, ...safe } = user;
    res.json({ success: true, data: deserialize(safe) });
  } catch (e) { next(e); }
});

export default router;
