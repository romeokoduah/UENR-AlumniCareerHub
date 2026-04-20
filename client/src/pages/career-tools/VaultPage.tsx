import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Lock, Upload, Search, FileText, Image as ImageIcon,
  FileSpreadsheet, Presentation, File, Trash2, Share2, Download,
  Copy, X, ShieldOff, Eye, Loader2
} from 'lucide-react';
import { api } from '../../services/api';
import { findCareerTool } from '../../content/careerTools';

const CATEGORIES = [
  { value: 'TRANSCRIPT', label: 'Transcript' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'REFERENCE', label: 'Reference' },
  { value: 'IDENTIFICATION', label: 'Identification' },
  { value: 'CV', label: 'CV' },
  { value: 'COVER_LETTER', label: 'Cover Letter' },
  { value: 'OTHER', label: 'Other' }
] as const;

type Category = typeof CATEGORIES[number]['value'];

type ShareSummary = {
  id: string;
  token: string;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  isRevoked: boolean;
  createdAt: string;
  hasPassword: boolean;
};

type VaultDoc = {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  category: Category;
  notes: string | null;
  createdAt: string;
  shares: ShareSummary[];
};

const CATEGORY_LABEL: Record<Category, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<Category, string>;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function mimeIcon(mimetype: string) {
  if (mimetype.startsWith('image/')) return ImageIcon;
  if (mimetype === 'application/pdf') return FileText;
  if (mimetype.includes('sheet') || mimetype.includes('excel') || mimetype === 'text/csv') return FileSpreadsheet;
  if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return Presentation;
  if (mimetype.includes('word') || mimetype === 'text/plain') return FileText;
  return File;
}

function shareStatus(s: ShareSummary): { label: string; tone: 'active' | 'expired' | 'revoked' } {
  if (s.isRevoked) return { label: 'Revoked', tone: 'revoked' };
  if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return { label: 'Expired', tone: 'expired' };
  if (s.maxViews != null && s.viewCount >= s.maxViews) return { label: 'View cap reached', tone: 'expired' };
  return { label: 'Active', tone: 'active' };
}

