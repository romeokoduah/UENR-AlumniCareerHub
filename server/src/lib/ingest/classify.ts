// server/src/lib/ingest/classify.ts
import type { RawScholarship, ClassifierResult } from './types.js';
import { aiJson as realAiJson } from '../aiProvider.js';

type AiJsonFn = typeof realAiJson;

const CLASSIFIER_SCHEMA = {
  type: 'object',
  properties: {
    isScholarship: { type: 'number' },
    category: {
      type: 'object',
      properties: {
        field: { type: 'string', nullable: true },
        region: { type: 'string', nullable: true },
        funding: { type: 'string', nullable: true }
      }
    },
    deadline: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['date', 'rolling', 'unknown'] },
        iso: { type: 'string', nullable: true }
      },
      required: ['kind']
    },
    reasoning: { type: 'string' }
  },
  required: ['isScholarship', 'category', 'deadline']
};

const FIELD_ENUM = [
  'STEM', 'Energy & Environment', 'Business', 'Agriculture',
  'Health', 'Social Sciences', 'Arts & Humanities', 'Other'
] as const;
const REGION_ENUM = ['Ghana-only', 'Africa-wide', 'Global'] as const;
const FUNDING_ENUM = [
  'Full funding', 'Partial funding', 'Stipend only', 'Travel/conference grant'
] as const;

function enumOrNull<T extends readonly string[]>(
  allowed: T, v: unknown
): T[number] | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T[number])
    : null;
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeDeadline(raw: unknown): ClassifierResult['deadline'] {
  if (!raw || typeof raw !== 'object') return { kind: 'unknown' };
  const r = raw as { kind?: unknown; iso?: unknown };
  if (r.kind === 'date' && typeof r.iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.iso)) {
    return { kind: 'date', iso: r.iso };
  }
  if (r.kind === 'rolling') return { kind: 'rolling' };
  return { kind: 'unknown' };
}

export async function classifyScholarship(
  raw: RawScholarship,
  aiJson: AiJsonFn = realAiJson
): Promise<ClassifierResult | null> {
  const prompt = [
    'You are a deterministic JSON classifier. Classify the item below as a scholarship or not,',
    'extract its category (field/region/funding), and extract a deadline if present.',
    '',
    `Title: ${raw.title}`,
    `Provider: ${raw.providerName ?? 'unknown'}`,
    `Application URL: ${raw.applicationUrl}`,
    `Deadline text (raw): ${raw.deadlineText ?? '(none provided)'}`,
    '',
    `Description:\n${raw.description.slice(0, 8000)}`,
    '',
    `Allowed field values: ${FIELD_ENUM.join(', ')}. Use null if none fit.`,
    `Allowed region values: ${REGION_ENUM.join(', ')}. Use null if unclear.`,
    `Allowed funding values: ${FUNDING_ENUM.join(', ')}. Use null if unclear.`,
    'For deadline.kind use "date" (with iso YYYY-MM-DD), "rolling" (continuous intake), or "unknown".'
  ].join('\n');

  const res = await aiJson<{
    isScholarship: number;
    category: { field?: unknown; region?: unknown; funding?: unknown };
    deadline: unknown;
    reasoning?: string;
  }>(prompt, CLASSIFIER_SCHEMA, { maxTokens: 512, temperature: 0.2 });

  if (!res) return null;

  return {
    isScholarship: clamp01(res.data.isScholarship),
    category: {
      field: enumOrNull(FIELD_ENUM, res.data.category?.field),
      region: enumOrNull(REGION_ENUM, res.data.category?.region),
      funding: enumOrNull(FUNDING_ENUM, res.data.category?.funding)
    },
    deadline: normalizeDeadline(res.data.deadline),
    reasoning: typeof res.data.reasoning === 'string' ? res.data.reasoning.trim() : ''
  };
}
