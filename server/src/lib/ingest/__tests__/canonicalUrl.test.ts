// server/src/lib/ingest/__tests__/canonicalUrl.test.ts
import { describe, it, expect } from 'bun:test';
import { canonicalUrl } from '../canonicalUrl.js';

describe('canonicalUrl', () => {
  it('lowercases host, drops fragment, drops trailing slash', () => {
    expect(canonicalUrl('HTTPS://Example.COM/path/#section'))
      .toBe('https://example.com/path');
  });

  it('strips common tracking params but keeps others', () => {
    expect(canonicalUrl('https://example.com/x?utm_source=twitter&id=42'))
      .toBe('https://example.com/x?id=42');
  });

  it('keeps query-only URLs intact when no tracking params present', () => {
    expect(canonicalUrl('https://example.com/x?page=2'))
      .toBe('https://example.com/x?page=2');
  });

  it('handles root path without dropping anything', () => {
    expect(canonicalUrl('https://example.com/'))
      .toBe('https://example.com');
  });

  it('returns empty string on invalid URL rather than throwing', () => {
    expect(canonicalUrl('not a url')).toBe('');
  });

  it('rejects non-http(s) schemes', () => {
    expect(canonicalUrl('ftp://example.com/x')).toBe('');
    expect(canonicalUrl('javascript:alert(1)')).toBe('');
  });
});
