// CV Match endpoints — backs /career-tools/cv-match.
//
// Surface (mounted at /api/cv-match):
//   POST   /analyse           auth — run the matcher and return the result without
//                                     persisting (the "preview" call from the UI).
//   POST   /runs              auth — run + persist a CvMatchRun snapshot. Returns
//                                     { run, result } so the UI can show the score
//                                     immediately and link to the persisted history.
//   GET    /runs              auth — list current user's most recent runs (lite shape).
//   GET    /runs/:id          auth — full persisted run, ownership-checked.
//   DELETE /runs/:id          auth — delete a persisted run, ownership-checked.
//
//   ----- v2 AI surface (Gemini 2.0 Flash via lib/gemini) -----
//   GET    /ai/status         auth — { enabled: bool }. NOT rate-limited.
//   POST   /ai/refinements    auth + aiLimiter — contextual refinement reasoning.
//   POST   /ai/rewrite-bullet auth + aiLimiter — three rewritten bullets + rationale.
//   POST   /ai/summary        auth + aiLimiter — tailored 2-3 sentence summary.
//
// v1 deterministic scoring lives in server/src/lib/cvMatch.ts (NO AI). v2
// only ADDs to that — it never replaces the deterministic refinements,
// merging instead.

import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { runCvMatch, type MatchInput, type Refinement } from '../lib/cvMatch.js';
import { geminiJson, isAiEnabled, getLastGeminiError } from '../lib/gemini.js';
import { logAudit } from '../lib/audit.js';

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

// =========================================================================
// v2 — Gemini-powered sub-routes
// =========================================================================
//
// Per-user rate limiter scoped to /ai/* only (NOT applied to /analyse,
// /runs/*, etc — those keep the global /api limiter and nothing else).
// 5 requests per minute per user is enough to refine -> rewrite -> summary
// in one session without letting a runaway client torch our token budget.

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.sub || req.ip || 'unknown',
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Slow down — try again in a minute.' }
  }
});

// ---- shared helpers for the AI routes -----------------------------------

// Pull the CV text we'll feed Gemini for a persisted run. Saved-CV runs
// don't snapshot the body (cvText is null) so we hydrate from the CV row;
// pasted-text runs already have it inline.
async function hydrateRunCvText(run: {
  cvSource: string;
  cvId: string | null;
  cvText: string | null;
  userId: string;
}): Promise<string> {
  if (run.cvText && run.cvText.trim()) return run.cvText;
  if (run.cvSource === 'saved_cv' && run.cvId) {
    const cvRow = await prisma.cV.findFirst({
      where: { id: run.cvId, userId: run.userId },
      select: { data: true }
    });
    if (!cvRow) return '';
    // Flatten the structured CV into the same shape `snapshotFromSavedCv`
    // builds for keyword density — keeps the prompt grounded in actual CV
    // language rather than a JSON dump.
    const data = (cvRow.data ?? {}) as {
      personal?: { fullName?: string };
      summary?: string;
      experience?: Array<{ company?: string; role?: string; bullets?: string[] }>;
      education?: Array<{ school?: string; degree?: string; field?: string }>;
      skills?: string[];
      projects?: Array<{ name?: string; description?: string; tech?: string[] }>;
    };
    const parts: string[] = [];
    if (data.personal?.fullName) parts.push(data.personal.fullName);
    if (data.summary) parts.push(`Summary: ${data.summary}`);
    if (Array.isArray(data.skills) && data.skills.length) {
      parts.push(`Skills: ${data.skills.join(', ')}`);
    }
    for (const exp of data.experience ?? []) {
      const header = [exp.role, exp.company].filter(Boolean).join(' @ ');
      if (header) parts.push(header);
      if (exp.bullets?.length) parts.push(exp.bullets.map((b) => `- ${b}`).join('\n'));
    }
    for (const edu of data.education ?? []) {
      const line = [edu.degree, edu.field, edu.school].filter(Boolean).join(' — ');
      if (line) parts.push(line);
    }
    for (const proj of data.projects ?? []) {
      const line = [proj.name, proj.description].filter(Boolean).join(': ');
      if (line) parts.push(line);
    }
    return parts.join('\n\n');
  }
  return '';
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

async function logAiAudit(
  userId: string,
  kind: string,
  tokens: number,
  cached: boolean,
  targetId?: string
) {
  // Cache hits are intentionally silent — they don't represent new spend
  // or new model output, so logging them only adds noise to the audit feed.
  if (cached) return;
  await logAudit({
    actorId: userId,
    action: 'cv_match.ai_call',
    targetType: targetId ? 'CvMatchRun' : undefined,
    targetId,
    metadata: { kind, tokens, cached }
  });
}

async function logAiActivity(
  userId: string,
  action: 'ai_refinement' | 'ai_rewrite' | 'ai_summary',
  cached: boolean,
  metadata: Record<string, unknown>
) {
  if (cached) return;
  await prisma.careerToolsActivity.create({
    data: { userId, tool: 'cv-match', action, metadata: metadata as object }
  }).catch(() => undefined);
}

// ---- /ai/status ---------------------------------------------------------

router.get('/ai/status', requireAuth, async (_req, res, next) => {
  try {
    const enabled = await isAiEnabled();
    res.json({ success: true, data: { enabled } });
  } catch (e) { next(e); }
});

// ---- /ai/refinements ----------------------------------------------------

const refinementsBodySchema = z.union([
  z.object({ runId: z.string().min(1) }),
  z.object({
    cvText: z.string().min(1).max(20_000),
    jdText: z.string().min(1).max(20_000),
    missingSkills: z.array(z.string()).default([]),
    weakCoverage: z.array(z.string()).default([])
  })
]);

const REFINEMENT_KINDS = [
  'add_skill',
  'strengthen_skill',
  'quantify_bullet',
  'experience_gap',
  'education_gap',
  'reorder_skill',
  'tailor_summary'
] as const;

const refinementSchemaShape = {
  type: 'object',
  properties: {
    refinements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...REFINEMENT_KINDS] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          message: { type: 'string' },
          reasoning: { type: 'string' },
          skill: { type: 'string' }
        },
        required: ['kind', 'severity', 'message', 'reasoning']
      }
    }
  },
  required: ['refinements']
};

