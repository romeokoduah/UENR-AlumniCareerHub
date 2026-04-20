// Phase 5 — Tool Data CRUD (minimal v1).
//
// Two surfaces:
// 1. Seed runner — re-run any of the 8 admin seed functions and report
//    current row counts. Replaces "ssh into the box and run a script".
// 2. Per-resource browse + delete on the curated datasets — full CRUD
//    can be added per-tool later. v1 trusts each tool's own admin
//    endpoints for create/update.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { seedSkills, seedRoles } from '../lib/seedSkillsRoles.js';
import { seedLearningResources, seedLearningPaths } from '../lib/seedLearning.js';
import { seedCareerPaths } from '../lib/seedCareerPaths.js';
import { seedInterviewQuestions } from '../lib/seedInterviewQuestions.js';
import { seedAptitudeQuestions } from '../lib/seedAptitudeQuestions.js';
import { seedSalaryBenchmarks, seedCityCostOfLiving } from '../lib/seedSalaryData.js';
import { seedStartupContent } from '../lib/seedStartupContent.js';
import { seedBizRegSteps } from '../lib/seedBizRegSteps.js';

const router = Router();
router.use(requireAuth, requireSuperuser);

const DATASETS: Record<string, { run: () => Promise<unknown>; countModel: string; label: string }> = {
  skills: {
    run: async () => {
      const a = await seedSkills();
      const b = await seedRoles();
      return { skills: a, roles: b };
    },
    countModel: 'skill',
    label: 'Skills + role profiles'
  },
  learning: {
    run: async () => {
      const a = await seedLearningResources();
      const b = await seedLearningPaths();
      return { resources: a, paths: b };
    },
    countModel: 'learningResource',
    label: 'Learning resources + paths'
  },
  paths: { run: () => seedCareerPaths(), countModel: 'careerPathNode', label: 'Career path nodes' },
  'interview-questions': { run: () => seedInterviewQuestions(), countModel: 'interviewQuestion', label: 'Interview questions' },
  aptitude: { run: () => seedAptitudeQuestions(), countModel: 'aptitudeQuestion', label: 'Aptitude questions' },
  salary: {
    run: async () => {
      const a = await seedSalaryBenchmarks();
      const b = await seedCityCostOfLiving();
      return { benchmarks: a, cities: b };
    },
    countModel: 'salaryBenchmark',
    label: 'Salary benchmarks + cost of living'
  },
  startup: { run: () => seedStartupContent(), countModel: 'incubator', label: 'Startup decks + incubators + grants' },
  'biz-reg': { run: () => seedBizRegSteps(), countModel: 'bizRegStep', label: 'Business registration steps' }
};

router.get('/seed/status', async (req, res, next) => {
  try {
    const datasets = await Promise.all(
      Object.entries(DATASETS).map(async ([key, meta]) => {
        const currentCount = await (prisma as any)[meta.countModel].count();
        const lastRun = await prisma.auditLog.findFirst({
          where: { action: `data.seed.${key}` },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, actorId: true }
        });
        return { key, label: meta.label, currentCount, lastRunAt: lastRun?.createdAt ?? null };
      })
    );
    res.json({ success: true, data: { datasets } });
  } catch (e) { next(e); }
});

router.post('/seed/:dataset', async (req, res, next) => {
  try {
    const meta = DATASETS[req.params.dataset];
    if (!meta) {
      return res.status(404).json({ success: false, error: { code: 'UNKNOWN_DATASET', message: 'Unknown dataset' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: `data.seed.${req.params.dataset}`,
      targetType: 'dataset',
      targetId: req.params.dataset
    });
    const result = await meta.run();
    res.json({ success: true, data: { dataset: req.params.dataset, result } });
  } catch (e) { next(e); }
});

// Browse + delete (full CRUD per dataset is a v2 polish — these existing
// admin endpoints already cover create/update for every dataset that has
// one, and the seed re-run covers initial population).
const BROWSABLE: Record<string, { model: string; orderBy?: string }> = {
  skills: { model: 'skill', orderBy: 'name' },
  'role-profiles': { model: 'roleProfile', orderBy: 'name' },
  'learning-resources': { model: 'learningResource', orderBy: 'createdAt' },
  'learning-paths': { model: 'learningPath', orderBy: 'name' },
  'career-path-nodes': { model: 'careerPathNode' },
  'interview-questions': { model: 'interviewQuestion', orderBy: 'createdAt' },
  'aptitude-questions': { model: 'aptitudeQuestion', orderBy: 'createdAt' },
  'salary-benchmarks': { model: 'salaryBenchmark', orderBy: 'updatedAt' },
  'cost-of-living': { model: 'cityCostOfLiving', orderBy: 'city' },
  'startup-decks': { model: 'startupDeckTemplate', orderBy: 'name' },
  incubators: { model: 'incubator', orderBy: 'name' },
  grants: { model: 'grant' },
  'biz-reg-steps': { model: 'bizRegStep', orderBy: 'position' }
};

router.get('/:resource', async (req, res, next) => {
  try {
    const meta = BROWSABLE[req.params.resource];
    if (!meta) {
      return res.status(404).json({ success: false, error: { code: 'UNKNOWN_RESOURCE', message: 'Unknown resource' } });
    }
    const orderBy = meta.orderBy ? { [meta.orderBy]: meta.orderBy === 'createdAt' || meta.orderBy === 'updatedAt' ? 'desc' : 'asc' } : undefined;
    const items = await (prisma as any)[meta.model].findMany({ orderBy, take: 500 });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.delete('/:resource/:id', async (req, res, next) => {
  try {
    const meta = BROWSABLE[req.params.resource];
    if (!meta) {
      return res.status(404).json({ success: false, error: { code: 'UNKNOWN_RESOURCE', message: 'Unknown resource' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: `data.${req.params.resource}.deleted`,
      targetType: req.params.resource,
      targetId: req.params.id
    });
    await (prisma as any)[meta.model].delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { next(e); }
});

export default router;
