// Certifications Tracker — list + add/edit/delete certifications, with an
// "Expiring within 90 days" widget at the top and a per-cert action to
// generate a public verification link an employer can hit at /verify/cert/:slug.
//
// File uploads (optional) go through the existing /vault/upload endpoint
// with category=CERTIFICATE; the returned VaultDocument id is stored on
// the Certification row so the cert PDF lives alongside other documents.
//
// Backed by /api/certifications. No AI/LLM calls.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, Award, Trash2, Pencil, ExternalLink, FileText,
  Link2, Copy, X, Loader2, AlertTriangle, CalendarClock, Upload, Check
} from 'lucide-react';
import { api } from '../../services/api';
import { findCareerTool } from '../../content/careerTools';

const TOOL_SLUG = 'certifications';

type Certification = {
  id: string;
  userId: string;
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  credentialUrl: string | null;
  vaultDocId: string | null;
  publicSlug: string | null;
  createdAt: string;
};

type VaultDoc = {
  id: string;
  originalName: string;
  url: string;
  mimetype: string;
  size: number;
};

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

// ---- Date helpers ---------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / MS_PER_DAY);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

// Convert ISO datetime to YYYY-MM-DD for the date input's `value`.
function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type ExpiryStatus = {
  tone: 'expired' | 'soon' | 'ok' | 'none';
  label: string;
  days: number | null;
};

function expiryStatus(cert: Certification): ExpiryStatus {
  if (!cert.expiryDate) return { tone: 'none', label: 'No expiry', days: null };
  const days = daysUntil(cert.expiryDate)!;
  if (days < 0) return { tone: 'expired', label: `Expired ${Math.abs(days)}d ago`, days };
  if (days <= 90) return { tone: 'soon', label: `Expires in ${days}d`, days };
  return { tone: 'ok', label: `Valid · ${days}d left`, days };
}

const STATUS_STYLES: Record<ExpiryStatus['tone'], string> = {
  expired: 'bg-[#FB7185]/15 text-[#B91C1C] dark:text-[#FCA5A5]',
  soon: 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]',
  ok: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  none: 'bg-[var(--bg)] text-[var(--muted)]'
};

// ---- Page -----------------------------------------------------------------

