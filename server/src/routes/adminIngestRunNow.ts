// Admin-authenticated pipeline trigger.
// POST /api/admin/ingest/run-now
//
// Auth: requireAuth + requireRole('ADMIN') — UI-driven, not cron-driven.
// Body: { which: 'scholarships' | 'opportunities' | 'all' }
// Returns same shape as /api/ingest/all/run so the UI can reuse the same
// display logic.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { runAll } from './ingestRunAll.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

const bodySchema = z.object({
  which: z.enum(['scholarships', 'opportunities', 'all']).default('all')
});

router.post('/', validate(bodySchema), async (req, res, next) => {
  try {
    const { which } = req.body as z.infer<typeof bodySchema>;
    const data = await runAll(which, 'admin:ui');
    return res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
