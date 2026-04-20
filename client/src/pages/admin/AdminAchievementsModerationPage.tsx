// Admin moderation queue for the Achievements Wall. Lists submissions that
// haven't been approved yet. Approve flips `isApproved=true` and notifies
// the submitter; Reject hard-deletes; Toggle Featured flips `isFeatured`.
//
// Gated to ADMIN at the route layer in App.tsx.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Trophy, Check, X, ExternalLink, Star
} from 'lucide-react';
import { api, resolveAsset } from '../../services/api';

type Submitter = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  programme: string | null;
  graduationYear: number | null;
};

type PendingAchievement = {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  link: string | null;
  imageUrl: string | null;
  isApproved: boolean;
  isFeatured: boolean;
  congratsCount: number;
  createdAt: string;
  user: Submitter;
};

const labelOfType = (t: string) => {
  switch (t) {
    case 'PROMOTION':        return 'Promotion';
    case 'PUBLICATION':      return 'Publication';
    case 'AWARD':            return 'Award';
    case 'VENTURE_LAUNCH':   return 'Venture Launch';
    case 'COMMUNITY_IMPACT': return 'Community Impact';
    case 'MEDIA_FEATURE':    return 'Media Feature';
    default:                 return 'Other';
  }
};

const TRUNC = 280;

export default function AdminAchievementsModerationPage() {
  const qc = useQueryClient();

  const { data: pending = [], isLoading } = useQuery<PendingAchievement[]>({
    queryKey: ['admin', 'achievements', 'pending'],
    queryFn: async () => (await api.get('/achievements/admin/pending')).data.data
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'achievements', 'pending'] });
    qc.invalidateQueries({ queryKey: ['achievements', 'feed'] });
  };

  const approveMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`/achievements/admin/${id}/approve`)).data.data,
    onSuccess: () => { invalidate(); toast.success('Approved'); },
    onError: () => toast.error('Approve failed')
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/achievements/${id}`)).data,
    onSuccess: () => { invalidate(); toast.success('Removed'); },
    onError: () => toast.error('Delete failed')
  });

  const featureMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`/achievements/admin/${id}/feature`)).data.data,
    onSuccess: () => { invalidate(); toast.success('Featured toggled'); },
    onError: () => toast.error('Toggle failed')
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
            — Achievements moderation
          </div>
          <h1 className="font-heading text-3xl font-extrabold">Pending submissions</h1>
          <p className="text-sm text-[var(--muted)]">
            Posts alumni shared that haven't been approved yet. Approve to publish, reject to remove,
            star to feature.
          </p>
        </div>
        <span className="rounded-full bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 text-sm font-semibold">
          {pending.length} pending
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="card h-32 skeleton" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Trophy size={28} />
          </div>
          <h2 className="mt-5 font-heading text-xl font-bold">Inbox zero</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            No pending achievements right now. New submissions land here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((a, i) => {
            const desc = a.description.length > TRUNC
              ? a.description.slice(0, TRUNC).trimEnd() + '…'
              : a.description;
            const submitter = a.user;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <div className="flex flex-wrap gap-4">
                  {a.imageUrl && (
                    <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                      <img src={resolveAsset(a.imageUrl)} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-lg font-bold">{a.title}</h3>
                      <span className="rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
                        Pending
                      </span>
                      {a.isFeatured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <Star size={10} className="fill-current" /> Featured
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {labelOfType(a.type)} ·{' '}
                      {new Date(a.date).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-[var(--fg)]/90">{desc}</p>
                    {a.link && (
                      <a
                        href={a.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 break-all text-xs text-[#065F46] hover:underline dark:text-[#84CC16]"
                      >
                        {a.link} <ExternalLink size={12} />
                      </a>
                    )}
                    <p className="mt-3 text-[11px] text-[var(--muted)]">
                      Submitted by {submitter.firstName} {submitter.lastName} ({submitter.email})
                      {submitter.programme ? ` · ${submitter.programme}` : ''}
                      {submitter.graduationYear ? ` '${String(submitter.graduationYear).slice(-2)}` : ''}
                      {' '}on {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2">
                    <button
                      onClick={() => approveMut.mutate(a.id)}
                      disabled={approveMut.isPending}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
                    >
                      <Check size={14} /> Approve
                    </button>
                    <button
                      onClick={() => featureMut.mutate(a.id)}
                      disabled={featureMut.isPending}
                      className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        a.isFeatured
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-[var(--border)] hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-300'
                      }`}
                      title={a.isFeatured ? 'Unfeature' : 'Feature on the wall'}
                    >
                      <Star size={14} className={a.isFeatured ? 'fill-current' : ''} />
                      {a.isFeatured ? 'Featured' : 'Feature'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Reject and delete "${a.title}"? This cannot be undone.`)) {
                          rejectMut.mutate(a.id);
                        }
                      }}
                      disabled={rejectMut.isPending}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
