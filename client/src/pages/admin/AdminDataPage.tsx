// Phase 5 — Tool Data CRUD console (minimal v1).
//
// Two surfaces: a seed runner panel (re-run any of the 8 admin seed
// functions and see current row counts) and a per-resource browse +
// delete table for the curated datasets.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Database, Play, Loader2, Trash2 } from 'lucide-react';
import { api } from '../../services/api';

type SeedDataset = { key: string; label: string; currentCount: number; lastRunAt: string | null };

type SeedStatus = { datasets: SeedDataset[] };

const RESOURCES: { key: string; label: string }[] = [
  { key: 'skills', label: 'Skills' },
  { key: 'role-profiles', label: 'Role profiles' },
  { key: 'learning-resources', label: 'Learning resources' },
  { key: 'learning-paths', label: 'Learning paths' },
  { key: 'career-path-nodes', label: 'Career path nodes' },
  { key: 'interview-questions', label: 'Interview questions' },
  { key: 'aptitude-questions', label: 'Aptitude questions' },
  { key: 'salary-benchmarks', label: 'Salary benchmarks' },
  { key: 'cost-of-living', label: 'Cost of living' },
  { key: 'startup-decks', label: 'Startup decks' },
  { key: 'incubators', label: 'Incubators' },
  { key: 'grants', label: 'Grants' },
  { key: 'biz-reg-steps', label: 'Business registration steps' }
];

function formatDate(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminDataPage() {
  const qc = useQueryClient();
  const [activeResource, setActiveResource] = useState<string>('skills');

  const { data: status } = useQuery<SeedStatus>({
    queryKey: ['admin', 'data', 'seed-status'],
    queryFn: async () => (await api.get('/admin/data/seed/status')).data.data
  });

  const seedMut = useMutation({
    mutationFn: async (key: string) => (await api.post(`/admin/data/seed/${key}`)).data.data,
    onSuccess: (data, key) => {
      const result = (data as any)?.result;
      const summary = result && typeof result === 'object' ? JSON.stringify(result) : String(result ?? 'ok');
      toast.success(`Seed "${key}" complete · ${summary.slice(0, 80)}`);
      qc.invalidateQueries({ queryKey: ['admin', 'data', 'seed-status'] });
      qc.invalidateQueries({ queryKey: ['admin', 'data', 'resource', activeResource] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Seed failed')
  });

  const { data: rows = [] } = useQuery<any[]>({
    queryKey: ['admin', 'data', 'resource', activeResource],
    queryFn: async () => (await api.get(`/admin/data/${activeResource}`)).data.data,
    enabled: !!activeResource
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/data/${activeResource}/${id}`)).data.data,
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['admin', 'data'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Delete failed')
  });

  const previewColumns = useMemo(() => {
    if (rows.length === 0) return [];
    const sample = rows[0];
    return Object.keys(sample).filter((k) => k !== 'createdAt' && k !== 'updatedAt').slice(0, 5);
  }, [rows]);

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Database size={24} className="text-[#065F46] dark:text-[#84CC16]" />
        <div>
          <h1 className="font-heading text-2xl font-extrabold">Tool data</h1>
          <p className="text-sm text-[var(--muted)]">Re-run seed functions, browse curated datasets, delete bad rows.</p>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Seed runner</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(status?.datasets ?? []).map((d) => (
            <article key={d.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="text-sm font-semibold">{d.label}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {d.currentCount} row{d.currentCount === 1 ? '' : 's'} · last run {formatDate(d.lastRunAt)}
              </div>
              <button
                onClick={() => seedMut.mutate(d.key)}
                disabled={seedMut.isPending && seedMut.variables === d.key}
                className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B] disabled:opacity-50"
              >
                {seedMut.isPending && seedMut.variables === d.key
                  ? <><Loader2 size={12} className="animate-spin" /> Running…</>
                  : <><Play size={12} /> Re-run seed</>}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Browse datasets</h2>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {RESOURCES.map((r) => {
            const active = activeResource === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setActiveResource(r.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-[#065F46] bg-[#065F46] text-white'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                {previewColumns.map((col) => (
                  <th key={col} className="px-3 py-2">{col}</th>
                ))}
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={previewColumns.length + 1} className="px-3 py-12 text-center text-[var(--muted)]">
                    Empty.
                  </td>
                </tr>
              )}
              {rows.slice(0, 200).map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)]/50 last:border-b-0">
                  {previewColumns.map((col) => (
                    <td key={col} className="max-w-[300px] truncate px-3 py-2 text-xs">
                      {formatCell(row[col])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => {
                        const confirmation = window.prompt(`Type DELETE to remove this row from ${activeResource}.`);
                        if (confirmation === 'DELETE') deleteMut.mutate(row.id);
                        else if (confirmation !== null) toast.error('Cancelled — confirmation did not match.');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && (
            <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
              Showing first 200 of {rows.length} rows.
            </div>
          )}
        </div>
      </section>

      <p className="mt-6 text-xs text-[var(--muted)]">
        v1 supports browse + delete here. Create / edit happens via each tool's own admin endpoint
        (e.g. `/admin/learning` for learning resources). Full per-dataset CRUD UI is a v2 polish pass.
      </p>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length === 0 ? '[]' : `[${v.length}] ${v.slice(0, 3).join(', ')}${v.length > 3 ? '…' : ''}`;
  return JSON.stringify(v).slice(0, 120);
}
