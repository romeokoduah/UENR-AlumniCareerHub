// CV Match — deterministic CV-vs-JD analyser. NO AI / LLM CALLS.
//
// Used by /api/cv-match. Reuses the same scoring weights as the ATS recruiter
// scorer (server/src/lib/atsScoring.ts) so a candidate sees one consistent
// "this CV vs this JD" number across both tools.
//
// Pipeline:
//   1. Resolve the CV side (saved CV row OR pasted text) -> snapshot of skills,
//      yearsExperience, summary, programme.
//   2. Resolve the JD side -> required vs preferred skill buckets, jdYears,
//      seniority, top keywords. Skill matching is taxonomy-driven against the
//      curated `Skill` rows so we recognise synonyms (e.g. "JS" -> "JavaScript").
//   3. Score each dimension in [0..1], weight, round to 0..100.
//   4. Emit a deterministic refinement checklist from hand-templated copy.

import { prisma } from './prisma.js';
import { ATS_WEIGHTS } from './atsScoring.js';

// ---- public types --------------------------------------------------------

export type MatchInput = {
  cvSource: 'saved_cv' | 'pasted_text';
  cvId?: string;
  cvText?: string;
  jdSource: 'saved_opportunity' | 'pasted_text';
  opportunityId?: string;
  jdText: string;
  jobTitle?: string;
};

export type MatchBreakdown = {
  required: number;
  preferred: number;
  experience: number;
  education: number;
  location: number;
};

export type Refinement = {
  kind:
    | 'add_skill'
    | 'strengthen_skill'
    | 'quantify_bullet'
    | 'experience_gap'
    | 'education_gap'
    | 'reorder_skill'
    | 'tailor_summary';
  severity: 'high' | 'medium' | 'low';
  message: string;
  skill?: string;
  detail?: string;
};

export type KeywordDensity = {
  keyword: string;
  jdCount: number;
  cvCount: number;
};

export type DerivedFromCv = {
  skills: string[];
  yearsExperience: number;
  programme?: string;
};

export type DerivedFromJd = {
  required: string[];
  preferred: string[];
  yearsRequired?: number;
  seniority?: string;
  jobTitle?: string;
};

export type MatchResult = {
  score: number;
  breakdown: MatchBreakdown;
  refinements: Refinement[];
  missingSkills: string[];
  weakCoverage: string[];
  keywordDensity: KeywordDensity[];
  derivedFromCv: DerivedFromCv;
  derivedFromJd: DerivedFromJd;
};

// ---- helpers -------------------------------------------------------------

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','being','but','by','can','could','did','do','does',
  'doing','done','for','from','had','has','have','having','he','her','hers','him','his','how',
  'i','if','in','into','is','it','its','just','me','my','no','nor','not','of','on','or','our',
  'ours','out','over','own','she','should','so','some','such','than','that','the','their',
  'theirs','them','then','there','these','they','this','those','through','to','too','under',
  'up','very','was','we','were','what','when','where','which','while','who','whom','why','will',
  'with','would','you','your','yours','about','across','after','against','all','also','among',
  'any','because','before','below','between','both','during','each','few','further','here',
  'more','most','other','only','same','until','up','via','within','without','etc','use','using',
  'must','need','required','preferred','responsibilities','requirements','duties','role','job',
  'work','team','ability','strong','good','excellent','years','year','plus','bonus','nice'
]);

function lowerTrim(s: string): string {
  return s.toLowerCase().trim();
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Count case-insensitive, word-boundary-aware occurrences of `needle` in `haystack`.
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'gi');
  const matches = haystack.match(re);
  return matches ? matches.length : 0;
}

