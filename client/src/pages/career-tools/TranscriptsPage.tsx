// Transcripts & Verification Requests — alumni request official transcripts,
// letters of attendance, or degree verifications. Status pipeline is visualized
// as a horizontal stepper: Submitted → Under Review → Processing → Ready →
// Dispatched → Delivered. Once paid AND ready, the alumnus can mint a public
// verification link an employer can hit at /verify/transcript/:token.
//
// ADMIN users get a "Switch to staff view" toggle showing every request grouped
// by status, with manual mark-as-paid + advance-status + cancel + notes actions.
//
// V1 has NO Paystack: alumni pay at the Registry counter quoting the request
// id; staff mark it paid in the staff view. See README/followups for the
// integration plan.
//
// Backed by /api/transcripts. No AI/LLM calls.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, X, Loader2, FileSearch, Copy, Check, Link2,
  CircleDollarSign, ShieldCheck, Trash2, ChevronRight, AlertTriangle,
  Pencil, Users, ListChecks, Banknote, ClipboardList, ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { findCareerTool } from '../../content/careerTools';

const TOOL_SLUG = 'transcripts';

// ---- Types & constants ---------------------------------------------------

type TranscriptType = 'TRANSCRIPT' | 'LETTER_OF_ATTENDANCE' | 'DEGREE_VERIFICATION';
type DeliveryMethod = 'PICKUP' | 'POSTAL_LOCAL' | 'POSTAL_INTERNATIONAL' | 'ELECTRONIC';
type TranscriptStatus =
  | 'SUBMITTED' | 'UNDER_REVIEW' | 'PROCESSING'
  | 'READY' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

type TranscriptRequest = {
  id: string;
  userId: string;
  type: TranscriptType;
  copies: number;
  deliveryMethod: DeliveryMethod;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  feeAmountGhs: number;
  paymentRef: string | null;
  paymentStatus: PaymentStatus;
  status: TranscriptStatus;
  publicVerifyToken: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminUser = {
  firstName: string;
  lastName: string;
  email: string;
  programme: string | null;
  graduationYear: number | null;
};

type AdminTranscriptRequest = TranscriptRequest & { user: AdminUser };

const TYPE_LABELS: Record<TranscriptType, string> = {
  TRANSCRIPT: 'Official Transcript',
  LETTER_OF_ATTENDANCE: 'Letter of Attendance',
  DEGREE_VERIFICATION: 'Degree Verification'
};

const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: 'Pickup at Registry',
  POSTAL_LOCAL: 'Local Postal',
  POSTAL_INTERNATIONAL: 'International Postal',
  ELECTRONIC: 'Electronic Delivery'
};

// Mirror of the server-side fee table. Keep both in sync.
const TRANSCRIPT_FEES = {
  baseByType: {
    TRANSCRIPT: 50,
    LETTER_OF_ATTENDANCE: 30,
    DEGREE_VERIFICATION: 100
  } as Record<TranscriptType, number>,
  deliverySurcharge: {
    PICKUP: 0,
    POSTAL_LOCAL: 25,
    POSTAL_INTERNATIONAL: 100,
    ELECTRONIC: 0
  } as Record<DeliveryMethod, number>
};

function computeFee(type: TranscriptType, copies: number, delivery: DeliveryMethod): number {
  const safeCopies = Math.max(1, Math.min(20, Math.floor(copies || 1)));
  return TRANSCRIPT_FEES.baseByType[type] * safeCopies + TRANSCRIPT_FEES.deliverySurcharge[delivery];
}

const PIPELINE: Exclude<TranscriptStatus, 'CANCELLED'>[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'PROCESSING', 'READY', 'DISPATCHED', 'DELIVERED'
];

const PIPELINE_LABELS: Record<TranscriptStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  PROCESSING: 'Processing',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  UNPAID: 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]',
  PAID: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  REFUNDED: 'bg-[var(--bg)] text-[var(--muted)]'
};

