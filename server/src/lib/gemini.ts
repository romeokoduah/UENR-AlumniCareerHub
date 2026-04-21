// Thin wrapper around Google Gemini 2.0 Flash for the CV Match v2 AI
// surface. The rest of the codebase ONLY talks to Gemini through this file
// so the timeout / retry / cache / cost-tracking story is in one place.
//
// Behavior contract:
//   - If GOOGLE_GEMINI_API_KEY is missing OR the cv-match-ai-enabled feature
//     flag is false, every call short-circuits and returns null. Callers are
//     responsible for translating null into a graceful "{ enabled: false }"
//     response so the deterministic v1 path keeps working unchanged.
//   - JSON-only output via Gemini's structured-output mode. We pass the
//     caller's `schemaShape` straight through as `responseSchema`.
//   - 6s timeout per attempt, one retry on 5xx / network blips, then null.
//   - 24h in-memory cache keyed on (prompt, model, temperature).

// We talk to Gemini's REST API directly via fetch instead of going
// through @google/generative-ai. The legacy SDK (0.24.x) doesn't
// cleanly handle gemini-2.5-flash's "thinking" tokens, returning empty
// text() in some cases — direct fetch sidesteps the issue entirely.
import { prisma } from './prisma.js';
import { cacheGet, cacheSet, cacheKeyFor } from './aiCache.js';

// ---- types ---------------------------------------------------------------

export type GeminiOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  cacheKey?: string;
};

export type GeminiResult<T> = {
  data: T;
  tokensUsed: number;
  cached: boolean;
} | null;

// Last error message from the most recent geminiJson call. Exposed so
// route handlers can include it in `{enabled:false, debug:lastGeminiError}`
// while we debug the live integration.
let lastGeminiError: string | null = null;
export function getLastGeminiError(): string | null {
  return lastGeminiError;
}

// Free-tier API keys created in late 2025 / early 2026 are gated to
// gemini-2.5-flash (gemini-2.0-flash returns "limit: 0" 429s for new
// projects). 2.5-flash is slower per-token because of its thinking
// budget but more capable per-token, and the free tier still covers
// our scale (~250 RPD, 250k TPM).
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1024;
const TIMEOUT_MS = 12000;

// ---- feature-flag / env gating -------------------------------------------

// Cache the SiteContent flag lookup briefly so a burst of AI calls in the
// same request doesn't fan out to N separate `findUnique` reads. 30 seconds
// is short enough that toggling the flag in /admin still feels instant.
let flagCache: { value: boolean; expiresAt: number } | null = null;
const FLAG_CACHE_MS = 30 * 1000;

async function readAiFeatureFlag(): Promise<boolean> {
  const now = Date.now();
  if (flagCache && flagCache.expiresAt > now) return flagCache.value;
  let enabled = true; // fail-open — default-on if SiteContent missing
  try {
    const row = await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } });
    const data = (row?.data ?? {}) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(data, 'cv-match-ai-enabled')) {
      enabled = data['cv-match-ai-enabled'] !== false;
    }
  } catch {
    // DB hiccup — keep AI on rather than silently disabling it.
    enabled = true;
  }
  flagCache = { value: enabled, expiresAt: now + FLAG_CACHE_MS };
  return enabled;
}

export async function isAiEnabled(): Promise<boolean> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) return false;
  return await readAiFeatureFlag();
}

// ---- core call -----------------------------------------------------------

