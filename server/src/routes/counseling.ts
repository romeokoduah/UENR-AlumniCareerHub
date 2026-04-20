// Career counseling — backs /career-tools/counseling.
//
// v1: ADMIN role doubles as Career Services staff. A separate STAFF role
// could be added later via a Role enum migration.
//
// Surface (mounted at /api/counseling):
//   GET    /slots/available         public — upcoming slots with capacity left
//   GET    /slots/mine              admin — own slots + booking aggregates
//   POST   /slots                   admin — publish a slot
//   PATCH  /slots/:id               admin (owner) — partial update
//   DELETE /slots/:id               admin (owner) — only if no bookings
//   GET    /bookings/mine           auth — current alumnus's bookings
//   GET    /bookings/:id/full       auth (involved) — full booking detail
//   POST   /bookings                auth — book a slot (PENDING or WAITLIST)
//   PATCH  /bookings/:id/confirm    admin (slot owner) — PENDING → CONFIRMED
//   PATCH  /bookings/:id/complete   admin (slot owner) — CONFIRMED → COMPLETED
//   PATCH  /bookings/:id/cancel     auth (alumnus|staff) — set CANCELLED;
//                                    auto-promote oldest WAITLIST → PENDING
//   PATCH  /bookings/:id/notes      admin (slot owner) — staff-private notes
//   PATCH  /bookings/:id/satisfaction
//                                    alumnus (owner) — post-session feedback

import { Router } from 'express';
import { z } from 'zod';
import { CounselingMode, CounselingBookingStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const modeEnum = z.nativeEnum(CounselingMode);

const slotCreateSchema = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    mode: modeEnum,
    capacity: z.number().int().min(1).max(10).default(1),
    notes: z.string().max(500).optional()
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt']
  });

const slotUpdateSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  mode: modeEnum.optional(),
  capacity: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional()
});

const bookingCreateSchema = z.object({
  slotId: z.string().min(1),
  topic: z.string().min(3).max(500),
  preferredMode: modeEnum
});

const notesSchema = z.object({
  staffNotes: z.string().max(4000).nullable()
});

const satisfactionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional()
});

const STAFF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  currentRole: true
} as const;

const ALUMNUS_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  programme: true,
  graduationYear: true,
  email: true
} as const;

function notFound(res: any, message = 'Not found') {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
}

function forbid(res: any, message = 'Forbidden') {
  return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message } });
}

function badRequest(res: any, message: string, code = 'BAD_REQUEST') {
  return res.status(400).json({ success: false, error: { code, message } });
}

// ---- /slots --------------------------------------------------------------

router.get('/slots/available', async (_req, res, next) => {
  try {
    const slots = await prisma.counselingSlot.findMany({
      where: { isActive: true, startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: {
        staff: { select: STAFF_SELECT },
        _count: { select: { bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } } } }
      },
      take: 100
    });
    const data = slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      mode: s.mode,
      capacity: s.capacity,
      bookedCount: s._count.bookings,
      spotsLeft: Math.max(0, s.capacity - s._count.bookings),
      notes: s.notes,
      staff: s.staff
    }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/slots/mine', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const slots = await prisma.counselingSlot.findMany({
      where: { staffId: req.auth!.sub },
      orderBy: { startsAt: 'desc' },
      include: {
        _count: { select: { bookings: true } },
        bookings: {
          orderBy: { createdAt: 'asc' },
          include: { alumnus: { select: ALUMNUS_SELECT } }
        }
      }
    });
    res.json({ success: true, data: slots });
  } catch (e) { next(e); }
});

router.post('/slots', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = slotCreateSchema.parse(req.body);
    const slot = await prisma.counselingSlot.create({
      data: {
        staffId: req.auth!.sub,
        startsAt: new Date(parsed.startsAt),
        endsAt: new Date(parsed.endsAt),
        mode: parsed.mode,
        capacity: parsed.capacity,
        notes: parsed.notes ?? null
      }
    });
    res.status(201).json({ success: true, data: slot });
  } catch (e) { next(e); }
});