// Year extracted from a CV "start"/"end" string. Accepts "2023-04",
// "2023/04/01", "Jan 2023", or just "2023". Returns null if nothing recognised.
function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(/(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  if (Number.isFinite(y) && y > 1950 && y < 2100) return y;
  return null;
}

// ---- CV-side extraction --------------------------------------------------

type CvSnapshot = {
  skills: string[];           // lowercased
  skillsOriginal: string[];   // preserved order/casing — used for reorder hints
  yearsExperience: number;
  programme?: string;
  summary?: string;
  fullText: string;           // concatenation used for keyword density + quantified-bullet check
};

type SavedCvData = {
  personal?: { fullName?: string; location?: string };
  summary?: string;
  experience?: Array<{
    company?: string;
    role?: string;
    location?: string;
    start?: string;
    end?: string;
    current?: boolean;
    bullets?: string[];
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    field?: string;
    start?: string;
    end?: string;
    gpa?: string;
  }>;
  skills?: string[];
  projects?: Array<{ name?: string; description?: string; tech?: string[] }>;
  certifications?: Array<{ name?: string; issuer?: string }>;
};

function snapshotFromSavedCv(cvData: SavedCvData, baselineSkills: string[]): CvSnapshot {
  const skillsOriginal = Array.isArray(cvData.skills) ? cvData.skills.map(String).filter(Boolean) : [];
  const skills = uniq([
    ...skillsOriginal.map(lowerTrim),
    ...baselineSkills.map(lowerTrim)
  ]).filter(Boolean);

  // Years experience: sum of (end - start) per entry. `current` rows treat
  // the current calendar year as end. Negative diffs are clamped to 0.
  const nowYear = new Date().getUTCFullYear();
  let years = 0;
  for (const exp of cvData.experience ?? []) {
    const startY = parseYear(exp.start);
    const endY = exp.current ? nowYear : parseYear(exp.end);
    if (startY != null && endY != null) {
      years += Math.max(0, endY - startY);
    }
  }

  const programme = cvData.education?.find((e) => e.degree || e.field)
    ? [cvData.education[0].degree, cvData.education[0].field].filter(Boolean).join(' ').trim() || undefined
    : undefined;

  const fullTextParts: string[] = [];
  if (cvData.summary) fullTextParts.push(cvData.summary);
  if (cvData.personal?.fullName) fullTextParts.push(cvData.personal.fullName);
  for (const exp of cvData.experience ?? []) {
    fullTextParts.push([exp.role, exp.company, exp.location].filter(Boolean).join(' '));
    if (exp.bullets?.length) fullTextParts.push(exp.bullets.join('\n'));
  }
  for (const edu of cvData.education ?? []) {
    fullTextParts.push([edu.degree, edu.field, edu.school].filter(Boolean).join(' '));
  }
  fullTextParts.push(skillsOriginal.join(', '));
  for (const proj of cvData.projects ?? []) {
    fullTextParts.push([proj.name, proj.description, proj.tech?.join(' ')].filter(Boolean).join(' '));
  }
  for (const cert of cvData.certifications ?? []) {
    fullTextParts.push([cert.name, cert.issuer].filter(Boolean).join(' '));
  }

  return {
    skills,
    skillsOriginal,
    yearsExperience: years,
    programme,
    summary: cvData.summary || undefined,
    fullText: fullTextParts.filter(Boolean).join('\n')
  };
}

function snapshotFromPastedCv(text: string, baselineSkills: string[], taxonomy: TaxonomyEntry[]): CvSnapshot {
  // Years: pick the largest "<n>+ years (of) experience/exp" hit, fallback 0.
  const yearRe = /(\d{1,2})\+?\s*years?\s+(?:of\s+)?(?:experience|exp\b)/gi;
  let years = 0;
  let m: RegExpExecArray | null;
  while ((m = yearRe.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > years) years = n;
  }

  // Programme: BSc/BA/MSc/MBA/PhD followed by a short field name.
  const progRe = /\b(BSc|BA|MSc|MBA|PhD|MEng|BEng)\b\s+((?:[A-Z][A-Za-z]+\s*){1,4})/;
  const progMatch = text.match(progRe);
  const programme = progMatch ? `${progMatch[1]} ${progMatch[2].trim()}` : undefined;

  // Skills: scan the taxonomy and accept anything matched in the body.
  const matchedSkills = scanTaxonomy(text, taxonomy);
  const skills = uniq([
    ...matchedSkills.map((s) => s.canonical.toLowerCase()),
    ...baselineSkills.map(lowerTrim)
  ]).filter(Boolean);

  return {
    skills,
    skillsOriginal: matchedSkills.map((s) => s.canonical),
    yearsExperience: years,
    programme,
    summary: undefined,
    fullText: text
  };
}

// ---- JD-side extraction --------------------------------------------------

type TaxonomyEntry = {
  canonical: string;
  surfaces: string[];
};

async function loadTaxonomy(): Promise<TaxonomyEntry[]> {
  const rows = await prisma.skill.findMany({ select: { name: true, synonyms: true } });
  return rows.map((r) => ({
    canonical: r.name,
    // Build a unique, lowercased surface list (canonical + synonyms). We keep
    // them lowercase here so the regex builder doesn't have to think about it.
    surfaces: uniq(
      [r.name, ...(r.synonyms ?? [])]
        .map((s) => lowerTrim(s))
        .filter((s) => s.length >= 2)
    )
  }));
}

type TaxonomyHit = {
  canonical: string;
  count: number;
};

// Run the taxonomy across an arbitrary blob of text. A canonical skill
// "wins" if any of its surfaces match — counts are summed across surfaces.
function scanTaxonomy(text: string, taxonomy: TaxonomyEntry[]): TaxonomyHit[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits: TaxonomyHit[] = [];
  for (const entry of taxonomy) {
    let total = 0;
    for (const surface of entry.surfaces) {
      total += countOccurrences(lower, surface);
    }
    if (total > 0) hits.push({ canonical: entry.canonical, count: total });
  }
  return hits;
}

type JdSnapshot = {
  required: string[];   // canonical names, lowercased
  preferred: string[];  // canonical names, lowercased
  jdHits: Map<string, number>; // canonical lowercased -> total occurrences
  yearsRequired?: number;
  seniority?: string;
};

const REQUIRED_HEADER_RE = /\b(requir|must\s*have|minimum|essential)\w*\b/gi;
const PREFERRED_HEADER_RE = /\b(prefer|nice\s*to\s*have|bonus|plus|good\s*to\s*have)\w*\b/gi;
const SECTION_WINDOW = 200;

function collectHeaderWindows(text: string, re: RegExp): string {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    out.push(text.slice(m.index, m.index + SECTION_WINDOW));
  }
  return out.join('\n').toLowerCase();
}

