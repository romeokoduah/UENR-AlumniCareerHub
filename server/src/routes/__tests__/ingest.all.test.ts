import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

(ENABLED ? describe : describe.skip)('ingest /all routes', () => {
  const prevFilter        = process.env.INGEST_ADAPTER_FILTER;
  const prevIncludeMock   = process.env.INCLUDE_MOCK_ADAPTER;
  const prevJobFilter     = process.env.INGEST_JOB_ADAPTER_FILTER;
  const prevCronSecret    = process.env.CRON_SECRET;

  const app = createApp();

  beforeAll(() => {
    // Restrict scholarship adapter registry to mock only.
    process.env.INCLUDE_MOCK_ADAPTER = '1';
    process.env.INGEST_ADAPTER_FILTER = '_mock';
    // Use a non-existent job adapter id so listJobAdapters() returns [] — no
    // real Adzuna calls are made and the opportunities branch enqueues 0 items.
    process.env.INGEST_JOB_ADAPTER_FILTER = 'adzuna-none';
    process.env.CRON_SECRET = 'test-secret';
  });

  beforeEach(async () => {
    await prisma.ingestJob.deleteMany({});
    await prisma.ingestRun.deleteMany({});
    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock' } });
    // Default: both flags ON so tests can selectively turn them off.
    await prisma.siteContent.upsert({
      where: { key: 'feature-flags' },
      create: {
        key: 'feature-flags',
        data: { 'scholarships-ingest-enabled': true, 'opportunities-ingest-enabled': true }
      },
      update: {
        data: { 'scholarships-ingest-enabled': true, 'opportunities-ingest-enabled': true }
      }
    });
  });

  afterAll(async () => {
    // Restore env vars.
    if (prevFilter        === undefined) delete process.env.INGEST_ADAPTER_FILTER;
    else process.env.INGEST_ADAPTER_FILTER = prevFilter;

    if (prevIncludeMock   === undefined) delete process.env.INCLUDE_MOCK_ADAPTER;
    else process.env.INCLUDE_MOCK_ADAPTER = prevIncludeMock;

    if (prevJobFilter     === undefined) delete process.env.INGEST_JOB_ADAPTER_FILTER;
    else process.env.INGEST_JOB_ADAPTER_FILTER = prevJobFilter;

    if (prevCronSecret    === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCronSecret;

    await prisma.scholarship.deleteMany({ where: { sourceName: '_mock' } });
    await prisma.siteContent.upsert({
      where: { key: 'feature-flags' },
      create: {
        key: 'feature-flags',
        data: { 'scholarships-ingest-enabled': false, 'opportunities-ingest-enabled': false }
      },
      update: {
        data: { 'scholarships-ingest-enabled': false, 'opportunities-ingest-enabled': false }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // /all/run auth
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/run returns 401 without bearer', async () => {
    const res = await request(app).post('/api/ingest/all/run');
    expect(res.status).toBe(401);
  });

  it('POST /api/ingest/all/run returns 401 with wrong secret', async () => {
    const res = await request(app)
      .post('/api/ingest/all/run')
      .set('Authorization', 'Bearer wrong-secret');
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // /all/expire auth
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/expire returns 401 without bearer', async () => {
    const res = await request(app).post('/api/ingest/all/expire');
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // /all/run: both flags OFF → both branches skipped
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/run: both flags OFF → both branches skipped', async () => {
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': false, 'opportunities-ingest-enabled': false } }
    });
    const res = await request(app)
      .post('/api/ingest/all/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.scholarships.enqueued).toBe(0);
    expect(res.body.data.scholarships.skipped).toBe('flag-off');
    expect(res.body.data.opportunities.enqueued).toBe(0);
    expect(res.body.data.opportunities.skipped).toBe('flag-off');
  });

  // ---------------------------------------------------------------------------
  // /all/run: scholarships ON, opportunities OFF
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/run: scholarships ON + opportunities OFF → scholarships runs, opportunities skipped', async () => {
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': true, 'opportunities-ingest-enabled': false } }
    });
    const res = await request(app)
      .post('/api/ingest/all/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    // Scholarships branch ran (mock adapter enqueues ≥1).
    expect(res.body.data.scholarships.enqueued).toBeGreaterThanOrEqual(1);
    expect(res.body.data.scholarships.skipped).toBeUndefined();
    // Opportunities branch skipped.
    expect(res.body.data.opportunities.enqueued).toBe(0);
    expect(res.body.data.opportunities.skipped).toBe('flag-off');
  });

  // ---------------------------------------------------------------------------
  // /all/run: scholarships OFF, opportunities ON
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/run: scholarships OFF + opportunities ON → scholarships skipped, opportunities runs', async () => {
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': false, 'opportunities-ingest-enabled': true } }
    });
    const res = await request(app)
      .post('/api/ingest/all/run')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    // Scholarships branch skipped.
    expect(res.body.data.scholarships.enqueued).toBe(0);
    expect(res.body.data.scholarships.skipped).toBe('flag-off');
    // Opportunities branch ran (filter = 'adzuna-none' → 0 adapters → 0 enqueued, no error).
    expect(res.body.data.opportunities.enqueued).toBe(0);
    expect(res.body.data.opportunities.skipped).toBeUndefined();
    expect(res.body.data.opportunities.error).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // /all/expire: expires both tables
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/expire: expires past-deadline rows in both tables', async () => {
    const past = new Date(Date.now() - 86400000); // yesterday

    // Seed an expired scholarship row (PUBLISHED + past deadline).
    await prisma.scholarship.create({
      data: {
        title: 'Expired Test Scholarship',
        provider: 'Test',
        description: 'Desc',
        eligibility: 'All',
        applicationUrl: 'https://example.com/sch',
        level: 'UNDERGRAD',
        deadline: past,
        status: 'PUBLISHED'
      }
    });

    // Seed an expired opportunity row (PUBLISHED + past deadline).
    await prisma.opportunity.create({
      data: {
        title: 'Expired Test Job',
        description: 'Desc',
        company: 'TestCo',
        location: 'Remote',
        locationType: 'REMOTE',
        type: 'FULL_TIME',
        deadline: past,
        status: 'PUBLISHED'
      }
    });

    const res = await request(app)
      .post('/api/ingest/all/expire')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.data.scholarships).toBeGreaterThanOrEqual(1);
    expect(res.body.data.opportunities).toBeGreaterThanOrEqual(1);

    // Verify DB state.
    const sch = await prisma.scholarship.findFirst({ where: { title: 'Expired Test Scholarship' } });
    expect(sch?.status).toBe('EXPIRED');
    const opp = await prisma.opportunity.findFirst({ where: { title: 'Expired Test Job' } });
    expect(opp?.status).toBe('EXPIRED');
  });

  // ---------------------------------------------------------------------------
  // /admin/ingest/run-now — admin-authenticated trigger
  // ---------------------------------------------------------------------------

  it('POST /api/admin/ingest/run-now returns 401 without token', async () => {
    const res = await request(app).post('/api/admin/ingest/run-now').send({ which: 'all' });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/ingest/run-now returns 403 for non-admin token', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Regular',
        lastName: 'User',
        email: 'run-now-student@test.internal',
        passwordHash: 'not-used',
        role: 'STUDENT',
        programme: 'N/A'
      }
    });
    const studentToken = signToken({ sub: user.id, role: 'STUDENT' }, { expiresIn: '1h' });

    const res = await request(app)
      .post('/api/admin/ingest/run-now')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ which: 'all' });

    await prisma.user.deleteMany({ where: { email: 'run-now-student@test.internal' } });
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/ingest/run-now: both flags OFF → both branches skipped', async () => {
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': false, 'opportunities-ingest-enabled': false } }
    });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Run',
        lastName: 'Admin',
        email: 'run-now-admin@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    const adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });

    const res = await request(app)
      .post('/api/admin/ingest/run-now')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ which: 'all' });

    await prisma.user.deleteMany({ where: { email: 'run-now-admin@test.internal' } });
    expect(res.status).toBe(200);
    expect(res.body.data.scholarships.skipped).toBe('flag-off');
    expect(res.body.data.opportunities.skipped).toBe('flag-off');
  });

  it('POST /api/admin/ingest/run-now: which=scholarships skips opportunities branch', async () => {
    await prisma.siteContent.update({
      where: { key: 'feature-flags' },
      data: { data: { 'scholarships-ingest-enabled': false, 'opportunities-ingest-enabled': false } }
    });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Run',
        lastName: 'Admin',
        email: 'run-now-admin2@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    const adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });

    const res = await request(app)
      .post('/api/admin/ingest/run-now')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ which: 'scholarships' });

    await prisma.user.deleteMany({ where: { email: 'run-now-admin2@test.internal' } });
    expect(res.status).toBe(200);
    // opportunities branch should be "not-selected"
    expect(res.body.data.opportunities.skipped).toBe('not-selected');
  });

  // ---------------------------------------------------------------------------
  // /all/expire: does not expire future-deadline rows
  // ---------------------------------------------------------------------------

  it('POST /api/ingest/all/expire: leaves future-deadline PUBLISHED rows untouched', async () => {
    const future = new Date(Date.now() + 30 * 86400000);

    await prisma.scholarship.create({
      data: {
        title: 'Active Test Scholarship',
        provider: 'Test',
        description: 'Desc',
        eligibility: 'All',
        applicationUrl: 'https://example.com/sch2',
        level: 'UNDERGRAD',
        deadline: future,
        status: 'PUBLISHED'
      }
    });

    await prisma.opportunity.create({
      data: {
        title: 'Active Test Job',
        description: 'Desc',
        company: 'TestCo',
        location: 'Remote',
        locationType: 'REMOTE',
        type: 'FULL_TIME',
        deadline: future,
        status: 'PUBLISHED'
      }
    });

    const res = await request(app)
      .post('/api/ingest/all/expire')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);

    const sch = await prisma.scholarship.findFirst({ where: { title: 'Active Test Scholarship' } });
    expect(sch?.status).toBe('PUBLISHED');
    const opp = await prisma.opportunity.findFirst({ where: { title: 'Active Test Job' } });
    expect(opp?.status).toBe('PUBLISHED');
  });
});
