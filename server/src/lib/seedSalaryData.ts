// Hand-curated seed for the Salary Negotiation tool.
//
// Two functions:
//   - seedSalaryBenchmarks() — upserts ~60 SalaryBenchmark rows covering a
//     mix of UENR-relevant roles × seniorities × Ghana/diaspora cities.
//   - seedCityCostOfLiving() — upserts ~10 CityCostOfLiving rows.
//
// Numbers are realistic 2024-2026 monthly bands sourced from a blend of
// Glassdoor / Levels.fyi / local recruiter feedback. They're approximate
// — the tool exists to give alumni a starting anchor, not a contract.
//
// Idempotency:
//   SalaryBenchmark has no natural unique tuple in the schema, so we look
//   up by (role, seniority, city) and update-or-create.
//   CityCostOfLiving has @unique on city — straight upsert.

import { prisma } from './prisma.js';

type BenchmarkSeed = {
  role: string;
  seniority: 'junior' | 'mid' | 'senior' | 'lead';
  city: string;
  country: string;
  currency: string;
  minMonthly: number;
  maxMonthly: number;
  source?: string;
  notes?: string;
};

// City -> country mapping reused below to keep rows consistent.
const CITY_COUNTRY: Record<string, { country: string; currency: string }> = {
  Accra: { country: 'Ghana', currency: 'GHS' },
  Kumasi: { country: 'Ghana', currency: 'GHS' },
  Sunyani: { country: 'Ghana', currency: 'GHS' },
  Takoradi: { country: 'Ghana', currency: 'GHS' },
  Tamale: { country: 'Ghana', currency: 'GHS' },
  London: { country: 'UK', currency: 'GBP' },
  Toronto: { country: 'Canada', currency: 'CAD' },
  Dubai: { country: 'UAE', currency: 'AED' },
  'New York': { country: 'US', currency: 'USD' },
  Johannesburg: { country: 'South Africa', currency: 'ZAR' },
  Nairobi: { country: 'Kenya', currency: 'USD' }
};

// Helper to make a benchmark row succinctly.
const b = (
  role: string,
  seniority: BenchmarkSeed['seniority'],
  city: string,
  minMonthly: number,
  maxMonthly: number,
  source?: string,
  notes?: string
): BenchmarkSeed => {
  const cc = CITY_COUNTRY[city];
  if (!cc) throw new Error(`Unknown city in salary seed: ${city}`);
  return {
    role,
    seniority,
    city,
    country: cc.country,
    currency: cc.currency,
    minMonthly,
    maxMonthly,
    source,
    notes
  };
};

