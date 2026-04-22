// Tests for GET /api/admin/ingest-stats
//
// Gated by DATABASE_URL — skipped in CI where no DB is wired.
// Uses a short-lived admin JWT minted via signToken(), same as the
// scholarship review tests.

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

const TAG = '_ingest-stats-test';

(ENABLED ? describe : describe.skip)('GET /api/admin/ingest-stats', () => {
  const app = createApp();

  let adminToken: string;
  let seedRunId: string;

  beforeEach(async () => {
    // Clean up any lingering test data.
    await prisma.ingestJob.deleteMany({ where: { source: { startsWith: TAG } } });
    await prisma.ingestRun.deleteMany({ where: { triggeredBy: TAG } });
    await prisma.user.deleteMany({ where: { email: 'ingest-stats-test@test.internal' } });

    // Seed an admin user + JWT.
    const admin = await prisma.user.create({
      data: {
        firstName: 'Ingest',
        lastName: 'Admin',
        email: 'ingest-stats-test@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });

    // Seed one IngestRun.
    const run = await prisma.ingestRun.create({
      data: {
        triggeredBy: TAG,
        sourcesOk: 2,
        sourcesFailed: 1,
        itemsPublished: 10,
        itemsQueued: 5,
        itemsRejected: 2
      }
    });
    seedRunId = run.id;

    // Seed two IngestJob rows under different sources.
    await prisma.ingestJob.createMany({
      data: [
        { runId: run.id, source: `${TAG}:source-a`, status: 'DONE', attempts: 1 },
        { runId: run.id, source: `${TAG}:source-b`, status: 'FAILED', attempts: 3 }
      ]
    });
  });

  afterAll(async () => {
    await prisma.ingestJob.deleteMany({ where: { source: { startsWith: TAG } } });
    await prisma.ingestRun.deleteMany({ where: { triggeredBy: TAG } });
    await prisma.user.deleteMany({ where: { email: 'ingest-stats-test@test.internal' } });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/ingest-stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Regular',
        lastName: 'User',
        email: 'ingest-stats-nonadmin@test.internal',
        passwordHash: 'not-used',
        role: 'STUDENT',
        programme: 'N/A'
      }
    });
    const token = signToken({ sub: user.id, role: 'STUDENT' }, { expiresIn: '1h' });
    const res = await request(app)
      .get('/api/admin/ingest-stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('returns 200 with correct shape and seeded data', async () => {
    const res = await request(app)
      .get('/api/admin/ingest-stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const { data } = res.body;

    // Shape checks.
    expect(Array.isArray(data.lastRuns)).toBe(true);
    expect(Array.isArray(data.jobsBreakdown)).toBe(true);
    expect(typeof data.counts).toBe('object');
    expect(typeof data.flags).toBe('object');

    // lastRuns should contain our seeded run.
    const run = data.lastRuns.find((r: any) => r.id === seedRunId);
    expect(run).toBeDefined();
    expect(run.sourcesOk).toBe(2);
    expect(run.sourcesFailed).toBe(1);
    expect(run.itemsPublished).toBe(10);
    expect(run.triggeredBy).toBe(TAG);

    // jobsBreakdown should have one entry per source, deduplicated.
    const sources = data.jobsBreakdown.map((j: any) => j.source);
    expect(sources).toContain(`${TAG}:source-a`);
    expect(sources).toContain(`${TAG}:source-b`);
    // No duplicates.
    expect(new Set(sources).size).toBe(sources.length);

    // Each entry has expected fields.
    const sourceA = data.jobsBreakdown.find((j: any) => j.source === `${TAG}:source-a`);
    expect(sourceA.lastStatus).toBe('DONE');
    expect(typeof sourceA.attempts).toBe('number');

    // counts structure.
    expect(typeof data.counts.scholarships.pendingReview).toBe('number');
    expect(typeof data.counts.scholarships.published).toBe('number');
    expect(typeof data.counts.opportunities.pendingReview).toBe('number');

    // flags structure.
    expect(typeof data.flags.scholarshipsIngestEnabled).toBe('boolean');
    expect(typeof data.flags.opportunitiesIngestEnabled).toBe('boolean');
  });

  it('returns at most 5 lastRuns', async () => {
    // Seed 6 more runs to push total above 5.
    for (let i = 0; i < 6; i++) {
      await prisma.ingestRun.create({ data: { triggeredBy: TAG, sourcesOk: 0, sourcesFailed: 0, itemsPublished: 0, itemsQueued: 0, itemsRejected: 0 } });
    }

    const res = await request(app)
      .get('/api/admin/ingest-stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lastRuns.length).toBeLessThanOrEqual(5);
  });
});
