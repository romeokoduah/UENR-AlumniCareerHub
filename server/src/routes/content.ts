import { Router } from 'express';
import { getLanding } from '../services/siteContent.js';

const router = Router();

router.get('/landing', async (_req, res, next) => {
  try {
    const data = await getLanding();
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
