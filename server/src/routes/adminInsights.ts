// Phase 4 of the superuser admin layer: Insights, Audit-log search,
// per-user activity timeline, and a universal "find anything" search
// across the most useful entity types in the platform.
//
// Mounted at /api/admin/insights. Every endpoint is gated by
// requireAuth + requireSuperuser so this is purely a read-side surface
// for the superuser console — no writes happen here.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireSuperuser);

// ---- helpers --------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function clampDays(raw: unknown, fallback = 30, max = 365): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

function dayKey(d: Date): string {
  // YYYY-MM-DD (UTC) — keeps the bucketing deterministic across server
  // tz boundaries and matches what the front-end will render.
  return d.toISOString().slice(0, 10);
}

function buildEmptyDayBuckets(days: number): Map<string, number> {
  const map = new Map<string, number>();
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * DAY_MS);
    map.set(dayKey(d), 0);
  }
  return map;
}

function bucketize(rows: { createdAt: Date }[], days: number): { date: string; count: number }[] {
  const buckets = buildEmptyDayBuckets(days);
  const since = new Date(Date.now() - days * DAY_MS);
  for (const r of rows) {
    if (r.createdAt < since) continue;
    const key = dayKey(r.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---- /usage ---------------------------------------------------------------

router.get('/usage', async (req, res, next) => {
  try {
    const days = clampDays(req.query.days, 30);
    const now = Date.now();
    const since = new Date(now - days * DAY_MS);
    const since24h = new Date(now - DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);
    const since30d = new Date(now - 30 * DAY_MS);

    const [
      activityRows,
      newUsers,
      applications,
      bookings,
      dauUsers,
      wauUsers,
      mauUsers
    ] = await Promise.all([
      prisma.careerToolsActivity.findMany({
        where: { createdAt: { gte: since } },
        select: { tool: true, userId: true, createdAt: true }
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true }
      }),
      prisma.application.findMany({
        where: { appliedAt: { gte: since } },
        select: { appliedAt: true }
      }),
      prisma.counselingBooking.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true }
      }),
      prisma.careerToolsActivity.findMany({
        where: { createdAt: { gte: since24h } },
        select: { userId: true },
        distinct: ['userId']
      }),
      prisma.careerToolsActivity.findMany({
        where: { createdAt: { gte: since7d } },
        select: { userId: true },
        distinct: ['userId']
      }),
      prisma.careerToolsActivity.findMany({
        where: { createdAt: { gte: since30d } },
        select: { userId: true },
        distinct: ['userId']
      })
    ]);

    // Per-tool aggregation: total opens + unique users.
    const perToolMap = new Map<string, { opens: number; users: Set<string> }>();
    for (const row of activityRows) {
      const cur = perToolMap.get(row.tool) ?? { opens: 0, users: new Set() };
      cur.opens += 1;
      cur.users.add(row.userId);
      perToolMap.set(row.tool, cur);
    }
    const perToolOpens = Array.from(perToolMap.entries())
      .map(([tool, v]) => ({ tool, opens: v.opens, uniqueUsers: v.users.size }))
      .sort((a, b) => b.opens - a.opens);

    res.json({
      success: true,
      data: {
        activeUsers: {
          dau: dauUsers.length,
          wau: wauUsers.length,
          mau: mauUsers.length
        },
        perToolOpens,
        newUsersByDay: bucketize(newUsers, days),
        applicationsByDay: bucketize(
          applications.map((a) => ({ createdAt: a.appliedAt })),
          days
        ),
        bookingsByDay: bucketize(bookings, days)
      }
    });
  } catch (e) {
    next(e);
  }
});

// ---- /audit ---------------------------------------------------------------

type AuditWhere = {
  actorId?: string;
  action?: { contains: string; mode: 'insensitive' };
  targetType?: string;
  createdAt?: { gte?: Date; lte?: Date };
};

function buildAuditWhere(q: Record<string, string | undefined>): AuditWhere {
  const where: AuditWhere = {};
  if (q.actorId) where.actorId = q.actorId;
  if (q.action) where.action = { contains: q.action, mode: 'insensitive' };
  if (q.targetType) where.targetType = q.targetType;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) {
      const d = new Date(q.from);
      if (!isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (q.to) {
      const d = new Date(q.to);
      if (!isNaN(d.getTime())) where.createdAt.lte = d;
    }
  }
  return where;
}

router.get('/audit', async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const where = buildAuditWhere(q);

    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '50', 10) || 50));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          metadata: r.metadata,
          actor: r.actor
        })),
        page,
        limit,
        total,
        pageCount: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (e) {
    next(e);
  }
});

router.get('/audit.csv', async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const where = buildAuditWhere(q);

    // Cap CSV at 10k rows so a runaway filter can't OOM the function.
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        actor: { select: { email: true } }
      }
    });

    const header = ['id', 'createdAt', 'actorEmail', 'action', 'targetType', 'targetId', 'metadata'];
    const lines: string[] = [header.join(',')];
    for (const r of rows) {
      lines.push([
        csvEscape(r.id),
        csvEscape(r.createdAt.toISOString()),
        csvEscape(r.actor?.email ?? ''),
        csvEscape(r.action),
        csvEscape(r.targetType ?? ''),
        csvEscape(r.targetId ?? ''),
        csvEscape(r.metadata ?? '')
      ].join(','));
    }

    const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
});

// ---- /user/:id/timeline ---------------------------------------------------

type TimelineItem =
  | { kind: 'activity'; id: string; createdAt: Date; tool: string; action: string; metadata: unknown }
  | { kind: 'login'; id: string; createdAt: Date; ip: string | null; userAgent: string | null; success: boolean }
  | {
      kind: 'audit';
      id: string;
      createdAt: Date;
      action: string;
      targetType: string | null;
      targetId: string | null;
      metadata: unknown;
    };

