// CV Match v3 — AI primitives.
//
// v1 (lib/cvMatch.ts) is deterministic and stays as the fallback. v3
// makes Gemini the primary engine for the four operations the route
// layer composes:
//
//   1. aiExtract      — pull structured signals (skills, seniority,
//                       industry, soft signals) from CV + JD.
//   2. aiScore        — produce a 0..100 score with a six-axis breakdown
//                       and a short reasoning paragraph. Receives the
//                       extraction so the model has structured context.
//   3. aiRefinements  — actionable, CV-grounded suggestions tagged by
//                       kind/severity. Capped at 8.
//   4. aiSummary      — tailored 2-3 sentence summary in the requested
//                       tone.
//
// Every function returns null when no AI provider is available / disabled —
// the caller falls back to the deterministic engine. Each call goes
// through `aiJson`, which tries Groq first (free-tier 14,400 req/day,
// sub-second) and falls back to Gemini, handling retries / timeouts
// / caching in one place. We never talk to a single provider directly
// from here.

import { aiJson } from './aiProvider.js';

// ---- shared prompt preamble ---------------------------------------------

const SYSTEM_PREAMBLE =
  'You are a deterministic CV-vs-JD analysis assistant for UENR alumni in Ghana. ' +
  'Never fabricate experience, skills, or credentials not present in the CV. ' +
  'If a field is unknown, return null/empty.';

// Soft cap on text we send to Gemini. Long CVs/JDs eat token budget and
// often hide the signal in boilerplate — 12k chars is plenty for a
// well-written CV + a typical JD without paying for the long tail.
function clip(text: string, max = 12_000): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

// ---- public types -------------------------------------------------------

export type AiExtraction = {
  cvSkills: string[];
  jdRequired: string[];
  jdPreferred: string[];
  jdYearsRequired: number | null;
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | null;
  industry: string | null;
  jobTitle: string | null;
  softSignals: string[];
};

export type AiScoreBreakdown = {
  hardSkills: number;
  softSignals: number;
  experience: number;
  education: number;
  cultureFit: number;
  growthSignal: number;
};

export type AiScoreResult = {
  score: number;
  breakdown: AiScoreBreakdown;
  reasoning: string;
};

export const AI_REFINEMENT_KINDS = [
  'add_skill',
  'strengthen_skill',
  'quantify_bullet',
  'experience_gap',
  'education_gap',
  'reorder_skill',
  'tailor_summary'
] as const;

export type AiRefinementKind = typeof AI_REFINEMENT_KINDS[number];

export type AiRefinement = {
  kind: AiRefinementKind;
  severity: 'high' | 'medium' | 'low';
  message: string;
  reasoning: string;
  skill?: string;
};

export type AiSummary = { summary: string };

export type AiCallResult<T> = { data: T; tokensUsed: number; cached: boolean } | null;

// ---- schemas ------------------------------------------------------------
// Gemini's responseSchema is a JSON Schema subset (OpenAPI 3 style); Groq's
// Llama backend reads the same shape as a schema hint in the system prompt.
// Keep them tight so the model can't pad fields with junk.

const SENIORITY_ENUM = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];

const extractionSchema = {
  type: 'object',
  properties: {
    cvSkills: { type: 'array', items: { type: 'string' } },
    jdRequired: { type: 'array', items: { type: 'string' } },
    jdPreferred: { type: 'array', items: { type: 'string' } },
    jdYearsRequired: { type: 'integer', nullable: true },
    seniority: { type: 'string', enum: SENIORITY_ENUM, nullable: true },
    industry: { type: 'string', nullable: true },
    jobTitle: { type: 'string', nullable: true },
    softSignals: { type: 'array', items: { type: 'string' } }
  },
  required: ['cvSkills', 'jdRequired', 'jdPreferred', 'softSignals']
};

const scoreSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    breakdown: {
      type: 'object',
      properties: {
        hardSkills: { type: 'number' },
        softSignals: { type: 'number' },
        experience: { type: 'number' },
        education: { type: 'number' },
        cultureFit: { type: 'number' },
        growthSignal: { type: 'number' }
      },
      required: ['hardSkills', 'softSignals', 'experience', 'education', 'cultureFit', 'growthSignal']
    },
    reasoning: { type: 'string' }
  },
  required: ['score', 'breakdown', 'reasoning']
};

const refinementsSchema = {
  type: 'object',
  properties: {
    refinements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...AI_REFINEMENT_KINDS] },
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

const summarySchema = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary']
};

// ---- helpers ------------------------------------------------------------

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function clampScore(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(100, v));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normaliseExtraction(raw: Partial<AiExtraction>): AiExtraction {
  const seniority = typeof raw.seniority === 'string' &&
    (SENIORITY_ENUM as readonly string[]).includes(raw.seniority)
      ? (raw.seniority as AiExtraction['seniority'])
      : null;
  return {
    cvSkills: asStringArray(raw.cvSkills),
    jdRequired: asStringArray(raw.jdRequired),
    jdPreferred: asStringArray(raw.jdPreferred),
    jdYearsRequired: typeof raw.jdYearsRequired === 'number' && Number.isFinite(raw.jdYearsRequired)
      ? Math.max(0, Math.round(raw.jdYearsRequired))
      : null,
    seniority,
    industry: typeof raw.industry === 'string' && raw.industry.trim() ? raw.industry.trim() : null,
    jobTitle: typeof raw.jobTitle === 'string' && raw.jobTitle.trim() ? raw.jobTitle.trim() : null,
    softSignals: asStringArray(raw.softSignals)
  };
}

