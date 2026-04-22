// Unit tests for the domain-scoped BFS crawler.
//
// We mock global fetch so no real HTTP calls are made. Each test
// constructs a synthetic site graph and verifies crawler behaviour.

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { crawlDomain } from '../crawler.js';

// ── fetch mock helpers ─────────────────────────────────────────────────────

type PageMap = Record<string, { html: string; status?: number }>;

function buildFetch(pages: PageMap): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Strip canonical query/hash for lookup
    const key = url.split('#')[0];
    const page = pages[key] ?? pages[url];

    if (!page) {
      return new Response('', { status: 404 });
    }
    const status = page.status ?? 200;
    if (status !== 200) {
      return new Response('', { status });
    }
    return new Response(page.html, {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
  };
}

// Build a simple HTML page with links
function page(title: string, content: string, links: string[] = []): string {
  const anchors = links.map((l) => `<li><a href="${l}">Link to ${l}</a></li>`).join('\n');
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>
    <h2><a href="${links[0] ?? '#'}">${title}</a></h2>
    <p>Some description text for ${title}.</p>
    <ul>${anchors}</ul>
  </body></html>`;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('crawlDomain', () => {
  let fetchSpy: ReturnType<typeof spyOn> | null = null;

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
  });

  it('visits all 4 unique pages in a small site graph (seed + 3 subpages, one backlink)', async () => {
    const pages: PageMap = {
      'https://example.com': {
        html: page('Home', 'Welcome', [
          'https://example.com/page-a',
          'https://example.com/page-b',
          'https://example.com/page-c'
        ])
      },
      'https://example.com/page-a': {
        html: page('Page A', 'Content A', ['https://example.com']) // backlink
      },
      'https://example.com/page-b': {
        html: page('Page B', 'Content B', [])
      },
      'https://example.com/page-c': {
        html: page('Page C', 'Content C', [])
      }
    };

    // Mock robots.txt to always allow
    const robotsPages: PageMap = {
      'https://example.com/robots.txt': { html: 'User-agent: *\nAllow: /' }
    };

    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      buildFetch({ ...pages, ...robotsPages }) as any
    );

    const result = await crawlDomain('https://example.com', { maxPages: 30, deadlineMs: 10_000 });

    expect(result.pagesVisited).toHaveLength(4);
    expect(result.pagesVisited).toContain('https://example.com');
    expect(result.pagesVisited).toContain('https://example.com/page-a');
    expect(result.pagesVisited).toContain('https://example.com/page-b');
    expect(result.pagesVisited).toContain('https://example.com/page-c');
  });

  it('aggregates items across all crawled pages', async () => {
    const pages: PageMap = {
      'https://example.com': {
        html: page('Home', 'Welcome', ['https://example.com/jobs'])
      },
      'https://example.com/jobs': {
        html: `<!DOCTYPE html><html><head><title>Jobs</title></head><body>
          <article>
            <h2><a href="https://example.com/job/1">Software Engineer</a></h2>
            <p>Great role for engineers.</p>
          </article>
          <article>
            <h2><a href="https://example.com/job/2">Data Analyst</a></h2>
            <p>Great role for analysts.</p>
          </article>
        </body></html>`
      },
      'https://example.com/robots.txt': { html: 'User-agent: *\nAllow: /' }
    };

    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      buildFetch(pages) as any
    );

    const result = await crawlDomain('https://example.com', { maxPages: 30, deadlineMs: 10_000 });

    // Should have items from the jobs page
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    const titles = result.items.map((i) => i.title);
    expect(titles.some((t) => t.includes('Software Engineer') || t.includes('Data Analyst'))).toBe(true);
  });

  it('never visits more than maxPages pages even with a large synthetic site', async () => {
    const pages: PageMap = {
      'https://example.com/robots.txt': { html: 'User-agent: *\nAllow: /' }
    };

    // Generate 100 pages each linking to the next 10
    for (let i = 0; i < 100; i++) {
      const links = [];
      for (let j = i + 1; j <= i + 10 && j < 100; j++) {
        links.push(`https://example.com/p${j}`);
      }
      pages[`https://example.com/p${i}`] = {
        html: page(`Page ${i}`, `Content ${i}`, links)
      };
    }
    pages['https://example.com'] = {
      html: page('Home', 'Start', ['https://example.com/p0'])
    };

    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      buildFetch(pages) as any
    );

    const result = await crawlDomain('https://example.com', { maxPages: 10, deadlineMs: 60_000 });
    expect(result.pagesVisited.length).toBeLessThanOrEqual(10);
  });

  it('never follows links to a different host', async () => {
    const pages: PageMap = {
      'https://example.com': {
        html: `<!DOCTYPE html><html><head><title>Home</title></head><body>
          <ul>
            <li><a href="https://example.com/internal">Internal</a></li>
            <li><a href="https://evil.com/steal">Cross-origin link</a></li>
            <li><a href="https://other-domain.com/page">Another domain</a></li>
          </ul>
        </body></html>`
      },
      'https://example.com/internal': {
        html: page('Internal', 'OK', [])
      },
      'https://example.com/robots.txt': { html: 'User-agent: *\nAllow: /' }
    };

    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      buildFetch(pages) as any
    );

    const result = await crawlDomain('https://example.com', { maxPages: 30, deadlineMs: 10_000 });

    // Should only visit example.com pages
    for (const visited of result.pagesVisited) {
      const host = new URL(visited).host;
      expect(host).toBe('example.com');
    }
    // Should NOT have visited cross-origin pages
    expect(result.pagesVisited).not.toContain('https://evil.com/steal');
    expect(result.pagesVisited).not.toContain('https://other-domain.com/page');
  });

  it('stops when deadline is reached even if pages remain in queue', async () => {
    let fetchCount = 0;
    const slowFetch: typeof fetch = async (input, _init) => {
      fetchCount++;
      // Simulate 500ms per page
      await new Promise((r) => setTimeout(r, 500));
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      const links = ['https://example.com/a', 'https://example.com/b', 'https://example.com/c',
                     'https://example.com/d', 'https://example.com/e', 'https://example.com/f'];
      return new Response(page('Slow', 'Slow page', links), {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    };

    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(slowFetch as any);

    // Very short deadline: 1200ms — should stop after ~2 batches at 500ms/page
    const result = await crawlDomain('https://example.com', { maxPages: 30, deadlineMs: 1_200 });

    // With 500ms per fetch and 5 concurrent per batch, 1.2s = ~1 complete batch
    // pagesVisited should be well under 30
    expect(result.pagesVisited.length).toBeLessThan(30);
  });
});
