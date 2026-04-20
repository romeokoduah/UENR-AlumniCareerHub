// Superuser oversight for Career Services: counseling, transcripts, and
// certifications. Gives superusers read-and-override access across every
// staff/alumnus's rows — bypassing the per-owner checks baked into the
// underlying tool routes.
//
// Mounted at /api/admin/services — app.use('/api/admin/services', ...)
//
// All writes go through logAudit() BEFORE the prisma mutation so an
// aborted mutation still leaves a breadcrumb of intent.

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import {
  CounselingBookingStatus,
  TranscriptStatus,
  TranscriptType,
  TranscriptDeliveryMethod
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth, requireSuperuser);

// ---- helpers -------------------------------------------------------------

function notFound(res: any, message = 'Not found') {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
}
function badRequest(res: any, message: string, code = 'BAD_REQUEST') {
  return res.status(400).json({ success: false, error: { code, message } });
}

const STAFF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  email: true,
  role: true,
  currentRole: true
} as const;

const ALUMNUS_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  email: true,
  programme: true,
  graduationYear: true
} as const;

const OWNER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  programme: true,
  graduationYear: true,
  role: true
} as const;

function parseDateParam(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// =====================================================================
// COUNSELING
// =====================================================================

// GET /counseling/slots?staffId=&from=&to=
router.get('/counseling/slots', async (req, res, next) => {
  try {
    const { staffId } = req.query as Record<string, string | undefined>;
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);

    const where: Record<string, unknown> = {};
    if (staffId) where.staffId = staffId;
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = from;
      if (to) range.lte = to;
      where.startsAt = range;
    }

    const slots = await prisma.counselingSlot.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      include: {
        staff: { select: STAFF_SELECT },
        _count: {
          select: {
            bookings: {
              where: { status: { in: ['PENDING', 'CONFIRMED', 'WAITLIST'] } }
            }
          }
        }
      },
      take: 500
    });

    const data = slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      mode: s.mode,
      capacity: s.capacity,
      isActive: s.isActive,
      notes: s.notes,
      createdAt: s.createdAt,
      activeBookingCount: s._count.bookings,
      staff: s.staff
    }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// GET /counseling/bookings?status=&staffId=&alumniId=
router.get('/counseling/bookings', async (req, res, next) => {
  try {
    const { status, staffId, alumniId } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (status && (Object.values(CounselingBookingStatus) as string[]).includes(status)) {
      where.status = status as CounselingBookingStatus;
    }
    if (alumniId) where.alumniId = alumniId;
    if (staffId) where.slot = { staffId };

    const bookings = await prisma.counselingBooking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        slot: { include: { staff: { select: STAFF_SELECT } } },
        alumnus: { select: ALUMNUS_SELECT }
      },
      take: 500
    });
    res.json({ success: true, data: bookings });
  } catch (e) { next(e); }
});

const bookingOverrideSchema = z.object({
  status: z.nativeEnum(CounselingBookingStatus).optional(),
  staffNotes: z.string().max(4000).nullable().optional()
});

