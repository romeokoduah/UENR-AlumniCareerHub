// Startup Resources Hub — Phase 4 (Ventures). Replaces the placeholder at
// /career-tools/ventures/startup. Four sections, each its own filterable
// directory:
//
//   1. Pitch deck templates  (sortable: popularity / stage)
//   2. Fundraising guides    (hand-written markdown, collapsible)
//   3. Incubators & accelerators (Ghana-focused directory)
//   4. Grants & funding      (sorted by next deadline; expiring widget)
//
// Backed by /api/startup. No AI/LLM calls.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Rocket, Download, ExternalLink, MapPin, BookText,
  ChevronDown, AlertCircle, Building2, Banknote, Calendar, Search, X
} from 'lucide-react';
import { api } from '../../services/api';
import { STARTUP_GUIDES, type StartupGuide } from './startupGuides';

const TOOL_SLUG = 'ventures/startup';

// ---- types --------------------------------------------------------------

type Deck = {
  id: string;
  slug: string;
  name: string;
  description: string;
  stage: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  downloadCount: number;
  createdAt: string;
};

type Incubator = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  location: string;
  focus: string[];
  programType: string;
  applyUrl: string | null;
  isActive: boolean;
};

type Grant = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string;
  applicationUrl: string;
  nextDeadline: string | null;
  amount: string | null;
  fitCriteria: string[];
  isActive: boolean;
};

// ---- helpers ------------------------------------------------------------

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

const STAGE_LABEL: Record<string, string> = {
  seed: 'Seed',
  'series-a': 'Series A',
  grant: 'Grant',
  'investor-update': 'Investor update',
  'social-enterprise': 'Social enterprise'
};

// Stage-coloured gradient for the deck card placeholder when no thumbnail
// has been uploaded yet. Tailwind class strings live here so JIT picks them
// up at build time.
const STAGE_GRADIENT: Record<string, string> = {
  seed: 'from-[#065F46] to-[#84CC16]',
  'series-a': 'from-[#0EA5E9] to-[#6366F1]',
  grant: 'from-[#F59E0B] to-[#DC2626]',
  'investor-update': 'from-[#475569] to-[#0F172A]',
  'social-enterprise': 'from-[#10B981] to-[#0EA5E9]'
};

const PROGRAM_TYPES = ['accelerator', 'incubator', 'hub'];

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// "12 days left" / "rolling" / "passed". Returns a string + a tone hint
// the card uses to colour the chip.
function deadlineLabel(iso: string | null): { text: string; tone: 'rolling' | 'urgent' | 'soon' | 'far' | 'passed' } {
  if (!iso) return { text: 'Rolling deadline', tone: 'rolling' };
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: 'Closed', tone: 'passed' };
  if (days === 0) return { text: 'Closes today', tone: 'urgent' };
  if (days <= 14) return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: 'urgent' };
  if (days <= 45) return { text: `${days} days left`, tone: 'soon' };
  return { text: `${days} days left`, tone: 'far' };
}

// ---- data hooks ---------------------------------------------------------

function useDecks() {
  return useQuery<Deck[]>({
    queryKey: ['startup', 'decks'],
    queryFn: async () => (await api.get('/startup/decks')).data.data
  });
}

function useIncubators(filters: { programType: string; focus: string }) {
  return useQuery<Incubator[]>({
    queryKey: ['startup', 'incubators', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.programType) params.programType = filters.programType;
      if (filters.focus) params.focus = filters.focus;
      return (await api.get('/startup/incubators', { params })).data.data;
    }
  });
}

function useGrants() {
  return useQuery<Grant[]>({
    queryKey: ['startup', 'grants'],
    queryFn: async () => (await api.get('/startup/grants')).data.data
  });
}

// =========================================================================
// Page
// =========================================================================

type Tab = 'decks' | 'guides' | 'incubators' | 'grants';

