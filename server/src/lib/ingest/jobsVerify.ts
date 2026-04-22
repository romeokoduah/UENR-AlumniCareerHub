// Per-item verification for the jobs ingestion pipeline.
// Weights differ from the scholarship pipeline (no classifier, no deadline check).
// Distinct from verify.ts intentionally — the two pipelines will diverge further.

import type { PipelineDecision } from './types.js';

// Weight budget must sum to 1.0.
const JOB_WEIGHTS = {
  urlReachable:    0.3,
  requiredFields:  0.3,
  englishContent:  0.2,
  postedRecency:   0.2
} as const;

const JOB_PUBLISH_THRESHOLD = 0.7;
const JOB_REVIEW_THRESHOLD  = 0.5;

export type JobVerificationSignals = {
  urlReachable:   number; // 0 | 1
  requiredFields: number; // 0 | 1
  englishContent: number; // 0 | 1
  postedRecency:  number; // 0 | 0.5 | 1
};

export function confidenceForJob(s: JobVerificationSignals): number {
  const w = JOB_WEIGHTS;
  return (
    s.urlReachable   * w.urlReachable   +
    s.requiredFields * w.requiredFields +
    s.englishContent * w.englishContent +
    s.postedRecency  * w.postedRecency
  );
}

export function decisionForJob(confidence: number): PipelineDecision {
  if (confidence >= JOB_PUBLISH_THRESHOLD) return 'PUBLISHED';
  if (confidence >= JOB_REVIEW_THRESHOLD)  return 'PENDING_REVIEW';
  return 'REJECTED';
}

// Compute recency score from an ISO date string.
// 1.0 if within 30 days, 0.5 within 90 days, 0 otherwise.
export function postedRecencyScore(postedAt: string | undefined): number {
  if (!postedAt) return 0;
  const posted = new Date(postedAt);
  if (isNaN(posted.getTime())) return 0;
  const ageMs = Date.now() - posted.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return 1;
  if (ageDays <= 90) return 0.5;
  return 0;
}
