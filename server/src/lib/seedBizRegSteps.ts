// Hand-curated seed for the Ghana Business Registration Guide. Idempotent —
// every step keys off its `slug` (findFirst → update or create).
//
// Coverage: 5 categories, ~31 steps. Sourced from RGD/GRA/SSNIT/GIPC fee
// schedules + sector regulator guidance current to 2024–2026. Time + cost
// figures are realistic ranges expressed as a single representative integer
// (lower-mid of the range) so the UI can render compact badges.
//
// NOT legal advice. The page surfaces a disclaimer to that effect.

import { pathToFileURL } from 'url';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

type FormDownload = { label: string; url: string };

type SeedStep = {
  slug: string;
  authority: string;
  title: string;
  description: string;
  estimatedTimeDays?: number;
  estimatedCostGhs?: number;
  pitfalls?: string;
  officialUrl?: string;
  formDownloads?: FormDownload[];
  position: number;
  category:
    | 'sole-prop'
    | 'partnership'
    | 'llc'
    | 'foreign-investment'
    | 'sector-specific';
};

const STEPS: SeedStep[] = [
  // ===== Sole proprietorship ===========================================
  {
    slug: 'sole-prop-name-search',
    authority: 'RGD',
    title: 'Reserve a business name',
    description:
      'Search the Registrar-General\'s Department register for name availability and reserve your preferred name. You can do this online via the RGD eRegistrar portal or in person at the Accra head office or any regional office.',
    estimatedTimeDays: 2,
    estimatedCostGhs: 60,
    pitfalls:
      'Names that include "Ghana", "National", "Government", or anything resembling an existing trademark will be rejected. Have 2–3 backups ready.',
    officialUrl: 'https://eregistrar.rgd.gov.gh',
    position: 1,
    category: 'sole-prop'
  },
  {
    slug: 'sole-prop-register-business',
    authority: 'RGD',
    title: 'Register the business at RGD',
    description:
      'File Form A (Registration of Business Name) with the proprietor\'s details, Ghana Card number, principal place of business, and nature of business. RGD issues a Certificate of Registration plus a Business Registration Number.',
    estimatedTimeDays: 10,
    estimatedCostGhs: 60,
    pitfalls:
      'Form A must be signed by the sole proprietor in person — RGD will refuse a notarised copy. Bring your original Ghana Card.',
    officialUrl: 'https://rgd.gov.gh',
    formDownloads: [
      { label: 'Form A (Business Name Registration)', url: 'https://rgd.gov.gh/forms/' }
    ],
    position: 2,
    category: 'sole-prop'
  },
  {
    slug: 'sole-prop-tin',
    authority: 'GRA',
    title: 'Get a Tax Identification Number (TIN)',
    description:
      'If you registered with RGD using your Ghana Card, your Ghana Card PIN doubles as your TIN — same-day. If not, register on the GRA Taxpayers Portal and link your business.',
    estimatedTimeDays: 1,
    estimatedCostGhs: 0,
    officialUrl: 'https://gra.gov.gh',
    position: 3,
    category: 'sole-prop'
  },
  {
    slug: 'sole-prop-bank-account',
    authority: 'Bank',
    title: 'Open a business bank account',
    description:
      'Take your RGD certificate, TIN/Ghana Card, and a passport photo to your bank of choice. Most banks ask for two introducers and proof of business address (utility bill works).',
    estimatedTimeDays: 3,
    pitfalls:
      'Some banks require a minimum opening deposit (GHS 200–500) and a six-month operating period before they enable cheque books.',
    position: 4,
    category: 'sole-prop'
  },
  {
    slug: 'sole-prop-vat',
    authority: 'GRA',
    title: 'Register for VAT (if turnover > GHS 200,000)',
    description:
      'VAT registration is mandatory once 12-month turnover exceeds GHS 200,000 (or GHS 50,000 in any 3-month rolling period). Apply on the GRA Taxpayers Portal; you\'ll receive a VAT Certificate to display at your premises.',
    estimatedTimeDays: 7,
    estimatedCostGhs: 0,
    pitfalls:
      'Standard VAT is 15% plus 2.5% NHIL + 2.5% GETFund + 1% COVID-19 levy. The 4% VAT Flat Rate Scheme only applies to specific retailers — check eligibility first.',
    officialUrl: 'https://taxpayersportal.com',
    position: 5,
    category: 'sole-prop'
  },

  // ===== Partnership ===================================================
  {
    slug: 'partnership-agreement',
    authority: 'Lawyer',
    title: 'Draft and sign a partnership agreement',
    description:
      'Engage a lawyer to draft a partnership deed covering capital contributions, profit-sharing, decision rights, dispute resolution, and exit terms. Each partner signs in front of a Commissioner of Oaths.',
    estimatedTimeDays: 14,
    estimatedCostGhs: 2500,
    pitfalls:
      'Skipping this step is the #1 cause of partnership breakdowns in Ghana. The Incorporated Partnership Act 1962 (Act 152) sets default rules that rarely match what partners actually wanted.',
    position: 1,
    category: 'partnership'
  },
  {
    slug: 'partnership-name-search',
    authority: 'RGD',
    title: 'Reserve the partnership name',
    description:
      'Search and reserve the partnership name on the eRegistrar portal. Partnership names must end with "and Partners", "& Partners", or "& Co." unless RGD waives the requirement.',
    estimatedTimeDays: 2,
    estimatedCostGhs: 60,
    officialUrl: 'https://eregistrar.rgd.gov.gh',
    position: 2,
    category: 'partnership'
  },
  {
    slug: 'partnership-file-rgd',
    authority: 'RGD',
    title: 'File the partnership at RGD',
    description:
      'Submit Form A (Incorporated Partnership) with the deed, partner details, Ghana Cards, and a statement of capital. RGD issues a Certificate of Registration of Partnership.',
    estimatedTimeDays: 14,
    estimatedCostGhs: 200,
    pitfalls:
      'Maximum 20 partners (except for legal/accountancy firms which can go higher). Foreign nationals as partners trigger GIPC requirements — see the Foreign Investment category.',
    officialUrl: 'https://rgd.gov.gh',
    position: 3,
    category: 'partnership'
  },
  {
    slug: 'partnership-tin',
    authority: 'GRA',
    title: 'Get a partnership TIN',
    description:
      'Register the partnership entity for tax on the GRA Taxpayers Portal. Each partner is also separately taxed on their share of profits, so individual TINs must already be in place.',
    estimatedTimeDays: 5,
    estimatedCostGhs: 0,
    officialUrl: 'https://gra.gov.gh',
    position: 4,
    category: 'partnership'
  },
  {
    slug: 'partnership-bank-account',
    authority: 'Bank',
    title: 'Open a partnership bank account',
    description:
      'Take the RGD certificate, partnership deed, TIN, and all partners\' Ghana Cards to the bank. Mandates usually require any two partners to sign for transactions above a stated threshold.',
    estimatedTimeDays: 5,
    pitfalls:
      'Decide signing rules in writing before walking into the bank — changing the mandate later requires every partner\'s signed consent.',
    position: 5,
    category: 'partnership'
  },

  // ===== Limited Liability Company (LLC) ===============================
  {
    slug: 'llc-name-search',
    authority: 'RGD',
    title: 'Reserve the company name',
    description:
      'Search availability and reserve the proposed name on the eRegistrar portal. Company names must end with "Limited" or "LTD" for private companies and "PLC" for public ones.',
    estimatedTimeDays: 2,
    estimatedCostGhs: 60,
    officialUrl: 'https://eregistrar.rgd.gov.gh',
    position: 1,
    category: 'llc'
  },
  {
    slug: 'llc-prepare-docs',
    authority: 'RGD',
    title: 'Prepare incorporation documents',
    description:
      'Draft the company\'s constitution (formerly "regulations"), prepare Form 3 (Application for Incorporation), and gather director, secretary, and auditor consent forms. A company must have at least one director ordinarily resident in Ghana.',
    estimatedTimeDays: 7,
    pitfalls:
      'Under the Companies Act 2019 (Act 992) you must appoint an auditor within 18 months — and the auditor must consent in writing on Form 8 before incorporation.',
    officialUrl: 'https://rgd.gov.gh',
    formDownloads: [
      { label: 'Form 3 (Application for Incorporation)', url: 'https://rgd.gov.gh/forms/' }
    ],
    position: 2,
    category: 'llc'
  },
  {
    slug: 'llc-file-rgd',
    authority: 'RGD',
    title: 'File at RGD with stamp duty',
    description:
      'Submit Form 3 + constitution + Forms 8/26A (auditor and secretary consent), pay the incorporation fee plus 0.5% stamp duty on stated capital. Minimum stated capital is GHS 500 for wholly Ghanaian-owned companies.',
    estimatedTimeDays: 10,
    estimatedCostGhs: 330,
    pitfalls:
      'Stamp duty is 0.5% of stated capital — over-stating capital to look impressive will cost you real money. Keep it conservative; you can increase it later.',
    officialUrl: 'https://rgd.gov.gh',
    position: 3,
    category: 'llc'
  },
  {
    slug: 'llc-certificate',
    authority: 'RGD',
    title: 'Receive Certificate of Incorporation',
    description:
      'RGD issues the Certificate of Incorporation, the Certificate to Commence Business, and a stamped copy of the constitution. These three documents are your proof of legal existence.',
    estimatedTimeDays: 3,
    pitfalls:
      'Make several certified copies — banks, GIPC, and most large clients will keep a copy on file. RGD charges per certified extract.',
    position: 4,
    category: 'llc'
  },
  {
    slug: 'llc-tin',
    authority: 'GRA',
    title: 'Register the company for tax',
    description:
      'Apply for a corporate TIN on the GRA Taxpayers Portal. Companies fall under corporate income tax (default 25%, lower for some sectors and free-zone enterprises).',
    estimatedTimeDays: 5,
    estimatedCostGhs: 0,
    officialUrl: 'https://gra.gov.gh',
    position: 5,
    category: 'llc'
  },
  {
    slug: 'llc-directors-tin',
    authority: 'GRA',
    title: 'Register all directors at GRA',
    description:
      'Every director must have a personal TIN linked to their Ghana Card. GRA cross-checks director TINs against the company filing — missing ones will block your tax clearance certificate later.',
    estimatedTimeDays: 3,
    estimatedCostGhs: 0,
    officialUrl: 'https://gra.gov.gh',
    position: 6,
    category: 'llc'
  },
  {
    slug: 'llc-ssnit',
    authority: 'SSNIT',
    title: 'Register with SSNIT (if hiring employees)',
    description:
      'Once you hire your first employee (including a working director on payroll), register with SSNIT. You contribute 13% of basic salary; the employee 5.5% — total 18.5% to the Three-Tier Pension Scheme.',
    estimatedTimeDays: 7,
    estimatedCostGhs: 0,
    pitfalls:
      'Late SSNIT contributions attract a 3% per month penalty. The Tier 2 (5%) goes to a private trustee — you must select one within 90 days of registration.',
    officialUrl: 'https://www.ssnit.org.gh',
    position: 7,
    category: 'llc'
  },

  // ===== Foreign investment (GIPC route) ===============================
  {
    slug: 'foreign-local-entity',
    authority: 'RGD',
    title: 'Set up a local entity at RGD',
    description:
      'Foreign investors must first incorporate a Ghanaian LLC (or register an external company / branch) at RGD before they can apply to GIPC. Branch registration uses Form 20 and requires authenticated home-country documents.',
    estimatedTimeDays: 21,
    estimatedCostGhs: 600,
    pitfalls:
      'A branch is taxed at 25% plus an 8% branch profit remittance tax — a wholly-owned Ghanaian subsidiary often ends up cheaper.',
    officialUrl: 'https://rgd.gov.gh',
    position: 1,
    category: 'foreign-investment'
  },
  {
    slug: 'foreign-gipc-registration',
    authority: 'GIPC',
    title: 'Register with GIPC and meet minimum capital',
    description:
      'Apply on the GIPC portal with the company\'s RGD documents and proof of capital transfer. Minimum equity capital: USD 200,000 for joint ventures with a Ghanaian (10% min Ghanaian shareholding), USD 500,000 for wholly foreign-owned, USD 1,000,000 for trading enterprises (which must also employ at least 20 Ghanaians).',
    estimatedTimeDays: 14,
    estimatedCostGhs: 0,
    pitfalls:
      'Capital can be in cash or equipment, but the Bank of Ghana must confirm receipt. GIPC will not process the application until BoG issues the Forex Inflow Confirmation.',
    officialUrl: 'https://www.gipc.gov.gh',
    position: 2,
    category: 'foreign-investment'
  },
  {
    slug: 'foreign-bog-account',
    authority: 'Bank of Ghana',
    title: 'Open a foreign-currency bank account and transfer capital',
    description:
      'Open a USD/EUR/GBP account with a Class 1 commercial bank. Transfer the GIPC minimum capital from abroad — the bank issues a Forex Inflow Confirmation that BoG counter-signs and forwards to GIPC.',
    estimatedTimeDays: 10,
    pitfalls:
      'Capital sent before incorporation cannot be counted — make sure the RGD certificate is in hand first, otherwise the inflow goes to the founder personally.',
    officialUrl: 'https://www.bog.gov.gh',
    position: 3,
    category: 'foreign-investment'
  },
  {
    slug: 'foreign-work-permits',
    authority: 'Ghana Immigration Service',
    title: 'Apply for work permits and residence permits',
    description:
      'GIPC-registered companies get an automatic immigrant quota of 1–4 expatriate slots based on capital (USD 50K–700K+). For each expatriate, file a work-permit application with Ghana Immigration Service (GIS), then a residence permit once they arrive.',
    estimatedTimeDays: 60,
    estimatedCostGhs: 9000,
    pitfalls:
      'Work permits and residence permits are separate applications — many investors only apply for one and get fined at the airport. Allow 8–10 weeks for both.',
    officialUrl: 'https://gis.gov.gh',
    position: 4,
    category: 'foreign-investment'
  },
  {
    slug: 'foreign-gra-tax',
    authority: 'GRA',
    title: 'Register for tax at GRA',
    description:
      'Register the new entity for corporate income tax, PAYE, VAT, and any sector-specific levies. Foreign-owned companies pay the standard 25% corporate rate but enjoy GIPC tax holidays in priority sectors (agro-processing, ICT, real estate for affordable housing).',
    estimatedTimeDays: 5,
    estimatedCostGhs: 0,
    officialUrl: 'https://gra.gov.gh',
    position: 5,
    category: 'foreign-investment'
  },

  // ===== Sector-specific licenses ======================================
  {
    slug: 'sector-epa-permit',
    authority: 'EPA',
    title: 'Environmental permit (EPA)',
    description:
      'The Environmental Protection Agency issues permits for any business with environmental impact — manufacturing, mining, construction, waste handling. You file an Environmental Assessment Registration; the EPA decides whether you need a full EIA or a Preliminary Environmental Report.',
    estimatedTimeDays: 90,
    estimatedCostGhs: 5000,
    pitfalls:
      'A full EIA can take 6+ months and cost GHS 50,000+ in consultant fees. Start this in parallel with your RGD/GIPC filings, not after.',
    officialUrl: 'https://www.epa.gov.gh',
    position: 1,
    category: 'sector-specific'
  },
  {
    slug: 'sector-minerals-concession',
    authority: 'Minerals Commission',
    title: 'Mining or quarrying concession (Minerals Commission)',
    description:
      'Mineral rights (reconnaissance, prospecting, mining lease, restricted mining lease) are granted by the Minister for Lands and Natural Resources on the Minerals Commission\'s recommendation. Small-scale mining licences are restricted to Ghanaian citizens.',
    estimatedTimeDays: 180,
    pitfalls:
      'Foreigners cannot hold small-scale mining (galamsey) licences — only large-scale mining leases. Concessions overlap with EPA, Forestry Commission, and Lands Commission consents.',
    officialUrl: 'https://www.mincom.gov.gh',
    position: 2,
    category: 'sector-specific'
  },
  {
    slug: 'sector-energy-commission',
    authority: 'Energy Commission',
    title: 'Energy / power-sector licence (Energy Commission)',
    description:
      'Renewable-energy installation, electrical wiring, LPG distribution, and power generation/transmission/distribution all need an Energy Commission licence. Solar PV installers in particular need certification under the Renewable Energy Service Provider scheme.',
    estimatedTimeDays: 60,
    estimatedCostGhs: 3000,
    pitfalls:
      'Installing solar PV without an EC certificate voids most insurance policies and disqualifies you from net-metering with ECG/NEDCo.',
    officialUrl: 'https://www.energycom.gov.gh',
    position: 3,
    category: 'sector-specific'
  },
  {
    slug: 'sector-fda-registration',
    authority: 'FDA',
    title: 'FDA registration (food, drugs, cosmetics)',
    description:
      'The Food and Drugs Authority licenses manufacturers, importers, distributors, and retailers of food, drugs, cosmetics, herbal medicines, and medical devices. Each product also needs separate registration with a sample, label, and lab analysis.',
    estimatedTimeDays: 90,
    estimatedCostGhs: 4500,
    pitfalls:
      'Importers need an FDA Import Permit per consignment, not a one-off licence. Bulk shipments stuck at Tema port without an Import Permit incur demurrage at ~USD 150/day.',
    officialUrl: 'https://fdaghana.gov.gh',
    position: 4,
    category: 'sector-specific'
  },
  {
    slug: 'sector-nca-licence',
    authority: 'NCA',
    title: 'NCA licence (telecom, ISP, broadcasting)',
    description:
      'The National Communications Authority licenses anyone offering electronic communications: ISPs, mobile network operators, VoIP providers, broadcasting stations, and even some VSAT installers. Authorisation classes differ widely in fees and obligations.',
    estimatedTimeDays: 120,
    estimatedCostGhs: 50000,
    pitfalls:
      'NCA spectrum fees recur annually and scale with bandwidth. Budget for renewal — first-year fees are not the steady-state cost.',
    officialUrl: 'https://nca.org.gh',
    position: 5,
    category: 'sector-specific'
  },
  {
    slug: 'sector-bog-fintech',
    authority: 'Bank of Ghana',
    title: 'BoG licence (fintech, payments, savings & loans)',
    description:
      'Bank of Ghana licences cover Dedicated Electronic Money Issuers (DEMI), Payment Service Providers (Enhanced/Medium/Standard), savings & loans companies, microfinance, and banking. Capital requirements range from GHS 1M (PSP Standard) to GHS 400M (universal bank).',
    estimatedTimeDays: 365,
    pitfalls:
      'BoG\'s Sandbox lets you test innovative products with relaxed requirements first — apply there before chasing a full PSP licence if you\'re pre-revenue.',
    officialUrl: 'https://www.bog.gov.gh/fintech-and-innovation',
    position: 6,
    category: 'sector-specific'
  },
  {
    slug: 'sector-tourism-authority',
    authority: 'Ghana Tourism Authority',
    title: 'Ghana Tourism Authority licence',
    description:
      'Hotels, guest houses, tour operators, travel agencies, restaurants, and car-rental businesses must register annually with the Ghana Tourism Authority. The licence is graded (1–5 stars for accommodation, A–C for tour operators) following inspection.',
    estimatedTimeDays: 45,
    estimatedCostGhs: 1500,
    pitfalls:
      'GTA also collects a 1% tourism levy on accommodation and food bills — set this up in your POS from day one or you\'ll owe arrears.',
    officialUrl: 'https://www.ghana.travel',
    position: 7,
    category: 'sector-specific'
  },
  {
    slug: 'sector-forestry-permit',
    authority: 'Forestry Commission',
    title: 'Forestry Commission permit',
    description:
      'Logging, sawmilling, charcoal production, wildlife trade, and exports of timber/non-timber forest products require Forestry Commission permits. Timber exporters additionally need the FLEGT licence under the Ghana–EU Voluntary Partnership Agreement.',
    estimatedTimeDays: 60,
    pitfalls:
      'CITES-listed species (rosewood, certain hardwoods) need a separate permit and are routinely banned for export — check current notices before contracting buyers.',
    officialUrl: 'https://fcghana.org',
    position: 8,
    category: 'sector-specific'
  }
];

