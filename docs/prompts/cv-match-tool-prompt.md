# CV Match — Prompt to Brief the Build

> Self-contained prompt. When you're happy with it, paste it back to your assistant.

You are adding a new **CV Match** tool to the UENR Alumni Career Hub at `G:\AI_DEV_LAB\UENR-AlumniCareerHub`. It sits under Career Tools as the **20th** tool. Goal: let an alumnus drop their CV and a job description, see how the recruiter's ATS will score them, and get a checklist of concrete edits to make before they apply. No AI — pure deterministic matching reusing the existing scoring service.

## Where it lives

- Category: **Application Materials** (alongside CV Builder, Cover Letter, Portfolio, Vault).
- Route: `/career-tools/cv-match`.
- Registry slug: `cv-match`. Icon: `Crosshair` or `Target` (Lucide).
- Description for the hub card: *"Drop a CV + a job description. See your match score the way an ATS sees it, and get a checklist of edits before you apply."*

## User flow (single page)

Three panels left-to-right (or stacked on mobile):

### Panel 1 — Your CV
Source picker (chips):
1. **Use a saved CV** — dropdown of the user's `CV` records (from CV Builder).
2. **Paste plain text** — textarea.
3. **Upload PDF / DOCX** — *deferred to v2*. v1 shows the chip but disables it with a "Coming soon" tooltip. (Skip the `pdf-parse` / `mammoth` dependency for v1; revisit when there's appetite for it.)

Parsing: if a saved CV is picked, derive the skill list directly from `CV.data.skills[]` plus the user's profile (`User.skills`). If pasted text, run the deterministic extractor described below.

### Panel 2 — Target job
Source picker:
1. **Pick from job board** — dropdown of recent `Opportunity` records. Pre-fills the description.
2. **Paste a JD** — textarea (most common path).
3. **Use a Bookmark** — dropdown of the user's bookmarked opportunities.

Strip the JD into:
- Required-skill candidates (lines/phrases that match the Skill taxonomy or live near "required", "must have", "minimum")
- Preferred-skill candidates (near "preferred", "nice to have", "bonus")
- Years-of-experience hint (regex `(\d+)\+?\s*years?`)
- Seniority hint (junior/mid/senior/lead from JD title + body)

### Panel 3 — Results (renders after Run match)
Big match score (0-100) with the same color bands as the recruiter ATS (green ≥70 / amber ≥40 / red <40). Underneath:
- **Score breakdown bars** (transparent, same weights as `server/src/lib/atsScoring.ts`):
  - 50% Required-skill match
  - 20% Preferred-skill match
  - 15% Experience match
  - 10% Education match
  - 5% Location match
- **Missing required skills** — chips, click each to mark it "I have this — add it to my CV" (drives the action checklist below).
- **Weak coverage skills** — chips for required skills that appear in the CV only once or only in passing.
- **Refinement checklist** — concrete actionable bullets generated deterministically from the gaps:
  - "Add a bullet under Experience mentioning **AutoCAD** — the JD calls for it 3 times."
  - "Move **Python** higher in your skills section — currently it's the 12th skill listed."
  - "Quantify the bullet about **Solar PV installation** — the JD mentions specific kW capacity."
  - "Your CV says **2 years** total experience; the JD asks for **5+ years**. Consider whether you should apply now or pivot to a junior version of this role."
- **Keyword density mini-table** — top 10 JD keywords with their occurrence count in the JD vs the CV.
- **Apply via the platform** button (links to `/opportunities/:id` if the JD came from a saved Opportunity).
- **Save run** button — persists the analysis so the user can come back later.

## Schema (one new model, additive only)

```prisma
model CvMatchRun {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  cvSource        String   // "saved_cv" | "pasted_text" | "uploaded_file" (v2)
  cvId            String?  // CV.id when cvSource=saved_cv
  cvText          String?  // raw text when cvSource=pasted_text
  jdSource        String   // "saved_opportunity" | "pasted_text"
  opportunityId   String?
  jdText          String
  jobTitle        String?
  // Derived snapshots so a re-run produces a comparable score:
  cvSkills        String[] @default([])
  jdRequired      String[] @default([])
  jdPreferred     String[] @default([])
  jdYearsRequired Int?
  // Output:
  score           Int      // 0-100
  breakdown       Json     // { required, preferred, experience, education, location }
  refinements     Json     // structured list of suggestions
  missingSkills   String[] @default([])
  createdAt       DateTime @default(now())

  @@index([userId, createdAt(sort: Desc)])
}
```

User relation back: `cvMatchRuns CvMatchRun[]`. Schema pushed additively to Neon.

## Server endpoints (`/api/cv-match`)

All `requireAuth`. Reuses `scoreApplication` from `server/src/lib/atsScoring.ts` after adapting inputs.

- `POST /analyse` — body `{ cvSource, cvId?, cvText?, jdSource, opportunityId?, jdText, jobTitle? }`. Runs the deterministic extractor + scorer, returns `{ score, breakdown, refinements, missing, weakCoverage, keywordDensity }`. Does NOT persist by default.
- `POST /runs` — body same as above. Persists the result and returns the `CvMatchRun` row.
- `GET /runs` — list current user's runs, sorted by createdAt desc.
- `GET /runs/:id` — single run for the history detail view.
- `DELETE /runs/:id` — delete a saved run.

A small new helper `server/src/lib/cvMatch.ts` does the JD parsing (Skill-taxonomy match + section detection + years/seniority regex) and the refinement-checklist generator. Refinements are template strings filled from the gap analysis — never AI.

## Activity logging
Every analyse / save / delete writes a `CareerToolsActivity` row (tool: `cv-match`, action: `open` | `analyse` | `save_run` | `delete_run`).

## Hub registry
Add to `client/src/content/careerTools.ts` after the existing 4 application-materials entries. Status: `live`. No `employerOnly`. Phase: 1 (slot it logically where it makes sense; the `phase` field is for build-history grouping only).

## Constraints
- **No new AI / LLM dependency**. Reuse `scoreApplication` and the existing `Skill` taxonomy.
- **No new client deps**. PDF/DOCX upload is deferred to v2.
- Schema change is additive only — no destructive migrations.
- Both `client/` and `server/` typecheck clean (`tsc --noEmit`).
- Match the visual tone of `client/src/pages/career-tools/SkillsAssessmentPage.tsx` (closest analog — multi-step results page with bars + suggestions). Rounded-2xl cards, `var(--card)`/`var(--bg)`, deep-green `#065F46` / `#84CC16` accents, amber `#F59E0B` for warnings. Dark mode parity.
- Update `docs/superpowers/specs/` with a short Phase design doc and `CHANGELOG.md` with one new entry.

## Out of scope for v1 (document explicitly)
- PDF / DOCX upload + parsing (would add `pdf-parse` + `mammoth` deps)
- Sharing analysis results (private to the user)
- Tracking score-over-time across runs of the same JD as the user iterates their CV
- Auto-applying improved CV to existing CV Builder records

## Implementation order
1. Schema add + push.
2. `server/src/lib/cvMatch.ts` — deterministic JD parser + refinement generator.
3. `server/src/routes/cvMatch.ts` — five endpoints.
4. `client/src/pages/career-tools/CvMatchPage.tsx` — three-panel UI.
5. App.tsx route, app.ts router mount, registry entry, hub icon, activity-log actions.
6. Typecheck, commit, push, status report.
