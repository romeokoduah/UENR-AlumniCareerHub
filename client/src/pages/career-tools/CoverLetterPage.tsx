// Cover Letter Generator — list + structured editor with live preview, 8
// hand-written templates, debounced auto-save, browser-print PDF export,
// and optional Opportunity pre-fill via ?opportunityId=…
//
// Backed by /api/cover-letters and /api/opportunities. No AI/LLM calls.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, Mail, Save, Printer, Trash2, Copy, Pencil, Check,
  X, Sparkles, FileText
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import {
  COVER_LETTER_TEMPLATES,
  emptyFormData,
  renderLetter,
  type ClosingTone,
  type CoverLetterFormData
} from './coverLetterTemplates';

const TOOL_SLUG = 'cover-letter';
const CLOSING_TONES: ClosingTone[] = ['Confident', 'Warm', 'Direct', 'Academic'];

type CoverLetter = {
  id: string;
  userId: string;
  title: string;
  template: string;
  data: CoverLetterFormData;
  jobLinkId: string | null;
  createdAt: string;
  updatedAt: string;
};

// Activity log helper — fire-and-forget, never blocks the UI.
const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

// ----- API hooks -----------------------------------------------------------

function useLetters() {
  return useQuery<CoverLetter[]>({
    queryKey: ['cover-letters'],
    queryFn: async () => (await api.get('/cover-letters')).data.data
  });
}

// --------------------------------------------------------------------------

