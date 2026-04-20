# UENR Alumni Career Hub

Career services platform for the University of Energy and Natural Resources (Ghana) — connecting alumni, students, and career services staff around jobs, scholarships, mentorship, and professional development.

## 🚀 Free-tier one-click deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/romeokoduah/UENR-AlumniCareerHub)

The whole stack runs on free tiers: **Render** (backend + frontend hosting) + **Neon** (managed Postgres) + **Cloudinary** (image hosting). Total cost: $0/month.

### Step 1 — Create your free accounts (~3 minutes total)

1. **Neon** — https://console.neon.tech → sign up with GitHub → create a project. Copy two connection strings from the dashboard:
   - **Pooled** (ends with `-pooler`) — goes into `DATABASE_URL`
   - **Direct** (no `-pooler`) — goes into `DATABASE_URL_UNPOOLED`
2. **Cloudinary** — https://cloudinary.com → sign up → from the dashboard **"Product Environment Credentials"** section, copy the **API Environment variable** (format: `cloudinary://<api_key>:<api_secret>@<cloud_name>`)
3. **Anthropic** *(optional — required only for CareerMate chatbot, CV review, and AI mock interviewer)* — https://console.anthropic.com → API Keys → create key

### Step 2 — Click the Deploy to Render button above

Render will sign you in via GitHub, read `render.yaml` from this repo, and show a preview of both services. When it asks for the secrets (marked `sync: false`), paste:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct (non-pooled) connection string |
| `CLOUDINARY_URL` | `cloudinary://api_key:secret@cloud_name` |
| `ANTHROPIC_API_KEY` | Your Claude key (or leave blank) |

Everything else — `JWT_SECRET`, `CLIENT_ORIGIN`, `VITE_API_URL` — is auto-generated or auto-wired between the services.

Click **Apply** and ~4 minutes later you'll have:

- `https://uenr-career-hub-web.onrender.com` — the React frontend (free static site)
- `https://uenr-career-hub-api.onrender.com` — the Express backend (free web service)

### Step 3 — Log in

- **Admin:** `admin@uenr.edu.gh` / `admin12345`
- **Student:** `student@uenr.edu.gh` / `password123`
- **Alumni:** `kwame.mensah@alumni.uenr.edu.gh` / `password123`

Go to **Admin → Landing page editor** to swap photos. Uploads go straight to your Cloudinary account; content changes persist to Neon. Everything survives deploys because nothing lives on Render's ephemeral disk.

See `DEPLOYMENT.md` for alternatives (Vercel + Railway, Fly.io, single-host Render).

## Stack

- **Client:** React 18 + TypeScript + Vite + TailwindCSS v4 + Framer Motion + React Router + Zustand + React Query
- **Server:** Node.js + Express + TypeScript + Prisma + **Neon Postgres** + JWT auth + Socket.io
- **Storage:** **Cloudinary** for uploaded images, **Neon Postgres** for all structured data (including editable landing content)
- **AI:** Anthropic Claude (`claude-sonnet-4-20250514`) powers CareerMate chatbot, CV review, mock interviewer

## Local development

