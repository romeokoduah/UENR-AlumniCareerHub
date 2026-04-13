import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { arr, deserialize } from '../lib/serialize.js';
import { getLanding, saveLanding, resetLanding } from '../services/siteContent.js';
import { uploadImage } from '../lib/upload.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/stats', async (_req, res, next) => {
  try {
    const [users, opportunities, applications, sessions, events] = await Promise.all([
      prisma.user.count(),
      prisma.opportunity.count(),
      prisma.application.count(),
      prisma.session.count({ where: { status: 'COMPLETED' } }),
      prisma.event.count()
    ]);
    res.json({ success: true, data: { users, opportunities, applications, sessions, events } });
  } catch (e) { next(e); }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isApproved: true, isVerified: true, createdAt: true }
    });
    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

router.patch('/users/:id/approve', async (req, res, next) => {
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isApproved: true } });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// ============ OPPORTUNITY ADMIN ============
// Admin sees EVERY opportunity regardless of approval/active/deadline status.
router.get('/opportunities', async (req, res, next) => {
  try {
    const { q, status } = req.query as Record<string, string>;
    const now = new Date();
    const items = await prisma.opportunity.findMany({
      where: {
        ...(status === 'active' && { isActive: true, isApproved: true, deadline: { gte: now } }),
        ...(status === 'inactive' && { isActive: false }),
        ...(status === 'expired' && { deadline: { lt: now } }),
        ...(status === 'pending' && { isApproved: false }),
        ...(q && {
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { company: { contains: q } },
            { location: { contains: q } }
          ]
        })
      },
      orderBy: { createdAt: 'desc' },
      include: {
        postedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        _count: { select: { applications: true, bookmarks: true } }
      },
      take: 500
    });
    res.json({ success: true, data: deserialize(items) });
  } catch (e) { next(e); }
});

const updateOpportunitySchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(20).optional(),
  company: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  locationType: z.enum(['REMOTE', 'ONSITE', 'HYBRID']).optional(),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'NATIONAL_SERVICE', 'VOLUNTEER', 'CONTRACT']).optional(),
  salaryMin: z.number().int().nullable().optional(),
  salaryMax: z.number().int().nullable().optional(),
  deadline: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  industry: z.string().nullable().optional(),
  experienceLevel: z.string().nullable().optional(),
  applicationUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  isApproved: z.boolean().optional()
});

router.patch('/opportunities/:id', validate(updateOpportunitySchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof updateOpportunitySchema>;
    const { requiredSkills, deadline, ...rest } = data;
    const updated = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(deadline !== undefined && { deadline: new Date(deadline) }),
        ...(requiredSkills !== undefined && { requiredSkills: arr(requiredSkills) })
      }
    });
    res.json({ success: true, data: deserialize(updated) });
  } catch (e) { next(e); }
});

router.delete('/opportunities/:id', async (req, res, next) => {
  try {
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ============ LANDING PAGE CONTENT ============
router.get('/content/landing', async (_req, res, next) => {
  try { res.json({ success: true, data: await getLanding() }); }
  catch (e) { next(e); }
});

router.put('/content/landing', async (req, res, next) => {
  try {
    // Shallow validation — allow any JSON that roughly matches the shape
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid content body' } });
    }
    const saved = await saveLanding(req.body);
    res.json({ success: true, data: saved });
  } catch (e) { next(e); }
});

router.post('/content/landing/reset', async (_req, res, next) => {
  try { res.json({ success: true, data: await resetLanding() }); }
  catch (e) { next(e); }
});

// ============ IMAGE UPLOADS ============
// Cast to any: multer ships its own @types/express@5 subdep which clashes with
// our @types/express@4. The runtime contract is identical.
router.post('/uploads/image', uploadImage.single('file') as any, (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
  }
  const url = `/uploads/${req.file.filename}`;
  res.status(201).json({
    success: true,
    data: { url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype }
  });
});

export default router;
