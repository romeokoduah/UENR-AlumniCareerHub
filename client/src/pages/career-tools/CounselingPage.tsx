import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, HeartHandshake, Calendar, Clock, Plus, X, Star,
  Video, Phone, MapPin, CheckCircle2, AlertCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

type CounselingMode = 'IN_PERSON' | 'VIDEO' | 'PHONE';
type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'WAITLIST';

const MODE_ICON: Record<CounselingMode, typeof Video> = {
  IN_PERSON: MapPin,
  VIDEO: Video,
  PHONE: Phone
};

const MODE_LABEL: Record<CounselingMode, string> = {
  IN_PERSON: 'In-person',
  VIDEO: 'Video call',
  PHONE: 'Phone'
};

type StaffPreview = { id: string; firstName: string; lastName: string; avatar: string | null; currentRole: string | null };

type AvailableSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: CounselingMode;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  notes: string | null;
  staff: StaffPreview;
};

type Booking = {
  id: string;
  slotId: string;
  alumniId: string;
  topic: string;
  preferredMode: CounselingMode;
  status: BookingStatus;
  staffNotes: string | null | undefined;
  satisfactionRating: number | null;
  satisfactionComment: string | null;
  createdAt: string;
  updatedAt: string;
  slot: AvailableSlot;
};

type StaffSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: CounselingMode;
  capacity: number;
  isActive: boolean;
  notes: string | null;
  _count: { bookings: number };
  bookings: (Booking & { alumnus: { id: string; firstName: string; lastName: string; programme: string | null; graduationYear: number | null; email: string } })[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function CounselingPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const [staffMode, setStaffMode] = useState(false);

  useEffect(() => {
    api.post('/career-tools/activity', { tool: 'counseling', action: 'open' }).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <HeartHandshake size={24} />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight">Career Counseling</h1>
            <p className="text-sm text-[var(--muted)]">
              {staffMode
                ? 'Publish slots and manage bookings.'
                : 'Book a 1-on-1 with UENR Career Services.'}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setStaffMode(!staffMode)} className="btn-ghost text-sm">
            {staffMode ? 'Switch to alumni view' : 'Switch to staff view'}
          </button>
        )}
      </div>

      {staffMode ? <StaffView /> : <AlumniView />}
    </div>
  );
}

// ===== Alumni view =====

