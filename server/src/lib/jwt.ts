import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';

export type { Role };
export type JwtPayload = { sub: string; role: Role };

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

export const signToken = (payload: JwtPayload) =>
  jwt.sign(payload, SECRET, { expiresIn: EXPIRES as any });

export const verifyToken = (token: string): JwtPayload =>
  jwt.verify(token, SECRET) as JwtPayload;
