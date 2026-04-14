// Dev-mode entry point. Creates a long-running HTTP server and attaches
// Socket.io for local development. Vercel serverless uses app.ts directly
// and never touches this file.

import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app.js';

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join', (userId: string) => socket.join(`user:${userId}`));
});

const PORT = Number(process.env.PORT || 4000);
httpServer.listen(PORT, () => {
  console.log(`[uenr-career-hub] server listening on :${PORT}`);
});
