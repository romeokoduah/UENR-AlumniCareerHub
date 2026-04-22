// Shared plumbing for real scholarship adapters. Every per-source adapter
// pulls from here rather than calling `fetch` directly so the timeout /
// UA / robots-check story is in one place.

import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import { FETCH_TIMEOUT_MS } from '../config.js';

export const INGEST_USER_AGENT =
  'UENR-AlumniCareerHub-Ingest/1.0 (+https://uenr-alumni-career-hub.vercel.app)';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// ---- httpGet -------------------------------------------------------------

export type HttpGetResult = { status: number; body: string; contentType: string };

export async function httpGet(
  url: string,
  opts: { fetchFn?: FetchLike; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<HttpGetResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': INGEST_USER_AGENT,
        'accept': 'text/xml, application/xml, application/rss+xml, text/html, */*',
        ...(opts.headers ?? {})
      }
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      // Don't throw — caller decides what to do. Just return the status.
      return { status: res.status, body: '', contentType };
    }
    const body = await res.text();
    return { status: res.status, body, contentType };
  } catch {
    return { status: 0, body: '', contentType: '' };
  } finally {
    clearTimeout(t);
  }
}

// ---- parseRss ------------------------------------------------------------

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Preserve text nodes even when sibling tags exist; critical for <description>.
  textNodeName: '#text',
  // Never auto-coerce '5' -> 5; keeps titles/descriptions as strings.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Force these to always be arrays regardless of count.
  isArray: (name) => ['category', 'link', 'item', 'entry'].includes(name)
});

export type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  categories: string[];
};

type RssChannel = { item?: RssChannelItem[] | RssChannelItem };
type RssChannelItem = {
  title?: string | { '#text'?: string };
  // link is forced to array by isArray; each element may be a string or object
  link?: Array<string | { '#text'?: string; '@_href'?: string }>;
  description?: string | { '#text'?: string };
  pubDate?: string | { '#text'?: string };
  category?: Array<string | { '#text'?: string }>;
};
type AtomFeed = { entry?: AtomEntry[] | AtomEntry };
type AtomEntry = {
  title?: string | { '#text'?: string };
  link?: Array<{ '@_href'?: string }> | { '@_href'?: string };
  summary?: string | { '#text'?: string };
  content?: string | { '#text'?: string };
  published?: string;
  updated?: string;
  category?: Array<{ '@_term'?: string; '#text'?: string }>;
};

function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && '#text' in (v as object)) {
    const t = (v as { '#text'?: unknown })['#text'];
    return typeof t === 'string' ? t : '';
  }
  return '';
}

function asArray<T>(v: T[] | T | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseRss(xml: string): RssItem[] {
  if (!xml?.trim()) return [];
  let parsed: { rss?: { channel?: RssChannel }; feed?: AtomFeed } | undefined;
  try {
    parsed = XML.parse(xml);
  } catch {
    return [];
  }
  if (!parsed) return [];

  // RSS 2.0
  if (parsed.rss?.channel?.item) {
    const items = asArray(parsed.rss.channel.item);
    return items.map((it) => {
      // link is always an array (forced by isArray); pick the first text value
      const linkArr = asArray(it.link);
      const link = linkArr.map((l) => textOf(l)).find((s) => s.length > 0) ?? '';
      return {
        title: textOf(it.title).trim(),
        link: link.trim(),
        description: textOf(it.description).trim(),
        pubDate: textOf(it.pubDate) || undefined,
        categories: asArray(it.category).map((c) => textOf(c).trim()).filter(Boolean)
      };
    }).filter((x) => x.title && x.link);
  }

  // Atom
  if (parsed.feed?.entry) {
    const entries = asArray(parsed.feed.entry);
    return entries.map((e) => {
      const rawLinks = asArray(e.link);
      const href = rawLinks
        .map((l) => (typeof l === 'object' ? l['@_href'] : undefined))
        .find((h): h is string => typeof h === 'string' && h.length > 0) ?? '';
      return {
        title: textOf(e.title).trim(),
        link: href,
        description: (textOf(e.summary) || textOf(e.content)).trim(),
        pubDate: e.published ?? e.updated,
        categories: asArray(e.category)
          .map((c) => (typeof c === 'object' ? c['@_term'] ?? textOf(c as unknown) : '') as string)
          .filter(Boolean)
      };
    }).filter((x) => x.title && x.link);
  }

  return [];
}

// ---- parseHtml -----------------------------------------------------------

export function parseHtml(html: string) {
  return cheerio.load(html);
}

// ---- robotsAllows --------------------------------------------------------
// Dirt-simple robots.txt parser. For our use case we only need:
//   - Fail-open on network / parse errors (we're not a hostile crawler).
//   - Honor a `User-agent: *` block with `Disallow:` prefixes.
// Phase 2 can upgrade to a real robots parser lib if adapters get complex.

// Shared robots cache for production use. Keyed by origin.
export const robotsCache = new Map<string, { disallow: string[]; expiresAt: number }>();
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

async function loadRobots(
  origin: string,
  fetchFn: FetchLike,
  cache: Map<string, { disallow: string[]; expiresAt: number }>
): Promise<{ disallow: string[] }> {
  const now = Date.now();
  const cached = cache.get(origin);
  if (cached && cached.expiresAt > now) return cached;
  const r = await httpGet(`${origin}/robots.txt`, { fetchFn });
  if (r.status !== 200 || !r.body) {
    const v = { disallow: [], expiresAt: now + ROBOTS_TTL_MS };
    cache.set(origin, v);
    return v;
  }
  // Only honor the first matching group (User-agent: * OR our UA prefix).
  const lines = r.body.split(/\r?\n/);
  const disallow: string[] = [];
  let inGroup = false;
  let matchedUa = false;
  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = (k ?? '').trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      inGroup = val === '*' || /uenr/i.test(val);
      if (inGroup) matchedUa = true;
      continue;
    }
    if (inGroup && key === 'disallow' && val) disallow.push(val);
  }
  const out = { disallow: matchedUa ? disallow : [], expiresAt: now + ROBOTS_TTL_MS };
  cache.set(origin, out);
  return out;
}

export async function robotsAllows(
  url: string,
  opts: { fetchFn?: FetchLike; _cache?: Map<string, { disallow: string[]; expiresAt: number }> } = {}
): Promise<boolean> {
  const origin = originOf(url);
  if (!origin) return true;
  const fetchFn = opts.fetchFn ?? fetch;
  // Use an isolated cache when a custom fetchFn is provided (e.g. in tests),
  // so different mock fetch functions don't bleed cached results into each other.
  const cache = opts._cache ?? (opts.fetchFn ? new Map() : robotsCache);
  try {
    const { disallow } = await loadRobots(origin, fetchFn, cache);
    const path = new URL(url).pathname;
    return !disallow.some((d) => d && path.startsWith(d));
  } catch {
    return true; // fail-open
  }
}
