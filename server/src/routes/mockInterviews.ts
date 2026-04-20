// Mock Interview Scheduler endpoints — backs the
// /career-tools/interview/mock page.
//
// Reuses the existing MentorshipMatch + Session models so a mock interview is
// just a Session whose `mockMeta` JSON column is populated. We do NOT
// duplicate the mentor profile or matching machinery from /api/mentors.
//
// Surface:
//   POST  /request                 auth — create or reuse a match, then
//                                          create a Session w/ mockMeta and
//                                          notify the mentor.
//   GET   /my-bookings             auth — list the current user's mock
//                                          interview Sessions (mentee side).
//   PATCH /sessions/:id/cancel     auth — mentee or mentor cancels.
//   PATCH /sessions/:id/feedback   auth — mentee or mentor submits the
//                                          5-axis rubric.

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ---- shared zod ---------------------------------------------------------

const interviewTypeEnum = z.enum(['BEHAVIORAL', 'TECHNICAL', 'PANEL', 'CASE']);
const seniorityEnum = z.enum(['ENTRY', 'MID', 'SENIOR']);

const requestSchema = z.object({
  mentorId: z.string().min(1),
  type: interviewTypeEnum,
  focusArea: z.string().min(2).max(200),
  seniorityTarget: seniorityEnum,
  language: z.string().min(2).max(40).optional(),
  preferredAt: z.string().min(1),
  backupAt: z.string().optional(),
  message: z.string().max(2000).optional()
});

const feedbackSchema = z.object({
  communication: z.number().int().min(1).max(5),
  technicalDepth: z.number().int().min(1).max(5),
  structure: z.number().int().min(1).max(5),
  presence: z.number().int().min(1).max(5),
  overall: z.number().int().min(1).max(5),
  comments: z.string().max(4000).optional()
});

// ---- helpers ------------------------------------------------------------

const parseIso = (s: string): Date | null => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

// Pull the current mockMeta off a Session as a plain object so we can merge
// new fields into it without losing the originals.
const readMockMeta = (raw: Prisma.JsonValue | null | undefined): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
};

// ---- POST /request ------------------------------------------------------

router.post('/request', requireAuth, async (req, res, next) => {
  try {
    const parsed = requestSchema.parse(req.body);
    const menteeId = req.auth!.sub;
    if (parsed.mentorId === menteeId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MENTOR', message: "You can't book a mock interview with yourself." }
      });
    }

    const preferredAt = parseIso(parsed.preferredAt);
    if (!preferredAt) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: 'preferredAt must be a valid date/time.' }
      });
    }
    const backupAt = parsed.backupAt ? parseIso(parsed.backupAt) : null;
    if (parsed.backupAt && !backupAt) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: 'backupAt must be a valid date/time.' }
      });
    }

    // Verify the mentor actually exists + has a mentor profile so we don't
    // create dangling matches.
    const mentor = await prisma.user.findUnique({
      where: { id: parsed.mentorId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mentorProfile: { select: { id: true, isActive: true } }
      }
    });
    if (!mentor || !mentor.mentorProfile) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Mentor not found.' }
      });
    }

    // Re-use any existing match (the unique (mentorId, menteeId) constraint
    // prevents duplicates anyway). Only skip DECLINED matches — if a mentor
    // previously declined, the user should not silently re-open the same row.
    const existing = await prisma.mentorshipMatch.findUnique({
      where: { mentorId_menteeId: { mentorId: parsed.mentorId, menteeId } }
    });

    let matchId: string;
    if (existing && existing.status !== 'DECLINED') {
      matchId = existing.id;
    } else if (existing) {
      // DECLINED → reset to PENDING and update goals so the mentor sees the
      // new request fresh.
      const updated = await prisma.mentorshipMatch.update({
        where: { id: existing.id },
        data: { status: 'PENDING', goals: `Mock interview: ${parsed.type}` }
      });
      matchId = updated.id;
    } else {
      const created = await prisma.mentorshipMatch.create({
        data: {
          mentorId: parsed.mentorId,
          menteeId,
          goals: `Mock interview: ${parsed.type}`
        }
      });
      matchId = created.id;
    }

    const mentee = await prisma.user.findUnique({
      where: { id: menteeId },
      select: { firstName: true, lastName: true }
    });

    const mockMeta: Record<string, unknown> = {
      type: parsed.type,
      focusArea: parsed.focusArea.trim(),
      seniorityTarget: parsed.seniorityTarget,
      language: parsed.language?.trim() || 'English',
      ...(parsed.message ? { message: parsed.message.trim() } : {}),
      ...(backupAt ? { backupAt: backupAt.toISOString() } : {})
    };

    const session = await prisma.session.create({
      data: {
        matchId,
        scheduledAt: preferredAt,
        duration: 30,
        status: 'SCHEDULED',
        mockMeta: mockMeta as Prisma.InputJsonValue
      }
    });

    await prisma.notification.create({
      data: {
        userId: parsed.mentorId,
        type: 'MENTORSHIP_REQUEST',
        title: 'Mock interview requested',
        message: `Mock interview (${parsed.type.toLowerCase()}) requested by ${
          mentee ? fullName(mentee) : 'a student'
        } — focus: ${parsed.focusArea.trim()}`,
        link: '/dashboard/mentor/sessions'
      }
    });

    res.status(201).json({ success: true, data: session });
  } catch (e) { next(e); }
});

