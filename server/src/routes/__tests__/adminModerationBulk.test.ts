// Tests for POST /api/admin/moderation/bulk/approve and /bulk/reject.
//
// Auth: requireAuth + requireSuperuser. Test setup mints JWTs the same way
// as adminScholarshipsReview.test.ts, and creates a superuser (isSuperuser=true)
// so the superuser gate passes.

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

const TAG = '_moderation-bulk-test';

(ENABLED ? describe : describe.skip)('Admin moderation bulk approve/reject endpoints', () => {
  const app = createApp();

  let superuserId: string;
  let superuserToken: string;
  let adminToken: string; // ADMIN but NOT superuser

  beforeEach(async () => {
    // Clean up previous test artefacts
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
    await prisma.opportunity.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'moderation-bulk-test' } } });

    // Create a true superuser
    const su = await prisma.user.create({
      data: {
        firstName: 'Super',
        lastName: 'User',
        email: 'moderation-bulk-test-su@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        isSuperuser: true,
        programme: 'N/A'
      }
    });
    superuserId = su.id;
    superuserToken = signToken({ sub: su.id, role: 'ADMIN' }, { expiresIn: '1h' });

    // Admin without superuser flag
    const admin = await prisma.user.create({
      data: {
        firstName: 'Regular',
        lastName: 'Admin',
        email: 'moderation-bulk-test-admin@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        isSuperuser: false,
        programme: 'N/A'
      }
    });
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
    await prisma.opportunity.deleteMany({ where: { title: { contains: TAG } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'moderation-bulk-test' } } });
  });

  const scholarshipBase = {
    provider: 'Test Provider',
    description: 'A scholarship description that meets the minimum length requirement for tests.',
    eligibility: 'Open to all.',
    applicationUrl: 'https://example.test/apply',
    level: 'MASTERS' as const,
    tags: [TAG],
    deadline: new Date(Date.now() + 7 * 86_400_000)
  };

  // ---- 401 without auth ---------------------------------------------------

  it('POST /api/admin/moderation/bulk/approve returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/moderation/bulk/approve')
      .send({ items: [{ kind: 'scholarship', id: 'some-id' }] });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/moderation/bulk/reject returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/moderation/bulk/reject')
      .send({ items: [{ kind: 'scholarship', id: 'some-id' }] });
    expect(res.status).toBe(401);
  });

  // ---- 403 for ADMIN (non-superuser) --------------------------------------

  it('POST /api/admin/moderation/bulk/approve returns 403 for non-superuser admin', async () => {
    const res = await request(app)
      .post('/api/admin/moderation/bulk/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ kind: 'scholarship', id: 'some-id' }] });
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/moderation/bulk/reject returns 403 for non-superuser admin', async () => {
    const res = await request(app)
      .post('/api/admin/moderation/bulk/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ kind: 'scholarship', id: 'some-id' }] });
    expect(res.status).toBe(403);
  });

  // ---- 400 when items is empty -------------------------------------------

  it('POST /api/admin/moderation/bulk/approve returns 400 when items is empty', async () => {
    const res = await request(app)
      .post('/api/admin/moderation/bulk/approve')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/moderation/bulk/reject returns 400 when items is empty', async () => {
    const res = await request(app)
      .post('/api/admin/moderation/bulk/reject')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  // ---- 200 happy path: 3 mixed-kind items all transition ------------------

  it('POST /api/admin/moderation/bulk/approve 200 happy path: 3 mixed-kind items', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const [s1, s2] = await Promise.all([
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Bulk Mod Approve 1', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      }),
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Bulk Mod Approve 2', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      })
    ]);
    const lr = await prisma.learningResource.create({
      data: {
        title: `Learning Resource ${TAG}`,
        provider: 'Test Provider',
        url: 'https://example.test/learn',
        type: 'COURSE',
        level: 'BEGINNER',
        cost: 'FREE',
        language: 'en',
        isApproved: false
      }
    });

    const res = await request(app)
      .post('/api/admin/moderation/bulk/approve')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({
        items: [
          { kind: 'scholarship', id: s1.id },
          { kind: 'scholarship', id: s2.id },
          { kind: 'learning_resource', id: lr.id }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(3);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.failed).toHaveLength(0);

    const [updated1, updated2, updatedLr] = await Promise.all([
      prisma.scholarship.findUnique({ where: { id: s1.id } }),
      prisma.scholarship.findUnique({ where: { id: s2.id } }),
      prisma.learningResource.findUnique({ where: { id: lr.id } })
    ]);
    expect(updated1?.isApproved).toBe(true);
    expect(updated2?.isApproved).toBe(true);
    expect(updatedLr?.isApproved).toBe(true);

    // cleanup learning resource
    await prisma.learningResource.deleteMany({ where: { title: { contains: TAG } } });
  });

  // ---- 200 with one stale id: 2 updated, 1 skipped, 0 failed -------------

  it('POST /api/admin/moderation/bulk/approve with one already-approved: 2 updated, 1 skipped', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const [pending1, pending2, alreadyApproved] = await Promise.all([
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Stale Mod 1', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      }),
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Stale Mod 2', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      }),
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Stale Mod Already Done', source: 'INGESTED', status: 'PUBLISHED', isApproved: true, deadline: future }
      })
    ]);

    const res = await request(app)
      .post('/api/admin/moderation/bulk/approve')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({
        items: [
          { kind: 'scholarship', id: pending1.id },
          { kind: 'scholarship', id: pending2.id },
          { kind: 'scholarship', id: alreadyApproved.id }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.failed).toHaveLength(0);
  });

  // ---- bulk reject happy path ----------------------------------------------

  it('POST /api/admin/moderation/bulk/reject 200 happy path', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const [s1, s2] = await Promise.all([
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Bulk Mod Reject 1', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      }),
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Bulk Mod Reject 2', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      })
    ]);

    const res = await request(app)
      .post('/api/admin/moderation/bulk/reject')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({
        items: [
          { kind: 'scholarship', id: s1.id },
          { kind: 'scholarship', id: s2.id }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.failed).toHaveLength(0);
  });

  // ---- stale (non-existent) id: skipped -----------------------------------

  it('POST /api/admin/moderation/bulk/approve with non-existent id counts as skipped, not failed', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const [s1, s2] = await Promise.all([
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Stale Gone 1', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      }),
      prisma.scholarship.create({
        data: { ...scholarshipBase, title: 'Stale Gone 2', source: 'INGESTED', status: 'PENDING_REVIEW', isApproved: false, deadline: future }
      })
    ]);

    const res = await request(app)
      .post('/api/admin/moderation/bulk/approve')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({
        items: [
          { kind: 'scholarship', id: s1.id },
          { kind: 'scholarship', id: s2.id },
          { kind: 'scholarship', id: 'completely-nonexistent-id-xyz' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.failed).toHaveLength(0);
  });
});