function AlumniView() {
  const { data: slots = [] } = useQuery<AvailableSlot[]>({
    queryKey: ['counseling', 'slots', 'available'],
    queryFn: async () => (await api.get('/counseling/slots/available')).data.data
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['counseling', 'bookings', 'mine'],
    queryFn: async () => (await api.get('/counseling/bookings/mine')).data.data
  });

  const [bookingSlot, setBookingSlot] = useState<AvailableSlot | null>(null);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>();
    slots.forEach((s) => {
      const key = formatDate(s.startsAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries());
  }, [slots]);

  const upcoming = bookings.filter((b) => new Date(b.slot.startsAt) > new Date() && b.status !== 'CANCELLED');
  const past = bookings.filter((b) => new Date(b.slot.startsAt) <= new Date() || b.status === 'CANCELLED');

  return (
    <div className="mt-10 space-y-12">
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-4 font-heading text-lg font-bold">Your upcoming sessions</h2>
          <div className="space-y-3">
            {upcoming.map((b) => <BookingRow key={b.id} booking={b} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-heading text-lg font-bold">Available slots (next few weeks)</h2>
        {slotsByDate.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
            No published slots yet — check back soon.
          </div>
        ) : (
          <div className="space-y-6">
            {slotsByDate.map(([date, dateSlots]) => (
              <div key={date}>
                <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{date}</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {dateSlots.map((s) => <SlotCard key={s.id} slot={s} onBook={() => setBookingSlot(s)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-4 font-heading text-lg font-bold">Past sessions</h2>
          <div className="space-y-3">
            {past.slice(0, 10).map((b) => <BookingRow key={b.id} booking={b} />)}
          </div>
        </section>
      )}

      {bookingSlot && <BookModal slot={bookingSlot} onClose={() => setBookingSlot(null)} />}
    </div>
  );
}

function SlotCard({ slot, onBook }: { slot: AvailableSlot; onBook: () => void }) {
  const Icon = MODE_ICON[slot.mode];
  const isFull = slot.spotsLeft === 0;
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock size={14} className="text-[var(--muted)]" />
          {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Icon size={10} /> {MODE_LABEL[slot.mode]}
        </span>
      </div>
      <div className="mt-3 text-sm">
        <div className="font-semibold">{slot.staff.firstName} {slot.staff.lastName}</div>
        {slot.staff.currentRole && <div className="text-xs text-[var(--muted)]">{slot.staff.currentRole}</div>}
      </div>
      {slot.notes && <p className="mt-2 text-xs text-[var(--muted)] line-clamp-2">{slot.notes}</p>}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-[var(--muted)]">
          {isFull ? 'Full' : `${slot.spotsLeft} of ${slot.capacity} open`}
        </div>
        <button onClick={onBook} className={isFull ? 'btn-ghost text-xs' : 'btn-primary text-xs'}>
          {isFull ? 'Join waitlist' : 'Book'}
        </button>
      </div>
    </article>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  const Icon = MODE_ICON[booking.preferredMode];
  const qc = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);

  const cancelMut = useMutation({
    mutationFn: async () => (await api.patch(`/counseling/bookings/${booking.id}/cancel`)).data.data,
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: 'counseling', action: 'cancel_booking' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['counseling'] });
      toast.success('Booking cancelled');
    },
    onError: () => toast.error('Cancel failed')
  });

  const isUpcoming = new Date(booking.slot.startsAt) > new Date() && booking.status !== 'CANCELLED';
  const canReview = booking.status === 'COMPLETED' && booking.satisfactionRating == null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={14} className="text-[var(--muted)]" />
            <span className="font-semibold">{formatDate(booking.slot.startsAt)} · {formatTime(booking.slot.startsAt)}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Icon size={10} /> {MODE_LABEL[booking.preferredMode]}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">with {booking.slot.staff.firstName} {booking.slot.staff.lastName}</div>
          <p className="mt-2 text-sm text-[var(--fg)]/85">Topic: {booking.topic}</p>
          {booking.satisfactionRating != null && (
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <Star size={12} className="fill-amber-400 text-amber-400" /> {booking.satisfactionRating}/5
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(booking.status)}`}>
            {booking.status.toLowerCase()}
          </span>
          {isUpcoming && (
            <button onClick={() => cancelMut.mutate()} className="btn-ghost text-xs text-rose-600">Cancel</button>
          )}
          {canReview && (
            <button onClick={() => setReviewOpen(true)} className="btn-primary text-xs"><Star size={12} /> Leave feedback</button>
          )}
        </div>
      </div>

      {reviewOpen && <SatisfactionModal bookingId={booking.id} onClose={() => setReviewOpen(false)} />}
    </div>
  );
}

function statusBadgeClass(s: BookingStatus): string {
  switch (s) {
    case 'CONFIRMED': return 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]';
    case 'PENDING': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'WAITLIST': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'COMPLETED': return 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]';
    case 'CANCELLED': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  }
}

// ===== Book modal =====

function BookModal({ slot, onClose }: { slot: AvailableSlot; onClose: () => void }) {
  const qc = useQueryClient();
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<CounselingMode>(slot.mode);

  const mut = useMutation({
    mutationFn: async () =>
      (await api.post('/counseling/bookings', { slotId: slot.id, topic, preferredMode: mode })).data.data,
    onSuccess: (b: Booking) => {
      api.post('/career-tools/activity', { tool: 'counseling', action: 'book' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['counseling'] });
      toast.success(b.status === 'WAITLIST' ? 'Added to waitlist' : 'Booking submitted — awaiting confirmation');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Booking failed')
  });

  return (
    <ModalShell onClose={onClose} title="Book this session">
      <div className="mb-4 rounded-xl bg-[var(--card)] p-3 text-sm">
        <div className="font-semibold">{formatDate(slot.startsAt)} · {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}</div>
        <div className="text-xs text-[var(--muted)]">with {slot.staff.firstName} {slot.staff.lastName}</div>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold">What would you like help with?</label>
          <textarea className="input mt-1" rows={4} maxLength={500} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Help me decide between two job offers" />
        </div>
        <div>
          <label className="text-xs font-semibold">Preferred mode</label>
          <div className="mt-1 flex gap-2">
            {(['IN_PERSON', 'VIDEO', 'PHONE'] as CounselingMode[]).map((m) => {
              const Icon = MODE_ICON[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] hover:border-[#065F46]/50'}`}
                >
                  <Icon size={12} /> {MODE_LABEL[m]}
                </button>
              );
            })}
          </div>
        </div>
        {slot.spotsLeft === 0 && (
          <div className="rounded-xl border-l-4 border-l-blue-400 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-200">
            <AlertCircle size={12} className="inline mr-1" />
            This slot is full — you'll be added to the waitlist and promoted automatically if someone cancels.
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={topic.length < 3 || mut.isPending} className="btn-primary">
          {mut.isPending ? 'Submitting…' : (slot.spotsLeft === 0 ? 'Join waitlist' : 'Submit booking')}
        </button>
      </div>
    </ModalShell>
  );
}

function SatisfactionModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const mut = useMutation({
    mutationFn: async () =>
      (await api.patch(`/counseling/bookings/${bookingId}/satisfaction`, { rating, comment: comment || undefined })).data.data,
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: 'counseling', action: 'submit_satisfaction' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['counseling'] });
      toast.success('Thanks for the feedback');
      onClose();
    }
  });

  return (
    <ModalShell onClose={onClose} title="How was your session?">
      <div className="mb-4 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} className="p-1">
            <Star size={32} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-[var(--muted)]'} />
          </button>
        ))}
      </div>
      <textarea className="input" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What was helpful? (optional)" />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Skip</button>
        <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
          {mut.isPending ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </ModalShell>
  );
}

