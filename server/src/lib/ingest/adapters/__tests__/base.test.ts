import { describe, it, expect, mock } from 'bun:test';
import { parseRss, parseHtml, httpGet, robotsAllows } from '../_base.js';

describe('parseRss', () => {
  it('extracts title/link/description from an RSS 2.0 feed', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item>
          <title>DAAD EPOS Masters</title>
          <link>https://daad.de/epos</link>
          <description>Fully funded Masters.</description>
          <pubDate>Mon, 20 Apr 2026 10:00:00 GMT</pubDate>
          <category>masters</category>
        </item>
      </channel></rss>`;
    const items = parseRss(xml);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('DAAD EPOS Masters');
    expect(items[0].link).toBe('https://daad.de/epos');
    expect(items[0].description).toContain('Fully funded');
    expect(items[0].categories).toEqual(['masters']);
  });

  it('extracts from Atom feeds too', () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Chevening 2026</title>
          <link href="https://chevening.org/apply"/>
          <summary>UK masters.</summary>
          <published>2026-04-15T10:00:00Z</published>
        </entry>
      </feed>`;
    const items = parseRss(xml);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Chevening 2026');
    expect(items[0].link).toBe('https://chevening.org/apply');
  });

  it('returns empty array on malformed XML', () => {
    expect(parseRss('not xml')).toEqual([]);
    expect(parseRss('')).toEqual([]);
  });

  it('handles multiple categories', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item>
          <title>X</title><link>https://x.test</link>
          <category>masters</category>
          <category>africa</category>
        </item>
      </channel></rss>`;
    const items = parseRss(xml);
    expect(items[0].categories).toEqual(['masters', 'africa']);
  });
});

describe('parseHtml', () => {
  it('returns a cheerio $ usable for querying', () => {
    const $ = parseHtml('<html><body><h1>Hello</h1><a href="/x">link</a></body></html>');
    expect($('h1').text()).toBe('Hello');
    expect($('a').attr('href')).toBe('/x');
  });
});

describe('httpGet', () => {
  it('returns response body + status on 200', async () => {
    const fakeFetch = mock(async () => new Response('<hello/>', {
      status: 200,
      headers: { 'content-type': 'text/xml' }
    }));
    const r = await httpGet('https://example.com/feed', { fetchFn: fakeFetch });
    expect(r.status).toBe(200);
    expect(r.body).toBe('<hello/>');
  });

  it('passes through a custom User-Agent', async () => {
    let captured: Record<string, string> = {};
    const fakeFetch = mock(async (_url, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      captured = { 'user-agent': h.get('user-agent') ?? '' };
      return new Response('ok', { status: 200 });
    });
    await httpGet('https://example.com/', { fetchFn: fakeFetch });
    expect(captured['user-agent']).toMatch(/UENR/);
  });

  it('returns status + empty body on non-2xx without throwing', async () => {
    const fakeFetch = mock(async () => new Response('nope', { status: 404 }));
    const r = await httpGet('https://example.com/', { fetchFn: fakeFetch });
    expect(r.status).toBe(404);
    expect(r.body).toBe('');
  });
});

describe('robotsAllows', () => {
  it('returns true for paths not blocked by robots.txt', async () => {
    const fakeFetch = mock(async () => new Response(
      'User-agent: *\nDisallow: /admin/\n', { status: 200 }
    ));
    expect(await robotsAllows('https://example.com/public', { fetchFn: fakeFetch })).toBe(true);
  });

  it('returns false for a blocked path', async () => {
    const fakeFetch = mock(async () => new Response(
      'User-agent: *\nDisallow: /blocked/\n', { status: 200 }
    ));
    expect(await robotsAllows('https://example.com/blocked/x', { fetchFn: fakeFetch })).toBe(false);
  });

  it('is fail-open — returns true if robots.txt 404s or errors', async () => {
    const missing = mock(async () => new Response('', { status: 404 }));
    expect(await robotsAllows('https://example.com/x', { fetchFn: missing })).toBe(true);
    const errored = mock(async () => { throw new Error('boom'); });
    expect(await robotsAllows('https://example.com/x', { fetchFn: errored })).toBe(true);
  });
});