// ---- GET /my-bookings ---------------------------------------------------

router.get('/my-bookings', requireAuth, async (req, res, next) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        mockMeta: { not: Prisma.DbNull },
        match: { menteeId: req.auth!.sub }
      },
      orderBy: { scheduledAt: 'desc' },
      include: {
        match: {
          select: {
            id: true,
            status: true,
            mentor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                currentRole: true,
                currentCompany: true
              }
            }
          }
        }
      }
    });
    res.json({ success: true, data: sessions });
  } catch (e) { next(e); }
});

// ---- PATCH /sessions/:id/cancel -----------------------------------------

router.patch('/sessions/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        match: { select: { mentorId: true, menteeId: true } }
      }
    });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found.' }
      });
    }

    const isMentor = session.match.mentorId === userId;
    const isMentee = session.match.menteeId === userId;
    if (!isMentor && !isMentee) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You cannot cancel this session.' }
      });
    }
    if (session.status === 'CANCELLED') {
      return res.json({ success: true, data: session });
    }
    if (session.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_COMPLETED', message: 'Completed sessions cannot be cancelled.' }
      });
    }

    const updated = await prisma.session.update({
      where: { id: session.id },
      data: { status: 'CANCELLED' }
    });

    // Notify the other party so the cancellation isn't silent.
    const otherUserId = isMentor ? session.match.menteeId : session.match.mentorId;
    await prisma.notification.create({
      data: {
        userId: otherUserId,
        type: 'SESSION_REMINDER',
        title: 'Mock interview cancelled',
        message: `Your mock interview scheduled for ${session.scheduledAt.toISOString()} was cancelled.`,
        link: isMentor ? '/career-tools/interview/mock' : '/dashboard/mentor/sessions'
      }
    });

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ---- PATCH /sessions/:id/feedback ---------------------------------------

router.patch('/sessions/:id/feedback', requireAuth, async (req, res, next) => {
  try {
    const parsed = feedbackSchema.parse(req.body);
    const userId = req.auth!.sub;

    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        match: { select: { mentorId: true, menteeId: true } }
      }
    });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found.' }
      });
    }

    const isMentor = session.match.mentorId === userId;
    const isMentee = session.match.menteeId === userId;
    if (!isMentor && !isMentee) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You cannot leave feedback on this session.' }
      });
    }

    const rubric = {
      communication: parsed.communication,
      technicalDepth: parsed.technicalDepth,
      structure: parsed.structure,
      presence: parsed.presence,
      overall: parsed.overall,
      comments: parsed.comments?.trim() || null,
      submittedAt: new Date().toISOString(),
      submittedBy: isMentor ? 'mentor' : 'mentee'
    };

    const meta = readMockMeta(session.mockMeta);
    const existingRubric = (meta.rubric && typeof meta.rubric === 'object' && !Array.isArray(meta.rubric))
      ? (meta.rubric as Record<string, unknown>)
      : {};
    meta.rubric = { ...existingRubric, [isMentor ? 'mentor' : 'mentee']: rubric };

    const data: Prisma.SessionUpdateInput = {
      mockMeta: meta as Prisma.InputJsonValue
    };
    if (isMentee) {
      data.menteeFeedback = JSON.stringify(rubric);
    } else {
      data.mentorFeedback = JSON.stringify(rubric);
    }

    const updated = await prisma.session.update({
      where: { id: session.id },
      data
    });

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
