// Ad-hoc URL ingestion — takes a single URL from an admin and runs the
// appropriate pipeline on whatever items can be extracted from it.
//
// Supports RSS/Atom feeds and HTML pages. HTML extraction uses a tiered
// heuristic: article/h2+a block items → structured li items → whole-page
// fallback with title + first 3000 chars of body text.
//
// Exports: ingestAdhocUrl(url, kind) → AdhocResult

import * as cheerio from 'cheerio';
import { httpGet, parseRss, robotsAllows } from './adapters/_base.js';
import { canonicalUrl } from './canonicalUrl.js';
import { sanitizeTitle, sanitizeDescription } from './sanitize.js';
import { runPipelineForAdapter } from './pipeline.js';
import { runJobsPipelineForAdapter } from './jobsPipeline.js';
import type { SourceAdapter, RawScholarship } from './types.js';
import type { JobAdapter, RawJob } from './adapters/jobs/_base.js';

export type AdhocResult = {
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
  ingestedSample: Array<{
    title: string;
    status: string;
    confidence?: number;
  }>;
  message?: string;
};

const MAX_ITEMS = 20;
const FALLBACK_BODY_CHARS = 3000;

// ── Format detection ─────────────────────────────────────────────────────────

function isRssLike(contentType: string, body: string): boolean {
  if (/xml|rss/.test(contentType.toLowerCase())) return true;
  const trimmed = body.trimStart().slice(0, 200);
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed');
}

// ── HTML extraction ───────────────────────────────────────────────────────────

type RawItem = { title: string; description: string; link: string };