const STATUS_BADGE: Record<TranscriptStatus, string> = {
  SUBMITTED: 'bg-[var(--bg)] text-[var(--muted)]',
  UNDER_REVIEW: 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]',
  PROCESSING: 'bg-[#F59E0B]/15 text-[#92400E] dark:text-[#F59E0B]',
  READY: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  DISPATCHED: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  DELIVERED: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]',
  CANCELLED: 'bg-[#FB7185]/15 text-[#B91C1C] dark:text-[#FCA5A5]'
};

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function formatGhs(amount: number): string {
  return `GH₵ ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Page -----------------------------------------------------------------

export default function TranscriptsPage() {
  const tool = findCareerTool(TOOL_SLUG);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const [staffView, setStaffView] = useState(false);

  useEffect(() => { logActivity('open'); }, []);

  // Reset staff view if the user role changes (e.g. logout/login).
  useEffect(() => { if (!isAdmin) setStaffView(false); }, [isAdmin]);

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
                  — Transcripts & Verification
                </div>
                <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                  Request transcripts and verification letters.
                </h1>
                <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                  Order an official transcript, letter of attendance or degree verification
                  from the UENR Registry. Track each request from submission to delivery,
                  and share a public verification link with employers.
                </p>
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setStaffView((v) => !v)}
                className={staffView ? 'btn-primary' : 'btn-outline'}
              >
                <Users size={16} /> {staffView ? 'Back to my requests' : 'Switch to staff view'}
              </button>
            )}
          </div>
        </div>
      </section>

      {staffView ? <StaffView /> : <AlumnusView />}
    </div>
  );
}

// ---- Alumnus view --------------------------------------------------------

function AlumnusView() {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<TranscriptRequest | null>(null);

  const { data: requests = [], isLoading } = useQuery<TranscriptRequest[]>({
    queryKey: ['transcripts'],
    queryFn: async () => (await api.get('/transcripts')).data.data
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/transcripts/${id}/cancel`)).data,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['transcripts'] });
      toast.success('Request cancelled');
      logActivity('cancel_request', { id });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || 'Could not cancel')
  });

  const handleCancel = (req: TranscriptRequest) => {
    if (confirm(`Cancel this ${TYPE_LABELS[req.type].toLowerCase()} request?`)) {
      cancelMut.mutate(req.id);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#065F46] dark:text-[#84CC16]">
            My requests {requests.length > 0 && (
              <span className="text-[var(--muted)]">({requests.length})</span>
            )}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Each row tracks where your request is in the Registry pipeline.
          </p>
        </div>
        <button onClick={() => setEditorOpen(true)} className="btn-primary">
          <Plus size={16} /> Request a transcript
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState onAdd={() => setEditorOpen(true)} />
      ) : (
        <ul className="space-y-4">
          {requests.map((req, i) => (
            <RequestCard
              key={req.id}
              request={req}
              index={i}
              onCancel={() => handleCancel(req)}
              onVerify={() => setVerifyTarget(req)}
            />
          ))}
        </ul>
      )}

      <AnimatePresence>
        {editorOpen && (
          <RequestEditorModal
            onClose={() => setEditorOpen(false)}
            onSaved={() => {
              setEditorOpen(false);
              qc.invalidateQueries({ queryKey: ['transcripts'] });
            }}
          />
        )}
        {verifyTarget && (
          <VerifyLinkModal
            request={verifyTarget}
            onClose={() => setVerifyTarget(null)}
            onUpdated={() => qc.invalidateQueries({ queryKey: ['transcripts'] })}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ---- Empty state ----------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
        <FileSearch size={28} />
      </div>
      <h3 className="mt-5 font-heading text-xl font-bold">No requests yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
        Need an official document to apply for a job, scholarship, or further studies?
        Submit a request and the Registry will pick it up from there.
      </p>
      <button onClick={onAdd} className="btn-primary mt-6 inline-flex">
        <Plus size={16} /> Request your first transcript
      </button>
    </div>
  );
}

// ---- Request card --------------------------------------------------------

