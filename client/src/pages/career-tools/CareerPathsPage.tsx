// Career Path Explorer — pick an industry, see how UENR-relevant roles
// stack from Junior to Principal, click any node to open a drawer with
// details, salary band, alumni currently in the seat, matching open jobs,
// and learning paths that bridge to it. No AI/LLM calls.
//
// Backed by:
//   GET /api/paths(?industry=…)        list nodes
//   GET /api/paths/:slug               node + resolved nextNodes
//   GET /api/path-alumni/:slug         up to 6 alumni in this role
//   GET /api/opportunities?q=<role>    matching open jobs
//   GET /api/learning/paths            curated learning paths (loose name match)

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Map as MapIcon, Users, Briefcase, GraduationCap,
  X, ExternalLink, Sparkles
} from 'lucide-react';
import { api, resolveAsset } from '../../services/api';

const TOOL_SLUG = 'paths';

const INDUSTRIES: { slug: string; label: string }[] = [
  { slug: 'renewable-energy', label: 'Renewable Energy' },
  { slug: 'environmental', label: 'Environmental' },
  { slug: 'mining', label: 'Mining' },
  { slug: 'forestry', label: 'Forestry' },
  { slug: 'petroleum', label: 'Petroleum' },
  { slug: 'software-data', label: 'Software & Data' },
  { slug: 'business-finance', label: 'Business & Finance' },
  { slug: 'policy-public', label: 'Policy & Public' },
  { slug: 'agribusiness', label: 'Agribusiness' },
  { slug: 'consulting', label: 'Consulting' }
];

const LEVEL_ORDER = ['junior', 'mid', 'senior', 'lead', 'principal'] as const;
type Level = (typeof LEVEL_ORDER)[number];
const LEVEL_LABELS: Record<Level, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
  principal: 'Principal'
};

type PathNode = {
  id: string;
  slug: string;
  role: string;
  level: string;
  industry: string;
  salaryGhsMin: number | null;
  salaryGhsMax: number | null;
  yearsTypical: number;
  description: string | null;
  requiredSkills: string[];
  nextNodeSlugs: string[];
};

type PathNodeDetail = PathNode & { nextNodes: PathNode[] };

type AlumnusInRole = {
  id: string;
  firstName: string;
  lastName: string;
  programme: string | null;
  graduationYear: number | null;
  currentRole: string | null;
  currentCompany: string | null;
  avatar: string | null;
};

type OpportunityRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  locationType: string;
  type: string;
  createdAt: string;
};

type LearningPath = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

const formatSalary = (min: number | null, max: number | null): string | null => {
  if (!min && !max) return null;
  const fmt = (n: number) => n.toLocaleString('en-GH');
  if (min && max) return `GHS ${fmt(min)}–${fmt(max)}/mo`;
  if (min) return `GHS ${fmt(min)}+/mo`;
  return `Up to GHS ${fmt(max!)}/mo`;
};

// ---------------------------------------------------------------------------

