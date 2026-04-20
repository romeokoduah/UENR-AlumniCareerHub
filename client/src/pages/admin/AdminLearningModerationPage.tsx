// Admin moderation queue for the Learning Hub. Shows resources that were
// submitted by users and are awaiting admin sign-off. Approve flips
// `isApproved=true`; Reject deletes the row.
//
// Gated to ADMIN at the route layer in App.tsx.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, BookOpen, Check, X, ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';

type Submitter = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type PendingResource = {
  id: string;
  title: string;
  provider: string;
  url: string;
  type: string;
  level: string;
  cost: string;
  language: string;
  durationMin: number | null;
  skills: string[];
  description: string | null;
  createdAt: string;
  submittedBy: Submitter | null;
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function AdminLearningModerationPage() {
  const qc = useQueryClient();

  const { data: pending = [], isLoading } = useQuery<PendingResource[]>({
    queryKey: ['admin', 'learning', 'pending'],
    queryFn: async () => (await api.get('/learning/resources/pending')).data.data
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`/learning/resources/${id}`, { isApproved: true })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'learning', 'pending'] });
      qc.invalidateQueries({ queryKey: ['learning', 'resources'] });
      toast.success('Approved');
    },
    onError: () => toast.error('Approve failed')
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/learning/resources/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'learning', 'pending'] });
      qc.invalidateQueries({ queryKey: ['learning', 'resources'] });
      toast.success('Rejected');
    },
    onError: () => toast.error('Reject failed')
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-2 flex items-center gap-2">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft size={14} /> Admin
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            — Learning hub moderation
          </div>
          <h1 className="font-heading text-3xl font-extrabold">Pending submissions</h1>
          <p className="text-sm text-[var(--muted)]">
            Resources alumni submitted that haven't been approved yet. Approve to publish, reject to remove.
          </p>
        </div>
        <span className="rounded-full bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 text-sm font-semibold">
          {pending.length} pending
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="card h-28 skeleton" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <BookOpen size={28} />
          </div>
          <h2 className="mt-5 font-heading text-xl font-bold">Inbox zero</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            No pending submissions right now. New ones will land here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-bold">{r.title}</h3>
                    <span className="rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
                      Pending
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {r.provider} · {titleCase(r.type)} · {titleCase(r.level)} · {titleCase(r.cost)} · {r.language}
                    {r.durationMin ? ` · ${r.durationMin} min` : ''}
                  </p>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 break-all text-xs text-[#065F46] hover:underline dark:text-[#84CC16]"
                  >
                    {r.url} <ExternalLink size={12} />
                  </a>
                  {r.description && (
                    <p className="mt-2 text-sm text-[var(--fg)]">{r.description}</p>
                  )}
                  {r.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-[var(--muted)]">
                    Submitted by{' '}
                    {r.submittedBy
                      ? `${r.submittedBy.firstName} ${r.submittedBy.lastName} (${r.submittedBy.email})`
                      : 'an unknown user'}
                    {' '}on {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => approveMut.mutate(r.id)}
                    disabled={approveMut.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Reject and delete "${r.title}"? This cannot be undone.`)) {
                        rejectMut.mutate(r.id);
                      }
                    }}
                    disabled={rejectMut.isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
