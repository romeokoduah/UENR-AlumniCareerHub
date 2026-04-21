// Tiny in-memory LRU cache for AI responses.
//
// Keyed by sha256(prompt + model + temperature). TTL is 24h, capped at 200
// entries — when we hit the cap we evict the oldest insertion (Map preserves
// insertion order natively, so no extra bookkeeping required).
//
// Lives in-process only — Vercel cold starts will lose it, but that's fine:
// the worst case is one extra Gemini call per cold function. We are not
// paying Redis dollars for a v2 nice-to-have.

import { createHash } from 'node:crypto';

type Entry<T> = { value: T; expiresAt: number };

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    // Expired — drop it so a future set can reuse the slot.
    store.delete(key);
    return undefined;
  }
  // Refresh insertion order so genuinely-hot keys live longer than cold ones.
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T): void {
  // If we're full, evict the oldest entry (the first one in insertion order).
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function cacheKeyFor(prompt: string, model: string, temperature: number): string {
  return createHash('sha256')
    .update(`${model}|${temperature}|${prompt}`)
    .digest('hex');
}