type AiRefinement = {
  kind: typeof REFINEMENT_KINDS[number];
  severity: 'high' | 'medium' | 'low';
  message: string;
  reasoning: string;
  skill?: string;
};

function buildRefinementsPrompt(
  cvText: string,
  jdText: string,
  missing: string[],
  weak: string[]
): string {
  return [
    'You are a deterministic CV-improvement assistant for a Ghanaian university alumni network.',
    'The candidate is applying for the role described in the JD below. Their CV is below.',
    `We've already detected these missing required skills: [${missing.join(', ') || 'none'}].`,
    `We've already detected these weakly-covered required skills: [${weak.join(', ') || 'none'}].`,
    '',
    'Generate AT MOST 6 SPECIFIC, ACTIONABLE refinements grounded in the candidate\'s actual CV content.',
    'NEVER fabricate experience the candidate doesn\'t have.',
    'NEVER mention skills not in their CV unless suggesting they add a missing one.',
    'Each refinement must reference a concrete bullet, section, or skill from the CV.',
    '',
    'Return JSON matching the supplied schema. For each refinement provide a one-sentence "message"',
    'the user will see and a brief "reasoning" (≤40 words) explaining WHY it matters for this JD.',
    'Severities: "high" for required-skill gaps, "medium" for weak coverage / missing quantification,',
    '"low" for ordering / cosmetic tweaks. Set "skill" when the refinement is anchored to a specific skill.',
    '',
    `CV:\n${clip(cvText, 12_000)}`,
    '',
    `JD:\n${clip(jdText, 12_000)}`
  ].join('\n');
}

