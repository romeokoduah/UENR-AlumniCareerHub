// Applicant Tracking System (ATS) — backs /career-tools/ats.
//
// Surface (mounted at /api/ats):
//   GET    /jobs                              auth + employer — caller's posted
//                                              jobs with stage counts
//   GET    /jobs/:jobId/applications          auth + employer + ownership —
//                                              applications for a job, sorted
//                                              by recruiterScore desc
//   GET    /applications/:id                  auth + employer + ownership —
//                                              full detail (latest CV, notes)
//   PATCH  /applications/:id/stage            auth + employer + ownership —
//                                              { status }; notifies candidate
//   POST   /applications/:id/notes            auth + employer + ownership —
//                                              { body } -> CandidateNote
//   POST   /applications/:id/recompute        auth + employer + ownership —
//                                              recompute recruiterScore
//   POST   /applications/bulk                 auth + employer — bulk advance/
//                                              reject/add-to-pool
//   GET    /applications/me                   auth (any) — caller's applications
//                                              across all jobs (candidate dash)
//   PATCH  /applications/me/:id/withdraw      auth + ownership — set WITHDRAWN
//   GET    /talent-pool                       auth + employer — caller's pool
//   POST   /talent-pool                       auth + employer — upsert entry
//   DELETE /talent-pool/:id                   auth + employer + ownership
//   GET    /jobs/:jobId/applications/export.csv  auth + employer + ownership —
//                                              streams CSV (no library)
//
// Scoring is deterministic (server/src/lib/atsScoring.ts). Recompute happens
// on apply, on explicit recruiter request, or via the bulk endpoint — never
// implicitly on read.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ApplicationStatus, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { scoreApplication } from '../lib/atsScoring.js';

const router = Router();

// ---- helpers -------------------------------------------------------------

function notFound(res: Response, message = 'Not found') {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
}

function forbid(res: Response, message = 'Forbidden') {
  return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message } });
}

function badRequest(res: Response, message: string, code = 'BAD_REQUEST') {
  return res.status(400).json({ success: false, error: { code, message } });
}

function requireEmployer(req: Request, res: Response, next: NextFunction) {
  const role = req.auth?.role;
  if (role !== 'EMPLOYER' && role !== 'ADMIN') {
    return forbid(res, 'Employer access only');
  }
  next();
}

const STATUS_VALUES = Object.values(ApplicationStatus) as ApplicationStatus[];
const STAGE_ORDER: ApplicationStatus[] = [
  'APPLIED',
  'UNDER_REVIEW',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN'
];
const ADVANCE_FLOW: Record<ApplicationStatus, ApplicationStatus | null> = {
  APPLIED: 'UNDER_REVIEW',
  UNDER_REVIEW: 'INTERVIEW',
  INTERVIEW: 'OFFER',
  OFFER: null,
  REJECTED: null,
  WITHDRAWN: null
};

const APPLICANT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
  programme: true,
  graduationYear: true,
  skills: true,
  bio: true,
  currentRole: true,
  currentCompany: true,
  location: true
} as const;

async function loadApplicationOwnedByEmployer(appId: string, userId: string) {
  const app = await prisma.application.findUnique({
    where: { id: appId },
    include: { opportunity: { select: { id: true, postedById: true, title: true } } }
  });
  if (!app) return { app: null as null, allowed: false };
  const allowed = app.opportunity.postedById === userId;
  return { app, allowed };
}

