// Hand-written fundraising guides rendered in the "Fundraising guides"
// section of the Startup Resources Hub. Each guide is a collapsible card.
//
// `body` uses the same tiny-markdown subset as salaryPlaybooks.ts:
//   - blank line  -> paragraph break
//   - "- "        -> bullet list item
//   - "> "        -> block quote (used for example phrasing)
// Keep entries short — these are bus-ride references, not essays.

export type StartupGuide = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

export const STARTUP_GUIDES: StartupGuide[] = [
  {
    slug: 'equity-101',
    title: 'Equity 101 — what dilution actually means',
    summary: 'A plain-English primer on shares, ownership %, and what happens to your slice when you raise.',
    body: `
Your "ownership %" is just your shares divided by all shares outstanding. When the company issues new shares to investors, the denominator grows, so your % shrinks. That's dilution.

Dilution is not theft. The point of issuing new shares is to bring in cash that grows the whole pie. A smaller slice of a much bigger pie is the entire game.

- Founders typically own 100% at incorporation, drop to ~70-80% after a seed round, ~50-60% after Series A, ~30-40% after Series B.
- The Employee Stock Option Pool (ESOP) is also dilutive — usually 10-15% set aside before a priced round closes.
- Watch the post-money cap table, not the pre-money one. The post-money is what you actually walked away with.

Example phrasing when an investor asks about dilution tolerance:

> "We're modelling around 18% dilution this round including a top-up to the option pool. We're comfortable there because the round funds 18 months of runway and the next round is priced off real revenue."
`.trim()
  },
  {
    slug: 'convertibles-vs-safes',
    title: 'Convertible notes vs SAFEs',
    summary: 'Both delay the valuation conversation. Here is when each one fits — and where Ghanaian founders get burned.',
    body: `
A Convertible Note is debt that converts into equity at a future priced round. It accrues interest and has a maturity date — if no round happens, the investor can in theory demand repayment.

A SAFE (Simple Agreement for Future Equity) is not debt. It has no interest and no maturity. It just sits on the cap table until a priced round triggers conversion. Y Combinator invented it to remove the "what if no round happens" cliff.

- Both usually have a valuation cap, a discount, or both. The cap is the ceiling at which the SAFE/note converts; the discount is the % off the next round's price.
- Use SAFEs for friends-and-family and angel rounds — simpler, founder-friendly, no debt overhang.
- Use convertibles when the investor specifically wants debt-like protections. Common in Ghana when the cheque comes from a corporate or DFI.
- Watch out for stacked SAFEs with different caps. Run the conversion math BEFORE you sign — the dilution can compound silently.

Example phrasing:

> "We're raising $200K on a SAFE with a $4M post-money cap and a 20% discount. Standard YC paperwork, two-week close."
`.trim()
  },
  {
    slug: 'pre-money-post-money',
    title: 'Pre-money / post-money math',
    summary: 'The four numbers every founder must compute in their head before any pitch meeting.',
    body: `
Four numbers. Memorise them.

- Pre-money valuation: what the company is worth BEFORE the new money goes in.
- Investment amount: how much you're raising this round.
- Post-money valuation: pre-money + investment. What the company is worth AFTER the round closes.
- Investor ownership %: investment ÷ post-money.

Worked example. You're raising $500K at a $4.5M pre-money valuation:

- Post-money = $4.5M + $0.5M = $5M
- Investor % = $0.5M ÷ $5M = 10%
- Founder dilution = 10% (before the option pool top-up)

If the investor instead quotes a $5M post-money cap, the pre-money is $4.5M ($5M - $500K). Founders confuse "$5M valuation" (pre? post?) all the time. Always pin the term down before you celebrate.

Negotiation lever: a higher pre-money means less dilution, but a number that's too high makes the next round a "down round" — the most painful conversation in venture.
`.trim()
  },
  {
    slug: 'negotiating-term-sheet',
    title: 'Negotiating a term sheet',
    summary: 'Beyond valuation: the four clauses that decide whether you actually still control your company.',
    body: `
Valuation gets the headlines. These four clauses decide your life.

- Liquidation preference. "1x non-participating" is the founder-friendly standard. "Participating" or ">1x" means the investor double-dips on an exit — push back hard.
- Board composition. At seed, founders should hold the majority. A 2-1 founder-investor board with one independent seat is a healthy seed structure.
- Pro-rata rights. Most investors expect the right to maintain their % in the next round. Fine — but cap it to avoid a single early investor blocking later rounds.
- Anti-dilution protection. "Broad-based weighted average" is standard. "Full ratchet" is hostile — only accept it if you have no other options.

Other things to negotiate harder than founders usually do:

- Vesting acceleration on a change of control (single-trigger vs double-trigger).
- The size of the option pool top-up — every 1% comes out of YOUR equity, not the investor's.
- Information rights. Be specific; "monthly financials" is fine, "any information requested" is not.

Example phrasing when an investor proposes a 2x participating preference:

> "We're aligned on the valuation and the cheque size. The 2x participating preference is a non-starter for us — we've benchmarked our peer round and 1x non-participating is what the market is doing. Can we land there?"
`.trim()
  },
  {
    slug: 'grant-vs-equity',
    title: 'Grant vs equity — when to take which',
    summary: 'Free money is rarely free. A practical decision framework for Ghanaian founders.',
    body: `
Grants don't dilute you. Equity does. So why ever raise equity?

Take grant money when:

- You're at the proof-of-concept stage and the grant funds a specific milestone (a pilot, a prototype, a feasibility study).
- The grant maker's brand opens doors (Tony Elumelu, GCIC, Mastercard Foundation are CV gold in Ghana).
- The reporting burden matches the cheque size. A $5K grant with monthly reports is not free money.

Take equity when:

- You need speed and discretion. Investors wire in weeks; grants take months.
- The capital required is too big for any single grant (anything past ~$200K).
- You want investor pattern-matching, intros, and follow-on capital.

Mixed strategy that works in Ghana:

- Stack non-dilutive grants in year 1 to extend runway and de-risk the technology.
- Convert traction from grant-funded pilots into the story for an angel/SAFE round in year 2.

Watch out for:

- Grant clauses that demand a % of future revenue or IP rights. Read the fine print.
- "Equity-free accelerators" that quietly take a small chunk anyway. Ask before you accept.
`.trim()
  },
  {
    slug: 'cap-table-hygiene',
    title: 'Cap table hygiene from day one',
    summary: 'Five habits that save you from a six-figure legal bill at Series A.',
    body: `
Your cap table is the source of truth for who owns what. Investors will ask for it on day one of due diligence. If it's a mess, the round dies.

- Use a single source of truth. Carta, Pulley, AngelList Stack, or a meticulously-maintained Google Sheet — pick one and stick to it.
- Issue all founder shares at incorporation, not "we'll sort it out later." Sorting it out later costs lawyers, taxes, and friendships.
- Vest every founder. Standard is 4 years with a 1-year cliff. Yes, even you. Yes, even your co-founder who is your cousin.
- Document EVERY equity grant in writing. Verbal "I gave Kwame 2%" deals will sink your company.
- Reserve the option pool BEFORE your first priced round, not as a surprise top-up the investor demands at closing.

Red flags investors look for:

- "Dead equity" — co-founders who left with vested shares. Buy them out early; it gets harder later.
- More than 3-4 entries on the cap table at seed stage. Suggests a chaotic friends-and-family round.
- Convertibles or SAFEs with weird caps that imply silent stacked dilution.

Five minutes a month maintaining the cap table saves five days of legal cleanup at the next round.
`.trim()
  }
];
