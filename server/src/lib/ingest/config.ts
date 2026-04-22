// Tunables for the ingestion pipeline. Edit these to move items between
// auto-publish / review-queue / reject without redeploying adapter code.

export const VERIFICATION_WEIGHTS = {
  urlReachable: 0.15,
  requiredFields: 0.15,
  isScholarship: 0.30,
  deadlineOk: 0.20,
  englishContent: 0.10,
  categoryExtracted: 0.10
} as const;

export const PUBLISH_THRESHOLD = 0.8;
export const REVIEW_THRESHOLD = 0.5;

// Per-run drain: how many sources to process in a single /drain invocation.
// Sized for Vercel Hobby's 60s function limit at ~3s/source worst case.
export const DRAIN_BATCH_SIZE = 6;

// Per-source throttle — one request per N ms inside an adapter.
export const SOURCE_THROTTLE_MS = 2000;

// Global HTTP timeout for adapter fetches and reachability probes.
export const FETCH_TIMEOUT_MS = 5000;

// Rejected items are kept this long for audit, then purged.
export const REJECTED_RETENTION_DAYS = 30;

// Threshold below which an item fails the English heuristic.
export const ENGLISH_LETTER_RATIO = 0.6;
