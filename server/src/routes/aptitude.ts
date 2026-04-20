// Aptitude Test Practice — backs /career-tools/aptitude.
//
// Surface:
//   GET    /categories              public — { category, count, mockReady }[]
//   POST   /attempts/start          auth   — start practice or mock attempt
//   PATCH  /attempts/:id/answer     auth   — record a single answer
//   POST   /attempts/:id/submit     auth   — finalise + score
//   GET    /attempts                auth   — current user's last 20 attempts
//   GET    /attempts/:id            auth   — full attempt for review
//   POST   /seed                    admin  — reseed question bank
//
// No AI/LLM calls. The bank is hand-written in lib/seedAptitudeQuestions.ts.

import { Router } from 'express';
import { z } from 'zod';
import { AptitudeCategory, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { seedAptitudeQuestions } from '../lib/seedAptitudeQuestions.js';

const router = Router();

const categoryEnum = z.nativeEnum(AptitudeCategory);

const startSchema = z.object({
  category: categoryEnum,
  isMock: z.boolean().optional().default(false),
  count: z.number().int().min(1).max(50).optional()
});

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedIndex: z.number().int().min(0).max(10).nullable(),
  timeSpentSec: z.number().int().min(0).max(60 * 60).optional().default(0)
});

const submitSchema = z.object({
  totalSeconds: z.number().int().min(0).max(60 * 60 * 4).optional()
});

const MOCK_QUESTION_COUNT = 20;

// Strip the answer key from a question before sending it to the client mid-attempt.
function publicQuestion(q: {
  id: string;
  category: AptitudeCategory;
  prompt: string;
  options: string[];
  difficulty: number;
  estimatedSeconds: number;
}) {
  return {
    id: q.id,
    category: q.category,
    prompt: q.prompt,
    options: q.options,
    difficulty: q.difficulty,
    estimatedSeconds: q.estimatedSeconds
  };
}

// ---- GET /categories -----------------------------------------------------

router.get('/categories', async (_req, res, next) => {
  try {
    const counts = await prisma.aptitudeQuestion.groupBy({
      by: ['category'],
      _count: { _all: true }
    });
    const byCat = new Map(counts.map((c) => [c.category, c._count._all]));

    const data = (Object.values(AptitudeCategory) as AptitudeCategory[]).map((cat) => {
      const count = byCat.get(cat) ?? 0;
      return { category: cat, count, mockReady: count >= MOCK_QUESTION_COUNT };
    });

    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ---- POST /attempts/start ------------------------------------------------

router.post('/attempts/start', requireAuth, async (req, res, next) => {
  try {
    const parsed = startSchema.parse(req.body);
    const userId = req.auth!.sub;

    const desired = parsed.isMock
      ? MOCK_QUESTION_COUNT
      : Math.max(1, Math.min(parsed.count ?? 1, 20));

    // Pull all question ids in this category, then pick `desired` at random.
    // Postgres has random ordering primitives but Prisma doesn't surface
    // them portably — pulling ids is cheap (≤ a few hundred per category).
    const pool = await prisma.aptitudeQuestion.findMany({
      where: { category: parsed.category },
      select: { id: true }
    });

    if (parsed.isMock && pool.length < MOCK_QUESTION_COUNT) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_ENOUGH_QUESTIONS',
          message: `Mock test needs at least ${MOCK_QUESTION_COUNT} questions in this category. Only ${pool.length} available.`
        }
      });
    }
    if (pool.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_CATEGORY', message: 'No questions seeded for this category yet.' }
      });
    }

    const take = Math.min(desired, pool.length);
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, take);
    const ids = shuffled.map((q) => q.id);

    // Transaction: create attempt + answer rows together so a partial
    // failure doesn't leave orphan attempts.
    const attempt = await prisma.$transaction(async (tx) => {
      const a = await tx.aptitudeAttempt.create({
        data: {
          userId,
          category: parsed.category,
          isMock: parsed.isMock
        }
      });
      await tx.aptitudeAttemptAnswer.createMany({
        data: ids.map((qid) => ({
          attemptId: a.id,
          questionId: qid,
          selectedIndex: null,
          isCorrect: false,
          timeSpentSec: 0
        }))
      });
      return a;
    });

    // Hydrate the (sanitised) questions in the selected order so the client
    // can render them without a second roundtrip.
    const questions = await prisma.aptitudeQuestion.findMany({
      where: { id: { in: ids } }
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = ids
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .map(publicQuestion);

    res.status(201).json({
      success: true,
      data: {
        attempt: {
          id: attempt.id,
          category: attempt.category,
          isMock: attempt.isMock,
          startedAt: attempt.startedAt
        },
        questions: orderedQuestions,
        totalEstimatedSeconds: orderedQuestions.reduce((s, q) => s + q.estimatedSeconds, 0)
      }
    });
  } catch (e) { next(e); }
});