router.post('/ai/refinements', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const parsed = refinementsBodySchema.parse(req.body);
    let cvText = '';
    let jdText = '';
    let missingSkills: string[] = [];
    let weakCoverage: string[] = [];
    let runId: string | undefined;
    let runRow: Awaited<ReturnType<typeof prisma.cvMatchRun.findFirst>> | null = null;

    if ('runId' in parsed) {
      runId = parsed.runId;
      runRow = await prisma.cvMatchRun.findFirst({
        where: { id: parsed.runId, userId: req.auth!.sub }
      });
      if (!runRow) return notFound(res, 'Run not found');
      cvText = await hydrateRunCvText({
        cvSource: runRow.cvSource,
        cvId: runRow.cvId,
        cvText: runRow.cvText,
        userId: req.auth!.sub
      });
      jdText = runRow.jdText ?? '';
      missingSkills = runRow.missingSkills ?? [];
      // weakCoverage isn't persisted on the run, so we derive it from the
      // refinements JSON the deterministic pass produced.
      const existing = Array.isArray(runRow.refinements) ? (runRow.refinements as Refinement[]) : [];
      weakCoverage = existing
        .filter((r) => r.kind === 'strengthen_skill' && r.skill)
        .map((r) => r.skill as string);
    } else {
      cvText = parsed.cvText;
      jdText = parsed.jdText;
      missingSkills = parsed.missingSkills;
      weakCoverage = parsed.weakCoverage;
    }

    if (!cvText.trim() || !jdText.trim()) {
      return badRequest(res, 'Both CV and JD text are required to generate AI refinements.');
    }

    const prompt = buildRefinementsPrompt(cvText, jdText, missingSkills, weakCoverage);
    const result = await geminiJson<{ refinements: AiRefinement[] }>(
      prompt,
      refinementSchemaShape,
      { maxOutputTokens: 1024 }
    );

    if (!result) {
      return res.json({ success: true, data: { enabled: false, refinements: [] } });
    }

    const aiRefinements = (result.data.refinements ?? []).slice(0, 6);

    // If we're attached to a persisted run, fold the AI suggestions into the
    // existing refinements JSON and persist (tagged so the UI can render
    // them differently). Also bump aiCostTokens.
    if (runId && runRow) {
      const existing = Array.isArray(runRow.refinements) ? (runRow.refinements as object[]) : [];
      const tagged = aiRefinements.map((r) => ({ ...r, source: 'ai' as const }));
      const merged = [...existing, ...tagged];
      const newTokens = (runRow.aiCostTokens ?? 0) + result.tokensUsed;
      await prisma.cvMatchRun.update({
        where: { id: runId },
        data: {
          refinements: merged as unknown as object,
          aiCostTokens: newTokens
        }
      });
    }

    await logAiAudit(req.auth!.sub, 'refinements', result.tokensUsed, result.cached, runId);
    await logAiActivity(req.auth!.sub, 'ai_refinement', result.cached, {
      runId: runId ?? null,
      tokens: result.tokensUsed,
      count: aiRefinements.length
    });

    res.json({
      success: true,
      data: {
        enabled: true,
        refinements: aiRefinements,
        tokensUsed: result.tokensUsed,
        cached: result.cached
      }
    });
  } catch (e) { next(e); }
});

// ---- /ai/rewrite-bullet -------------------------------------------------

const rewriteBodySchema = z.object({
  bullet: z.string().min(1).max(2000),
  jd: z.string().min(1).max(20_000),
  emphasize: z.array(z.string().min(1).max(120)).max(10).default([])
});

const rewriteSchemaShape = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3
    },
    rationale: { type: 'string' }
  },
  required: ['variants', 'rationale']
};

router.post('/ai/rewrite-bullet', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const parsed = rewriteBodySchema.parse(req.body);

    const prompt = [
      'You are a CV editor for Ghanaian alumni applying to professional roles.',
      'Rewrite the following experience bullet into THREE distinct variants tailored to the JD below.',
      'Each variant must:',
      '  - be at most 30 words,',
      '  - start with a strong past-tense action verb,',
      '  - include a quantified outcome where the original bullet supports one (NEVER invent numbers),',
      '  - naturally reference the emphasis terms when they fit, without keyword-stuffing.',
      'Then provide a single "rationale" of at most 80 words explaining what you changed and why.',
      '',
      `Original bullet: ${parsed.bullet}`,
      parsed.emphasize.length ? `Emphasize when relevant: ${parsed.emphasize.join(', ')}` : '',
      '',
      `JD context:\n${clip(parsed.jd, 12_000)}`
    ].filter(Boolean).join('\n');

    const result = await geminiJson<{ variants: string[]; rationale: string }>(
      prompt,
      rewriteSchemaShape,
      { maxOutputTokens: 768, temperature: 0.5 }
    );

    if (!result) {
      return res.json({ success: true, data: { enabled: false } });
    }

    await logAiAudit(req.auth!.sub, 'rewrite_bullet', result.tokensUsed, result.cached);
    await logAiActivity(req.auth!.sub, 'ai_rewrite', result.cached, {
      tokens: result.tokensUsed,
      bulletLength: parsed.bullet.length
    });

    res.json({
      success: true,
      data: {
        enabled: true,
        variants: (result.data.variants ?? []).slice(0, 3),
        rationale: result.data.rationale ?? '',
        tokensUsed: result.tokensUsed,
        cached: result.cached
      }
    });
  } catch (e) { next(e); }
});

