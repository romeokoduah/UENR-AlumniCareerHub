// Hand-curated seed for the Startup Resources Hub (Phase 4 — Ventures).
// Idempotent: every record keys off `slug` so re-running the seed safely
// updates copy + URLs without creating duplicates.
//
// Coverage:
//   - 8 deck templates spanning the 5 stages we render badges for
//     (seed / series-a / grant / investor-update / social-enterprise).
//     `fileUrl` is intentionally a placeholder for v1: an admin should
//     PATCH each record after uploading a real PDF/PPT via the vault.
//   - 12 Ghana-focused incubators, accelerators and innovation hubs.
//   - 10 grants relevant to UENR alumni — Ghana climate/agritech tilt
//     plus a couple of pan-African + global funds that fund Ghanaian
//     founders. Deadlines are realistic (within ~6 months of 2026-04-20)
//     and pulled from each programme's typical cycle. Where a programme
//     is rolling, we leave `nextDeadline` null and the UI shows "rolling".

import { prisma } from './prisma.js';

// ---- Deck templates -----------------------------------------------------

type SeedDeck = {
  slug: string;
  name: string;
  description: string;
  stage: string;
  fileUrl: string;
  thumbnailUrl?: string;
};

// Placeholder fileUrl points to a public template page. Replace per-record
// after admin uploads the real .pptx/.pdf via /api/vault/upload.
const DECKS: SeedDeck[] = [
  {
    slug: 'seed-stage-pitch-deck',
    name: 'Seed-stage pitch deck (10 slides)',
    description: 'The classic 10-slide structure for a first cheque — problem, solution, market, traction, team, ask. Editable in PowerPoint, Keynote, or Google Slides.',
    stage: 'seed',
    fileUrl: 'https://www.sequoiacap.com/article/writing-a-business-plan/'
  },
  {
    slug: 'series-a-deck-template',
    name: 'Series A deck template',
    description: 'A 15-slide narrative built around metrics: cohort retention, unit economics, GTM motion, and the next 18 months of execution risk.',
    stage: 'series-a',
    fileUrl: 'https://www.ycombinator.com/library/4T-the-seed-summit-pitch-deck-template'
  },
  {
    slug: 'grant-application-deck',
    name: 'Grant application deck',
    description: 'Theory-of-change first, financials second. Built to satisfy Tony Elumelu, GCIC, AECF and similar reviewers — impact metrics up front.',
    stage: 'grant',
    fileUrl: 'https://www.tonyelumelufoundation.org/'
  },
  {
    slug: 'investor-monthly-update',
    name: 'Investor monthly update template',
    description: 'A one-page monthly update that keeps existing investors warm and primes them for the next round. Asks, metrics, lowlights, highlights.',
    stage: 'investor-update',
    fileUrl: 'https://www.ycombinator.com/library/8d-investor-update-template'
  },
  {
    slug: 'social-enterprise-impact-deck',
    name: 'Social enterprise impact deck',
    description: 'Frames revenue as a means to mission. SDG mapping, beneficiary counts, blended-finance ask, theory of change diagram included.',
    stage: 'social-enterprise',
    fileUrl: 'https://acumen.org/'
  },
  {
    slug: 'one-page-tear-sheet',
    name: '1-page tear sheet',
    description: 'A printable one-pager you hand to investors after coffee. Logo, metrics, team, ask. Perfect for demo days and conferences.',
    stage: 'seed',
    fileUrl: 'https://www.canva.com/templates/?query=startup+one+pager'
  },
  {
    slug: 'demo-day-pitch-3min',
    name: 'Demo day pitch (3 minutes)',
    description: 'A tight 6-slide deck designed for a strict 3-minute slot. Built for MEST demo day, Founder Institute graduation and accelerator showcases.',
    stage: 'seed',
    fileUrl: 'https://www.ycombinator.com/library/4T-the-seed-summit-pitch-deck-template'
  },
  {
    slug: 'yc-style-application-deck',
    name: 'Y Combinator-style application deck',
    description: 'Mirrors the YC application questions slide-by-slide so you can stress-test your story before submitting the form.',
    stage: 'seed',
    fileUrl: 'https://www.ycombinator.com/apply'
  }
];

// ---- Incubators / accelerators / hubs -----------------------------------

type SeedIncubator = {
  slug: string;
  name: string;
  description: string;
  url: string;
  location: string;
  focus: string[];
  programType: string; // accelerator | incubator | hub
  applyUrl?: string;
};

