// Public certification verification page — anyone with the slug can hit
// /verify/cert/:slug to confirm a credential. Read-only; no contact info
// is exposed about the owner. Mounted at /verify/cert/:slug OUTSIDE the
// AppLayout so anonymous viewers don't see app chrome (matches the pattern
// in PublicShareViewerPage and PublicPortfolioPage).

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Award, AlertTriangle, Loader2, ShieldCheck, ExternalLink, GraduationCap, Calendar
} from 'lucide-react';
import { api } from '../services/api';

type VerifiedCert = {
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  credentialUrl: string | null;
  owner: {
    firstName: string;
    lastName: string;
    programme: string | null;
    graduationYear: number | null;
  };
  verifiedAt: string;
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; cert: VerifiedCert };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function expiryLabel(expiryDate: string | null): { label: string; tone: 'expired' | 'soon' | 'ok' | 'none' } {
  if (!expiryDate) return { label: 'No expiry', tone: 'none' };
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / MS_PER_DAY);
  if (days < 0) return { label: `Expired on ${formatDate(expiryDate)}`, tone: 'expired' };
  if (days <= 90) return { label: `Expires ${formatDate(expiryDate)} (${days}d)`, tone: 'soon' };
  return { label: `Valid until ${formatDate(expiryDate)}`, tone: 'ok' };
}

const TONE_STYLES = {
  expired: 'bg-[#FB7185]/15 text-[#B91C1C] dark:text-[#FCA5A5]',
  soon: 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]',
  ok: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  none: 'bg-[var(--bg)] text-[var(--muted)]'
} as const;

export default function PublicCertVerifyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    if (!slug) {
      setState({ kind: 'unavailable', message: 'No verification slug provided' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/certifications/verify/${slug}`);
        if (cancelled) return;
        setState({ kind: 'ready', cert: res.data.data });
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.response?.data?.error?.message
          || (e?.response?.status === 404
            ? 'This credential could not be verified.'
            : 'This verification link is no longer available.');
        setState({ kind: 'unavailable', message });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              UENR Alumni Career Hub
            </div>
            <div className="text-xs text-[var(--muted)]">Credential verification</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted)]">
            <Loader2 size={18} className="animate-spin" /> Verifying credential…
          </div>
        )}

        {state.kind === 'unavailable' && (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FB7185]/15 text-[#B91C1C] dark:text-[#FCA5A5]">
              <AlertTriangle size={28} />
            </div>
            <h1 className="mt-4 font-heading text-2xl font-bold">Could not verify</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{state.message}</p>
            <p className="mx-auto mt-4 max-w-md text-xs text-[var(--muted)]">
              If you believe this is a mistake, contact the certificate holder for a new link.
            </p>
          </div>
        )}

        {state.kind === 'ready' && <VerifiedCard cert={state.cert} />}
      </main>

      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
        <p>
          Verification powered by{' '}
          <Link to="/" className="font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]">
            UENR Alumni Career Hub
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}

function VerifiedCard({ cert }: { cert: VerifiedCert }) {
  const expiry = expiryLabel(cert.expiryDate);
  const ownerName = `${cert.owner.firstName} ${cert.owner.lastName}`.trim();
  const verifiedAt = new Date(cert.verifiedAt).toLocaleString();

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      {/* Banner */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[#065F46]/5 px-6 py-4 dark:bg-[#84CC16]/10">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46] text-white dark:bg-[#84CC16] dark:text-[#0b1411]">
          <ShieldCheck size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-[#065F46] dark:text-[#84CC16]">
            Verified credential
          </div>
          <div className="text-xs text-[var(--muted)]">
            This certification was added to UENR Alumni Career Hub by its holder.
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Award size={28} />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold leading-tight">{cert.name}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Issued by {cert.issuer}</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE_STYLES[expiry.tone]}`}>
              {expiry.label}
            </span>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Row icon={<Calendar size={14} />} label="Issued">
            {formatDate(cert.issueDate)}
          </Row>
          <Row icon={<Calendar size={14} />} label="Expires">
            {cert.expiryDate ? formatDate(cert.expiryDate) : 'Never'}
          </Row>
          <Row icon={<Award size={14} />} label="Issued to">
            {ownerName || 'UENR alumnus'}
          </Row>
          <Row icon={<GraduationCap size={14} />} label="Programme">
            {cert.owner.programme
              ? `${cert.owner.programme}${cert.owner.graduationYear ? `, ${cert.owner.graduationYear}` : ''}`
              : (cert.owner.graduationYear ? `Class of ${cert.owner.graduationYear}` : '—')}
          </Row>
        </dl>

        {cert.credentialUrl && (
          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Issuer's verification page
            </div>
            <a
              href={cert.credentialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 break-all text-sm font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
            >
              {cert.credentialUrl} <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] bg-[var(--bg)]/40 px-6 py-4 text-xs text-[var(--muted)]">
        Verified by UENR Alumni Career Hub on {verifiedAt}
      </div>
    </div>
  );
}

function Row({
  icon, label, children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {icon} {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold">{children}</dd>
    </div>
  );
}
