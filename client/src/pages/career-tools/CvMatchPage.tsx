// CV Match — drop a CV + a JD, get a deterministic match score plus a
// refinement checklist. No AI calls anywhere on this page; the backend
// computes everything via /api/cv-match.
//
// Layout:
//   [Header + History link]
//   [Panel 1: Your CV] | [Panel 2: Target job]   (lg: two-column)
//                [Run match button — sticky]
//   [Panel 3: Results] (full width, renders below after analyse)
//   [History drawer — slide-in, opens from header]

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Target, Save, RotateCcw, FileText, Briefcase,
  Sparkles, History, X, Trash2, ChevronRight, ExternalLink,
  CheckCircle2, AlertCircle, Upload
} from 'lucide-react';
import { api } from '../../services/api';

const TOOL_SLUG = 'cv-match';
const RUN_KEY = 'uenr_cv_match_last_run_id';

// ----- Types matching the backend contract --------------------------------

type CvSource = 'saved_cv' | 'pasted_text';
type JdSource = 'saved_opportunity' | 'pasted_text';

type SavedCV = {
  id: string;
  title: string;
  template: string;
  data: any;
  createdAt: string;
  updatedAt: string;
};

type Opportunity = {
  id: string;
  title: string;
  description: string;
  company: string;
  location: string;
  createdAt: string;
};

type RefinementKind =
  | 'add_skill' | 'strengthen_skill' | 'quantify_bullet' | 'experience_gap'
  | 'education_gap' | 'reorder_skill' | 'tailor_summary';

type Refinement = {
  kind: RefinementKind;
  severity: 'high' | 'medium' | 'low';
  message: string;
  skill?: string;
  detail?: string;
};

type MatchResult = {
  score: number;
  breakdown: {
    required: number;
    preferred: number;
    experience: number;
    education: number;
    location: number;
  };
  refinements: Refinement[];
  missingSkills: string[];
  weakCoverage: string[];
  keywordDensity: Array<{ keyword: string; jdCount: number; cvCount: number }>;
  derivedFromCv: { skills: string[]; yearsExperience: number; programme?: string };
  derivedFromJd: {
    required: string[]; preferred: string[];
    yearsRequired?: number; seniority?: string; jobTitle?: string;
  };
};

type MatchInput = {
  cvSource: CvSource;
  cvId?: string;
  cvText?: string;
  jdSource: JdSource;
  opportunityId?: string;
  jdText: string;
  jobTitle?: string;
};

type CvMatchRunSummary = {
  id: string;
  jobTitle?: string;
  score: number;
  createdAt: string;
  jdSource?: JdSource;
  opportunityId?: string;
};

type CvMatchRunFull = CvMatchRunSummary & {
  cvSource?: CvSource;
  cvId?: string;
  cvText?: string;
  jdText?: string;
  result: MatchResult;
};

// ----- Helpers ------------------------------------------------------------

const logActivity = (action: string, metadata?: Record<string, unknown>) =>
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});

const MAX_TEXT = 20000;

function scoreTone(score: number): { ring: string; text: string; label: string } {
  if (score >= 70) return { ring: '#065F46', text: 'text-[#065F46] dark:text-[#84CC16]', label: 'Strong match' };
  if (score >= 40) return { ring: '#F59E0B', text: 'text-[#F59E0B]', label: 'Partial match' };
  return { ring: '#FB7185', text: 'text-[#FB7185]', label: 'Weak match' };
}

const BREAKDOWN_META: Array<{
  key: keyof MatchResult['breakdown'];
  label: string;
  weight: number;
}> = [
  { key: 'required',   label: 'Required-skill match',  weight: 50 },
  { key: 'preferred',  label: 'Preferred-skill match', weight: 20 },
  { key: 'experience', label: 'Experience match',      weight: 15 },
  { key: 'education',  label: 'Education match',       weight: 10 },
  { key: 'location',   label: 'Location match',        weight: 5 }
];

const SEVERITY_META: Record<Refinement['severity'], { label: string; dot: string; chip: string }> = {
  high:   { label: 'High priority',   dot: 'bg-[#FB7185]', chip: 'bg-[#FB7185]/15 text-[#FB7185]' },
  medium: { label: 'Medium priority', dot: 'bg-[#F59E0B]', chip: 'bg-[#F59E0B]/15 text-[#F59E0B]' },
  low:    { label: 'Low priority',    dot: 'bg-[#84CC16]', chip: 'bg-[#84CC16]/15 text-[#65A30D]' }
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return ''; }
}

