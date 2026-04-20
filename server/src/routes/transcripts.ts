// Transcripts & Verification Requests — alumni request official transcripts,
// letters of attendance, or degree verifications. Staff (ADMIN) advance the
// status pipeline and confirm payment manually for v1 (no Paystack yet).
//
// Surface:
//   GET    /                   auth   — current user's requests
//   POST   /                   auth   — create a new request (server recomputes fee)
//   PATCH  /:id/cancel         auth   — owner cancels (only if not yet DISPATCHED)
//   POST   /:id/verify-link    auth   — owner generates a public verify token
//                                       (only when PAID + READY/DISPATCHED/DELIVERED)
//   DELETE /:id/verify-link    auth   — owner revokes the token
//   GET    /verify/:token      public — employer-facing verification (no contact info,
//                                       hides in-flight requests)
//   GET    /admin/all          admin  — list all, optional ?status= filter
//   PATCH  /admin/:id/payment  admin  — { paymentRef, paymentStatus }
//   PATCH  /admin/:id/advance  admin  — moves to next pipeline status
//   PATCH  /admin/:id/notes    admin  — staff notes
//   PATCH  /admin/:id/cancel   admin  — force cancel
//
// Caller wires this in app.ts as `app.use('/api/transcripts', transcriptsRoutes)`.

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { TranscriptType, TranscriptDeliveryMethod, TranscriptStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// ---- Fee table ------------------------------------------------------------
//
// Mirror of the TRANSCRIPT_FEES constant on the client. Recompute server-side
// so the client can't undercut the price. Keep these in sync if either side
// changes.

const BASE_FEE_BY_TYPE: Record<TranscriptType, number> = {
  TRANSCRIPT: 50,
  LETTER_OF_ATTENDANCE: 30,
  DEGREE_VERIFICATION: 100
};

const DELIVERY_SURCHARGE: Record<TranscriptDeliveryMethod, number> = {
  PICKUP: 0,
  POSTAL_LOCAL: 25,
  POSTAL_INTERNATIONAL: 100,
  ELECTRONIC: 0
};

function computeFeeGhs(type: TranscriptType, copies: number, delivery: TranscriptDeliveryMethod): number {
  const safeCopies = Math.max(1, Math.min(20, Math.floor(copies)));
  return BASE_FEE_BY_TYPE[type] * safeCopies + DELIVERY_SURCHARGE[delivery];
}

// ---- Status pipeline ------------------------------------------------------

const STATUS_PIPELINE: TranscriptStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'PROCESSING',
  'READY',
  'DISPATCHED',
  'DELIVERED'
];

function nextStatus(current: TranscriptStatus): TranscriptStatus | null {
  if (current === 'CANCELLED') return null;
  const idx = STATUS_PIPELINE.indexOf(current);
  if (idx < 0 || idx >= STATUS_PIPELINE.length - 1) return null;
  return STATUS_PIPELINE[idx + 1];
}

// ---- Helpers --------------------------------------------------------------

async function generateUniqueToken(): Promise<string> {
  // 16 hex chars = 8 random bytes. Retry on the astronomically-unlikely
  // collision so we never fail silently.
  for (let i = 0; i < 5; i++) {
    const token = crypto.randomBytes(8).toString('hex');
    const exists = await prisma.transcriptRequest.findUnique({
      where: { publicVerifyToken: token },
      select: { id: true }
    });
    if (!exists) return token;
  }
  throw new Error('Could not allocate a unique verification token');
}

async function notify(
  userId: string,
  title: string,
  message: string,
  link = '/career-tools/transcripts'
) {
  // Best-effort. We swallow errors so a notification failure never aborts
  // the parent state change.
  try {
    await prisma.notification.create({
      data: { userId, type: 'APPLICATION_UPDATE', title, message, link }
    });
  } catch {
    /* ignore */
  }
}

const ownerSelect = {
  firstName: true,
  lastName: true,
  email: true,
  programme: true,
  graduationYear: true
} as const;

// ---- Schemas --------------------------------------------------------------

const typeEnum = z.nativeEnum(TranscriptType);
const deliveryEnum = z.nativeEnum(TranscriptDeliveryMethod);
const statusEnum = z.nativeEnum(TranscriptStatus);

const createSchema = z.object({
  type: typeEnum,
  copies: z.number().int().min(1).max(20).default(1),
  deliveryMethod: deliveryEnum,
  recipientName: z.string().trim().min(1).max(200).nullable().optional(),
  recipientAddress: z.string().trim().min(1).max(1000).nullable().optional(),
  recipientEmail: z.string().trim().email().max(200).nullable().optional()
});

const paymentSchema = z.object({
  paymentRef: z.string().trim().min(1).max(120),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED'])
});

const notesSchema = z.object({
  notes: z.string().max(2000).nullable().optional()
});