router.patch('/slots/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = slotUpdateSchema.parse(req.body);
    const slot = await prisma.counselingSlot.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } }
    });
    if (!slot) return notFound(res, 'Slot not found');
    if (slot.staffId !== req.auth!.sub) return forbid(res, 'Only the slot owner can edit');
    if (slot._count.bookings > 0 && (parsed.startsAt || parsed.endsAt || parsed.mode)) {
      return badRequest(res, 'Cannot change time/mode while there are confirmed bookings', 'INVALID_STATE');
    }

    const data: Record<string, any> = {};
    if (parsed.startsAt) data.startsAt = new Date(parsed.startsAt);
    if (parsed.endsAt) data.endsAt = new Date(parsed.endsAt);
    if (parsed.mode) data.mode = parsed.mode;
    if (parsed.capacity !== undefined) data.capacity = parsed.capacity;
    if (parsed.notes !== undefined) data.notes = parsed.notes;
    if (parsed.isActive !== undefined) data.isActive = parsed.isActive;

    const updated = await prisma.counselingSlot.update({ where: { id: slot.id }, data });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.delete('/slots/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const slot = await prisma.counselingSlot.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { bookings: true } } }
    });
    if (!slot) return notFound(res, 'Slot not found');
    if (slot.staffId !== req.auth!.sub) return forbid(res, 'Only the slot owner can delete');
    if (slot._count.bookings > 0) return badRequest(res, 'Cannot delete a slot with bookings', 'INVALID_STATE');
    await prisma.counselingSlot.delete({ where: { id: slot.id } });
    res.json({ success: true, data: { id: slot.id } });
  } catch (e) { next(e); }
});

// ---- /bookings -----------------------------------------------------------

