import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Briefcase } from 'lucide-react';
import type { Opportunity } from '../../types';

const typeLabel: Record<Opportunity['type'], string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  INTERNSHIP: 'Internship',
  NATIONAL_SERVICE: 'National Service',
  VOLUNTEER: 'Volunteer',
  CONTRACT: 'Contract'
};

export function OpportunityCard({ item, index = 0 }: { item: Opportunity; index?: number }) {
  const daysLeft = Math.max(0, Math.ceil((new Date(item.deadline).getTime() - Date.now()) / 86400000));
  const closingSoon = daysLeft <= 7;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 200, damping: 22 }}
    >
      <Link to={`/opportunities/${item.id}`} className="card-hover block h-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#065F46] dark:text-[#84CC16]">{item.company}</div>
            <h3 className="mt-1 font-heading text-lg font-bold leading-tight">{item.title}</h3>
          </div>
          <span className="badge-lime shrink-0">{typeLabel[item.type]}</span>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-[var(--muted)]">{item.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1"><MapPin size={12} /> {item.location} · {item.locationType.toLowerCase()}</span>
          {item.industry && <span className="inline-flex items-center gap-1"><Briefcase size={12} /> {item.industry}</span>}
          <span className={`inline-flex items-center gap-1 font-semibold ${closingSoon ? 'text-[#FB7185]' : ''}`}>
            <Clock size={12} /> {daysLeft}d left
          </span>
        </div>

        {item.requiredSkills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.requiredSkills.slice(0, 4).map((s) => (
              <span key={s} className="badge-muted">{s}</span>
            ))}
          </div>
        )}
      </Link>
    </motion.div>
  );
}