// Pretty title-case a status enum value for notification copy.
function statusLabel(status: ApplicationStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function buildStageNotification(jobTitle: string, status: ApplicationStatus) {
  switch (status) {
    case 'INTERVIEW':
      return {
        title: 'You\'ve been invited to an interview',
        message: `Great news — your application for "${jobTitle}" has advanced to the interview stage. The recruiter will be in touch with details.`
      };
    case 'OFFER':
      return {
        title: 'You received an offer',
        message: `Congratulations! Your application for "${jobTitle}" has reached the offer stage. Watch your inbox for the formal offer.`
      };
    case 'REJECTED':
      return {
        title: 'Update on your application',
        message: `Thanks for applying to "${jobTitle}". The recruiter has decided not to move forward. Don't lose heart — keep building.`
      };
    case 'UNDER_REVIEW':
      return {
        title: 'Your application is being reviewed',
        message: `Your application for "${jobTitle}" is now under review.`
      };
    case 'WITHDRAWN':
      return {
        title: 'Application withdrawn',
        message: `Your application for "${jobTitle}" was withdrawn.`
      };
    default:
      return {
        title: 'Application update',
        message: `Your application for "${jobTitle}" is now ${statusLabel(status)}.`
      };
  }
}

async function recomputeApplicationScore(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      user: { select: APPLICANT_SELECT },
      opportunity: {
        select: {
          requiredSkills: true,
          preferredSkills: true,
          location: true,
          locationType: true
        }
      }
    }
  });
  if (!app) return null;
  const { score, breakdown } = scoreApplication(app, app.opportunity, app.user);
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { recruiterScore: score, recruiterScoreBreakdown: breakdown as any }
  });
  return { score: updated.recruiterScore, breakdown };
}

// ---- /jobs ---------------------------------------------------------------

router.get('/jobs', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const jobs = await prisma.opportunity.findMany({
      where: { postedById: userId },
      orderBy: { createdAt: 'desc' }
    });
    if (jobs.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const jobIds = jobs.map((j) => j.id);

    const counts = await prisma.application.groupBy({
      by: ['opportunityId', 'status'],
      where: { opportunityId: { in: jobIds } },
      _count: { _all: true }
    });
    const lastApplied = await prisma.application.groupBy({
      by: ['opportunityId'],
      where: { opportunityId: { in: jobIds } },
      _max: { appliedAt: true }
    });
    const lastByJob = new Map(lastApplied.map((row) => [row.opportunityId, row._max.appliedAt]));

    const stageByJob = new Map<string, Record<ApplicationStatus, number>>();
    for (const row of counts) {
      let bucket = stageByJob.get(row.opportunityId);
      if (!bucket) {
        bucket = {
          APPLIED: 0,
          UNDER_REVIEW: 0,
          INTERVIEW: 0,
          OFFER: 0,
          REJECTED: 0,
          WITHDRAWN: 0
        };
        stageByJob.set(row.opportunityId, bucket);
      }
      bucket[row.status] = row._count._all;
    }

    const data = jobs
      .map((j) => {
        const stages = stageByJob.get(j.id) ?? {
          APPLIED: 0,
          UNDER_REVIEW: 0,
          INTERVIEW: 0,
          OFFER: 0,
          REJECTED: 0,
          WITHDRAWN: 0
        };
        const totalApplications = STATUS_VALUES.reduce((sum, s) => sum + stages[s], 0);
        return {
          id: j.id,
          title: j.title,
          company: j.company,
          deadline: j.deadline,
          isActive: j.isActive,
          isFeatured: j.isFeatured,
          anonymousApplications: j.anonymousApplications,
          createdAt: j.createdAt,
          lastApplicationAt: lastByJob.get(j.id) ?? null,
          totalApplications,
          stageCounts: stages
        };
      })
      .sort((a, b) => {
        const aT = a.lastApplicationAt ? new Date(a.lastApplicationAt).getTime() : 0;
        const bT = b.lastApplicationAt ? new Date(b.lastApplicationAt).getTime() : 0;
        if (aT !== bT) return bT - aT;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/jobs/:jobId/applications', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const job = await prisma.opportunity.findUnique({
      where: { id: req.params.jobId },
      select: { id: true, postedById: true, title: true, anonymousApplications: true, customQuestions: true }
    });
    if (!job) return notFound(res, 'Job not found');
    if (job.postedById !== userId) return forbid(res, 'You do not own this job');

    const apps = await prisma.application.findMany({
      where: { opportunityId: job.id },
      orderBy: [
        { recruiterScore: { sort: 'desc', nulls: 'last' } },
        { appliedAt: 'desc' }
      ],
      include: {
        user: { select: APPLICANT_SELECT },
        _count: { select: { notes: true } }
      }
    });

    res.json({
      success: true,
      data: {
        job,
        applications: apps.map((a) => ({
          id: a.id,
          status: a.status,
          appliedAt: a.appliedAt,
          updatedAt: a.updatedAt,
          cvUrl: a.cvUrl,
          coverLetter: a.coverLetter,
          recruiterScore: a.recruiterScore,
          recruiterScoreBreakdown: a.recruiterScoreBreakdown,
          notesCount: a._count.notes,
          customAnswers: a.customAnswers,
          user: a.user
        }))
      }
    });
  } catch (e) { next(e); }
});

