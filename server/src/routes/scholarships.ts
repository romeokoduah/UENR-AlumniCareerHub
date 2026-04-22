import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, level, field, region, funding, status, includeRolling } = req.query as Record<string, string>;
    const now = new Date();

    // Visibility: only show PUBLISHED rows. Scholarship.status defaults to
    // PUBLISHED on the schema, so legacy user-submitted rows satisfy this
    // without a migration. The previous `OR: [isApproved=true, status=PUBLISHED]`
    // was vulnerable to drift — an ingested row first published then demoted
    // to PENDING_REVIEW on re-ingest could leak through if isApproved stayed
    // stale. Gating on status directly is the precise rule.
    const visibilityClause = { status: 'PUBLISHED' as const };

    // deadline filter: open means deadline in the future OR null (if
    // includeRolling is set). Closed means deadline is in the past (always
    // non-null). Without a status param no deadline filter is applied.
    let deadlineClause: object | undefined;
    if (status === 'open') {
      if (includeRolling === 'true') {
        // null deadlines (rolling scholarships) + future deadlines both qualify
        deadlineClause = {
          OR: [
            { deadline: null },
            { deadline: { gte: now } }
          ]
        };
      } else {
        deadlineClause = { deadline: { gte: now } };
      }
    } else if (status === 'closed') {
      deadlineClause = { deadline: { lt: now } };
    }

    // `field` param: for user-submitted rows match against `fieldOfStudy`
    // (free-text, insensitive) AND for ingested rows match against
    // category->>'field' (structured enum). Both arms are OR-ed so a single
    // ?field=STEM query surfaces both kinds of match.
    let fieldClause: object | undefined;
    if (field) {
      fieldClause = {
        OR: [
          { fieldOfStudy: { contains: field, mode: 'insensitive' as const } },
          { category: { path: ['field'], equals: field } }
        ]
      };
    }

    // `region` and `funding` only exist in the structured category JSON.
    const regionClause = region
      ? { category: { path: ['region'], equals: region } }
      : undefined;

    const fundingClause = funding
      ? { category: { path: ['funding'], equals: funding } }
      : undefined;

    const items = await prisma.scholarship.findMany({
      where: {
        AND: [
          visibilityClause,
          ...(level ? [{ level: level as any }] : []),
          ...(fieldClause ? [fieldClause] : []),
          ...(regionClause ? [regionClause] : []),
          ...(fundingClause ? [fundingClause] : []),
          ...(deadlineClause ? [deadlineClause] : []),
          ...(q ? [{
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { provider: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } }
            ]
          }] : [])
        ]
      },
      orderBy: { deadline: 'asc' },
      take: 100
    });
    res.json({ success: true, data: items });
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
    const isAdmin = req.auth!.role === 'ADMIN';
    const item = await prisma.scholarship.create({
      data: {
        ...data,
        deadline: new Date(data.deadline),
        submittedById: req.auth!.sub,
        isApproved: isAdmin,
        // Admin posts skip the review queue and publish immediately.
        ...(isAdmin && { source: 'ADMIN', status: 'PUBLISHED' })
      }
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

export default router;
