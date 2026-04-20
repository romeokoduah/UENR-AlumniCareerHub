import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Brain, CheckCircle2, XCircle, Clock, Play,
  Timer, ChevronRight, RotateCcw, History
} from 'lucide-react';
import { api } from '../../services/api';

type Category =
  | 'GMAT_VERBAL' | 'GMAT_QUANT' | 'GRE_VERBAL' | 'GRE_QUANT'
  | 'GHANA_CIVIL_SERVICE' | 'CONSULTING_CASE' | 'NUMERICAL' | 'LOGICAL';

const CATEGORY_LABELS: Record<Category, string> = {
  GMAT_VERBAL: 'GMAT Verbal',
  GMAT_QUANT: 'GMAT Quant',
  GRE_VERBAL: 'GRE Verbal',
  GRE_QUANT: 'GRE Quant',
  GHANA_CIVIL_SERVICE: 'Ghana Civil Service',
  CONSULTING_CASE: 'Consulting Case',
  NUMERICAL: 'Numerical Reasoning',
  LOGICAL: 'Logical Reasoning'
};

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  GMAT_VERBAL: 'Sentence correction, critical reasoning, reading comprehension.',
  GMAT_QUANT: 'Problem solving and data sufficiency under time pressure.',
  GRE_VERBAL: 'Vocabulary, text completion, reading comprehension.',
  GRE_QUANT: 'Arithmetic, algebra, geometry, data interpretation.',
  GHANA_CIVIL_SERVICE: 'Current affairs, English, arithmetic — Ghana entrance prep.',
  CONSULTING_CASE: 'Market sizing, profit trees, MECE frameworks.',
  NUMERICAL: 'Sequences, ratios, percentages — common employer screens.',
  LOGICAL: 'Syllogisms, deductions, pattern recognition.'
};

type CategoryRow = { category: Category; count: number; mockReady: boolean };

type RunnerQuestion = {
  id: string;
  category: Category;
  prompt: string;
  options: string[];
  difficulty: number;
  estimatedSeconds: number;
};

type StartResponse = {
  attempt: { id: string; category: Category; isMock: boolean; startedAt: string };
  questions: RunnerQuestion[];
  totalEstimatedSeconds: number;
};

type AnswerState = {
  selectedIndex: number | null;
  // untimed-only fields revealed after PATCH:
  isCorrect?: boolean;
  correctIndex?: number;
  explanation?: string;
};

type ReviewAnswer = {
  id: string;
  questionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  timeSpentSec: number;
  question: RunnerQuestion & { correctIndex: number; explanation: string };
};

type SubmitResponse = {
  attempt: { id: string; category: Category; isMock: boolean; score: number | null; totalSeconds: number | null; completedAt: string };
  total: number;
  answers: ReviewAnswer[];
};

type RecentAttempt = {
  id: string;
  category: Category;
  isMock: boolean;
  startedAt: string;
  completedAt: string;
  totalSeconds: number | null;
  score: number;
  total: number;
  percent: number;
};

type View =
  | { kind: 'picker' }
  | { kind: 'runner'; attempt: StartResponse }
  | { kind: 'results'; data: SubmitResponse };

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AptitudePage() {
  const [view, setView] = useState<View>({ kind: 'picker' });

  useEffect(() => {
    api.post('/career-tools/activity', { tool: 'aptitude', action: 'open' }).catch(() => {});
  }, []);

  if (view.kind === 'runner') {
    return (
      <RunnerView
        start={view.attempt}
        onFinish={(submitData) => setView({ kind: 'results', data: submitData })}
        onAbort={() => setView({ kind: 'picker' })}
      />
    );
  }

  if (view.kind === 'results') {
    return (
      <ResultsView
        data={view.data}
        onRetry={() => setView({ kind: 'picker' })}
        onBack={() => setView({ kind: 'picker' })}
      />
    );
  }

  return <PickerView onStart={(attempt) => setView({ kind: 'runner', attempt })} />;
}

// ===== Picker view =====

