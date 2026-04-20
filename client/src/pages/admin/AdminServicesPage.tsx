// Phase 6 superuser oversight for Career Services.
//
// Three tabs, all backed by /api/admin/services/*:
//   - Counseling: every slot + every booking, with override drawer +
//     reassign-slot action.
//   - Transcripts: every request, with override drawer + regenerate
//     verify-token action.
//   - Certifications: every cert with expiry traffic-light + clear
//     verify-link action.
//
// Every override that affects user-visible state requires a typed
// confirmation ("OVERRIDE", "REASSIGN", "REGENERATE", "REVOKE").

import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  HeartHandshake, Calendar, FileText, Award, X, Search,
  RefreshCw, ShieldAlert, AlertTriangle, CheckCircle2, Link2Off
} from 'lucide-react';
import { api } from '../../services/api';

type StaffLite = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  role: string;
  currentRole?: string | null;
};

type AlumnusLite = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  programme?: string | null;
  graduationYear?: number | null;
};

type OwnerLite = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  programme?: string | null;
  graduationYear?: number | null;
  role: string;
};

type CounselingSlotRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: 'IN_PERSON' | 'VIDEO' | 'PHONE';
  capacity: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  activeBookingCount: number;
  staff: StaffLite;
};

type CounselingBookingRow = {
  id: string;
  slotId: string;
  topic: string;
  preferredMode: 'IN_PERSON' | 'VIDEO' | 'PHONE';
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'WAITLIST';
  staffNotes: string | null;
  createdAt: string;
  updatedAt: string;
  alumnus: AlumnusLite;
  slot: { id: string; startsAt: string; endsAt: string; mode: string; staff: StaffLite };
};

type TranscriptRow = {
  id: string;
  userId: string;
  type: 'TRANSCRIPT' | 'LETTER_OF_ATTENDANCE' | 'DEGREE_VERIFICATION';
  copies: number;
  deliveryMethod: 'PICKUP' | 'POSTAL_LOCAL' | 'POSTAL_INTERNATIONAL' | 'ELECTRONIC';
  recipientName: string | null;
  recipientAddress: string | null;
  recipientEmail: string | null;
  feeAmountGhs: number;
  paymentRef: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'PROCESSING' | 'READY' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  publicVerifyToken: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user: OwnerLite;
};

type CertRow = {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  credentialUrl: string | null;
  publicSlug: string | null;
  createdAt: string;
  user: OwnerLite;
};

const TABS = [
  { key: 'counseling', label: 'Counseling', icon: Calendar },
  { key: 'transcripts', label: 'Transcripts', icon: FileText },
  { key: 'certifications', label: 'Certifications', icon: Award }
] as const;
type TabKey = (typeof TABS)[number]['key'];

const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'WAITLIST'] as const;
const TRANSCRIPT_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'PROCESSING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const;
const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUNDED'] as const;

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' as any }) : '—';

function typedConfirm(word: string, message: string): boolean {
  const reply = window.prompt(`${message}\n\nType "${word}" to confirm.`);
  return reply?.trim().toUpperCase() === word.toUpperCase();
}

function statusBadge(s: string): string {
  switch (s) {
    case 'CONFIRMED':
    case 'PAID':
    case 'DELIVERED':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'PENDING':
    case 'SUBMITTED':
    case 'UNPAID':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'COMPLETED':
    case 'READY':
    case 'DISPATCHED':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'CANCELLED':
    case 'REJECTED':
    case 'REFUNDED':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
    case 'WAITLIST':
    case 'UNDER_REVIEW':
    case 'PROCESSING':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
    default:
      return 'bg-[var(--bg)] text-[var(--fg)]/70 border border-[var(--border)]';
  }
}

export default function AdminServicesPage() {
  const [tab, setTab] = useState<TabKey>('counseling');

  return (
    <div>
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <HeartHandshake size={20} className="text-[#065F46] dark:text-[#84CC16]" />
          <h1 className="font-heading text-2xl font-extrabold">Career Services oversight</h1>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Read-and-override access to every counseling slot, booking, transcript request, and certification across all staff and alumni.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {tab === 'counseling' && <CounselingPanel />}
      {tab === 'transcripts' && <TranscriptsPanel />}
      {tab === 'certifications' && <CertificationsPanel />}
    </div>
  );
}