// ===========================================================================

export default function CvMatchPage() {
  const qc = useQueryClient();

  // ----- Input state ------------------------------------------------------
  const [cvSource, setCvSource] = useState<CvSource>('saved_cv');
  const [cvId, setCvId] = useState<string>('');
  const [cvText, setCvText] = useState<string>('');

  const [jdSource, setJdSource] = useState<JdSource>('saved_opportunity');
  const [opportunityId, setOpportunityId] = useState<string>('');
  const [jdText, setJdText] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');

  // Results + UI state
  const [result, setResult] = useState<MatchResult | null>(null);
  const [doneItems, setDoneItems] = useState<Record<number, boolean>>({});
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ----- Activity: open log (one-shot) ------------------------------------
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    logActivity('open');
  }, []);

  // Restore last-saved run id (so we don't double-save the same analysis)
  useEffect(() => {
    const id = localStorage.getItem(RUN_KEY);
    if (id) setSavedRunId(id);
  }, []);

  // ----- Queries ----------------------------------------------------------
  const cvsQuery = useQuery<SavedCV[]>({
    queryKey: ['cvs'],
    queryFn: async () => (await api.get('/cvs')).data.data
  });

  const opportunitiesQuery = useQuery<Opportunity[]>({
    queryKey: ['opportunities'],
    queryFn: async () => (await api.get('/opportunities')).data.data
  });

  // Auto-pick most recently updated CV when user toggles to "saved_cv"
  // and nothing is selected yet.
  useEffect(() => {
    if (cvSource !== 'saved_cv' || cvId) return;
    const list = cvsQuery.data ?? [];
    if (list.length === 0) return;
    const sorted = [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    setCvId(sorted[0].id);
  }, [cvSource, cvId, cvsQuery.data]);

  // ----- Validation -------------------------------------------------------
  const cvReady = cvSource === 'saved_cv'
    ? !!cvId
    : cvText.trim().length > 0;

  const jdReady = jdSource === 'saved_opportunity'
    ? !!opportunityId && jdText.trim().length > 0
    : jdText.trim().length > 0;

  const canRun = cvReady && jdReady;

  function buildPayload(): MatchInput {
    return {
      cvSource,
      cvId: cvSource === 'saved_cv' ? cvId : undefined,
      cvText: cvSource === 'pasted_text' ? cvText.trim() : undefined,
      jdSource,
      opportunityId: jdSource === 'saved_opportunity' ? opportunityId : undefined,
      jdText: jdText.trim(),
      jobTitle: jobTitle.trim() || undefined
    };
  }

  // ----- Mutations --------------------------------------------------------
  const analyseMut = useMutation({
    mutationFn: async (payload: MatchInput) => {
      const { data } = await api.post('/cv-match/analyse', payload);
      return data.data as MatchResult;
    },
    onSuccess: (r) => {
      setResult(r);
      setDoneItems({});
      setSavedRunId(null);
      localStorage.removeItem(RUN_KEY);
      logActivity('analyse', { score: r.score, jdSource });
      // Scroll results into view on the next paint.
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error?.message
        ?? e?.response?.data?.message
        ?? 'Could not analyse CV — please try again.';
      toast.error(msg);
    }
  });

  const saveMut = useMutation({
    mutationFn: async (payload: MatchInput) => {
      const { data } = await api.post('/cv-match/runs', payload);
      return data.data as { run: CvMatchRunSummary; result: MatchResult };
    },
    onSuccess: ({ run }) => {
      setSavedRunId(run.id);
      localStorage.setItem(RUN_KEY, run.id);
      qc.invalidateQueries({ queryKey: ['cv-match', 'runs'] });
      qc.invalidateQueries({ queryKey: ['career-tools', 'activity', 'recent'] });
      logActivity('save_run', { runId: run.id, score: run.score });
      toast.success('Saved to history');
    },
    onError: () => toast.error('Could not save run')
  });

  // ----- Handlers ---------------------------------------------------------
  function handleRun() {
    if (!canRun) return;
    analyseMut.mutate(buildPayload());
  }

  function handleSave() {
    if (!result || saveMut.isPending) return;
    if (savedRunId) {
      toast('This run is already saved.', { icon: 'ℹ️' });
      return;
    }
    saveMut.mutate(buildPayload());
  }

  function handleRunAgain() {
    setResult(null);
    setDoneItems({});
    setSavedRunId(null);
    localStorage.removeItem(RUN_KEY);
  }

  // Hydrate the page from a saved run (called from the history drawer).
  function hydrateFromRun(full: CvMatchRunFull) {
    if (full.cvSource) setCvSource(full.cvSource);
    if (full.cvId) setCvId(full.cvId);
    if (full.cvText) setCvText(full.cvText);
    if (full.jdSource) setJdSource(full.jdSource);
    if (full.opportunityId) setOpportunityId(full.opportunityId);
    if (full.jdText) setJdText(full.jdText);
    if (full.jobTitle) setJobTitle(full.jobTitle);
    setResult(full.result);
    setSavedRunId(full.id);
    localStorage.setItem(RUN_KEY, full.id);
    setDoneItems({});
    setHistoryOpen(false);
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ----- Sorted opportunities (cap to 50 most recent) ---------------------
  const opportunities = useMemo(() => {
    const list = opportunitiesQuery.data ?? [];
    return [...list]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }, [opportunitiesQuery.data]);

  const sortedCvs = useMemo(() => {
    const list = cvsQuery.data ?? [];
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [cvsQuery.data]);

  // =========================================================================
  return (
    <div className="bg-[var(--bg)] pb-24">
      <Header onOpenHistory={() => setHistoryOpen(true)} />

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Panel 1 — Your CV */}
          <CvPanel
            source={cvSource}
            onSourceChange={setCvSource}
            cvs={sortedCvs}
            cvsLoading={cvsQuery.isLoading}
            cvId={cvId}
            onCvIdChange={setCvId}
            cvText={cvText}
            onCvTextChange={setCvText}
          />

          {/* Panel 2 — Target job */}
          <JdPanel
            source={jdSource}
            onSourceChange={setJdSource}
            opportunities={opportunities}
            opportunitiesLoading={opportunitiesQuery.isLoading}
            opportunityId={opportunityId}
            onOpportunityChange={(id) => {
              setOpportunityId(id);
              const opp = opportunities.find((o) => o.id === id);
              if (opp) {
                setJdText(opp.description ?? '');
                setJobTitle(opp.title ?? '');
              }
            }}
            jobTitle={jobTitle}
            onJobTitleChange={setJobTitle}
            jdText={jdText}
            onJdTextChange={setJdText}
          />
        </div>

        {/* Sticky run-match bar */}
        <RunBar
          canRun={canRun}
          loading={analyseMut.isPending}
          onRun={handleRun}
          hasResult={!!result}
        />

        {/* Panel 3 — Results */}
        <div ref={resultsRef}>
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.25 }}
                className="mt-8"
              >
                <Results
                  result={result}
                  doneItems={doneItems}
                  setDoneItems={setDoneItems}
                  jdSource={jdSource}
                  opportunityId={opportunityId}
                  onSave={handleSave}
                  saving={saveMut.isPending}
                  alreadySaved={!!savedRunId}
                  onRunAgain={handleRunAgain}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* History drawer */}
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onPick={hydrateFromRun}
      />
    </div>
  );
}

