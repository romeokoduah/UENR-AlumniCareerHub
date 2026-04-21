// Vercel Serverless Function entry for every /api/* request.
//
// Vercel routes anything matching /api/* to this file (via the rewrite rule
// in vercel.json). The Express app inside `server/src/app.ts` is a standard
// (req, res) handler so it's directly compatible with Vercel's signature.
//
// No socket.io here — long-lived WebSocket connections don't work in
// serverless. For real-time features, attach them in a separate persistent
// service later.

import app from '../server/src/app.js';

// Bumped 2026-04-21 to bust Vercel's function bundle cache.
// Bumped again 2026-04-21 (chat.ts debug surfacing).
export default app;
