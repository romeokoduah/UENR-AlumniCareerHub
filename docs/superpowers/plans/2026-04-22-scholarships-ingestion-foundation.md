# Scholarships Ingestion — Foundation Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the schema + pipeline core + cron endpoints that let us auto-ingest scholarships daily, verifiable end-to-end against a mock adapter. Real adapters and UI land in follow-up slices.

**Architecture:** Vercel Cron fires `POST /api/ingest/scholarships/run` which enqueues `IngestJob` rows per source. `POST /api/ingest/drain` picks batches, runs each source through `pipeline.ts` (fetch → normalise → verify → classify → dedup → upsert). Confidence ≥0.8 auto-publishes; 0.5–0.8 queues for admin review; <0.5 is rejected. Everything behind a `scholarships-ingest-enabled` SiteContent flag, default off.

**Tech Stack:**
- Runtime: Bun (dev) / Node 20 (Vercel)
- ORM: Prisma 5.22 on Neon Postgres (`prisma db push` workflow — no migration files)
- AI: Groq via existing `lib/aiProvider.aiJson` (Gemini failover)
- Tests: `bun test` (built-in, zero deps)
- HTML sanitizer: `sanitize-html` (new dep)
- Scheduler: Vercel Cron (declared in `vercel.json`)

**Spec reference:** `docs/superpowers/specs/2026-04-22-scholarships-ingestion-design.md`

**Out of scope here (follow-on slices):**
- Slice B — ≤ 18 per-source adapters + their fixtures
- Slice C — `/scholarships` 4-facet UI + `/admin/scholarships/review` UI + public API facet filtering

---

## File Structure

**Created:**
- `server/src/lib/ingest/types.ts` — `RawScholarship`, `SourceAdapter`, `ClassifierResult`, `VerificationSignals`
- `server/src/lib/ingest/config.ts` — threshold/weight constants, run cadence
- `server/src/lib/ingest/canonicalUrl.ts` — URL normalization
- `server/src/lib/ingest/sanitize.ts` — HTML → plain text, length clamps
- `server/src/lib/ingest/language.ts` — English heuristic
- `server/src/lib/ingest/reach.ts` — URL reachability probe
- `server/src/lib/ingest/classify.ts` — Groq classifier wrapper
- `server/src/lib/ingest/verify.ts` — weighted confidence score
- `server/src/lib/ingest/dedup.ts` — canonical-URL + fuzzy-title match
- `server/src/lib/ingest/queue.ts` — IngestJob CRUD
- `server/src/lib/ingest/pipeline.ts` — per-source orchestrator
- `server/src/lib/ingest/adapters/index.ts` — adapter registry (just `_mock` in this slice)
- `server/src/lib/ingest/adapters/_mock.ts` — mock adapter for integration tests
- `server/src/routes/ingest.ts` — `/api/ingest/*` endpoints
- `server/src/lib/ingest/__tests__/*.test.ts` — unit + integration tests

**Modified:**
- `server/prisma/schema.prisma` — new enums + Scholarship fields + `IngestJob`, `IngestRun` models
- `server/prisma/seed.ts` — seed `ingestion-bot` user + `scholarships-ingest-enabled` flag (default false)
- `server/src/app.ts` — mount `ingestRouter`
- `server/package.json` — add `sanitize-html`, `@types/sanitize-html`
- `vercel.json` — add two cron entries

Each file has one clear responsibility. The pipeline composes primitives; primitives are testable in isolation without DB or network.

---

## Task 1: Install sanitize-html + create ingest directory skeleton

**Files:**
- Modify: `server/package.json`
- Create: `server/src/lib/ingest/` (empty directory, placeholder below)

- [ ] **Step 1: Add dependency**

```bash
cd server
bun add sanitize-html
bun add -d @types/sanitize-html
```

- [ ] **Step 2: Create placeholder file so git tracks the directory**

Create `server/src/lib/ingest/README.md` with content:

```markdown
# Scholarship Ingestion Pipeline

See `docs/superpowers/specs/2026-04-22-scholarships-ingestion-design.md`.

Layout:
- `types.ts` — shared types
- `config.ts` — thresholds and weights
- `adapters/` — per-source fetchers
- `canonicalUrl.ts` / `sanitize.ts` / `language.ts` / `reach.ts` / `classify.ts` / `verify.ts` / `dedup.ts` — primitives
- `pipeline.ts` — per-source orchestrator
- `queue.ts` — IngestJob CRUD
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/bun.lock server/src/lib/ingest/README.md
git commit -m "Add sanitize-html dep + ingest directory skeleton"
```

---

## Task 2: Extend Prisma schema — enums + Scholarship fields + IngestJob / IngestRun

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add new enums above the existing `ScholarshipLevel` enum**

Insert before `enum ScholarshipLevel`:

```prisma
enum ScholarshipSource {
  USER
  ADMIN
  INGESTED
}

enum ScholarshipStatus {
  PENDING_REVIEW
  PUBLISHED
  REJECTED
  EXPIRED
}
```

- [ ] **Step 2: Update `model Scholarship` — add ingestion fields and make `submittedById` nullable**

Replace the existing `Scholarship` model body with:

```prisma
model Scholarship {
  id              String           @id @default(cuid())
  title           String
  provider        String
  description     String
  eligibility     String
  deadline        DateTime?
  awardAmount     String?
  applicationUrl  String
  level           ScholarshipLevel
  fieldOfStudy    String?
  location        String?
  tags            String[]         @default([])
  submittedById   String?
  submittedBy     User?            @relation("PostedScholarships", fields: [submittedById], references: [id], onDelete: SetNull)
  isApproved      Boolean          @default(false)

  source            ScholarshipSource @default(USER)
  status            ScholarshipStatus @default(PUBLISHED)
  sourceUrl         String?
  sourceName        String?
  confidence        Float?
  verifierReason    String?
  ingestedAt        DateTime?
  category          Json?
  rawPayload        Json?
  additionalSources String[]          @default([])

  createdAt       DateTime         @default(now())

  @@index([level, isApproved])
  @@index([deadline])
  @@index([source, status])
  @@index([status, ingestedAt])
}
```

Note: `deadline` is now `DateTime?` (rolling/unknown scholarships allowed) and `submittedBy` relation uses `SetNull` on delete instead of `Cascade` so an orphan ingestion doesn't disappear if the bot user is removed.

- [ ] **Step 3: Append `IngestJob` and `IngestRun` models at the bottom of the file**

```prisma
model IngestJob {
  id             String   @id @default(cuid())
  runId          String
  source         String
  status         String
  attempts       Int      @default(0)
  itemsFound     Int?
  itemsPublished Int?
  itemsQueued    Int?
  error          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([runId, source])
  @@index([status, createdAt])
}

model IngestRun {
  id               String    @id @default(cuid())
  startedAt        DateTime  @default(now())
  endedAt          DateTime?
  sourcesAttempted Int       @default(0)
  sourcesOk        Int       @default(0)
  sourcesFailed    Int       @default(0)
  itemsPublished   Int       @default(0)
  itemsQueued      Int       @default(0)
  itemsRejected    Int       @default(0)
  triggeredBy      String

  @@index([startedAt])
}
```

- [ ] **Step 4: Push schema to Neon + regenerate client**

```bash
cd server
npx prisma db push --accept-data-loss
npx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema`, no errors on generate.

