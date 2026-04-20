// ATS recruiter-score helper. Deterministic, no AI/LLM calls.
//
// scoreApplication(application, opportunity, applicantUser) returns:
//   { score: 0-100, breakdown: { requiredSkillMatchPct, preferredSkillMatchPct,
//                                 experienceMatch, educationMatch, locationMatch,
//                                 weights } }
//
// Weights:
//   required skills      0.50
//   preferred skills     0.20
//   experience           0.15
//   education            0.10
//   location             0.05
//
// All matching is case-insensitive, lowercased, exact-string (synonyms
// can be added in v2 by walking the Skill.synonyms taxonomy).

type ApplicantLike = {
  skills?: string[] | null;
  programme?: string | null;
  graduationYear?: number | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  bio?: string | null;
};

type OpportunityLike = {
  requiredSkills?: string[] | null;
  preferredSkills?: string[] | null;
  location?: string | null;
  locationType?: 'REMOTE' | 'ONSITE' | 'HYBRID' | null;
};

export const ATS_WEIGHTS = {
  requiredSkillMatchPct: 0.5,
  preferredSkillMatchPct: 0.2,
  experienceMatch: 0.15,
  educationMatch: 0.1,
  locationMatch: 0.05
} as const;

export type AtsScoreBreakdown = {
  requiredSkillMatchPct: number;
  preferredSkillMatchPct: number;
  experienceMatch: number;
  educationMatch: number;
  locationMatch: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  weights: typeof ATS_WEIGHTS;
};

function lower(set: (string | null | undefined)[] | null | undefined): string[] {
  if (!set) return [];
  return set
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim().toLowerCase());
}

function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of a) {
    if (setB.has(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

export function scoreApplication(
  _application: unknown, // reserved for v2 (custom answers, CV parse, etc.)
  opportunity: OpportunityLike,
  applicant: ApplicantLike
): { score: number; breakdown: AtsScoreBreakdown } {
  const applicantSkills = lower(applicant.skills);
  const required = lower(opportunity.requiredSkills);
  const preferred = lower(opportunity.preferredSkills);

  const matchedRequired = intersect(applicantSkills, required);
  const matchedPreferred = intersect(applicantSkills, preferred);
  const missingRequired = required.filter((s) => !applicantSkills.includes(s));

  // If a job lists no required/preferred skills, treat that dimension as a
  // full match so the candidate isn't penalised for the recruiter's omission.
  const requiredSkillMatchPct =
    required.length === 0 ? 1 : pct(matchedRequired.length, required.length);
  const preferredSkillMatchPct =
    preferred.length === 0 ? 1 : pct(matchedPreferred.length, preferred.length);

  // Experience: strong if both currentRole + currentCompany set; partial if
  // either or if the bio mentions experience hints.
  const hasRole = !!applicant.currentRole?.trim();
  const hasCompany = !!applicant.currentCompany?.trim();
  let experienceMatch: number;
  if (hasRole && hasCompany) experienceMatch = 1.0;
  else if (hasRole || hasCompany || (applicant.bio && /experience|worked|intern/i.test(applicant.bio))) {
    experienceMatch = 0.5;
  } else {
    experienceMatch = 0.0;
  }

  // Education
  const hasGradYear = !!applicant.graduationYear;
  const hasProgramme = !!applicant.programme?.trim();
  let educationMatch: number;
  if (hasGradYear && hasProgramme) educationMatch = 1.0;
  else if (hasGradYear || hasProgramme) educationMatch = 0.5;
  else educationMatch = 0.0;

  // Location
  const oppLocation = (opportunity.location ?? '').toLowerCase().trim();
  const userLocation = (applicant.location ?? '').toLowerCase().trim();
  let locationMatch: number;
  if (opportunity.locationType === 'REMOTE') {
    locationMatch = 1.0;
  } else if (
    oppLocation &&
    userLocation &&
    (oppLocation === userLocation ||
      oppLocation.includes(userLocation) ||
      userLocation.includes(oppLocation))
  ) {
    locationMatch = 1.0;
  } else if (opportunity.locationType === 'HYBRID') {
    locationMatch = 0.5;
  } else {
    locationMatch = 0.3;
  }

  const weighted =
    ATS_WEIGHTS.requiredSkillMatchPct * requiredSkillMatchPct +
    ATS_WEIGHTS.preferredSkillMatchPct * preferredSkillMatchPct +
    ATS_WEIGHTS.experienceMatch * experienceMatch +
    ATS_WEIGHTS.educationMatch * educationMatch +
    ATS_WEIGHTS.locationMatch * locationMatch;

  const score = Math.round(weighted * 100);

  return {
    score,
    breakdown: {
      requiredSkillMatchPct,
      preferredSkillMatchPct,
      experienceMatch,
      educationMatch,
      locationMatch,
      matchedRequired,
      missingRequired,
      matchedPreferred,
      weights: ATS_WEIGHTS
    }
  };
}
