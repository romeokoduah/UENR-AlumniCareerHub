// AI provider failover layer.
//
// Try Groq first (free-tier 14,400 req/day, sub-second, doesn't train on
// inputs). Fall through to Gemini (250 req/day free tier, only used when
// Groq is rate-limited or unavailable). Each surface in the codebase
// imports from here instead of calling the providers directly.

import { groqChat, groqJson, isGroqEnabled, getLastGroqError } from './groq.js';
import { geminiChat, geminiJson, isAiEnabled as isGeminiEnabled, getLastGeminiError } from './gemini.js';

export type AiChatTurn = { role: 'user' | 'assistant'; content: string };

export type AiChatResult = {
  text: string;
  tokensUsed: number;
  provider: 'groq' | 'gemini';
} | null;

export type AiJsonResult<T> = {
  data: T;
  tokensUsed: number;
  cached: boolean;
  provider: 'groq' | 'gemini';
} | null;

let lastAiError: string | null = null;
export function getLastAiError(): string | null {
  return lastAiError;
}

export async function isAnyProviderEnabled(): Promise<boolean> {
  if (isGroqEnabled()) return true;
  return await isGeminiEnabled();
}

export async function aiChat(
  systemPrompt: string,
  history: AiChatTurn[],
  userMessage: string,
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<AiChatResult> {
  lastAiError = null;

  if (isGroqEnabled()) {
    const groq = await groqChat(systemPrompt, history, userMessage, opts);
    if (groq) return { ...groq, provider: 'groq' };
    lastAiError = `groq: ${getLastGroqError() ?? 'unknown'}`;
  }

  if (await isGeminiEnabled()) {
    const gemini = await geminiChat(systemPrompt, history, userMessage, {
      model: opts.model,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens
    });
    if (gemini) return { ...gemini, provider: 'gemini' };
    const geminiErr = getLastGeminiError();
    lastAiError = lastAiError
      ? `${lastAiError} | gemini: ${geminiErr ?? 'unknown'}`
      : `gemini: ${geminiErr ?? 'unknown'}`;
  }

  return null;
}

export async function aiJson<T>(
  prompt: string,
  schemaShape: object,
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<AiJsonResult<T>> {
  lastAiError = null;

  if (isGroqEnabled()) {
    const groq = await groqJson<T>(prompt, schemaShape, opts);
    if (groq) return { ...groq, provider: 'groq' };
    lastAiError = `groq: ${getLastGroqError() ?? 'unknown'}`;
  }

  if (await isGeminiEnabled()) {
    const gemini = await geminiJson<T>(prompt, schemaShape, {
      model: opts.model,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens
    });
    if (gemini) return { ...gemini, provider: 'gemini' };
    const geminiErr = getLastGeminiError();
    lastAiError = lastAiError
      ? `${lastAiError} | gemini: ${geminiErr ?? 'unknown'}`
      : `gemini: ${geminiErr ?? 'unknown'}`;
  }

  return null;
}
