// Skills Assessment & Gap Analysis routes — back the
// /career-tools/skills tool. Users pick a target RoleProfile, self-rate
// the role's required + preferred skills 1-5 (or 0 for "don't know"),
// and we compute a deterministic readiness % server-side so the score
// can't be inflated client-side.
//
// We also expose the read-only learning-resource lookup at
// /resources/by-skill/:skill so the assessment page can suggest a few
// resources for each top skill gap. The full Learning Hub (CRUD,
// progress, paths) is built by another agent in /api/learning — keep
// the surface area here read-only to avoid mount conflicts.
//
// Caller wires this in app.ts as `app.use('/api/skills', skillsRoutes)`.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { seedSkills, seedRoles } from '../lib/seedSkillsRoles.js';

const router = Router();

// ----- Readiness scoring ---------------------------------------------------
//
// Required skills weigh 1.0, preferred 0.5. Ratings range 1-5; a 0 means
// "don't know" and is treated as the worst possible (rating = 1) so the
// score reflects an honest gap rather than letting users skip the hard
// ones. Result is normalized to 0-100. Pure function — same input always
// produces the same output.
function computeReadiness(
  required: string[],
  preferred: string[],
  ratings: Record<string, number>
): number {
  let weightedScore = 0;
  let weightedMax = 0;

  for (const skill of required) {
    const r = ratings[skill];
    const rating = typeof r === 'number' && r > 0 ? Math.min(5, Math.max(1, r)) : 1;
    weightedScore += rating * 1.0;
    weightedMax += 5 * 1.0;
  }
  for (const skill of preferred) {
    const r = ratings[skill];
    const rating = typeof r === 'number' && r > 0 ? Math.min(5, Math.max(1, r)) : 1;
    weightedScore += rating * 0.5;
    weightedMax += 5 * 0.5;
  }

  if (weightedMax === 0) return 0;
  return Math.round((weightedScore / weightedMax) * 100);
}

// ===== Roles ==============================================================

router.get('/roles', async (_req, res, next) => {
  try {
    const roles = await prisma.roleProfile.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    res.json({ success: true, data: roles });
  } catch (e) { next(e); }
});

router.get('/roles/:slug', async (req, res, next) => {
  try {
    const role = await prisma.roleProfile.findUnique({
      where: { slug: req.params.slug }
    });
    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' }
      });
    }

    // Resolve each skill name against the Skill table so the UI gets
    // categories + synonyms for free. Missing names still appear with
    // category="other" so the assessment never silently drops a skill.
    const allNames = Array.from(new Set([...role.requiredSkills, ...role.preferredSkills]));
    const skillRows = await prisma.skill.findMany({
      where: { name: { in: allNames } }
    });
    const byName = new Map(skillRows.map((s) => [s.name, s]));

    const resolve = (names: string[]) =>
      names.map((name) => {
        const s = byName.get(name);
        return s
          ? { name: s.name, category: s.category, synonyms: s.synonyms }
          : { name, category: 'other', synonyms: [] as string[] };
      });

    res.json({
      success: true,
      data: {
        ...role,
        resolvedRequired: resolve(role.requiredSkills),
        resolvedPreferred: resolve(role.preferredSkills)
      }
    });
  } catch (e) { next(e); }
});

// ===== Assessments ========================================================

const ratingsSchema = z.record(z.number().min(0).max(5));

const createAssessmentSchema = z.object({
  roleSlug: z.string().min(1).max(120),
  ratings: ratingsSchema
});

router.post('/assessments', requireAuth, async (req, res, next) => {
  try {
    const parsed = createAssessmentSchema.parse(req.body);

    const role = await prisma.roleProfile.findUnique({
      where: { slug: parsed.roleSlug }
    });
    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' }
      });
    }

    const readiness = computeReadiness(
      role.requiredSkills,
      role.preferredSkills,
      parsed.ratings
    );

    const row = await prisma.skillAssessment.create({
      data: {
        userId: req.auth!.sub,
        roleSlug: parsed.roleSlug,
        ratings: parsed.ratings,
        readiness
      }
    });

    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
});

router.get('/assessments', requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.skillAssessment.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { completedAt: 'desc' },
      take: 100
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.get('/assessments/role/:slug', requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.skillAssessment.findMany({
      where: { userId: req.auth!.sub, roleSlug: req.params.slug },
      orderBy: { completedAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ===== Learning resource lookup (read-only) ===============================
//
// Returns up to 5 approved LearningResources whose `skills` array contains
// the requested skill (case-insensitive). Empty array if the table hasn't
// been seeded yet — the Learning Hub agent owns the seed for that table.

router.get('/resources/by-skill/:skill', async (req, res, next) => {
  try {
    const skill = req.params.skill.trim();
    if (!skill) {
      return res.json({ success: true, data: [] });
    }
    // Postgres array `has` is case-sensitive. Pull a wider candidate set
    // by category-style matching (any of: exact, lowercase, capitalized)
    // and then filter case-insensitively in app code.
    const variants = Array.from(
      new Set([
        skill,
        skill.toLowerCase(),
        skill.toUpperCase(),
        skill[0]!.toUpperCase() + skill.slice(1).toLowerCase()
      ])
    );
    const resources = await prisma.learningResource.findMany({
      where: {
        isApproved: true,
        OR: variants.map((v) => ({ skills: { has: v } }))
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    res.json({ success: true, data: resources });
  } catch (e) { next(e); }
});

// ===== One-shot admin seed ================================================
//
// Lets us populate Skill + RoleProfile in production after first deploy
// without needing a separate `bun run` step on the serverless host. Returns
// the row counts after so we can verify in the admin UI.

router.post('/seed', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const skills = await seedSkills();
    const roles = await seedRoles();
    res.json({
      success: true,
      data: {
        skillsUpserted: skills,
        rolesUpserted: roles,
        totals: {
          skills: await prisma.skill.count(),
          roles: await prisma.roleProfile.count()
        }
      }
    });
  } catch (e) { next(e); }
});

export default router;
