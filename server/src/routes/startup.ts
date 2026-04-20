// Startup Resources Hub endpoints — backs /career-tools/ventures/startup.
//
// Surface:
//   GET  /decks                public — pitch deck templates, ordered by
//                                       downloadCount desc (popular first)
//   POST /decks/:id/download   public (optionalAuth) — atomic +1 to the
//                                       deck's downloadCount, returns { url }
//                                       so the client can redirect/download
//   GET  /incubators           public — directory; ?programType=&focus= filters
//   GET  /grants               public — sorted by nextDeadline ASC nulls last;
//                                       ?expiringWithin=N for the home widget
//   POST /seed                 admin  — one-shot reseed of curated content

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { seedStartupContent } from '../lib/seedStartupContent.js';

const router = Router();

// ---- /decks --------------------------------------------------------------

router.get('/decks', async (_req, res, next) => {
  try {
    const decks = await prisma.startupDeckTemplate.findMany({
      orderBy: [{ downloadCount: 'desc' }, { name: 'asc' }]
    });
    res.json({ success: true, data: decks });
  } catch (e) { next(e); }
});

// optionalAuth so we can later reason about unique downloaders, but auth
// isn't required to count an open. Returns the file URL the client should
// load — useful when the file lives behind a signed Vercel Blob URL.
router.post('/decks/:id/download', optionalAuth, async (req, res, next) => {
  try {
    const deck = await prisma.startupDeckTemplate.findUnique({
      where: { id: req.params.id },
      select: { id: true, fileUrl: true }
    });
    if (!deck) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deck not found' }
      });
    }
    // Atomic increment so concurrent download bumps don't lose updates.
    const updated = await prisma.startupDeckTemplate.update({
      where: { id: deck.id },
      data: { downloadCount: { increment: 1 } },
      select: { downloadCount: true, fileUrl: true }
    });
    res.json({
      success: true,
      data: { url: updated.fileUrl, downloadCount: updated.downloadCount }
    });
  } catch (e) { next(e); }
});

// ---- /incubators ---------------------------------------------------------

router.get('/incubators', async (req, res, next) => {
  try {
    const { programType, focus } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { isActive: true };
    if (programType) {
      // Match case-insensitively so "Accelerator" / "accelerator" both work
      // from the chip filter.
      where.programType = { equals: programType, mode: 'insensitive' };
    }
    if (focus) {
      // String-array `has` is exact-match on the lowercase tag.
      where.focus = { has: focus.toLowerCase() };
    }
    const items = await prisma.incubator.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// ---- /grants -------------------------------------------------------------

router.get('/grants', async (req, res, next) => {
  try {
    const { expiringWithin } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { isActive: true };
    if (expiringWithin) {
      const days = Number(expiringWithin);
      if (Number.isFinite(days) && days > 0) {
        const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        where.nextDeadline = { gte: new Date(), lte: cutoff };
      }
    }
    // Postgres puts NULLs last on ASC by default — exactly what we want
    // ("rolling" grants sink to the bottom of the deadline list).
    const items = await prisma.grant.findMany({
      where,
      orderBy: [{ nextDeadline: 'asc' }, { name: 'asc' }]
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// ---- /seed (admin one-shot) ---------------------------------------------

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const result = await seedStartupContent();
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

export default router;
