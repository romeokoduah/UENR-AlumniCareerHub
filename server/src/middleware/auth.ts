import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload, type Role } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

// Cached row from the requireAuth lookup — downstream handlers can read
// `req.auth.userRow` to skip a redundant DB hit when they only need
// suspendedAt / deletedAt / tokenVersion / role.
type CachedUserRow = {
  suspendedAt: Date | null;
  deletedAt: Date | null;
  tokenVersion: number;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload & { userRow?: CachedUserRow };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'Missing token' } });
  }
  let payload: JwtPayload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
  }

  // Phase 2: refuse tokens whose user has been suspended, soft-deleted,
  // or whose tokenVersion has been bumped (force-logout / password
  // reset). One small Prisma read per request — worth the perf cost
  // because the alternative is letting suspended users keep posting until
  // their JWT expires.
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { suspendedAt: true, deletedAt: true, tokenVersion: true, role: true }
    });
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Account no longer exists' } });
    }
    if (user.deletedAt !== null) {
      return res.status(401).json({ success: false, error: { code: 'USER_DELETED', message: 'Account has been deleted' } });
    }
    if (user.suspendedAt !== null) {
      return res.status(403).json({ success: false, error: { code: 'USER_SUSPENDED', message: 'Account is suspended' } });
    }
    // Pre-existing tokens (signed before this column existed) won't carry
    // a `ver` claim — treat that as 0 to keep them working until they
    // naturally expire, matching the User.tokenVersion default.
    if (payload.ver != null && payload.ver !== user.tokenVersion) {
      return res.status(401).json({ success: false, error: { code: 'TOKEN_REVOKED', message: 'Session was revoked. Please sign in again.' } });
    }
    req.auth = { ...payload, userRow: user };
    next();
  } catch (e) { next(e); }
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