function snapshotJd(jdText: string, jobTitle: string | undefined, taxonomy: TaxonomyEntry[]): JdSnapshot {
  const text = jdText || '';
  const requiredWindow = collectHeaderWindows(text, REQUIRED_HEADER_RE);
  const preferredWindow = collectHeaderWindows(text, PREFERRED_HEADER_RE);

  const allHits = scanTaxonomy(text, taxonomy);
  const jdHits = new Map<string, number>();
  for (const h of allHits) jdHits.set(h.canonical.toLowerCase(), h.count);

  const required: string[] = [];
  const preferred: string[] = [];

  for (const entry of taxonomy) {
    const total = jdHits.get(entry.canonical.toLowerCase()) ?? 0;
    if (total === 0) continue;

    const inRequiredHeader = entry.surfaces.some((s) => countOccurrences(requiredWindow, s) > 0);
    const inPreferredHeader = entry.surfaces.some((s) => countOccurrences(preferredWindow, s) > 0);

    // Required wins if:
    //   - the skill appears under a "required/must have/minimum/essential" section, OR
    //   - it's mentioned 3+ times anywhere in the JD.
    if (inRequiredHeader || total >= 3) {
      required.push(entry.canonical.toLowerCase());
    } else if (inPreferredHeader || total >= 1) {
      preferred.push(entry.canonical.toLowerCase());
    }
  }

  // Years required: largest "<n>+ years" hit anywhere in the JD.
  const yrRe = /(\d{1,2})\+?\s*years?/gi;
  let yearsRequired: number | undefined;
  let mm: RegExpExecArray | null;
  while ((mm = yrRe.exec(text)) !== null) {
    const n = Number(mm[1]);
    if (Number.isFinite(n) && (yearsRequired === undefined || n > yearsRequired)) {
      yearsRequired = n;
    }
  }

  // Seniority hint: scan title + first 500 chars of body.
  const seniorityScope = `${jobTitle ?? ''} ${text.slice(0, 500)}`.toLowerCase();
  const senMatch = seniorityScope.match(/\b(intern|junior|jnr|mid|senior|snr|lead|principal|head|director)\b/);
  const seniority = senMatch ? senMatch[1] : undefined;

  return {
    required: uniq(required),
    preferred: uniq(preferred.filter((s) => !required.includes(s))),
    jdHits,
    yearsRequired,
    seniority
  };
}

// ---- keyword density -----------------------------------------------------

function tokenizeForPhrases(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#./-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w) && w.length > 1);
}

function topKeywordPhrases(jdText: string, cvText: string, take: number): KeywordDensity[] {
  const tokens = tokenizeForPhrases(jdText);
  const counts = new Map<string, number>();
  // 1-, 2-, and 3-word windows.
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const slice = tokens.slice(i, i + n);
      // Drop phrases that contain any stop word (catches "in the X" etc.).
      if (slice.some((t) => STOP_WORDS.has(t))) continue;
      const key = slice.join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const sorted = Array.from(counts.entries())
    .filter(([, c]) => c >= 2 || true) // keep all single occurrences too — top N filters
    .sort((a, b) => {
      // Prefer multi-word phrases on ties (they're more informative).
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].split(' ').length - a[0].split(' ').length;
    })
    .slice(0, take);
  return sorted.map(([keyword, jdCount]) => ({
    keyword,
    jdCount,
    cvCount: countOccurrences(cvText.toLowerCase(), keyword)
  }));
}

