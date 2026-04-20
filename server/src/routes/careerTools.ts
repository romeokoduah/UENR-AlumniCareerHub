import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const logSchema = z.object({
  tool: z.string().min(1).max(80),
  action: z.string().min(1).max(40),
  metadata: z.record(z.any()).optional()
});

router.post('/activity', requireAuth, async (req, res, next) => {
  try {
    const parsed = logSchema.parse(req.body);
    const row = await prisma.careerToolsActivity.create({
      data: {
        userId: req.auth!.sub,
        tool: parsed.tool,
        action: parsed.action,
        metadata: parsed.metadata ?? undefined
      }
    });
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
});

router.get('/activity/recent', requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.careerToolsActivity.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      take: 40
    });
    const seen = new Set<string>();
    const recent: typeof rows = [];
    for (const r of rows) {
      if (seen.has(r.tool)) continue;
      seen.add(r.tool);
      recent.push(r);
      if (recent.length >= 5) break;
    }
    res.json({ success: true, data: recent });
  } catch (e) { next(e); }
});

export default router;
