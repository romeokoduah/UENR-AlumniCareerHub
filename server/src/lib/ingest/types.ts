// Shared types for the scholarship ingestion pipeline. Every primitive
// (normalize, verify, classify, dedup) operates on one of these shapes.

export type RawScholarship = {
  title: string;
  description: string;
  applicationUrl: string;
  deadlineText?: string;
  providerName?: string;
  tags?: string[];
  rawHtml?: string;
};

export type SourceAdapter = {
  id: string;
  displayName: string;
  url: string;
  kind: 'rss' | 'html' | 'json-api';
  fetch: () => Promise<RawScholarship[]>;
};

export type ClassifierResult = {
  isScholarship: number;  // 0..1
  category: {
    field: 'STEM' | 'Energy & Environment' | 'Business' | 'Agriculture'
         | 'Health' | 'Social Sciences' | 'Arts & Humanities' | 'Other' | null;
    region: 'Ghana-only' | 'Africa-wide' | 'Global' | null;
    funding: 'Full funding' | 'Partial funding' | 'Stipend only'
           | 'Travel/conference grant' | null;
  };
  deadline:
    | { kind: 'date'; iso: string }
    | { kind: 'rolling' }
    | { kind: 'unknown' };
  reasoning: string;
};

export type VerificationSignals = {
  urlReachable: number;       // 0 or 1
  requiredFields: number;     // 0 or 1
  isScholarship: number;      // 0..1 from classifier
  deadlineOk: number;         // 0 | 0.8 | 1
  englishContent: number;     // 0 or 1
  categoryExtracted: number;  // 0..1 (0.5 per non-null facet, rounded to 4)
};

export type PipelineDecision = 'PUBLISHED' | 'PENDING_REVIEW' | 'REJECTED';
