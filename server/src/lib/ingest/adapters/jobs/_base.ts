// Shared types for the jobs ingestion pipeline.
// Mirrors SourceAdapter + RawScholarship from the scholarship pipeline.

export type RawJob = {
  externalId: string;            // provider's unique id
  title: string;
  description: string;           // full JD (Adzuna returns HTML; we sanitize downstream)
  company: string;
  location: string;
  locationType: 'ONSITE' | 'REMOTE' | 'HYBRID';
  type: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'VOLUNTEER';
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  applicationUrl: string;
  postedAt?: string;             // ISO — maps to createdAt, not deadline
  industry?: string;             // from Adzuna's category
  tags?: string[];
};

export type JobAdapter = {
  id: string;
  displayName: string;
  url: string;
  kind: 'rss' | 'html' | 'json-api';
  fetch: () => Promise<RawJob[]>;
};
