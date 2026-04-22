// server/src/lib/ingest/__tests__/dedup.test.ts
import { describe, it, expect } from 'bun:test';
import { findDuplicate, tokenSetRatio } from '../dedup.js';

type Row = { id: string; applicationUrl: string; provider: string; title: string };

const rows: Row[] = [
  { id: 'r1', applicationUrl: 'https://daad.de/apply/x', provider: 'DAAD', title: 'DAAD EPOS Masters' },
  { id: 'r2', applicationUrl: 'https://chevening.org/apply', provider: 'Chevening', title: 'Chevening Scholarship' }
];

describe('tokenSetRatio', () => {
  it('returns 1 for identical token sets', () => {
    expect(tokenSetRatio('foo bar', 'bar foo')).toBe(1);
  });
  it('returns >= 0.9 for minor word additions', () => {
    expect(tokenSetRatio('Chevening Scholarship', 'Chevening Scholarships 2026'))
      .toBeGreaterThanOrEqual(0.9);
  });
  it('returns < 0.9 for unrelated titles', () => {
    expect(tokenSetRatio('Rhodes Scholarship', 'Chevening Masters Award'))
      .toBeLessThan(0.9);
  });
});

describe('findDuplicate', () => {
  it('matches on canonical URL', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://DAAD.de/apply/x?utm_source=tw', provider: 'DAAD', title: 'Totally different title' });
    expect(hit?.id).toBe('r1');
  });

  it('matches on fuzzy title + same provider when URLs differ', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://chevening.org/apply-2026', provider: 'Chevening', title: 'Chevening Scholarships' });
    expect(hit?.id).toBe('r2');
  });

  it('does NOT match on fuzzy title when provider differs', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://x.com/1', provider: 'Cheveningg', title: 'Chevening Scholarship' });
    expect(hit).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://new.com/1', provider: 'New', title: 'New Scholarship' });
    expect(hit).toBeNull();
  });
});
