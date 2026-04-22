# Scholarship Ingestion Pipeline

See `docs/superpowers/specs/2026-04-22-scholarships-ingestion-design.md`.

Layout:
- `types.ts` — shared types
- `config.ts` — thresholds and weights
- `adapters/` — per-source fetchers
- `canonicalUrl.ts` / `sanitize.ts` / `language.ts` / `reach.ts` / `classify.ts` / `verify.ts` / `dedup.ts` — primitives
- `pipeline.ts` — per-source orchestrator
- `queue.ts` — IngestJob CRUD
