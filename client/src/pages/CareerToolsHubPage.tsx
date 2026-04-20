import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpRight, Sparkles, Clock, X } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import {
  CAREER_TOOLS, CATEGORY_LABELS, findCareerTool, visibleCareerTools,
  type CareerTool, type CareerToolCategory
} from '../content/careerTools';

type ActivityRow = {
  id: string;
  tool: string;
  action: string;
  createdAt: string;
};

const CATEGORY_FILTERS: { key: 'all' | CareerToolCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'application-materials', label: CATEGORY_LABELS['application-materials'] },
  { key: 'skills', label: CATEGORY_LABELS.skills },
  { key: 'interview', label: CATEGORY_LABELS.interview },
  { key: 'ventures', label: CATEGORY_LABELS.ventures },
  { key: 'support', label: CATEGORY_LABELS.support },
  { key: 'employers', label: CATEGORY_LABELS.employers }
];

const HINT_DISMISSED_KEY = 'uenr_career_tools_hint_dismissed_v1';

export default function CareerToolsHubPage() {
  const user = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | CareerToolCategory>('all');
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!window.localStorage.getItem(HINT_DISMISSED_KEY)) setHintVisible(true);
    } catch { /* ignore */ }
  }, []);

  const dismissHint = () => {
    setHintVisible(false);
    try { window.localStorage.setItem(HINT_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };

  const tools = useMemo(() => visibleCareerTools(user?.role), [user?.role]);
  const showEmployerChip = user?.role === 'EMPLOYER' || user?.role === 'ADMIN';
  const chips = useMemo(
    () => CATEGORY_FILTERS.filter((c) => c.key !== 'employers' || showEmployerChip),
    [showEmployerChip]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (filter !== 'all' && t.category !== filter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    });
  }, [tools, filter, query]);

  const { data: recent = [] } = useQuery<ActivityRow[]>({
    queryKey: ['career-tools', 'activity', 'recent'],
    queryFn: async () => (await api.get('/career-tools/activity/recent')).data.data
  });

  const recentTools = recent
    .map((r) => findCareerTool(r.tool))
    .filter((t): t is CareerTool => Boolean(t));

  const recommendedTools = useMemo(() => {
    const used = new Set(recent.map((r) => r.tool));
    return tools
      .filter((t) => !used.has(t.slug))
      .sort((a, b) => a.phase - b.phase)
      .slice(0, 4);
  }, [tools, recent]);

  return (
    <div className="bg-[var(--bg)]">
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <AnimatePresence>
            {hintVisible && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-6 flex items-start gap-3 rounded-2xl border border-[#84CC16]/40 bg-[#84CC16]/10 p-4 text-sm dark:border-[#84CC16]/30 dark:bg-[#84CC16]/5"
              >
                <Sparkles size={18} className="shrink-0 text-[#065F46] dark:text-[#84CC16]" />
                <div className="flex-1">
                  <div className="font-semibold text-[var(--fg)]">Welcome to your Career Tools.</div>
                  <p className="mt-1 text-[var(--fg)]/80">
                    Nineteen self-service tools to help you write better applications, sharpen your skills, prep
                    for interviews, launch a venture, and more. Start with the CV Builder or browse by category.
                  </p>
                </div>
                <button
                  onClick={dismissHint}
                  className="text-[var(--muted)] hover:text-[var(--fg)]"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            — Career Tools
          </div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight md:text-5xl">
            Everything you need,<br />in one place.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
            Self-service tools to write better applications, sharpen your skills, prep for
            interviews, launch a venture, and keep moving forward — built for UENR alumni.
          </p>

          <div className="mt-8 flex flex-col gap-4">
            <label className="relative block max-w-xl">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools — CV, mock interview, salary…"
                className="input w-full pl-11"
                aria-label="Search career tools"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {chips.map((c) => {
                const active = filter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFilter(c.key)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${
                      active
                        ? 'border-[#065F46] bg-[#065F46] text-white'
                        : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--muted)]">
            No tools match "{query}". Try clearing the search or picking a different filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t, i) => (
              <ToolCard key={t.slug} tool={t} index={i} />
            ))}
          </div>
        )}
      </section>

      {recentTools.length > 0 && (
        <section className="border-t border-[var(--border)] bg-[var(--card)]/40">
          <div className="mx-auto max-w-7xl px-4 py-12">
            <div className="mb-6 flex items-center gap-2">
              <Clock size={18} className="text-[#065F46] dark:text-[#84CC16]" />
              <h2 className="font-heading text-xl font-bold">Recently used</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentTools.map((t, i) => (
                <ToolCard key={t.slug} tool={t} index={i} compact />
              ))}
            </div>
          </div>
        </section>
      )}

      {recommendedTools.length > 0 && (
        <section className="border-t border-[var(--border)]">
          <div className="mx-auto max-w-7xl px-4 py-12">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles size={18} className="text-[#F59E0B]" />
              <h2 className="font-heading text-xl font-bold">Recommended for you</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recommendedTools.map((t, i) => (
                <ToolCard key={t.slug} tool={t} index={i} compact />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ToolCard({ tool, index, compact = false }: { tool: CareerTool; index: number; compact?: boolean }) {
  const Icon = tool.icon;
  const statusBadge =
    tool.status === 'live' ? null : (
      <span className="rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
        {tool.status === 'beta' ? 'Beta' : `Phase ${tool.phase}`}
      </span>
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35 }}
    >
      <Link
        to={`/career-tools/${tool.slug}`}
        className="group relative flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Icon size={20} />
          </div>
          {statusBadge}
        </div>
        <h3 className="mt-4 font-heading text-base font-bold leading-tight">{tool.name}</h3>
        {!compact && (
          <p className="mt-1.5 text-sm text-[var(--muted)] line-clamp-3">{tool.description}</p>
        )}
        <div className="mt-auto pt-4">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#065F46] dark:text-[#84CC16]">
            Open
            <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
