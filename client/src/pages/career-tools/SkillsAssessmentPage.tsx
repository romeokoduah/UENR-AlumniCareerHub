// Skills Assessment & Gap Analysis — three-step flow:
//
//   1. Pick a target RoleProfile (grouped by category).
//   2. Self-rate each required + preferred skill 1-5 with a 0 ("don't know")
//      escape hatch. Progress bar tracks how many of N skills have a rating.
//   3. Results — readiness % (computed server-side), top 5 skill gaps as a
//      hand-rendered bar chart, learning resource suggestions for each gap,
//      and a history view of prior attempts at the same role so progress is
//      visible over time.
//
// All scoring is deterministic: required×1.0 + preferred×0.5, normalised
// to 0-100. No AI calls anywhere on this page.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Target, ArrowRight, Save, RotateCcw, TrendingUp,
  CheckCircle2, AlertCircle, BookOpen, ExternalLink, Layers,
  ChevronRight, Trophy, Sparkles, HelpCircle
} from 'lucide-react';
import { api } from '../../services/api';

const TOOL_SLUG = 'skills';

// ----- Types ---------------------------------------------------------------

type RoleProfile = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  requiredSkills: string[];
  preferredSkills: string[];
};

type ResolvedSkill = { name: string; category: string; synonyms: string[] };

type RoleDetail = RoleProfile & {
  resolvedRequired: ResolvedSkill[];
  resolvedPreferred: ResolvedSkill[];
};

type Assessment = {
  id: string;
  userId: string;
  roleSlug: string;
  ratings: Record<string, number>;
  readiness: number;
  completedAt: string;
};

type LearningResource = {
  id: string;
  title: string;
  provider: string;
  url: string;
  type: string;
  level: string;
  cost: string;
  durationMin: number | null;
};

type Step = 'pick-role' | 'rate' | 'results';

// ----- Helpers -------------------------------------------------------------

const logActivity = (action: string, metadata?: Record<string, unknown>) =>
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});

const CATEGORY_LABELS: Record<string, string> = {
  engineering: 'Engineering',
  energy: 'Energy',
  data: 'Software & Data',
  business: 'Business & Policy'
};

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  engineering: 'Engineering',
  energy: 'Energy',
  data: 'Data / Software',
  business: 'Business',
  soft: 'Soft skills',
  tools: 'Tools',
  other: 'Other'
};