export default function StartupResourcesPage() {
  const [tab, setTab] = useState<Tab>('decks');

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
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Rocket size={28} />
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — Startup Resources
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                Build a venture, on Ghanaian soil.
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Pitch decks, fundraising guides, MEST/GCIC/GIZ incubators, Tony Elumelu and other grants — curated for UENR alumni.
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex flex-wrap gap-2">
            <TabChip active={tab === 'decks'} onClick={() => setTab('decks')} label="Pitch decks" />
            <TabChip active={tab === 'guides'} onClick={() => setTab('guides')} label="Fundraising guides" />
            <TabChip active={tab === 'incubators'} onClick={() => setTab('incubators')} label="Incubators" />
            <TabChip active={tab === 'grants'} onClick={() => setTab('grants')} label="Grants" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {tab === 'decks' && <DecksTab />}
        {tab === 'guides' && <GuidesTab />}
        {tab === 'incubators' && <IncubatorsTab />}
        {tab === 'grants' && <GrantsTab />}
      </section>
    </div>
  );
}

// =========================================================================
// 1. Pitch deck templates
// =========================================================================

type DeckSort = 'popularity' | 'stage';

function DecksTab() {
  const { data: decks = [], isLoading } = useDecks();
  const [sort, setSort] = useState<DeckSort>('popularity');
  const [stageFilter, setStageFilter] = useState<string>('');

  const stages = useMemo(
    () => Array.from(new Set(decks.map((d) => d.stage))).sort(),
    [decks]
  );

  const visible = useMemo(() => {
    let list = decks.slice();
    if (stageFilter) list = list.filter((d) => d.stage === stageFilter);
    if (sort === 'popularity') {
      list.sort((a, b) => b.downloadCount - a.downloadCount || a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => a.stage.localeCompare(b.stage) || a.name.localeCompare(b.name));
    }
    return list;
  }, [decks, sort, stageFilter]);

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Stage</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!stageFilter} onClick={() => setStageFilter('')} label="All" />
            {stages.map((s) => (
              <Chip
                key={s}
                active={stageFilter === s}
                onClick={() => setStageFilter(s)}
                label={STAGE_LABEL[s] ?? titleCase(s)}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Sort by</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={sort === 'popularity'} onClick={() => setSort('popularity')} label="Most downloaded" />
            <Chip active={sort === 'stage'} onClick={() => setSort('stage')} label="Stage" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-72" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No decks match that filter"
          message="Try clearing the stage filter — or check back after the admin uploads more templates."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((d, i) => <DeckCard key={d.id} deck={d} index={i} />)}
        </div>
      )}
    </div>
  );
}

