// Tests for POST /api/admin/opportunities/bulk-create
// and  POST /api/admin/scholarships/bulk-create

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

const TAG = '_bulk-create-test';

(ENABLED ? describe : describe.skip)('Admin bulk-create endpoints', () => {
  const app = createApp();

  let adminToken: string;
  let adminId: string;

  const baseOpp = {
    title: 'Bulk Test Job',
    description: 'A job description that meets the minimum length requirement for bulk testing purposes.',
    company: 'Bulk Test Co',
    location: 'Accra, Ghana',
    locationType: 'ONSITE' as const,
    type: 'FULL_TIME' as const,
    industry: TAG
  };

  const baseSch = {
    title: 'Bulk Test Scholarship',
    provider: 'Test Foundation',
    description: 'A scholarship description that meets the minimum length requirement for bulk testing.',
    eligibility: 'Open to UENR students and alumni.',
    applicationUrl: 'https://apply.example.com/test',
    level: 'MASTERS' as const
  };

  beforeEach(async () => {
    await prisma.opportunity.deleteMany({ where: { industry: TAG } });
    await prisma.scholarship.deleteMany({ where: { provider: 'Test Foundation' } });
    await prisma.user.deleteMany({ where: { email: 'admin-bulk-create-test@test.internal' } });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Bulk',
        lastName: 'Admin',
        email: 'admin-bulk-create-test@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    adminId = admin.id;
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { industry: TAG } });
    await prisma.scholarship.deleteMany({ where: { provider: 'Test Foundation' } });
    await prisma.user.deleteMany({ where: { email: 'admin-bulk-create-test@test.internal' } });
  });

  // ── Opportunities bulk-create ─────────────────────────────────────────────

  it('POST /api/admin/opportunities/bulk-create requires auth', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk-create')
      .send({ items: [baseOpp] });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/opportunities/bulk-create creates opportunities and marks them PUBLISHED', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk-create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [baseOpp, { ...baseOpp, title: 'Bulk Test Job 2' }] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.rejected).toHaveLength(0);

    // Verify DB rows
    const rows = await prisma.opportunity.findMany({ where: { industry: TAG } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('PUBLISHED');
      expect(row.isApproved).toBe(true);
      expect(row.isActive).toBe(true);
      expect(row.source).toBe('ADMIN');
      expect(row.postedById).toBe(adminId);
    }
  });

  it('POST /api/admin/opportunities/bulk-create rejects invalid rows and creates valid ones', async () => {
    const items = [
      baseOpp, // valid
      { ...baseOpp, title: 'X', locationType: 'INVALID' }, // invalid (title too short + bad enum)
      { ...baseOpp, title: 'Another Bulk Test Job' } // valid
    ];
    const res = await request(app)
      .post('/api/admin/opportunities/bulk-create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.rejected).toHaveLength(1);
    expect(res.body.data.rejected[0].row).toBe(2);
  });

  it('POST /api/admin/opportunities/bulk-create rejects empty items array', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk-create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  // ── Scholarships bulk-create ──────────────────────────────────────────────

  it('POST /api/admin/scholarships/bulk-create requires auth', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/bulk-create')
      .send({ items: [baseSch] });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/scholarships/bulk-create creates scholarships and marks them PUBLISHED', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/bulk-create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [baseSch, { ...baseSch, title: 'Bulk Test Scholarship 2' }] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.rejected).toHaveLength(0);

    const rows = await prisma.scholarship.findMany({ where: { provider: 'Test Foundation' } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('PUBLISHED');
      expect(row.isApproved).toBe(true);
      expect(row.source).toBe('ADMIN');
      expect(row.submittedById).toBe(adminId);
    }
  });

  it('POST /api/admin/scholarships/bulk-create rejects invalid rows', async () => {
    const items = [
      baseSch, // valid
      { ...baseSch, level: 'INVALID_LEVEL' } // invalid enum
    ];
    const res = await request(app)
      .post('/api/admin/scholarships/bulk-create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.rejected).toHaveLength(1);
  });
});
