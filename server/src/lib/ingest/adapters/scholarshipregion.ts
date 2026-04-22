import { makeWordPressRssAdapter } from './_wordpress.js';

export const scholarshipRegionAdapter = makeWordPressRssAdapter({
  id: 'scholarshipregion',
  displayName: 'Scholarship Region',
  feedUrl: 'https://www.scholarshipregion.com/feed/',
  providerName: 'Scholarship Region'
});
