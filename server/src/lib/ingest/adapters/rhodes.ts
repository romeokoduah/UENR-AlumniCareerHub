import { httpGet, parseHtml } from './_base.js';
import type { SourceAdapter, RawScholarship } from '../types.js';

const BASE = 'https://www.rhodeshouse.ox.ac.uk';
const FEED_URL = `${BASE}/scholarships/`;

// The page-level intro blurb shared across all tiles
const PAGE_DESCRIPTION =
  'The Rhodes Scholarship is a fully-funded postgraduate award which enables talented ' +
  'young people from around the world to study at the University of Oxford.';

export function parseRhodesHtml(html: string, baseUrl = BASE): RawScholarship[] {
  const $ = parseHtml(html);
  const items: RawScholarship[] = [];

  // The scholarships landing page renders tiles in .tiles-block-column blocks.
  // Each tile has an h3 title and a .cta-button anchor link.
  $('.tiles-block-column').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h3').first().text().trim();
    // Prefer the explicit CTA button href; fall back to any anchor
    const href =
      $el.find('a.cta-button').attr('href') ??
      $el.find('a[href]').first().attr('href') ??
      '';

    if (!title || !href) return;
    const applicationUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    items.push({
      title,
      description: PAGE_DESCRIPTION,
      applicationUrl,
      providerName: 'Rhodes Trust'
    });
  });

  return items;
}

export const rhodesAdapter: SourceAdapter = {
  id: 'rhodes',
  displayName: 'Rhodes Trust',
  url: FEED_URL,
  kind: 'html',
  fetch: async () => {
    const res = await httpGet(FEED_URL);
    if (res.status !== 200 || !res.body) return [];
    return parseRhodesHtml(res.body, BASE);
  }
};
