import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../services/api';
import { ScholarshipCard } from '../components/shared/ScholarshipCard';
import { EmptyState } from '../components/ui/EmptyState';
import type { Scholarship } from '../types';

const FIELD_OPTIONS = [
  'STEM',
  'Energy & Environment',
  'Business',
  'Agriculture',
  'Health',
  'Social Sciences',
  'Arts & Humanities',
  'Other',
] as const;

const REGION_OPTIONS = ['Ghana-only', 'Africa-wide', 'Global'] as const;

const FUNDING_OPTIONS = [
  'Full funding',
  'Partial funding',
  'Stipend only',
  'Travel/conference grant',
] as const;

export default function ScholarshipsPage() {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('open');
  const [field, setField] = useState('');
  const [region, setRegion] = useState('');
  const [funding, setFunding] = useState('');
  const [includeRolling, setIncludeRolling] = useState(false);

  const hasExtraFilter = field !== '' || region !== '' || funding !== '' || includeRolling;

  const params: Record<string, string> = { q, level, status, field, region, funding };
  if (includeRolling && status === 'open') params.includeRolling = 'true';

  const { data = [], isLoading } = useQuery<Scholarship[]>({
    queryKey: ['scholarships', q, level, status, field, region, funding, includeRolling],
    queryFn: async () => (await api.get('/scholarships', { params })).data.data
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Scholarships & Fellowships</h1>
      <p className="text-sm text-[var(--muted)]">Funding opportunities for UENR students and alumni</p>

      <div className="card mt-6 mb-6 flex flex-col gap-3">
        {/* Row 1: search + level + status */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
            <input className="input pl-9" placeholder="Search scholarships..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input max-w-[180px]" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All levels</option>
            <option value="UNDERGRAD">Undergraduate</option>
            <option value="MASTERS">Masters</option>
            <option value="PHD">PhD</option>
            <option value="POSTDOC">Postdoc</option>
          </select>
          <select className="input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="">All</option>
          </select>
        </div>

        {/* Row 2: new facet filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select className="input max-w-[200px]" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">All fields</option>
            {FIELD_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="input max-w-[180px]" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="input max-w-[220px]" value={funding} onChange={(e) => setFunding(e.target.value)}>
            <option value="">All funding types</option>
            {FUNDING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-[#065F46]"
              checked={includeRolling}
              onChange={(e) => setIncludeRolling(e.target.checked)}
            />
            <span className={status !== 'open' ? 'text-[var(--muted)]' : ''}>Include rolling deadlines</span>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-56 skeleton" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          emoji="🎓"
          title="No scholarships found"
          message={
            hasExtraFilter
              ? 'Try broadening your filters.'
              : 'Try different filters or check back soon — new opportunities are added weekly.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((s, i) => <ScholarshipCard key={s.id} item={s} index={i} />)}
        </div>
      )}
    </div>
  );
}
