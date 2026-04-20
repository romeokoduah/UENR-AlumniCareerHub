// Phase 8 — System health + GDPR purge.

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Activity, Database, Cloud, GitCommit, AlertCircle, LogOut, ShieldOff, Search } from 'lucide-react';
import { api } from '../../services/api';

type Status = {
  env: string;
  vercelEnv: string | null;
  vercel: { commit: string | null; branch: string | null; author: string | null; message: string | null };
  blob: { configured: boolean };
  prisma: { rowCounts: Record<string, number> };
};

type ErrorRow = {
  id: string;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  status: number | null;
  userId: string | null;
  user: { email: string; firstName: string; lastName: string } | null;
  createdAt: string;
};

type LoginEvent = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
};

export default function AdminSystemPage() {
  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <Activity size={24} className="text-[#065F46] dark:text-[#84CC16]" />
        <div>
          <h1 className="font-heading text-2xl font-extrabold">System health</h1>
          <p className="text-sm text-[var(--muted)]">Deploy + database status, recent server errors, compliance actions.</p>
        </div>
      </header>

      <StatusPanel />
      <ErrorsPanel />
      <LoginHistoryPanel />
      <ComplianceActionsPanel />
    </div>
  );
}

function StatusPanel() {
  const { data: status } = useQuery<Status>({
    queryKey: ['admin', 'system', 'status'],
    queryFn: async () => (await api.get('/admin/system/status')).data.data,
    refetchInterval: 30_000
  });

  if (!status) return <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">Loading status…</div>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          <GitCommit size={14} /> Deploy
        </div>
        <div className="mt-3 font-mono text-sm">{status.vercel.commit ? status.vercel.commit.slice(0, 7) : '—'}</div>
        <div className="text-xs text-[var(--muted)]">{status.vercel.branch ?? 'no branch'}</div>
        {status.vercel.message && <div className="mt-2 text-xs text-[var(--fg)]/80 line-clamp-2">{status.vercel.message}</div>}
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          <Cloud size={14} /> Storage
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.blob.configured ? 'bg-[#065F46]' : 'bg-rose-500'}`} />
          <span className="text-sm font-semibold">{status.blob.configured ? 'Vercel Blob configured' : 'BLOB_READ_WRITE_TOKEN missing'}</span>
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          <Database size={14} /> Row counts
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {Object.entries(status.prisma.rowCounts).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-[var(--muted)]">{k}</span>
              <span className="font-mono font-semibold">{v.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          <Activity size={14} /> Environment
        </div>
        <div className="mt-3 text-sm">
          <div>NODE_ENV: <span className="font-mono">{status.env}</span></div>
          <div>VERCEL_ENV: <span className="font-mono">{status.vercelEnv ?? '—'}</span></div>
        </div>
      </article>
    </div>
  );
}

function ErrorsPanel() {
  const { data: errors = [] } = useQuery<ErrorRow[]>({
    queryKey: ['admin', 'system', 'errors'],
    queryFn: async () => (await api.get('/admin/system/errors')).data.data,
    refetchInterval: 60_000
  });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
        <AlertCircle size={14} /> Recent server errors (last 50)
      </h2>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {errors.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">No 5xx errors logged.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">User</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <>
                  <tr
                    key={e.id}
                    onClick={() => setOpenId(openId === e.id ? null : e.id)}
                    className="cursor-pointer border-b border-[var(--border)]/50 last:border-b-0 hover:bg-[var(--bg)]"
                  >
                    <td className="px-3 py-2 text-xs">{new Date(e.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2 text-xs font-mono">{e.status ?? '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono">{e.method ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-xs font-mono">{e.path ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[300px] truncate text-xs">{e.message}</td>
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">{e.user?.email ?? '—'}</td>
                  </tr>
                  {openId === e.id && e.stack && (
                    <tr key={`${e.id}-stack`} className="bg-[var(--bg)]">
                      <td colSpan={6} className="px-3 py-3">
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/5 dark:bg-white/5 p-3 text-[10px] font-mono">{e.stack}</pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function LoginHistoryPanel() {
  const [userId, setUserId] = useState('');
  const [loaded, setLoaded] = useState<{ userId: string; events: LoginEvent[]; user: any } | null>(null);

  const lookupMut = useMutation({
    mutationFn: async (id: string) => (await api.get(`/admin/system/users/${id}/login-history`)).data.data,
    onSuccess: (d) => setLoaded({ userId, events: d.events, user: d.user }),
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Lookup failed')
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
        <Search size={14} /> Login history lookup
      </h2>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Paste user id" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <button onClick={() => userId.trim() && lookupMut.mutate(userId.trim())} disabled={!userId.trim() || lookupMut.isPending} className="btn-primary text-sm">
            Look up
          </button>
        </div>
        {loaded && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-[var(--muted)]">
              {loaded.user ? `${loaded.user.firstName} ${loaded.user.lastName} · ${loaded.user.email}` : 'User not found'}
            </div>
            {loaded.events.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">No login events recorded.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-b border-[var(--border)] text-left uppercase tracking-wider text-[var(--muted)]">
                  <tr><th className="py-2">When</th><th className="py-2">Outcome</th><th className="py-2">IP</th><th className="py-2">User-agent</th></tr>
                </thead>
                <tbody>
                  {loaded.events.map((e) => (
                    <tr key={e.id} className="border-b border-[var(--border)]/40 last:border-b-0">
                      <td className="py-2">{new Date(e.createdAt).toLocaleString('en-GB')}</td>
                      <td className="py-2">{e.success ? <span className="text-[#065F46] dark:text-[#84CC16]">success</span> : <span className="text-rose-600">failure</span>}</td>
                      <td className="py-2 font-mono">{e.ip ?? '—'}</td>
                      <td className="py-2 max-w-[300px] truncate">{e.userAgent ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ComplianceActionsPanel() {
  const [forceId, setForceId] = useState('');
  const [purgeId, setPurgeId] = useState('');
  const [purgeReason, setPurgeReason] = useState('');

  const forceMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/system/users/${id}/force-logout-everywhere`)).data.data,
    onSuccess: () => { toast.success('Force-logout applied — all this user\'s tokens are now invalid.'); setForceId(''); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const purgeMut = useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await api.post(`/admin/system/users/${vars.id}/purge`, { confirmation: 'PURGE', reason: vars.reason || undefined })).data.data,
    onSuccess: () => { toast.success('User purged — PII anonymised, tokens invalidated.'); setPurgeId(''); setPurgeReason(''); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Purge failed')
  });

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><LogOut size={14} /> Force logout everywhere</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">Invalidates every existing JWT for the target user (they'll have to sign in again).</p>
        <input className="input mt-3" placeholder="Paste user id" value={forceId} onChange={(e) => setForceId(e.target.value)} />
        <button
          onClick={() => {
            if (!forceId.trim()) return;
            if (window.prompt('Type FORCE to confirm.') !== 'FORCE') return toast.error('Cancelled.');
            forceMut.mutate(forceId.trim());
          }}
          disabled={!forceId.trim() || forceMut.isPending}
          className="btn-primary mt-3 text-sm w-full justify-center"
        >
          Force logout everywhere
        </button>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-rose-700 dark:text-rose-300"><ShieldOff size={14} /> Right-to-be-forgotten purge</h3>
        <p className="mt-1 text-xs text-rose-900 dark:text-rose-200/80">Anonymises all PII on the user, sets deletedAt, invalidates tokens. Foreign-key references stay intact.</p>
        <input className="input mt-3" placeholder="Paste user id" value={purgeId} onChange={(e) => setPurgeId(e.target.value)} />
        <input className="input mt-2" placeholder="Reason (optional, audit-logged)" value={purgeReason} onChange={(e) => setPurgeReason(e.target.value)} />
        <button
          onClick={() => {
            if (!purgeId.trim()) return;
            if (window.prompt('Type PURGE to confirm permanent anonymisation.') !== 'PURGE') return toast.error('Cancelled.');
            purgeMut.mutate({ id: purgeId.trim(), reason: purgeReason.trim() });
          }}
          disabled={!purgeId.trim() || purgeMut.isPending}
          className="mt-3 w-full inline-flex items-center justify-center gap-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Purge user
        </button>
      </div>
    </section>
  );
}
