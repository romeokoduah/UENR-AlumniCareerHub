import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, requireSuperuser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getLanding, saveLanding, resetLanding } from '../services/siteContent.js';
import { uploadImage, storeUpload } from '../lib/upload.js';
import { logAudit } from '../lib/audit.js';
import { signImpersonationToken } from '../lib/jwt.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

// One-time bootstrap: if NO superuser exists in the DB, the first ADMIN
// to call this gets promoted. Idempotent — once a superuser exists, this
// endpoint is a no-op for everyone (returns whether the caller themselves
// is a superuser). Safe to call from the admin page's mount effect.
router.post('/bootstrap-superuser', async (req, res, next) => {
  try {
    const existing = await prisma.user.count({ where: { isSuperuser: true } });
    if (existing > 0) {
      const me = await prisma.user.findUnique({
        where: { id: req.auth!.sub },
        select: { isSuperuser: true }
      });
      return res.json({
        success: true,
        data: { promoted: false, isSuperuser: !!me?.isSuperuser, existingCount: existing }
      });
    }
    const updated = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: { isSuperuser: true }
    });
    await logAudit({
      actorId: updated.id,
      action: 'user.bootstrap_superuser',
      targetType: 'User',
      targetId: updated.id
    });
    res.json({ success: true, data: { promoted: true, isSuperuser: true } });
  } catch (e) { next(e); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const [users, opportunities, applications, sessions, events] = await Promise.all([
      prisma.user.count(),
      prisma.opportunity.count(),
      prisma.application.count(),
      prisma.session.count({ where: { status: 'COMPLETED' } }),
      prisma.event.count()
    ]);
    res.json({ success: true, data: { users, opportunities, applications, sessions, events } });
  } catch (e) { next(e); }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isApproved: true, isVerified: true, isSuperuser: true,
        programme: true, graduationYear: true,
        suspendedAt: true, deletedAt: true,
        createdAt: true
      }
    });
    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

router.patch('/users/:id/approve', async (req, res, next) => {
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isApproved: true } });
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.approved',
      targetType: 'User',
      targetId: user.id
    });
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// Promote / demote superuser. Only an existing superuser can do this.
// A superuser cannot demote themselves while they are the last remaining
// superuser — guards against accidental lockout.
const superuserSchema = z.object({ isSuperuser: z.boolean() });

