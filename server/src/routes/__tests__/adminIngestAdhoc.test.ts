// Tests for POST /api/admin/ingest/adhoc
//
// Uses mock global fetch to serve known HTML/RSS blobs without hitting the
// network. Gated on DATABASE_URL so it only runs in CI with a real DB.

import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';
import { prisma } from '../../lib/prisma.js';
import request from 'supertest';
import { createApp } from '../../app.js';
import { signToken } from '../../lib/jwt.js';

const ENABLED = !!process.env.DATABASE_URL;

// A realistic HTML page with 3 article items
const GOOD_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Scholarships Page</title></head>
<body>
  <article>
    <h2>Rhodes Scholarship 2025 – Ghana</h2>
    <p>Full funding for postgraduate study at Oxford University. Open to Ghanaian nationals aged 19–25 with outstanding academic achievement and leadership qualities. Applications close December 2025.</p>
    <a href="https://www.rhodeshouse.ox.ac.uk/scholarships/apply">Apply here</a>
  </article>
  <article>
    <h2>Commonwealth Scholarship 2025</h2>
    <p>Fully funded scholarships for citizens of Commonwealth countries including Ghana. Covers masters and PhD programmes at UK universities with a stipend and travel allowance.</p>
    <a href="https://cscuk.fcdo.gov.uk/apply">Apply here</a>
  </article>
  <article>
    <h2>Mastercard Foundation Scholars Program</h2>
    <p>Scholarships for academically talented yet economically disadvantaged young Africans to study at leading universities. Full funding including tuition, accommodation, and living expenses.</p>
    <a href="https://mastercardfdn.org/all/scholars/scholars-program/applying-to-the-scholars-program/">Learn more</a>
  </article>
</body>
</html>`;

// HTML with no extractable structure and no title
const EMPTY_HTML = `<!DOCTYPE html><html><body><p>Nothing here</p></body></html>`;

// Minimal RSS feed
const GOOD_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Jobs Feed</title>
    <item>
      <title>Software Engineer – Remote</title>
      <link>https://jobs.example.com/software-engineer</link>
      <description>We are looking for a software engineer with 3+ years of experience in TypeScript and Node.js to join our fully remote team. The role involves building scalable APIs and mentoring junior developers.</description>
    </item>
    <item>
      <title>Data Analyst – Africa Operations</title>
      <link>https://jobs.example.com/data-analyst</link>
      <description>Join our data team to analyze business performance across Africa. Requires strong SQL skills and experience with BI tools. Remote-eligible for candidates based in Ghana or Nigeria.</description>
    </item>
  </channel>
</rss>`;

