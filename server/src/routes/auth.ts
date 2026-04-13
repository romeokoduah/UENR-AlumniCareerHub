import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { deserialize } from '../lib/serialize.js';

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

    const token = signToken({ sub: user.id, role: user.role as any });
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
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const token = signToken({ sub: user.id, role: user.role as any });
    res.json({ success: true, data: { token, user: sanitizeUser(user) } });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    res.json({ success: true, data: sanitizeUser(user) });
  } catch (e) { next(e); }
});

function sanitizeUser(u: any) {
  const { passwordHash, ...rest } = u;
  return deserialize(rest);
}

export default router;
