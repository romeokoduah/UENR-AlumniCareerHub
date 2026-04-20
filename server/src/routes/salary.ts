// Salary Negotiation tool — backs /career-tools/salary on the client.
//
// Surface:
//   GET  /benchmarks            public — filterable rows from SalaryBenchmark
//   GET  /benchmarks/roles      public — distinct role names (for autocomplete)
//   GET  /benchmarks/cities     public — distinct cities + country mapping
//   GET  /cost-of-living        public — all CityCostOfLiving rows
//   GET  /cost-of-living/:city  public — single city's full breakdown
//   GET  /exchange-rates        public — static FX map (relative to GHS)
//   POST /seed                  admin  — runs both salary seeders
//
// All amounts in SalaryBenchmark are MONTHLY in the row's currency. The
// client decides how to convert to a base currency using /exchange-rates.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  seedSalaryBenchmarks,
  seedCityCostOfLiving,
  EXCHANGE_RATES
} from '../lib/seedSalaryData.js';

const router = Router();

// ---- /benchmarks ---------------------------------------------------------

router.get('/benchmarks', async (req, res, next) => {
  try {
    const { role, seniority, country, city, currency } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (role) where.role = { equals: role, mode: 'insensitive' };
    if (seniority) where.seniority = seniority.toLowerCase();
    if (country) where.country = { equals: country, mode: 'insensitive' };
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (currency) where.currency = currency.toUpperCase();

    const items = await prisma.salaryBenchmark.findMany({
      where,
      orderBy: [{ country: 'asc' }, { city: 'asc' }, { seniority: 'asc' }, { role: 'asc' }]
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// Distinct role list for the autocomplete in Tab 1. Defined BEFORE
// /benchmarks/:something so Express never tries to interpret "roles" as a
// dynamic segment.
router.get('/benchmarks/roles', async (_req, res, next) => {
  try {
    const rows = await prisma.salaryBenchmark.findMany({
      select: { role: true },
      distinct: ['role'],
      orderBy: { role: 'asc' }
    });
    res.json({ success: true, data: rows.map((r) => r.role) });
  } catch (e) { next(e); }
});

// Distinct cities + their country/currency pair. Useful for chip filters.
router.get('/benchmarks/cities', async (_req, res, next) => {
  try {
    const rows = await prisma.salaryBenchmark.findMany({
      select: { city: true, country: true, currency: true },
      distinct: ['city'],
      orderBy: { city: 'asc' }
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ---- /cost-of-living -----------------------------------------------------

router.get('/cost-of-living', async (_req, res, next) => {
  try {
    const items = await prisma.cityCostOfLiving.findMany({
      orderBy: [{ country: 'asc' }, { city: 'asc' }]
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.get('/cost-of-living/:city', async (req, res, next) => {
  try {
    const item = await prisma.cityCostOfLiving.findFirst({
      // findFirst (not findUnique) so we can do a case-insensitive lookup
      // without forcing the URL caller to match capitalization.
      where: { city: { equals: req.params.city, mode: 'insensitive' } }
    });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'City not found' }
      });
    }
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

// ---- /exchange-rates -----------------------------------------------------

router.get('/exchange-rates', (_req, res) => {
  // Static map seeded at boot — NOT a live FX feed. See seedSalaryData.ts
  // for the source-of-truth values and the rationale for keeping them
  // hand-curated.
  res.json({ success: true, data: EXCHANGE_RATES });
});

// ---- /seed (admin one-shot) ---------------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const benchmarks = await seedSalaryBenchmarks();
    const costOfLiving = await seedCityCostOfLiving();
    res.json({ success: true, data: { benchmarks, costOfLiving } });
  } catch (e) { next(e); }
});

export default router;
