import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { makeWordPressRssAdapter } from '../_wordpress.js';
import { listAdapters, getAdapter } from '../index.js';

describe('makeWordPressRssAdapter', () => {
  it('fetches and parses a WP-style RSS feed into RawScholarship items', async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item>
          <title>Test Scholarship 2026</title>
          <link>https://provider.test/x</link>
          <description>A fully funded programme.</description>
          <category>masters</category>
          <category>africa</category>
        </item>
      </channel></rss>`;

    // We can't pass fetchFn into the factory (it uses the global fetch in
    // _base.httpGet), so mock global fetch for this test.
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(xml, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml' }
    })) as typeof fetch;

    try {
      const adapter = makeWordPressRssAdapter({
        id: 'test-wp',
        displayName: 'Test WP',
        feedUrl: 'https://provider.test/feed/',
        providerName: 'Test Provider'
      });
      const items = await adapter.fetch();
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('Test Scholarship 2026');
      expect(items[0].applicationUrl).toBe('https://provider.test/x');
      expect(items[0].description).toContain('fully funded');
      expect(items[0].providerName).toBe('Test Provider');
      expect(items[0].tags).toEqual(['masters', 'africa']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('returns empty array when the feed returns non-200', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response('', { status: 500 })) as typeof fetch;
    try {
      const adapter = makeWordPressRssAdapter({
        id: 'test-wp-500', displayName: 'X', feedUrl: 'https://x.test/feed/', providerName: 'X'
      });
      expect(await adapter.fetch()).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('registry: real adapters', () => {
  const prev = process.env.INCLUDE_MOCK_ADAPTER;
  beforeAll(() => { delete process.env.INCLUDE_MOCK_ADAPTER; });
  afterAll(() => {
    if (prev === undefined) delete process.env.INCLUDE_MOCK_ADAPTER;
    else process.env.INCLUDE_MOCK_ADAPTER = prev;
  });

  const expected = [
    'opportunitydesk',
    'scholarshipregion',
    'opportunitiesforafricans',
    'scholars4dev',
    'opportunitiesforyouth'
  ];

  it('registers all 5 real adapters', () => {
    const ids = listAdapters().map((a) => a.id);
    for (const id of expected) expect(ids).toContain(id);
  });

  it('does NOT register _mock when INCLUDE_MOCK_ADAPTER is unset', () => {
    expect(listAdapters().map((a) => a.id)).not.toContain('_mock');
    expect(getAdapter('_mock')).toBeNull();
  });

  it('registers _mock when INCLUDE_MOCK_ADAPTER=1', () => {
    process.env.INCLUDE_MOCK_ADAPTER = '1';
    expect(listAdapters().map((a) => a.id)).toContain('_mock');
    expect(getAdapter('_mock')?.id).toBe('_mock');
    delete process.env.INCLUDE_MOCK_ADAPTER;
  });
});
