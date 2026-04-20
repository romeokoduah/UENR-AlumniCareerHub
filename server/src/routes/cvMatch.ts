// CV Match endpoints — backs /career-tools/cv-match.
//
// Surface (mounted at /api/cv-match):
//   POST   /analyse       auth — run the matcher and return the result without
//                                 persisting (the "preview" call from the UI).
//   POST   /runs          auth — run + persist a CvMatchRun snapshot. Returns
//                                 { run, result } so the UI can show the score
//                                 immediately and link to the persisted history.
//   GET    /runs          auth — list current user's most recent runs (lite shape).
//   GET    /runs/:id      auth — full persisted run, ownership-checked.
//   DELETE /runs/:id      auth — delete a persisted run, ownership-checked.
//
// Scoring / extraction is in server/src/lib/cvMatch.ts. NO AI / LLM CALLS.

import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { runCvMatch, type MatchInput } from '../lib/cvMatch.js';

const router = Router();

// ---- helpers -------------------------------------------------------------

function notFound(res: Response, message = 'Not found') {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
}

function badRequest(res: Response, message: string, code = 'BAD_REQUEST') {
  return res.status(400).json({ success: false, error: { code, message } });
}

// ---- shared zod ----------------------------------------------------------

// We allow jdText to be empty when the caller is using a saved opportunity —
// the matcher will hydrate the JD text from the opportunity row in that case.
const matchInputSchema = z
  .object({
    cvSource: z.enum(['saved_cv', 'pasted_text']),
    cvId: z.string().min(1).optional(),
    cvText: z.string().max(50_000).optional(),
    jdSource: z.enum(['saved_opportunity', 'pasted_text']),
    opportunityId: z.string().min(1).optional(),
    jdText: z.string().max(50_000).optional().default(''),
    jobTitle: z.string().max(200).optional()
  })
  .superRefine((val, ctx) => {
    if (val.cvSource === 'saved_cv' && !val.cvId) {
      ctx.addIssue({ code: 'custom', path: ['cvId'], message: 'cvId is required when cvSource is saved_cv' });
    }
    if (val.cvSource === 'pasted_text' && !val.cvText?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['cvText'], message: 'cvText is required when cvSource is pasted_text' });
    }
    if (val.jdSource === 'saved_opportunity' && !val.opportunityId) {
      ctx.addIssue({ code: 'custom', path: ['opportunityId'], message: 'opportunityId is required when jdSource is saved_opportunity' });
    }
    if (val.jdSource === 'pasted_text' && !val.jdText?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['jdText'], message: 'jdText is required when jdSource is pasted_text' });
    }
  });

function toMatchInput(parsed: z.infer<typeof matchInputSchema>): MatchInput {
  return {
    cvSource: parsed.cvSource,
    cvId: parsed.cvId,
    cvText: parsed.cvText,
    jdSource: parsed.jdSource,
    opportunityId: parsed.opportunityId,
    jdText: parsed.jdText ?? '',
    jobTitle: parsed.jobTitle
  };
}

// Centralised error mapping so the messages thrown from runCvMatch (e.g.
// "CV not found") surface as 404s instead of generic 500s.
function mapDomainError(res: Response, err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  if (message === 'CV not found' || message === 'Opportunity not found' || message === 'User not found') {
    notFound(res, message);
    return true;
  }
  if (message.startsWith('cvId is required') || message.startsWith('cvText is required') ||
      message.startsWith('opportunityId is required') || message.startsWith('jdText is required')) {
    badRequest(res, message);
    return true;
  }
  return false;
}

// ---- /analyse ------------------------------------------------------------

router.post('/analyse', requireAuth, async (req, res, next) => {
  try {
    const parsed = matchInputSchema.parse(req.body);
    const result = await runCvMatch(req.auth!.sub, toMatchInput(parsed));
    res.json({ success: true, data: result });
  } catch (e) {
    if (mapDomainError(res, e)) return;
    next(e);
  }
});

// ---- /runs ---------------------------------------------------------------

router.get('/runs', requireAuth, async (req, res, next) => {
  try {
    const runs = await prisma.cvMatchRun.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        jobTitle: true,
        score: true,
        createdAt: true,
        jdSource: true,
        opportunityId: true
      }
    });
    res.json({ success: true, data: runs });
  } catch (e) { next(e); }
});

router.post('/runs', requireAuth, async (req, res, next) => {
  try {
    const parsed = matchInputSchema.parse(req.body);
    const input = toMatchInput(parsed);
    const result = await runCvMatch(req.auth!.sub, input);

    const run = await prisma.cvMatchRun.create({
      data: {
        userId: req.auth!.sub,
        cvSource: input.cvSource,
        cvId: input.cvSource === 'saved_cv' ? (input.cvId ?? null) : null,
        // We persist the pasted CV text so a returning user can see exactly
        // what they analysed. Saved-CV runs intentionally don't snapshot the
        // CV body — they reference cvId, and the CV row is the source of truth.
        cvText: input.cvSource === 'pasted_text' ? (input.cvText ?? null) : null,
        jdSource: input.jdSource,
        opportunityId: input.jdSource === 'saved_opportunity' ? (input.opportunityId ?? null) : null,
        jdText: input.jdText,
        jobTitle: result.derivedFromJd.jobTitle ?? input.jobTitle ?? null,
        cvSkills: result.derivedFromCv.skills,
        jdRequired: result.derivedFromJd.required,
        jdPreferred: result.derivedFromJd.preferred,
        jdYearsRequired: result.derivedFromJd.yearsRequired ?? null,
        score: result.score,
        breakdown: result.breakdown as unknown as object,
        refinements: result.refinements as unknown as object,
        missingSkills: result.missingSkills
      }
    });

    // Best-effort activity log so this run shows up in /career-tools/activity.
    await prisma.careerToolsActivity.create({
      data: {
        userId: req.auth!.sub,
        tool: 'cv-match',
        action: 'run',
        metadata: { runId: run.id, score: result.score, jobTitle: run.jobTitle }
      }
    }).catch(() => undefined);

    res.status(201).json({ success: true, data: { run, result } });
  } catch (e) {
    if (mapDomainError(res, e)) return;
    next(e);
  }
});

router.get('/runs/:id', requireAuth, async (req, res, next) => {
  try {
    const run = await prisma.cvMatchRun.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!run) return notFound(res, 'Run not found');
    res.json({ success: true, data: run });
  } catch (e) { next(e); }
});

router.delete('/runs/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.cvMatchRun.deleteMany({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (result.count === 0) return notFound(res, 'Run not found');
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

export default router;