// ---- refinements ---------------------------------------------------------

const SEVERITY_RANK: Record<Refinement['severity'], number> = { high: 0, medium: 1, low: 2 };
const KIND_RANK: Record<Refinement['kind'], number> = {
  add_skill: 0,
  experience_gap: 1,
  strengthen_skill: 2,
  reorder_skill: 3,
  quantify_bullet: 4,
  tailor_summary: 5,
  education_gap: 6
};

const QUANTIFIED_RE = /\d+%|\d+\+?\s*(users|customers|clients|tons|kw|mw|ghs|usd|projects|reports|hours|leads|orders|sales|tickets|cases)/i;

function buildRefinements(
  cv: CvSnapshot,
  jd: JdSnapshot,
  jdHits: Map<string, number>,
  hasGradYear: boolean,
  hasProgramme: boolean
): { refinements: Refinement[]; missingSkills: string[]; weakCoverage: string[] } {
  const refinements: Refinement[] = [];
  const missingSkills: string[] = [];
  const weakCoverage: string[] = [];

  const cvSkillSet = new Set(cv.skills);
  const cvLower = cv.fullText.toLowerCase();

  for (const skillLower of jd.required) {
    const jdCount = jdHits.get(skillLower) ?? 0;
    const inCv = cvSkillSet.has(skillLower);
    const cvMentions = countOccurrences(cvLower, skillLower);

    if (!inCv) {
      missingSkills.push(skillLower);
      refinements.push({
        kind: 'add_skill',
        severity: 'high',
        skill: skillLower,
        message: `Add ${skillLower} to your skills section — the JD mentions it ${jdCount} time${jdCount === 1 ? '' : 's'}.`,
        detail: 'Listed as a required skill in the job description.'
      });
    } else if (cvMentions <= 1 && jdCount >= 2) {
      weakCoverage.push(skillLower);
      refinements.push({
        kind: 'strengthen_skill',
        severity: 'medium',
        skill: skillLower,
        message: `Strengthen ${skillLower} — JD mentions it ${jdCount} times but your CV mentions it only once. Consider a dedicated experience bullet.`
      });
    }

    // Reorder hint: in CV, but in the bottom half of the displayed skills list.
    const idx = cv.skillsOriginal.findIndex((s) => lowerTrim(s) === skillLower);
    if (idx >= 0 && cv.skillsOriginal.length >= 4 && idx >= Math.ceil(cv.skillsOriginal.length / 2)) {
      refinements.push({
        kind: 'reorder_skill',
        severity: 'low',
        skill: skillLower,
        message: `Move ${skillLower} to the top of your skills section — it's a required skill for this role.`
      });
    }
  }

  // Experience gap: 2+ years short of the JD ask.
  if (jd.yearsRequired != null && cv.yearsExperience + 2 <= jd.yearsRequired) {
    refinements.push({
      kind: 'experience_gap',
      severity: 'high',
      message: `Your CV shows ${cv.yearsExperience} year${cv.yearsExperience === 1 ? '' : 's'}; the JD asks for ${jd.yearsRequired}+. Consider whether you should apply now or look at a junior version of this role.`
    });
  }

  // Quantified bullet check.
  if (!QUANTIFIED_RE.test(cv.fullText)) {
    refinements.push({
      kind: 'quantify_bullet',
      severity: 'medium',
      message: 'Add a number to at least one experience bullet — quantified results stand out.'
    });
  }

  // Education gap (informational only — CV side only, since we skip JD-side check in v1).
  if (!hasGradYear && !hasProgramme) {
    refinements.push({
      kind: 'education_gap',
      severity: 'low',
      message: 'Add your programme and graduation year to your profile so recruiters can confirm your education.'
    });
  }

  // Tailor-summary hint when the JD seniority is set and the CV summary
  // doesn't mention it.
  if (cv.summary && jd.seniority) {
    if (!new RegExp(`\\b${jd.seniority}\\b`, 'i').test(cv.summary)) {
      refinements.push({
        kind: 'tailor_summary',
        severity: 'low',
        message: `Tailor your summary — the JD targets ${jd.seniority} candidates but your summary doesn't reflect that.`
      });
    }
  }

  refinements.sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) {
      return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    }
    return (a.skill ?? '').localeCompare(b.skill ?? '');
  });

  return {
    refinements: refinements.slice(0, 12),
    missingSkills: uniq(missingSkills),
    weakCoverage: uniq(weakCoverage)
  };
}

