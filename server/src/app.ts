// Express app factory — shared by:
//   - dev (server/src/index.ts calls listen() on it)
//   - prod Vercel serverless function (api/index.ts re-exports it as the
//     request handler)
//
// Anything that can't run in a serverless environment (Socket.io, long-lived
// connections) stays OUT of this file and lives in index.ts only.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev, load .env from repo root. In prod (Vercel), env vars come from
// the dashboard and this call is a harmless no-op when the file doesn't exist.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import opportunityRoutes from './routes/opportunities.js';
import scholarshipRoutes from './routes/scholarships.js';
import mentorRoutes from './routes/mentors.js';
import eventRoutes from './routes/events.js';
import chatRoutes from './routes/chat.js';
import notificationRoutes from './routes/notifications.js';
import cvRoutes from './routes/cvs.js';
import adminRoutes from './routes/admin.js';
import contentRoutes from './routes/content.js';
import { UPLOAD_DIR } from './lib/upload.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(UPLOAD_DIR));

  // Rate limiting. Trust proxy so Vercel's x-forwarded-for works.
  app.set('trust proxy', 1);
  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
  app.use('/api', apiLimiter);
  const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'uenr-career-hub' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/opportunities', opportunityRoutes);
  app.use('/api/scholarships', scholarshipRoutes);
  app.use('/api/mentors', mentorRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/chat', chatLimiter, chatRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/cvs', cvRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
