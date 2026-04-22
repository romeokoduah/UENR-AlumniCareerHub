import { httpGet, parseHtml } from './_base.js';
import type { SourceAdapter, RawScholarship } from '../types.js';

const BASE = 'https://cscuk.fcdo.gov.uk';
const FEED_URL = `${BASE}/scholarships/`;

export function parseCommonwealthHtml(html: string, baseUrl = BASE): RawScholarship[] {
  const $ = parseHtml(html);
  const items: RawScholarship[] = [];

  $('article').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h2').first().text().trim();
    // First link in the article heading area (skip author links)
    const href = $el.find('a[href]').first().attr('href') ?? '';
    // Description: second paragraph (first is the "by Author | Date" meta line)
    const paragraphs = $el.find('p');
    const description = paragraphs.length > 1
      ? paragraphs.eq(1).text().trim()
      : paragraphs.first().text().trim();

    if (!title || !href) return;
    const applicationUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    items.push({
      title,
      description,
      applicationUrl,
      providerName: 'Commonwealth Scholarship Commission'
    });
  });

  return items;
}

export const commonwealthAdapter: SourceAdapter = {
  id: 'commonwealth',
  displayName: 'Commonwealth Scholarship Commission',
  url: FEED_URL,
  kind: 'html',
  fetch: async () => {
    const res = await httpGet(FEED_URL);
    if (res.status !== 200 || !res.body) return [];
    return parseCommonwealthHtml(res.body, BASE);
  }
};
