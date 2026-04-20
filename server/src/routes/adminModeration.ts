// Universal moderation queue — Phase 3 of the superuser admin layer.
//
// One unified pending-items feed across every model that has an
// admin-gated approval bit. Sources:
//   - Opportunity         where isApproved=false
//   - Scholarship         where isApproved=false
//   - LearningResource    where isApproved=false
//   - InterviewQuestion   where isApproved=false
//   - Achievement         where isApproved=false
//   - Portfolio           where isPublished=false (treated as in-draft;
//                         v1 just lists all unpublished — no separate
//                         "publish requested" flag exists yet)
//   - InterviewQuestion   where flagCount >= 5 (auto-hidden, needs review)
//
// Note: FreelanceGig has no flagging system yet — intentionally skipped.
//
// Endpoints (all gated by requireAuth + requireSuperuser):
//   GET    /                  unified queue (≤100 items, createdAt desc)
//   GET    /counts            per-kind pending counts for sidebar badge
//   POST   /:kind/:id/approve approve (kind-aware field flip)
//   POST   /:kind/:id/reject  reject (kind-aware: deactivate / delete / no-op)
//   PATCH  /:kind/:id         edit-then-publish (validated per kind, sets
//                              isApproved=true after the update)

import { Router } from 'express';
import { z } from 'zod';
import {
  LearningType,
  LearningLevel,
  LearningCost,
  InterviewCategory,
  InterviewDifficulty,
  AchievementType,
  OpportunityType,
  LocationType,
  ScholarshipLevel
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.use(requireAuth, requireSuperuser);

// ---- shared helpers ------------------------------------------------------

const MAX_ITEMS = 100;

const KINDS = [
  'opportunity',
  'scholarship',
  'learning_resource',
  'interview_question',
  'achievement',
  'portfolio',
  'interview_question_flag'
] as const;

type Kind = (typeof KINDS)[number];

const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

// Trim a string preview down to ~200 chars without breaking mid-word too hard.
function preview(...parts: (string | null | undefined)[]): string {
  const joined = parts.filter(Boolean).join(' — ').trim();
  if (joined.length <= 200) return joined;
  return joined.slice(0, 197).trimEnd() + '…';
}

// Submitter shape we expose to the client. All fields nullable in case
// the underlying record had its user soft-deleted (LearningResource uses
// SetNull on delete).
type Submitter = {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
} | null;

type QueueItem = {
  kind: Kind;
  id: string;
  title: string;
  submitter: Submitter;
  createdAt: Date;
  preview: string;
  raw: Record<string, unknown>;
};

const submitterSelect = {
  select: { id: true, firstName: true, lastName: true, email: true }
} as const;

// ---- GET / (unified queue) -----------------------------------------------

router.get('/', async (_req, res, next) => {
  try {
    const [
      opportunities,
      scholarships,
      learningResources,
      interviewQuestions,
      achievements,
      portfolios,
      flaggedQuestions
    ] = await Promise.all([
      prisma.opportunity.findMany({
        where: { isApproved: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        include: { postedBy: submitterSelect }
      }),
      prisma.scholarship.findMany({
        where: { isApproved: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        include: { submittedBy: submitterSelect }
      }),
      prisma.learningResource.findMany({
        where: { isApproved: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        include: { submittedBy: submitterSelect }
      }),
      prisma.interviewQuestion.findMany({
        where: { isApproved: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS
      }),
      prisma.achievement.findMany({
        where: { isApproved: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        include: { user: submitterSelect }
      }),
      prisma.portfolio.findMany({
        where: { isPublished: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        include: { user: submitterSelect }
      }),
      prisma.interviewQuestion.findMany({
        where: { flagCount: { gte: 5 } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS
      })
    ]);

    // For interview questions (and flagged variants) we need to resolve
    // submittedById -> user lazily because the model has no relation.
    const allSubmitterIds = Array.from(
      new Set(
        [...interviewQuestions, ...flaggedQuestions]
          .map((q) => q.submittedById)
          .filter((v): v is string => !!v)
      )
    );
    const submitterRows = allSubmitterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: allSubmitterIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];
    const submittersById = new Map(submitterRows.map((u) => [u.id, u]));

    const items: QueueItem[] = [];

    for (const o of opportunities) {
      items.push({
        kind: 'opportunity',
        id: o.id,
        title: o.title,
        submitter: o.postedBy,
        createdAt: o.createdAt,
        preview: preview(o.company, o.location, o.description),
        raw: o as unknown as Record<string, unknown>
      });
    }
    for (const s of scholarships) {
      items.push({
        kind: 'scholarship',
        id: s.id,
        title: s.title,
        submitter: s.submittedBy,
        createdAt: s.createdAt,
        preview: preview(s.provider, s.description),
        raw: s as unknown as Record<string, unknown>
      });
    }
    for (const l of learningResources) {
      items.push({
        kind: 'learning_resource',
        id: l.id,
        title: l.title,
        submitter: l.submittedBy ?? null,
        createdAt: l.createdAt,
        preview: preview(l.provider, l.description, l.url),
        raw: l as unknown as Record<string, unknown>
      });
    }
    for (const q of interviewQuestions) {
      const sub = q.submittedById ? submittersById.get(q.submittedById) ?? null : null;
      items.push({
        kind: 'interview_question',
        id: q.id,
        title: q.prompt.slice(0, 120) || '(no prompt)',
        submitter: sub,
        createdAt: q.createdAt,
        preview: preview(q.category, q.difficulty, q.guidance),
        raw: q as unknown as Record<string, unknown>
      });
    }
    for (const a of achievements) {
      items.push({
        kind: 'achievement',
        id: a.id,
        title: a.title,
        submitter: a.user,
        createdAt: a.createdAt,
        preview: preview(a.type, a.description),
        raw: a as unknown as Record<string, unknown>
      });
    }
    for (const p of portfolios) {
      items.push({
        kind: 'portfolio',
        id: p.id,
        title: p.title,
        submitter: p.user,
        createdAt: p.createdAt,
        preview: preview(p.tagline, p.bio),
        raw: p as unknown as Record<string, unknown>
      });
    }
    for (const q of flaggedQuestions) {
      const sub = q.submittedById ? submittersById.get(q.submittedById) ?? null : null;
      items.push({
        kind: 'interview_question_flag',
        id: q.id,
        title: q.prompt.slice(0, 120) || '(no prompt)',
        submitter: sub,
        createdAt: q.createdAt,
        preview: preview(`flagCount=${q.flagCount}`, q.category, q.guidance),
        raw: q as unknown as Record<string, unknown>
      });
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const capped = items.slice(0, MAX_ITEMS);

    res.json({ success: true, data: { items: capped } });
  } catch (e) { next(e); }
});

// ---- GET /counts ---------------------------------------------------------

router.get('/counts', async (_req, res, next) => {
  try {
    const [
      opportunity,
      scholarship,
      learning_resource,
      interview_question,
      achievement,
      portfolio,
      interview_question_flag
    ] = await Promise.all([
      prisma.opportunity.count({ where: { isApproved: false } }),
      prisma.scholarship.count({ where: { isApproved: false } }),
      prisma.learningResource.count({ where: { isApproved: false } }),
      prisma.interviewQuestion.count({ where: { isApproved: false } }),
      prisma.achievement.count({ where: { isApproved: false } }),
      prisma.portfolio.count({ where: { isPublished: false } }),
      prisma.interviewQuestion.count({ where: { flagCount: { gte: 5 } } })
    ]);
    const counts = {
      opportunity,
      scholarship,
      learning_resource,
      interview_question,
      achievement,
      portfolio,
      interview_question_flag
    };
    res.json({
      success: true,
      data: { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }
    });
  } catch (e) { next(e); }
});

// ---- model dispatch helpers ---------------------------------------------

// Centralized "does this row exist?" lookup so each handler can short-circuit
// with a clean 404 before touching audit / mutation logic.
async function rowExists(kind: Kind, id: string): Promise<boolean> {
  switch (kind) {
    case 'opportunity':
      return !!(await prisma.opportunity.findUnique({ where: { id }, select: { id: true } }));
    case 'scholarship':
      return !!(await prisma.scholarship.findUnique({ where: { id }, select: { id: true } }));
    case 'learning_resource':
      return !!(await prisma.learningResource.findUnique({ where: { id }, select: { id: true } }));
    case 'interview_question':
    case 'interview_question_flag':
      return !!(await prisma.interviewQuestion.findUnique({ where: { id }, select: { id: true } }));
    case 'achievement':
      return !!(await prisma.achievement.findUnique({ where: { id }, select: { id: true } }));
    case 'portfolio':
      return !!(await prisma.portfolio.findUnique({ where: { id }, select: { id: true } }));
  }
}

// ---- POST /:kind/:id/approve --------------------------------------------

router.post('/:kind/:id/approve', async (req, res, next) => {
  try {
    const { kind, id } = req.params;
    if (!isKind(kind)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_KIND', message: 'Unknown moderation kind' } });
    }
    if (!(await rowExists(kind, id))) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
    }

    await logAudit({
      actorId: req.auth!.sub,
      action: `moderation.${kind}.approved`,
      targetType: kind,
      targetId: id
    });

    let updated: unknown;
    switch (kind) {
      case 'opportunity':
        updated = await prisma.opportunity.update({ where: { id }, data: { isApproved: true } });
        break;
      case 'scholarship':
        updated = await prisma.scholarship.update({ where: { id }, data: { isApproved: true } });
        break;
      case 'learning_resource':
        updated = await prisma.learningResource.update({ where: { id }, data: { isApproved: true } });
        break;
      case 'interview_question':
        updated = await prisma.interviewQuestion.update({ where: { id }, data: { isApproved: true } });
        break;
      case 'achievement':
        updated = await prisma.achievement.update({ where: { id }, data: { isApproved: true } });
        break;
      case 'portfolio':
        updated = await prisma.portfolio.update({ where: { id }, data: { isPublished: true } });
        break;
      case 'interview_question_flag':
        // Approving a flagged question = clearing the flags so it's visible again.
        updated = await prisma.interviewQuestion.update({ where: { id }, data: { flagCount: 0 } });
        break;
    }

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ---- POST /:kind/:id/reject ---------------------------------------------

router.post('/:kind/:id/reject', async (req, res, next) => {
  try {
    const { kind, id } = req.params;
    if (!isKind(kind)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_KIND', message: 'Unknown moderation kind' } });
    }
    if (!(await rowExists(kind, id))) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
    }

    await logAudit({
      actorId: req.auth!.sub,
      action: `moderation.${kind}.rejected`,
      targetType: kind,
      targetId: id
    });

    let result: unknown = { id };
    switch (kind) {
      case 'opportunity':
        result = await prisma.opportunity.update({ where: { id }, data: { isActive: false } });
        break;
      case 'scholarship':
        // Scholarship has no isActive flag — leaving isApproved=false IS the
        // rejection. Re-write to make it explicit and update timestamp.
        result = await prisma.scholarship.update({ where: { id }, data: { isApproved: false } });
        break;
      case 'learning_resource':
        await prisma.learningResource.delete({ where: { id } });
        break;
      case 'interview_question':
        await prisma.interviewQuestion.delete({ where: { id } });
        break;
      case 'achievement':
        await prisma.achievement.delete({ where: { id } });
        break;
      case 'portfolio':
        // Portfolios are owner-managed drafts — admin doesn't delete them on
        // reject. No-op intentionally.
        break;
      case 'interview_question_flag':
        // Reject = the flags were correct, take the question down.
        await prisma.interviewQuestion.delete({ where: { id } });
        break;
    }

    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// ---- PATCH /:kind/:id (edit-then-publish) -------------------------------

// Per-kind partial-update schemas. Kept minimal — enough for an admin to fix
// typos and metadata before publishing without enumerating every column.
// The kind-specific allowed columns are mirrored in the data spread below.

const opportunityPatch = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(20).optional(),
  company: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  locationType: z.nativeEnum(LocationType).optional(),
  type: z.nativeEnum(OpportunityType).optional(),
  salaryMin: z.number().int().nullable().optional(),
  salaryMax: z.number().int().nullable().optional(),
  deadline: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  industry: z.string().nullable().optional(),
  experienceLevel: z.string().nullable().optional(),
  applicationUrl: z.string().url().nullable().optional()
});

const scholarshipPatch = z.object({
  title: z.string().min(2).optional(),
  provider: z.string().min(1).optional(),
  description: z.string().min(10).optional(),
  eligibility: z.string().min(2).optional(),
  deadline: z.string().optional(),
  awardAmount: z.string().nullable().optional(),
  applicationUrl: z.string().url().optional(),
  level: z.nativeEnum(ScholarshipLevel).optional(),
  fieldOfStudy: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

const learningResourcePatch = z.object({
  title: z.string().min(2).optional(),
  provider: z.string().min(1).optional(),
  url: z.string().url().optional(),
  type: z.nativeEnum(LearningType).optional(),
  level: z.nativeEnum(LearningLevel).optional(),
  cost: z.nativeEnum(LearningCost).optional(),
  language: z.string().min(2).optional(),
  durationMin: z.number().int().positive().nullable().optional(),
  skills: z.array(z.string()).optional(),
  description: z.string().nullable().optional()
});

const interviewQuestionPatch = z.object({
  prompt: z.string().min(5).optional(),
  guidance: z.string().nullable().optional(),
  sampleAnswer: z.string().nullable().optional(),
  category: z.nativeEnum(InterviewCategory).optional(),
  difficulty: z.nativeEnum(InterviewDifficulty).optional(),
  roleSlug: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

const achievementPatch = z.object({
  type: z.nativeEnum(AchievementType).optional(),
  title: z.string().min(2).optional(),
  description: z.string().min(2).optional(),
  date: z.string().optional(),
  link: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isFeatured: z.boolean().optional()
});

const portfolioPatch = z.object({
  title: z.string().min(2).optional(),
  tagline: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  theme: z.string().optional(),
  contactEmail: z.string().email().nullable().optional()
});

router.patch('/:kind/:id', async (req, res, next) => {
  try {
    const { kind, id } = req.params;
    if (!isKind(kind)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_KIND', message: 'Unknown moderation kind' } });
    }
    if (!(await rowExists(kind, id))) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
    }

    await logAudit({
      actorId: req.auth!.sub,
      action: `moderation.${kind}.edited_and_published`,
      targetType: kind,
      targetId: id,
      metadata: { fields: Object.keys(req.body ?? {}) }
    });

    let updated: unknown;
    switch (kind) {
      case 'opportunity': {
        const body = opportunityPatch.parse(req.body);
        const { deadline, ...rest } = body;
        updated = await prisma.opportunity.update({
          where: { id },
          data: {
            ...rest,
            ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
            isApproved: true
          }
        });
        break;
      }
      case 'scholarship': {
        const body = scholarshipPatch.parse(req.body);
        const { deadline, ...rest } = body;
        updated = await prisma.scholarship.update({
          where: { id },
          data: {
            ...rest,
            ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
            isApproved: true
          }
        });
        break;
      }
      case 'learning_resource': {
        const body = learningResourcePatch.parse(req.body);
        updated = await prisma.learningResource.update({
          where: { id },
          data: { ...body, isApproved: true }
        });
        break;
      }
      case 'interview_question':
      case 'interview_question_flag': {
        const body = interviewQuestionPatch.parse(req.body);
        updated = await prisma.interviewQuestion.update({
          where: { id },
          data: {
            ...body,
            isApproved: true,
            // For the flagged variant we also clear the flag count so the
            // edit-then-publish flow restores visibility in one shot.
            ...(kind === 'interview_question_flag' ? { flagCount: 0 } : {})
          }
        });
        break;
      }
      case 'achievement': {
        const body = achievementPatch.parse(req.body);
        const { date, ...rest } = body;
        updated = await prisma.achievement.update({
          where: { id },
          data: {
            ...rest,
            ...(date !== undefined ? { date: new Date(date) } : {}),
            isApproved: true
          }
        });
        break;
      }
      case 'portfolio': {
        const body = portfolioPatch.parse(req.body);
        updated = await prisma.portfolio.update({
          where: { id },
          data: { ...body, isPublished: true }
        });
        break;
      }
    }

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
