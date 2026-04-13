import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { api } from '../services/api';
import { EmptyState } from '../components/ui/EmptyState';

type DirectoryUser = {
  id: string; firstName: string; lastName: string; avatar?: string;
  programme?: string; graduationYear?: number; currentRole?: string; currentCompany?: string; location?: string; role: string;
};

export default function DirectoryPage() {
  const [q, setQ] = useState('');

  const { data = [], isLoading } = useQuery<DirectoryUser[]>({
    queryKey: ['directory', q],
    queryFn: async () => (await api.get('/users/directory', { params: { q } })).data.data
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Alumni Directory</h1>
      <p className="text-sm text-[var(--muted)]">Connect with UENR alumni across the globe</p>

      <div className="card mt-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input className="input pl-9" placeholder="Search by name, role, or company..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(9)].map((_, i) => <div key={i} className="card h-32 skeleton" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState emoji="👥" title="No alumni found" message="Try a different search term." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card-hover flex items-center gap-3"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#84CC16] text-[#1C1917] font-bold">
                {u.firstName[0]}{u.lastName[0]}
              </div>
              <div className="min-w-0">
                <div className="font-heading font-bold truncate">{u.firstName} {u.lastName}</div>
                <div className="text-xs text-[var(--muted)] truncate">
                  {u.currentRole ? `${u.currentRole} @ ${u.currentCompany || '—'}` : u.programme}
                </div>
                {u.graduationYear && (
                  <div className="text-xs text-[var(--muted)]">Class of {u.graduationYear}</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
