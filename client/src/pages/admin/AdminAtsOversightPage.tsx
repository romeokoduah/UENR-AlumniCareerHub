// Phase 6 superuser oversight for the ATS.
//
// Two tabs, both backed by /api/admin/ats-oversight/*:
//   - Jobs: every Opportunity with poster + stage breakdown. Click a row
//     to expand into the full applications view (no employer-ownership
//     check). Force-stage / force-recompute.
//   - Talent pools: every TalentPoolEntry across every employer owner.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  BriefcaseBusiness, Search, ChevronDown, ChevronRight, Star,
  RefreshCw, Trash2, ShieldAlert, ExternalLink, Users
} from 'lucide-react';
import { api } from '../../services/api';

type ApplicationStatus =
  | 'APPLIED' | 'UNDER_REVIEW' | 'INTERVIEW'
  | 'OFFER' | 'REJECTED' | 'WITHDRAWN';

const STATUSES: ApplicationStatus[] = [
  'APPLIED', 'UNDER_REVIEW', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'
];

type Poster = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  currentCompany?: string | null;
};

type Applicant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  programme?: string | null;
  graduationYear?: number | null;
  skills?: string[];
  bio?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  location?: string | null;
};

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  locationType: string;
  type: string;
  deadline: string;
  isActive: boolean;
  isApproved: boolean;
  isFeatured: boolean;
  anonymousApplications: boolean;
  createdAt: string;
  postedBy: Poster;
  totalApplications: number;
  stageCounts: Record<ApplicationStatus, number>;
};

type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  cvUrl: string | null;
  coverLetter: string | null;
  recruiterScore: number | null;
  recruiterScoreBreakdown: any;
  notesCount: number;
  user: Applicant;
};

type JobApplicationsResponse = {
  job: { id: string; title: string; postedBy: Poster };
  applications: ApplicationRow[];
};

type TalentPoolRow = {
  id: string;
  notes: string | null;
  tags: string[];
  createdAt: string;
  candidate: Applicant;
  owner: Poster;
};