function normaliseScore(raw: Partial<AiScoreResult>): AiScoreResult {
  const b = (raw.breakdown ?? {}) as Partial<AiScoreBreakdown>;
  return {
    score: clampScore(raw.score),
    breakdown: {
      hardSkills: clamp01(b.hardSkills),
      softSignals: clamp01(b.softSignals),
      experience: clamp01(b.experience),
      education: clamp01(b.education),
      cultureFit: clamp01(b.cultureFit),
      growthSignal: clamp01(b.growthSignal)
    },
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.trim() : ''
  };
}

function normaliseRefinements(raw: { refinements?: unknown } | null | undefined): AiRefinement[] {
  if (!raw || !Array.isArray(raw.refinements)) return [];
  const allowedSev = new Set(['high', 'medium', 'low']);
  const allowedKinds = new Set<string>(AI_REFINEMENT_KINDS);
  const out: AiRefinement[] = [];
  for (const r of raw.refinements) {
    if (!r || typeof r !== 'object') continue;
    const item = r as Record<string, unknown>;
    const kind = typeof item.kind === 'string' && allowedKinds.has(item.kind)
      ? (item.kind as AiRefinementKind)
      : null;
    const severity = typeof item.severity === 'string' && allowedSev.has(item.severity)
      ? (item.severity as AiRefinement['severity'])
      : null;
    const message = typeof item.message === 'string' ? item.message.trim() : '';
    const reasoning = typeof item.reasoning === 'string' ? item.reasoning.trim() : '';
    if (!kind || !severity || !message) continue;
    out.push({
      kind,
      severity,
      message,
      reasoning,
      skill: typeof item.skill === 'string' && item.skill.trim() ? item.skill.trim() : undefined
    });
  }
  // Cap at 8 — anything more than that and the UI gets noisy.
  return out.slice(0, 8);
}

// ---- aiExtract ----------------------------------------------------------

export async function aiExtract(
  cvText: string,
  jdText: string,
  jobTitle?: string
): Promise<AiCallResult<AiExtraction>> {
  if (!cvText.trim() || !jdText.trim()) return null;

  const prompt = [
    SYSTEM_PREAMBLE,
    '',
    'Extract structured signals from the CV and JD below. Return JSON matching the schema.',
    'Rules:',
    '  - cvSkills: technologies, tools, methodologies that ACTUALLY appear in the CV.',
    '  - jdRequired vs jdPreferred: split based on language ("must have", "required", "essential" => required;',
    '    "nice to have", "preferred", "bonus" => preferred). When unclear, default to required.',
    '  - jdYearsRequired: integer years of experience the JD asks for, or null if not stated.',
    '  - seniority: one of intern|junior|mid|senior|lead|principal, or null when not signalled.',
    '  - industry: short label e.g. "fintech", "energy", "logistics", "edtech", or null.',
    '  - jobTitle: the canonical title from the JD (or the supplied hint), or null.',
    '  - softSignals: 3-8 short phrases (e.g. "stakeholder management", "startup builder",',
    '    "ownership mindset") inferred from the CV. Phrases must be defensible from CV content.',
    '',
    jobTitle ? `Hint — caller-supplied job title: ${jobTitle}` : '',
    '',
    `CV:\n${clip(cvText)}`,
    '',
    `JD:\n${clip(jdText)}`
  ].filter(Boolean).join('\n');

  const result = await aiJson<Partial<AiExtraction>>(prompt, extractionSchema, {
    maxTokens: 1024,
    temperature: 0.3
  });
  if (!result) return null;
  return {
    data: normaliseExtraction(result.data ?? {}),
    tokensUsed: result.tokensUsed,
    cached: result.cached
  };
}

// ---- aiScore ------------------------------------------------------------

