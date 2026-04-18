import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

declare global {
  var __prisma: PrismaClient | undefined;
}

// In local dev (Node), the Neon serverless driver needs a WebSocket polyfill.
// In Vercel's Edge/Node runtime with Node 20+ the native WebSocket exists
// and this assignment is a harmless no-op.
if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws as any;
}

function buildClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — add it to .env (local) or your Vercel project settings (prod)');
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({ adapter });
}

// Lazy-initialize so importing this module never throws at cold-start.
// The client is built on first property access and cached. This means a
// missing DATABASE_URL only surfaces when a request actually touches the
// database (e.g. /api/auth/login), not during serverless function init —
// so routes that don't hit the DB (/api/health) still work.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = global.__prisma ?? buildClient();
    if (process.env.NODE_ENV !== 'production') global.__prisma = client;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
