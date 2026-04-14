# UENR Alumni Career Hub

Career services platform for the University of Energy and Natural Resources (Ghana) — connecting alumni, students, and career services staff around jobs, scholarships, mentorship, and professional development.

## 🚀 One-click deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/romeokoduah/UENR-AlumniCareerHub)

Click the button above, sign in to Render with GitHub, and in ~5 minutes you'll have:

- `uenr-career-hub-web` — the React frontend as a static site (free)
- `uenr-career-hub-api` — the Express backend on a Starter web service with a 1 GB persistent disk mounted at `/data` for the SQLite DB, uploaded images, and landing-page content (~$7/mo)

The two services are linked automatically: the frontend build picks up the backend's hostname via Render's blueprint variable injection, so `VITE_API_URL` is set for you.

**After the first deploy**, open the `uenr-career-hub-api` service in the Render dashboard → **Environment** → set `ANTHROPIC_API_KEY` to your Claude key (this is the one variable marked `sync: false`). Hit save and the API redeploys automatically.

Then visit the web service URL (something like `https://uenr-career-hub-web.onrender.com`) and log in with:

- **Admin:** `admin@uenr.edu.gh` / `admin12345`
- **Student:** `student@uenr.edu.gh` / `password123`

See `DEPLOYMENT.md` for the longer guide including Vercel + Railway, Fly.io, and full-serverless refactor paths.

## Stack

- **Client:** React 18 + TypeScript + Vite + TailwindCSS v4 + Framer Motion + React Router + Zustand + React Query
- **Server:** Node.js + Express + TypeScript + Prisma + SQLite + JWT auth + Socket.io
- **AI:** Anthropic Claude (`claude-sonnet-4-20250514`) powers CareerMate chatbot, CV review, mock interviewer

## Local development

Requires [Bun](https://bun.sh) (or Node 18+ and npm — Bun is used here because it natively runs TypeScript without a separate loader).

```bash
# 1. Install workspace deps
bun install

# 2. Environment
cp .env.example .env
# Optional: edit .env to set ANTHROPIC_API_KEY for the CareerMate chatbot.
# DATABASE_URL defaults to file:./dev.db (SQLite, no external DB needed).

# 3. Database (SQLite — creates server/prisma/dev.db)
cd server && DATABASE_URL="file:./dev.db" bun x prisma db push --skip-generate && DATABASE_URL="file:./dev.db" bun prisma/seed.ts && cd ..

# 4. Start both dev servers
#    Client on :5173, server on :4000 — Vite proxies /api and /uploads through.
bun run dev
```

Demo accounts (created by the seed):

- **Admin:** `admin@uenr.edu.gh` / `admin12345`
- **Student:** `student@uenr.edu.gh` / `password123`
- **Alumni:** `kwame.mensah@alumni.uenr.edu.gh` / `password123`

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
│   ├── src/lib/         prisma, jwt, serialize, upload, landingDefaults
│   ├── src/services/    siteContent (landing.json read/write)
│   ├── src/middleware/  auth, validate, error
│   ├── prisma/          schema.prisma, seed.ts
│   ├── data/            landing.json (admin-editable content)
│   └── uploads/         admin-uploaded images (gitignored)
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