function DeckCard({ deck, index }: { deck: Deck; index: number }) {
  const stageLabel = STAGE_LABEL[deck.stage] ?? titleCase(deck.stage);
  const gradient = STAGE_GRADIENT[deck.stage] ?? 'from-[#065F46] to-[#84CC16]';
  const hasFile = Boolean(deck.fileUrl);

  // Best-effort counter bump + redirect. We rely on the link's own download
  // semantics; the API call is fire-and-forget.
  const onDownload = () => {
    if (!hasFile) return;
    api
      .post(`/startup/decks/${deck.id}/download`)
      .catch(() => {});
    logActivity('download_deck', { deckId: deck.id, slug: deck.slug, stage: deck.stage });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      {/* Thumbnail / gradient header */}
      <div
        className={`relative h-28 w-full bg-gradient-to-br ${gradient} ${deck.thumbnailUrl ? '' : 'flex items-center justify-center'}`}
      >
        {deck.thumbnailUrl ? (
          <img
            src={deck.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Rocket size={36} className="text-white/80" aria-hidden />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
          {stageLabel}
        </span>
        {deck.downloadCount > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
            {deck.downloadCount} download{deck.downloadCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-heading text-base font-bold leading-tight">{deck.name}</h3>
        <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3">{deck.description}</p>

        <div className="mt-auto pt-4">
          {hasFile ? (
            <a
              href={deck.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              onClick={onDownload}
              className="btn-primary w-full"
            >
              <Download size={16} /> Download
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-center text-xs text-[var(--muted)]">
              File not yet uploaded
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =========================================================================
// 2. Fundraising guides
// =========================================================================

function GuidesTab() {
  const [openSlug, setOpenSlug] = useState<string | null>(STARTUP_GUIDES[0]?.slug ?? null);
  return (
    <div className="space-y-3">
      {STARTUP_GUIDES.map((g, i) => (
        <GuideSection
          key={g.slug}
          guide={g}
          index={i}
          isOpen={openSlug === g.slug}
          onToggle={() => setOpenSlug(openSlug === g.slug ? null : g.slug)}
        />
      ))}
    </div>
  );
}

function GuideSection({
  guide, index, isOpen, onToggle
}: {
  guide: StartupGuide;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--bg)]"
        aria-expanded={isOpen}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <BookText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold leading-snug">{guide.title}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{guide.summary}</p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[var(--muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-[var(--border)] px-5 py-5"
          >
            <GuideBody body={guide.body} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Tiny markdown subset shared with salaryPlaybooks: blank-line paragraphs,
// "- " bullets, "> " block quotes. Kept in-page to avoid a new dep.
function GuideBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--fg)]">
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-[#84CC16]">
              {lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => l.startsWith('> '))) {
          return (
            <blockquote
              key={i}
              className="border-l-4 border-[#065F46] bg-[#065F46]/5 px-4 py-2 italic text-[var(--fg)] dark:border-[#84CC16] dark:bg-[#84CC16]/10"
            >
              {lines.map((l) => l.slice(2)).join(' ')}
            </blockquote>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

// =========================================================================
// 3. Incubators & accelerators
// =========================================================================

function IncubatorsTab() {
  const [programType, setProgramType] = useState('');
  const [focusInput, setFocusInput] = useState('');
  const [focus, setFocus] = useState('');

  // Server-side filter when a program-type chip is active. The free-text
  // focus filter is debounced via the controlled `focus` state.
  const { data: items = [], isLoading } = useIncubators({ programType, focus });

  // Submit focus on Enter / blur so we don't fire a request per keystroke.
  const onFocusKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); setFocus(focusInput.trim()); }
  };

  const anyFilter = Boolean(programType || focus);
  const clear = () => { setProgramType(''); setFocus(''); setFocusInput(''); };

  return (
    <div>
      <div className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Program type</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!programType} onClick={() => setProgramType('')} label="All" />
            {PROGRAM_TYPES.map((p) => (
              <Chip
                key={p}
                active={programType === p}
                onClick={() => setProgramType(p)}
                label={titleCase(p)}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Focus area</div>
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={focusInput}
              onChange={(e) => setFocusInput(e.target.value)}
              onKeyDown={onFocusKey}
              onBlur={() => setFocus(focusInput.trim())}
              placeholder="e.g. cleantech, agritech, social enterprise…"
              className="input w-full pl-9"
            />
          </label>
          {focus && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Filtering by focus tag: <span className="font-semibold text-[var(--fg)]">{focus}</span>
            </p>
          )}
        </div>
        {anyFilter && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
          >
            <X size={12} /> Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-52" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No incubators match those filters"
          message="Try clearing the program type or focus area filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => <IncubatorCard key={it.id} item={it} index={i} />)}
        </div>
      )}
    </div>
  );
}

function IncubatorCard({ item, index }: { item: Incubator; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Building2 size={18} />
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {titleCase(item.programType)}
        </span>
      </div>
      <h3 className="mt-4 font-heading text-base font-bold leading-tight">{item.name}</h3>
      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)]">
        <MapPin size={12} /> {item.location}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3">{item.description}</p>

      {item.focus.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {item.focus.slice(0, 4).map((f) => (
            <span
              key={f}
              className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
            >
              {f}
            </span>
          ))}
          {item.focus.length > 4 && (
            <span className="text-[10px] text-[var(--muted)]">+{item.focus.length - 4}</span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-4">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => logActivity('view_incubator', { slug: item.slug })}
          className="btn-primary flex-1"
        >
          Visit <ExternalLink size={14} />
        </a>
        {item.applyUrl && (
          <a
            href={item.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logActivity('view_incubator', { slug: item.slug, source: 'apply' })}
            className="btn-ghost text-sm"
          >
            Apply
          </a>
        )}
      </div>
    </motion.div>
  );
}

// =========================================================================
// 4. Grants & funding
// =========================================================================

function GrantsTab() {
  const { data: grants = [], isLoading } = useGrants();

  // The widget at the top: anything with a deadline within 30 days that
  // hasn't already passed.
  const expiringSoon = useMemo(() => {
    const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return grants.filter((g) => {
      if (!g.nextDeadline) return false;
      const t = new Date(g.nextDeadline).getTime();
      return t >= now && t <= cutoff;
    });
  }, [grants]);

  return (
    <div className="space-y-6">
      {/* Expiring widget */}
      {!isLoading && expiringSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 p-5"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-[#F59E0B]" />
            <h2 className="font-heading text-base font-bold">
              {expiringSoon.length} grant{expiringSoon.length === 1 ? '' : 's'} closing within 30 days
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Don&apos;t leave these to the last weekend.
          </p>
          <ul className="mt-3 space-y-1.5">
            {expiringSoon.map((g) => {
              const dl = deadlineLabel(g.nextDeadline);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-[var(--fg)]">{g.name}</span>
                  <span className="text-[var(--muted)]">— {g.provider}</span>
                  <span className="ml-auto rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
                    {dl.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-56" />)}
        </div>
      ) : grants.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No grants to show yet"
          message="Curated grants show up here once an admin runs the seed."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grants.map((g, i) => <GrantCard key={g.id} grant={g} index={i} />)}
        </div>
      )}
    </div>
  );
}

function GrantCard({ grant, index }: { grant: Grant; index: number }) {
  const dl = deadlineLabel(grant.nextDeadline);
  const toneClass =
    dl.tone === 'urgent'
      ? 'bg-[#DC2626]/15 text-[#7F1D1D] dark:text-[#FCA5A5]'
      : dl.tone === 'soon'
        ? 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]'
        : dl.tone === 'rolling'
          ? 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
          : dl.tone === 'passed'
            ? 'bg-[var(--bg)] text-[var(--muted)]'
            : 'bg-[var(--bg)] text-[var(--muted)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Banknote size={18} />
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneClass}`}>
          <Calendar size={10} /> {dl.text}
        </span>
      </div>

      <h3 className="mt-4 font-heading text-base font-bold leading-tight">{grant.name}</h3>
      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{grant.provider}</p>

      {grant.amount && (
        <span className="mt-2 inline-block self-start rounded-full bg-[#84CC16]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3F6212] dark:text-[#84CC16]">
          {grant.amount}
        </span>
      )}

      <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3">{grant.description}</p>

      {grant.fitCriteria.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {grant.fitCriteria.slice(0, 4).map((f) => (
            <span
              key={f}
              className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]"
            >
              {f}
            </span>
          ))}
          {grant.fitCriteria.length > 4 && (
            <span className="text-[10px] text-[var(--muted)]">+{grant.fitCriteria.length - 4}</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-4">
        <a
          href={grant.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => logActivity('view_grant', { slug: grant.slug })}
          className="btn-primary w-full"
        >
          Apply <ExternalLink size={14} />
        </a>
      </div>
    </motion.div>
  );
}

// =========================================================================
// Shared primitives
// =========================================================================

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

function EmptyState({ icon: Icon, title, message }: { icon: typeof Rocket; title: string; message: string }) {
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
