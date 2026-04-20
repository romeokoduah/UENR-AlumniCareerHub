// Ghana Business Registration Guide — walkthroughs for sole-prop, partnership,
// LLC, foreign investment (GIPC), and sector-specific licensing. Replaces the
// placeholder at /career-tools/ventures/registration.
//
// Backed by /api/biz-reg. No AI/LLM calls; content is hand-curated in
// server/src/lib/seedBizRegSteps.ts.
//
// Progress is tracked client-side in localStorage per (user, slug). Per-user
// DB persistence is intentionally deferred to v2 — the underlying model has
// no progress relation today and adding one before the UI proved itself
// would have been premature.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Building2, Check, ChevronDown, ChevronUp, ChevronRight,
  Clock, Coins, Download, ExternalLink, FileText, Info, ShieldAlert, X
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

const TOOL_SLUG = 'ventures/registration';

// ---- types --------------------------------------------------------------

type FormDownload = { label: string; url: string };

type BizRegStep = {
  id: string;
  slug: string;
  authority: string;
  title: string;
  description: string;
  estimatedTimeDays: number | null;
  estimatedCostGhs: number | null;
  pitfalls: string | null;
  officialUrl: string | null;
  formDownloads: FormDownload[] | null;
  position: number;
  category: Category;
  createdAt: string;
};

type Category =
  | 'sole-prop'
  | 'partnership'
  | 'llc'
  | 'foreign-investment'
  | 'sector-specific';

const CATEGORIES: { key: Category; label: string; blurb: string }[] = [
  {
    key: 'sole-prop',
    label: 'Sole proprietorship',
    blurb: 'You + your business are the same legal person. Fastest path to a registered trading name.'
  },
  {
    key: 'partnership',
    label: 'Partnership',
    blurb: 'Two or more partners share profits, losses, and unlimited liability. Needs a deed.'
  },
  {
    key: 'llc',
    label: 'Limited Liability Company (LLC)',
    blurb: 'Separate legal entity. Owners\' liability is capped at their share capital. The default for serious ventures.'
  },
  {
    key: 'foreign-investment',
    label: 'Foreign investment (GIPC)',
    blurb: 'Non-Ghanaian investors must register through the Ghana Investment Promotion Centre and meet minimum capital thresholds.'
  },
  {
    key: 'sector-specific',
    label: 'Sector-specific licences',
    blurb: 'Mining, energy, food & drugs, fintech, telecom, tourism, forestry — each has its own regulator on top of RGD/GRA.'
  }
];

// ---- helpers ------------------------------------------------------------

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

// localStorage key for per-user, per-step completion. Falls back to a
// shared "guest" bucket when the user isn't loaded yet — RequireAuth gates
// this route, so that branch is theoretical.
const progressKey = (userId: string | undefined) =>
  `biz-reg:progress:${userId ?? 'guest'}`;

function readProgress(userId: string | undefined): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(progressKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeProgress(userId: string | undefined, set: Set<string>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(progressKey(userId), JSON.stringify(Array.from(set)));
  } catch {
    /* quota errors are non-fatal */
  }
}