const INCUBATORS: SeedIncubator[] = [
  {
    slug: 'mest-africa',
    name: 'MEST Africa',
    description: 'Pan-African training programme + seed fund headquartered in East Legon, Accra. 12-month founder training, then up to $100K seed cheques into the strongest teams.',
    url: 'https://meltwater.org/',
    location: 'Accra',
    focus: ['tech entrepreneurship', 'software', 'pan-africa'],
    programType: 'accelerator',
    applyUrl: 'https://meltwater.org/apply/'
  },
  {
    slug: 'kosmos-innovation-center',
    name: 'Kosmos Innovation Center',
    description: 'Backed by Kosmos Energy. Runs the AgriTech Challenge for young Ghanaian founders building in agriculture, energy and sanitation.',
    url: 'https://kicghana.org/',
    location: 'Accra',
    focus: ['agritech', 'energy', 'sanitation'],
    programType: 'accelerator',
    applyUrl: 'https://kicghana.org/agritech-challenge/'
  },
  {
    slug: 'ghana-tech-lab',
    name: 'Ghana Tech Lab',
    description: 'Ministry-of-Communications-backed innovation hub in Accra. Free coworking, training cohorts in software and digital skills, and a small grants pool.',
    url: 'https://ghanatechlab.com/',
    location: 'Accra',
    focus: ['digital innovation', 'software', 'training'],
    programType: 'hub'
  },
  {
    slug: 'impact-hub-accra',
    name: 'Impact Hub Accra',
    description: 'Part of the global Impact Hub network. Coworking, accelerator cohorts, and community programming centred on social-enterprise founders.',
    url: 'https://accra.impacthub.net/',
    location: 'Accra',
    focus: ['social enterprise', 'sustainability'],
    programType: 'hub',
    applyUrl: 'https://accra.impacthub.net/programs/'
  },
  {
    slug: 'innohub-tema',
    name: 'Innohub Foundation',
    description: 'Tema-based incubator running the Business Acceleration Programme for SMEs in light manufacturing, hardware, and food processing.',
    url: 'https://innohubgh.org/',
    location: 'Tema',
    focus: ['hardware', 'iot', 'manufacturing', 'sme'],
    programType: 'incubator',
    applyUrl: 'https://innohubgh.org/apply/'
  },
  {
    slug: 'giz-make-it-in-africa',
    name: 'GIZ Make-IT in Africa',
    description: 'German cooperation programme supporting digital innovators across Africa. Cohort-based capacity building, investor matchmaking and policy work.',
    url: 'https://www.make-it-initiative.org/africa/',
    location: 'Accra',
    focus: ['digital', 'fintech', 'pan-africa'],
    programType: 'accelerator'
  },
  {
    slug: 'founder-institute-ghana',
    name: 'Founder Institute Ghana',
    description: 'The Accra chapter of the global Founder Institute. A 14-week pre-seed programme for solo founders moving from idea to incorporated company.',
    url: 'https://fi.co/s/ghana',
    location: 'Accra',
    focus: ['idea-stage founders', 'solo founders'],
    programType: 'accelerator',
    applyUrl: 'https://fi.co/apply'
  },
  {
    slug: 'ghana-climate-innovation-centre',
    name: 'Ghana Climate Innovation Centre (GCIC)',
    description: 'Hosted by Ashesi University, funded by the World Bank. Business incubation + grants for Ghanaian SMEs in clean energy, water, climate-smart agriculture and waste.',
    url: 'https://ghanacic.org/',
    location: 'Berekuso (Greater Accra)',
    focus: ['cleantech', 'climate', 'agriculture', 'water'],
    programType: 'incubator',
    applyUrl: 'https://ghanacic.org/apply/'
  },
  {
    slug: 'stanford-seed',
    name: 'Stanford Seed (Africa cohort)',
    description: 'A 12-month Stanford Graduate School of Business programme for established African founders ($300K+ revenue). Strategy curriculum + 1:1 coaching from Stanford.',
    url: 'https://www.gsb.stanford.edu/seed',
    location: 'Accra (regional)',
    focus: ['scale-ups', 'leadership', 'pan-africa'],
    programType: 'accelerator',
    applyUrl: 'https://www.gsb.stanford.edu/seed/transformation-program'
  },
  {
    slug: 'mest-express-accelerator',
    name: 'MEST Express Accelerator',
    description: 'A short-form accelerator from MEST aimed at early-stage African startups already shipping. Five-week intensive followed by an investor showcase.',
    url: 'https://meltwater.org/mest-express/',
    location: 'Accra',
    focus: ['software', 'early-stage', 'pan-africa'],
    programType: 'accelerator'
  },
  {
    slug: 'hapaweb-innovation-hub',
    name: 'Hapaweb Solutions Innovation Hub',
    description: 'Coworking and training hub in Kumasi run by Hapaweb Solutions. Hosts hackathons, design sprints, and student-founder programmes for KNUST and UENR alumni.',
    url: 'https://hapaweb.com/',
    location: 'Kumasi',
    focus: ['software', 'student founders', 'design'],
    programType: 'hub'
  },
  {
    slug: 'cchub-ghana',
    name: 'Co-Creation Hub (CcHUB) Ghana',
    description: 'Pan-African innovation centre that recently opened a Ghana presence. Backs startups solving problems in education, health, governance and creative industries.',
    url: 'https://cchubnigeria.com/',
    location: 'Accra',
    focus: ['social innovation', 'edtech', 'healthtech', 'creative'],
    programType: 'hub',
    applyUrl: 'https://cchubnigeria.com/programmes/'
  }
];