// ---- main entry point ----------------------------------------------------

export async function runCvMatch(userId: string, input: MatchInput): Promise<MatchResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, skills: true, programme: true, graduationYear: true }
  });
  if (!user) {
    throw new Error('User not found');
  }
  const baselineSkills = user.skills ?? [];

  const taxonomy = await loadTaxonomy();

  // ---- CV side ----
  let cv: CvSnapshot;
  if (input.cvSource === 'saved_cv') {
    if (!input.cvId) {
      throw new Error('cvId is required when cvSource is saved_cv');
    }
    const cvRow = await prisma.cV.findFirst({
      where: { id: input.cvId, userId },
      select: { data: true }
    });
    if (!cvRow) {
      throw new Error('CV not found');
    }
    cv = snapshotFromSavedCv((cvRow.data ?? {}) as SavedCvData, baselineSkills);
  } else {
    if (!input.cvText || !input.cvText.trim()) {
      throw new Error('cvText is required when cvSource is pasted_text');
    }
    cv = snapshotFromPastedCv(input.cvText, baselineSkills, taxonomy);
  }

  // ---- JD side ----
  let jdText = input.jdText;
  let jobTitle = input.jobTitle;
  if (input.jdSource === 'saved_opportunity') {
    if (!input.opportunityId) {
      throw new Error('opportunityId is required when jdSource is saved_opportunity');
    }
    const opp = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: {
        title: true,
        description: true,
        requiredSkills: true,
        preferredSkills: true
      }
    });
    if (!opp) {
      throw new Error('Opportunity not found');
    }
    // Compose a JD blob that includes both the description and any explicit
    // required/preferred lists so taxonomy scanning still works on opportunities
    // whose long-form description omits the skill words verbatim.
    jdText = [
      opp.description,
      opp.requiredSkills?.length ? `Required: ${opp.requiredSkills.join(', ')}` : '',
      opp.preferredSkills?.length ? `Preferred: ${opp.preferredSkills.join(', ')}` : ''
    ].filter(Boolean).join('\n\n');
    if (!jobTitle) jobTitle = opp.title;
  }

  const jd = snapshotJd(jdText, jobTitle, taxonomy);

  // ---- scoring ----
  // Required: |cv ∩ jd_required| / |jd_required|. Empty list => full credit
  // so a JD without explicit required skills doesn't sink the score.
  const requiredScore = jd.required.length === 0
    ? 1
    : jd.required.filter((s) => cv.skills.includes(s)).length / jd.required.length;

  const preferredScore = jd.preferred.length === 0
    ? 1
    : jd.preferred.filter((s) => cv.skills.includes(s)).length / jd.preferred.length;

  const experienceScore = jd.yearsRequired == null
    ? 1
    : Math.max(0, Math.min(1, cv.yearsExperience / jd.yearsRequired));

  const hasGradYear = !!user.graduationYear;
  const hasProgramme = !!user.programme?.trim();
  const educationScore = hasGradYear && hasProgramme
    ? 1
    : (hasGradYear || hasProgramme ? 0.5 : 0);

  // CV Match isn't location-aware in v1 — both sides may not even have a
  // location. We leave full credit so a remote-friendly tool doesn't punish
  // the candidate for the missing dimension.
  const locationScore = 1;

  const breakdown: MatchBreakdown = {
    required: requiredScore,
    preferred: preferredScore,
    experience: experienceScore,
    education: educationScore,
    location: locationScore
  };

  const weighted =
    ATS_WEIGHTS.requiredSkillMatchPct * requiredScore +
    ATS_WEIGHTS.preferredSkillMatchPct * preferredScore +
    ATS_WEIGHTS.experienceMatch * experienceScore +
    ATS_WEIGHTS.educationMatch * educationScore +
    ATS_WEIGHTS.locationMatch * locationScore;

  const score = Math.round(weighted * 100);

  // ---- refinements & extras ----
  const { refinements, missingSkills, weakCoverage } = buildRefinements(
    cv,
    jd,
    jd.jdHits,
    hasGradYear,
    hasProgramme
  );

  const keywordDensity = topKeywordPhrases(jdText, cv.fullText, 10);

  return {
    score,
    breakdown,
    refinements,
    missingSkills,
    weakCoverage,
    keywordDensity,
    derivedFromCv: {
      skills: cv.skills,
      yearsExperience: cv.yearsExperience,
      programme: cv.programme
    },
    derivedFromJd: {
      required: jd.required,
      preferred: jd.preferred,
      yearsRequired: jd.yearsRequired,
      seniority: jd.seniority,
      jobTitle
    }
  };
}
