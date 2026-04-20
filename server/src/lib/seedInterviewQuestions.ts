// Hand-curated seed for the Interview Question Bank. ~80 questions across
// the 5 InterviewCategory values with a UENR-flavored mix of behavioral,
// technical, domain, case, and situational prompts.
//
// Idempotent — keyed off `prompt` (which isn't @unique in the schema) via
// findFirst-then-update / create. Re-running the seed updates guidance and
// sample-answer text without creating duplicates.

import { prisma } from './prisma.js';
import type { InterviewCategory, InterviewDifficulty } from '@prisma/client';

type SeedQuestion = {
  prompt: string;
  guidance: string;
  sampleAnswer: string;
  category: InterviewCategory;
  difficulty?: InterviewDifficulty;
  roleSlug?: string;
  industry?: string;
  tags?: string[];
};

// ---------------------------------------------------------------------------
// Behavioral (25) — STAR-format prompts that double as journaling cues.
// ---------------------------------------------------------------------------
const BEHAVIORAL: SeedQuestion[] = [
  {
    prompt: 'Tell me about a time you had to deal with a difficult stakeholder.',
    guidance: 'Pick a stakeholder with real influence — not a peer. Show that you separated the person from the problem and ended on a working relationship, not just a one-off win.',
    sampleAnswer: '- Situation: One sentence on who they were and the project.\n- Task: What outcome you owned.\n- Action: The specific behavior change you tried (1:1 prep, written brief, escalation path) and why.\n- Result: Quantified impact + how the relationship improved afterwards.\n- Reflection: What you would do differently if it happened again.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'stakeholder', 'communication']
  },
  {
    prompt: 'Describe a project that failed and what you learned.',
    guidance: 'Interviewers want a real failure with a real lesson — not a humblebrag. Pick something with measurable consequences and own your share squarely.',
    sampleAnswer: '- Context: Scope, team size, your role.\n- What went wrong: One root cause, not five.\n- Your share of the blame: Be specific.\n- The repair: What you tried to recover, and the final outcome.\n- The lesson: A concrete habit or check you adopted afterwards.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'failure', 'learning']
  },
  {
    prompt: 'Walk me through a time you led without formal authority.',
    guidance: 'Demonstrate influence skills — lining up allies, removing blockers, communicating crisply — rather than a job title.',
    sampleAnswer: '- The gap: Why no manager was available to drive it.\n- How you got buy-in: Who you talked to first, what you promised.\n- Tactical wins: 2-3 concrete unblocks you delivered.\n- Outcome: What shipped + how peers reacted.\n- Self-awareness: One thing about leadership you only learned by doing it.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'leadership', 'influence']
  },
  {
    prompt: 'Give an example of a conflict on your team and how you resolved it.',
    guidance: 'Avoid villain stories. Show that you treated the conflict as a signal about an underlying disagreement on goals or priorities.',
    sampleAnswer: '- The setup: A neutral description both parties would accept.\n- Your read: What the conflict was really about underneath.\n- Your move: A 1:1, a written framing doc, a manager loop-in.\n- Resolution: The specific decision or workflow change you landed on.\n- Lasting effect: How the team operates differently now.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'conflict', 'teamwork']
  },
  {
    prompt: 'Tell me about a time you missed a deadline.',
    guidance: 'Own it without spiraling. Show you communicated early, replanned, and made the slip cheap for everyone downstream.',
    sampleAnswer: '- The slip: Estimate vs. reality, and when you knew.\n- Your warning shot: Who you told and how soon.\n- The replan: What you de-scoped, swapped, or asked help on.\n- The delivery: When it eventually shipped + the cost of the delay.\n- The fix: A new estimation habit you adopted.',
    category: 'BEHAVIORAL',
    difficulty: 'EASY',
    tags: ['star', 'accountability', 'time-management']
  },
  {
    prompt: 'Describe the most ambiguous problem you have worked on.',
    guidance: 'Interviewers want to see how you make progress when no one tells you what success looks like.',
    sampleAnswer: '- The ambiguity: Why no one had a clean spec.\n- Your scoping move: What you did first to make it tractable.\n- Hypotheses: 2-3 you tested early.\n- The narrowing: How you killed branches and committed.\n- Outcome + what you would do differently.',
    category: 'BEHAVIORAL',
    difficulty: 'HARD',
    tags: ['star', 'ambiguity', 'problem-solving']
  },
  {
    prompt: 'Tell me about a time you received critical feedback.',
    guidance: 'Pick feedback that genuinely changed how you work. Avoid feedback you dismissed as wrong — even if it was.',
    sampleAnswer: '- The feedback: One sentence of exactly what was said.\n- Your initial reaction: Honest.\n- What you did with it: A concrete experiment over weeks/months.\n- The shift: A measurable change in your output or relationships.\n- Recurrence: How you now solicit similar feedback proactively.',
    category: 'BEHAVIORAL',
    difficulty: 'EASY',
    tags: ['star', 'feedback', 'growth']
  },
  {
    prompt: 'Give an example of when you had to learn something quickly to ship.',
    guidance: 'Show your learning loop — how you triaged what was worth learning deeply vs. just enough to unblock yourself.',
    sampleAnswer: '- The gap: Skill needed vs. skill you had.\n- The triage: What you learned deep vs. shallow.\n- Resources: People, docs, AI, code reviews.\n- The artifact: What you actually built.\n- Retention: How you locked the new skill in afterwards.',
    category: 'BEHAVIORAL',
    difficulty: 'EASY',
    tags: ['star', 'learning', 'speed']
  },
  {
    prompt: 'Tell me about a time you disagreed with your manager.',
    guidance: 'Show disagreement as a tool for clarity, not a personality trait. Disagree-and-commit is a strong frame.',
    sampleAnswer: '- The decision in question.\n- Your case: How you wrote or presented it.\n- The loop: How they responded and what changed (if anything).\n- The commit: How you executed once the call was made.\n- The lesson on when to push and when to fold.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'disagreement', 'managing-up']
  },
  {
    prompt: 'Describe a time you had to make a decision with incomplete data.',
    guidance: 'Show how you sized the cost of waiting against the cost of being wrong, and what reversible bet you made.',
    sampleAnswer: '- The decision + the data you wished you had.\n- The cost of waiting: Why you could not.\n- Your bet: The smallest reversible step that would teach you most.\n- What you learned: From the bet, not from analysis.\n- The eventual call.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'decision-making', 'judgement']
  },
  {
    prompt: 'Tell me about your proudest professional accomplishment.',
    guidance: 'Pick something where your fingerprints are obvious. Use specific numbers and avoid team-credit hedging.',
    sampleAnswer: '- The setup: Why it mattered.\n- Your contribution: What only you could have done.\n- The numbers: Quantified outcome.\n- The transfer: How others now use what you built.\n- Why it shaped you.',
    category: 'BEHAVIORAL',
    difficulty: 'EASY',
    tags: ['star', 'achievement', 'self-presentation']
  },
  {
    prompt: 'Walk me through a time you mentored or coached someone.',
    guidance: 'Show that you adapted to the person — not that you ran them through your standard playbook.',
    sampleAnswer: '- Who and why: Their starting point + goal.\n- Your read: What they actually needed (skill, confidence, exposure).\n- Your method: 1:1 cadence, written feedback, projects you steered them to.\n- Their progression: Concrete milestones.\n- What you learned about coaching.',
    category: 'BEHAVIORAL',
    difficulty: 'EASY',
    tags: ['star', 'mentorship', 'leadership']
  },
  {
    prompt: 'Describe a time you had to push back on scope.',
    guidance: 'Show you were defending outcomes, not avoiding work. Frame the pushback in terms of what the requester actually cared about.',
    sampleAnswer: '- The ask: What they wanted + their underlying goal.\n- The conflict: Why the literal ask hurt the goal.\n- Your reframe: A smaller or different scope that served the goal.\n- Their response: The negotiation arc.\n- The outcome + lasting trust effect.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'scope', 'negotiation']
  },
  {
    prompt: 'Tell me about a time you took initiative beyond your role.',
    guidance: 'Avoid the trope of "I just did extra work". Show that you spotted a real gap and that the org took the work seriously.',
    sampleAnswer: '- The gap you saw + why nobody else owned it.\n- How you got permission (or asked forgiveness).\n- The artifact you built.\n- Adoption: Who used it, how it changed something.\n- The career signal it sent.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'initiative', 'ownership']
  },
  {
    prompt: 'Describe a time you had to deliver bad news.',
    guidance: 'Show that you led with the news, not the build-up, and that you proposed next steps before the listener had to ask.',
    sampleAnswer: '- The news + the audience.\n- Your prep: How you decided the message and the format.\n- Delivery: Opening line + how you handled questions.\n- Next steps: What you offered before being asked.\n- Aftermath: The trust signal it left.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'communication', 'crisis']
  },
  {
    prompt: 'Tell me about a time you balanced quality with shipping speed.',
    guidance: 'Show you are not religious about either. Talk about the explicit trade-off you named and who you got to sign it.',
    sampleAnswer: '- The pressure source.\n- The trade you proposed: What you would cut + what you protected.\n- The sign-off: Who agreed and on what record.\n- The ship: What went out + what was deferred.\n- The follow-through: How and when you closed the deferred items.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'tradeoffs', 'shipping']
  },
  {
    prompt: 'Walk me through a time you had to onboard yourself quickly to a new domain.',
    guidance: 'Strong answers show a deliberate first 30 days — who you talked to, what you read, what you built early to learn the system.',
    sampleAnswer: '- The domain + why you had to ramp fast.\n- Your map: People, docs, codebase, customers — in what order.\n- Your first build: A small artifact that proved you understood the basics.\n- Surprises: 1-2 things you got wrong early.\n- Your eventual contribution.',
    category: 'BEHAVIORAL',
    difficulty: 'EASY',
    tags: ['star', 'onboarding', 'learning']
  },
  {
    prompt: 'Tell me about a time you turned around an underperforming workstream.',
    guidance: 'Show diagnosis before prescription. Avoid making yourself the lone hero — name the people you brought along.',
    sampleAnswer: '- The state you inherited: Metrics, morale, scope.\n- Your diagnosis: 2-3 root causes you tested.\n- The reset: People, process, scope changes.\n- The trajectory: How the metrics moved over the next 60-90 days.\n- The handover state.',
    category: 'BEHAVIORAL',
    difficulty: 'HARD',
    tags: ['star', 'turnaround', 'leadership']
  },
  {
    prompt: 'Describe a time you had to coordinate across multiple time zones or cultures.',
    guidance: 'Show that you adapted defaults — meeting times, async formats, decision norms — rather than asking others to adapt to yours.',
    sampleAnswer: '- The team shape: Who, where, how dispersed.\n- The friction: A specific coordination cost you saw.\n- Your fix: Async docs, rotating meetings, written decisions.\n- The result: How it felt different a quarter later.\n- The cultural lesson you took away.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'remote', 'culture']
  },
  {
    prompt: 'Tell me about a time you built something from scratch with no template.',
    guidance: 'Show how you decomposed the unknown, what you copied vs. invented, and how you stayed honest with yourself about progress.',
    sampleAnswer: '- The blank page: What was missing.\n- Your first cut: The crudest version that proved the shape.\n- Your iteration cadence: How you measured progress.\n- The handoff: How you made it usable by others.\n- What is now standard practice because of it.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'zero-to-one', 'building']
  },
  {
    prompt: 'Describe a time you had to challenge a long-standing assumption.',
    guidance: 'Show that you respected the people who built the assumption while still poking it. Strong answers cite a specific test you ran.',
    sampleAnswer: '- The assumption + why nobody questioned it.\n- Your suspicion + the test you designed.\n- The data that came back.\n- The conversation that followed.\n- The new default that replaced the old one.',
    category: 'BEHAVIORAL',
    difficulty: 'HARD',
    tags: ['star', 'first-principles', 'change']
  },
  {
    prompt: 'Tell me about a time you pivoted a project mid-flight.',
    guidance: 'Show that the pivot was a deliberate decision, not a panic. Name the trigger, the new bet, and the cost of the old one.',
    sampleAnswer: '- The original direction.\n- The trigger: A signal you took seriously.\n- The decision moment: Who you talked to, what you proposed.\n- The new direction + the sunk cost.\n- The result vs. counterfactual of staying the course.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'pivot', 'judgement']
  },
  {
    prompt: 'Walk me through a time you shipped something a customer hated.',
    guidance: 'Show that you treated the reaction as data — not as an attack — and that you closed the loop with a fix or a retraction.',
    sampleAnswer: '- The release + the reaction.\n- Your first move: Listen, not defend.\n- The pattern: What the complaints had in common.\n- The fix: Hotfix, rollback, redesign.\n- The trust repair: How you communicated the change back.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'customer', 'recovery']
  },
  {
    prompt: 'Describe a time you delegated something important.',
    guidance: 'Show you set the receiver up to succeed — context, decision rights, escalation path — rather than just unloading work.',
    sampleAnswer: '- What you delegated + to whom + why them.\n- Your handoff: Brief, decision rights, check-in cadence.\n- The first wobble + how you resisted reaching back in.\n- The result: Their growth + the work output.\n- What you would change next time.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'delegation', 'leadership']
  },
  {
    prompt: 'Tell me about a time your work directly impacted revenue, cost, or risk.',
    guidance: 'Quantify or you are guessing. If you cannot get exact numbers, give a defensible range and the assumption it rests on.',
    sampleAnswer: '- The lever you moved + how it ties to the metric.\n- Baseline + post-change numbers.\n- Your contribution vs. tailwinds.\n- How leadership treated the result.\n- Follow-on work it unlocked.',
    category: 'BEHAVIORAL',
    difficulty: 'MEDIUM',
    tags: ['star', 'impact', 'metrics']
  }
];

