// Alumni Achievements Wall — celebrates promotions, publications, awards,
// ventures launched, etc. Authenticated alumni submit; admins approve;
// the community congratulates. Replaces the placeholder at
// /career-tools/achievements.
//
// Backed by /api/achievements. No AI/LLM calls.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Trophy, Plus, X, Search, Star, Heart, Calendar,
  ExternalLink, ImagePlus, MessageCircle, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { api, resolveAsset } from '../../services/api';
import { useAuthStore } from '../../store/auth';

const TOOL_SLUG = 'achievements';

// ---- types --------------------------------------------------------------

type AchievementType =
  | 'PROMOTION' | 'PUBLICATION' | 'AWARD'
  | 'VENTURE_LAUNCH' | 'COMMUNITY_IMPACT' | 'MEDIA_FEATURE' | 'OTHER';

type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  programme: string | null;
  graduationYear: number | null;
};

type Congrats = {
  id: string;
  message: string | null;
  createdAt: string;
  user: PublicUser;
};

type Achievement = {
  id: string;
  userId: string;
  type: AchievementType;
  title: string;
  description: string;
  date: string;
  link: string | null;
  imageUrl: string | null;
  isApproved: boolean;
  isFeatured: boolean;
  congratsCount: number;
  createdAt: string;
  user: PublicUser;
  hasCongratulated?: boolean;
};

type AchievementDetail = Achievement & {
  congrats: Congrats[];
};

// ---- constants ----------------------------------------------------------

const TYPES: { value: AchievementType; label: string }[] = [
  { value: 'PROMOTION', label: 'Promotion' },
  { value: 'PUBLICATION', label: 'Publication' },
  { value: 'AWARD', label: 'Award' },
  { value: 'VENTURE_LAUNCH', label: 'Venture Launch' },
  { value: 'COMMUNITY_IMPACT', label: 'Community Impact' },
  { value: 'MEDIA_FEATURE', label: 'Media Feature' },
  { value: 'OTHER', label: 'Other' }
];

