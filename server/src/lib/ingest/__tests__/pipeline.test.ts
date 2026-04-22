import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { prisma } from '../../prisma.js';
import { runPipelineForAdapter } from '../pipeline.js';
import { mockAdapter } from '../adapters/_mock.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('pipeline', () => {
  beforeEach(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock' } });
  });
  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock' } });
  });

  it('publishes high-confidence items and queues mid-confidence items', async () => {
    // Mock classifier: first item is clearly a scholarship; second is borderline.
    const fakeAiJson = mock(async (prompt: string) => {
      const isMasters = /Masters Scholarship/.test(prompt);
      return {
        data: {
          isScholarship: isMasters ? 0.95 : 0.65,
          category: isMasters
            ? { field: 'STEM', region: 'Africa-wide', funding: 'Full funding' }
            : { field: null, region: null, funding: null },
          deadline: isMasters
            ? { kind: 'date', iso: '2026-09-30' }
            : { kind: 'unknown' },
          reasoning: 'stub'
        },
        tokensUsed: 100,
        cached: false,
        provider: 'groq' as const
      };
    });

    // Mock fetchFn so reachability check always passes.
    const fakeFetch = mock(async () => new Response(null, { status: 200 }));

    const result = await runPipelineForAdapter(mockAdapter, {
      aiJson: fakeAiJson,
      fetchFn: fakeFetch
    });

    expect(result.itemsFound).toBe(2);
    expect(result.itemsPublished).toBeGreaterThanOrEqual(1);

    const published = await prisma.scholarship.findMany({
      where: { sourceName: '_mock', status: 'PUBLISHED' }
    });
    expect(published.length).toBeGreaterThanOrEqual(1);
    expect(published[0].source).toBe('INGESTED');
    expect(published[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('dedups on a repeat run — second run updates, does not create', async () => {
    const fakeAiJson = mock(async () => ({
      data: {
        isScholarship: 0.95,
        category: { field: 'STEM', region: 'Africa-wide', funding: 'Full funding' },
        deadline: { kind: 'date', iso: '2026-09-30' },
        reasoning: 'stub'
      },
      tokensUsed: 50, cached: false, provider: 'groq' as const
    }));
    const fakeFetch = mock(async () => new Response(null, { status: 200 }));

    await runPipelineForAdapter(mockAdapter, { aiJson: fakeAiJson, fetchFn: fakeFetch });
    const firstCount = await prisma.scholarship.count({ where: { sourceName: '_mock' } });
    await runPipelineForAdapter(mockAdapter, { aiJson: fakeAiJson, fetchFn: fakeFetch });
    const secondCount = await prisma.scholarship.count({ where: { sourceName: '_mock' } });
    expect(secondCount).toBe(firstCount);
  });
});
