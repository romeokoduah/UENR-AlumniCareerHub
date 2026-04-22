// Registry of all job adapters.
// INGEST_JOB_ADAPTER_FILTER (comma-separated adapter ids) lets you run a
// single adapter in dev or for debugging without touching code.

import type { JobAdapter } from './_base.js';
import { makeAdzunaAdapter } from './adzuna.js';

const ALL: JobAdapter[] = [
  // Ghana has no Adzuna tenant — use UK tenant with targeted keywords.
  makeAdzunaAdapter({
    id: 'adzuna-ghana',
    displayName: 'Adzuna — Ghana-based roles',
    country: 'gb',
    what: 'ghana'
  }),
  makeAdzunaAdapter({
    id: 'adzuna-remote-africa',
    displayName: 'Adzuna — Remote Africa-eligible',
    country: 'gb',
    what: 'remote africa'
  }),
  makeAdzunaAdapter({
    id: 'adzuna-remote-worldwide',
    displayName: 'Adzuna — Worldwide remote',
    country: 'us',
    what: 'remote'
  })
];

export function listJobAdapters(): JobAdapter[] {
  const filter = process.env.INGEST_JOB_ADAPTER_FILTER;
  if (filter) {
    const allow = new Set(filter.split(',').map((s) => s.trim()).filter(Boolean));
    return ALL.filter((a) => allow.has(a.id));
  }
  return ALL.slice();
}

export function getJobAdapter(id: string): JobAdapter | null {
  return listJobAdapters().find((a) => a.id === id) ?? null;
}
