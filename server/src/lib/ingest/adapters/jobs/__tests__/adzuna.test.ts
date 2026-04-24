import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { makeAdzunaAdapter, adzunaLandUrlFor } from '../adzuna.js';

describe('adzunaLandUrlFor', () => {
  it('builds the one-click redirector URL from redirect_url details path', () => {
    expect(adzunaLandUrlFor('gb', { redirect_url: 'https://www.adzuna.co.uk/jobs/details/4500004343' }))
      .toBe('https://www.adzuna.co.uk/jobs/land/ad/4500004343');
  });

  it('uses numeric id when redirect_url is missing or unparseable', () => {
    expect(adzunaLandUrlFor('gb', { id: 789 }))
      .toBe('https://www.adzuna.co.uk/jobs/land/ad/789');
  });

  it('uses US host for country=us', () => {
    expect(adzunaLandUrlFor('us', { id: 42 }))
      .toBe('https://www.adzuna.com/jobs/land/ad/42');
  });

  it('returns empty string when no usable id can be derived', () => {
    expect(adzunaLandUrlFor('gb', { redirect_url: 'https://weird-url' })).toBe('');
    expect(adzunaLandUrlFor('gb', {})).toBe('');
    expect(adzunaLandUrlFor('gb', { adref: 'abc' })).toBe('');
  });
});

// Sample well-formed Adzuna response.
const SAMPLE_RESPONSE = {
  results: [
    {
      id: '123456',
      title: 'Data Scientist',
      description: '<p>We are hiring a Data Scientist to join our team in London. You will work on ML pipelines and data analysis.</p>',
      company: { display_name: 'Acme Corp' },
      location: { display_name: 'London, UK', area: ['UK', 'London'] },
      redirect_url: 'https://www.adzuna.co.uk/jobs/details/123456',
      salary_min: 50000,
      salary_max: 80000,
      salary_is_predicted: '0',
      created: '2026-04-20T10:00:00Z',
      contract_type: 'permanent',
      category: { label: 'IT Jobs', tag: 'it-jobs' }
    },
    {
      id: '789',
      title: 'Part-time Ghana Project Coordinator',
      description: '<p>Coordinating Ghana-focused development projects remotely. Must have experience in West Africa.</p>',
      company: { display_name: 'NGO Partners' },
      location: { display_name: 'Remote' },
      redirect_url: 'https://www.adzuna.co.uk/jobs/details/789',
      salary_min: 25000,
      salary_max: 35000,
      created: '2026-04-18T08:00:00Z',
      contract_time: 'part_time',
      category: { label: 'Social Work Jobs', tag: 'social-work-jobs' }
    }
  ]
};

describe('makeAdzunaAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear Adzuna keys so each test starts clean.
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
  });

  afterEach(() => {
    // Restore original env
    process.env.ADZUNA_APP_ID = originalEnv.ADZUNA_APP_ID;
    process.env.ADZUNA_APP_KEY = originalEnv.ADZUNA_APP_KEY;
  });

  it('returns empty array when ADZUNA_APP_ID/KEY are not set', async () => {
    const adapter = makeAdzunaAdapter({
      id: 'test-adapter',
      displayName: 'Test',
      country: 'gb',
      what: 'ghana'
    });

    const result = await adapter.fetch();
    expect(result).toEqual([]);
  });

  it('parses a well-formed Adzuna JSON response into RawJob[]', async () => {
    process.env.ADZUNA_APP_ID = 'test-app-id';
    process.env.ADZUNA_APP_KEY = 'test-app-key';

    // Mock the global fetch used internally via httpGet.
    const originalFetch = global.fetch;
    global.fetch = mock(async (_url: string) => {
      return new Response(JSON.stringify(SAMPLE_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as typeof fetch;

    try {
      const adapter = makeAdzunaAdapter({
        id: 'adzuna-gh',
        displayName: 'Adzuna — Ghana-related',
        country: 'gb',
        what: 'ghana'
      });

      const jobs = await adapter.fetch();

      expect(jobs.length).toBe(2);

      const first = jobs[0];
      expect(first.externalId).toBe('123456');
      expect(first.title).toBe('Data Scientist');
      expect(first.company).toBe('Acme Corp');
      expect(first.location).toBe('London, UK');
      // applicationUrl now points at the one-click employer redirector
      // (/jobs/land/ad/{id}) not the details page (/jobs/details/{id}).
      expect(first.applicationUrl).toBe('https://www.adzuna.co.uk/jobs/land/ad/123456');
      expect(first.salaryMin).toBe(50000);
      expect(first.salaryMax).toBe(80000);
      expect(first.currency).toBe('GBP');
      expect(first.type).toBe('FULL_TIME');
      expect(first.industry).toBe('IT Jobs');
      expect(first.tags).toEqual(['it-jobs']);
      expect(first.postedAt).toBe('2026-04-20T10:00:00Z');

      const second = jobs[1];
      expect(second.externalId).toBe('789');
      expect(second.type).toBe('PART_TIME');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on 4xx/5xx HTTP responses', async () => {
    process.env.ADZUNA_APP_ID = 'test-app-id';
    process.env.ADZUNA_APP_KEY = 'test-app-key';

    const originalFetch = global.fetch;
    global.fetch = mock(async () => {
      return new Response('Unauthorized', { status: 401 });
    }) as unknown as typeof fetch;

    try {
      const adapter = makeAdzunaAdapter({
        id: 'adzuna-gh',
        displayName: 'Adzuna — Ghana-related',
        country: 'gb'
      });

      const jobs = await adapter.fetch();
      expect(jobs).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns empty array on malformed JSON response', async () => {
    process.env.ADZUNA_APP_ID = 'test-app-id';
    process.env.ADZUNA_APP_KEY = 'test-app-key';

    const originalFetch = global.fetch;
    global.fetch = mock(async () => {
      return new Response('this is not { valid json', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as typeof fetch;

    try {
      const adapter = makeAdzunaAdapter({
        id: 'adzuna-gh',
        displayName: 'Adzuna — Ghana-related',
        country: 'gb'
      });

      const jobs = await adapter.fetch();
      expect(jobs).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('skips results missing title or redirect_url', async () => {
    process.env.ADZUNA_APP_ID = 'test-app-id';
    process.env.ADZUNA_APP_KEY = 'test-app-key';

    const responseWithMissing = {
      results: [
        { id: '1', title: 'Valid Job', redirect_url: 'https://example.com/1', description: 'Valid', company: { display_name: 'Co' }, location: { display_name: 'London' } },
        { id: '2', redirect_url: 'https://example.com/2' }, // no title
        { id: '3', title: 'No URL' }                        // no redirect_url
      ]
    };

    const originalFetch = global.fetch;
    global.fetch = mock(async () => {
      return new Response(JSON.stringify(responseWithMissing), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as typeof fetch;

    try {
      const adapter = makeAdzunaAdapter({ id: 'test', displayName: 'Test', country: 'gb' });
      const jobs = await adapter.fetch();
      expect(jobs.length).toBe(1);
      expect(jobs[0].externalId).toBe('1');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('sets adapter metadata correctly', () => {
    const adapter = makeAdzunaAdapter({
      id: 'adzuna-us',
      displayName: 'Adzuna US',
      country: 'us',
      what: 'engineer',
      resultsPerPage: 50
    });

    expect(adapter.id).toBe('adzuna-us');
    expect(adapter.displayName).toBe('Adzuna US');
    expect(adapter.kind).toBe('json-api');
    expect(adapter.url).toContain('us/search');
  });
});