// ---- /ai/summary --------------------------------------------------------

const toneEnum = z.enum(['confident', 'warm', 'direct']);

const summaryBodySchema = z.union([
  z.object({ runId: z.string().min(1), tone: toneEnum.optional() }),
  z.object({
    cvText: z.string().min(1).max(20_000),
    jdText: z.string().min(1).max(20_000),
    tone: toneEnum.optional()
  })
]);

const summarySchemaShape = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary']
};

router.post('/ai/summary', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const parsed = summaryBodySchema.parse(req.body);
    const tone = parsed.tone ?? 'confident';

    let cvText = '';
    let jdText = '';
    let runId: string | undefined;
    let runRow: Awaited<ReturnType<typeof prisma.cvMatchRun.findFirst>> | null = null;

    if ('runId' in parsed) {
      runId = parsed.runId;
      runRow = await prisma.cvMatchRun.findFirst({
        where: { id: parsed.runId, userId: req.auth!.sub }
      });
      if (!runRow) return notFound(res, 'Run not found');
      cvText = await hydrateRunCvText({
        cvSource: runRow.cvSource,
        cvId: runRow.cvId,
        cvText: runRow.cvText,
        userId: req.auth!.sub
      });
      jdText = runRow.jdText ?? '';
    } else {
      cvText = parsed.cvText;
      jdText = parsed.jdText;
    }

    if (!cvText.trim() || !jdText.trim()) {
      return badRequest(res, 'Both CV and JD text are required to generate a tailored summary.');
    }

    const toneGuidance: Record<typeof tone, string> = {
      confident: 'Use a confident, achievement-led voice that leads with results.',
      warm: 'Use a warm, collaborative voice that highlights teamwork and impact.',
      direct: 'Use a direct, no-fluff voice that names skills and outcomes plainly.'
    };

    const prompt = [
      'You are writing a tailored CV summary for a Ghanaian alumnus applying to the role described in the JD below.',
      'Produce 2-3 sentences (≤80 words total). NEVER invent experience, skills, or credentials not present in the CV.',
      'Anchor the summary in concrete elements from the CV that align with what the JD asks for.',
      toneGuidance[tone],
      'Return JSON matching the supplied schema with the summary in the "summary" field.',
      '',
      `CV:\n${clip(cvText, 12_000)}`,
      '',
      `JD:\n${clip(jdText, 12_000)}`
    ].join('\n');

    const result = await geminiJson<{ summary: string }>(
      prompt,
      summarySchemaShape,
      { maxOutputTokens: 1024, temperature: 0.4 }
    );

    if (!result) {
      return res.json({ success: true, data: { enabled: false, debug: getLastGeminiError() } });
    }

    const summary = (result.data.summary ?? '').trim();

    if (runId && runRow) {
      const newTokens = (runRow.aiCostTokens ?? 0) + result.tokensUsed;
      await prisma.cvMatchRun.update({
        where: { id: runId },
        data: { aiSummary: summary, aiCostTokens: newTokens }
      });
    }

    await logAiAudit(req.auth!.sub, 'summary', result.tokensUsed, result.cached, runId);
    await logAiActivity(req.auth!.sub, 'ai_summary', result.cached, {
      runId: runId ?? null,
      tokens: result.tokensUsed,
      tone
    });

    res.json({
      success: true,
      data: {
        enabled: true,
        summary,
        tokensUsed: result.tokensUsed,
        cached: result.cached
      }
    });
  } catch (e) { next(e); }
});

export default router;
