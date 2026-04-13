import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Save, RotateCcw, Plus, Trash2, Eye, GripVertical, ChevronDown, ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import { ImagePicker } from '../components/admin/ImagePicker';
import { DEFAULT_LANDING } from '../content/landing';
import type { LandingContent } from '../types/landing';

export default function AdminLandingEditorPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<LandingContent>(DEFAULT_LANDING);
  const [dirty, setDirty] = useState(false);
  const [openSections, setOpenSections] = useState({
    hero: true,
    alumni: true,
    story: false,
    cta: false
  });

  const { data, isLoading } = useQuery<LandingContent>({
    queryKey: ['admin', 'content', 'landing'],
    queryFn: async () => (await api.get('/admin/content/landing')).data.data,
    staleTime: 0
  });

  useEffect(() => {
    if (data && !dirty) setDraft(data);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: async (content: LandingContent) =>
      (await api.put('/admin/content/landing', content)).data.data,
    onSuccess: () => {
      toast.success('Landing page saved ✓');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['admin', 'content', 'landing'] });
      qc.invalidateQueries({ queryKey: ['content', 'landing'] });
    },
    onError: () => toast.error('Save failed')
  });

  const resetMut = useMutation({
    mutationFn: async () => (await api.post('/admin/content/landing/reset')).data.data,
    onSuccess: (d) => {
      toast.success('Reset to defaults');
      setDraft(d);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['admin', 'content', 'landing'] });
      qc.invalidateQueries({ queryKey: ['content', 'landing'] });
    }
  });

  const update = <K extends keyof LandingContent>(key: K, val: LandingContent[K]) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setDirty(true);
  };

  const updateHero = (patch: Partial<LandingContent['hero']>) =>
    update('hero', { ...draft.hero, ...patch });
  const updateHeroPhoto = (idx: number, url: string) => {
    const photos = [...draft.hero.photos];
    photos[idx] = url;
    updateHero({ photos });
  };

  const updateStory = (patch: Partial<LandingContent['story']>) =>
    update('story', { ...draft.story, ...patch });

  const updateCta = (patch: Partial<LandingContent['cta']>) =>
    update('cta', { ...draft.cta, ...patch });

  const updateAlumni = (idx: number, patch: Partial<LandingContent['featuredAlumni'][0]>) => {
    const list = draft.featuredAlumni.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    update('featuredAlumni', list);
  };
  const addAlumni = () => {
    update('featuredAlumni', [
      ...draft.featuredAlumni,
      { name: 'New alumnus', role: '', company: '', programme: '', quote: '', photo: '' }
    ]);
  };
  const removeAlumni = (idx: number) => {
    if (draft.featuredAlumni.length <= 1) return toast.error('Keep at least one alumnus');
    update('featuredAlumni', draft.featuredAlumni.filter((_, i) => i !== idx));
  };
  const moveAlumni = (idx: number, dir: -1 | 1) => {
    const next = [...draft.featuredAlumni];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    update('featuredAlumni', next);
  };

  const updateFact = (idx: number, patch: Partial<LandingContent['story']['facts'][0]>) => {
    const facts = draft.story.facts.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    updateStory({ facts });
  };
  const updateParagraph = (idx: number, text: string) => {
    const paragraphs = [...draft.story.paragraphs];
    paragraphs[idx] = text;
    updateStory({ paragraphs });
  };

  const toggle = (k: keyof typeof openSections) =>
    setOpenSections((o) => ({ ...o, [k]: !o[k] }));

  if (isLoading && !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="card h-40 skeleton" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Link to="/admin" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Admin
        </Link>
      </div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold">Landing page editor</h1>
          <p className="text-sm text-[var(--muted)]">
            Edit the homepage photos, headlines, and featured alumni. Changes go live the moment you save.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" target="_blank" className="btn-ghost text-sm">
            <Eye size={14} /> Preview
          </Link>
          <button
            onClick={() => {
              if (confirm('Reset every field to the defaults that shipped with the site? This cannot be undone.')) {
                resetMut.mutate();
              }
            }}
            className="btn-ghost text-sm text-rose-600"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            onClick={() => saveMut.mutate(draft)}
            disabled={!dirty || saveMut.isPending}
            className="btn-primary"
          >
            <Save size={16} />
            {saveMut.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 rounded-xl border-l-4 border-l-[#F59E0B] bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm"
        >
          You have unsaved changes.
        </motion.div>
      )}

      {/* ====== HERO ====== */}
      <Section
        title="Hero section"
        subtitle="The big headline, subtitle, and 3-photo collage at the top of the page."
        open={openSections.hero}
        onToggle={() => toggle('hero')}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 mb-5">
          {draft.hero.photos.map((url, i) => (
            <ImagePicker
              key={i}
              label={`Collage photo ${i + 1}`}
              value={url}
              onChange={(v) => updateHeroPhoto(i, v)}
              aspect="portrait"
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label="Eyebrow tag" value={draft.hero.eyebrow} onChange={(v) => updateHero({ eyebrow: v })} className="md:col-span-2" />

          <TextField label="Headline line 1" value={draft.hero.headlineLine1} onChange={(v) => updateHero({ headlineLine1: v })} />
          <TextField label="Headline line 2" value={draft.hero.headlineLine2} onChange={(v) => updateHero({ headlineLine2: v })} />
          <TextField label="Highlighted word" value={draft.hero.headlineHighlight} onChange={(v) => updateHero({ headlineHighlight: v })} />
          <TextField label="Headline line 3 (after highlight)" value={draft.hero.headlineLine3} onChange={(v) => updateHero({ headlineLine3: v })} />
          <TextField label="Headline line 4" value={draft.hero.headlineLine4} onChange={(v) => updateHero({ headlineLine4: v })} className="md:col-span-2" />

          <TextArea label="Subtitle paragraph" value={draft.hero.subtitle} onChange={(v) => updateHero({ subtitle: v })} className="md:col-span-2" rows={3} />

          <TextField label="Primary button" value={draft.hero.primaryCta} onChange={(v) => updateHero({ primaryCta: v })} />
          <TextField label="Secondary button" value={draft.hero.secondaryCta} onChange={(v) => updateHero({ secondaryCta: v })} />

          <TextField label="Floating badge — title" value={draft.hero.floatingBadgeTitle} onChange={(v) => updateHero({ floatingBadgeTitle: v })} />
          <TextField label="Floating badge — subtitle" value={draft.hero.floatingBadgeSubtitle} onChange={(v) => updateHero({ floatingBadgeSubtitle: v })} />
        </div>
      </Section>

      {/* ====== FEATURED ALUMNI ====== */}
      <Section
        title={`Featured alumni (${draft.featuredAlumni.length})`}
        subtitle="The cards in the 'They walked the same halls you did' section."
        open={openSections.alumni}
        onToggle={() => toggle('alumni')}
      >
        <div className="space-y-5">
          {draft.featuredAlumni.map((a, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                  <GripVertical size={14} /> Alumnus {i + 1}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveAlumni(i, -1)} disabled={i === 0} className="btn-ghost p-1 text-xs disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveAlumni(i, 1)} disabled={i === draft.featuredAlumni.length - 1} className="btn-ghost p-1 text-xs disabled:opacity-30">↓</button>
                  <button
                    type="button"
                    onClick={() => removeAlumni(i)}
                    className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
                <ImagePicker
                  value={a.photo}
                  onChange={(v) => updateAlumni(i, { photo: v })}
                  aspect="portrait"
                  compact
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <TextField label="Name" value={a.name} onChange={(v) => updateAlumni(i, { name: v })} />
                  <TextField label="Role" value={a.role} onChange={(v) => updateAlumni(i, { role: v })} />
                  <TextField label="Company" value={a.company} onChange={(v) => updateAlumni(i, { company: v })} />
                  <TextField label="Programme / class year" value={a.programme} onChange={(v) => updateAlumni(i, { programme: v })} />
                  <TextArea label="Quote" value={a.quote} onChange={(v) => updateAlumni(i, { quote: v })} className="md:col-span-2" rows={3} />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addAlumni}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--muted)] hover:border-[#065F46] hover:text-[#065F46]"
          >
            <Plus size={16} /> Add another alumnus
          </button>
        </div>
      </Section>

      {/* ====== STORY ====== */}
      <Section
        title="Story / editorial section"
        subtitle="'Talent has never been the problem. Access has.' — big photo, essay, and the four stat cards."
        open={openSections.story}
        onToggle={() => toggle('story')}
      >
        <div className="mb-5">
          <ImagePicker
            label="Story photo (large landscape)"
            value={draft.story.photo}
            onChange={(v) => updateStory({ photo: v })}
            aspect="landscape"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label="Eyebrow tag" value={draft.story.eyebrow} onChange={(v) => updateStory({ eyebrow: v })} className="md:col-span-2" />
          <TextField label="Headline line 1" value={draft.story.headlineLine1} onChange={(v) => updateStory({ headlineLine1: v })} />
          <TextField label="Headline line 2" value={draft.story.headlineLine2} onChange={(v) => updateStory({ headlineLine2: v })} />
          <TextField label="Headline line 3 (muted)" value={draft.story.headlineLine3} onChange={(v) => updateStory({ headlineLine3: v })} className="md:col-span-2" />

          <TextArea label="Paragraph 1" value={draft.story.paragraphs[0] ?? ''} onChange={(v) => updateParagraph(0, v)} className="md:col-span-2" rows={4} />
          <TextArea label="Paragraph 2" value={draft.story.paragraphs[1] ?? ''} onChange={(v) => updateParagraph(1, v)} className="md:col-span-2" rows={4} />

          <TextField label="Highlight stat (on photo plaque)" value={draft.story.highlightStat} onChange={(v) => updateStory({ highlightStat: v })} />
          <TextField label="Highlight stat — label" value={draft.story.highlightLabel} onChange={(v) => updateStory({ highlightLabel: v })} />
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs font-semibold">Four stat cards</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {draft.story.facts.map((f, i) => (
              <div key={i} className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                <input
                  className="input max-w-[120px] py-1.5"
                  value={f.number}
                  onChange={(e) => updateFact(i, { number: e.target.value })}
                  placeholder="340"
                />
                <input
                  className="input py-1.5"
                  value={f.label}
                  onChange={(e) => updateFact(i, { label: e.target.value })}
                  placeholder="Mentor sessions completed"
                />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ====== CTA ====== */}
      <Section
        title="Final CTA banner"
        subtitle="The deep-green 'Your next chapter starts with one login' band at the bottom."
        open={openSections.cta}
        onToggle={() => toggle('cta')}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label="Headline line 1" value={draft.cta.headlineLine1} onChange={(v) => updateCta({ headlineLine1: v })} />
          <TextField label="Headline line 2" value={draft.cta.headlineLine2} onChange={(v) => updateCta({ headlineLine2: v })} />
          <TextArea label="Subtitle" value={draft.cta.subtitle} onChange={(v) => updateCta({ subtitle: v })} className="md:col-span-2" rows={3} />
          <TextField label="Primary button" value={draft.cta.primary} onChange={(v) => updateCta({ primary: v })} />
          <TextField label="Secondary button" value={draft.cta.secondary} onChange={(v) => updateCta({ secondary: v })} />
        </div>
      </Section>

      {/* Sticky bottom save bar */}
      {dirty && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 md:bottom-6 z-40 flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-3 shadow-2xl"
        >
          <span className="text-sm font-semibold">Unsaved changes</span>
          <button
            onClick={() => saveMut.mutate(draft)}
            disabled={saveMut.isPending}
            className="btn-primary text-sm py-2 px-4"
          >
            <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save now'}
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ===== Sub-components =====
function Section({
  title, subtitle, open, onToggle, children
}: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="card mb-5">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h2 className="font-heading text-xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open && <div className="mt-5 border-t border-[var(--border)] pt-5">{children}</div>}
    </section>
  );
}

function TextField({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold">{label}</span>
      <input className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, className = '', rows = 3 }: { label: string; value: string; onChange: (v: string) => void; className?: string; rows?: number }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold">{label}</span>
      <textarea className="input mt-1" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
