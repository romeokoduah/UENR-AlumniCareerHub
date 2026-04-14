import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_LANDING, type LandingContent } from '../lib/landingDefaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Override with DATA_DIR env var in production (e.g. Render persistent disk
// mounted at /data/content). Defaults to server/data in dev.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../data');
const LANDING_FILE = path.join(DATA_DIR, 'landing.json');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getLanding(): Promise<LandingContent> {
  try {
    const raw = await fs.readFile(LANDING_FILE, 'utf-8');
    const stored = JSON.parse(raw) as Partial<LandingContent>;
    // Shallow merge with defaults so new fields added later don't break old saves
    return {
      hero: { ...DEFAULT_LANDING.hero, ...stored.hero },
      featuredAlumni: stored.featuredAlumni ?? DEFAULT_LANDING.featuredAlumni,
      story: { ...DEFAULT_LANDING.story, ...stored.story },
      cta: { ...DEFAULT_LANDING.cta, ...stored.cta }
    };
  } catch {
    return DEFAULT_LANDING;
  }
}

export async function saveLanding(content: LandingContent): Promise<LandingContent> {
  await ensureDir();
  await fs.writeFile(LANDING_FILE, JSON.stringify(content, null, 2), 'utf-8');
  return content;
}

export async function resetLanding(): Promise<LandingContent> {
  await ensureDir();
  await fs.writeFile(LANDING_FILE, JSON.stringify(DEFAULT_LANDING, null, 2), 'utf-8');
  return DEFAULT_LANDING;
}