function extractFromHtml(html: string, baseUrl: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  const seen = new Set<string>();

  // Helper: resolve relative URLs
  function resolveUrl(href: string): string {
    if (!href) return '';
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  }

  // Tier 1: <article> tags with an <a href> inside
  $('article').each((_i, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const heading = $(el).find('h1,h2,h3,h4').first().text().trim();
    const anchor = $(el).find('a[href]').first();
    const link = resolveUrl(anchor.attr('href') ?? '');
    const title = heading || sanitizeTitle(anchor.text().trim());
    const desc = sanitizeDescription($(el).text().trim());
    if (!title || !link || seen.has(link)) return;
    seen.add(link);
    items.push({ title, description: desc, link });
  });

  if (items.length >= MAX_ITEMS) return items.slice(0, MAX_ITEMS);

  // Tier 2: heading tags with a nearby <a href> (siblings or parent)
  $('h2, h3').each((_i, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const $el = $(el);
    // Look for anchor inside the heading, then in the next sibling, then in the parent.
    let anchor = $el.find('a[href]').first();
    if (!anchor.length) anchor = $el.next('a[href]').first();
    if (!anchor.length) anchor = $el.closest('li,div').find('a[href]').first();
    const link = resolveUrl(anchor.attr('href') ?? '');
    const title = sanitizeTitle($el.text().trim() || anchor.text().trim());
    if (!title || !link || seen.has(link) || !/^https?:\/\//.test(link)) return;
    seen.add(link);
    // Grab description from the next paragraph sibling if available
    const desc = sanitizeDescription($el.next('p').text().trim() || '');
    items.push({ title, description: desc, link });
  });

  if (items.length >= MAX_ITEMS) return items.slice(0, MAX_ITEMS);

  // Tier 3: structured <li> inside a list, with an <a href>
  $('ul li, ol li').each((_i, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const anchor = $(el).find('a[href]').first();
    const link = resolveUrl(anchor.attr('href') ?? '');
    const title = sanitizeTitle(anchor.text().trim() || $(el).text().trim());
    if (!title || !link || seen.has(link) || !/^https?:\/\//.test(link)) return;
    seen.add(link);
    items.push({ title, description: '', link });
  });

  return items.slice(0, MAX_ITEMS);
}

function wholePageFallback(html: string, baseUrl: string): RawItem[] {
  const $ = cheerio.load(html);
  const pageTitle = sanitizeTitle($('title').first().text().trim());
  if (!pageTitle) return [];
  // Extract text and cap at FALLBACK_BODY_CHARS
  $('script,style,nav,header,footer').remove();
  const bodyText = sanitizeDescription($('body').text().trim()).slice(0, FALLBACK_BODY_CHARS);
  return [{ title: pageTitle, description: bodyText, link: baseUrl }];
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function ingestAdhocUrl(
  url: string,
  kind: 'scholarship' | 'job'
): Promise<AdhocResult> {
  const canonical = canonicalUrl(url);
  const effectiveUrl = canonical || url;

  // Check robots.txt (fail-open)
  const allowed = await robotsAllows(effectiveUrl);
  if (!allowed) {
    const err = new Error('Site blocks ingestion bots');
    (err as any).statusCode = 403;
    throw err;
  }

  // Fetch the URL
  const res = await httpGet(effectiveUrl);
  if (res.status === 0 || (!res.body && res.status !== 200)) {
    const err = new Error('Could not fetch URL');
    (err as any).statusCode = 400;
    throw err;
  }
  if (res.status < 200 || res.status >= 400) {
    const err = new Error(`Could not fetch URL (HTTP ${res.status})`);
    (err as any).statusCode = 400;
    throw err;
  }

  // Derive hostname for adapter display name
  let hostname = 'unknown';
  try { hostname = new URL(effectiveUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

  const adapterId = `adhoc:${hostname}:${Date.now()}`;

  // Detect format and extract raw items
  const rss = isRssLike(res.contentType, res.body);

  if (kind === 'scholarship') {
    let scholarships: RawScholarship[];

    if (rss) {
      const parsed = parseRss(res.body);
      scholarships = parsed.map((item) => ({
        title: item.title,
        description: item.description,
        applicationUrl: item.link,
        providerName: hostname,
        tags: item.categories
      }));
    } else {
      const extracted = extractFromHtml(res.body, effectiveUrl);
      if (extracted.length === 0) {
        const fallback = wholePageFallback(res.body, effectiveUrl);
        scholarships = fallback.map((item) => ({
          title: item.title,
          description: item.description,
          applicationUrl: item.link,
          providerName: hostname,
          tags: []
        }));
      } else {
        scholarships = extracted.map((item) => ({
          title: item.title,
          description: item.description || 'No description extracted.',
          applicationUrl: item.link,
          providerName: hostname,
          tags: []
        }));
      }
    }

    if (scholarships.length === 0) {
      return {
        itemsFound: 0,
        itemsPublished: 0,
        itemsQueued: 0,
        itemsRejected: 0,
        ingestedSample: [],
        message: 'No structured items could be extracted from this URL.'
      };
    }

    const frozen = scholarships.slice(); // capture for ingestedSample
    const adapter: SourceAdapter = {
      id: adapterId,
      displayName: `Ad-hoc: ${hostname}`,
      url: effectiveUrl,
      kind: rss ? 'rss' : 'html',
      fetch: async () => frozen
    };

    const pipelineResult = await runPipelineForAdapter(adapter);

    return {
      ...pipelineResult,
      ingestedSample: frozen.slice(0, 5).map((s) => ({
        title: s.title,
        status: 'ingested',
        confidence: undefined
      }))
    };
  } else {
    // kind === 'job'
    let jobs: RawJob[];

    if (rss) {
      const parsed = parseRss(res.body);
      jobs = parsed.map((item) => ({
        externalId: item.link,
        title: item.title,
        description: item.description,
        company: hostname,
        location: '',
        locationType: 'ONSITE' as const,
        type: 'FULL_TIME' as const,
        applicationUrl: item.link,
        currency: 'GHS',
        industry: item.categories[0] ?? undefined,
        tags: item.categories
      }));
    } else {
      const extracted = extractFromHtml(res.body, effectiveUrl);
      if (extracted.length === 0) {
        const fallback = wholePageFallback(res.body, effectiveUrl);
        jobs = fallback.map((item) => ({
          externalId: item.link,
          title: item.title,
          description: item.description,
          company: hostname,
          location: '',
          locationType: 'ONSITE' as const,
          type: 'FULL_TIME' as const,
          applicationUrl: item.link,
          currency: 'GHS'
        }));
      } else {
        jobs = extracted.map((item) => ({
          externalId: item.link,
          title: item.title,
          description: item.description || 'No description extracted.',
          company: hostname,
          location: '',
          locationType: 'ONSITE' as const,
          type: 'FULL_TIME' as const,
          applicationUrl: item.link,
          currency: 'GHS'
        }));
      }
    }

    if (jobs.length === 0) {
      return {
        itemsFound: 0,
        itemsPublished: 0,
        itemsQueued: 0,
        itemsRejected: 0,
        ingestedSample: [],
        message: 'No structured items could be extracted from this URL.'
      };
    }

    const frozen = jobs.slice();
    const adapter: JobAdapter = {
      id: adapterId,
      displayName: `Ad-hoc: ${hostname}`,
      url: effectiveUrl,
      kind: rss ? 'rss' : 'html',
      fetch: async () => frozen
    };

    const pipelineResult = await runJobsPipelineForAdapter(adapter);

    return {
      ...pipelineResult,
      ingestedSample: frozen.slice(0, 5).map((j) => ({
        title: j.title,
        status: 'ingested',
        confidence: undefined
      }))
    };
  }
}