Requires [Bun](https://bun.sh) (or Node 18+ and npm — Bun is used here because it natively runs TypeScript without a separate loader).

```bash
# 1. Install workspace deps
bun install

# 2. Environment — create .env and paste your Neon connection strings
cp .env.example .env
# Edit .env: set DATABASE_URL and DATABASE_URL_UNPOOLED to your Neon dev
# branch. Optionally set CLOUDINARY_URL and ANTHROPIC_API_KEY.
# (Without CLOUDINARY_URL, uploads fall back to server/uploads/ on disk.
#  Without ANTHROPIC_API_KEY, CareerMate returns friendly "AI unavailable".)

# 3. Push schema + seed
cd server
bun x prisma generate
bun x prisma db push
bun prisma/seed.ts
cd ..

# 4. Start both dev servers (client on :5173, server on :4000)
bun run dev
```

**Tip: use a dedicated Neon branch for local dev.** In the Neon console, click **Branches → Create branch** off `main`, name it `dev`, and use that branch's connection strings in `.env`. Your local writes won't pollute the production database and you can reset the branch with one click.

## Project structure

```
uenr-alumni-career-hub/
├── client/            # React + Vite frontend
│   ├── src/pages/       AdminLandingEditorPage, AdminOpportunitiesPage, HomePage, ...
│   ├── src/components/  shared cards, layout, chatbot widget, admin ImagePicker
│   └── src/content/     landing page default fallbacks
├── server/            # Express + Prisma backend
│   ├── src/routes/      auth, opportunities, scholarships, mentors, events,
│   │                    chat (Claude proxy), admin (editor routes + uploads)
│   ├── src/lib/         prisma, jwt, upload (Cloudinary), landingDefaults
│   ├── src/services/    siteContent (Postgres-backed)
│   ├── src/middleware/  auth, validate, error
│   └── prisma/          schema.prisma, seed.ts
├── render.yaml        # Render blueprint for one-click full-stack deploy
├── vercel.json        # Vercel config for frontend-only deploy
├── DEPLOYMENT.md      # Detailed deployment guide
├── IMPLEMENTATION.md  # Module-by-module status
└── README.md
```

## Feature modules

| Module | Status |
|---|---|
| Auth (register / login / role-based access — STUDENT / ALUMNI / EMPLOYER / ADMIN) | ✅ |
| Opportunity board (search / filter / apply / bookmark) | ✅ |
| Scholarships hub | ✅ |
| Mentor directory + request flow | ✅ |
| Events calendar with RSVP | 🟡 |
| Alumni directory | ✅ |
| Floating CareerMate chatbot | ✅ |
| Admin dashboard + user approval | ✅ |
| Admin opportunities editor | ✅ |
| Admin landing page editor (photos + copy, browser-based) | ✅ |
| Notifications (in-app) | ✅ |
| Notifications (email / SMS) | 🟡 |
| **Career Tools hub (19 self-service tools)** | ✅ |

✅ = end-to-end · 🟡 = API + basic UI, polish pending

## Career Tools

A self-service hub for alumni at `/career-tools`, gated to authenticated members. Nineteen tools across six categories — see `client/src/content/careerTools.ts` for the canonical registry.

### Application Materials
- **CV / Résumé Builder** (`/career-tools/cv-builder`) — named versions, 8 reorderable sections, 3 templates, browser-print PDF export, STAR popover, impact-verb chips. Replaces the legacy `/cv-builder`.
- **Cover Letter Generator** (`/career-tools/cover-letter`) — 8 deterministic templates by industry/tone, structured form + live preview, opportunity pre-fill via `?opportunityId=`.
- **Portfolio Builder** (`/career-tools/portfolio` editor + public `/p/:slug`) — 2 themes, OG/Twitter/JSON-LD meta, optional bcrypt password gate.
- **Document Vault** (`/career-tools/vault` + public `/v/:token`) — 25 MB uploads (PDF/DOC/XLS/PPT/CSV/images), per-share password/expiry/view-cap, full access log.

### Skills & Growth
- **Skills Assessment** (`/career-tools/skills`) — pick a target role, self-rate 1–5, deterministic readiness % with gap chart and per-gap learning suggestions.
- **Learning Hub** (`/career-tools/learn`) — curated + user-submitted resources (Coursera, edX, MIT OCW, MEST, Ghana Code Club, Ashesi, Kumasi Hive, ALU OpenLearn) with admin moderation queue at `/admin/learning`.
- **Certifications Tracker** (`/career-tools/certifications` + public `/verify/cert/:slug`) — issue/expiry tracking with 90-day expiry widget, optional vault-stored PDF, third-party verification page.
- **Career Path Explorer** (`/career-tools/paths`) — 47 nodes across 10 industries × 5 levels with realistic 2024–2026 GHS salary bands, cross-industry pivots, alumni in-role lookup.

### Interview Prep
- **Interview Question Bank** (`/career-tools/interview/questions`) — 80 hand-curated questions (behavioral / technical / domain / case / situational), vote/flag, MediaRecorder practice mode with Save-to-Vault.
- **Mock Interview Scheduler** (`/career-tools/interview/mock`) — integrates with the existing Mentors module (no duplicate booking system), 5-axis feedback rubric.
- **Aptitude Test Practice** (`/career-tools/aptitude`) — 8 categories (GMAT, GRE, Ghana Civil Service, consulting case, numerical, logical), untimed practice + timed 20-question mock, server-side scoring, item-level review.
- **Salary Negotiation** (`/career-tools/salary`) — 4 tabs (Benchmarks, Cost-of-Living, Offer Analyzer, Scripts); ~60 benchmarks across 15 roles × 11 cities, 8 hand-written playbooks.

### Ventures
- **Startup Resources Hub** (`/career-tools/ventures/startup`) — pitch decks, fundraising guides, 12 Ghana incubators (MEST, Kosmos, GTL, Innohub, GIZ, GCIC, etc.), 10 grants (Tony Elumelu, Mastercard EleV, Horizon Europe, etc.).
- **Freelance Project Board** (`/career-tools/ventures/freelance`) — full lifecycle post→bid→award→complete→review. Off-platform payment for v1; escrow + Mobile Money deferred to v2.
- **Ghana Business Registration Guide** (`/career-tools/ventures/registration`) — 31 steps across sole-prop / partnership / LLC / foreign investment / sector-specific licenses (RGD, GRA, SSNIT, GIPC, EPA, Minerals Commission, Energy Commission, FDA, NCA, Bank of Ghana).

### Support
- **Career Counseling** (`/career-tools/counseling`) — UENR Career Services staff publish slots, alumni book with topic + preferred mode (in-person / video / phone), waitlist auto-promotion.
- **Transcripts & Verification** (`/career-tools/transcripts` + public `/verify/transcript/:token`) — request modal with live fee preview, 6-stage status pipeline, public credential verification (no contact info exposed). Pay-at-Registry for v1; Paystack deferred.
- **Achievements Wall** (`/career-tools/achievements` + admin `/admin/achievements`) — moderated submissions, congrats threads, featured flag.

### Employers
- **Applicant Tracking System** (`/career-tools/ats`, EMPLOYER + ADMIN gated) — kanban + table views, transparent deterministic match scoring (0.50/0.20/0.15/0.10/0.05 weights with full breakdown shown to recruiters), bulk actions + CSV export, talent pool, anonymous-application support. Candidate-side dashboard at `/career-tools/ats/my-applications`.

### Operator runbook (UENR Career Services staff)

After every fresh deploy, an `ADMIN`-role user must POST once to each of these one-shot seed endpoints (idempotent — safe to re-run after content edits):

```
POST /api/skills/seed              # 93 skills + 25 role profiles
POST /api/learning/seed            # 50 curated resources + 6 UENR-pivot paths
POST /api/paths/seed               # 47 career-path nodes
POST /api/interview-questions/seed # 80 interview questions
POST /api/aptitude/seed            # ~120 aptitude questions
POST /api/salary/seed              # ~60 salary benchmarks + 11 cost-of-living rows
POST /api/startup/seed             # 8 deck templates + 12 incubators + 10 grants
POST /api/biz-reg/seed             # 31 business-registration steps
```

Day-to-day staff workflows:

- **Counseling** — visit `/career-tools/counseling`, click "Switch to staff view", publish slots and approve/complete bookings. Cancellations auto-promote the oldest waitlist booking.
- **Transcripts** — visit `/career-tools/transcripts`, click "Switch to staff view". Mark requests paid (with the receipt reference number from the Registry counter) and advance them through the pipeline.
- **Learning Hub moderation** — visit `/admin/learning` to approve / reject user-submitted resources.
- **Achievements moderation** — visit `/admin/achievements` to approve, feature, or reject submitted achievements.
- **Pitch deck templates** — the `/api/startup/seed` endpoint inserts deck records with placeholder file URLs. Replace each via `PATCH` after uploading the real `.pptx` / `.pdf` to the Document Vault (no admin UI for this in v1 — direct DB / API call required).
- **Cert verification URLs** — set `CLIENT_ORIGIN` in the production environment so the copy-to-clipboard URL on `/career-tools/certifications` points at the SPA origin instead of the API.

### What's deferred to a v2 pass

- Real payment provider (Paystack + Mobile Money). Hooks exist on the freelance board (`payment off-platform` banner) and transcripts (`pay-at-Registry` banner).
- Email and SMS notification delivery (in-app `Notification` model already populates).
- Calendar integration (`.ics` + Google Meet) for the mock interview scheduler and ATS interview rounds.
- Drag-and-drop kanban for the ATS (button-based in v1).
- ATS offer-letter generator + e-signature.
- Configurable per-job ATS pipelines (fixed `ApplicationStatus` enum in v1).
- Skill synonym matching in the ATS scorer.
- Onboarding hints, full Lighthouse / axe audit, cross-browser pass.

See `CHANGELOG.md` for the per-phase build history.
