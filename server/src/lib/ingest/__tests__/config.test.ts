import { describe, it, expect } from 'bun:test';
import { VERIFICATION_WEIGHTS, PUBLISH_THRESHOLD, REVIEW_THRESHOLD } from '../config.js';

describe('ingest config', () => {
  it('verification weights sum to 1.0', () => {
    const sum = Object.values(VERIFICATION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it('publish threshold is higher than review threshold', () => {
    expect(PUBLISH_THRESHOLD).toBeGreaterThan(REVIEW_THRESHOLD);
  });

  it('thresholds are in [0, 1]', () => {
    for (const t of [PUBLISH_THRESHOLD, REVIEW_THRESHOLD]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});