function readinessTone(readiness: number): { label: string; color: string; ring: string } {
  if (readiness >= 80) return { label: 'Strong fit', color: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500' };
  if (readiness >= 60) return { label: 'Solid base', color: 'text-[#84CC16]', ring: 'ring-[#84CC16]' };
  if (readiness >= 40) return { label: 'Some gaps', color: 'text-[#F59E0B]', ring: 'ring-[#F59E0B]' };
  return { label: 'Big gaps to close', color: 'text-[#FB7185]', ring: 'ring-[#FB7185]' };
}

// Compute readiness client-side for the live preview before saving. The
// server recomputes from the canonical formula on POST so a client tweak
// can never inflate the saved score.
function computeReadinessLocal(
  required: string[],
  preferred: string[],
  ratings: Record<string, number>
): number {
  let score = 0;
  let max = 0;
  for (const s of required) {
    const r = ratings[s];
    const v = typeof r === 'number' && r > 0 ? Math.min(5, Math.max(1, r)) : 1;
    score += v;
    max += 5;
  }
  for (const s of preferred) {
    const r = ratings[s];
    const v = typeof r === 'number' && r > 0 ? Math.min(5, Math.max(1, r)) : 1;
    score += v * 0.5;
    max += 2.5;
  }
  return max === 0 ? 0 : Math.round((score / max) * 100);
}

// ===========================================================================

export default function SkillsAssessmentPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('pick-role');
  const [activeRoleSlug, setActiveRoleSlug] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [savedAssessment, setSavedAssessment] = useState<Assessment | null>(null);

  // One-shot open log.
  useEffect(() => { logActivity('open'); }, []);

  // ----- Queries ----------------------------------------------------------
  const rolesQuery = useQuery<RoleProfile[]>({
    queryKey: ['skills', 'roles'],
    queryFn: async () => (await api.get('/skills/roles')).data.data
  });

  const roleQuery = useQuery<RoleDetail>({
    queryKey: ['skills', 'roles', activeRoleSlug],
    queryFn: async () => (await api.get(`/skills/roles/${activeRoleSlug}`)).data.data,
    enabled: !!activeRoleSlug
  });

  const historyQuery = useQuery<Assessment[]>({
    queryKey: ['skills', 'assessments', 'role', activeRoleSlug],
    queryFn: async () =>
      (await api.get(`/skills/assessments/role/${activeRoleSlug}`)).data.data,
    enabled: !!activeRoleSlug
  });

  // ----- Mutations --------------------------------------------------------
  const saveMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/skills/assessments', {
        roleSlug: activeRoleSlug,
        ratings
      });
      return data.data as Assessment;
    },
    onSuccess: (assessment) => {
      setSavedAssessment(assessment);
      qc.invalidateQueries({ queryKey: ['skills', 'assessments', 'role', activeRoleSlug] });
      qc.invalidateQueries({ queryKey: ['career-tools', 'activity', 'recent'] });
      logActivity('assessment_complete', {
        roleSlug: activeRoleSlug,
        readiness: assessment.readiness
      });
      toast.success('Assessment saved');
    },
    onError: () => toast.error('Could not save assessment')
  });

  // ----- Handlers ---------------------------------------------------------
  const handlePickRole = (slug: string) => {
    setActiveRoleSlug(slug);
    setRatings({});
    setSavedAssessment(null);
    setStep('rate');
    logActivity('assessment_start', { roleSlug: slug });
  };

  const handleBackToRoles = () => {
    setStep('pick-role');
    setActiveRoleSlug(null);
    setRatings({});
    setSavedAssessment(null);
  };

  const handleRetake = () => {
    setRatings({});
    setSavedAssessment(null);
    setStep('rate');
  };

  // ----- Render -----------------------------------------------------------
  return (
    <div className="bg-[var(--bg)]">
      <Header step={step} onBackToRoles={handleBackToRoles} />

      <section className="mx-auto max-w-7xl px-4 py-8">
        {step === 'pick-role' && (
          <RolePicker
            roles={rolesQuery.data ?? []}
            isLoading={rolesQuery.isLoading}
            onPick={handlePickRole}
          />
        )}

        {step === 'rate' && roleQuery.data && (
          <RatingForm
            role={roleQuery.data}
            ratings={ratings}
            setRatings={setRatings}
            onSubmit={async () => {
              try {
                await saveMut.mutateAsync();
                setStep('results');
              } catch { /* toast already fired */ }
            }}
            isSaving={saveMut.isPending}
          />
        )}

        {step === 'rate' && !roleQuery.data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        )}

        {step === 'results' && roleQuery.data && savedAssessment && (
          <Results
            role={roleQuery.data}
            assessment={savedAssessment}
            history={historyQuery.data ?? []}
            onRetake={handleRetake}
            onPickAnother={handleBackToRoles}
          />
        )}
      </section>
    </div>
  );
}

// =================== Header ===============================================