router.get('/jobs/:jobId/applications/export.csv', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const job = await prisma.opportunity.findUnique({
      where: { id: req.params.jobId },
      select: { id: true, postedById: true, title: true }
    });
    if (!job) return notFound(res, 'Job not found');
    if (job.postedById !== userId) return forbid(res, 'You do not own this job');

    const apps = await prisma.application.findMany({
      where: { opportunityId: job.id },
      orderBy: { appliedAt: 'desc' },
      include: { user: { select: APPLICANT_SELECT } }
    });

    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = ['Name', 'Email', 'Score', 'Stage', 'Applied At', 'Programme', 'Graduation Year', 'Location', 'CV URL'];
    const rows = apps.map((a) => [
      `${a.user.firstName} ${a.user.lastName}`,
      a.user.email,
      a.recruiterScore ?? '',
      a.status,
      a.appliedAt.toISOString(),
      a.user.programme ?? '',
      a.user.graduationYear ?? '',
      a.user.location ?? '',
      a.cvUrl ?? ''
    ]);

    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const safeTitle = job.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'job';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_applications.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// ---- /applications -------------------------------------------------------

// Candidate-side dashboard. Defined BEFORE /:id so it isn't mistaken for an
// application id.
router.get('/applications/me', requireAuth, async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { appliedAt: 'desc' },
      include: {
        opportunity: {
          select: {
            id: true, title: true, company: true, location: true,
            locationType: true, deadline: true, type: true
          }
        }
      }
    });
    res.json({
      success: true,
      data: apps.map((a) => ({
        id: a.id,
        status: a.status,
        appliedAt: a.appliedAt,
        updatedAt: a.updatedAt,
        opportunity: a.opportunity
      }))
    });
  } catch (e) { next(e); }
});

router.patch('/applications/me/:id/withdraw', requireAuth, async (req, res, next) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, status: true }
    });
    if (!app) return notFound(res, 'Application not found');
    if (app.userId !== req.auth!.sub) return forbid(res, 'Not your application');
    if (app.status === 'WITHDRAWN' || app.status === 'OFFER' || app.status === 'REJECTED') {
      return badRequest(res, 'This application can no longer be withdrawn', 'INVALID_STATE');
    }
    const updated = await prisma.application.update({
      where: { id: app.id },
      data: { status: 'WITHDRAWN' }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

const bulkSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(['advance', 'reject', 'add_to_pool']),
  payload: z.record(z.any()).optional()
});

