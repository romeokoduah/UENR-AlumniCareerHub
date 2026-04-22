// Collapsible "Recent moderation history" panel shown at the bottom of each
// admin review page. Scoped to a specific kind (scholarship / opportunity /
// undefined for moderation page = all).

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Undo2 } from 'lucide-react';
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

// ---- Helpers -------------------------------------------------------------

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

// ---- Component -----------------------------------------------------------

export function ModerationHistoryPanel({
  kind,
  pendingQueryKey
}: {
  kind?: 'scholarship' | 'opportunity';
  pendingQueryKey?: readonly string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const queryKey = ['admin', 'moderation-history-panel', kind ?? 'all'] as const;

  const { data, isLoading } = useQuery<{ items: HistoryItem[]; nextCursor: string | null }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (kind) params.set('kind', kind);
      const res = await api.get(`/admin/moderation-history?${params}`);
      return res.data.data;
    },
    enabled: open,
    staleTime: 30_000
  });

  const undoMut = useMutation({
    mutationFn: async (auditId: string) => {
      const res = await api.post(`/admin/moderation-history/${auditId}/undo`);
      return res.data.data as { restored: number };
    },
    onSuccess: (data, auditId) => {
      const entry = data;
      toast.success(`Reversed — ${entry.restored} item${entry.restored !== 1 ? 's' : ''} restored`);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['admin', 'moderation', 'queue'] });
      if (pendingQueryKey) {
        qc.invalidateQueries({ queryKey: pendingQueryKey });
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Undo failed')
  });

  const items = data?.items ?? [];

  return (
    <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-bold">Recent moderation history</span>
        {open ? <ChevronUp size={16} className="text-[var(--muted)]" /> : <ChevronDown size={16} className="text-[var(--muted)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--border)]">
          {isLoading ? (
            <div className="px-5 py-6 text-center text-sm text-[var(--muted)]">Loading history…</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-[var(--muted)]">No recent entries.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] text-left text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2.5">Target</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Actor</th>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border)]/50 last:border-b-0 hover:bg-black/[0.01] dark:hover:bg-white/[0.01]"
                    >
                      <td className="px-4 py-2.5 max-w-xs text-xs font-medium">
                        {item.targetTitle ?? item.targetId ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <ActionPill action={item.action} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted)]">
                        {item.actorName ?? item.actorId}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">
                        {relativeTime(item.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        {item.canUndo && (
                          <button
                            onClick={() => undoMut.mutate(item.id)}
                            disabled={undoMut.isPending}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30 disabled:opacity-50"
                          >
                            <Undo2 size={10} /> Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
