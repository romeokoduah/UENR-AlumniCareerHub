import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Pencil, Trash2, Eye, EyeOff, CheckCircle2,
  ArrowLeft, X, Save, Clock, MapPin, Building2, ExternalLink,
  CheckSquare, Star, PlusCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Opportunity } from '../types';
import { useBulkSelection } from '../hooks/useBulkSelection';

type AdminOpportunity = Opportunity & {
  isActive: boolean;
  isApproved: boolean;
  postedBy?: { id: string; firstName: string; lastName: string; email: string; role: string };
  _count?: { applications: number; bookmarks: number };
};

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired' | 'pending';

const STATUS_FILTERS: { value: StatusFilter; label: string; }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'expired', label: 'Expired' },
  { value: 'inactive', label: 'Inactive' }
];

export default function AdminOpportunitiesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<AdminOpportunity | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data = [], isLoading } = useQuery<AdminOpportunity[]>({
    queryKey: ['admin', 'opportunities', q, status],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (status !== 'all') params.status = status;
      return (await api.get('/admin/opportunities', { params })).data.data;
    }
  });

  const { selected, toggle, toggleAll, allSelected, someSelected, clear } = useBulkSelection(data);

  // Reset page when filter changes
  const handleSetQ = (v: string) => { setQ(v); setPage(1); clear(); };
  const handleSetStatus = (v: StatusFilter) => { setStatus(v); setPage(1); clear(); };

  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      total: data.length,
      active: data.filter((o) => o.isActive && o.isApproved && new Date(o.deadline).getTime() >= now).length,
      pending: data.filter((o) => !o.isApproved).length,
      expired: data.filter((o) => new Date(o.deadline).getTime() < now).length,
      applications: data.reduce((sum, o) => sum + (o._count?.applications ?? 0), 0)
    };
  }, [data]);

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      (await api.patch(`/admin/opportunities/${id}`, patch)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'opportunities'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    }
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/opportunities/${id}`)).data,
    onSuccess: () => {
      toast.success('Opportunity deleted');
      qc.invalidateQueries({ queryKey: ['admin', 'opportunities'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
    onError: () => toast.error('Delete failed')
  });

  const toggleActive = (o: AdminOpportunity) =>
    updateMut.mutate(
      { id: o.id, patch: { isActive: !o.isActive } },
      { onSuccess: () => toast.success(o.isActive ? 'Hidden from board' : 'Back on the board') }
    );

  const approve = (o: AdminOpportunity) =>
    updateMut.mutate(
      { id: o.id, patch: { isApproved: true } },
      { onSuccess: () => toast.success('Approved') }
    );

  const confirmDelete = (o: AdminOpportunity) => {
    if (confirm(`Delete "${o.title}" from ${o.company}? This also removes ${o._count?.applications ?? 0} applications. This cannot be undone.`)) {
      deleteMut.mutate(o.id);
    }
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'opportunities'] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
  };

  const bulkAction = (action: string, label: string, confirmMsg?: string) => {
    if (selected.size === 0) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    const ids = [...selected];
    api.post(`/admin/opportunities/bulk/${action}`, { ids })
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
          <h1 className="font-heading text-3xl font-extrabold">Opportunities editor</h1>
          <p className="text-sm text-[var(--muted)]">Every job, internship, and service placement across the platform — edit, approve, or remove.</p>
        </div>
        <button
          onClick={() => navigate('/opportunities/new')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#065F46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#064E3B]"
        >
          <PlusCircle size={15} /> Post opportunity
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 mb-6">
        <StatBlock label="Total" value={counts.total} />
        <StatBlock label="Active" value={counts.active} accent="#065F46" />
        <StatBlock label="Pending" value={counts.pending} accent="#F59E0B" />
        <StatBlock label="Expired" value={counts.expired} accent="#78716c" />
        <StatBlock label="Applications" value={counts.applications} accent="#84CC16" />
      </div>

      <div className="card mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input
            className="input pl-9"
            placeholder="Search title, company, location…"
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
          <button onClick={() => bulkAction('activate', 'Activate')} className="btn-xs border border-[var(--border)]">Activate</button>
          <button onClick={() => bulkAction('deactivate', 'Deactivate')} className="btn-xs border border-[var(--border)]">Deactivate</button>
          <button onClick={() => bulkAction('feature', 'Feature')} className="btn-xs border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 inline-flex items-center gap-1"><Star size={12} />Feature</button>
          <button onClick={() => bulkAction('unfeature', 'Unfeature')} className="btn-xs border border-[var(--border)]">Unfeature</button>
          <button
            onClick={() => bulkAction('delete', 'Delete', `Delete ${selected.size} opportunit${selected.size === 1 ? 'y' : 'ies'}? This removes all related applications. This cannot be undone.`)}
            className="btn-xs border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
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
          <div className="text-4xl">📭</div>
          <div className="font-heading font-bold">No opportunities match</div>
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
          {pageData.map((o, i) => (
            <OpportunityRow
              key={o.id}
              item={o}
              index={i}
              selected={selected.has(o.id)}
              onSelect={() => toggle(o.id)}
              onEdit={() => setEditing(o)}
              onToggle={() => toggleActive(o)}
              onApprove={() => approve(o)}
              onDelete={() => confirmDelete(o)}
            />
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost text-sm disabled:opacity-40">« Prev</button>
              <span className="text-sm text-[var(--muted)]">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost text-sm disabled:opacity-40">Next »</button>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <EditModal
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
function OpportunityRow({
  item, index, selected, onSelect, onEdit, onToggle, onApprove, onDelete
}: {
  item: AdminOpportunity;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onApprove: () => void;
  onDelete: () => void;
}) {
  const now = Date.now();
  const deadlineMs = new Date(item.deadline).getTime();
  const expired = deadlineMs < now;
  const daysLeft = Math.ceil((deadlineMs - now) / 86400000);

  const statusBadges: { label: string; bg: string; fg: string }[] = [];
  if (!item.isApproved) statusBadges.push({ label: 'Pending', bg: '#fef3c7', fg: '#78350f' });
  if (!item.isActive) statusBadges.push({ label: 'Hidden', bg: '#e7e5e4', fg: '#44403c' });
  if (expired) statusBadges.push({ label: 'Expired', bg: '#ffe4e6', fg: '#881337' });
  if (item.isActive && item.isApproved && !expired) statusBadges.push({ label: 'Live', bg: '#d1fae5', fg: '#064e3b' });

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
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1"><Building2 size={12} /> {item.company}</span>
          <span className="inline-flex items-center gap-1"><MapPin size={12} /> {item.location} · {item.locationType.toLowerCase()}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--fg)]">
            {item.type.replace('_', ' ').toLowerCase()}
          </span>
          <span className={`inline-flex items-center gap-1 ${expired ? 'text-rose-500' : daysLeft <= 7 ? 'text-amber-600' : ''}`}>
            <Clock size={12} />
            {expired ? `Closed ${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
          </span>
          {item._count && (
            <span>{item._count.applications} applications · {item._count.bookmarks} bookmarks</span>
          )}
        </div>
        {item.postedBy && (
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            Posted by {item.postedBy.firstName} {item.postedBy.lastName} ({item.postedBy.role.toLowerCase()})
          </div>
        )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {!item.isApproved && (
          <button
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
            title="Approve"
          >
            <CheckCircle2 size={14} /> Approve
          </button>
        )}
        <button
          onClick={onToggle}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
          title={item.isActive ? 'Hide from board' : 'Show on board'}
        >
          {item.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
          {item.isActive ? 'Hide' : 'Show'}
        </button>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-lg bg-[#84CC16] px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#65a30d]"
        >
          <Pencil size={14} /> Edit
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ============ EDIT MODAL ============
function EditModal({
  item, onClose, onSave
}: {
  item: AdminOpportunity;
  onClose: () => void;
  onSave: (patch: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: item.title,
    description: item.description,
    company: item.company,
    location: item.location,
    locationType: item.locationType,
    type: item.type,
    salaryMin: item.salaryMin?.toString() ?? '',
    salaryMax: item.salaryMax?.toString() ?? '',
    deadline: new Date(item.deadline).toISOString().slice(0, 10),
    requiredSkillsInput: (item.requiredSkills ?? []).join(', '),
    industry: item.industry ?? '',
    experienceLevel: (item as any).experienceLevel ?? '',
    applicationUrl: item.applicationUrl ?? '',
    isActive: item.isActive,
    isApproved: item.isApproved
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: form.title,
        description: form.description,
        company: form.company,
        location: form.location,
        locationType: form.locationType,
        type: form.type,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        deadline: new Date(form.deadline).toISOString(),
        requiredSkills: form.requiredSkillsInput.split(',').map((s) => s.trim()).filter(Boolean),
        industry: form.industry || null,
        experienceLevel: form.experienceLevel || null,
        applicationUrl: form.applicationUrl || null,
        isActive: form.isActive,
        isApproved: form.isApproved
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
        className="w-full max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl my-8"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Edit opportunity</div>
            <h2 className="mt-1 font-heading text-2xl font-bold">{item.title}</h2>
            <div className="text-xs text-[var(--muted)]">{item.company} · id: {item.id}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <Field label="Title" className="md:col-span-2">
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required minLength={3} />
          </Field>
          <Field label="Company">
            <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} required />
          </Field>
          <Field label="Industry">
            <input className="input" value={form.industry} onChange={(e) => set('industry', e.target.value)} />
          </Field>
          <Field label="Location">
            <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} required />
          </Field>
          <Field label="Location type">
            <select className="input" value={form.locationType} onChange={(e) => set('locationType', e.target.value)}>
              <option value="ONSITE">Onsite</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </Field>
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="NATIONAL_SERVICE">National Service</option>
              <option value="VOLUNTEER">Volunteer</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </Field>
          <Field label="Experience level">
            <input className="input" value={form.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)} placeholder="Entry, Mid, Senior…" />
          </Field>
          <Field label="Salary min (GHS)">
            <input className="input" type="number" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} />
          </Field>
          <Field label="Salary max (GHS)">
            <input className="input" type="number" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} />
          </Field>
          <Field label="Deadline">
            <input className="input" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} required />
          </Field>
          <Field label="External application URL">
            <input className="input" type="url" value={form.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} />
          </Field>
          <Field label="Required skills (comma-separated)" className="md:col-span-2">
            <input className="input" value={form.requiredSkillsInput} onChange={(e) => set('requiredSkillsInput', e.target.value)} />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea
              className="input min-h-[180px]"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              required
              minLength={20}
            />
          </Field>

          <div className="md:col-span-2 flex flex-wrap items-center gap-6 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={form.isApproved} onChange={(e) => set('isApproved', e.target.checked)} className="h-4 w-4 accent-[#065F46]" />
              Approved
              <span className="text-xs text-[var(--muted)] font-normal">(shown on public board)</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4 accent-[#065F46]" />
              Active
              <span className="text-xs text-[var(--muted)] font-normal">(toggle off to hide without deleting)</span>
            </label>
          </div>

          {item.applicationUrl && (
            <a
              href={item.applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="md:col-span-2 inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
            >
              <ExternalLink size={12} /> View current application URL
            </a>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-4 rounded-b-3xl">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
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
