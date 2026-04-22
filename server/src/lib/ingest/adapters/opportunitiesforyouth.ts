import { makeWordPressRssAdapter } from './_wordpress.js';

export const opportunitiesForYouthAdapter = makeWordPressRssAdapter({
  id: 'opportunitiesforyouth',
  displayName: 'Opportunities For Youth',
  feedUrl: 'https://opportunitiesforyouth.org/feed/',
  providerName: 'Opportunities For Youth'
});
