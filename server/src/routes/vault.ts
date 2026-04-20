// Document Vault — per-user file storage with share links.
//
// Layout follows opportunities.ts (auth + uploads + zod). Files are stored
// via storeUpload (Vercel Blob in prod, local disk in dev). Share links are
// random 32-char hex tokens. Optional per-share password is bcrypt-hashed.
//
// Public viewer endpoints (`GET /public/:token`, `POST /public/:token/unlock`)
// are intentionally unauthenticated and log every access (IP + user-agent).
//
// Caller wires this in app.ts as `app.use('/api/vault', vaultRoutes)`.

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadDocument, storeUpload } from '../lib/upload.js';

const router = Router();

const VAULT_CATEGORIES = [
  'TRANSCRIPT',
  'CERTIFICATE',
  'REFERENCE',
  'IDENTIFICATION',
  'CV',
  'COVER_LETTER',
  'OTHER'
] as const;

// ----- Authenticated routes -----

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const docs = await prisma.vaultDocument.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        shares: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            token: true,
            expiresAt: true,
            maxViews: true,
            viewCount: true,
            isRevoked: true,
            createdAt: true,
            passwordHash: true
          }
        }
      }
    });
    // Don't leak the password hash to the client; expose a boolean instead.
    const sanitized = docs.map((d) => ({
      ...d,
      shares: d.shares.map(({ passwordHash, ...rest }) => ({
        ...rest,
        hasPassword: Boolean(passwordHash)
      }))
    }));
    res.json({ success: true, data: sanitized });
  } catch (e) { next(e); }
});

const uploadMetaSchema = z.object({
  category: z.enum(VAULT_CATEGORIES).default('OTHER'),
  notes: z.string().max(500).optional()
});

router.post('/upload', requireAuth, uploadDocument.single('file') as any, async (req: any, res: any, next: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file' } });
    }
    const parsed = uploadMetaSchema.safeParse({
      category: req.body.category,
      notes: req.body.notes || undefined
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'BAD_INPUT', message: parsed.error.message } });
    }
    const stored = await storeUpload(req.file);
    const doc = await prisma.vaultDocument.create({
      data: {
        userId: req.auth!.sub,
        filename: stored.filename,
        originalName: req.file.originalname,
        mimetype: stored.mimetype,
        size: stored.size,
        url: stored.url,
        category: parsed.data.category,
        notes: parsed.data.notes
      }
    });
    res.status(201).json({ success: true, data: { ...doc, shares: [] } });
  } catch (e) { next(e); }
});

const updateSchema = z.object({
  category: z.enum(VAULT_CATEGORIES).optional(),
  notes: z.string().max(500).nullable().optional()
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'BAD_INPUT', message: parsed.error.message } });
    }
    const owned = await prisma.vaultDocument.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    const doc = await prisma.vaultDocument.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.category && { category: parsed.data.category }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes ?? null })
      }
    });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const owned = await prisma.vaultDocument.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    // Cascade removes shares + access logs (defined in schema).
    await prisma.vaultDocument.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

const shareSchema = z.object({
  password: z.string().min(1).max(200).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxViews: z.number().int().positive().max(10000).nullable().optional()
});

router.post('/:id/share', requireAuth, async (req, res, next) => {
  try {
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'BAD_INPUT', message: parsed.error.message } });
    }
    const owned = await prisma.vaultDocument.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!owned) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    const token = crypto.randomBytes(16).toString('hex');
    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 10)
      : null;
    const share = await prisma.vaultShareLink.create({
      data: {
        documentId: owned.id,
        token,
        passwordHash,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        maxViews: parsed.data.maxViews ?? null
      }
    });
    res.status(201).json({
      success: true,
      data: {
        id: share.id,
        token: share.token,
        expiresAt: share.expiresAt,
        maxViews: share.maxViews,
        viewCount: share.viewCount,
        isRevoked: share.isRevoked,
        createdAt: share.createdAt,
        hasPassword: Boolean(passwordHash)
      }
    });
  } catch (e) { next(e); }
});

router.post('/shares/:shareId/revoke', requireAuth, async (req, res, next) => {
  try {
    const share = await prisma.vaultShareLink.findUnique({
      where: { id: req.params.shareId },
      include: { document: { select: { userId: true } } }
    });
    if (!share || share.document.userId !== req.auth!.sub) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    const updated = await prisma.vaultShareLink.update({
      where: { id: share.id },
      data: { isRevoked: true }
    });
    res.json({ success: true, data: { id: updated.id, isRevoked: updated.isRevoked } });
  } catch (e) { next(e); }
});

