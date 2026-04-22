// Admin ad-hoc URL ingest endpoint.
// Mounted at /api/admin/ingest/adhoc.
// Auth: requireAuth + requireRole('ADMIN') — same gate as other admin ingest routes.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ingestAdhocUrl } from '../lib/ingest/adhoc.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

const bodySchema = z.object({
  url: z.string().url('Must be a valid http/https URL'),
  kind: z.enum(['scholarship', 'job'])
});

router.post('/', validate(bodySchema), async (req, res, next) => {
  try {
    const { url, kind } = req.body as z.infer<typeof bodySchema>;
    const result = await ingestAdhocUrl(url, kind);
    return res.json({ success: true, data: result });
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode === 400) {
      return res.status(400).json({ success: false, error: { code: 'FETCH_ERROR', message: e.message } });
    }
    if (e.statusCode === 403) {
      return res.status(403).json({ success: false, error: { code: 'ROBOTS_BLOCKED', message: e.message } });
    }
    next(err);
  }
});

export default router;
