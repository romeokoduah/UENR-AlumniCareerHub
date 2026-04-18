#!/usr/bin/env bash
# Vercel build script for the UENR Alumni Career Hub monorepo.
#
# Runs during `vercel build` in the cloud:
#   1. Install client deps and build the Vite frontend → client/dist
#
# Schema push + seed are intentionally NOT in the build. Run them once
# against the target database with `npm run db:migrate` and `npm run db:seed`
# from a machine that has DATABASE_URL_UNPOOLED set (see DEPLOYMENT.md).
#
# Server dependencies + `prisma generate` already ran in installCommand.

set -euo pipefail

echo "==> Building client (Vite)"
cd client
npm install --legacy-peer-deps
npm run build
cd ..

echo "==> Build complete"
