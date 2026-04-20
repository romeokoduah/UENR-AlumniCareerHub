import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Quote } from 'lucide-react';
import { api } from '../services/api';
import { OpportunityCard } from '../components/shared/OpportunityCard';
import type { Opportunity, EventItem } from '../types';
import type { LandingContent } from '../types/landing';
import { DEFAULT_LANDING } from '../content/landing';

const LANDING_CACHE_KEY = 'uenr_landing_cache_v1';

function readCachedLanding(): LandingContent | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LANDING_CACHE_KEY);
    return raw ? (JSON.parse(raw) as LandingContent) : undefined;
  } catch {
    return undefined;
  }
}

export default function HomePage() {
  const { data: landing = DEFAULT_LANDING } = useQuery<LandingContent>({
    queryKey: ['content', 'landing'],
    queryFn: async () => {
      const fresh = (await api.get('/content/landing')).data.data as LandingContent;
      try { window.localStorage.setItem(LANDING_CACHE_KEY, JSON.stringify(fresh)); } catch {}
      return fresh;
    },
    initialData: readCachedLanding,
    initialDataUpdatedAt: 0,
    placeholderData: DEFAULT_LANDING
  });
  const HERO_COPY = landing.hero;
  const HERO_PHOTOS = landing.hero.photos;
  const FEATURED_ALUMNI = landing.featuredAlumni;
  const STORY_COPY = landing.story;
  const STORY_PHOTO = landing.story.photo;
  const CTA_COPY = landing.cta;

  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: ['opportunities', 'home'],
    queryFn: async () => (await api.get('/opportunities')).data.data
  });
  const { data: events = [] } = useQuery<EventItem[]>({
    queryKey: ['events', 'home'],
    queryFn: async () => (await api.get('/events')).data.data
  });

  return (
    <div className="bg-[var(--bg)]">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#84CC16]" />
              {HERO_COPY.eyebrow}
            </div>

            <h1 className="mt-6 font-heading text-5xl font-extrabold leading-[0.95] tracking-tight text-[var(--fg)] md:text-6xl lg:text-7xl">
              {HERO_COPY.headlineLine1}<br />
              {HERO_COPY.headlineLine2}<br />
              <span className="relative inline-block">
                <span className="relative z-10 text-[#065F46] dark:text-[#84CC16]">{HERO_COPY.headlineHighlight}</span>
                <svg className="absolute -bottom-2 left-0 z-0 w-full" height="14" viewBox="0 0 300 14" preserveAspectRatio="none">
                  <path d="M2 9 Q 75 2, 150 7 T 298 6" stroke="#84CC16" strokeWidth="5" fill="none" strokeLinecap="round" />
                </svg>
              </span>{' '}
              {HERO_COPY.headlineLine3}<br />
              {HERO_COPY.headlineLine4}
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
              {HERO_COPY.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/opportunities"
                className="group inline-flex items-center gap-2 rounded-full bg-[#065F46] px-6 py-3.5 font-semibold text-white transition-all hover:bg-[#064E3B] hover:shadow-lg"
              >
                {HERO_COPY.primaryCta}
                <ArrowUpRight size={18} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--fg)]/10 px-6 py-3.5 font-semibold text-[var(--fg)] transition-all hover:border-[var(--fg)]/40"
              >
                {HERO_COPY.secondaryCta}
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-5 border-t border-[var(--border)] pt-8">
              <Stat number={opportunities.length || 6} label="open opportunities" />
              <div className="h-8 w-px bg-[var(--border)] hidden md:block" />
              <Stat number="50+" label="alumni mentors" />
              <div className="h-8 w-px bg-[var(--border)] hidden md:block" />
              <Stat number="40+" label="scholarships" />
            </div>
          </motion.div>

          {/* Photo collage */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto h-[440px] w-full max-w-[520px] md:h-[540px]"
          >
            <PhotoTile src={HERO_PHOTOS[0]} className="absolute left-0 top-0 h-[62%] w-[58%] rotate-[-3deg]" accent="#065F46" />
            <PhotoTile src={HERO_PHOTOS[1]} className="absolute right-0 top-[8%] h-[55%] w-[48%] rotate-[4deg]" accent="#F59E0B" />
            <PhotoTile src={HERO_PHOTOS[2]} className="absolute bottom-0 left-[20%] h-[48%] w-[54%] rotate-[-1deg]" accent="#84CC16" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              className="absolute -bottom-4 -right-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-xl md:-right-6"
            >
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {HERO_PHOTOS.map((p, i) => (
                    <img key={i} src={p} alt="" className="h-7 w-7 rounded-full border-2 border-[var(--card)] object-cover" />
                  ))}
                </div>
                <div className="text-xs">
                  <div className="font-semibold">{HERO_COPY.floatingBadgeTitle}</div>
                  <div className="text-[var(--muted)]">{HERO_COPY.floatingBadgeSubtitle}</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ============ FEATURED ALUMNI ============ */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              — Meet the network
            </div>
            <h2 className="font-heading text-4xl font-extrabold leading-tight md:text-5xl">
              They walked the same<br />halls you did.
            </h2>
          </div>
          <Link to="/directory" className="group inline-flex items-center gap-1 font-semibold text-[var(--fg)]">
            See full directory
            <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED_ALUMNI.map((a, i) => (
            <motion.article
              key={a.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="group relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <SmoothImage
                  src={a.photo}
                  alt={a.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="font-heading text-xl font-bold leading-tight">{a.name}</div>
                  <div className="mt-1 text-sm text-white/90">{a.role}</div>
                  <div className="text-xs text-white/70">{a.company}</div>
                </div>
              </div>
              <div className="p-5">
                <Quote size={16} className="text-[#84CC16]" />
                <p className="mt-2 text-sm leading-relaxed text-[var(--fg)]">"{a.quote}"</p>
                <div className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                  {a.programme}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ============ OPPORTUNITIES ============ */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]/40">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                — Live opportunities
              </div>
              <h2 className="font-heading text-4xl font-extrabold leading-tight md:text-5xl">
                Roles posted<br />in the last 30 days.
              </h2>
            </div>
            <Link to="/opportunities" className="group inline-flex items-center gap-1 font-semibold text-[var(--fg)]">
              View all {opportunities.length} open
              <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {opportunities.slice(0, 6).map((o, i) => (
              <OpportunityCard key={o.id} item={o} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ STORY / EDITORIAL ============ */}
      <section className="mx-auto max-w-7xl px-4 py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-3xl">
              <SmoothImage src={STORY_PHOTO} alt="UENR students collaborating" className="h-[520px] w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#065F46]/40 to-transparent" />
            </div>
            <div className="absolute -bottom-6 -right-6 hidden rounded-2xl border-4 border-[var(--bg)] bg-[#F59E0B] p-6 md:block">
              <div className="font-heading text-4xl font-black text-[#1C1917]">{STORY_COPY.highlightStat}</div>
              <div className="max-w-[120px] text-xs font-semibold text-[#1C1917]">{STORY_COPY.highlightLabel}</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              {STORY_COPY.eyebrow}
            </div>
            <h2 className="font-heading text-4xl font-extrabold leading-[1.05] md:text-5xl">
              {STORY_COPY.headlineLine1}<br />
              {STORY_COPY.headlineLine2}<br />
              <span className="text-[var(--muted)]">{STORY_COPY.headlineLine3}</span>
            </h2>
            <div className="mt-8 space-y-5 text-[var(--fg)]/90 leading-relaxed">
              {STORY_COPY.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>

            <div className="mt-10 grid grid-cols-2 gap-5">
              {STORY_COPY.facts.map((f) => (
                <FactBlock key={f.label} number={f.number} label={f.label} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============ EVENTS ============ */}
      {events.length > 0 && (
        <section className="border-t border-[var(--border)] bg-[var(--card)]/40">
          <div className="mx-auto max-w-7xl px-4 py-20">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
                  — On the calendar
                </div>
                <h2 className="font-heading text-4xl font-extrabold leading-tight md:text-5xl">
                  Workshops, panels,<br />career fairs.
                </h2>
              </div>
              <Link to="/events" className="group inline-flex items-center gap-1 font-semibold text-[var(--fg)]">
                See all events
                <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {events.slice(0, 3).map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="group relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <EventDate date={e.date} />
                    <span className="rounded-full bg-[#065F46]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
                      {e.type}
                    </span>
                  </div>
                  <h3 className="mt-5 font-heading text-xl font-bold leading-tight">{e.title}</h3>
                  <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3">{e.description}</p>
                  <div className="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
                    {e.location}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ FINAL CTA ============ */}
      <section className="relative overflow-hidden bg-[#065F46] text-white">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
            backgroundSize: '24px 24px'
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-24 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="font-heading text-4xl font-extrabold leading-tight md:text-6xl"
          >
            {CTA_COPY.headlineLine1}<br />
            {CTA_COPY.headlineLine2}
          </motion.h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/75">
            {CTA_COPY.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 font-bold text-[#065F46] transition-all hover:bg-[#84CC16] hover:text-[#1C1917]">
              {CTA_COPY.primary}
              <ArrowUpRight size={18} />
            </Link>
            <Link to="/opportunities" className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-7 py-4 font-bold text-white transition-all hover:border-white/70">
              {CTA_COPY.secondary}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ number, label }: { number: number | string; label: string }) {
  return (
    <div>
      <div className="font-heading text-3xl font-black leading-none text-[var(--fg)]">{number}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}

function FactBlock({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="font-heading text-3xl font-black text-[#065F46] dark:text-[#84CC16]">{number}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}

function PhotoTile({ src, className, accent }: { src: string; className: string; accent: string }) {
  return (
    <motion.div
      whileHover={{ rotate: 0, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className={`overflow-hidden rounded-2xl border-[6px] border-[var(--bg)] shadow-xl ${className}`}
      style={{ boxShadow: `0 20px 50px -20px ${accent}55, 0 8px 20px -8px rgba(0,0,0,0.25)` }}
    >
      <SmoothImage src={src} alt="" className="h-full w-full object-cover" eager />
    </motion.div>
  );
}

// SmoothImage renders no wrapper of its own — it's a Fragment with the
// skeleton/error overlays and the <img>. Callers must supply a positioned
// parent (the overlays use position:absolute to fill it) and pass the
// img's own classes via `className`.
function SmoothImage({
  src, alt = '', className = '', eager = false
}: { src: string; alt?: string; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  if (!src) return null;

  return (
    <>
      {!loaded && !errored && (
        <div aria-hidden className="absolute inset-0 animate-pulse bg-[var(--card)]" />
      )}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--card)] text-xs text-[var(--muted)]">
          Image unavailable
        </div>
      )}
      <img
        key={src}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={className}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 250ms ease-out' }}
      />
    </>
  );
}

function EventDate({ date }: { date: string }) {
  const d = new Date(date);
  return (
    <div className="rounded-xl border border-[var(--border)] px-3 py-2 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {d.toLocaleString('en-GB', { month: 'short' })}
      </div>
      <div className="font-heading text-xl font-black leading-none text-[var(--fg)]">
        {d.getDate()}
      </div>
    </div>
  );
}
