// Tests for /api/admin/opportunities review endpoints.
//
// Auth pattern: manually mint a short-lived JWT for a seeded ADMIN user
// using the same JWT_SECRET the server reads. No existing admin test file
// to copy from, so we follow the shape described in server/src/lib/jwt.ts:
//   jwt.sign({ sub, role, ver? }, JWT_SECRET, { expiresIn })
// which is what signToken() does — we call it directly here.

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

const TAG = '_admin-opp-review-test';

(ENABLED ? describe : describe.skip)('Admin opportunities review endpoints', () => {
  const app = createApp();

  let adminId: string;
  let adminToken: string;

  // Required non-optional Opportunity fields
  const base = {
    title: 'Test Job',
    description: 'A job description that meets the minimum length requirement for testing.',
    company: 'Test Company',
    location: 'Accra, Ghana',
    type: 'FULL_TIME' as const,
    locationType: 'ONSITE' as const,
    source: 'INGESTED' as const,
    status: 'PENDING_REVIEW' as const,
    isApproved: false,
    industry: TAG
  };

  beforeEach(async () => {
    // Clean up seeded rows
    await prisma.opportunity.deleteMany({ where: { industry: TAG } });
    // Remove previous test admin user if any
    await prisma.user.deleteMany({ where: { email: 'admin-opp-review-test@test.internal' } });

    // Create a test admin user
    const admin = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Admin',
        email: 'admin-opp-review-test@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    adminId = admin.id;

    // Mint a JWT that auth middleware will accept
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { industry: TAG } });
    await prisma.user.deleteMany({ where: { email: 'admin-opp-review-test@test.internal' } });
  });

  // ---- GET /pending --------------------------------------------------------

  it('GET /api/admin/opportunities/pending returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/opportunities/pending');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/opportunities/pending returns 403 for non-admin', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Regular',
        lastName: 'User',
        email: 'regular-opp-review-test@test.internal',
        passwordHash: 'not-used',
        role: 'STUDENT',
        programme: 'N/A'
      }
    });
    const token = signToken({ sub: user.id, role: 'STUDENT' }, { expiresIn: '1h' });
    const res = await request(app)
      .get('/api/admin/opportunities/pending')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('GET /api/admin/opportunities/pending returns only PENDING_REVIEW rows', async () => {
    const [pending, published] = await Promise.all([
      prisma.opportunity.create({
        data: { ...base, title: 'Pending Job', status: 'PENDING_REVIEW', isApproved: false }
      }),
      prisma.opportunity.create({
        data: { ...base, title: 'Published Job', status: 'PUBLISHED', isApproved: true }
      })
    ]);

    const res = await request(app)
      .get('/api/admin/opportunities/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids: string[] = res.body.data.map((r: any) => r.id);
    expect(ids).toContain(pending.id);
    expect(ids).not.toContain(published.id);
  });

  // ---- POST /:id/approve ---------------------------------------------------

  it('POST /api/admin/opportunities/:id/approve sets status=PUBLISHED and isApproved=true', async () => {
    const row = await prisma.opportunity.create({
      data: { ...base, title: 'To Approve' }
    });

    const res = await request(app)
      .post(`/api/admin/opportunities/${row.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.isApproved).toBe(true);
  });

  it('POST /api/admin/opportunities/:id/approve returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/nonexistent-id-xyz/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---- POST /:id/reject ----------------------------------------------------

  it('POST /api/admin/opportunities/:id/reject sets status=REJECTED and isApproved=false', async () => {
    const row = await prisma.opportunity.create({
      data: { ...base, title: 'To Reject' }
    });

    const res = await request(app)
      .post(`/api/admin/opportunities/${row.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.isApproved).toBe(false);
  });

  it('POST /api/admin/opportunities/:id/reject returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/nonexistent-id-xyz/reject')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---- POST /:id/edit ------------------------------------------------------

  it('POST /api/admin/opportunities/:id/edit updates editable fields without changing status', async () => {
    const row = await prisma.opportunity.create({
      data: { ...base, title: 'Old Job Title' }
    });

    const newDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const res = await request(app)
      .post(`/api/admin/opportunities/${row.id}/edit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'New Job Title',
        company: 'Updated Company Ltd',
        location: 'Remote, Worldwide',
        deadline: newDeadline
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('New Job Title');
    expect(res.body.data.company).toBe('Updated Company Ltd');
    expect(res.body.data.location).toBe('Remote, Worldwide');
    // Status unchanged
    expect(res.body.data.status).toBe('PENDING_REVIEW');
  });

  it('POST /api/admin/opportunities/:id/edit returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/nonexistent-id-xyz/edit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Anything' });
    expect(res.status).toBe(404);
  });

  it('POST /api/admin/opportunities/:id/edit validates the body', async () => {
    const row = await prisma.opportunity.create({
      data: { ...base, title: 'Validate Test Job' }
    });

    const res = await request(app)
      .post(`/api/admin/opportunities/${row.id}/edit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ applicationUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  // ---- POST /bulk/approve --------------------------------------------------

  it('POST /api/admin/opportunities/bulk/approve returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .send({ ids: ['some-id'] });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/opportunities/bulk/approve returns 400 on empty ids array', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/opportunities/bulk/approve approves only selected PENDING_REVIEW rows', async () => {
    const [r1, r2, r3] = await Promise.all([
      prisma.opportunity.create({ data: { ...base, title: 'Bulk Approve Job 1' } }),
      prisma.opportunity.create({ data: { ...base, title: 'Bulk Approve Job 2' } }),
      prisma.opportunity.create({ data: { ...base, title: 'Bulk Approve Job 3' } }),
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.requested).toBe(2);

    const [updated1, updated2, untouched] = await Promise.all([
      prisma.opportunity.findUnique({ where: { id: r1.id } }),
      prisma.opportunity.findUnique({ where: { id: r2.id } }),
      prisma.opportunity.findUnique({ where: { id: r3.id } }),
    ]);
    expect(updated1?.status).toBe('PUBLISHED');
    expect(updated1?.isApproved).toBe(true);
    expect(updated2?.status).toBe('PUBLISHED');
    expect(updated2?.isApproved).toBe(true);
    expect(untouched?.status).toBe('PENDING_REVIEW');
  });

  it('POST /api/admin/opportunities/bulk/approve stale id (already PUBLISHED) counts only actually-transitioned rows', async () => {
    const [pending, alreadyPublished] = await Promise.all([
      prisma.opportunity.create({ data: { ...base, title: 'Stale Test Pending Job' } }),
      prisma.opportunity.create({ data: { ...base, title: 'Stale Test Published Job', status: 'PUBLISHED', isApproved: true } }),
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [pending.id, alreadyPublished.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
    expect(res.body.data.requested).toBe(2);
  });

  // ---- POST /bulk/reject ---------------------------------------------------

  it('POST /api/admin/opportunities/bulk/reject returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk/reject')
      .send({ ids: ['some-id'] });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/opportunities/bulk/reject returns 400 on empty ids array', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/opportunities/bulk/reject rejects only selected PENDING_REVIEW rows', async () => {
    const [r1, r2, r3] = await Promise.all([
      prisma.opportunity.create({ data: { ...base, title: 'Bulk Reject Job 1' } }),
      prisma.opportunity.create({ data: { ...base, title: 'Bulk Reject Job 2' } }),
      prisma.opportunity.create({ data: { ...base, title: 'Bulk Reject Job 3' } }),
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.requested).toBe(2);

    const [updated1, updated2, untouched] = await Promise.all([
      prisma.opportunity.findUnique({ where: { id: r1.id } }),
      prisma.opportunity.findUnique({ where: { id: r2.id } }),
      prisma.opportunity.findUnique({ where: { id: r3.id } }),
    ]);
    expect(updated1?.status).toBe('REJECTED');
    expect(updated1?.isApproved).toBe(false);
    expect(updated2?.status).toBe('REJECTED');
    expect(updated2?.isApproved).toBe(false);
    expect(untouched?.status).toBe('PENDING_REVIEW');
  });
});
