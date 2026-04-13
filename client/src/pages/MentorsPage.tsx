import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { MentorCard } from '../components/shared/MentorCard';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuthStore } from '../store/auth';
import type { MentorProfile } from '../types';

export default function MentorsPage() {
  const user = useAuthStore((s) => s.user);
  const { data = [], isLoading } = useQuery<MentorProfile[]>({
    queryKey: ['mentors'],
    queryFn: async () => (await api.get('/mentors')).data.data
  });

  const request = async (mentorId: string) => {
    if (!user) return toast.error('Please log in first');
    try {
      await api.post(`/mentors/${mentorId}/request`, { goals: 'Looking for career guidance' });
      toast.success('Mentorship request sent!');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Request failed');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Meet your mentors</h1>
      <p className="text-sm text-[var(--muted)]">Alumni ready to help you grow</p>

      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-56 skeleton" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState emoji="🤝" title="No mentors yet" message="Check back soon — our alumni are gearing up to mentor the next generation." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((m, i) => <MentorCard key={m.id} item={m} index={i} onRequest={() => request(m.user.id)} />)}
        </div>
      )}
    </div>
  );
}
