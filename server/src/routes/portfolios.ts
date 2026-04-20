// Portfolio Builder routes — public and authenticated.
//
// Authenticated routes let alumni create/edit portfolios + projects, upload
// project cover images via storeUpload (Vercel Blob in prod, local disk in
// dev), and gate them with an optional bcrypt-hashed password.
//
// Public routes serve published portfolios at /api/portfolios/public/:slug.
// If a portfolio has a password set, the GET endpoint short-circuits with
// `{ requiresPassword: true }`; the client then POSTs to /unlock with the
// password to receive the data. Password hashes are never returned.
//
// Caller wires this in app.ts as `app.use('/api/portfolios', portfolioRoutes)`.

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadImage, storeUpload } from '../lib/upload.js';

const router = Router();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(40, 'Slug must be at most 40 characters')
  .regex(SLUG_RE, 'Slug must be lowercase letters, numbers, and dashes');

const linkSchema = z.object({
  label: z.string().min(1).max(60),
  url: z.string().url()
});

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(120),
  tagline: z.string().max(200).optional(),
  bio: z.string().max(4000).optional(),
  theme: z.enum(['clean', 'editorial']).default('clean'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  links: z.array(linkSchema).max(20).optional()
});

const updateSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().min(1).max(120).optional(),
  tagline: z.string().max(200).nullable().optional(),
  bio: z.string().max(4000).nullable().optional(),
  theme: z.enum(['clean', 'editorial']).optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal('')),
  links: z.array(linkSchema).max(20).nullable().optional()
});

const projectSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000),
  role: z.string().max(120).optional(),
  coverUrl: z.string().url().optional().or(z.literal('')),
  techStack: z.array(z.string().max(40)).max(40).optional(),
  externalUrl: z.string().url().optional().or(z.literal('')),
  caseStudyMd: z.string().max(20000).optional(),
  position: z.number().int().min(0).optional()
});

const projectUpdateSchema = projectSchema.partial();

const passwordSchema = z.object({
  password: z.string().max(120) // empty string clears it
});

const unlockSchema = z.object({
  password: z.string().min(1).max(120)
});

// Strip passwordHash + raw User row before returning a portfolio to a client.
function publicShape<T extends { passwordHash?: string | null }>(p: T) {
  const { passwordHash, ...rest } = p;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

// ============================================================
// AUTHENTICATED — owner CRUD
// ============================================================

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.portfolio.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { updatedAt: 'desc' },
      include: { projects: { orderBy: { position: 'asc' } } }
    });
    res.json({ success: true, data: items.map(publicShape) });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const p = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub },
      include: { projects: { orderBy: { position: 'asc' } } }
    });
    if (!p) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    res.json({ success: true, data: publicShape(p) });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message || 'Invalid input' }
      });
    }
    const existing = await prisma.portfolio.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'SLUG_TAKEN', message: 'That slug is already taken' } });
    }
    const data = parsed.data;
    const created = await prisma.portfolio.create({
      data: {
        userId: req.auth!.sub,
        slug: data.slug,
        title: data.title,
        tagline: data.tagline ?? null,
        bio: data.bio ?? null,
        theme: data.theme,
        contactEmail: data.contactEmail || null,
        links: data.links ?? undefined
      },
      include: { projects: true }
    });
    res.status(201).json({ success: true, data: publicShape(created) });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message || 'Invalid input' }
      });
    }
    const owned = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });

    if (parsed.data.slug && parsed.data.slug !== owned.slug) {
      const taken = await prisma.portfolio.findUnique({ where: { slug: parsed.data.slug } });
      if (taken) {
        return res.status(409).json({ success: false, error: { code: 'SLUG_TAKEN', message: 'That slug is already taken' } });
      }
    }

    const update: any = {};
    const d = parsed.data;
    if (d.slug !== undefined) update.slug = d.slug;
    if (d.title !== undefined) update.title = d.title;
    if (d.tagline !== undefined) update.tagline = d.tagline;
    if (d.bio !== undefined) update.bio = d.bio;
    if (d.theme !== undefined) update.theme = d.theme;
    if (d.contactEmail !== undefined) update.contactEmail = d.contactEmail || null;
    if (d.links !== undefined) update.links = d.links ?? undefined;

    const updated = await prisma.portfolio.update({
      where: { id: owned.id },
      data: update,
      include: { projects: { orderBy: { position: 'asc' } } }
    });
    res.json({ success: true, data: publicShape(updated) });
  } catch (e) { next(e); }
});

