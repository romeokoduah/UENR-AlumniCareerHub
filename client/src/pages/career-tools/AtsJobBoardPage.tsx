// ATS per-job board — kanban + table views, detail drawer, bulk actions.
//
// Route: /career-tools/ats/jobs/:jobId. Employer-only via RequireAuth.
//
// No drag-and-drop library — cards have Previous/Next/Reject buttons. No
// table library either; all hand-rolled. CSV export streams from the
// /api/ats/jobs/:jobId/applications/export.csv endpoint.

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, ArrowDown, ArrowUp, X, Search, FileText,
  MessageSquare, Download, BookmarkPlus, Send, RefreshCcw,
  LayoutGrid, Table as TableIcon, Filter, Award, GraduationCap,
  Briefcase
} from 'lucide-react';
import { api } from '../../services/api';

const TOOL_SLUG = 'ats';

const STAGES = ['APPLIED', 'UNDER_REVIEW', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
type Stage = typeof STAGES[number];

const STAGE_LABEL: Record<Stage, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under Review',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn'
};
const ADVANCE_NEXT: Record<Stage, Stage | null> = {
  APPLIED: 'UNDER_REVIEW',
  UNDER_REVIEW: 'INTERVIEW',
  INTERVIEW: 'OFFER',
  OFFER: null,
  REJECTED: null,
  WITHDRAWN: null
};
const ADVANCE_PREV: Record<Stage, Stage | null> = {
  APPLIED: null,
  UNDER_REVIEW: 'APPLIED',
  INTERVIEW: 'UNDER_REVIEW',
  OFFER: 'INTERVIEW',
  REJECTED: null,
  WITHDRAWN: null
};

type CustomQuestion = { id: string; question: string; required?: boolean };

type JobMeta = {
  id: string;
  postedById: string;
  title: string;
  anonymousApplications: boolean;
  customQuestions: CustomQuestion[] | null;
};

type ApplicantUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  programme: string | null;
  graduationYear: number | null;
  skills: string[];
  bio: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
};

type ScoreBreakdown = {
  requiredSkillMatchPct: number;
  preferredSkillMatchPct: number;
  experienceMatch: number;
  educationMatch: number;
  locationMatch: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  weights: Record<string, number>;
};

type AppRow = {
  id: string;
  status: Stage;
  appliedAt: string;
  updatedAt: string;
  cvUrl: string | null;
  coverLetter: string | null;
  recruiterScore: number | null;
  recruiterScoreBreakdown: ScoreBreakdown | null;
  notesCount: number;
  customAnswers: Record<string, string> | null;
  user: ApplicantUser;
};

type CandidateNote = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; avatar: string | null };
};

type CV = {
  id: string;
  title: string;
  data: any;
  pdfUrl: string | null;
  updatedAt: string;
};

type AppDetail = {
  application: {
    id: string;
    status: Stage;
    appliedAt: string;
    updatedAt: string;
    cvUrl: string | null;
    coverLetter: string | null;
    customAnswers: Record<string, string> | null;
    recruiterScore: number | null;
    recruiterScoreBreakdown: ScoreBreakdown | null;
    user: ApplicantUser;
  };
  opportunity: {
    id: string;
    title: string;
    company: string;
    location: string;
    locationType: 'REMOTE' | 'ONSITE' | 'HYBRID';
    requiredSkills: string[];
    preferredSkills: string[];
    customQuestions: CustomQuestion[] | null;
    anonymousApplications: boolean;
  };
  latestCv: CV | null;
  notes: CandidateNote[];
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function scoreColor(score: number | null): string {
  if (score == null) return 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]';
  if (score >= 70) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30';
  if (score >= 40) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30';
  return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30';
}

function anonName(idx: number) { return `Anonymous #${idx + 1}`; }