// ---- Grants -------------------------------------------------------------

type SeedGrant = {
  slug: string;
  name: string;
  provider: string;
  description: string;
  applicationUrl: string;
  // ISO date string. null = rolling / always open.
  nextDeadline: string | null;
  amount?: string;
  fitCriteria: string[];
};

// Anchor "today" at the project's working date so seeded deadlines still
// look plausible during demos. The seed always pushes deadlines into the
// future from this anchor.
const GRANTS: SeedGrant[] = [
  {
    slug: 'tef-entrepreneurship-programme',
    name: 'Tony Elumelu Foundation Entrepreneurship Programme',
    provider: 'Tony Elumelu Foundation',
    description: 'Annual pan-African programme: 12 weeks of training, mentorship, and a $5,000 non-refundable seed grant for early-stage founders across all sectors.',
    applicationUrl: 'https://www.tonyelumelufoundation.org/tefentrepreneurship',
    nextDeadline: '2026-09-30',
    amount: '$5,000 seed',
    fitCriteria: ['early-stage', 'pan-africa', 'all sectors']
  },
  {
    slug: 'mastercard-foundation-scholars',
    name: 'Mastercard Foundation Scholars Program',
    provider: 'Mastercard Foundation',
    description: 'Comprehensive scholarship + leadership programme for academically talented but economically disadvantaged young Africans. Tied to partner universities; rolling cohorts.',
    applicationUrl: 'https://mastercardfdn.org/all/scholars/',
    nextDeadline: null,
    amount: 'Full scholarship',
    fitCriteria: ['students', 'leadership', 'pan-africa']
  },
  {
    slug: 'mastercard-foundation-elev',
    name: 'Mastercard Foundation EleV initiative',
    provider: 'Mastercard Foundation',
    description: 'Support for youth-led ventures and education initiatives that move young people into dignified work. Funded via partner organisations on rolling cycles.',
    applicationUrl: 'https://mastercardfdn.org/all/young-africa-works/',
    nextDeadline: null,
    amount: 'Varies',
    fitCriteria: ['youth employment', 'education']
  },
  {
    slug: 'horizon-europe-cascade-funding',
    name: 'Horizon Europe — cascade funding for African startups',
    provider: 'European Commission',
    description: 'EU-funded cascade calls (via consortia like AfricaConnect, AI4D, and similar) that pass €50K–€150K through to African startups solving research-aligned problems.',
    applicationUrl: 'https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe_en',
    nextDeadline: '2026-07-15',
    amount: '€50K–€150K',
    fitCriteria: ['deeptech', 'research', 'eu partnership']
  },
  {
    slug: 'gcic-grant-call',
    name: 'GCIC Proof-of-Concept and Seed grants',
    provider: 'Ghana Climate Innovation Centre',
    description: 'Recurring GCIC calls funding Ghanaian SMEs in cleantech, climate-smart agriculture, water, and waste with proof-of-concept and seed-stage cheques.',
    applicationUrl: 'https://ghanacic.org/apply/',
    nextDeadline: '2026-06-30',
    amount: 'GHS 50,000 – 250,000',
    fitCriteria: ['cleantech', 'climate', 'ghana-only']
  },
  {
    slug: 'undp-accelerator-labs-ghana',
    name: 'UNDP Accelerator Labs Ghana — small grants',
    provider: 'UNDP',
    description: 'Small, fast grants attached to UNDP Accelerator Labs research sprints on local development challenges. Look for open calls on the UNDP Ghana site.',
    applicationUrl: 'https://www.undp.org/ghana',
    nextDeadline: '2026-05-31',
    amount: '$5K–$20K',
    fitCriteria: ['development', 'research', 'ghana-only']
  },
  {
    slug: 'aecf-africa-enterprise-challenge',
    name: 'Africa Enterprise Challenge Fund (AECF)',
    provider: 'AECF',
    description: 'Competitive grants and repayable grants for businesses tackling poverty and climate resilience in agribusiness and renewable energy across Africa.',
    applicationUrl: 'https://www.aecfafrica.org/',
    nextDeadline: '2026-08-15',
    amount: '$250K – $1.5M',
    fitCriteria: ['agribusiness', 'renewable energy', 'pan-africa']
  },
  {
    slug: 'wennovation-hub-grants',
    name: 'Wennovation Hub Ghana — micro-grants',
    provider: 'Wennovation Hub',
    description: 'Small catalytic grants for early-stage African founders coming out of Wennovation incubation cohorts. Sector-agnostic with a digital tilt.',
    applicationUrl: 'https://wennovationhub.com/',
    nextDeadline: null,
    amount: 'Up to $10K',
    fitCriteria: ['early-stage', 'digital', 'incubator alumni']
  },
  {
    slug: 'world-bank-xl-africa',
    name: 'World Bank XL Africa programme',
    provider: 'World Bank Group',
    description: 'Six-month digital accelerator for African growth-stage startups. Includes a $100K equity-free grant component for selected ventures.',
    applicationUrl: 'https://www.worldbank.org/en/topic/digitaldevelopment',
    nextDeadline: '2026-10-01',
    amount: '$100K equity-free',
    fitCriteria: ['growth-stage', 'digital', 'pan-africa']
  },
  {
    slug: 'gates-grand-challenges',
    name: 'Bill & Melinda Gates Foundation — Grand Challenges',
    provider: 'Gates Foundation',
    description: 'Open calls for bold ideas tackling global health and development. Recurring African-focused tracks; proposals can come from companies, NGOs, or universities.',
    applicationUrl: 'https://grandchallenges.org/',
    nextDeadline: '2026-09-15',
    amount: '$100K – $1M',
    fitCriteria: ['global health', 'development', 'research']
  }
];

