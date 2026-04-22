// server/src/routes/__tests__/ingest.expire.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('POST /api/ingest/expire', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock-expire' } });
    process.env.CRON_SECRET = 'test-secret';
  });
  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock-expire' } });
  });

  it('flips PUBLISHED rows with past deadlines to EXPIRED', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    const [expired, live] = await Promise.all([
      prisma.scholarship.create({ data: {
        title: 'X', provider: 'P', description: 'old scholarship',
        eligibility: '', applicationUrl: 'https://example.test/x',
        level: 'MASTERS', source: 'INGESTED', status: 'PUBLISHED',
        sourceName: '_mock-expire', deadline: past
      }}),
      prisma.scholarship.create({ data: {
        title: 'Y', provider: 'P', description: 'live scholarship',
        eligibility: '', applicationUrl: 'https://example.test/y',
        level: 'MASTERS', source: 'INGESTED', status: 'PUBLISHED',
        sourceName: '_mock-expire', deadline: future
      }})
    ]);

    const res = await request(app)
      .post('/api/ingest/expire')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.expired).toBe(1);

    const updated = await prisma.scholarship.findUnique({ where: { id: expired.id } });
    const stillLive = await prisma.scholarship.findUnique({ where: { id: live.id } });
    expect(updated?.status).toBe('EXPIRED');
    expect(stillLive?.status).toBe('PUBLISHED');
  });

  it('ignores items with null deadline (rolling)', async () => {
    await prisma.scholarship.create({ data: {
      title: 'Roll', provider: 'P', description: 'rolling', eligibility: '',
      applicationUrl: 'https://example.test/r', level: 'MASTERS',
      source: 'INGESTED', status: 'PUBLISHED', sourceName: '_mock-expire',
      deadline: null
    }});
    const res = await request(app)
      .post('/api/ingest/expire')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.expired).toBe(0);
  });
});