export async function aiScore(
  cvText: string,
  jdText: string,
  extraction: AiExtraction
): Promise<AiCallResult<AiScoreResult>> {
  if (!cvText.trim() || !jdText.trim()) return null;

  const prompt = [
    SYSTEM_PREAMBLE,
    '',
    'Score the candidate against the JD. Return JSON matching the schema.',
    'The "score" is an integer 0..100. The "breakdown" has six axes each in 0..1:',
    '  - hardSkills: coverage of required technical/tool skills.',
    '  - softSignals: alignment of the soft signals (leadership, ownership, etc.).',
    '  - experience: years + relevance of past roles vs JD asks.',
    '  - education: programme + level alignment with JD requirements.',
    '  - cultureFit: alignment with team / industry signals (Ghana/UENR context welcome).',
    '  - growthSignal: trajectory — promotions, scope expansion, side projects, etc.',
    'Then provide "reasoning" — at most 120 words explaining the breakdown in plain English.',
    'Be honest. If the candidate is a poor match, say so. Never inflate to be encouraging.',
    '',
    'Pre-extracted context (use these — do not re-extract):',
    JSON.stringify({
      cvSkills: extraction.cvSkills,
      jdRequired: extraction.jdRequired,
      jdPreferred: extraction.jdPreferred,
      jdYearsRequired: extraction.jdYearsRequired,
      seniority: extraction.seniority,
      industry: extraction.industry,
      jobTitle: extraction.jobTitle,
      softSignals: extraction.softSignals
    }),
    '',
    `CV:\n${clip(cvText)}`,
    '',
    `JD:\n${clip(jdText)}`
  ].join('\n');

  const result = await aiJson<Partial<AiScoreResult>>(prompt, scoreSchema, {
    maxTokens: 1024,
    temperature: 0.3
  });
  if (!result) return null;
  return {
    data: normaliseScore(result.data ?? {}),
    tokensUsed: result.tokensUsed,
    cached: result.cached
  };
}

// ---- aiRefinements ------------------------------------------------------

export async function aiRefinements(
  cvText: string,
  jdText: string,
  extraction: AiExtraction
): Promise<AiCallResult<AiRefinement[]>> {
  if (!cvText.trim() || !jdText.trim()) return null;

  // Derive the gap signals from the extraction so the model focuses on the
  // right things. Lowercase comparison so "JavaScript" vs "javascript"
  // doesn't false-positive as missing.
  const cvSkillSet = new Set(extraction.cvSkills.map((s) => s.toLowerCase()));
  const missingSkills = extraction.jdRequired.filter((s) => !cvSkillSet.has(s.toLowerCase()));
  const weakSignals = extraction.softSignals.length === 0
    ? ['no soft signals detected']
    : [];

  const prompt = [
    SYSTEM_PREAMBLE,
    '',
    'Generate AT MOST 8 specific, actionable refinements grounded in the candidate\'s actual CV.',
    'Each refinement must:',
    '  - reference a concrete bullet, section, or skill,',
    '  - never invent experience or skills the candidate doesn\'t have,',
    '  - include "reasoning" (≤40 words) explaining why it matters for THIS JD.',
    '',
    'Severity guide:',
    '  - high: required-skill gap, large experience gap, missing critical credential.',
    '  - medium: weak coverage of an important skill, missing quantification, summary mismatch.',
    '  - low: ordering/cosmetic tweaks.',
    '',
    'Set "skill" when the refinement is anchored to a specific skill name.',
    `Pre-detected missing required skills: [${missingSkills.join(', ') || 'none'}].`,
    `Pre-detected weak signals: [${weakSignals.join(', ') || 'none'}].`,
    '',
    'Pre-extracted context:',
    JSON.stringify({
      cvSkills: extraction.cvSkills,
      jdRequired: extraction.jdRequired,
      jdPreferred: extraction.jdPreferred,
      seniority: extraction.seniority,
      industry: extraction.industry,
      jobTitle: extraction.jobTitle
    }),
    '',
    `CV:\n${clip(cvText)}`,
    '',
    `JD:\n${clip(jdText)}`
  ].join('\n');

  const result = await aiJson<{ refinements?: unknown }>(prompt, refinementsSchema, {
    maxTokens: 1024,
    temperature: 0.5
  });
  if (!result) return null;
  return {
    data: normaliseRefinements(result.data ?? {}),
    tokensUsed: result.tokensUsed,
    cached: result.cached
  };
}

// ---- aiSummary ----------------------------------------------------------

const TONE_GUIDANCE: Record<'confident' | 'warm' | 'direct', string> = {
  confident: 'Use a confident, achievement-led voice that leads with results.',
  warm: 'Use a warm, collaborative voice that highlights teamwork and impact.',
  direct: 'Use a direct, no-fluff voice that names skills and outcomes plainly.'
};

export async function aiSummary(
  cvText: string,
  jdText: string,
  tone: 'confident' | 'warm' | 'direct'
): Promise<AiCallResult<AiSummary>> {
  if (!cvText.trim() || !jdText.trim()) return null;

  const prompt = [
    SYSTEM_PREAMBLE,
    '',
    'Write a tailored CV summary (2-3 sentences, ≤80 words total) for this candidate applying to the JD.',
    'Anchor every claim in concrete elements from the CV that align with the JD.',
    'Never invent experience, skills, or credentials.',
    TONE_GUIDANCE[tone],
    'Return JSON matching the schema with the summary in the "summary" field.',
    '',
    `CV:\n${clip(cvText)}`,
    '',
    `JD:\n${clip(jdText)}`
  ].join('\n');

  const result = await aiJson<Partial<AiSummary>>(prompt, summarySchema, {
    maxTokens: 1024,
    temperature: 0.5
  });
  if (!result) return null;
  return {
    data: { summary: typeof result.data?.summary === 'string' ? result.data.summary.trim() : '' },
    tokensUsed: result.tokensUsed,
    cached: result.cached
  };
}
