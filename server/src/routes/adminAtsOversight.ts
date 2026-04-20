// Superuser oversight for the ATS. Unlike /api/ats (which enforces
// employer-ownership on every route), this surface lets a superuser see
// and act on every Opportunity, Application, and TalentPoolEntry across
// all posters.
//
// Mounted at /api/admin/ats-oversight — app.use('/api/admin/ats-oversight', ...)
//
// Scoring logic is shared with the employer ATS via
// server/src/lib/atsScoring.ts — we do NOT duplicate it here.

import { Router } from 'express';
import { z } from 'zod';
import { ApplicationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { scoreApplication } from '../lib/atsScoring.js';

const router = Router();
router.use(requireAuth, requireSuperuser);

function notFound(res: any, message = 'Not found') {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
}

const STATUS_VALUES = Object.values(ApplicationStatus) as ApplicationStatus[];

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

const POSTER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  currentCompany: true
} as const;

// =====================================================================
// JOBS — every Opportunity, regardless of who posted it.
// =====================================================================

router.get('/jobs', async (_req, res, next) => {
  try {
    const jobs = await prisma.opportunity.findMany({
      orderBy: { createdAt: 'desc' },
      include: { postedBy: { select: POSTER_SELECT } },
      take: 500
    });
    if (jobs.length === 0) return res.json({ success: true, data: [] });

    const jobIds = jobs.map((j) => j.id);
    const counts = await prisma.application.groupBy({
      by: ['opportunityId', 'status'],
      where: { opportunityId: { in: jobIds } },
      _count: { _all: true }
    });

    const emptyStages = (): Record<ApplicationStatus, number> => ({
      APPLIED: 0, UNDER_REVIEW: 0, INTERVIEW: 0,
      OFFER: 0, REJECTED: 0, WITHDRAWN: 0
    });
    const byJob = new Map<string, Record<ApplicationStatus, number>>();
    for (const row of counts) {
      let bucket = byJob.get(row.opportunityId);
      if (!bucket) { bucket = emptyStages(); byJob.set(row.opportunityId, bucket); }
      bucket[row.status] = row._count._all;
    }

    const data = jobs.map((j) => {
      const stages = byJob.get(j.id) ?? emptyStages();
      const totalApplications = STATUS_VALUES.reduce((sum, s) => sum + stages[s], 0);
      return {
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        locationType: j.locationType,
        type: j.type,
        deadline: j.deadline,
        isActive: j.isActive,
        isApproved: j.isApproved,
        isFeatured: j.isFeatured,
        anonymousApplications: j.anonymousApplications,
        createdAt: j.createdAt,
        postedBy: j.postedBy,
        totalApplications,
        stageCounts: stages
      };
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/jobs/:id/applications', async (req, res, next) => {
  try {
    const job = await prisma.opportunity.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, title: true, company: true, location: true,
        locationType: true, requiredSkills: true, preferredSkills: true,
        customQuestions: true, anonymousApplications: true,
        postedBy: { select: POSTER_SELECT }
      }
    });
    if (!job) return notFound(res, 'Job not found');

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

// =====================================================================
// APPLICATIONS — force-stage / recompute with no ownership check.
// =====================================================================

const stageSchema = z.object({ status: z.nativeEnum(ApplicationStatus) });

router.patch('/applications/:id/stage', async (req, res, next) => {
  try {
    const parsed = stageSchema.parse(req.body);
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { opportunity: { select: { id: true, title: true, postedById: true } } }
    });
    if (!app) return notFound(res, 'Application not found');

    if (app.status === parsed.status) {
      return res.json({ success: true, data: app });
    }

    await logAudit({
      actorId: req.auth!.sub,
      action: 'ats.application.force_stage',
      targetType: 'Application',
      targetId: app.id,
      metadata: {
        from: app.status,
        to: parsed.status,
        jobId: app.opportunity.id,
        jobPostedById: app.opportunity.postedById
      }
    });

    const updated = await prisma.application.update({
      where: { id: app.id },
      data: { status: parsed.status }
    });

    // Notify the candidate so they see the change on their dashboard.
    await prisma.notification.create({
      data: {
        userId: app.userId,
        type: 'APPLICATION_UPDATE',
        title: 'Application update',
        message: `Your application for "${app.opportunity.title}" is now ${parsed.status.replace(/_/g, ' ').toLowerCase()}.`,
        link: '/career-tools/ats/my-applications'
      }
    }).catch(() => undefined);

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.post('/applications/:id/recompute', async (req, res, next) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
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
    if (!app) return notFound(res, 'Application not found');

    const { score, breakdown } = scoreApplication(app, app.opportunity, app.user);

    await logAudit({
      actorId: req.auth!.sub,
      action: 'ats.application.force_recompute',
      targetType: 'Application',
      targetId: app.id,
      metadata: { previousScore: app.recruiterScore, newScore: score }
    });

    const updated = await prisma.application.update({
      where: { id: app.id },
      data: { recruiterScore: score, recruiterScoreBreakdown: breakdown as any }
    });

    res.json({
      success: true,
      data: { score: updated.recruiterScore, breakdown }
    });
  } catch (e) { next(e); }
});

// =====================================================================
// TALENT POOLS — every entry across every employer owner.
// =====================================================================

router.get('/talent-pools', async (_req, res, next) => {
  try {
    const entries = await prisma.talentPoolEntry.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: { select: APPLICANT_SELECT },
        owner: { select: POSTER_SELECT }
      },
      take: 500
    });
    res.json({ success: true, data: entries });
  } catch (e) { next(e); }
});

router.delete('/talent-pools/:id', async (req, res, next) => {
  try {
    const entry = await prisma.talentPoolEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return notFound(res, 'Entry not found');

    await logAudit({
      actorId: req.auth!.sub,
      action: 'ats.talent_pool.removed',
      targetType: 'TalentPoolEntry',
      targetId: entry.id,
      metadata: { ownerId: entry.ownerId, candidateId: entry.candidateId }
    });

    await prisma.talentPoolEntry.delete({ where: { id: entry.id } });
    res.json({ success: true, data: { id: entry.id } });
  } catch (e) { next(e); }
});

export default router;
