import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCommonwealthHtml } from '../commonwealth.js';

describe('parseCommonwealthHtml', () => {
  const html = readFileSync(
    join(import.meta.dir, '../../../../../test/fixtures/ingest/commonwealth.html'),
    'utf8'
  );

  it('extracts at least 1 scholarship with title + applicationUrl', () => {
    const items = parseCommonwealthHtml(html);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(3);
      expect(item.applicationUrl).toMatch(/^https?:\/\//);
    }
  });

  it('every extracted item has a providerName', () => {
    const items = parseCommonwealthHtml(html);
    for (const item of items) {
      expect(item.providerName).toBe('Commonwealth Scholarship Commission');
    }
  });
});
