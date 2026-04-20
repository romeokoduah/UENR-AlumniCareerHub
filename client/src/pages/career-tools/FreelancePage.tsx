import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Briefcase, Plus, Search, X, Clock, Tag,
  CheckCircle2, Star, MessageSquare, ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

type GigCategory = 'DESIGN' | 'DEV' | 'WRITING' | 'RESEARCH' | 'TRANSLATION' | 'CONSULTING' | 'OTHER';
type GigStatus = 'OPEN' | 'AWARDED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const CATEGORIES: { key: GigCategory; label: string }[] = [
  { key: 'DESIGN', label: 'Design' },
  { key: 'DEV', label: 'Development' },
  { key: 'WRITING', label: 'Writing' },
  { key: 'RESEARCH', label: 'Research' },
  { key: 'TRANSLATION', label: 'Translation' },
  { key: 'CONSULTING', label: 'Consulting' },
  { key: 'OTHER', label: 'Other' }
];

type Poster = {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  programme: string | null;
  graduationYear: number | null;
};

type Gig = {
  id: string;
  posterId: string;
  poster: Poster;
  title: string;
  description: string;
  category: GigCategory;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  deadlineAt: string | null;
  skills: string[];
  status: GigStatus;
  awardedBidId: string | null;
  createdAt: string;
  _count?: { bids: number };
  bidCount?: number;
};

type Bid = {
  id: string;
  gigId: string;
  bidderId: string;
  bidder?: Poster;
  coverNote: string;
  priceAmount: number;
  currency: string;
  deliveryDays: number;
  isShortlisted: boolean;
  isAwarded: boolean;
  createdAt: string;
};

type GigDetail = Gig & {
  bids?: Bid[];
  myBid?: Bid | null;
};

type MyBid = Bid & { gig: Gig };

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
}

function deadlineLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Past deadline';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days left`;
}

type Tab = 'browse' | 'posted' | 'bids';

export default function FreelancePage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('browse');
  const [postOpen, setPostOpen] = useState(false);
  const [openGigId, setOpenGigId] = useState<string | null>(null);

  useEffect(() => {
    api.post('/career-tools/activity', { tool: 'ventures/freelance', action: 'open' }).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight">Freelance Project Board</h1>
            <p className="text-sm text-[var(--muted)]">Post a gig or bid on one. Payment is between you and the freelancer for v1 — escrow coming soon.</p>
          </div>
        </div>
        <button onClick={() => setPostOpen(true)} className="btn-primary">
          <Plus size={16} /> Post a gig
        </button>
      </div>

      <div className="mt-8 flex border-b border-[var(--border)]">
        {(['browse', 'posted', 'bids'] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === k ? 'border-[#065F46] text-[#065F46] dark:border-[#84CC16] dark:text-[#84CC16]' : 'border-transparent text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            {k === 'browse' ? 'Browse gigs' : k === 'posted' ? 'My posted gigs' : 'My bids'}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'browse' && <BrowseTab onOpenGig={setOpenGigId} />}
        {tab === 'posted' && <PostedTab onOpenGig={setOpenGigId} />}
        {tab === 'bids' && <BidsTab onOpenGig={setOpenGigId} />}
      </div>

      {postOpen && <PostGigModal onClose={() => setPostOpen(false)} />}
      {openGigId && (
        <GigDetailModal
          gigId={openGigId}
          currentUserId={user?.id}
          onClose={() => setOpenGigId(null)}
        />
      )}
    </div>
  );
}

// ===== Browse tab =====

function BrowseTab({ onOpenGig }: { onOpenGig: (id: string) => void }) {
  const [category, setCategory] = useState<GigCategory | ''>('');
  const [skill, setSkill] = useState('');
  const [status, setStatus] = useState<'OPEN' | 'AWARDED' | ''>('OPEN');

  const { data } = useQuery<{ items: Gig[]; total: number }>({
    queryKey: ['freelance', 'browse', { category, skill, status }],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '40' };
      if (category) params.category = category;
      if (skill) params.skill = skill.toLowerCase();
      if (status) params.status = status;
      return (await api.get('/freelance/gigs', { params })).data.data;
    }
  });
  const gigs = data?.items ?? [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="Skill or keyword…"
            className="input pl-9"
          />
        </label>
        <button
          onClick={() => setCategory('')}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${category === '' ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'}`}
        >All</button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key === category ? '' : c.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${c.key === category ? 'border-[#065F46] bg-[#065F46] text-white' : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'}`}
          >{c.label}</button>
        ))}
        <div className="ml-auto flex gap-1">
          {(['OPEN', 'AWARDED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s === status ? '' : s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${s === status ? 'border-[#065F46] bg-[#065F46]/10 text-[#065F46] dark:text-[#84CC16]' : 'border-[var(--border)] hover:border-[#065F46]/50'}`}
            >{s.toLowerCase().replace('_', ' ')}</button>
          ))}
        </div>
      </div>

      {gigs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--muted)]">
          No gigs match your filters yet. Be the first to post.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {gigs.map((g, i) => (
            <GigCard key={g.id} gig={g} index={i} onOpen={onOpenGig} />
          ))}
        </div>
      )}
    </div>
  );
}

