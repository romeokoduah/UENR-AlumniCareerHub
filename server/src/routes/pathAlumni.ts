// Alumni-in-role lookup for the Career Path Explorer.
//
// Lives in its own file so we don't have to surgically edit users.ts and
// fight Express route ordering (a `/in-role/:slug` appended after the
// existing `/:id` would never match). Mounted in app.ts as:
//   app.use('/api/path-alumni', pathAlumniRoutes)
//
// Exposes:
//   GET /:slug   public — given a CareerPathNode slug, returns up to 6
//                          alumni whose currentRole matches the node's role
//                          (case-insensitive) and whose visibility is not
//                          'private'. Empty array if the node doesn't exist.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/:slug', async (req, res, next) => {
  try {
    const node = await prisma.careerPathNode.findUnique({
      where: { slug: req.params.slug },
      select: { role: true }
    });
    if (!node) {
      return res.json({ success: true, data: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        role: { in: ['ALUMNI', 'STUDENT'] },
        visibility: { in: ['public', 'members'] },
        currentRole: { contains: node.role, mode: 'insensitive' }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        programme: true,
        graduationYear: true,
        currentRole: true,
        currentCompany: true,
        avatar: true
      },
      take: 6,
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

export default router;
