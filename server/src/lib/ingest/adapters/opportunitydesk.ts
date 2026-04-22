import { makeWordPressRssAdapter } from './_wordpress.js';

export const opportunityDeskAdapter = makeWordPressRssAdapter({
  id: 'opportunitydesk',
  displayName: 'Opportunity Desk',
  feedUrl: 'https://opportunitydesk.org/feed/',
  providerName: 'Opportunity Desk'
});
