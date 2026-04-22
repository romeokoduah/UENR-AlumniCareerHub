// server/src/lib/ingest/canonicalUrl.ts
// Canonicalize a URL for dedup. Two URLs that differ only in case, fragment,
// trailing slash, or tracking params should collapse to the same string.

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src'
]);

export function canonicalUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';

  u.hostname = u.hostname.toLowerCase();
  u.hash = '';

  // Strip tracking params without touching others.
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.append(k, v);
  }
  u.search = keep.toString() ? `?${keep.toString()}` : '';

  let out = u.toString();
  if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
  if (u.pathname === '/' && !u.search) out = out.replace(/\/$/, '');
  return out;
}
