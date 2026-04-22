# Scholarships Auto-Ingestion — Phase 1 Design

**Status:** Draft, awaiting user sign-off.
**Author:** brainstormed with Claude Opus 4.7, 2026-04-22.
**Scope:** Scholarships only. Jobs ingestion is Phase 3 and out of scope.

## Goal

Automatically populate `/scholarships` with fresh, verified opportunities every 24 hours, without the admin needing to start a job or curate entries for the clean cases. An admin "review queue" catches low-confidence items in a sub-minute daily sweep.

## Non-goals (Phase 1)

- Jobs / `Opportunity` ingestion (Phase 3).
- Per-site scrapers beyond the ~18 starter sources (Phase 2 expands to 50+ via scraper adapters).
- Full-text copyright-sensitive republishing — we store the provider's public metadata + a deep-link to the source.
- Multi-language scholarships (English-only in Phase 1).
- Notifications / email alerts on new scholarships (follow-up feature).

## User-facing changes

### `/scholarships` page filters

Four dropdown facets + search:

| Facet | Values |
|---|---|
| **Level** | Undergrad / Masters / PhD / Postdoc (reuses existing `ScholarshipLevel` enum) |
| **Field** | STEM / Energy & Environment / Business / Agriculture / Health / Social Sciences / Arts & Humanities / Other |
| **Region** | Ghana-only / Africa-wide / Global |
| **Funding type** | Full funding / Partial funding / Stipend only / Travel/conference grant |

A free-text `tags[]` column stays for discovery keywords (e.g. `women-in-stem`, `climate`, `entrepreneurship`).

### Admin review queue

- New route `/admin/scholarships/review`.
- Lists items with `status = PENDING_REVIEW`, ordered by `ingestedAt desc`.
- Each card shows: title, provider, source URL, extracted deadline, classifier reasoning, confidence score, preview of description.
- Actions: **Approve** (→ `PUBLISHED`), **Reject** (→ `REJECTED`), **Edit & approve** (inline edit then publish).

## Architecture

```
┌─────────────────────┐
│ Vercel Cron (daily) │
│   03:00 UTC         │
└──────────┬──────────┘
           ▼
┌─────────────────────────────────────────────┐
│ POST /api/ingest/scholarships/run           │
│  - loads SOURCES[] from config              │
│  - inserts IngestJob(source) rows (PENDING) │
└──────────┬──────────────────────────────────┘
           ▼
┌─────────────────────┐  ┌─────────────────────────────────┐
│ Vercel Cron (daily) │→ │ POST /api/ingest/drain          │
│   03:05 UTC         │  │  - picks N PENDING jobs         │
│   every 10 min      │  │  - runs per-source adapter      │
│   while queue deep  │  │  - normalises + verifies        │
└─────────────────────┘  │  - upserts Scholarship rows     │
                         └─────────────────────────────────┘
```

**Why two crons:** Vercel Hobby caps each invocation at 60s. 18 sources at ~3s each blows past that when a few are slow. The drainer picks ~6 sources per run, retries transient failures, and continues on the next 10-minute tick. Runs until queue is empty or for at most 3 cycles.

**Why DB-backed queue:** No external infra. `IngestJob` table is the single source of truth; idempotent by `(source, runId)`.

## Per-source adapter interface

```ts
type SourceAdapter = {
  id: string;               // stable slug, e.g. "daad"
  displayName: string;
  url: string;              // RSS feed or page URL
  kind: 'rss' | 'html' | 'json-api';
  fetch: () => Promise<RawScholarship[]>;
};

type RawScholarship = {
  title: string;
  description: string;
  applicationUrl: string;
  deadlineText?: string;     // raw string — Groq parses it downstream
  providerName?: string;
  tags?: string[];
  rawHtml?: string;          // kept for debugging + re-processing
};
```

Adapters live in `server/src/lib/ingest/adapters/<slug>.ts`. One file per source. A broken adapter fails only its own job — the pipeline continues.

## Starter source list (18)

Split across three regions so the feed looks meaningful from day one, even if one region's adapters break.

**Ghana-focused (4)**
- GETFund (Ghana Education Trust Fund) — `html`
- MTN Ghana Foundation Bright Scholarship — `html`
- Study in Ghana portal — `html`
- UENR's own scholarship notices board — `html` (internal, highest trust)

**Africa-focused (6)**
- MasterCard Foundation Scholars Program — `html`
- Mo Ibrahim Foundation — `html`
- OFID Scholarship — `html`
- IsDB (Islamic Development Bank) Scholarship — `html`
- Afterschool Africa — `rss` (if available, else `html`)
- Opportunity Desk Africa — `rss`

