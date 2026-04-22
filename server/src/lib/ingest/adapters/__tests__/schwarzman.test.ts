import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSchwarzmanHtml } from '../schwarzman.js';

describe('parseSchwarzmanHtml', () => {
  const html = readFileSync(
    join(import.meta.dir, '../../../../../test/fixtures/ingest/schwarzman.html'),
    'utf8'
  );

  it('extracts exactly 1 scholarship with title + applicationUrl', () => {
    const items = parseSchwarzmanHtml(html);
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(3);
      expect(item.applicationUrl).toMatch(/^https?:\/\//);
    }
  });

  it('every extracted item has a providerName', () => {
    const items = parseSchwarzmanHtml(html);
    for (const item of items) {
      expect(item.providerName).toBe('Schwarzman Scholars');
    }
  });
});