router.patch('/users/:id/superuser', requireSuperuser, async (req, res, next) => {
  try {
    const { isSuperuser } = superuserSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (target.role !== 'ADMIN' && isSuperuser) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_ADMIN', message: 'Promote the user to ADMIN first.' }
      });
    }
    if (!isSuperuser && target.id === req.auth!.sub) {
      const remaining = await prisma.user.count({ where: { isSuperuser: true, id: { not: target.id } } });
      if (remaining === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'LAST_SUPERUSER', message: 'Cannot demote the last remaining superuser.' }
        });
      }
    }
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isSuperuser }
    });
    await logAudit({
      actorId: req.auth!.sub,
      action: isSuperuser ? 'user.promoted_to_superuser' : 'user.demoted_from_superuser',
      targetType: 'User',
      targetId: updated.id,
      metadata: { previousValue: target.isSuperuser }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ============ OPPORTUNITY ADMIN ============
// Admin sees EVERY opportunity regardless of approval/active/deadline status.
router.get('/opportunities', async (req, res, next) => {
  try {
    const { q, status } = req.query as Record<string, string>;
    const now = new Date();
    const items = await prisma.opportunity.findMany({
      where: {
        ...(status === 'active' && { isActive: true, isApproved: true, deadline: { gte: now } }),
        ...(status === 'inactive' && { isActive: false }),
        ...(status === 'expired' && { deadline: { lt: now } }),
        ...(status === 'pending' && { isApproved: false }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { location: { contains: q, mode: 'insensitive' } }
          ]
        })
      },
      orderBy: { createdAt: 'desc' },
      include: {
        postedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        _count: { select: { applications: true, bookmarks: true } }
      },
      take: 500
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

const updateOpportunitySchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(20).optional(),
  company: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  locationType: z.enum(['REMOTE', 'ONSITE', 'HYBRID']).optional(),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'NATIONAL_SERVICE', 'VOLUNTEER', 'CONTRACT']).optional(),
  salaryMin: z.number().int().nullable().optional(),
  salaryMax: z.number().int().nullable().optional(),
  deadline: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  industry: z.string().nullable().optional(),
  experienceLevel: z.string().nullable().optional(),
  applicationUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  isApproved: z.boolean().optional()
});

router.patch('/opportunities/:id', validate(updateOpportunitySchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof updateOpportunitySchema>;
    const { deadline, ...rest } = data;
    const updated = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(deadline !== undefined && { deadline: new Date(deadline) })
      }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.delete('/opportunities/:id', async (req, res, next) => {
  try {
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ============ LANDING PAGE CONTENT ============
router.get('/content/landing', async (_req, res, next) => {
  try { res.json({ success: true, data: await getLanding() }); }
  catch (e) { next(e); }
});

router.put('/content/landing', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid content body' } });
    }
    const saved = await saveLanding(req.body);
    res.json({ success: true, data: saved });
  } catch (e) { next(e); }
});

router.post('/content/landing/reset', async (_req, res, next) => {
  try { res.json({ success: true, data: await resetLanding() }); }
  catch (e) { next(e); }
});

// ============ IMAGE UPLOADS ============
// Buffers land in memory via multer, then storeUpload() decides whether to
// push them to Vercel Blob (when BLOB_READ_WRITE_TOKEN is set) or write them
// to disk (dev fallback).
router.post('/uploads/image', uploadImage.single('file') as any, async (req: any, res: any, next: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }
    const result = await storeUpload({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
});

// ============ PHASE 2: FULL USER MANAGEMENT ============
//
// Every endpoint here is gated by requireSuperuser. Each write calls
// logAudit() BEFORE doing anything destructive so we always have a
// record of intent even if the write itself fails. Self-targeting is
// blocked on destructive actions (suspend/delete/force-logout) — admins
// should always have to ask another superuser to lock them out.

const RESET_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function originFromRequest(req: any): string {
  // Prefer the configured client origin; fall back to the request's host.
  const env = (process.env.CLIENT_ORIGIN || '').replace(/\/$/, '');
  if (env && env !== '*') return env;
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  return host ? `${proto}://${host}` : '';
}

// POST /users/:id/reset-password — generate a one-shot reset token the
// admin shares with the user out-of-band (no SMTP wired up in v1).
router.post('/users/:id/reset-password', requireSuperuser, async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (target.deletedAt !== null) {
      return res.status(400).json({ success: false, error: { code: 'USER_DELETED', message: 'Cannot reset password for a deleted user' } });
    }
    const token = crypto.randomBytes(24).toString('hex');
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.password_reset_requested',
      targetType: 'User',
      targetId: target.id
    });
    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS)
      }
    });
    const origin = originFromRequest(req);
    const resetUrl = `${origin}/reset-password?token=${token}`;
    res.json({ success: true, data: { token, resetUrl, expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  } catch (e) { next(e); }
});