// ~60 benchmarks. We don't try to cover every role × seniority × city
// combination — pick 3-4 cities per role × seniority pair to keep the
// dataset honest while still letting the UI render something useful for
// most queries.
const ALL_BENCHMARKS: BenchmarkSeed[] = [
  // ===== Software Engineer =====
  b('Software Engineer', 'junior', 'Accra', 5000, 9000, 'Recruiter survey 2025'),
  b('Software Engineer', 'junior', 'Kumasi', 4000, 7500, 'Recruiter survey 2025'),
  b('Software Engineer', 'junior', 'London', 3200, 4200, 'Glassdoor 2025'),
  b('Software Engineer', 'junior', 'Toronto', 5500, 7500, 'Levels.fyi 2025'),
  b('Software Engineer', 'mid', 'Accra', 10000, 18000, 'Recruiter survey 2025'),
  b('Software Engineer', 'mid', 'London', 4500, 6200, 'Glassdoor 2025'),
  b('Software Engineer', 'mid', 'New York', 9000, 13000, 'Levels.fyi 2025'),
  b('Software Engineer', 'senior', 'Accra', 18000, 32000, 'Recruiter survey 2025'),
  b('Software Engineer', 'senior', 'London', 6500, 9500, 'Glassdoor 2025'),
  b('Software Engineer', 'senior', 'Toronto', 9500, 13500, 'Levels.fyi 2025'),
  b('Software Engineer', 'senior', 'New York', 14000, 22000, 'Levels.fyi 2025'),
  b('Software Engineer', 'lead', 'Accra', 30000, 50000, 'Recruiter survey 2025'),
  b('Software Engineer', 'lead', 'London', 9000, 13000, 'Glassdoor 2025'),
  b('Software Engineer', 'lead', 'New York', 20000, 32000, 'Levels.fyi 2025'),

  // ===== Data Analyst =====
  b('Data Analyst', 'junior', 'Accra', 4500, 8000),
  b('Data Analyst', 'junior', 'Johannesburg', 18000, 30000),
  b('Data Analyst', 'mid', 'Accra', 9000, 15000),
  b('Data Analyst', 'mid', 'London', 3800, 5200),
  b('Data Analyst', 'mid', 'Dubai', 18000, 28000),
  b('Data Analyst', 'senior', 'Accra', 16000, 26000),
  b('Data Analyst', 'senior', 'London', 5200, 7500),

  // ===== Data Scientist =====
  b('Data Scientist', 'mid', 'Accra', 12000, 22000),
  b('Data Scientist', 'mid', 'London', 5000, 7000),
  b('Data Scientist', 'mid', 'Toronto', 7500, 10500),
  b('Data Scientist', 'senior', 'Accra', 22000, 38000),
  b('Data Scientist', 'senior', 'London', 7500, 11000),
  b('Data Scientist', 'senior', 'New York', 13000, 20000),

  // ===== ML Engineer =====
  b('ML Engineer', 'mid', 'Accra', 14000, 25000),
  b('ML Engineer', 'senior', 'London', 8500, 12500),
  b('ML Engineer', 'senior', 'New York', 16000, 26000),

  // ===== Environmental Engineer =====
  b('Environmental Engineer', 'junior', 'Accra', 4500, 7500, 'EPA Ghana salary band'),
  b('Environmental Engineer', 'junior', 'Kumasi', 4000, 6500),
  b('Environmental Engineer', 'mid', 'Accra', 9000, 15000),
  b('Environmental Engineer', 'mid', 'Takoradi', 9500, 16000, undefined, 'Oil & gas-adjacent premium'),
  b('Environmental Engineer', 'senior', 'Accra', 16000, 26000),
  b('Environmental Engineer', 'senior', 'London', 4500, 6500),
  b('Environmental Engineer', 'senior', 'Toronto', 7000, 9500),

  // ===== Renewable Energy Engineer =====
  b('Renewable Energy Engineer', 'junior', 'Accra', 5500, 9500),
  b('Renewable Energy Engineer', 'junior', 'Sunyani', 4500, 8000),
  b('Renewable Energy Engineer', 'mid', 'Accra', 11000, 19000),
  b('Renewable Energy Engineer', 'mid', 'London', 4200, 6000),
  b('Renewable Energy Engineer', 'senior', 'Accra', 20000, 34000),
  b('Renewable Energy Engineer', 'senior', 'Dubai', 22000, 35000),

  // ===== Mining Engineer =====
  b('Mining Engineer', 'junior', 'Takoradi', 7000, 12000, undefined, 'Western Region mines premium'),
  b('Mining Engineer', 'junior', 'Sunyani', 6500, 11000),
  b('Mining Engineer', 'mid', 'Takoradi', 14000, 24000),
  b('Mining Engineer', 'mid', 'Accra', 13000, 22000),
  b('Mining Engineer', 'senior', 'Takoradi', 28000, 48000),
  b('Mining Engineer', 'senior', 'Johannesburg', 55000, 90000),
  b('Mining Engineer', 'lead', 'Takoradi', 50000, 85000),

  // ===== Petroleum Engineer =====
  b('Petroleum Engineer', 'junior', 'Takoradi', 8000, 14000, undefined, 'Offshore basin premium'),
  b('Petroleum Engineer', 'mid', 'Takoradi', 18000, 32000),
  b('Petroleum Engineer', 'senior', 'Takoradi', 35000, 60000),
  b('Petroleum Engineer', 'senior', 'Dubai', 35000, 55000),
  b('Petroleum Engineer', 'lead', 'Dubai', 55000, 90000),

  // ===== ESG Consultant =====
  b('ESG Consultant', 'junior', 'Accra', 6000, 10000),
  b('ESG Consultant', 'mid', 'Accra', 12000, 20000),
  b('ESG Consultant', 'mid', 'London', 4500, 6500),
  b('ESG Consultant', 'senior', 'Accra', 22000, 38000),
  b('ESG Consultant', 'senior', 'London', 7500, 11000),

  // ===== Financial Analyst =====
  b('Financial Analyst', 'junior', 'Accra', 5000, 9000),
  b('Financial Analyst', 'mid', 'Accra', 10000, 17000),
  b('Financial Analyst', 'mid', 'London', 4200, 5800),
  b('Financial Analyst', 'senior', 'Accra', 18000, 30000),
  b('Financial Analyst', 'senior', 'New York', 11000, 17000),

  // ===== Project Manager =====
  b('Project Manager', 'junior', 'Accra', 6000, 10000),
  b('Project Manager', 'mid', 'Accra', 12000, 20000),
  b('Project Manager', 'mid', 'Tamale', 9000, 15000),
  b('Project Manager', 'senior', 'Accra', 22000, 38000),
  b('Project Manager', 'senior', 'London', 6500, 9500),
  b('Project Manager', 'lead', 'Accra', 38000, 65000),

  // ===== Product Manager =====
  b('Product Manager', 'mid', 'Accra', 14000, 24000),
  b('Product Manager', 'mid', 'London', 5500, 7500),
  b('Product Manager', 'senior', 'Accra', 25000, 42000),
  b('Product Manager', 'senior', 'New York', 16000, 25000),
  b('Product Manager', 'senior', 'Toronto', 11000, 15500),

  // ===== Procurement Officer =====
  b('Procurement Officer', 'junior', 'Accra', 4500, 7500),
  b('Procurement Officer', 'mid', 'Accra', 9000, 15000),
  b('Procurement Officer', 'senior', 'Accra', 16000, 26000),

  // ===== Sustainability Analyst =====
  b('Sustainability Analyst', 'junior', 'Accra', 5500, 9000),
  b('Sustainability Analyst', 'mid', 'Accra', 11000, 18000),
  b('Sustainability Analyst', 'mid', 'London', 4000, 5800),
  b('Sustainability Analyst', 'senior', 'Accra', 19000, 32000),

  // ===== GIS Analyst =====
  b('GIS Analyst', 'junior', 'Accra', 5000, 8500),
  b('GIS Analyst', 'junior', 'Kumasi', 4500, 7500),
  b('GIS Analyst', 'mid', 'Accra', 9500, 16000),
  b('GIS Analyst', 'senior', 'Accra', 17000, 28000),
  b('GIS Analyst', 'senior', 'Nairobi', 3500, 6000, undefined, 'Reported in USD-equiv')
];

