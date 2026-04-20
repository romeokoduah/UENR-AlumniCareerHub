// Career Path Explorer endpoints — back the /career-tools/paths tool.
//
// Surface:
//   GET  /                public — list nodes, optional ?industry= filter
//   GET  /:slug           public — one node + resolved nextNodes
//   POST /seed            admin  — one-shot reseed of curated nodes
//
// Mounted in app.ts as `app.use('/api/paths', pathsRoutes)`.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { seedCareerPaths } from '../lib/seedCareerPaths.js';

const router = Router();

// ----- list ---------------------------------------------------------------
//
// Returns every node (the dataset is small ~45 rows so no pagination yet).
// `?industry=<slug>` narrows to one industry; the client uses this to drive
// the industry chip picker.

router.get('/', async (req, res, next) => {
  try {
    const { industry } = req.query as { industry?: string };
    const nodes = await prisma.careerPathNode.findMany({
      where: industry ? { industry } : {},
      orderBy: [{ industry: 'asc' }, { level: 'asc' }, { role: 'asc' }]
    });
    res.json({ success: true, data: nodes });
  } catch (e) { next(e); }
});

// ----- detail -------------------------------------------------------------
//
// Returns the requested node and a resolved `nextNodes` array — full rows
// for each slug listed in nextNodeSlugs so the drawer can show role +
// salary band + level without a second round-trip.

router.get('/:slug', async (req, res, next) => {
  try {
    const node = await prisma.careerPathNode.findUnique({
      where: { slug: req.params.slug }
    });
    if (!node) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Career path node not found' }
      });
    }
    const nextNodes = node.nextNodeSlugs.length
      ? await prisma.careerPathNode.findMany({
          where: { slug: { in: node.nextNodeSlugs } }
        })
      : [];
    res.json({ success: true, data: { ...node, nextNodes } });
  } catch (e) { next(e); }
});

// ----- one-shot admin seed ------------------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const upserted = await seedCareerPaths();
    const total = await prisma.careerPathNode.count();
    res.json({ success: true, data: { upserted, total } });
  } catch (e) { next(e); }
});

export default router;