// ---------------------------------------------------------------------------
// Technical (20) — software, data, and engineering, mixed.
// ---------------------------------------------------------------------------
const TECHNICAL: SeedQuestion[] = [
  {
    prompt: 'Explain the different index types in PostgreSQL and when you would use each.',
    guidance: 'Cover B-tree, hash, GiST, GIN, and BRIN. Bonus: mention partial and expression indexes and when they are worth the maintenance cost.',
    sampleAnswer: '- B-tree: default, sorted lookups + range queries.\n- Hash: equality only; rarely better than B-tree on modern Postgres.\n- GIN: inverted index for arrays, JSONB, full-text; great for "contains" queries.\n- GiST: extensible geometric/spatial; good for ranges and nearest-neighbor.\n- BRIN: huge append-only tables (logs, IoT) where rows correlate with disk order.\n- Always check pg_stat_user_indexes before adding more.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    roleSlug: 'data-analyst',
    tags: ['postgres', 'sql', 'databases']
  },
  {
    prompt: "What is the difference between OLTP and OLAP, and how does it shape schema design?",
    guidance: 'Anchor in workload first (transactions vs. analysis), then talk about schema (normalized vs. star/snowflake) and storage (row vs. columnar).',
    sampleAnswer: '- OLTP: high-volume short transactions; normalized schemas; row-oriented engines (Postgres, MySQL).\n- OLAP: long aggregate scans over big tables; denormalized stars; columnar engines (BigQuery, ClickHouse, DuckDB).\n- Hybrid options: HTAP / replicated columnar copies of OLTP data.\n- Modeling: dimension + fact split; surrogate keys; slowly-changing dimensions.\n- Operational: ETL/ELT cadence + freshness SLO.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['data-modeling', 'olap', 'oltp']
  },
  {
    prompt: 'Walk through how HTTPS actually works.',
    guidance: 'Cover TCP handshake, TLS handshake (cert exchange + key agreement), and what symmetric vs. asymmetric crypto each step uses.',
    sampleAnswer: '- TCP 3-way handshake establishes the transport.\n- ClientHello/ServerHello negotiate cipher + TLS version.\n- Server presents X.509 cert; client validates chain against trust store.\n- Key exchange (ECDHE) yields a shared symmetric session key.\n- All app data after Finished is symmetrically encrypted (AES-GCM/ChaCha20).\n- TLS 1.3 collapses round trips and removes legacy cipher suites.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['networking', 'security', 'tls']
  },
  {
    prompt: 'Explain CAP theorem and how modern distributed databases navigate it.',
    guidance: 'Be precise: CAP is about behavior during a partition. Then talk about PACELC and how systems pick latency vs. consistency when no partition exists.',
    sampleAnswer: '- CAP: under a partition, choose Consistency or Availability.\n- PACELC: even without a partition, choose Latency vs. Consistency.\n- AP examples: Cassandra, DynamoDB (tunable), Riak.\n- CP examples: Spanner, etcd, Zookeeper.\n- Practical: most apps want strong reads on a small subset and eventual consistency on the rest — design for that.',
    category: 'TECHNICAL',
    difficulty: 'HARD',
    tags: ['distributed-systems', 'databases', 'cap']
  },
  {
    prompt: 'How would you design a URL shortener that scales to a billion links?',
    guidance: 'Drive a full system-design loop: estimates first, then API, data model, cache, ID generation, redirect path latency, and analytics.',
    sampleAnswer: '- Back-of-envelope: write QPS, read QPS, storage growth.\n- API: POST /shorten, GET /:code -> 302.\n- ID gen: base62 of a counter (Snowflake-style) — avoids hash collisions.\n- Storage: KV (DynamoDB / Redis-backed) for the hot path; analytics in a columnar warehouse.\n- Cache: edge cache + in-memory LRU for top 1%.\n- Failure modes: rate limiting, abuse pipeline, custom-alias collisions.',
    category: 'TECHNICAL',
    difficulty: 'HARD',
    tags: ['system-design', 'scaling', 'apis']
  },
  {
    prompt: 'Explain Big-O for binary search vs. linear search and when each is preferable.',
    guidance: 'Beyond O(log n) vs. O(n): mention sorted-array prerequisite, cache friendliness, and when small-n linear actually beats binary in practice.',
    sampleAnswer: '- Linear: O(n) but cache-friendly, no preprocessing.\n- Binary: O(log n) but requires sorted contiguous storage.\n- Tiny arrays (n < ~16): linear often wins on real CPUs.\n- Insertions: linear stays cheap; binary needs a re-sort or balanced tree.\n- Real systems usually combine both — e.g. small leaf scan inside a B-tree.',
    category: 'TECHNICAL',
    difficulty: 'EASY',
    tags: ['algorithms', 'complexity']
  },
  {
    prompt: 'Walk me through what happens when you type a URL in the browser and press Enter.',
    guidance: 'Classic, but interviewers want depth: DNS, TCP, TLS, HTTP, server processing, response, render, layout, paint.',
    sampleAnswer: '- URL parsing -> DNS lookup (cache, recursor, authoritative).\n- TCP handshake to the resolved IP.\n- TLS handshake (if HTTPS).\n- HTTP request/response, possibly cached or 304.\n- Server-side: load balancer, app server, DB, cache.\n- Browser: HTML parse -> DOM, CSSOM, render tree, layout, paint, composite.\n- JS execution + subsequent fetches.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['web', 'networking', 'browser']
  },
  {
    prompt: 'How do you size a solar PV system for a 5kW household load in Ghana?',
    guidance: 'Walk a real engineering loop: insolation, derating, panel + inverter sizing, battery autonomy, balance-of-system.',
    sampleAnswer: '- Daily energy: 5 kW * usage hours -> kWh/day.\n- Site insolation: ~5.0-5.5 peak sun hours in southern Ghana.\n- Array size: kWh / PSH / system derate (~0.75) -> kWp.\n- Inverter: ~1.0-1.2x peak AC load with surge headroom.\n- Battery: target days of autonomy * load / DoD * round-trip eff.\n- BoS: charge controller, breakers, earthing, cable sizing for voltage drop < 3%.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    roleSlug: 'renewable-energy-engineer',
    industry: 'Renewable Energy',
    tags: ['solar', 'pv', 'sizing', 'ghana']
  },
  {
    prompt: 'What is the difference between authentication and authorization, and how do JWTs fit in?',
    guidance: 'Define both clearly, then place JWTs as a stateless authentication artifact that often carries authorization claims as a convenience.',
    sampleAnswer: '- AuthN: who you are (login, MFA).\n- AuthZ: what you can do (RBAC, ABAC, policy).\n- JWT: signed token (HMAC or RSA) carrying claims; verified statelessly.\n- Risks: long expiry without rotation, embedding sensitive data, lack of revocation.\n- Mitigations: short access tokens + refresh tokens, server-side session check on sensitive ops.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['security', 'auth', 'jwt']
  },
  {
    prompt: 'Explain the differences between TCP and UDP and when you would pick each.',
    guidance: 'Beyond reliable vs. unreliable: ordering, congestion control, head-of-line blocking, and modern alternatives like QUIC.',
    sampleAnswer: '- TCP: reliable, ordered, congestion-controlled, stateful.\n- UDP: connectionless, unordered, no built-in retries.\n- TCP: HTTP, SSH, DB protocols.\n- UDP: DNS, VoIP, gaming, video conferencing.\n- QUIC: UDP-based, integrates TLS, fixes TCP head-of-line blocking — what HTTP/3 rides on.',
    category: 'TECHNICAL',
    difficulty: 'EASY',
    tags: ['networking']
  },
  {
    prompt: 'How would you debug a slow API endpoint in production?',
    guidance: 'Walk a structured loop: reproduce -> isolate -> measure -> hypothesize -> fix. Mention observability tooling explicitly.',
    sampleAnswer: '- Reproduce: capture a real slow request id from logs.\n- Trace: distributed trace (OTel) -> identify slow span.\n- Measure: DB explain plan, external call latencies, GC pauses.\n- Hypothesize: missing index, n+1, cache miss, network.\n- Fix: smallest change that targets the root cause.\n- Verify: rerun, watch p95/p99, alert thresholds.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['debugging', 'observability', 'performance']
  },
  {
    prompt: 'Describe how you would set up CI/CD for a small team.',
    guidance: 'Talk pipelines, tests, environments, secrets, and rollback. Avoid tool name-dropping without rationale.',
    sampleAnswer: '- VCS hooks: PRs trigger lint + unit + integration tests.\n- Build artifact once; promote across envs.\n- Envs: dev (auto), staging (auto), prod (manual gate).\n- Secrets: vault or platform-native; never in repo.\n- Rollback: blue-green or single-flag toggle.\n- Observability: deploy markers in dashboards.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['devops', 'ci-cd', 'shipping']
  },
  {
    prompt: 'Explain how a hash table handles collisions and what affects its performance.',
    guidance: 'Cover separate chaining vs. open addressing, load factor, and pathological inputs.',
    sampleAnswer: '- Hash function: aim for uniform distribution.\n- Chaining: bucket holds list/tree of entries.\n- Open addressing: linear/quadratic probe within table.\n- Load factor: triggers resize ~ 0.7-0.8.\n- Pathological inputs: adversarial keys -> use randomized seed.\n- Real-world: Java HashMap upgrades chains to red-black trees beyond a threshold.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['algorithms', 'data-structures']
  },
  {
    prompt: 'What is normalization and when would you intentionally denormalize?',
    guidance: 'Show that you understand the costs of joins and that denormalization is a deliberate read-optimization, not laziness.',
    sampleAnswer: '- 1NF/2NF/3NF eliminate redundancy and update anomalies.\n- Joins are expensive at scale; denormalize for read-heavy workloads (e.g. dashboards).\n- Materialized views or computed columns are often the right middle ground.\n- Trade: stale data, more storage, harder writes.\n- Always document why a table is denormalized.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['databases', 'data-modeling']
  },
  {
    prompt: 'How would you design an API rate limiter?',
    guidance: 'Talk algorithms (token bucket, leaky bucket, fixed/sliding window), where it lives, and how you handle distributed counters.',
    sampleAnswer: '- Token bucket: smooth bursts, refill rate sets steady-state.\n- Sliding window log/counter: more accurate but pricier.\n- Per-user vs. per-IP vs. per-route — usually composite.\n- Distributed: Redis with atomic INCR + TTL, or per-edge with reconciliation.\n- Headers: X-RateLimit-Remaining + Retry-After.\n- Circuit breakers downstream when limits trip.',
    category: 'TECHNICAL',
    difficulty: 'HARD',
    tags: ['system-design', 'apis', 'scaling']
  },
  {
    prompt: 'Explain control structures (PID, MPC) at a level a recruiter could follow.',
    guidance: 'Useful in renewables/automation interviews. Build from set point + error to PID terms; introduce MPC as the predictive upgrade.',
    sampleAnswer: '- A controller compares actual vs. desired (the error).\n- Proportional: react to current error.\n- Integral: react to accumulated past error (kills offset).\n- Derivative: react to rate of change (damps overshoot).\n- MPC: solves a small optimization each step using a model of the plant.\n- Real systems: PID dominant; MPC where dynamics are complex (HVAC, grid).',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    industry: 'Engineering',
    tags: ['control-systems', 'engineering']
  },
  {
    prompt: 'Walk through the steps to deploy a Node.js API to production safely.',
    guidance: 'Cover environment parity, healthchecks, secrets, observability, and a rollback path.',
    sampleAnswer: '- Containerize with a pinned base image.\n- Configure via env vars; secrets via platform vault.\n- Healthcheck endpoint + readiness probe.\n- Logs as JSON to stdout; metrics via OTel/Prom.\n- Deploy behind a load balancer; staged rollout (canary or blue-green).\n- Backout plan: prior image tag + DB migration reversibility.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['deployment', 'node', 'devops']
  },
  {
    prompt: 'How does Git rebase differ from Git merge, and when would you use each?',
    guidance: 'Show you understand the trade-off between linear history and rewriting shared history.',
    sampleAnswer: '- Merge: preserves topology, creates merge commits.\n- Rebase: replays your commits on top of base; linear history.\n- Use merge for shared/main branches.\n- Use rebase for cleaning local feature branches before PR.\n- Never rebase shared branches without coordination.\n- Squash-and-merge often the best of both for small PRs.',
    category: 'TECHNICAL',
    difficulty: 'EASY',
    tags: ['git', 'workflow']
  },
  {
    prompt: 'Explain the difference between SQL JOIN types with a concrete example.',
    guidance: 'Walk INNER, LEFT, RIGHT, FULL, and CROSS with a small two-table example. Bonus: anti-join via NOT EXISTS.',
    sampleAnswer: '- INNER: rows with matches in both.\n- LEFT: all left rows + matched right (NULLs where missing).\n- RIGHT: mirror of LEFT — rarely used in practice.\n- FULL: union of LEFT and RIGHT.\n- CROSS: Cartesian product — useful for date spines.\n- Anti-join: NOT EXISTS / LEFT JOIN ... WHERE right IS NULL.',
    category: 'TECHNICAL',
    difficulty: 'EASY',
    tags: ['sql', 'data-analysis']
  },
  {
    prompt: 'How do you decide between SQL and NoSQL for a new feature?',
    guidance: 'Avoid dogma. Ask about access patterns, consistency needs, and operational maturity of the team.',
    sampleAnswer: '- Default to Postgres unless a NoSQL property is needed.\n- Document store (Mongo, DynamoDB) wins for variable schemas + KV access.\n- KV (Redis) wins for caching + ephemeral state.\n- Wide-column (Cassandra) wins at extreme write throughput with predictable queries.\n- Search (Elastic, OpenSearch) wins for full-text + faceted filtering.\n- Most apps end up with Postgres + Redis + an analytics warehouse.',
    category: 'TECHNICAL',
    difficulty: 'MEDIUM',
    tags: ['databases', 'architecture']
  }
];