export async function seedSalaryBenchmarks(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;
  for (const row of ALL_BENCHMARKS) {
    // Look up by the natural composite tuple. There's no DB-level unique
    // index on it (the schema doesn't impose one) so we manage uniqueness
    // here.
    const existing = await prisma.salaryBenchmark.findFirst({
      where: { role: row.role, seniority: row.seniority, city: row.city },
      select: { id: true }
    });
    if (existing) {
      await prisma.salaryBenchmark.update({
        where: { id: existing.id },
        data: {
          country: row.country,
          currency: row.currency,
          minMonthly: row.minMonthly,
          maxMonthly: row.maxMonthly,
          source: row.source ?? null,
          notes: row.notes ?? null
        }
      });
      updated += 1;
    } else {
      await prisma.salaryBenchmark.create({ data: row });
      created += 1;
    }
  }
  return { created, updated, total: ALL_BENCHMARKS.length };
}

// ---- Cost of living ------------------------------------------------------

type CoLSeed = {
  city: string;
  country: string;
  currency: string;
  rentMonthly: number;
  groceriesMonthly: number;
  transportMonthly: number;
  utilitiesMonthly: number;
  notes?: string;
};

const COL: CoLSeed[] = [
  { city: 'Accra',        country: 'Ghana',        currency: 'GHS', rentMonthly: 3500,  groceriesMonthly: 1800, transportMonthly: 800,  utilitiesMonthly: 600,  notes: '1BR center; Osu/East Legon midrange' },
  { city: 'Kumasi',       country: 'Ghana',        currency: 'GHS', rentMonthly: 2500,  groceriesMonthly: 1500, transportMonthly: 600,  utilitiesMonthly: 500 },
  { city: 'Sunyani',      country: 'Ghana',        currency: 'GHS', rentMonthly: 1800,  groceriesMonthly: 1300, transportMonthly: 500,  utilitiesMonthly: 450 },
  { city: 'Takoradi',     country: 'Ghana',        currency: 'GHS', rentMonthly: 2800,  groceriesMonthly: 1600, transportMonthly: 700,  utilitiesMonthly: 550, notes: 'Oil & gas premium on rent' },
  { city: 'Tamale',       country: 'Ghana',        currency: 'GHS', rentMonthly: 1500,  groceriesMonthly: 1200, transportMonthly: 450,  utilitiesMonthly: 400 },
  { city: 'London',       country: 'UK',           currency: 'GBP', rentMonthly: 2200,  groceriesMonthly: 350,  transportMonthly: 200,  utilitiesMonthly: 250 },
  { city: 'Toronto',      country: 'Canada',       currency: 'CAD', rentMonthly: 2400,  groceriesMonthly: 450,  transportMonthly: 160,  utilitiesMonthly: 220 },
  { city: 'Dubai',        country: 'UAE',          currency: 'AED', rentMonthly: 6500,  groceriesMonthly: 1800, transportMonthly: 400,  utilitiesMonthly: 800 },
  { city: 'New York',     country: 'US',           currency: 'USD', rentMonthly: 3400,  groceriesMonthly: 600,  transportMonthly: 130,  utilitiesMonthly: 200 },
  { city: 'Johannesburg', country: 'South Africa', currency: 'ZAR', rentMonthly: 12000, groceriesMonthly: 4500, transportMonthly: 2500, utilitiesMonthly: 1800 },
  { city: 'Nairobi',      country: 'Kenya',        currency: 'USD', rentMonthly: 700,   groceriesMonthly: 250,  transportMonthly: 80,   utilitiesMonthly: 100, notes: 'USD-equivalent for cross-city math' }
];

