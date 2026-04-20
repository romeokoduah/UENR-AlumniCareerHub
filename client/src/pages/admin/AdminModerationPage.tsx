// Phase 3 — Universal Moderation Queue.
//
// Single unified feed of every pending user submission across the
// platform (opportunities, scholarships, learning resources, interview
// questions, achievements, unpublished portfolios) plus auto-hidden
// flagged interview questions. Per-row Approve / Reject / Edit actions
// all call /api/admin/moderation and re-fetch on success.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Check, X, Pencil, Inbox, ChevronDown, ChevronUp, Briefcase,
  GraduationCap, BookOpen, HelpCircle, Trophy, Globe, Flag
} from 'lucide-react';
import { api } from '../../services/api';

type Kind =
  | 'opportunity'
  | 'scholarship'
  | 'learning_resource'
  | 'interview_question'
  | 'achievement'
  | 'portfolio'
  | 'interview_question_flag';

type Submitter = {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
} | null;

type QueueItem = {
  kind: Kind;
  id: string;
  title: string;
  submitter: Submitter;
  createdAt: string;
  preview: string;
  raw: Record<string, unknown>;
};

type Counts = Record<Kind, number> & { total: number };

const KIND_META: Record<Kind, { label: string; short: string; icon: typeof Briefcase; color: string }> = {
  opportunity:             { label: 'Opportunity',          short: 'Job',         icon: Briefcase,    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  scholarship:             { label: 'Scholarship',          short: 'Scholarship', icon: GraduationCap, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  learning_resource:       { label: 'Learning resource',    short: 'Learning',    icon: BookOpen,     color: 'bg-[#84CC16]/15 text-[#065F46] dark:text-[#84CC16]' },
  interview_question:      { label: 'Interview question',   short: 'Question',    icon: HelpCircle,   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  achievement:             { label: 'Achievement',          short: 'Achievement', icon: Trophy,       color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  portfolio:               { label: 'Portfolio',            short: 'Portfolio',   icon: Globe,        color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  interview_question_flag: { label: 'Flagged question',     short: 'Flagged',     icon: Flag,         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
};

const FILTER_ORDER: ({ key: 'all' | Kind; label: string })[] = [
  { key: 'all', label: 'All' },
  { key: 'opportunity', label: 'Opportunities' },
  { key: 'scholarship', label: 'Scholarships' },
  { key: 'learning_resource', label: 'Learning' },
  { key: 'interview_question', label: 'Questions' },
  { key: 'achievement', label: 'Achievements' },
  { key: 'portfolio', label: 'Portfolios' },
  { key: 'interview_question_flag', label: 'Flagged' }
];

function submitterName(s: Submitter): string {
  if (!s) return 'Unknown';
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ');
  return name || s.email || 'Unknown';
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AdminModerationPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QueueItem | null>(null);

  const { data, isLoading } = useQuery<{ items: QueueItem[] }>({
    queryKey: ['admin', 'moderation', 'queue'],
    queryFn: async () => (await api.get('/admin/moderation')).data.data
  });
  const items = data?.items ?? [];

  const { data: counts } = useQuery<Counts>({
    queryKey: ['admin', 'moderation', 'counts'],
    queryFn: async () => (await api.get('/admin/moderation/counts')).data.data
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'moderation', 'queue'] });
    qc.invalidateQueries({ queryKey: ['admin', 'moderation', 'counts'] });
  };

  const approveMut = useMutation({
    mutationFn: async ({ kind, id }: { kind: Kind; id: string }) =>
      (await api.post(`/admin/moderation/${kind}/${id}/approve`)).data.data,
    onSuccess: () => { toast.success('Approved'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to approve')
  });

  const rejectMut = useMutation({
    mutationFn: async ({ kind, id }: { kind: Kind; id: string }) =>
      (await api.post(`/admin/moderation/${kind}/${id}/reject`)).data.data,
    onSuccess: () => { toast.success('Rejected'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to reject')
  });

  const patchMut = useMutation({
    mutationFn: async ({ kind, id, body }: { kind: Kind; id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/admin/moderation/${kind}/${id}`, body)).data.data,
    onSuccess: () => { toast.success('Saved and published'); invalidate(); setEditing(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to save')
  });

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => it.kind === filter);
  }, [items, filter]);

  const total = counts?.total ?? items.length;

  const onReject = (item: QueueItem) => {
    const typed = window.prompt(
      `Type REJECT to confirm rejecting "${item.title}". This action is audited.`
    );
    if (typed !== 'REJECT') {
      if (typed !== null) toast.error('Rejection cancelled — you must type REJECT exactly.');
      return;
    }
    rejectMut.mutate({ kind: item.kind, id: item.id });
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold">Universal moderation</h1>
          <p className="text-sm text-[var(--muted)]">
            One queue for every pending submission. Approve, reject, or edit-and-publish.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Pending</div>
          <div className="font-heading text-2xl font-black">{total}</div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTER_ORDER.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === 'all' ? total : counts ? counts[f.key] : 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  active ? 'bg-white/20' : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">
          Loading queue…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <Inbox size={32} className="mx-auto text-[#84CC16]" />
          <h2 className="mt-4 font-heading text-xl font-bold">Nothing in the queue.</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Inbox zero — nice work.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Submitter</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Preview</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, i) => {
                const meta = KIND_META[it.kind];
                const Icon = meta.icon;
                const expanded = expandedId === `${it.kind}:${it.id}`;
                return (
                  <Row
                    key={`${it.kind}:${it.id}`}
                    index={i}
                    item={it}
                    expanded={expanded}
                    onToggle={() =>
                      setExpandedId(expanded ? null : `${it.kind}:${it.id}`)
                    }
                    onApprove={() => approveMut.mutate({ kind: it.kind, id: it.id })}
                    onReject={() => onReject(it)}
                    onEdit={() => setEditing(it)}
                    pending={approveMut.isPending || rejectMut.isPending}
                    meta={meta}
                    Icon={Icon}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <EditModal
            key={`${editing.kind}:${editing.id}`}
            item={editing}
            onClose={() => setEditing(null)}
            onSave={(body) => patchMut.mutate({ kind: editing.kind, id: editing.id, body })}
            saving={patchMut.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- row component -------------------------------------------------------

function Row({
  index,
  item,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onEdit,
  pending,
  meta,
  Icon
}: {
  index: number;
  item: QueueItem;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  pending: boolean;
  meta: typeof KIND_META[Kind];
  Icon: typeof Briefcase;
}) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: Math.min(index * 0.01, 0.2) }}
        className="cursor-pointer border-b border-[var(--border)]/50 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>
            <Icon size={10} /> {meta.short}
          </span>
        </td>
        <td className="max-w-xs px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{item.title}</span>
            {expanded ? <ChevronUp size={14} className="shrink-0 text-[var(--muted)]" /> : <ChevronDown size={14} className="shrink-0 text-[var(--muted)]" />}
          </div>
        </td>
        <td className="px-4 py-3 text-xs">
          <div>{submitterName(item.submitter)}</div>
          {item.submitter?.email && (
            <div className="text-[var(--muted)]">{item.submitter.email}</div>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
          {fmtDate(item.createdAt)}
        </td>
        <td className="max-w-md px-4 py-3 text-xs text-[var(--muted)]">
          <div className="line-clamp-2">{item.preview || '—'}</div>
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onApprove}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full bg-[#065F46] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#065F46]/90 disabled:opacity-50"
              title="Approve"
            >
              <Check size={12} /> Approve
            </button>
            <button
              onClick={onEdit}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold hover:border-[#065F46]/50 disabled:opacity-50"
              title="Edit"
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={onReject}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
              title="Reject"
            >
              <X size={12} /> Reject
            </button>
          </div>
        </td>
      </motion.tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-b border-[var(--border)]/50"
          >
            <td colSpan={6} className="bg-black/[0.02] px-4 py-4 dark:bg-white/[0.02]">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Full preview</div>
              <div className="mb-3 whitespace-pre-wrap text-xs">{item.preview || '—'}</div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Raw record</div>
              <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-[11px] leading-relaxed">
                {JSON.stringify(item.raw, null, 2)}
              </pre>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ---- edit modal ----------------------------------------------------------

function EditModal({
  item,
  onClose,
  onSave,
  saving
}: {
  item: QueueItem;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<string>(() => JSON.stringify(item.raw, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e: any) {
      setError(e?.message ?? 'Invalid JSON');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Body must be a JSON object');
      return;
    }
    setError(null);
    // Strip server-owned fields — the PATCH endpoint validates only the
    // whitelisted columns anyway, but sending id/createdAt would just noisy
    // the audit log.
    const { id, createdAt, updatedAt, isApproved, isPublished, ...body } = parsed as Record<string, unknown>;
    void id; void createdAt; void updatedAt; void isApproved; void isPublished;
    onSave(body);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h3 className="font-heading text-lg font-bold">Edit &amp; publish</h3>
            <p className="text-xs text-[var(--muted)]">
              {KIND_META[item.kind].label} · {item.title}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Edit the JSON below. Server validates only the editable columns for this kind and
              sets <code className="rounded bg-[var(--bg)] px-1">isApproved=true</code> after save.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="h-[50vh] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-[12px] leading-relaxed focus:border-[#065F46] focus:outline-none"
          />
          {error && (
            <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold hover:border-[#065F46]/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#065F46]/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
