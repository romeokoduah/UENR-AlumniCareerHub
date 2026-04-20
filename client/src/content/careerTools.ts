import {
  FileText, Mail, Layout, Lock,
  Target, BookOpen, Award, Map,
  MessageSquare, Calendar, Brain, DollarSign,
  Rocket, Briefcase, Building2,
  HeartHandshake, FileSearch, Trophy,
  Users
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CareerToolCategory =
  | 'application-materials'
  | 'skills'
  | 'interview'
  | 'ventures'
  | 'support'
  | 'employers';

export type CareerToolStatus = 'coming-soon' | 'beta' | 'live';

export type CareerTool = {
  slug: string;
  name: string;
  description: string;
  category: CareerToolCategory;
  icon: LucideIcon;
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  status: CareerToolStatus;
  employerOnly?: boolean;
};

export const CATEGORY_LABELS: Record<CareerToolCategory, string> = {
  'application-materials': 'Application Materials',
  skills: 'Skills',
  interview: 'Interview',
  ventures: 'Ventures',
  support: 'Support',
  employers: 'Employers'
};

export const CAREER_TOOLS: CareerTool[] = [
  // ===== Application Materials =====
  {
    slug: 'cv-builder',
    name: 'CV / Résumé Builder',
    description: 'Build ATS-friendly résumés with multiple templates and named versions per role.',
    category: 'application-materials',
    icon: FileText,
    phase: 1,
    status: 'live'
  },
  {
    slug: 'cover-letter',
    name: 'Cover Letter Generator',
    description: 'Templates by industry and tone, with structured prompts that fill in the heavy lifting.',
    category: 'application-materials',
    icon: Mail,
    phase: 1,
    status: 'live'
  },
  {
    slug: 'portfolio',
    name: 'Portfolio Builder',
    description: 'Publish a polished portfolio at /p/<slug> — case studies, themes, password gates.',
    category: 'application-materials',
    icon: Layout,
    phase: 1,
    status: 'live'
  },
  {
    slug: 'vault',
    name: 'Document Vault',
    description: 'Secure storage for transcripts, certificates, references — share with expiry and view caps.',
    category: 'application-materials',
    icon: Lock,
    phase: 1,
    status: 'live'
  },

  // ===== Skills & Growth =====
  {
    slug: 'skills',
    name: 'Skills Assessment',
    description: 'Self-rate against a target role and get a gap chart with a prioritized learning plan.',
    category: 'skills',
    icon: Target,
    phase: 2,
    status: 'live'
  },
  {
    slug: 'learn',
    name: 'Learning Hub',
    description: 'Curated courses, videos, and learning paths — Coursera, edX, MEST, Ghana Code Club, more.',
    category: 'skills',
    icon: BookOpen,
    phase: 2,
    status: 'live'
  },
  {
    slug: 'certifications',
    name: 'Certifications Tracker',
    description: 'Track issue + expiry dates, get reminders 90 days out, generate verification links.',
    category: 'skills',
    icon: Award,
    phase: 2,
    status: 'live'
  },
  {
    slug: 'paths',
    name: 'Career Path Explorer',
    description: 'Pick a starting role; see typical next roles, years, salary progression, alumni in the seat.',
    category: 'skills',
    icon: Map,
    phase: 2,
    status: 'live'
  },

  // ===== Interview Prep =====
  {
    slug: 'interview/questions',
    name: 'Interview Question Bank',
    description: 'Searchable bank with sample answers, community notes, and a self-record practice mode.',
    category: 'interview',
    icon: MessageSquare,
    phase: 3,
    status: 'live'
  },
  {
    slug: 'interview/mock',
    name: 'Mock Interview Scheduler',
    description: 'Book mock interviews with UENR alumni mentors — behavioral, technical, panel, case.',
    category: 'interview',
    icon: Calendar,
    phase: 3,
    status: 'live'
  },
  {
    slug: 'aptitude',
    name: 'Aptitude Test Practice',
    description: 'GMAT, GRE, Ghana Civil Service, consulting cases — timed mocks with explanations.',
    category: 'interview',
    icon: Brain,
    phase: 3,
    status: 'live'
  },
  {
    slug: 'salary',
    name: 'Salary Negotiation',
    description: 'Ghana + international benchmarks, cost-of-living calculator, scripts for the hard part.',
    category: 'interview',
    icon: DollarSign,
    phase: 3,
    status: 'live'
  },

  // ===== Ventures =====
  {
    slug: 'ventures/startup',
    name: 'Startup Resources',
    description: 'Pitch decks, fundraising guides, MEST/GIZ/GCIC incubators, Tony Elumelu and more grants.',
    category: 'ventures',
    icon: Rocket,
    phase: 4,
    status: 'live'
  },
  {
    slug: 'ventures/freelance',
    name: 'Freelance Project Board',
    description: 'Post and bid on alumni gigs. Off-platform payment for v1; escrow + MoMo coming soon.',
    category: 'ventures',
    icon: Briefcase,
    phase: 4,
    status: 'live'
  },
  {
    slug: 'ventures/registration',
    name: 'Ghana Business Registration',
    description: 'Step-by-step walkthroughs: RGD, GRA, SSNIT, GIPC, EPA, sector licenses.',
    category: 'ventures',
    icon: Building2,
    phase: 4,
    status: 'live'
  },

  // ===== Support =====
  {
    slug: 'counseling',
    name: 'Career Counseling',
    description: 'Book a slot with UENR Career Services — in-person, video, or phone.',
    category: 'support',
    icon: HeartHandshake,
    phase: 5,
    status: 'coming-soon'
  },
  {
    slug: 'transcripts',
    name: 'Transcripts & Verification',
    description: 'Request transcripts and verification letters. Track status from submission to delivery.',
    category: 'support',
    icon: FileSearch,
    phase: 5,
    status: 'coming-soon'
  },
  {
    slug: 'achievements',
    name: 'Achievements Wall',
    description: 'Promotions, publications, awards, ventures launched — celebrated by the community.',
    category: 'support',
    icon: Trophy,
    phase: 5,
    status: 'coming-soon'
  },

  // ===== Employers =====
  {
    slug: 'ats',
    name: 'Applicant Tracking',
    description: 'Manage applications to your job posts — kanban pipeline, scoring, interviews, offers.',
    category: 'employers',
    icon: Users,
    phase: 6,
    status: 'coming-soon',
    employerOnly: true
  }
];

export function findCareerTool(slug: string): CareerTool | undefined {
  return CAREER_TOOLS.find((t) => t.slug === slug);
}

export function visibleCareerTools(role: string | undefined): CareerTool[] {
  return CAREER_TOOLS.filter((t) => {
    if (!t.employerOnly) return true;
    return role === 'EMPLOYER' || role === 'ADMIN';
  });
}