(ENABLED ? describe : describe.skip)('POST /api/admin/ingest/adhoc', () => {
  const app = createApp();

  let adminToken: string;

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: 'adhoc-test-admin@test.internal' } });

    const admin = await prisma.user.create({
      data: {
        firstName: 'Adhoc',
        lastName: 'Admin',
        email: 'adhoc-test-admin@test.internal',
        passwordHash: 'not-used',
        role: 'ADMIN',
        programme: 'N/A'
      }
    });

    adminToken = signToken({ sub: admin.id, role: 'ADMIN' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'adhoc-test-admin@test.internal' } });
    // Clean up any adhoc-ingested rows.
    await prisma.scholarship.deleteMany({ where: { sourceName: { startsWith: 'adhoc:' } } });
    await prisma.opportunity.deleteMany({ where: { sourceName: { startsWith: 'adhoc:' } } });
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/adhoc')
      .send({ url: 'https://example.com', kind: 'scholarship' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin token', async () => {
    const user = await prisma.user.create({
      data: {
        firstName: 'Regular',
        lastName: 'User',
        email: 'adhoc-test-regular@test.internal',
        passwordHash: 'not-used',
        role: 'STUDENT',
        programme: 'N/A'
      }
    });
    const userToken = signToken({ sub: user.id, role: 'STUDENT' }, { expiresIn: '1h' });
    await prisma.user.deleteMany({ where: { email: 'adhoc-test-regular@test.internal' } });

    const res = await request(app)
      .post('/api/admin/ingest/adhoc')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ url: 'https://example.com', kind: 'scholarship' });
    expect(res.status).toBe(403);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('returns 400 on malformed URL (not http/https)', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/adhoc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'not-a-url', kind: 'scholarship' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing kind field', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/adhoc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid kind value', async () => {
    const res = await request(app)
      .post('/api/admin/ingest/adhoc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://example.com', kind: 'event' });
    expect(res.status).toBe(400);
  });

  // ── Good HTML blob ─────────────────────────────────────────────────────────

  it('returns 200 with itemsFound=3 on a 3-article HTML blob', async () => {
    // Mock fetch so the handler doesn't hit the network.
    const origFetch = global.fetch;
    global.fetch = mock(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/robots.txt')) {
        return new Response('', { status: 404 });
      }
      return new Response(GOOD_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    }) as typeof fetch;

    try {
      const res = await request(app)
        .post('/api/admin/ingest/adhoc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'https://example.com/scholarships', kind: 'scholarship' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemsFound).toBe(3);
      expect(res.body.data.ingestedSample).toBeDefined();
      expect(Array.isArray(res.body.data.ingestedSample)).toBe(true);
    } finally {
      global.fetch = origFetch;
    }
  });

  // ── RSS blob ───────────────────────────────────────────────────────────────

  it('returns 200 with itemsFound=2 on a 2-item RSS feed for jobs', async () => {
    const origFetch = global.fetch;
    global.fetch = mock(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/robots.txt')) {
        return new Response('', { status: 404 });
      }
      return new Response(GOOD_RSS, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' }
      });
    }) as typeof fetch;

    try {
      const res = await request(app)
        .post('/api/admin/ingest/adhoc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'https://jobs.example.com/feed.rss', kind: 'job' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemsFound).toBe(2);
    } finally {
      global.fetch = origFetch;
    }
  });

  // ── Empty HTML — no structure, no title ───────────────────────────────────

  it('returns 200 with itemsFound=0 when HTML has no extractable structure or title', async () => {
    const origFetch = global.fetch;
    global.fetch = mock(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/robots.txt')) {
        return new Response('', { status: 404 });
      }
      return new Response(EMPTY_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    }) as typeof fetch;

    try {
      const res = await request(app)
        .post('/api/admin/ingest/adhoc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'https://example.com/empty', kind: 'scholarship' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemsFound).toBe(0);
      expect(res.body.data.message).toBeDefined();
    } finally {
      global.fetch = origFetch;
    }
  });

  // ── Unreachable URL ────────────────────────────────────────────────────────

  it('returns 400 when fetch returns HTTP 500', async () => {
    const origFetch = global.fetch;
    global.fetch = mock(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/robots.txt')) {
        return new Response('', { status: 404 });
      }
      return new Response('Internal Server Error', { status: 500 });
    }) as typeof fetch;

    try {
      const res = await request(app)
        .post('/api/admin/ingest/adhoc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'https://broken.example.com/page', kind: 'scholarship' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    } finally {
      global.fetch = origFetch;
    }
  });

  // ── Robots blocked ────────────────────────────────────────────────────────

  it('returns 403 when robots.txt blocks ingestion', async () => {
    const origFetch = global.fetch;
    global.fetch = mock(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/robots.txt')) {
        return new Response(
          'User-agent: *\nDisallow: /\n',
          { status: 200, headers: { 'content-type': 'text/plain' } }
        );
      }
      return new Response(GOOD_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;

    try {
      const res = await request(app)
        .post('/api/admin/ingest/adhoc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'https://blocked.example.com/page', kind: 'scholarship' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    } finally {
      global.fetch = origFetch;
    }
  });
});
