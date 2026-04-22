// Unit tests for the 4-facet filter extensions on GET /api/scholarships
// (field, region, funding, includeRolling).
//
// Requires DATABASE_URL — the whole describe block is skipped otherwise.

import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';

const ENABLED = !!process.env.DATABASE_URL;

// Sentinel tag used to isolate seed rows from existing data.
const TAG = '_facet-test';

(ENABLED ? describe : describe.skip)('GET /api/scholarships — facet filters', () => {
  const app = createApp();

  // Seed helpers ----------------------------------------------------------
  const base = {
    provider: 'Test Provider',
    description: 'A test scholarship description that is long enough.',
    eligibility: 'Open to all students.',
    applicationUrl: 'https://example.test/apply',
    level: 'MASTERS' as const,
    tags: [TAG]
  };

  beforeEach(async () => {
    // Remove any leftover rows from previous runs.
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });

    const future = new Date(Date.now() + 7 * 86_400_000); // +7 days

    // Row 1: STEM / Global / Full funding — PUBLISHED INGESTED. Visible.
    await prisma.scholarship.create({
      data: {
        ...base,
        title: 'STEM Global Full',
        source: 'INGESTED',
        status: 'PUBLISHED',
        isApproved: false, // ingested rows need not have isApproved=true
        deadline: future,
        category: { field: 'STEM', region: 'Global', funding: 'Full funding' }
      }
    });

    // Row 2: Health / Ghana-only / Partial — PENDING_REVIEW INGESTED. Hidden.
    await prisma.scholarship.create({
      data: {
        ...base,
        title: 'Health Ghana Partial Pending',
        source: 'INGESTED',
        status: 'PENDING_REVIEW',
        isApproved: false,
        deadline: future,
        category: { field: 'Health', region: 'Ghana-only', funding: 'Partial funding' }
      }
    });

    // Row 3: Health / Ghana-only / Partial — PUBLISHED INGESTED. Visible.
    // Added so ?region=Ghana-only has at least one visible match.
    await prisma.scholarship.create({
      data: {
        ...base,
        title: 'Health Ghana Partial Published',
        source: 'INGESTED',
        status: 'PUBLISHED',
        isApproved: false,
        deadline: future,
        category: { field: 'Health', region: 'Ghana-only', funding: 'Partial funding' }
      }
    });

    // Row 4: USER-submitted, isApproved=true, no category JSON. Visible.
    await prisma.scholarship.create({
      data: {
        ...base,
        title: 'User Submitted Approved',
        source: 'USER',
        status: 'PUBLISHED',
        isApproved: true,
        fieldOfStudy: 'Engineering',
        deadline: future
      }
    });

    // Row 5: REJECTED INGESTED. Hidden.
    await prisma.scholarship.create({
      data: {
        ...base,
        title: 'Rejected Row',
        source: 'INGESTED',
        status: 'REJECTED',
        isApproved: false,
        deadline: future,
        category: { field: 'Business', region: 'Africa-wide', funding: 'Stipend only' }
      }
    });

    // Row 6: PUBLISHED INGESTED with null deadline (rolling). Visible.
    await prisma.scholarship.create({
      data: {
        ...base,
        title: 'Rolling Scholarship',
        source: 'INGESTED',
        status: 'PUBLISHED',
        isApproved: false,
        deadline: null,
        category: { field: 'Other', region: 'Global', funding: 'Travel/conference grant' }
      }
    });
  });

  afterAll(async () => {
    await prisma.scholarship.deleteMany({ where: { tags: { has: TAG } } });
  });

  // -----------------------------------------------------------------------

  it('default list shows visible seeded rows and hides hidden ones', async () => {
    const res = await request(app).get('/api/scholarships');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    // Visible: STEM Global Full, Health Ghana Partial Published, User Submitted Approved, Rolling Scholarship
    expect(titles).toContain('STEM Global Full');
    expect(titles).toContain('Health Ghana Partial Published');
    expect(titles).toContain('User Submitted Approved');
    expect(titles).toContain('Rolling Scholarship');
    // Hidden: PENDING_REVIEW and REJECTED rows must not appear
    expect(titles).not.toContain('Health Ghana Partial Pending');
    expect(titles).not.toContain('Rejected Row');
  });

  it('?field=STEM returns the STEM row and not the Health/User rows', async () => {
    const res = await request(app).get('/api/scholarships?field=STEM');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    expect(titles).toContain('STEM Global Full');
    expect(titles).not.toContain('Health Ghana Partial Published');
    expect(titles).not.toContain('User Submitted Approved');
  });

  it('?field=Engineering matches user-submitted row via fieldOfStudy but not INGESTED rows', async () => {
    const res = await request(app).get('/api/scholarships?field=Engineering');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    expect(titles).toContain('User Submitted Approved');
    expect(titles).not.toContain('STEM Global Full');
    expect(titles).not.toContain('Health Ghana Partial Published');
  });

  it('?region=Ghana-only returns the visible Ghana row and hides the PENDING one', async () => {
    const res = await request(app).get('/api/scholarships?region=Ghana-only');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    expect(titles).toContain('Health Ghana Partial Published');
    // PENDING_REVIEW row with Ghana-only must be hidden
    expect(titles).not.toContain('Health Ghana Partial Pending');
  });

  it('?funding=Full%20funding returns the Full-funding row and not the Partial row', async () => {
    const res = await request(app).get('/api/scholarships?funding=Full%20funding');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    expect(titles).toContain('STEM Global Full');
    expect(titles).not.toContain('Health Ghana Partial Published');
  });

  it('?status=open excludes the rolling (null-deadline) row by default', async () => {
    const res = await request(app).get('/api/scholarships?status=open');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    expect(titles).not.toContain('Rolling Scholarship');
  });

  it('?status=open&includeRolling=true surfaces the null-deadline row', async () => {
    const res = await request(app).get('/api/scholarships?status=open&includeRolling=true');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.map((r: any) => r.title);
    expect(titles).toContain('Rolling Scholarship');
  });
});