const TABS = [
  { key: 'jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { key: 'pools', label: 'Talent pools', icon: Users }
] as const;
type TabKey = (typeof TABS)[number]['key'];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function typedConfirm(word: string, message: string): boolean {
  const reply = window.prompt(`${message}\n\nType "${word}" to confirm.`);
  return reply?.trim().toUpperCase() === word.toUpperCase();
}

function stageBadgeClass(s: ApplicationStatus): string {
  switch (s) {
    case 'APPLIED':      return 'bg-[var(--bg)] text-[var(--fg)]/70 border border-[var(--border)]';
    case 'UNDER_REVIEW': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
    case 'INTERVIEW':    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'OFFER':        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'REJECTED':     return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
    case 'WITHDRAWN':    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  }
}

export default function AdminAtsOversightPage() {
  const [tab, setTab] = useState<TabKey>('jobs');

  return (
    <div>
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness size={20} className="text-[#065F46] dark:text-[#84CC16]" />
          <h1 className="font-heading text-2xl font-extrabold">ATS oversight</h1>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cross-employer view of every job, application, and talent-pool entry.
          Force-advance, recompute scores, and clean up stale pool entries.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {tab === 'jobs' && <JobsPanel />}
      {tab === 'pools' && <TalentPoolsPanel />}
    </div>
  );
}

// =====================================================================
// JOBS
// =====================================================================

function JobsPanel() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery<JobRow[]>({
    queryKey: ['admin', 'ats-oversight', 'jobs'],
    queryFn: async () => (await api.get('/admin/ats-oversight/jobs')).data.data
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter((j) =>
      j.title.toLowerCase().includes(term) ||
      j.company.toLowerCase().includes(term) ||
      `${j.postedBy.firstName} ${j.postedBy.lastName}`.toLowerCase().includes(term) ||
      j.postedBy.email.toLowerCase().includes(term)
    );
  }, [q.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title / company / poster…"
            className="input pl-9"
          />
        </label>
        <span className="text-xs text-[var(--muted)]">{filtered.length} jobs</span>
      </div>

      <div className="space-y-2">
        {q.isLoading && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--muted)]">Loading…</div>
        )}
        {!q.isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 p-10 text-center text-sm text-[var(--muted)]">No jobs match.</div>
        )}
        {filtered.map((j) => {
          const isOpen = expanded === j.id;
          return (
            <div key={j.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <button
                onClick={() => setExpanded(isOpen ? null : j.id)}
                className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <h3 className="font-heading text-base font-bold">{j.title}</h3>
                    {j.isFeatured && <Star size={12} className="text-[#F59E0B]" />}
                    {!j.isActive && <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">inactive</span>}
                    {!j.isApproved && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">pending</span>}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {j.company} · {j.location} · {j.locationType} · {j.type} · deadline {fmtDate(j.deadline)}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">
                    Posted by {j.postedBy.firstName} {j.postedBy.lastName} ({j.postedBy.email}) · role {j.postedBy.role}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                      {j.totalApplications} total
                    </span>
                    {STATUSES.map((s) => (
                      j.stageCounts[s] > 0 ? (
                        <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${stageBadgeClass(s)}`}>
                          {j.stageCounts[s]} {s.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      ) : null
                    ))}
                  </div>
                </div>
              </button>
              {isOpen && <JobApplicationsPanel jobId={j.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobApplicationsPanel({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const q = useQuery<JobApplicationsResponse>({
    queryKey: ['admin', 'ats-oversight', 'jobs', jobId, 'applications'],
    queryFn: async () => (await api.get(`/admin/ats-oversight/jobs/${jobId}/applications`)).data.data
  });

  const stageMut = useMutation({
    mutationFn: async (vars: { id: string; status: ApplicationStatus }) =>
      (await api.patch(`/admin/ats-oversight/applications/${vars.id}/stage`, { status: vars.status })).data.data,
    onSuccess: () => {
      toast.success('Stage forced');
      qc.invalidateQueries({ queryKey: ['admin', 'ats-oversight', 'jobs', jobId, 'applications'] });
      qc.invalidateQueries({ queryKey: ['admin', 'ats-oversight', 'jobs'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Force-stage failed')
  });

  const recomputeMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/ats-oversight/applications/${id}/recompute`)).data.data,
    onSuccess: () => {
      toast.success('Score recomputed');
      qc.invalidateQueries({ queryKey: ['admin', 'ats-oversight', 'jobs', jobId, 'applications'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Recompute failed')
  });

  if (q.isLoading) return <div className="border-t border-[var(--border)] px-5 py-6 text-sm text-[var(--muted)]">Loading applications…</div>;
  if (!q.data) return null;

  const apps = q.data.applications;

  return (
    <div className="border-t border-[var(--border)] px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" />
        <span className="text-xs text-[var(--muted)]">
          You are bypassing the per-employer ownership check on this job.
        </span>
      </div>
      {apps.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--muted)]">No applications yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--bg)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Candidate</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Applied</th>
                <th className="px-3 py-2">CV</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border)]/50 last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{a.user.firstName} {a.user.lastName}</div>
                    <div className="text-xs text-[var(--muted)]">{a.user.email}</div>
                    {a.user.programme && (
                      <div className="text-[11px] text-[var(--muted)]">
                        {a.user.programme}{a.user.graduationYear ? ` · ${a.user.graduationYear}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.recruiterScore != null ? (
                      <span className="font-bold">{Math.round(a.recruiterScore)}</span>
                    ) : <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={a.status}
                      onChange={(e) => {
                        const next = e.target.value as ApplicationStatus;
                        if (next === a.status) return;
                        if (!typedConfirm('FORCE', `Force-stage ${a.user.firstName} ${a.user.lastName} to ${next}?`)) return;
                        stageMut.mutate({ id: a.id, status: next });
                      }}
                      className={`input !py-1 !text-xs font-semibold uppercase tracking-wider ${stageBadgeClass(a.status)}`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">{fmtDateTime(a.appliedAt)}</td>
                  <td className="px-3 py-2 text-xs">
                    {a.cvUrl ? (
                      <a href={a.cvUrl} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-1 text-[#065F46] hover:underline dark:text-[#84CC16]">
                        Open <ExternalLink size={10} />
                      </a>
                    ) : <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      disabled={recomputeMut.isPending}
                      onClick={() => {
                        if (!typedConfirm('RECOMPUTE', `Recompute recruiter score for ${a.user.firstName} ${a.user.lastName}?`)) return;
                        recomputeMut.mutate(a.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:border-[#065F46]/50 disabled:opacity-50"
                    >
                      <RefreshCw size={11} /> Recompute
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// TALENT POOLS
// =====================================================================

function TalentPoolsPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const q = useQuery<TalentPoolRow[]>({
    queryKey: ['admin', 'ats-oversight', 'talent-pools'],
    queryFn: async () => (await api.get('/admin/ats-oversight/talent-pools')).data.data
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter((e) =>
      `${e.candidate.firstName} ${e.candidate.lastName}`.toLowerCase().includes(term) ||
      e.candidate.email.toLowerCase().includes(term) ||
      `${e.owner.firstName} ${e.owner.lastName}`.toLowerCase().includes(term) ||
      e.owner.email.toLowerCase().includes(term) ||
      (e.notes ?? '').toLowerCase().includes(term)
    );
  }, [q.data, search]);

  const removeMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/ats-oversight/talent-pools/${id}`)).data.data,
    onSuccess: () => {
      toast.success('Pool entry removed');
      qc.invalidateQueries({ queryKey: ['admin', 'ats-oversight', 'talent-pools'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Remove failed')
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate / owner / notes…"
            className="input pl-9"
          />
        </label>
        <span className="text-xs text-[var(--muted)]">{filtered.length} entries</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Owner (employer)</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
            )}
            {!q.isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">No entries match.</td></tr>
            )}
            {filtered.map((e) => (
              <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-[var(--border)]/50 last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{e.candidate.firstName} {e.candidate.lastName}</div>
                  <div className="text-xs text-[var(--muted)]">{e.candidate.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{e.owner.firstName} {e.owner.lastName}</div>
                  <div className="text-xs text-[var(--muted)]">{e.owner.email}{e.owner.currentCompany ? ` · ${e.owner.currentCompany}` : ''}</div>
                </td>
                <td className="px-4 py-3">
                  {e.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {e.tags.map((t) => (
                        <span key={t} className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">{t}</span>
                      ))}
                    </div>
                  ) : <span className="text-xs text-[var(--muted)]">—</span>}
                </td>
                <td className="px-4 py-3 text-xs">{fmtDate(e.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled={removeMut.isPending}
                    onClick={() => {
                      if (!typedConfirm('REMOVE', `Remove ${e.candidate.firstName} ${e.candidate.lastName} from ${e.owner.firstName} ${e.owner.lastName}'s talent pool?`)) return;
                      removeMut.mutate(e.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