// ---------------------------------------------------------------------------
// Domain (15) — UENR programmes: env eng, renewables, mining, forestry,
// petroleum, agriculture.
// ---------------------------------------------------------------------------
const DOMAIN: SeedQuestion[] = [
  {
    prompt: 'Explain the carbon cycle and how it relates to climate accounting.',
    guidance: 'Tie the natural reservoirs and fluxes to GHG inventories. Bonus: mention Scope 1/2/3 in passing.',
    sampleAnswer: '- Reservoirs: atmosphere, ocean, terrestrial biosphere, fossil pool.\n- Fluxes: photosynthesis, respiration, ocean exchange, fossil-fuel emissions.\n- Anthropogenic disturbance: cumulative emissions vs. sink capacity.\n- Inventories: IPCC tier methods translate activity data + factors -> CO2e.\n- Corporate accounting: Scope 1 (direct), 2 (energy), 3 (value chain).',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Environmental Science',
    tags: ['climate', 'sustainability']
  },
  {
    prompt: 'Describe the main environmental impacts of artisanal small-scale mining (galamsey) in Ghana.',
    guidance: 'Cover water, soil, biodiversity, and human-health pathways — and note the policy levers in play.',
    sampleAnswer: '- Mercury and turbidity contamination of rivers (Pra, Ankobra, Birim).\n- Forest cover loss + topsoil destruction.\n- Heavy-metal bioaccumulation in fish + downstream health risk.\n- Land-use conflict with farming communities.\n- Policy: Operation Vanguard, MMDA bylaws, formalization via CLPM.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Mining',
    tags: ['mining', 'galamsey', 'environment']
  },
  {
    prompt: 'How does a wind turbine convert wind into electricity?',
    guidance: 'Walk aerodynamic lift -> rotor torque -> gearbox -> generator -> grid integration. Mention cut-in / cut-out speeds.',
    sampleAnswer: '- Blades shaped as airfoils generate lift, spinning the rotor.\n- Gearbox steps low-rpm rotor up to generator speed (or use direct-drive PMSG).\n- Generator produces variable-frequency AC.\n- Power electronics convert DC link -> grid-frequency AC.\n- Cut-in ~3 m/s, rated ~12 m/s, cut-out ~25 m/s for safety.\n- Grid services: voltage support, ramp limits, frequency response.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Renewable Energy',
    tags: ['wind', 'renewables']
  },
  {
    prompt: 'What is sustainable forest management, and how do you measure it?',
    guidance: 'Anchor in the three pillars (ecological, social, economic) and name common standards (FSC, PEFC) plus measurable indicators.',
    sampleAnswer: '- Ecological: maintain forest structure, biodiversity, soil + water.\n- Social: respect community + tenure rights; benefit-sharing.\n- Economic: sustained-yield harvest planning.\n- Indicators: AAC vs. actual harvest, regen rates, basal area, canopy cover.\n- Certification: FSC chain-of-custody + management standards; PEFC alternative.\n- Ghana context: Modified Taungya, Forest Plantation Strategy 2016-2040.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Forestry',
    tags: ['forestry', 'sustainability', 'ghana']
  },
  {
    prompt: 'Explain the well-completion process in a typical onshore oil well.',
    guidance: 'Walk from cementing through perforation, completion type selection, and flowback.',
    sampleAnswer: '- Casing run + cement squeeze for zonal isolation.\n- Wellhead + tree installed; BOP rigged down.\n- Perforating gun fired across pay zone.\n- Completion type: open-hole, cased + perforated, or sand-control screens.\n- Flowback / clean-up of completion fluids.\n- Tubing string + downhole safety valve set; production starts.',
    category: 'DOMAIN',
    difficulty: 'HARD',
    industry: 'Petroleum',
    tags: ['oil-and-gas', 'completions']
  },
  {
    prompt: 'How would you design an irrigation schedule for a 5-hectare maize farm in northern Ghana?',
    guidance: 'Use crop water requirement (ETc) + effective rainfall + soil water-holding capacity. Pick a delivery system that matches the constraint.',
    sampleAnswer: '- Estimate ETc: ETo (Penman-Monteith) * Kc by growth stage.\n- Subtract effective rainfall (~ 70-80% of measured).\n- Soil AWC -> max depletion before stress.\n- Irrigation interval = (AWC * MAD) / net daily demand.\n- System: drip if water-scarce, furrow if cheap labor + flat land.\n- Monitor with tensiometers or simple soil-moisture probes.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Agriculture',
    tags: ['agriculture', 'irrigation', 'ghana']
  },
  {
    prompt: 'What is an Environmental Impact Assessment (EIA) and what does Ghana\'s EPA require?',
    guidance: 'Cover screening, scoping, baseline, impacts, mitigation, EMP, and disclosure. Cite LI 1652.',
    sampleAnswer: '- Triggered by EPA Schedules under LI 1652 (1999).\n- Screening -> registration form; EPA decides if EIA needed.\n- Scoping: terms of reference + stakeholder consultation.\n- Baseline studies + impact prediction (significance matrix).\n- Mitigation hierarchy: avoid, minimize, restore, offset.\n- Submission of draft EIS, public hearing, EPA permit + EMP follow-up.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Environmental Science',
    tags: ['eia', 'epa', 'ghana', 'regulation']
  },
  {
    prompt: 'Describe how you would assess hydrocarbon reserves in a new field.',
    guidance: 'Cover volumetric, decline-curve, and material-balance methods, and the role of probabilistic vs. deterministic estimates.',
    sampleAnswer: '- Volumetric: GRV * NTG * porosity * (1 - Sw) * recovery factor / FVF.\n- Decline curve: only after meaningful production history.\n- Material balance: pressure response to cumulative withdrawal.\n- Combine + cross-check; probabilistic (Monte Carlo) gives P10/P50/P90.\n- Classify per PRMS: 1P/2P/3P; reserves vs. contingent resources.',
    category: 'DOMAIN',
    difficulty: 'HARD',
    industry: 'Petroleum',
    tags: ['reservoir', 'reserves']
  },
  {
    prompt: 'What are the trade-offs between grid-tied and off-grid solar systems?',
    guidance: 'Tie the choice to load profile, grid reliability, and economics — not to a religious preference.',
    sampleAnswer: '- Grid-tied: lowest LCOE, no batteries, but useless during grid outages unless hybrid.\n- Off-grid: full energy independence; battery cost dominates economics.\n- Hybrid: most pragmatic in Ghana given dumsor risk.\n- Net metering: regulator-dependent; in Ghana, net energy metering exists but interconnection paperwork is real.\n- Decision drivers: grid uptime, tariff, capex headroom, criticality of load.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Renewable Energy',
    tags: ['solar', 'grid', 'ghana']
  },
  {
    prompt: 'Explain the silvicultural treatments used to manage a tropical timber plantation.',
    guidance: 'Cover thinning, pruning, weeding regimes, and rotation length. Mention species-specific notes (teak, gmelina).',
    sampleAnswer: '- Site preparation: clearing + lining + pitting.\n- Establishment: weeding 3-4x/yr in years 1-2.\n- Thinning: first thinning at canopy closure; reduces competition.\n- Pruning: lifts the clear-bole length for sawn-timber grade.\n- Rotation: ~20-25 years for teak in southern Ghana.\n- Yield monitoring: PSP measurements at 5-year intervals.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Forestry',
    tags: ['silviculture', 'plantations']
  },
  {
    prompt: 'How does precision agriculture reduce input costs while improving yield?',
    guidance: 'Bring concrete tech: soil sensors, GPS-guided tractors, NDVI, variable-rate application. Tie to small/medium West African farms where relevant.',
    sampleAnswer: '- Soil + moisture sensors -> spot fertilization.\n- GPS guidance -> reduced overlap on planting/spraying.\n- Drone NDVI -> targeted scouting + early disease detection.\n- Variable-rate fertilizer -> cuts N runoff and cost.\n- Cooperative model often makes capex feasible for smallholders.\n- Data feedback loop closes when yields are recorded geo-referenced.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Agriculture',
    tags: ['precision-ag', 'agritech']
  },
  {
    prompt: 'What is the difference between primary, secondary, and tertiary water treatment?',
    guidance: 'Walk the treatment train and give one or two unit operations per stage.',
    sampleAnswer: '- Primary: physical — screening, grit removal, primary clarifier (settles solids).\n- Secondary: biological — activated sludge or trickling filter; removes BOD.\n- Tertiary: polishing — sand filtration, nutrient removal (N + P), disinfection (UV/chlorine).\n- Sludge handling is its own train: thickening -> digestion -> dewatering.\n- Operational metric: effluent BOD/COD, TSS, turbidity, and (for reuse) E. coli.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Environmental Science',
    tags: ['water-treatment']
  },
  {
    prompt: 'How would you evaluate the feasibility of a mini-hydro plant on a perennial Ghanaian river?',
    guidance: 'Walk hydrology, head/flow estimation, civil works, environmental flow, and grid/community offtake.',
    sampleAnswer: '- Hydrology: 10+ years gauged or correlated flow data.\n- Estimate available head + design flow (typically Q40-Q60 on FDC).\n- Power: P = rho * g * Q * H * eff.\n- Civil: weir, intake, penstock route, powerhouse footprint.\n- Environmental flow + sediment management commitments.\n- Offtake: ECG bulk supply or community mini-grid; tariff + cost recovery.',
    category: 'DOMAIN',
    difficulty: 'HARD',
    industry: 'Renewable Energy',
    tags: ['hydropower', 'feasibility', 'ghana']
  },
  {
    prompt: 'Describe how an enhanced oil recovery (EOR) project gets selected.',
    guidance: 'Walk screening criteria (gravity, viscosity, depth, formation type) and tie to method (CO2 flood, polymer, thermal).',
    sampleAnswer: '- Screen reservoir vs. published EOR criteria.\n- Pilot: small offset pattern + tracer monitoring.\n- Method: CO2 miscible (light oil), polymer (heavy oil), thermal (very heavy).\n- Economics: incremental recovery * netback vs. capex + opex + emissions cost.\n- Decide: NPV / IRR vs. brownfield expansion alternatives.',
    category: 'DOMAIN',
    difficulty: 'HARD',
    industry: 'Petroleum',
    tags: ['eor', 'reservoir']
  },
  {
    prompt: 'How does cocoa pod borer affect yield, and what integrated pest management strategy would you recommend?',
    guidance: 'Show grasp of the lifecycle and a stacked IPM response — sanitation, monitoring, biocontrol, targeted chemicals.',
    sampleAnswer: '- Lifecycle: eggs on pods -> larvae bore in -> damaged beans, fungal entry.\n- Sanitation: weekly pod harvest + bury infested pods.\n- Monitoring: pheromone traps + weekly scouting.\n- Biocontrol: parasitoid wasps, entomopathogenic fungi (Beauveria bassiana).\n- Chemical only as a backstop, with rotation to avoid resistance.\n- Train farmers via cocoa cooperatives + COCOBOD extension.',
    category: 'DOMAIN',
    difficulty: 'MEDIUM',
    industry: 'Agriculture',
    tags: ['cocoa', 'ipm', 'ghana']
  }
];

