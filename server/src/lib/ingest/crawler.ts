// Domain-scoped BFS crawler.
//
// Given a seed URL, crawls all reachable pages within the SAME host (exact
// URL.host match — no subdomain walking, no cross-origin links).
//
// Constraints
// ───────────
// • Max pages:    30 hard cap
// • Time budget:  configurable deadlineMs (default 40 000 ms from call time)
// • Per-page fetch timeout: 3 000 ms (hard-coded)
// • Concurrency:  batches of 5 parallel fetches
// • robots.txt:   checked per-URL; disallowed paths are skipped (fail-open on
//                 error fetching robots.txt itself)
// • Same-origin:  enforced with explicit URL.host check before enqueueing

import * as cheerio from 'cheerio';
import { httpGet, robotsAllows, parseRss } from './adapters/_base.js';
import { canonicalUrl } from './canonicalUrl.js';
import { sanitizeTitle, sanitizeDescription } from './sanitize.js';

export type CrawledPage = {
  url: string;
  items: Array<{ title: string; description: string; link: string }>;
};

export type CrawlResult = {
  pagesVisited: string[];
  items: Array<{ title: string; description: string; link: string }>;
};

const PAGE_FETCH_TIMEOUT_MS = 3_000;
const MAX_ITEMS_PER_PAGE = 20;
const FALLBACK_BODY_CHARS = 3_000;

// ── helpers ────────────────────────────────────────────────────────────────

function isRssLike(contentType: string, body: string): boolean {
  if (/xml|rss/.test(contentType.toLowerCase())) return true;
  const trimmed = body.trimStart().slice(0, 200);
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed');
}