router.get('/user/:id/timeline', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isSuperuser: true,
        createdAt: true
      }
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    const [activity, logins, audits] = await Promise.all([
      prisma.careerToolsActivity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, tool: true, action: true, metadata: true, createdAt: true }
      }),
      prisma.loginEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, ip: true, userAgent: true, success: true, createdAt: true }
      }),
      prisma.auditLog.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, action: true, targetType: true, targetId: true,
          metadata: true, createdAt: true
        }
      })
    ]);

    const merged: TimelineItem[] = [
      ...activity.map((a): TimelineItem => ({
        kind: 'activity', id: a.id, createdAt: a.createdAt,
        tool: a.tool, action: a.action, metadata: a.metadata
      })),
      ...logins.map((l): TimelineItem => ({
        kind: 'login', id: l.id, createdAt: l.createdAt,
        ip: l.ip, userAgent: l.userAgent, success: l.success
      })),
      ...audits.map((a): TimelineItem => ({
        kind: 'audit', id: a.id, createdAt: a.createdAt,
        action: a.action, targetType: a.targetType, targetId: a.targetId,
        metadata: a.metadata
      }))
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({ success: true, data: { user, items: merged } });
  } catch (e) {
    next(e);
  }
});

// ---- /search --------------------------------------------------------------

type SearchHit = {
  kind: 'user' | 'opportunity' | 'application' | 'certification' | 'achievement' | 'transcript';
  id: string;
  label: string;
  sublabel: string;
  deepLink: string;
};

router.get('/search', async (req, res, next) => {
  try {
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const ci = { contains: q, mode: 'insensitive' as const };

    const [users, opportunities, applicationById, certs, achievements, transcripts] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { firstName: ci },
            { lastName: ci },
            { email: ci },
            { studentId: ci }
          ]
        },
        take: 5,
        select: {
          id: true, firstName: true, lastName: true, email: true,
          role: true, programme: true
        }
      }),
      prisma.opportunity.findMany({
        where: {
          OR: [{ title: ci }, { company: ci }]
        },
        take: 5,
        select: { id: true, title: true, company: true, location: true }
      }),
      prisma.application.findUnique({
        where: { id: q },
        select: {
          id: true, status: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          opportunity: { select: { title: true, company: true } }
        }
      }).catch(() => null),
      prisma.certification.findMany({
        where: {
          OR: [{ name: ci }, { publicSlug: ci }]
        },
        take: 5,
        select: {
          id: true, name: true, issuer: true, publicSlug: true,
          user: { select: { firstName: true, lastName: true } }
        }
      }),
      prisma.achievement.findMany({
        where: { title: ci },
        take: 5,
        select: {
          id: true, title: true, type: true,
          user: { select: { firstName: true, lastName: true } }
        }
      }),
      Promise.all([
        prisma.transcriptRequest.findUnique({
          where: { id: q },
          select: {
            id: true, type: true, status: true,
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }).catch(() => null),
        prisma.transcriptRequest.findUnique({
          where: { publicVerifyToken: q },
          select: {
            id: true, type: true, status: true,
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }).catch(() => null)
      ]).then(([byId, byToken]) => {
        const seen = new Set<string>();
        const out: NonNullable<typeof byId>[] = [];
        for (const t of [byId, byToken]) {
          if (t && !seen.has(t.id)) {
            seen.add(t.id);
            out.push(t);
          }
        }
        return out;
      })
    ]);

    const results: SearchHit[] = [];

    for (const u of users) {
      results.push({
        kind: 'user',
        id: u.id,
        label: `${u.firstName} ${u.lastName}`,
        sublabel: `${u.email} · ${u.role.toLowerCase()}${u.programme ? ` · ${u.programme}` : ''}`,
        deepLink: `/admin/users?focus=${encodeURIComponent(u.id)}`
      });
    }

    for (const o of opportunities) {
      results.push({
        kind: 'opportunity',
        id: o.id,
        label: o.title,
        sublabel: `${o.company} · ${o.location}`,
        deepLink: `/opportunities/${o.id}`
      });
    }

    if (applicationById) {
      const a = applicationById;
      results.push({
        kind: 'application',
        id: a.id,
        label: `Application · ${a.opportunity?.title ?? '(deleted)'}`,
        sublabel: `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''} · ${a.status.toLowerCase()}`,
        deepLink: `/applications/${a.id}`
      });
    }

    for (const c of certs) {
      results.push({
        kind: 'certification',
        id: c.id,
        label: c.name,
        sublabel: `${c.issuer}${c.user ? ` · ${c.user.firstName} ${c.user.lastName}` : ''}`,
        deepLink: c.publicSlug ? `/c/${c.publicSlug}` : `/career-tools/credentials`
      });
    }

    for (const a of achievements) {
      results.push({
        kind: 'achievement',
        id: a.id,
        label: a.title,
        sublabel: `${a.type.toLowerCase()}${a.user ? ` · ${a.user.firstName} ${a.user.lastName}` : ''}`,
        deepLink: `/achievements`
      });
    }

    for (const t of transcripts) {
      results.push({
        kind: 'transcript',
        id: t.id,
        label: `Transcript · ${t.type.toLowerCase()}`,
        sublabel: `${t.user?.firstName ?? ''} ${t.user?.lastName ?? ''} · ${t.status.toLowerCase()}`,
        deepLink: `/career-tools/transcripts`
      });
    }

    res.json({ success: true, data: results.slice(0, 25) });
  } catch (e) {
    next(e);
  }
});

export default router;
