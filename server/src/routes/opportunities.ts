import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { scoreApplication } from '../lib/atsScoring.js';
import { aiScoreApplication, type AiAtsCandidateContext } from '../lib/aiAtsScoring.js';
import { checkAiQuota, noteAiCallUsed } from '../lib/aiQuota.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// ---- AI ATS scoring (fire-and-forget) ------------------------------------
//
// Apply-time AI scoring sits ON TOP of the deterministic recruiterScore.
// It is non-blocking: the apply response goes back the moment the
// Application row is written. This worker:
//   1. Loads the application + opportunity + applicant's most recent CV.
//   2. Builds a CV text blob (experience + education + skills + summary,
//      capped at 12k chars).
//   3. Checks the candidate's per-day AI quota — if exhausted, skips
//      silently so the deterministic score remains the source of truth.
//   4. Calls aiScoreApplication() (returns null on disabled / rate-limit
//      / parse failure).
//   5. On success, persists the snapshot to Application + writes audit
//      and activity logs.
//
// The whole worker is wrapped in .catch(() => {}) at the call site so
// AI failures NEVER bubble back into the apply flow.

const CV_TEXT_CAP = 12000;

type SavedCvData = {
  personal?: { fullName?: string; location?: string };
  summary?: string;
  experience?: Array<{
    company?: string; role?: string; location?: string;
    start?: string; end?: string; current?: boolean;
    bullets?: string[];
  }>;
  education?: Array<{
    school?: string; degree?: string; field?: string;
    start?: string; end?: string; gpa?: string;
  }>;
  skills?: string[];
  projects?: Array<{ name?: string; description?: string; tech?: string[] }>;
  certifications?: Array<{ name?: string; issuer?: string }>;
};

function buildCvText(cvData: SavedCvData | null, fallback: { skills: string[]; bio?: string | null }): string {
  const parts: string[] = [];

  if (cvData?.summary?.trim()) {
    parts.push('SUMMARY:', cvData.summary.trim());
  } else if (fallback.bio?.trim()) {
    parts.push('SUMMARY:', fallback.bio.trim());
  }

  const experience = cvData?.experience ?? [];
  if (experience.length) {
    parts.push('', 'EXPERIENCE:');
    for (const exp of experience) {
      const header = [exp.role, exp.company].filter(Boolean).join(' @ ');
      const range = [exp.start, exp.current ? 'present' : exp.end].filter(Boolean).join(' - ');
      const line = [header, range].filter(Boolean).join(' (') + (range ? ')' : '');
      if (line.trim()) parts.push(`- ${line}`);
      for (const bullet of exp.bullets ?? []) {
        if (bullet?.trim()) parts.push(`  • ${bullet.trim()}`);
      }
    }
  }

  const education = cvData?.education ?? [];
  if (education.length) {
    parts.push('', 'EDUCATION:');
    for (const edu of education) {
      const line = [edu.degree, edu.field, edu.school].filter(Boolean).join(' — ');
      const range = [edu.start, edu.end].filter(Boolean).join(' - ');
      if (line || range) parts.push(`- ${[line, range].filter(Boolean).join(' (')}${range ? ')' : ''}`);
    }
  }

  const skills = (cvData?.skills?.length ? cvData.skills : fallback.skills) ?? [];
  if (skills.length) {
    parts.push('', 'SKILLS:', skills.join(', '));
  }

  const projects = cvData?.projects ?? [];
  if (projects.length) {
    parts.push('', 'PROJECTS:');
    for (const proj of projects) {
      if (proj.name) parts.push(`- ${proj.name}${proj.description ? `: ${proj.description}` : ''}`);
    }
  }

  const certs = cvData?.certifications ?? [];
  if (certs.length) {
    parts.push('', 'CERTIFICATIONS:');
    for (const c of certs) {
      const line = [c.name, c.issuer].filter(Boolean).join(' — ');
      if (line) parts.push(`- ${line}`);
    }
  }

  const text = parts.join('\n').trim();
  return text.length > CV_TEXT_CAP ? `${text.slice(0, CV_TEXT_CAP)}\n…[truncated]` : text;
}