function GigCard({ gig, index, onOpen }: { gig: Gig; index: number; onOpen: (id: string) => void }) {
  const cat = CATEGORIES.find((c) => c.key === gig.category)?.label ?? gig.category;
  const dl = deadlineLabel(gig.deadlineAt);
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(gig.id)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.3 }}
      className="text-left rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:-translate-y-0.5 hover:border-[#065F46]/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-[#065F46]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          {cat}
        </span>
        {gig.status !== 'OPEN' && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {gig.status.replace('_', ' ')}
          </span>
        )}
      </div>
      <h3 className="mt-3 font-heading text-lg font-bold leading-tight line-clamp-2">{gig.title}</h3>
      <p className="mt-1.5 text-sm text-[var(--muted)] line-clamp-2">{gig.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {gig.skills.slice(0, 5).map((s) => (
          <span key={s} className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--fg)]/70 border border-[var(--border)]">
            {s}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
        <div>
          <div className="font-bold text-[var(--fg)]">{formatMoney(gig.budgetMin, gig.currency)}–{formatMoney(gig.budgetMax, gig.currency).replace(`${gig.currency} `, '')}</div>
          <div className="text-[var(--muted)] text-[10px]">{gig.poster.firstName} {gig.poster.lastName} · {formatRelative(gig.createdAt)}</div>
        </div>
        <div className="text-right">
          <div className="text-[var(--muted)]">{(gig._count?.bids ?? gig.bidCount ?? 0)} bids</div>
          {dl && <div className="mt-0.5 text-[10px] text-amber-600 inline-flex items-center gap-1"><Clock size={10} /> {dl}</div>}
        </div>
      </div>
    </motion.button>
  );
}

// ===== My posted tab =====