function Header({ step, onBackToRoles }: { step: Step; onBackToRoles: () => void }) {
  return (
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
              <Target size={28} />
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — Skills Assessment
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                See where you stand. Then close the gaps.
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Rate yourself against a target role. We'll surface the biggest gaps and
                point you at resources to close them.
              </p>
            </div>
          </div>
          {step !== 'pick-role' && (
            <button onClick={onBackToRoles} className="btn-ghost">
              <Layers size={16} /> Pick a different role
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          <StepDot active={step === 'pick-role'} done={step !== 'pick-role'} label="1. Target role" />
          <ChevronRight size={14} className="opacity-50" />
          <StepDot active={step === 'rate'} done={step === 'results'} label="2. Self-rate" />
          <ChevronRight size={14} className="opacity-50" />
          <StepDot active={step === 'results'} done={false} label="3. Results" />
        </div>
      </div>
    </section>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
        active
          ? 'bg-[#065F46] text-white dark:bg-[#84CC16] dark:text-stone-900'
          : done
          ? 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
          : ''
      }`}
    >
      {done && <CheckCircle2 size={12} />}
      {label}
    </span>
  );
}

// =================== Step 1: Role picker ==================================

function RolePicker({
  roles,
  isLoading,
  onPick
}: {
  roles: RoleProfile[];
  isLoading: boolean;
  onPick: (slug: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const g: Record<string, RoleProfile[]> = {};
    for (const r of roles) {
      if (!g[r.category]) g[r.category] = [];
      g[r.category]!.push(r);
    }
    return g;
  }, [roles]);

  const categories = Object.keys(grouped).sort();

  const filteredCategories = filter === 'all' ? categories : categories.filter((c) => c === filter);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#F59E0B]">
          <AlertCircle size={28} />
        </div>
        <h2 className="mt-5 font-heading text-xl font-bold">No target roles loaded yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
          The role library hasn't been seeded. An admin can run{' '}
          <code className="rounded bg-[var(--card)] px-1.5 py-0.5 text-xs">POST /api/skills/seed</code>{' '}
          to populate it.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = (r: RoleProfile) =>
    !q || r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roles — solar engineer, data analyst, ESG…"
          className="input max-w-xl"
          aria-label="Search roles"
        />
        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          {categories.map((c) => (
            <FilterChip
              key={c}
              label={CATEGORY_LABELS[c] ?? c}
              active={filter === c}
              onClick={() => setFilter(c)}
            />
          ))}
        </div>
      </div>

      {/* Grouped grid */}
      <div className="space-y-10">
        {filteredCategories.map((cat) => {
          const inCat = (grouped[cat] ?? []).filter(matches);
          if (inCat.length === 0) return null;
          return (
            <div key={cat}>
              <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inCat.map((r, i) => (
                  <RoleCard key={r.slug} role={r} index={i} onPick={() => onPick(r.slug)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  label, active, onClick
}: { label: string; active: boolean; onClick: () => void }) {
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

function RoleCard({
  role, index, onPick
}: { role: RoleProfile; index: number; onPick: () => void }) {
  const reqCount = role.requiredSkills.length;
  const prefCount = role.preferredSkills.length;
  return (
    <motion.button
      type="button"
      onClick={onPick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="group flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Target size={18} />
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {reqCount + prefCount} skills
        </span>
      </div>
      <h3 className="mt-4 font-heading text-base font-bold leading-tight">{role.name}</h3>
      {role.description && (
        <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">{role.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-[var(--muted)]">
          {reqCount} required · {prefCount} preferred
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#065F46] dark:text-[#84CC16]">
          Start <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </motion.button>
  );
}

// =================== Step 2: Rating form ==================================

function RatingForm({
  role,
  ratings,
  setRatings,
  onSubmit,
  isSaving
}: {
  role: RoleDetail;
  ratings: Record<string, number>;
  setRatings: (r: Record<string, number>) => void;
  onSubmit: () => void;
  isSaving: boolean;
}) {
  const allSkills = useMemo(
    () => [
      ...role.resolvedRequired.map((s) => ({ ...s, weight: 'required' as const })),
      ...role.resolvedPreferred.map((s) => ({ ...s, weight: 'preferred' as const }))
    ],
    [role]
  );

  const ratedCount = allSkills.filter((s) => typeof ratings[s.name] === 'number').length;
  const total = allSkills.length;
  const progress = total === 0 ? 0 : Math.round((ratedCount / total) * 100);

  // Group by category for cleaner reading.
  const grouped = useMemo(() => {
    const g: Record<string, typeof allSkills> = {};
    for (const s of allSkills) {
      if (!g[s.category]) g[s.category] = [];
      g[s.category]!.push(s);
    }
    return g;
  }, [allSkills]);

  const categories = Object.keys(grouped).sort();

  const setRating = (name: string, value: number) => {
    setRatings({ ...ratings, [name]: value });
  };

  const livePreview = computeReadinessLocal(role.requiredSkills, role.preferredSkills, ratings);
  const tone = readinessTone(livePreview);
  const allRated = ratedCount === total;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      {/* Form */}
      <div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-bold">{role.name}</h2>
              {role.description && (
                <p className="mt-1 text-sm text-[var(--muted)]">{role.description}</p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
              <span>{ratedCount} of {total} rated</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--bg)]">
              <motion.div
                className="h-full bg-[#065F46] dark:bg-[#84CC16]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {categories.map((cat) => (
            <div key={cat} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="mb-4 font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
                {SKILL_CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="space-y-4">
                {(grouped[cat] ?? []).map((s) => (
                  <SkillRater
                    key={s.name}
                    name={s.name}
                    weight={s.weight}
                    rating={ratings[s.name]}
                    onChange={(v) => setRating(s.name, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky summary */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            <Sparkles size={14} /> Live preview
          </div>
          <div className="flex items-center gap-4">
            <ReadinessRing value={livePreview} ringClass={tone.ring} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Readiness
              </div>
              <div className={`font-heading text-2xl font-extrabold ${tone.color}`}>
                {livePreview}%
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{tone.label}</div>
            </div>
          </div>

          <p className="mt-4 text-xs text-[var(--muted)]">
            Required skills weigh twice as much as preferred. Saving will lock in the
            score and unlock your gap chart + learning suggestions.
          </p>

          <button
            onClick={onSubmit}
            disabled={isSaving || ratedCount === 0}
            className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} /> {isSaving ? 'Saving…' : 'Save assessment'}
          </button>

          {!allRated && ratedCount > 0 && (
            <p className="mt-2 text-center text-xs text-[var(--muted)]">
              Tip: rate every skill (or mark "Don't know") for the most accurate score.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillRater({
  name,
  weight,
  rating,
  onChange
}: {
  name: string;
  weight: 'required' | 'preferred';
  rating: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--fg)]">{name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              weight === 'required'
                ? 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
                : 'bg-[var(--bg)] text-[var(--muted)]'
            }`}
          >
            {weight}
          </span>
        </div>
        {typeof rating === 'number' && (
          <span className="text-xs font-semibold text-[var(--muted)]">
            {rating === 0 ? "Don't know" : `${rating}/5`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => {
          const active = rating === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-label={`Rate ${v} out of 5`}
              className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-all ${
                active
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
              }`}
            >
              {v}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
            rating === 0
              ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]'
              : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[#F59E0B]/50'
          }`}
        >
          <HelpCircle size={12} /> Don't know
        </button>
      </div>
    </div>
  );
}

function ReadinessRing({ value, ringClass }: { value: number; ringClass: string }) {
  // Hand-rolled SVG progress ring — no chart libs.
  const radius = 28;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className={`relative h-16 w-16 ${ringClass}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle
          cx="32" cy="32" r={radius}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx="32" cy="32" r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5 }}
        />
      </svg>
    </div>
  );
}

// =================== Step 3: Results ======================================

type Gap = {
  name: string;
  rating: number;
  weight: 'required' | 'preferred';
  gap: number; // baseline 4 - effective rating, clamped 0..4
};

function Results({
  role,
  assessment,
  history,
  onRetake,
  onPickAnother
}: {
  role: RoleDetail;
  assessment: Assessment;
  history: Assessment[];
  onRetake: () => void;
  onPickAnother: () => void;
}) {
  const tone = readinessTone(assessment.readiness);

  // Compute gaps. Baseline of 4/5 = "competent". Treat 0 ("don't know") as
  // a 1 so the gap surfaces — that's the whole point of the tool.
  const gaps: Gap[] = useMemo(() => {
    const all: Gap[] = [
      ...role.requiredSkills.map<Gap>((name) => {
        const r = assessment.ratings[name];
        const effective = typeof r === 'number' && r > 0 ? r : 1;
        return {
          name,
          rating: typeof r === 'number' ? r : 0,
          weight: 'required',
          gap: Math.max(0, 4 - effective)
        };
      }),
      ...role.preferredSkills.map<Gap>((name) => {
        const r = assessment.ratings[name];
        const effective = typeof r === 'number' && r > 0 ? r : 1;
        return {
          name,
          rating: typeof r === 'number' ? r : 0,
          weight: 'preferred',
          gap: Math.max(0, 4 - effective)
        };
      })
    ];
    return all
      .filter((g) => g.gap > 0)
      .sort((a, b) => {
        // Required gaps first, then by gap size.
        if (a.weight !== b.weight) return a.weight === 'required' ? -1 : 1;
        return b.gap - a.gap;
      })
      .slice(0, 5);
  }, [role, assessment]);

  // Latest first; current assessment will already be at the top of `history`.
  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      ),
    [history]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Headline */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className={tone.color}>
              <ReadinessRing value={assessment.readiness} ringClass="" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                Your readiness for
              </div>
              <h2 className="font-heading text-2xl font-extrabold leading-tight">{role.name}</h2>
              <div className={`mt-1 font-heading text-4xl font-extrabold ${tone.color}`}>
                {assessment.readiness}%
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--muted)]">{tone.label}</div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={onRetake} className="btn-outline">
                <RotateCcw size={16} /> Retake
              </button>
              <button onClick={onPickAnother} className="btn-ghost">
                <Layers size={16} /> Pick another role
              </button>
            </div>
          </div>
        </div>

        {/* Gap chart */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-[#F59E0B]" />
            <h3 className="font-heading text-lg font-bold">Top gaps to close</h3>
          </div>
          {gaps.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              <Trophy size={18} /> No major gaps — you're competent or above on everything in this role.
            </div>
          ) : (
            <div className="space-y-4">
              {gaps.map((g) => (
                <GapBar key={g.name} gap={g} />
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-[var(--muted)]">
            Based on a baseline of 4/5 ("competent"). Required gaps shown first.
          </p>
        </div>

        {/* Learning resources for top gaps */}
        {gaps.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen size={18} className="text-[#065F46] dark:text-[#84CC16]" />
              <h3 className="font-heading text-lg font-bold">Where to learn next</h3>
            </div>
            <div className="space-y-5">
              {gaps.map((g) => (
                <ResourcesForSkill key={g.name} skill={g.name} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History sidebar */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            <TrendingUp size={14} /> Your progress
          </div>
          {sortedHistory.length <= 1 ? (
            <p className="text-sm text-[var(--muted)]">
              First time on this role. Retake the assessment in a few weeks to see your
              progress curve.
            </p>
          ) : (
            <ul className="space-y-3">
              {sortedHistory.map((a, i) => {
                const t = readinessTone(a.readiness);
                return (
                  <li
                    key={a.id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      i === 0
                        ? 'border-[#065F46] bg-[#065F46]/5 dark:border-[#84CC16] dark:bg-[#84CC16]/10'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs text-[var(--muted)]">
                        {new Date(a.completedAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })}
                      </div>
                      {i === 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:text-[#84CC16]">
                          Latest
                        </div>
                      )}
                    </div>
                    <div className={`font-heading text-lg font-extrabold ${t.color}`}>
                      {a.readiness}%
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function GapBar({ gap }: { gap: Gap }) {
  // 4-step gap scale -> 25/50/75/100% bar width.
  const pct = Math.round((gap.gap / 4) * 100);
  const tone =
    gap.weight === 'required'
      ? 'bg-[#FB7185]'
      : 'bg-[#F59E0B]';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{gap.name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              gap.weight === 'required'
                ? 'bg-[#FB7185]/15 text-[#FB7185]'
                : 'bg-[#F59E0B]/15 text-[#F59E0B]'
            }`}
          >
            {gap.weight}
          </span>
        </div>
        <span className="text-xs text-[var(--muted)]">
          {gap.rating === 0 ? "Don't know" : `${gap.rating}/5`}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg)]">
        <motion.div
          className={`h-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

function ResourcesForSkill({ skill }: { skill: string }) {
  const { data: resources = [], isLoading } = useQuery<LearningResource[]>({
    queryKey: ['skills', 'resources', skill],
    queryFn: async () =>
      (await api.get(`/skills/resources/by-skill/${encodeURIComponent(skill)}`)).data.data,
    staleTime: 5 * 60 * 1000
  });

  return (
    <div>
      <h4 className="mb-2 text-sm font-bold">{skill}</h4>
      {isLoading ? (
        <div className="skeleton h-16 rounded-xl" />
      ) : resources.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          No curated resources yet — the Learning Hub is being seeded. Check back soon.
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {resources.slice(0, 3).map((r) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-3 transition-all hover:border-[#065F46]/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--fg)]">{r.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span>{r.provider}</span>
                      <span>·</span>
                      <span className="uppercase tracking-wider">{r.type}</span>
                      <span>·</span>
                      <span className="uppercase tracking-wider">{r.cost}</span>
                    </div>
                  </div>
                  <ExternalLink size={14} className="mt-1 flex-shrink-0 text-[var(--muted)]" />
                </a>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