router.post('/applications/bulk', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const parsed = bulkSchema.parse(req.body);
    const userId = req.auth!.sub;
    const apps = await prisma.application.findMany({
      where: { id: { in: parsed.applicationIds } },
      include: {
        opportunity: { select: { id: true, postedById: true, title: true } }
      }
    });

    const owned = apps.filter((a) => a.opportunity.postedById === userId);
    if (owned.length === 0) return badRequest(res, 'No matching applications you own');

    let updated = 0;
    let skipped = apps.length - owned.length;
    const notifications: { userId: string; type: NotificationType; title: string; message: string; link: string }[] = [];

    if (parsed.action === 'advance') {
      for (const app of owned) {
        const next = ADVANCE_FLOW[app.status];
        if (!next) {
          skipped++;
          continue;
        }
        await prisma.application.update({ where: { id: app.id }, data: { status: next } });
        updated++;
        const copy = buildStageNotification(app.opportunity.title, next);
        notifications.push({
          userId: app.userId,
          type: 'APPLICATION_UPDATE',
          title: copy.title,
          message: copy.message,
          link: '/career-tools/ats/my-applications'
        });
      }
    } else if (parsed.action === 'reject') {
      for (const app of owned) {
        if (app.status === 'REJECTED' || app.status === 'WITHDRAWN') {
          skipped++;
          continue;
        }
        await prisma.application.update({ where: { id: app.id }, data: { status: 'REJECTED' } });
        updated++;
        const copy = buildStageNotification(app.opportunity.title, 'REJECTED');
        notifications.push({
          userId: app.userId,
          type: 'APPLICATION_UPDATE',
          title: copy.title,
          message: copy.message,
          link: '/career-tools/ats/my-applications'
        });
      }
    } else if (parsed.action === 'add_to_pool') {
      for (const app of owned) {
        try {
          await prisma.talentPoolEntry.upsert({
            where: { candidateId_ownerId: { candidateId: app.userId, ownerId: userId } },
            update: {},
            create: { candidateId: app.userId, ownerId: userId }
          });
          updated++;
        } catch {
          skipped++;
        }
      }
    }

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }

    await prisma.careerToolsActivity.create({
      data: {
        userId,
        tool: 'ats',
        action: 'bulk_action',
        metadata: { count: updated, action: parsed.action }
      }
    });

    res.json({ success: true, data: { updated, skipped, action: parsed.action } });
  } catch (e) { next(e); }
});

router.get('/applications/:id', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const { app, allowed } = await loadApplicationOwnedByEmployer(req.params.id, userId);
    if (!app) return notFound(res, 'Application not found');
    if (!allowed) return forbid(res, 'You do not own this job');

    const [full, latestCv, notes, opportunity] = await Promise.all([
      prisma.application.findUnique({
        where: { id: app.id },
        include: { user: { select: APPLICANT_SELECT } }
      }),
      prisma.cV.findFirst({
        where: { userId: app.userId },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.candidateNote.findMany({
        where: { applicationId: app.id },
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatar: true } }
        }
      }),
      prisma.opportunity.findUnique({
        where: { id: app.opportunityId },
        select: {
          id: true, title: true, company: true, location: true, locationType: true,
          requiredSkills: true, preferredSkills: true, customQuestions: true,
          anonymousApplications: true
        }
      })
    ]);

    if (!full || !opportunity) return notFound(res, 'Application not found');

    res.json({
      success: true,
      data: {
        application: {
          id: full.id,
          status: full.status,
          appliedAt: full.appliedAt,
          updatedAt: full.updatedAt,
          cvUrl: full.cvUrl,
          coverLetter: full.coverLetter,
          customAnswers: full.customAnswers,
          recruiterScore: full.recruiterScore,
          recruiterScoreBreakdown: full.recruiterScoreBreakdown,
          user: full.user
        },
        opportunity,
        latestCv,
        notes
      }
    });
  } catch (e) { next(e); }
});

const stageSchema = z.object({ status: z.nativeEnum(ApplicationStatus) });

