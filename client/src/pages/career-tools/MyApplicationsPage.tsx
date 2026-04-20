// ATS candidate-side dashboard. Lists the current user's applications across
// all opportunities, with status badges, interview indicators, and a withdraw
// action on non-final statuses.
//
// Route: /career-tools/ats/my-applications. Open to ANY authenticated user
// (students, alumni, employers, admins) — recruiters see the kanban board,
// candidates see this dashboard.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ClipboardList, ExternalLink, Sparkles, CalendarClock,
  Briefcase, MapPin
} from 'lucide-react';
import { api } from '../../services/api';

const TOOL_SLUG = 'ats';

type Stage = 'APPLIED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN';

const STAGE_LABEL: Record<Stage, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under review',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Not moving forward',
  WITHDRAWN: 'Withdrawn'
};

const STAGE_TONE: Record<Stage, string> = {
  APPLIED: 'bg-[var(--bg)] text-[var(--fg)]/80 border border-[var(--border)]',
  UNDER_REVIEW: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
  INTERVIEW: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16] border border-[#065F46]/20',
  OFFER: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30',
  WITHDRAWN: 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
};

type MyApp = {
  id: string;
  status: Stage;
  appliedAt: string;
  updatedAt: string;
  opportunity: {
    id: string;
    title: string;
    company: string;
    location: string;
    locationType: 'REMOTE' | 'ONSITE' | 'HYBRID';
    deadline: string;
    type: string;
  };
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyApplicationsPage() {
  const qc = useQueryClient();

  useEffect(() => {
    api.post('/career-tools/activity', { tool: TOOL_SLUG, action: 'open', metadata: { view: 'my_applications' } }).catch(() => {});
  }, []);

  const { data: apps = [], isLoading } = useQuery<MyApp[]>({
    queryKey: ['ats', 'my-applications'],
    queryFn: async () => (await api.get('/ats/applications/me')).data.data
  });

  const withdrawMut = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/ats/applications/me/${id}/withdraw`)).data.data,
    onSuccess: () => {
      toast.success('Application withdrawn');
      qc.invalidateQueries({ queryKey: ['ats', 'my-applications'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Could not withdraw')
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <ClipboardList size={24} />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-extrabold leading-tight">My Applications</h1>
          <p className="text-sm text-[var(--muted)]">Track every job you've applied to. You'll be notified when a recruiter advances your application.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 h-32 animate-pulse rounded-2xl bg-[var(--card)]" />
      ) : apps.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] py-16 text-center">
          <Sparkles size={28} className="mx-auto text-[#065F46] dark:text-[#84CC16]" />
          <h3 className="mt-3 font-heading text-lg font-bold">You haven't applied yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">Browse open opportunities and apply — they'll show up here.</p>
          <Link to="/opportunities" className="btn-primary mt-5 inline-flex">Browse opportunities</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {apps.map((a) => {
            const final = a.status === 'OFFER' || a.status === 'REJECTED' || a.status === 'WITHDRAWN';
            const opp = a.opportunity;
            return (
              <article key={a.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-lg font-bold leading-tight">{opp.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span><Briefcase size={11} className="inline mr-1" />{opp.company}</span>
                      <span><MapPin size={11} className="inline mr-1" />{opp.location} · {opp.locationType.toLowerCase()}</span>
                      <span><CalendarClock size={11} className="inline mr-1" />deadline {formatDate(opp.deadline)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STAGE_TONE[a.status]}`}>
                      {STAGE_LABEL[a.status]}
                    </span>
                  </div>
                </div>

                {a.status === 'INTERVIEW' && (
                  <div className="mt-3 rounded-xl border-l-4 border-l-[#84CC16] bg-[#84CC16]/5 px-3 py-2 text-xs text-[var(--fg)]/90">
                    The recruiter has invited you to interview. Watch your inbox and notifications for scheduling details.
                  </div>
                )}
                {a.status === 'OFFER' && (
                  <div className="mt-3 rounded-xl border-l-4 border-l-emerald-500 bg-emerald-500/5 px-3 py-2 text-xs text-[var(--fg)]/90">
                    Congratulations — you've reached the offer stage. The formal offer should arrive via email shortly.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                  <span>Applied {formatDate(a.appliedAt)}{a.updatedAt !== a.appliedAt && <> · last update {formatDate(a.updatedAt)}</>}</span>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/opportunities/${opp.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost text-xs"
                    >
                      <ExternalLink size={12} /> View job
                    </Link>
                    {!final && (
                      <button
                        onClick={() => {
                          if (confirm('Withdraw this application? This cannot be undone.')) {
                            withdrawMut.mutate(a.id);
                          }
                        }}
                        disabled={withdrawMut.isPending}
                        className="btn-ghost text-xs text-rose-600"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