function isTransient(err: unknown): boolean {
  // Retry on network blips and Gemini's 5xx responses. We don't bother
  // parsing the error shape too rigidly — if in doubt, retry once.
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) return true;
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg)) return true;
  if (/\b5\d\d\b/.test(msg)) return true;
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`gemini timeout after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

type GeminiAttempt<T> = { data: T; tokensUsed: number };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function attemptOnce<T>(
  apiKey: string,
  prompt: string,
  schemaShape: object,
  model: string,
  temperature: number,
  maxOutputTokens: number
): Promise<GeminiAttempt<T>> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: schemaShape,
      // gemini-2.5-flash counts thinking tokens against maxOutputTokens
      // by default, which truncates the actual JSON answer. Set the
      // thinking budget to 0 so the entire output budget goes to the
      // user-visible response. Older models (1.5/2.0) ignore this field.
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { totalTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`gemini blocked: ${json.promptFeedback.blockReason}`);
  }

  // Concatenate every text part across every candidate (2.5-flash can
  // emit multiple parts when thinking is on; we only care about the
  // visible text, which is the JSON answer we asked for).
  const text = (json.candidates ?? [])
    .flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  const tokensUsed = json.usageMetadata?.totalTokenCount ?? 0;

  if (!text) {
    const finish = json.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`gemini returned empty text (finishReason=${finish})`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`gemini returned non-JSON: ${(e as Error).message}`);
  }
  return { data: parsed, tokensUsed };
}

export async function geminiJson<T>(
  prompt: string,
  schemaShape: object,
  opts: GeminiOptions = {}
): Promise<GeminiResult<T>> {
  if (!(await isAiEnabled())) return null;

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  const maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

  const cacheKey = opts.cacheKey ?? cacheKeyFor(prompt, model, temperature);
  const cached = cacheGet<T>(cacheKey);
  if (cached !== undefined) {
    console.log(`[gemini] tokens=0 cached=true model=${model}`);
    return { data: cached, tokensUsed: 0, cached: true };
  }

  lastGeminiError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await withTimeout(
        attemptOnce<T>(apiKey, prompt, schemaShape, model, temperature, maxOutputTokens),
        TIMEOUT_MS
      );
      cacheSet(cacheKey, out.data);
      console.log(`[gemini] tokens=${out.tokensUsed} cached=false model=${model}`);
      return { data: out.data, tokensUsed: out.tokensUsed, cached: false };
    } catch (err) {
      const msg = (err as Error).message;
      lastGeminiError = `attempt ${attempt + 1}: ${msg}`;
      const last = attempt === 1;
      if (last || !isTransient(err)) {
        console.warn(`[gemini] failed (${msg}) — returning null`);
        return null;
      }
      // brief backoff before retry — ~250ms is enough to dodge most blips
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}

// =========================================================================
// geminiChat — plain-text conversational call. Used by CareerMate, the
// CV reviewer, and the mock interviewer (none of which want structured
// JSON; they want natural language back).
// =========================================================================

export type GeminiChatTurn = { role: 'user' | 'assistant'; content: string };

export type GeminiChatResult = {
  text: string;
  tokensUsed: number;
} | null;

export async function geminiChat(
  systemPrompt: string,
  history: GeminiChatTurn[],
  userMessage: string,
  opts: { model?: string; temperature?: number; maxOutputTokens?: number } = {}
): Promise<GeminiChatResult> {
  if (!(await isAiEnabled())) return null;
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.7;
  const maxOutputTokens = opts.maxOutputTokens ?? 1024;

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  // Gemini wants alternating user / model turns. Map our history shape
  // ('assistant' -> 'model') and append the new user message.
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    })),
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const body = {
    contents,
    systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }),
        TIMEOUT_MS
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`gemini ${res.status}: ${errText.slice(0, 300)}`);
      }

      const json = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        usageMetadata?: { totalTokenCount?: number };
        promptFeedback?: { blockReason?: string };
      };

      if (json.promptFeedback?.blockReason) {
        throw new Error(`gemini blocked: ${json.promptFeedback.blockReason}`);
      }

      const text = (json.candidates ?? [])
        .flatMap((c) => c.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();
      const tokensUsed = json.usageMetadata?.totalTokenCount ?? 0;

      if (!text) {
        const finish = json.candidates?.[0]?.finishReason ?? 'unknown';
        throw new Error(`gemini empty (finishReason=${finish})`);
      }

      console.log(`[gemini] chat tokens=${tokensUsed} model=${model}`);
      return { text, tokensUsed };
    } catch (err) {
      const msg = (err as Error).message;
      const last = attempt === 1;
      if (last || !isTransient(err)) {
        console.warn(`[gemini] chat failed (${msg}) — returning null`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}