function extractItems(html: string, baseUrl: string): Array<{ title: string; description: string; link: string }> {
  const $ = cheerio.load(html);
  const items: Array<{ title: string; description: string; link: string }> = [];
  const seen = new Set<string>();

  function resolveUrl(href: string): string {
    if (!href) return '';
    try { return new URL(href, baseUrl).toString(); } catch { return href; }
  }

  // Tier 1: <article> tags
  $('article').each((_i, el) => {
    if (items.length >= MAX_ITEMS_PER_PAGE) return false;
    const heading = $(el).find('h1,h2,h3,h4').first().text().trim();
    const anchor = $(el).find('a[href]').first();
    const link = resolveUrl(anchor.attr('href') ?? '');
    const title = heading || sanitizeTitle(anchor.text().trim());
    const desc = sanitizeDescription($(el).text().trim());
    if (!title || !link || seen.has(link)) return;
    seen.add(link);
    items.push({ title, description: desc, link });
  });

  if (items.length >= MAX_ITEMS_PER_PAGE) return items.slice(0, MAX_ITEMS_PER_PAGE);

  // Tier 2: h2/h3 with nearby anchor
  $('h2, h3').each((_i, el) => {
    if (items.length >= MAX_ITEMS_PER_PAGE) return false;
    const $el = $(el);
    let anchor = $el.find('a[href]').first();
    if (!anchor.length) anchor = $el.next('a[href]').first();
    if (!anchor.length) anchor = $el.closest('li,div').find('a[href]').first();
    const link = resolveUrl(anchor.attr('href') ?? '');
    const title = sanitizeTitle($el.text().trim() || anchor.text().trim());
    if (!title || !link || seen.has(link) || !/^https?:\/\//.test(link)) return;
    seen.add(link);
    items.push({ title, description: sanitizeDescription($el.next('p').text().trim() || ''), link });
  });

  if (items.length >= MAX_ITEMS_PER_PAGE) return items.slice(0, MAX_ITEMS_PER_PAGE);

  // Tier 3: <li> with anchor
  $('ul li, ol li').each((_i, el) => {
    if (items.length >= MAX_ITEMS_PER_PAGE) return false;
    const anchor = $(el).find('a[href]').first();
    const link = resolveUrl(anchor.attr('href') ?? '');
    const title = sanitizeTitle(anchor.text().trim() || $(el).text().trim());
    if (!title || !link || seen.has(link) || !/^https?:\/\//.test(link)) return;
    seen.add(link);
    items.push({ title, description: '', link });
  });

  return items.slice(0, MAX_ITEMS_PER_PAGE);
}

function wholePageFallback(html: string, baseUrl: string): Array<{ title: string; description: string; link: string }> {
  const $ = cheerio.load(html);
  const pageTitle = sanitizeTitle($('title').first().text().trim());
  if (!pageTitle) return [];
  $('script,style,nav,header,footer').remove();
  const bodyText = sanitizeDescription($('body').text().trim()).slice(0, FALLBACK_BODY_CHARS);
  return [{ title: pageTitle, description: bodyText, link: baseUrl }];
}

function extractLinks(html: string, baseUrl: string, seedHost: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    try {
      const resolved = new URL(href, baseUrl);
      // Enforce exact same-host rule
      if (resolved.host !== seedHost) return;
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
      const canon = canonicalUrl(resolved.toString());
      if (canon) links.push(canon);
    } catch { /* ignore unparseable */ }
  });
  return links;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function crawlDomain(
  seedUrl: string,
  opts: {
    maxPages?: number;
    deadlineMs?: number; // ms from call time
  } = {}
): Promise<CrawlResult> {
  const MAX_PAGES = opts.maxPages ?? 30;
  const DEADLINE_MS = opts.deadlineMs ?? 40_000;
  const deadline = Date.now() + DEADLINE_MS;

  const canonSeed = canonicalUrl(seedUrl) || seedUrl;
  let seedHost: string;
  try {
    seedHost = new URL(canonSeed).host;
  } catch {
    return { pagesVisited: [], items: [] };
  }

  const visited = new Set<string>([canonSeed]);
  const queue: string[] = [canonSeed];
  const allItems: Array<{ title: string; description: string; link: string }> = [];
  const pagesVisited: string[] = [];
  const seenItemLinks = new Set<string>();

  // Process a single URL: fetch → extract items + links → return both
  async function processUrl(url: string): Promise<{ items: Array<{ title: string; description: string; link: string }>; links: string[] }> {
    // Time check
    if (Date.now() >= deadline) return { items: [], links: [] };

    // robots.txt (fail-open)
    const allowed = await robotsAllows(url).catch(() => true);
    if (!allowed) return { items: [], links: [] };

    const res = await httpGet(url, { timeoutMs: PAGE_FETCH_TIMEOUT_MS }).catch(() => null);
    if (!res || res.status === 0 || res.status < 200 || res.status >= 400) return { items: [], links: [] };

    const rss = isRssLike(res.contentType, res.body);
    let items: Array<{ title: string; description: string; link: string }> = [];

    if (rss) {
      const parsed = parseRss(res.body);
      items = parsed.map((item) => ({ title: item.title, description: item.description, link: item.link }));
    } else {
      items = extractItems(res.body, url);
      if (items.length === 0) items = wholePageFallback(res.body, url);
    }

    const links = rss ? [] : extractLinks(res.body, url, seedHost);
    return { items, links };
  }

  // BFS in batches of 5
  const BATCH_SIZE = 5;

  while (queue.length > 0 && visited.size <= MAX_PAGES && Date.now() < deadline) {
    // Take up to BATCH_SIZE URLs from queue
    const batch: string[] = [];
    while (batch.length < BATCH_SIZE && queue.length > 0 && visited.size + batch.length <= MAX_PAGES) {
      // Already popped/added to visited when enqueued — just dequeue
      const url = queue.shift()!;
      batch.push(url);
    }
    if (batch.length === 0) break;

    // Fetch all in parallel
    const results = await Promise.all(batch.map((url) => processUrl(url)));

    for (let i = 0; i < batch.length; i++) {
      const url = batch[i];
      pagesVisited.push(url);

      const { items, links } = results[i];

      // Deduplicate items by link
      for (const item of items) {
        const canon = canonicalUrl(item.link) || item.link;
        if (!seenItemLinks.has(canon)) {
          seenItemLinks.add(canon);
          allItems.push(item);
        }
      }

      // Enqueue new same-origin links
      for (const link of links) {
        if (!visited.has(link) && visited.size < MAX_PAGES) {
          visited.add(link);
          queue.push(link);
        }
      }
    }
  }

  return { pagesVisited, items: allItems };
}
