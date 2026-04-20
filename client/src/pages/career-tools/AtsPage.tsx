// Applicant Tracking System (ATS) — employer hub.
//
// Lists the employer's posted jobs with stage-count pills + a Talent Pool
// tab. Each job links to the per-job kanban board at
// /career-tools/ats/jobs/:jobId.
//
// Replaces the placeholder at /career-tools/ats. Employer-only via
// RequireAuth roles=['EMPLOYER','ADMIN'] in App.tsx.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Users, Briefcase, Plus, Trash2, ExternalLink, Sparkles,
  CalendarClock
} from 'lucide-react';
import { api } from '../../services/api';

const TOOL_SLUG = 'ats';

const STAGE_LABEL: Record<string, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn'
};
const VISIBLE_STAGES = ['APPLIED', 'UNDER_REVIEW', 'INTERVIEW', 'OFFER'] as const;

type JobRow = {
  id: string;
  title: string;
  company: string;
  deadline: string;
  isActive: boolean;
  isFeatured: boolean;
  anonymousApplications: boolean;
  createdAt: string;
  lastApplicationAt: string | null;
  totalApplications: number;
  stageCounts: Record<string, number>;
};

type PoolEntry = {
  id: string;
  notes: string | null;
  tags: string[];
  createdAt: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    programme: string | null;
    graduationYear: number | null;
    location: string | null;
    currentRole: string | null;
    currentCompany: string | null;
  };
};

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

export default function AtsPage() {
  const [tab, setTab] = useState<'jobs' | 'pool'>('jobs');

  useEffect(() => {
    api.post('/career-tools/activity', { tool: TOOL_SLUG, action: 'open' }).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Users size={24} />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight">Applicant Tracking</h1>
            <p className="text-sm text-[var(--muted)]">Manage applications across your job posts. Score candidates, advance through the pipeline, save talent for later.</p>
          </div>
        </div>
        <Link to="/opportunities/new" className="btn-primary">
          <Plus size={16} /> Post a job
        </Link>
      </div>

      <div className="mt-8 flex border-b border-[var(--border)]">
        {(['jobs', 'pool'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === k
                ? 'border-[#065F46] text-[#065F46] dark:border-[#84CC16] dark:text-[#84CC16]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            {k === 'jobs' ? 'My jobs' : 'Talent pool'}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'jobs' ? <JobsTab /> : <TalentPoolTab />}
      </div>
    </div>
  );
}

function JobsTab() {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading } = useQuery<JobRow[]>({
    queryKey: ['ats', 'jobs'],
    queryFn: async () => (await api.get('/ats/jobs')).data.data
  });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-[var(--card)]" />;
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] py-16 text-center">
        <Sparkles size={28} className="mx-auto text-[#065F46] dark:text-[#84CC16]" />
        <h3 className="mt-3 font-heading text-lg font-bold">No jobs posted yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
          Post your first opportunity and applicants will land here. Pipeline, scoring, notes, and bulk actions are ready to go.
        </p>
        <Link to="/opportunities/new" className="btn-primary mt-5 inline-flex">
          <Plus size={16} /> Post a job first
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {jobs.map((job, i) => {
        const deadline = new Date(job.deadline);
        const expired = deadline.getTime() < Date.now();
        return (
          <motion.button
            key={job.id}
            type="button"
            onClick={() => {
              api.post('/career-tools/activity', { tool: TOOL_SLUG, action: 'view_job', metadata: { jobId: job.id } }).catch(() => {});
              navigate(`/career-tools/ats/jobs/${job.id}`);
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.3 }}
            className="text-left rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-lg font-bold leading-tight line-clamp-2">{job.title}</h3>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  <Briefcase size={11} className="inline mr-1" />
                  {job.company}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                !job.isActive || expired
                  ? 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
                  : 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
              }`}>
                {!job.isActive || expired ? 'Closed' : 'Active'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {VISIBLE_STAGES.map((stage) => (
                <span
                  key={stage}
                  className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fg)]/80"
                >
                  {STAGE_LABEL[stage]}{' '}
                  <span className="text-[#065F46] dark:text-[#84CC16]">{job.stageCounts[stage] ?? 0}</span>
                </span>
              ))}
              {job.stageCounts.REJECTED > 0 && (
                <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  Rejected {job.stageCounts.REJECTED}
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              <span><CalendarClock size={11} className="inline mr-1" /> deadline {deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <span>{job.totalApplications} applicant{job.totalApplications === 1 ? '' : 's'} · last {formatRelative(job.lastApplicationAt)}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function TalentPoolTab() {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useQuery<PoolEntry[]>({
    queryKey: ['ats', 'pool'],
    queryFn: async () => (await api.get('/ats/talent-pool')).data.data
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/ats/talent-pool/${id}`)).data.data,
    onSuccess: () => {
      toast.success('Removed from pool');
      qc.invalidateQueries({ queryKey: ['ats', 'pool'] });
    }
  });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-[var(--card)]" />;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] py-16 text-center text-[var(--muted)]">
        Your talent pool is empty. Use the "Add to talent pool" action on a candidate to save them for future roles.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="font-heading text-base font-bold">
              {e.candidate.firstName} {e.candidate.lastName}
            </div>
            <div className="text-xs text-[var(--muted)]">
              {e.candidate.programme && <>{e.candidate.programme} · </>}
              {e.candidate.graduationYear && <>{e.candidate.graduationYear} · </>}
              {e.candidate.location ?? 'Location not set'} · added {formatRelative(e.createdAt)}
            </div>
            {e.candidate.currentRole && (
              <div className="mt-1 text-xs text-[var(--fg)]/80">
                {e.candidate.currentRole}{e.candidate.currentCompany ? ` @ ${e.candidate.currentCompany}` : ''}
              </div>
            )}
            {e.notes && (
              <p className="mt-2 text-sm text-[var(--fg)]/85 whitespace-pre-wrap">{e.notes}</p>
            )}
            {e.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <span key={t} className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--fg)]/70">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`mailto:${e.candidate.email}`}
              className="btn-ghost text-xs"
              title="Email candidate"
            >
              <ExternalLink size={12} /> Email
            </a>
            <button
              onClick={() => removeMut.mutate(e.id)}
              disabled={removeMut.isPending}
              className="btn-ghost text-xs text-rose-600"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
