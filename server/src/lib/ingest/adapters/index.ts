import type { SourceAdapter } from '../types.js';
import { mockAdapter } from './_mock.js';
import { opportunityDeskAdapter } from './opportunitydesk.js';
import { scholarshipRegionAdapter } from './scholarshipregion.js';
import { opportunitiesForAfricansAdapter } from './opportunitiesforafricans.js';
import { scholars4devAdapter } from './scholars4dev.js';
import { opportunitiesForYouthAdapter } from './opportunitiesforyouth.js';
import { commonwealthAdapter } from './commonwealth.js';
import { rhodesAdapter } from './rhodes.js';
import { schwarzmanAdapter } from './schwarzman.js';

// Real adapters always register; the mock adapter only registers when
// INCLUDE_MOCK_ADAPTER=1 so production cron runs never ingest fixture rows.
const REAL: SourceAdapter[] = [
  opportunityDeskAdapter,
  scholarshipRegionAdapter,
  opportunitiesForAfricansAdapter,
  scholars4devAdapter,
  opportunitiesForYouthAdapter,
  commonwealthAdapter,
  rhodesAdapter,
  schwarzmanAdapter
];

function buildAll(): SourceAdapter[] {
  const out = [...REAL];
  if (process.env.INCLUDE_MOCK_ADAPTER === '1') {
    out.unshift(mockAdapter);
  }
  // Optional allowlist: comma-separated adapter ids. Useful for tests
  // (restrict to _mock) and for admin-triggered single-source debug runs.
  const filter = process.env.INGEST_ADAPTER_FILTER;
  if (filter) {
    const allow = new Set(filter.split(',').map((s) => s.trim()).filter(Boolean));
    return out.filter((a) => allow.has(a.id));
  }
  return out;
}

export function listAdapters(): SourceAdapter[] {
  return buildAll();
}

export function getAdapter(id: string): SourceAdapter | null {
  return buildAll().find((a) => a.id === id) ?? null;
}
