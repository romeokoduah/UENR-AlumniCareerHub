// Unified moderation history page.
// Route: /admin/moderation-history
// Shows AuditLog entries across all moderation kinds with filter dropdowns
// and infinite scroll via cursor-based pagination.

import { useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { History, ChevronDown, Undo2 } from 'lucide-react';
import { api } from '../../services/api';

// ---- Types ---------------------------------------------------------------

type HistoryItem = {
  id: string;
  action: string;
  actorId: string;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  targetTitle: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  canUndo: boolean;
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: string | null;
};

// ---- Helpers -------------------------------------------------------------

function ActionPill({ action }: { action: string }) {
  const lower = action.toLowerCase();
  const isApprove = lower.includes('approve') && !lower.includes('undo');
  const isReject = lower.includes('reject') && !lower.includes('undo');
  const isBulk = lower.includes('bulk');
  const isUndo = lower.includes('undo');

  const cls = isApprove
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
    : isReject
    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
    : isUndo
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]';

  const label = isBulk
    ? isApprove ? 'Bulk approve' : isReject ? 'Bulk reject' : action
    : isApprove ? 'Approved'
    : isReject ? 'Rejected'
    : isUndo ? 'Undo'
    : action;

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  } catch {
    return iso;
  }
}

// ---- History Row ---------------------------------------------------------

function HistoryRow({ item, onUndo }: { item: HistoryItem; onUndo: (id: string) => void }) {
  const withinDay = item.canUndo;

  return (
    <tr className="border-b border-[var(--border)]/50 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] text-sm">
      <td className="px-4 py-3 max-w-xs">
        <span className="font-medium">
          {item.targetTitle ?? item.targetId ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <ActionPill action={item.action} />
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]">
        {item.actorName ?? item.actorId}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
        {relativeTime(item.createdAt)}
      </td>
      <td className="px-4 py-3">
        {withinDay && (
          <button
            onClick={() => onUndo(item.id)}
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            <Undo2 size={11} /> Undo
          </button>
        )}
      </td>
    </tr>
  );
}

// ---- Page ----------------------------------------------------------------

export default function AdminModerationHistoryPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState('');
  const [action, setAction] = useState('');

  const buildQueryFn = useCallback(
    async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (kind) params.set('kind', kind);
      if (action) params.set('action', action);
      if (pageParam) params.set('cursor', pageParam);
      const res = await api.get(`/admin/moderation-history?${params}`);
      return res.data.data as HistoryPage;
    },
    [kind, action]
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteQuery({
    queryKey: ['admin', 'moderation-history', kind, action],
    queryFn: buildQueryFn,
    getNextPageParam: (last: HistoryPage) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined
  });

  const undoMut = useMutation({
    mutationFn: async (auditId: string) => {
      const res = await api.post(`/admin/moderation-history/${auditId}/undo`);
      return res.data.data as { restored: number };
    },
    onSuccess: (data) => {
      toast.success(`Reversed: ${data.restored} item${data.restored !== 1 ? 's' : ''} restored`);
      qc.invalidateQueries({ queryKey: ['admin', 'moderation-history'] });
      qc.invalidateQueries({ queryKey: ['admin', 'moderation', 'queue'] });
      qc.invalidateQueries({ queryKey: ['admin', 'scholarships', 'pending'] });
      qc.invalidateQueries({ queryKey: ['admin', 'opportunities', 'pending'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Undo failed')
  });

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <History size={20} className="text-[#065F46]" />
        <h1 className="font-heading text-2xl font-bold">Moderation History</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Kind</label>
          <select
            className="input text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All kinds</option>
            <option value="scholarship">Scholarship</option>
            <option value="opportunity">Opportunity</option>
            <option value="moderation">Universal moderation</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Action</label>
          <select
            className="input text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All actions</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="bulk_approve">Bulk approve</option>
            <option value="bulk_reject">Bulk reject</option>
            <option value="undo">Undo</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="card py-10 text-center text-sm text-[var(--muted)]">Loading history…</div>
      ) : allItems.length === 0 ? (
        <div className="card py-10 text-center text-sm text-[var(--muted)]">No history entries found.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  onUndo={(id) => undoMut.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <div className="text-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold hover:border-[#065F46]/50 disabled:opacity-50"
          >
            <ChevronDown size={14} />
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
