// Shared CV data shape used by the editor, the live preview, and the print view.
// Stored verbatim in CV.data (Json) on the server.

export type CVTemplate = 'modern' | 'classic' | 'ats-pure';

export type Personal = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
};

export type ExperienceEntry = {
  id: string;
  company: string;
  role: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  bullets: string[];
};

export type EducationEntry = {
  id: string;
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
  gpa: string;
};

export type ProjectEntry = {
  id: string;
  name: string;
  description: string;
  link: string;
  tech: string[];
};

export type CertificationEntry = {
  id: string;
  name: string;
  issuer: string;
  date: string;
  url: string;
};

export type LanguageEntry = {
  id: string;
  language: string;
  proficiency: string;
};

export type SectionKind =
  | 'personal'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages';

export type CVData = {
  personal: Personal;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  projects: ProjectEntry[];
  certifications: CertificationEntry[];
  languages: LanguageEntry[];
  // Order of sections (excluding personal, which is always first).
  sectionOrder: Exclude<SectionKind, 'personal'>[];
};

export type CVRecord = {
  id: string;
  userId: string;
  title: string;
  template: CVTemplate;
  data: CVData;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SECTION_LABELS: Record<SectionKind, string> = {
  personal: 'Personal Details',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages'
};

export const ALL_OPTIONAL_SECTIONS: Exclude<SectionKind, 'personal'>[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages'
];

export const TEMPLATE_LABELS: Record<CVTemplate, string> = {
  modern: 'Modern',
  classic: 'Classic',
  'ats-pure': 'ATS Pure'
};

export const TEMPLATE_DESCRIPTIONS: Record<CVTemplate, string> = {
  modern: 'Two-column with accent header. Great for design-aware roles.',
  classic: 'Single-column, serif typography. Timeless and recruiter-friendly.',
  'ats-pure': 'Plain, semantic markup. Maximum compatibility with ATS scanners.'
};

// Tiny id helper (no extra dep). Only needs to be unique within a single CV.
export function makeId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function emptyCVData(): CVData {
  return {
    personal: {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      website: ''
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    sectionOrder: [...ALL_OPTIONAL_SECTIONS]
  };
}

// Defensive normalizer — older CVs in the DB used a flat shape.
// We coerce anything we can find into the new structure so legacy rows still load.
export function normalizeCVData(raw: unknown): CVData {
  const base = emptyCVData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;

  // Legacy flat shape (fullName, email, ... at the top level)
  if (typeof r.fullName === 'string' || typeof r.summary === 'string' && !r.personal) {
    base.personal.fullName = r.fullName ?? '';
    base.personal.email = r.email ?? '';
    base.personal.phone = r.phone ?? '';
    base.personal.location = r.location ?? '';
    base.summary = typeof r.summary === 'string' ? r.summary : '';
    return base;
  }

  if (r.personal && typeof r.personal === 'object') {
    base.personal = { ...base.personal, ...r.personal };
  }
  if (typeof r.summary === 'string') base.summary = r.summary;
  if (Array.isArray(r.experience)) {
    base.experience = r.experience.map((e: any) => ({
      id: e.id || makeId('exp'),
      company: e.company ?? '',
      role: e.role ?? '',
      location: e.location ?? '',
      start: e.start ?? '',
      end: e.end ?? '',
      current: Boolean(e.current),
      bullets: Array.isArray(e.bullets) ? e.bullets.map(String) : []
    }));
  }
  if (Array.isArray(r.education)) {
    base.education = r.education.map((e: any) => ({
      id: e.id || makeId('edu'),
      school: e.school ?? '',
      degree: e.degree ?? '',
      field: e.field ?? '',
      start: e.start ?? '',
      end: e.end ?? '',
      gpa: e.gpa ?? ''
    }));
  }
  if (Array.isArray(r.skills)) base.skills = r.skills.map(String);
  if (Array.isArray(r.projects)) {
    base.projects = r.projects.map((p: any) => ({
      id: p.id || makeId('prj'),
      name: p.name ?? '',
      description: p.description ?? '',
      link: p.link ?? '',
      tech: Array.isArray(p.tech) ? p.tech.map(String) : []
    }));
  }
  if (Array.isArray(r.certifications)) {
    base.certifications = r.certifications.map((c: any) => ({
      id: c.id || makeId('cert'),
      name: c.name ?? '',
      issuer: c.issuer ?? '',
      date: c.date ?? '',
      url: c.url ?? ''
    }));
  }
  if (Array.isArray(r.languages)) {
    base.languages = r.languages.map((l: any) => ({
      id: l.id || makeId('lang'),
      language: l.language ?? '',
      proficiency: l.proficiency ?? ''
    }));
  }
  if (Array.isArray(r.sectionOrder)) {
    const valid = r.sectionOrder.filter((s: any) =>
      ALL_OPTIONAL_SECTIONS.includes(s)
    ) as Exclude<SectionKind, 'personal'>[];
    // Append missing sections at the end so we never lose access.
    const missing = ALL_OPTIONAL_SECTIONS.filter((s) => !valid.includes(s));
    base.sectionOrder = [...valid, ...missing];
  }
  return base;
}