export default function CoverLetterPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);

  const opportunityIdParam = searchParams.get('opportunityId');

  const { data: letters = [], isLoading } = useLetters();

  // One-shot: log "open" on first mount so the hub's recently-used row updates.
  useEffect(() => {
    logActivity('open');
  }, []);

  const createMut = useMutation({
    mutationFn: async (payload: Partial<CoverLetter>) =>
      (await api.post('/cover-letters', payload)).data.data as CoverLetter,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
      setActiveId(created.id);
    }
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/cover-letters/${id}`)).data,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
      if (activeId === id) setActiveId(null);
      toast.success('Cover letter deleted');
    }
  });

  // ---- Pre-fill from Opportunity link --------------------------------------
  // If the user lands here with ?opportunityId=… (e.g. clicked from a job
  // listing), fetch the opportunity, create a fresh draft pre-filled with
  // its target role + company, link it via jobLinkId, and clear the param.
  const opportunityHandledRef = useRef(false);
  useEffect(() => {
    if (!opportunityIdParam || opportunityHandledRef.current) return;
    opportunityHandledRef.current = true;
    (async () => {
      try {
        const { data } = await api.get(`/opportunities/${opportunityIdParam}`);
        const opp = data.data;
        const draft: Partial<CoverLetter> = {
          title: `${opp.title} — ${opp.company}`,
          template: 'classic-formal',
          jobLinkId: opp.id,
          data: {
            ...emptyFormData(),
            senderName: user ? `${user.firstName} ${user.lastName}` : '',
            senderEmail: user?.email || '',
            senderPhone: user?.phone || '',
            senderLocation: user?.location || '',
            targetRole: opp.title,
            companyName: opp.company
          }
        };
        const created = await createMut.mutateAsync(draft);
        toast.success(`Started a draft for ${opp.title}`);
        logActivity('open', { source: 'opportunity', opportunityId: opp.id, letterId: created.id });
      } catch {
        toast.error('Could not load that opportunity');
      } finally {
        // strip the query param so refresh doesn't recreate the draft
        searchParams.delete('opportunityId');
        setSearchParams(searchParams, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityIdParam]);

  // ---- Create-blank handler -----------------------------------------------
  const handleCreateBlank = async () => {
    const blank: Partial<CoverLetter> = {
      title: 'Untitled cover letter',
      template: 'classic-formal',
      data: {
        ...emptyFormData(),
        senderName: user ? `${user.firstName} ${user.lastName}` : '',
        senderEmail: user?.email || '',
        senderPhone: user?.phone || '',
        senderLocation: user?.location || ''
      }
    };
    await createMut.mutateAsync(blank);
  };

  // ---- Duplicate handler ---------------------------------------------------
  const handleDuplicate = async (letter: CoverLetter) => {
    await createMut.mutateAsync({
      title: `${letter.title} (copy)`,
      template: letter.template,
      data: letter.data,
      jobLinkId: letter.jobLinkId
    });
    toast.success('Duplicated');
  };

  const activeLetter = useMemo(
    () => letters.find((l) => l.id === activeId) ?? null,
    [letters, activeId]
  );

  // --------------------------------------------------------------------------
  return (
    <div className="bg-[var(--bg)]">
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
                <Mail size={28} />
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                  — Cover Letter Generator
                </div>
                <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                  Write a sharp letter, fast.
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Pick a template, fill in the prompts, and the right letter writes itself.
                </p>
              </div>
            </div>
            <button
              onClick={handleCreateBlank}
              className="btn-primary"
              disabled={createMut.isPending}
            >
              <Plus size={16} /> New cover letter
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {activeLetter ? (
          <Editor
            key={activeLetter.id}
            letter={activeLetter}
            onClose={() => setActiveId(null)}
          />
        ) : (
          <LetterList
            letters={letters}
            isLoading={isLoading}
            onOpen={(id) => setActiveId(id)}
            onDelete={(id) => {
              if (confirm('Delete this cover letter? This cannot be undone.')) {
                deleteMut.mutate(id);
              }
            }}
            onDuplicate={handleDuplicate}
            onCreateBlank={handleCreateBlank}
          />
        )}
      </section>
    </div>
  );
}

// =================== List view =============================================

function LetterList({
  letters,
  isLoading,
  onOpen,
  onDelete,
  onDuplicate,
  onCreateBlank
}: {
  letters: CoverLetter[];
  isLoading: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (letter: CoverLetter) => void;
  onCreateBlank: () => void;
}) {
  const qc = useQueryClient();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const renameMut = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      (await api.patch(`/cover-letters/${id}`, { title })).data.data as CoverLetter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
      setRenamingId(null);
    }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-40" />
        ))}
      </div>
    );
  }

  if (letters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <FileText size={28} />
        </div>
        <h2 className="mt-5 font-heading text-xl font-bold">No cover letters yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
          Spin up your first draft — pick from 8 hand-written templates and fill in the prompts.
        </p>
        <button onClick={onCreateBlank} className="btn-primary mt-6 inline-flex">
          <Plus size={16} /> Create your first letter
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {letters.map((letter, index) => {
        const isRenaming = renamingId === letter.id;
        return (
          <motion.div
            key={letter.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.04, 0.3) }}
            className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                <Mail size={18} />
              </div>
              <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                {letter.template.replace(/-/g, ' ')}
              </span>
            </div>

            {isRenaming ? (
              <div className="mt-4 flex items-center gap-2">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="input flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      renameMut.mutate({ id: letter.id, title: renameValue.trim() });
                    }
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
                <button
                  className="btn-ghost"
                  onClick={() => {
                    if (renameValue.trim()) {
                      renameMut.mutate({ id: letter.id, title: renameValue.trim() });
                    }
                  }}
                  aria-label="Save name"
                >
                  <Check size={16} />
                </button>
                <button className="btn-ghost" onClick={() => setRenamingId(null)} aria-label="Cancel">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <h3 className="mt-4 font-heading text-base font-bold leading-tight line-clamp-2">
                {letter.title}
              </h3>
            )}

            <p className="mt-2 text-xs text-[var(--muted)]">
              Updated {new Date(letter.updatedAt).toLocaleDateString()}
            </p>

            <div className="mt-auto flex items-center gap-2 pt-4">
              <button onClick={() => onOpen(letter.id)} className="btn-primary flex-1">
                Open
              </button>
              <button
                onClick={() => {
                  setRenamingId(letter.id);
                  setRenameValue(letter.title);
                }}
                className="btn-ghost"
                aria-label="Rename"
                title="Rename"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDuplicate(letter)}
                className="btn-ghost"
                aria-label="Duplicate"
                title="Duplicate"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => onDelete(letter.id)}
                className="btn-ghost text-[#FB7185]"
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// =================== Editor view ===========================================

function Editor({ letter, onClose }: { letter: CoverLetter; onClose: () => void }) {
  const qc = useQueryClient();

  // Local copies so typing feels instant and we can debounce the save.
  const [title, setTitle] = useState(letter.title);
  const [template, setTemplate] = useState(letter.template);
  const [form, setForm] = useState<CoverLetterFormData>({
    ...emptyFormData(),
    ...letter.data
  });
  const [skillsInput, setSkillsInput] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(new Date(letter.updatedAt));
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const setField = <K extends keyof CoverLetterFormData>(k: K, v: CoverLetterFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addSkill = (raw: string) => {
    const s = raw.trim().replace(/,$/, '').trim();
    if (!s) return;
    if (form.skills.includes(s)) return;
    setField('skills', [...form.skills, s]);
  };

  const removeSkill = (s: string) =>
    setField('skills', form.skills.filter((x) => x !== s));

  // ---- Save plumbing -------------------------------------------------------
  const saveMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch(`/cover-letters/${letter.id}`, {
        title,
        template,
        data: form
      });
      return data.data as CoverLetter;
    },
    onMutate: () => setSavingState('saving'),
    onSuccess: () => {
      setSavingState('saved');
      setSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ['cover-letters'] });
    },
    onError: () => setSavingState('error')
  });

  // Debounced auto-save (2s after last edit). The first effect run is the
  // initial mount, which we skip to avoid a redundant save when nothing
  // has actually changed yet.
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      saveMut.mutate();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, template, form]);

  // ---- Print export -------------------------------------------------------
  const handlePrint = async () => {
    // Save first so the print page reads the latest data from the API.
    try {
      await saveMut.mutateAsync();
    } catch { /* keep going — let user retry print if needed */ }
    logActivity('export_pdf', { letterId: letter.id, template });
    window.open(`/career-tools/cover-letter/print/${letter.id}`, '_blank', 'noopener');
  };

  const handleManualSave = async () => {
    try {
      await saveMut.mutateAsync();
      logActivity('save', { letterId: letter.id });
      toast.success('Saved');
    } catch {
      toast.error('Save failed');
    }
  };

  const renderedBody = useMemo(() => renderLetter(form, template), [form, template]);

  // --------------------------------------------------------------------------
  return (
    <div>
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="btn-ghost" aria-label="Back to list">
            <ArrowLeft size={16} /> Back
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Letter title"
            className="input max-w-md"
          />
        </div>
        <div className="flex items-center gap-2">
          <SaveStatus state={savingState} savedAt={savedAt} />
          <button onClick={handleManualSave} className="btn-outline" disabled={saveMut.isPending}>
            <Save size={16} /> Save
          </button>
          <button onClick={handlePrint} className="btn-primary">
            <Printer size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* Template picker */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex min-w-max gap-2 pb-1">
          {COVER_LETTER_TEMPLATES.map((t) => {
            const active = template === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-2.5 text-left transition-all ${
                  active
                    ? 'border-[#065F46] bg-[#065F46] text-white'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
                }`}
              >
                <span className="text-sm font-semibold">{t.label}</span>
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    active ? 'text-white/80' : 'text-[var(--muted)]'
                  }`}
                >
                  {t.industry}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-6">
          <FormSection title="Your details">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput label="Full name" value={form.senderName}
                onChange={(v) => setField('senderName', v)} />
              <LabeledInput label="Email" value={form.senderEmail}
                onChange={(v) => setField('senderEmail', v)} type="email" />
              <LabeledInput label="Phone" value={form.senderPhone}
                onChange={(v) => setField('senderPhone', v)} />
              <LabeledInput label="Location" value={form.senderLocation}
                onChange={(v) => setField('senderLocation', v)} />
            </div>
          </FormSection>

          <FormSection title="Recipient">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput label="Hiring manager" value={form.recipientName}
                onChange={(v) => setField('recipientName', v)} placeholder="e.g. Ama Boateng" />
              <LabeledInput label="Company name" value={form.companyName}
                onChange={(v) => setField('companyName', v)} />
              <LabeledInput label="Company city" value={form.companyCity}
                onChange={(v) => setField('companyCity', v)} />
              <LabeledInput label="Target role" value={form.targetRole}
                onChange={(v) => setField('targetRole', v)} />
            </div>
          </FormSection>

          <FormSection title="The story">
            <LabeledTextarea
              label="Why this company?"
              value={form.whyCompany}
              onChange={(v) => setField('whyCompany', v)}
              placeholder="What about their mission, work or culture genuinely speaks to you?"
              rows={3}
            />
            <LabeledTextarea
              label="A specific achievement (with metrics if possible)"
              value={form.achievement}
              onChange={(v) => setField('achievement', v)}
              placeholder="e.g. Led a team of 4 to ship an MVP in 8 weeks, growing weekly active users by 35%."
              rows={4}
            />
          </FormSection>

          <FormSection title="Skills relevant to this role">
            <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--card)] p-2 transition-colors focus-within:border-[#065F46]">
              <div className="flex flex-wrap gap-2">
                {form.skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-3 py-1 text-sm font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSkill(s)}
                      aria-label={`Remove ${s}`}
                      className="rounded-full hover:opacity-70"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  value={skillsInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(',')) {
                      addSkill(v);
                      setSkillsInput('');
                    } else {
                      setSkillsInput(v);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill(skillsInput);
                      setSkillsInput('');
                    }
                    if (e.key === 'Backspace' && !skillsInput && form.skills.length) {
                      removeSkill(form.skills[form.skills.length - 1]);
                    }
                  }}
                  placeholder={form.skills.length ? 'Add another…' : 'Type a skill, press Enter'}
                  className="min-w-[140px] flex-1 bg-transparent px-2 py-1 outline-none"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Closing tone">
            <div className="flex flex-wrap gap-2">
              {CLOSING_TONES.map((t) => {
                const active = form.closingTone === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setField('closingTone', t)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${
                      active
                        ? 'border-[#065F46] bg-[#065F46] text-white'
                        : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </FormSection>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              <Sparkles size={14} /> Live preview
            </div>
            <LetterPreview
              data={form}
              body={renderedBody}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== Small UI bits =========================================

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, placeholder, type = 'text'
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}

function LabeledTextarea({
  label, value, onChange, placeholder, rows = 3
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}

function SaveStatus({
  state,
  savedAt
}: {
  state: 'idle' | 'saving' | 'saved' | 'error';
  savedAt: Date | null;
}) {
  let label = '';
  if (state === 'saving') label = 'Saving…';
  else if (state === 'error') label = 'Save failed — try again';
  else if (savedAt) label = `Saved ${formatRelative(savedAt)}`;

  return (
    <AnimatePresence>
      {label && (
        <motion.span
          key={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`text-xs font-medium ${
            state === 'error' ? 'text-[#FB7185]' : 'text-[var(--muted)]'
          }`}
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function formatRelative(d: Date): string {
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Renders a clean A4-style letter preview. Shared shape with the print page
// so what the user sees matches what they print.
export function LetterPreview({ data, body }: { data: CoverLetterFormData; body: string }) {
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const paragraphs = body.split('\n\n');

  return (
    <article className="letter-sheet rounded-xl border border-[var(--border)] bg-white p-8 text-stone-900 shadow-sm dark:border-stone-700 dark:bg-stone-100">
      <header className="mb-6">
        <h2 className="font-heading text-xl font-bold leading-tight">
          {data.senderName || 'Your Name'}
        </h2>
        <p className="mt-1 text-xs text-stone-600">
          {[data.senderEmail, data.senderPhone, data.senderLocation]
            .filter(Boolean)
            .join('  ·  ')}
        </p>
      </header>

      <p className="text-xs text-stone-600">{today}</p>

      {(data.recipientName || data.companyName || data.companyCity) && (
        <address className="not-italic mt-4 text-sm leading-relaxed">
          {data.recipientName && <div>{data.recipientName}</div>}
          {data.companyName && <div>{data.companyName}</div>}
          {data.companyCity && <div>{data.companyCity}</div>}
        </address>
      )}

      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
      </div>
    </article>
  );
}
