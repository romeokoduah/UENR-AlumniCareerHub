import { makeWordPressRssAdapter } from './_wordpress.js';

export const scholars4devAdapter = makeWordPressRssAdapter({
  id: 'scholars4dev',
  displayName: 'Scholars4Dev',
  feedUrl: 'https://www.scholars4dev.com/feed/',
  providerName: 'Scholars4Dev'
});