export async function seedCityCostOfLiving(): Promise<{ upserted: number; total: number }> {
  let upserted = 0;
  for (const c of COL) {
    const total = c.rentMonthly + c.groceriesMonthly + c.transportMonthly + c.utilitiesMonthly;
    const existing = await prisma.cityCostOfLiving.findFirst({
      where: { city: c.city },
      select: { id: true }
    });
    if (existing) {
      await prisma.cityCostOfLiving.update({
        where: { id: existing.id },
        data: {
          country: c.country,
          currency: c.currency,
          rentMonthly: c.rentMonthly,
          groceriesMonthly: c.groceriesMonthly,
          transportMonthly: c.transportMonthly,
          utilitiesMonthly: c.utilitiesMonthly,
          totalMonthly: total,
          notes: c.notes ?? null
        }
      });
    } else {
      await prisma.cityCostOfLiving.create({
        data: {
          city: c.city,
          country: c.country,
          currency: c.currency,
          rentMonthly: c.rentMonthly,
          groceriesMonthly: c.groceriesMonthly,
          transportMonthly: c.transportMonthly,
          utilitiesMonthly: c.utilitiesMonthly,
          totalMonthly: total,
          notes: c.notes ?? null
        }
      });
    }
    upserted += 1;
  }
  return { upserted, total: COL.length };
}

// Static FX map — relative to 1 GHS. Hand-curated for v1; we deliberately
// avoid a live FX feed so the tool stays deterministic and free.
// Multiply a GHS amount by EXCHANGE_RATES[code] to get the equivalent in
// `code`. Reverse the math (divide) to convert into GHS.
export const EXCHANGE_RATES: Record<string, number> = {
  GHS: 1.0,
  USD: 0.083,   // 1 GHS ~= 0.083 USD (1 USD ~= 12 GHS)
  GBP: 0.065,   // 1 USD ~= 15.5 GHS, so 1 GHS ~= 0.0645 GBP
  EUR: 0.077,   // 1 EUR ~= 13 GHS
  CAD: 0.115,   // 1 CAD ~= 8.7 GHS
  AED: 0.303,   // 1 AED ~= 3.3 GHS
  ZAR: 1.54,    // 1 ZAR ~= 0.65 GHS
  NGN: 76.9,    // 1 GHS ~= 76.9 NGN
  KES: 10.8     // 1 GHS ~= 10.8 KES (rough)
};