router.get('/bookings/mine', requireAuth, async (req, res, next) => {
  try {
    const bookings = await prisma.counselingBooking.findMany({
      where: { alumniId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        slot: { include: { staff: { select: STAFF_SELECT } } }
      }
    });
    // Hide staffNotes on the alumni-side payload.
    const data = bookings.map((b) => ({ ...b, staffNotes: undefined }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/bookings/:id/full', requireAuth, async (req, res, next) => {
  try {
    const booking = await prisma.counselingBooking.findUnique({
      where: { id: req.params.id },
      include: {
        slot: { include: { staff: { select: STAFF_SELECT } } },
        alumnus: { select: ALUMNUS_SELECT }
      }
    });
    if (!booking) return notFound(res, 'Booking not found');
    const callerId = req.auth!.sub;
    const callerRole = req.auth!.role;
    const isAlumnus = callerId === booking.alumniId;
    const isStaff = callerRole === 'ADMIN' && callerId === booking.slot.staffId;
    if (!isAlumnus && !isStaff) return forbid(res, 'Not your booking');
    const payload = isStaff ? booking : { ...booking, staffNotes: undefined };
    res.json({ success: true, data: payload });
  } catch (e) { next(e); }
});

router.post('/bookings', requireAuth, async (req, res, next) => {
  try {
    const parsed = bookingCreateSchema.parse(req.body);
    const slot = await prisma.counselingSlot.findUnique({
      where: { id: parsed.slotId },
      include: {
        _count: { select: { bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } } } }
      }
    });
    if (!slot) return notFound(res, 'Slot not found');
    if (!slot.isActive) return badRequest(res, 'Slot is no longer available', 'INVALID_STATE');
    if (slot.startsAt <= new Date()) return badRequest(res, 'Slot has already started', 'INVALID_STATE');

    const isFull = slot._count.bookings >= slot.capacity;
    const status: CounselingBookingStatus = isFull ? 'WAITLIST' : 'PENDING';

    const booking = await prisma.counselingBooking.create({
      data: {
        slotId: slot.id,
        alumniId: req.auth!.sub,
        topic: parsed.topic.trim(),
        preferredMode: parsed.preferredMode,
        status
      }
    });

    // Notify the staff member.
    await prisma.notification.create({
      data: {
        userId: slot.staffId,
        type: 'MENTORSHIP_REQUEST',
        title: isFull ? 'Counseling waitlist join' : 'New counseling booking',
        message: `Topic: ${booking.topic.slice(0, 80)}`,
        link: `/career-tools/counseling`
      }
    }).catch(() => {});

    res.status(201).json({ success: true, data: booking });
  } catch (e) { next(e); }
});

async function loadStaffOwnedBooking(bookingId: string, callerId: string, callerRole: string | undefined) {
  const booking = await prisma.counselingBooking.findUnique({
    where: { id: bookingId },
    include: { slot: { select: { staffId: true } } }
  });
  if (!booking) return { error: 'NOT_FOUND' as const };
  if (callerRole !== 'ADMIN' || booking.slot.staffId !== callerId) return { error: 'FORBIDDEN' as const };
  return { booking };
}

router.patch('/bookings/:id/confirm', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const owned = await loadStaffOwnedBooking(req.params.id, req.auth!.sub, req.auth!.role);
    if (owned.error === 'NOT_FOUND') return notFound(res, 'Booking not found');
    if (owned.error === 'FORBIDDEN') return forbid(res, 'Not your slot');
    if (owned.booking.status !== 'PENDING') return badRequest(res, 'Only PENDING bookings can be confirmed', 'INVALID_STATE');
    const updated = await prisma.counselingBooking.update({
      where: { id: owned.booking.id },
      data: { status: 'CONFIRMED' }
    });
    await prisma.notification.create({
      data: {
        userId: owned.booking.alumniId,
        type: 'SESSION_REMINDER',
        title: 'Counseling session confirmed',
        message: 'Your booking with UENR Career Services is confirmed.',
        link: `/career-tools/counseling`
      }
    }).catch(() => {});
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/bookings/:id/complete', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const owned = await loadStaffOwnedBooking(req.params.id, req.auth!.sub, req.auth!.role);
    if (owned.error === 'NOT_FOUND') return notFound(res, 'Booking not found');
    if (owned.error === 'FORBIDDEN') return forbid(res, 'Not your slot');
    if (owned.booking.status !== 'CONFIRMED') return badRequest(res, 'Only CONFIRMED bookings can be marked complete', 'INVALID_STATE');
    const updated = await prisma.counselingBooking.update({
      where: { id: owned.booking.id },
      data: { status: 'COMPLETED' }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/bookings/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const callerId = req.auth!.sub;
    const callerRole = req.auth!.role;
    const booking = await prisma.counselingBooking.findUnique({
      where: { id: req.params.id },
      include: { slot: { select: { id: true, staffId: true } } }
    });
    if (!booking) return notFound(res, 'Booking not found');
    const isAlumnus = callerId === booking.alumniId;
    const isStaff = callerRole === 'ADMIN' && callerId === booking.slot.staffId;
    if (!isAlumnus && !isStaff) return forbid(res, 'Not your booking');
    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      return badRequest(res, `Booking is already ${booking.status}`, 'INVALID_STATE');
    }

    const updated = await prisma.counselingBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' }
    });

    // If the cancelled booking freed an active spot, promote the oldest WAITLIST.
    if (booking.status === 'PENDING' || booking.status === 'CONFIRMED') {
      const next = await prisma.counselingBooking.findFirst({
        where: { slotId: booking.slot.id, status: 'WAITLIST' },
        orderBy: { createdAt: 'asc' }
      });
      if (next) {
        await prisma.counselingBooking.update({
          where: { id: next.id },
          data: { status: 'PENDING' }
        });
        await prisma.notification.create({
          data: {
            userId: next.alumniId,
            type: 'MENTORSHIP_REQUEST',
            title: 'A counseling spot opened up',
            message: 'You moved off the waitlist — staff will confirm shortly.',
            link: `/career-tools/counseling`
          }
        }).catch(() => {});
      }
    }

    // Notify the other party.
    const otherUserId = isAlumnus ? booking.slot.staffId : booking.alumniId;
    await prisma.notification.create({
      data: {
        userId: otherUserId,
        type: 'ANNOUNCEMENT',
        title: 'Counseling booking cancelled',
        message: 'A counseling booking was cancelled.',
        link: `/career-tools/counseling`
      }
    }).catch(() => {});

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/bookings/:id/notes', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = notesSchema.parse(req.body);
    const owned = await loadStaffOwnedBooking(req.params.id, req.auth!.sub, req.auth!.role);
    if (owned.error === 'NOT_FOUND') return notFound(res, 'Booking not found');
    if (owned.error === 'FORBIDDEN') return forbid(res, 'Not your slot');
    const updated = await prisma.counselingBooking.update({
      where: { id: owned.booking.id },
      data: { staffNotes: parsed.staffNotes }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.patch('/bookings/:id/satisfaction', requireAuth, async (req, res, next) => {
  try {
    const parsed = satisfactionSchema.parse(req.body);
    const booking = await prisma.counselingBooking.findUnique({ where: { id: req.params.id } });
    if (!booking) return notFound(res, 'Booking not found');
    if (booking.alumniId !== req.auth!.sub) return forbid(res, 'Not your booking');
    if (booking.status !== 'COMPLETED') return badRequest(res, 'Only completed bookings can be rated', 'INVALID_STATE');
    const updated = await prisma.counselingBooking.update({
      where: { id: booking.id },
      data: {
        satisfactionRating: parsed.rating,
        satisfactionComment: parsed.comment ?? null
      }
    });
    res.json({ success: true, data: { ...updated, staffNotes: undefined } });
  } catch (e) { next(e); }
});

export default router;
