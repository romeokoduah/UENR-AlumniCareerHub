import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import type { MentorProfile } from '../../types';

export function MentorCard({ item, index = 0, onRequest }: { item: MentorProfile; index?: number; onRequest?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="card-hover flex h-full flex-col"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#84CC16] text-[#1C1917] text-lg font-bold">
          {item.user.firstName[0]}{item.user.lastName[0]}
        </div>
        <div>
          <div className="font-heading font-bold">{item.user.firstName} {item.user.lastName}</div>
          <div className="text-xs text-[var(--muted)]">{item.currentRole} · {item.company}</div>
        </div>
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-[var(--muted)]">{item.bio}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.mentoringTopics.slice(0, 3).map((t) => (
          <span key={t} className="badge-emerald">{t}</span>
        ))}
      </div>

      <div className="mt-auto pt-4 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-[#F59E0B] font-semibold">
          <Star size={12} fill="currentColor" /> {item.averageRating || '—'} · {item.sessionsCompleted} sessions
        </span>
        <button onClick={onRequest} className="btn-accent text-xs py-1.5 px-3">Request</button>
      </div>
    </motion.div>
  );
}
