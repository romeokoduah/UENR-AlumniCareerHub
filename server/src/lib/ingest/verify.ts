// server/src/lib/ingest/verify.ts
import type { VerificationSignals, PipelineDecision } from './types.js';
import {
  VERIFICATION_WEIGHTS,
  PUBLISH_THRESHOLD,
  REVIEW_THRESHOLD
} from './config.js';

export function scoreConfidence(s: VerificationSignals): number {
  const w = VERIFICATION_WEIGHTS;
  return (
    s.urlReachable      * w.urlReachable      +
    s.requiredFields    * w.requiredFields    +
    s.isScholarship     * w.isScholarship     +
    s.deadlineOk        * w.deadlineOk        +
    s.englishContent    * w.englishContent    +
    s.categoryExtracted * w.categoryExtracted
  );
}

export function decisionFor(confidence: number): PipelineDecision {
  if (confidence >= PUBLISH_THRESHOLD) return 'PUBLISHED';
  if (confidence >= REVIEW_THRESHOLD) return 'PENDING_REVIEW';
  return 'REJECTED';
}
