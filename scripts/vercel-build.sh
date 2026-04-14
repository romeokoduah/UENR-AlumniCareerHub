#!/usr/bin/env bash
# Vercel build script for the UENR Alumni Career Hub monorepo.
#
# Runs during `vercel build` in the cloud:
#   1. Install client deps and build the Vite frontend → client/dist
#   2. Push the Prisma schema to Neon (idempotent)
#   3. Seed demo data (idempotent — skips if admin user already exists)
#
# Server dependencies + prisma generate already ran in installCommand.

set -euo pipefail

echo "==> Building client (Vite)"
cd client
npm install --legacy-peer-deps
npm run build
cd ..

echo "==> Pushing Prisma schema to Neon"
cd server
npx prisma db push --skip-generate --accept-data-loss
echo "==> Seeding database (idempotent)"
npx tsx prisma/seed.ts || echo "Seed already applied or failed gracefully — continuing"
cd ..

echo "==> Build complete"