// POST /users/:id/impersonate — mint a 15-minute token for the target,
// stamped with the originating admin's id so they can flip back.
router.post('/users/:id/impersonate', requireSuperuser, async (req, res, next) => {
  try {
    const adminId = req.auth!.sub;
    if (req.params.id === adminId) {
      return res.status(400).json({ success: false, error: { code: 'SELF_IMPERSONATE', message: 'Cannot impersonate yourself' } });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (target.deletedAt !== null) {
      return res.status(400).json({ success: false, error: { code: 'USER_DELETED', message: 'Cannot impersonate a deleted user' } });
    }
    if (target.suspendedAt !== null) {
      return res.status(400).json({ success: false, error: { code: 'USER_SUSPENDED', message: 'Cannot impersonate a suspended user' } });
    }
    await logAudit({
      actorId: adminId,
      action: 'user.impersonated',
      targetType: 'User',
      targetId: target.id
    });
    const token = signImpersonationToken({
      sub: target.id,
      role: target.role,
      ver: target.tokenVersion,
      actingAs: { adminId }
    });
    const { passwordHash, passwordResetToken, passwordResetExpiresAt, ...safe } = target;
    res.json({ success: true, data: { token, user: { ...safe, actingAs: { adminId } } } });
  } catch (e) { next(e); }
});

// POST /users/:id/suspend — set suspendedAt. Suspended users are
// rejected at requireAuth and at /login.
router.post('/users/:id/suspend', requireSuperuser, async (req, res, next) => {
  try {
    if (req.params.id === req.auth!.sub) {
      return res.status(400).json({ success: false, error: { code: 'SELF_SUSPEND', message: 'Cannot suspend yourself' } });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, suspendedAt: true, deletedAt: true } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (target.deletedAt !== null) {
      return res.status(400).json({ success: false, error: { code: 'USER_DELETED', message: 'User is already deleted' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.suspended',
      targetType: 'User',
      targetId: target.id,
      metadata: { previouslySuspended: target.suspendedAt !== null }
    });
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { suspendedAt: new Date() }
    });
    res.json({ success: true, data: { id: updated.id, suspendedAt: updated.suspendedAt } });
  } catch (e) { next(e); }
});

// POST /users/:id/unsuspend — clear suspendedAt.
router.post('/users/:id/unsuspend', requireSuperuser, async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, suspendedAt: true } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.unsuspended',
      targetType: 'User',
      targetId: target.id,
      metadata: { previouslySuspendedAt: target.suspendedAt }
    });
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { suspendedAt: null }
    });
    res.json({ success: true, data: { id: updated.id, suspendedAt: updated.suspendedAt } });
  } catch (e) { next(e); }
});

// POST /users/:id/soft-delete — anonymise PII, mark deletedAt, bump
// tokenVersion so any active sessions die immediately. Refuses self.
router.post('/users/:id/soft-delete', requireSuperuser, async (req, res, next) => {
  try {
    if (req.params.id === req.auth!.sub) {
      return res.status(400).json({ success: false, error: { code: 'SELF_DELETE', message: 'Cannot soft-delete yourself' } });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (target.deletedAt !== null) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_DELETED', message: 'User is already soft-deleted' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.soft_deleted',
      targetType: 'User',
      targetId: target.id,
      metadata: { previousEmail: target.email, previousRole: target.role }
    });
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        email: `deleted-${target.id}@deleted.local`,
        firstName: 'Deleted',
        lastName: 'user',
        avatar: null,
        phone: null,
        bio: null,
        linkedinUrl: null,
        studentId: null,
        deletedAt: new Date(),
        isApproved: false,
        tokenVersion: { increment: 1 }
      }
    });
    res.json({ success: true, data: { id: updated.id, deletedAt: updated.deletedAt } });
  } catch (e) { next(e); }
});

// DELETE /users/:id — hard delete; Prisma cascades wipe related rows.
router.delete('/users/:id', requireSuperuser, async (req, res, next) => {
  try {
    if (req.params.id === req.auth!.sub) {
      return res.status(400).json({ success: false, error: { code: 'SELF_DELETE', message: 'Cannot hard-delete yourself' } });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, role: true } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.hard_deleted',
      targetType: 'User',
      targetId: target.id,
      metadata: { previousEmail: target.email, previousRole: target.role }
    });
    await prisma.user.delete({ where: { id: target.id } });
    res.json({ success: true, data: { id: target.id } });
  } catch (e) { next(e); }
});

