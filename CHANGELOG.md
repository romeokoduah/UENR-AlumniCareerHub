# CHANGELOG

## Career Tools (Phases 0–7) — 2026-04-20

A new top-level **Career Tools** section (`/career-tools`) gathering 19 self-service tools for UENR alumni across six categories. Built incrementally over seven phases by parallel agents over a shared Phase-0 hub + activity-log foundation. All schema changes are additive — no destructive migrations.

### Phase 0 — Foundation (commit `24302a4`)
- New `CareerToolsActivity` Prisma model + index for the hub's Recently Used row.
- `/api/career-tools/activity` POST + GET endpoints.
- `client/src/content/careerTools.ts` registry as the single source of truth for all 19 tools.
- `/career-tools` hub page (search, six category chips with employer chip role-gated, responsive card grid, Recently Used + Recommended rows).
- `/career-tools/<slug>` placeholder page that records the open as activity.
- "Career Tools" added to the desktop navbar (between Mentors and Events) and mobile tab bar.

### Phase 1 — Application Materials (commits `cffd8ec` + `1c64355`)
- Schema: `CoverLetter`, `Portfolio`, `PortfolioProject`, `VaultDocument`, `VaultShareLink`, `VaultAccessLog`, `VaultCategory` enum.
- `uploadDocument` multer instance accepting PDF / DOC / DOCX / XLS / PPT / TXT / CSV / images up to 25 MB.
- **CV / Résumé Builder** at `/career-tools/cv-builder` — replaces legacy `/cv-builder` (now redirects).
- **Cover Letter Generator** at `/career-tools/cover-letter`.
- **Portfolio Builder** at `/career-tools/portfolio` + public `/p/:slug`.
- **Document Vault** at `/career-tools/vault` + public `/v/:token`.

### Phase 2 — Skills & Growth (commits `f4ac57c` + `0001aea`)
- Schema: `Skill`, `RoleProfile`, `SkillAssessment`, `LearningResource`, `LearningPath`, `LearningProgress`, `Certification`, `CareerPathNode`.
- **Skills Assessment** at `/career-tools/skills` with deterministic readiness scoring.
- **Learning Hub** at `/career-tools/learn` + admin moderation at `/admin/learning`.
- **Certifications Tracker** at `/career-tools/certifications` + public `/verify/cert/:slug`.
- **Career Path Explorer** at `/career-tools/paths`.
- Seeds: 93 skills, 25 role profiles, 50 learning resources, 6 paths, 47 career-path nodes.

### Phase 3 — Interview Prep (commits `4372667` + `0aab8c5`)
- Schema: `InterviewQuestion`, `InterviewQuestionVote`, `AptitudeQuestion`, `AptitudeAttempt`, `AptitudeAttemptAnswer`, `SalaryBenchmark`, `CityCostOfLiving`. Added `mockMeta Json?` to `Session` for mock-interview metadata.
- **Interview Question Bank** at `/career-tools/interview/questions`.
- **Mock Interview Scheduler** at `/career-tools/interview/mock` (integrates with existing Mentors module).
- **Aptitude Test Practice** at `/career-tools/aptitude`.
- **Salary Negotiation** at `/career-tools/salary`.
- Seeds: 80 interview questions, ~120 aptitude questions, ~60 salary benchmarks, 11 cost-of-living rows.

### Phase 4 — Ventures (commits `50236ae` + `4961b52`)
- Schema: `StartupDeckTemplate`, `Incubator`, `Grant`, `FreelanceGig`, `FreelanceBid`, `FreelanceReview`, `BizRegStep`, `GigStatus`, `GigCategory` enums.
- **Startup Resources Hub** at `/career-tools/ventures/startup`.
- **Freelance Project Board** at `/career-tools/ventures/freelance` (off-platform payment for v1).
- **Ghana Business Registration Guide** at `/career-tools/ventures/registration`.
- Seeds: 8 deck templates, 12 incubators, 10 grants, 31 business-registration steps.

### Phase 5 — Support (commits `297ec81` + `7728146`)
- Schema: `CounselingSlot`, `CounselingBooking`, `TranscriptRequest`, `Achievement`, `AchievementCongrats`, plus `CounselingMode`, `CounselingBookingStatus`, `TranscriptType`, `TranscriptDeliveryMethod`, `TranscriptStatus`, `AchievementType` enums.
- **Career Counseling Booking** at `/career-tools/counseling` (admin doubles as Career Services staff in v1).
- **Transcripts & Verification** at `/career-tools/transcripts` + public `/verify/transcript/:token`.
- **Achievements Wall** at `/career-tools/achievements` + admin `/admin/achievements`.

### Phase 6 — Applicant Tracking System (commits `65e299b` + `15754d7`)
- Schema: `Opportunity` extended with `preferredSkills`, `isFeatured`, `customQuestions`, `anonymousApplications`. `Application` extended with `customAnswers`, `recruiterScore`, `recruiterScoreBreakdown`. New `CandidateNote` and `TalentPoolEntry` models.
- Deterministic scoring service at `server/src/lib/atsScoring.ts` (0.50 / 0.20 / 0.15 / 0.10 / 0.05 weights with full breakdown stored alongside the score).
- **ATS** at `/career-tools/ats` (employer + admin gated) — kanban + table views, candidate detail drawer with score breakdown, bulk actions, CSV export, talent pool, anonymous-application support.
- Candidate dashboard at `/career-tools/ats/my-applications` (any auth user).
- Apply flow extended additively to compute scores + accept custom answers.

### Phase 7 — Polish
- README updated with the Career Tools section + operator runbook + post-deploy seed checklist.
- This CHANGELOG.
- Onboarding hint banner on the Career Tools hub for first-time visitors.

### Cross-cutting

- **No runtime AI / LLM dependency** in any of the 19 new tools (the existing `/api/chat/*` Anthropic routes from CareerMate are grandfathered).
- **No new payment provider** added — Paystack hooks and the `pay-at-Registry` flow leave the integration surface ready for v2.
- All public verification routes (`/v/:token`, `/p/:slug`, `/verify/cert/:slug`, `/verify/transcript/:token`) sit OUTSIDE `AppLayout` for chrome-free rendering with their own SEO meta tags.
- Schema pushed additively to Neon at every phase boundary. No destructive migrations.
- Both `client/` and `server/` typecheck clean at every commit.