async function aiScoreApplicationFor(applicationId: string): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      userId: true,
      opportunityId: true
    }
  });
  if (!application) return;

  // Only spend AI on the *candidate's* daily quota at apply-time. The
  // recruiter manual recompute path (in routes/ats.ts) charges the
  // employer's quota instead.
  const quota = await checkAiQuota(application.userId);
  if (!quota.allowed) return;

  const [opportunity, applicant, latestCv] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id: application.opportunityId },
      select: {
        id: true, title: true, description: true,
        requiredSkills: true, preferredSkills: true,
        location: true, locationType: true
      }
    }),
    prisma.user.findUnique({
      where: { id: application.userId },
      select: {
        skills: true, bio: true,
        programme: true, graduationYear: true,
        currentRole: true, currentCompany: true, location: true
      }
    }),
    prisma.cV.findFirst({
      where: { userId: application.userId },
      orderBy: { updatedAt: 'desc' },
      select: { data: true }
    })
  ]);

  if (!opportunity || !applicant) return;

  const cvText = buildCvText(
    (latestCv?.data ?? null) as SavedCvData | null,
    { skills: applicant.skills ?? [], bio: applicant.bio }
  );
  if (!cvText) return; // nothing to score on

  // Compose JD blob: include the explicit skill lists so taxonomy-style
  // signals survive even when the long-form description omits them.
  const jdText = [
    opportunity.description,
    opportunity.requiredSkills?.length ? `Required skills: ${opportunity.requiredSkills.join(', ')}` : '',
    opportunity.preferredSkills?.length ? `Preferred skills: ${opportunity.preferredSkills.join(', ')}` : '',
    opportunity.location ? `Location: ${opportunity.location}${opportunity.locationType ? ` (${opportunity.locationType})` : ''}` : ''
  ].filter(Boolean).join('\n\n');

  const ctx: AiAtsCandidateContext = {
    programme: applicant.programme ?? undefined,
    graduationYear: applicant.graduationYear ?? undefined,
    currentRole: applicant.currentRole ?? undefined,
    currentCompany: applicant.currentCompany ?? undefined,
    location: applicant.location ?? undefined
  };

  const result = await aiScoreApplication(cvText, jdText, opportunity.title, ctx);
  if (!result) return;

  await prisma.application.update({
    where: { id: application.id },
    data: {
      aiScore: result.data.score,
      aiBreakdown: result.data.breakdown as any,
      aiReasoning: result.data.reasoning,
      aiStrengths: result.data.strengths,
      aiConcerns: result.data.concerns
    }
  });

  // Bump the candidate's quota counter immediately (don't wait for the
  // 60s aiQuota cache to expire) and write the AuditLog row that
  // checkAiQuota() actually counts.
  if (!result.cached) noteAiCallUsed(application.userId);
  await logAudit({
    actorId: application.userId,
    action: 'ats.ai_call',
    targetType: 'Application',
    targetId: application.id,
    metadata: {
      applicationId: application.id,
      tokens: result.tokensUsed,
      cached: result.cached
    }
  });

  await prisma.careerToolsActivity.create({
    data: {
      userId: application.userId,
      tool: 'ats',
      action: 'ai_score',
      metadata: {
        applicationId: application.id,
        score: result.data.score,
        cached: result.cached
      }
    }
  }).catch(() => undefined);
}

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, type, locationType, industry, skill } = req.query as Record<string, string>;
    const items = await prisma.opportunity.findMany({
      where: {
        isActive: true,
        isApproved: true,
        // Allow null deadlines (ingested jobs from Adzuna often don't carry
        // an explicit deadline — the role is open until filled). Anything
        // with an explicit past deadline still gets filtered out.
        AND: [
          {
            OR: [
              { deadline: null },
              { deadline: { gte: new Date() } }
            ]
          }
        ],
        ...(type && { type: type as any }),
        ...(locationType && { locationType: locationType as any }),
        ...(industry && { industry: { contains: industry, mode: 'insensitive' } }),
        ...(skill && { requiredSkills: { has: skill } }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } }
          ]
        })
      },
      orderBy: { createdAt: 'desc' },
      include: { postedBy: { select: { firstName: true, lastName: true, avatar: true } } },
      take: 100
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.get('/me/applications', requireAuth, async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { userId: req.auth!.sub },
      include: { opportunity: true },
      orderBy: { appliedAt: 'desc' }
    });
    res.json({ success: true, data: apps });
  } catch (e) { next(e); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const opp = await prisma.opportunity.findUnique({
      where: { id: req.params.id },
      include: { postedBy: { select: { id: true, firstName: true, lastName: true, avatar: true, currentCompany: true } } }
    });
    if (!opp) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    res.json({ success: true, data: opp });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(20),
  company: z.string().min(1),
  location: z.string().min(1),
  locationType: z.enum(['REMOTE', 'ONSITE', 'HYBRID']),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'NATIONAL_SERVICE', 'VOLUNTEER', 'CONTRACT']),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  deadline: z.string(),
  requiredSkills: z.array(z.string()).default([]),
  industry: z.string().optional(),
  experienceLevel: z.string().optional(),
  applicationUrl: z.string().url().optional()
});

