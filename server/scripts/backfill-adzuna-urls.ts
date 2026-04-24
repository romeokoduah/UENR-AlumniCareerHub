// One-shot backfill: rewrite INGESTED Opportunity applicationUrls that point
// at Adzuna's details page (/jobs/details/{id}) to the one-click redirector
// (/jobs/land/ad/{id}) which HTTP-301s straight to the employer.
//
// Usage:
//   DATABASE_URL="..." bun scripts/backfill-adzuna-urls.ts
//
// Idempotent: rows that already use /jobs/land/ad/ are left alone.

import { prisma } from '../src/lib/prisma.js';
import { adzunaLandUrlFor } from '../src/lib/ingest/adapters/jobs/adzuna.js';

type Row = { id: string; applicationUrl: string; sourceName: string | null };

async function main() {
  const rows = await prisma.opportunity.findMany({
    where: {
      source: 'INGESTED',
      sourceName: { startsWith: 'adzuna-' }
    },
    select: { id: true, applicationUrl: true, sourceName: true }
  });

  console.log(`[backfill] found ${rows.length} Adzuna-sourced opportunities`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows as Row[]) {
    // Already pointing at the redirector? Skip.
    if (row.applicationUrl.includes('/jobs/land/ad/')) {
      skipped++;
      continue;
    }

    // Derive the country from sourceName (adzuna-ghana, adzuna-remote-africa,
    // adzuna-remote-worldwide). The first two use the UK tenant; the third
    // uses the US tenant.
    const country = row.sourceName === 'adzuna-remote-worldwide' ? 'us' : 'gb';
    const landUrl = adzunaLandUrlFor(country, { redirect_url: row.applicationUrl });
    if (!landUrl) {
      console.warn(`[backfill] SKIP id=${row.id}: could not derive land URL from ${row.applicationUrl}`);
      skipped++;
      continue;
    }

    await prisma.opportunity.update({
      where: { id: row.id },
      data: { applicationUrl: landUrl }
    });
    updated++;
  }

  console.log(`[backfill] updated=${updated} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