// ---------------------------------------------------------------------------
// Case (10) — consulting-style estimation + profit-tree drills.
// ---------------------------------------------------------------------------
const CASE: SeedQuestion[] = [
  {
    prompt: 'Estimate the total annual market for solar batteries in Ghana.',
    guidance: 'Build the market top-down or bottom-up — be explicit about which. Sense-check at the end with at least one cross-reference.',
    sampleAnswer: '- Households: ~8M. Off-grid + dumsor-affected ~30% -> 2.4M target.\n- Penetration in 5 years: 5% -> 120k systems.\n- Avg battery: 5 kWh @ $300/kWh -> $1,500.\n- TAM by year 5: 120k * $1,500 = ~$180M cumulative; ~$36M/yr.\n- Add C&I segment: ~$50M/yr.\n- Sense-check: cross-ref ECG losses + diesel-displacement payback.',
    category: 'CASE',
    difficulty: 'MEDIUM',
    industry: 'Renewable Energy',
    tags: ['market-sizing', 'ghana']
  },
  {
    prompt: 'A hospital chain in Accra is losing money. Profit-tree the problem.',
    guidance: 'Decompose Profit = Revenue - Cost cleanly, then dig into the branch that explains the most variance.',
    sampleAnswer: '- Revenue = patients * avg revenue/visit.\n  - Patients: outpatient vs. inpatient mix; insurer mix (NHIS, private).\n  - ARPU: case-mix index, capacity utilization.\n- Costs = staff + drugs + facilities + admin.\n  - Staff: nurse-to-bed ratio, locum spend.\n  - Drugs: stockouts forcing emergency procurement.\n- Working hypothesis: NHIS reimbursement lag + locum nurse spend.\n- Validate with 2 weeks of P&L + AR aging.',
    category: 'CASE',
    difficulty: 'HARD',
    industry: 'Healthcare',
    tags: ['profit-tree', 'consulting']
  },
  {
    prompt: 'How many ECG smart meters are deployed across Greater Accra? Estimate.',
    guidance: 'Pick a defensible bottoms-up build. Anchor population, household size, and metering density.',
    sampleAnswer: '- Greater Accra population: ~5M, ~1.2M households.\n- Commercial connections: ~150k.\n- Smart-meter rollout target: 60% of postpaid + new connections.\n- Estimated deployed: ~700k-800k as of 2025.\n- Cross-check: ECG annual reports + tender announcements.',
    category: 'CASE',
    difficulty: 'MEDIUM',
    industry: 'Energy',
    tags: ['market-sizing', 'ghana']
  },
  {
    prompt: 'A retail bank wants to grow micro-loans in rural Ghana. How would you size and test the opportunity?',
    guidance: 'Show a structured market sizing + a pilot you would actually run with measurable success criteria.',
    sampleAnswer: '- Sizing: ~6M rural adults; 30% bankable; ticket size GH$2,000; turn 1.5x/yr -> GH$5.4B GLP potential.\n- Risk: weather + price exposure on cocoa belt; default benchmark vs. existing rural banks.\n- Pilot: 5 districts, 2 channels (agent + USSD), GH$50M ceiling, 6-month measurement window.\n- KPIs: PAR>30, CAC, top-up rate, NPS.\n- Decide based on PAR>30 < 6% and CAC payback < 12 months.',
    category: 'CASE',
    difficulty: 'HARD',
    industry: 'Financial Services',
    tags: ['market-entry', 'pilot']
  },
  {
    prompt: 'Estimate the daily volume of coffee sold in coffee shops across Kumasi.',
    guidance: 'Coffee penetration in Ghana is low; show that you adjust top-down assumptions for local context.',
    sampleAnswer: '- Population: ~3M; coffee-consuming adults ~5%.\n- Of those, ~10% buy out daily on weekdays -> 15k cups/day.\n- Avg shop: 100 cups/day -> implies ~150 shops, which is too many.\n- Adjust: avg shop = 50 cups -> ~300 outlets; still high.\n- Sanity check by counting visible chains (Vida, Pinocchio, Second Cup) + indie estimates -> reality probably ~5-8k cups/day.',
    category: 'CASE',
    difficulty: 'EASY',
    tags: ['market-sizing', 'ghana']
  },
  {
    prompt: 'A Ghanaian fintech\'s cost-per-acquisition has tripled in 6 months. Diagnose.',
    guidance: 'Work backwards from CAC = marketing spend / new actives. Each input has a story.',
    sampleAnswer: '- Numerator: new channel mix (paid social vs. agent network).\n- Denominator: are conversions still actives, or sign-ups?\n- Channel saturation: CTR + CPC trends.\n- Funnel: drop-off in KYC step (regulatory change?).\n- Competitive pressure: new entrant outbidding on Meta.\n- Quick diagnostic: cohort the spike by channel + region.',
    category: 'CASE',
    difficulty: 'MEDIUM',
    industry: 'Financial Services',
    tags: ['profit-tree', 'fintech']
  },
  {
    prompt: 'How would you decide whether MTN should launch a fixed-broadband product in Tamale?',
    guidance: 'Cover demand, supply (capex), competition, regulatory, and a Go/No-Go criterion.',
    sampleAnswer: '- Demand: SME density, university enrollment, real-estate growth.\n- Capex: backhaul to Tamale, last-mile (FTTH vs. FWA).\n- Competition: Vodafone, Surfline, ISPs.\n- Regulatory: NCA spectrum + CapEx incentives in northern zones.\n- Decision rule: 5-year payback < 4 years, ARPU > GH$200, market share > 15% by year 3.',
    category: 'CASE',
    difficulty: 'HARD',
    industry: 'Telecom',
    tags: ['market-entry', 'consulting']
  },
  {
    prompt: 'Estimate the number of public minibuses (trotros) operating in Accra each weekday.',
    guidance: 'Anchor in commuters per day, average bus capacity, and trips per bus per day.',
    sampleAnswer: '- Daily commuter trips by trotro: ~3M.\n- Avg bus capacity: 15 seats; load factor ~0.85 -> ~13 passengers/trip.\n- Avg trips/bus/day: 8.\n- Active fleet: 3M / (13 * 8) ~ 28-30k.\n- Sanity: fits MMDA estimates that put licensed fleet at 25-35k.',
    category: 'CASE',
    difficulty: 'MEDIUM',
    tags: ['market-sizing', 'ghana']
  },
  {
    prompt: 'A solar mini-grid operator says ARPU is flat but losses are widening. What are the likely causes?',
    guidance: 'Drive cost-side hypotheses since revenue is flat: theft, battery degradation, diesel hybridization growing, opex creep.',
    sampleAnswer: '- Battery degradation pulling cycle life down -> earlier replacement.\n- Non-technical losses (illegal taps) rising with community growth.\n- Diesel hybrid hours up due to cloudier season -> fuel cost spike.\n- Maintenance contract escalation or imported parts FX hit.\n- Validation: bank statements vs. SCADA energy delivered + meter reads.',
    category: 'CASE',
    difficulty: 'HARD',
    industry: 'Renewable Energy',
    tags: ['profit-tree', 'mini-grid']
  },
  {
    prompt: 'Estimate the annual revenue of a busy chop bar in Kumasi.',
    guidance: 'Build it from price * customers * days. Be honest about peak vs. trough days.',
    sampleAnswer: '- Avg ticket: GH$25.\n- Customers: 120 weekday lunch + 60 weekday dinner = 180.\n- Weekend: 250/day combined.\n- Weekly revenue: (180 * 25 * 5) + (250 * 25 * 2) = GH$22,500 + GH$12,500 = GH$35,000.\n- Annual: ~ GH$1.8M.\n- Sense-check: gross margin ~ 40% -> ~GH$720k contribution before rent + staff.',
    category: 'CASE',
    difficulty: 'EASY',
    tags: ['market-sizing', 'small-business']
  }
];