// Tailwind-friendly color tokens per type. Picked to read against both
// light and dark cards.
const TYPE_STYLES: Record<AchievementType, { badge: string; dot: string }> = {
  PROMOTION:        { badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  AWARD:            { badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',         dot: 'bg-amber-500' },
  PUBLICATION:      { badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',             dot: 'bg-blue-500' },
  VENTURE_LAUNCH:   { badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',     dot: 'bg-purple-500' },
  COMMUNITY_IMPACT: { badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',             dot: 'bg-rose-500' },
  MEDIA_FEATURE:    { badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',                 dot: 'bg-sky-500' },
  OTHER:            { badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200',         dot: 'bg-slate-500' }
};

const PROGRAMMES = [
  'Petroleum Engineering',
  'Computer Science and Informatics',
  'Renewable Energy Engineering',
  'Mechanical Engineering',
  'Electrical and Electronics Engineering',
  'Civil Engineering',
  'Environmental Science',
  'Natural Resources Management',
  'Agriculture',
  'Business Administration',
  'Economics and Finance',
  'Mathematical Sciences'
];

const TRUNCATE_AT = 240;

const labelOfType = (t: AchievementType) =>
  TYPES.find((x) => x.value === t)?.label ?? t;

const logActivity = (action: string, metadata?: Record<string, unknown>) => {
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});
};

// ---- filter state -------------------------------------------------------

type Filters = {
  type: AchievementType | '';
  year: string;
  programme: string;
  q: string;
};

const emptyFilters: Filters = { type: '', year: '', programme: '', q: '' };

// =========================================================================
// Page
// =========================================================================

export default function AchievementsWallPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [submitOpen, setSubmitOpen] = useState(false);

  const { data: achievements = [], isLoading } = useQuery<Achievement[]>({
    queryKey: ['achievements', 'feed', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.type) params.type = filters.type;
      if (filters.year) params.year = filters.year;
      if (filters.programme) params.programme = filters.programme;
      if (filters.q) params.q = filters.q;
      return (await api.get('/achievements', { params })).data.data;
    }
  });

  // Year dropdown is derived from the unfiltered feed so the user can always
  // pick a year that has actual data.
  const { data: allAchievements = [] } = useQuery<Achievement[]>({
    queryKey: ['achievements', 'feed', emptyFilters],
    queryFn: async () => (await api.get('/achievements', { params: { limit: 50 } })).data.data
  });

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const years = new Set<number>();
    for (const a of allAchievements) {
      const y = new Date(a.date).getFullYear();
      if (Number.isInteger(y)) years.add(y);
    }
    // Always include the current year + last 4 so the picker isn't empty
    // when the wall is brand new.
    for (let y = now; y >= now - 4; y--) years.add(y);
    return Array.from(years).sort((a, b) => b - a);
  }, [allAchievements]);

  useEffect(() => { logActivity('open'); }, []);

  const anyFilter = filters.type || filters.year || filters.programme || filters.q;

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
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                <Trophy size={28} />
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                  — Achievements Wall
                </div>
                <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
                  Wins worth celebrating.
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Promotions, publications, awards, ventures launched — shared by UENR alumni, cheered on by the community.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSubmitOpen(true)}
              className="btn-primary"
            >
              <Plus size={16} /> Share an achievement
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {/* Filter row */}
        <div className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <ChipRow
            label="Type"
            values={TYPES.map((t) => ({ key: t.value, label: t.label }))}
            active={filters.type}
            onChange={(v) => setFilters({ ...filters, type: v as AchievementType | '' })}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Year</span>
              <select
                value={filters.year}
                onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                className="input"
              >
                <option value="">Any year</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Programme</span>
              <select
                value={filters.programme}
                onChange={(e) => setFilters({ ...filters, programme: e.target.value })}
                className="input"
              >
                <option value="">Any programme</option>
                {PROGRAMMES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Search</span>
              <span className="relative block">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={filters.q}
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                  placeholder="Search title or description…"
                  className="input pl-9 w-full"
                />
              </span>
            </label>
          </div>

          {anyFilter && (
            <div>
              <button
                onClick={() => setFilters(emptyFilters)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
              >
                <X size={12} /> Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Feed */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-72 rounded-2xl" />)}
          </div>
        ) : achievements.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Nothing on the wall yet"
            message={anyFilter
              ? 'No achievements match those filters. Try clearing them.'
              : 'Be the first — share a win and start the wall.'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {achievements.map((a, i) => (
              <AchievementCard key={a.id} achievement={a} index={i} />
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {submitOpen && <SubmitModal onClose={() => setSubmitOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

// =========================================================================
// Achievement card
// =========================================================================

function AchievementCard({ achievement, index }: { achievement: Achievement; index: number }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [congratsMsg, setCongratsMsg] = useState('');
  const [showMsgInput, setShowMsgInput] = useState(false);

  const typeStyle = TYPE_STYLES[achievement.type];
  const author = achievement.user;
  const shortYear =
    typeof author.graduationYear === 'number'
      ? `'${String(author.graduationYear).slice(-2)}`
      : '';
  const longText = achievement.description.length > TRUNCATE_AT;
  const visibleText = expanded || !longText
    ? achievement.description
    : achievement.description.slice(0, TRUNCATE_AT).trimEnd() + '…';

  const congratsMut = useMutation({
    mutationFn: async (message: string | null) =>
      (await api.post(`/achievements/${achievement.id}/congrats`,
        message ? { message } : {})).data.data,
    onMutate: async () => {
      // Optimistic — flip the card in the cached feed so the heart fills
      // immediately without waiting for the round trip.
      await qc.cancelQueries({ queryKey: ['achievements', 'feed'] });
      const prevFeeds = qc.getQueriesData<Achievement[]>({ queryKey: ['achievements', 'feed'] });
      for (const [key, value] of prevFeeds) {
        if (!value) continue;
        qc.setQueryData<Achievement[]>(key, value.map((a) =>
          a.id === achievement.id
            ? {
                ...a,
                hasCongratulated: true,
                congratsCount: a.hasCongratulated ? a.congratsCount : a.congratsCount + 1
              }
            : a
        ));
      }
      return { prevFeeds };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevFeeds.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error('Could not send congrats');
    },
    onSuccess: () => {
      logActivity('congratulate', { achievementId: achievement.id });
      qc.invalidateQueries({ queryKey: ['achievements', 'feed'] });
      qc.invalidateQueries({ queryKey: ['achievements', 'detail', achievement.id] });
      if (showMsgInput) toast.success('Thanks for cheering them on!');
    }
  });

  const removeCongratsMut = useMutation({
    mutationFn: async () =>
      (await api.delete(`/achievements/${achievement.id}/congrats`)).data.data,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['achievements', 'feed'] });
      const prevFeeds = qc.getQueriesData<Achievement[]>({ queryKey: ['achievements', 'feed'] });
      for (const [key, value] of prevFeeds) {
        if (!value) continue;
        qc.setQueryData<Achievement[]>(key, value.map((a) =>
          a.id === achievement.id
            ? {
                ...a,
                hasCongratulated: false,
                congratsCount: Math.max(0, a.congratsCount - 1)
              }
            : a
        ));
      }
      return { prevFeeds };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevFeeds.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error('Could not remove congrats');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['achievements', 'feed'] });
    }
  });

  const handleCongrats = () => {
    if (!user) {
      toast.error('Sign in to congratulate.');
      return;
    }
    if (achievement.hasCongratulated) {
      removeCongratsMut.mutate();
    } else {
      congratsMut.mutate(null);
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!congratsMsg.trim()) return;
    congratsMut.mutate(congratsMsg.trim());
    setCongratsMsg('');
    setShowMsgInput(false);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className={`flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)] transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        achievement.isFeatured
          ? 'border-[#F59E0B]/60 ring-1 ring-[#F59E0B]/30'
          : 'border-[var(--border)] hover:border-[#065F46]/40'
      }`}
    >
      {/* Cover */}
      {achievement.imageUrl ? (
        <div className="relative h-48 w-full overflow-hidden bg-[var(--bg)]">
          <img
            src={resolveAsset(achievement.imageUrl)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {achievement.isFeatured && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#F59E0B] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
              <Star size={10} className="fill-white" /> Featured
            </span>
          )}
        </div>
      ) : achievement.isFeatured ? (
        <div className="flex items-center justify-end px-5 pt-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E] dark:text-[#F59E0B]">
            <Star size={10} className="fill-current" /> Featured
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        {/* Type + date */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${typeStyle.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${typeStyle.dot}`} />
            {labelOfType(achievement.type)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
            <Calendar size={11} />
            {new Date(achievement.date).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric'
            })}
          </span>
        </div>

        <h3 className="font-heading text-lg font-bold leading-tight">{achievement.title}</h3>

        <p className="mt-2 whitespace-pre-line text-sm text-[var(--fg)]/90">
          {visibleText}
          {longText && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-1 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </p>

        {achievement.link && (
          <a
            href={achievement.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#065F46] hover:underline dark:text-[#84CC16]"
          >
            Open link <ExternalLink size={12} />
          </a>
        )}

        {/* Author + actions */}
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar user={author} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {author.firstName} {author.lastName}
              </div>
              <div className="truncate text-[11px] text-[var(--muted)]">
                {[author.programme, shortYear].filter(Boolean).join(' ')}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCongrats}
              disabled={congratsMut.isPending || removeCongratsMut.isPending}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                achievement.hasCongratulated
                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:border-rose-300 hover:text-rose-700 dark:hover:text-rose-300'
              }`}
              title={achievement.hasCongratulated ? 'Undo congratulations' : 'Send congratulations'}
            >
              <Heart
                size={13}
                className={achievement.hasCongratulated ? 'fill-current' : ''}
              />
              {congratsLabel(achievement)}
            </button>
            <button
              type="button"
              onClick={() => setShowMsgInput((v) => !v)}
              className="rounded-full border border-[var(--border)] bg-[var(--bg)] p-1.5 text-[var(--muted)] hover:text-[var(--fg)]"
              title="Add a message"
            >
              <MessageCircle size={13} />
            </button>
          </div>
        </div>

        {/* Inline message composer */}
        <AnimatePresence initial={false}>
          {showMsgInput && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={sendMessage}
              className="mt-3 flex items-center gap-2"
            >
              <input
                value={congratsMsg}
                onChange={(e) => setCongratsMsg(e.target.value)}
                placeholder="Say congrats…"
                maxLength={280}
                className="input flex-1"
                autoFocus
              />
              <button type="submit" className="btn-primary text-xs" disabled={congratsMut.isPending}>
                Send
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Open thread */}
        {achievement.congratsCount > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setThreadOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]"
            >
              {threadOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {threadOpen ? 'Hide messages' : 'Open thread'}
            </button>
            <AnimatePresence initial={false}>
              {threadOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <CongratsThread achievementId={achievement.id} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.article>
  );
}

function congratsLabel(a: Achievement): string {
  const n = a.congratsCount;
  if (a.hasCongratulated) {
    if (n <= 1) return 'You congratulated';
    return `You + ${n - 1} other${n - 1 === 1 ? '' : 's'}`;
  }
  return n === 0 ? 'Congratulate' : `${n}`;
}

function Avatar({ user }: { user: PublicUser }) {
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  if (user.avatar) {
    return (
      <img
        src={resolveAsset(user.avatar)}
        alt=""
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#065F46]/10 text-sm font-bold text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
      {initials || '?'}
    </div>
  );
}

// =========================================================================
// Congrats thread (lazy fetched)
// =========================================================================

function CongratsThread({ achievementId }: { achievementId: string }) {
  const { data, isLoading } = useQuery<AchievementDetail>({
    queryKey: ['achievements', 'detail', achievementId],
    queryFn: async () => (await api.get(`/achievements/${achievementId}`)).data.data
  });

  if (isLoading) {
    return <div className="mt-3 skeleton h-20 rounded-xl" />;
  }
  const messages = (data?.congrats ?? []).filter((c) => c.message && c.message.trim());

  if (messages.length === 0) {
    return (
      <p className="mt-3 text-xs text-[var(--muted)]">
        No messages yet — be the first to leave a note.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {messages.slice(0, 5).map((c) => (
        <li
          key={c.id}
          className="rounded-xl bg-[var(--bg)] px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--fg)]">
            {c.user.firstName} {c.user.lastName}
            <span className="font-normal text-[var(--muted)]">
              · {new Date(c.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-0.5 text-[var(--fg)]/90">{c.message}</div>
        </li>
      ))}
    </ul>
  );
}

// =========================================================================
// Submit modal
// =========================================================================

function SubmitModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [form, setForm] = useState({
    type: 'PROMOTION' as AchievementType,
    title: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    link: '',
    imageUrl: ''
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be 8 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/achievements/cover', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      set('imageUrl', res.data.data.url);
      toast.success('Cover image uploaded');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Sign in to share an achievement.');
      return;
    }
    if (!form.title.trim() || !form.description.trim() || !form.date) {
      toast.error('Title, description, and date are required.');
      return;
    }
    setSaving(true);
    try {
      // Send the date as an ISO datetime so zod's .datetime() validator
      // accepts it on the server.
      const isoDate = new Date(form.date + 'T12:00:00.000Z').toISOString();
      await api.post('/achievements', {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        date: isoDate,
        link: form.link.trim() || null,
        imageUrl: form.imageUrl || null
      });
      logActivity('submit', { type: form.type });
      qc.invalidateQueries({ queryKey: ['achievements', 'feed'] });
      toast.success('Submitted for review — admins approve before it appears on the wall.');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Submission failed');
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
              Share an achievement
            </div>
            <h2 className="mt-1 font-heading text-2xl font-bold">Tell the community what you did</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Admins review each post before it shows on the wall.
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
          {/* Type chips */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Type</span>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('type', t.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                    form.type === t.value
                      ? 'border-[#065F46] bg-[#065F46] text-white'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:border-[#065F46]/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Title">
            <input
              className="input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Promoted to Senior Engineer at Newmont"
              maxLength={160}
              required
            />
          </Field>

          <Field label="Description">
            <textarea
              className="input min-h-[110px]"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="A short story of what happened, what made it possible, and what's next."
              maxLength={4000}
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Date">
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                required
              />
            </Field>
            <Field label="Link (optional)">
              <input
                type="url"
                className="input"
                value={form.link}
                onChange={(e) => set('link', e.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>

          {/* Cover image */}
          <Field label="Cover image (optional)">
            <div className="flex items-center gap-3">
              {form.imageUrl ? (
                <div className="relative h-20 w-32 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                  <img src={resolveAsset(form.imageUrl)} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set('imageUrl', '')}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                    aria-label="Remove image"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : null}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-semibold text-[var(--fg)] hover:border-[#065F46]/50">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {uploading ? 'Uploading…' : (form.imageUrl ? 'Replace image' : 'Add a cover')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={onPickImage}
                  disabled={uploading}
                />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">JPEG, PNG, WebP, or GIF — up to 8 MB.</p>
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-4 rounded-b-3xl">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving || uploading} className="btn-primary">
            <Plus size={16} /> {saving ? 'Submitting…' : 'Submit for review'}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

// =========================================================================
// Shared primitives
// =========================================================================

function ChipRow({
  label, values, active, onChange
}: {
  label: string;
  values: { key: string; label: string }[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-[var(--muted)]">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={!active} onClick={() => onChange('')} label="All" />
        {values.map((v) => (
          <Chip key={v.key} active={active === v.key} onClick={() => onChange(v.key)} label={v.label} />
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

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ icon: Icon, title, message }: { icon: typeof Trophy; title: string; message: string }) {
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