// PATCH /counseling/bookings/:id — superuser override.
router.patch('/counseling/bookings/:id', async (req, res, next) => {
  try {
    const parsed = bookingOverrideSchema.parse(req.body);
    const existing = await prisma.counselingBooking.findUnique({
      where: { id: req.params.id }
    });
    if (!existing) return notFound(res, 'Booking not found');

    const data: Record<string, unknown> = {};
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.staffNotes !== undefined) data.staffNotes = parsed.staffNotes;
    if (Object.keys(data).length === 0) return badRequest(res, 'No fields to update');

    await logAudit({
      actorId: req.auth!.sub,
      action: 'counseling.booking.superuser_override',
      targetType: 'CounselingBooking',
      targetId: existing.id,
      metadata: {
        previous: { status: existing.status, staffNotes: existing.staffNotes },
        patch: data
      }
    });

    const updated = await prisma.counselingBooking.update({
      where: { id: existing.id },
      data
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

const reassignSchema = z.object({ newStaffId: z.string().min(1) });

// PATCH /counseling/slots/:id/reassign — move a slot to another ADMIN.
router.patch('/counseling/slots/:id/reassign', async (req, res, next) => {
  try {
    const parsed = reassignSchema.parse(req.body);
    const slot = await prisma.counselingSlot.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { bookings: { where: { status: 'CONFIRMED' } } }
        }
      }
    });
    if (!slot) return notFound(res, 'Slot not found');
    if (slot.staffId === parsed.newStaffId) {
      return badRequest(res, 'Slot is already owned by that staff member', 'NO_CHANGE');
    }
    if (slot._count.bookings > 0) {
      return badRequest(
        res,
        'Cannot reassign a slot with confirmed bookings — resolve bookings first',
        'HAS_CONFIRMED_BOOKINGS'
      );
    }
    const newStaff = await prisma.user.findUnique({
      where: { id: parsed.newStaffId },
      select: { id: true, role: true }
    });
    if (!newStaff || newStaff.role !== 'ADMIN') {
      return badRequest(res, 'New staff member must be an ADMIN', 'INVALID_STAFF');
    }

    await logAudit({
      actorId: req.auth!.sub,
      action: 'counseling.slot.reassigned',
      targetType: 'CounselingSlot',
      targetId: slot.id,
      metadata: { fromStaffId: slot.staffId, toStaffId: parsed.newStaffId }
    });

    const updated = await prisma.counselingSlot.update({
      where: { id: slot.id },
      data: { staffId: parsed.newStaffId }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// =====================================================================
// TRANSCRIPTS
// =====================================================================

// GET /transcripts?status=&userId=&paymentStatus=
router.get('/transcripts', async (req, res, next) => {
  try {
    const { status, userId, paymentStatus } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (status && (Object.values(TranscriptStatus) as string[]).includes(status)) {
      where.status = status as TranscriptStatus;
    }
    if (userId) where.userId = userId;
    if (paymentStatus && ['UNPAID', 'PAID', 'REFUNDED'].includes(paymentStatus)) {
      where.paymentStatus = paymentStatus;
    }
    const items = await prisma.transcriptRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: { user: { select: OWNER_SELECT } },
      take: 500
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

const transcriptOverrideSchema = z.object({
  type: z.nativeEnum(TranscriptType).optional(),
  copies: z.number().int().min(1).max(20).optional(),
  deliveryMethod: z.nativeEnum(TranscriptDeliveryMethod).optional(),
  recipientName: z.string().trim().min(1).max(200).nullable().optional(),
  recipientAddress: z.string().trim().min(1).max(1000).nullable().optional(),
  recipientEmail: z.string().trim().email().max(200).nullable().optional(),
  feeAmountGhs: z.number().int().min(0).max(100000).optional(),
  paymentRef: z.string().trim().min(1).max(120).nullable().optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
  status: z.nativeEnum(TranscriptStatus).optional(),
  notes: z.string().max(2000).nullable().optional()
});

// PATCH /transcripts/:id — superuser override (any field).
router.patch('/transcripts/:id', async (req, res, next) => {
  try {
    const parsed = transcriptOverrideSchema.parse(req.body);
    const existing = await prisma.transcriptRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Transcript request not found');

    const data: Record<string, unknown> = { ...parsed };
    if (Object.keys(data).length === 0) return badRequest(res, 'No fields to update');

    await logAudit({
      actorId: req.auth!.sub,
      action: 'transcripts.superuser_override',
      targetType: 'TranscriptRequest',
      targetId: existing.id,
      metadata: {
        previous: {
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          feeAmountGhs: existing.feeAmountGhs
        },
        patch: parsed
      }
    });

    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

async function newVerifyToken(): Promise<string> {
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

// POST /transcripts/:id/regenerate-verify-token
router.post('/transcripts/:id/regenerate-verify-token', async (req, res, next) => {
  try {
    const existing = await prisma.transcriptRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Transcript request not found');

    const token = await newVerifyToken();

    await logAudit({
      actorId: req.auth!.sub,
      action: 'transcripts.verify_token_regenerated',
      targetType: 'TranscriptRequest',
      targetId: existing.id,
      metadata: { previousTokenExisted: existing.publicVerifyToken != null }
    });

    const updated = await prisma.transcriptRequest.update({
      where: { id: existing.id },
      data: { publicVerifyToken: token }
    });
    res.json({ success: true, data: { id: updated.id, publicVerifyToken: updated.publicVerifyToken } });
  } catch (e) { next(e); }
});

// =====================================================================
// CERTIFICATIONS
// =====================================================================

// GET /certifications?expiringWithinDays=&hasVerifyLink=
router.get('/certifications', async (req, res, next) => {
  try {
    const { expiringWithinDays, hasVerifyLink } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (expiringWithinDays) {
      const days = Number.parseInt(expiringWithinDays, 10);
      if (Number.isFinite(days) && days > 0) {
        const now = new Date();
        const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        where.expiryDate = { gt: now, lte: horizon };
      }
    }
    if (hasVerifyLink === 'true') where.publicSlug = { not: null };
    if (hasVerifyLink === 'false') where.publicSlug = null;

    const certs = await prisma.certification.findMany({
      where,
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: { user: { select: OWNER_SELECT } },
      take: 500
    });
    res.json({ success: true, data: certs });
  } catch (e) { next(e); }
});

// DELETE /certifications/:id/verify-link — strip the publicSlug.
router.delete('/certifications/:id/verify-link', async (req, res, next) => {
  try {
    const cert = await prisma.certification.findUnique({ where: { id: req.params.id } });
    if (!cert) return notFound(res, 'Certification not found');

    await logAudit({
      actorId: req.auth!.sub,
      action: 'certification.verify_link_revoked',
      targetType: 'Certification',
      targetId: cert.id,
      metadata: { previousSlug: cert.publicSlug, ownerId: cert.userId }
    });

    await prisma.certification.update({
      where: { id: cert.id },
      data: { publicSlug: null }
    });
    res.json({ success: true, data: { id: cert.id } });
  } catch (e) { next(e); }
});

export default router;
