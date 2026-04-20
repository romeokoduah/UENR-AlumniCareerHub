// Certifications Tracker — per-user CRUD for professional certifications
// (issuer, issue/expiry dates, credential URL, optional vault-stored PDF)
// plus public verification links employers can hit without auth.
//
// Pattern mirrors coverLetters.ts: zod for body validation, ownership check
// before mutate/delete returns 404, response shape `{ success, data }`.
//
// Caller wires this in app.ts as `app.use('/api/certifications', certificationsRoutes)`.

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ---- Schemas --------------------------------------------------------------

// Accept full ISO datetimes and bare YYYY-MM-DD strings (the date input on
// the client emits the latter). Both coerce to a Date.
const dateString = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid date' });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().min(1).max(200),
  issueDate: dateString,
  expiryDate: dateString.nullable().optional(),
  credentialUrl: z.string().url().max(500).nullable().optional(),
  vaultDocId: z.string().min(1).max(60).nullable().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  issuer: z.string().min(1).max(200).optional(),
  issueDate: dateString.optional(),
  expiryDate: dateString.nullable().optional(),
  credentialUrl: z.string().url().max(500).nullable().optional(),
  vaultDocId: z.string().min(1).max(60).nullable().optional()
});

// ---- Helpers --------------------------------------------------------------

function publicUrlFor(req: any, slug: string): string {
  // Prefer the explicit client origin (set in env) so the link points at the
  // SPA, not the API. Fall back to the request's own origin in dev.
  const origin = process.env.CLIENT_ORIGIN && process.env.CLIENT_ORIGIN !== '*'
    ? process.env.CLIENT_ORIGIN.replace(/\/$/, '')
    : `${req.protocol}://${req.get('host')}`;
  return `${origin}/verify/cert/${slug}`;
}

async function generateUniqueSlug(): Promise<string> {
  // 12 hex chars = 6 random bytes. Collisions are astronomically unlikely
  // but we retry just in case.
  for (let i = 0; i < 5; i++) {
    const slug = crypto.randomBytes(6).toString('hex');
    const exists = await prisma.certification.findUnique({
      where: { publicSlug: slug },
      select: { id: true }
    });
    if (!exists) return slug;
  }
  throw new Error('Could not allocate a unique verification slug');
}

// ---- Authenticated routes -------------------------------------------------

// GET / — all certs for the current user. Sort by expiryDate (nulls last so
// "no expiry" certs settle at the bottom), then by issueDate desc as a
// stable secondary key.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.certification.findMany({
      where: { userId: req.auth!.sub },
      orderBy: [
        { expiryDate: { sort: 'asc', nulls: 'last' } },
        { issueDate: 'desc' }
      ]
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

// GET /expiring — certs expiring within the next 90 days (and not already
// expired). Powers the "Expiring soon" widget on the tracker page.
router.get('/expiring', requireAuth, async (req, res, next) => {
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const items = await prisma.certification.findMany({
      where: {
        userId: req.auth!.sub,
        expiryDate: { gt: now, lte: horizon }
      },
      orderBy: { expiryDate: 'asc' }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);
    const item = await prisma.certification.create({
      data: {
        userId: req.auth!.sub,
        name: parsed.name,
        issuer: parsed.issuer,
        issueDate: new Date(parsed.issueDate),
        expiryDate: parsed.expiryDate ? new Date(parsed.expiryDate) : null,
        credentialUrl: parsed.credentialUrl ?? null,
        vaultDocId: parsed.vaultDocId ?? null
      }
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);
    const existing = await prisma.certification.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub },
      select: { id: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Certification not found' }
      });
    }
    const item = await prisma.certification.update({
      where: { id: existing.id },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.issuer !== undefined ? { issuer: parsed.issuer } : {}),
        ...(parsed.issueDate !== undefined ? { issueDate: new Date(parsed.issueDate) } : {}),
        ...(parsed.expiryDate !== undefined
          ? { expiryDate: parsed.expiryDate ? new Date(parsed.expiryDate) : null }
          : {}),
        ...(parsed.credentialUrl !== undefined ? { credentialUrl: parsed.credentialUrl ?? null } : {}),
        ...(parsed.vaultDocId !== undefined ? { vaultDocId: parsed.vaultDocId ?? null } : {})
      }
    });
    res.json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.certification.deleteMany({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Certification not found' }
      });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

// POST /:id/verify-link — idempotent: if a slug already exists return it,
// otherwise allocate a new one. Response includes the absolute URL the user
// can paste into their CV / LinkedIn / email signature.
router.post('/:id/verify-link', requireAuth, async (req, res, next) => {
  try {
    const cert = await prisma.certification.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!cert) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Certification not found' }
      });
    }
    let slug = cert.publicSlug;
    if (!slug) {
      slug = await generateUniqueSlug();
      await prisma.certification.update({
        where: { id: cert.id },
        data: { publicSlug: slug }
      });
    }
    res.json({
      success: true,
      data: { slug, url: publicUrlFor(req, slug) }
    });
  } catch (e) { next(e); }
});

router.delete('/:id/verify-link', requireAuth, async (req, res, next) => {
  try {
    const cert = await prisma.certification.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub },
      select: { id: true }
    });
    if (!cert) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Certification not found' }
      });
    }
    await prisma.certification.update({
      where: { id: cert.id },
      data: { publicSlug: null }
    });
    res.json({ success: true, data: { id: cert.id } });
  } catch (e) { next(e); }
});

// ---- Public verification (no auth) ----------------------------------------
//
// Returns a deliberately limited slice of the cert + owner so anyone with
// the slug can verify authenticity without learning contact info. Email,
// phone, location, etc. are NEVER included.

router.get('/verify/:slug', async (req, res, next) => {
  try {
    const cert = await prisma.certification.findUnique({
      where: { publicSlug: req.params.slug },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            programme: true,
            graduationYear: true
          }
        }
      }
    });
    if (!cert) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No certification matches this verification link' }
      });
    }
    res.json({
      success: true,
      data: {
        name: cert.name,
        issuer: cert.issuer,
        issueDate: cert.issueDate,
        expiryDate: cert.expiryDate,
        credentialUrl: cert.credentialUrl,
        owner: {
          firstName: cert.user.firstName,
          lastName: cert.user.lastName,
          programme: cert.user.programme,
          graduationYear: cert.user.graduationYear
        },
        verifiedAt: new Date().toISOString()
      }
    });
  } catch (e) { next(e); }
});

export default router;
