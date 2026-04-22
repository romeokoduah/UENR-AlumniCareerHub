// Admin Ingest Pipeline Health dashboard.
// Shows last 5 runs, per-source job breakdown, counts by status, and
// feature-flag state. Read-only — no mutations.

import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '../../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type IngestRun = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  sourcesOk: number;
  sourcesFailed: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
  triggeredBy: string;
};

type JobBreakdown = {
  source: string;
  lastStatus: string;
  attempts: number;
  updatedAt: string;
};

type StatusCounts = {
  pendingReview: number;
  published: number;
  rejected: number;
  expired: number;
};

type IngestStatsData = {
  lastRuns: IngestRun[];
  jobsBreakdown: JobBreakdown[];
  counts: {
    scholarships: StatusCounts;
    opportunities: StatusCounts;
  };
  flags: {
    scholarshipsIngestEnabled: boolean;
    opportunitiesIngestEnabled: boolean;
  };
};

const QK = ['admin', 'ingest-stats'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function StatusPill({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const cls =
    upper === 'DONE'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
      : upper === 'FAILED'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function FlagBadge({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-[var(--fg)]">{label}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
          on
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
        }`}
      >
        {on ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

function CountCard({
  label,
  counts
}: {
  label: string;
  counts: StatusCounts;
}) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[var(--bg)] px-3 py-2 text-center">
          <div className="text-2xl font-bold text-[#065F46]">{counts.published}</div>
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Published</div>
        </div>
        <div className="rounded-lg bg-[var(--bg)] px-3 py-2 text-center">
          <div className="text-2xl font-bold text-amber-600">{counts.pendingReview}</div>
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Pending</div>
        </div>
        <div className="rounded-lg bg-[var(--bg)] px-3 py-2 text-center">
          <div className="text-2xl font-bold text-rose-500">{counts.rejected}</div>
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Rejected</div>
        </div>
        <div className="rounded-lg bg-[var(--bg)] px-3 py-2 text-center">
          <div className="text-2xl font-bold text-[var(--muted)]">{counts.expired}</div>
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Expired</div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminIngestHealthPage() {
  const { data, isLoading, isError } = useQuery<IngestStatsData>({
    queryKey: QK,
    queryFn: async () => (await api.get('/admin/ingest-stats')).data.data,
    refetchInterval: 60_000
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity size={22} className="text-[#065F46]" />
        <h1 className="font-heading text-2xl font-bold">Ingest Pipeline Health</h1>
      </div>

      {/* Feature flags */}
      <div className="card">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Feature Flags</div>
        {isLoading ? (
          <div className="flex gap-6">
            <div className="h-5 w-36 skeleton rounded" />
            <div className="h-5 w-36 skeleton rounded" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-[var(--muted)]">Could not load flags.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <FlagBadge on={data.flags.scholarshipsIngestEnabled} label="Scholarships" />
            <FlagBadge on={data.flags.opportunitiesIngestEnabled} label="Jobs" />
          </div>
        )}
      </div>

      {/* Count cards */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Content Counts</div>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card h-40 skeleton" />
            <div className="card h-40 skeleton" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-[var(--muted)]">Could not load counts.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CountCard label="Scholarships" counts={data.counts.scholarships} />
            <CountCard label="Opportunities" counts={data.counts.opportunities} />
          </div>
        )}
      </div>

      {/* Last 5 runs */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Last 5 Runs</div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="card h-12 skeleton" />)}</div>
        ) : isError || !data ? (
          <p className="text-sm text-[var(--muted)]">Could not load runs.</p>
        ) : data.lastRuns.length === 0 ? (
          <div className="card py-10 text-center text-sm text-[var(--muted)]">No runs recorded yet.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <th className="px-4 py-2.5">Started</th>
                  <th className="px-4 py-2.5">Triggered by</th>
                  <th className="px-4 py-2.5 text-center">
                    <CheckCircle2 size={12} className="inline mr-1 text-emerald-500" />OK
                  </th>
                  <th className="px-4 py-2.5 text-center">
                    <XCircle size={12} className="inline mr-1 text-rose-500" />Fail
                  </th>
                  <th className="px-4 py-2.5 text-center">Published</th>
                  <th className="px-4 py-2.5 text-center">Queued</th>
                  <th className="px-4 py-2.5 text-center">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {data.lastRuns.map((run) => (
                  <tr key={run.id} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[var(--fg)]">
                        <Clock size={11} className="text-[var(--muted)]" />
                        {humanTime(run.startedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--muted)]">{run.triggeredBy}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-emerald-600">{run.sourcesOk}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-rose-500">{run.sourcesFailed}</td>
                    <td className="px-4 py-2.5 text-center">{run.itemsPublished}</td>
                    <td className="px-4 py-2.5 text-center">{run.itemsQueued}</td>
                    <td className="px-4 py-2.5 text-center">{run.itemsRejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Source health */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Source Health (last 7 days)</div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="card h-10 skeleton" />)}</div>
        ) : isError || !data ? (
          <p className="text-sm text-[var(--muted)]">Could not load source health.</p>
        ) : data.jobsBreakdown.length === 0 ? (
          <div className="card py-10 text-center text-sm text-[var(--muted)]">No jobs found in the last 7 days.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Last Status</th>
                  <th className="px-4 py-2.5 text-center">Attempts</th>
                  <th className="px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.jobsBreakdown.map((job) => (
                  <tr key={job.source} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-mono text-xs">{job.source}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={job.lastStatus} />
                    </td>
                    <td className="px-4 py-2.5 text-center text-[var(--muted)]">{job.attempts}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">{humanTime(job.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
