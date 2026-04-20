# Superuser Admin — Prompt to Brief the Build

> Paste this back to your assistant when you're ready to implement the
> superuser admin layer. It's self-contained — no extra context needed.

You are extending the **UENR Alumni Career Hub** (`G:\AI_DEV_LAB\UENR-AlumniCareerHub`) to give the main admin (and only the main admin) **superuser** capabilities — a single back-of-house console at `/admin` that lets them operate the entire system without needing database access. The site already has 19 Career Tools live, plus the legacy Jobs / Scholarships / Mentors / Events / Directory modules. Everything below is incremental on top of that.

## Who counts as a superuser

- A new boolean column `User.isSuperuser` (default `false`). Migrations are additive only.
- Superusers always have `role === 'ADMIN'` and additionally pass `req.auth.isSuperuser`.
- Seed: the very first user the install creates (or the existing `admin@uenr.edu.gh` seed account) gets `isSuperuser = true`. Subsequent ADMINs do NOT get it automatically — only an existing superuser can promote another user to superuser.
- Server middleware: add `requireSuperuser` next to `requireAuth` / `requireRole`. Apply it to every endpoint listed below.

## Capabilities the superuser must have

### 1. User & role management — `/admin/users`
- List every user with full filter (role, programme, grad year, isApproved, isVerified, last-active, search by name/email/student-id).
- Per-user actions: **edit profile**, **change role** (STUDENT / ALUMNI / EMPLOYER / ADMIN), **promote/demote superuser**, **approve / un-approve**, **verify / un-verify**, **force password reset** (sets a one-time token + emails the user), **impersonate** (issues a short-lived JWT signed with an `actingAs` claim so audit log can attribute everything; ends in 30 min or on logout), **suspend** (login disabled, data retained), **soft-delete** (anonymise PII, keep referential integrity), **hard-delete + cascade**.
- Bulk import users via CSV (email, firstName, lastName, role, programme, graduationYear). Dry-run preview, then commit.
- Per-user **data export** (zip of all their records as JSON) for GDPR-style requests.

### 2. Universal content moderation — `/admin/moderation`
- One unified queue showing every pending item across all moderated tools: opportunities, scholarships, learning resources, interview questions, achievements, mentor profiles, portfolios, freelance gigs, freelance reviews. Each row: source tool, submitter, submitted-at, preview, Approve / Reject / Edit-then-approve.
- Hard-edit-and-publish on any user-generated content regardless of ownership (with a "edited by admin" marker preserved).
- Restore soft-deleted items within 30 days.

### 3. Tool-data management — `/admin/data`
- One-click run / re-run of every seed endpoint (`skills`, `learning`, `paths`, `interview-questions`, `aptitude`, `salary`, `startup`, `biz-reg`). Each shows last-run time + last-run counts.
- A small CRUD on every curated dataset: skills + role profiles, learning resources + paths, career path nodes, interview questions, aptitude questions, salary benchmarks + cost-of-living, deck templates + incubators + grants, business-registration steps. Add / edit / delete without leaving the admin UI. (Currently several of these are only modifiable by re-running seed scripts.)
- Upload real `.pptx` / `.pdf` files for the startup-hub deck templates and PATCH each record's `fileUrl` from a single screen.

### 4. Career Services operations — `/admin/services`
- View **every** counseling booking across all staff (not just own).
- View / edit **every** transcript request, mark paid (with reference), advance status, cancel, override the public verify token.
- View **every** certification verify-link.
- Reassign a counseling slot to a different staff member.

### 5. ATS oversight — `/admin/ats`
- See every employer's job posts and applications.
- Force-advance / force-reject any application (with audit trail).
- Spot-check / re-score every application.
- View the full talent pool of every employer.

### 6. Site configuration — `/admin/site`
- Already exists: landing-page editor.
- Add: **navigation editor** (reorder navbar + mobile-tab-bar entries, hide/show items per role).
- Add: **feature flags** simple JSON map stored in `SiteContent` — e.g. `{"freelanceEscrow": false, "paystackEnabled": false}` — read everywhere by a `useFeatureFlag(name)` hook.
- Add: **email/SMS templates** editor (when the v2 delivery wiring lands, the body lives here so non-engineers can change it).
- Add: **announcement broadcast** — schedule/send a Notification to every user, or a filtered segment (by role, programme, grad-year range).

### 7. Analytics & audit — `/admin/insights`
- Aggregate usage charts (DAU / WAU / MAU; per-tool open counts pulled from `CareerToolsActivity`; new-applications-per-week; new-bookings-per-week).
- Per-user activity timeline (which tools they used, when).
- **Audit log** model `AuditLog { actorId, action, targetType, targetId, metadata Json, createdAt }` — every superuser action writes one row. Searchable, filterable, exportable to CSV.
- Search box: **find anything** — type a name / email / job title / opportunity id / cert slug → returns matching users, jobs, applications, certifications, transcripts, achievements with deep-links.

### 8. System health — `/admin/system`
- Show current Vercel deploy commit + branch + deployed-at.
- Show Neon connection status, current row counts per major table.
- Show Vercel Blob token status (set / not-set), last-seen storage size estimate.
- Show last 50 server errors (read from a small `ErrorLog` model populated by the existing `errorHandler` middleware).

### 9. Security & compliance
- Per-user data export described above.
- Right-to-be-forgotten flow: superuser can fully purge a user's PII (name → "Deleted user", email → null, phone → null) while preserving foreign keys (so threads/applications/etc. remain coherent).
- Force-logout-everywhere on a user (rotate their JWT secret, invalidate all sessions).
- View login history per user (requires a new `LoginEvent { userId, ip, userAgent, success, createdAt }` model populated from the auth route).

## UI requirements

- A new top-level layout under `/admin/*` (`AdminLayout`) — sidebar nav with the eight sections above, distinct visual treatment from the alumni-facing chrome (slate background, monospace metrics) so a superuser can never mistake which side they're on.
- Every destructive action has a confirm modal with the target name typed back ("type DELETE to confirm").
- Every destructive action writes an `AuditLog` row server-side BEFORE executing, with the actor's id and a JSON snapshot of the prior state for restoration.
- Mobile-friendly enough to do urgent moderation from a phone, but optimised for desktop.

## Implementation order

Build in this order so each phase is shippable:

1. **Foundation**: `User.isSuperuser` column, `requireSuperuser` middleware, `AuditLog` + `LoginEvent` models, AdminLayout shell, "promote to superuser" action on the existing /admin/users page.
2. **User management** (the most-used).
3. **Universal moderation queue**.
4. **Audit log + insights search**.
5. **Tool-data CRUD** (replaces the current "re-run seed to fix curated content" workflow).
6. **Career Services + ATS oversight**.
7. **Site config (nav, feature flags, broadcasts)**.
8. **System health + per-user data export + right-to-be-forgotten**.

## Constraints (carry over from the rest of the project)

- No runtime AI / LLM calls in any new endpoint — search and recommendations stay deterministic.
- Schema changes are additive only — no destructive migrations on existing tables.
- Reuse the existing `client/src/services/api.ts`, React Query, Zustand auth store, Tailwind tokens, lucide icons, framer-motion. No new dependencies unless explicitly justified (and then only after asking).
- TypeScript clean (`tsc --noEmit`) on both `client/` and `server/` after every commit.
- Each major capability ships in its own commit; status report after each phase.

When you're ready, start by listing the existing admin endpoints and routes you find, then propose a 1-paragraph design for Phase 1 (Foundation) and wait for approval before touching code.
