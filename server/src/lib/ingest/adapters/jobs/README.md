# Jobs adapter registry

## Adapter strategy

Adzuna has no `gh` tenant. We query the UK (`gb`) tenant with Ghana- and Africa-anchored keywords, plus a US-tenant remote query for global remote roles. Ghanaian candidates can apply to all three buckets.

| Adapter ID              | Tenant | Keyword          | Rationale                                          |
|-------------------------|--------|------------------|----------------------------------------------------|
| `adzuna-ghana`          | `gb`   | `ghana`          | Surfaces UK-listed roles that explicitly mention Ghana or require Ghana presence |
| `adzuna-remote-africa`  | `gb`   | `remote africa`  | UK-listed remote roles open to Africa-based applicants |
| `adzuna-remote-worldwide` | `us` | `remote`         | US-listed fully-remote roles with no geography restriction; Ghanaian candidates can apply globally |

## Adding adapters

Call `makeAdzunaAdapter(cfg)` in `index.ts`. The factory is country-agnostic: pass any Adzuna-supported country code (`gb`, `us`, `au`, etc.) and a keyword. All three adapters share a single rate-limit budget of 250 calls/month on the free tier; one daily cron × 3 adapters = ~90 calls/month.
