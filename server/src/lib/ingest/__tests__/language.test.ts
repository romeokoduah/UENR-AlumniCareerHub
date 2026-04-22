// server/src/lib/ingest/__tests__/language.test.ts
import { describe, it, expect } from 'bun:test';
import { isEnglish } from '../language.js';

describe('isEnglish', () => {
  it('accepts English prose', () => {
    expect(isEnglish('Chevening is a fully-funded Masters scholarship.')).toBe(true);
  });

  it('rejects CJK content', () => {
    expect(isEnglish('这是一个奖学金 for students. 申请截止日期。')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isEnglish('')).toBe(false);
  });

  it('accepts English with moderate punctuation and numbers', () => {
    expect(isEnglish('Deadline: 2026-09-30. Awards up to £100,000.')).toBe(true);
  });

  it('rejects mostly-emoji text', () => {
    expect(isEnglish('🎓🎓🎓🎓🎓🎓 apply now 🎓')).toBe(false);
  });
});