router.get('/shares/:shareId/access', requireAuth, async (req, res, next) => {
  try {
    const share = await prisma.vaultShareLink.findUnique({
      where: { id: req.params.shareId },
      include: { document: { select: { userId: true } } }
    });
    if (!share || share.document.userId !== req.auth!.sub) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    const log = await prisma.vaultAccessLog.findMany({
      where: { shareId: share.id },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json({ success: true, data: log });
  } catch (e) { next(e); }
});

// ----- Public (unauth) viewer endpoints -----

type ShareCheckResult =
  | { ok: true }
  | { ok: false; code: 'EXPIRED' | 'REVOKED' | 'OVER_CAP'; message: string };

function checkShareUsable(share: {
  isRevoked: boolean;
  expiresAt: Date | null;
  maxViews: number | null;
  viewCount: number;
}): ShareCheckResult {
  if (share.isRevoked) return { ok: false, code: 'REVOKED', message: 'This link has been revoked' };
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return { ok: false, code: 'EXPIRED', message: 'This link has expired' };
  }
  if (share.maxViews != null && share.viewCount >= share.maxViews) {
    return { ok: false, code: 'OVER_CAP', message: 'This link has reached its view limit' };
  }
  return { ok: true };
}

async function logAccess(shareId: string, req: any) {
  try {
    await prisma.vaultAccessLog.create({
      data: {
        shareId,
        ip: (req.ip || req.headers['x-forwarded-for'] || null)?.toString().slice(0, 100) ?? null,
        userAgent: (req.headers['user-agent'] || null)?.toString().slice(0, 500) ?? null
      }
    });
  } catch { /* logging is best-effort */ }
}

function publicDocPayload(doc: {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}) {
  return {
    filename: doc.originalName || doc.filename,
    mimetype: doc.mimetype,
    size: doc.size,
    url: doc.url
  };
}

router.get('/public/:token', async (req, res, next) => {
  try {
    const share = await prisma.vaultShareLink.findUnique({
      where: { token: req.params.token },
      include: { document: true }
    });
    if (!share) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }
    const check = checkShareUsable(share);
    if (!check.ok) {
      return res.status(410).json({ success: false, error: { code: check.code, message: check.message } });
    }
    if (share.passwordHash) {
      return res.json({ success: true, data: { requiresPassword: true } });
    }
    const updated = await prisma.vaultShareLink.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } }
    });
    await logAccess(share.id, req);
    res.json({
      success: true,
      data: {
        requiresPassword: false,
        document: publicDocPayload(share.document),
        viewCount: updated.viewCount,
        maxViews: updated.maxViews
      }
    });
  } catch (e) { next(e); }
});

const unlockSchema = z.object({ password: z.string().min(1).max(200) });

router.post('/public/:token/unlock', async (req, res, next) => {
  try {
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'BAD_INPUT', message: 'Password required' } });
    }
    const share = await prisma.vaultShareLink.findUnique({
      where: { token: req.params.token },
      include: { document: true }
    });
    if (!share) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }
    const check = checkShareUsable(share);
    if (!check.ok) {
      return res.status(410).json({ success: false, error: { code: check.code, message: check.message } });
    }
    if (!share.passwordHash) {
      // No password configured — return doc directly to keep client flow consistent.
      const updated = await prisma.vaultShareLink.update({
        where: { id: share.id },
        data: { viewCount: { increment: 1 } }
      });
      await logAccess(share.id, req);
      return res.json({
        success: true,
        data: {
          document: publicDocPayload(share.document),
          viewCount: updated.viewCount,
          maxViews: updated.maxViews
        }
      });
    }
    const ok = await bcrypt.compare(parsed.data.password, share.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: { code: 'BAD_PASSWORD', message: 'Incorrect password' } });
    }
    const updated = await prisma.vaultShareLink.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } }
    });
    await logAccess(share.id, req);
    res.json({
      success: true,
      data: {
        document: publicDocPayload(share.document),
        viewCount: updated.viewCount,
        maxViews: updated.maxViews
      }
    });
  } catch (e) { next(e); }
});

export default router;
