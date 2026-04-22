// Tests for /api/admin/scholarships review endpoints.
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

const TAG = '_admin-review-test';

(ENABLED ? describe : describe.skip)('Admin scholarships review endpoints', () => {
  const app = createApp();

  let adminId: string;
  let adminToken: string;

  const base = {
    provider: 'Test Provider',
    description: 'A scholarship description that meets the minimum length requirement.',
    eligibility: 'Open to all.',
    applicationUrl: 'https://example.test/apply',
    level: 'MASTERS' as const,
    tags: [TAG],
    deadline: new Date(Date.now() + 7 * 86_400_000)
  };

  beforeEach(async () => {
    // Clean up seeded rows
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
    // Remove previous test admin user if any
    await prisma.user.deleteMany({ where: { email: 'admin-review-test@test.internal' } });

    // Create a test admin user
    const admin = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Admin',
        email: 'admin-review-test@test.internal',
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
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
    await prisma.user.deleteMany({ where: { email: 'admin-review-test@test.internal' } });
  });

  // ---- GET /pending --------------------------------------------------------

  it('GET /api/admin/scholarships/pending returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/scholarships/pending');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/scholarships/pending returns 403 for non-admin', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Regular',
        lastName: 'User',
        email: 'regular-review-test@test.internal',
        passwordHash: 'not-used',
        role: 'STUDENT',
        programme: 'N/A'
      }
    });
    const token = signToken({ sub: user.id, role: 'STUDENT' }, { expiresIn: '1h' });
    const res = await request(app)
      .get('/api/admin/scholarships/pending')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('GET /api/admin/scholarships/pending returns only PENDING_REVIEW rows', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const [pending, published] = await Promise.all([
      prisma.scholarship.create({
        data: { ...base, title: 'Pending One', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      }),
      prisma.scholarship.create({
        data: { ...base, title: 'Published One', source: 'INGESTED', status: 'PUBLISHED', isApproved: true, deadline: future }
      })
    ]);

    const res = await request(app)
      .get('/api/admin/scholarships/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids: string[] = res.body.data.map((r: any) => r.id);
    expect(ids).toContain(pending.id);
    expect(ids).not.toContain(published.id);
  });

  // ---- POST /:id/approve ---------------------------------------------------

  it('POST /api/admin/scholarships/:id/approve sets status=PUBLISHED and isApproved=true', async () => {
    const row = await prisma.scholarship.create({
      data: { ...base, title: 'To Approve', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false }
    });

    const res = await request(app)
      .post(`/api/admin/scholarships/${row.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.isApproved).toBe(true);
  });

  it('POST /api/admin/scholarships/:id/approve returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/nonexistent-id-xyz/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---- POST /:id/reject ----------------------------------------------------

  it('POST /api/admin/scholarships/:id/reject sets status=REJECTED and isApproved=false', async () => {
    const row = await prisma.scholarship.create({
      data: { ...base, title: 'To Reject', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false }
    });

    const res = await request(app)
      .post(`/api/admin/scholarships/${row.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.isApproved).toBe(false);
  });

  it('POST /api/admin/scholarships/:id/reject returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/nonexistent-id-xyz/reject')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ---- POST /:id/edit ------------------------------------------------------

  it('POST /api/admin/scholarships/:id/edit updates editable fields without changing status', async () => {
    const row = await prisma.scholarship.create({
      data: { ...base, title: 'Old Title', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false }
    });

    const newDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const res = await request(app)
      .post(`/api/admin/scholarships/${row.id}/edit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'New Title',
        description: 'Updated description that definitely meets the minimum length requirement.',
        deadline: newDeadline,
        applicationUrl: 'https://example.test/new-apply',
        level: 'PHD'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('New Title');
    expect(res.body.data.level).toBe('PHD');
    // Status unchanged
    expect(res.body.data.status).toBe('PENDING_REVIEW');
  });

  it('POST /api/admin/scholarships/:id/edit returns 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/nonexistent-id-xyz/edit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Anything' });
    expect(res.status).toBe(404);
  });

  it('POST /api/admin/scholarships/:id/edit validates the body', async () => {
    const row = await prisma.scholarship.create({
      data: { ...base, title: 'Validate Test', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false }
    });

    const res = await request(app)
      .post(`/api/admin/scholarships/${row.id}/edit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ applicationUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});
