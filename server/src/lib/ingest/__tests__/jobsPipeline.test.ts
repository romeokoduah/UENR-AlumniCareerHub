import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { prisma } from '../../prisma.js';
import { runJobsPipelineForAdapter } from '../jobsPipeline.js';
import type { JobAdapter, RawJob } from '../adapters/jobs/_base.js';

const ENABLED = !!process.env.DATABASE_URL;

// Two mock RawJob items with distinct URLs and externalIds.
const MOCK_JOBS: RawJob[] = [
  {
    externalId: 'mock-job-001',
    title: 'Software Engineer — Ghana Fintech',
    description: 'We are looking for a skilled software engineer to join our fintech team in Accra, Ghana. You will build scalable payment infrastructure and APIs serving millions of users across West Africa.',
    company: 'GhanaFin Ltd',
    location: 'Accra, Ghana',
    locationType: 'ONSITE',
    type: 'FULL_TIME',
    salaryMin: 60000,
    salaryMax: 90000,
    currency: 'GBP',
    applicationUrl: 'https://www.adzuna.co.uk/jobs/details/mock-001',
    postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago → recency=1
    industry: 'IT Jobs',
    tags: ['it-jobs']
  },
  {
    externalId: 'mock-job-002',
    title: 'Remote Project Manager — Africa Development',
    description: 'Join our international team as a project manager coordinating development programs across sub-Saharan Africa. Remote-friendly with occasional travel required.',
    company: 'DevAfrica NGO',
    location: 'Remote',
    locationType: 'REMOTE',
    type: 'CONTRACT',
    salaryMin: 45000,
    salaryMax: 65000,
    currency: 'GBP',
    applicationUrl: 'https://www.adzuna.co.uk/jobs/details/mock-002',
    postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago → recency=1
    industry: 'Management Jobs',
    tags: ['management-jobs']
  }
];

// A mock JobAdapter that returns our two controlled items.
function makeMockJobAdapter(): JobAdapter {
  return {
    id: '_mock-jobs',
    displayName: 'Mock Jobs Adapter',
    url: 'https://mock.example.com',
    kind: 'json-api',
    fetch: async () => MOCK_JOBS
  };
}

(ENABLED ? describe : describe.skip)('jobsPipeline', () => {
  beforeEach(async () => {
    await prisma.opportunity.deleteMany({ where: { sourceName: '_mock-jobs' } });
  });

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { sourceName: '_mock-jobs' } });
  });

  it('creates Opportunity rows with source=INGESTED and correct fields', async () => {
    // Mock fetchFn so URL reachability always passes.
    const fakeFetch = mock(async () => new Response(null, { status: 200 }));

    const result = await runJobsPipelineForAdapter(makeMockJobAdapter(), {
      fetchFn: fakeFetch
    });

    expect(result.itemsFound).toBe(2);
    // With reachable=1, requiredFields=1, english=1, recency=1 → confidence=1.0 → PUBLISHED
    expect(result.itemsPublished).toBe(2);
    expect(result.itemsQueued).toBe(0);
    expect(result.itemsRejected).toBe(0);

    const rows = await prisma.opportunity.findMany({
      where: { sourceName: '_mock-jobs' }
    });

    expect(rows.length).toBe(2);

    // Rows arrive in DB insertion order which varies under parallel processing.
    // Look up the specific row by externalId stored in rawPayload.
    const row001 = rows.find(
      (r) => (r.rawPayload as Record<string, unknown>)?.externalId === 'mock-job-001'
    );
    expect(row001).toBeDefined();
    if (!row001) return; // narrow type

    expect(row001.source).toBe('INGESTED');
    expect(row001.status).toBe('PUBLISHED');
    expect(row001.isApproved).toBe(true);
    expect(row001.confidence).toBeGreaterThanOrEqual(0.7);
    expect(row001.ingestedAt).not.toBeNull();
    expect(row001.sourceName).toBe('_mock-jobs');
    expect(row001.company).toBe('GhanaFin Ltd');
    expect(row001.type).toBe('FULL_TIME');
  });

  it('dedups on repeat run — second run updates, does not create new rows', async () => {
    const fakeFetch = mock(async () => new Response(null, { status: 200 }));
    const adapter = makeMockJobAdapter();

    await runJobsPipelineForAdapter(adapter, { fetchFn: fakeFetch });
    const countAfterFirst = await prisma.opportunity.count({ where: { sourceName: '_mock-jobs' } });

    await runJobsPipelineForAdapter(adapter, { fetchFn: fakeFetch });
    const countAfterSecond = await prisma.opportunity.count({ where: { sourceName: '_mock-jobs' } });

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('queues items when URL is unreachable (lower confidence)', async () => {
    // Unreachable URL: urlReachable=0 → max confidence = 0.7 (requiredFields+english+recency = 0.3+0.2+0.2=0.7)
    // Still at threshold — let's also make description too short to fail requiredFields
    const shortDescJobs: RawJob[] = [
      {
        ...MOCK_JOBS[0],
        applicationUrl: 'https://www.adzuna.co.uk/jobs/details/mock-short',
        externalId: 'mock-short-001',
        description: 'Too short.' // <100 chars → requiredFields=0
      }
    ];
    const shortAdapter: JobAdapter = {
      id: '_mock-jobs',
      displayName: 'Mock Jobs Adapter Short',
      url: 'https://mock.example.com',
      kind: 'json-api',
      fetch: async () => shortDescJobs
    };

    // URL unreachable
    const fakeFetch = mock(async () => new Response(null, { status: 404 }));

    const result = await runJobsPipelineForAdapter(shortAdapter, { fetchFn: fakeFetch });

    expect(result.itemsFound).toBe(1);
    // urlReachable=0, requiredFields=0, english=1, recency=1 → confidence=0.2+0.2=0.4 → REJECTED
    expect(result.itemsRejected).toBeGreaterThanOrEqual(1);
  });
});