// ---------------------------------------------------------------------------
// Situational (10) — judgement / ethics prompts.
// ---------------------------------------------------------------------------
const SITUATIONAL: SeedQuestion[] = [
  {
    prompt: 'Your manager asks you to ship a deliverable you know is incorrect. What do you do?',
    guidance: 'Show that you separate the surface ask (ship now) from the underlying interest (look credible to a stakeholder). Offer alternatives, then commit if overruled.',
    sampleAnswer: '- Clarify: confirm what is wrong + the cost of the error landing externally.\n- Surface privately: written note with the specific issue + 1-2 fixes you can ship today.\n- Offer a smaller correct version + follow-up plan.\n- If overruled in writing, ship and document.\n- Post-mortem the process so the team avoids the same trap.',
    category: 'SITUATIONAL',
    difficulty: 'MEDIUM',
    tags: ['ethics', 'managing-up']
  },
  {
    prompt: 'A teammate is consistently underperforming. You are not their manager. What do you do?',
    guidance: 'Avoid going around them. Show empathy + a clear escalation ladder.',
    sampleAnswer: '- Talk to them privately: name what you have observed, ask what is going on.\n- Offer help on the specific blockers (pairing, splitting work, doc walkthrough).\n- If no change, raise to your shared manager with concrete examples + your attempts.\n- Avoid backchannels with other peers about it.\n- Adjust your own dependencies to de-risk the workstream meanwhile.',
    category: 'SITUATIONAL',
    difficulty: 'MEDIUM',
    tags: ['teamwork', 'feedback']
  },
  {
    prompt: 'You discover sensitive customer data was emailed externally by mistake. Walk me through the next hour.',
    guidance: 'Demonstrate calm sequence + clear comms. Mention legal/regulator obligations explicitly.',
    sampleAnswer: '- Contain: revoke access, recall the email if possible, document timestamps.\n- Notify: security on-call + your manager immediately.\n- Assess: scope (rows, fields, recipients).\n- Legal/compliance loops in for breach-notification clock (Data Protection Act 2012 in Ghana, GDPR if EU subjects).\n- Customer comms drafted in parallel with regulator filing.\n- Post-incident: technical control gap + training response.',
    category: 'SITUATIONAL',
    difficulty: 'HARD',
    tags: ['security', 'incident-response']
  },
  {
    prompt: 'You are leading a project where two senior stakeholders disagree on direction. How do you proceed?',
    guidance: 'Show that you force the disagreement onto a written artifact and a shared decision-making frame, rather than ping-ponging.',
    sampleAnswer: '- Get each stakeholder\'s position in writing with criteria for success.\n- Find the underlying disagreement (often goal, not tactic).\n- Run a small joint session focused on the criteria, not the options.\n- Propose a reversible bet that informs the call within 2-4 weeks.\n- If still stuck, escalate to a single decision-maker with a recommendation.',
    category: 'SITUATIONAL',
    difficulty: 'MEDIUM',
    tags: ['stakeholder', 'leadership']
  },
  {
    prompt: 'A vendor is two weeks late on a deliverable that blocks your launch. What do you do?',
    guidance: 'Show that you triage between negotiating with the current vendor and unblocking around them — and that you do both in parallel.',
    sampleAnswer: '- Get a written cause + new ETA from the vendor account manager.\n- Surface internally: shift launch + name the dependency.\n- In parallel: identify a fallback (in-house mini-build, alternative vendor).\n- Re-negotiate scope with vendor (drop nice-to-haves, escalate inside their org).\n- Decision: if no credible new ETA in 5 days, pull the trigger on fallback.',
    category: 'SITUATIONAL',
    difficulty: 'MEDIUM',
    tags: ['project-management', 'vendor']
  },
  {
    prompt: 'You inherit a codebase with no tests, no docs, and a critical bug. Walk me through your first week.',
    guidance: 'Show a calm, prioritized loop: stabilize, learn, then improve. Resist rewriting on day one.',
    sampleAnswer: '- Day 1: reproduce the bug + add a failing test that captures it.\n- Day 2-3: fix the bug minimally + ship behind a flag if risky.\n- Day 3-4: read the surrounding modules + draw a rough architecture diagram.\n- Day 5: pair with someone who knows the system; capture their tribal knowledge in docs.\n- End of week: write a one-pager — what is risky, what is safe to refactor, what should not be touched.',
    category: 'SITUATIONAL',
    difficulty: 'MEDIUM',
    tags: ['legacy-code', 'engineering']
  },
  {
    prompt: 'Your team is asked to take on a side project that has nothing to do with your roadmap. How do you respond?',
    guidance: 'Show you negotiate scope and surface the trade-off transparently, instead of either capitulating or refusing.',
    sampleAnswer: '- Clarify the request: who is asking, why now, what success looks like.\n- Map it against current commitments + capacity.\n- Propose: smallest version that meets the underlying need + what your team would defer to do it.\n- Get a written sign-off on the trade.\n- Communicate the trade publicly so the team is not silently overcommitted.',
    category: 'SITUATIONAL',
    difficulty: 'EASY',
    tags: ['scope', 'prioritization']
  },
  {
    prompt: 'A junior teammate publicly disagrees with your design in a review. How do you handle it?',
    guidance: 'Show that disagreement is welcome and that you reward it, while still owning the call.',
    sampleAnswer: '- Engage the technical point first: ask them to expand and share examples.\n- If they have a stronger argument, change the design publicly + credit them.\n- If you stay with your design, explain the trade-offs in writing.\n- Follow up 1:1 to show you valued the challenge.\n- Encourage future challenges explicitly so others see it modeled.',
    category: 'SITUATIONAL',
    difficulty: 'EASY',
    tags: ['feedback', 'culture']
  },
  {
    prompt: 'A government regulator asks for data your company is technically not required to share. How do you decide?',
    guidance: 'Show you separate legal, ethical, and PR considerations — and that you bring legal/compliance in early.',
    sampleAnswer: '- Confirm scope of the request in writing.\n- Loop legal + compliance before any sharing.\n- Map the data: what is regulated, what is sensitive, what can be aggregated.\n- Propose a minimum-viable disclosure (aggregated or anonymized) + secure transfer mechanism.\n- Document the decision rationale + stakeholders consulted.',
    category: 'SITUATIONAL',
    difficulty: 'HARD',
    tags: ['ethics', 'compliance']
  },
  {
    prompt: 'You realize halfway through a presentation that a key slide has wrong data. What do you do?',
    guidance: 'Honesty fast > heroic save. Interviewers want to see how you handle in-the-moment integrity.',
    sampleAnswer: '- Pause, name the error, give the corrected directional answer.\n- Commit to a follow-up email with the right number within hours.\n- Continue the presentation without dwelling.\n- After: figure out the source of the bad number + fix the upstream pipeline.\n- Send the correction publicly so trust is repaired.',
    category: 'SITUATIONAL',
    difficulty: 'EASY',
    tags: ['ethics', 'communication']
  }
];