// =================== Header ================================================

function Header({ onOpenHistory }: { onOpenHistory: () => void }) {
  return (
    <section className="border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/career-tools"
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={14} /> Career Tools
          </Link>
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] hover:border-[#065F46]/50"
          >
            <History size={14} /> History
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Target size={28} />
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — CV Match
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                Score your CV against any job in seconds.
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Drop in a CV and a job description. Get a deterministic match score
                plus a refinement checklist — no AI guesswork.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =================== Source chips =========================================

function SourceChip({
  active, onClick, label, icon, disabled, title
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all ${
        disabled
          ? 'cursor-not-allowed border-dashed border-[var(--border)] bg-transparent text-[var(--muted)] opacity-60'
          : active
          ? 'border-[#065F46] bg-[#065F46] text-white'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
      }`}
    >
      {icon}{label}
    </button>
  );
}

// =================== Panel 1: CV ==========================================

function CvPanel({
  source, onSourceChange, cvs, cvsLoading, cvId, onCvIdChange, cvText, onCvTextChange
}: {
  source: CvSource;
  onSourceChange: (s: CvSource) => void;
  cvs: SavedCV[];
  cvsLoading: boolean;
  cvId: string;
  onCvIdChange: (id: string) => void;
  cvText: string;
  onCvTextChange: (t: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileText size={18} className="text-[#065F46] dark:text-[#84CC16]" />
        <h2 className="font-heading text-lg font-bold">Your CV</h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <SourceChip
          active={source === 'saved_cv'}
          onClick={() => onSourceChange('saved_cv')}
          label="Use a saved CV"
          icon={<FileText size={14} />}
        />
        <SourceChip
          active={source === 'pasted_text'}
          onClick={() => onSourceChange('pasted_text')}
          label="Paste plain text"
          icon={<Sparkles size={14} />}
        />
        <SourceChip
          active={false}
          onClick={() => {}}
          disabled
          title="PDF / DOCX upload is coming soon"
          label="Upload PDF / DOCX (coming soon)"
          icon={<Upload size={14} />}
        />
      </div>

      {source === 'saved_cv' ? (
        <div>
          {cvsLoading ? (
            <div className="skeleton h-10 rounded-xl" />
          ) : cvs.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/50 p-4 text-sm text-[var(--muted)]">
              <AlertCircle size={16} className="text-[#F59E0B]" />
              <div>
                You haven't saved a CV yet.{' '}
                <Link to="/career-tools/cv-builder" className="font-semibold text-[#065F46] underline dark:text-[#84CC16]">
                  Build one now
                </Link>{' '}
                or paste text instead.
              </div>
            </div>
          ) : (
            <select
              className="input"
              value={cvId}
              onChange={(e) => onCvIdChange(e.target.value)}
              aria-label="Select a saved CV"
            >
              <option value="" disabled>Select a saved CV…</option>
              {cvs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || 'Untitled CV'} — updated {formatDate(c.updatedAt)}
                </option>
              ))}
            </select>
          )}
          <p className="mt-2 text-xs text-[var(--muted)]">
            We use the saved structured data — no PDF parsing needed.
          </p>
        </div>
      ) : (
        <div>
          <textarea
            className="input min-h-[180px] resize-y font-mono text-sm leading-relaxed"
            placeholder="Paste your CV as plain text…"
            value={cvText}
            maxLength={MAX_TEXT}
            onChange={(e) => onCvTextChange(e.target.value)}
            aria-label="CV plain text"
          />
          <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Plain text only — bullets, line breaks, headings welcome.</span>
            <span>{cvText.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =================== Panel 2: JD ==========================================

function JdPanel({
  source, onSourceChange, opportunities, opportunitiesLoading,
  opportunityId, onOpportunityChange, jobTitle, onJobTitleChange,
  jdText, onJdTextChange
}: {
  source: JdSource;
  onSourceChange: (s: JdSource) => void;
  opportunities: Opportunity[];
  opportunitiesLoading: boolean;
  opportunityId: string;
  onOpportunityChange: (id: string) => void;
  jobTitle: string;
  onJobTitleChange: (t: string) => void;
  jdText: string;
  onJdTextChange: (t: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Briefcase size={18} className="text-[#065F46] dark:text-[#84CC16]" />
        <h2 className="font-heading text-lg font-bold">Target job</h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <SourceChip
          active={source === 'saved_opportunity'}
          onClick={() => onSourceChange('saved_opportunity')}
          label="Pick from job board"
          icon={<Briefcase size={14} />}
        />
        <SourceChip
          active={source === 'pasted_text'}
          onClick={() => onSourceChange('pasted_text')}
          label="Paste a JD"
          icon={<Sparkles size={14} />}
        />
      </div>

      {source === 'saved_opportunity' ? (
        <div className="space-y-3">
          {opportunitiesLoading ? (
            <div className="skeleton h-10 rounded-xl" />
          ) : opportunities.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/50 p-4 text-sm text-[var(--muted)]">
              <AlertCircle size={16} className="text-[#F59E0B]" />
              No opportunities posted yet — try pasting a JD instead.
            </div>
          ) : (
            <select
              className="input"
              value={opportunityId}
              onChange={(e) => onOpportunityChange(e.target.value)}
              aria-label="Select an opportunity"
            >
              <option value="" disabled>Pick an opportunity…</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} — {o.company}
                </option>
              ))}
            </select>
          )}
          {opportunityId && (
            <textarea
              className="input min-h-[140px] resize-y text-sm leading-relaxed"
              placeholder="Job description (auto-filled — edit if needed)…"
              value={jdText}
              maxLength={MAX_TEXT}
              onChange={(e) => onJdTextChange(e.target.value)}
              aria-label="Job description"
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Job title (e.g. Solar PV Field Engineer)"
            value={jobTitle}
            onChange={(e) => onJobTitleChange(e.target.value)}
            aria-label="Job title"
          />
          <textarea
            className="input min-h-[180px] resize-y text-sm leading-relaxed"
            placeholder="Paste the job description…"
            value={jdText}
            maxLength={MAX_TEXT}
            onChange={(e) => onJdTextChange(e.target.value)}
            aria-label="Job description"
          />
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Paste responsibilities, requirements, and the role overview.</span>
            <span>{jdText.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =================== Run match bar ========================================

function RunBar({
  canRun, loading, onRun, hasResult
}: { canRun: boolean; loading: boolean; onRun: () => void; hasResult: boolean }) {
  return (
    <div className="sticky bottom-4 z-30 mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-[var(--card)]/80">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[var(--muted)]">
          {canRun
            ? hasResult
              ? 'Tweak the inputs and re-run to see how the score changes.'
              : 'Ready to score — hit Run match.'
            : 'Pick a CV source and a JD source to enable match scoring.'}
        </div>
        <button
          onClick={onRun}
          disabled={!canRun || loading}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Target size={16} /> {loading ? 'Scoring…' : 'Run match'}
        </button>
      </div>
    </div>
  );
}

// =================== Panel 3: Results =====================================

function Results({
  result, doneItems, setDoneItems, jdSource, opportunityId,
  onSave, saving, alreadySaved, onRunAgain
}: {
  result: MatchResult;
  doneItems: Record<number, boolean>;
  setDoneItems: (d: Record<number, boolean>) => void;
  jdSource: JdSource;
  opportunityId: string;
  onSave: () => void;
  saving: boolean;
  alreadySaved: boolean;
  onRunAgain: () => void;
}) {
  const tone = scoreTone(result.score);

  // Refinements grouped by severity, capped at 12 total.
  const refinements = (result.refinements ?? []).slice(0, 12);
  const grouped = useMemo(() => {
    const g: Record<Refinement['severity'], Array<{ ref: Refinement; idx: number }>> = {
      high: [], medium: [], low: []
    };
    refinements.forEach((r, idx) => g[r.severity].push({ ref: r, idx }));
    return g;
  }, [refinements]);

  const toggleDone = (idx: number) =>
    setDoneItems({ ...doneItems, [idx]: !doneItems[idx] });

  // Sort breakdown by weight desc (already in BREAKDOWN_META order).
  const breakdown = BREAKDOWN_META;

  // Top 10 keyword density, sorted by jdCount desc.
  const density = useMemo(
    () => [...(result.keywordDensity ?? [])].sort((a, b) => b.jdCount - a.jdCount).slice(0, 10),
    [result.keywordDensity]
  );

  return (
    <div className="space-y-6">
      {/* Headline score */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing value={result.score} color={tone.ring} />
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              Match score
            </div>
            <div className={`mt-1 font-heading text-5xl font-extrabold ${tone.text}`}>
              {result.score}%
            </div>
            <div className={`mt-1 text-sm font-semibold ${tone.text}`}>{tone.label}</div>
            {result.derivedFromJd?.jobTitle && (
              <div className="mt-1 text-xs text-[var(--muted)]">
                Against: <span className="font-semibold text-[var(--fg)]">{result.derivedFromJd.jobTitle}</span>
                {result.derivedFromJd.seniority && (
                  <> · {result.derivedFromJd.seniority}</>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="mt-6 space-y-3">
          {breakdown.map((b) => {
            const raw = result.breakdown?.[b.key] ?? 0;
            const pct = Math.round(Math.max(0, Math.min(1, raw)) * 100);
            return (
              <div key={b.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--fg)]">{b.label}</span>
                    <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      Weight {b.weight}%
                    </span>
                  </div>
                  <span className="font-semibold text-[var(--muted)]">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]">
                  <motion.div
                    className="h-full bg-[#065F46] dark:bg-[#84CC16]"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Refinement checklist */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-[#F59E0B]" />
          <h3 className="font-heading text-lg font-bold">Refinement checklist</h3>
        </div>
        {refinements.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No refinements suggested — your CV reads strong against this JD.
          </p>
        ) : (
          <div className="space-y-5">
            {(['high', 'medium', 'low'] as const).map((sev) => {
              const items = grouped[sev];
              if (items.length === 0) return null;
              const meta = SEVERITY_META[sev];
              return (
                <div key={sev}>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </h4>
                  <ul className="space-y-2">
                    {items.map(({ ref, idx }) => {
                      const done = !!doneItems[idx];
                      return (
                        <li
                          key={idx}
                          className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${
                            done
                              ? 'border-[#065F46]/30 bg-[#065F46]/5 dark:border-[#84CC16]/30 dark:bg-[#84CC16]/5'
                              : 'border-[var(--border)] bg-[var(--bg)]/40'
                          }`}
                        >
                          <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {ref.skill && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chip}`}>
                                  {ref.skill}
                                </span>
                              )}
                              <span className={`text-sm ${done ? 'line-through text-[var(--muted)]' : 'text-[var(--fg)]'}`}>
                                {ref.message}
                              </span>
                            </div>
                            {ref.detail && (
                              <p className="mt-1 text-xs text-[var(--muted)]">{ref.detail}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDone(idx)}
                            className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                              done
                                ? 'border-[#065F46] bg-[#065F46] text-white dark:border-[#84CC16] dark:bg-[#84CC16] dark:text-stone-900'
                                : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[#065F46]/50'
                            }`}
                            aria-pressed={done}
                          >
                            <CheckCircle2 size={12} /> {done ? 'Done' : 'Mark done'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-[var(--muted)]">
          Toggling "Mark done" is local-only — useful for tracking progress as you edit your CV.
        </p>
      </div>

      {/* Missing skills + Weak coverage */}
      {(result.missingSkills?.length > 0 || result.weakCoverage?.length > 0) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {result.missingSkills?.length > 0 && (
            <ChipBlock
              title="Missing required skills"
              tone="rose"
              items={result.missingSkills}
              emptyHint="None — required skills all covered."
            />
          )}
          {result.weakCoverage?.length > 0 && (
            <ChipBlock
              title="Weak coverage"
              tone="amber"
              items={result.weakCoverage}
              emptyHint="No weak spots flagged."
            />
          )}
        </div>
      )}

      {/* Keyword density */}
      {density.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileText size={18} className="text-[#065F46] dark:text-[#84CC16]" />
            <h3 className="font-heading text-lg font-bold">Keyword density</h3>
            <span className="ml-1 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Top 10
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  <th className="px-2 py-2">Keyword</th>
                  <th className="px-2 py-2 text-right">JD</th>
                  <th className="px-2 py-2 text-right">CV</th>
                  <th className="px-2 py-2 text-right">Indicator</th>
                </tr>
              </thead>
              <tbody>
                {density.map((d) => {
                  let dot = 'bg-[#84CC16]';
                  let label = 'Covered';
                  if (d.cvCount === 0) { dot = 'bg-[#FB7185]'; label = 'Missing'; }
                  else if (d.cvCount < d.jdCount) { dot = 'bg-[#F59E0B]'; label = 'Weak'; }
                  return (
                    <tr key={d.keyword} className="border-t border-[var(--border)]">
                      <td className="px-2 py-2 font-medium text-[var(--fg)]">{d.keyword}</td>
                      <td className="px-2 py-2 text-right text-[var(--muted)]">{d.jdCount}</td>
                      <td className="px-2 py-2 text-right text-[var(--muted)]">{d.cvCount}</td>
                      <td className="px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <button
          onClick={onRunAgain}
          className="btn-ghost"
          title="Clear results and edit inputs"
        >
          <RotateCcw size={16} /> Run again
        </button>
        {jdSource === 'saved_opportunity' && opportunityId ? (
          <Link to={`/opportunities/${opportunityId}`} className="btn-outline">
            <ExternalLink size={16} /> Apply via the platform
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Available only when matching against a saved opportunity"
            className="btn-outline cursor-not-allowed opacity-50"
          >
            <ExternalLink size={16} /> Apply via the platform
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving || alreadySaved}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} />{' '}
          {alreadySaved ? 'Saved' : saving ? 'Saving…' : 'Save this run'}
        </button>
      </div>
    </div>
  );
}

function ChipBlock({
  title, items, tone, emptyHint
}: {
  title: string;
  items: string[];
  tone: 'rose' | 'amber';
  emptyHint: string;
}) {
  const toneClass =
    tone === 'rose'
      ? 'bg-[#FB7185]/10 text-[#FB7185] border-[#FB7185]/30'
      : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30';
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="mb-3 font-heading text-base font-bold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <span
              key={s}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// =================== Score ring ===========================================

function ScoreRing({ value, color }: { value: number; color: string }) {
  // Hand-rolled SVG progress ring — mirror of SkillsAssessmentPage's ring,
  // sized up since this is the headline score.
  const radius = 44;
  const stroke = 8;
  const size = 112;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth={stroke}
          fill="none"
          className="text-[var(--muted)]"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-heading text-xl font-extrabold" style={{ color }}>
          {clamped}
        </span>
      </div>
    </div>
  );
}

// =================== History drawer =======================================

function HistoryDrawer({
  open, onClose, onPick
}: {
  open: boolean;
  onClose: () => void;
  onPick: (full: CvMatchRunFull) => void;
}) {
  const qc = useQueryClient();
  const runsQuery = useQuery<CvMatchRunSummary[]>({
    queryKey: ['cv-match', 'runs'],
    queryFn: async () => (await api.get('/cv-match/runs')).data.data,
    enabled: open
  });

  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/cv-match/runs/${id}`)).data,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['cv-match', 'runs'] });
      logActivity('delete_run', { runId: id });
      toast.success('Run deleted');
      setConfirming(null);
      setConfirmText('');
    },
    onError: () => toast.error('Could not delete run')
  });

  async function handlePick(id: string) {
    try {
      setLoadingId(id);
      const { data } = await api.get(`/cv-match/runs/${id}`);
      onPick(data.data as CvMatchRunFull);
    } catch {
      toast.error('Could not load that run');
    } finally {
      setLoadingId(null);
    }
  }

  const sorted = useMemo(() => {
    const list = runsQuery.data ?? [];
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [runsQuery.data]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
            role="dialog"
            aria-label="Saved CV match runs"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History size={18} className="text-[#065F46] dark:text-[#84CC16]" />
                <h2 className="font-heading text-lg font-bold">Saved runs</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--bg)]"
                aria-label="Close history"
              >
                <X size={16} />
              </button>
            </div>

            {runsQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
              </div>
            ) : sorted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/50 p-6 text-center text-sm text-[var(--muted)]">
                No saved runs yet. Run a match and tap "Save this run" to keep it for later.
              </div>
            ) : (
              <ul className="space-y-3">
                {sorted.map((r) => {
                  const tone = scoreTone(r.score);
                  const isConfirming = confirming === r.id;
                  return (
                    <li
                      key={r.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => handlePick(r.id)}
                          disabled={loadingId === r.id}
                          className="flex-1 min-w-0 text-left disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`font-heading text-lg font-extrabold ${tone.text}`}>
                              {r.score}%
                            </span>
                            <span className="truncate text-sm font-semibold text-[var(--fg)]">
                              {r.jobTitle || 'Untitled job'}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--muted)]">
                            {formatDate(r.createdAt)}
                            {r.jdSource === 'saved_opportunity' && ' · from job board'}
                            {loadingId === r.id && ' · loading…'}
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePick(r.id)}
                            disabled={loadingId === r.id}
                            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[#065F46] dark:hover:text-[#84CC16] disabled:opacity-50"
                            aria-label="Open this run"
                            title="Open"
                          >
                            <ChevronRight size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(isConfirming ? null : r.id);
                              setConfirmText('');
                            }}
                            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[#FB7185]"
                            aria-label="Delete this run"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {isConfirming && (
                        <div className="mt-3 rounded-lg border border-[#FB7185]/40 bg-[#FB7185]/5 p-3">
                          <p className="mb-2 text-xs text-[var(--fg)]">
                            Type <span className="font-mono font-bold">DELETE</span> to confirm.
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              className="input flex-1"
                              value={confirmText}
                              onChange={(e) => setConfirmText(e.target.value)}
                              placeholder="DELETE"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => deleteMut.mutate(r.id)}
                              disabled={confirmText !== 'DELETE' || deleteMut.isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#FB7185] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => { setConfirming(null); setConfirmText(''); }}
                              className="rounded-lg px-2 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--card)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