function RequestCard({
  request, index, onCancel, onVerify
}: {
  request: TranscriptRequest;
  index: number;
  onCancel: () => void;
  onVerify: () => void;
}) {
  const isCancelled = request.status === 'CANCELLED';
  const canGenerateLink =
    request.paymentStatus === 'PAID'
    && (request.status === 'READY' || request.status === 'DISPATCHED' || request.status === 'DELIVERED');
  const canCancel = request.status !== 'DISPATCHED' && request.status !== 'DELIVERED' && !isCancelled;

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-bold leading-tight">
              {TYPE_LABELS[request.type]}
            </h3>
            <span className="text-xs text-[var(--muted)]">
              · {request.copies} {request.copies === 1 ? 'copy' : 'copies'} · {DELIVERY_LABELS[request.deliveryMethod]}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Requested {formatDate(request.createdAt)} · Reference{' '}
            <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-[11px]">{request.id}</code>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PAYMENT_BADGE[request.paymentStatus]}`}>
            {request.paymentStatus}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE[request.status]}`}>
            {PIPELINE_LABELS[request.status]}
          </span>
          <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold">
            {formatGhs(request.feeAmountGhs)}
          </span>
        </div>
      </div>

      {isCancelled ? (
        <div className="mt-4 rounded-xl border border-[#FB7185]/40 bg-[#FB7185]/5 p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[#B91C1C] dark:text-[#FCA5A5]">
            <AlertTriangle size={14} /> This request was cancelled.
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <Stepper current={request.status} />
        </div>
      )}

      {request.paymentStatus === 'UNPAID' && !isCancelled && (
        <div className="mt-4 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/5 p-3 text-xs text-[#92400E] dark:text-[#F59E0B]">
          <div className="flex items-start gap-2">
            <CircleDollarSign size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Awaiting payment</div>
              <div className="mt-0.5 text-[var(--muted)]">
                Pay <strong>{formatGhs(request.feeAmountGhs)}</strong> at the Registry counter
                and quote reference{' '}
                <code className="rounded bg-[var(--bg)] px-1.5 py-0.5">{request.id}</code>
                {' '}— we'll mark it paid when received.
              </div>
            </div>
          </div>
        </div>
      )}

      {(request.recipientName || request.recipientAddress || request.recipientEmail) && (
        <dl className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          {request.recipientName && (
            <Detail label="Recipient">{request.recipientName}</Detail>
          )}
          {request.recipientAddress && (
            <Detail label="Address">{request.recipientAddress}</Detail>
          )}
          {request.recipientEmail && (
            <Detail label="Email">{request.recipientEmail}</Detail>
          )}
        </dl>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canGenerateLink && (
          <button onClick={onVerify} className="btn-outline text-xs">
            <Link2 size={14} /> {request.publicVerifyToken ? 'Verification link' : 'Generate verification link'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={onCancel}
            className="btn-ghost text-xs text-[#FB7185]"
          >
            <Trash2 size={14} /> Cancel request
          </button>
        )}
      </div>
    </motion.li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

// ---- Stepper -------------------------------------------------------------

function Stepper({ current }: { current: TranscriptStatus }) {
  const safeIndex = current === 'CANCELLED' ? -1 : PIPELINE.indexOf(current as Exclude<TranscriptStatus, 'CANCELLED'>);

  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {PIPELINE.map((step, i) => {
        const reached = i <= safeIndex;
        const isCurrent = i === safeIndex;
        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            <div
              className={`flex h-7 items-center gap-2 rounded-full px-3 text-[11px] font-semibold transition ${
                isCurrent
                  ? 'bg-[#065F46] text-white shadow dark:bg-[#84CC16] dark:text-[#0b1411]'
                  : reached
                    ? 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                  isCurrent
                    ? 'bg-white/20'
                    : reached
                      ? 'bg-[#065F46]/20 dark:bg-[#84CC16]/30'
                      : 'bg-transparent'
                }`}
              >
                {reached ? <Check size={10} /> : i + 1}
              </span>
              {PIPELINE_LABELS[step]}
            </div>
            {i < PIPELINE.length - 1 && (
              <ChevronRight size={12} className="shrink-0 text-[var(--muted)]" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---- Request editor modal ------------------------------------------------

function RequestEditorModal({
  onClose, onSaved
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TranscriptType>('TRANSCRIPT');
  const [copies, setCopies] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('PICKUP');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');

  const fee = useMemo(() => computeFee(type, copies, deliveryMethod), [type, copies, deliveryMethod]);

  const showRecipient = deliveryMethod !== 'PICKUP';
  const showAddress = deliveryMethod === 'POSTAL_LOCAL' || deliveryMethod === 'POSTAL_INTERNATIONAL';
  const showEmail = deliveryMethod === 'ELECTRONIC';

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        type,
        copies,
        deliveryMethod,
        recipientName: showRecipient ? recipientName.trim() || null : null,
        recipientAddress: showAddress ? recipientAddress.trim() || null : null,
        recipientEmail: showEmail ? recipientEmail.trim() || null : null
      };
      const { data } = await api.post('/transcripts', payload);
      return data.data as TranscriptRequest;
    },
    onSuccess: (saved) => {
      toast.success('Transcript request submitted');
      logActivity('submit_request', { id: saved.id, type: saved.type });
      onSaved();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error?.message;
      toast.error(msg || 'Could not submit request');
    }
  });

  const canSave =
    !saveMut.isPending
    && copies >= 1
    && (!showRecipient || recipientName.trim().length > 0)
    && (!showAddress || recipientAddress.trim().length > 0)
    && (!showEmail || /.+@.+\..+/.test(recipientEmail.trim()));

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Request a transcript</h2>
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
        className="space-y-5"
      >
        <Field label="Document type" required>
          <ChipGroup
            options={Object.entries(TYPE_LABELS) as [TranscriptType, string][]}
            value={type}
            onChange={(v) => setType(v)}
          />
        </Field>

        <Field label="Number of copies" required>
          <input
            type="number"
            min={1}
            max={20}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="input w-32"
            required
          />
        </Field>

        <Field label="Delivery method" required>
          <ChipGroup
            options={Object.entries(DELIVERY_LABELS) as [DeliveryMethod, string][]}
            value={deliveryMethod}
            onChange={(v) => setDeliveryMethod(v)}
          />
        </Field>

        {showRecipient && (
          <Field label="Recipient name" required>
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Admissions Office, University of Ghana"
              className="input"
              required
            />
          </Field>
        )}

        {showAddress && (
          <Field label="Recipient postal address" required>
            <textarea
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="P.O. Box / street address, city, country"
              rows={3}
              className="input"
              required
            />
          </Field>
        )}

        {showEmail && (
          <Field label="Recipient email" required hint="We'll send a secure download link to this address">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="admissions@example.com"
              className="input"
              required
            />
          </Field>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Banknote size={14} /> Estimated fee
            </div>
            <div className="font-heading text-2xl font-extrabold text-[#065F46] dark:text-[#84CC16]">
              {formatGhs(fee)}
            </div>
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-[var(--muted)] sm:grid-cols-2">
            <li>
              {TYPE_LABELS[type]} · {formatGhs(TRANSCRIPT_FEES.baseByType[type])} per copy × {copies}
            </li>
            <li>
              {DELIVERY_LABELS[deliveryMethod]} · {formatGhs(TRANSCRIPT_FEES.deliverySurcharge[deliveryMethod])}
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-[var(--muted)]">
            Pay at the Registry counter and quote your request reference. Online
            payments via Paystack are coming soon.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className="btn-primary">
            {saveMut.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Submitting…</>
            ) : (
              <>Submit request</>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- Verify link modal ---------------------------------------------------

function VerifyLinkModal({
  request, onClose, onUpdated
}: {
  request: TranscriptRequest;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [token, setToken] = useState<string | null>(request.publicVerifyToken);
  const [copied, setCopied] = useState(false);

  const url = token ? `${window.location.origin}/verify/transcript/${token}` : null;

  const generateMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/transcripts/${request.id}/verify-link`);
      return data.data as { token: string };
    },
    onSuccess: (d) => {
      setToken(d.token);
      onUpdated();
      logActivity('verify_link_generated', { id: request.id });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || 'Could not generate link')
  });

  const revokeMut = useMutation({
    mutationFn: async () => (await api.delete(`/transcripts/${request.id}/verify-link`)).data,
    onSuccess: () => {
      setToken(null);
      onUpdated();
      toast.success('Verification link revoked');
    },
    onError: () => toast.error('Could not revoke the link')
  });

  useEffect(() => {
    if (!token) generateMut.mutate();
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
        Share this read-only link with employers or admissions offices. They'll see the
        document type and your name + programme — never your contact info.
      </p>

      {generateMut.isPending && !url ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-sm text-[var(--muted)]">
          <Loader2 size={14} className="animate-spin" /> Generating link…
        </div>
      ) : url ? (
        <>
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <ShieldCheck size={16} className="shrink-0 text-[#065F46] dark:text-[#84CC16]" />
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

// ---- Staff view ----------------------------------------------------------

function StaffView() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<TranscriptStatus | 'ALL'>('ALL');
  const [paymentTarget, setPaymentTarget] = useState<AdminTranscriptRequest | null>(null);
  const [notesTarget, setNotesTarget] = useState<AdminTranscriptRequest | null>(null);

  const { data: requests = [], isLoading } = useQuery<AdminTranscriptRequest[]>({
    queryKey: ['transcripts', 'admin', filter],
    queryFn: async () => {
      const path = filter === 'ALL' ? '/transcripts/admin/all' : `/transcripts/admin/all?status=${filter}`;
      return (await api.get(path)).data.data;
    }
  });

  const advanceMut = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/transcripts/admin/${id}/advance`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transcripts', 'admin'] });
      toast.success('Status advanced');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || 'Could not advance')
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/transcripts/admin/${id}/cancel`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transcripts', 'admin'] });
      toast.success('Request cancelled');
    },
    onError: () => toast.error('Could not cancel request')
  });

  const grouped = useMemo(() => {
    const map = new Map<TranscriptStatus, AdminTranscriptRequest[]>();
    for (const status of [...PIPELINE, 'CANCELLED'] as TranscriptStatus[]) map.set(status, []);
    for (const req of requests) {
      const list = map.get(req.status) ?? [];
      list.push(req);
      map.set(req.status, list);
    }
    return map;
  }, [requests]);

  const totalCount = requests.length;
  const unpaidCount = requests.filter((r) => r.paymentStatus === 'UNPAID' && r.status !== 'CANCELLED').length;
  const inFlightCount = requests.filter((r) =>
    r.status !== 'DELIVERED' && r.status !== 'CANCELLED'
  ).length;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<ClipboardList size={16} />} label="Total requests" value={totalCount} />
        <StatCard icon={<ListChecks size={16} />} label="In-flight" value={inFlightCount} />
        <StatCard icon={<CircleDollarSign size={16} />} label="Awaiting payment" value={unpaidCount} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label="All" />
        {PIPELINE.map((s) => (
          <FilterChip
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            label={PIPELINE_LABELS[s]}
          />
        ))}
        <FilterChip active={filter === 'CANCELLED'} onClick={() => setFilter('CANCELLED')} label="Cancelled" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-12 text-center text-sm text-[var(--muted)]">
          No requests in this view.
        </div>
      ) : (
        <div className="space-y-8">
          {([...PIPELINE, 'CANCELLED'] as TranscriptStatus[]).map((status) => {
            const rows = grouped.get(status) ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={status}>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#065F46] dark:text-[#84CC16]">
                  {PIPELINE_LABELS[status]}
                  <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                    {rows.length}
                  </span>
                </h3>
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                  <ul className="divide-y divide-[var(--border)]">
                    {rows.map((req) => (
                      <StaffRow
                        key={req.id}
                        request={req}
                        onAdvance={() => advanceMut.mutate(req.id)}
                        onCancel={() => {
                          if (confirm(`Cancel ${TYPE_LABELS[req.type]} for ${req.user.firstName} ${req.user.lastName}?`)) {
                            cancelMut.mutate(req.id);
                          }
                        }}
                        onMarkPaid={() => setPaymentTarget(req)}
                        onEditNotes={() => setNotesTarget(req)}
                        advancing={advanceMut.isPending}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {paymentTarget && (
          <PaymentModal
            request={paymentTarget}
            onClose={() => setPaymentTarget(null)}
            onSaved={() => {
              setPaymentTarget(null);
              qc.invalidateQueries({ queryKey: ['transcripts', 'admin'] });
            }}
          />
        )}
        {notesTarget && (
          <NotesModal
            request={notesTarget}
            onClose={() => setNotesTarget(null)}
            onSaved={() => {
              setNotesTarget(null);
              qc.invalidateQueries({ queryKey: ['transcripts', 'admin'] });
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {icon} {label}
      </div>
      <div className="mt-2 font-heading text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? 'border-[#065F46] bg-[#065F46] text-white'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
      }`}
    >
      {label}
    </button>
  );
}

function StaffRow({
  request, onAdvance, onCancel, onMarkPaid, onEditNotes, advancing
}: {
  request: AdminTranscriptRequest;
  onAdvance: () => void;
  onCancel: () => void;
  onMarkPaid: () => void;
  onEditNotes: () => void;
  advancing: boolean;
}) {
  const isTerminal = request.status === 'DELIVERED' || request.status === 'CANCELLED';
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold">
            {request.user.firstName} {request.user.lastName}
          </div>
          <span className="text-xs text-[var(--muted)]">{request.user.email}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          {request.user.programme || '—'}
          {request.user.graduationYear ? ` · Class of ${request.user.graduationYear}` : ''}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 font-semibold">
            {TYPE_LABELS[request.type]} × {request.copies}
          </span>
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
            {DELIVERY_LABELS[request.deliveryMethod]}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-bold ${PAYMENT_BADGE[request.paymentStatus]}`}>
            {request.paymentStatus}
            {request.paymentRef ? ` · ${request.paymentRef}` : ''}
          </span>
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
            {formatGhs(request.feeAmountGhs)}
          </span>
          <span className="text-[var(--muted)]">submitted {formatDate(request.createdAt)}</span>
        </div>
        {request.notes && (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 p-2 text-xs">
            <span className="font-semibold text-[var(--muted)]">Note: </span>{request.notes}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onMarkPaid} className="btn-outline text-xs">
          <Banknote size={14} /> {request.paymentStatus === 'PAID' ? 'Update payment' : 'Mark paid'}
        </button>
        <button
          onClick={onAdvance}
          disabled={isTerminal || advancing}
          className="btn-primary text-xs"
        >
          <ChevronRight size={14} /> Advance
        </button>
        <button onClick={onEditNotes} className="btn-ghost text-xs" title="Add private note">
          <Pencil size={14} />
        </button>
        <button
          onClick={onCancel}
          disabled={request.status === 'CANCELLED'}
          className="btn-ghost text-xs text-[#FB7185]"
          title="Cancel request"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

// ---- Payment modal -------------------------------------------------------

function PaymentModal({
  request, onClose, onSaved
}: {
  request: AdminTranscriptRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paymentRef, setPaymentRef] = useState(request.paymentRef ?? '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(request.paymentStatus);

  const saveMut = useMutation({
    mutationFn: async () =>
      (await api.patch(`/transcripts/admin/${request.id}/payment`, {
        paymentRef: paymentRef.trim(),
        paymentStatus
      })).data.data,
    onSuccess: () => {
      toast.success('Payment updated');
      logActivity('mark_paid', { id: request.id, paymentStatus });
      onSaved();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message || 'Could not update payment')
  });

  const canSave = paymentRef.trim().length > 0 && !saveMut.isPending;

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Confirm payment</h2>
        <button onClick={onClose} className="btn-ghost" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Record the Registry receipt or bank reference for{' '}
        <strong>{request.user.firstName} {request.user.lastName}</strong> —{' '}
        {TYPE_LABELS[request.type]} · {formatGhs(request.feeAmountGhs)}.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) saveMut.mutate();
        }}
        className="mt-4 space-y-4"
      >
        <Field label="Payment reference" required hint="Receipt number, MoMo ref, etc.">
          <input
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="e.g. RGY-2026-04-1842"
            className="input"
            required
          />
        </Field>

        <Field label="Payment status" required>
          <ChipGroup
            options={[
              ['UNPAID', 'Unpaid'],
              ['PAID', 'Paid'],
              ['REFUNDED', 'Refunded']
            ] as [PaymentStatus, string][]}
            value={paymentStatus}
            onChange={(v) => setPaymentStatus(v)}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className="btn-primary">
            {saveMut.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Saving…</>
            ) : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- Notes modal ---------------------------------------------------------

function NotesModal({
  request, onClose, onSaved
}: {
  request: AdminTranscriptRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(request.notes ?? '');

  const saveMut = useMutation({
    mutationFn: async () =>
      (await api.patch(`/transcripts/admin/${request.id}/notes`, {
        notes: notes.trim() || null
      })).data.data,
    onSuccess: () => {
      toast.success('Note saved');
      onSaved();
    },
    onError: () => toast.error('Could not save note')
  });

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Private staff note</h2>
        <button onClick={onClose} className="btn-ghost" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Visible to staff only. Use this to track Registry follow-ups, blockers, or
        special handling instructions.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="mt-4 space-y-4"
      >
        <Field label="Note">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className="input"
            placeholder="e.g. Awaiting signed copy from Faculty Office before processing."
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saveMut.isPending} className="btn-primary">
            {saveMut.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Saving…</>
            ) : 'Save note'}
          </button>
        </div>
      </form>
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
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

function ChipGroup<T extends string>({
  options, value, onChange
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
              active
                ? 'border-[#065F46] bg-[#065F46] text-white'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
