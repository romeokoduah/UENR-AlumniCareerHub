// Mock Interview Scheduler — replaces the placeholder at
// /career-tools/interview/mock.
//
// Reuses the existing /api/mentors directory for the mentor list; mock
// requests post to /api/mock-interviews/request which creates or reuses a
// MentorshipMatch and writes a Session with mockMeta populated. No AI/LLM
// calls — this is purely a booking + feedback workflow.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Calendar, X, Star, Clock, ChevronDown, ChevronUp,
  Send, MessageSquare, CheckCircle2, XCircle, CalendarClock, User as UserIcon
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import type { MentorProfile } from '../../types';

const TOOL_SLUG = 'interview/mock';

// ---- types --------------------------------------------------------------

type InterviewType = 'BEHAVIORAL' | 'TECHNICAL' | 'PANEL' | 'CASE';
type Seniority = 'ENTRY' | 'MID' | 'SENIOR';
type Language = 'English' | 'Twi' | 'French';

const INTERVIEW_TYPES: InterviewType[] = ['BEHAVIORAL', 'TECHNICAL', 'PANEL', 'CASE'];
const SENIORITY: Seniority[] = ['ENTRY', 'MID', 'SENIOR'];
const LANGUAGES: Language[] = ['English', 'Twi', 'French'];

type MockMeta = {
  type?: InterviewType;
  focusArea?: string;
  seniorityTarget?: Seniority;
  language?: string;
  message?: string;
  backupAt?: string;
  rubric?: {
    mentee?: SubmittedRubric;
    mentor?: SubmittedRubric;
  };
};

type SubmittedRubric = {
  communication: number;
  technicalDepth: number;
  structure: number;
  presence: number;
  overall: number;
  comments: string | null;
  submittedAt: string;
  submittedBy: 'mentor' | 'mentee';
};

type Booking = {
  id: string;
  scheduledAt: string;
  duration: number;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  mockMeta: MockMeta | null;
  menteeFeedback: string | null;
  match: {
    id: string;
    status: string;
    mentor: {
      id: string;
      firstName: string;
      lastName: string;
      avatar: string | null;
      currentRole: string | null;
      currentCompany: string | null;
    };
  };
};

// ---- helpers ------------------------------------------------------------

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
};

const minSeniorityYears = (s: Seniority): number => {
  if (s === 'SENIOR') return 7;
  if (s === 'MID') return 3;
  return 0;
};

// =========================================================================
// Page
// =========================================================================

