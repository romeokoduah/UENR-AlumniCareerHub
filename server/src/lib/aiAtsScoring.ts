// AI-driven ATS scoring (v2). Sits ON TOP of the deterministic
// scorer in ./atsScoring.ts — the v1 score is the source of truth and
// is always computed at apply-time. This module produces a richer
// score + breakdown + strengths + concerns snapshot via Gemini, stored
// once on the Application row so recruiter views are token-free.
//
// Behaviour contract (very important):
//   - We NEVER throw. On AI disabled / quota / rate-limit / parse failure
//     we return null and the caller falls back to the deterministic score.
//   - Output schema is enforced by Gemini's structured-output mode so
//     the recruiter UI can rely on the shape without runtime validation.
//   - temperature=0.2 — recruiter-grade scoring should be stable across
//     reruns; we want decisions reproducible, not creative.

import { geminiJson } from './gemini.js';

// ---- public types --------------------------------------------------------

export type AiAtsBreakdown = {
  hardSkills: number;
  softSignals: number;
  experience: number;
  education: number;
  cultureFit: number;
  growthSignal: number;
};

export type AiAtsResult = {
  score: number;           // 0-100 integer
  breakdown: AiAtsBreakdown; // each 0..1
  reasoning: string;       // <=120 words
  strengths: string[];     // 3 entries, each <=30 words
  concerns: string[];      // 3 entries, each <=30 words
};

export type AiAtsCandidateContext = {
  programme?: string;
  graduationYear?: number;
  currentRole?: string;
  currentCompany?: string;
  location?: string;
};

export type AiAtsScoreCall = {
  data: AiAtsResult;
  tokensUsed: number;
  cached: boolean;
};

// ---- prompt + schema -----------------------------------------------------

// Cap input sizes so a giant CV or JD can't blow the token budget. Gemini
// 2.5-flash has a generous context window but we still pay (and slow down)
// per token, and the marginal signal past ~6k chars per side is low.
const CV_MAX_CHARS = 6000;
const JD_MAX_CHARS = 6000;

function clip(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

// Gemini structured-output schema. Mirrors AiAtsResult exactly. Note
// that Gemini's responseSchema dialect is OpenAPI-flavoured, so we use
// `type: 'INTEGER'` / `'NUMBER'` / `'STRING'` / `'ARRAY'` / `'OBJECT'`.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    score: {
      type: 'INTEGER',
      description: 'Overall 0-100 fit score. Score conservatively when evidence is thin.'
    },
    breakdown: {
      type: 'OBJECT',
      properties: {
        hardSkills:    { type: 'NUMBER', description: '0..1 — required technical skills coverage' },
        softSignals:   { type: 'NUMBER', description: '0..1 — communication, ownership, collaboration cues' },
        experience:    { type: 'NUMBER', description: '0..1 — years + relevance vs JD level' },
        education:     { type: 'NUMBER', description: '0..1 — programme + credentials fit' },
        cultureFit:    { type: 'NUMBER', description: '0..1 — alignment with company / role context' },
        growthSignal:  { type: 'NUMBER', description: '0..1 — trajectory, learning velocity, initiative' }
      },
      required: ['hardSkills', 'softSignals', 'experience', 'education', 'cultureFit', 'growthSignal']
    },
    reasoning: {
      type: 'STRING',
      description: '<=120 words. Plain prose, no markdown. Why this score, with concrete CV evidence.'
    },
    strengths: {
      type: 'ARRAY',
      description: 'Exactly 3 items. Each <=30 words. Things this candidate uniquely brings.',
      items: { type: 'STRING' }
    },
    concerns: {
      type: 'ARRAY',
      description: 'Exactly 3 items. Each <=30 words. Risks the recruiter should probe in an interview.',
      items: { type: 'STRING' }
    }
  },
  required: ['score', 'breakdown', 'reasoning', 'strengths', 'concerns']
} as const;

