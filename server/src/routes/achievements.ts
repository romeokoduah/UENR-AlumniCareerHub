// Alumni Achievements Wall — moderated, with congrats threads.
//
// Surface:
//   GET    /                    public          — filterable approved feed
//   GET    /:id                 optionalAuth    — single approved achievement
//                                                  (with latest 10 congrats +
//                                                   hasCongratulated for caller)
//   POST   /                    auth            — submit (queued for moderation
//                                                  unless admin)
//   POST   /cover               auth + image    — upload a cover image, returns url
//   DELETE /:id                 auth (own/ADMIN)— hard delete
//   POST   /:id/congrats        auth            — toggle/upsert congrats
//   DELETE /:id/congrats        auth            — remove own congrats
//
//   Admin:
//   GET    /admin/pending       ADMIN           — pending submissions
//   PATCH  /admin/:id/approve   ADMIN           — approve + notify owner
//   PATCH  /admin/:id/feature   ADMIN           — toggle isFeatured
//
// Caller wires this in app.ts as `app.use('/api/achievements', achievementsRoutes)`.
//
// No AI/LLM calls. Notifications follow the mentors.ts pattern (best-effort
// inserts using the ANNOUNCEMENT type, which is the closest existing kind in
// the NotificationType enum).

import { Router } from 'express';
import { z } from 'zod';
import { AchievementType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { uploadImage, storeUpload } from '../lib/upload.js';

const router = Router();

// ---- shared zod / select shapes -----------------------------------------

const typeEnum = z.nativeEnum(AchievementType);

const createSchema = z.object({
  type: typeEnum,
  title: z.string().min(2).max(160),
  description: z.string().min(2).max(4000),
  date: z.string().datetime().or(z.string().min(8)), // accept date or full ISO
  link: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional()
});

const congratsSchema = z.object({
  message: z.string().max(280).nullable().optional()
});

// User shape rendered alongside an achievement on the wall.
const userPublicSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  programme: true,
  graduationYear: true
} as const;

// ---- public feed ---------------------------------------------------------

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      type, year, programme, q, featured,
      page: pageRaw, limit: limitRaw
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = { isApproved: true };
    if (type && (Object.values(AchievementType) as string[]).includes(type)) {
      where.type = type;
    }
    if (featured === 'true') where.isFeatured = true;
    if (year) {
      const y = Number(year);
      if (Number.isInteger(y) && y > 1900 && y < 2200) {
        where.date = {
          gte: new Date(`${y}-01-01T00:00:00.000Z`),
          lt: new Date(`${y + 1}-01-01T00:00:00.000Z`)
        };
      }
    }
    if (programme) {
      where.user = { programme: { equals: programme, mode: 'insensitive' } };
    }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } }
      ];
    }

    const page = Math.max(1, Number(pageRaw) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 20));

    const [items, total] = await Promise.all([
      prisma.achievement.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: userPublicSelect } }
      }),
      prisma.achievement.count({ where })
    ]);

    // hasCongratulated — only meaningful when the caller is signed in
    let mineSet = new Set<string>();
    if (req.auth?.sub && items.length) {
      const mine = await prisma.achievementCongrats.findMany({
        where: {
          userId: req.auth.sub,
          achievementId: { in: items.map((i) => i.id) }
        },
        select: { achievementId: true }
      });
      mineSet = new Set(mine.map((m) => m.achievementId));
    }

    const data = items.map((it) => ({
      ...it,
      hasCongratulated: mineSet.has(it.id)
    }));

    res.json({ success: true, data, meta: { page, limit, total } });
  } catch (e) { next(e); }
});

// ---- single achievement --------------------------------------------------

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const item = await prisma.achievement.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: userPublicSelect },
        congrats: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: userPublicSelect } }
        }
      }
    });
    if (!item || !item.isApproved) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Achievement not found' }
      });
    }
    let hasCongratulated = false;
    if (req.auth?.sub) {
      const mine = await prisma.achievementCongrats.findUnique({
        where: { achievementId_userId: { achievementId: item.id, userId: req.auth.sub } },
        select: { id: true }
      });
      hasCongratulated = Boolean(mine);
    }
    res.json({ success: true, data: { ...item, hasCongratulated } });
  } catch (e) { next(e); }
});

// ---- create --------------------------------------------------------------

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    const isAdmin = req.auth!.role === 'ADMIN';
    const date = new Date(parsed.date);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_INPUT', message: 'Invalid date' }
      });
    }
    const item = await prisma.achievement.create({
      data: {
        userId: req.auth!.sub,
        type: parsed.type,
        title: parsed.title.trim(),
        description: parsed.description.trim(),
        date,
        link: parsed.link?.trim() || null,
        imageUrl: parsed.imageUrl?.trim() || null,
        isApproved: isAdmin // admins can post live; everyone else queues
      }
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

// ---- cover image upload --------------------------------------------------

router.post(
  '/cover',
  requireAuth,
  uploadImage.single('file') as any,
  async (req: any, res: any, next: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'No image attached' }
        });
      }
      const stored = await storeUpload(req.file);
      res.status(201).json({ success: true, data: { url: stored.url } });
    } catch (e) { next(e); }
  }
);