// ---- shared owner check --------------------------------------------------

async function loadOwnedAttempt(attemptId: string, userId: string) {
  const attempt = await prisma.aptitudeAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, userId: true, category: true, isMock: true,
      startedAt: true, completedAt: true, totalSeconds: true, score: true
    }
  });
  if (!attempt) return { error: 'NOT_FOUND' as const };
  if (attempt.userId !== userId) return { error: 'FORBIDDEN' as const };
  return { attempt };
}

// ---- PATCH /attempts/:id/answer ------------------------------------------

router.patch('/attempts/:id/answer', requireAuth, async (req, res, next) => {
  try {
    const parsed = answerSchema.parse(req.body);
    const userId = req.auth!.sub;

    const owner = await loadOwnedAttempt(req.params.id, userId);
    if (owner.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attempt not found' }
      });
    }
    if (owner.error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not your attempt' }
      });
    }
    const attempt = owner.attempt;

    if (attempt.completedAt) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Attempt already submitted' }
      });
    }

    // Find the answer row for this question + this attempt.
    const row = await prisma.aptitudeAttemptAnswer.findFirst({
      where: { attemptId: attempt.id, questionId: parsed.questionId },
      select: { id: true }
    });
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'QUESTION_NOT_IN_ATTEMPT', message: 'That question is not part of this attempt' }
      });
    }

    // Resolve correctness server-side from the question itself.
    const question = await prisma.aptitudeQuestion.findUnique({
      where: { id: parsed.questionId },
      select: { correctIndex: true, explanation: true, options: true }
    });
    if (!question) {
      return res.status(404).json({
        success: false,
        error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found' }
      });
    }

    const isCorrect =
      parsed.selectedIndex !== null && parsed.selectedIndex === question.correctIndex;

    await prisma.aptitudeAttemptAnswer.update({
      where: { id: row.id },
      data: {
        selectedIndex: parsed.selectedIndex,
        isCorrect,
        timeSpentSec: parsed.timeSpentSec ?? 0
      }
    });

    if (attempt.isMock) {
      // Mock keeps the answer hidden until the test is submitted.
      return res.json({ success: true, data: { ok: true } });
    }

    // Untimed practice reveals the result immediately.
    res.json({
      success: true,
      data: {
        isCorrect,
        correctIndex: question.correctIndex,
        explanation: question.explanation
      }
    });
  } catch (e) { next(e); }
});

// ---- POST /attempts/:id/submit -------------------------------------------