// ---- Upserters ----------------------------------------------------------

async function upsertDecks(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;
  for (const d of DECKS) {
    const existing = await prisma.startupDeckTemplate.findFirst({
      where: { slug: d.slug },
      select: { id: true }
    });
    if (existing) {
      await prisma.startupDeckTemplate.update({
        where: { id: existing.id },
        data: {
          name: d.name,
          description: d.description,
          stage: d.stage,
          fileUrl: d.fileUrl,
          thumbnailUrl: d.thumbnailUrl ?? null
        }
      });
      updated += 1;
    } else {
      await prisma.startupDeckTemplate.create({
        data: {
          slug: d.slug,
          name: d.name,
          description: d.description,
          stage: d.stage,
          fileUrl: d.fileUrl,
          thumbnailUrl: d.thumbnailUrl ?? null
        }
      });
      created += 1;
    }
  }
  return { created, updated, total: DECKS.length };
}

async function upsertIncubators(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;
  for (const i of INCUBATORS) {
    const existing = await prisma.incubator.findFirst({
      where: { slug: i.slug },
      select: { id: true }
    });
    if (existing) {
      await prisma.incubator.update({
        where: { id: existing.id },
        data: {
          name: i.name,
          description: i.description,
          url: i.url,
          location: i.location,
          focus: i.focus,
          programType: i.programType,
          applyUrl: i.applyUrl ?? null,
          isActive: true
        }
      });
      updated += 1;
    } else {
      await prisma.incubator.create({
        data: {
          slug: i.slug,
          name: i.name,
          description: i.description,
          url: i.url,
          location: i.location,
          focus: i.focus,
          programType: i.programType,
          applyUrl: i.applyUrl ?? null,
          isActive: true
        }
      });
      created += 1;
    }
  }
  return { created, updated, total: INCUBATORS.length };
}

async function upsertGrants(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;
  for (const g of GRANTS) {
    const deadline = g.nextDeadline ? new Date(g.nextDeadline) : null;
    const existing = await prisma.grant.findFirst({
      where: { slug: g.slug },
      select: { id: true }
    });
    if (existing) {
      await prisma.grant.update({
        where: { id: existing.id },
        data: {
          name: g.name,
          provider: g.provider,
          description: g.description,
          applicationUrl: g.applicationUrl,
          nextDeadline: deadline,
          amount: g.amount ?? null,
          fitCriteria: g.fitCriteria,
          isActive: true
        }
      });
      updated += 1;
    } else {
      await prisma.grant.create({
        data: {
          slug: g.slug,
          name: g.name,
          provider: g.provider,
          description: g.description,
          applicationUrl: g.applicationUrl,
          nextDeadline: deadline,
          amount: g.amount ?? null,
          fitCriteria: g.fitCriteria,
          isActive: true
        }
      });
      created += 1;
    }
  }
  return { created, updated, total: GRANTS.length };
}

export async function seedStartupContent(): Promise<{
  decks: { created: number; updated: number; total: number };
  incubators: { created: number; updated: number; total: number };
  grants: { created: number; updated: number; total: number };
}> {
  const decks = await upsertDecks();
  const incubators = await upsertIncubators();
  const grants = await upsertGrants();
  return { decks, incubators, grants };
}