**Global (8)**
- DAAD — `rss` (German government's feed)
- Chevening Scholarships — `html`
- Commonwealth Scholarships — `html`
- Joint Japan / World Bank Graduate Scholarship — `html`
- Schwarzman Scholars — `html`
- Fulbright Foreign Student Programme (Ghana) — `html`
- Rhodes Scholarship (Africa) — `html`
- Erasmus Mundus Joint Masters — `rss`

Each adapter is ≤ 80 lines. Per-adapter throttle: one request per 2 seconds, 5 second timeout. `User-Agent: UENR-AlumniCareerHub-Ingest/1.0 (+https://uenr-alumni-career-hub.vercel.app)` plus `robots.txt` respected (for sites that disallow, we skip and log).

## Schema changes

Minimal extension of existing `Scholarship` table.

```prisma
enum ScholarshipSource {
  USER          // pre-existing user submission
  ADMIN         // admin-curated
  INGESTED      // auto-ingested
}

enum ScholarshipStatus {
  PENDING_REVIEW
  PUBLISHED
  REJECTED
  EXPIRED        // published item whose deadline has passed; hidden from default "open" filter
}

model Scholarship {
  // ... existing fields ...

  // Made nullable for ingested items
  submittedById   String?

  // New fields
  source          ScholarshipSource  @default(USER)
  status          ScholarshipStatus  @default(PUBLISHED)
  sourceUrl       String?            // canonical URL on the provider site
  sourceName      String?            // e.g. "daad"
  confidence      Float?             // 0..1 from verifier
  verifierReason  String?            // short AI explanation shown in review queue
  ingestedAt      DateTime?
  category        Json?              // { field, region, funding } — the 4-facet taxonomy
  rawPayload      Json?              // original RawScholarship for debugging
  additionalSources String[]  @default([])  // dedup: merge rather than create dupe

  @@index([source, status])
  @@index([status, ingestedAt])
}

model IngestJob {
  id         String    @id @default(cuid())
  runId      String    // groups all jobs in one cron run
  source     String    // adapter slug
  status     String    // PENDING | RUNNING | DONE | FAILED
  attempts   Int       @default(0)
  itemsFound Int?
  itemsPublished Int?
  itemsQueued Int?
  error      String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([runId, source])
  @@index([status, createdAt])
}

model IngestRun {
  id                 String    @id @default(cuid())
  startedAt          DateTime  @default(now())
  endedAt            DateTime?
  sourcesAttempted   Int       @default(0)
  sourcesOk          Int       @default(0)
  sourcesFailed      Int       @default(0)
  itemsPublished     Int       @default(0)
  itemsQueued        Int       @default(0)
  itemsRejected      Int       @default(0)
  triggeredBy        String    // "cron" | "manual:<userId>"

  @@index([startedAt])
}
```

`category` is stored as Postgres **JSONB** (Prisma's default for `Json`). Facet filters on `/scholarships` use JSONB operators (`category->>'field' = 'STEM'`). A GIN index on `category` is added in migration for filter performance.

`isApproved` stays for legacy compatibility but is set from `status = PUBLISHED` for ingested items.

A **seeded system user** (`ingestion-bot@uenr.local`, role `INGESTION_BOT`) owns ingested rows where we still need a `submittedById` for audit semantics. This is safer than always-null because it keeps existing joins working.

## Verification rules

An item's final `confidence` is a weighted average of these signals:

| Signal | Weight | How it's computed |
|---|---|---|
| **URL reachability** | 0.15 | `HEAD` request to `applicationUrl`, 5s timeout, 2xx/3xx passes |
| **Required fields** | 0.15 | Title, description ≥ 100 chars, applicationUrl, sourceUrl all present |
| **"Is a scholarship"** | 0.30 | Groq classifier returns `{ is_scholarship: 0..1 }` |
| **Deadline in future OR rolling** | 0.20 | Groq extracts ISO date; past → 0, future → 1, `rolling: true` → 0.8 |
| **English content** | 0.10 | Cheap heuristic — ≥60% Latin letters; else 0 |
| **Category extractable** | 0.10 | Groq returns all four facet values (nulls allowed but lower confidence) |

**Publish thresholds:**
- `confidence ≥ 0.8` → `PUBLISHED` (auto-visible on `/scholarships`)
- `0.5 ≤ confidence < 0.8` → `PENDING_REVIEW` (lands in admin queue)
- `confidence < 0.5` → `REJECTED` (stored but hidden; kept 30 days for audit then purged)

Thresholds + weights live in `server/src/lib/ingest/config.ts` — tunable without redeploy-hostile code changes.

## Deduplication

Two-stage match, cheapest first.

1. **Canonical URL.** Strip `#fragment`, lowercase host, remove trailing slash, drop UTM params. If an existing row has the same canonical `applicationUrl`, merge: append the new `sourceName` to `additionalSources[]`, keep the highest-confidence record as canonical.
2. **Fuzzy title + provider.** Token-set ratio ≥ 0.9 AND same `providerName` (case-insensitive). Same merge rule.

No embedding-based semantic dedup in Phase 1 — the two rules above catch the real cases without the token cost.

## Deadline handling

Groq returns one of:
- `{ date: "2026-09-30" }` → stored on `deadline`
- `{ rolling: true }` → `deadline = null`, tag `rolling`
- `{ unknown: true }` → `deadline = null`, tag `deadline-unknown`

Items with `deadline` in the past at ingest time are `REJECTED` unless `rolling: true`. A daily sweeper also flips expired `PUBLISHED` items to `EXPIRED` (new intermediate status) so they drop off the default "open" filter but remain browseable.

## Error handling

- Adapter exception → `IngestJob.status = FAILED`, error logged, job retried once next cycle. Persistent failure flagged in `/admin/scholarships/review` under a "Source health" strip.
- Groq failure → falls back to lower-confidence heuristic-only verification (forces item to `PENDING_REVIEW`, never auto-publishes). Never blocks the pipeline.
- `robots.txt` disallow → source skipped, logged, shown as "Source health: BLOCKED" for admin visibility.
- Per-source rate-limit / 429 → exponential backoff (2s, 4s, 8s), then mark job `FAILED` for this cycle.

## Testing

- Per-adapter unit tests using **recorded HTTP fixtures** in `server/test/fixtures/ingest/<slug>.html` — no live network in CI.
- One integration test that runs the full pipeline against 3 fixture adapters end-to-end and asserts DB state (published / pending / rejected counts).
- Dedup tests with paired fixtures (same scholarship from 2 different portals).
- Confidence-threshold tests (item that should just barely pass vs just barely fail).

## Security / verification of external input

Treat every `RawScholarship` as untrusted:

- HTML stripped via `sanitize-html` before storage; description rendered as plain text in cards and sanitized rich-text on detail pages.
- `applicationUrl` must be `http://` or `https://`; other schemes rejected.
- Title/description length caps (title ≤ 300 chars, description ≤ 20,000 chars) enforced at insert.
- Provider name normalized: trim, collapse whitespace, strip control chars.
- `rawPayload` stored as JSON for debugging only — never rendered in the UI.

## Monitoring / observability

- Each run writes one `IngestRun` summary row: `runId`, `startedAt`, `endedAt`, `sourcesAttempted`, `sourcesOk`, `sourcesFailed`, `itemsPublished`, `itemsQueued`, `itemsRejected`.
- Admin dashboard card at `/admin` shows last run summary + "Source health" strip (green / yellow / red per source based on last 3 runs).
- `/api/ingest/health` returns last run summary for external uptime checks.

## Rollout plan

1. Schema migration (reversible — no destructive changes to existing rows).
2. Ship pipeline + cron endpoints behind a `cv-match-ai-enabled`-style SiteContent flag (`scholarships-ingest-enabled`) defaulting **off**.
3. Enable flag, run one cycle manually via `POST /api/ingest/scholarships/run?manual=true` as admin.
4. Inspect `/admin/scholarships/review`, tune thresholds if needed.
5. Enable Vercel Cron.

## Open risks

- **Groq rate limit:** 14,400 req/day covers this easily — one run is ~200 calls (18 sources × ~10 items × 1 classify call). Well within budget.
- **IP blocks from scraped sites:** Vercel's shared IPs can get flagged. Mitigation: start with RSS where possible, keep `User-Agent` identifying us, respect `robots.txt`. If a source blocks us, we accept that and drop it.
- **Provider ToS changes:** one of our 18 sources may quietly disallow ingestion in their ToS. Adapter notes should include a link to the source's `robots.txt` / terms snapshot at time of build.
- **Stale `PUBLISHED` items:** daily sweeper handles `deadline` expiry. What we don't catch is a provider *changing* a deadline mid-cycle — re-ingestion will update the row only if the canonical URL matches. Documented as known Phase 1 limitation.

## Out-of-scope notes (for future phases)

- Phase 2: scraper adapters for 30-50 more sources (LinkedIn, Chevening extended, Adzuna-style aggregators).
- Phase 3: `Opportunity` ingestion via a licensed job API (JSearch / Adzuna / Jooble) so full JDs can legally be republished.
- Email digest / Slack notifications when new scholarships match a user's saved facets.
- Student-level alerts: "New Masters-level scholarship in Energy for Ghanaians — deadline in 30 days."