router.patch('/applications/:id/stage', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const parsed = stageSchema.parse(req.body);
    const userId = req.auth!.sub;
    const { app, allowed } = await loadApplicationOwnedByEmployer(req.params.id, userId);
    if (!app) return notFound(res, 'Application not found');
    if (!allowed) return forbid(res, 'You do not own this job');

    if (app.status === parsed.status) {
      return res.json({ success: true, data: app });
    }

    const updated = await prisma.application.update({
      where: { id: app.id },
      data: { status: parsed.status }
    });

    const copy = buildStageNotification(app.opportunity.title, parsed.status);
    await prisma.notification.create({
      data: {
        userId: app.userId,
        type: 'APPLICATION_UPDATE',
        title: copy.title,
        message: copy.message,
        link: '/career-tools/ats/my-applications'
      }
    });

    const action = parsed.status === 'REJECTED' ? 'reject_application' : 'advance_application';
    await prisma.careerToolsActivity.create({
      data: { userId, tool: 'ats', action, metadata: { applicationId: app.id, to: parsed.status } }
    }).catch(() => undefined);

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

const noteSchema = z.object({ body: z.string().min(1).max(4000) });

router.post('/applications/:id/notes', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const parsed = noteSchema.parse(req.body);
    const userId = req.auth!.sub;
    const { app, allowed } = await loadApplicationOwnedByEmployer(req.params.id, userId);
    if (!app) return notFound(res, 'Application not found');
    if (!allowed) return forbid(res, 'You do not own this job');

    const note = await prisma.candidateNote.create({
      data: { applicationId: app.id, authorId: userId, body: parsed.body.trim() },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatar: true } } }
    });

    await prisma.careerToolsActivity.create({
      data: { userId, tool: 'ats', action: 'add_note', metadata: { applicationId: app.id } }
    }).catch(() => undefined);

    res.status(201).json({ success: true, data: note });
  } catch (e) { next(e); }
});

router.post('/applications/:id/recompute', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const { app, allowed } = await loadApplicationOwnedByEmployer(req.params.id, userId);
    if (!app) return notFound(res, 'Application not found');
    if (!allowed) return forbid(res, 'You do not own this job');

    const result = await recomputeApplicationScore(app.id);
    if (!result) return notFound(res, 'Application not found');
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// ---- /talent-pool --------------------------------------------------------

router.get('/talent-pool', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const entries = await prisma.talentPoolEntry.findMany({
      where: { ownerId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      include: { candidate: { select: APPLICANT_SELECT } }
    });
    res.json({ success: true, data: entries });
  } catch (e) { next(e); }
});

const poolSchema = z.object({
  candidateId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional()
});

router.post('/talent-pool', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const parsed = poolSchema.parse(req.body);
    const userId = req.auth!.sub;
    const candidate = await prisma.user.findUnique({
      where: { id: parsed.candidateId },
      select: { id: true }
    });
    if (!candidate) return notFound(res, 'Candidate not found');

    const entry = await prisma.talentPoolEntry.upsert({
      where: { candidateId_ownerId: { candidateId: parsed.candidateId, ownerId: userId } },
      update: {
        notes: parsed.notes ?? undefined,
        tags: parsed.tags ?? undefined
      },
      create: {
        candidateId: parsed.candidateId,
        ownerId: userId,
        notes: parsed.notes ?? null,
        tags: parsed.tags ?? []
      },
      include: { candidate: { select: APPLICANT_SELECT } }
    });

    await prisma.careerToolsActivity.create({
      data: { userId, tool: 'ats', action: 'add_to_pool', metadata: { candidateId: parsed.candidateId } }
    }).catch(() => undefined);

    res.status(201).json({ success: true, data: entry });
  } catch (e) { next(e); }
});

router.delete('/talent-pool/:id', requireAuth, requireEmployer, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const entry = await prisma.talentPoolEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return notFound(res, 'Entry not found');
    if (entry.ownerId !== userId) return forbid(res, 'Not your pool entry');
    await prisma.talentPoolEntry.delete({ where: { id: entry.id } });
    res.json({ success: true, data: { id: entry.id } });
  } catch (e) { next(e); }
});

export default router;
export { recomputeApplicationScore, STAGE_ORDER };
