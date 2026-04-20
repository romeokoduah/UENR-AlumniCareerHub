// Hand-written negotiation playbooks rendered in Tab 4 of the Salary
// Negotiation tool. Each playbook is a collapsible section in the UI.
//
// `body` is parsed as light-weight markdown: blank-line separates
// paragraphs, lines starting with "- " become bullets, "> " become block
// quotes (used for example phrasing). Keep entries short — these are
// read-on-the-bus references, not essays.

export type Playbook = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

export const SALARY_PLAYBOOKS: Playbook[] = [
  {
    slug: 'negotiate-base-ghana',
    title: 'Negotiating base salary on a Ghana offer',
    summary: 'A four-step script for the most common scenario: you have a written offer in GHS and want more.',
    body: `
Wait for the written offer in your inbox before negotiating. Verbal numbers shift; written numbers anchor.

Lead with enthusiasm, not money. Confirm you want the role, then pivot.

- Quote the benchmark range from this tool — by city and seniority — when the recruiter pushes back.
- Ask for 10-20% above the offer if you're inside the typical range, 5-10% if you're already above the median.
- Frame the ask in monthly take-home terms (Ghanaians budget monthly), not annual gross.

Example phrasing:

> "Thank you so much for the offer. I'm excited about the role and the team. Based on the responsibility and what I'm seeing for similar Mid-level Software Engineer roles in Accra, I was hoping we could land closer to GHS 16,000 per month. Is there room to move on the base?"

If they say "this is the final number," ask what other levers exist — signing bonus, faster review, learning budget. (See "Negotiating a signing bonus when base is fixed".)
`.trim()
  },
  {
    slug: 'signing-bonus-when-base-fixed',
    title: 'Negotiating a signing bonus when base is fixed',
    summary: 'Many Ghanaian employers have rigid salary bands but discretion on one-time payments.',
    body: `
Government-adjacent and large multinational employers often can't move base — but they can authorize a one-time signing bonus to bridge the gap.

- Anchor the bonus to a real cost: relocation, notice-period payout from your current employer, equipment.
- A signing bonus of 1-2 months' base is normal in Ghana for senior hires. Ask for 3 if you're declining a competing offer.
- Get the clawback terms in writing. Standard is "repayable pro-rata if you leave within 12 months."

Example phrasing:

> "I understand the band is fixed. To bridge the gap to my current package, would the team consider a one-time signing bonus of GHS 25,000? It would help me cover the relocation from Kumasi and the gap during my notice period."
`.trim()
  },
  {
    slug: 'counter-offer-templates',
    title: 'Counter-offer scripts (5 templates)',
    summary: 'Copy/paste-ready scripts for the five most common counter-offer scenarios.',
    body: `
Template 1 — Inside the range, asking for the top:

> "Thank you for the offer. I'm confident I can deliver senior-level impact from week one. Could we land at GHS X — the top of the band you mentioned?"

Template 2 — Above the range, justifying your ask:

> "The offer is generous and I appreciate it. Given my five years on the same stack and the immediate hand-off you need, I was targeting GHS X. Is there flexibility on the structure if not the base?"

Template 3 — Competing offer in hand:

> "I want to be transparent: I'm holding a competing offer at GHS X for a similar role. You're my preferred choice — could you match or come within 10%?"

Template 4 — No competing offer, but strong leverage:

> "Based on what I'm seeing for the role in Accra and the scope you've described, GHS X feels like the right number. Can we get there?"

Template 5 — Walking back without burning the bridge:

> "Thank you again — and thank you for considering my counter. I've decided this isn't the right fit at this compensation level, but I'd love to stay in touch for the future."
`.trim()
  },
  {
    slug: 'remote-work-allowance',
    title: 'Negotiating a remote work allowance',
    summary: 'Remote roles often skip the home-office stipend by default. Ask.',
    body: `
Most multinationals budget USD 100-300/month for home-office costs but only pay it when asked.

- Itemize: internet (the big one in Ghana — fibre is expensive), electricity, cooling, ergonomics.
- Ask for it as a recurring monthly allowance, not a one-time setup fee. Ergonomic chairs and standing desks fail; the allowance keeps paying.
- If the employer refuses recurring, ask for a one-time setup budget of USD 1,500-2,500.

Example phrasing:

> "For a fully remote role, I usually request a monthly home-office allowance to cover internet, power backup, and equipment depreciation. Would USD 200/month work, or do you have a standard package?"
`.trim()
  },
  {
    slug: 'equity-101',
    title: 'Equity 101 — what to ask before signing',
    summary: 'Diaspora and tech-startup offers come with equity. Most Ghanaian grads have never held it.',
    body: `
Equity is a lottery ticket, not cash. Treat it that way when comparing offers.

Five questions to ask before you sign:

- What's the most recent 409A (US) or fair-market valuation? What's the strike price per share?
- How many shares total are outstanding (not just authorized)? Your % matters more than your share count.
- What's the vesting schedule? Standard is 4 years with a 1-year cliff.
- What happens if I'm let go? Look for "double-trigger acceleration" if you're senior.
- What's the exercise window after I leave? Standard is 90 days; great employers extend to 7-10 years.

Example phrasing:

> "Could you share the latest preferred-share price and the total fully-diluted share count? I want to model what the grant might be worth at different exit valuations."
`.trim()
  },
  {
    slug: 'benefits-beyond-salary',
    title: 'Benefits beyond salary (pension, health, leave)',
    summary: 'Ghanaian and international packages have very different benefit structures. Compare apples to apples.',
    body: `
Ghana statutory minimums (employer side):

- SSNIT: employer pays 13%, employee pays 5.5% of basic salary into Tier 1 + Tier 2.
- Tier 3: voluntary, employer match common at 5-10%. Worth asking for.
- Annual leave: minimum 15 working days. Many private firms offer 21+.
- Maternity: minimum 12 weeks paid; some employers offer 16.

Things to negotiate that don't show up on the offer letter:

- Private health insurance (Acacia, Nationwide, Glico). A senior plan is GHS 8,000-15,000/year of value.
- Annual learning budget (USD 1,000-3,000 for a senior role is reasonable).
- Conference travel — at least one international conference per year.
- Sabbatical eligibility — increasingly common after 3-5 years tenure.

Example phrasing:

> "What does the benefits package look like in addition to base — health, pension match, leave, learning budget? I want to compare total value, not just headline salary."
`.trim()
  },
  {
    slug: 'when-to-walk-away',
    title: 'When to walk away',
    summary: 'A small list of red flags that say "this offer is not for you, no matter what they fix."',
    body: `
Walk away if:

- The offer is more than 30% below the typical market range and they refuse to move.
- The role title or scope changes after you accept verbally but before paperwork.
- They ask you to start before the contract is signed.
- The clawback terms on signing bonus, equity, or training spend are 36+ months.
- The interview process surfaced a red flag (skipped reference check, unprofessional behaviour, vague answers about funding) that they can't address head-on.
- You'd resent the role at 50% more pay. Money fixes a fair offer; it doesn't fix a wrong job.

Example phrasing:

> "Thank you for the conversation and the offer. I've decided to take a different path. I appreciate the time the team invested and would value staying in touch."
`.trim()
  },
  {
    slug: 'multinational-vs-sme',
    title: 'Negotiating with a multinational vs a Ghana SME',
    summary: 'Different employer types respond to different negotiation moves. Don\'t use the same script for both.',
    body: `
Multinational (MTN, AngloGold, Newmont, Tullow, Big Four, Standard Chartered):

- Salary bands are real. Hard ceiling on base, more flexibility on bonus, allowances, learning budget.
- HR runs negotiation — keep it professional and paper-trail-heavy.
- Ask for the band, not just an offer number. They'll often share it if you ask directly.
- Best leverage: a competing offer at the same tier or a documented internal-promotion timeline.

Ghana SME (most local startups, family businesses, growing tech firms):

- Bands are negotiable, sometimes invented on the spot.
- Founder or CEO often signs off — keep the conversation human, ground it in their growth story.
- Equity is usually informal; insist on a written share/vesting agreement before accepting.
- Best leverage: showing you can directly raise revenue or cut a specific cost — not your CV.

Example phrasing for an SME founder:

> "I'm bought into the vision. Before we land on numbers, can we talk through the next 12 months — what does success look like for me, and what does the company need to look like at that point? I want to design a package that aligns the two."
`.trim()
  }
];
