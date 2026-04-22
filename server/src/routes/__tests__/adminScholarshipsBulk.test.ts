// Tests for POST /api/admin/scholarships/bulk/<action>
//
// Auth: requireAuth + requireRole('ADMIN').
// Seeds 3 scholarships, posts 2 ids with each action, asserts DB state.

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;
const TAG = '_scholarships-bulk-test';

(ENABLED ? describe : describe.skip)('Admin scholarships bulk action endpoints', () => {
  const app = createApp();
  let adminToken: string;

  const base = {
    provider: 'Test Provider',
    description: 'A scholarship description that meets the minimum length requirement for tests.',
    eligibility: 'Open to all.',
    applicationUrl: 'https://example.test/apply',
    level: 'MASTERS' as const,
    tags: [TAG],
    deadline: new Date(Date.now() + 7 * 86_400_000),
    isApproved: false,
    isFeatured: false,
    source: 'USER' as const,
    status: 'PUBLISHED' as const
  };

  beforeEach(async () => {
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'scholarships-bulk-test' } } });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Admin', lastName: 'Test',
        email: 'scholarships-bulk-test@test.internal',
        passwordHash: 'not-used', role: 'ADMIN', programme: 'N/A'
      }
    });
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'scholarships-bulk-test' } } });
  });

  // ---- 401 / 400 guards ------------------------------------------------------

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/bulk/approve')
      .send({ ids: ['some-id'] });
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty ids', async () => {
    const res = await request(app)
      .post('/api/admin/scholarships/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  // ---- approve ---------------------------------------------------------------

  it('bulk/approve sets isApproved=true for 2 of 3 rows', async () => {
    const [r1, r2, r3] = await Promise.all([
      prisma.scholarship.create({ data: { ...base, title: `Approve 1 ${TAG}`, status: 'PENDING_REVIEW' } }),
      prisma.scholarship.create({ data: { ...base, title: `Approve 2 ${TAG}`, status: 'PENDING_REVIEW' } }),
      prisma.scholarship.create({ data: { ...base, title: `Approve 3 ${TAG}`, status: 'PENDING_REVIEW' } })
    ]);

    const res = await request(app)
      .post('/api/admin/scholarships/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.requested).toBe(2);

    const [u1, u2, u3] = await Promise.all([
      prisma.scholarship.findUnique({ where: { id: r1.id } }),
      prisma.scholarship.findUnique({ where: { id: r2.id } }),
      prisma.scholarship.findUnique({ where: { id: r3.id } })
    ]);
    expect(u1?.isApproved).toBe(true);
    expect(u2?.isApproved).toBe(true);
    expect(u3?.isApproved).toBe(false);
  });

  // ---- unapprove -------------------------------------------------------------

  it('bulk/unapprove sets isApproved=false', async () => {
    const [r1, r2] = await Promise.all([
      prisma.scholarship.create({ data: { ...base, title: `Unapprove 1 ${TAG}`, isApproved: true } }),
      prisma.scholarship.create({ data: { ...base, title: `Unapprove 2 ${TAG}`, isApproved: true } })
    ]);

    const res = await request(app)
      .post('/api/admin/scholarships/bulk/unapprove')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    const u1 = await prisma.scholarship.findUnique({ where: { id: r1.id } });
    expect(u1?.isApproved).toBe(false);
  });

  // ---- feature / unfeature ---------------------------------------------------

  it('bulk/feature sets isFeatured=true', async () => {
    const [r1, r2] = await Promise.all([
      prisma.scholarship.create({ data: { ...base, title: `Feature 1 ${TAG}` } }),
      prisma.scholarship.create({ data: { ...base, title: `Feature 2 ${TAG}` } })
    ]);

    const res = await request(app)
      .post('/api/admin/scholarships/bulk/feature')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    const u1 = await prisma.scholarship.findUnique({ where: { id: r1.id } });
    expect(u1?.isFeatured).toBe(true);
  });

  it('bulk/unfeature sets isFeatured=false', async () => {
    const [r1, r2] = await Promise.all([
      prisma.scholarship.create({ data: { ...base, title: `Unfeature 1 ${TAG}`, isFeatured: true } }),
      prisma.scholarship.create({ data: { ...base, title: `Unfeature 2 ${TAG}`, isFeatured: true } })
    ]);

    const res = await request(app)
      .post('/api/admin/scholarships/bulk/unfeature')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    const u1 = await prisma.scholarship.findUnique({ where: { id: r1.id } });
    expect(u1?.isFeatured).toBe(false);
  });

  // ---- delete ----------------------------------------------------------------

  it('bulk/delete removes the rows', async () => {
    const [r1, r2, r3] = await Promise.all([
      prisma.scholarship.create({ data: { ...base, title: `Delete 1 ${TAG}` } }),
      prisma.scholarship.create({ data: { ...base, title: `Delete 2 ${TAG}` } }),
      prisma.scholarship.create({ data: { ...base, title: `Delete 3 ${TAG}` } })
    ]);

    const res = await request(app)
      .post('/api/admin/scholarships/bulk/delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const gone1 = await prisma.scholarship.findUnique({ where: { id: r1.id } });
    const gone2 = await prisma.scholarship.findUnique({ where: { id: r2.id } });
    const still = await prisma.scholarship.findUnique({ where: { id: r3.id } });
    expect(gone1).toBeNull();
    expect(gone2).toBeNull();
    expect(still).not.toBeNull();
  });

  // ---- GET / general listing -------------------------------------------------

  it('GET /api/admin/scholarships returns all rows', async () => {
    await Promise.all([
      prisma.scholarship.create({ data: { ...base, title: `List 1 ${TAG}` } }),
      prisma.scholarship.create({ data: { ...base, title: `List 2 ${TAG}` } })
    ]);

    const res = await request(app)
      .get('/api/admin/scholarships')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: any) => r.title) as string[];
    expect(ids.some((t) => t.includes(TAG))).toBe(true);
  });
});
