// Sanity: verify that an ingested item (status=PENDING_REVIEW) becomes
// visible on the public feed after an admin approves it.
//
// Tests two sides independently:
//   1. Scholarship: seed PENDING_REVIEW → bulk-approve → GET /api/scholarships
//   2. Opportunity: seed PENDING_REVIEW → bulk-approve → GET /api/opportunities

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

const TAG = '_visibility-test';

(ENABLED ? describe : describe.skip)('Approved ingested items appear on public feeds', () => {
  const app = createApp();

  let adminToken: string;

  beforeEach(async () => {
    // Clean up test data
    await prisma.opportunity.deleteMany({ where: { company: TAG } });
    await prisma.scholarship.deleteMany({ where: { provider: TAG } });
    await prisma.user.deleteMany({ where: { email: 'admin-visibility-test@test.internal' } });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Visibility',
        lastName: 'Admin',
        email: 'admin-visibility-test@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { company: TAG } });
    await prisma.scholarship.deleteMany({ where: { provider: TAG } });
    await prisma.user.deleteMany({ where: { email: 'admin-visibility-test@test.internal' } });
  });

  it('Scholarship: PENDING_REVIEW item appears on GET /api/scholarships after bulk-approve', async () => {
    // 1. Seed INGESTED scholarship with PENDING_REVIEW status
    const sch = await prisma.scholarship.create({
      data: {
        title: 'Visibility Test Scholarship',
        provider: TAG,
        description: 'A test scholarship for visibility sanity check.',
        eligibility: 'Open to all UENR alumni.',
        applicationUrl: 'https://example.com/vis-sch',
        level: 'MASTERS',
        source: 'INGESTED',
        status: 'PENDING_REVIEW',
        isApproved: false
      }
    });

    // Confirm it's NOT visible on public feed before approval
    const beforeRes = await request(app).get('/api/scholarships');
    expect(beforeRes.status).toBe(200);
    const beforeIds = beforeRes.body.data.map((s: any) => s.id);
    expect(beforeIds).not.toContain(sch.id);

    // 2. Admin bulk-approves it
    const approveRes = await request(app)
      .post('/api/admin/scholarships/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [sch.id] });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.updated).toBeGreaterThanOrEqual(1);

    // 3. Now it should appear on the public feed
    const afterRes = await request(app).get('/api/scholarships');
    expect(afterRes.status).toBe(200);
    const afterIds = afterRes.body.data.map((s: any) => s.id);
    expect(afterIds).toContain(sch.id);
  });

  it('Opportunity: PENDING_REVIEW item appears on GET /api/opportunities after bulk-approve', async () => {
    // 1. Seed INGESTED opportunity with PENDING_REVIEW status
    const opp = await prisma.opportunity.create({
      data: {
        title: 'Visibility Test Job',
        description: 'A test opportunity for visibility sanity check purposes here.',
        company: TAG,
        location: 'Accra, Ghana',
        locationType: 'ONSITE',
        type: 'FULL_TIME',
        source: 'INGESTED',
        status: 'PENDING_REVIEW',
        isApproved: false,
        isActive: true,
        deadline: null
      }
    });

    // Confirm it's NOT visible on public feed before approval
    const beforeRes = await request(app).get('/api/opportunities');
    expect(beforeRes.status).toBe(200);
    const beforeIds = beforeRes.body.data.map((o: any) => o.id);
    expect(beforeIds).not.toContain(opp.id);

    // 2. Admin bulk-approves it
    const approveRes = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [opp.id] });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.updated).toBeGreaterThanOrEqual(1);

    // 3. Now it should appear on the public feed (null deadline = rolling, still shown)
    const afterRes = await request(app).get('/api/opportunities');
    expect(afterRes.status).toBe(200);
    const afterIds = afterRes.body.data.map((o: any) => o.id);
    expect(afterIds).toContain(opp.id);
  });
});
