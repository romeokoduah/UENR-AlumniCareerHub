import { motion } from 'framer-motion';
import { ExternalLink, Clock } from 'lucide-react';
import type { Scholarship } from '../../types';

export function ScholarshipCard({ item, index = 0 }: { item: Scholarship; index?: number }) {
  const isRolling = !item.deadline;
  const daysLeft = isRolling ? null : Math.ceil((new Date(item.deadline!).getTime() - Date.now()) / 86400000);
  const closingSoon = daysLeft !== null && daysLeft <= 14 && daysLeft >= 0;
  const closed = daysLeft !== null && daysLeft < 0;
  const isIngested = item.source === 'INGESTED';
  const sourceLabel = isIngested ? `via ${item.sourceName ?? 'aggregator'}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="card-hover flex h-full flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#065F46] dark:text-[#84CC16]">{item.provider}</div>
          <h3 className="mt-1 font-heading text-lg font-bold leading-tight">{item.title}</h3>
        </div>
        <span className="badge-emerald shrink-0">{item.level}</span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-[var(--muted)]">{item.description}</p>

      {item.awardAmount && (
        <div className="mt-3 text-sm font-semibold text-[#F59E0B]">💰 {item.awardAmount}</div>
      )}

      {isIngested && (item.confidence != null || sourceLabel) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.confidence != null && (
            <span className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
              AI confidence: {Math.round(item.confidence * 100)}%
            </span>
          )}
          {sourceLabel && (
            <span className="text-[11px] text-[var(--muted)] italic">{sourceLabel}</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-4 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
          isRolling ? 'text-[var(--muted)]' : closed ? 'text-[var(--muted)]' : closingSoon ? 'text-[#FB7185]' : 'text-[var(--muted)]'
        }`}>
          <Clock size={12} />
          {isRolling ? 'Rolling deadline' : closed ? 'Closed' : closingSoon ? `Closes in ${daysLeft}d` : `${daysLeft}d left`}
        </span>
        <a href={item.applicationUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#065F46] dark:text-[#84CC16] inline-flex items-center gap-1">
          Apply <ExternalLink size={12} />
        </a>
      </div>
    </motion.div>
  );
}
