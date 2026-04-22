// Admin review queue for AI-ingested scholarships.
// Shows rows with status=PENDING_REVIEW so an admin can approve, reject, or
// edit-then-approve each one before it goes live to students.
//
// Gated to ADMIN at the route layer in App.tsx.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, GraduationCap, Check, X, ExternalLink, Pencil, Clock, CheckSquare
} from 'lucide-react';
import { api } from '../../services/api';
import { ModerationHistoryPanel } from '../../components/admin/ModerationHistoryPanel';
import type { Scholarship } from '../../types';

const QK = ['admin', 'scholarships', 'pending'] as const;

function Chip({ label }: { label?: string | null }) {
  return (
    <span className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
      {label ?? '—'}
    </span>
  );
}

function DeadlineText({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-xs text-[var(--muted)]">Rolling</span>;
  const d = new Date(deadline);
  return <span className="text-xs text-[var(--muted)]">{d.toLocaleDateString()}</span>;
}

type EditDraft = {
  title: string;
  deadline: string;
  applicationUrl: string;
};

function EditForm({
  item,
  onCancel,
  onSave,
  isSaving,
}: {
  item: Scholarship;
  onCancel: () => void;
  onSave: (draft: EditDraft) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<EditDraft>({
    title: item.title,
    deadline: item.deadline ?? '',
    applicationUrl: item.applicationUrl,
  });

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Edit before approving</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Title</label>
          <input
            className="input w-full"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Deadline (leave blank for rolling)</label>
          <input
            type="date"
            className="input w-full"
            value={draft.deadline}
            onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Application URL</label>
          <input
            className="input w-full"
            value={draft.applicationUrl}
            onChange={(e) => setDraft((d) => ({ ...d, applicationUrl: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(draft)}
          disabled={isSaving}
          className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B] disabled:opacity-60"
        >
          <Check size={13} /> Save & approve
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AdminScholarshipsReviewPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState(new Set<string>());

  const { data: pending = [], isLoading } = useQuery<Scholarship[]>({
    queryKey: QK,
    queryFn: async () => (await api.get('/admin/scholarships/pending')).data.data,
  });

  // Auto-drop ids that are no longer in the pending list after refetch
  useEffect(() => {
    if (selected.size === 0) return;
    const visibleIds = new Set(pending.map((s) => s.id));
    const next = new Set([...selected].filter((id) => visibleIds.has(id)));
    if (next.size !== selected.size) setSelected(next);
  }, [pending]);

  const allVisible = pending;
  const allSelected = allVisible.length > 0 && allVisible.every((s) => selected.has(s.id));
  const someSelected = selected.size > 0 && !allSelected;

  const approveMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/scholarships/${id}/approve`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success('Scholarship approved');
    },
    onError: () => toast.error('Approve failed — please try again'),
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/scholarships/${id}/reject`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success('Scholarship rejected');
    },
    onError: () => toast.error('Reject failed — please try again'),
  });

  const editApproveMut = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: EditDraft }) =>
      (await api.post(`/admin/scholarships/${id}/edit`, {
        title: draft.title || undefined,
        deadline: draft.deadline || null,
        applicationUrl: draft.applicationUrl || undefined,
      })).data.data,
    onSuccess: (_data, { id }) => {
      // After edit, approve
      approveMut.mutate(id);
      setEditingId(null);
    },
    onError: () => toast.error('Edit failed — please try again'),
  });

  const bulkApproveMut = useMutation({
    mutationFn: (ids: string[]) =>
      api.post('/admin/scholarships/bulk/approve', { ids }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QK });
      setSelected(new Set());
      const n = res.data?.data?.updated ?? selected.size;
      toast.success(`${n} scholarship${n === 1 ? '' : 's'} approved`);
    },
    onError: () => toast.error('Bulk approve failed — please try again'),
  });

  const bulkRejectMut = useMutation({
    mutationFn: (ids: string[]) =>
      api.post('/admin/scholarships/bulk/reject', { ids }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QK });
      setSelected(new Set());
      const n = res.data?.data?.updated ?? selected.size;
      toast.success(`${n} scholarship${n === 1 ? '' : 's'} rejected`);
    },
    onError: () => toast.error('Bulk reject failed — please try again'),
  });

  const isBusy = approveMut.isPending || rejectMut.isPending || editApproveMut.isPending;
  const isBulkBusy = bulkApproveMut.isPending || bulkRejectMut.isPending;

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
            — Scholarship ingestion
          </div>
          <h1 className="font-heading text-3xl font-extrabold">Scholarship Review Queue</h1>
          <p className="text-sm text-[var(--muted)]">
            AI-ingested scholarships awaiting your sign-off before going live.
          </p>
        </div>
        <span className="rounded-full bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 text-sm font-semibold">
          {pending.length} items pending review.
        </span>
      </div>

      {/* Bulk action bar — only shown when items are selected */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-[var(--surface,var(--card))]/95 backdrop-blur border border-[var(--border)] rounded-xl p-3 flex items-center gap-3 mb-4">
          <CheckSquare size={16} className="text-[#065F46] dark:text-[#84CC16] shrink-0" />
          <span className="text-sm font-semibold flex-1">{selected.size} selected</span>
          <button
            onClick={() => { if (selected.size > 0) bulkApproveMut.mutate([...selected]); }}
            disabled={isBulkBusy}
            className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B] disabled:opacity-60"
          >
            <Check size={13} /> Approve all
          </button>
          <button
            onClick={() => { if (selected.size > 0) bulkRejectMut.mutate([...selected]); }}
            disabled={isBulkBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950 disabled:opacity-60"
          >
            <X size={13} /> Reject all
          </button>
          <button
            onClick={() => setSelected(new Set())}
            disabled={isBulkBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="card h-40 skeleton" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <GraduationCap size={28} />
          </div>
          <h2 className="mt-5 font-heading text-xl font-bold">No scholarships waiting for review. 🎉</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            New ingested scholarships will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select-all checkbox */}
          <div className="flex items-center gap-2 px-1 pb-1">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={() => {
                if (allSelected || someSelected) setSelected(new Set());
                else setSelected(new Set(allVisible.map((i) => i.id)));
              }}
              className="h-4 w-4 cursor-pointer accent-[#065F46]"
            />
            <span className="text-xs text-[var(--muted)]">Select all</span>
          </div>

          {pending.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Left: details */}
                <div className="min-w-0 flex-1">
                  {/* Title + provider + confidence pill */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Per-row checkbox */}
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        setSelected(next);
                      }}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[#065F46]"
                    />
                    <h3 className="font-heading text-lg font-bold">{s.title}</h3>
                    {s.confidence != null && (
                      <span className="rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold text-[#92400E] dark:text-[#F59E0B]">
                        {Math.round(s.confidence * 100)}% confident
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-[#065F46] dark:text-[#84CC16]">{s.provider}</p>

                  {/* Facet chips */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip label={s.category?.field} />
                    <Chip label={s.category?.region} />
                    <Chip label={s.category?.funding} />
                  </div>

                  {/* Deadline + source */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      <DeadlineText deadline={s.deadline} />
                    </span>
                    {s.sourceName && (
                      <span>
                        Source:{' '}
                        {s.sourceUrl ? (
                          <a
                            href={s.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
                          >
                            {s.sourceName} <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="font-semibold">{s.sourceName}</span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Verifier reasoning */}
                  {s.verifierReason && (
                    <p className="mt-2 line-clamp-2 text-xs italic text-[var(--muted)]">
                      {s.verifierReason}
                    </p>
                  )}

                  {/* Inline edit form */}
                  {editingId === s.id && (
                    <EditForm
                      item={s}
                      onCancel={() => setEditingId(null)}
                      isSaving={editApproveMut.isPending}
                      onSave={(draft) => editApproveMut.mutate({ id: s.id, draft })}
                    />
                  )}
                </div>

                {/* Right: action buttons */}
                {editingId !== s.id && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      onClick={() => approveMut.mutate(s.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B] disabled:opacity-60"
                    >
                      <Check size={13} /> Approve
                    </button>
                    <button
                      onClick={() => setEditingId(s.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60"
                    >
                      <Pencil size={13} /> Edit & approve
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Reject "${s.title}"? This cannot be undone.`)) {
                          rejectMut.mutate(s.id);
                        }
                      }}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950 disabled:opacity-60"
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <ModerationHistoryPanel kind="scholarship" pendingQueryKey={QK} />
    </div>
  );
}