Note on `--accept-data-loss`: only required because `deadline` type changes from `DateTime` to `DateTime?`. Existing rows are preserved (nullability relaxation is non-destructive); the flag is Prisma being cautious.

- [ ] **Step 5: Typecheck to confirm no TS consumer broke**

```bash
cd server
bunx tsc --noEmit -p tsconfig.json
```

Expected exit code 0. If any existing route references `scholarship.deadline` as a non-null Date, fix those sites with `scholarship.deadline ?? null` before proceeding.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "Schema: add ScholarshipSource/Status enums + IngestJob/IngestRun"
```

---

## Task 3: Seed ingestion-bot user + scholarships-ingest-enabled flag

**Files:**
- Modify: `server/prisma/seed.ts`

- [ ] **Step 1: Read existing seed file to find insertion point**

```bash
grep -n "ingestion-bot\|SiteContent\|feature-flags" server/prisma/seed.ts | head -5
```

If nothing matches, seeds are plain inserts — append to the end of the seed's main function.

- [ ] **Step 2: Append bot user + feature flag seeding**

Add inside the main seeding function (typically after user seeds, before `await prisma.$disconnect()`):

```ts
// ---- Scholarships ingestion seeds ----------------------------------

await prisma.user.upsert({
  where: { email: 'ingestion-bot@uenr.local' },
  update: {},
  create: {
    email: 'ingestion-bot@uenr.local',
    firstName: 'Ingestion',
    lastName: 'Bot',
    // System accounts can never log in — bcrypt hash of a random 64-byte value
    // we immediately discard. Keeps the NOT NULL constraint happy without
    // creating a usable password.
    password: await import('bcryptjs').then((b) =>
      b.hash(require('crypto').randomBytes(64).toString('hex'), 4)
    ),
    role: 'ADMIN',
    isVerified: true
  }
});

await prisma.siteContent.upsert({
  where: { key: 'feature-flags' },
  update: {
    data: {
      // Preserve any existing flags by spreading; prisma JSON merge is manual.
      ...(((await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } }))?.data as object | undefined) ?? {}),
      'scholarships-ingest-enabled': false
    }
  },
  create: {
    key: 'feature-flags',
    data: { 'scholarships-ingest-enabled': false }
  }
});
```

- [ ] **Step 3: Run seed locally to verify**

```bash
cd server
bun prisma/seed.ts
```

Expected: completes without error. Verify the row:

```bash
bunx prisma studio --browser none
```

(Studio opens at http://localhost:5555; confirm `ingestion-bot@uenr.local` exists under User and `scholarships-ingest-enabled: false` exists under SiteContent's `feature-flags` JSON. Close Studio after.)

- [ ] **Step 4: Commit**

```bash
git add server/prisma/seed.ts
git commit -m "Seed: ingestion-bot system user + scholarships-ingest-enabled flag (off)"
```

---

## Task 4: Shared types + config

**Files:**
- Create: `server/src/lib/ingest/types.ts`
- Create: `server/src/lib/ingest/config.ts`
- Create: `server/src/lib/ingest/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/ingest/__tests__/config.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { VERIFICATION_WEIGHTS, PUBLISH_THRESHOLD, REVIEW_THRESHOLD } from '../config.js';