export default function CareerPathsPage() {
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0].slug);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // Fire-and-forget activity log on first mount.
  useEffect(() => {
    logActivity('open');
  }, []);

  const { data: nodes = [], isLoading } = useQuery<PathNode[]>({
    queryKey: ['paths', 'list', industry],
    queryFn: async () =>
      (await api.get(`/paths?industry=${encodeURIComponent(industry)}`)).data.data
  });

  // Group by level so we can render 5 vertical columns.
  const nodesByLevel = useMemo(() => {
    const acc: Record<Level, PathNode[]> = {
      junior: [], mid: [], senior: [], lead: [], principal: []
    };
    for (const n of nodes) {
      const lvl = (LEVEL_ORDER as readonly string[]).includes(n.level)
        ? (n.level as Level)
        : null;
      if (lvl) acc[lvl].push(n);
    }
    return acc;
  }, [nodes]);

  // Quick lookup so node "Next roles" chips can show role names even when
  // the target sits in a different industry filter.
  const nodesBySlug = useMemo(
    () => new Map(nodes.map((n) => [n.slug, n])),
    [nodes]
  );

  // Pretty label for the current industry — used in the empty state.
  const industryLabel =
    INDUSTRIES.find((i) => i.slug === industry)?.label ?? industry;

  return (
    <div className="bg-[var(--bg)]">
      {/* ---- Header ------------------------------------------------------- */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Link
            to="/career-tools"
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={14} /> Career Tools
          </Link>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <MapIcon size={28} />
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — Career Path Explorer
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                See where this role can take you.
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Pick an industry, then explore typical next roles, salary bands, and the alumni
                already sitting in those seats.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Industry chips --------------------------------------------- */}
      <section className="border-b border-[var(--border)] bg-[var(--card)]/40">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((i) => {
              const active = industry === i.slug;
              return (
                <button
                  key={i.slug}
                  type="button"
                  onClick={() => setIndustry(i.slug)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${
                    active
                      ? 'border-[#065F46] bg-[#065F46] text-white'
                      : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
                  }`}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Path graph -------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-64" />
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#F59E0B]">
              <Sparkles size={28} />
            </div>
            <h2 className="mt-5 font-heading text-xl font-bold">
              No paths seeded for {industryLabel} yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
              An admin can populate the catalogue from the Career Tools admin —
              POST <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-xs">/api/paths/seed</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {LEVEL_ORDER.map((level) => (
              <div key={level} className="flex flex-col gap-3">
                <div className="sticky top-0 z-[1] -mx-1 mb-1 flex items-center justify-between rounded-xl bg-[var(--bg)]/80 px-2 py-2 backdrop-blur">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#065F46] dark:text-[#84CC16]">
                    {LEVEL_LABELS[level]}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--muted)]">
                    {nodesByLevel[level].length}
                  </span>
                </div>

                {nodesByLevel[level].length === 0 ? (
                  <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-xs text-[var(--muted)]">
                    No roles at this level
                  </div>
                ) : (
                  nodesByLevel[level].map((node, index) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      index={index}
                      nodesBySlug={nodesBySlug}
                      onOpen={(slug) => {
                        setActiveSlug(slug);
                        logActivity('view_node', { slug });
                      }}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Detail drawer ---------------------------------------------- */}
      <NodeDrawer
        slug={activeSlug}
        onClose={() => setActiveSlug(null)}
        onOpenSlug={(slug) => {
          setActiveSlug(slug);
          logActivity('compare', { fromSlug: activeSlug, toSlug: slug });
        }}
      />
    </div>
  );
}

// ===== Node card ===========================================================

function NodeCard({
  node,
  index,
  nodesBySlug,
  onOpen
}: {
  node: PathNode;
  index: number;
  nodesBySlug: Map<string, PathNode>;
  onOpen: (slug: string) => void;
}) {
  const salary = formatSalary(node.salaryGhsMin, node.salaryGhsMax);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
    >
      <button
        type="button"
        onClick={() => onOpen(node.slug)}
        className="group flex w-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46]"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-sm font-bold leading-tight">
            {node.role}
          </h3>
          <span className="shrink-0 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            {LEVEL_LABELS[node.level as Level] ?? node.level}
          </span>
        </div>

        {salary && (
          <p className="mt-2 text-xs font-semibold text-[var(--fg)]">{salary}</p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            ~{node.yearsTypical} yr{node.yearsTypical === 1 ? '' : 's'}
          </span>
        </div>

        {node.nextNodeSlugs.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Next roles <ArrowRight size={10} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {node.nextNodeSlugs.map((slug) => {
                const target = nodesBySlug.get(slug);
                const label = target?.role ?? slug.replace(/-/g, ' ');
                return (
                  <span
                    key={slug}
                    onClick={(e) => {
                      // clicking the chip should open the target instead of
                      // re-opening the parent — stop the outer button from firing.
                      e.stopPropagation();
                      onOpen(slug);
                    }}
                    className="cursor-pointer rounded-full bg-[#84CC16]/10 px-2 py-0.5 text-[10px] font-semibold text-[#3F6212] transition-colors hover:bg-[#84CC16]/20 dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                    role="button"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </button>
    </motion.div>
  );
}

// ===== Drawer ==============================================================

function NodeDrawer({
  slug,
  onClose,
  onOpenSlug
}: {
  slug: string | null;
  onClose: () => void;
  onOpenSlug: (slug: string) => void;
}) {
  const open = Boolean(slug);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Close on Escape — small UX nicety.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && slug && (
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
            className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <DrawerContents
              slug={slug}
              onClose={onClose}
              onOpenSlug={onOpenSlug}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerContents({
  slug,
  onClose,
  onOpenSlug
}: {
  slug: string;
  onClose: () => void;
  onOpenSlug: (slug: string) => void;
}) {
  const { data: node, isLoading } = useQuery<PathNodeDetail>({
    queryKey: ['paths', 'detail', slug],
    queryFn: async () => (await api.get(`/paths/${slug}`)).data.data
  });

  const { data: alumni = [] } = useQuery<AlumnusInRole[]>({
    queryKey: ['paths', 'alumni', slug],
    queryFn: async () => (await api.get(`/path-alumni/${slug}`)).data.data
  });

  // Search jobs by role keyword. We only have role *after* the node loads,
  // so guard the query.
  const roleQuery = node?.role ?? '';
  const { data: opportunities = [] } = useQuery<OpportunityRow[]>({
    queryKey: ['paths', 'opps', roleQuery],
    queryFn: async () =>
      (await api.get(`/opportunities?q=${encodeURIComponent(roleQuery)}`)).data.data,
    enabled: Boolean(roleQuery)
  });

  // All curated learning paths — we filter client-side by role keyword to
  // keep the API surface tight (no per-role lookup needed).
  const { data: allLearningPaths = [] } = useQuery<LearningPath[]>({
    queryKey: ['paths', 'learning-paths'],
    queryFn: async () => (await api.get('/learning/paths')).data.data,
    staleTime: 5 * 60 * 1000
  });

  const matchingLearning = useMemo(() => {
    if (!node) return [];
    const needle = node.role.toLowerCase();
    const tokens = needle.split(/\s+/).filter((t) => t.length > 3);
    return allLearningPaths
      .filter((p) => {
        const hay = `${p.name} ${p.description ?? ''}`.toLowerCase();
        if (hay.includes(needle)) return true;
        return tokens.some((t) => hay.includes(t));
      })
      .slice(0, 5);
  }, [allLearningPaths, node]);

  if (isLoading || !node) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  const salary = formatSalary(node.salaryGhsMin, node.salaryGhsMax);
  const topOpps = opportunities.slice(0, 5);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              {LEVEL_LABELS[node.level as Level] ?? node.level} · {node.industry.replace(/-/g, ' ')}
            </div>
            <h2 className="font-heading text-2xl font-extrabold leading-tight">
              {node.role}
            </h2>
            {salary && (
              <p className="mt-1 text-sm font-semibold text-[var(--fg)]">{salary}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-6 px-6 py-6">
        {node.description && (
          <p className="text-sm leading-relaxed text-[var(--fg)]">
            {node.description}
          </p>
        )}

        {/* Required skills */}
        {node.requiredSkills.length > 0 && (
          <DrawerSection title="Required skills">
            <div className="flex flex-wrap gap-2">
              {node.requiredSkills.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-[#065F46]/10 px-3 py-1 text-xs font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                >
                  {s}
                </span>
              ))}
            </div>
          </DrawerSection>
        )}

        {/* Next roles */}
        {node.nextNodes.length > 0 && (
          <DrawerSection title="Typical next roles">
            <div className="flex flex-col gap-2">
              {node.nextNodes.map((n) => {
                const s = formatSalary(n.salaryGhsMin, n.salaryGhsMax);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onOpenSlug(n.slug)}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left transition-colors hover:border-[#065F46]/40"
                  >
                    <div>
                      <div className="text-sm font-semibold">{n.role}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {LEVEL_LABELS[n.level as Level] ?? n.level}
                        {s ? ` · ${s}` : ''}
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-[var(--muted)]" />
                  </button>
                );
              })}
            </div>
          </DrawerSection>
        )}

        {/* Open jobs */}
        <DrawerSection
          title="Open jobs at this level"
          icon={<Briefcase size={14} />}
        >
          {topOpps.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No live openings match "{node.role}" right now. Check back soon.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {topOpps.map((opp) => (
                <Link
                  key={opp.id}
                  to={`/opportunities/${opp.id}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[#065F46]/40"
                >
                  <div>
                    <div className="text-sm font-semibold line-clamp-1">{opp.title}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {opp.company} · {opp.location}
                    </div>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-[var(--muted)]" />
                </Link>
              ))}
            </div>
          )}
        </DrawerSection>

        {/* Alumni in this role */}
        <DrawerSection
          title="Alumni in this role"
          icon={<Users size={14} />}
        >
          {alumni.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No alumni currently list this role. Encourage classmates to update their profiles.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {alumni.map((a) => {
                const avatar = resolveAsset(a.avatar);
                return (
                  <Link
                    key={a.id}
                    to={`/directory`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[#065F46]/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#065F46]/10 text-xs font-bold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                      {avatar ? (
                        <img src={avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        `${a.firstName[0] ?? ''}${a.lastName[0] ?? ''}`
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {a.firstName} {a.lastName}
                      </div>
                      <div className="truncate text-[11px] text-[var(--muted)]">
                        {a.currentCompany ?? '—'}
                        {a.programme ? ` · ${a.programme}` : ''}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </DrawerSection>

        {/* Bridges to this role — learning paths */}
        <DrawerSection
          title="Bridges to this role"
          icon={<GraduationCap size={14} />}
        >
          {matchingLearning.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No curated learning path matches "{node.role}" yet —{' '}
              <Link to="/career-tools/learn" className="text-[#065F46] underline dark:text-[#84CC16]">
                browse the full Learning Hub
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {matchingLearning.map((lp) => (
                <Link
                  key={lp.id}
                  to="/career-tools/learn"
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[#065F46]/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{lp.name}</div>
                    {lp.description && (
                      <div className="truncate text-[11px] text-[var(--muted)]">
                        {lp.description}
                      </div>
                    )}
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-[var(--muted)]" />
                </Link>
              ))}
            </div>
          )}
        </DrawerSection>
      </div>
    </div>
  );
}

function DrawerSection({
  title,
  icon,
  children
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
