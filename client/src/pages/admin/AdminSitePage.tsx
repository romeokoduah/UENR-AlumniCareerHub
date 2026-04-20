// Phase 7 — Site config + broadcast.
// v1 ships feature flags + broadcast tabs. Nav editor + email templates
// are wired on the server but not yet exposed here (next polish pass).

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Flag, Megaphone, Plus, Trash2, Send, Eye } from 'lucide-react';
import { api } from '../../services/api';

type FlagValue = boolean | string | number;
type Flags = Record<string, FlagValue>;

type Role = 'STUDENT' | 'ALUMNI' | 'EMPLOYER' | 'ADMIN';

type Audience = {
  roles?: Role[];
  programmes?: string[];
  gradYearMin?: number;
  gradYearMax?: number;
};

type PreviewResponse = {
  count: number;
  sample: { id: string; firstName: string; lastName: string; email: string; programme: string | null; graduationYear: number | null; role: Role }[];
  capExceeded: boolean;
  cap: number;
};

type Tab = 'flags' | 'broadcast';

export default function AdminSitePage() {
  const [tab, setTab] = useState<Tab>('flags');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-extrabold">Site config</h1>
        <p className="text-sm text-[var(--muted)]">Feature flags and one-shot announcements.</p>
      </header>

      <div className="mb-6 flex border-b border-[var(--border)]">
        {([['flags', 'Feature flags', Flag], ['broadcast', 'Broadcast', Megaphone]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold ${
              tab === k
                ? 'border-[#065F46] text-[#065F46] dark:border-[#84CC16] dark:text-[#84CC16]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'flags' && <FeatureFlagsTab />}
      {tab === 'broadcast' && <BroadcastTab />}
    </div>
  );
}

// ===== Feature flags =====

function FeatureFlagsTab() {
  const qc = useQueryClient();
  const { data: flags = {} } = useQuery<Flags>({
    queryKey: ['admin', 'site', 'flags'],
    queryFn: async () => (await api.get('/admin/site/feature-flags')).data.data ?? {}
  });

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState<string>('false');
  const [newType, setNewType] = useState<'boolean' | 'string' | 'number'>('boolean');

  const saveMut = useMutation({
    mutationFn: async (next: Flags) =>
      (await api.put('/admin/site/feature-flags', { flags: next })).data.data,
    onSuccess: () => { toast.success('Flags saved'); qc.invalidateQueries({ queryKey: ['admin', 'site', 'flags'] }); qc.invalidateQueries({ queryKey: ['site', 'feature-flags'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  function setFlag(key: string, value: FlagValue) {
    saveMut.mutate({ ...flags, [key]: value });
  }

  function deleteFlag(key: string) {
    if (window.prompt(`Type DELETE to remove flag "${key}".`) !== 'DELETE') return;
    const { [key]: _, ...rest } = flags;
    saveMut.mutate(rest);
  }

  function addFlag() {
    if (!newKey.trim()) return toast.error('Flag name required');
    let parsed: FlagValue;
    if (newType === 'boolean') parsed = newValue === 'true';
    else if (newType === 'number') {
      const n = Number(newValue);
      if (!Number.isFinite(n)) return toast.error('Not a valid number');
      parsed = n;
    } else parsed = newValue;
    saveMut.mutate({ ...flags, [newKey.trim()]: parsed });
    setNewKey(''); setNewValue('false'); setNewType('boolean');
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Add flag</h3>
        <div className="flex flex-wrap items-end gap-2">
          <input className="input" placeholder="flag-name" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <select className="input" value={newType} onChange={(e) => { setNewType(e.target.value as any); setNewValue(e.target.value === 'boolean' ? 'false' : ''); }}>
            <option value="boolean">boolean</option>
            <option value="string">string</option>
            <option value="number">number</option>
          </select>
          {newType === 'boolean' ? (
            <select className="input" value={newValue} onChange={(e) => setNewValue(e.target.value)}>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : (
            <input className="input" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          )}
          <button onClick={addFlag} disabled={saveMut.isPending} className="btn-primary text-sm"><Plus size={14} /> Add</button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(flags).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-[var(--muted)]">No feature flags yet.</td>
              </tr>
            )}
            {Object.entries(flags).map(([key, value]) => (
              <tr key={key} className="border-b border-[var(--border)]/50 last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs">{key}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{typeof value}</td>
                <td className="px-4 py-3">
                  {typeof value === 'boolean' ? (
                    <button
                      onClick={() => setFlag(key, !value)}
                      className={`inline-flex h-6 w-12 items-center rounded-full transition ${value ? 'bg-[#065F46]' : 'bg-[var(--border)]'}`}
                    >
                      <span className={`block h-5 w-5 rounded-full bg-white transition ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  ) : (
                    <input
                      defaultValue={String(value)}
                      onBlur={(e) => {
                        const v = e.target.value;
                        const next = typeof value === 'number' ? Number(v) : v;
                        if (next !== value) setFlag(key, next as FlagValue);
                      }}
                      className="input py-1 text-xs"
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteFlag(key)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950">
                    <Trash2 size={11} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Flags are public-read. Read in the client via <code className="rounded bg-[var(--bg)] px-1">useFeatureFlag(name, fallback)</code>.
      </p>
    </div>
  );
}

// ===== Broadcast =====

function BroadcastTab() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [programmesText, setProgrammesText] = useState('');
  const [gradMin, setGradMin] = useState<string>('');
  const [gradMax, setGradMax] = useState<string>('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const audience: Audience = useMemo(() => {
    const a: Audience = {};
    if (roles.length > 0) a.roles = roles;
    const programmes = programmesText.split(',').map((p) => p.trim()).filter(Boolean);
    if (programmes.length > 0) a.programmes = programmes;
    if (gradMin.trim()) a.gradYearMin = Number(gradMin);
    if (gradMax.trim()) a.gradYearMax = Number(gradMax);
    return a;
  }, [roles, programmesText, gradMin, gradMax]);

  const previewMut = useMutation({
    mutationFn: async () => (await api.post('/admin/site/broadcast/preview', { audience })).data.data as PreviewResponse,
    onSuccess: (d) => setPreview(d)
  });

  const sendMut = useMutation({
    mutationFn: async () => (await api.post('/admin/site/broadcast', { title, message, link: link || undefined, audience })).data.data,
    onSuccess: (d: any) => {
      toast.success(`Broadcast sent to ${d.recipientCount} alumni`);
      setTitle(''); setMessage(''); setLink('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Broadcast failed')
  });

  function send() {
    if (!preview) return toast.error('Preview the audience first.');
    if (preview.count === 0) return toast.error('No recipients in this audience.');
    if (preview.capExceeded) return toast.error('Audience too large — narrow filters.');
    if (window.prompt(`Type SEND to broadcast to ${preview.count} alumni.`) !== 'SEND') {
      return toast.error('Cancelled.');
    }
    sendMut.mutate();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div>
          <label className="text-xs font-semibold">Title</label>
          <input className="input mt-1" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New scholarships announcement" />
        </div>
        <div>
          <label className="text-xs font-semibold">Message</label>
          <textarea className="input mt-1" rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you want everyone to know?" />
        </div>
        <div>
          <label className="text-xs font-semibold">Link (optional)</label>
          <input className="input mt-1" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
        </div>

        <fieldset className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Audience</legend>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-semibold">Roles (empty = everyone)</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(['STUDENT', 'ALUMNI', 'EMPLOYER', 'ADMIN'] as Role[]).map((r) => {
                  const active = roles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoles((prev) => active ? prev.filter((x) => x !== r) : [...prev, r])}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] hover:border-[#065F46]/50'}`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Programmes (comma separated, empty = all)</label>
              <input className="input mt-1" value={programmesText} onChange={(e) => setProgrammesText(e.target.value)} placeholder="Computer Science, Renewable Energy Engineering" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold">Grad year min</label>
                <input type="number" className="input mt-1" value={gradMin} onChange={(e) => setGradMin(e.target.value)} placeholder="2015" />
              </div>
              <div>
                <label className="text-xs font-semibold">Grad year max</label>
                <input type="number" className="input mt-1" value={gradMax} onChange={(e) => setGradMax(e.target.value)} placeholder="2026" />
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex justify-between gap-2">
          <button onClick={() => previewMut.mutate()} disabled={previewMut.isPending} className="btn-ghost"><Eye size={14} /> Preview audience</button>
          <button
            onClick={send}
            disabled={sendMut.isPending || !title.trim() || !message.trim() || !preview || preview.count === 0 || preview.capExceeded}
            className="btn-primary"
          >
            <Send size={14} /> {sendMut.isPending ? 'Sending…' : 'Send broadcast'}
          </button>
        </div>
      </section>

      <aside className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Preview</h3>
        {preview ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`text-3xl font-black ${preview.capExceeded ? 'text-rose-600' : 'text-[#065F46] dark:text-[#84CC16]'}`}>{preview.count}</div>
            <div className="text-xs text-[var(--muted)]">recipient{preview.count === 1 ? '' : 's'}</div>
            {preview.capExceeded && (
              <div className="mt-3 rounded border-l-4 border-l-rose-400 bg-rose-50 dark:bg-rose-950/20 p-2 text-xs text-rose-900 dark:text-rose-200">
                Exceeds cap of {preview.cap}. Narrow your filters.
              </div>
            )}
            {preview.sample.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs font-semibold text-[var(--muted)]">Sample (first 10):</div>
                {preview.sample.map((u) => (
                  <div key={u.id} className="rounded bg-[var(--bg)] px-2 py-1 text-xs">
                    {u.firstName} {u.lastName} <span className="text-[var(--muted)]">· {u.role}{u.programme ? ` · ${u.programme}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="text-sm text-[var(--muted)]">Click "Preview audience" to see who will receive this.</div>
        )}
      </aside>
    </div>
  );
}
