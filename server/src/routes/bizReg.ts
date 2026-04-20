// Ghana Business Registration Guide endpoints — back the
// /career-tools/ventures/registration tool.
//
// Surface:
//   GET  /steps              public — list all steps, optional ?category=
//   GET  /steps/:slug        public — single step by slug
//   POST /seed               admin  — upsert curated steps via seedBizRegSteps
//
// Mounted in app.ts as `app.use('/api/biz-reg', bizRegRoutes)`.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { seedBizRegSteps } from '../lib/seedBizRegSteps.js';

const router = Router();

const VALID_CATEGORIES = new Set([
  'sole-prop',
  'partnership',
  'llc',
  'foreign-investment',
  'sector-specific'
]);

// ---- list ---------------------------------------------------------------
//
// Returns ordered steps. With ?category=… we narrow to one category and
// order by position; without it we order by category then position so the
// client can group server-side data into category sections without a
// follow-up call.

router.get('/steps', async (req, res, next) => {
  try {
    const { category } = req.query as { category?: string };
    const where = category && VALID_CATEGORIES.has(category) ? { category } : {};
    const steps = await prisma.bizRegStep.findMany({
      where,
      orderBy: [{ category: 'asc' }, { position: 'asc' }]
    });
    res.json({ success: true, data: steps });
  } catch (e) { next(e); }
});

// ---- detail -------------------------------------------------------------

router.get('/steps/:slug', async (req, res, next) => {
  try {
    const step = await prisma.bizRegStep.findUnique({
      where: { slug: req.params.slug }
    });
    if (!step) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Business registration step not found' }
      });
    }
    res.json({ success: true, data: step });
  } catch (e) { next(e); }
});

// ---- one-shot admin seed ------------------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const result = await seedBizRegSteps();
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

export default router;