router.post('/:id/publish', requireAuth, async (req, res, next) => {
  try {
    const owned = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    const target = typeof req.body?.isPublished === 'boolean' ? req.body.isPublished : !owned.isPublished;
    const updated = await prisma.portfolio.update({
      where: { id: owned.id },
      data: { isPublished: target },
      include: { projects: { orderBy: { position: 'asc' } } }
    });
    res.json({ success: true, data: publicShape(updated) });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.portfolio.deleteMany({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (result.count === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

// ----- Projects -----

router.post('/:id/projects', requireAuth, async (req, res, next) => {
  try {
    const owned = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });

    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message || 'Invalid input' }
      });
    }

    // Default new project to bottom of the list.
    const last = await prisma.portfolioProject.findFirst({
      where: { portfolioId: owned.id },
      orderBy: { position: 'desc' }
    });
    const nextPos = parsed.data.position ?? (last ? last.position + 1 : 0);

    const proj = await prisma.portfolioProject.create({
      data: {
        portfolioId: owned.id,
        title: parsed.data.title,
        summary: parsed.data.summary,
        role: parsed.data.role || null,
        coverUrl: parsed.data.coverUrl || null,
        techStack: parsed.data.techStack ?? [],
        externalUrl: parsed.data.externalUrl || null,
        caseStudyMd: parsed.data.caseStudyMd || null,
        position: nextPos
      }
    });
    res.status(201).json({ success: true, data: proj });
  } catch (e) { next(e); }
});

router.patch('/:id/projects/:projectId', requireAuth, async (req, res, next) => {
  try {
    const owned = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });

    const parsed = projectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message || 'Invalid input' }
      });
    }

    const update: any = {};
    const d = parsed.data;
    if (d.title !== undefined) update.title = d.title;
    if (d.summary !== undefined) update.summary = d.summary;
    if (d.role !== undefined) update.role = d.role || null;
    if (d.coverUrl !== undefined) update.coverUrl = d.coverUrl || null;
    if (d.techStack !== undefined) update.techStack = d.techStack ?? [];
    if (d.externalUrl !== undefined) update.externalUrl = d.externalUrl || null;
    if (d.caseStudyMd !== undefined) update.caseStudyMd = d.caseStudyMd || null;
    if (d.position !== undefined) update.position = d.position;

    const result = await prisma.portfolioProject.updateMany({
      where: { id: req.params.projectId, portfolioId: owned.id },
      data: update
    });
    if (result.count === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }
    const proj = await prisma.portfolioProject.findFirst({
      where: { id: req.params.projectId, portfolioId: owned.id }
    });
    res.json({ success: true, data: proj });
  } catch (e) { next(e); }
});

router.delete('/:id/projects/:projectId', requireAuth, async (req, res, next) => {
  try {
    const owned = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });

    const result = await prisma.portfolioProject.deleteMany({
      where: { id: req.params.projectId, portfolioId: owned.id }
    });
    if (result.count === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }
    res.json({ success: true, data: { id: req.params.projectId } });
  } catch (e) { next(e); }
});

// Project cover image upload — multipart/form-data with field "file".
router.post(
  '/:id/projects/:projectId/cover',
  requireAuth,
  uploadImage.single('file') as any,
  async (req: any, res: any, next: any) => {
    try {
      const owned = await prisma.portfolio.findFirst({
        where: { id: req.params.id, userId: req.auth!.sub }
      });
      if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
      if (!req.file) {
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
      }
      const result = await storeUpload({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
      const updated = await prisma.portfolioProject.updateMany({
        where: { id: req.params.projectId, portfolioId: owned.id },
        data: { coverUrl: result.url }
      });
      if (updated.count === 0) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }
      res.status(201).json({ success: true, data: { url: result.url } });
    } catch (e) { next(e); }
  }
);

// Set/clear gating password. Empty string clears.
router.post('/:id/password', requireAuth, async (req, res, next) => {
  try {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Password is required (empty to clear)' }
      });
    }
    const owned = await prisma.portfolio.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });

    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 10)
      : null;
    const updated = await prisma.portfolio.update({
      where: { id: owned.id },
      data: { passwordHash },
      include: { projects: { orderBy: { position: 'asc' } } }
    });
    res.json({ success: true, data: publicShape(updated) });
  } catch (e) { next(e); }
});

// ============================================================
// PUBLIC — by slug
// ============================================================

router.get('/public/:slug', async (req, res, next) => {
  try {
    const p = await prisma.portfolio.findUnique({
      where: { slug: req.params.slug },
      include: {
        projects: { orderBy: { position: 'asc' } },
        user: { select: { firstName: true, lastName: true, programme: true, graduationYear: true, currentRole: true, currentCompany: true } }
      }
    });
    if (!p || !p.isPublished) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    }
    if (p.passwordHash) {
      return res.json({ success: true, data: { requiresPassword: true, slug: p.slug, title: p.title } });
    }
    const { passwordHash, ...rest } = p;
    res.json({ success: true, data: rest });
  } catch (e) { next(e); }
});

router.post('/public/:slug/unlock', async (req, res, next) => {
  try {
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION', message: 'Password is required' }
      });
    }
    const p = await prisma.portfolio.findUnique({
      where: { slug: req.params.slug },
      include: {
        projects: { orderBy: { position: 'asc' } },
        user: { select: { firstName: true, lastName: true, programme: true, graduationYear: true, currentRole: true, currentCompany: true } }
      }
    });
    if (!p || !p.isPublished) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    }
    if (!p.passwordHash) {
      const { passwordHash, ...rest } = p;
      return res.json({ success: true, data: rest });
    }
    const ok = await bcrypt.compare(parsed.data.password, p.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: { code: 'BAD_PASSWORD', message: 'Incorrect password' } });
    }
    const { passwordHash, ...rest } = p;
    res.json({ success: true, data: rest });
  } catch (e) { next(e); }
});

export default router;
