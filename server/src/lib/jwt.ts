import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';

export type { Role };
// Phase 2 (superuser admin): JWTs now optionally carry a `ver` field so we
// can revoke every existing token for a user by bumping their stored
// tokenVersion (force-logout-everywhere, soft-delete, password reset).
// `actingAs` is set when an admin impersonates someone — the token's `sub`
// is the impersonated user, but we remember which admin started the
// session so they can drop back to themselves with one click.
export type JwtPayload = {
  sub: string;
  role: Role;
  ver?: number;
  actingAs?: { adminId: string };
};

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// Impersonation tokens are intentionally short-lived so a forgotten tab
// can't be used to camp on someone else's account indefinitely.
const IMPERSONATION_EXPIRES = '15m';

export const signToken = (payload: JwtPayload, opts?: { expiresIn?: string }) =>
  jwt.sign(payload, SECRET, {
    expiresIn: (opts?.expiresIn || EXPIRES) as any
  });

export const signImpersonationToken = (payload: JwtPayload) =>
  signToken(payload, { expiresIn: IMPERSONATION_EXPIRES });

export const verifyToken = (token: string): JwtPayload =>
  jwt.verify(token, SECRET) as JwtPayload;
