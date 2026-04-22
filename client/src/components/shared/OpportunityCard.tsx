import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Briefcase, DollarSign } from 'lucide-react';
import type { Opportunity } from '../../types';

const typeLabel: Record<Opportunity['type'], string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  INTERNSHIP: 'Internship',
  NATIONAL_SERVICE: 'National Service',
  VOLUNTEER: 'Volunteer',
  CONTRACT: 'Contract'
};

function formatSalary(item: Opportunity): string | null {
  const { salaryMin, salaryMax, currency = '£' } = item;
  if (!salaryMin && !salaryMax) return null;
  const fmt = (n: number) => {
    if (n >= 1000) return `${currency}${Math.round(n / 1000)}k`;
    return `${currency}${n}`;
  };
  if (salaryMin && salaryMax) return `${fmt(salaryMin)} – ${fmt(salaryMax)}`;
  if (salaryMin) return `From ${fmt(salaryMin)}`;
  if (salaryMax) return `Up to ${fmt(salaryMax)}`;
  return null;
}

export function OpportunityCard({ item, index = 0 }: { item: Opportunity; index?: number }) {
  const hasDeadline = item.deadline && !isNaN(new Date(item.deadline).getTime());
  const daysLeft = hasDeadline
    ? Math.max(0, Math.ceil((new Date(item.deadline).getTime() - Date.now()) / 86400000))
    : null;
  const closingSoon = daysLeft !== null && daysLeft <= 7;
  const salary = formatSalary(item);
  const isIngested = item.source === 'INGESTED';
  const sourceLabel = isIngested ? `via ${item.sourceName ?? 'aggregator'}` : null;

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
          {item.industry && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-medium">
              <Briefcase size={11} /> {item.industry}
            </span>
          )}
          {salary && (
            <span className="inline-flex items-center gap-1 font-medium text-[var(--fg)]">
              <DollarSign size={12} /> {salary}
            </span>
          )}
          {daysLeft !== null && (
            <span className={`inline-flex items-center gap-1 font-semibold ${closingSoon ? 'text-[#FB7185]' : ''}`}>
              <Clock size={12} /> {daysLeft}d left
            </span>
          )}
        </div>

        {item.requiredSkills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.requiredSkills.slice(0, 4).map((s) => (
              <span key={s} className="badge-muted">{s}</span>
            ))}
          </div>
        )}

        {sourceLabel && (
          <div className="mt-3 text-[11px] text-[var(--muted)] italic">{sourceLabel}</div>
        )}
      </Link>
    </motion.div>
  );
}
