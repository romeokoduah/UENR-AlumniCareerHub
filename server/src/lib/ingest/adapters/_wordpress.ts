import { httpGet, parseRss } from './_base.js';
import type { SourceAdapter, RawScholarship } from '../types.js';

// Most aggregator blogs (Opportunity Desk, Scholars4Dev, etc.) publish a
// stock WordPress RSS feed under /feed/. The shape is RSS 2.0 with <item>
// entries carrying title / link / description / category. This factory
// turns those feeds into SourceAdapter instances — one config object per
// site, not a bespoke file.

type WpRssAdapterOptions = {
  id: string;
  displayName: string;
  feedUrl: string;
  providerName: string;  // displayed on the card
};

export function makeWordPressRssAdapter(opts: WpRssAdapterOptions): SourceAdapter {
  return {
    id: opts.id,
    displayName: opts.displayName,
    url: opts.feedUrl,
    kind: 'rss',
    fetch: async () => {
      const res = await httpGet(opts.feedUrl);
      if (res.status !== 200 || !res.body) return [];
      const items = parseRss(res.body);
      // WP feed descriptions are HTML excerpts — the pipeline's sanitize
      // step will strip them down to plain text, so we pass them through.
      return items.map<RawScholarship>((it) => ({
        title: it.title,
        description: it.description,
        applicationUrl: it.link,
        providerName: opts.providerName,
        tags: it.categories ?? []
      }));
    }
  };
}
