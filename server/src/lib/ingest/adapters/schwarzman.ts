import { httpGet, parseHtml } from './_base.js';
import type { SourceAdapter, RawScholarship } from '../types.js';

const BASE = 'https://www.schwarzmanscholars.org';
const FEED_URL = BASE + '/';

export function parseSchwarzmanHtml(html: string, baseUrl = BASE): RawScholarship[] {
  const $ = parseHtml(html);

  // Schwarzman Scholars is a single flagship program. The home page hero section
  // contains the program title (second h1) and a short description paragraph.
  // The official application link is the "Apply" CTA.
  const heroContainer = $('.hero__text-container').first();
  if (!heroContainer.length) return [];

  // The second h1 on the page carries the program description as its content
  const descriptionEl = heroContainer.find('h1').last();
  const description = descriptionEl.length
    ? descriptionEl.text().trim()
    : heroContainer.find('p').first().text().trim();

  // Canonical application URL
  const applyHref =
    $('a[href*="apply"]').filter((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      return text === 'apply' || text.startsWith('apply');
    }).first().attr('href') ?? '';

  const applicationUrl = applyHref.startsWith('http')
    ? applyHref
    : new URL(applyHref, baseUrl).toString();

  if (!applicationUrl) return [];

  return [
    {
      title: 'Schwarzman Scholars Program',
      description,
      applicationUrl,
      providerName: 'Schwarzman Scholars'
    }
  ];
}

export const schwarzmanAdapter: SourceAdapter = {
  id: 'schwarzman',
  displayName: 'Schwarzman Scholars',
  url: FEED_URL,
  kind: 'html',
  fetch: async () => {
    const res = await httpGet(FEED_URL);
    if (res.status !== 200 || !res.body) return [];
    return parseSchwarzmanHtml(res.body, BASE);
  }
};