export default function MockInterviewPage() {
  const user = useAuthStore((s) => s.user);
  const [type, setType] = useState<InterviewType>('BEHAVIORAL');
  const [focusArea, setFocusArea] = useState('');
  const [seniority, setSeniority] = useState<Seniority>('ENTRY');
  const [language, setLanguage] = useState<Language>('English');
  const [requestMentor, setRequestMentor] = useState<MentorProfile | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<Booking | null>(null);
  const [bookingsOpen, setBookingsOpen] = useState(true);

  useEffect(() => { logActivity('open'); }, []);

  const { data: mentors = [], isLoading: mentorsLoading } = useQuery<MentorProfile[]>({
    queryKey: ['mentors'],
    queryFn: async () => (await api.get('/mentors')).data.data
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['mock-interviews', 'my-bookings'],
    queryFn: async () => (await api.get('/mock-interviews/my-bookings')).data.data,
    enabled: !!user
  });

  const filteredMentors = useMemo(() => {
    const fa = focusArea.trim().toLowerCase();
    const minYears = minSeniorityYears(seniority);
    const list = mentors.filter((m) => {
      if (m.yearsExperience < minYears) return false;
      if (!fa) return true;
      const inTopics = m.mentoringTopics.some((t) => t.toLowerCase().includes(fa));
      const inExpertise = m.expertise.some((t) => t.toLowerCase().includes(fa));
      return inTopics || inExpertise;
    });
    return list.sort((a, b) => {
      if ((b.averageRating || 0) !== (a.averageRating || 0)) {
        return (b.averageRating || 0) - (a.averageRating || 0);
      }
      return (b.sessionsCompleted || 0) - (a.sessionsCompleted || 0);
    });
  }, [mentors, focusArea, seniority]);

  const now = Date.now();
  const upcoming = bookings.filter(
    (b) => b.status === 'SCHEDULED' && new Date(b.scheduledAt).getTime() >= now
  );
  const past = bookings.filter(
    (b) => b.status !== 'SCHEDULED' || new Date(b.scheduledAt).getTime() < now
  );

  return (
    <div className="bg-[var(--bg)]">
      {/* Header */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Link
            to="/career-tools"
            className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={14} /> Career Tools
          </Link>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
              <Calendar size={28} />
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — Mock Interview Scheduler
              </div>
              <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                Practice with someone who's been there.
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Book a 30-minute mock interview with a UENR alumni mentor — behavioral, technical, panel, or case.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Filter row */}
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <ChipRow
            label="Interview type"
            values={INTERVIEW_TYPES}
            active={type}
            onChange={(v) => setType(v as InterviewType)}
          />

          <div>
            <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
              Focus area
            </span>
            <input
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="e.g. data structures, consulting case math, HR competency"
              className="input w-full"
            />
          </div>

          <ChipRow
            label="Seniority target"
            values={SENIORITY}
            active={seniority}
            onChange={(v) => setSeniority(v as Seniority)}
          />

          <ChipRow
            label="Preferred language"
            values={LANGUAGES}
            active={language}
            onChange={(v) => setLanguage(v as Language)}
            help="Mentors don't have language tags yet, so this is captured but not filtered."
          />
        </div>

        {/* Mentor list */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-bold">
            Available mentors
            <span className="ml-2 text-sm font-medium text-[var(--muted)]">
              ({filteredMentors.length})
            </span>
          </h2>

          {mentorsLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-56" />)}
            </div>
          ) : filteredMentors.length === 0 ? (
            <EmptyState
              icon={UserIcon}
              title="No mentors match these filters"
              message="Try a broader focus area or lower the seniority target."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMentors.map((m, i) => (
                <MentorBookCard
                  key={m.id}
                  mentor={m}
                  index={i}
                  onRequest={() => setRequestMentor(m)}
                />
              ))}
            </div>
          )}
        </div>

        {/* My bookings */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <button
            type="button"
            onClick={() => setBookingsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                <CalendarClock size={18} />
              </div>
              <div className="text-left">
                <h2 className="font-heading text-lg font-bold">My mock interviews</h2>
                <p className="text-xs text-[var(--muted)]">
                  {upcoming.length} upcoming · {past.length} past
                </p>
              </div>
            </div>
            {bookingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {bookingsOpen && (
            <div className="space-y-6 border-t border-[var(--border)] p-5">
              <BookingGroup
                title="Upcoming"
                bookings={upcoming}
                emptyMessage="No upcoming mock interviews. Pick a mentor above to book one."
                onLeaveFeedback={(b) => setFeedbackTarget(b)}
                showCancel
              />
              <BookingGroup
                title="Past"
                bookings={past}
                emptyMessage="Past sessions and cancellations show up here."
                onLeaveFeedback={(b) => setFeedbackTarget(b)}
              />
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {requestMentor && (
          <RequestModal
            mentor={requestMentor}
            defaults={{ type, focusArea, seniorityTarget: seniority, language }}
            onClose={() => setRequestMentor(null)}
          />
        )}
        {feedbackTarget && (
          <FeedbackModal
            booking={feedbackTarget}
            onClose={() => setFeedbackTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =========================================================================
// Chips
// =========================================================================

function ChipRow({
  label, values, active, onChange, help
}: {
  label: string;
  values: string[];
  active: string;
  onChange: (v: string) => void;
  help?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
        {help && <span className="text-[10px] text-[var(--muted)] italic">{help}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Chip
            key={v}
            active={active === v}
            onClick={() => onChange(v)}
            label={titleCase(v)}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
        active
          ? 'border-[#065F46] bg-[#065F46] text-white'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
      }`}
    >
      {label}
    </button>
  );
}

// =========================================================================
// Mentor card (booking variant — local to this page so we don't muddy the
// shared MentorCard's API)
// =========================================================================

function MentorBookCard({
  mentor, index, onRequest
}: {
  mentor: MentorProfile;
  index: number;
  onRequest: () => void;
}) {
  const initials = `${mentor.user.firstName[0] ?? ''}${mentor.user.lastName[0] ?? ''}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#84CC16] text-[#1C1917] text-base font-bold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="font-heading font-bold leading-tight truncate">
            {mentor.user.firstName} {mentor.user.lastName}
          </div>
          <div className="text-xs text-[var(--muted)] truncate">
            {mentor.currentRole} · {mentor.company}
          </div>
        </div>
      </div>

      {mentor.bio && (
        <p className="mt-3 text-sm text-[var(--muted)] line-clamp-3">{mentor.bio}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...mentor.mentoringTopics, ...mentor.expertise]
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .slice(0, 4)
          .map((t) => (
            <span
              key={t}
              className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"
            >
              {t}
            </span>
          ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-[#F59E0B]">
          <Star size={12} fill="currentColor" />
          {mentor.averageRating ? mentor.averageRating.toFixed(1) : '—'}
          <span className="ml-1 text-[var(--muted)]">
            · {mentor.sessionsCompleted} sessions
          </span>
        </span>
        <button
          type="button"
          onClick={onRequest}
          className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
        >
          Request mock interview
        </button>
      </div>
    </motion.div>
  );
}

// =========================================================================
// Bookings list
// =========================================================================

function BookingGroup({
  title, bookings, emptyMessage, showCancel = false, onLeaveFeedback
}: {
  title: string;
  bookings: Booking[];
  emptyMessage: string;
  showCancel?: boolean;
  onLeaveFeedback: (b: Booking) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
        {title} <span className="ml-1 text-xs">({bookings.length})</span>
      </h3>
      {bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-4 text-sm text-[var(--muted)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              showCancel={showCancel}
              onLeaveFeedback={() => onLeaveFeedback(b)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({
  booking, showCancel, onLeaveFeedback
}: {
  booking: Booking;
  showCancel: boolean;
  onLeaveFeedback: () => void;
}) {
  const qc = useQueryClient();
  const cancelMut = useMutation({
    mutationFn: async () =>
      (await api.patch(`/mock-interviews/sessions/${booking.id}/cancel`)).data.data,
    onSuccess: () => {
      logActivity('cancel_booking', { sessionId: booking.id });
      qc.invalidateQueries({ queryKey: ['mock-interviews', 'my-bookings'] });
      toast.success('Mock interview cancelled');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Could not cancel'),
  });

  const meta = booking.mockMeta ?? {};
  const mentor = booking.match.mentor;
  const menteeRubric = meta.rubric?.mentee;

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-heading text-sm font-bold leading-tight">
            {fmtDateTime(booking.scheduledAt)}
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {mentor.firstName} {mentor.lastName}
            {mentor.currentRole && ` · ${mentor.currentRole}`}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {meta.type && (
          <span className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            {titleCase(meta.type)}
          </span>
        )}
        {meta.seniorityTarget && (
          <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--muted)]">
            {titleCase(meta.seniorityTarget)}
          </span>
        )}
        {meta.language && (
          <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--muted)]">
            {meta.language}
          </span>
        )}
      </div>

      {meta.focusArea && (
        <p className="mt-2 text-sm text-[var(--fg)]">
          <span className="text-xs font-semibold text-[var(--muted)]">Focus: </span>
          {meta.focusArea}
        </p>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 pt-3">
        {showCancel && booking.status === 'SCHEDULED' && (
          <button
            type="button"
            onClick={() => cancelMut.mutate()}
            disabled={cancelMut.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] hover:border-red-400 hover:text-red-600"
          >
            <XCircle size={12} /> Cancel
          </button>
        )}
        {!showCancel && !menteeRubric && booking.status !== 'CANCELLED' && (
          <button
            type="button"
            onClick={onLeaveFeedback}
            className="inline-flex items-center gap-1 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
          >
            <MessageSquare size={12} /> Leave feedback
          </button>
        )}
        {!showCancel && menteeRubric && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3F6212] dark:text-[#84CC16]">
            <CheckCircle2 size={12} /> Feedback submitted
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  const map: Record<Booking['status'], { label: string; cls: string }> = {
    SCHEDULED: { label: 'Scheduled', cls: 'bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]' },
    COMPLETED: { label: 'Completed', cls: 'bg-[#84CC16]/15 text-[#3F6212] dark:text-[#84CC16]' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    NO_SHOW:   { label: 'No-show', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>
      <Clock size={10} /> {m.label}
    </span>
  );
}

// =========================================================================
// Request modal
// =========================================================================

function RequestModal({
  mentor, defaults, onClose
}: {
  mentor: MentorProfile;
  defaults: { type: InterviewType; focusArea: string; seniorityTarget: Seniority; language: Language };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [type, setType] = useState<InterviewType>(defaults.type);
  const [focusArea, setFocusArea] = useState(defaults.focusArea);
  const [seniorityTarget, setSeniorityTarget] = useState<Seniority>(defaults.seniorityTarget);
  const [language, setLanguage] = useState<Language>(defaults.language);
  const [preferredAt, setPreferredAt] = useState('');
  const [backupAt, setBackupAt] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please log in first.');
      return;
    }
    if (!focusArea.trim()) {
      toast.error('Add a focus area so the mentor knows what to prep.');
      return;
    }
    if (!preferredAt) {
      toast.error('Pick a preferred date and time.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/mock-interviews/request', {
        mentorId: mentor.user.id,
        type,
        focusArea: focusArea.trim(),
        seniorityTarget,
        language,
        preferredAt: new Date(preferredAt).toISOString(),
        backupAt: backupAt ? new Date(backupAt).toISOString() : undefined,
        message: message.trim() || undefined
      });
      logActivity('request_booking', { mentorId: mentor.user.id, type });
      qc.invalidateQueries({ queryKey: ['mock-interviews', 'my-bookings'] });
      toast.success('Mock interview requested. The mentor has been notified.');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not send request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onSubmit={submit}
        className="my-8 w-full max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Request mock interview
            </div>
            <h2 className="mt-1 font-heading text-2xl font-bold">
              with {mentor.user.firstName} {mentor.user.lastName}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {mentor.currentRole} · {mentor.company}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-6">
          <ChipRow
            label="Interview type"
            values={INTERVIEW_TYPES}
            active={type}
            onChange={(v) => setType(v as InterviewType)}
          />

          <Field label="Focus area">
            <input
              className="input"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="e.g. system design for fintech"
              required
            />
          </Field>

          <ChipRow
            label="Seniority target"
            values={SENIORITY}
            active={seniorityTarget}
            onChange={(v) => setSeniorityTarget(v as Seniority)}
          />

          <ChipRow
            label="Preferred language"
            values={LANGUAGES}
            active={language}
            onChange={(v) => setLanguage(v as Language)}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Preferred date & time">
              <input
                type="datetime-local"
                className="input"
                value={preferredAt}
                onChange={(e) => setPreferredAt(e.target.value)}
                required
              />
            </Field>
            <Field label="Backup date & time (optional)">
              <input
                type="datetime-local"
                className="input"
                value={backupAt}
                onChange={(e) => setBackupAt(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Message to the mentor (optional)">
            <textarea
              className="input min-h-[100px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything specific you'd like them to focus on, links to a job posting, etc."
            />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-4 rounded-b-3xl">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Send size={16} /> {saving ? 'Sending…' : 'Send request'}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

// =========================================================================
// Feedback modal
// =========================================================================

const RUBRIC_AXES: { key: 'communication' | 'technicalDepth' | 'structure' | 'presence' | 'overall'; label: string }[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'technicalDepth', label: 'Technical depth' },
  { key: 'structure', label: 'Structure' },
  { key: 'presence', label: 'Presence' },
  { key: 'overall', label: 'Overall' }
];

function FeedbackModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const [scores, setScores] = useState({
    communication: 3,
    technicalDepth: 3,
    structure: 3,
    presence: 3,
    overall: 3
  });
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/mock-interviews/sessions/${booking.id}/feedback`, {
        ...scores,
        comments: comments.trim() || undefined
      });
      logActivity('submit_feedback', { sessionId: booking.id });
      qc.invalidateQueries({ queryKey: ['mock-interviews', 'my-bookings'] });
      toast.success('Feedback submitted');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Could not submit feedback');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onSubmit={submit}
        className="my-8 w-full max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Mock interview feedback
            </div>
            <h2 className="mt-1 font-heading text-2xl font-bold">Rate the session</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {booking.match.mentor.firstName} {booking.match.mentor.lastName} · {fmtDateTime(booking.scheduledAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 p-6">
          {RUBRIC_AXES.map((axis) => (
            <div key={axis.key}>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor={`r-${axis.key}`} className="text-sm font-semibold">{axis.label}</label>
                <span className="text-sm font-bold text-[#065F46] dark:text-[#84CC16]">
                  {scores[axis.key]} / 5
                </span>
              </div>
              <input
                id={`r-${axis.key}`}
                type="range"
                min={1}
                max={5}
                step={1}
                value={scores[axis.key]}
                onChange={(e) => setScores((s) => ({ ...s, [axis.key]: Number(e.target.value) }))}
                className="w-full accent-[#065F46] dark:accent-[#84CC16]"
              />
            </div>
          ))}
          <Field label="Comments (optional)">
            <textarea
              className="input min-h-[100px]"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What went well, what to work on next time…"
            />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-4 rounded-b-3xl">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Submitting…' : 'Submit feedback'}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

// =========================================================================
// Shared primitives
// =========================================================================

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ icon: Icon, title, message }: { icon: typeof UserIcon; title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
        <Icon size={28} />
      </div>
      <h3 className="mt-5 font-heading text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
