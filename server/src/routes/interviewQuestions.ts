// Interview Question Bank — backs /career-tools/interview/questions.
//
// Surface:
//   GET    /                 public (optionalAuth) — paginated, filterable bank
//   GET    /:id              public — one approved question
//   POST   /                 auth   — submit a question (queued for moderation;
//                                     admins can pre-approve via isApproved=true)
//   PATCH  /:id              admin  — moderation edits + approval
//   DELETE /:id              admin  — rejection / cleanup
//   GET    /pending/list     admin  — moderation queue
//   POST   /:id/vote         auth   — toggle a per-user upvote, atomically
//                                     keeping `upvotes` in sync via the unique
//                                     (questionId, userId) constraint
//   POST   /:id/flag         auth   — increment flagCount; auto-hide at >= 5
//   POST   /seed             admin  — one-shot reseed (idempotent by `prompt`)
//
// Caller wires this in app.ts as
//   app.use('/api/interview-questions', interviewQuestionRoutes)

import { Router } from 'express';
import { z } from 'zod';
import { InterviewCategory, InterviewDifficulty, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { seedInterviewQuestions } from '../lib/seedInterviewQuestions.js';

const router = Router();

// ---- shared zod ----------------------------------------------------------

const categoryEnum = z.nativeEnum(InterviewCategory);
const difficultyEnum = z.nativeEnum(InterviewDifficulty);

const createSchema = z.object({
  prompt: z.string().min(8).max(1000),
  guidance: z.string().max(2000).nullable().optional(),
  sampleAnswer: z.string().max(8000).nullable().optional(),
  category: categoryEnum,
  difficulty: difficultyEnum.optional(),
  roleSlug: z.string().min(1).max(120).nullable().optional(),
  industry: z.string().min(1).max(120).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  isApproved: z.boolean().optional()
});

const updateSchema = createSchema.partial();

// Auto-hide threshold for community flags. The cap intentionally lives in
// app code (not the DB) so admins can keep approving past the threshold from
// the moderation queue without a schema migration.
const FLAG_AUTOHIDE_AT = 5;

// ---- list ----------------------------------------------------------------

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { category, difficulty, roleSlug, industry, q } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const where: Prisma.InterviewQuestionWhereInput = { isApproved: true };
    if (category && (Object.values(InterviewCategory) as string[]).includes(category)) {
      where.category = category as InterviewCategory;
    }
    if (difficulty && (Object.values(InterviewDifficulty) as string[]).includes(difficulty)) {
      where.difficulty = difficulty as InterviewDifficulty;
    }
    if (roleSlug) where.roleSlug = roleSlug;
    if (industry) where.industry = { equals: industry, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { prompt: { contains: q, mode: 'insensitive' } },
        { guidance: { contains: q, mode: 'insensitive' } },
        { tags: { has: q.toLowerCase() } }
      ];
    }

    const [items, total] = await Promise.all([
      prisma.interviewQuestion.findMany({
        where,
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.interviewQuestion.count({ where })
    ]);

    // If the caller is signed in, hydrate `votedByMe` so the client doesn't
    // need a second round-trip just to color the upvote chip.
    let votedSet = new Set<string>();
    if (req.auth) {
      const ids = items.map((i) => i.id);
      if (ids.length) {
        const myVotes = await prisma.interviewQuestionVote.findMany({
          where: { userId: req.auth.sub, questionId: { in: ids } },
          select: { questionId: true }
        });
        votedSet = new Set(myVotes.map((v) => v.questionId));
      }
    }

    const data = items.map((i) => ({ ...i, votedByMe: votedSet.has(i.id) }));
    const pageCount = Math.max(1, Math.ceil(total / limit));

    res.json({
      success: true,
      data: { items: data, page, limit, total, pageCount, hasMore: page < pageCount }
    });
  } catch (e) { next(e); }
});

// Admin-only moderation queue. Defined BEFORE /:id so the router doesn't
// try to interpret "pending" as a question id.
router.get('/pending/list', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const items = await prisma.interviewQuestion.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// ---- detail --------------------------------------------------------------

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const item = await prisma.interviewQuestion.findUnique({
      where: { id: req.params.id }
    });
    if (!item || (!item.isApproved && req.auth?.role !== 'ADMIN')) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' }
      });
    }
    let votedByMe = false;
    if (req.auth) {
      const v = await prisma.interviewQuestionVote.findUnique({
        where: { questionId_userId: { questionId: item.id, userId: req.auth.sub } },
        select: { id: true }
      });
      votedByMe = Boolean(v);
    }
    res.json({ success: true, data: { ...item, votedByMe } });
  } catch (e) { next(e); }
});

