// Learning Hub endpoints — backs the /career-tools/learn directory.
//
// Surface:
//   GET  /resources           public — filterable directory
//   POST /resources           auth   — submit a resource (defaults to pending
//                                       moderation; admins may pre-approve)
//   PATCH  /resources/:id     admin  — approve / edit
//   DELETE /resources/:id     admin  — reject / remove
//   GET  /resources/pending   admin  — moderation queue
//   GET  /paths               public — list curated learning paths
//   GET  /paths/:slug         public — one path with its steps hydrated to
//                                       full resources (so the client can render
//                                       titles + providers without a 2nd round-trip)
//   GET  /progress            auth   — current user's progress rows
//   POST /progress            auth   — upsert status for a resource
//   POST /seed                admin  — one-shot reseed of curated content

import { Router } from 'express';
import { z } from 'zod';
import { LearningType, LearningLevel, LearningCost } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { seedLearningPaths, seedLearningResources } from '../lib/seedLearning.js';

const router = Router();

// ---- shared zod ----------------------------------------------------------

const typeEnum = z.nativeEnum(LearningType);
const levelEnum = z.nativeEnum(LearningLevel);
const costEnum = z.nativeEnum(LearningCost);

const resourceCreateSchema = z.object({
  title: z.string().min(2).max(200),
  provider: z.string().min(1).max(120),
  url: z.string().url(),
  type: typeEnum,
  level: levelEnum,
  cost: costEnum,
  language: z.string().min(2).max(40).optional(),
  durationMin: z.number().int().positive().max(100000).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).max(30).optional(),
  description: z.string().max(2000).nullable().optional(),
  isApproved: z.boolean().optional()
});

const resourceUpdateSchema = resourceCreateSchema.partial();

const progressSchema = z.object({
  resourceId: z.string().min(1),
  status: z.enum(['IN_PROGRESS', 'COMPLETED'])
});

// ---- /resources ----------------------------------------------------------

router.get('/resources', optionalAuth, async (req, res, next) => {
  try {
    const { type, level, cost, provider, language, skill, q } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = { isApproved: true };
    if (type && (Object.values(LearningType) as string[]).includes(type)) where.type = type;
    if (level && (Object.values(LearningLevel) as string[]).includes(level)) where.level = level;
    if (cost && (Object.values(LearningCost) as string[]).includes(cost)) where.cost = cost;
    if (provider) where.provider = { equals: provider, mode: 'insensitive' };
    if (language) where.language = { equals: language, mode: 'insensitive' };
    if (skill) where.skills = { has: skill.toLowerCase() };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { provider: { contains: q, mode: 'insensitive' } }
      ];
    }

    const items = await prisma.learningResource.findMany({
      where,
      orderBy: [{ provider: 'asc' }, { title: 'asc' }]
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// Admin-only moderation queue. Defined BEFORE /resources/:id so the router
// doesn't try to interpret "pending" as an id.
router.get('/resources/pending', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const items = await prisma.learningResource.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: 'desc' },
      include: {
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.post('/resources', requireAuth, async (req, res, next) => {
  try {
    const parsed = resourceCreateSchema.parse(req.body);
    const isAdmin = req.auth!.role === 'ADMIN';
    // Non-admin submissions are always queued for moderation regardless of
    // what the body claimed. Admins can pre-approve curated entries.
    const isApproved = isAdmin ? (parsed.isApproved ?? true) : false;

    const item = await prisma.learningResource.create({
      data: {
        title: parsed.title.trim(),
        provider: parsed.provider.trim(),
        url: parsed.url.trim(),
        type: parsed.type,
        level: parsed.level,
        cost: parsed.cost,
        language: parsed.language?.trim() || 'English',
        durationMin: parsed.durationMin ?? null,
        skills: (parsed.skills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
        description: parsed.description ?? null,
        submittedById: req.auth!.sub,
        isApproved
      }
    });

    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.patch('/resources/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = resourceUpdateSchema.parse(req.body);
    const existing = await prisma.learningResource.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' }
      });
    }
    const item = await prisma.learningResource.update({
      where: { id: existing.id },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title.trim() } : {}),
        ...(parsed.provider !== undefined ? { provider: parsed.provider.trim() } : {}),
        ...(parsed.url !== undefined ? { url: parsed.url.trim() } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.level !== undefined ? { level: parsed.level } : {}),
        ...(parsed.cost !== undefined ? { cost: parsed.cost } : {}),
        ...(parsed.language !== undefined ? { language: parsed.language.trim() || 'English' } : {}),
        ...(parsed.durationMin !== undefined ? { durationMin: parsed.durationMin } : {}),
        ...(parsed.skills !== undefined
          ? { skills: parsed.skills.map((s) => s.trim().toLowerCase()).filter(Boolean) }
          : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.isApproved !== undefined ? { isApproved: parsed.isApproved } : {})
      }
    });
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.delete('/resources/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const result = await prisma.learningResource.deleteMany({
      where: { id: req.params.id }
    });
    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' }
      });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

// ---- /paths --------------------------------------------------------------

type PathStep = { resourceId: string; note?: string };

router.get('/paths', async (_req, res, next) => {
  try {
    const paths = await prisma.learningPath.findMany({
      orderBy: { name: 'asc' }
    });
    // Include a stepCount so the directory cards can show "5 steps" without
    // each one having to fetch the full path.
    const data = paths.map((p) => ({
      ...p,
      stepCount: Array.isArray(p.steps) ? (p.steps as PathStep[]).length : 0
    }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/paths/:slug', async (req, res, next) => {
  try {
    const path = await prisma.learningPath.findUnique({
      where: { slug: req.params.slug }
    });
    if (!path) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Path not found' }
      });
    }
    const rawSteps = (Array.isArray(path.steps) ? path.steps : []) as PathStep[];
    const ids = rawSteps.map((s) => s.resourceId).filter(Boolean);
    const resources = ids.length
      ? await prisma.learningResource.findMany({ where: { id: { in: ids } } })
      : [];
    const byId = new Map(resources.map((r) => [r.id, r]));

    // Hydrate each step with its full resource so the client renders titles +
    // providers + duration without a follow-up call. Drop steps whose
    // resource was deleted to avoid rendering ghosts.
    const steps = rawSteps
      .map((s) => ({ note: s.note ?? null, resource: byId.get(s.resourceId) ?? null }))
      .filter((s) => s.resource !== null);

    res.json({
      success: true,
      data: { id: path.id, slug: path.slug, name: path.name, description: path.description, steps }
    });
  } catch (e) { next(e); }
});

// ---- /progress -----------------------------------------------------------

router.get('/progress', requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.learningProgress.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/progress', requireAuth, async (req, res, next) => {
  try {
    const parsed = progressSchema.parse(req.body);
    // Make sure the resource still exists before recording progress on it.
    const resource = await prisma.learningResource.findUnique({
      where: { id: parsed.resourceId },
      select: { id: true }
    });
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' }
      });
    }

    const completedAt = parsed.status === 'COMPLETED' ? new Date() : null;

    const row = await prisma.learningProgress.upsert({
      where: { userId_resourceId: { userId: req.auth!.sub, resourceId: parsed.resourceId } },
      update: { status: parsed.status, completedAt },
      create: {
        userId: req.auth!.sub,
        resourceId: parsed.resourceId,
        status: parsed.status,
        completedAt
      }
    });
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
});

// ---- /seed (admin one-shot) ---------------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const resources = await seedLearningResources();
    const paths = await seedLearningPaths();
    res.json({ success: true, data: { resources, paths } });
  } catch (e) { next(e); }
});

export default router;
