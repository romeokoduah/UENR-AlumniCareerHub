import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
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

// In prod, uploads go to Cloudinary and this static route never serves
// real data. We still expose it so local-dev uploads resolve at /uploads/*.

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }
});

app.set('io', io);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', apiLimiter);

const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'uenr-career-hub' }));

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

io.on('connection', (socket) => {
  socket.on('join', (userId: string) => socket.join(`user:${userId}`));
});

app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);
httpServer.listen(PORT, () => {
  console.log(`[uenr-career-hub] server listening on :${PORT}`);
});
