// server/src/lib/ingest/reach.ts
import { FETCH_TIMEOUT_MS } from './config.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function urlReachable(
  url: string,
  fetchFn: FetchLike = fetch
): Promise<boolean> {
  if (!url) return false;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let res = await fetchFn(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    if (res.status === 405 || res.status === 403) {
      res = await fetchFn(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { range: 'bytes=0-0' }
      });
    }
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