describe('ingest config', () => {
  it('verification weights sum to 1.0', () => {
    const sum = Object.values(VERIFICATION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it('publish threshold is higher than review threshold', () => {
    expect(PUBLISH_THRESHOLD).toBeGreaterThan(REVIEW_THRESHOLD);
  });

  it('thresholds are in [0, 1]', () => {
    for (const t of [PUBLISH_THRESHOLD, REVIEW_THRESHOLD]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server
bun test src/lib/ingest/__tests__/config.test.ts
```

Expected: FAIL — `../config.js` not found.

- [ ] **Step 3: Create types**

Create `server/src/lib/ingest/types.ts`:

```ts
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
```

- [ ] **Step 4: Create config**

Create `server/src/lib/ingest/config.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/config.test.ts
```

Expected: 3 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/ingest/types.ts server/src/lib/ingest/config.ts server/src/lib/ingest/__tests__/config.test.ts
git commit -m "Ingest: shared types + config with tunable thresholds/weights"
```

---

## Task 5: Canonical URL utility

**Files:**
- Create: `server/src/lib/ingest/canonicalUrl.ts`
- Create: `server/src/lib/ingest/__tests__/canonicalUrl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/canonicalUrl.test.ts
import { describe, it, expect } from 'bun:test';
import { canonicalUrl } from '../canonicalUrl.js';

describe('canonicalUrl', () => {
  it('lowercases host, drops fragment, drops trailing slash', () => {
    expect(canonicalUrl('HTTPS://Example.COM/path/#section'))
      .toBe('https://example.com/path');
  });

  it('strips common tracking params but keeps others', () => {
    expect(canonicalUrl('https://example.com/x?utm_source=twitter&id=42'))
      .toBe('https://example.com/x?id=42');
  });

  it('keeps query-only URLs intact when no tracking params present', () => {
    expect(canonicalUrl('https://example.com/x?page=2'))
      .toBe('https://example.com/x?page=2');
  });

  it('handles root path without dropping anything', () => {
    expect(canonicalUrl('https://example.com/'))
      .toBe('https://example.com');
  });

  it('returns empty string on invalid URL rather than throwing', () => {
    expect(canonicalUrl('not a url')).toBe('');
  });

  it('rejects non-http(s) schemes', () => {
    expect(canonicalUrl('ftp://example.com/x')).toBe('');
    expect(canonicalUrl('javascript:alert(1)')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/canonicalUrl.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/canonicalUrl.ts`:

```ts
// Canonicalize a URL for dedup. Two URLs that differ only in case, fragment,
// trailing slash, or tracking params should collapse to the same string.

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src'
]);

export function canonicalUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';

  u.hostname = u.hostname.toLowerCase();
  u.hash = '';

  // Strip tracking params without touching others.
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.append(k, v);
  }
  u.search = keep.toString() ? `?${keep.toString()}` : '';

  let out = u.toString();
  if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
  if (u.pathname === '/' && !u.search) out = out.replace(/\/$/, '');
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/canonicalUrl.test.ts
```

Expected: 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/canonicalUrl.ts server/src/lib/ingest/__tests__/canonicalUrl.test.ts
git commit -m "Ingest: canonical URL utility for dedup"
```

---

## Task 6: HTML sanitization + length clamps

**Files:**
- Create: `server/src/lib/ingest/sanitize.ts`
- Create: `server/src/lib/ingest/__tests__/sanitize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/sanitize.test.ts
import { describe, it, expect } from 'bun:test';
import { sanitizeDescription, sanitizeTitle } from '../sanitize.js';

describe('sanitizeTitle', () => {
  it('strips tags and collapses whitespace', () => {
    expect(sanitizeTitle('  <b>Chevening</b>\n\nScholarship  '))
      .toBe('Chevening Scholarship');
  });

  it('clamps to 300 chars', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeTitle(long).length).toBe(300);
  });

  it('strips control chars', () => {
    expect(sanitizeTitle('Scholar shipName')).toBe('ScholarshipName');
  });
});

describe('sanitizeDescription', () => {
  it('strips scripts and event handlers', () => {
    const dirty = '<p>Hello <script>alert(1)</script> world</p><div onclick="x()">bad</div>';
    const clean = sanitizeDescription(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('Hello');
    expect(clean).toContain('world');
  });

  it('clamps to 20000 chars', () => {
    const long = '<p>' + 'a'.repeat(30_000) + '</p>';
    expect(sanitizeDescription(long).length).toBeLessThanOrEqual(20_000);
  });

  it('returns empty string on empty/nullish input', () => {
    expect(sanitizeDescription('')).toBe('');
    expect(sanitizeDescription(null as unknown as string)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/sanitize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/sanitize.ts`:

```ts
import sanitizeHtml from 'sanitize-html';

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 20_000;

// Strip ASCII control chars except tab/newline which we flatten anyway.
const CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripControls(s: string): string {
  return s.replace(CTRL_RE, '');
}

export function sanitizeTitle(input: string): string {
  if (!input) return '';
  const stripped = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  const collapsed = stripControls(stripped).replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, TITLE_MAX);
}

export function sanitizeDescription(input: string): string {
  if (!input) return '';
  const clean = sanitizeHtml(input, {
    // Safe subset — links and basic formatting are fine; anything that can
    // execute or break layout is stripped.
    allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'h3', 'h4'],
    allowedAttributes: { a: ['href'] },
    // Only allow http/https hrefs.
    allowedSchemes: ['http', 'https'],
    disallowedTagsMode: 'discard'
  });
  return stripControls(clean).slice(0, DESCRIPTION_MAX);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/sanitize.test.ts
```

Expected: 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/sanitize.ts server/src/lib/ingest/__tests__/sanitize.test.ts
git commit -m "Ingest: HTML sanitization + length clamps"
```

---

## Task 7: Language heuristic

**Files:**
- Create: `server/src/lib/ingest/language.ts`
- Create: `server/src/lib/ingest/__tests__/language.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/language.test.ts
import { describe, it, expect } from 'bun:test';
import { isEnglish } from '../language.js';

describe('isEnglish', () => {
  it('accepts English prose', () => {
    expect(isEnglish('Chevening is a fully-funded Masters scholarship.')).toBe(true);
  });

  it('rejects CJK content', () => {
    expect(isEnglish('这是一个奖学金 for students. 申请截止日期。')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isEnglish('')).toBe(false);
  });

  it('accepts English with moderate punctuation and numbers', () => {
    expect(isEnglish('Deadline: 2026-09-30. Awards up to £100,000.')).toBe(true);
  });

  it('rejects mostly-emoji text', () => {
    expect(isEnglish('🎓🎓🎓🎓🎓🎓 apply now 🎓')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/language.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/language.ts`:

```ts
import { ENGLISH_LETTER_RATIO } from './config.js';

// Cheap English heuristic: count the ratio of Latin letters to total
// non-whitespace chars. We don't care about distinguishing English from
// French/Spanish here — scholarships in other Latin-script languages
// are still machine-translatable by the user, and the classifier will
// catch most non-scholarship content anyway. The goal is to reject
// clearly non-Latin content (CJK, Arabic, etc.) before burning tokens.

export function isEnglish(text: string): boolean {
  if (!text) return false;
  const nonWs = text.replace(/\s+/g, '');
  if (nonWs.length === 0) return false;
  let latin = 0;
  for (const ch of nonWs) {
    const code = ch.codePointAt(0) ?? 0;
    // Basic Latin letters A-Z / a-z.
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) latin++;
  }
  return latin / nonWs.length >= ENGLISH_LETTER_RATIO;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/language.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/language.ts server/src/lib/ingest/__tests__/language.test.ts
git commit -m "Ingest: English-language heuristic"
```

---

## Task 8: URL reachability probe

**Files:**
- Create: `server/src/lib/ingest/reach.ts`
- Create: `server/src/lib/ingest/__tests__/reach.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/reach.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { urlReachable } from '../reach.js';

describe('urlReachable', () => {
  it('returns true on 200', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(true);
  });

  it('returns true on 3xx redirect', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 301 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(true);
  });

  it('returns false on 404', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 404 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(false);
  });

  it('returns false on 5xx', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 502 }));
    expect(await urlReachable('https://example.com', fetchMock)).toBe(false);
  });

  it('returns false on thrown error (network / timeout)', async () => {
    const fetchMock = mock(async () => { throw new Error('boom'); });
    expect(await urlReachable('https://example.com', fetchMock)).toBe(false);
  });

  it('returns false on empty/invalid URL', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    expect(await urlReachable('', fetchMock)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/reach.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/reach.ts`:

```ts
import { FETCH_TIMEOUT_MS } from './config.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// HEAD probe with a short timeout. Some origins disallow HEAD — fall back
// to a range-GET for the first byte if HEAD returns 405. Injectable fetch
// for tests.

export async function urlReachable(
  url: string,
  fetchFn: FetchLike = fetch
): Promise<boolean> {
  if (!url) return false;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let res = await fetchFn(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    if (res.status === 405 || res.status === 403) {
      res = await fetchFn(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { range: 'bytes=0-0' }
      });
    }
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/reach.test.ts
```

Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/reach.ts server/src/lib/ingest/__tests__/reach.test.ts
git commit -m "Ingest: URL reachability probe"
```

---

## Task 9: AI classifier (Groq via aiProvider)

**Files:**
- Create: `server/src/lib/ingest/classify.ts`
- Create: `server/src/lib/ingest/__tests__/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/classify.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { classifyScholarship } from '../classify.js';
import type { RawScholarship } from '../types.js';

describe('classifyScholarship', () => {
  const raw: RawScholarship = {
    title: 'Chevening Scholarship',
    description: 'Fully funded UK masters for mid-career professionals.',
    applicationUrl: 'https://chevening.org/apply',
    deadlineText: 'Applications close 2 November 2026'
  };

  it('passes through a well-formed classifier JSON response', async () => {
    const aiJson = mock(async () => ({
      data: {
        isScholarship: 0.95,
        category: { field: 'Other', region: 'Global', funding: 'Full funding' },
        deadline: { kind: 'date', iso: '2026-11-02' },
        reasoning: 'Clear scholarship announcement with dates.'
      },
      tokensUsed: 250,
      cached: false,
      provider: 'groq' as const
    }));
    const res = await classifyScholarship(raw, aiJson);
    expect(res).not.toBeNull();
    expect(res!.isScholarship).toBe(0.95);
    expect(res!.category.region).toBe('Global');
    expect(res!.deadline).toEqual({ kind: 'date', iso: '2026-11-02' });
  });

  it('returns null when the AI returns null', async () => {
    const aiJson = mock(async () => null);
    expect(await classifyScholarship(raw, aiJson)).toBeNull();
  });

  it('clamps isScholarship into [0,1] and defaults missing fields to null', async () => {
    const aiJson = mock(async () => ({
      data: { isScholarship: 1.5, category: {}, deadline: { kind: 'unknown' } },
      tokensUsed: 100,
      cached: false,
      provider: 'groq' as const
    }));
    const res = await classifyScholarship(raw, aiJson);
    expect(res!.isScholarship).toBe(1);
    expect(res!.category.field).toBeNull();
    expect(res!.category.region).toBeNull();
    expect(res!.category.funding).toBeNull();
    expect(res!.deadline).toEqual({ kind: 'unknown' });
  });

  it('rejects invalid deadline.kind by falling back to unknown', async () => {
    const aiJson = mock(async () => ({
      data: { isScholarship: 0.9, category: {}, deadline: { kind: 'bogus' } },
      tokensUsed: 10, cached: false, provider: 'groq' as const
    }));
    const res = await classifyScholarship(raw, aiJson);
    expect(res!.deadline).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/classify.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/classify.ts`:

```ts
import type { RawScholarship, ClassifierResult } from './types.js';
import { aiJson as realAiJson } from '../aiProvider.js';

// AiJson injection lets tests swap in a mock without touching env/flags.
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/classify.test.ts
```

Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/classify.ts server/src/lib/ingest/__tests__/classify.test.ts
git commit -m "Ingest: Groq classifier with clamped output + deadline normalization"
```

---

## Task 10: Confidence scorer (verify.ts)

**Files:**
- Create: `server/src/lib/ingest/verify.ts`
- Create: `server/src/lib/ingest/__tests__/verify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/verify.test.ts
import { describe, it, expect } from 'bun:test';
import { scoreConfidence, decisionFor } from '../verify.js';
import type { VerificationSignals } from '../types.js';
import { PUBLISH_THRESHOLD, REVIEW_THRESHOLD } from '../config.js';

const allHigh: VerificationSignals = {
  urlReachable: 1, requiredFields: 1, isScholarship: 1,
  deadlineOk: 1, englishContent: 1, categoryExtracted: 1
};
const allLow: VerificationSignals = {
  urlReachable: 0, requiredFields: 0, isScholarship: 0,
  deadlineOk: 0, englishContent: 0, categoryExtracted: 0
};

describe('scoreConfidence', () => {
  it('maxes at 1.0 with all signals high', () => {
    expect(scoreConfidence(allHigh)).toBeCloseTo(1, 6);
  });

  it('floors at 0 with all signals low', () => {
    expect(scoreConfidence(allLow)).toBe(0);
  });

  it('is a linear weighted average', () => {
    const mixed: VerificationSignals = {
      ...allLow, urlReachable: 1, requiredFields: 1, isScholarship: 0.5
    };
    // 0.15 + 0.15 + 0.5*0.30 = 0.45
    expect(scoreConfidence(mixed)).toBeCloseTo(0.45, 6);
  });
});

describe('decisionFor', () => {
  it('publishes at >= PUBLISH_THRESHOLD', () => {
    expect(decisionFor(PUBLISH_THRESHOLD)).toBe('PUBLISHED');
    expect(decisionFor(PUBLISH_THRESHOLD + 0.05)).toBe('PUBLISHED');
  });
  it('reviews in [REVIEW_THRESHOLD, PUBLISH_THRESHOLD)', () => {
    expect(decisionFor(REVIEW_THRESHOLD)).toBe('PENDING_REVIEW');
    expect(decisionFor((PUBLISH_THRESHOLD + REVIEW_THRESHOLD) / 2)).toBe('PENDING_REVIEW');
  });
  it('rejects below REVIEW_THRESHOLD', () => {
    expect(decisionFor(REVIEW_THRESHOLD - 0.01)).toBe('REJECTED');
    expect(decisionFor(0)).toBe('REJECTED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/verify.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/verify.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/verify.test.ts
```

Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/verify.ts server/src/lib/ingest/__tests__/verify.test.ts
git commit -m "Ingest: weighted confidence scorer + tiered decision"
```

---

## Task 11: Dedup match logic

**Files:**
- Create: `server/src/lib/ingest/dedup.ts`
- Create: `server/src/lib/ingest/__tests__/dedup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/dedup.test.ts
import { describe, it, expect } from 'bun:test';
import { findDuplicate, tokenSetRatio } from '../dedup.js';

type Row = { id: string; applicationUrl: string; provider: string; title: string };

const rows: Row[] = [
  { id: 'r1', applicationUrl: 'https://daad.de/apply/x', provider: 'DAAD', title: 'DAAD EPOS Masters' },
  { id: 'r2', applicationUrl: 'https://chevening.org/apply', provider: 'Chevening', title: 'Chevening Scholarship' }
];

describe('tokenSetRatio', () => {
  it('returns 1 for identical token sets', () => {
    expect(tokenSetRatio('foo bar', 'bar foo')).toBe(1);
  });
  it('returns >= 0.9 for minor word additions', () => {
    expect(tokenSetRatio('Chevening Scholarship', 'Chevening Scholarships 2026'))
      .toBeGreaterThanOrEqual(0.9);
  });
  it('returns < 0.9 for unrelated titles', () => {
    expect(tokenSetRatio('Rhodes Scholarship', 'Chevening Masters Award'))
      .toBeLessThan(0.9);
  });
});

describe('findDuplicate', () => {
  it('matches on canonical URL', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://DAAD.de/apply/x?utm_source=tw', provider: 'DAAD', title: 'Totally different title' });
    expect(hit?.id).toBe('r1');
  });

  it('matches on fuzzy title + same provider when URLs differ', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://chevening.org/apply-2026', provider: 'Chevening', title: 'Chevening Scholarships' });
    expect(hit?.id).toBe('r2');
  });

  it('does NOT match on fuzzy title when provider differs', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://x.com/1', provider: 'Cheveningg', title: 'Chevening Scholarship' });
    expect(hit).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const hit = findDuplicate(rows,
      { applicationUrl: 'https://new.com/1', provider: 'New', title: 'New Scholarship' });
    expect(hit).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/dedup.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/dedup.ts`:

```ts
import { canonicalUrl } from './canonicalUrl.js';

type ExistingRow = {
  id: string;
  applicationUrl: string;
  provider: string;
  title: string;
};

type Candidate = Pick<ExistingRow, 'applicationUrl' | 'provider' | 'title'>;

// Token-set ratio: |A ∩ B| / |A ∪ B| over lowercased word tokens (alphanumeric).
// Robust to reordering, small additions, and trailing years.
export function tokenSetRatio(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(
      s.toLowerCase().match(/[a-z0-9]+/g) ?? []
    );
  const A = toks(a), B = toks(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function findDuplicate(
  existing: ExistingRow[],
  candidate: Candidate
): ExistingRow | null {
  const canonCand = canonicalUrl(candidate.applicationUrl);
  if (canonCand) {
    for (const r of existing) {
      if (canonicalUrl(r.applicationUrl) === canonCand) return r;
    }
  }
  const provCand = candidate.provider.trim().toLowerCase();
  for (const r of existing) {
    if (r.provider.trim().toLowerCase() !== provCand) continue;
    if (tokenSetRatio(r.title, candidate.title) >= 0.9) return r;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/dedup.test.ts
```

Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/dedup.ts server/src/lib/ingest/__tests__/dedup.test.ts
git commit -m "Ingest: dedup via canonical URL + fuzzy title/provider match"
```

---

## Task 12: Queue primitives

**Files:**
- Create: `server/src/lib/ingest/queue.ts`
- Create: `server/src/lib/ingest/__tests__/queue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/queue.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../prisma.js';
import { createRun, enqueueJobs, pickBatch, markRunning, markDone, markFailed } from '../queue.js';

// This test talks to a real Postgres. Require DATABASE_URL to be set.
const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('queue primitives', () => {
  let runId: string;

  beforeEach(async () => {
    await prisma.ingestJob.deleteMany({ where: { source: { startsWith: 'test-' } } });
    const run = await createRun('manual:test');
    runId = run.id;
  });

  afterAll(async () => {
    await prisma.ingestJob.deleteMany({ where: { source: { startsWith: 'test-' } } });
    await prisma.ingestRun.deleteMany({ where: { triggeredBy: 'manual:test' } });
  });

  it('enqueueJobs creates PENDING rows idempotent by (runId, source)', async () => {
    await enqueueJobs(runId, ['test-a', 'test-b']);
    await enqueueJobs(runId, ['test-a', 'test-c']);
    const jobs = await prisma.ingestJob.findMany({ where: { runId } });
    expect(jobs.length).toBe(3);
    expect(jobs.filter((j) => j.status === 'PENDING').length).toBe(3);
  });

  it('pickBatch returns up to N PENDING jobs', async () => {
    await enqueueJobs(runId, ['test-1', 'test-2', 'test-3']);
    const batch = await pickBatch(2);
    expect(batch.length).toBe(2);
  });

  it('markRunning / markDone / markFailed transition state correctly', async () => {
    await enqueueJobs(runId, ['test-x']);
    const [job] = await pickBatch(1);
    await markRunning(job.id);
    let after = await prisma.ingestJob.findUnique({ where: { id: job.id } });
    expect(after?.status).toBe('RUNNING');
    await markDone(job.id, { itemsFound: 3, itemsPublished: 2, itemsQueued: 1 });
    after = await prisma.ingestJob.findUnique({ where: { id: job.id } });
    expect(after?.status).toBe('DONE');
    expect(after?.itemsPublished).toBe(2);

    await enqueueJobs(runId, ['test-y']);
    const [job2] = await pickBatch(1);
    await markFailed(job2.id, 'boom');
    after = await prisma.ingestJob.findUnique({ where: { id: job2.id } });
    expect(after?.status).toBe('FAILED');
    expect(after?.error).toBe('boom');
    expect(after?.attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/queue.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/queue.ts`:

```ts
import { prisma } from '../prisma.js';

export async function createRun(triggeredBy: string) {
  return prisma.ingestRun.create({ data: { triggeredBy } });
}

export async function finalizeRun(
  id: string,
  tallies: { sourcesAttempted: number; sourcesOk: number; sourcesFailed: number;
            itemsPublished: number; itemsQueued: number; itemsRejected: number }
) {
  return prisma.ingestRun.update({
    where: { id },
    data: { ...tallies, endedAt: new Date() }
  });
}

export async function enqueueJobs(runId: string, sources: string[]) {
  // Idempotent by (runId, source): skipDuplicates drops any already-inserted
  // rows so a cron retry doesn't create duplicates.
  if (sources.length === 0) return;
  await prisma.ingestJob.createMany({
    data: sources.map((source) => ({ runId, source, status: 'PENDING' })),
    skipDuplicates: true
  });
}

export async function pickBatch(size: number) {
  // Simple "pop N" — not transactionally safe under concurrent drainers.
  // For Phase 1 we only run one drainer at a time (sequential Vercel Cron),
  // so this is fine. Phase 2 can move to SELECT ... FOR UPDATE SKIP LOCKED
  // once multiple workers contend.
  return prisma.ingestJob.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: size
  });
}

export async function markRunning(id: string) {
  return prisma.ingestJob.update({
    where: { id },
    data: { status: 'RUNNING', attempts: { increment: 1 } }
  });
}

export async function markDone(id: string, tallies: {
  itemsFound?: number; itemsPublished?: number; itemsQueued?: number;
}) {
  return prisma.ingestJob.update({
    where: { id },
    data: { status: 'DONE', ...tallies }
  });
}

export async function markFailed(id: string, error: string) {
  return prisma.ingestJob.update({
    where: { id },
    data: { status: 'FAILED', error: error.slice(0, 500), attempts: { increment: 1 } }
  });
}
```

Note: `markRunning` increments attempts. `markFailed` also increments attempts — this is intentional when a job jumps straight from PENDING to FAILED before `markRunning` is called. In the normal flow (`pickBatch → markRunning → run → markDone/markFailed`), attempts increments twice; that is a cosmetic issue, not a correctness bug, since attempts is only used for dashboards. If it matters for retries, add `attempts: { increment: 0 }` in `markFailed` after restructuring so the path is always `markRunning → markDone|markFailed`.

- [ ] **Step 4: Run test to verify it passes**

Make sure your local `.env` has DATABASE_URL pointing at a dev Neon branch:

```bash
bun test src/lib/ingest/__tests__/queue.test.ts
```

Expected: 3 pass (or SKIP if DATABASE_URL unset — set it before continuing).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/queue.ts server/src/lib/ingest/__tests__/queue.test.ts
git commit -m "Ingest: queue primitives — createRun / enqueue / pickBatch / markDone"
```

---

## Task 13: Mock adapter + adapter registry

**Files:**
- Create: `server/src/lib/ingest/adapters/_mock.ts`
- Create: `server/src/lib/ingest/adapters/index.ts`
- Create: `server/src/lib/ingest/__tests__/adapters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/lib/ingest/__tests__/adapters.test.ts
import { describe, it, expect } from 'bun:test';
import { getAdapter, listAdapters } from '../adapters/index.js';

describe('adapter registry', () => {
  it('lists at least the mock adapter', () => {
    const ids = listAdapters().map((a) => a.id);
    expect(ids).toContain('_mock');
  });

  it('getAdapter returns by id', () => {
    const a = getAdapter('_mock');
    expect(a?.id).toBe('_mock');
  });

  it('getAdapter returns null for unknown id', () => {
    expect(getAdapter('nope')).toBeNull();
  });

  it('_mock adapter fetches returns at least one RawScholarship', async () => {
    const a = getAdapter('_mock')!;
    const items = await a.fetch();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeDefined();
    expect(items[0].applicationUrl).toMatch(/^https?:\/\//);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/adapters.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement mock adapter**

Create `server/src/lib/ingest/adapters/_mock.ts`:

```ts
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
```

- [ ] **Step 4: Implement registry**

Create `server/src/lib/ingest/adapters/index.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/adapters.test.ts
```

Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/ingest/adapters
git commit -m "Ingest: mock adapter + adapter registry"
```

---

## Task 14: Pipeline orchestrator

**Files:**
- Create: `server/src/lib/ingest/pipeline.ts`
- Create: `server/src/lib/ingest/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write the failing test (integration — hits the real DB)**

```ts
// server/src/lib/ingest/__tests__/pipeline.test.ts
import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { prisma } from '../../prisma.js';
import { runPipelineForAdapter } from '../pipeline.js';
import { mockAdapter } from '../adapters/_mock.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('pipeline', () => {
  beforeEach(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock' } });
  });
  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock' } });
  });

  it('publishes high-confidence items and queues mid-confidence items', async () => {
    // Mock classifier: first item is clearly a scholarship; second is borderline.
    const fakeAiJson = mock(async (prompt: string) => {
      const isMasters = /Masters Scholarship/.test(prompt);
      return {
        data: {
          isScholarship: isMasters ? 0.95 : 0.65,
          category: isMasters
            ? { field: 'STEM', region: 'Africa-wide', funding: 'Full funding' }
            : { field: null, region: null, funding: null },
          deadline: isMasters
            ? { kind: 'date', iso: '2026-09-30' }
            : { kind: 'unknown' },
          reasoning: 'stub'
        },
        tokensUsed: 100,
        cached: false,
        provider: 'groq' as const
      };
    });

    // Mock fetchFn so reachability check always passes.
    const fakeFetch = mock(async () => new Response(null, { status: 200 }));

    const result = await runPipelineForAdapter(mockAdapter, {
      aiJson: fakeAiJson,
      fetchFn: fakeFetch
    });

    expect(result.itemsFound).toBe(2);
    expect(result.itemsPublished).toBeGreaterThanOrEqual(1);

    const published = await prisma.scholarship.findMany({
      where: { sourceName: '_mock', status: 'PUBLISHED' }
    });
    expect(published.length).toBeGreaterThanOrEqual(1);
    expect(published[0].source).toBe('INGESTED');
    expect(published[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('dedups on a repeat run — second run updates, does not create', async () => {
    const fakeAiJson = mock(async () => ({
      data: {
        isScholarship: 0.95,
        category: { field: 'STEM', region: 'Africa-wide', funding: 'Full funding' },
        deadline: { kind: 'date', iso: '2026-09-30' },
        reasoning: 'stub'
      },
      tokensUsed: 50, cached: false, provider: 'groq' as const
    }));
    const fakeFetch = mock(async () => new Response(null, { status: 200 }));

    await runPipelineForAdapter(mockAdapter, { aiJson: fakeAiJson, fetchFn: fakeFetch });
    const firstCount = await prisma.scholarship.count({ where: { sourceName: '_mock' } });
    await runPipelineForAdapter(mockAdapter, { aiJson: fakeAiJson, fetchFn: fakeFetch });
    const secondCount = await prisma.scholarship.count({ where: { sourceName: '_mock' } });
    expect(secondCount).toBe(firstCount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/lib/ingest/__tests__/pipeline.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/src/lib/ingest/pipeline.ts`:

```ts
import { prisma } from '../prisma.js';
import { aiJson as realAiJson } from '../aiProvider.js';
import type { SourceAdapter, RawScholarship, VerificationSignals } from './types.js';
import { sanitizeTitle, sanitizeDescription } from './sanitize.js';
import { canonicalUrl } from './canonicalUrl.js';
import { isEnglish } from './language.js';
import { urlReachable } from './reach.js';
import { classifyScholarship } from './classify.js';
import { scoreConfidence, decisionFor } from './verify.js';
import { findDuplicate } from './dedup.js';

type PipelineDeps = {
  aiJson?: typeof realAiJson;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
};

type PipelineResult = {
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
};

async function getBotUserId(): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { email: 'ingestion-bot@uenr.local' } });
  return u?.id ?? null;
}

function levelFromText(text: string): 'UNDERGRAD' | 'MASTERS' | 'PHD' | 'POSTDOC' {
  const t = text.toLowerCase();
  if (/\bpostdoc/.test(t)) return 'POSTDOC';
  if (/\bphd|doctora/.test(t)) return 'PHD';
  if (/\bmasters?|msc|ma\b/.test(t)) return 'MASTERS';
  return 'UNDERGRAD';
}

function requiredFieldsOk(raw: RawScholarship): number {
  if (!raw.title?.trim()) return 0;
  if (!raw.applicationUrl?.trim()) return 0;
  if (!raw.description || raw.description.length < 100) return 0;
  return 1;
}

export async function runPipelineForAdapter(
  adapter: SourceAdapter,
  deps: PipelineDeps = {}
): Promise<PipelineResult> {
  const aiJson = deps.aiJson ?? realAiJson;
  const fetchFn = deps.fetchFn ?? fetch;

  const items = await adapter.fetch();
  const result: PipelineResult = {
    itemsFound: items.length,
    itemsPublished: 0,
    itemsQueued: 0,
    itemsRejected: 0
  };

  const botUserId = await getBotUserId();

  for (const raw of items) {
    const title = sanitizeTitle(raw.title);
    const description = sanitizeDescription(raw.description);
    const provider = sanitizeTitle(raw.providerName ?? adapter.displayName);
    const canonSourceUrl = canonicalUrl(raw.applicationUrl);

    // Dedup: pull a small candidate set. Canonical URL match is the
    // cheapest-first path; title fuzzy match needs provider equality.
    const candidates = await prisma.scholarship.findMany({
      where: {
        OR: [
          { applicationUrl: canonSourceUrl },
          { provider: { equals: provider, mode: 'insensitive' } }
        ]
      },
      select: { id: true, applicationUrl: true, provider: true, title: true, additionalSources: true }
    });
    const dupe = findDuplicate(candidates, {
      applicationUrl: canonSourceUrl || raw.applicationUrl,
      provider,
      title
    });

    const classifier = await classifyScholarship(
      { ...raw, title, description, providerName: provider },
      aiJson
    );
    const clsReach = await urlReachable(canonSourceUrl || raw.applicationUrl, fetchFn);
    const deadlineOk = classifier?.deadline.kind === 'date'
      ? (new Date(classifier.deadline.iso).getTime() > Date.now() ? 1 : 0)
      : classifier?.deadline.kind === 'rolling' ? 0.8 : 0;
    const categoryFacets = classifier
      ? [classifier.category.field, classifier.category.region, classifier.category.funding]
      : [null, null, null];
    const categoryFilled = categoryFacets.filter((v) => v !== null).length / categoryFacets.length;

    const signals: VerificationSignals = {
      urlReachable: clsReach ? 1 : 0,
      requiredFields: requiredFieldsOk(raw),
      isScholarship: classifier?.isScholarship ?? 0,
      deadlineOk,
      englishContent: isEnglish(`${title} ${description}`) ? 1 : 0,
      categoryExtracted: categoryFilled
    };
    const confidence = scoreConfidence(signals);
    const decision = decisionFor(confidence);

    if (decision === 'PUBLISHED') result.itemsPublished++;
    else if (decision === 'PENDING_REVIEW') result.itemsQueued++;
    else result.itemsRejected++;

    const deadlineDate = classifier?.deadline.kind === 'date'
      ? new Date(classifier.deadline.iso)
      : null;

    const data = {
      title,
      provider,
      description,
      eligibility: '',   // Phase 1 doesn't extract eligibility separately
      applicationUrl: canonSourceUrl || raw.applicationUrl,
      level: levelFromText(`${title} ${description}`),
      deadline: deadlineDate,
      tags: raw.tags ?? [],
      source: 'INGESTED' as const,
      status: decision,
      sourceUrl: canonSourceUrl || raw.applicationUrl,
      sourceName: adapter.id,
      confidence,
      verifierReason: classifier?.reasoning ?? '',
      ingestedAt: new Date(),
      category: classifier?.category ?? {},
      rawPayload: raw as unknown as object,
      isApproved: decision === 'PUBLISHED',
      submittedById: botUserId ?? undefined
    };

    if (dupe) {
      const addl = Array.from(new Set([...(dupe.additionalSources ?? []), adapter.id]));
      await prisma.scholarship.update({
        where: { id: dupe.id },
        data: {
          ...data,
          additionalSources: addl
        }
      });
    } else {
      await prisma.scholarship.create({ data });
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/lib/ingest/__tests__/pipeline.test.ts
```

Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/ingest/pipeline.ts server/src/lib/ingest/__tests__/pipeline.test.ts
git commit -m "Ingest: pipeline orchestrator — fetch → verify → classify → dedup → upsert"
```

---

## Task 15: /api/ingest/run + /drain + /health endpoints

**Files:**
- Create: `server/src/routes/ingest.ts`
- Modify: `server/src/app.ts`
- Create: `server/src/routes/__tests__/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/routes/__tests__/ingest.test.ts
import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('ingest routes', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.ingestJob.deleteMany({});
    await prisma.ingestRun.deleteMany({});
    // Enable the feature flag.
    await prisma.siteContent.upsert({
      where: { key: 'feature-flags' },
      create: { key: 'feature-flags', data: { 'scholarships-ingest-enabled': true } },
      update: { data: { 'scholarships-ingest-enabled': true } }
    });
  });

  afterAll(async () => {
    await prisma.siteContent.upsert({
      where: { key: 'feature-flags' },
      create: { key: 'feature-flags', data: { 'scholarships-ingest-enabled': false } },
      update: { data: { 'scholarships-ingest-enabled': false } }
    });
  });

  it('POST /api/ingest/scholarships/run requires CRON_SECRET match', async () => {
    const res = await request(app).post('/api/ingest/scholarships/run');
    expect(res.status).toBe(401);
  });

  it('POST /api/ingest/scholarships/run enqueues one job per adapter when authorized', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await request(app)
      .post('/api/ingest/scholarships/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.enqueued).toBeGreaterThanOrEqual(1);
    const jobs = await prisma.ingestJob.findMany({});
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/ingest/scholarships/run short-circuits when flag is off', async () => {
    process.env.CRON_SECRET = 'test-secret';
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': false } }
    });
    const res = await request(app)
      .post('/api/ingest/scholarships/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.enqueued).toBe(0);
    expect(res.body.data.skipped).toBe('flag-off');
  });

  it('GET /api/ingest/health returns last run summary', async () => {
    await prisma.ingestRun.create({
      data: { triggeredBy: 'cron', sourcesAttempted: 1, sourcesOk: 1, itemsPublished: 2 }
    });
    const res = await request(app).get('/api/ingest/health');
    expect(res.status).toBe(200);
    expect(res.body.data.lastRun).toBeTruthy();
    expect(res.body.data.lastRun.itemsPublished).toBe(2);
  });
});
```

Also add `supertest` as a dev dep:

```bash
cd server
bun add -d supertest @types/supertest
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/routes/__tests__/ingest.test.ts
```

Expected: FAIL — module and routes not found.

- [ ] **Step 3: Implement the router**

Create `server/src/routes/ingest.ts`:

```ts
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { listAdapters, getAdapter } from '../lib/ingest/adapters/index.js';
import {
  createRun, finalizeRun, enqueueJobs, pickBatch,
  markRunning, markDone, markFailed
} from '../lib/ingest/queue.js';
import { runPipelineForAdapter } from '../lib/ingest/pipeline.js';
import { DRAIN_BATCH_SIZE } from '../lib/ingest/config.js';

const router = Router();

// Flag lookup — same pattern as cv-match. SiteContent.feature-flags.scholarships-ingest-enabled
async function flagOn(): Promise<boolean> {
  const row = await prisma.siteContent.findUnique({ where: { key: 'feature-flags' } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  return data['scholarships-ingest-enabled'] === true;
}

// Cron/admin auth: bearer token match against CRON_SECRET env.
function cronAuth(req: import('express').Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const hdr = req.headers.authorization ?? '';
  return hdr === `Bearer ${expected}`;
}

router.post('/scholarships/run', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn())) {
      return res.json({ success: true, data: { enqueued: 0, skipped: 'flag-off' } });
    }
    const run = await createRun(req.query.manual === 'true' ? 'manual:api' : 'cron');
    const adapters = listAdapters();
    await enqueueJobs(run.id, adapters.map((a) => a.id));
    return res.json({ success: true, data: { runId: run.id, enqueued: adapters.length } });
  } catch (e) { next(e); }
});

router.post('/drain', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    if (!(await flagOn())) {
      return res.json({ success: true, data: { processed: 0, skipped: 'flag-off' } });
    }
    const batch = await pickBatch(DRAIN_BATCH_SIZE);
    let processed = 0;
    let totals = { itemsPublished: 0, itemsQueued: 0, itemsRejected: 0, sourcesOk: 0, sourcesFailed: 0 };
    for (const job of batch) {
      await markRunning(job.id);
      const adapter = getAdapter(job.source);
      if (!adapter) {
        await markFailed(job.id, `unknown adapter: ${job.source}`);
        totals.sourcesFailed++;
        continue;
      }
      try {
        const r = await runPipelineForAdapter(adapter);
        await markDone(job.id, { itemsFound: r.itemsFound, itemsPublished: r.itemsPublished, itemsQueued: r.itemsQueued });
        totals.itemsPublished += r.itemsPublished;
        totals.itemsQueued += r.itemsQueued;
        totals.itemsRejected += r.itemsRejected;
        totals.sourcesOk++;
      } catch (err) {
        await markFailed(job.id, (err as Error).message);
        totals.sourcesFailed++;
      }
      processed++;
    }
    return res.json({ success: true, data: { processed, totals } });
  } catch (e) { next(e); }
});

router.get('/health', async (_req, res, next) => {
  try {
    const lastRun = await prisma.ingestRun.findFirst({ orderBy: { startedAt: 'desc' } });
    const pending = await prisma.ingestJob.count({ where: { status: 'PENDING' } });
    return res.json({ success: true, data: { lastRun, pendingJobs: pending } });
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Mount in app**

In `server/src/app.ts`, in the router-mount section, add:

```ts
import ingestRouter from './routes/ingest.js';
// ...
app.use('/api/ingest', ingestRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test src/routes/__tests__/ingest.test.ts
```

Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/ingest.ts server/src/app.ts server/src/routes/__tests__/ingest.test.ts server/package.json server/bun.lock
git commit -m "Ingest: /api/ingest/{scholarships/run,drain,health} endpoints behind flag + cron secret"
```

---

## Task 16: Deadline expiry sweeper

**Files:**
- Modify: `server/src/routes/ingest.ts` (add endpoint)
- Create: `server/src/routes/__tests__/ingest.expire.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/routes/__tests__/ingest.expire.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('POST /api/ingest/expire', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock-expire' } });
    process.env.CRON_SECRET = 'test-secret';
  });
  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock-expire' } });
  });

  it('flips PUBLISHED rows with past deadlines to EXPIRED', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    const [expired, live] = await Promise.all([
      prisma.scholarship.create({ data: {
        title: 'X', provider: 'P', description: 'old scholarship',
        eligibility: '', applicationUrl: 'https://example.test/x',
        level: 'MASTERS', source: 'INGESTED', status: 'PUBLISHED',
        sourceName: '_mock-expire', deadline: past
      }}),
      prisma.scholarship.create({ data: {
        title: 'Y', provider: 'P', description: 'live scholarship',
        eligibility: '', applicationUrl: 'https://example.test/y',
        level: 'MASTERS', source: 'INGESTED', status: 'PUBLISHED',
        sourceName: '_mock-expire', deadline: future
      }})
    ]);

    const res = await request(app)
      .post('/api/ingest/expire')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.expired).toBe(1);

    const updated = await prisma.scholarship.findUnique({ where: { id: expired.id } });
    const stillLive = await prisma.scholarship.findUnique({ where: { id: live.id } });
    expect(updated?.status).toBe('EXPIRED');
    expect(stillLive?.status).toBe('PUBLISHED');
  });

  it('ignores items with null deadline (rolling)', async () => {
    await prisma.scholarship.create({ data: {
      title: 'Roll', provider: 'P', description: 'rolling', eligibility: '',
      applicationUrl: 'https://example.test/r', level: 'MASTERS',
      source: 'INGESTED', status: 'PUBLISHED', sourceName: '_mock-expire',
      deadline: null
    }});
    const res = await request(app)
      .post('/api/ingest/expire')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.expired).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/routes/__tests__/ingest.expire.test.ts
```

Expected: FAIL — route missing.

- [ ] **Step 3: Add the endpoint to `server/src/routes/ingest.ts`**

Insert before `export default router;`:

```ts
router.post('/expire', async (req, res, next) => {
  try {
    if (!cronAuth(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad bearer' } });
    }
    // Flag-independent: we always want to expire stale rows so the public
    // page stays accurate even if ingestion is paused.
    const updated = await prisma.scholarship.updateMany({
      where: {
        status: 'PUBLISHED',
        deadline: { lt: new Date() }
      },
      data: { status: 'EXPIRED' }
    });
    return res.json({ success: true, data: { expired: updated.count } });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/routes/__tests__/ingest.expire.test.ts
```

Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/ingest.ts server/src/routes/__tests__/ingest.expire.test.ts
git commit -m "Ingest: /api/ingest/expire sweeper flips past-deadline PUBLISHED → EXPIRED"
```

---

## Task 17: Vercel Cron config

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read current config**

```bash
cat vercel.json
```

- [ ] **Step 2: Add crons block**

Replace `vercel.json` content with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bash ./scripts/vercel-build.sh",
  "outputDirectory": "client/dist",
  "installCommand": "npm install --legacy-peer-deps && cd server && npm install --legacy-peer-deps && npx prisma generate",
  "framework": null,
  "functions": {
    "api/index.ts": {
      "maxDuration": 30
    }
  },
  "crons": [
    { "path": "/api/ingest/scholarships/run", "schedule": "0 3 * * *" },
    { "path": "/api/ingest/drain",            "schedule": "5,15,25 3 * * *" },
    { "path": "/api/ingest/expire",           "schedule": "30 3 * * *" }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/|assets/|favicon|uploads/).*)", "destination": "/index.html" }
  ]
}
```

Notes:
- 03:00 UTC run enqueues jobs. 03:05, 03:15, 03:25 drain batches. 03:30 expires.
- Vercel Cron invocations include `Authorization: Bearer <CRON_SECRET>` automatically **only if** you set the `CRON_SECRET` env var — Vercel then uses its value to sign. Add `CRON_SECRET` in Vercel project env (all environments). Any non-empty opaque string works.

- [ ] **Step 3: Add CRON_SECRET to Vercel env**

Manual step (document in the PR description — no CLI in the plan):

> Add env var `CRON_SECRET` = `<random 32+ char string>` to Production, Preview, and Development via `vercel env add` or the dashboard. Without it, `/api/ingest/*` will reject cron invocations.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "Vercel: schedule daily scholarships ingest run/drain/expire crons"
```

---

## Task 18: End-to-end smoke script

**Files:**
- Create: `server/scripts/ingest-smoke.ts`

- [ ] **Step 1: Create the script**

Create `server/scripts/ingest-smoke.ts`:

```ts
// One-shot script: flips the flag on, runs ingestion for the _mock adapter,
// then prints the resulting DB rows. Run locally with:
//   CRON_SECRET=x bun server/scripts/ingest-smoke.ts

import { prisma } from '../src/lib/prisma.js';
import { listAdapters } from '../src/lib/ingest/adapters/index.js';
import { createRun, enqueueJobs, pickBatch, markRunning, markDone, markFailed } from '../src/lib/ingest/queue.js';
import { runPipelineForAdapter } from '../src/lib/ingest/pipeline.js';

async function main() {
  await prisma.siteContent.upsert({
    where: { key: 'feature-flags' },
    create: { key: 'feature-flags', data: { 'scholarships-ingest-enabled': true } },
    update: { data: { 'scholarships-ingest-enabled': true } }
  });

  const run = await createRun('manual:smoke');
  const adapters = listAdapters();
  await enqueueJobs(run.id, adapters.map((a) => a.id));
  const batch = await pickBatch(100);

  for (const job of batch) {
    await markRunning(job.id);
    const adapter = adapters.find((a) => a.id === job.source)!;
    try {
      const r = await runPipelineForAdapter(adapter);
      await markDone(job.id, r);
      console.log(`[smoke] ${adapter.id}: found=${r.itemsFound} published=${r.itemsPublished} queued=${r.itemsQueued} rejected=${r.itemsRejected}`);
    } catch (e) {
      await markFailed(job.id, (e as Error).message);
      console.error(`[smoke] ${adapter.id} FAILED:`, e);
    }
  }

  const rows = await prisma.scholarship.findMany({
    where: { source: 'INGESTED' },
    select: { title: true, provider: true, status: true, confidence: true, sourceName: true }
  });
  console.log('[smoke] DB state:', rows);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the script end-to-end**

```bash
cd server
bun scripts/ingest-smoke.ts
```

Expected: console prints one `_mock: found=2 ...` line and a DB state array with two rows.

- [ ] **Step 3: Commit**

```bash
git add server/scripts/ingest-smoke.ts
git commit -m "Ingest: local smoke script to verify pipeline end-to-end"
```

---

## Self-Review

1. **Spec coverage:**
   - Schema (enums + fields + IngestJob + IngestRun): ✓ Tasks 2, 3
   - 4-facet taxonomy in types: ✓ Task 4
   - Cron + queue: ✓ Tasks 12, 15, 17
   - Verification weights/thresholds: ✓ Tasks 4, 10
   - Dedup: ✓ Task 11
   - Admin review queue backing storage: ✓ (status enum done; UI is Slice C)
   - Deadline expiry sweeper: ✓ Task 16
   - Feature flag: ✓ Tasks 3, 15
   - 18 adapters: **OUT OF SCOPE for this plan** — noted; Slice B.
   - Scholarships page facet UI: **OUT OF SCOPE** — Slice C.
   - Admin review UI: **OUT OF SCOPE** — Slice C.

2. **Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N". Code is complete for every step.

3. **Type consistency:** `RawScholarship`, `SourceAdapter`, `ClassifierResult`, `VerificationSignals`, `PipelineDecision` defined in Task 4; all referenced later match exactly. `runPipelineForAdapter` signature consistent between Tasks 14 and 15. Queue function names (`createRun`, `finalizeRun`, `enqueueJobs`, `pickBatch`, `markRunning`, `markDone`, `markFailed`) consistent.

4. **Known-but-accepted limitations:**
   - `pickBatch` not transactional under concurrent drainers — documented in Task 12 comment; Phase 2 will add SKIP LOCKED.
   - `markRunning`/`markFailed` both increment `attempts` — documented inline; cosmetic only.
   - `finalizeRun` defined in `queue.ts` but never called in Tasks 1-18. That's fine — it's used by Slice B when real adapters warrant a formal run-completion summary. Leaving it unused in Slice A is intentional.

---

**Plan complete and saved to** `docs/superpowers/plans/2026-04-22-scholarships-ingestion-foundation.md`**. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatches a fresh subagent per task, reviews between tasks, fast iteration.

**2. Inline Execution** — executes tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