// =====================================================================
// COUNSELING PANEL
// =====================================================================

function CounselingPanel() {
  const qc = useQueryClient();
  const [slotStaffId, setSlotStaffId] = useState('');
  const [slotFrom, setSlotFrom] = useState('');
  const [slotTo, setSlotTo] = useState('');

  const [bookingStatus, setBookingStatus] = useState<string>('');
  const [bookingStaffId, setBookingStaffId] = useState('');
  const [bookingAlumniId, setBookingAlumniId] = useState('');

  const [openBooking, setOpenBooking] = useState<CounselingBookingRow | null>(null);

  const slotQuery = useQuery<CounselingSlotRow[]>({
    queryKey: ['admin', 'services', 'counseling', 'slots', slotStaffId, slotFrom, slotTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (slotStaffId) params.set('staffId', slotStaffId);
      if (slotFrom) params.set('from', new Date(slotFrom).toISOString());
      if (slotTo) params.set('to', new Date(slotTo).toISOString());
      const url = '/admin/services/counseling/slots' + (params.toString() ? `?${params}` : '');
      return (await api.get(url)).data.data;
    }
  });

  const bookingsQuery = useQuery<CounselingBookingRow[]>({
    queryKey: ['admin', 'services', 'counseling', 'bookings', bookingStatus, bookingStaffId, bookingAlumniId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (bookingStatus) params.set('status', bookingStatus);
      if (bookingStaffId) params.set('staffId', bookingStaffId);
      if (bookingAlumniId) params.set('alumniId', bookingAlumniId);
      const url = '/admin/services/counseling/bookings' + (params.toString() ? `?${params}` : '');
      return (await api.get(url)).data.data;
    }
  });

  const reassignMut = useMutation({
    mutationFn: async (vars: { slotId: string; newStaffId: string }) =>
      (await api.patch(`/admin/services/counseling/slots/${vars.slotId}/reassign`, { newStaffId: vars.newStaffId })).data.data,
    onSuccess: () => {
      toast.success('Slot reassigned');
      qc.invalidateQueries({ queryKey: ['admin', 'services', 'counseling', 'slots'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Reassign failed')
  });

  return (
    <div className="space-y-8">
      {/* SLOTS */}
      <section>
        <h2 className="mb-3 font-heading text-lg font-bold">Slots</h2>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <FilterField label="Staff ID">
            <input
              value={slotStaffId}
              onChange={(e) => setSlotStaffId(e.target.value.trim())}
              placeholder="Optional"
              className="input"
            />
          </FilterField>
          <FilterField label="From">
            <input type="date" value={slotFrom} onChange={(e) => setSlotFrom(e.target.value)} className="input" />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={slotTo} onChange={(e) => setSlotTo(e.target.value)} className="input" />
          </FilterField>
          {(slotStaffId || slotFrom || slotTo) && (
            <button
              onClick={() => { setSlotStaffId(''); setSlotFrom(''); setSlotTo(''); }}
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]"
            >
              Clear
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Active bookings</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slotQuery.isLoading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
              )}
              {!slotQuery.isLoading && (slotQuery.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--muted)]">No slots match.</td></tr>
              )}
              {(slotQuery.data ?? []).map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)]/50 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{fmtDateTime(s.startsAt)}</div>
                    <div className="text-xs text-[var(--muted)]">to {fmtDateTime(s.endsAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{s.staff.firstName} {s.staff.lastName}</div>
                    <div className="text-xs text-[var(--muted)]">{s.staff.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.mode}</td>
                  <td className="px-4 py-3 text-xs">{s.capacity}</td>
                  <td className="px-4 py-3 text-xs">{s.activeBookingCount}</td>
                  <td className="px-4 py-3 text-xs">
                    {s.isActive
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">active</span>
                      : <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        const newStaffId = window.prompt(`Reassign slot ${s.id}\n\nCurrent staff: ${s.staff.firstName} ${s.staff.lastName} (${s.staff.id})\n\nEnter the new staff (ADMIN) user ID:`)?.trim();
                        if (!newStaffId) return;
                        if (!typedConfirm('REASSIGN', `Move this slot from ${s.staff.firstName} to user ${newStaffId}?`)) return;
                        reassignMut.mutate({ slotId: s.id, newStaffId });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:border-[#065F46]/50"
                    >
                      <RefreshCw size={12} /> Reassign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* BOOKINGS */}
      <section>
        <h2 className="mb-3 font-heading text-lg font-bold">Bookings</h2>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <FilterField label="Status">
            <select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)} className="input">
              <option value="">All</option>
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FilterField>
          <FilterField label="Staff ID">
            <input value={bookingStaffId} onChange={(e) => setBookingStaffId(e.target.value.trim())} placeholder="Optional" className="input" />
          </FilterField>
          <FilterField label="Alumni ID">
            <input value={bookingAlumniId} onChange={(e) => setBookingAlumniId(e.target.value.trim())} placeholder="Optional" className="input" />
          </FilterField>
          {(bookingStatus || bookingStaffId || bookingAlumniId) && (
            <button onClick={() => { setBookingStatus(''); setBookingStaffId(''); setBookingAlumniId(''); }}
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]">Clear</button>
          )}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Alumnus</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookingsQuery.isLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
              )}
              {!bookingsQuery.isLoading && (bookingsQuery.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted)]">No bookings match.</td></tr>
              )}
              {(bookingsQuery.data ?? []).map((b) => (
                <tr key={b.id} className="border-b border-[var(--border)]/50 last:border-b-0">
                  <td className="px-4 py-3 text-xs">{fmtDateTime(b.slot.startsAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{b.alumnus.firstName} {b.alumnus.lastName}</div>
                    <div className="text-xs text-[var(--muted)]">{b.alumnus.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{b.slot.staff.firstName} {b.slot.staff.lastName}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs" title={b.topic}>{b.topic}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadge(b.status)}`}>{b.status.toLowerCase()}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setOpenBooking(b)} className="text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]">Override…</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Drawer open={!!openBooking} onClose={() => setOpenBooking(null)} title="Override booking">
        {openBooking && (
          <BookingOverrideForm
            booking={openBooking}
            onDone={() => {
              setOpenBooking(null);
              qc.invalidateQueries({ queryKey: ['admin', 'services', 'counseling', 'bookings'] });
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function BookingOverrideForm({
  booking,
  onDone
}: {
  booking: CounselingBookingRow;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<typeof BOOKING_STATUSES[number]>(booking.status);
  const [notes, setNotes] = useState(booking.staffNotes ?? '');

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (status !== booking.status) body.status = status;
      if ((notes || null) !== (booking.staffNotes || null)) body.staffNotes = notes.trim() ? notes : null;
      if (Object.keys(body).length === 0) throw new Error('Nothing changed');
      return (await api.patch(`/admin/services/counseling/bookings/${booking.id}`, body)).data.data;
    },
    onSuccess: () => { toast.success('Booking overridden'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Override failed')
  });

  return (
    <div className="space-y-4">
      <DrawerRow label="Alumnus">{booking.alumnus.firstName} {booking.alumnus.lastName} <span className="text-xs text-[var(--muted)]">({booking.alumnus.email})</span></DrawerRow>
      <DrawerRow label="Staff">{booking.slot.staff.firstName} {booking.slot.staff.lastName}</DrawerRow>
      <DrawerRow label="Topic">{booking.topic}</DrawerRow>
      <DrawerRow label="When">{fmtDateTime(booking.slot.startsAt)}</DrawerRow>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input w-full">
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Staff notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="input w-full" maxLength={4000} />
      </div>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <ShieldAlert size={14} className="mr-1 inline" />
        Superuser override bypasses the slot-owner check and is logged in the audit trail.
      </div>
      <button
        disabled={mut.isPending}
        onClick={() => {
          if (!typedConfirm('OVERRIDE', `Apply override to booking ${booking.id}?`)) return;
          mut.mutate();
        }}
        className="rounded-lg bg-[#065F46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#064E3B] disabled:opacity-50"
      >
        Save override
      </button>
    </div>
  );
}

// =====================================================================
// TRANSCRIPTS PANEL
// =====================================================================

function TranscriptsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [open, setOpen] = useState<TranscriptRow | null>(null);

  const q = useQuery<TranscriptRow[]>({
    queryKey: ['admin', 'services', 'transcripts', status, paymentStatus, userId],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (paymentStatus) p.set('paymentStatus', paymentStatus);
      if (userId) p.set('userId', userId);
      const url = '/admin/services/transcripts' + (p.toString() ? `?${p}` : '');
      return (await api.get(url)).data.data;
    }
  });

  const regenMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/services/transcripts/${id}/regenerate-verify-token`)).data.data,
    onSuccess: () => {
      toast.success('Verify token regenerated');
      qc.invalidateQueries({ queryKey: ['admin', 'services', 'transcripts'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <FilterField label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            <option value="">All</option>
            {TRANSCRIPT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FilterField>
        <FilterField label="Payment">
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="input">
            <option value="">All</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FilterField>
        <FilterField label="User ID">
          <input value={userId} onChange={(e) => setUserId(e.target.value.trim())} className="input" placeholder="Optional" />
        </FilterField>
        {(status || paymentStatus || userId) && (
          <button onClick={() => { setStatus(''); setPaymentStatus(''); setUserId(''); }}
            className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]">Clear</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Alumnus</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Verify token</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
            )}
            {!q.isLoading && (q.data ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--muted)]">No requests match.</td></tr>
            )}
            {(q.data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-[var(--border)]/50 last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{t.user.firstName} {t.user.lastName}</div>
                  <div className="text-xs text-[var(--muted)]">{t.user.email}</div>
                </td>
                <td className="px-4 py-3 text-xs">{t.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadge(t.status)}`}>{t.status.toLowerCase()}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadge(t.paymentStatus)}`}>{t.paymentStatus.toLowerCase()}</span>
                </td>
                <td className="px-4 py-3 text-xs">GHS {t.feeAmountGhs}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.publicVerifyToken ? `${t.publicVerifyToken.slice(0, 8)}…` : '—'}</td>
                <td className="px-4 py-3 text-xs">{fmtDate(t.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setOpen(t)} className="text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]">Override…</button>
                    <button
                      onClick={() => {
                        if (!typedConfirm('REGENERATE', `Regenerate verify token for request ${t.id}? Existing token will be invalidated.`)) return;
                        regenMut.mutate(t.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
                      title="Regenerate verify token"
                    >
                      <RefreshCw size={12} /> New token
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Override transcript request">
        {open && (
          <TranscriptOverrideForm
            row={open}
            onDone={() => {
              setOpen(null);
              qc.invalidateQueries({ queryKey: ['admin', 'services', 'transcripts'] });
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function TranscriptOverrideForm({ row, onDone }: { row: TranscriptRow; onDone: () => void }) {
  const [status, setStatus] = useState(row.status);
  const [paymentStatus, setPaymentStatus] = useState(row.paymentStatus);
  const [paymentRef, setPaymentRef] = useState(row.paymentRef ?? '');
  const [feeAmountGhs, setFeeAmountGhs] = useState(row.feeAmountGhs);
  const [notes, setNotes] = useState(row.notes ?? '');

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (status !== row.status) body.status = status;
      if (paymentStatus !== row.paymentStatus) body.paymentStatus = paymentStatus;
      if ((paymentRef || null) !== (row.paymentRef || null)) body.paymentRef = paymentRef.trim() || null;
      if (feeAmountGhs !== row.feeAmountGhs) body.feeAmountGhs = feeAmountGhs;
      if ((notes || null) !== (row.notes || null)) body.notes = notes.trim() ? notes : null;
      if (Object.keys(body).length === 0) throw new Error('Nothing changed');
      return (await api.patch(`/admin/services/transcripts/${row.id}`, body)).data.data;
    },
    onSuccess: () => { toast.success('Request overridden'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Override failed')
  });

  return (
    <div className="space-y-4">
      <DrawerRow label="Alumnus">{row.user.firstName} {row.user.lastName} <span className="text-xs text-[var(--muted)]">({row.user.email})</span></DrawerRow>
      <DrawerRow label="Type">{row.type.replace(/_/g, ' ')}</DrawerRow>
      <DrawerRow label="Copies">{row.copies}</DrawerRow>
      <DrawerRow label="Delivery">{row.deliveryMethod.replace(/_/g, ' ')}</DrawerRow>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input w-full">
            {TRANSCRIPT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Payment</label>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)} className="input w-full">
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Payment ref</label>
          <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="input w-full" maxLength={120} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Fee (GHS)</label>
          <input
            type="number"
            value={feeAmountGhs}
            onChange={(e) => setFeeAmountGhs(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            className="input w-full"
            min={0}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Internal notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input w-full" maxLength={2000} />
      </div>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <ShieldAlert size={14} className="mr-1 inline" />
        Bypasses the standard pipeline (won't auto-notify the candidate). Logged in the audit trail.
      </div>
      <button
        disabled={mut.isPending}
        onClick={() => {
          if (!typedConfirm('OVERRIDE', `Apply superuser override to transcript ${row.id}?`)) return;
          mut.mutate();
        }}
        className="rounded-lg bg-[#065F46] px-4 py-2 text-sm font-semibold text-white hover:bg-[#064E3B] disabled:opacity-50"
      >
        Save override
      </button>
    </div>
  );
}

// =====================================================================
// CERTIFICATIONS PANEL
// =====================================================================

function CertificationsPanel() {
  const qc = useQueryClient();
  const [days, setDays] = useState('');
  const [hasLink, setHasLink] = useState<'' | 'true' | 'false'>('');
  const [search, setSearch] = useState('');

  const q = useQuery<CertRow[]>({
    queryKey: ['admin', 'services', 'certifications', days, hasLink],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (days) p.set('expiringWithinDays', days);
      if (hasLink) p.set('hasVerifyLink', hasLink);
      const url = '/admin/services/certifications' + (p.toString() ? `?${p}` : '');
      return (await api.get(url)).data.data;
    }
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter((c) =>
      c.name.toLowerCase().includes(term) ||
      c.issuer.toLowerCase().includes(term) ||
      c.user.email.toLowerCase().includes(term) ||
      `${c.user.firstName} ${c.user.lastName}`.toLowerCase().includes(term)
    );
  }, [q.data, search]);

  const revokeMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/services/certifications/${id}/verify-link`)).data.data,
    onSuccess: () => {
      toast.success('Verify link cleared');
      qc.invalidateQueries({ queryKey: ['admin', 'services', 'certifications'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <FilterField label="Search">
          <label className="relative block">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cert / issuer / owner…"
              className="input pl-8"
            />
          </label>
        </FilterField>
        <FilterField label="Expiring within (days)">
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="e.g. 30"
            className="input w-32"
            min={1}
            max={3650}
          />
        </FilterField>
        <FilterField label="Verify link">
          <select value={hasLink} onChange={(e) => setHasLink(e.target.value as any)} className="input">
            <option value="">All</option>
            <option value="true">Has link</option>
            <option value="false">No link</option>
          </select>
        </FilterField>
        {(days || hasLink || search) && (
          <button onClick={() => { setDays(''); setHasLink(''); setSearch(''); }}
            className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]">Clear</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Cert</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3">Verify slug</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
            )}
            {!q.isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted)]">No certifications match.</td></tr>
            )}
            {filtered.map((c) => (
              <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-[var(--border)]/50 last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-[var(--muted)]">{c.issuer}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{c.user.firstName} {c.user.lastName}</div>
                  <div className="text-xs text-[var(--muted)]">{c.user.email}</div>
                </td>
                <td className="px-4 py-3 text-xs">{fmtDate(c.issueDate)}</td>
                <td className="px-4 py-3"><ExpiryPill iso={c.expiryDate} /></td>
                <td className="px-4 py-3 font-mono text-xs">{c.publicSlug ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled={!c.publicSlug || revokeMut.isPending}
                    onClick={() => {
                      if (!typedConfirm('REVOKE', `Clear public verify link for "${c.name}" (owner ${c.user.email})?`)) return;
                      revokeMut.mutate(c.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:hover:bg-rose-950/30"
                  >
                    <Link2Off size={12} /> Clear link
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpiryPill({ iso }: { iso: string | null }) {
  if (!iso) {
    return <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">no expiry</span>;
  }
  const d = new Date(iso);
  const now = Date.now();
  const diffDays = Math.round((d.getTime() - now) / 86_400_000);
  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        <AlertTriangle size={10} /> expired {fmtDate(iso)}
      </span>
    );
  }
  if (diffDays <= 30) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <AlertTriangle size={10} /> {diffDays}d → {fmtDate(iso)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      <CheckCircle2 size={10} /> {fmtDate(iso)}
    </span>
  );
}

// =====================================================================
// Shared bits
// =====================================================================

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function DrawerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Drawer({
  open, onClose, title, children
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-[var(--card)] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-lg font-bold">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/5">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