function PickerView({ onStart }: { onStart: (a: StartResponse) => void }) {
  const { data: categories = [] } = useQuery<CategoryRow[]>({
    queryKey: ['aptitude', 'categories'],
    queryFn: async () => (await api.get('/aptitude/categories')).data.data
  });

  const { data: recent = [] } = useQuery<RecentAttempt[]>({
    queryKey: ['aptitude', 'attempts'],
    queryFn: async () => (await api.get('/aptitude/attempts')).data.data
  });

  const startMut = useMutation({
    mutationFn: async (input: { category: Category; isMock: boolean; count?: number }) => {
      const { data } = await api.post('/aptitude/attempts/start', input);
      return data.data as StartResponse;
    },
    onSuccess: (d, vars) => {
      const action = vars.isMock ? 'start_mock' : 'start_practice';
      api.post('/career-tools/activity', { tool: 'aptitude', action, metadata: { category: vars.category } }).catch(() => {});
      onStart(d);
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error?.code;
      if (code === 'NOT_ENOUGH_QUESTIONS') {
        toast.error('Not enough questions seeded for a mock. Try untimed practice.');
      } else if (code === 'EMPTY_CATEGORY') {
        toast.error('No questions in this category yet — admin needs to seed.');
      } else {
        toast.error('Could not start attempt');
      }
    }
  });

  const ordered: Category[] = [
    'GMAT_VERBAL', 'GMAT_QUANT', 'GRE_VERBAL', 'GRE_QUANT',
    'GHANA_CIVIL_SERVICE', 'CONSULTING_CASE', 'NUMERICAL', 'LOGICAL'
  ];

  const countMap = new Map(categories.map((c) => [c.category, c]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Brain size={24} />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-extrabold leading-tight">Aptitude Test Practice</h1>
          <p className="text-sm text-[var(--muted)]">Pick a category. Practice untimed for learning, or take a 20-question mock to simulate the real thing.</p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-5 font-heading text-lg font-bold">Categories</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((cat) => {
            const row = countMap.get(cat);
            const count = row?.count ?? 0;
            const mockReady = !!row?.mockReady;
            return (
              <article key={cat} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="font-heading text-lg font-bold">{CATEGORY_LABELS[cat]}</div>
                <p className="mt-1 text-sm text-[var(--muted)]">{CATEGORY_DESCRIPTIONS[cat]}</p>
                <div className="mt-3 text-xs text-[var(--muted)]">{count} question{count === 1 ? '' : 's'} available</div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => startMut.mutate({ category: cat, isMock: false, count: 10 })}
                    disabled={count === 0 || startMut.isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B] disabled:opacity-40"
                  >
                    <Play size={12} /> Practice
                  </button>
                  <button
                    onClick={() => startMut.mutate({ category: cat, isMock: true })}
                    disabled={!mockReady || startMut.isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[#065F46]/50 disabled:opacity-40"
                  >
                    <Timer size={12} /> Mock test (20)
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2">
            <History size={16} className="text-[#065F46] dark:text-[#84CC16]" />
            <h2 className="font-heading text-lg font-bold">Your recent attempts</h2>
          </div>
          <div className="space-y-2">
            {recent.slice(0, 5).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <div>
                  <div className="font-semibold text-sm">{CATEGORY_LABELS[a.category]} {a.isMock && <span className="ml-1 text-xs text-[var(--muted)]">· Mock</span>}</div>
                  <div className="text-xs text-[var(--muted)]">{formatDate(a.completedAt)} · {a.totalSeconds ? formatTime(a.totalSeconds) : '—'} · {a.score}/{a.total}</div>
                </div>
                <div className={`text-2xl font-black ${a.percent >= 70 ? 'text-[#065F46] dark:text-[#84CC16]' : a.percent >= 40 ? 'text-[#F59E0B]' : 'text-rose-600'}`}>
                  {a.percent}%
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ===== Runner view =====

function RunnerView({
  start, onFinish, onAbort
}: {
  start: StartResponse;
  onFinish: (data: SubmitResponse) => void;
  onAbort: () => void;
}) {
  const isMock = start.attempt.isMock;
  const questions = start.questions;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const startedAt = useRef<number>(Date.now());
  const questionStartAt = useRef<number>(Date.now());
  const totalSecondsRef = useRef<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(start.totalEstimatedSeconds);
  const submittedRef = useRef(false);

  const qc = useQueryClient();

  const answerMut = useMutation({
    mutationFn: async (input: { questionId: string; selectedIndex: number; timeSpentSec: number }) => {
      const { data } = await api.patch(`/aptitude/attempts/${start.attempt.id}/answer`, input);
      return data.data;
    }
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const totalSeconds = Math.floor((Date.now() - startedAt.current) / 1000);
      totalSecondsRef.current = totalSeconds;
      const { data } = await api.post(`/aptitude/attempts/${start.attempt.id}/submit`, { totalSeconds });
      return data.data as SubmitResponse;
    },
    onSuccess: (d) => {
      api.post('/career-tools/activity', { tool: 'aptitude', action: 'complete_attempt', metadata: { attemptId: start.attempt.id, score: d.attempt.score } }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['aptitude', 'attempts'] });
      onFinish(d);
    },
    onError: () => toast.error('Submission failed')
  });

  // Mock test timer
  useEffect(() => {
    if (!isMock) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          if (!submittedRef.current) {
            submittedRef.current = true;
            submitMut.mutate();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMock]);

  const current = questions[idx];
  const currentState = answers[current.id];
  const answeredCount = Object.values(answers).filter((a) => a.selectedIndex !== null).length;

  function pickOption(optionIndex: number) {
    const timeSpentSec = Math.max(1, Math.floor((Date.now() - questionStartAt.current) / 1000));
    setAnswers((prev) => ({
      ...prev,
      [current.id]: { ...(prev[current.id] ?? {}), selectedIndex: optionIndex }
    }));
    answerMut.mutate(
      { questionId: current.id, selectedIndex: optionIndex, timeSpentSec },
      {
        onSuccess: (data) => {
          if (!isMock && data && typeof data === 'object' && 'isCorrect' in data) {
            const d = data as { isCorrect: boolean; correctIndex: number; explanation: string };
            setAnswers((prev) => ({
              ...prev,
              [current.id]: {
                selectedIndex: optionIndex,
                isCorrect: d.isCorrect,
                correctIndex: d.correctIndex,
                explanation: d.explanation
              }
            }));
          }
        }
      }
    );
  }

  function goNext() {
    if (idx < questions.length - 1) {
      setIdx(idx + 1);
      questionStartAt.current = Date.now();
    } else if (!isMock) {
      // Untimed reached the end — submit
      submitMut.mutate();
    }
  }

  function goTo(i: number) {
    if (i < 0 || i >= questions.length) return;
    setIdx(i);
    questionStartAt.current = Date.now();
  }

  function handleSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    submitMut.mutate();
  }

  function handleStop() {
    if (confirm('Stop and submit your current answers?')) {
      handleSubmit();
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          onClick={() => {
            if (confirm('Abandon this attempt? Progress will not be saved.')) onAbort();
          }}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft size={14} /> Cancel
        </button>
        <div className="text-sm text-[var(--muted)]">
          {CATEGORY_LABELS[start.attempt.category]} · {isMock ? 'Mock test' : 'Practice'} · {answeredCount}/{questions.length} answered
        </div>
      </div>

      {isMock && (
        <div className={`sticky top-0 z-10 mb-4 flex items-center justify-between rounded-xl border px-4 py-2.5 ${secondsLeft < 60 ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/30' : secondsLeft < 180 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-[var(--border)] bg-[var(--card)]'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock size={16} />
            Time remaining
          </div>
          <div className="font-mono text-2xl font-black tabular-nums">{formatTime(secondsLeft)}</div>
        </div>
      )}

      {isMock && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const a = answers[q.id];
            const answered = a?.selectedIndex !== null && a?.selectedIndex !== undefined;
            const isCurrent = i === idx;
            return (
              <button
                key={q.id}
                onClick={() => goTo(i)}
                className={`h-7 w-7 rounded text-xs font-bold transition ${
                  isCurrent
                    ? 'bg-[#065F46] text-white'
                    : answered
                    ? 'border border-[#84CC16]/50 bg-[#84CC16]/15 text-[#065F46] dark:text-[#84CC16]'
                    : 'border border-[var(--border)] text-[var(--muted)] hover:border-[#065F46]/40'
                }`}
                aria-label={`Question ${i + 1}${answered ? ', answered' : ''}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6"
      >
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Question {idx + 1} of {questions.length}
        </div>
        <p className="font-heading text-lg leading-relaxed">{current.prompt}</p>

        <div className="mt-6 space-y-2">
          {current.options.map((opt, optIdx) => {
            const isPicked = currentState?.selectedIndex === optIdx;
            const reveal = !isMock && currentState?.correctIndex !== undefined;
            const isCorrect = reveal && optIdx === currentState!.correctIndex;
            const isWrongPick = reveal && isPicked && !isCorrect;

            return (
              <button
                key={optIdx}
                onClick={() => !reveal && pickOption(optIdx)}
                disabled={reveal}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition ${
                  isCorrect
                    ? 'border-[#065F46] bg-[#065F46]/5'
                    : isWrongPick
                    ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30'
                    : isPicked
                    ? 'border-[#065F46] bg-[#065F46]/5'
                    : 'border-[var(--border)] hover:border-[#065F46]/50'
                } ${reveal ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${isCorrect || isPicked ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] text-[var(--muted)]'}`}>
                  {String.fromCharCode(65 + optIdx)}
                </div>
                <div className="flex-1">{opt.replace(/^[A-D]\)\s*/, '')}</div>
                {isCorrect && <CheckCircle2 size={18} className="text-[#065F46]" />}
                {isWrongPick && <XCircle size={18} className="text-rose-500" />}
              </button>
            );
          })}
        </div>

        {!isMock && currentState?.explanation && (
          <div className={`mt-5 rounded-xl border-l-4 p-4 text-sm ${currentState.isCorrect ? 'border-l-[#065F46] bg-[#065F46]/5' : 'border-l-rose-400 bg-rose-50 dark:bg-rose-950/30'}`}>
            <div className="font-semibold">{currentState.isCorrect ? 'Correct.' : 'Not quite.'}</div>
            <div className="mt-1 text-[var(--fg)]/85">{currentState.explanation}</div>
          </div>
        )}
      </motion.div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {isMock && (
            <button onClick={() => goTo(idx - 1)} disabled={idx === 0} className="btn-ghost disabled:opacity-40">
              Previous
            </button>
          )}
          {!isMock && (
            <button onClick={handleStop} className="btn-ghost text-rose-600">
              Stop & submit
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {isMock ? (
            idx < questions.length - 1 ? (
              <button onClick={goNext} className="btn-primary">Next <ChevronRight size={16} /></button>
            ) : (
              <button onClick={handleSubmit} disabled={submitMut.isPending} className="btn-primary">
                {submitMut.isPending ? 'Submitting…' : 'Submit test'}
              </button>
            )
          ) : (
            <button onClick={goNext} disabled={!currentState?.explanation && currentState?.selectedIndex === undefined} className="btn-primary">
              {idx < questions.length - 1 ? <>Next <ChevronRight size={16} /></> : 'Finish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Results view =====

function ResultsView({
  data, onRetry, onBack
}: {
  data: SubmitResponse;
  onRetry: () => void;
  onBack: () => void;
}) {
  const total = data.total;
  const score = data.attempt.score ?? 0;
  const percent = Math.round((score / total) * 100);
  const totalSeconds = data.attempt.totalSeconds ?? 0;

  const wrongCount = useMemo(
    () => data.answers.filter((a) => !a.isCorrect).length,
    [data.answers]
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Back to categories
      </button>

      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          {CATEGORY_LABELS[data.attempt.category]} · {data.attempt.isMock ? 'Mock test' : 'Practice'}
        </div>
        <div className={`mt-4 font-heading text-7xl font-black ${percent >= 70 ? 'text-[#065F46] dark:text-[#84CC16]' : percent >= 40 ? 'text-[#F59E0B]' : 'text-rose-600'}`}>
          {percent}%
        </div>
        <div className="mt-2 text-lg text-[var(--fg)]/80">{score} of {total} correct</div>
        <div className="mt-1 text-sm text-[var(--muted)]">Total time: {formatTime(totalSeconds)}</div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {wrongCount > 0 && (
            <button onClick={onRetry} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold hover:border-[#065F46]/50">
              <RotateCcw size={14} /> Practice again
            </button>
          )}
          <button onClick={onBack} className="btn-primary text-sm">Back to categories</button>
        </div>
      </div>

      <h2 className="mt-10 mb-4 font-heading text-lg font-bold">Item-level review</h2>
      <div className="space-y-4">
        {data.answers.map((a, i) => {
          const q = a.question;
          const correct = a.isCorrect;
          return (
            <article key={a.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Q{i + 1}</div>
                <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${correct ? 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                  {correct ? <><CheckCircle2 size={12} /> Correct</> : <><XCircle size={12} /> Wrong</>}
                </div>
              </div>
              <p className="text-sm leading-relaxed">{q.prompt}</p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((opt, optIdx) => {
                  const picked = a.selectedIndex === optIdx;
                  const isCorrectOption = q.correctIndex === optIdx;
                  return (
                    <div
                      key={optIdx}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        isCorrectOption
                          ? 'border-[#065F46] bg-[#065F46]/5'
                          : picked
                          ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      <span className="font-bold">{String.fromCharCode(65 + optIdx)}</span>
                      <span className="flex-1">{opt.replace(/^[A-D]\)\s*/, '')}</span>
                      {isCorrectOption && <CheckCircle2 size={14} className="text-[#065F46]" />}
                      {picked && !isCorrectOption && <XCircle size={14} className="text-rose-500" />}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-lg bg-[var(--bg)] p-3 text-xs text-[var(--fg)]/80">
                <span className="font-semibold">Explanation: </span>{q.explanation}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
