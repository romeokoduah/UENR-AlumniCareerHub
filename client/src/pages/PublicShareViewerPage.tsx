// Public share-link viewer for the Document Vault. Mounted at /v/:token
// OUTSIDE the AppLayout — anonymous viewers should not see app chrome.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Download, AlertTriangle, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api';

type DocPayload = {
  filename: string;
  mimetype: string;
  size: number;
  url: string;
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'locked' }
  | { kind: 'ready'; doc: DocPayload; viewCount: number; maxViews: number | null };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PublicShareViewerPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/vault/public/${token}`);
        const data = res.data.data;
        if (cancelled) return;
        if (data.requiresPassword) {
          setState({ kind: 'locked' });
        } else {
          setState({
            kind: 'ready',
            doc: data.document,
            viewCount: data.viewCount,
            maxViews: data.maxViews ?? null
          });
        }
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.response?.data?.error?.message
          || (e?.response?.status === 404 ? 'Link not found' : 'This link is no longer available');
        setState({ kind: 'unavailable', message });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await api.post(`/vault/public/${token}/unlock`, { password });
      const data = res.data.data;
      setState({
        kind: 'ready',
        doc: data.document,
        viewCount: data.viewCount,
        maxViews: data.maxViews ?? null
      });
    } catch (e: any) {
      const code = e?.response?.data?.error?.code;
      if (code === 'BAD_PASSWORD') {
        setUnlockError('Incorrect password');
      } else {
        setUnlockError(e?.response?.data?.error?.message || 'Unable to unlock');
      }
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Lock size={16} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">UENR Alumni Career Hub</div>
            <div className="text-xs text-[var(--muted)]">Shared document</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted)]">
            <Loader2 size={18} className="animate-spin" /> Loading document…
          </div>
        )}

        {state.kind === 'unavailable' && (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
            <AlertTriangle size={32} className="mx-auto text-[#dc2626]" />
            <h1 className="mt-4 font-heading text-2xl font-bold">This link is no longer available</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{state.message}</p>
          </div>
        )}

        {state.kind === 'locked' && (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F59E0B]/15 text-[#F59E0B]">
                <Lock size={20} />
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold">Password required</h1>
                <p className="text-sm text-[var(--muted)]">Enter the password to view this document.</p>
              </div>
            </div>
            <form onSubmit={submitPassword} className="mt-6 space-y-3">
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="input"
              />
              {unlockError && (
                <div className="text-sm text-[#dc2626]">{unlockError}</div>
              )}
              <button
                type="submit"
                disabled={unlocking || !password}
                className="btn-primary w-full"
              >
                {unlocking ? <><Loader2 size={14} className="animate-spin" /> Unlocking…</> : 'Unlock'}
              </button>
            </form>
          </div>
        )}

        {state.kind === 'ready' && <ReadyView doc={state.doc} viewCount={state.viewCount} maxViews={state.maxViews} />}
      </main>
    </div>
  );
}

function ReadyView({
  doc, viewCount, maxViews
}: {
  doc: DocPayload;
  viewCount: number;
  maxViews: number | null;
}) {
  const isPdf = doc.mimetype === 'application/pdf';
  const isImage = doc.mimetype.startsWith('image/');
  const Icon = isImage ? ImageIcon : FileText;

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-lg font-bold">{doc.filename}</h1>
            <p className="text-xs text-[var(--muted)]">
              {formatBytes(doc.size)} · {doc.mimetype}
              {maxViews != null && ` · ${viewCount} / ${maxViews} views`}
            </p>
          </div>
        </div>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          download={doc.filename}
          className="btn-primary"
        >
          <Download size={14} /> Download
        </a>
      </div>

      <div className="mt-6">
        {isPdf ? (
          <iframe
            src={doc.url}
            title={doc.filename}
            className="h-[70vh] w-full rounded-xl border border-[var(--border)]"
          />
        ) : isImage ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <img
              src={doc.url}
              alt={doc.filename}
              className="mx-auto max-h-[70vh] rounded-lg object-contain"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            Inline preview isn't available for this file type. Use the Download button above.
          </div>
        )}
      </div>
    </div>
  );
}
