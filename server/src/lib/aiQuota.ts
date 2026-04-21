// Per-user-per-day quota for AI calls.
//
// The Gemini wrapper already gates on the feature flag + API key; the
// /ai/* routes layer a 5/min express-rate-limit on top. This file adds
// the third leg: a 30-call-per-day ceiling per user, shared across both
// the CV Match v3 engine (action: 'cv_match.ai_call') and the ATS
// recruiter scorer (action: 'ats.ai_call').
//
// We count by reading AuditLog rows — those are written for every
// successful (non-cached) AI call already, so this is "free" telemetry.
// To avoid count-querying on every single AI call, we cache the count
// per user for 60 seconds. A small over/under shoot is fine: this is a
// soft guard, not a hard billing limit.
//
// When over quota, callers should fall through to deterministic logic
// (NOT 429) — the user still gets the tool, just without AI augmentation.

import { prisma } from './prisma.js';

const DAILY_CAP = 30;
const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = { used: number; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

export type QuotaCheck = {
  allowed: boolean;
  used: number;
  cap: number;
};

export async function checkAiQuota(userId: string): Promise<QuotaCheck> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { allowed: cached.used < DAILY_CAP, used: cached.used, cap: DAILY_CAP };
  }

  let used = 0;
  try {
    used = await prisma.auditLog.count({
      where: {
        actorId: userId,
        action: { in: ['cv_match.ai_call', 'ats.ai_call'] },
        createdAt: { gte: startOfTodayUtc() }
      }
    });
  } catch (err) {
    // DB hiccup — fail-open so we don't lock users out of AI on a transient
    // count failure. Worst case is one extra burst of calls before the next
    // count succeeds and the cap kicks back in.
    console.warn('[aiQuota] count failed, allowing through', err);
    used = 0;
  }

  cache.set(userId, { used, expiresAt: now + CACHE_TTL_MS });
  return { allowed: used < DAILY_CAP, used, cap: DAILY_CAP };
}

// Bump the cached count after a successful AI call so we don't have to
// wait for the 60s cache to expire before the next call sees the new
// total. Safe to call even when no entry is cached — it just seeds one.
export function noteAiCallUsed(userId: string, count = 1): void {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    cached.used += count;
  } else {
    // Don't seed a fake "0+count" entry — the next checkAiQuota will
    // do a real count anyway. Just invalidate so we re-read.
    cache.delete(userId);
  }
}
