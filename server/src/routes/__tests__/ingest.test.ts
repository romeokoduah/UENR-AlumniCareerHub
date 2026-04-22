import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('ingest routes', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.ingestJob.deleteMany({});
    await prisma.ingestRun.deleteMany({});
    await prisma.siteContent.upsert({
      where: { key: 'feature-flags' },
      create: { key: 'feature-flags', data: { 'scholarships-ingest-enabled': true } },
      update: { data: { 'scholarships-ingest-enabled': true } }
    });
  });

  afterAll(async () => {
    await prisma.siteContent.upsert({
      where: { key: 'feature-flags' },
      create: { key: 'feature-flags', data: { 'scholarships-ingest-enabled': false } },
      update: { data: { 'scholarships-ingest-enabled': false } }
    });
  });

  it('POST /api/ingest/scholarships/run requires CRON_SECRET match', async () => {
    const res = await request(app).post('/api/ingest/scholarships/run');
    expect(res.status).toBe(401);
  });

  it('POST /api/ingest/scholarships/run enqueues one job per adapter when authorized', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await request(app)
      .post('/api/ingest/scholarships/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.enqueued).toBeGreaterThanOrEqual(1);
    const jobs = await prisma.ingestJob.findMany({});
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/ingest/scholarships/run short-circuits when flag is off', async () => {
    process.env.CRON_SECRET = 'test-secret';
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': false } }
    });
    const res = await request(app)
      .post('/api/ingest/scholarships/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.enqueued).toBe(0);
    expect(res.body.data.skipped).toBe('flag-off');
  });

  it('GET /api/ingest/health returns last run summary', async () => {
    await prisma.ingestRun.create({
      data: { triggeredBy: 'cron', sourcesAttempted: 1, sourcesOk: 1, itemsPublished: 2 }
    });
    const res = await request(app).get('/api/ingest/health');
    expect(res.status).toBe(200);
    expect(res.body.data.lastRun).toBeTruthy();
    expect(res.body.data.lastRun.itemsPublished).toBe(2);
  });
});
