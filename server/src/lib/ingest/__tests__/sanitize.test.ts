// server/src/lib/ingest/__tests__/sanitize.test.ts
import { describe, it, expect } from 'bun:test';
import { sanitizeDescription, sanitizeTitle } from '../sanitize.js';

describe('sanitizeTitle', () => {
  it('strips tags and collapses whitespace', () => {
    expect(sanitizeTitle('  <b>Chevening</b>\n\nScholarship  '))
      .toBe('Chevening Scholarship');
  });

  it('clamps to 300 chars', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeTitle(long).length).toBe(300);
  });

  it('strips control chars', () => {
    expect(sanitizeTitle('Scholar\x08shipName')).toBe('ScholarshipName');
  });
});

describe('sanitizeDescription', () => {
  it('strips scripts and event handlers', () => {
    const dirty = '<p>Hello <script>alert(1)</script> world</p><div onclick="x()">bad</div>';
    const clean = sanitizeDescription(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('Hello');
    expect(clean).toContain('world');
  });

  it('clamps to 20000 chars', () => {
    const long = '<p>' + 'a'.repeat(30_000) + '</p>';
    expect(sanitizeDescription(long).length).toBeLessThanOrEqual(20_000);
  });

  it('returns empty string on empty/nullish input', () => {
    expect(sanitizeDescription('')).toBe('');
    expect(sanitizeDescription(null as unknown as string)).toBe('');
  });
});
