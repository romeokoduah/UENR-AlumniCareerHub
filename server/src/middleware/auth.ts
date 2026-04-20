import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload, type Role } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'Missing token' } });
  }
  try {
    req.auth = verifyToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
  }
}

export const requireRole = (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };

// Superuser gate. Resolves the flag from the database rather than the JWT
// so that promote/demote takes effect immediately without forcing a
// re-login, and so that pre-existing tokens (signed before this column
// existed) keep working.
export async function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'Missing token' } });
  }
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.auth.sub },
      select: { isSuperuser: true, role: true }
    });
    if (!u || !u.isSuperuser || u.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_SUPERUSER', message: 'Superuser privileges required' }
      });
    }
    next();
  } catch (e) { next(e); }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try { req.auth = verifyToken(header.slice(7)); } catch {}
  }
  next();
}
