// Adzuna JSON-API adapter factory.
// Free tier: 250 calls/month. One daily cron × 5 searches = ~150 calls/month.
// Ghana (gh) is not a supported Adzuna country code; we use 'gb' (UK) with a
// Ghana keyword and also surface remote/global roles relevant to Africa.

import { httpGet } from '../_base.js';
import type { RawJob, JobAdapter } from './_base.js';

export type AdzunaConfig = {
  id: string;                    // adapter slug
  displayName: string;
  country: string;               // 'gb', 'us', etc.
  what?: string;                 // keyword; optional
  resultsPerPage?: number;       // defaults to 20; max 50 per Adzuna
};

// Locally-typed Adzuna response shapes — only the fields we use.
type AdzunaResult = {
  id?: string | number;
  adref?: string;
  title?: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  created?: string;
  contract_type?: string;
  contract_time?: string;
  category?: { label?: string; tag?: string };
};

function mapContractType(
  raw: string | undefined
): RawJob['type'] {
  if (!raw) return 'FULL_TIME';
  const t = raw.toLowerCase();
  if (t.includes('part') || t.includes('part_time')) return 'PART_TIME';
  if (t.includes('contract') || t.includes('temp')) return 'CONTRACT';
  if (t.includes('intern')) return 'INTERNSHIP';
  if (t.includes('volunteer')) return 'VOLUNTEER';
  return 'FULL_TIME';
}

function adzunaCurrencyFor(country: string): string {
  const map: Record<string, string> = {
    gb: 'GBP',
    us: 'USD',
    au: 'AUD',
    ca: 'CAD',
    de: 'EUR',
    fr: 'EUR',
    br: 'BRL',
    nl: 'EUR',
    at: 'EUR',
    be: 'EUR',
    it: 'EUR',
    es: 'EUR',
    pl: 'PLN',
    sg: 'SGD',
    nz: 'NZD',
    in: 'INR',
    za: 'ZAR'
  };
  return map[country.toLowerCase()] ?? 'USD';
}

export function makeAdzunaAdapter(cfg: AdzunaConfig): JobAdapter {
  return {
    id: cfg.id,
    displayName: cfg.displayName,
    url: `https://api.adzuna.com/v1/api/jobs/${cfg.country}/search`,
    kind: 'json-api',
    fetch: async () => {
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;
      if (!appId || !appKey) {
        console.warn(`[adzuna:${cfg.id}] ADZUNA_APP_ID/KEY not set — skipping`);
        return [];
      }

      // Call page 1. Free tier is 250 calls/month, so we stay simple.
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(cfg.resultsPerPage ?? 20),
        'content-type': 'application/json'
      });
      if (cfg.what) params.set('what', cfg.what);

      const url = `https://api.adzuna.com/v1/api/jobs/${cfg.country}/search/1?${params}`;
      const res = await httpGet(url, {
        headers: { accept: 'application/json' }
      });
      if (res.status !== 200 || !res.body) return [];

      let parsed: { results?: AdzunaResult[] };
      try {
        parsed = JSON.parse(res.body) as { results?: AdzunaResult[] };
      } catch {
        return [];
      }

      const out: RawJob[] = [];
      for (const r of parsed.results ?? []) {
        if (!r.title || !r.redirect_url) continue;
        out.push({
          externalId: String(r.id ?? r.adref ?? r.redirect_url),
          title: String(r.title),
          description: String(r.description ?? ''),
          company: String(r.company?.display_name ?? ''),
          location: String(r.location?.display_name ?? ''),
          locationType: 'ONSITE',
          type: mapContractType(r.contract_type ?? r.contract_time),
          salaryMin: typeof r.salary_min === 'number' ? Math.round(r.salary_min) : undefined,
          salaryMax: typeof r.salary_max === 'number' ? Math.round(r.salary_max) : undefined,
          currency: adzunaCurrencyFor(cfg.country),
          applicationUrl: String(r.redirect_url),
          postedAt: r.created ? String(r.created) : undefined,
          industry: r.category?.label ?? undefined,
          tags: r.category?.tag ? [String(r.category.tag)] : []
        });
      }
      return out;
    }
  };
}
