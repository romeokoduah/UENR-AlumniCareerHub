// server/src/lib/ingest/__tests__/reach.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { urlReachable } from '../reach.js';

describe('urlReachable', () => {
  it('returns true on 200', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(true);
  });

  it('returns true on 3xx redirect', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 301 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(true);
  });

  it('returns false on 404', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 404 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(false);
  });

  it('returns false on 5xx', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 502 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(false);
  });

  it('returns false on thrown error (network / timeout)', async () => {
    const fetchMock = mock(async () => { throw new Error('boom'); });
    expect(await urlReachable('https://example.com', fetchMock)).toBe(false);
  });

  it('returns false on empty/invalid URL', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    expect(await urlReachable('', fetchMock)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
