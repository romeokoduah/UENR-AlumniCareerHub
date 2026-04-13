import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Calendar, MapPin, Users } from 'lucide-react';
import { api } from '../services/api';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuthStore } from '../store/auth';
import type { EventItem } from '../types';

export default function EventsPage() {
  const user = useAuthStore((s) => s.user);
  const { data = [], isLoading } = useQuery<EventItem[]>({
    queryKey: ['events'],
    queryFn: async () => (await api.get('/events')).data.data
  });

  const rsvp = async (id: string) => {
    if (!user) return toast.error('Log in to RSVP');
    try {
      await api.post(`/events/${id}/rsvp`);
      toast.success("You're in! 🎉");
    } catch { toast.error('RSVP failed'); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Events & Workshops</h1>
      <p className="text-sm text-[var(--muted)]">Career fairs, workshops, panels & bootcamps</p>

      {isLoading ? (
        <div className="mt-6 space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-32 skeleton" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState emoji="📅" title="No events scheduled" message="New events are announced weekly — check back soon!" />
      ) : (
        <div className="mt-6 space-y-4">
          {data.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card-hover flex flex-col md:flex-row items-start justify-between gap-4"
            >
              <div className="flex-1">
                <div className="badge-gold">{e.type}</div>
                <h3 className="mt-2 font-heading text-xl font-bold">{e.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{e.description}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1"><Calendar size={12} /> {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="inline-flex items-center gap-1"><MapPin size={12} /> {e.location}</span>
                  <span className="inline-flex items-center gap-1"><Users size={12} /> {e._count?.registrations || 0} / {e.capacity}</span>
                </div>
              </div>
              <button onClick={() => rsvp(e.id)} className="btn-accent shrink-0">RSVP</button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