// ---- Authenticated (alumni) routes ---------------------------------------

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.transcriptRequest.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);

    // Conditional fields. Postal/electronic deliveries require a recipient.
    const needsRecipient =
      parsed.deliveryMethod === 'POSTAL_LOCAL'
      || parsed.deliveryMethod === 'POSTAL_INTERNATIONAL'
      || parsed.deliveryMethod === 'ELECTRONIC';

    if (needsRecipient && !parsed.recipientName) {
      return res.status(400).json({
        success: false,
        error: { code: 'RECIPIENT_REQUIRED', message: 'Recipient name is required for this delivery method.' }
      });
    }
    if (parsed.deliveryMethod === 'ELECTRONIC' && !parsed.recipientEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'RECIPIENT_EMAIL_REQUIRED', message: 'Recipient email is required for electronic delivery.' }
      });
    }
    if (
      (parsed.deliveryMethod === 'POSTAL_LOCAL' || parsed.deliveryMethod === 'POSTAL_INTERNATIONAL')
      && !parsed.recipientAddress
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'RECIPIENT_ADDRESS_REQUIRED', message: 'Recipient address is required for postal delivery.' }
      });
    }

    const fee = computeFeeGhs(parsed.type, parsed.copies, parsed.deliveryMethod);

    const item = await prisma.transcriptRequest.create({
      data: {
        userId: req.auth!.sub,
        type: parsed.type,
        copies: parsed.copies,
        deliveryMethod: parsed.deliveryMethod,
        recipientName: parsed.recipientName ?? null,
        recipientAddress: parsed.recipientAddress ?? null,
        recipientEmail: parsed.recipientEmail ?? null,
        feeAmountGhs: fee,
        paymentStatus: 'UNPAID',
        status: 'SUBMITTED'
      }
    });

    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

router.patch('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.transcriptRequest.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    if (existing.status === 'DISPATCHED' || existing.status === 'DELIVERED') {
      return res.status(400).json({
        success: false,
        error: { code: 'TOO_LATE_TO_CANCEL', message: 'This request has already been dispatched and cannot be cancelled.' }
      });
    }
    if (existing.status === 'CANCELLED') {
      return res.json({ success: true, data: existing });
    }

    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED', publicVerifyToken: null }
    });

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.post('/:id/verify-link', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.transcriptRequest.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    if (existing.paymentStatus !== 'PAID') {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_PAID', message: 'This request must be paid before a verification link can be generated.' }
      });
    }
    if (
      existing.status !== 'READY'
      && existing.status !== 'DISPATCHED'
      && existing.status !== 'DELIVERED'
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_READY', message: 'A verification link is only available once the request reaches Ready.' }
      });
    }

    let token = existing.publicVerifyToken;
    if (!token) {
      token = await generateUniqueToken();
      await prisma.transcriptRequest.update({
        where: { id: existing.id },
        data: { publicVerifyToken: token }
      });
    }
    res.json({ success: true, data: { token } });
  } catch (e) { next(e); }
});

router.delete('/:id/verify-link', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.transcriptRequest.findFirst({
      where: { id: req.params.id, userId: req.auth!.sub },
      select: { id: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { publicVerifyToken: null }
    });
    res.json({ success: true, data: { id: existing.id } });
  } catch (e) { next(e); }
});

// ---- Public verification --------------------------------------------------

router.get('/verify/:token', async (req, res, next) => {
  try {
    const item = await prisma.transcriptRequest.findUnique({
      where: { publicVerifyToken: req.params.token },
      include: { user: { select: ownerSelect } }
    });
    // Hide in-flight, cancelled, or unpaid requests from the public face —
    // we only confirm a real, ready/dispatched/delivered credential.
    const isReady =
      item?.status === 'READY'
      || item?.status === 'DISPATCHED'
      || item?.status === 'DELIVERED';
    if (!item || !isReady || item.paymentStatus !== 'PAID') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'This credential could not be verified.' }
      });
    }
    res.json({
      success: true,
      data: {
        type: item.type,
        status: item.status,
        owner: {
          firstName: item.user.firstName,
          lastName: item.user.lastName,
          programme: item.user.programme,
          graduationYear: item.user.graduationYear
        },
        verifiedAt: new Date().toISOString()
      }
    });
  } catch (e) { next(e); }
});

// ---- Admin / staff routes -------------------------------------------------

router.get('/admin/all', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const where: Record<string, unknown> = {};
    if (status && (Object.values(TranscriptStatus) as string[]).includes(status)) {
      where.status = status;
    }
    const items = await prisma.transcriptRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: ownerSelect } }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.patch('/admin/:id/payment', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = paymentSchema.parse(req.body);
    const existing = await prisma.transcriptRequest.findUnique({
      where: { id: req.params.id }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { paymentRef: parsed.paymentRef, paymentStatus: parsed.paymentStatus }
    });

    if (parsed.paymentStatus === 'PAID' && existing.paymentStatus !== 'PAID') {
      await notify(
        existing.userId,
        'Transcript payment confirmed',
        `We received payment (ref ${parsed.paymentRef}) for your ${existing.type.replace(/_/g, ' ').toLowerCase()} request. Processing will continue shortly.`
      );
    }

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/admin/:id/advance', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.transcriptRequest.findUnique({
      where: { id: req.params.id }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    if (existing.status === 'CANCELLED' || existing.status === 'DELIVERED') {
      return res.status(400).json({
        success: false,
        error: { code: 'TERMINAL_STATUS', message: 'This request is already in a terminal state.' }
      });
    }
    const next = nextStatus(existing.status);
    if (!next) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_ADVANCE', message: 'Status cannot be advanced any further.' }
      });
    }

    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { status: next }
    });

    await notify(
      existing.userId,
      'Transcript status updated',
      `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request is now ${next.replace(/_/g, ' ').toLowerCase()}.`
    );

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/admin/:id/notes', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = notesSchema.parse(req.body);
    const existing = await prisma.transcriptRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { notes: parsed.notes ?? null }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/admin/:id/cancel', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.transcriptRequest.findUnique({
      where: { id: req.params.id }
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transcript request not found' }
      });
    }
    if (existing.status === 'CANCELLED') {
      return res.json({ success: true, data: existing });
    }
    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED', publicVerifyToken: null }
    });

    await notify(
      existing.userId,
      'Transcript request cancelled',
      `Your ${existing.type.replace(/_/g, ' ').toLowerCase()} request was cancelled by the Registry. Contact alumni services for details.`
    );

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
