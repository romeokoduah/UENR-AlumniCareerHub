// server/src/lib/ingest/__tests__/classify.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { classifyScholarship } from '../classify.js';
import type { RawScholarship } from '../types.js';

describe('classifyScholarship', () => {
  const raw: RawScholarship = {
    title: 'Chevening Scholarship',
    description: 'Fully funded UK masters for mid-career professionals.',
    applicationUrl: 'https://chevening.org/apply',
    deadlineText: 'Applications close 2 November 2026'
  };

  it('passes through a well-formed classifier JSON response', async () => {
    const aiJson = mock(async () => ({
      data: {
        isScholarship: 0.95,
        category: { field: 'Other', region: 'Global', funding: 'Full funding' },
        deadline: { kind: 'date', iso: '2026-11-02' },
        reasoning: 'Clear scholarship announcement with dates.'
      },
      tokensUsed: 250,
      cached: false,
      provider: 'groq' as const
    }));
    const res = await classifyScholarship(raw, aiJson);
    expect(res).not.toBeNull();
    expect(res!.isScholarship).toBe(0.95);
    expect(res!.category.region).toBe('Global');
    expect(res!.deadline).toEqual({ kind: 'date', iso: '2026-11-02' });
  });

  it('returns null when the AI returns null', async () => {
    const aiJson = mock(async () => null);
    expect(await classifyScholarship(raw, aiJson)).toBeNull();
  });

  it('clamps isScholarship into [0,1] and defaults missing fields to null', async () => {
    const aiJson = mock(async () => ({
      data: { isScholarship: 1.5, category: {}, deadline: { kind: 'unknown' } },
      tokensUsed: 100,
      cached: false,
      provider: 'groq' as const
    }));
    const res = await classifyScholarship(raw, aiJson);
    expect(res!.isScholarship).toBe(1);
    expect(res!.category.field).toBeNull();
    expect(res!.category.region).toBeNull();
    expect(res!.category.funding).toBeNull();
    expect(res!.deadline).toEqual({ kind: 'unknown' });
  });

  it('rejects invalid deadline.kind by falling back to unknown', async () => {
    const aiJson = mock(async () => ({
      data: { isScholarship: 0.9, category: {}, deadline: { kind: 'bogus' } },
      tokensUsed: 10, cached: false, provider: 'groq' as const
    }));
    const res = await classifyScholarship(raw, aiJson);
    expect(res!.deadline).toEqual({ kind: 'unknown' });
  });
});
