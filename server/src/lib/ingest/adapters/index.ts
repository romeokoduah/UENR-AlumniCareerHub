import type { SourceAdapter } from '../types.js';
import { mockAdapter } from './_mock.js';

// Adapters added here appear automatically in cron runs. Slice B adds the
// real sources — each in its own file, registered via this array.
const ALL: SourceAdapter[] = [mockAdapter];

export function listAdapters(): SourceAdapter[] {
  return ALL.slice();
}

export function getAdapter(id: string): SourceAdapter | null {
  return ALL.find((a) => a.id === id) ?? null;
}
