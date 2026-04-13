import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../services/api';
import { ScholarshipCard } from '../components/shared/ScholarshipCard';
import { EmptyState } from '../components/ui/EmptyState';
import type { Scholarship } from '../types';

export default function ScholarshipsPage() {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('open');

  const { data = [], isLoading } = useQuery<Scholarship[]>({
    queryKey: ['scholarships', q, level, status],
    queryFn: async () => (await api.get('/scholarships', { params: { q, level, status } })).data.data
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Scholarships & Fellowships</h1>
      <p className="text-sm text-[var(--muted)]">Funding opportunities for UENR students and alumni</p>

      <div className="card mt-6 mb-6 flex flex-wrap gap-3">
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

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-56 skeleton" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState emoji="🎓" title="No scholarships found" message="Try different filters or check back soon — new opportunities are added weekly." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((s, i) => <ScholarshipCard key={s.id} item={s} index={i} />)}
        </div>
      )}
    </div>
  );
}
