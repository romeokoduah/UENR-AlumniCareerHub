# UENR Alumni Career Hub

Career services platform for the University of Energy and Natural Resources (Ghana) — connecting alumni, students, and career services staff around jobs, scholarships, mentorship, and professional development.

## Stack

- **Client:** React 18 + TypeScript + Vite + TailwindCSS v4 + Framer Motion + React Router + Zustand + React Query
- **Server:** Node.js + Express + TypeScript + Prisma + PostgreSQL + JWT auth + Socket.io
- **AI:** Anthropic Claude (`claude-sonnet-4-20250514`) powers CareerMate chatbot, CV review, mock interviewer

## Setup

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# Edit .env: set DATABASE_URL (PostgreSQL) and ANTHROPIC_API_KEY

# 3. Database
npm run db:push
npm run db:seed

# 4. Dev servers (client on :5173, server on :4000)
npm run dev
```

## Project Structure

```
uenr-alumni-career-hub/
├── client/   # React + Vite frontend
├── server/   # Express + Prisma backend
└── README.md
```

## Implementation Status

See `IMPLEMENTATION.md` for module-by-module status.