const formatTime = (days: number | null) => {
  if (days == null) return null;
  if (days <= 1) return `${days} day`;
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round((days / 365) * 10) / 10} years`;
};

const formatCost = (ghs: number | null) => {
  if (ghs == null) return null;
  if (ghs === 0) return 'Free';
  return `GHS ${ghs.toLocaleString('en-GH')}`;
};

// =========================================================================
// Page
// =========================================================================

export default function BusinessRegistrationPage() {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState<Category>('sole-prop');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  // The progress set is mirrored in component state so completion toggles
  // re-render the timeline immediately; localStorage is the source of truth
  // across page loads.
  const [completed, setCompleted] = useState<Set<string>>(() => readProgress(user?.id));

  // Re-read whenever user identity flips (login/out within the session).
  useEffect(() => {
    setCompleted(readProgress(user?.id));
  }, [user?.id]);

  useEffect(() => { logActivity('open'); }, []);

  const { data: steps = [], isLoading } = useQuery<BizRegStep[]>({
    queryKey: ['biz-reg', 'steps', category],
    queryFn: async () =>
      (await api.get(`/biz-reg/steps?category=${encodeURIComponent(category)}`)).data.data
  });

  const orderedSteps = useMemo(
    () => [...steps].sort((a, b) => a.position - b.position),
    [steps]
  );

  const completedInCategory = useMemo(
    () => orderedSteps.filter((s) => completed.has(s.slug)).length,
    [orderedSteps, completed]
  );
  const pct = orderedSteps.length
    ? Math.round((completedInCategory / orderedSteps.length) * 100)
    : 0;

  const toggleComplete = (slug: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        logActivity('mark_complete', { slug, category });
      }
      writeProgress(user?.id, next);
      return next;
    });
  };

  const openStep = (slug: string) => {
    setActiveSlug(slug);
    logActivity('view_step', { slug, category });
  };

  const goNext = (slug: string) => {
    const idx = orderedSteps.findIndex((s) => s.slug === slug);
    if (idx === -1 || idx === orderedSteps.length - 1) {
      setActiveSlug(null);
      return;
    }
    const nextSlug = orderedSteps[idx + 1].slug;
    setActiveSlug(nextSlug);
    logActivity('view_step', { slug: nextSlug, category, source: 'next' });
  };

  const activeStep = orderedSteps.find((s) => s.slug === activeSlug) ?? null;
  const activeIdx = activeStep ? orderedSteps.findIndex((s) => s.slug === activeStep.slug) : -1;
  const hasNext = activeIdx >= 0 && activeIdx < orderedSteps.length - 1;

  const categoryMeta = CATEGORIES.find((c) => c.key === category)!;

  return (
    <div className="bg-[var(--bg)]">
      {/* ---- Header ---------------------------------------------------- */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Link
            to="/career-tools"
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={14} /> Career Tools
          </Link>
          <div className="mt-4 flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Building2 size={28} />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — Ghana Business Registration
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                A walkthrough for getting your business legal in Ghana.
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
                Step-by-step routes through RGD, GRA, SSNIT, GIPC, EPA, and the sector regulators —
                with realistic timelines, fees, and the gotchas other guides leave out.
              </p>
              <div className="mt-3 inline-flex max-w-3xl items-start gap-2 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#92400E] dark:text-[#FBBF24]">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>
                  This is general guidance, not legal advice. Fees and timelines change — verify with the
                  authority&rsquo;s site before paying anything. For complex setups (foreign capital, regulated
                  sectors), engage a lawyer.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Category picker ------------------------------------------ */}
      <section className="border-b border-[var(--border)] bg-[var(--card)]/40">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c.key}
                active={category === c.key}
                label={c.label}
                onClick={() => {
                  setCategory(c.key);
                  setActiveSlug(null);
                  logActivity('view_step', { category: c.key, source: 'category' });
                }}
              />
            ))}
          </div>
          <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">{categoryMeta.blurb}</p>
        </div>
      </section>

      {/* ---- Progress + body ------------------------------------------ */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        {category !== 'sector-specific' && orderedSteps.length > 0 && (
          <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                Your progress
              </div>
              <div className="text-xs font-semibold text-[var(--muted)]">
                {completedInCategory} of {orderedSteps.length} ({pct}%)
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
              <div
                className="h-full bg-[#065F46] transition-all dark:bg-[#84CC16]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Progress is tracked locally on this device — it won&rsquo;t follow you to other browsers.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
          </div>
        ) : orderedSteps.length === 0 ? (
          <EmptyState />
        ) : category === 'sector-specific' ? (
          <SectorView
            steps={orderedSteps}
            completed={completed}
            onOpen={openStep}
          />
        ) : (
          <Timeline
            steps={orderedSteps}
            completed={completed}
            onOpen={openStep}
          />
        )}
      </section>

      {/* ---- Detail drawer -------------------------------------------- */}
      <StepDrawer
        step={activeStep}
        index={activeIdx}
        total={orderedSteps.length}
        completed={activeStep ? completed.has(activeStep.slug) : false}
        hasNext={hasNext}
        onClose={() => setActiveSlug(null)}
        onToggleComplete={(slug) => toggleComplete(slug)}
        onNext={(slug) => goNext(slug)}
      />
    </div>
  );
}

// =========================================================================
// Category chip
// =========================================================================

function CategoryChip({
  active, label, onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${
        active
          ? 'border-[#065F46] bg-[#065F46] text-white'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
      }`}
    >
      {label}
    </button>
  );
}