export default function AtsJobBoardPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const qc = useQueryClient();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.post('/career-tools/activity', { tool: TOOL_SLUG, action: 'view_job', metadata: { jobId } }).catch(() => {});
  }, [jobId]);

  const { data, isLoading } = useQuery<{ job: JobMeta; applications: AppRow[] }>({
    queryKey: ['ats', 'job', jobId],
    queryFn: async () => (await api.get(`/ats/jobs/${jobId}/applications`)).data.data,
    enabled: !!jobId
  });

  const job = data?.job;
  const apps = data?.applications ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const skill = skillFilter.trim().toLowerCase();
    return apps.filter((a) => {
      if (q) {
        const name = `${a.user.firstName} ${a.user.lastName}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (skill) {
        const has = a.user.skills?.some((s) => s.toLowerCase().includes(skill));
        if (!has) return false;
      }
      if (minScore > 0 && (a.recruiterScore ?? 0) < minScore) return false;
      return true;
    });
  }, [apps, search, skillFilter, minScore]);

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    for (const a of apps) for (const s of a.user.skills ?? []) set.add(s.toLowerCase());
    return Array.from(set).slice(0, 12).sort();
  }, [apps]);

  const stageMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Stage }) => {
      const action = status === 'REJECTED' ? 'reject_application' : 'advance_application';
      api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata: { id, status } }).catch(() => {});
      return (await api.patch(`/ats/applications/${id}/stage`, { status })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ats', 'job', jobId] });
      qc.invalidateQueries({ queryKey: ['ats', 'jobs'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to update')
  });

  const bulkMut = useMutation({
    mutationFn: async ({ action, ids, payload }: { action: 'advance' | 'reject' | 'add_to_pool'; ids: string[]; payload?: any }) => {
      return (await api.post('/ats/applications/bulk', { action, applicationIds: ids, payload })).data.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.action === 'add_to_pool' ? 'Saved to talent pool' : data.action === 'reject' ? 'Rejected' : 'Advanced'} ${data.updated} application${data.updated === 1 ? '' : 's'}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['ats', 'job', jobId] });
      qc.invalidateQueries({ queryKey: ['ats', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['ats', 'pool'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Bulk action failed')
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportCsv() {
    try {
      const token = localStorage.getItem('uenr_token');
      const base = (api.defaults.baseURL ?? '/api').replace(/\/$/, '');
      const url = `${base}/ats/jobs/${jobId}/applications/export.csv`;
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const dl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `${job?.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60) || 'job'}_applications.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(dl);
      toast.success('CSV downloaded');
    } catch {
      toast.error('Could not export CSV');
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-10"><div className="h-32 animate-pulse rounded-2xl bg-[var(--card)]" /></div>;
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <h2 className="font-heading text-xl font-bold">Job not found</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">It may have been deleted or you may not have access.</p>
          <Link to="/career-tools/ats" className="btn-primary mt-4 inline-flex">Back to ATS</Link>
        </div>
      </div>
    );
  }

  const grouped: Record<Stage, AppRow[]> = {
    APPLIED: [], UNDER_REVIEW: [], INTERVIEW: [], OFFER: [], REJECTED: [], WITHDRAWN: []
  };
  for (const a of filtered) grouped[a.status].push(a);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Link to="/career-tools/ats" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> ATS
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold leading-tight">{job.title}</h1>
          <p className="text-xs text-[var(--muted)]">
            {filtered.length} of {apps.length} applicant{apps.length === 1 ? '' : 's'}
            {job.anonymousApplications && <> · anonymized at apply stage</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="btn-ghost text-sm"><Download size={14} /> Export CSV</button>
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view === 'kanban' ? 'bg-[#065F46] text-white' : 'text-[var(--muted)]'}`}
            ><LayoutGrid size={12} /> Kanban</button>
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view === 'table' ? 'bg-[#065F46] text-white' : 'text-[var(--muted)]'}`}
            ><TableIcon size={12} /> Table</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <label className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate name…"
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] py-1.5 pl-9 pr-3 text-sm focus:border-[#065F46] focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter size={12} className="text-[var(--muted)]" />
          <button
            onClick={() => setSkillFilter('')}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${skillFilter === '' ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] hover:border-[#065F46]/50'}`}
          >All skills</button>
          {allSkills.map((s) => (
            <button
              key={s}
              onClick={() => setSkillFilter(s === skillFilter ? '' : s)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${s === skillFilter ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] hover:border-[#065F46]/50'}`}
            >{s}</button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--muted)]">
          Score ≥ <span className="w-7 text-right font-bold text-[var(--fg)]">{minScore}</span>
          <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-32" />
        </label>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#065F46]/30 bg-[#065F46]/5 px-4 py-3 text-sm"
          >
            <span className="font-semibold">{selected.size} selected</span>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => bulkMut.mutate({ action: 'advance', ids: Array.from(selected) })} disabled={bulkMut.isPending} className="btn-primary text-xs"><ArrowRight size={12} /> Advance</button>
              <button onClick={() => bulkMut.mutate({ action: 'add_to_pool', ids: Array.from(selected) })} disabled={bulkMut.isPending} className="btn-ghost text-xs"><BookmarkPlus size={12} /> Add to talent pool</button>
              <button onClick={() => bulkMut.mutate({ action: 'reject', ids: Array.from(selected) })} disabled={bulkMut.isPending} className="btn-ghost text-xs text-rose-600">Reject</button>
              <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs"><X size={12} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="mt-5">
        {view === 'kanban' ? (
          <KanbanView
            grouped={grouped}
            anonymized={job.anonymousApplications}
            onOpen={setOpenAppId}
            onMove={(id, status) => stageMut.mutate({ id, status })}
            disabled={stageMut.isPending}
          />
        ) : (
          <TableView
            rows={filtered}
            anonymized={job.anonymousApplications}
            onOpen={setOpenAppId}
            selected={selected}
            onToggle={toggleSelected}
          />
        )}
      </div>

      {openAppId && (
        <DetailDrawer
          applicationId={openAppId}
          onClose={() => setOpenAppId(null)}
        />
      )}
    </div>
  );
}

// ===== Kanban view =====

function KanbanView({
  grouped, anonymized, onOpen, onMove, disabled
}: {
  grouped: Record<Stage, AppRow[]>;
  anonymized: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Stage) => void;
  disabled: boolean;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex min-w-max gap-3 pb-3">
        {STAGES.map((stage) => {
          const cards = grouped[stage];
          return (
            <div key={stage} className="w-72 shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider">{STAGE_LABEL[stage]}</span>
                <span className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-[11px] text-[var(--muted)]">empty</div>
                ) : (
                  cards.map((c, i) => (
                    <KanbanCard
                      key={c.id}
                      app={c}
                      anonName={anonymized && c.status === 'APPLIED' ? anonName(i) : null}
                      onOpen={onOpen}
                      onMove={onMove}
                      disabled={disabled}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  app, anonName, onOpen, onMove, disabled
}: {
  app: AppRow;
  anonName: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Stage) => void;
  disabled: boolean;
}) {
  const next = ADVANCE_NEXT[app.status];
  const prev = ADVANCE_PREV[app.status];
  const canReject = app.status !== 'REJECTED' && app.status !== 'WITHDRAWN';
  const display = anonName ?? `${app.user.firstName} ${app.user.lastName}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 transition hover:border-[#065F46]/40">
      <button
        type="button"
        onClick={() => onOpen(app.id)}
        className="block w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-sm font-bold leading-tight">{display}</div>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${scoreColor(app.recruiterScore)}`}>
            {app.recruiterScore ?? '—'}
          </span>
        </div>
        {!anonName && app.user.programme && (
          <div className="mt-0.5 text-[11px] text-[var(--muted)] line-clamp-1">{app.user.programme}</div>
        )}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]">
          {app.cvUrl && <span title="Has CV"><FileText size={11} /></span>}
          {app.coverLetter && <span title="Has cover letter"><MessageSquare size={11} /></span>}
          <span className="ml-auto">{relativeTime(app.appliedAt)}</span>
        </div>
      </button>
      <div className="mt-2 flex items-center gap-1 border-t border-[var(--border)] pt-2">
        <button
          onClick={() => prev && onMove(app.id, prev)}
          disabled={!prev || disabled}
          className="flex-1 rounded-lg p-1 text-[11px] text-[var(--muted)] hover:bg-[var(--card)] disabled:opacity-30"
          title="Move to previous stage"
        ><ArrowUp size={12} className="mx-auto" /></button>
        <button
          onClick={() => next && onMove(app.id, next)}
          disabled={!next || disabled}
          className="flex-1 rounded-lg p-1 text-[11px] text-[#065F46] dark:text-[#84CC16] hover:bg-[var(--card)] disabled:opacity-30"
          title="Advance to next stage"
        ><ArrowDown size={12} className="mx-auto" /></button>
        <button
          onClick={() => canReject && onMove(app.id, 'REJECTED')}
          disabled={!canReject || disabled}
          className="flex-1 rounded-lg p-1 text-[11px] text-rose-600 hover:bg-[var(--card)] disabled:opacity-30"
          title="Reject"
        ><X size={12} className="mx-auto" /></button>
      </div>
    </div>
  );
}

// ===== Table view =====

function TableView({
  rows, anonymized, onOpen, selected, onToggle
}: {
  rows: AppRow[];
  anonymized: boolean;
  onOpen: (id: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  type SortKey = 'name' | 'score' | 'stage' | 'applied' | 'notes';
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      switch (sortKey) {
        case 'name': av = `${a.user.firstName} ${a.user.lastName}`; bv = `${b.user.firstName} ${b.user.lastName}`; break;
        case 'score': av = a.recruiterScore ?? -1; bv = b.recruiterScore ?? -1; break;
        case 'stage': av = STAGES.indexOf(a.status); bv = STAGES.indexOf(b.status); break;
        case 'applied': av = new Date(a.appliedAt).getTime(); bv = new Date(b.appliedAt).getTime(); break;
        case 'notes': av = a.notesCount; bv = b.notesCount; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function setSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'score' || key === 'applied' ? 'desc' : 'asc'); }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    if (allSelected) for (const r of rows) selected.has(r.id) && onToggle(r.id);
    else for (const r of rows) !selected.has(r.id) && onToggle(r.id);
  }

  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] py-16 text-center text-[var(--muted)]">No applications match your filters.</div>;
  }

  const Header = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => setSort(k)}
      className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--fg)]"
    >
      {label} {sortKey === k && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)]">
          <tr>
            <th className="w-10 px-3 py-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
            <Header label="Name" k="name" />
            <Header label="Score" k="score" />
            <Header label="Stage" k="stage" />
            <Header label="Applied" k="applied" />
            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">CV</th>
            <Header label="Notes" k="notes" />
            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => (
            <tr key={a.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)]">
              <td className="px-3 py-2"><input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggle(a.id)} /></td>
              <td className="px-3 py-2">
                <button onClick={() => onOpen(a.id)} className="font-semibold hover:text-[#065F46] dark:hover:text-[#84CC16]">
                  {anonymized && a.status === 'APPLIED' ? anonName(i) : `${a.user.firstName} ${a.user.lastName}`}
                </button>
                {!anonymized && a.user.programme && <div className="text-[11px] text-[var(--muted)]">{a.user.programme}</div>}
              </td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${scoreColor(a.recruiterScore)}`}>{a.recruiterScore ?? '—'}</span></td>
              <td className="px-3 py-2"><span className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold">{STAGE_LABEL[a.status]}</span></td>
              <td className="px-3 py-2 text-xs text-[var(--muted)]">{relativeTime(a.appliedAt)}</td>
              <td className="px-3 py-2">{a.cvUrl ? <a href={a.cvUrl} target="_blank" rel="noreferrer" className="text-[#065F46] dark:text-[#84CC16]"><FileText size={14} /></a> : <span className="text-[var(--muted)]">—</span>}</td>
              <td className="px-3 py-2 text-xs">{a.notesCount}</td>
              <td className="px-3 py-2"><button onClick={() => onOpen(a.id)} className="btn-ghost text-xs">Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== Detail drawer =====

function DetailDrawer({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const { data, isLoading } = useQuery<AppDetail>({
    queryKey: ['ats', 'application', applicationId],
    queryFn: async () => (await api.get(`/ats/applications/${applicationId}`)).data.data
  });

  const stageMut = useMutation({
    mutationFn: async (status: Stage) => {
      const action = status === 'REJECTED' ? 'reject_application' : 'advance_application';
      api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata: { applicationId, status } }).catch(() => {});
      return (await api.patch(`/ats/applications/${applicationId}/stage`, { status })).data.data;
    },
    onSuccess: () => {
      toast.success('Stage updated');
      qc.invalidateQueries({ queryKey: ['ats'] });
    }
  });

  const noteMut = useMutation({
    mutationFn: async () => (await api.post(`/ats/applications/${applicationId}/notes`, { body: noteBody })).data.data,
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: TOOL_SLUG, action: 'add_note', metadata: { applicationId } }).catch(() => {});
      setNoteBody('');
      qc.invalidateQueries({ queryKey: ['ats', 'application', applicationId] });
      qc.invalidateQueries({ queryKey: ['ats', 'job'] });
      toast.success('Note added');
    }
  });

  const recomputeMut = useMutation({
    mutationFn: async () => (await api.post(`/ats/applications/${applicationId}/recompute`)).data.data,
    onSuccess: () => {
      toast.success('Score recomputed');
      qc.invalidateQueries({ queryKey: ['ats', 'application', applicationId] });
      qc.invalidateQueries({ queryKey: ['ats', 'job'] });
    }
  });

  const poolMut = useMutation({
    mutationFn: async (candidateId: string) => (await api.post('/ats/talent-pool', { candidateId })).data.data,
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: TOOL_SLUG, action: 'add_to_pool', metadata: { applicationId } }).catch(() => {});
      toast.success('Added to talent pool');
      qc.invalidateQueries({ queryKey: ['ats', 'pool'] });
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur px-5 py-3">
          <div className="font-heading text-lg font-bold">Candidate detail</div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {isLoading || !data ? (
          <div className="p-6"><div className="h-32 animate-pulse rounded-xl bg-[var(--card)]" /></div>
        ) : (
          <DrawerBody
            data={data}
            noteBody={noteBody}
            setNoteBody={setNoteBody}
            onAddNote={() => noteBody.trim() && noteMut.mutate()}
            noteSubmitting={noteMut.isPending}
            onAdvance={() => { const next = ADVANCE_NEXT[data.application.status]; if (next) stageMut.mutate(next); }}
            onPrev={() => { const prev = ADVANCE_PREV[data.application.status]; if (prev) stageMut.mutate(prev); }}
            onReject={() => stageMut.mutate('REJECTED')}
            onRecompute={() => recomputeMut.mutate()}
            recomputing={recomputeMut.isPending}
            onAddToPool={() => poolMut.mutate(data.application.user.id)}
            poolPending={poolMut.isPending}
          />
        )}
      </motion.aside>
    </div>
  );
}

function DrawerBody({
  data, noteBody, setNoteBody, onAddNote, noteSubmitting,
  onAdvance, onPrev, onReject, onRecompute, recomputing,
  onAddToPool, poolPending
}: {
  data: AppDetail;
  noteBody: string;
  setNoteBody: (v: string) => void;
  onAddNote: () => void;
  noteSubmitting: boolean;
  onAdvance: () => void;
  onPrev: () => void;
  onReject: () => void;
  onRecompute: () => void;
  recomputing: boolean;
  onAddToPool: () => void;
  poolPending: boolean;
}) {
  const { application: app, opportunity: opp, latestCv, notes } = data;
  const anon = opp.anonymousApplications && app.status === 'APPLIED';
  const breakdown = app.recruiterScoreBreakdown;

  return (
    <div className="space-y-6 p-5">
      {/* Header */}
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl font-extrabold">
              {anon ? 'Anonymous candidate' : `${app.user.firstName} ${app.user.lastName}`}
            </h2>
            {!anon && (
              <div className="mt-1 text-sm text-[var(--muted)]">
                {[app.user.programme, app.user.graduationYear, app.user.location].filter(Boolean).join(' · ')}
              </div>
            )}
            {!anon && app.user.currentRole && (
              <div className="mt-0.5 text-xs text-[var(--fg)]/80"><Briefcase size={11} className="inline mr-1" /> {app.user.currentRole}{app.user.currentCompany ? ` @ ${app.user.currentCompany}` : ''}</div>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${scoreColor(app.recruiterScore)}`}>
            {app.recruiterScore ?? '—'}<span className="text-[10px] font-normal"> /100</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16] px-2 py-0.5 font-bold uppercase tracking-wider">{STAGE_LABEL[app.status]}</span>
          <span className="text-[var(--muted)]">applied {relativeTime(app.appliedAt)}</span>
        </div>
      </section>

      {/* Score breakdown */}
      {breakdown && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-heading text-sm font-bold flex items-center gap-1.5"><Award size={14} className="text-[#065F46] dark:text-[#84CC16]" /> Why this score</div>
            <button onClick={onRecompute} disabled={recomputing} className="btn-ghost text-xs"><RefreshCcw size={12} className={recomputing ? 'animate-spin' : ''} /> Recompute</button>
          </div>
          <div className="space-y-2.5">
            <ScoreBar label="Required skills" pct={breakdown.requiredSkillMatchPct} weight={breakdown.weights.requiredSkillMatchPct} />
            <ScoreBar label="Preferred skills" pct={breakdown.preferredSkillMatchPct} weight={breakdown.weights.preferredSkillMatchPct} />
            <ScoreBar label="Experience" pct={breakdown.experienceMatch} weight={breakdown.weights.experienceMatch} />
            <ScoreBar label="Education" pct={breakdown.educationMatch} weight={breakdown.weights.educationMatch} />
            <ScoreBar label="Location" pct={breakdown.locationMatch} weight={breakdown.weights.locationMatch} />
          </div>
          {(breakdown.matchedRequired.length > 0 || breakdown.missingRequired.length > 0) && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {breakdown.matchedRequired.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Matched required</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {breakdown.matchedRequired.map((s) => <span key={s} className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">{s}</span>)}
                  </div>
                </div>
              )}
              {breakdown.missingRequired.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Missing required</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {breakdown.missingRequired.map((s) => <span key={s} className="rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-semibold">{s}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Resume */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="font-heading text-sm font-bold flex items-center gap-1.5"><FileText size={14} /> Resume</div>
        {latestCv ? <CvRender cv={latestCv} /> : app.cvUrl ? (
          <a href={app.cvUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-[#065F46] dark:text-[#84CC16] underline">View attached CV</a>
        ) : (
          <div className="mt-2 text-sm text-[var(--muted)]">No CV on file.</div>
        )}
      </section>

      {/* Cover letter */}
      {app.coverLetter && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 font-heading text-sm font-bold flex items-center gap-1.5"><MessageSquare size={14} /> Cover letter</div>
          <p className="whitespace-pre-wrap text-sm text-[var(--fg)]/85 leading-relaxed">{app.coverLetter}</p>
        </section>
      )}

      {/* Custom Q&A */}
      {opp.customQuestions && opp.customQuestions.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 font-heading text-sm font-bold">Custom questions</div>
          <ul className="space-y-2.5">
            {opp.customQuestions.map((q) => (
              <li key={q.id}>
                <div className="text-xs font-semibold text-[var(--fg)]/80">{q.question}</div>
                <div className="mt-0.5 text-sm text-[var(--fg)]/85 whitespace-pre-wrap">
                  {app.customAnswers?.[q.id]?.trim() || <span className="text-[var(--muted)] italic">No answer</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Notes */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 font-heading text-sm font-bold">Recruiter notes ({notes.length})</div>
        {notes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">No notes yet.</div>
        ) : (
          <ul className="space-y-2.5">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-[var(--bg)] p-3">
                <div className="text-[11px] font-semibold text-[var(--muted)]">{n.author.firstName} {n.author.lastName} · {relativeTime(n.createdAt)}</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg)]/85">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Add an internal note about this candidate…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm focus:border-[#065F46] focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button onClick={onAddNote} disabled={!noteBody.trim() || noteSubmitting} className="btn-primary text-xs"><Send size={12} /> {noteSubmitting ? 'Posting…' : 'Post note'}</button>
          </div>
        </div>
      </section>

      {/* Actions */}
      <section className="sticky bottom-0 -mx-5 -mb-5 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur px-5 py-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={onAddToPool} disabled={poolPending} className="btn-ghost text-sm"><BookmarkPlus size={14} /> Add to talent pool</button>
          <button onClick={onPrev} disabled={!ADVANCE_PREV[app.status]} className="btn-ghost text-sm"><ArrowUp size={14} /> Previous</button>
          <button onClick={onReject} disabled={app.status === 'REJECTED' || app.status === 'WITHDRAWN'} className="btn-ghost text-sm text-rose-600">Reject</button>
          <button onClick={onAdvance} disabled={!ADVANCE_NEXT[app.status]} className="btn-primary text-sm"><ArrowRight size={14} /> Next stage</button>
        </div>
      </section>
    </div>
  );
}

function ScoreBar({ label, pct, weight }: { label: string; pct: number; weight: number }) {
  const w = Math.round(pct * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[var(--fg)]/80">{label}</span>
        <span className="text-[var(--muted)]">{w}% · weight {Math.round(weight * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#065F46] to-[#84CC16] transition-all"
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

// ===== CV render (best-effort over the loose `data` JSON) =====

function CvRender({ cv }: { cv: CV }) {
  const data = (cv.data ?? {}) as any;
  const exp: any[] = Array.isArray(data.experience) ? data.experience : Array.isArray(data.workExperience) ? data.workExperience : [];
  const edu: any[] = Array.isArray(data.education) ? data.education : [];
  const skills: string[] = Array.isArray(data.skills) ? data.skills : [];
  const summary: string = typeof data.summary === 'string' ? data.summary : (typeof data.objective === 'string' ? data.objective : '');

  return (
    <div className="mt-2 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className="font-semibold text-[var(--fg)]/80">{cv.title}</span>
        <span>· updated {relativeTime(cv.updatedAt)}</span>
        {cv.pdfUrl && <a href={cv.pdfUrl} target="_blank" rel="noreferrer" className="text-[#065F46] dark:text-[#84CC16] underline">PDF</a>}
      </div>
      {summary && <p className="text-sm text-[var(--fg)]/85">{summary}</p>}
      {exp.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1"><Briefcase size={10} /> Experience</div>
          <ul className="mt-1 space-y-1.5">
            {exp.slice(0, 6).map((e: any, i: number) => (
              <li key={i} className="text-xs">
                <div className="font-semibold">{e.role || e.title || 'Role'} {e.company && <span className="text-[var(--muted)] font-normal">@ {e.company}</span>}</div>
                {(e.startDate || e.endDate) && <div className="text-[10px] text-[var(--muted)]">{e.startDate ?? ''} – {e.endDate ?? 'present'}</div>}
                {e.description && <div className="mt-0.5 text-[var(--fg)]/85 line-clamp-3">{e.description}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {edu.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1"><GraduationCap size={10} /> Education</div>
          <ul className="mt-1 space-y-1">
            {edu.slice(0, 4).map((e: any, i: number) => (
              <li key={i} className="text-xs">
                <span className="font-semibold">{e.degree || e.programme || 'Programme'}</span>
                {e.institution && <span className="text-[var(--muted)]"> — {e.institution}</span>}
                {(e.startDate || e.endDate) && <span className="text-[10px] text-[var(--muted)]"> · {e.startDate ?? ''} – {e.endDate ?? ''}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {skills.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Skills</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {skills.slice(0, 24).map((s) => <span key={s} className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold">{s}</span>)}
          </div>
        </div>
      )}
      {exp.length === 0 && edu.length === 0 && skills.length === 0 && !summary && (
        <div className="text-xs text-[var(--muted)]">CV stored, but the structured fields are empty.</div>
      )}
    </div>
  );
}