export default function VaultPage() {
  const tool = findCareerTool('vault');
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [shareModalDoc, setShareModalDoc] = useState<VaultDoc | null>(null);
  const [accessLogShareId, setAccessLogShareId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VaultDoc | null>(null);

  useEffect(() => {
    api.post('/career-tools/activity', { tool: 'vault', action: 'open' }).catch(() => {});
  }, []);

  const { data: docs = [], isLoading } = useQuery<VaultDoc[]>({
    queryKey: ['vault', 'documents'],
    queryFn: async () => (await api.get('/vault')).data.data
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      d.originalName.toLowerCase().includes(q) ||
      (d.notes ?? '').toLowerCase().includes(q)
    );
  }, [docs, query]);

  const grouped = useMemo(() => {
    const groups: Record<Category, VaultDoc[]> = {
      TRANSCRIPT: [], CERTIFICATE: [], REFERENCE: [], IDENTIFICATION: [],
      CV: [], COVER_LETTER: [], OTHER: []
    };
    filtered.forEach((d) => groups[d.category].push(d));
    return groups;
  }, [filtered]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/vault/${id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      qc.invalidateQueries({ queryKey: ['vault', 'documents'] });
      api.post('/career-tools/activity', { tool: 'vault', action: 'delete' }).catch(() => {});
    },
    onError: () => toast.error('Failed to delete document')
  });

  if (!tool) return null;
  const Icon = tool.icon;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Icon size={28} />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-extrabold leading-tight">Document Vault</h1>
          <p className="text-sm text-[var(--muted)]">
            Securely store transcripts, certificates, references and more — share with expiry, view caps, and password protection.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <UploadZone
          onUploaded={() => qc.invalidateQueries({ queryKey: ['vault', 'documents'] })}
        />
      </div>

      <div className="mt-8">
        <label className="relative block max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename or notes…"
            className="input pl-10"
            aria-label="Search vault"
          />
        </label>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading documents…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
            <Lock size={28} className="mx-auto text-[var(--muted)]" />
            <p className="mt-3 text-sm text-[var(--muted)]">
              Your vault is empty. Upload your first document above to get started.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            No documents match "{query}".
          </div>
        ) : (
          <div className="space-y-8">
            {CATEGORIES.map((cat) => {
              const items = grouped[cat.value];
              if (items.length === 0) return null;
              return (
                <section key={cat.value}>
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#065F46] dark:text-[#84CC16]">
                    {cat.label} <span className="text-[var(--muted)]">({items.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 gap-3">
                    {items.map((d) => (
                      <DocumentRow
                        key={d.id}
                        doc={d}
                        onShare={() => setShareModalDoc(d)}
                        onDelete={() => setConfirmDelete(d)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {shareModalDoc && (
          <ShareModal
            doc={shareModalDoc}
            onClose={() => setShareModalDoc(null)}
            onAccessLog={(shareId) => setAccessLogShareId(shareId)}
          />
        )}
        {accessLogShareId && (
          <AccessLogModal
            shareId={accessLogShareId}
            onClose={() => setAccessLogShareId(null)}
          />
        )}
        {confirmDelete && (
          <ConfirmModal
            title="Delete document?"
            body={`"${confirmDelete.originalName}" will be permanently deleted along with all its share links.`}
            confirmLabel="Delete"
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => {
              deleteMutation.mutate(confirmDelete.id);
              setConfirmDelete(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ----- Upload zone -----

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>('OTHER');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setNotes('');
    setCategory('OTHER');
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File is larger than 25 MB');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    if (notes.trim()) fd.append('notes', notes.trim());
    try {
      setProgress(0);
      await api.post('/vault/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      toast.success('Document uploaded');
      api.post('/career-tools/activity', { tool: 'vault', action: 'upload' }).catch(() => {});
      onUploaded();
      reset();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Upload failed');
      setProgress(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-[#065F46] bg-[#065F46]/5' : 'border-[var(--border)] hover:border-[#065F46]/50'
        }`}
      >
        <Upload size={28} className="mx-auto text-[#065F46] dark:text-[#84CC16]" />
        <p className="mt-2 text-sm font-semibold">
          {file ? file.name : 'Drop a file here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          PDF, Word, Excel, PowerPoint, text, CSV, or images — up to 25 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--muted)]">Category</div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                    active
                      ? 'border-[#065F46] bg-[#065F46] text-white'
                      : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--muted)]">Notes (optional)</div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 2023 BSc transcript — official"
            className="input"
            maxLength={500}
          />
        </div>
      </div>

      {progress != null && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-[#065F46] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">{progress}%</div>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {file && (
          <button type="button" onClick={reset} className="btn-ghost">Clear</button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!file || progress != null}
          className="btn-primary"
        >
          {progress != null ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : 'Upload'}
        </button>
      </div>
    </div>
  );
}

// ----- Document row -----

function DocumentRow({
  doc, onShare, onDelete
}: {
  doc: VaultDoc;
  onShare: () => void;
  onDelete: () => void;
}) {
  const Icon = mimeIcon(doc.mimetype);
  const activeShares = doc.shares.filter((s) =>
    !s.isRevoked &&
    !(s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) &&
    !(s.maxViews != null && s.viewCount >= s.maxViews)
  ).length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{doc.originalName}</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            {formatBytes(doc.size)} · {new Date(doc.createdAt).toLocaleDateString()} ·{' '}
            <span className="badge badge-muted ml-1">{CATEGORY_LABEL[doc.category]}</span>
            {activeShares > 0 && (
              <span className="badge badge-emerald ml-1">{activeShares} active share{activeShares === 1 ? '' : 's'}</span>
            )}
          </div>
          {doc.notes && (
            <div className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{doc.notes}</div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            download={doc.originalName}
            className="btn-ghost !p-2"
            title="Download"
          >
            <Download size={16} />
          </a>
          <button type="button" onClick={onShare} className="btn-ghost !p-2" title="Share">
            <Share2 size={16} />
          </button>
          <button type="button" onClick={onDelete} className="btn-ghost !p-2" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- Share modal -----

function ShareModal({
  doc, onClose, onAccessLog
}: {
  doc: VaultDoc;
  onClose: () => void;
  onAccessLog: (shareId: string) => void;
}) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [expiryPreset, setExpiryPreset] = useState<'1h' | '24h' | '7d' | '30d' | 'never' | 'custom'>('7d');
  const [customExpiry, setCustomExpiry] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [generated, setGenerated] = useState<{ token: string; url: string } | null>(null);

  const computeExpiry = (): string | null => {
    if (expiryPreset === 'never') return null;
    if (expiryPreset === 'custom') {
      if (!customExpiry) return null;
      return new Date(customExpiry).toISOString();
    }
    const ms = expiryPreset === '1h' ? 3600e3
      : expiryPreset === '24h' ? 86400e3
      : expiryPreset === '7d' ? 7 * 86400e3
      : 30 * 86400e3;
    return new Date(Date.now() + ms).toISOString();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (password.trim()) body.password = password.trim();
      const expiresAt = computeExpiry();
      if (expiresAt) body.expiresAt = expiresAt;
      const mv = parseInt(maxViews, 10);
      if (!Number.isNaN(mv) && mv > 0) body.maxViews = mv;
      const res = await api.post(`/vault/${doc.id}/share`, body);
      return res.data.data as { token: string };
    },
    onSuccess: (data) => {
      const url = `${window.location.origin}/v/${data.token}`;
      setGenerated({ token: data.token, url });
      setPassword('');
      setMaxViews('');
      qc.invalidateQueries({ queryKey: ['vault', 'documents'] });
      api.post('/career-tools/activity', { tool: 'vault', action: 'share_created' }).catch(() => {});
      toast.success('Share link created');
    },
    onError: () => toast.error('Failed to create share link')
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => api.post(`/vault/shares/${shareId}/revoke`),
    onSuccess: () => {
      toast.success('Share revoked');
      qc.invalidateQueries({ queryKey: ['vault', 'documents'] });
      api.post('/career-tools/activity', { tool: 'vault', action: 'share_revoked' }).catch(() => {});
    },
    onError: () => toast.error('Failed to revoke share')
  });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — copy manually');
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Share "${doc.originalName}"`}>
      <div className="space-y-5">
        <div>
          <h3 className="mb-3 text-sm font-bold">New share link</h3>
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <div>
              <div className="mb-1 text-xs font-semibold text-[var(--muted)]">Password (optional)</div>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
                className="input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-[var(--muted)]">Expiry</div>
              <div className="flex flex-wrap gap-2">
                {([
                  { v: '1h', l: '1 hour' },
                  { v: '24h', l: '24 hours' },
                  { v: '7d', l: '7 days' },
                  { v: '30d', l: '30 days' },
                  { v: 'never', l: 'Never' },
                  { v: 'custom', l: 'Custom' }
                ] as const).map((p) => {
                  const active = expiryPreset === p.v;
                  return (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() => setExpiryPreset(p.v)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                        active
                          ? 'border-[#065F46] bg-[#065F46] text-white'
                          : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
                      }`}
                    >
                      {p.l}
                    </button>
                  );
                })}
              </div>
              {expiryPreset === 'custom' && (
                <input
                  type="datetime-local"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  className="input mt-2"
                />
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-[var(--muted)]">Max views (optional)</div>
              <input
                type="number"
                min={1}
                value={maxViews}
                onChange={(e) => setMaxViews(e.target.value)}
                placeholder="Unlimited"
                className="input"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : 'Generate link'}
              </button>
            </div>
            {generated && (
              <div className="rounded-lg border border-[#065F46]/30 bg-[#065F46]/5 p-3">
                <div className="text-xs font-semibold text-[var(--muted)]">Share URL</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-[var(--card)] px-2 py-1 text-xs">{generated.url}</code>
                  <button type="button" onClick={() => copy(generated.url)} className="btn-ghost !p-2">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-bold">Active and past shares</h3>
          {doc.shares.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
              No share links yet.
            </div>
          ) : (
            <div className="space-y-2">
              {doc.shares.map((s) => {
                const status = shareStatus(s);
                const url = `${window.location.origin}/v/${s.token}`;
                return (
                  <div key={s.id} className="rounded-xl border border-[var(--border)] p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={
                            status.tone === 'active' ? 'badge badge-emerald'
                              : status.tone === 'revoked' ? 'badge badge-coral'
                              : 'badge badge-muted'
                          }>{status.label}</span>
                          {s.hasPassword && <span className="badge badge-gold">Password</span>}
                          <span className="text-[var(--muted)]">
                            {s.viewCount}{s.maxViews != null ? ` / ${s.maxViews}` : ''} view{s.viewCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[var(--muted)]">
                          Created {new Date(s.createdAt).toLocaleString()}
                          {s.expiresAt && ` · Expires ${new Date(s.expiresAt).toLocaleString()}`}
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-[var(--muted)]">{url}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => copy(url)} className="btn-ghost !p-1.5" title="Copy link">
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onAccessLog(s.id)}
                          className="btn-ghost !p-1.5"
                          title="View access log"
                        >
                          <Eye size={14} />
                        </button>
                        {!s.isRevoked && (
                          <button
                            type="button"
                            onClick={() => revokeMutation.mutate(s.id)}
                            className="btn-ghost !p-1.5"
                            title="Revoke"
                          >
                            <ShieldOff size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ----- Access log modal -----

type AccessLogEntry = { id: string; ip: string | null; userAgent: string | null; createdAt: string };

function AccessLogModal({ shareId, onClose }: { shareId: string; onClose: () => void }) {
  const { data: log = [], isLoading } = useQuery<AccessLogEntry[]>({
    queryKey: ['vault', 'access-log', shareId],
    queryFn: async () => (await api.get(`/vault/shares/${shareId}/access`)).data.data
  });

  return (
    <ModalShell onClose={onClose} title="Access log">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : log.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          No views recorded yet.
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {log.map((row) => (
            <div key={row.id} className="rounded-lg border border-[var(--border)] p-3 text-xs">
              <div className="font-semibold">{new Date(row.createdAt).toLocaleString()}</div>
              <div className="mt-1 text-[var(--muted)]">
                IP: <span className="font-mono">{row.ip ?? 'unknown'}</span>
              </div>
              <div className="mt-0.5 break-words text-[var(--muted)]">
                {row.userAgent ?? 'unknown user-agent'}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

// ----- Confirm modal -----

function ConfirmModal({
  title, body, confirmLabel, onCancel, onConfirm
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} title={title}>
      <p className="text-sm text-[var(--muted)]">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn-primary"
          style={{ background: '#dc2626' }}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

// ----- Modal shell -----

function ModalShell({
  title, children, onClose
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost !p-2">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