export async function seedBizRegSteps(): Promise<{ upserted: number; total: number }> {
  let upserted = 0;
  for (const s of STEPS) {
    // findFirst-then-update-or-create keeps this idempotent without a unique
    // constraint on anything other than `slug` (which IS unique on the model).
    const existing = await prisma.bizRegStep.findFirst({
      where: { slug: s.slug },
      select: { id: true }
    });

    // Prisma's Json columns want `Prisma.JsonNull` (not plain `null`) to
    // clear the value — plain null fails the generated CreateInput type.
    const data = {
      slug: s.slug,
      authority: s.authority,
      title: s.title,
      description: s.description,
      estimatedTimeDays: s.estimatedTimeDays ?? null,
      estimatedCostGhs: s.estimatedCostGhs ?? null,
      pitfalls: s.pitfalls ?? null,
      officialUrl: s.officialUrl ?? null,
      formDownloads: s.formDownloads
        ? (s.formDownloads as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      position: s.position,
      category: s.category
    };

    if (existing) {
      await prisma.bizRegStep.update({ where: { id: existing.id }, data });
    } else {
      await prisma.bizRegStep.create({ data });
    }
    upserted += 1;
  }
  return { upserted, total: STEPS.length };
}

// CLI entry point — `bun run server/src/lib/seedBizRegSteps.ts`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  (async () => {
    console.log('Seeding Ghana Business Registration steps…');
    const { upserted, total } = await seedBizRegSteps();
    console.log(`  upserted ${upserted} of ${total} steps`);
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