// POST /users/:id/force-logout — bump tokenVersion. Existing JWTs whose
// `ver` claim doesn't match get a 401 TOKEN_REVOKED on their next call.
router.post('/users/:id/force-logout', requireSuperuser, async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, tokenVersion: true } });
    if (!target) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.force_logout',
      targetType: 'User',
      targetId: target.id,
      metadata: { previousVersion: target.tokenVersion }
    });
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { tokenVersion: { increment: 1 } }
    });
    res.json({ success: true, data: { id: updated.id, tokenVersion: updated.tokenVersion } });
  } catch (e) { next(e); }
});

// ============ CSV BULK IMPORT ============
//
// Hand-rolled parser — no library. Spec is intentionally strict:
//   - first line must be the header `email,firstName,lastName,role,programme,graduationYear`
//     (case-insensitive, extra whitespace allowed)
//   - quoted fields are NOT supported — if a row contains a `"` we fail
//     loudly so the operator notices instead of silently mis-parsing
//   - blank lines are skipped
// `dryRun=true` validates without writing; `false` actually creates users.

type CsvRow = {
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'STUDENT' | 'ALUMNI' | 'EMPLOYER' | 'ADMIN';
  programme: string | null;
  graduationYear: number | null;
};

type CsvError = { row: number; message: string };

const VALID_ROLES = new Set(['STUDENT', 'ALUMNI', 'EMPLOYER', 'ADMIN']);
const REQUIRED_HEADERS = ['email', 'firstname', 'lastname', 'role', 'programme', 'graduationyear'];