// =========================================================================
// Vertical timeline view (sole-prop / partnership / llc / foreign)
// =========================================================================

function Timeline({
  steps, completed, onOpen
}: {
  steps: BizRegStep[];
  completed: Set<string>;
  onOpen: (slug: string) => void;
}) {
  return (
    <ol className="relative space-y-3">
      {steps.map((step, i) => {
        const isDone = completed.has(step.slug);
        const time = formatTime(step.estimatedTimeDays);
        const cost = formatCost(step.estimatedCostGhs);
        return (
          <motion.li
            key={step.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
          >
            <div className="flex items-start gap-3">
              {/* Index circle + connector */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? 'bg-[#84CC16] text-[#1C1917]'
                      : 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
                  }`}
                >
                  {isDone ? <Check size={16} /> : step.position}
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-1 h-full w-px flex-1 bg-[var(--border)]" />
                )}
              </div>

              {/* Card */}
              <button
                type="button"
                onClick={() => onOpen(step.slug)}
                className="group mb-2 flex flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                        {step.authority}
                      </span>
                      {isDone && (
                        <span className="rounded-full bg-[#84CC16]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3F6212] dark:text-[#84CC16]">
                          Done
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 font-heading text-base font-bold leading-tight">
                      {step.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                      {step.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {time && (
                        <Badge icon={<Clock size={11} />}>{time}</Badge>
                      )}
                      {cost && (
                        <Badge icon={<Coins size={11} />}>{cost}</Badge>
                      )}
                      {step.pitfalls && (
                        <Badge icon={<ShieldAlert size={11} />} tone="warn">Watch-outs</Badge>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 self-center text-sm font-semibold text-[#065F46] dark:text-[#84CC16]">
                    View details
                    <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

// =========================================================================
// Sector-specific view — collapsible groups by authority
// =========================================================================

function SectorView({
  steps, completed, onOpen
}: {
  steps: BizRegStep[];
  completed: Set<string>;
  onOpen: (slug: string) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, BizRegStep[]>();
    for (const s of steps) {
      const arr = m.get(s.authority) ?? [];
      arr.push(s);
      m.set(s.authority, arr);
    }
    // Sort each authority's bucket by position so the order matches the seed.
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [steps]);

  return (
    <div className="space-y-3">
      {grouped.map(([authority, items]) => (
        <SectorGroup
          key={authority}
          authority={authority}
          items={items}
          completed={completed}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function SectorGroup({
  authority, items, completed, onOpen
}: {
  authority: string;
  items: BizRegStep[];
  completed: Set<string>;
  onOpen: (slug: string) => void;
}) {
  // First group expanded by default so the page never opens to a wall of
  // collapsed cards.
  const [open, setOpen] = useState(true);
  const doneCount = items.filter((i) => completed.has(i.slug)).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Building2 size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-base font-bold leading-tight">{authority}</h3>
            <p className="text-xs text-[var(--muted)]">
              {items.length} licence{items.length === 1 ? '' : 's'}
              {doneCount > 0 && ` · ${doneCount} done`}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--border)]"
          >
            <ul className="space-y-2 p-3">
              {items.map((step) => {
                const isDone = completed.has(step.slug);
                const time = formatTime(step.estimatedTimeDays);
                const cost = formatCost(step.estimatedCostGhs);
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(step.slug)}
                      className="group flex w-full items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left transition-colors hover:border-[#065F46]/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-heading text-sm font-bold leading-tight">{step.title}</h4>
                          {isDone && (
                            <span className="rounded-full bg-[#84CC16]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3F6212] dark:text-[#84CC16]">
                              Done
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{step.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          {time && <Badge icon={<Clock size={11} />}>{time}</Badge>}
                          {cost && <Badge icon={<Coins size={11} />}>{cost}</Badge>}
                          {step.pitfalls && (
                            <Badge icon={<ShieldAlert size={11} />} tone="warn">Watch-outs</Badge>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        size={14}
                        className="mt-1 shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =========================================================================
// Detail drawer
// =========================================================================

function StepDrawer({
  step, index, total, completed, hasNext, onClose, onToggleComplete, onNext
}: {
  step: BizRegStep | null;
  index: number;
  total: number;
  completed: boolean;
  hasNext: boolean;
  onClose: () => void;
  onToggleComplete: (slug: string) => void;
  onNext: (slug: string) => void;
}) {
  const open = Boolean(step);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && step && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                    <span>{step.authority}</span>
                    {total > 0 && index >= 0 && (
                      <>
                        <span className="text-[var(--muted)]">·</span>
                        <span className="text-[var(--muted)]">Step {index + 1} of {total}</span>
                      </>
                    )}
                  </div>
                  <h2 className="font-heading text-2xl font-extrabold leading-tight">
                    {step.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {formatTime(step.estimatedTimeDays) && (
                      <Badge icon={<Clock size={11} />}>{formatTime(step.estimatedTimeDays)}</Badge>
                    )}
                    {formatCost(step.estimatedCostGhs) && (
                      <Badge icon={<Coins size={11} />}>{formatCost(step.estimatedCostGhs)}</Badge>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost"
                  aria-label="Close drawer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <p className="text-sm leading-relaxed text-[var(--fg)]">{step.description}</p>

              {step.pitfalls && (
                <DrawerSection title="Watch-outs" icon={<ShieldAlert size={14} />} tone="warn">
                  <p className="text-sm leading-relaxed text-[#92400E] dark:text-[#FBBF24]">
                    {step.pitfalls}
                  </p>
                </DrawerSection>
              )}

              {step.officialUrl && (
                <DrawerSection title="Official source">
                  <a
                    href={step.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
                  >
                    {step.officialUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    <ExternalLink size={12} />
                  </a>
                </DrawerSection>
              )}

              {step.formDownloads && step.formDownloads.length > 0 && (
                <DrawerSection title="Forms" icon={<FileText size={14} />}>
                  <ul className="flex flex-col gap-2">
                    {step.formDownloads.map((f) => (
                      <li key={f.url}>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => logActivity('download_form', { slug: step.slug, label: f.label })}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[#065F46]/40"
                        >
                          <span className="min-w-0 truncate text-sm font-semibold">{f.label}</span>
                          <Download size={14} className="shrink-0 text-[var(--muted)]" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </DrawerSection>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-[var(--border)] bg-[var(--card)] px-6 py-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onToggleComplete(step.slug)}
                  className={
                    completed
                      ? 'btn-ghost'
                      : 'inline-flex items-center gap-1.5 rounded-xl border border-[#065F46] bg-transparent px-4 py-2 text-sm font-semibold text-[#065F46] transition-colors hover:bg-[#065F46]/10 dark:border-[#84CC16] dark:text-[#84CC16] dark:hover:bg-[#84CC16]/10'
                  }
                >
                  {completed ? (
                    <>
                      <X size={14} /> Mark not done
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Mark step as done
                    </>
                  )}
                </button>
                {hasNext && (
                  <button
                    type="button"
                    onClick={() => onNext(step.slug)}
                    className="btn-primary"
                  >
                    Next step <ChevronRight size={14} />
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// =========================================================================
// Shared primitives
// =========================================================================

function Badge({
  icon, children, tone = 'default'
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'warn';
}) {
  const cls =
    tone === 'warn'
      ? 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#FBBF24]'
      : 'bg-[var(--bg)] text-[var(--muted)]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {icon}
      {children}
    </span>
  );
}

function DrawerSection({
  title, icon, tone = 'default', children
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'warn';
  children: React.ReactNode;
}) {
  const ring =
    tone === 'warn'
      ? 'border-[#F59E0B]/30 bg-[#F59E0B]/5'
      : 'border-[var(--border)] bg-[var(--card)]/40';
  return (
    <div className={`rounded-2xl border ${ring} p-4`}>
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#F59E0B]">
        <Info size={28} />
      </div>
      <h3 className="mt-5 font-heading text-xl font-bold">No steps seeded yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
        An admin can populate the catalogue — POST{' '}
        <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-xs">/api/biz-reg/seed</code>.
      </p>
    </div>
  );
}