// Final list. Keep declared categories matching the array name so a rename
// doesn't silently miscategorise rows.
const ALL_QUESTIONS: SeedQuestion[] = [
  ...BEHAVIORAL,
  ...TECHNICAL,
  ...DOMAIN,
  ...CASE,
  ...SITUATIONAL
];

export async function seedInterviewQuestions(): Promise<{
  created: number;
  updated: number;
  total: number;
  byCategory: Record<InterviewCategory, number>;
}> {
  let created = 0;
  let updated = 0;
  const byCategory: Record<InterviewCategory, number> = {
    BEHAVIORAL: 0,
    TECHNICAL: 0,
    DOMAIN: 0,
    CASE: 0,
    SITUATIONAL: 0
  };

  for (const q of ALL_QUESTIONS) {
    byCategory[q.category] += 1;
    // `prompt` isn't @unique in the schema (we don't want a migration just
    // for seed idempotency), so we look it up first and update in place.
    const existing = await prisma.interviewQuestion.findFirst({
      where: { prompt: q.prompt },
      select: { id: true }
    });

    const data = {
      prompt: q.prompt,
      guidance: q.guidance,
      sampleAnswer: q.sampleAnswer,
      category: q.category,
      difficulty: q.difficulty ?? 'MEDIUM',
      roleSlug: q.roleSlug ?? null,
      industry: q.industry ?? null,
      tags: (q.tags ?? []).map((t) => t.toLowerCase()),
      isApproved: true
    };

    if (existing) {
      await prisma.interviewQuestion.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.interviewQuestion.create({ data });
      created += 1;
    }
  }

  return { created, updated, total: ALL_QUESTIONS.length, byCategory };
}
