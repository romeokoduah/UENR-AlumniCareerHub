import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowDown, ArrowUp, Check, Copy, Download, FileText, Plus, Save,
  Sparkles, Trash2, X, Eye, EyeOff, Monitor, Smartphone
} from 'lucide-react';
import { api } from '../../services/api';
import { CVPreview } from '../../components/career-tools/cv/CVPreview';
import {
  ALL_OPTIONAL_SECTIONS, SECTION_LABELS, TEMPLATE_DESCRIPTIONS, TEMPLATE_LABELS,
  emptyCVData, makeId, normalizeCVData,
  type CVData, type CVRecord, type CVTemplate, type SectionKind
} from '../../components/career-tools/cv/types';

const TOOL_SLUG = 'cv-builder';

const IMPACT_VERBS = [
  'Led', 'Designed', 'Built', 'Reduced', 'Shipped', 'Coordinated',
  'Audited', 'Scaled', 'Launched', 'Negotiated', 'Streamlined', 'Mentored',
  'Researched', 'Automated', 'Drove', 'Owned', 'Improved', 'Delivered'
];

type RawCV = {
  id: string;
  userId: string;
  title: string;
  template: string;
  data: unknown;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function toRecord(raw: RawCV): CVRecord {
  const tpl: CVTemplate =
    raw.template === 'classic' || raw.template === 'ats-pure' ? raw.template : 'modern';
  return {
    id: raw.id,
    userId: raw.userId,
    title: raw.title,
    template: tpl,
    data: normalizeCVData(raw.data),
    pdfUrl: raw.pdfUrl,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  };
}

function logActivity(action: string, metadata?: Record<string, unknown>) {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
}

export default function CVBuilderPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTemplate, setDraftTemplate] = useState<CVTemplate>('modern');
  const [draftData, setDraftData] = useState<CVData>(emptyCVData());
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false); // mobile only
  const openLoggedRef = useRef(false);

  // ---------- Queries ----------
  const versionsQuery = useQuery<CVRecord[]>({
    queryKey: ['cvs'],
    queryFn: async () => {
      const { data } = await api.get('/cvs');
      return (data.data as RawCV[]).map(toRecord);
    }
  });

  // First-load: log "open" once + auto-pick most recent (or create one).
  useEffect(() => {
    if (openLoggedRef.current) return;
    openLoggedRef.current = true;
    logActivity('open');
  }, []);

  useEffect(() => {
    if (versionsQuery.isLoading || activeId) return;
    const list = versionsQuery.data ?? [];
    if (list.length > 0) {
      pickVersion(list[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionsQuery.isLoading, versionsQuery.data]);

  function pickVersion(v: CVRecord) {
    setActiveId(v.id);
    setDraftTitle(v.title);
    setDraftTemplate(v.template);
    setDraftData(v.data);
    setDirty(false);
  }

  // ---------- Mutations ----------
  const createMutation = useMutation({
    mutationFn: async (payload: { title: string; template: CVTemplate; data: CVData }) => {
      const { data } = await api.post('/cvs', payload);
      return toRecord(data.data as RawCV);
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
      pickVersion(rec);
      toast.success('CV created');
    },
    onError: () => toast.error('Could not create CV')
  });

  const saveMutation = useMutation({
    mutationFn: async (args: { id: string; title: string; template: CVTemplate; data: CVData }) => {
      const { data } = await api.patch(`/cvs/${args.id}`, {
        title: args.title,
        template: args.template,
        data: args.data
      });
      return data.data ? toRecord(data.data as RawCV) : null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
      setDirty(false);
    },
    onError: () => toast.error('Save failed')
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/cvs/${id}/duplicate`);
      return toRecord(data.data as RawCV);
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
      pickVersion(rec);
      toast.success('CV duplicated');
    },
    onError: () => toast.error('Duplicate failed')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cvs/${id}`);
      return id;
    },
    onSuccess: (deletedId) => {
      qc.invalidateQueries({ queryKey: ['cvs'] });
      if (deletedId === activeId) {
        setActiveId(null);
        setDraftData(emptyCVData());
        setDraftTitle('');
        setDraftTemplate('modern');
      }
      toast.success('CV deleted');
    },
    onError: () => toast.error('Delete failed')
  });

  // ---------- Auto-save (debounced 2s after last edit) ----------
  useEffect(() => {
    if (!activeId || !dirty) return;
    const handle = window.setTimeout(() => {
      saveMutation.mutate({ id: activeId, title: draftTitle, template: draftTemplate, data: draftData });
      logActivity('save', { auto: true });
    }, 2000);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftData, draftTitle, draftTemplate, dirty, activeId]);

  // ---------- Helpers ----------
  function patchData(updater: (d: CVData) => CVData) {
    setDraftData((prev) => updater(prev));
    setDirty(true);
  }

  function handleNew() {
    createMutation.mutate({
      title: 'Untitled CV',
      template: 'modern',
      data: emptyCVData()
    });
  }

  function handleManualSave() {
    if (!activeId) return;
    saveMutation.mutate({ id: activeId, title: draftTitle, template: draftTemplate, data: draftData });
    logActivity('save', { auto: false });
    toast.success('Saved');
  }

  function handleDownloadPDF() {
    if (!activeId) {
      toast.error('Save the CV first');
      return;
    }
    if (dirty) {
      // Persist before opening so the print page reads the freshest copy.
      saveMutation.mutate({ id: activeId, title: draftTitle, template: draftTemplate, data: draftData });
    }
    logActivity('export_pdf');
    window.open(`/career-tools/cv-builder/print/${activeId}`, '_blank', 'noopener');
  }

  function moveSection(kind: Exclude<SectionKind, 'personal'>, dir: -1 | 1) {
    patchData((d) => {
      const order = [...d.sectionOrder];
      const idx = order.indexOf(kind);
      if (idx < 0) return d;
      const next = idx + dir;
      if (next < 0 || next >= order.length) return d;
      [order[idx], order[next]] = [order[next], order[idx]];
      return { ...d, sectionOrder: order };
    });
  }
  function removeSection(kind: Exclude<SectionKind, 'personal'>) {
    patchData((d) => ({ ...d, sectionOrder: d.sectionOrder.filter((s) => s !== kind) }));
  }
  function addSection(kind: Exclude<SectionKind, 'personal'>) {
    patchData((d) => d.sectionOrder.includes(kind) ? d : { ...d, sectionOrder: [...d.sectionOrder, kind] });
  }

  const versions = versionsQuery.data ?? [];
  const missingSections = ALL_OPTIONAL_SECTIONS.filter((s) => !draftData.sectionOrder.includes(s));

  return (
    <div className="bg-[var(--bg)] min-h-screen">
      {/* ===== Top toolbar ===== */}
      <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
        <div className="mx-auto max-w-[1500px] px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[#065F46] dark:text-[#84CC16]">
            <FileText size={20} />
            <span className="font-heading font-bold">CV Builder</span>
          </div>

          <VersionSwitcher
            versions={versions}
            activeId={activeId}
            onPick={pickVersion}
            onNew={handleNew}
            onDuplicate={(id) => duplicateMutation.mutate(id)}
            onDelete={(id) => {
              if (confirm('Delete this CV version? This cannot be undone.')) deleteMutation.mutate(id);
            }}
            onRename={(id, title) => {
              if (id === activeId) {
                setDraftTitle(title);
                setDirty(true);
              } else {
                saveMutation.mutate({
                  id,
                  title,
                  template: versions.find((v) => v.id === id)?.template || 'modern',
                  data: versions.find((v) => v.id === id)?.data || emptyCVData()
                });
              }
            }}
            isCreating={createMutation.isPending}
          />

          <div className="ml-auto flex items-center gap-2">
            <SaveStatus dirty={dirty} saving={saveMutation.isPending} hasActive={Boolean(activeId)} />
            <button
              type="button"
              onClick={handleManualSave}
              disabled={!activeId || saveMutation.isPending}
              className="btn-ghost text-sm"
              title="Save now"
            >
              <Save size={16} /> Save
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={!activeId}
              className="btn-primary text-sm"
            >
              <Download size={16} /> Download PDF
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="btn-ghost text-sm md:hidden"
              aria-label="Toggle preview"
            >
              {previewOpen ? <EyeOff size={16} /> : <Eye size={16} />}
              {previewOpen ? 'Hide' : 'Preview'}
            </button>
          </div>
        </div>
      </div>

      {versions.length === 0 && !versionsQuery.isLoading ? (
        <EmptyVersionsState onCreate={handleNew} creating={createMutation.isPending} />
      ) : (
        <div className="mx-auto max-w-[1500px] px-4 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          {/* ===== Left: editor ===== */}
          <div className={`space-y-5 ${previewOpen ? 'hidden md:block' : ''}`}>
            {/* Title + template picker */}
            <div className="card space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">CV title</span>
                  <input
                    className="input mt-1.5"
                    value={draftTitle}
                    onChange={(e) => { setDraftTitle(e.target.value); setDirty(true); }}
                    placeholder="e.g. Software Engineer — Acme"
                  />
                </label>
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Template</span>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['modern', 'classic', 'ats-pure'] as CVTemplate[]).map((t) => {
                    const active = draftTemplate === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setDraftTemplate(t); setDirty(true); }}
                        className={`text-left rounded-xl border p-3 transition-all ${
                          active
                            ? 'border-[#065F46] bg-[#065F46]/5'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-bold text-sm">{TEMPLATE_LABELS[t]}</span>
                          {active && <Check size={14} className="text-[#065F46] dark:text-[#84CC16]" />}
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{TEMPLATE_DESCRIPTIONS[t]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Personal — always at top */}
            <SectionShell title={SECTION_LABELS.personal} canMoveUp={false} canMoveDown={false} canRemove={false}>
              <PersonalEditor
                value={draftData.personal}
                onChange={(personal) => patchData((d) => ({ ...d, personal }))}
              />
            </SectionShell>

            {/* Reorderable sections */}
            {draftData.sectionOrder.map((kind, idx) => {
              const canMoveUp = idx > 0;
              const canMoveDown = idx < draftData.sectionOrder.length - 1;
              return (
                <SectionShell
                  key={kind}
                  title={SECTION_LABELS[kind]}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  canRemove
                  onMoveUp={() => moveSection(kind, -1)}
                  onMoveDown={() => moveSection(kind, 1)}
                  onRemove={() => removeSection(kind)}
                >
                  {kind === 'summary' && (
                    <SummaryEditor value={draftData.summary} onChange={(v) => patchData((d) => ({ ...d, summary: v }))} />
                  )}
                  {kind === 'experience' && (
                    <ExperienceEditor
                      list={draftData.experience}
                      onChange={(list) => patchData((d) => ({ ...d, experience: list }))}
                    />
                  )}
                  {kind === 'education' && (
                    <EducationEditor
                      list={draftData.education}
                      onChange={(list) => patchData((d) => ({ ...d, education: list }))}
                    />
                  )}
                  {kind === 'skills' && (
                    <TagListEditor
                      list={draftData.skills}
                      onChange={(list) => patchData((d) => ({ ...d, skills: list }))}
                      placeholder="Type a skill, press Enter"
                    />
                  )}
                  {kind === 'projects' && (
                    <ProjectsEditor
                      list={draftData.projects}
                      onChange={(list) => patchData((d) => ({ ...d, projects: list }))}
                    />
                  )}
                  {kind === 'certifications' && (
                    <CertificationsEditor
                      list={draftData.certifications}
                      onChange={(list) => patchData((d) => ({ ...d, certifications: list }))}
                    />
                  )}
                  {kind === 'languages' && (
                    <LanguagesEditor
                      list={draftData.languages}
                      onChange={(list) => patchData((d) => ({ ...d, languages: list }))}
                    />
                  )}
                </SectionShell>
              );
            })}

            {/* Add-section bar */}
            {missingSections.length > 0 && (
              <div className="card">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-2">Add a section</div>
                <div className="flex flex-wrap gap-2">
                  {missingSections.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSection(s)}
                      className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold hover:border-[#065F46]/50"
                    >
                      <Plus size={14} className="inline -mt-0.5 mr-1" />
                      {SECTION_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ===== Right: live preview ===== */}
          <div className={`${previewOpen ? '' : 'hidden md:block'}`}>
            <div className="lg:sticky lg:top-[68px]">
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Live preview · A4</div>
                  <div className="hidden md:flex items-center gap-1 text-[var(--muted)] text-xs">
                    <Monitor size={14} className="hidden lg:inline" />
                    <Smartphone size={14} className="lg:hidden" />
                  </div>
                </div>
                <div
                  className="overflow-auto rounded-lg bg-stone-100 dark:bg-stone-900 p-3"
                  style={{ maxHeight: 'calc(100vh - 180px)' }}
                >
                  <PreviewScaler data={draftData} template={draftTemplate} />
                </div>
              </div>

              <div className="mt-3 text-xs text-[var(--muted)] flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 text-[#065F46] dark:text-[#84CC16] shrink-0" />
                <p>
                  <span className="font-semibold text-[var(--fg)]">Tip:</span> Use the STAR helper on Experience bullets and pick strong impact verbs. The preview scales to fit; the printed PDF keeps full A4 size.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

function PreviewScaler({ data, template }: { data: CVData; template: CVTemplate }) {
  // Scale to ~88% so the A4 page fits side-by-side on most desktop viewports
  // without horizontal scroll. The print page uses scale=1.
  return (
    <div style={{ minWidth: '210mm' }}>
      <CVPreview data={data} template={template} scale={1} />
    </div>
  );
}

function SaveStatus({ dirty, saving, hasActive }: { dirty: boolean; saving: boolean; hasActive: boolean }) {
  if (!hasActive) return <span className="text-xs text-[var(--muted)]">No CV selected</span>;
  if (saving) return <span className="text-xs text-[var(--muted)] animate-pulse">Saving…</span>;
  if (dirty) return <span className="text-xs text-[#92400E] dark:text-[#F59E0B]">Unsaved changes</span>;
  return <span className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><Check size={12} /> Saved</span>;
}

function VersionSwitcher({
  versions, activeId, onPick, onNew, onDuplicate, onDelete, onRename, isCreating
}: {
  versions: CVRecord[];
  activeId: string | null;
  onPick: (v: CVRecord) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  isCreating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = versions.find((v) => v.id === activeId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold hover:border-[#065F46]/50 max-w-[280px] truncate"
      >
        {active ? active.title : 'Pick a CV'} ▾
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[320px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-2">
          <div className="max-h-[280px] overflow-auto">
            {versions.length === 0 && (
              <div className="px-2 py-3 text-sm text-[var(--muted)]">No CVs yet.</div>
            )}
            {versions.map((v) => {
              const isActive = v.id === activeId;
              const isRenaming = renamingId === v.id;
              return (
                <div key={v.id} className={`rounded-lg px-2 py-1.5 ${isActive ? 'bg-[#065F46]/8 dark:bg-[#84CC16]/10' : 'hover:bg-[var(--bg)]'}`}>
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = renameValue.trim() || v.title;
                        onRename(v.id, trimmed);
                        setRenamingId(null);
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        autoFocus
                        className="input text-sm py-1"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                      />
                      <button type="submit" className="btn-ghost text-xs"><Check size={14} /></button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => setRenamingId(null)}><X size={14} /></button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { onPick(v); setOpen(false); }}
                        className="flex-1 text-left text-sm truncate"
                      >
                        {v.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRenamingId(v.id); setRenameValue(v.title); }}
                        className="text-xs text-[var(--muted)] hover:text-[var(--fg)] px-2"
                        title="Rename"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => { onDuplicate(v.id); setOpen(false); }}
                        className="text-[var(--muted)] hover:text-[var(--fg)]"
                        title="Duplicate"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { onDelete(v.id); }}
                        className="text-[var(--muted)] hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => { onNew(); setOpen(false); }}
              disabled={isCreating}
              className="w-full btn-primary text-sm justify-center"
            >
              <Plus size={14} /> New CV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyVersionsState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
        <FileText size={26} />
      </div>
      <h2 className="mt-4 font-heading text-2xl font-bold">Start your first CV</h2>
      <p className="mt-2 text-[var(--muted)]">
        Create as many tailored versions as you need — one per role, one per company. Switch between them with a click.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="btn-primary mt-6"
      >
        <Plus size={16} /> Create CV
      </button>
    </div>
  );
}

function SectionShell({
  title, canMoveUp, canMoveDown, canRemove, onMoveUp, onMoveDown, onRemove, children
}: {
  title: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <header className="flex items-center gap-2 mb-3">
        <h2 className="font-heading font-bold">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="btn-ghost text-xs disabled:opacity-30"
            title="Move up"
            aria-label={`Move ${title} up`}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="btn-ghost text-xs disabled:opacity-30"
            title="Move down"
            aria-label={`Move ${title} down`}
          >
            <ArrowDown size={14} />
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600"
              title="Remove section"
              aria-label={`Remove ${title}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

// ---------- Personal ----------
function PersonalEditor({
  value, onChange
}: { value: import('../../components/career-tools/cv/types').Personal; onChange: (p: import('../../components/career-tools/cv/types').Personal) => void }) {
  const set = (k: keyof typeof value, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input className="input sm:col-span-2" placeholder="Full name" value={value.fullName} onChange={(e) => set('fullName', e.target.value)} />
      <input className="input" placeholder="Email" type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
      <input className="input" placeholder="Phone" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      <input className="input" placeholder="Location (City, Country)" value={value.location} onChange={(e) => set('location', e.target.value)} />
      <input className="input" placeholder="LinkedIn URL" value={value.linkedin} onChange={(e) => set('linkedin', e.target.value)} />
      <input className="input sm:col-span-2" placeholder="Personal website / Portfolio URL" value={value.website} onChange={(e) => set('website', e.target.value)} />
    </div>
  );
}

// ---------- Summary ----------
function SummaryEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <textarea
        className="input min-h-[100px]"
        placeholder="2–4 sentences. Who you are, what you do, what you're aiming for."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-1 text-xs text-[var(--muted)]">{value.length} characters</div>
    </div>
  );
}

// ---------- Experience ----------
function ExperienceEditor({
  list, onChange
}: {
  list: import('../../components/career-tools/cv/types').ExperienceEntry[];
  onChange: (l: import('../../components/career-tools/cv/types').ExperienceEntry[]) => void;
}) {
  function update(idx: number, patch: Partial<typeof list[number]>) {
    onChange(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= list.length) return;
    const copy = [...list];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }
  function remove(idx: number) {
    onChange(list.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([
      ...list,
      { id: makeId('exp'), company: '', role: '', location: '', start: '', end: '', current: false, bullets: [''] }
    ]);
  }
  return (
    <div className="space-y-4">
      {list.map((e, idx) => (
        <div key={e.id} className="rounded-xl border border-[var(--border)] p-3 space-y-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--muted)] font-semibold">Entry {idx + 1}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className="btn-ghost text-xs" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp size={14} /></button>
              <button type="button" className="btn-ghost text-xs" onClick={() => move(idx, 1)} disabled={idx === list.length - 1}><ArrowDown size={14} /></button>
              <button type="button" className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600" onClick={() => remove(idx)}><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input" placeholder="Role / Title" value={e.role} onChange={(ev) => update(idx, { role: ev.target.value })} />
            <input className="input" placeholder="Company" value={e.company} onChange={(ev) => update(idx, { company: ev.target.value })} />
            <input className="input" placeholder="Location" value={e.location} onChange={(ev) => update(idx, { location: ev.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Start (YYYY-MM)" value={e.start} onChange={(ev) => update(idx, { start: ev.target.value })} />
              <input className="input" placeholder="End (YYYY-MM)" value={e.end} disabled={e.current} onChange={(ev) => update(idx, { end: ev.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={e.current} onChange={(ev) => update(idx, { current: ev.target.checked, end: ev.target.checked ? '' : e.end })} />
              I currently work here
            </label>
          </div>

          <BulletsEditor
            bullets={e.bullets}
            onChange={(bullets) => update(idx, { bullets })}
          />
        </div>
      ))}
      <button type="button" onClick={add} className="btn-outline text-sm"><Plus size={14} /> Add experience</button>
    </div>
  );
}

function BulletsEditor({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  const [starOpen, setStarOpen] = useState(false);
  const [starDraft, setStarDraft] = useState({ s: '', t: '', a: '', r: '' });
  const lastFocusedRef = useRef<HTMLTextAreaElement | null>(null);

  function set(idx: number, v: string) {
    onChange(bullets.map((b, i) => (i === idx ? v : b)));
  }
  function addBullet() {
    onChange([...bullets, '']);
  }
  function remove(idx: number) {
    onChange(bullets.filter((_, i) => i !== idx));
  }

  function insertVerb(verb: string) {
    const el = lastFocusedRef.current;
    if (el) {
      // Insert at cursor in the most recently focused bullet textarea.
      const idx = Number(el.dataset.bulletIdx ?? -1);
      if (idx >= 0) {
        const v = bullets[idx] ?? '';
        const start = el.selectionStart ?? v.length;
        const end = el.selectionEnd ?? v.length;
        const next = v.slice(0, start) + verb + ' ' + v.slice(end);
        set(idx, next);
        // Restore focus + caret after React rerender.
        requestAnimationFrame(() => {
          el.focus();
          const caret = start + verb.length + 1;
          el.setSelectionRange(caret, caret);
        });
        return;
      }
    }
    // Fallback — append to last bullet (or create one).
    const lastIdx = bullets.length - 1;
    if (lastIdx < 0) onChange([verb + ' ']);
    else set(lastIdx, (bullets[lastIdx] ? bullets[lastIdx] + ' ' : '') + verb + ' ');
  }

  function insertStar() {
    const parts: string[] = [];
    if (starDraft.a) parts.push(starDraft.a.trim());
    if (starDraft.r) parts.push(`resulting in ${starDraft.r.trim()}`);
    let line = parts.join(', ');
    if (starDraft.s || starDraft.t) {
      const ctx = [starDraft.s, starDraft.t].filter(Boolean).join('; ').trim();
      if (ctx) line = `${ctx ? ctx + ' — ' : ''}${line}`;
    }
    if (!line) {
      toast.error('Fill in at least Action or Result');
      return;
    }
    onChange([...bullets, line]);
    setStarDraft({ s: '', t: '', a: '', r: '' });
    setStarOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Bullets</span>
        <button
          type="button"
          onClick={() => setStarOpen((v) => !v)}
          className="text-xs font-semibold text-[#065F46] dark:text-[#84CC16] hover:underline"
        >
          {starOpen ? 'Close STAR helper' : 'STAR helper'}
        </button>
      </div>

      {/* Impact verbs strip */}
      <div className="mb-2 flex flex-wrap gap-1">
        {IMPACT_VERBS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertVerb(v)}
            className="rounded-full bg-[#065F46]/10 hover:bg-[#065F46]/20 text-[#065F46] dark:bg-[#84CC16]/15 dark:hover:bg-[#84CC16]/25 dark:text-[#84CC16] px-2.5 py-0.5 text-xs font-semibold"
            title={`Insert "${v}"`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* STAR popover */}
      {starOpen && (
        <div className="mb-3 rounded-xl border border-[#065F46]/30 bg-[#065F46]/5 dark:bg-[#84CC16]/5 p-3 space-y-2">
          <div className="text-xs text-[var(--muted)]">
            <span className="font-bold text-[var(--fg)]">STAR format:</span> describe the Situation, Task, Action, then Result. We'll combine into one bullet.
          </div>
          <textarea className="input min-h-[42px]" placeholder="Situation — context (e.g. 'Onboarding flow had a 40% drop-off')" value={starDraft.s} onChange={(e) => setStarDraft({ ...starDraft, s: e.target.value })} />
          <textarea className="input min-h-[42px]" placeholder="Task — what you needed to do" value={starDraft.t} onChange={(e) => setStarDraft({ ...starDraft, t: e.target.value })} />
          <textarea className="input min-h-[42px]" placeholder="Action — what you did (start with a verb)" value={starDraft.a} onChange={(e) => setStarDraft({ ...starDraft, a: e.target.value })} />
          <textarea className="input min-h-[42px]" placeholder="Result — quantified impact (e.g. '20% faster, $30k saved')" value={starDraft.r} onChange={(e) => setStarDraft({ ...starDraft, r: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setStarOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-sm" onClick={insertStar}><Plus size={14} /> Insert bullet</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 text-[var(--muted)] text-sm shrink-0">•</span>
            <textarea
              data-bullet-idx={i}
              ref={(el) => { if (el && document.activeElement === el) lastFocusedRef.current = el; }}
              onFocus={(e) => { lastFocusedRef.current = e.currentTarget; }}
              className="input min-h-[44px] flex-1"
              placeholder="Quantified achievement, starting with a strong verb"
              value={b}
              onChange={(e) => set(i, e.target.value)}
            />
            <button type="button" onClick={() => remove(i)} className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600 mt-1" title="Remove bullet">
              <X size={14} />
            </button>
          </div>
        ))}
        <button type="button" onClick={addBullet} className="btn-ghost text-xs">
          <Plus size={12} /> Add bullet
        </button>
      </div>
    </div>
  );
}

// ---------- Education ----------
function EducationEditor({
  list, onChange
}: {
  list: import('../../components/career-tools/cv/types').EducationEntry[];
  onChange: (l: import('../../components/career-tools/cv/types').EducationEntry[]) => void;
}) {
  function update(idx: number, patch: Partial<typeof list[number]>) {
    onChange(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number) { onChange(list.filter((_, i) => i !== idx)); }
  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= list.length) return;
    const copy = [...list];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }
  function add() {
    onChange([...list, { id: makeId('edu'), school: '', degree: '', field: '', start: '', end: '', gpa: '' }]);
  }
  return (
    <div className="space-y-4">
      {list.map((e, idx) => (
        <div key={e.id} className="rounded-xl border border-[var(--border)] p-3 space-y-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--muted)] font-semibold">Entry {idx + 1}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className="btn-ghost text-xs" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp size={14} /></button>
              <button type="button" className="btn-ghost text-xs" onClick={() => move(idx, 1)} disabled={idx === list.length - 1}><ArrowDown size={14} /></button>
              <button type="button" className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600" onClick={() => remove(idx)}><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input sm:col-span-2" placeholder="School / Institution" value={e.school} onChange={(ev) => update(idx, { school: ev.target.value })} />
            <input className="input" placeholder="Degree (e.g. BSc)" value={e.degree} onChange={(ev) => update(idx, { degree: ev.target.value })} />
            <input className="input" placeholder="Field of study" value={e.field} onChange={(ev) => update(idx, { field: ev.target.value })} />
            <input className="input" placeholder="Start (YYYY-MM)" value={e.start} onChange={(ev) => update(idx, { start: ev.target.value })} />
            <input className="input" placeholder="End (YYYY-MM)" value={e.end} onChange={(ev) => update(idx, { end: ev.target.value })} />
            <input className="input sm:col-span-2" placeholder="GPA (optional)" value={e.gpa} onChange={(ev) => update(idx, { gpa: ev.target.value })} />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-outline text-sm"><Plus size={14} /> Add education</button>
    </div>
  );
}

// ---------- Skills / Tags ----------
function TagListEditor({
  list, onChange, placeholder
}: { list: string[]; onChange: (l: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('');
  function commit() {
    const v = input.trim();
    if (!v) return;
    if (list.includes(v)) { setInput(''); return; }
    onChange([...list, v]);
    setInput('');
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {list.map((s, i) => (
          <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-[#84CC16]/15 text-[#365314] dark:text-[#84CC16] px-2.5 py-1 text-xs font-semibold">
            {s}
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${s}`} className="hover:text-rose-600">
              <X size={12} />
            </button>
          </span>
        ))}
        {list.length === 0 && <span className="text-xs text-[var(--muted)]">No items yet.</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button type="button" onClick={commit} className="btn-outline text-sm"><Plus size={14} /> Add</button>
      </div>
    </div>
  );
}

// ---------- Projects ----------
function ProjectsEditor({
  list, onChange
}: {
  list: import('../../components/career-tools/cv/types').ProjectEntry[];
  onChange: (l: import('../../components/career-tools/cv/types').ProjectEntry[]) => void;
}) {
  function update(idx: number, patch: Partial<typeof list[number]>) {
    onChange(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number) { onChange(list.filter((_, i) => i !== idx)); }
  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= list.length) return;
    const copy = [...list];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }
  function add() {
    onChange([...list, { id: makeId('prj'), name: '', description: '', link: '', tech: [] }]);
  }
  return (
    <div className="space-y-4">
      {list.map((p, idx) => (
        <div key={p.id} className="rounded-xl border border-[var(--border)] p-3 space-y-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--muted)] font-semibold">Project {idx + 1}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className="btn-ghost text-xs" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp size={14} /></button>
              <button type="button" className="btn-ghost text-xs" onClick={() => move(idx, 1)} disabled={idx === list.length - 1}><ArrowDown size={14} /></button>
              <button type="button" className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600" onClick={() => remove(idx)}><Trash2 size={14} /></button>
            </div>
          </div>
          <input className="input" placeholder="Project name" value={p.name} onChange={(e) => update(idx, { name: e.target.value })} />
          <input className="input" placeholder="Link (URL)" value={p.link} onChange={(e) => update(idx, { link: e.target.value })} />
          <textarea className="input min-h-[60px]" placeholder="Short description" value={p.description} onChange={(e) => update(idx, { description: e.target.value })} />
          <div>
            <span className="text-xs text-[var(--muted)] font-semibold">Tech stack</span>
            <div className="mt-1">
              <TagListEditor
                list={p.tech}
                onChange={(tech) => update(idx, { tech })}
                placeholder="Add a tech/tool, press Enter"
              />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-outline text-sm"><Plus size={14} /> Add project</button>
    </div>
  );
}

// ---------- Certifications ----------
function CertificationsEditor({
  list, onChange
}: {
  list: import('../../components/career-tools/cv/types').CertificationEntry[];
  onChange: (l: import('../../components/career-tools/cv/types').CertificationEntry[]) => void;
}) {
  function update(idx: number, patch: Partial<typeof list[number]>) {
    onChange(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number) { onChange(list.filter((_, i) => i !== idx)); }
  function add() {
    onChange([...list, { id: makeId('cert'), name: '', issuer: '', date: '', url: '' }]);
  }
  return (
    <div className="space-y-3">
      {list.map((c, idx) => (
        <div key={c.id} className="rounded-xl border border-[var(--border)] p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Certification name" value={c.name} onChange={(e) => update(idx, { name: e.target.value })} />
          <input className="input" placeholder="Issuing organization" value={c.issuer} onChange={(e) => update(idx, { issuer: e.target.value })} />
          <input className="input" placeholder="Date (YYYY-MM)" value={c.date} onChange={(e) => update(idx, { date: e.target.value })} />
          <input className="input" placeholder="Verification URL" value={c.url} onChange={(e) => update(idx, { url: e.target.value })} />
          <div className="sm:col-span-2 flex justify-end">
            <button type="button" className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600" onClick={() => remove(idx)}><Trash2 size={14} /> Remove</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-outline text-sm"><Plus size={14} /> Add certification</button>
    </div>
  );
}

// ---------- Languages ----------
function LanguagesEditor({
  list, onChange
}: {
  list: import('../../components/career-tools/cv/types').LanguageEntry[];
  onChange: (l: import('../../components/career-tools/cv/types').LanguageEntry[]) => void;
}) {
  function update(idx: number, patch: Partial<typeof list[number]>) {
    onChange(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number) { onChange(list.filter((_, i) => i !== idx)); }
  function add() {
    onChange([...list, { id: makeId('lang'), language: '', proficiency: 'Conversational' }]);
  }
  const PROFICIENCIES = ['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'];
  return (
    <div className="space-y-3">
      {list.map((l, idx) => (
        <div key={l.id} className="rounded-xl border border-[var(--border)] p-3 grid grid-cols-1 sm:grid-cols-[2fr_2fr_auto] gap-3 items-center">
          <input className="input" placeholder="Language" value={l.language} onChange={(e) => update(idx, { language: e.target.value })} />
          <select className="input" value={l.proficiency} onChange={(e) => update(idx, { proficiency: e.target.value })}>
            {PROFICIENCIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" className="btn-ghost text-xs text-[var(--muted)] hover:text-rose-600" onClick={() => remove(idx)}><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-outline text-sm"><Plus size={14} /> Add language</button>
    </div>
  );
}
