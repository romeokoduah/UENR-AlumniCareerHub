// server/src/lib/ingest/__tests__/verify.test.ts
import { describe, it, expect } from 'bun:test';
import { scoreConfidence, decisionFor } from '../verify.js';
import type { VerificationSignals } from '../types.js';
import { PUBLISH_THRESHOLD, REVIEW_THRESHOLD } from '../config.js';

const allHigh: VerificationSignals = {
  urlReachable: 1, requiredFields: 1, isScholarship: 1,
  deadlineOk: 1, englishContent: 1, categoryExtracted: 1
};
const allLow: VerificationSignals = {
  urlReachable: 0, requiredFields: 0, isScholarship: 0,
  deadlineOk: 0, englishContent: 0, categoryExtracted: 0
};

describe('scoreConfidence', () => {
  it('maxes at 1.0 with all signals high', () => {
    expect(scoreConfidence(allHigh)).toBeCloseTo(1, 6);
  });

  it('floors at 0 with all signals low', () => {
    expect(scoreConfidence(allLow)).toBe(0);
  });

  it('is a linear weighted average', () => {
    const mixed: VerificationSignals = {
      ...allLow, urlReachable: 1, requiredFields: 1, isScholarship: 0.5
    };
    // 0.15 + 0.15 + 0.5*0.30 = 0.45
    expect(scoreConfidence(mixed)).toBeCloseTo(0.45, 6);
  });
});

describe('decisionFor', () => {
  it('publishes at >= PUBLISH_THRESHOLD', () => {
    expect(decisionFor(PUBLISH_THRESHOLD)).toBe('PUBLISHED');
    expect(decisionFor(PUBLISH_THRESHOLD + 0.05)).toBe('PUBLISHED');
  });
  it('reviews in [REVIEW_THRESHOLD, PUBLISH_THRESHOLD)', () => {
    expect(decisionFor(REVIEW_THRESHOLD)).toBe('PENDING_REVIEW');
    expect(decisionFor((PUBLISH_THRESHOLD + REVIEW_THRESHOLD) / 2)).toBe('PENDING_REVIEW');
  });
  it('rejects below REVIEW_THRESHOLD', () => {
    expect(decisionFor(REVIEW_THRESHOLD - 0.01)).toBe('REJECTED');
    expect(decisionFor(0)).toBe('REJECTED');
  });
});
