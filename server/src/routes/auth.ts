import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['STUDENT', 'ALUMNI', 'EMPLOYER']).default('STUDENT'),
  programme: z.string().optional(),
  graduationYear: z.number().int().optional(),
  studentId: z.string().optional()
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof registerSchema>;
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        programme: data.programme,
        graduationYear: data.graduationYear,
        studentId: data.studentId,
        isApproved: data.role === 'STUDENT'
      }
    });

    const token = signToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
    res.status(201).json({
      success: true,
      data: { token, user: sanitizeUser(user) }
    });
  } catch (e) { next(e); }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').slice(0, 45);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Best-effort: record failed attempts against any matching account
      // for audit; if there's no account at all, no row to attribute it to.
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    // Phase 2: refuse soft-deleted + suspended accounts at the door so
    // they can't even attempt to authenticate. Anonymised soft-deleted
    // accounts keep their (random) hash, so a credentials check would
    // always fail anyway — but explicit codes make UI handling cleaner.
    if (user.deletedAt !== null) {
      throw new AppError(401, 'USER_DELETED', 'Account has been deleted');
    }
    if (user.suspendedAt !== null) {
      throw new AppError(403, 'USER_SUSPENDED', 'Account is suspended. Contact an administrator.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    prisma.loginEvent.create({
      data: { userId: user.id, ip, userAgent, success: ok }
    }).catch(() => { /* best-effort */ });
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const token = signToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
    res.json({ success: true, data: { token, user: sanitizeUser(user) } });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    // Surface the impersonation context on /me so the client can render
    // the "Impersonating ..." banner without having to decode the JWT
    // itself. We re-read the token from the Authorization header (already
    // verified by requireAuth) to pull the optional actingAs claim.
    const header = req.headers.authorization || '';
    let actingAs: { adminId: string } | undefined;
    if (header.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(header.slice(7));
        if (decoded.actingAs) actingAs = decoded.actingAs;
      } catch { /* ignore — requireAuth already validated */ }
    }
    res.json({ success: true, data: { ...sanitizeUser(user), actingAs } });
  } catch (e) { next(e); }
});

// Public password reset — looks up a user by their reset token, checks
// expiry, hashes the new password, and bumps tokenVersion so any other
// active sessions for that user are invalidated. NOT audited because
// there's no signed-in actor at the point of call.
const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8)
});

router.post('/reset-password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body as z.infer<typeof resetPasswordSchema>;
    const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new AppError(400, 'INVALID_OR_EXPIRED', 'Reset link is invalid or has expired');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        tokenVersion: { increment: 1 }
      }
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// End impersonation — when an admin is currently impersonating someone,
// their JWT carries `actingAs.adminId`. This endpoint mints a fresh token
// for that originating admin so they can drop straight back to their own
// account without re-logging-in.
router.post('/end-impersonation', requireAuth, async (req, res, next) => {
  try {
    const acting = req.auth?.actingAs;
    if (!acting) {
      throw new AppError(400, 'NOT_IMPERSONATING', 'Current session is not an impersonation');
    }
    const admin = await prisma.user.findUnique({ where: { id: acting.adminId } });
    if (!admin) {
      throw new AppError(404, 'ADMIN_NOT_FOUND', 'Originating admin no longer exists');
    }
    if (admin.deletedAt !== null || admin.suspendedAt !== null) {
      throw new AppError(403, 'ADMIN_INACCESSIBLE', 'Originating admin can no longer sign in');
    }
    const token = signToken({ sub: admin.id, role: admin.role, ver: admin.tokenVersion });
    res.json({ success: true, data: { token, user: sanitizeUser(admin) } });
  } catch (e) { next(e); }
});

function sanitizeUser(u: any) {
  const { passwordHash, passwordResetToken, passwordResetExpiresAt, ...rest } = u;
  return rest;
}

export default router;
