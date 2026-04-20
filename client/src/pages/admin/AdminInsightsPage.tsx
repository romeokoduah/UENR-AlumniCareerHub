// Phase 4 admin console: Insights + Audit log + Universal "find anything"
// search. Three tabs in a single page. No chart library — all bars are
// hand-rolled Tailwind divs so the client stays tiny.
//
// Mounted at /admin/insights (superuser-only gate is on the server).

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, BarChart3, ClipboardList, Search, Download, Calendar,
  User as UserIcon, Briefcase, FileText, Award, Trophy, ScrollText,
  ArrowUpRight, Clock, LogIn, ShieldCheck, X, History
} from 'lucide-react';
import { api } from '../../services/api';

// ---- shared types ---------------------------------------------------------

type Tab = 'overview' | 'audit' | 'search';

type DayPoint = { date: string; count: number };
type ToolRow = { tool: string; opens: number; uniqueUsers: number };

type UsageResponse = {
  activeUsers: { dau: number; wau: number; mau: number };
  perToolOpens: ToolRow[];
  newUsersByDay: DayPoint[];
  applicationsByDay: DayPoint[];
  bookingsByDay: DayPoint[];
};

type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

type AuditResponse = {
  items: AuditRow[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

type TimelineItem =
  | { kind: 'activity'; id: string; createdAt: string; tool: string; action: string; metadata: unknown }
  | { kind: 'login'; id: string; createdAt: string; ip: string | null; userAgent: string | null; success: boolean }
  | { kind: 'audit'; id: string; createdAt: string; action: string; targetType: string | null; targetId: string | null; metadata: unknown };

type TimelineResponse = {
  user: {
    id: string; firstName: string; lastName: string; email: string;
    role: string; isSuperuser: boolean; createdAt: string;
  };
  items: TimelineItem[];
};

type SearchHit = {
  kind: 'user' | 'opportunity' | 'application' | 'certification' | 'achievement' | 'transcript';
  id: string;
  label: string;
  sublabel: string;
  deepLink: string;
};

// ---- constants ------------------------------------------------------------

const DAY_OPTIONS = [7, 14, 30, 60, 90];
const RECENT_SEARCH_KEY = 'uenr_admin_insights_recent';
const MAX_RECENT = 8;

// ---- helpers --------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---- page root ------------------------------------------------------------

export default function AdminInsightsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-extrabold">Insights &amp; audit</h1>
        <p className="text-sm text-[var(--muted)]">
          Platform usage, the full audit log, and a universal find-anything search.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-[var(--border)]">
        {([
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'audit', label: 'Audit log', icon: ClipboardList },
          { key: 'search', label: 'Universal search', icon: Search }
        ] as { key: Tab; label: string; icon: typeof BarChart3 }[]).map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'border-[#065F46] text-[#065F46] dark:text-[#84CC16] dark:border-[#84CC16]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'audit' && <AuditTab onOpenUser={(id) => setDrawerUserId(id)} />}
      {tab === 'search' && <SearchTab />}

      <AnimatePresence>
        {drawerUserId && (
          <TimelineDrawer userId={drawerUserId} onClose={() => setDrawerUserId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================================================
// Tab: Overview
// ==========================================================================

function OverviewTab() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<UsageResponse>({
    queryKey: ['admin', 'insights', 'usage', days],
    queryFn: async () => (await api.get('/admin/insights/usage', { params: { days } })).data.data
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Window</span>
        {DAY_OPTIONS.map((d) => {
          const active = d === days;
          return (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                active
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
              }`}
            >
              {d}d
            </button>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Active users</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: 'DAU', sub: 'distinct users active in the last 24h', value: data?.activeUsers.dau ?? 0 },
            { label: 'WAU', sub: 'last 7 days', value: data?.activeUsers.wau ?? 0 },
            { label: 'MAU', sub: 'last 30 days', value: data?.activeUsers.mau ?? 0 }
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                <Activity size={12} /> {c.label}
              </div>
              <div className="mt-2 font-heading text-4xl font-black">
                {isLoading ? '—' : c.value.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Per-tool opens (top 10)</h2>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {(data?.perToolOpens ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">
              {isLoading ? 'Loading…' : 'No Career Tools activity recorded in this window.'}
            </div>
          ) : (
            <ToolBarTable rows={(data?.perToolOpens ?? []).slice(0, 10)} />
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <MiniTimeline title="New users / day" points={data?.newUsersByDay ?? []} icon={UserIcon} />
        <MiniTimeline title="Applications / day" points={data?.applicationsByDay ?? []} icon={Briefcase} />
        <MiniTimeline title="Counseling bookings / day" points={data?.bookingsByDay ?? []} icon={Calendar} />
      </section>
    </div>
  );
}

function ToolBarTable({ rows }: { rows: ToolRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.opens));
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--muted)]">
        <tr>
          <th className="px-4 py-3">Tool</th>
          <th className="px-4 py-3">Opens</th>
          <th className="px-4 py-3 hidden md:table-cell">Unique users</th>
          <th className="px-4 py-3 w-[45%]">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = Math.round((r.opens / max) * 100);
          return (
            <tr key={r.tool} className="border-b border-[var(--border)]/50 last:border-b-0">
              <td className="px-4 py-3 font-semibold">{r.tool}</td>
              <td className="px-4 py-3 tabular-nums">{r.opens.toLocaleString()}</td>
              <td className="px-4 py-3 tabular-nums text-[var(--muted)] hidden md:table-cell">{r.uniqueUsers.toLocaleString()}</td>
              <td className="px-4 py-3">
                <div className="h-2 w-full rounded-full bg-[var(--bg)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#065F46] dark:bg-[#84CC16]"
                    style={{ width: pct + '%' }}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MiniTimeline({
  title, points, icon: Icon
}: { title: string; points: DayPoint[]; icon: typeof BarChart3 }) {
  const total = points.reduce((acc, p) => acc + p.count, 0);
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          <Icon size={12} /> {title}
        </div>
        <div className="tabular-nums text-sm font-bold">{total.toLocaleString()}</div>
      </div>
      <div className="flex h-24 items-end gap-[2px]">
        {points.map((p) => {
          const h = Math.max(2, Math.round((p.count / max) * 100));
          return (
            <div
              key={p.date}
              className="flex-1 rounded-t bg-[#065F46]/20 hover:bg-[#065F46] dark:bg-[#84CC16]/25 dark:hover:bg-[#84CC16] transition-colors"
              style={{ height: h + '%' }}
              title={`${p.date} · ${p.count}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[var(--muted)]">
        <span>{points[0]?.date ?? ''}</span>
        <span>{points[points.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}

// ==========================================================================
// Tab: Audit log
// ==========================================================================

function AuditTab({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const [actorEmail, setActorEmail] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // The server takes actorId, not actorEmail — we resolve the email to an
  // id client-side via the admin /users list so the filter chip feels
  // natural to type into.
  const { data: allUsers = [] } = useQuery<{ id: string; email: string }[]>({
    queryKey: ['admin', 'users', 'lite'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users');
      return (data.data as { id: string; email: string }[]).map((u) => ({ id: u.id, email: u.email }));
    },
    staleTime: 60_000
  });

  const actorId = useMemo(() => {
    const q = actorEmail.trim().toLowerCase();
    if (!q) return undefined;
    const hit = allUsers.find((u) => u.email.toLowerCase() === q);
    return hit?.id;
  }, [actorEmail, allUsers]);

  // If the user typed an email but it doesn't match anyone, fall back to
  // passing the raw string so the server still returns an empty result set
  // rather than showing unfiltered rows.
  const effectiveActorId =
    actorEmail.trim().length > 0 && !actorId
      ? '__no_match__'
      : actorId;

  const params = {
    actorId: effectiveActorId,
    action: action.trim() || undefined,
    targetType: targetType.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit
  };

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ['admin', 'insights', 'audit', params],
    queryFn: async () => (await api.get('/admin/insights/audit', { params })).data.data
  });

  const downloadCsv = () => {
    const token = localStorage.getItem('uenr_token');
    const u = new URLSearchParams();
    if (effectiveActorId) u.set('actorId', effectiveActorId);
    if (action.trim()) u.set('action', action.trim());
    if (targetType.trim()) u.set('targetType', targetType.trim());
    if (from) u.set('from', from);
    if (to) u.set('to', to);

    // Stream the CSV through fetch so we can attach the auth header, then
    // trigger a browser download from the resulting blob.
    fetch(`${api.defaults.baseURL}/admin/insights/audit.csv?${u.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((r) => {
        if (!r.ok) throw new Error('Export failed');
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      })
      .catch(() => {
        // Silent swallow; the button stays clickable for retry.
      });
  };

  const clear = () => {
    setActorEmail(''); setAction(''); setTargetType(''); setFrom(''); setTo(''); setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            value={actorEmail}
            onChange={(e) => { setActorEmail(e.target.value); setPage(1); }}
            placeholder="actor email"
            className="input text-sm"
          />
          <input
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            placeholder="action (e.g. user.approved)"
            className="input text-sm"
          />
          <input
            value={targetType}
            onChange={(e) => { setTargetType(e.target.value); setPage(1); }}
            placeholder="target type"
            className="input text-sm"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="input text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="input text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-[var(--muted)]">
            {data ? `${data.total.toLocaleString()} total row${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </div>
          <div className="flex gap-2">
            <button onClick={clear} className="btn-ghost text-xs">Clear</button>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
            >
              <Download size={14} /> Download CSV
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
            )}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[var(--muted)]">No audit entries match.</td></tr>
            )}
            {(data?.items ?? []).map((row) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-[var(--border)]/50 last:border-b-0 align-top"
              >
                <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onOpenUser(row.actor.id)}
                    className="text-left font-semibold hover:text-[#065F46] dark:hover:text-[#84CC16]"
                  >
                    {row.actor.firstName} {row.actor.lastName}
                  </button>
                  <div className="text-xs text-[var(--muted)]">{row.actor.email}</div>
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-xs">{row.action}</code>
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.targetType ? (
                    <span>
                      <span className="font-semibold">{row.targetType}</span>
                      {row.targetId ? <span className="text-[var(--muted)]"> · {row.targetId}</span> : null}
                    </span>
                  ) : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className="px-4 py-3">
                  {row.metadata ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-[var(--muted)] hover:text-[var(--fg)]">view</summary>
                      <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-[var(--bg)] p-2 text-[10px]">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : <span className="text-[var(--muted)] text-xs">—</span>}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pageCount > 1 && (
        <div className="flex items-center justify-between text-xs">
          <div className="text-[var(--muted)]">Page {data.page} of {data.pageCount}</div>
          <div className="flex gap-2">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={data.page >= data.pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// Tab: Universal search
// ==========================================================================

const KIND_META: Record<SearchHit['kind'], { label: string; icon: typeof UserIcon; color: string }> = {
  user:          { label: 'Users',          icon: UserIcon,   color: 'text-[#065F46] dark:text-[#84CC16]' },
  opportunity:   { label: 'Opportunities',  icon: Briefcase,  color: 'text-blue-600' },
  application:   { label: 'Applications',   icon: FileText,   color: 'text-amber-600' },
  certification: { label: 'Certifications', icon: Award,      color: 'text-purple-600' },
  achievement:   { label: 'Achievements',   icon: Trophy,     color: 'text-rose-600' },
  transcript:    { label: 'Transcripts',    icon: ScrollText, color: 'text-teal-600' }
};

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string): string[] {
  const existing = loadRecent();
  const next = [q, ...existing.filter((e) => e !== q)].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

function SearchTab() {
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const debouncedQ = useDebounced(q, 250);

  const { data: hits = [], isFetching } = useQuery<SearchHit[]>({
    queryKey: ['admin', 'insights', 'search', debouncedQ],
    queryFn: async () => {
      const term = debouncedQ.trim();
      if (!term) return [];
      return (await api.get('/admin/insights/search', { params: { q: term } })).data.data as SearchHit[];
    }
  });

  // Persist recent terms only for substantial queries — avoids polluting
  // the dropdown with every keystroke.
  useEffect(() => {
    const term = debouncedQ.trim();
    if (term.length >= 2 && hits.length > 0) {
      setRecent(pushRecent(term));
    }
  }, [debouncedQ, hits.length]);

  const grouped = useMemo(() => {
    const by: Record<SearchHit['kind'], SearchHit[]> = {
      user: [], opportunity: [], application: [], certification: [], achievement: [], transcript: []
    };
    for (const h of hits) by[h.kind].push(h);
    return by;
  }, [hits]);

  const clearRecent = () => {
    try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch { /* ignore */ }
    setRecent([]);
  };

  const kinds = Object.keys(grouped) as SearchHit['kind'][];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[var(--border)] bg-[var(--card)] p-4 focus-within:border-[#065F46]">
        <label className="relative block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a user, opportunity, application id, certification, achievement, transcript…"
            autoFocus
            className="w-full bg-transparent pl-10 pr-3 py-2 text-base outline-none"
          />
        </label>
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          Users, opportunities, certifications, achievements match by name. Applications and transcripts require an exact id.
        </div>
      </div>

      {recent.length > 0 && !q.trim() && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              <History size={12} /> Recent searches
            </div>
            <button onClick={clearRecent} className="text-[11px] text-[var(--muted)] hover:text-[var(--fg)]">Clear</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <button
                key={r}
                onClick={() => setQ(r)}
                className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-semibold hover:border-[#065F46]/50"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {!q.trim() && recent.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 p-10 text-center text-sm text-[var(--muted)]">
          Start typing to search across the entire platform.
        </div>
      )}

      {q.trim() && !isFetching && hits.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 p-10 text-center text-sm text-[var(--muted)]">
          No matches for <span className="font-semibold">"{q}"</span>.
        </div>
      )}

      {hits.length > 0 && (
        <div className="space-y-4">
          {kinds.map((kind) => {
            const rows = grouped[kind];
            if (rows.length === 0) return null;
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <div key={kind} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
                  <Icon size={14} className={meta.color} />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">· {rows.length}</span>
                </div>
                <ul>
                  {rows.map((h) => (
                    <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)]/50 px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{h.label}</div>
                        <div className="truncate text-xs text-[var(--muted)]">{h.sublabel}</div>
                      </div>
                      <a
                        href={h.deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[#065F46]/50 hover:text-[#065F46] dark:hover:text-[#84CC16]"
                      >
                        Open <ArrowUpRight size={12} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// Timeline drawer (shared by Audit tab)
// ==========================================================================

function TimelineDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<TimelineResponse>({
    queryKey: ['admin', 'insights', 'timeline', userId],
    queryFn: async () => (await api.get(`/admin/insights/user/${userId}/timeline`)).data.data
  });

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              <Clock size={12} /> User timeline
            </div>
            {data?.user ? (
              <>
                <div className="mt-1 truncate font-heading text-lg font-extrabold">
                  {data.user.firstName} {data.user.lastName}
                </div>
                <div className="truncate text-xs text-[var(--muted)]">
                  {data.user.email} · {data.user.role.toLowerCase()}
                  {data.user.isSuperuser ? ' · superuser' : ''}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-[var(--muted)]">{isLoading ? 'Loading…' : 'User'}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] p-1.5 hover:border-[#065F46]/50"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading && <div className="text-sm text-[var(--muted)]">Loading timeline…</div>}
          {data && data.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
              No activity, logins, or audit entries recorded for this user.
            </div>
          )}
          <ol className="relative space-y-3 pl-5">
            <span className="absolute left-1.5 top-0 bottom-0 w-px bg-[var(--border)]" aria-hidden />
            {data?.items.map((item) => (
              <TimelineRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ol>
        </div>
      </motion.aside>
    </>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const meta = (() => {
    switch (item.kind) {
      case 'activity':
        return { Icon: Activity, tint: 'text-[#065F46] dark:text-[#84CC16]', label: `${item.tool} · ${item.action}` };
      case 'login':
        return {
          Icon: LogIn,
          tint: item.success ? 'text-blue-600' : 'text-rose-600',
          label: item.success ? 'Login success' : 'Login failed'
        };
      case 'audit':
        return { Icon: ShieldCheck, tint: 'text-amber-600', label: item.action };
    }
  })();

  const Icon = meta.Icon;

  return (
    <li className="relative">
      <span className="absolute -left-[18px] top-1.5 flex h-3 w-3 items-center justify-center">
        <span className="h-3 w-3 rounded-full bg-[var(--card)] border border-[var(--border)]" />
      </span>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="flex items-center gap-2">
          <Icon size={14} className={meta.tint} />
          <div className="text-sm font-semibold">{meta.label}</div>
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--muted)]">{formatDateTime(item.createdAt)}</div>
        {item.kind === 'login' && (item.ip || item.userAgent) && (
          <div className="mt-1 truncate text-[11px] text-[var(--muted)]">
            {item.ip ? `IP ${item.ip}` : ''}{item.ip && item.userAgent ? ' · ' : ''}{item.userAgent ?? ''}
          </div>
        )}
        {item.kind === 'audit' && (item.targetType || item.targetId) && (
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            {item.targetType}{item.targetId ? ` · ${item.targetId}` : ''}
          </div>
        )}
        {(item.kind === 'activity' || item.kind === 'audit') && item.metadata ? (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-[var(--muted)] hover:text-[var(--fg)]">metadata</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-[var(--card)] p-2 text-[10px]">
              {JSON.stringify(item.metadata, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}
