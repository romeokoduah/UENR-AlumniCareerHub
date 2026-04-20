import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { prisma } from '../lib/prisma.js';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() }
    });
  }
  console.error('[error]', err);
  const status = err.status || 500;

  // Phase 8: persist 5xx errors so the system-health admin view can
  // surface them. Skip 4xx and explicit AppErrors — those are expected.
  if (status >= 500 && !(err instanceof AppError)) {
    prisma.errorLog.create({
      data: {
        message: (err.message ?? 'Unknown error').toString().slice(0, 1000),
        stack: err.stack ? String(err.stack).slice(0, 4000) : null,
        path: req.originalUrl ? req.originalUrl.slice(0, 500) : null,
        method: req.method ?? null,
        status,
        userId: req.auth?.sub ?? null
      }
    }).catch(() => { /* never block the error response on the audit insert */ });
  }

  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Something went wrong'
    }
  });
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