// ---- delete --------------------------------------------------------------

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.achievement.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Achievement not found' }
      });
    }
    const isAdmin = req.auth!.role === 'ADMIN';
    if (!isAdmin && existing.userId !== req.auth!.sub) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not your achievement' }
      });
    }
    await prisma.achievement.delete({ where: { id: existing.id } });
    res.json({ success: true, data: { id: existing.id } });
  } catch (e) { next(e); }
});

// ---- congrats: upsert + atomic increment --------------------------------

router.post('/:id/congrats', requireAuth, async (req, res, next) => {
  try {
    const parsed = congratsSchema.parse(req.body ?? {});
    const achievement = await prisma.achievement.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, isApproved: true, title: true }
    });
    if (!achievement || !achievement.isApproved) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Achievement not found' }
      });
    }

    // Existing rows update the message only — count stays put. New rows
    // bump congratsCount in the same transaction so the counter never
    // drifts from the row count.
    const existing = await prisma.achievementCongrats.findUnique({
      where: { achievementId_userId: { achievementId: achievement.id, userId: req.auth!.sub } }
    });

    const message = parsed.message?.trim() || null;

    if (existing) {
      const updated = await prisma.achievementCongrats.update({
        where: { id: existing.id },
        data: { message }
      });
      const fresh = await prisma.achievement.findUnique({
        where: { id: achievement.id },
        select: { congratsCount: true }
      });
      return res.json({
        success: true,
        data: {
          congrats: updated,
          congratsCount: fresh?.congratsCount ?? 0,
          hasCongratulated: true
        }
      });
    }

    const [created, updatedAchievement] = await prisma.$transaction([
      prisma.achievementCongrats.create({
        data: {
          achievementId: achievement.id,
          userId: req.auth!.sub,
          message
        }
      }),
      prisma.achievement.update({
        where: { id: achievement.id },
        data: { congratsCount: { increment: 1 } },
        select: { congratsCount: true }
      })
    ]);

    // Notify the achievement owner (not when they congratulate themselves).
    if (achievement.userId !== req.auth!.sub) {
      try {
        await prisma.notification.create({
          data: {
            userId: achievement.userId,
            type: 'ANNOUNCEMENT',
            title: 'Someone congratulated your achievement',
            message: `Your post "${achievement.title}" got a new congrats.`,
            link: `/career-tools/achievements`
          }
        });
      } catch { /* notifications are best-effort */ }
    }

    res.status(201).json({
      success: true,
      data: {
        congrats: created,
        congratsCount: updatedAchievement.congratsCount,
        hasCongratulated: true
      }
    });
  } catch (e) { next(e); }
});

router.delete('/:id/congrats', requireAuth, async (req, res, next) => {
  try {
    const achievement = await prisma.achievement.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!achievement) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Achievement not found' }
      });
    }
    const existing = await prisma.achievementCongrats.findUnique({
      where: { achievementId_userId: { achievementId: achievement.id, userId: req.auth!.sub } }
    });
    if (!existing) {
      // Idempotent — already absent. Return current count.
      const fresh = await prisma.achievement.findUnique({
        where: { id: achievement.id },
        select: { congratsCount: true }
      });
      return res.json({
        success: true,
        data: {
          congratsCount: fresh?.congratsCount ?? 0,
          hasCongratulated: false
        }
      });
    }
    const [, updatedAchievement] = await prisma.$transaction([
      prisma.achievementCongrats.delete({ where: { id: existing.id } }),
      prisma.achievement.update({
        where: { id: achievement.id },
        data: { congratsCount: { decrement: 1 } },
        select: { congratsCount: true }
      })
    ]);
    res.json({
      success: true,
      data: {
        congratsCount: Math.max(0, updatedAchievement.congratsCount),
        hasCongratulated: false
      }
    });
  } catch (e) { next(e); }
});

// ---- admin moderation ----------------------------------------------------

router.get('/admin/pending', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const items = await prisma.achievement.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { ...userPublicSelect, email: true } } }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.patch('/admin/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.achievement.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, title: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Achievement not found' }
      });
    }
    const item = await prisma.achievement.update({
      where: { id: existing.id },
      data: { isApproved: true }
    });
    try {
      await prisma.notification.create({
        data: {
          userId: existing.userId,
          type: 'ANNOUNCEMENT',
          title: 'Your achievement is live',
          message: `"${existing.title}" was approved and is now on the wall.`,
          link: `/career-tools/achievements`
        }
      });
    } catch { /* best-effort */ }
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.patch('/admin/:id/feature', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.achievement.findUnique({
      where: { id: req.params.id },
      select: { id: true, isFeatured: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Achievement not found' }
      });
    }
    const item = await prisma.achievement.update({
      where: { id: existing.id },
      data: { isFeatured: !existing.isFeatured }
    });
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

export default router;
