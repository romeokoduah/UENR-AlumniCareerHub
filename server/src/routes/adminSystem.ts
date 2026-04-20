// Phase 8 — System health + GDPR purge.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth, requireSuperuser);

// --- /status ---

router.get('/status', async (_req, res, next) => {
  try {
    const [
      user, opportunity, application, mentorshipMatch, session, event,
      cv, notification, careerActivity, auditLog, errorLog
    ] = await Promise.all([
      prisma.user.count(),
      prisma.opportunity.count(),
      prisma.application.count(),
      prisma.mentorshipMatch.count(),
      prisma.session.count(),
      prisma.event.count(),
      prisma.cV.count(),
      prisma.notification.count(),
      prisma.careerToolsActivity.count(),
      prisma.auditLog.count(),
      prisma.errorLog.count()
    ]);

    res.json({
      success: true,
      data: {
        env: process.env.NODE_ENV ?? 'unknown',
        vercelEnv: process.env.VERCEL_ENV ?? null,
        vercel: {
          commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
          author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null,
          message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null
        },
        blob: { configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) },
        prisma: {
          rowCounts: { user, opportunity, application, mentorshipMatch, session, event, cv, notification, careerActivity, auditLog, errorLog }
        }
      }
    });
  } catch (e) { next(e); }
});

// --- /errors ---

router.get('/errors', async (req, res, next) => {
  try {
    const sinceParam = req.query.since as string | undefined;
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const errors = await prisma.errorLog.findMany({
      where: since ? { createdAt: { gte: since } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const userIds = errors.map((e) => e.userId).filter((u): u is string => !!u);
    const users = userIds.length === 0 ? [] : await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true }
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json({
      success: true,
      data: errors.map((e) => ({ ...e, user: e.userId ? userMap.get(e.userId) ?? null : null }))
    });
  } catch (e) { next(e); }
});

// --- /users/:id/login-history ---

router.get('/users/:id/login-history', async (req, res, next) => {
  try {
    const events = await prisma.loginEvent.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, firstName: true, lastName: true }
    });
    res.json({ success: true, data: { user, events } });
  } catch (e) { next(e); }
});

// --- /users/:id/force-logout-everywhere ---

router.post('/users/:id/force-logout-everywhere', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'system.user.force_logout_everywhere',
      targetType: 'User',
      targetId: user.id
    });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } }
    });
    res.json({ success: true, data: { id: updated.id, tokenVersion: updated.tokenVersion } });
  } catch (e) { next(e); }
});

// --- /users/:id/purge ---

const purgeSchema = z.object({
  confirmation: z.literal('PURGE'),
  reason: z.string().max(500).optional()
});

router.post('/users/:id/purge', async (req, res, next) => {
  try {
    const parsed = purgeSchema.parse(req.body);
    if (req.params.id === req.auth!.sub) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_PURGE_SELF', message: 'You cannot purge your own account.' }
      });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'system.user.purge',
      targetType: 'User',
      targetId: target.id,
      metadata: { reason: parsed.reason ?? null, previousEmail: target.email }
    });
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        email: `purged-${target.id}@purged.local`,
        firstName: 'Purged',
        lastName: 'user',
        avatar: null,
        bio: null,
        phone: null,
        linkedinUrl: null,
        studentId: null,
        deletedAt: new Date(),
        isApproved: false,
        tokenVersion: { increment: 1 }
      }
    });
    res.json({ success: true, data: { id: updated.id } });
  } catch (e) { next(e); }
});

export default router;
