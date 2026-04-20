// Learning Hub — curated + community-submitted learning resources, learning
// paths, and personal progress tracking. Replaces the placeholder at
// /career-tools/learn.
//
// Backed by /api/learning. No AI/LLM calls.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, BookOpen, Plus, X, ExternalLink, Check, Clock,
  Search, Sparkles, GraduationCap, Headphones, Video, FileText,
  Library, ChevronRight, CheckCircle2, Circle
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

const TOOL_SLUG = 'learn';

// ---- types --------------------------------------------------------------

type LearningType = 'COURSE' | 'VIDEO' | 'BOOK' | 'ARTICLE' | 'PODCAST';
type LearningLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type LearningCost = 'FREE' | 'PAID' | 'FREEMIUM';

type Resource = {
  id: string;
  title: string;
  provider: string;
  url: string;
  type: LearningType;
  level: LearningLevel;
  cost: LearningCost;
  language: string;
  durationMin: number | null;
  skills: string[];
  description: string | null;
  isApproved: boolean;
  createdAt: string;
};

type Path = {
  id: string;
  slug: string;
  name: string;
  description: string;
  stepCount: number;
};

type PathStep = { note: string | null; resource: Resource };

type PathDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  steps: PathStep[];
};

type Progress = {
  id: string;
  resourceId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
  updatedAt: string;
};

// ---- small helpers ------------------------------------------------------

const TYPE_ICON: Record<LearningType, typeof BookOpen> = {
  COURSE: GraduationCap,
  VIDEO: Video,
  BOOK: Library,
  ARTICLE: FileText,
  PODCAST: Headphones
};

const TYPES: LearningType[] = ['COURSE', 'VIDEO', 'BOOK', 'ARTICLE', 'PODCAST'];
const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const COSTS: LearningCost[] = ['FREE', 'PAID', 'FREEMIUM'];

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const formatDuration = (mins: number | null) => {
  if (!mins) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
};

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

// ---- data hooks ---------------------------------------------------------

function useResources(filters: ResourceFilters) {
  return useQuery<Resource[]>({
    queryKey: ['learning', 'resources', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.type) params.type = filters.type;
      if (filters.level) params.level = filters.level;
      if (filters.cost) params.cost = filters.cost;
      if (filters.provider) params.provider = filters.provider;
      if (filters.language) params.language = filters.language;
      if (filters.skill) params.skill = filters.skill;
      if (filters.q) params.q = filters.q;
      return (await api.get('/learning/resources', { params })).data.data;
    }
  });
}

function usePaths() {
  return useQuery<Path[]>({
    queryKey: ['learning', 'paths'],
    queryFn: async () => (await api.get('/learning/paths')).data.data
  });
}

function useProgress() {
  return useQuery<Progress[]>({
    queryKey: ['learning', 'progress'],
    queryFn: async () => (await api.get('/learning/progress')).data.data
  });
}

// ---- filter state -------------------------------------------------------

type ResourceFilters = {
  type: LearningType | '';
  level: LearningLevel | '';
  cost: LearningCost | '';
  provider: string;
  language: string;
  skill: string;
  q: string;
};

const emptyFilters: ResourceFilters = {
  type: '', level: '', cost: '', provider: '', language: '', skill: '', q: ''
};

// =========================================================================
// Page
// =========================================================================

type Tab = 'all' | 'paths' | 'progress';

