// Phase 7 — Site config + broadcasts (minimal v1).
//
// All site-wide config lives as JSON blobs in the existing SiteContent
// table — no new schema. Feature flags are public-read so the client
// can fetch them without auth on first paint.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// --- helpers ---

async function readContent(key: string, fallback: any) {
  const row = await prisma.siteContent.findUnique({ where: { key } });
  return row?.data ?? fallback;
}

async function writeContent(key: string, data: any) {
  await prisma.siteContent.upsert({
    where: { key },
    create: { key, data },
    update: { data }
  });
}

// --- feature flags (public-read, superuser-write) ---

router.get('/feature-flags', async (_req, res, next) => {
  try {
    const data = await readContent('feature-flags', {});
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

const flagsSchema = z.object({
  flags: z.record(z.union([z.boolean(), z.string(), z.number()]))
});

router.put('/feature-flags', requireAuth, requireSuperuser, async (req, res, next) => {
  try {
    const { flags } = flagsSchema.parse(req.body);
    await logAudit({
      actorId: req.auth!.sub,
      action: 'site.feature_flags.updated',
      targetType: 'SiteContent',
      targetId: 'feature-flags',
      metadata: { count: Object.keys(flags).length }
    });
    await writeContent('feature-flags', flags);
    res.json({ success: true, data: flags });
  } catch (e) { next(e); }
});

// --- broadcast (superuser only) ---

const broadcastAudienceSchema = z.object({
  roles: z.array(z.enum(['STUDENT', 'ALUMNI', 'EMPLOYER', 'ADMIN'])).optional(),
  programmes: z.array(z.string()).optional(),
  gradYearMin: z.number().int().optional(),
  gradYearMax: z.number().int().optional()
});

const broadcastSchema = z.object({
  title: z.string().min(2).max(200),
  message: z.string().min(2).max(2000),
  link: z.string().url().optional(),
  audience: broadcastAudienceSchema
});

const previewSchema = z.object({ audience: broadcastAudienceSchema });

const BROADCAST_CAP = 10000;

function audienceToWhere(audience: z.infer<typeof broadcastAudienceSchema>) {
  const where: any = { deletedAt: null, suspendedAt: null };
  if (audience.roles && audience.roles.length > 0) where.role = { in: audience.roles };
  if (audience.programmes && audience.programmes.length > 0) where.programme = { in: audience.programmes };
  if (audience.gradYearMin != null || audience.gradYearMax != null) {
    where.graduationYear = {};
    if (audience.gradYearMin != null) where.graduationYear.gte = audience.gradYearMin;
    if (audience.gradYearMax != null) where.graduationYear.lte = audience.gradYearMax;
  }
  return where;
}

router.post('/broadcast/preview', requireAuth, requireSuperuser, async (req, res, next) => {
  try {
    const { audience } = previewSchema.parse(req.body);
    const where = audienceToWhere(audience);
    const [count, sample] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true, programme: true, graduationYear: true, role: true }
      })
    ]);
    res.json({ success: true, data: { count, sample, capExceeded: count > BROADCAST_CAP, cap: BROADCAST_CAP } });
  } catch (e) { next(e); }
});

router.post('/broadcast', requireAuth, requireSuperuser, async (req, res, next) => {
  try {
    const body = broadcastSchema.parse(req.body);
    const where = audienceToWhere(body.audience);
    const recipients = await prisma.user.findMany({ where, select: { id: true } });
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'EMPTY_AUDIENCE', message: 'No recipients match these filters.' } });
    }
    if (recipients.length > BROADCAST_CAP) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUDIENCE_TOO_LARGE', message: `Audience of ${recipients.length} exceeds cap of ${BROADCAST_CAP}. Narrow the filters.` }
      });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'site.broadcast.sent',
      metadata: { recipientCount: recipients.length, audience: body.audience, title: body.title }
    });
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        type: 'ANNOUNCEMENT' as const,
        title: body.title,
        message: body.message,
        link: body.link ?? null
      }))
    });
    res.json({ success: true, data: { recipientCount: recipients.length } });
  } catch (e) { next(e); }
});

// --- nav-config + email-templates: stored but not yet read by the rest of the app ---

router.get('/nav-config', async (_req, res, next) => {
  try {
    const data = await readContent('nav-config', { navbar: [], mobileTabs: [] });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

const navItemSchema = z.object({
  to: z.string().min(1),
  label: z.string().min(1),
  hideForRoles: z.array(z.enum(['STUDENT', 'ALUMNI', 'EMPLOYER', 'ADMIN'])).optional()
});

const navConfigSchema = z.object({
  navbar: z.array(navItemSchema),
  mobileTabs: z.array(navItemSchema)
});

router.put('/nav-config', requireAuth, requireSuperuser, async (req, res, next) => {
  try {
    const config = navConfigSchema.parse(req.body);
    await logAudit({
      actorId: req.auth!.sub,
      action: 'site.nav_config.updated',
      targetType: 'SiteContent',
      targetId: 'nav-config'
    });
    await writeContent('nav-config', config);
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

router.get('/email-templates', requireAuth, requireSuperuser, async (_req, res, next) => {
  try {
    const data = await readContent('email-templates', {});
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

const emailTemplatesSchema = z.object({
  templates: z.record(z.object({ subject: z.string(), body: z.string() }))
});

router.put('/email-templates', requireAuth, requireSuperuser, async (req, res, next) => {
  try {
    const { templates } = emailTemplatesSchema.parse(req.body);
    await logAudit({
      actorId: req.auth!.sub,
      action: 'site.email_templates.updated',
      targetType: 'SiteContent',
      targetId: 'email-templates',
      metadata: { count: Object.keys(templates).length }
    });
    await writeContent('email-templates', templates);
    res.json({ success: true, data: templates });
  } catch (e) { next(e); }
});

export default router;
