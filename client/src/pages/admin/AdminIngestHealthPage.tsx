// Admin Ingest Pipeline Health dashboard.
// Shows last 5 runs, per-source job breakdown, counts by status, feature-flag
// state, an ad-hoc URL ingest form, and a "run pipeline now" trigger.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, XCircle, Clock, Play, Link2 } from 'lucide-react';
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

type AdhocResult = {
  itemsFound: number;
  itemsPublished: number;
  itemsQueued: number;
  itemsRejected: number;
  ingestedSample: Array<{ title: string; status: string; confidence?: number }>;
  message?: string;
};

type RunNowResult = {
  scholarships: { enqueued: number; skipped?: string; error?: string; totals?: { itemsPublished: number; itemsQueued: number; itemsRejected: number } };
  opportunities: { enqueued: number; skipped?: string; error?: string; totals?: { itemsPublished: number; itemsQueued: number; itemsRejected: number } };
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

function DecisionPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === 'PUBLISHED'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
      : s === 'PENDING_REVIEW' || s === 'QUEUED' || s === 'INGESTED'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

// ── Ad-hoc ingest card ────────────────────────────────────────────────────────

function AdhocIngestCard() {
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'scholarship' | 'job'>('scholarship');
  const [result, setResult] = useState<AdhocResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/ingest/adhoc', { url, kind });
      return res.data.data as AdhocResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setErrorMsg(null);
      setUrl('');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setErrorMsg(e.response?.data?.error?.message ?? e.message ?? 'Unknown error');
      setResult(null);
    }
  });

  const busy = mutation.status === 'pending';

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-[#065F46]" />
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Ad-hoc URL ingest</div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">URL</label>
          <input
            type="url"
            className="input w-full"
            placeholder="https://scholarship-portal.example.com/listings"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="shrink-0">
          <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Type</label>
          <div className="flex gap-3">
            {(['scholarship', 'job'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="adhoc-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  disabled={busy}
                  className="accent-[#065F46]"
                />
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <button
          className="btn-primary shrink-0 disabled:opacity-50"
          disabled={busy || !url.trim()}
          onClick={() => mutation.mutate()}
        >
          {busy ? 'Ingesting…' : 'Ingest URL'}
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
          {errorMsg}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
          {result.itemsFound === 0 ? (
            <p className="text-sm text-[var(--muted)]">{result.message ?? 'No items found.'}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--fg)]">
                Found {result.itemsFound} item{result.itemsFound !== 1 ? 's' : ''} — {result.itemsPublished} published,{' '}
                {result.itemsQueued} queued, {result.itemsRejected} rejected
              </p>
              {result.ingestedSample.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.ingestedSample.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <DecisionPill status={s.status} />
                      <span className="line-clamp-1">{s.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Run-pipeline-now card ─────────────────────────────────────────────────────

function RunNowCard() {
  const queryClient = useQueryClient();
  const [which, setWhich] = useState<'all' | 'scholarships' | 'opportunities'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/ingest/run-now', { which });
      return res.data.data as RunNowResult;
    },
    onSuccess: (data) => {
      const sch = data.scholarships;
      const opp = data.opportunities;
      const parts: string[] = [];
      if (sch.error) parts.push(`Scholarships error: ${sch.error}`);
      else if (sch.skipped) parts.push(`Scholarships: skipped (flag off)`);
      else parts.push(`Scholarships: ${sch.enqueued} adapters run, ${sch.totals?.itemsPublished ?? 0} published`);

      if (opp.error) parts.push(`Jobs error: ${opp.error}`);
      else if (opp.skipped) parts.push(`Jobs: skipped (flag off)`);
      else parts.push(`Jobs: ${opp.enqueued} adapters run, ${opp.totals?.itemsPublished ?? 0} published`);

      setToast(parts.join(' | '));
      setToastKind('success');
      queryClient.invalidateQueries({ queryKey: QK });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setToast(e.response?.data?.error?.message ?? e.message ?? 'Run failed');
      setToastKind('error');
    }
  });

  const busy = mutation.status === 'pending';

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Play size={15} className="text-[#065F46]" />
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Run pipeline now</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="input w-44"
          value={which}
          onChange={(e) => setWhich(e.target.value as typeof which)}
          disabled={busy}
        >
          <option value="all">Both (Scholarships + Jobs)</option>
          <option value="scholarships">Scholarships only</option>
          <option value="opportunities">Jobs only</option>
        </select>

        <button
          className="btn-primary disabled:opacity-50"
          disabled={busy}
          onClick={() => { setToast(null); mutation.mutate(); }}
        >
          {busy ? 'Running…' : 'Run now'}
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${
          toastKind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'
            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400'
        }`}>
          {toast}
        </div>
      )}
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

      {/* Ad-hoc ingest */}
      <AdhocIngestCard />

      {/* Run pipeline now */}
      <RunNowCard />

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
