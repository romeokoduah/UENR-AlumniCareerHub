// Tests for POST /api/admin/opportunities/bulk/<action>
//
// Auth: requireAuth + requireRole('ADMIN').
// Seeds 3 opportunities, posts 2 ids with each action, asserts DB state.

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;
const TAG = '_opps-bulk-test';

(ENABLED ? describe : describe.skip)('Admin opportunities bulk action endpoints', () => {
  const app = createApp();
  let adminToken: string;

  const oppBase = {
    title: `Test Opp ${TAG}`,
    description: 'A test opportunity description that meets minimum length.',
    company: 'Test Co',
    location: 'Accra',
    locationType: 'ONSITE' as const,
    type: 'FULL_TIME' as const,
    deadline: new Date(Date.now() + 30 * 86_400_000),
    isApproved: false,
    isActive: true,
    isFeatured: false,
    source: 'USER' as const,
    status: 'PUBLISHED' as const
  };

  beforeEach(async () => {
    await prisma.opportunity.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'opps-bulk-test' } } });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Admin', lastName: 'Test',
        email: 'opps-bulk-test@test.internal',
        passwordHash: 'not-used', role: 'ADMIN', programme: 'N/A'
      }
    });
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'opps-bulk-test' } } });
  });

  // ---- 401 / 400 guards ------------------------------------------------------

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .send({ ids: ['some-id'] });
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty ids', async () => {
    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  // ---- approve ---------------------------------------------------------------

  it('bulk/approve sets isApproved=true for 2 of 3 rows', async () => {
    const [r1, r2, r3] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Approve 1 ${TAG}` } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Approve 2 ${TAG}` } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Approve 3 ${TAG}` } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const [u1, u2, u3] = await Promise.all([
      prisma.opportunity.findUnique({ where: { id: r1.id } }),
      prisma.opportunity.findUnique({ where: { id: r2.id } }),
      prisma.opportunity.findUnique({ where: { id: r3.id } })
    ]);
    expect(u1?.isApproved).toBe(true);
    expect(u2?.isApproved).toBe(true);
    expect(u3?.isApproved).toBe(false);
  });

  // ---- unapprove -------------------------------------------------------------

  it('bulk/unapprove sets isApproved=false', async () => {
    const [r1, r2] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Unapprove 1 ${TAG}`, isApproved: true } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Unapprove 2 ${TAG}`, isApproved: true } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/unapprove')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const u1 = await prisma.opportunity.findUnique({ where: { id: r1.id } });
    expect(u1?.isApproved).toBe(false);
  });

  // ---- activate / deactivate -------------------------------------------------

  it('bulk/activate sets isActive=true', async () => {
    const [r1, r2] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Activate 1 ${TAG}`, isActive: false } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Activate 2 ${TAG}`, isActive: false } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/activate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    const u1 = await prisma.opportunity.findUnique({ where: { id: r1.id } });
    expect(u1?.isActive).toBe(true);
  });

  it('bulk/deactivate sets isActive=false', async () => {
    const [r1, r2] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Deactivate 1 ${TAG}`, isActive: true } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Deactivate 2 ${TAG}`, isActive: true } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/deactivate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    const u1 = await prisma.opportunity.findUnique({ where: { id: r1.id } });
    expect(u1?.isActive).toBe(false);
  });

  // ---- feature / unfeature ---------------------------------------------------

  it('bulk/feature sets isFeatured=true', async () => {
    const [r1, r2] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Feature 1 ${TAG}` } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Feature 2 ${TAG}` } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/feature')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    const u1 = await prisma.opportunity.findUnique({ where: { id: r1.id } });
    expect(u1?.isFeatured).toBe(true);
  });

  it('bulk/unfeature sets isFeatured=false', async () => {
    const [r1, r2] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Unfeature 1 ${TAG}`, isFeatured: true } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Unfeature 2 ${TAG}`, isFeatured: true } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/unfeature')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    const u1 = await prisma.opportunity.findUnique({ where: { id: r1.id } });
    expect(u1?.isFeatured).toBe(false);
  });

  // ---- delete ----------------------------------------------------------------

  it('bulk/delete removes the rows', async () => {
    const [r1, r2, r3] = await Promise.all([
      prisma.opportunity.create({ data: { ...oppBase, title: `Delete 1 ${TAG}` } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Delete 2 ${TAG}` } }),
      prisma.opportunity.create({ data: { ...oppBase, title: `Delete 3 ${TAG}` } })
    ]);

    const res = await request(app)
      .post('/api/admin/opportunities/bulk/delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const gone1 = await prisma.opportunity.findUnique({ where: { id: r1.id } });
    const gone2 = await prisma.opportunity.findUnique({ where: { id: r2.id } });
    const still = await prisma.opportunity.findUnique({ where: { id: r3.id } });
    expect(gone1).toBeNull();
    expect(gone2).toBeNull();
    expect(still).not.toBeNull();
  });
});
