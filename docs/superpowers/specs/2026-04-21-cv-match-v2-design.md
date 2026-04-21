# CV Match v2 — Design

**Date:** 2026-04-21
**Status:** Approved by user 2026-04-21
**Scope:** Augment the existing CV Match tool with Gemini-powered AI features and PDF/DOCX upload. Keep the deterministic 0-100 scoring backbone.

## Why this exists

v1 ships deterministic scoring + template-driven refinements. The templates do badly at: (1) explaining *why* a refinement matters in the user's specific context, (2) producing usable rewrites of the user's own bullets, (3) generating a tailored 2-3-sentence intro from CV+JD inputs. v2 adds AI for these three jobs while preserving the transparent score.

Also closes two outstanding gaps: PDF/DOCX upload (deferred from v1) and score-over-time tracking.

## AI provider

**Google Gemini 2.0 Flash** via the AI Studio free tier.
- 1,500 requests/day · 1M tokens/day on the free tier
- No credit card, no billing setup, key from `aistudio.google.com`
- Single env var: `GOOGLE_GEMINI_API_KEY`
- Privacy caveat: free-tier inputs may be used for model training. Documented in the privacy notice.

## Schema changes (additive)

Extend `CvMatchRun`:
```prisma
aiSummary       String?
aiBullets       Json?    // [{ original, rewritten[3], reasoning, appliedIndex? }]
aiCostTokens    Int?     // running token count for this run
```
No new models needed.

## Server

### New helper — `server/src/lib/gemini.ts`
- `geminiJson<T>(prompt, schemaShape, options?)` — single function. Calls Gemini 2.0 Flash with structured-output mode (JSON schema). 6s timeout. One automatic retry on 5xx. Returns `null` if `GOOGLE_GEMINI_API_KEY` is missing or both attempts fail. Logs token usage.
- `isAiEnabled()` — returns true iff key is present + `cv-match-ai-enabled` feature flag isn't `false`.

### New endpoints (extend `server/src/routes/cvMatch.ts`, all `requireAuth`)
- `GET /ai/status` — `{ enabled: boolean }`. Lets the client hide AI affordances when AI is off.
- `POST /ai/refinements` — body `{ runId? OR (cvText, jdText, missingSkills, weakCoverage) }`. Returns `[{ kind, severity, message, reasoning }]` capped at 6. If runId provided, persists onto the existing `CvMatchRun.refinements` (merges with template refinements).
- `POST /ai/rewrite-bullet` — body `{ bullet, jd, emphasize?: string[] }`. Returns `{ variants: [3 strings], rationale }`.
- `POST /ai/summary` — body `{ runId? OR (cvText, jdText), tone?: 'confident'|'warm'|'direct' }`. Returns `{ summary }`. If runId, persists to `CvMatchRun.aiSummary`.

### Per-user rate limit
- Mount `express-rate-limit` on the AI sub-routes: 5 req/min per user. One user can't burn the daily budget.

### Caching
- Hash `(prompt + model + temperature)` → in-memory LRU cache (max 200 entries, 24h TTL). Identical re-requests don't spend tokens.

### Activity log
- New actions: `ai_refinement`, `ai_rewrite`, `ai_summary`. Already wired through the existing CareerToolsActivity model.

### Audit log
- Every AI call writes one `AuditLog` row with `action: 'cv_match.ai_call'` and metadata `{ kind, tokens, cached: bool }`. Lets superusers track usage.

## PDF / DOCX upload

### Server
- New `server/src/routes/cvMatchUpload.ts` mounted at `/api/cv-match/upload`. Uses the existing `uploadDocument` multer instance. Body: a single file. Returns `{ text, charCount }`.
- New helper `server/src/lib/cvExtract.ts`:
  - PDF: `pdf-parse` (small, no native deps).
  - DOCX: `mammoth.extractRawText()`.
  - DOC (legacy binary `.doc`): rejected with a clear message ("Save as .docx and re-upload").
  - Strips control chars, normalises whitespace, caps at 30,000 chars.
- Activity log `pdf_upload` / `docx_upload`.

### Client
- The "Upload PDF / DOCX (coming soon)" chip in CvMatchPage is enabled. On select: posts the file to `/api/cv-match/upload`, gets back the text, drops it into the pasted-text textarea (so the user can review/edit before the run).

## Client (CvMatchPage)

### AI affordances (visible only when `GET /ai/status.enabled === true`)
- After "Run match" completes, an **"✨ Generate tailored summary"** button at the top of the results panel. Click → loading state → renders the 2-3 sentence summary in a card with **Copy** and **Use in CV Builder** buttons (the second one prefills a draft summary in the user's selected CV when they save the run).
- Each refinement card with a `kind` of `add_skill` / `strengthen_skill` / `quantify_bullet` gets an **"✨ Improve a bullet with AI"** action. Opens a small inline composer:
  - Textarea: paste the bullet you want to improve
  - Optional emphasis chips (auto-populated with the missing/weak skills)
  - Submit → returns 3 variants + a rationale
  - Each variant has a copy-to-clipboard button
- New panel **"AI's take"** below the refinement checklist when the user clicks **"✨ Add AI refinements"** — appends 3-6 contextually-reasoned refinements to the deterministic checklist, each tagged with a small ✨ icon to distinguish.

### PDF / DOCX upload chip
- Third chip in the CV source picker is enabled. Click → file picker (PDF or DOCX, max 25 MB) → upload → text drops into the pasted-text view.

### Score-over-time mini-chart
- When opening a saved run from the History drawer, fetch all of the user's runs that share `(cvId, opportunityId)` (or hash of jdText if no opportunityId) and plot the scores as a hand-rendered Tailwind bar chart with createdAt as x-axis. Defers if fewer than 2 matching runs.

## Privacy + safety
- AI calls send only CV text + JD text, no DB ids, no contact info.
- A short note under each AI affordance: "AI suggestions are powered by Google Gemini's free tier. Your inputs may be used by Google to improve their models."
- A new feature flag `cv-match-ai-enabled` (defaults true) lets the superuser kill-switch AI calls instantly from `/admin/site` without redeploying.
- AI features hide gracefully (button disappears, no error toast) when:
  - `GOOGLE_GEMINI_API_KEY` is unset
  - The feature flag is off
  - The user's per-minute rate limit is hit (toast: "Slow down — try again in a minute.")

## Acceptance for v2
- Both client + server typecheck clean.
- AI features hide cleanly when the key is missing — site stays usable.
- Schema migration is additive only.
- Token usage is auditable from the admin Insights view (existing audit-log search).
- Same-input cache demonstrably saves tokens on repeated runs.

## Out of scope (v3 candidates)
- Chat-with-your-CV (Q&A interface)
- Cover letter draft from CV + JD
- Interview question prediction
- JD intent extraction beyond what the deterministic extractor already does
- Multi-JD comparison
