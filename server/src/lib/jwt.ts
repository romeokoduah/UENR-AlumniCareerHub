import jwt from 'jsonwebtoken';

export type Role = 'STUDENT' | 'ALUMNI' | 'EMPLOYER' | 'ADMIN';
export type JwtPayload = { sub: string; role: Role };

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

export const signToken = (payload: JwtPayload) =>
  jwt.sign(payload, SECRET, { expiresIn: EXPIRES as any });

export const verifyToken = (token: string): JwtPayload =>
  jwt.verify(token, SECRET) as JwtPayload;