router.post('/', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body;
    const opp = await prisma.opportunity.create({
      data: {
        ...data,
        deadline: new Date(data.deadline),
        postedById: req.auth!.sub
      }
    });
    res.status(201).json({ success: true, data: opp });
  } catch (e) { next(e); }
});

router.post('/:id/apply', requireAuth, async (req, res, next) => {
  try {
    // Load the opportunity + applicant so we can compute the recruiter score
    // at apply time. Score is stored alongside the application; recruiter can
    // recompute later via /api/ats/applications/:id/recompute.
    const [opportunity, applicant] = await Promise.all([
      prisma.opportunity.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          requiredSkills: true,
          preferredSkills: true,
          location: true,
          locationType: true,
          customQuestions: true
        }
      }),
      prisma.user.findUnique({
        where: { id: req.auth!.sub },
        select: {
          skills: true,
          programme: true,
          graduationYear: true,
          currentRole: true,
          currentCompany: true,
          location: true,
          bio: true
        }
      })
    ]);

    if (!opportunity) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });
    }

    // Optional structured answers to recruiter custom questions.
    let customAnswers: Record<string, string> | null = null;
    if (opportunity.customQuestions && req.body.customAnswers && typeof req.body.customAnswers === 'object') {
      customAnswers = req.body.customAnswers as Record<string, string>;
    }

    let recruiterScore: number | null = null;
    let recruiterScoreBreakdown: any = null;
    if (applicant) {
      const result = scoreApplication({}, opportunity, applicant);
      recruiterScore = result.score;
      recruiterScoreBreakdown = result.breakdown;
    }

    const app = await prisma.application.create({
      data: {
        userId: req.auth!.sub,
        opportunityId: req.params.id,
        cvUrl: req.body.cvUrl,
        coverLetter: req.body.coverLetter,
        customAnswers: customAnswers ?? undefined,
        recruiterScore: recruiterScore ?? undefined,
        recruiterScoreBreakdown: recruiterScoreBreakdown ?? undefined
      }
    });

    // Fire-and-forget AI scoring. Apply MUST NOT wait on Gemini —
    // deterministic recruiterScore (above) is already persisted as the
    // source of truth, AI is bonus signal layered on top. Any failure
    // here is swallowed so the apply flow stays bulletproof.
    void aiScoreApplicationFor(app.id).catch(() => {});

    res.status(201).json({ success: true, data: app });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_APPLIED', message: 'You already applied' } });
    }
    next(e);
  }
});

router.post('/:id/bookmark', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.bookmark.findUnique({
      where: { userId_opportunityId: { userId: req.auth!.sub, opportunityId: req.params.id } }
    });
    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return res.json({ success: true, data: { bookmarked: false } });
    }
    await prisma.bookmark.create({
      data: { userId: req.auth!.sub, opportunityId: req.params.id }
    });
    res.json({ success: true, data: { bookmarked: true } });
  } catch (e) { next(e); }
});

export default router;
