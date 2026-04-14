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
| Auth (register / login / role-based access) | ✅ |
| Opportunity board (search / filter / apply / bookmark) | ✅ |
| Scholarships hub | ✅ |
| Mentor directory + request flow | 🟡 |
| Events calendar with RSVP | 🟡 |
| Alumni directory | 🟡 |
| CV builder + AI review | 🟡 |
| AI mock interviewer (CareerMate) | 🟡 |
| Floating CareerMate chatbot | ✅ |
| Admin dashboard + user approval | ✅ |
| Admin opportunities editor (edit / approve / hide / delete any post) | ✅ |
| Admin landing page editor (photos + copy, browser-based) | ✅ |
| Notifications (email + in-app) | 🟡 |

✅ = end-to-end · 🟡 = API + basic UI, polish pending

See `IMPLEMENTATION.md` for the full punch list.
