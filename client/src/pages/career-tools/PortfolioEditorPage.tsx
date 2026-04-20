import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, ExternalLink, Upload, Eye, EyeOff, Lock,
  Save, Layout, X, Image as ImageIcon
} from 'lucide-react';
import { api, resolveAsset } from '../../services/api';

// Mirrors what the server returns (passwordHash is stripped server-side and
// surfaced as `hasPassword`).
type Link = { label: string; url: string };
type Project = {
  id: string;
  portfolioId: string;
  position: number;
  title: string;
  summary: string;
  role?: string | null;
  coverUrl?: string | null;
  techStack: string[];
  externalUrl?: string | null;
  caseStudyMd?: string | null;
};
type Portfolio = {
  id: string;
  userId: string;
  slug: string;
  title: string;
  tagline?: string | null;
  bio?: string | null;
  theme: 'clean' | 'editorial' | string;
  contactEmail?: string | null;
  links?: Link[] | null;
  isPublished: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  projects: Project[];
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Lightweight activity ping; failures are silent so the UI never blocks on it.
function logActivity(action: 'open' | 'save' | 'publish', metadata?: any) {
  api.post('/career-tools/activity', { tool: 'portfolio', action, metadata }).catch(() => {});
}

export default function PortfolioEditorPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { logActivity('open'); }, []);

  const { data: portfolios = [], isLoading } = useQuery<Portfolio[]>({
    queryKey: ['portfolios'],
    queryFn: async () => (await api.get('/portfolios')).data.data
  });

  const active = useMemo(
    () => portfolios.find((p) => p.id === activeId) || null,
    [portfolios, activeId]
  );

  return (
    <div className="bg-[var(--bg)]">
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            — Career Tools / Portfolio
          </div>
          <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
            Portfolio Builder
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Publish a polished, public portfolio at <code className="rounded bg-[var(--card)] px-1.5 py-0.5 text-[13px] border border-[var(--border)]">/p/&lt;slug&gt;</code>.
            Pick a theme, add case studies, optionally gate it with a password.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          {/* Sidebar — list + create */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
                Your portfolios
              </h2>
              <button
                type="button"
                onClick={() => { setCreating(true); setActiveId(null); }}
                className="btn-primary"
                style={{ padding: '0.4rem 0.75rem', fontSize: 13 }}
              >
                <Plus size={14} /> New
              </button>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--muted)]">
                Loading…
              </div>
            ) : portfolios.length === 0 && !creating ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                You haven't created a portfolio yet. Click <strong>New</strong> to start one.
              </div>
            ) : (
              <ul className="space-y-2">
                {portfolios.map((p) => {
                  const isActive = p.id === activeId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => { setActiveId(p.id); setCreating(false); }}
                        className={`group w-full rounded-2xl border p-3 text-left transition ${
                          isActive
                            ? 'border-[#065F46] bg-[#065F46]/5'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-heading text-sm font-bold">{p.title}</div>
                            <div className="mt-0.5 truncate text-xs text-[var(--muted)]">/p/{p.slug}</div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              p.isPublished
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                            }`}
                          >
                            {p.isPublished ? 'Live' : 'Draft'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                          <Layout size={12} /> {p.theme}
                          {p.hasPassword && (
                            <>
                              <span>·</span>
                              <Lock size={12} /> Gated
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right pane */}
          <div>
            {creating ? (
              <CreateForm
                onCancel={() => setCreating(false)}
                onCreated={(id) => {
                  setCreating(false);
                  setActiveId(id);
                  qc.invalidateQueries({ queryKey: ['portfolios'] });
                }}
              />
            ) : active ? (
              <PortfolioEditor
                portfolio={active}
                onChanged={() => qc.invalidateQueries({ queryKey: ['portfolios'] })}
                onDeleted={() => { setActiveId(null); qc.invalidateQueries({ queryKey: ['portfolios'] }); }}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] py-20 text-center text-[var(--muted)]">
                <Layout size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Pick a portfolio from the left, or create a new one.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ----------------- Create form -----------------

function CreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [theme, setTheme] = useState<'clean' | 'editorial'>('clean');
  const [busy, setBusy] = useState(false);

  const slugError = slug && !SLUG_RE.test(slug)
    ? 'Lowercase letters, numbers and dashes only'
    : slug && (slug.length < 3 || slug.length > 40)
      ? 'Must be 3–40 characters'
      : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim() || slugError) return;
    setBusy(true);
    try {
      const { data } = await api.post('/portfolios', { title: title.trim(), slug: slug.trim(), theme });
      toast.success('Portfolio created');
      logActivity('save', { stage: 'create', portfolioId: data.data.id });
      onCreated(data.data.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Could not create';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="card space-y-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">New portfolio</h2>
        <button type="button" onClick={onCancel} className="btn-ghost" aria-label="Cancel">
          <X size={16} />
        </button>
      </div>

      <Field label="Title" hint="Shown as the page heading.">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ama's Product Design Portfolio"
          required
        />
      </Field>

      <Field label="Slug" hint="Public URL: /p/your-slug">
        <input
          className="input"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="ama-design"
          required
        />
        {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
      </Field>

      <Field label="Theme">
        <div className="flex flex-wrap gap-2">
          {(['clean', 'editorial'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize transition ${
                theme === t
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        <button type="submit" disabled={busy || !title || !slug || !!slugError} className="btn-primary">
          {busy ? 'Creating…' : 'Create portfolio'}
        </button>
      </div>
    </motion.form>
  );
}

// ----------------- Portfolio editor -----------------

function PortfolioEditor({
  portfolio,
  onChanged,
  onDeleted
}: {
  portfolio: Portfolio;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState({
    title: portfolio.title,
    slug: portfolio.slug,
    tagline: portfolio.tagline ?? '',
    bio: portfolio.bio ?? '',
    theme: (portfolio.theme === 'editorial' ? 'editorial' : 'clean') as 'clean' | 'editorial',
    contactEmail: portfolio.contactEmail ?? '',
    links: (portfolio.links ?? []) as Link[]
  });
  const [savingMeta, setSavingMeta] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  // When user picks a different portfolio, reset draft to its values.
  useEffect(() => {
    setDraft({
      title: portfolio.title,
      slug: portfolio.slug,
      tagline: portfolio.tagline ?? '',
      bio: portfolio.bio ?? '',
      theme: (portfolio.theme === 'editorial' ? 'editorial' : 'clean'),
      contactEmail: portfolio.contactEmail ?? '',
      links: (portfolio.links ?? []) as Link[]
    });
  }, [portfolio.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const slugError = draft.slug && !SLUG_RE.test(draft.slug)
    ? 'Lowercase letters, numbers and dashes only'
    : draft.slug && (draft.slug.length < 3 || draft.slug.length > 40)
      ? 'Must be 3–40 characters'
      : '';

  const saveMeta = async () => {
    if (slugError) {
      toast.error(slugError);
      return;
    }
    setSavingMeta(true);
    try {
      await api.patch(`/portfolios/${portfolio.id}`, {
        title: draft.title,
        slug: draft.slug,
        tagline: draft.tagline || null,
        bio: draft.bio || null,
        theme: draft.theme,
        contactEmail: draft.contactEmail || null,
        links: draft.links
      });
      toast.success('Saved');
      logActivity('save', { portfolioId: portfolio.id });
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Save failed');
    } finally {
      setSavingMeta(false);
    }
  };

  const togglePublish = async () => {
    try {
      await api.post(`/portfolios/${portfolio.id}/publish`, { isPublished: !portfolio.isPublished });
      toast.success(portfolio.isPublished ? 'Unpublished' : 'Published');
      logActivity('publish', { portfolioId: portfolio.id, published: !portfolio.isPublished });
      onChanged();
    } catch {
      toast.error('Could not update publish status');
    }
  };

  const deletePortfolio = async () => {
    if (!confirm('Delete this portfolio? This cannot be undone.')) return;
    try {
      await api.delete(`/portfolios/${portfolio.id}`);
      toast.success('Deleted');
      onDeleted();
    } catch {
      toast.error('Delete failed');
    }
  };

  const setPassword = async () => {
    setPwdBusy(true);
    try {
      await api.post(`/portfolios/${portfolio.id}/password`, { password: pwdValue });
      toast.success(pwdValue ? 'Password set' : 'Password cleared');
      setPwdValue('');
      setShowPwd(false);
      onChanged();
    } catch {
      toast.error('Could not update password');
    } finally {
      setPwdBusy(false);
    }
  };

  const updateLink = (i: number, patch: Partial<Link>) =>
    setDraft((d) => ({ ...d, links: d.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const addLink = () => setDraft((d) => ({ ...d, links: [...d.links, { label: '', url: '' }] }));
  const removeLink = (i: number) => setDraft((d) => ({ ...d, links: d.links.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                portfolio.isPublished
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              {portfolio.isPublished ? 'Published' : 'Draft'}
            </span>
            {portfolio.hasPassword && (
              <span className="badge"><Lock size={12} /> Password</span>
            )}
          </div>
          <h2 className="mt-1 font-heading text-2xl font-bold">{portfolio.title}</h2>
          <p className="text-sm text-[var(--muted)]">
            Public URL:{' '}
            <a
              href={`/p/${portfolio.slug}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#065F46] underline hover:text-[#064E3B] dark:text-[#84CC16]"
            >
              /p/{portfolio.slug}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/p/${portfolio.slug}`}
            target="_blank"
            rel="noreferrer"
            className="btn-outline"
          >
            <ExternalLink size={14} /> View
          </a>
          <button type="button" onClick={togglePublish} className="btn-accent">
            {portfolio.isPublished ? <><EyeOff size={14} /> Unpublish</> : <><Eye size={14} /> Publish</>}
          </button>
          <button type="button" onClick={deletePortfolio} className="btn-ghost text-red-600">
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Meta editor */}
      <div className="card space-y-5">
        <h3 className="font-heading text-lg font-bold">Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Title">
            <input className="input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </Field>
          <Field label="Slug" hint="Public URL: /p/your-slug">
            <input
              className="input"
              value={draft.slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase() }))}
            />
            {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
          </Field>
          <Field label="Tagline" hint="One-line summary shown under your name.">
            <input
              className="input"
              value={draft.tagline}
              onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
              placeholder="Product designer · Accra → Sunyani"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              className="input"
              value={draft.contactEmail}
              onChange={(e) => setDraft((d) => ({ ...d, contactEmail: e.target.value }))}
              placeholder="you@example.com"
            />
          </Field>
        </div>

        <Field label="Bio" hint="A short paragraph about you.">
          <textarea
            className="input min-h-[120px]"
            value={draft.bio}
            onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
          />
        </Field>

        <Field label="Theme">
          <div className="flex flex-wrap gap-2">
            {(['clean', 'editorial'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, theme: t }))}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize transition ${
                  draft.theme === t
                    ? 'border-[#065F46] bg-[#065F46] text-white'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-bold">Links</label>
            <button type="button" onClick={addLink} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: 12 }}>
              <Plus size={14} /> Add link
            </button>
          </div>
          {draft.links.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No links yet. Add LinkedIn, GitHub, Behance, etc.</p>
          ) : (
            <ul className="space-y-2">
              {draft.links.map((l, i) => (
                <li key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input
                    className="input"
                    placeholder="LinkedIn"
                    value={l.label}
                    onChange={(e) => updateLink(i, { label: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="https://…"
                    value={l.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                  />
                  <button type="button" onClick={() => removeLink(i)} className="btn-ghost text-red-600" aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={saveMeta} disabled={savingMeta || !!slugError} className="btn-primary">
            <Save size={14} /> {savingMeta ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Password gate */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg font-bold flex items-center gap-2">
              <Lock size={16} /> Password protection
            </h3>
            <p className="text-sm text-[var(--muted)]">
              {portfolio.hasPassword
                ? 'Visitors must enter a password before viewing.'
                : 'Off — anyone with the link can view.'}
            </p>
          </div>
          <button type="button" onClick={() => setShowPwd((s) => !s)} className="btn-outline">
            {showPwd ? 'Cancel' : portfolio.hasPassword ? 'Change / clear' : 'Set password'}
          </button>
        </div>
        {showPwd && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              className="input flex-1 min-w-[220px]"
              placeholder="New password (leave empty to clear)"
              value={pwdValue}
              onChange={(e) => setPwdValue(e.target.value)}
            />
            <button onClick={setPassword} disabled={pwdBusy} className="btn-primary">
              {pwdBusy ? 'Saving…' : pwdValue ? 'Set password' : 'Clear password'}
            </button>
          </div>
        )}
      </div>

      {/* Projects */}
      <ProjectsSection portfolio={portfolio} onChanged={onChanged} />
    </div>
  );
}

function ProjectsSection({ portfolio, onChanged }: { portfolio: Portfolio; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold">Projects</h3>
        <button type="button" onClick={() => setAdding(true)} className="btn-primary">
          <Plus size={14} /> Add project
        </button>
      </div>

      {adding && (
        <ProjectForm
          portfolioId={portfolio.id}
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); onChanged(); }}
        />
      )}

      {portfolio.projects.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          No projects yet. Add your first case study above.
        </p>
      ) : (
        <ul className="space-y-3">
          {portfolio.projects.map((p) => (
            <ProjectRow key={p.id} portfolioId={portfolio.id} project={p} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({
  portfolioId,
  project,
  onChanged
}: {
  portfolioId: string;
  project: Project;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const remove = async () => {
    if (!confirm(`Delete project "${project.title}"?`)) return;
    try {
      await api.delete(`/portfolios/${portfolioId}/projects/${project.id}`);
      toast.success('Project deleted');
      onChanged();
    } catch {
      toast.error('Delete failed');
    }
  };

  if (editing) {
    return (
      <li>
        <ProjectForm
          portfolioId={portfolioId}
          project={project}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 sm:flex-row sm:items-start">
      <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {project.coverUrl ? (
          <img src={resolveAsset(project.coverUrl)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
            <ImageIcon size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-base font-bold">{project.title}</div>
        {project.role && <div className="text-xs text-[var(--muted)]">{project.role}</div>}
        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{project.summary}</p>
        {project.techStack.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {project.techStack.slice(0, 6).map((t) => (
              <span key={t} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-medium">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-row gap-2 sm:flex-col">
        <button type="button" onClick={() => setEditing(true)} className="btn-outline" style={{ padding: '0.4rem 0.75rem', fontSize: 12 }}>
          Edit
        </button>
        <button type="button" onClick={remove} className="btn-ghost text-red-600" style={{ padding: '0.4rem 0.75rem', fontSize: 12 }}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

function ProjectForm({
  portfolioId,
  project,
  onCancel,
  onSaved
}: {
  portfolioId: string;
  project?: Project;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    title: project?.title ?? '',
    role: project?.role ?? '',
    summary: project?.summary ?? '',
    coverUrl: project?.coverUrl ?? '',
    techStack: project?.techStack ?? ([] as string[]),
    externalUrl: project?.externalUrl ?? '',
    caseStudyMd: project?.caseStudyMd ?? ''
  });
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const val = raw.trim();
    if (!val) return;
    if (draft.techStack.includes(val)) return;
    setDraft((d) => ({ ...d, techStack: [...d.techStack, val] }));
  };

  const onTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && draft.techStack.length) {
      setDraft((d) => ({ ...d, techStack: d.techStack.slice(0, -1) }));
    }
  };

  // We need a project id for the cover upload endpoint, so for new projects
  // we save first (to get an id) then upload. For edits we can upload directly.
  const upload = async (file: File, targetId: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/portfolios/${portfolioId}/projects/${targetId}/cover`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDraft((d) => ({ ...d, coverUrl: data.data.url }));
      toast.success('Cover uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (project?.id) upload(f, project.id);
    else toast('Save the project first, then upload the cover.', { icon: 'ℹ️' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.summary.trim()) {
      toast.error('Title and summary are required');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: draft.title.trim(),
        role: draft.role || undefined,
        summary: draft.summary.trim(),
        coverUrl: draft.coverUrl || undefined,
        techStack: draft.techStack,
        externalUrl: draft.externalUrl || undefined,
        caseStudyMd: draft.caseStudyMd || undefined
      };
      if (project?.id) {
        await api.patch(`/portfolios/${portfolioId}/projects/${project.id}`, payload);
        toast.success('Project saved');
      } else {
        await api.post(`/portfolios/${portfolioId}/projects`, payload);
        toast.success('Project added');
      }
      logActivity('save', { portfolioId, projectAction: project ? 'update' : 'create' });
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-heading text-base font-bold">{project ? 'Edit project' : 'New project'}</h4>
        <button type="button" onClick={onCancel} className="btn-ghost" aria-label="Cancel">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Project title">
          <input className="input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required />
        </Field>
        <Field label="Your role">
          <input className="input" value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} placeholder="Lead Designer" />
        </Field>
      </div>

      <Field label="Summary" hint="2–3 sentences for the project card.">
        <textarea
          className="input min-h-[80px]"
          value={draft.summary}
          onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
          required
        />
      </Field>

      <Field label="Cover image">
        <div className="flex flex-wrap items-center gap-3">
          {draft.coverUrl ? (
            <img src={resolveAsset(draft.coverUrl)} alt="" className="h-20 w-32 rounded-lg object-cover border border-[var(--border)]" />
          ) : (
            <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[var(--muted)]">
              <ImageIcon size={20} />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !project?.id}
            className="btn-outline"
            title={!project?.id ? 'Save the project first to upload a cover' : undefined}
          >
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload cover'}
          </button>
          {draft.coverUrl && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, coverUrl: '' }))}
              className="btn-ghost text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      </Field>

      <Field label="Tech stack" hint="Press Enter or comma to add.">
        <div className="flex flex-wrap gap-1.5 rounded-xl border-2 border-[var(--border)] bg-[var(--card)] px-2 py-2">
          {draft.techStack.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-xs font-medium text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              {t}
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, techStack: d.techStack.filter((x) => x !== t) }))}
                aria-label={`Remove ${t}`}
                className="hover:text-red-600"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKey}
            placeholder="React, Figma…"
            className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          />
        </div>
      </Field>

      <Field label="External URL">
        <input
          className="input"
          value={draft.externalUrl}
          onChange={(e) => setDraft((d) => ({ ...d, externalUrl: e.target.value }))}
          placeholder="https://…"
        />
      </Field>

      <Field label="Case study (markdown)" hint="Renders as paragraphs on the public page.">
        <textarea
          className="input min-h-[160px] font-mono text-sm"
          value={draft.caseStudyMd}
          onChange={(e) => setDraft((d) => ({ ...d, caseStudyMd: e.target.value }))}
          placeholder="## Context&#10;…"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        <button type="submit" disabled={busy} className="btn-primary">
          <Save size={14} /> {busy ? 'Saving…' : project ? 'Save project' : 'Add project'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{label}</span>
        {hint && <span className="text-[11px] text-[var(--muted)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