router.post('/attempts/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const parsed = submitSchema.parse(req.body);
    const userId = req.auth!.sub;

    const owner = await loadOwnedAttempt(req.params.id, userId);
    if (owner.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attempt not found' }
      });
    }
    if (owner.error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not your attempt' }
      });
    }
    const attempt = owner.attempt;

    if (attempt.completedAt) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Attempt already submitted' }
      });
    }

    // Recompute score from the canonical answer rows + question.correctIndex
    // so a tampered client can't inflate it.
    const answers = await prisma.aptitudeAttemptAnswer.findMany({
      where: { attemptId: attempt.id }
    });
    const questionIds = answers.map((a) => a.questionId);
    const questions = await prisma.aptitudeQuestion.findMany({
      where: { id: { in: questionIds } }
    });
    const qById = new Map(questions.map((q) => [q.id, q]));

    let score = 0;
    const answerUpdates: Prisma.PrismaPromise<unknown>[] = [];
    for (const a of answers) {
      const q = qById.get(a.questionId);
      const isCorrect =
        !!q && a.selectedIndex !== null && a.selectedIndex === q.correctIndex;
      if (isCorrect) score += 1;
      // Re-lock isCorrect on submit even if the live value drifted.
      if (isCorrect !== a.isCorrect) {
        answerUpdates.push(
          prisma.aptitudeAttemptAnswer.update({
            where: { id: a.id },
            data: { isCorrect }
          })
        );
      }
    }

    await prisma.$transaction([
      ...answerUpdates,
      prisma.aptitudeAttempt.update({
        where: { id: attempt.id },
        data: {
          completedAt: new Date(),
          totalSeconds: parsed.totalSeconds ?? null,
          score
        }
      })
    ]);

    // Reload with full review payload (correctIndex + explanation revealed).
    const fullAttempt = await prisma.aptitudeAttempt.findUnique({
      where: { id: attempt.id }
    });
    const fullAnswers = await prisma.aptitudeAttemptAnswer.findMany({
      where: { attemptId: attempt.id }
    });
    const fullQuestions = await prisma.aptitudeQuestion.findMany({
      where: { id: { in: fullAnswers.map((a) => a.questionId) } }
    });
    const qMap = new Map(fullQuestions.map((q) => [q.id, q]));

    res.json({
      success: true,
      data: {
        attempt: fullAttempt,
        total: fullAnswers.length,
        answers: fullAnswers.map((a) => {
          const q = qMap.get(a.questionId);
          return {
            id: a.id,
            questionId: a.questionId,
            selectedIndex: a.selectedIndex,
            isCorrect: a.isCorrect,
            timeSpentSec: a.timeSpentSec,
            question: q
              ? {
                  id: q.id,
                  category: q.category,
                  prompt: q.prompt,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  explanation: q.explanation,
                  difficulty: q.difficulty,
                  estimatedSeconds: q.estimatedSeconds
                }
              : null
          };
        })
      }
    });
  } catch (e) { next(e); }
});

// ---- GET /attempts -------------------------------------------------------

router.get('/attempts', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const rows = await prisma.aptitudeAttempt.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { answers: true } }
      }
    });
    const data = rows.map((a) => {
      const total = a._count.answers || 1;
      const score = a.score ?? 0;
      return {
        id: a.id,
        category: a.category,
        isMock: a.isMock,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        totalSeconds: a.totalSeconds,
        score,
        total,
        percent: Math.round((score / total) * 100)
      };
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ---- GET /attempts/:id ---------------------------------------------------

router.get('/attempts/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const owner = await loadOwnedAttempt(req.params.id, userId);
    if (owner.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attempt not found' }
      });
    }
    if (owner.error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not your attempt' }
      });
    }
    const attempt = owner.attempt;

    const answers = await prisma.aptitudeAttemptAnswer.findMany({
      where: { attemptId: attempt.id }
    });
    const questions = await prisma.aptitudeQuestion.findMany({
      where: { id: { in: answers.map((a) => a.questionId) } }
    });
    const qMap = new Map(questions.map((q) => [q.id, q]));

    // If still in-flight, hide correctIndex/explanation; otherwise reveal.
    const reveal = !!attempt.completedAt;

    res.json({
      success: true,
      data: {
        attempt,
        total: answers.length,
        answers: answers.map((a) => {
          const q = qMap.get(a.questionId);
          if (!q) return { ...a, question: null };
          return {
            id: a.id,
            questionId: a.questionId,
            selectedIndex: a.selectedIndex,
            isCorrect: reveal ? a.isCorrect : false,
            timeSpentSec: a.timeSpentSec,
            question: reveal
              ? {
                  id: q.id,
                  category: q.category,
                  prompt: q.prompt,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  explanation: q.explanation,
                  difficulty: q.difficulty,
                  estimatedSeconds: q.estimatedSeconds
                }
              : publicQuestion(q)
          };
        })
      }
    });
  } catch (e) { next(e); }
});

// ---- POST /seed (admin one-shot) -----------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const result = await seedAptitudeQuestions();
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

export default router;
