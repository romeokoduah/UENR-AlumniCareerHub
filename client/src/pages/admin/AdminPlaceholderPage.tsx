import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

const TITLES: Record<string, { title: string; phase: string; description: string }> = {
  '/admin/moderation': {
    title: 'Universal moderation queue',
    phase: 'Phase 3',
    description: 'One unified queue showing every pending submission across opportunities, scholarships, learning resources, interview questions, achievements, mentor profiles, portfolios, freelance gigs, and reviews. For now, use the per-tool moderation pages in the sidebar.'
  },
  '/admin/data': {
    title: 'Tool data',
    phase: 'Phase 5',
    description: 'CRUD for every curated dataset (skills, roles, learning resources, paths, career nodes, interview questions, aptitude questions, salary benchmarks, deck templates, incubators, grants, biz-reg steps) plus one-click rerun of the eight admin seed endpoints.'
  },
  '/admin/services': {
    title: 'Career Services oversight',
    phase: 'Phase 6',
    description: 'View and edit any counseling booking, transcript request, and certification verify-link across all staff. Today these are scoped to the staff that owns them via the Career Tools pages themselves.'
  },
  '/admin/ats': {
    title: 'ATS oversight',
    phase: 'Phase 6',
    description: 'See every employer\u2019s job posts and applications, force-advance/reject, and view all talent pools. Today the ATS is scoped per-employer.'
  },
  '/admin/site': {
    title: 'Site configuration',
    phase: 'Phase 7',
    description: 'Navigation editor (reorder navbar + mobile tab bar), feature flags, email/SMS templates, and announcement broadcast to a filtered user segment.'
  },
  '/admin/insights': {
    title: 'Insights & audit',
    phase: 'Phase 4',
    description: 'DAU/WAU/MAU charts, per-tool usage from the activity feed, full audit log search and CSV export, universal "find anything" search across users, jobs, applications, certifications, transcripts, and achievements.'
  },
  '/admin/system': {
    title: 'System health',
    phase: 'Phase 8',
    description: 'Vercel/Neon/Blob status, Prisma row counts, last 50 server errors, login history per user, force-logout-everywhere, GDPR-style right-to-be-forgotten purge.'
  }
};

export default function AdminPlaceholderPage() {
  const { pathname } = useLocation();
  const meta = TITLES[pathname] ?? { title: 'Coming soon', phase: '', description: 'This admin section is planned but not yet built.' };

  return (
    <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
      <Construction size={32} className="mx-auto text-[#F59E0B]" />
      <h2 className="mt-4 font-heading text-xl font-bold">{meta.title}</h2>
      {meta.phase && (
        <div className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{meta.phase} of the superuser admin layer</div>
      )}
      <p className="mx-auto mt-4 max-w-xl text-sm text-[var(--muted)]">{meta.description}</p>
    </div>
  );
}
