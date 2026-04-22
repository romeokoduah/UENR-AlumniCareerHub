import type { SourceAdapter, RawScholarship } from '../types.js';

// In-repo fixture adapter. Phase-1 integration tests run the whole pipeline
// against this — no network, deterministic output. Real adapters land in
// Slice B and coexist alongside this one.

const ITEMS: RawScholarship[] = [
  {
    title: 'Test Masters Scholarship',
    description:
      'The Test Foundation offers a fully funded Masters scholarship ' +
      'for African students pursuing STEM degrees. Deadline: 30 September 2026.',
    applicationUrl: 'https://example.test/apply/masters',
    deadlineText: '30 September 2026',
    providerName: 'Test Foundation',
    tags: ['stem', 'africa']
  },
  {
    title: 'Rolling PhD Fellowship',
    description:
      'Open-call PhD fellowship, rolling admissions. Stipend: $2,000/month.',
    applicationUrl: 'https://example.test/apply/phd',
    providerName: 'Test Foundation',
    tags: ['phd', 'rolling']
  }
];

export const mockAdapter: SourceAdapter = {
  id: '_mock',
  displayName: 'Mock (fixture)',
  url: 'https://example.test/mock',
  kind: 'json-api',
  fetch: async () => ITEMS
};