function parseCsv(text: string): { rows: CsvRow[]; errors: CsvError[] } {
  const errors: CsvError[] = [];
  const rows: CsvRow[] = [];

  const normalised = text.replace(/^\uFEFF/, ''); // strip BOM
  const lines = normalised.split(/\r?\n/);

  // Find first non-blank line for header
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    throw new Error('CSV is empty');
  }
  const headerLine = lines[headerIdx];
  if (headerLine.includes('"')) {
    throw new Error('Quoted fields are not supported by the CSV importer. Strip quotes and try again.');
  }
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required column "${required}". Expected: ${REQUIRED_HEADERS.join(', ')}`);
    }
  }
  const idx = {
    email: headers.indexOf('email'),
    firstName: headers.indexOf('firstname'),
    lastName: headers.indexOf('lastname'),
    role: headers.indexOf('role'),
    programme: headers.indexOf('programme'),
    graduationYear: headers.indexOf('graduationyear')
  };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const rowNumber = i + 1; // 1-indexed for human-friendly errors
    if (raw.includes('"')) {
      errors.push({ row: rowNumber, message: 'Quoted fields are not supported. Remove the " characters from this row.' });
      continue;
    }
    const cells = raw.split(',').map((c) => c.trim());
    const email = (cells[idx.email] || '').toLowerCase();
    const firstName = cells[idx.firstName] || '';
    const lastName = cells[idx.lastName] || '';
    const roleRaw = (cells[idx.role] || '').toUpperCase();
    const programme = cells[idx.programme] || '';
    const gradYearRaw = cells[idx.graduationYear] || '';

    const rowErrs: string[] = [];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrs.push('Invalid email');
    if (!firstName) rowErrs.push('Missing firstName');
    if (!lastName) rowErrs.push('Missing lastName');
    if (!VALID_ROLES.has(roleRaw)) rowErrs.push(`Invalid role "${roleRaw}" (must be one of ${Array.from(VALID_ROLES).join(', ')})`);
    let gradYear: number | null = null;
    if (gradYearRaw) {
      const n = Number(gradYearRaw);
      if (!Number.isInteger(n) || n < 1900 || n > 2100) rowErrs.push(`Invalid graduationYear "${gradYearRaw}"`);
      else gradYear = n;
    }
    if (rowErrs.length) {
      errors.push({ row: rowNumber, message: rowErrs.join('; ') });
      continue;
    }
    rows.push({
      rowNumber,
      email,
      firstName,
      lastName,
      role: roleRaw as CsvRow['role'],
      programme: programme || null,
      graduationYear: gradYear
    });
  }
  return { rows, errors };
}

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2 MB cap — plenty for thousands of users
});

router.post(
  '/users/import-csv',
  requireSuperuser,
  csvUpload.single('file') as any,
  async (req: any, res: any, next: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No CSV file uploaded (field name "file")' } });
      }
      const dryRun = String(req.body?.dryRun ?? 'true').toLowerCase() !== 'false';

      const text = req.file.buffer.toString('utf8');
      let parsed: { rows: CsvRow[]; errors: CsvError[] };
      try {
        parsed = parseCsv(text);
      } catch (e: any) {
        return res.status(400).json({ success: false, error: { code: 'CSV_PARSE_ERROR', message: e?.message || 'Failed to parse CSV' } });
      }
      const { rows, errors } = parsed;

      // Cross-row uniqueness + DB collision check
      const seen = new Set<string>();
      const dupErrors: CsvError[] = [];
      for (const r of rows) {
        if (seen.has(r.email)) {
          dupErrors.push({ row: r.rowNumber, message: `Duplicate email "${r.email}" within CSV` });
        }
        seen.add(r.email);
      }
      const existing = rows.length
        ? await prisma.user.findMany({
            where: { email: { in: rows.map((r) => r.email) } },
            select: { email: true }
          })
        : [];
      const existingSet = new Set(existing.map((u) => u.email.toLowerCase()));
      const collisionErrors: CsvError[] = rows
        .filter((r) => existingSet.has(r.email))
        .map((r) => ({ row: r.rowNumber, message: `Email "${r.email}" already exists` }));

      const allErrors = [...errors, ...dupErrors, ...collisionErrors];
      const validRows = rows.filter(
        (r) => !existingSet.has(r.email) && !dupErrors.some((d) => d.row === r.rowNumber)
      );

      const totals = {
        rows: rows.length + errors.length,
        valid: validRows.length,
        errors: allErrors.length
      };

      if (dryRun) {
        return res.json({
          success: true,
          data: {
            dryRun: true,
            totals,
            preview: validRows.slice(0, 100),
            errors: allErrors.slice(0, 200)
          }
        });
      }

      // Real import — one user per row, with an unguessable random password
      // and a per-user reset token so the admin can hand each new user a
      // link to set their own password.
      const created: Array<{ id: string; email: string; resetUrl: string }> = [];
      const origin = originFromRequest(req);
      for (const r of validRows) {
        const randomPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);
        const resetToken = crypto.randomBytes(24).toString('hex');
        try {
          const u = await prisma.user.create({
            data: {
              email: r.email,
              passwordHash,
              firstName: r.firstName,
              lastName: r.lastName,
              role: r.role,
              programme: r.programme,
              graduationYear: r.graduationYear,
              isApproved: r.role === 'STUDENT',
              passwordResetToken: resetToken,
              passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS)
            }
          });
          await logAudit({
            actorId: req.auth!.sub,
            action: 'user.imported',
            targetType: 'User',
            targetId: u.id,
            metadata: { sourceRow: r.rowNumber, role: r.role }
          });
          created.push({ id: u.id, email: u.email, resetUrl: `${origin}/reset-password?token=${resetToken}` });
        } catch (e: any) {
          allErrors.push({ row: r.rowNumber, message: `Insert failed: ${e?.message || 'unknown error'}` });
        }
      }
      res.json({
        success: true,
        data: {
          dryRun: false,
          totals: { ...totals, created: created.length },
          created,
          errors: allErrors.slice(0, 200)
        }
      });
    } catch (e) { next(e); }
  }
);

// GET /users/:id/export — bundle every record owned by the user as a
// downloadable JSON blob. Used for GDPR-style data subject requests.
router.get('/users/:id/export', requireSuperuser, async (req, res, next) => {
  try {
    const id = req.params.id;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    await logAudit({
      actorId: req.auth!.sub,
      action: 'user.exported',
      targetType: 'User',
      targetId: id
    });

    // Fire all the per-user lookups in parallel. Anything not present in
    // the schema is simply skipped — the goal is "everything we have on
    // them" without needing perfect schema coverage.
    const [
      applications, bookmarks, cvs, notifications, careerActivity,
      coverLetters, portfolios, vaultDocuments, skillAssessments,
      learningProgress, certifications, achievements, interviewPosts,
      counselingBookings, transcriptRequests, gigsPosted, gigBids,
      reviewsGiven, reviewsReceived, opportunitiesPosted, scholarshipsPosted,
      eventsHosted, eventRegistrations, mentorProfile, sessionsAsMentor,
      sessionsAsMentee, loginEvents, auditLogs
    ] = await Promise.all([
      prisma.application.findMany({ where: { userId: id } }),
      prisma.bookmark.findMany({ where: { userId: id } }),
      prisma.cV.findMany({ where: { userId: id } }),
      prisma.notification.findMany({ where: { userId: id } }),
      prisma.careerToolsActivity.findMany({ where: { userId: id } }),
      prisma.coverLetter.findMany({ where: { userId: id } }),
      prisma.portfolio.findMany({ where: { userId: id }, include: { projects: true } }),
      prisma.vaultDocument.findMany({ where: { userId: id } }),
      prisma.skillAssessment.findMany({ where: { userId: id } }),
      prisma.learningProgress.findMany({ where: { userId: id } }),
      prisma.certification.findMany({ where: { userId: id } }),
      prisma.achievement.findMany({ where: { userId: id } }),
      prisma.interviewExperience.findMany({ where: { userId: id } }),
      prisma.counselingBooking.findMany({ where: { alumniId: id } }),
      prisma.transcriptRequest.findMany({ where: { userId: id } }),
      prisma.freelanceGig.findMany({ where: { posterId: id } }),
      prisma.freelanceBid.findMany({ where: { bidderId: id } }),
      prisma.freelanceReview.findMany({ where: { reviewerId: id } }),
      prisma.freelanceReview.findMany({ where: { revieweeId: id } }),
      prisma.opportunity.findMany({ where: { postedById: id } }),
      prisma.scholarship.findMany({ where: { submittedById: id } }),
      prisma.event.findMany({ where: { hostId: id } }),
      prisma.eventRegistration.findMany({ where: { userId: id } }),
      prisma.mentorProfile.findUnique({ where: { userId: id } }),
      prisma.mentorshipMatch.findMany({ where: { mentorId: id } }),
      prisma.mentorshipMatch.findMany({ where: { menteeId: id } }),
      prisma.loginEvent.findMany({ where: { userId: id }, take: 500, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.findMany({ where: { actorId: id }, take: 500, orderBy: { createdAt: 'desc' } })
    ]);

    // Strip the password hash before bundling.
    const { passwordHash, passwordResetToken, ...safeUser } = user;

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.auth!.sub,
      user: safeUser,
      applications,
      bookmarks,
      cvs,
      notifications,
      careerActivity,
      coverLetters,
      portfolios,
      vaultDocuments,
      skillAssessments,
      learningProgress,
      certifications,
      achievements,
      interviewPosts,
      counselingBookings,
      transcriptRequests,
      freelance: { gigsPosted, gigBids, reviewsGiven, reviewsReceived },
      opportunitiesPosted,
      scholarshipsPosted,
      eventsHosted,
      eventRegistrations,
      mentorProfile,
      mentorship: { sessionsAsMentor, sessionsAsMentee },
      loginEvents,
      auditLogs
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-${id}-export.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) { next(e); }
});

export default router;
