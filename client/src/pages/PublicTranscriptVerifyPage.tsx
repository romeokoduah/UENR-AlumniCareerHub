// Public transcript verification page — anyone with the token can hit
// /verify/transcript/:token to confirm a UENR-issued transcript, letter of
// attendance, or degree verification. Read-only; no contact info is exposed
// about the holder. In-flight (SUBMITTED/UNDER_REVIEW/PROCESSING), unpaid,
// or cancelled requests deliberately 404 so we never confirm a credential
// before it's been issued.
//
// Mounted at /verify/transcript/:token OUTSIDE AppLayout (matches
// PublicCertVerifyPage / PublicShareViewerPage / PublicPortfolioPage).

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertTriangle, Loader2, ShieldCheck, GraduationCap, FileSearch, BadgeCheck
} from 'lucide-react';
import { api } from '../services/api';

type VerifiedTranscript = {
  type: 'TRANSCRIPT' | 'LETTER_OF_ATTENDANCE' | 'DEGREE_VERIFICATION';
  status: 'READY' | 'DISPATCHED' | 'DELIVERED';
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
  | { kind: 'ready'; record: VerifiedTranscript };

const TYPE_LABELS: Record<VerifiedTranscript['type'], string> = {
  TRANSCRIPT: 'Official Transcript',
  LETTER_OF_ATTENDANCE: 'Letter of Attendance',
  DEGREE_VERIFICATION: 'Degree Verification'
};

const STATUS_LABELS: Record<VerifiedTranscript['status'], string> = {
  READY: 'Ready for collection',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered'
};

export default function PublicTranscriptVerifyPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'unavailable', message: 'No verification token provided' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/transcripts/verify/${token}`);
        if (cancelled) return;
        setState({ kind: 'ready', record: res.data.data });
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
  }, [token]);

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
            <div className="text-xs text-[var(--muted)]">Transcript verification</div>
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
              If you believe this is a mistake, contact the credential holder for a new link.
            </p>
          </div>
        )}

        {state.kind === 'ready' && <VerifiedCard record={state.record} />}
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

function VerifiedCard({ record }: { record: VerifiedTranscript }) {
  const ownerName = `${record.owner.firstName} ${record.owner.lastName}`.trim();
  const verifiedAt = new Date(record.verifiedAt).toLocaleString();

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[#065F46]/5 px-6 py-4 dark:bg-[#84CC16]/10">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46] text-white dark:bg-[#84CC16] dark:text-[#0b1411]">
          <ShieldCheck size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-[#065F46] dark:text-[#84CC16]">
            Verified credential
          </div>
          <div className="text-xs text-[var(--muted)]">
            Issued by the University of Energy and Natural Resources (UENR), Ghana.
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <FileSearch size={28} />
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <BadgeCheck size={12} /> {TYPE_LABELS[record.type]}
            </span>
            <h1 className="mt-2 font-heading text-2xl font-extrabold leading-tight">
              {ownerName || 'UENR alumnus'}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              The Registry has confirmed this {TYPE_LABELS[record.type].toLowerCase()} request as{' '}
              <strong>{STATUS_LABELS[record.status].toLowerCase()}</strong>.
            </p>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Row icon={<GraduationCap size={14} />} label="Programme">
            {record.owner.programme || '—'}
          </Row>
          <Row icon={<GraduationCap size={14} />} label="Graduation year">
            {record.owner.graduationYear ?? '—'}
          </Row>
          <Row icon={<BadgeCheck size={14} />} label="Document type">
            {TYPE_LABELS[record.type]}
          </Row>
          <Row icon={<ShieldCheck size={14} />} label="Status">
            {STATUS_LABELS[record.status]}
          </Row>
        </dl>
      </div>

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
