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

import { GoogleGenerativeAI } from '@google/generative-ai';
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

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1024;
const TIMEOUT_MS = 6000;

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

async function attemptOnce<T>(
  client: GoogleGenerativeAI,
  prompt: string,
  schemaShape: object,
  model: string,
  temperature: number,
  maxOutputTokens: number
): Promise<GeminiAttempt<T>> {
  const generative = client.getGenerativeModel({
    model,
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      // The Gemini SDK types `responseSchema` as a tagged ResponseSchema
      // object, but in practice it accepts a plain JSON-Schema-shaped object
      // (which is what every prompt in this repo passes). The cast keeps
      // strict TS happy without forcing every caller to import SchemaType.
      responseSchema: schemaShape as never
    }
  });

  const result = await generative.generateContent(prompt);
  const text = result.response.text();
  const tokensUsed = result.response.usageMetadata?.totalTokenCount ?? 0;
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

  const client = new GoogleGenerativeAI(apiKey);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await withTimeout(
        attemptOnce<T>(client, prompt, schemaShape, model, temperature, maxOutputTokens),
        TIMEOUT_MS
      );
      cacheSet(cacheKey, out.data);
      console.log(`[gemini] tokens=${out.tokensUsed} cached=false model=${model}`);
      return { data: out.data, tokensUsed: out.tokensUsed, cached: false };
    } catch (err) {
      const last = attempt === 1;
      if (last || !isTransient(err)) {
        console.warn(`[gemini] failed (${(err as Error).message}) — returning null`);
        return null;
      }
      // brief backoff before retry — ~250ms is enough to dodge most blips
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}
