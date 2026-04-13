// Serialization helpers for SQLite (arrays and JSON stored as strings).

export const arr = (v: string[] | undefined): string => JSON.stringify(v ?? []);
export const parseArr = (v: string | null | undefined): string[] => {
  if (!v) return [];
  try { return JSON.parse(v) as string[]; } catch { return []; }
};
export const json = (v: unknown): string => JSON.stringify(v ?? {});
export const parseJson = <T = unknown>(v: string | null | undefined): T => {
  if (!v) return {} as T;
  try { return JSON.parse(v) as T; } catch { return {} as T; }
};

const ARRAY_FIELDS = new Set([
  'skills', 'requiredSkills', 'tags', 'expertise',
  'mentoringTopics', 'mentoringStyles', 'questions'
]);
const JSON_FIELDS = new Set(['data', 'steps']);

export function deserialize<T>(obj: T): T {
  if (obj == null) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(deserialize) as any;
  if (typeof obj !== 'object') return obj;

  const out: any = {};
  for (const [k, v] of Object.entries(obj as any)) {
    if (ARRAY_FIELDS.has(k) && typeof v === 'string') out[k] = parseArr(v);
    else if (JSON_FIELDS.has(k) && typeof v === 'string') out[k] = parseJson(v);
    else if (v instanceof Date) out[k] = v;
    else if (v && typeof v === 'object') out[k] = deserialize(v);
    else out[k] = v;
  }
  return out;
}
