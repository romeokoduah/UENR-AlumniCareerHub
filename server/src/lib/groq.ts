// Groq adapter — same interface as lib/gemini's geminiChat / geminiJson
// so the rest of the codebase can swap providers transparently. Used as
// the primary AI provider with Gemini as fallback (see lib/aiProvider.ts).
//
// Why Groq is primary: 14,400 req/day on the free tier (vs Gemini's
// 250), no card required, doesn't train on inputs (open-weight Llama),
// and sub-second inference. OpenAI-compatible REST API.

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 12_000;

export type GroqChatTurn = { role: 'user' | 'assistant'; content: string };
export type GroqChatResult = { text: string; tokensUsed: number } | null;
export type GroqJsonResult<T> = { data: T; tokensUsed: number; cached: false } | null;

let lastGroqError: string | null = null;
export function getLastGroqError(): string | null {
  return lastGroqError;
}

export function isGroqEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) return true;
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg)) return true;
  if (/\b5\d\d\b/.test(msg)) return true;
  // Retry once on Groq's specific 429 too — its rate limit is per-second,
  // a 250ms backoff often clears it.
  if (/\b429\b/.test(msg)) return true;
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`groq timeout after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { total_tokens?: number };
  error?: { message?: string; type?: string };
};

async function callGroqChat(
  apiKey: string,
  body: object
): Promise<ChatCompletionResponse> {
  const res = await withTimeout(
    fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }),
    TIMEOUT_MS
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`groq ${res.status}: ${errText.slice(0, 300)}`);
  }
  return await res.json() as ChatCompletionResponse;
}

// =========================================================================
// groqChat — plain-text conversational call (CareerMate, mock interviewer,
// CV reviewer).
// =========================================================================

export async function groqChat(
  systemPrompt: string,
  history: GroqChatTurn[],
  userMessage: string,
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<GroqChatResult> {
  lastGroqError = null;
  if (!isGroqEnabled()) {
    lastGroqError = 'groq early-return: GROQ_API_KEY missing';
    return null;
  }

  const apiKey = process.env.GROQ_API_KEY!;
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.7;
  const max_tokens = opts.maxTokens ?? 1024;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: userMessage }
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await callGroqChat(apiKey, { model, messages, temperature, max_tokens });
      const text = (json.choices?.[0]?.message?.content ?? '').trim();
      const tokensUsed = json.usage?.total_tokens ?? 0;
      if (!text) {
        throw new Error(`groq empty (finish=${json.choices?.[0]?.finish_reason ?? 'unknown'})`);
      }
      console.log(`[groq] chat tokens=${tokensUsed} model=${model}`);
      return { text, tokensUsed };
    } catch (err) {
      const msg = (err as Error).message;
      lastGroqError = `groq chat attempt ${attempt + 1}: ${msg}`;
      const last = attempt === 1;
      if (last || !isTransient(err)) {
        console.warn(`[groq] chat failed (${msg}) — returning null`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}

// =========================================================================
// groqJson — structured-output call. Uses OpenAI-compatible
// response_format: { type: 'json_object' } + a schema-aware system prompt.
// Llama 3.1 doesn't enforce a JSON schema like Gemini's responseSchema does,
// so we lean on the prompt to describe the shape and validate downstream.
// =========================================================================

export async function groqJson<T>(
  prompt: string,
  schemaShape: object,
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<GroqJsonResult<T>> {
  lastGroqError = null;
  if (!isGroqEnabled()) {
    lastGroqError = 'groq early-return: GROQ_API_KEY missing';
    return null;
  }

  const apiKey = process.env.GROQ_API_KEY!;
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.3;
  const max_tokens = opts.maxTokens ?? 1024;

  // Llama is generally good at following schema-described prompts, but
  // we belt-and-braces by prepending the schema as a system instruction.
  const systemPrompt = [
    'You are a deterministic JSON-only API. Reply with a single JSON object that conforms to the schema below.',
    'Do NOT include any prose, markdown, or commentary outside the JSON.',
    '',
    'JSON schema:',
    JSON.stringify(schemaShape, null, 2)
  ].join('\n');

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_tokens,
    response_format: { type: 'json_object' as const }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await callGroqChat(apiKey, body);
      const text = (json.choices?.[0]?.message?.content ?? '').trim();
      const tokensUsed = json.usage?.total_tokens ?? 0;
      if (!text) {
        throw new Error(`groq json empty (finish=${json.choices?.[0]?.finish_reason ?? 'unknown'})`);
      }
      let parsed: T;
      try {
        parsed = JSON.parse(text) as T;
      } catch (e) {
        throw new Error(`groq returned non-JSON: ${(e as Error).message}`);
      }
      console.log(`[groq] json tokens=${tokensUsed} model=${model}`);
      return { data: parsed, tokensUsed, cached: false };
    } catch (err) {
      const msg = (err as Error).message;
      lastGroqError = `groq json attempt ${attempt + 1}: ${msg}`;
      const last = attempt === 1;
      if (last || !isTransient(err)) {
        console.warn(`[groq] json failed (${msg}) — returning null`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}