export default function LearningHubPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [filters, setFilters] = useState<ResourceFilters>(emptyFilters);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [pathSlug, setPathSlug] = useState<string | null>(null);

  const { data: resources = [], isLoading: resourcesLoading } = useResources(filters);
  const { data: paths = [], isLoading: pathsLoading } = usePaths();
  const { data: progress = [] } = useProgress();

  // For the provider/language dropdowns, derive options from the unfiltered
  // resource list so the user can always switch back to a value that exists.
  const { data: allResources = [] } = useResources(emptyFilters);
  const providerOptions = useMemo(
    () => Array.from(new Set(allResources.map((r) => r.provider))).sort((a, b) => a.localeCompare(b)),
    [allResources]
  );
  const languageOptions = useMemo(
    () => Array.from(new Set(allResources.map((r) => r.language))).sort((a, b) => a.localeCompare(b)),
    [allResources]
  );

  const progressByResource = useMemo(() => {
    const m = new Map<string, Progress>();
    for (const p of progress) m.set(p.resourceId, p);
    return m;
  }, [progress]);

  useEffect(() => { logActivity('open'); }, []);

  return (
    <div className="bg-[var(--bg)]">
      {/* Header */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Link
            to="/career-tools"
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={14} /> Career Tools
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                <BookOpen size={28} />
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                  — Learning Hub
                </div>
                <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                  Sharper skills, on your schedule.
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Curated courses, videos, and learning paths — Coursera, edX, MEST, Ghana Code Club, and more.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSubmitOpen(true)}
              className="btn-primary"
            >
              <Plus size={16} /> Submit a resource
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex flex-wrap gap-2">
            <TabChip active={tab === 'all'} onClick={() => setTab('all')} label="All resources" />
            <TabChip active={tab === 'paths'} onClick={() => setTab('paths')} label="Learning paths" />
            <TabChip active={tab === 'progress'} onClick={() => setTab('progress')} label="My progress" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {tab === 'all' && (
          <AllResources
            resources={resources}
            isLoading={resourcesLoading}
            filters={filters}
            setFilters={setFilters}
            providerOptions={providerOptions}
            languageOptions={languageOptions}
            progressByResource={progressByResource}
          />
        )}
        {tab === 'paths' && (
          <PathsTab
            paths={paths}
            isLoading={pathsLoading}
            onOpen={(slug) => setPathSlug(slug)}
          />
        )}
        {tab === 'progress' && (
          <ProgressTab
            progress={progress}
            allResources={allResources}
            progressByResource={progressByResource}
          />
        )}
      </section>

      <AnimatePresence>
        {submitOpen && <SubmitModal onClose={() => setSubmitOpen(false)} />}
        {pathSlug && (
          <PathModal
            slug={pathSlug}
            onClose={() => setPathSlug(null)}
            progressByResource={progressByResource}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =========================================================================
// All resources
// =========================================================================

function AllResources({
  resources, isLoading, filters, setFilters, providerOptions, languageOptions, progressByResource
}: {
  resources: Resource[];
  isLoading: boolean;
  filters: ResourceFilters;
  setFilters: (f: ResourceFilters) => void;
  providerOptions: string[];
  languageOptions: string[];
  progressByResource: Map<string, Progress>;
}) {
  const setField = <K extends keyof ResourceFilters>(k: K, v: ResourceFilters[K]) =>
    setFilters({ ...filters, [k]: v });

  const anyFilter =
    filters.type || filters.level || filters.cost ||
    filters.provider || filters.language || filters.skill || filters.q;

  return (
    <div>
      {/* Filter row */}
      <div className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        {/* Search */}
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={filters.skill}
            onChange={(e) => setField('skill', e.target.value)}
            placeholder="Filter by skill — e.g. python, solar pv, gis…"
            className="input w-full pl-9"
          />
        </label>

        {/* Type chips */}
        <ChipRow
          label="Type"
          values={TYPES}
          active={filters.type}
          onChange={(v) => setField('type', v as LearningType | '')}
        />
        {/* Level chips */}
        <ChipRow
          label="Level"
          values={LEVELS}
          active={filters.level}
          onChange={(v) => setField('level', v as LearningLevel | '')}
        />
        {/* Cost chips */}
        <ChipRow
          label="Cost"
          values={COSTS}
          active={filters.cost}
          onChange={(v) => setField('cost', v as LearningCost | '')}
        />

        {/* Provider + language dropdowns */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Provider</span>
            <select
              value={filters.provider}
              onChange={(e) => setField('provider', e.target.value)}
              className="input"
            >
              <option value="">Any provider</option>
              {providerOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Language</span>
            <select
              value={filters.language}
              onChange={(e) => setField('language', e.target.value)}
              className="input"
            >
              <option value="">Any language</option>
              {languageOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Search title / description</span>
            <input
              value={filters.q}
              onChange={(e) => setField('q', e.target.value)}
              placeholder="Search…"
              className="input"
            />
          </label>
        </div>

        {anyFilter && (
          <div>
            <button
              onClick={() => setFilters(emptyFilters)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
            >
              <X size={12} /> Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-44" />)}
        </div>
      ) : resources.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No resources match those filters"
          message="Try clearing some filters or submit a resource yourself."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r, i) => (
            <ResourceCard
              key={r.id}
              resource={r}
              index={i}
              progress={progressByResource.get(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChipRow({
  label, values, active, onChange
}: {
  label: string;
  values: string[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-[var(--muted)]">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={!active} onClick={() => onChange('')} label="All" />
        {values.map((v) => (
          <Chip key={v} active={active === v} onClick={() => onChange(v)} label={titleCase(v)} />
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
        active
          ? 'border-[#065F46] bg-[#065F46] text-white'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
      }`}
    >
      {label}
    </button>
  );
}

function TabChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
// Resource card
// =========================================================================

function ResourceCard({ resource, index, progress }: { resource: Resource; index: number; progress: Progress | undefined }) {
  const Icon = TYPE_ICON[resource.type];
  const qc = useQueryClient();

  const setProgressMut = useMutation({
    mutationFn: async (status: 'IN_PROGRESS' | 'COMPLETED') =>
      (await api.post('/learning/progress', { resourceId: resource.id, status })).data.data,
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ['learning', 'progress'] });
      logActivity(status === 'COMPLETED' ? 'complete_resource' : 'start_resource', { resourceId: resource.id });
      toast.success(status === 'COMPLETED' ? 'Marked complete' : 'Marked in progress');
    },
    onError: () => toast.error('Could not save progress')
  });

  const status = progress?.status ?? null;
  const duration = formatDuration(resource.durationMin);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Icon size={18} />
        </div>
        {status === 'COMPLETED' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#84CC16]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3F6212] dark:text-[#84CC16]">
            <CheckCircle2 size={10} /> Completed
          </span>
        )}
        {status === 'IN_PROGRESS' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
            <Clock size={10} /> In progress
          </span>
        )}
      </div>

      <h3 className="mt-4 font-heading text-base font-bold leading-tight line-clamp-2">{resource.title}</h3>
      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{resource.provider}</p>

      {resource.description && (
        <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3">{resource.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge label={titleCase(resource.level)} />
        <Badge label={titleCase(resource.cost)} />
        {duration && <Badge label={duration} />}
      </div>

      {resource.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {resource.skills.slice(0, 4).map((s) => (
            <span
              key={s}
              className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
            >
              {s}
            </span>
          ))}
          {resource.skills.length > 4 && (
            <span className="text-[10px] text-[var(--muted)]">+{resource.skills.length - 4}</span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-4">
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => logActivity('start_resource', { resourceId: resource.id, source: 'open' })}
          className="btn-primary flex-1"
        >
          Open <ExternalLink size={14} />
        </a>
        {status === 'COMPLETED' ? (
          <button
            onClick={() => setProgressMut.mutate('IN_PROGRESS')}
            className="btn-ghost"
            title="Mark as in progress"
          >
            <Circle size={16} />
          </button>
        ) : status === 'IN_PROGRESS' ? (
          <button
            onClick={() => setProgressMut.mutate('COMPLETED')}
            className="btn-ghost text-[#3F6212] dark:text-[#84CC16]"
            title="Mark as completed"
          >
            <Check size={16} />
          </button>
        ) : (
          <button
            onClick={() => setProgressMut.mutate('IN_PROGRESS')}
            className="btn-ghost"
            title="Mark as in progress"
          >
            <Clock size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
      {label}
    </span>
  );
}

// =========================================================================
// Paths tab
// =========================================================================

function PathsTab({
  paths, isLoading, onOpen
}: {
  paths: Path[];
  isLoading: boolean;
  onOpen: (slug: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}
      </div>
    );
  }
  if (paths.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No learning paths yet"
        message="Curated paths show up here once an admin seeds the catalog."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {paths.map((p, i) => (
        <motion.button
          key={p.id}
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.04, 0.3) }}
          onClick={() => onOpen(p.slug)}
          className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Sparkles size={18} />
            </div>
            <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              {p.stepCount} steps
            </span>
          </div>
          <h3 className="mt-4 font-heading text-base font-bold leading-tight">{p.name}</h3>
          <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3">{p.description}</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-[#065F46] dark:text-[#84CC16]">
            View path
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </motion.button>
      ))}
    </div>
  );
}

// =========================================================================
// Path modal — full ordered steps
// =========================================================================

function PathModal({
  slug, onClose, progressByResource
}: {
  slug: string;
  onClose: () => void;
  progressByResource: Map<string, Progress>;
}) {
  const { data, isLoading } = useQuery<PathDetail>({
    queryKey: ['learning', 'paths', slug],
    queryFn: async () => (await api.get(`/learning/paths/${slug}`)).data.data
  });

  const completed = data?.steps.filter((s) => progressByResource.get(s.resource.id)?.status === 'COMPLETED').length ?? 0;
  const total = data?.steps.length ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="my-8 w-full max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-6">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Learning path
            </div>
            <h2 className="mt-1 font-heading text-2xl font-bold">{data?.name ?? 'Loading…'}</h2>
            {data && (
              <p className="mt-1 text-sm text-[var(--muted)]">{data.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-6">
          {/* Progress bar */}
          {data && (
            <div className="mb-5">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
                <span>Your progress</span>
                <span>{completed} of {total} ({pct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
                <div
                  className="h-full bg-[#065F46] dark:bg-[#84CC16] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {isLoading && <div className="skeleton h-40" />}
          {data && data.steps.length === 0 && (
            <p className="text-sm text-[var(--muted)]">This path has no steps yet.</p>
          )}
          {data && data.steps.length > 0 && (
            <ol className="space-y-3">
              {data.steps.map((step, idx) => {
                const status = progressByResource.get(step.resource.id)?.status;
                return (
                  <li
                    key={step.resource.id + idx}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                        status === 'COMPLETED'
                          ? 'bg-[#84CC16] text-[#1C1917]'
                          : 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
                      }`}>
                        {status === 'COMPLETED' ? <Check size={14} /> : idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-heading text-sm font-bold leading-tight">{step.resource.title}</h4>
                            <p className="text-xs text-[var(--muted)]">
                              {step.resource.provider} · {titleCase(step.resource.type)} · {titleCase(step.resource.level)}
                            </p>
                          </div>
                          <a
                            href={step.resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => logActivity('start_resource', {
                              resourceId: step.resource.id, source: 'path'
                            })}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
                          >
                            Open <ExternalLink size={12} />
                          </a>
                        </div>
                        {step.note && (
                          <p className="mt-2 text-sm text-[var(--fg)]">{step.note}</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// =========================================================================
// Progress tab
// =========================================================================

function ProgressTab({
  progress, allResources, progressByResource
}: {
  progress: Progress[];
  allResources: Resource[];
  progressByResource: Map<string, Progress>;
}) {
  const byId = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const r of allResources) m.set(r.id, r);
    return m;
  }, [allResources]);

  if (progress.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="You haven't tracked any resources yet"
        message="Open a resource and tap the clock icon to mark it as in progress."
      />
    );
  }

  const inProgress = progress.filter((p) => p.status === 'IN_PROGRESS');
  const completed = progress.filter((p) => p.status === 'COMPLETED');

  return (
    <div className="space-y-8">
      <ProgressGroup
        title="In progress"
        rows={inProgress}
        byId={byId}
        progressByResource={progressByResource}
      />
      <ProgressGroup
        title="Completed"
        rows={completed}
        byId={byId}
        progressByResource={progressByResource}
      />
    </div>
  );
}

function ProgressGroup({
  title, rows, byId, progressByResource
}: {
  title: string;
  rows: Progress[];
  byId: Map<string, Resource>;
  progressByResource: Map<string, Progress>;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 font-heading text-lg font-bold">
        {title} <span className="ml-1 text-sm font-medium text-[var(--muted)]">({rows.length})</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p, i) => {
          const r = byId.get(p.resourceId);
          if (!r) {
            return (
              <div key={p.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted)]">
                Resource removed.
                <div className="mt-2 text-xs">Tracked {new Date(p.updatedAt).toLocaleDateString()}</div>
              </div>
            );
          }
          return <ResourceCard key={p.id} resource={r} index={i} progress={progressByResource.get(r.id)} />;
        })}
      </div>
    </section>
  );
}

// =========================================================================
// Submit modal
// =========================================================================

function SubmitModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [form, setForm] = useState({
    title: '',
    provider: '',
    url: '',
    type: 'COURSE' as LearningType,
    level: 'BEGINNER' as LearningLevel,
    cost: 'FREE' as LearningCost,
    language: 'English',
    durationMin: '',
    description: ''
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addSkill = (raw: string) => {
    const s = raw.trim().replace(/,$/, '').trim().toLowerCase();
    if (!s || skills.includes(s)) return;
    setSkills([...skills, s]);
  };
  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You need to be signed in to submit.');
      return;
    }
    if (!form.title.trim() || !form.provider.trim() || !form.url.trim()) {
      toast.error('Title, provider, and URL are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/learning/resources', {
        title: form.title.trim(),
        provider: form.provider.trim(),
        url: form.url.trim(),
        type: form.type,
        level: form.level,
        cost: form.cost,
        language: form.language.trim() || 'English',
        durationMin: form.durationMin ? Number(form.durationMin) : null,
        skills,
        description: form.description.trim() || null
      });
      logActivity('submit_resource', { provider: form.provider });
      qc.invalidateQueries({ queryKey: ['learning', 'resources'] });
      toast.success('Submitted! An admin will review it shortly.');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onSubmit={submit}
        className="my-8 w-full max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Submit a resource
            </div>
            <h2 className="mt-1 font-heading text-2xl font-bold">Add to the learning hub</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              An admin reviews each submission before it shows up to other alumni.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <Field label="Title" className="md:col-span-2">
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required />
          </Field>
          <Field label="Provider">
            <input className="input" value={form.provider} onChange={(e) => set('provider', e.target.value)} placeholder="e.g. Coursera, MEST Africa" required />
          </Field>
          <Field label="URL">
            <input className="input" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" required />
          </Field>
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => set('type', e.target.value as LearningType)}>
              {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </Field>
          <Field label="Level">
            <select className="input" value={form.level} onChange={(e) => set('level', e.target.value as LearningLevel)}>
              {LEVELS.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}
            </select>
          </Field>
          <Field label="Cost">
            <select className="input" value={form.cost} onChange={(e) => set('cost', e.target.value as LearningCost)}>
              {COSTS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </select>
          </Field>
          <Field label="Language">
            <input className="input" value={form.language} onChange={(e) => set('language', e.target.value)} />
          </Field>
          <Field label="Duration (minutes)">
            <input className="input" type="number" min="1" value={form.durationMin} onChange={(e) => set('durationMin', e.target.value)} />
          </Field>

          <Field label="Skills" className="md:col-span-2">
            <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg)] p-2 transition-colors focus-within:border-[#065F46]">
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-3 py-1 text-sm font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                  >
                    {s}
                    <button type="button" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`} className="rounded-full hover:opacity-70">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  value={skillInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(',')) {
                      addSkill(v);
                      setSkillInput('');
                    } else {
                      setSkillInput(v);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill(skillInput);
                      setSkillInput('');
                    }
                    if (e.key === 'Backspace' && !skillInput && skills.length) {
                      removeSkill(skills[skills.length - 1]);
                    }
                  }}
                  placeholder={skills.length ? 'Add another…' : 'Type a skill, press Enter'}
                  className="min-w-[140px] flex-1 bg-transparent px-2 py-1 outline-none"
                />
              </div>
            </div>
          </Field>

          <Field label="Description" className="md:col-span-2">
            <textarea
              className="input min-h-[100px]"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="A sentence or two on what makes this worth recommending."
            />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-4 rounded-b-3xl">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Plus size={16} /> {saving ? 'Submitting…' : 'Submit for review'}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

// =========================================================================
// Shared primitives
// =========================================================================

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ icon: Icon, title, message }: { icon: typeof BookOpen; title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
        <Icon size={28} />
      </div>
      <h3 className="mt-5 font-heading text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