// ---- create / submit -----------------------------------------------------

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    const isAdmin = req.auth!.role === 'ADMIN';
    // Non-admins can never self-approve. Admins default to approved unless
    // they explicitly stage something.
    const isApproved = isAdmin ? (parsed.isApproved ?? true) : false;

    const item = await prisma.interviewQuestion.create({
      data: {
        prompt: parsed.prompt.trim(),
        guidance: parsed.guidance?.trim() || null,
        sampleAnswer: parsed.sampleAnswer?.trim() || null,
        category: parsed.category,
        difficulty: parsed.difficulty ?? InterviewDifficulty.MEDIUM,
        roleSlug: parsed.roleSlug?.trim() || null,
        industry: parsed.industry?.trim() || null,
        tags: (parsed.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        submittedById: req.auth!.sub,
        isApproved
      }
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

// ---- moderation (admin) --------------------------------------------------

router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);
    const existing = await prisma.interviewQuestion.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' }
      });
    }
    const item = await prisma.interviewQuestion.update({
      where: { id: existing.id },
      data: {
        ...(parsed.prompt !== undefined ? { prompt: parsed.prompt.trim() } : {}),
        ...(parsed.guidance !== undefined ? { guidance: parsed.guidance?.trim() || null } : {}),
        ...(parsed.sampleAnswer !== undefined ? { sampleAnswer: parsed.sampleAnswer?.trim() || null } : {}),
        ...(parsed.category !== undefined ? { category: parsed.category } : {}),
        ...(parsed.difficulty !== undefined ? { difficulty: parsed.difficulty } : {}),
        ...(parsed.roleSlug !== undefined ? { roleSlug: parsed.roleSlug?.trim() || null } : {}),
        ...(parsed.industry !== undefined ? { industry: parsed.industry?.trim() || null } : {}),
        ...(parsed.tags !== undefined
          ? { tags: parsed.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) }
          : {}),
        ...(parsed.isApproved !== undefined ? { isApproved: parsed.isApproved } : {})
      }
    });
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const result = await prisma.interviewQuestion.deleteMany({
      where: { id: req.params.id }
    });
    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' }
      });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

// ---- vote toggle ---------------------------------------------------------
//
// One vote per (question, user) thanks to the @@unique constraint. We do
// the existence check + counter update in a transaction so we never end up
// with a vote row but a stale `upvotes` count (or vice versa) after a race.
router.post('/:id/vote', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const questionId = req.params.id;

    const question = await prisma.interviewQuestion.findUnique({
      where: { id: questionId },
      select: { id: true }
    });
    if (!question) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' }
      });
    }

    const existing = await prisma.interviewQuestionVote.findUnique({
      where: { questionId_userId: { questionId, userId } },
      select: { id: true }
    });

    if (existing) {
      const [, updated] = await prisma.$transaction([
        prisma.interviewQuestionVote.delete({ where: { id: existing.id } }),
        prisma.interviewQuestion.update({
          where: { id: questionId },
          data: { upvotes: { decrement: 1 } },
          select: { upvotes: true }
        })
      ]);
      // Defensive floor — `upvotes` should never read negative even if a
      // concurrent unflag races us past zero.
      const upvotes = Math.max(0, updated.upvotes);
      return res.json({ success: true, data: { voted: false, upvotes } });
    }

    const [, updated] = await prisma.$transaction([
      prisma.interviewQuestionVote.create({ data: { questionId, userId } }),
      prisma.interviewQuestion.update({
        where: { id: questionId },
        data: { upvotes: { increment: 1 } },
        select: { upvotes: true }
      })
    ]);
    res.json({ success: true, data: { voted: true, upvotes: updated.upvotes } });
  } catch (e) { next(e); }
});

// ---- flag ----------------------------------------------------------------
//
// v1: no per-user dedupe (the schema doesn't carry a flag table). We hide
// the question once it crosses FLAG_AUTOHIDE_AT so a small group of bad
// actors can knock it out for review, but admins can re-approve it from
// /pending/list.
router.post('/:id/flag', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.interviewQuestion.findUnique({
      where: { id: req.params.id },
      select: { id: true, flagCount: true, isApproved: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' }
      });
    }
    const nextCount = existing.flagCount + 1;
    const shouldHide = existing.isApproved && nextCount >= FLAG_AUTOHIDE_AT;
    const updated = await prisma.interviewQuestion.update({
      where: { id: existing.id },
      data: {
        flagCount: { increment: 1 },
        ...(shouldHide ? { isApproved: false } : {})
      },
      select: { id: true, flagCount: true, isApproved: true }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ---- /seed (admin one-shot) ---------------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const result = await seedInterviewQuestions();
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

export default router;
