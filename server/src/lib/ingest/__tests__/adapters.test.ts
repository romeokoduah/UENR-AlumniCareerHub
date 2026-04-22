import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getAdapter, listAdapters } from '../adapters/index.js';

const prev = process.env.INCLUDE_MOCK_ADAPTER;
beforeAll(() => { process.env.INCLUDE_MOCK_ADAPTER = '1'; });
afterAll(() => {
  if (prev === undefined) delete process.env.INCLUDE_MOCK_ADAPTER;
  else process.env.INCLUDE_MOCK_ADAPTER = prev;
});

describe('adapter registry', () => {
  it('lists at least the mock adapter', () => {
    const ids = listAdapters().map((a) => a.id);
    expect(ids).toContain('_mock');
  });

  it('getAdapter returns by id', () => {
    const a = getAdapter('_mock');
    expect(a?.id).toBe('_mock');
  });

  it('getAdapter returns null for unknown id', () => {
    expect(getAdapter('nope')).toBeNull();
  });

  it('_mock adapter fetches returns at least one RawScholarship', async () => {
    const a = getAdapter('_mock')!;
    const items = await a.fetch();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeDefined();
    expect(items[0].applicationUrl).toMatch(/^https?:\/\//);
  });
});
