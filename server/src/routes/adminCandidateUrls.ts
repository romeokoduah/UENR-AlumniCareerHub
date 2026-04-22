// Admin candidate URL list — CRUD + scan endpoint.
// Mounted at /api/admin/ingest/candidates.
// Auth: requireAuth + requireRole('ADMIN').
//
// The candidate URL list is stored in SiteContent under key 'ingest-candidate-urls'.
// Shape: { urls: Array<{ url, kind, label? }> }
//
// Endpoints:
//   GET  /          — list current candidate URLs
//   POST /          — append a new candidate URL (dedupe by canonical url)
//   DELETE /:encoded — remove a candidate URL (url is encodeURIComponent'd)
//   POST /scan      — iterate all candidates through ingestAdhocUrl, return per-URL results

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ingestAdhocUrl } from '../lib/ingest/adhoc.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

const SITE_CONTENT_KEY = 'ingest-candidate-urls';

type CandidateUrl = {
  url: string;
  kind: 'scholarship' | 'job';
  label?: string;
};

type CandidateData = {
  urls: CandidateUrl[];
};

async function getCandidates(): Promise<CandidateData> {
  const row = await prisma.siteContent.findUnique({ where: { key: SITE_CONTENT_KEY } });
  if (!row) return { urls: [] };
  const data = row.data as unknown as CandidateData;
  return data ?? { urls: [] };
}

async function saveCandidates(data: CandidateData): Promise<void> {
  await prisma.siteContent.upsert({
    where: { key: SITE_CONTENT_KEY },
    update: { data: data as unknown as object },
    create: { key: SITE_CONTENT_KEY, data: data as unknown as object }
  });
}

// GET /api/admin/ingest/candidates
router.get('/', async (_req, res, next) => {
  try {
    const data = await getCandidates();
    res.json({ success: true, data: data.urls });
  } catch (e) { next(e); }
});

// POST /api/admin/ingest/candidates
const addSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  kind: z.enum(['scholarship', 'job']),
  label: z.string().optional()
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid body' } });
    }
    const { url, kind, label } = parsed.data;

    const data = await getCandidates();
    // Dedupe by normalized URL (lowercase, no trailing slash)
    const normalize = (u: string) => u.toLowerCase().replace(/\/+$/, '');
    const normalizedNew = normalize(url);
    if (data.urls.some((c) => normalize(c.url) === normalizedNew)) {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'URL already in candidate list' } });
    }

    data.urls.push({ url, kind, label });
    await saveCandidates(data);

    res.json({ success: true, data: data.urls });
  } catch (e) { next(e); }
});

// DELETE /api/admin/ingest/candidates/:encodedUrl
router.delete('/:encodedUrl', async (req, res, next) => {
  try {
    const url = decodeURIComponent(req.params.encodedUrl);
    const data = await getCandidates();
    const normalize = (u: string) => u.toLowerCase().replace(/\/+$/, '');
    const normalizedTarget = normalize(url);
    const before = data.urls.length;
    data.urls = data.urls.filter((c) => normalize(c.url) !== normalizedTarget);

    if (data.urls.length === before) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'URL not found in candidate list' } });
    }

    await saveCandidates(data);
    res.json({ success: true, data: data.urls });
  } catch (e) { next(e); }
});

// POST /api/admin/ingest/candidates/bulk
// Bulk-import candidate URLs from a parsed CSV. Dedupes against existing list.
const bulkImportSchema = z.object({
  items: z.array(z.object({
    url: z.string().url('Each item must have a valid URL'),
    kind: z.enum(['scholarship', 'job']),
    label: z.string().optional()
  })).min(1, 'items must not be empty')
});

router.post('/bulk', async (req, res, next) => {
  try {
    const parsed = bulkImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid body' } });
    }
    const { items } = parsed.data;
    const normalize = (u: string) => u.toLowerCase().replace(/\/+$/, '');
    const data = await getCandidates();
    const existingNorm = new Set(data.urls.map((c) => normalize(c.url)));

    let added = 0;
    let skipped = 0;
    for (const item of items) {
      const n = normalize(item.url);
      if (existingNorm.has(n)) {
        skipped++;
      } else {
        data.urls.push({ url: item.url, kind: item.kind, label: item.label });
        existingNorm.add(n);
        added++;
      }
    }

    if (added > 0) {
      await saveCandidates(data);
    }

    res.json({ success: true, data: { added, skipped } });
  } catch (e) { next(e); }
});

// POST /api/admin/ingest/candidates/scan
type ScanResult = {
  url: string;
  kind: string;
  label?: string;
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
  error?: string;
};

router.post('/scan', async (_req, res, next) => {
  try {
    const data = await getCandidates();
    const results: ScanResult[] = [];

    for (const candidate of data.urls) {
      try {
        const result = await ingestAdhocUrl(candidate.url, candidate.kind);
        results.push({
          url: candidate.url,
          kind: candidate.kind,
          label: candidate.label,
          itemsFound: result.itemsFound,
          itemsPublished: result.itemsPublished,
          itemsQueued: result.itemsQueued,
          itemsRejected: result.itemsRejected
        });
      } catch (err: unknown) {
        results.push({
          url: candidate.url,
          kind: candidate.kind,
          label: candidate.label,
          itemsFound: 0,
          itemsPublished: 0,
          itemsQueued: 0,
          itemsRejected: 0,
          error: (err as Error).message ?? 'Unknown error'
        });
      }
    }

    res.json({ success: true, data: { results } });
  } catch (e) { next(e); }
});

export default router;
