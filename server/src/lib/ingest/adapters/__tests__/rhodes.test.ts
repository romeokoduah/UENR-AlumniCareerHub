import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRhodesHtml } from '../rhodes.js';

describe('parseRhodesHtml', () => {
  const html = readFileSync(
    join(import.meta.dir, '../../../../../test/fixtures/ingest/rhodes.html'),
    'utf8'
  );

  it('extracts at least 1 scholarship with title + applicationUrl', () => {
    const items = parseRhodesHtml(html);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(3);
      expect(item.applicationUrl).toMatch(/^https?:\/\//);
    }
  });

  it('every extracted item has a providerName', () => {
    const items = parseRhodesHtml(html);
    for (const item of items) {
      expect(item.providerName).toBe('Rhodes Trust');
    }
  });
});
