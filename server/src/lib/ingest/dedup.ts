// server/src/lib/ingest/dedup.ts
import { canonicalUrl } from './canonicalUrl.js';

type ExistingRow = {
  id: string;
  applicationUrl: string;
  provider: string;
  title: string;
};

type Candidate = Pick<ExistingRow, 'applicationUrl' | 'provider' | 'title'>;

// Normalize a token: strip trailing 's' for basic plural stemming,
// and discard 4-digit year tokens (e.g. "2026") which are common suffixes.
function normalizeToken(t: string): string | null {
  if (/^\d{4}$/.test(t)) return null; // drop year-like tokens
  return t.endsWith('s') ? t.slice(0, -1) : t;
}

// Token-set ratio: |A ∩ B| / |A ∪ B| over lowercased, normalized word tokens
// (alphanumeric). Robust to reordering, plural endings, and trailing years.
export function tokenSetRatio(a: string, b: string): number {
  const toks = (s: string): Set<string> => {
    const raw = s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const result = new Set<string>();
    for (const t of raw) {
      const n = normalizeToken(t);
      if (n !== null) result.add(n);
    }
    return result;
  };
  const A = toks(a), B = toks(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function findDuplicate(
  existing: ExistingRow[],
  candidate: Candidate
): ExistingRow | null {
  const canonCand = canonicalUrl(candidate.applicationUrl);
  if (canonCand) {
    for (const r of existing) {
      if (canonicalUrl(r.applicationUrl) === canonCand) return r;
    }
  }
  const provCand = candidate.provider.trim().toLowerCase();
  for (const r of existing) {
    if (r.provider.trim().toLowerCase() !== provCand) continue;
    if (tokenSetRatio(r.title, candidate.title) >= 0.9) return r;
  }
  return null;
}
