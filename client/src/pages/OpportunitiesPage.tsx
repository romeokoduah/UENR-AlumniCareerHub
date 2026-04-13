import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { OpportunityCard } from '../components/shared/OpportunityCard';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuthStore } from '../store/auth';
import type { Opportunity } from '../types';

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'NATIONAL_SERVICE', label: 'National Service' },
  { value: 'VOLUNTEER', label: 'Volunteer' },
  { value: 'PART_TIME', label: 'Part-time' }
];
const LOCATIONS = [
  { value: '', label: 'Any location' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'ONSITE', label: 'Onsite' },
  { value: 'HYBRID', label: 'Hybrid' }
];

export default function OpportunitiesPage() {
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [locationType, setLocationType] = useState('');

  const { data = [], isLoading } = useQuery<Opportunity[]>({
    queryKey: ['opportunities', q, type, locationType],
    queryFn: async () => (await api.get('/opportunities', { params: { q, type, locationType } })).data.data
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Opportunities</h1>
          <p className="text-sm text-[var(--muted)]">Jobs, internships, national service & more</p>
        </div>
        {user && ['ALUMNI', 'EMPLOYER', 'ADMIN'].includes(user.role) && (
          <Link to="/opportunities/new" className="btn-primary">
            <Plus size={16} /> Post
          </Link>
        )}
      </div>

      <div className="card mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input className="input pl-9" placeholder="Search title, company, description..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input max-w-[180px]" value={locationType} onChange={(e) => setLocationType(e.target.value)}>
          {LOCATIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-48 skeleton" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="No matches yet"
          message="Try different keywords or clear your filters to see more opportunities."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((o, i) => <OpportunityCard key={o.id} item={o} index={i} />)}
        </div>
      )}
    </div>
  );
}