function buildPrompt(
  cvText: string,
  jdText: string,
  jobTitle: string,
  ctx?: AiAtsCandidateContext
): string {
  const ctxLines: string[] = [];
  if (ctx?.programme)       ctxLines.push(`Programme: ${ctx.programme}`);
  if (ctx?.graduationYear)  ctxLines.push(`Graduation year: ${ctx.graduationYear}`);
  if (ctx?.currentRole)     ctxLines.push(`Current role: ${ctx.currentRole}`);
  if (ctx?.currentCompany)  ctxLines.push(`Current company: ${ctx.currentCompany}`);
  if (ctx?.location)        ctxLines.push(`Location: ${ctx.location}`);
  const ctxBlock = ctxLines.length ? ctxLines.join('\n') : '(no profile context provided)';

  return [
    'You are a deterministic ATS-style candidate-vs-JD scorer for a Ghanaian university alumni network. Never fabricate experience or credentials. Score conservatively when evidence is thin.',
    '',
    'Output JSON ONLY in the schema you have been given. Constraints:',
    '- score: integer 0-100. Calibrate so 80+ means "shortlist", 60-79 "phone screen", below 60 "likely pass".',
    '- breakdown: each dimension a float 0..1. Round to 2 decimals.',
    '- reasoning: <=120 words, plain prose, no markdown, cite CV evidence.',
    '- strengths: EXACTLY 3 items, each <=30 words, focused on things this candidate uniquely brings.',
    '- concerns: EXACTLY 3 items, each <=30 words, framed as questions / risks the recruiter should probe.',
    '',
    `JOB TITLE: ${jobTitle || '(unspecified)'}`,
    '',
    'CANDIDATE PROFILE CONTEXT:',
    ctxBlock,
    '',
    'JOB DESCRIPTION:',
    '"""',
    clip(jdText, JD_MAX_CHARS),
    '"""',
    '',
    'CANDIDATE CV:',
    '"""',
    clip(cvText, CV_MAX_CHARS),
    '"""'
  ].join('\n');
}

// ---- post-processing -----------------------------------------------------

function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Math.round(v * 100) / 100;
}

function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function trimWords(s: unknown, maxWords: number): string {
  const str = typeof s === 'string' ? s.trim() : String(s ?? '').trim();
  if (!str) return '';
  const words = str.split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ');
}

function ensureThree(list: unknown, maxWords: number): string[] {
  const arr = Array.isArray(list) ? list : [];
  const cleaned = arr
    .map((item) => trimWords(item, maxWords))
    .filter((s) => s.length > 0)
    .slice(0, 3);
  // Pad with neutral placeholders so downstream (UI) can rely on length=3.
  while (cleaned.length < 3) cleaned.push('—');
  return cleaned;
}

function normalise(raw: AiAtsResult): AiAtsResult {
  const b = raw.breakdown ?? ({} as AiAtsBreakdown);
  return {
    score: clampScore(raw.score),
    breakdown: {
      hardSkills:   clamp01(b.hardSkills),
      softSignals:  clamp01(b.softSignals),
      experience:   clamp01(b.experience),
      education:    clamp01(b.education),
      cultureFit:   clamp01(b.cultureFit),
      growthSignal: clamp01(b.growthSignal)
    },
    reasoning: trimWords(raw.reasoning, 120),
    strengths: ensureThree(raw.strengths, 30),
    concerns:  ensureThree(raw.concerns, 30)
  };
}

// ---- public entrypoint ---------------------------------------------------

export async function aiScoreApplication(
  cvText: string,
  jdText: string,
  jobTitle: string,
  candidateContext?: AiAtsCandidateContext
): Promise<AiAtsScoreCall | null> {
  // Defensive — without at least some CV + JD signal there's nothing to
  // score. Skip silently rather than burning a Gemini call on noise.
  if (!cvText?.trim() || !jdText?.trim()) return null;

  const prompt = buildPrompt(cvText, jdText, jobTitle, candidateContext);

  const out = await geminiJson<AiAtsResult>(prompt, RESPONSE_SCHEMA, {
    temperature: 0.2,
    maxOutputTokens: 1024
  });

  if (!out) return null; // disabled / rate-limited / parse failure

  return {
    data: normalise(out.data),
    tokensUsed: out.tokensUsed,
    cached: out.cached
  };
}
