import { prisma } from '../lib/prisma.js';
import { DEFAULT_LANDING, type LandingContent } from '../lib/landingDefaults.js';

const LANDING_KEY = 'landing';

export async function getLanding(): Promise<LandingContent> {
  const row = await prisma.siteContent.findUnique({ where: { key: LANDING_KEY } });
  if (!row) return DEFAULT_LANDING;
  const stored = row.data as Partial<LandingContent>;
  // Shallow-merge with defaults so fields added in future deploys don't break
  // the site before an admin re-saves.
  return {
    hero: { ...DEFAULT_LANDING.hero, ...stored.hero },
    featuredAlumni: stored.featuredAlumni ?? DEFAULT_LANDING.featuredAlumni,
    story: { ...DEFAULT_LANDING.story, ...stored.story },
    cta: { ...DEFAULT_LANDING.cta, ...stored.cta }
  };
}

export async function saveLanding(content: LandingContent): Promise<LandingContent> {
  await prisma.siteContent.upsert({
    where: { key: LANDING_KEY },
    create: { key: LANDING_KEY, data: content as any },
    update: { data: content as any }
  });
  return content;
}

export async function resetLanding(): Promise<LandingContent> {
  await saveLanding(DEFAULT_LANDING);
  return DEFAULT_LANDING;
}