function PostedTab({ onOpenGig }: { onOpenGig: (id: string) => void }) {
  const { data: gigs = [] } = useQuery<Gig[]>({
    queryKey: ['freelance', 'me', 'posted'],
    queryFn: async () => (await api.get('/freelance/me/posted')).data.data
  });

  if (gigs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--muted)]">
        You haven't posted any gigs yet.
      </div>
    );
  }

  const byStatus = gigs.reduce((acc, g) => {
    (acc[g.status] ||= []).push(g);
    return acc;
  }, {} as Record<GigStatus, Gig[]>);

  const groupOrder: GigStatus[] = ['OPEN', 'AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  return (
    <div className="space-y-8">
      {groupOrder.map((status) => {
        const items = byStatus[status];
        if (!items || items.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
              {status.replace('_', ' ').toLowerCase()} ({items.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {items.map((g) => <GigCard key={g.id} gig={g} index={0} onOpen={onOpenGig} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ===== My bids tab =====

function BidsTab({ onOpenGig }: { onOpenGig: (id: string) => void }) {
  const { data: bids = [] } = useQuery<MyBid[]>({
    queryKey: ['freelance', 'me', 'bids'],
    queryFn: async () => (await api.get('/freelance/me/bids')).data.data
  });

  if (bids.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--muted)]">
        You haven't bid on any gigs yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bids.map((b) => (
        <button
          key={b.id}
          onClick={() => onOpenGig(b.gigId)}
          className="block w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[#065F46]/40"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-heading text-lg font-bold">{b.gig.title}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Posted by {b.gig.poster.firstName} {b.gig.poster.lastName} · {formatRelative(b.gig.createdAt)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold">{formatMoney(b.priceAmount, b.currency)}</div>
              <div className="text-xs text-[var(--muted)]">{b.deliveryDays}-day delivery</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {b.isAwarded && <span className="rounded-full bg-[#065F46]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"><CheckCircle2 size={10} className="inline" /> Awarded</span>}
            {b.isShortlisted && !b.isAwarded && <span className="rounded-full bg-[#F59E0B]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700"><Star size={10} className="inline" /> Shortlisted</span>}
            {!b.isAwarded && !b.isShortlisted && <span className="rounded-full bg-[var(--bg)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">Pending</span>}
            <span className="rounded-full bg-[var(--bg)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">
              Gig: {b.gig.status.replace('_', ' ').toLowerCase()}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ===== Post gig modal =====

function PostGigModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GigCategory>('DESIGN');
  const [budgetMin, setBudgetMin] = useState<number>(500);
  const [budgetMax, setBudgetMax] = useState<number>(2000);
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS');
  const [deadline, setDeadline] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const skills = useMemo(() => skillsInput.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), [skillsInput]);

  const mut = useMutation({
    mutationFn: async () => {
      const body: any = {
        title, description, category, budgetMin, budgetMax, currency, skills
      };
      if (deadline) body.deadlineAt = new Date(deadline).toISOString();
      const { data } = await api.post('/freelance/gigs', body);
      return data.data;
    },
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: 'ventures/freelance', action: 'post_gig' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['freelance'] });
      toast.success('Gig posted ✓');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to post gig')
  });

  return (
    <ModalShell onClose={onClose} title="Post a gig">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold">Title</label>
          <input className="input mt-1" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need done?" />
        </div>
        <div>
          <label className="text-xs font-semibold">Category</label>
          <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value as GigCategory)}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold">Description</label>
          <textarea className="input mt-1" rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Scope, deliverables, success criteria…" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold">Budget min</label>
            <input className="input mt-1" type="number" min={1} value={budgetMin} onChange={(e) => setBudgetMin(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-semibold">Budget max</label>
            <input className="input mt-1" type="number" min={1} value={budgetMax} onChange={(e) => setBudgetMax(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-semibold">Currency</label>
            <select className="input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value as 'GHS' | 'USD')}>
              <option>GHS</option>
              <option>USD</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">Deadline (optional)</label>
          <input className="input mt-1" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold">Skills (comma-separated)</label>
          <input className="input mt-1" value={skillsInput} onChange={(e) => setSkillsInput(e.target.value)} placeholder="figma, ui design, branding" />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={!title || !description || mut.isPending} className="btn-primary">
          {mut.isPending ? 'Posting…' : 'Post gig'}
        </button>
      </div>
    </ModalShell>
  );
}

// ===== Gig detail modal =====

function GigDetailModal({ gigId, currentUserId, onClose }: { gigId: string; currentUserId: string | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: gig, isLoading } = useQuery<GigDetail>({
    queryKey: ['freelance', 'gig', gigId],
    queryFn: async () => (await api.get(`/freelance/gigs/${gigId}`)).data.data
  });

  const [bidOpen, setBidOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const cancelMut = useMutation({
    mutationFn: async () => (await api.post(`/freelance/gigs/${gigId}/cancel`)).data.data,
    onSuccess: () => { toast.success('Gig cancelled'); qc.invalidateQueries({ queryKey: ['freelance'] }); }
  });

  const startMut = useMutation({
    mutationFn: async () => (await api.post(`/freelance/gigs/${gigId}/start`)).data.data,
    onSuccess: () => { toast.success('Gig started'); qc.invalidateQueries({ queryKey: ['freelance'] }); }
  });

  const completeMut = useMutation({
    mutationFn: async () => (await api.post(`/freelance/gigs/${gigId}/complete`)).data.data,
    onSuccess: () => { toast.success('Marked complete'); api.post('/career-tools/activity', { tool: 'ventures/freelance', action: 'complete' }).catch(() => {}); qc.invalidateQueries({ queryKey: ['freelance'] }); }
  });

  if (isLoading || !gig) {
    return (
      <ModalShell onClose={onClose} title="Loading…">
        <div className="h-32 animate-pulse rounded-xl bg-[var(--card)]" />
      </ModalShell>
    );
  }

  const isPoster = currentUserId === gig.posterId;
  const myBid = gig.myBid;
  const cat = CATEGORIES.find((c) => c.key === gig.category)?.label ?? gig.category;
  const dl = deadlineLabel(gig.deadlineAt);

  return (
    <ModalShell onClose={onClose} title={gig.title} wide>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[#065F46]/10 px-2.5 py-0.5 font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">{cat}</span>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{gig.status.replace('_', ' ')}</span>
        {dl && <span className="text-amber-600 inline-flex items-center gap-1"><Clock size={12} /> {dl}</span>}
      </div>

      <div className="mt-4 text-sm text-[var(--muted)]">
        {gig.poster.firstName} {gig.poster.lastName} {gig.poster.programme && <>· {gig.poster.programme}</>} · posted {formatRelative(gig.createdAt)}
      </div>

      <div className="mt-2 text-xl font-bold">
        Budget: {formatMoney(gig.budgetMin, gig.currency)} – {formatMoney(gig.budgetMax, gig.currency).replace(`${gig.currency} `, '')}
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--fg)]/85 leading-relaxed">{gig.description}</p>

      {gig.skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {gig.skills.map((s) => (
            <span key={s} className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs font-semibold text-[var(--fg)]/70 border border-[var(--border)]"><Tag size={10} className="inline" /> {s}</span>
          ))}
        </div>
      )}

      {/* Non-poster: bid form / your bid summary */}
      {!isPoster && currentUserId && gig.status === 'OPEN' && (
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
          {myBid ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Your bid</div>
              <div className="mt-1 text-lg font-bold">{formatMoney(myBid.priceAmount, myBid.currency)} · {myBid.deliveryDays}-day delivery</div>
              <p className="mt-2 text-sm text-[var(--fg)]/85 whitespace-pre-wrap">{myBid.coverNote}</p>
              <button onClick={() => setBidOpen(true)} className="btn-ghost mt-3 text-sm">Edit bid</button>
            </div>
          ) : (
            <button onClick={() => setBidOpen(true)} className="btn-primary text-sm w-full justify-center">
              <MessageSquare size={14} /> Place a bid
            </button>
          )}
        </div>
      )}

      {/* Poster view: bids list */}
      {isPoster && gig.bids && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold">Bids ({gig.bids.length})</h3>
            {gig.status === 'OPEN' && gig.bids.length === 0 && (
              <button onClick={() => cancelMut.mutate()} className="btn-ghost text-xs text-rose-600">Cancel gig</button>
            )}
          </div>
          {gig.bids.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-sm text-[var(--muted)]">No bids yet.</div>
          ) : (
            <div className="space-y-3">
              {gig.bids.map((b) => (
                <BidRow key={b.id} bid={b} gig={gig} qc={qc} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Status transition buttons */}
      {currentUserId && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {gig.status === 'AWARDED' && (
            <button onClick={() => startMut.mutate()} className="btn-primary text-sm">Mark as in-progress</button>
          )}
          {(gig.status === 'AWARDED' || gig.status === 'IN_PROGRESS') && (
            <button onClick={() => completeMut.mutate()} className="btn-primary text-sm">Mark as complete</button>
          )}
          {gig.status === 'COMPLETED' && (
            <button onClick={() => setReviewOpen(true)} className="btn-primary text-sm"><Star size={14} /> Leave a review</button>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-6 rounded-xl border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
        Payment happens off-platform between the two of you (Mobile Money, bank transfer, etc.). Platform escrow is coming in v2.
      </div>

      {bidOpen && <BidModal gigId={gigId} existing={myBid ?? null} onClose={() => setBidOpen(false)} />}
      {reviewOpen && <ReviewModal gigId={gigId} onClose={() => setReviewOpen(false)} />}
    </ModalShell>
  );
}

function BidRow({ bid, gig, qc }: { bid: Bid; gig: GigDetail; qc: ReturnType<typeof useQueryClient> }) {
  const shortlistMut = useMutation({
    mutationFn: async () => (await api.post(`/freelance/bids/${bid.id}/shortlist`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freelance', 'gig', gig.id] })
  });
  const awardMut = useMutation({
    mutationFn: async () => (await api.post(`/freelance/gigs/${gig.id}/award/${bid.id}`)).data.data,
    onSuccess: () => { toast.success('Awarded'); api.post('/career-tools/activity', { tool: 'ventures/freelance', action: 'award' }).catch(() => {}); qc.invalidateQueries({ queryKey: ['freelance'] }); }
  });

  return (
    <div className={`rounded-xl border p-4 ${bid.isAwarded ? 'border-[#065F46] bg-[#065F46]/5' : bid.isShortlisted ? 'border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10' : 'border-[var(--border)] bg-[var(--card)]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">{bid.bidder?.firstName} {bid.bidder?.lastName}</div>
          <div className="text-xs text-[var(--muted)]">{bid.bidder?.programme} · bid {formatRelative(bid.createdAt)}</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{formatMoney(bid.priceAmount, bid.currency)}</div>
          <div className="text-xs text-[var(--muted)]">{bid.deliveryDays} days</div>
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--fg)]/85 whitespace-pre-wrap">{bid.coverNote}</p>
      {gig.status === 'OPEN' && !bid.isAwarded && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => shortlistMut.mutate()} className="btn-ghost text-xs">
            <Star size={12} /> {bid.isShortlisted ? 'Unshortlist' : 'Shortlist'}
          </button>
          <button onClick={() => awardMut.mutate()} className="btn-primary text-xs">Award</button>
        </div>
      )}
    </div>
  );
}

function BidModal({ gigId, existing, onClose }: { gigId: string; existing: Bid | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [coverNote, setCoverNote] = useState(existing?.coverNote ?? '');
  const [priceAmount, setPriceAmount] = useState<number>(existing?.priceAmount ?? 1000);
  const [currency, setCurrency] = useState<'GHS' | 'USD'>((existing?.currency as 'GHS' | 'USD') ?? 'GHS');
  const [deliveryDays, setDeliveryDays] = useState<number>(existing?.deliveryDays ?? 7);

  const mut = useMutation({
    mutationFn: async () => {
      const body = { coverNote, priceAmount, currency, deliveryDays };
      if (existing) {
        const { data } = await api.patch(`/freelance/bids/${existing.id}`, body);
        return data.data;
      }
      const { data } = await api.post(`/freelance/gigs/${gigId}/bids`, body);
      return data.data;
    },
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: 'ventures/freelance', action: 'bid' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['freelance'] });
      toast.success(existing ? 'Bid updated' : 'Bid placed');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to place bid')
  });

  return (
    <ModalShell onClose={onClose} title={existing ? 'Edit your bid' : 'Place a bid'}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold">Cover note</label>
          <textarea className="input mt-1" rows={5} maxLength={2000} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="Why you're a fit, similar work, your approach…" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold">Price</label>
            <input type="number" className="input mt-1" min={1} value={priceAmount} onChange={(e) => setPriceAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-semibold">Currency</label>
            <select className="input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value as 'GHS' | 'USD')}>
              <option>GHS</option><option>USD</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold">Delivery (days)</label>
            <input type="number" className="input mt-1" min={1} max={365} value={deliveryDays} onChange={(e) => setDeliveryDays(Number(e.target.value))} />
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={coverNote.length < 10 || mut.isPending} className="btn-primary">
          {mut.isPending ? 'Sending…' : (existing ? 'Update bid' : 'Submit bid')}
        </button>
      </div>
    </ModalShell>
  );
}

function ReviewModal({ gigId, onClose }: { gigId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const mut = useMutation({
    mutationFn: async () => (await api.post(`/freelance/gigs/${gigId}/review`, { rating, comment: comment || undefined })).data.data,
    onSuccess: () => {
      api.post('/career-tools/activity', { tool: 'ventures/freelance', action: 'review' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['freelance'] });
      toast.success('Review submitted');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to submit')
  });

  return (
    <ModalShell onClose={onClose} title="Leave a review">
      <div className="mb-4 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} className="p-1">
            <Star size={28} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-[var(--muted)]'} />
          </button>
        ))}
      </div>
      <textarea className="input" rows={5} maxLength={2000} placeholder="What was it like working with them? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
          {mut.isPending ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
    </ModalShell>
  );
}

// ===== Modal shell =====

function ModalShell({ onClose, title, children, wide = false }: { onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
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
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
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
