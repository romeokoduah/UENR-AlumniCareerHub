// Interview Question Bank — searchable bank of behavioral / technical /
// domain / case / situational interview questions, with sample answers,
// community voting, flagging, submission flow, and a self-record practice
// mode that can save audio answers straight to the Document Vault.
//
// Backed by /api/interview-questions. No AI/LLM calls.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, MessageSquare, Plus, X, Search, Filter, ThumbsUp, Flag,
  Mic, Square, Play, Save, RefreshCw, Loader2, ChevronDown, ChevronUp,
  Briefcase, Building2, Sparkles, AlertCircle, Tag, Timer
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

const TOOL_SLUG = 'interview-questions';

// ---- types --------------------------------------------------------------

type Category = 'BEHAVIORAL' | 'TECHNICAL' | 'DOMAIN' | 'CASE' | 'SITUATIONAL';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

type Question = {
  id: string;
  prompt: string;
  guidance: string | null;
  sampleAnswer: string | null;
  category: Category;
  difficulty: Difficulty;
  roleSlug: string | null;
  industry: string | null;
  tags: string[];
  upvotes: number;
  flagCount: number;
  isApproved: boolean;
  createdAt: string;
  votedByMe?: boolean;
};

type ListResponse = {
  items: Question[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  hasMore: boolean;
};

type Role = {
  id: string;
  slug: string;
  name: string;
  category: string;
};

// ---- constants ----------------------------------------------------------

const CATEGORIES: Category[] = ['BEHAVIORAL', 'TECHNICAL', 'DOMAIN', 'CASE', 'SITUATIONAL'];
const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

const TIMER_OPTIONS = [30, 60, 90, 120] as const;
type TimerSeconds = (typeof TIMER_OPTIONS)[number];

const PAGE_SIZE = 12;

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

// ---- filter state -------------------------------------------------------

type Filters = {
  category: Category | '';
  difficulty: Difficulty | '';
  roleSlug: string;
  industry: string;
  q: string;
};

const emptyFilters: Filters = {
  category: '',
  difficulty: '',
  roleSlug: '',
  industry: '',
  q: ''
};

// =========================================================================
// Page
// =========================================================================

export default function InterviewQuestionBankPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<Question[]>([]);
  const [openQuestion, setOpenQuestion] = useState<Question | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);

  // ---- data --------------------------------------------------------------

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['skills', 'roles'],
    queryFn: async () => (await api.get('/skills/roles')).data.data
  });

  const { data, isLoading, isFetching } = useQuery<ListResponse>({
    queryKey: ['interview-questions', filters, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (filters.category) params.category = filters.category;
      if (filters.difficulty) params.difficulty = filters.difficulty;
      if (filters.roleSlug) params.roleSlug = filters.roleSlug;
      if (filters.industry) params.industry = filters.industry;
      if (filters.q.trim()) params.q = filters.q.trim();
      return (await api.get('/interview-questions', { params })).data.data;
    },
    placeholderData: keepPreviousData
  });

  // Accumulate paginated pages into one growing list (load-more pattern).
  // On filter change we reset to page 1 and clear the buffer so users don't
  // see stale results bleeding into a freshly filtered set.
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [filters.category, filters.difficulty, filters.roleSlug, filters.industry, filters.q]);

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => {
      if (page === 1) return data.items;
      // Dedupe by id in case a vote/flag bumped order between fetches.
      const seen = new Set(prev.map((q) => q.id));
      return [...prev, ...data.items.filter((q) => !seen.has(q.id))];
    });
  }, [data, page]);

  useEffect(() => { logActivity('open'); }, []);

  // ---- derived -----------------------------------------------------------

  const industries = useMemo(() => {
    // Cheap, derived from the current accumulated set so admins can pick
    // them as they appear in the data without any extra endpoint.
    const set = new Set<string>();
    for (const q of accumulated) if (q.industry) set.add(q.industry);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accumulated]);

  const anyFilter =
    filters.category || filters.difficulty || filters.roleSlug || filters.industry || filters.q;

  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

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
                <MessageSquare size={28} />
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                  — Interview Question Bank
                </div>
                <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                  Practice the questions that get asked.
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Behavioral, technical, domain, case, and situational prompts — with sample answers and a self-record practice mode.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPracticeOpen(true)} className="btn-primary">
                <Mic size={16} /> Practice mode
              </button>
              <button onClick={() => setSubmitOpen(true)} className="btn-ghost border border-[var(--border)]">
                <Plus size={16} /> Submit a question
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {/* Filter card */}
        <FilterCard
          filters={filters}
          setFilters={setFilters}
          roles={roles}
          industries={industries}
          anyFilter={!!anyFilter}
          total={total}
        />

        {/* Results */}
        {isLoading && page === 1 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-44" />)}
          </div>
        ) : accumulated.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No questions match those filters"
            message="Try clearing some filters or be the first to submit a question."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {accumulated.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  onOpen={() => {
                    setOpenQuestion(q);
                    logActivity('open_question', { questionId: q.id });
                  }}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isFetching}
                  className="btn-ghost border border-[var(--border)]"
                >
                  {isFetching ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <AnimatePresence>
        {openQuestion && (
          <QuestionDetailModal
            question={openQuestion}
            onClose={() => setOpenQuestion(null)}
          />
        )}
        {submitOpen && (
          <SubmitModal
            roles={roles}
            onClose={() => setSubmitOpen(false)}
          />
        )}
        {practiceOpen && (
          <PracticeOverlay
            filters={filters}
            onClose={() => setPracticeOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =========================================================================
// Filter card
// =========================================================================

function FilterCard({
  filters, setFilters, roles, industries, anyFilter, total
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  roles: Role[];
  industries: string[];
  anyFilter: boolean;
  total: number;
}) {
  const setField = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters({ ...filters, [k]: v });

  return (
    <div className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      {/* Search */}
      <label className="relative block">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={filters.q}
          onChange={(e) => setField('q', e.target.value)}
          placeholder="Search prompts, guidance, tags…"
          className="input w-full pl-9"
        />
      </label>

      {/* Category chips */}
      <ChipRow
        label="Category"
        values={CATEGORIES}
        active={filters.category}
        onChange={(v) => setField('category', v as Category | '')}
      />
      {/* Difficulty chips */}
      <ChipRow
        label="Difficulty"
        values={DIFFICULTIES}
        active={filters.difficulty}
        onChange={(v) => setField('difficulty', v as Difficulty | '')}
      />

      {/* Role + industry dropdowns */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Target role</span>
          <select
            value={filters.roleSlug}
            onChange={(e) => setField('roleSlug', e.target.value)}
            className="input"
          >
            <option value="">Any role</option>
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Industry</span>
          <select
            value={filters.industry}
            onChange={(e) => setField('industry', e.target.value)}
            className="input"
          >
            <option value="">Any industry</option>
            {industries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <Filter size={12} /> {total} question{total === 1 ? '' : 's'}
        </div>
        {anyFilter && (
          <button
            onClick={() => setFilters(emptyFilters)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
          >
            <X size={12} /> Clear filters
          </button>
        )}
      </div>
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

// =========================================================================
// Question card
// =========================================================================

const CATEGORY_TONE: Record<Category, string> = {
  BEHAVIORAL: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  TECHNICAL: 'bg-[#1D4ED8]/10 text-[#1D4ED8] dark:bg-[#60A5FA]/15 dark:text-[#60A5FA]',
  DOMAIN: 'bg-[#9333EA]/10 text-[#9333EA] dark:bg-[#C084FC]/15 dark:text-[#C084FC]',
  CASE: 'bg-[#EA580C]/10 text-[#EA580C] dark:bg-[#FB923C]/15 dark:text-[#FB923C]',
  SITUATIONAL: 'bg-[#0F766E]/10 text-[#0F766E] dark:bg-[#5EEAD4]/15 dark:text-[#5EEAD4]'
};

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  EASY: 'bg-[#84CC16]/15 text-[#3F6212] dark:text-[#84CC16]',
  MEDIUM: 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]',
  HARD: 'bg-[#EF4444]/15 text-[#991B1B] dark:text-[#FCA5A5]'
};

function QuestionCard({
  question, index, onOpen
}: {
  question: Question;
  index: number;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  // Optimistic local mirror so the UI feels instant — the cache is the
  // source of truth, but we also reflect the response on the open detail
  // modal via the same record.
  const [voteState, setVoteState] = useState({
    voted: !!question.votedByMe,
    upvotes: question.upvotes
  });
  const [flagged, setFlagged] = useState(false);

  // If a refetch updates the underlying question (e.g. from another card's
  // mutation), keep our local mirror in sync.
  useEffect(() => {
    setVoteState({ voted: !!question.votedByMe, upvotes: question.upvotes });
  }, [question.votedByMe, question.upvotes]);

  const voteMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/interview-questions/${question.id}/vote`)).data.data as { voted: boolean; upvotes: number },
    onMutate: () => {
      setVoteState((s) => ({
        voted: !s.voted,
        upvotes: s.voted ? Math.max(0, s.upvotes - 1) : s.upvotes + 1
      }));
    },
    onSuccess: (data) => {
      setVoteState(data);
      logActivity('vote', { questionId: question.id, voted: data.voted });
      qc.invalidateQueries({ queryKey: ['interview-questions'] });
    },
    onError: (_err, _v, _ctx) => {
      // Revert optimistic update.
      setVoteState({ voted: !!question.votedByMe, upvotes: question.upvotes });
      toast.error('Could not save your vote');
    }
  });

  const flagMut = useMutation({
    mutationFn: async () => (await api.post(`/interview-questions/${question.id}/flag`)).data.data,
    onSuccess: () => {
      setFlagged(true);
      logActivity('flag', { questionId: question.id });
      toast.success('Reported. An admin will review.');
    },
    onError: () => toast.error('Could not submit report')
  });

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_TONE[question.category]}`}>
          {titleCase(question.category)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${DIFFICULTY_TONE[question.difficulty]}`}>
          {titleCase(question.difficulty)}
        </span>
        {question.roleSlug && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            <Briefcase size={10} /> {question.roleSlug}
          </span>
        )}
        {question.industry && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            <Building2 size={10} /> {question.industry}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 text-left"
      >
        <h3 className="font-heading text-base font-bold leading-snug hover:text-[#065F46] dark:hover:text-[#84CC16]">
          {truncate(question.prompt, 200)}
        </h3>
      </button>

      {question.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {question.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
            >
              <Tag size={9} /> {t}
            </span>
          ))}
          {question.tags.length > 5 && (
            <span className="text-[10px] text-[var(--muted)]">+{question.tags.length - 5}</span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <button
          type="button"
          onClick={() => voteMut.mutate()}
          disabled={voteMut.isPending}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
            voteState.voted
              ? 'border-[#065F46] bg-[#065F46] text-white'
              : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
          }`}
          aria-pressed={voteState.voted}
          title={voteState.voted ? 'Remove your upvote' : 'Upvote this question'}
        >
          <ThumbsUp size={12} />
          {voteState.upvotes}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
          >
            View details
          </button>
          <button
            type="button"
            onClick={() => !flagged && flagMut.mutate()}
            disabled={flagged || flagMut.isPending}
            className={`rounded-full p-1.5 transition-all ${
              flagged
                ? 'text-[var(--muted)]'
                : 'text-[var(--muted)] hover:bg-black/5 hover:text-[#EF4444] dark:hover:bg-white/5'
            }`}
            title={flagged ? 'Reported' : 'Report this question'}
            aria-label="Report"
          >
            <Flag size={14} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

// =========================================================================
// Question detail modal
// =========================================================================

function QuestionDetailModal({ question, onClose }: { question: Question; onClose: () => void }) {
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_TONE[question.category]}`}>
                {titleCase(question.category)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${DIFFICULTY_TONE[question.difficulty]}`}>
                {titleCase(question.difficulty)}
              </span>
            </div>
            <h2 className="mt-3 font-heading text-xl font-bold leading-snug">{question.prompt}</h2>
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

        <div className="space-y-6 p-6">
          {question.guidance && (
            <Section title="Guidance" icon={Sparkles}>
              <p className="text-sm leading-relaxed">{question.guidance}</p>
            </Section>
          )}

          {question.sampleAnswer ? (
            <Section title="Sample answer structure" icon={MessageSquare}>
              {/* Render whitespace-preserved so bullet structure stays intact
                 without pulling in a markdown lib. */}
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[var(--fg)]">
                {question.sampleAnswer}
              </pre>
            </Section>
          ) : (
            <Section title="Sample answer structure" icon={MessageSquare}>
              <p className="text-sm text-[var(--muted)]">No sample answer provided yet.</p>
            </Section>
          )}

          {question.tags.length > 0 && (
            <Section title="Tags" icon={Tag}>
              <div className="flex flex-wrap gap-1.5">
                {question.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <Section title="Community notes" icon={MessageSquare}>
            <p className="text-sm text-[var(--muted)]">Community notes coming soon.</p>
          </Section>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof MessageSquare; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        <Icon size={12} /> {title}
      </div>
      {children}
    </section>
  );
}

// =========================================================================
// Submit modal
// =========================================================================

function SubmitModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [form, setForm] = useState({
    prompt: '',
    guidance: '',
    sampleAnswer: '',
    category: 'BEHAVIORAL' as Category,
    difficulty: 'MEDIUM' as Difficulty,
    roleSlug: '',
    industry: ''
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, '').trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You need to be signed in to submit.');
      return;
    }
    if (form.prompt.trim().length < 8) {
      toast.error('Prompt must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/interview-questions', {
        prompt: form.prompt.trim(),
        guidance: form.guidance.trim() || null,
        sampleAnswer: form.sampleAnswer.trim() || null,
        category: form.category,
        difficulty: form.difficulty,
        roleSlug: form.roleSlug || null,
        industry: form.industry.trim() || null,
        tags
      });
      logActivity('submit', { category: form.category });
      qc.invalidateQueries({ queryKey: ['interview-questions'] });
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
              Submit a question
            </div>
            <h2 className="mt-1 font-heading text-2xl font-bold">Add to the bank</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              An admin reviews each submission before other alumni see it.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <Field label="Prompt" className="md:col-span-2">
            <textarea
              className="input min-h-[80px]"
              value={form.prompt}
              onChange={(e) => set('prompt', e.target.value)}
              placeholder="The exact question, as a candidate would hear it."
              required
              minLength={8}
              maxLength={1000}
            />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => set('category', e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </select>
          </Field>
          <Field label="Difficulty">
            <select className="input" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
            </select>
          </Field>
          <Field label="Target role (optional)">
            <select className="input" value={form.roleSlug} onChange={(e) => set('roleSlug', e.target.value)}>
              <option value="">Any role</option>
              {roles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Industry (optional)">
            <input
              className="input"
              value={form.industry}
              onChange={(e) => set('industry', e.target.value)}
              placeholder="e.g. Renewable Energy, Mining"
              maxLength={120}
            />
          </Field>

          <Field label="Guidance (optional)" className="md:col-span-2">
            <textarea
              className="input min-h-[70px]"
              value={form.guidance}
              onChange={(e) => set('guidance', e.target.value)}
              placeholder="One or two sentences on what a great answer signals."
              maxLength={2000}
            />
          </Field>

          <Field label="Sample answer structure (optional)" className="md:col-span-2">
            <textarea
              className="input min-h-[140px] font-mono text-sm"
              value={form.sampleAnswer}
              onChange={(e) => set('sampleAnswer', e.target.value)}
              placeholder={'- Bullet 1\n- Bullet 2\n- Bullet 3'}
              maxLength={8000}
            />
          </Field>

          <Field label="Tags" className="md:col-span-2">
            <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg)] p-2 transition-colors focus-within:border-[#065F46]">
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-3 py-1 text-sm font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                  >
                    {t}
                    <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`} className="rounded-full hover:opacity-70">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(',')) {
                      addTag(v);
                      setTagInput('');
                    } else {
                      setTagInput(v);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(tagInput);
                      setTagInput('');
                    }
                    if (e.key === 'Backspace' && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  placeholder={tags.length ? 'Add another…' : 'Type a tag, press Enter'}
                  className="min-w-[140px] flex-1 bg-transparent px-2 py-1 outline-none"
                />
              </div>
            </div>
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
// Practice overlay
// =========================================================================

type PracticeStatus =
  | 'idle'         // showing the question, ready to record
  | 'recording'    // mic is hot
  | 'recorded'     // we have an audio blob to review
  | 'saving';

function PracticeOverlay({ filters, onClose }: { filters: Filters; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);

  const [seconds, setSeconds] = useState<TimerSeconds>(60);
  const [remaining, setRemaining] = useState<number>(60);
  const [status, setStatus] = useState<PracticeStatus>('idle');
  const [picked, setPicked] = useState<Question | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingPick, setLoadingPick] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);

  // Pick a random question matching current filters. We grab a wide page,
  // then pick locally — keeps the server endpoint simple.
  const pickRandom = async () => {
    setLoadingPick(true);
    setPickError(null);
    try {
      const params: Record<string, string | number> = { page: 1, limit: 50 };
      if (filters.category) params.category = filters.category;
      if (filters.difficulty) params.difficulty = filters.difficulty;
      if (filters.roleSlug) params.roleSlug = filters.roleSlug;
      if (filters.industry) params.industry = filters.industry;
      if (filters.q.trim()) params.q = filters.q.trim();
      const data: ListResponse = (await api.get('/interview-questions', { params })).data.data;
      if (!data.items.length) {
        setPicked(null);
        setPickError('No questions match your current filters.');
        return;
      }
      const next = data.items[Math.floor(Math.random() * data.items.length)];
      setPicked(next);
      setRemaining(seconds);
      logActivity('practice_start', { questionId: next.id, seconds });
    } catch (e: any) {
      setPickError(e?.response?.data?.error?.message || 'Could not load questions');
    } finally {
      setLoadingPick(false);
    }
  };

  useEffect(() => {
    pickRandom();
    return () => {
      stopTick();
      stopStream();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the visible countdown whenever the user changes the timer length
  // — but only while we're idle, so a mid-recording timer change would be
  // ignored as a footgun.
  useEffect(() => {
    if (status === 'idle') setRemaining(seconds);
  }, [seconds, status]);

  const stopTick = () => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!('MediaRecorder' in window)) {
      toast.error('Your browser does not support audio recording.');
      return;
    }
    try {
      // Reset any prior recording artifacts before starting a new one.
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setAudioBlob(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStatus('recorded');
        stopStream();
        stopTick();
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus('recording');
      setRemaining(seconds);
      tickRef.current = window.setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            // Auto-stop at zero. We schedule the actual stop on the next
            // tick so React's batching doesn't fight the recorder.
            window.setTimeout(() => stopRecording(), 0);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    stopTick();
  };

  const tryAnother = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setStatus('idle');
    pickRandom();
  };

  const saveToVault = async () => {
    if (!audioBlob || !picked) return;
    if (!user) {
      toast.error('You need to be signed in to save.');
      return;
    }
    setStatus('saving');
    try {
      const ext = audioBlob.type.includes('ogg') ? 'ogg'
        : audioBlob.type.includes('mp4') ? 'm4a'
        : 'webm';
      const filename = `practice-${Date.now()}.${ext}`;
      const fd = new FormData();
      fd.append('file', audioBlob, filename);
      fd.append('category', 'OTHER');
      fd.append('notes', `Practice answer: ${truncate(picked.prompt, 200)}`);
      await api.post('/vault/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      logActivity('practice_complete', { questionId: picked.id, savedToVault: true, seconds });
      toast.success('Saved to your Document Vault.');
      // Land back on the next question after a successful save.
      tryAnother();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not save to vault');
      setStatus('recorded');
    }
  };

  const onCloseOverlay = () => {
    stopTick();
    stopStream();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* swallow */ }
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    onClose();
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const pct = seconds > 0 ? Math.max(0, Math.min(100, (remaining / seconds) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 240, damping: 26 }}
        className="flex w-full flex-col bg-[var(--bg)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Mic size={18} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                Practice mode
              </div>
              <div className="font-heading text-base font-bold">Self-record an answer</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseOverlay}
            className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close practice mode"
          >
            <X size={18} />
          </button>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
          {/* Timer length picker */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--muted)]">
              <Timer size={12} className="mr-1 inline" />
              Timer
            </span>
            {TIMER_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeconds(s)}
                disabled={status === 'recording'}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all disabled:opacity-50 ${
                  seconds === s
                    ? 'border-[#065F46] bg-[#065F46] text-white'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
                }`}
              >
                {s}s
              </button>
            ))}
          </div>

          {/* Question */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            {loadingPick ? (
              <div className="flex items-center justify-center py-10 text-sm text-[var(--muted)]">
                <Loader2 size={16} className="mr-2 animate-spin" /> Picking a question…
              </div>
            ) : pickError ? (
              <div className="flex items-start gap-3 text-sm">
                <AlertCircle size={18} className="mt-0.5 text-[#EF4444]" />
                <div>
                  <div className="font-semibold">{pickError}</div>
                  <button onClick={tryAnother} className="mt-2 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]">
                    Try again
                  </button>
                </div>
              </div>
            ) : picked ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_TONE[picked.category]}`}>
                    {titleCase(picked.category)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${DIFFICULTY_TONE[picked.difficulty]}`}>
                    {titleCase(picked.difficulty)}
                  </span>
                  {picked.roleSlug && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                      <Briefcase size={10} /> {picked.roleSlug}
                    </span>
                  )}
                </div>
                <h3 className="mt-3 font-heading text-2xl font-bold leading-snug">{picked.prompt}</h3>
                {picked.guidance && (
                  <p className="mt-3 text-sm text-[var(--muted)]">{picked.guidance}</p>
                )}
              </>
            ) : null}
          </div>

          {/* Timer + recorder controls */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-3xl font-bold tabular-nums">
                {mm}:{ss}
              </div>
              {status === 'recording' && (
                <span className="inline-flex items-center gap-2 rounded-full bg-[#EF4444]/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#EF4444]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#EF4444]" />
                  Recording
                </span>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
              <div
                className="h-full bg-[#065F46] transition-all dark:bg-[#84CC16]"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {status === 'idle' && (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={!picked}
                  className="btn-primary"
                >
                  <Mic size={16} /> Start recording
                </button>
              )}
              {status === 'recording' && (
                <button type="button" onClick={stopRecording} className="btn-primary bg-[#EF4444] hover:bg-[#DC2626]">
                  <Square size={16} /> Stop
                </button>
              )}
              {status === 'recorded' && audioUrl && (
                <>
                  <audio src={audioUrl} controls className="max-w-full" />
                  <button type="button" onClick={saveToVault} className="btn-primary">
                    <Save size={16} /> Save to Vault
                  </button>
                  <button type="button" onClick={startRecording} className="btn-ghost border border-[var(--border)]">
                    <Play size={16} /> Re-record
                  </button>
                </>
              )}
              {status === 'saving' && (
                <span className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Loader2 size={16} className="animate-spin" /> Saving…
                </span>
              )}
              <button
                type="button"
                onClick={tryAnother}
                disabled={status === 'recording' || status === 'saving'}
                className="btn-ghost border border-[var(--border)] disabled:opacity-50"
              >
                <RefreshCw size={16} /> Try another
              </button>
            </div>

            <p className="mt-4 text-xs text-[var(--muted)]">
              Audio is stored only in your browser until you save it. Saving uploads the recording to your Document Vault as a private file.
            </p>
          </div>
        </div>
      </motion.div>
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

function EmptyState({ icon: Icon, title, message }: { icon: typeof MessageSquare; title: string; message: string }) {
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

// Re-export the icon used in some chip props so a future code-splitter
// doesn't yank it without warning.
export { ChevronUp };