// ===== Staff view =====

function StaffView() {
  const { data: slots = [] } = useQuery<StaffSlot[]>({
    queryKey: ['counseling', 'slots', 'mine'],
    queryFn: async () => (await api.get('/counseling/slots/mine')).data.data
  });
  const [publishOpen, setPublishOpen] = useState(false);

  const upcoming = slots.filter((s) => new Date(s.startsAt) > new Date());
  const past = slots.filter((s) => new Date(s.startsAt) <= new Date());

  return (
    <div className="mt-10">
      <div className="mb-6 flex justify-end">
        <button onClick={() => setPublishOpen(true)} className="btn-primary">
          <Plus size={16} /> Publish a slot
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
          You haven't published any slots yet.
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Upcoming ({upcoming.length})</h2>
              <div className="space-y-3">
                {upcoming.map((s) => <StaffSlotRow key={s.id} slot={s} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Past ({past.length})</h2>
              <div className="space-y-3">
                {past.slice(0, 20).map((s) => <StaffSlotRow key={s.id} slot={s} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {publishOpen && <PublishSlotModal onClose={() => setPublishOpen(false)} />}
    </div>
  );
}

function StaffSlotRow({ slot }: { slot: StaffSlot }) {
  const [open, setOpen] = useState(false);
  const Icon = MODE_ICON[slot.mode];
  const activeCount = slot.bookings.filter((b) => b.status === 'PENDING' || b.status === 'CONFIRMED').length;
  const waitCount = slot.bookings.filter((b) => b.status === 'WAITLIST').length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Calendar size={14} className="text-[var(--muted)]" />
            {formatDate(slot.startsAt)} · {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Icon size={10} /> {MODE_LABEL[slot.mode]}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {activeCount} of {slot.capacity} active{waitCount > 0 ? ` · ${waitCount} on waitlist` : ''}
            {!slot.isActive && <span className="ml-2 text-rose-500">· inactive</span>}
          </div>
        </div>
        <span className="text-xs text-[var(--muted)]">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4">
          {slot.bookings.length === 0 ? (
            <div className="text-center text-sm text-[var(--muted)] py-4">No bookings yet.</div>
          ) : (
            <div className="space-y-2">
              {slot.bookings.map((b) => <StaffBookingRow key={b.id} booking={b} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StaffBookingRow({ booking }: { booking: StaffSlot['bookings'][number] }) {
  const qc = useQueryClient();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(booking.staffNotes ?? '');

  const confirmMut = useMutation({
    mutationFn: async () => (await api.patch(`/counseling/bookings/${booking.id}/confirm`)).data.data,
    onSuccess: () => { toast.success('Confirmed'); qc.invalidateQueries({ queryKey: ['counseling'] }); }
  });
  const completeMut = useMutation({
    mutationFn: async () => (await api.patch(`/counseling/bookings/${booking.id}/complete`)).data.data,
    onSuccess: () => { toast.success('Marked complete'); qc.invalidateQueries({ queryKey: ['counseling'] }); }
  });
  const cancelMut = useMutation({
    mutationFn: async () => (await api.patch(`/counseling/bookings/${booking.id}/cancel`)).data.data,
    onSuccess: () => { toast.success('Cancelled'); qc.invalidateQueries({ queryKey: ['counseling'] }); }
  });
  const notesMut = useMutation({
    mutationFn: async () => (await api.patch(`/counseling/bookings/${booking.id}/notes`, { staffNotes: notes || null })).data.data,
    onSuccess: () => { toast.success('Notes saved'); qc.invalidateQueries({ queryKey: ['counseling'] }); setNotesOpen(false); }
  });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">{booking.alumnus.firstName} {booking.alumnus.lastName}</div>
          <div className="text-xs text-[var(--muted)]">{booking.alumnus.programme} {booking.alumnus.graduationYear ? `· ${booking.alumnus.graduationYear}` : ''} · {booking.alumnus.email}</div>
          <p className="mt-2 text-sm text-[var(--fg)]/85">Topic: {booking.topic}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(booking.status)}`}>
          {booking.status.toLowerCase()}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {booking.status === 'PENDING' && (
          <button onClick={() => confirmMut.mutate()} className="btn-primary text-xs"><CheckCircle2 size={12} /> Confirm</button>
        )}
        {booking.status === 'CONFIRMED' && (
          <button onClick={() => completeMut.mutate()} className="btn-primary text-xs">Mark complete</button>
        )}
        {(booking.status === 'PENDING' || booking.status === 'CONFIRMED' || booking.status === 'WAITLIST') && (
          <button onClick={() => cancelMut.mutate()} className="btn-ghost text-xs text-rose-600">Cancel</button>
        )}
        <button onClick={() => setNotesOpen(!notesOpen)} className="btn-ghost text-xs">
          {notesOpen ? 'Hide notes' : booking.staffNotes ? 'Edit notes' : 'Add private notes'}
        </button>
      </div>

      {notesOpen && (
        <div className="mt-3">
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Private notes (only you can see these)"
          />
          <div className="mt-2 flex justify-end">
            <button onClick={() => notesMut.mutate()} disabled={notesMut.isPending} className="btn-primary text-xs">
              {notesMut.isPending ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        </div>
      )}

      {booking.satisfactionRating != null && (
        <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
          <div className="flex items-center gap-1 font-semibold">
            <Star size={12} className="fill-amber-400 text-amber-400" /> {booking.satisfactionRating}/5
          </div>
          {booking.satisfactionComment && <div className="mt-1 text-[var(--fg)]/80">{booking.satisfactionComment}</div>}
        </div>
      )}
    </div>
  );
}

function PublishSlotModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [mode, setMode] = useState<CounselingMode>('VIDEO');
  const [capacity, setCapacity] = useState(1);
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        mode,
        capacity,
        notes: notes || undefined
      };
      return (await api.post('/counseling/slots', body)).data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['counseling'] }); toast.success('Slot published'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to publish')
  });

  return (
    <ModalShell onClose={onClose} title="Publish a counseling slot">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold">Start</label>
            <input type="datetime-local" className="input mt-1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold">End</label>
            <input type="datetime-local" className="input mt-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">Mode</label>
          <div className="mt-1 flex gap-2">
            {(['IN_PERSON', 'VIDEO', 'PHONE'] as CounselingMode[]).map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${mode === m ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] hover:border-[#065F46]/50'}`}
                >
                  <Icon size={12} /> {MODE_LABEL[m]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">Capacity</label>
          <input type="number" min={1} max={10} className="input mt-1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-semibold">Notes (optional)</label>
          <textarea className="input mt-1" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Topics you can help with, video link, etc." />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={!startsAt || !endsAt || mut.isPending} className="btn-primary">
          {mut.isPending ? 'Publishing…' : 'Publish slot'}
        </button>
      </div>
    </ModalShell>
  );
}

// ===== Modal shell =====

function ModalShell({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-heading text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
