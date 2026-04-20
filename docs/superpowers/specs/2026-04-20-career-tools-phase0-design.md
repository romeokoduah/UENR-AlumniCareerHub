# Career Tools — Phase 0 Design

**Date:** 2026-04-20
**Scope:** Foundation only — route, navigation, hub page shell, activity log model. No tool implementations.
**Out of scope (handled by later phases):** Any of the 19 tool implementations themselves.

## Why this exists

The user is building out a 19-tool "Career Tools" section as documented in their full spec. That spec decomposes into 7 build phases. Phase 0 ships only the foundation — a working hub the later phases can plug their tools into — so progress is visible immediately and integration points are settled before the harder work starts.

## Decisions

- Existing `/cv-builder` and `/interview-prep` pages stay live for Phase 0. Phase 1 (CV) and Phase 3 (interview) will move them under `/career-tools/*` with redirects.
- All 19 tools listed in the hub from day one with `coming-soon` status; clicking any of them lands on a shared placeholder that records the click as activity so the "Recently used" row works end-to-end.
- Navbar gains "Career Tools" as a 6th item between Mentors and Events. Mobile tab bar swaps in Career Tools as a 5th tab (replaces Scholarships, which still lives in Navbar + the hub itself).

## Schema changes

Add one model to `server/prisma/schema.prisma`:

```prisma
model CareerToolsActivity {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tool      String   // tool slug, e.g. "cv-builder", "interview/mock"
  action    String   // "open" | "save" | "export" | etc. — free-form, lowercase
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([userId, createdAt(sort: Desc)])
}
```

Add the back-relation field to `User`:

```prisma
careerActivity CareerToolsActivity[]
```

Apply with `bun run db:push` (matches existing project workflow — no migration files in this repo).

## Server

New router `server/src/routes/careerTools.ts`:

- `POST /api/career-tools/activity` — body `{ tool, action, metadata? }`. Creates one row.
- `GET  /api/career-tools/activity/recent` — last 5 distinct `tool`s for the current user, newest first.

Both `requireAuth`. Mounted in `server/src/app.ts` between `/api/cvs` and `/api/content`.

## Client

### Tool registry — `client/src/content/careerTools.ts`

Single source of truth for the 19 tools: `slug`, `name`, `description`, `category`, `icon` (lucide), `phase`, `status`, optional `employerOnly`. The hub, the placeholder page, and Phase 1+ all read from this.

Categories: `application-materials | skills | interview | ventures | support | employers`.

### Routes — `client/src/App.tsx`

```
/career-tools            → CareerToolsHubPage     (RequireAuth)
/career-tools/:slug*     → CareerToolPlaceholderPage (RequireAuth) — splat catches "interview/mock", "ventures/startup", etc.
```

### Pages

- `CareerToolsHubPage.tsx` — header, search input (live filter by name + description), category filter chips with employer chip role-gated, responsive tool card grid, "Recently Used" row driven by `/api/career-tools/activity/recent`, "Recommended for you" row (deterministic stub: shows tools the user hasn't opened yet, prioritized by phase). Match HomePage typography/tokens; dark-mode parity.
- `CareerToolPlaceholderPage.tsx` — looks up the tool in the registry, renders header + "Coming in Phase X" message + back-to-hub link. Logs an `open` activity event on mount.

### Navigation

- `Navbar.tsx` — append `{ to: '/career-tools', label: 'Career Tools' }` after Mentors.
- `MobileTabBar.tsx` — add Career Tools as a 5th slot. Swap out Scholarships (still reachable via Navbar + hub).

## Acceptance for Phase 0

- Authenticated user clicks "Career Tools" in nav → lands on hub.
- All 19 tools visible as cards, filterable by chip and search.
- Employer chip and ATS card only render when `user.role === 'EMPLOYER' || user.role === 'ADMIN'`.
- Clicking any tool navigates to placeholder, which logs activity.
- Returning to the hub shows the just-clicked tool in "Recently Used".
- Unauthenticated visitors are redirected to `/login` (existing `RequireAuth` behavior — no marketing preview in Phase 0; that comes in Phase 7 polish).
- No new runtime AI dependency added.
- Typecheck clean; existing pages unaffected.

## Deferred to later phases

- Marketing preview for unauthenticated visitors (Phase 7)
- Smart recommendations (Phase 7)
- Real tool implementations (Phases 1–6)
- Onboarding hints, full a11y/Lighthouse audit (Phase 7)
- README + runbook updates (Phase 7)
