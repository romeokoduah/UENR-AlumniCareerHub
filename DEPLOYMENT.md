# Deployment Guide

## Architecture note

UENR Alumni Career Hub is a **split full-stack app**:

- **Client** (`client/`) — React + Vite SPA. Static assets. Happy on any CDN/static host (Vercel, Netlify, Cloudflare Pages).
- **Server** (`server/`) — Long-running Express process with a **persistent filesystem** (SQLite DB at `server/prisma/dev.db`, JSON content at `server/data/landing.json`, uploaded images at `server/uploads/`). **Will not work on serverless/ephemeral hosts without refactoring.**

## Recommended: Vercel (frontend) + Railway / Render / Fly.io (backend)

### Step 1 — Deploy the frontend to Vercel

This repo is already Vercel-ready. `vercel.json` at the root tells Vercel to build from the `client/` subdirectory.

**Via the Vercel dashboard (easiest):**

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"** and select `romeokoduah/UENR-AlumniCareerHub`
3. Vercel auto-detects the config from `vercel.json`. You do **not** need to set framework preset, build command, or output directory manually — leave them as "Use vercel.json".
4. Expand **"Environment Variables"** and add:
   - `VITE_API_URL` — leave blank for now (you'll fill it in step 3 once the backend is deployed)
5. Click **Deploy**. First build takes ~2 minutes.
6. You'll get a URL like `https://uenr-alumni-career-hub.vercel.app`.

**Via CLI** (if you prefer):

```bash
npm i -g vercel
cd G:/AI_DEV_LAB/UENR-AlumniCareerHub
vercel login
vercel            # first deploy (preview)
vercel --prod     # production deploy
```

At this point the frontend is live but **no API calls will work yet** — the React app has nothing to talk to. Onward.

### Step 2 — Deploy the backend to Railway

Railway is the fastest match: it gives you a Node runtime, a real persistent disk, and managed Postgres if you ever want to upgrade from SQLite.

1. Go to https://railway.app/new
2. **"Deploy from GitHub repo"** → select `UENR-AlumniCareerHub`
3. After the project is created, click the service and go to **Settings**:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push && npx tsx prisma/seed.ts`
   - **Start Command**: `npx tsx src/index.ts` (or build to JS with `npm run build && node dist/index.js`)
4. **Variables** tab, add:
   ```
   DATABASE_URL=file:./dev.db
   JWT_SECRET=<generate a long random string>
   ANTHROPIC_API_KEY=<your Claude key>
   CLIENT_ORIGIN=https://uenr-alumni-career-hub.vercel.app
   NODE_ENV=production
   PORT=4000
   ```
5. **Settings → Networking → Generate Domain** to get a public URL like `https://uenr-alumni-career-hub-production.up.railway.app`.
6. **Settings → Volumes → Add Volume** with mount path `/app/server/prisma` (so SQLite persists across deploys) — and another at `/app/server/uploads` for uploaded images, and `/app/server/data` for landing content.

**Note:** SQLite on Railway works for low traffic. If you expect real use, migrate to Postgres by:
- Adding a Postgres service on Railway
- Changing `server/prisma/schema.prisma` `datasource db { provider = "postgresql" }`
- Restoring the `String[]` / `Json` column types (undo the SQLite serialization workaround)
- Setting `DATABASE_URL` to the Postgres connection string Railway provides

### Step 3 — Connect them

1. Back in Vercel, go to your project **Settings → Environment Variables**
2. Edit `VITE_API_URL` and set it to the Railway URL (no trailing slash, no `/api` suffix):
   ```
   VITE_API_URL=https://uenr-alumni-career-hub-production.up.railway.app
   ```
3. **Deployments** tab → click the latest deployment → **Redeploy** (to rebuild with the env var baked in)
4. Test: open the Vercel URL, log in with `admin@uenr.edu.gh / admin12345`, open the landing editor, upload a photo. If it sticks after a refresh, you're done.

---

## Alternative: Netlify + Render

Same idea, different hosts:

- **Netlify** builds the `client/` directory (`netlify.toml` would mirror our `vercel.json`)
- **Render** runs the Node backend with a free persistent disk (5 GB on the starter plan)

---

## Alternative: Single-host everything on Render/Fly/Railway

Railway, Render, and Fly.io can all serve the static frontend *and* the Node backend from the same service. Cheaper (one service instead of two) but less CDN edge performance.

Build command:
```bash
npm install && cd client && npm install && npm run build && cd ../server && npm install && npx prisma generate && npx prisma db push && npx tsx prisma/seed.ts
```
Then serve `client/dist` as static files from Express (add `app.use(express.static('../client/dist'))` in `server/src/index.ts`).

---

## What does NOT work

- **Vercel alone, serverless-only.** The backend needs a persistent filesystem. SQLite, `server/data/landing.json`, and `server/uploads/*` all assume a long-running process with disk access — Vercel serverless functions are ephemeral and stateless.
- **Cloudflare Pages alone.** Same reason as above.
- **GitHub Pages.** Static only; no backend at all.

To go fully serverless you'd need to refactor:
1. Swap SQLite → Vercel Postgres / Neon / PlanetScale
2. Swap `server/uploads/` → Vercel Blob / Cloudinary / S3
3. Swap `server/data/landing.json` → a DB table (`SiteContent { key, data }`)
4. Convert Express routes to Vercel Functions (or migrate to Next.js API routes)

That's ~a day of work, not 10 minutes.
