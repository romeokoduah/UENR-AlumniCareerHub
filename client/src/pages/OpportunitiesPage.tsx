import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { OpportunityCard } from '../components/shared/OpportunityCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
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
const INDUSTRIES = [
  { value: '', label: 'All industries' },
  { value: 'IT Jobs', label: 'IT Jobs' },
  { value: 'Engineering Jobs', label: 'Engineering Jobs' },
  { value: 'Healthcare & Nursing Jobs', label: 'Healthcare & Nursing' },
  { value: 'Sales Jobs', label: 'Sales Jobs' },
  { value: 'Accounting & Finance Jobs', label: 'Accounting & Finance' },
  { value: 'Admin Jobs', label: 'Admin Jobs' },
  { value: 'Consultancy Jobs', label: 'Consultancy Jobs' },
  { value: 'Teaching Jobs', label: 'Teaching Jobs' },
  { value: 'Other/General', label: 'Other / General' }
];
const ORIGINS = [
  { value: '', label: 'All sources' },
  { value: 'community', label: 'UENR community' },
  { value: 'aggregator', label: 'Aggregator feeds' }
];

const PAGE_SIZE = 24;

export default function OpportunitiesPage() {
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [locationType, setLocationType] = useState('');
  const [industry, setIndustry] = useState('');
  const [origin, setOrigin] = useState('');
  const [page, setPage] = useState(1);

  const { data = [], isLoading } = useQuery<Opportunity[]>({
    queryKey: ['opportunities', q, type, locationType, industry, origin],
    queryFn: async () =>
      (await api.get('/opportunities', { params: { q, type, locationType, industry, origin } })).data.data
  });

  const handleFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          <input
            className="input pl-9"
            placeholder="Search title, company, description..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input max-w-[180px]" value={type} onChange={(e) => handleFilter(setType)(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input max-w-[180px]" value={locationType} onChange={(e) => handleFilter(setLocationType)(e.target.value)}>
          {LOCATIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input max-w-[200px]" value={industry} onChange={(e) => handleFilter(setIndustry)(e.target.value)}>
          {INDUSTRIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input max-w-[180px]" value={origin} onChange={(e) => handleFilter(setOrigin)(e.target.value)}>
          {ORIGINS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
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
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pageData.map((o, i) => <OpportunityCard key={o.id} item={o} index={i} />)}
          </div>
          <div className="mt-6">
            <Pagination total={data.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
