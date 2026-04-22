import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Pencil, Trash2, CheckCircle2,
  ArrowLeft, X, Save, Clock, GraduationCap,
  CheckSquare, Star, PlusCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { Pagination } from '../components/ui/Pagination';
import { buildCsv, downloadCsv } from '../utils/csv';

type AdminScholarship = {
  id: string;
  title: string;
  provider: string;
  level: string;
  deadline: string | null;
  isApproved: boolean;
  isFeatured: boolean;
  status: string;
  source: string;
  createdAt: string;
  submittedBy?: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
};

type StatusFilter = 'all' | 'approved' | 'pending' | 'expired';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' }
];

const LEVEL_LABELS: Record<string, string> = {
  UNDERGRAD: 'Undergrad',
  MASTERS: 'Masters',
  PHD: 'PhD',
  POSTDOC: 'Postdoc',
  OTHER: 'Other'
};

export default function AdminScholarshipsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<AdminScholarship | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data = [], isLoading } = useQuery<AdminScholarship[]>({
    queryKey: ['admin', 'scholarships', 'all', q, status],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (status !== 'all') params.status = status;
      return (await api.get('/admin/scholarships', { params })).data.data;
    }
  });

  const { selected, toggle, toggleAll, allSelected, someSelected, clear } = useBulkSelection(data);

  const handleSetQ = (v: string) => { setQ(v); setPage(1); clear(); };
  const handleSetStatus = (v: StatusFilter) => { setStatus(v); setPage(1); clear(); };

  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      total: data.length,
      approved: data.filter((s) => s.isApproved).length,
      pending: data.filter((s) => !s.isApproved).length,
      expired: data.filter((s) => s.deadline && new Date(s.deadline).getTime() < now).length
    };
  }, [data]);

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      (await api.patch(`/admin/scholarships/${id}`, patch)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'scholarships'] });
      qc.invalidateQueries({ queryKey: ['scholarships'] });
    }
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/scholarships/${id}`)).data,
    onSuccess: () => {
      toast.success('Scholarship deleted');
      qc.invalidateQueries({ queryKey: ['admin', 'scholarships'] });
      qc.invalidateQueries({ queryKey: ['scholarships'] });
    },
    onError: () => toast.error('Delete failed')
  });

  const confirmDelete = (s: AdminScholarship) => {
    if (confirm(`Delete "${s.title}" by ${s.provider}? This cannot be undone.`)) {
      deleteMut.mutate(s.id);
    }
  };

  const approve = (s: AdminScholarship) =>
    updateMut.mutate(
      { id: s.id, patch: { isApproved: true } },
      { onSuccess: () => toast.success('Approved') }
    );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'scholarships'] });
    qc.invalidateQueries({ queryKey: ['scholarships'] });
  };

  const exportCsv = () => {
    const headers = ['id', 'title', 'provider', 'level', 'deadline', 'isApproved', 'isFeatured', 'status', 'source', 'createdAt'];
    const rows = data.map((s) => ({
      id: s.id,
      title: s.title,
      provider: s.provider,
      level: s.level,
      deadline: s.deadline ?? '',
      isApproved: String(s.isApproved),
      isFeatured: String(s.isFeatured),
      status: s.status,
      source: s.source,
      createdAt: s.createdAt
    }));
    downloadCsv(`scholarships-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows));
  };

  const bulkAction = (action: string, label: string, confirmMsg?: string) => {
    if (selected.size === 0) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    const ids = [...selected];
    api.post(`/admin/scholarships/bulk/${action}`, { ids })
      .then((r) => {
        const n = r.data?.data?.updated ?? ids.length;
        toast.success(`${label}: ${n} updated`);
        clear();
        invalidateAll();
      })
      .catch(() => toast.error(`${label} failed`));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex items-center gap-2 mb-2">
        <Link to="/admin" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Admin
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold">Manage Scholarships</h1>
          <p className="text-sm text-[var(--muted)]">All scholarships across the platform — edit, approve, feature, or remove.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={data.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            onClick={() => navigate('/scholarships/new')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#065F46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#064E3B]"
          >
            <PlusCircle size={15} /> Post scholarship
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        <StatBlock label="Total" value={counts.total} />
        <StatBlock label="Approved" value={counts.approved} accent="#065F46" />
        <StatBlock label="Pending" value={counts.pending} accent="#F59E0B" />
        <StatBlock label="Expired" value={counts.expired} accent="#78716c" />
      </div>

      <div className="card mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input
            className="input pl-9"
            placeholder="Search title, provider…"
            value={q}
            onChange={(e) => handleSetQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleSetStatus(f.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                status === f.value
                  ? 'bg-[#065F46] text-white'
                  : 'bg-[var(--card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-[var(--surface,var(--card))]/95 backdrop-blur border border-[var(--border)] rounded-xl p-3 flex flex-wrap items-center gap-2 mb-4">
          <CheckSquare size={15} className="text-[#065F46] shrink-0" />
          <span className="text-sm font-semibold flex-1 min-w-[4rem]">{selected.size} selected</span>
          <button onClick={() => bulkAction('approve', 'Approve')} className="btn-xs bg-[#065F46] text-white">Approve</button>
          <button onClick={() => bulkAction('unapprove', 'Unapprove')} className="btn-xs border border-[var(--border)]">Unapprove</button>
          <button onClick={() => bulkAction('feature', 'Feature')} className="btn-xs border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 inline-flex items-center gap-1"><Star size={12} />Feature</button>
          <button onClick={() => bulkAction('unfeature', 'Unfeature')} className="btn-xs border border-[var(--border)]">Unfeature</button>
          <button
            onClick={() => bulkAction('delete', 'Delete', `Delete ${selected.size} scholarship${selected.size === 1 ? '' : 's'}? This cannot be undone.`)}
            className="btn-xs border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950 inline-flex items-center gap-1"
          >
            <Trash2 size={12} /> Delete…
          </button>
          <button onClick={clear} className="btn-xs border border-[var(--border)]">Clear</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-20 skeleton" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center">
          <div className="text-4xl">🎓</div>
          <div className="font-heading font-bold">No scholarships match</div>
          <p className="text-sm text-[var(--muted)]">Try clearing filters or a different search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select-all checkbox */}
          <div className="flex items-center gap-2 px-1 pb-1">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              className="h-4 w-4 cursor-pointer accent-[#065F46]"
            />
            <span className="text-xs text-[var(--muted)]">Select all visible ({pageData.length})</span>
          </div>
          {pageData.map((s, i) => (
            <ScholarshipRow
              key={s.id}
              item={s}
              index={i}
              selected={selected.has(s.id)}
              onSelect={() => toggle(s.id)}
              onEdit={() => setEditing(s)}
              onApprove={() => approve(s)}
              onDelete={() => confirmDelete(s)}
            />
          ))}
          <Pagination total={data.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <ScholarshipEditModal
            key={editing.id}
            item={editing}
            onClose={() => setEditing(null)}
            onSave={async (patch) => {
              await updateMut.mutateAsync({ id: editing.id, patch });
              toast.success('Saved');
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============ ROW ============
function ScholarshipRow({
  item, index, selected, onSelect, onEdit, onApprove, onDelete
}: {
  item: AdminScholarship;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onDelete: () => void;
}) {
  const now = Date.now();
  const deadlineMs = item.deadline ? new Date(item.deadline).getTime() : null;
  const expired = deadlineMs !== null && deadlineMs < now;
  const daysLeft = deadlineMs ? Math.ceil((deadlineMs - now) / 86400000) : null;

  const statusBadges: { label: string; bg: string; fg: string }[] = [];
  if (!item.isApproved) statusBadges.push({ label: 'Pending', bg: '#fef3c7', fg: '#78350f' });
  if (expired) statusBadges.push({ label: 'Expired', bg: '#ffe4e6', fg: '#881337' });
  if (item.isApproved && !expired) statusBadges.push({ label: 'Approved', bg: '#d1fae5', fg: '#064e3b' });
  if (item.isFeatured) statusBadges.push({ label: 'Featured', bg: '#fef9c3', fg: '#713f12' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className="card flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0 flex-1 flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#065F46]"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold truncate">{item.title}</h3>
            {statusBadges.map((b) => (
              <span
                key={b.label}
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: b.bg, color: b.fg }}
              >
                {b.label}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><GraduationCap size={12} /> {item.provider}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--fg)]">
              {LEVEL_LABELS[item.level] ?? item.level}
            </span>
            {deadlineMs !== null && (
              <span className={`inline-flex items-center gap-1 ${expired ? 'text-rose-500' : (daysLeft ?? 999) <= 7 ? 'text-amber-600' : ''}`}>
                <Clock size={12} />
                {expired ? `Closed ${Math.abs(daysLeft ?? 0)}d ago` : `${daysLeft}d left`}
              </span>
            )}
          </div>
          {item.submittedBy && (
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              Submitted by {item.submittedBy.firstName} {item.submittedBy.lastName} ({item.submittedBy.role.toLowerCase()})
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {!item.isApproved && (
          <button
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
          >
            <CheckCircle2 size={14} /> Approve
          </button>
        )}
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-lg bg-[#84CC16] px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#65a30d]"
        >
          <Pencil size={14} /> Edit
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ============ EDIT MODAL ============
function ScholarshipEditModal({
  item, onClose, onSave
}: {
  item: AdminScholarship;
  onClose: () => void;
  onSave: (patch: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: item.title,
    provider: item.provider,
    level: item.level,
    deadline: item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : '',
    isApproved: item.isApproved,
    isFeatured: item.isFeatured
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: form.title,
        provider: form.provider,
        level: form.level,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        isApproved: form.isApproved,
        isFeatured: form.isFeatured
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onSubmit={submit}
        className="w-full max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl my-8"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Edit scholarship</div>
            <h2 className="mt-1 font-heading text-2xl font-bold">{item.title}</h2>
            <div className="text-xs text-[var(--muted)]">{item.provider} · id: {item.id}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <Field label="Title" className="md:col-span-2">
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required minLength={3} />
          </Field>
          <Field label="Provider">
            <input className="input" value={form.provider} onChange={(e) => set('provider', e.target.value)} required />
          </Field>
          <Field label="Level">
            <select className="input" value={form.level} onChange={(e) => set('level', e.target.value)}>
              <option value="UNDERGRAD">Undergrad</option>
              <option value="MASTERS">Masters</option>
              <option value="PHD">PhD</option>
              <option value="POSTDOC">Postdoc</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Deadline">
            <input className="input" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </Field>

          <div className="md:col-span-2 flex flex-wrap items-center gap-6 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={form.isApproved} onChange={(e) => set('isApproved', e.target.checked)} className="h-4 w-4 accent-[#065F46]" />
              Approved
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} className="h-4 w-4 accent-[#065F46]" />
              Featured
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-4 rounded-b-3xl">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StatBlock({ label, value, accent = '#1C1917' }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 font-heading text-3xl font-black" style={{ color: accent }}>{value}</div>
    </div>
  );
}
