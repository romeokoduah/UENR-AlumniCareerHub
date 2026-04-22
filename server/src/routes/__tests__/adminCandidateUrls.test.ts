// Tests for POST /api/admin/ingest/candidates/bulk
//
// Auth: requireAuth + requireRole('ADMIN').

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

const SITE_KEY = 'ingest-candidate-urls';

(ENABLED ? describe : describe.skip)('Admin candidate URLs bulk import endpoint', () => {
  const app = createApp();

  let adminToken: string;
  let noAuthToken: string;

  beforeEach(async () => {
    // Clean up site content key so each test starts fresh
    await prisma.siteContent.deleteMany({ where: { key: SITE_KEY } });
    await prisma.user.deleteMany({ where: { email: { contains: 'candidate-bulk-test' } } });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        email: 'candidate-bulk-test-admin@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });
    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });

    const student = await prisma.user.create({
      data: {
        firstName: 'Student',
        lastName: 'User',
        email: 'candidate-bulk-test-student@test.internal',
        passwordHash: 'not-used',
        role: 'STUDENT',
        programme: 'N/A'
      }
    });
    noAuthToken = signToken({ sub: student.id, role: 'STUDENT' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.siteContent.deleteMany({ where: { key: SITE_KEY } });
    await prisma.user.deleteMany({ where: { email: { contains: 'candidate-bulk-test' } } });
  });

  // ---- 401 no auth -----------------------------------------------------------

  it('POST /api/admin/ingest/candidates/bulk returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/candidates/bulk')
      .send({ items: [{ url: 'https://example.com', kind: 'job' }] });
    expect(res.status).toBe(401);
  });

  // ---- 403 for non-admin -----------------------------------------------------

  it('POST /api/admin/ingest/candidates/bulk returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/candidates/bulk')
      .set('Authorization', `Bearer ${noAuthToken}`)
      .send({ items: [{ url: 'https://example.com', kind: 'job' }] });
    expect(res.status).toBe(403);
  });

  // ---- 400 when items is empty -----------------------------------------------

  it('POST /api/admin/ingest/candidates/bulk returns 400 when items is empty array', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/candidates/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  // ---- Happy path: adds new URLs ---------------------------------------------

  it('POST /api/admin/ingest/candidates/bulk adds new URLs and returns added/skipped counts', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/candidates/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          { url: 'https://scholarships.example.com/1', kind: 'scholarship', label: 'Scholarship Site 1' },
          { url: 'https://jobs.example.com/2', kind: 'job', label: 'Jobs Site 2' },
          { url: 'https://jobs.example.com/3', kind: 'job' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.added).toBe(3);
    expect(res.body.data.skipped).toBe(0);
  });

  // ---- Deduplication: existing URLs are skipped ------------------------------

  it('POST /api/admin/ingest/candidates/bulk dedupes against existing list', async () => {
    // Seed one URL
    await prisma.siteContent.create({
      data: {
        key: SITE_KEY,
        data: {
          urls: [
            { url: 'https://existing.example.com/feed', kind: 'scholarship', label: 'Existing' }
          ]
        }
      }
    });

    const res = await request(app)
      .post('/api/admin/ingest/candidates/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          { url: 'https://existing.example.com/feed', kind: 'scholarship' }, // duplicate
          { url: 'https://new.example.com/jobs', kind: 'job', label: 'New jobs' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(1);
    expect(res.body.data.skipped).toBe(1);
  });
});