export default function CertificationsPage() {
  const tool = findCareerTool(TOOL_SLUG);
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Certification | null>(null);
  const [verifyModal, setVerifyModal] = useState<Certification | null>(null);

  useEffect(() => { logActivity('open'); }, []);

  const { data: certs = [], isLoading } = useQuery<Certification[]>({
    queryKey: ['certifications'],
    queryFn: async () => (await api.get('/certifications')).data.data
  });

  const expiringSoon = useMemo(() => {
    return certs
      .map((c) => ({ cert: c, status: expiryStatus(c) }))
      .filter((x) => x.status.tone === 'soon')
      .sort((a, b) => (a.status.days ?? 0) - (b.status.days ?? 0));
  }, [certs]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/certifications/${id}`)).data,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['certifications'] });
      toast.success('Certification removed');
      logActivity('delete', { id });
    },
    onError: () => toast.error('Could not delete certification')
  });

  const handleDelete = (cert: Certification) => {
    if (confirm(`Delete "${cert.name}"? This cannot be undone.`)) {
      deleteMut.mutate(cert.id);
    }
  };

  const handleEdit = (cert: Certification) => {
    setEditing(cert);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  if (!tool) return null;
  const Icon = tool.icon;

  return (
    <div className="bg-[var(--bg)]">
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link
            to="/career-tools"
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={14} /> Career Tools
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                <Icon size={28} />
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                  — Certifications Tracker
                </div>
                <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                  Keep your credentials sharp.
                </h1>
                <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                  Track issue and expiry dates, store the cert PDF in your vault,
                  and share a verification link employers can click.
                </p>
              </div>
            </div>
            <button onClick={handleAdd} className="btn-primary">
              <Plus size={16} /> Add certification
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <ExpiringWidget items={expiringSoon} />

        <div>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#065F46] dark:text-[#84CC16]">
            All certifications {certs.length > 0 && (
              <span className="text-[var(--muted)]">({certs.length})</span>
            )}
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32" />)}
            </div>
          ) : certs.length === 0 ? (
            <EmptyState onAdd={handleAdd} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {certs.map((cert, i) => (
                <CertCard
                  key={cert.id}
                  cert={cert}
                  index={i}
                  onEdit={() => handleEdit(cert)}
                  onDelete={() => handleDelete(cert)}
                  onVerify={() => setVerifyModal(cert)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {editorOpen && (
          <CertEditorModal
            cert={editing}
            onClose={() => { setEditorOpen(false); setEditing(null); }}
            onSaved={() => {
              setEditorOpen(false);
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['certifications'] });
            }}
          />
        )}
        {verifyModal && (
          <VerifyLinkModal
            cert={verifyModal}
            onClose={() => setVerifyModal(null)}
            onUpdated={() => qc.invalidateQueries({ queryKey: ['certifications'] })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Empty state ----------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
        <Award size={28} />
      </div>
      <h3 className="mt-5 font-heading text-xl font-bold">No certifications yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
        Add your first credential — PMP, AWS, Google, NEBOSH, anything you've earned.
        We'll remind you 90 days before each one expires.
      </p>
      <button onClick={onAdd} className="btn-primary mt-6 inline-flex">
        <Plus size={16} /> Add your first certification
      </button>
    </div>
  );
}

// ---- Expiring widget ------------------------------------------------------

function ExpiringWidget({ items }: { items: { cert: Certification; status: ExpiryStatus }[] }) {
  if (items.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock size={18} className="text-[#92400E] dark:text-[#F59E0B]" />
        <h2 className="font-heading text-base font-bold">
          Expiring within 90 days
        </h2>
        <span className="rounded-full bg-[#F59E0B]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
          {items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map(({ cert, status }) => (
          <li
            key={cert.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--card)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{cert.name}</div>
              <div className="truncate text-xs text-[var(--muted)]">
                {cert.issuer} · expires {formatDate(cert.expiryDate)}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status.tone]}`}>
              {status.days}d left
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ---- Cert card ------------------------------------------------------------

function CertCard({
  cert, index, onEdit, onDelete, onVerify
}: {
  cert: Certification;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onVerify: () => void;
}) {
  const status = expiryStatus(cert);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Award size={18} />
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status.tone]}`}>
          {status.label}
        </span>
      </div>

      <h3 className="mt-3 font-heading text-base font-bold leading-tight line-clamp-2">
        {cert.name}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{cert.issuer}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-[var(--muted)]">Issued</dt>
          <dd className="font-semibold">{formatDate(cert.issueDate)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Expires</dt>
          <dd className="font-semibold">{cert.expiryDate ? formatDate(cert.expiryDate) : 'Never'}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {cert.credentialUrl && (
          <a
            href={cert.credentialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 hover:border-[#065F46]/50"
          >
            <ExternalLink size={12} /> Credential
          </a>
        )}
        {cert.vaultDocId && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--muted)]">
            <FileText size={12} /> Vault file
          </span>
        )}
        {cert.publicSlug && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2.5 py-1 font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Link2 size={12} /> Verifiable
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button onClick={onVerify} className="btn-outline flex-1 text-xs">
          <Link2 size={14} /> {cert.publicSlug ? 'Verification link' : 'Generate link'}
        </button>
        <button onClick={onEdit} className="btn-ghost" aria-label="Edit" title="Edit">
          <Pencil size={16} />
        </button>
        <button
          onClick={onDelete}
          className="btn-ghost text-[#FB7185]"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  );
}

// ---- Editor modal (add + edit) -------------------------------------------

function CertEditorModal({
  cert, onClose, onSaved
}: {
  cert: Certification | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(cert);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(cert?.name ?? '');
  const [issuer, setIssuer] = useState(cert?.issuer ?? '');
  const [issueDate, setIssueDate] = useState(isoToDateInput(cert?.issueDate ?? null));
  const [expiryDate, setExpiryDate] = useState(isoToDateInput(cert?.expiryDate ?? null));
  const [credentialUrl, setCredentialUrl] = useState(cert?.credentialUrl ?? '');
  const [vaultDocId, setVaultDocId] = useState<string | null>(cert?.vaultDocId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const saveMut = useMutation({
    mutationFn: async () => {
      // 1. Upload file first (if any) so we have a vaultDocId before the cert
      // is created/updated. Failures here halt the save.
      let nextVaultDocId = vaultDocId;
      if (pendingFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', pendingFile);
        fd.append('category', 'CERTIFICATE');
        fd.append('notes', `Cert: ${name || pendingFile.name}`);
        const { data } = await api.post('/vault/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const doc = data.data as VaultDoc;
        nextVaultDocId = doc.id;
        setUploading(false);
      }

      // 2. Build the payload. Empty optional strings become null so the
      // server can clear them on edit.
      const payload = {
        name: name.trim(),
        issuer: issuer.trim(),
        issueDate,
        expiryDate: expiryDate || null,
        credentialUrl: credentialUrl.trim() || null,
        vaultDocId: nextVaultDocId
      };

      if (isEdit && cert) {
        const res = await api.patch(`/certifications/${cert.id}`, payload);
        return res.data.data as Certification;
      }
      const res = await api.post('/certifications', payload);
      return res.data.data as Certification;
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Certification updated' : 'Certification added');
      logActivity(isEdit ? 'edit' : 'add', { id: saved.id });
      onSaved();
    },
    onError: (e: any) => {
      setUploading(false);
      const msg = e?.response?.data?.error?.message;
      if (msg && /url/i.test(msg)) toast.error('Credential URL must be a valid URL');
      else toast.error(msg || 'Save failed');
    }
  });

  const canSave =
    name.trim().length > 0 &&
    issuer.trim().length > 0 &&
    issueDate.length > 0 &&
    !saveMut.isPending;

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">
          {isEdit ? 'Edit certification' : 'Add certification'}
        </h2>
        <button onClick={onClose} className="btn-ghost" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          saveMut.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AWS Certified Solutions Architect — Associate"
            className="input"
            required
          />
        </Field>

        <Field label="Issuing organization" required>
          <input
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="e.g. Amazon Web Services"
            className="input"
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Issue date" required>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Expiry date" hint="Leave blank if it never expires">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Credential URL" hint="Public verification page from the issuer (optional)">
          <input
            type="url"
            value={credentialUrl}
            onChange={(e) => setCredentialUrl(e.target.value)}
            placeholder="https://www.credly.com/badges/…"
            className="input"
          />
        </Field>

        <Field label="Certificate file" hint="Stored privately in your vault (optional, max 25 MB)">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-outline"
            >
              <Upload size={14} /> {pendingFile ? 'Change file' : 'Choose file'}
            </button>
            {pendingFile && (
              <span className="truncate text-xs text-[var(--muted)]">
                {pendingFile.name} ({Math.round(pendingFile.size / 1024)} KB)
              </span>
            )}
            {!pendingFile && vaultDocId && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                <Check size={12} /> Existing vault file linked
                <button
                  type="button"
                  onClick={() => setVaultDocId(null)}
                  className="ml-1 underline hover:text-[var(--fg)]"
                >
                  unlink
                </button>
              </span>
            )}
          </div>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className="btn-primary">
            {saveMut.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> {uploading ? 'Uploading…' : 'Saving…'}</>
            ) : (
              isEdit ? 'Save changes' : 'Add certification'
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- Verification link modal ---------------------------------------------

function VerifyLinkModal({
  cert, onClose, onUpdated
}: {
  cert: Certification;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [slug, setSlug] = useState<string | null>(cert.publicSlug);
  const [url, setUrl] = useState<string | null>(
    cert.publicSlug ? `${window.location.origin}/verify/cert/${cert.publicSlug}` : null
  );
  const [copied, setCopied] = useState(false);

  // If the cert doesn't yet have a slug, generate one as soon as the modal
  // opens so the user sees the link immediately.
  const generateMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/certifications/${cert.id}/verify-link`);
      return data.data as { slug: string; url: string };
    },
    onSuccess: (d) => {
      setSlug(d.slug);
      setUrl(d.url);
      onUpdated();
      logActivity('verify_link_generated', { id: cert.id });
    },
    onError: () => toast.error('Could not generate a verification link')
  });

  const revokeMut = useMutation({
    mutationFn: async () => (await api.delete(`/certifications/${cert.id}/verify-link`)).data,
    onSuccess: () => {
      setSlug(null);
      setUrl(null);
      onUpdated();
      toast.success('Verification link revoked');
    },
    onError: () => toast.error('Could not revoke the link')
  });

  useEffect(() => {
    if (!slug) generateMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Verification link</h2>
        <button onClick={onClose} className="btn-ghost" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Share this read-only link with employers. They'll see the certification details
        and your name + programme — but never your contact info.
      </p>

      {generateMut.isPending && !url ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-sm text-[var(--muted)]">
          <Loader2 size={14} className="animate-spin" /> Generating link…
        </div>
      ) : url ? (
        <>
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <Link2 size={16} className="shrink-0 text-[#065F46] dark:text-[#84CC16]" />
            <code className="flex-1 truncate text-xs">{url}</code>
            <button onClick={copy} className="btn-outline shrink-0 text-xs">
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] dark:text-[#84CC16]"
            >
              <ExternalLink size={12} /> Preview
            </a>
            <button
              onClick={() => {
                if (confirm('Revoke this link? Anyone holding it will get a "not verified" page.')) {
                  revokeMut.mutate();
                }
              }}
              disabled={revokeMut.isPending}
              className="btn-ghost text-xs text-[#FB7185]"
            >
              Revoke link
            </button>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-[#FB7185]/40 bg-[#FB7185]/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-[#B91C1C] dark:text-[#FCA5A5]">
            <AlertTriangle size={16} /> Link unavailable
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The link was revoked. Generate a new one to share again.
          </p>
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            className="btn-primary mt-3 text-xs"
          >
            <Link2 size={14} /> Generate new link
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ---- Modal shell + small bits --------------------------------------------

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({
  label, required, hint, children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--muted)]">
          {label}{required && <span className="ml-0.5 text-[#FB7185]">*</span>}
        </span>
        {hint && <span className="text-[10px] text-[var(--muted)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
