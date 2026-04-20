import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, ExternalLink, ArrowUpRight, Mail } from 'lucide-react';
import { api, resolveAsset } from '../services/api';

// Public portfolio at /p/:slug. Renders OUTSIDE AppLayout — no Navbar /
// MobileTabBar / Footer chrome. Two themes:
//   - clean:     centered single column, big serif feel via heading font
//   - editorial: 2-column hero, alternating project cards, deep-green accent
//
// Password gating: if the GET returns { requiresPassword: true } we show a
// password screen and POST to /unlock. The unlocked data is cached in
// sessionStorage so the prompt doesn't reappear during the session.

type Link = { label: string; url: string };
type Project = {
  id: string;
  position: number;
  title: string;
  summary: string;
  role?: string | null;
  coverUrl?: string | null;
  techStack: string[];
  externalUrl?: string | null;
  caseStudyMd?: string | null;
};
type PortfolioData = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
  bio?: string | null;
  theme: string;
  contactEmail?: string | null;
  links?: Link[] | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  projects: Project[];
  user?: {
    firstName?: string;
    lastName?: string;
    programme?: string | null;
    graduationYear?: number | null;
    currentRole?: string | null;
    currentCompany?: string | null;
  };
};

type FetchState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'locked'; title: string }
  | { status: 'ready'; data: PortfolioData }
  | { status: 'error'; message: string };

const SS_KEY = (slug: string) => `uenr_portfolio_unlocked:${slug}`;

export default function PublicPortfolioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  // Initial fetch — also handles re-hydrating from sessionStorage on reload.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      // If we previously unlocked, use the cached payload right away.
      try {
        const cached = sessionStorage.getItem(SS_KEY(slug));
        if (cached) {
          const data = JSON.parse(cached) as PortfolioData;
          if (!cancelled) setState({ status: 'ready', data });
          return;
        }
      } catch {}

      try {
        const { data } = await api.get(`/portfolios/public/${slug}`);
        if (cancelled) return;
        const payload = data.data;
        if (payload?.requiresPassword) {
          setState({ status: 'locked', title: payload.title || 'Protected portfolio' });
        } else {
          setState({ status: 'ready', data: payload });
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.response?.status === 404) setState({ status: 'notFound' });
        else setState({ status: 'error', message: 'Could not load this portfolio.' });
      }
    })();

    return () => { cancelled = true; };
  }, [slug]);

  // Document head + JSON-LD. Effect re-runs when data changes so OG tags
  // always reflect the current portfolio.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const cleanup = applyHead(state.data);
    return cleanup;
  }, [state]);

  if (state.status === 'loading') return <FullBleedShell><div className="text-center text-stone-500">Loading…</div></FullBleedShell>;
  if (state.status === 'notFound') return <FullBleedShell><NotFound /></FullBleedShell>;
  if (state.status === 'error') return <FullBleedShell><div className="text-center text-stone-500">{state.message}</div></FullBleedShell>;

  if (state.status === 'locked') {
    return (
      <FullBleedShell>
        <PasswordGate
          title={state.title}
          slug={slug!}
          onUnlocked={(data) => {
            try { sessionStorage.setItem(SS_KEY(slug!), JSON.stringify(data)); } catch {}
            setState({ status: 'ready', data });
          }}
        />
      </FullBleedShell>
    );
  }

  const theme = state.data.theme === 'editorial' ? 'editorial' : 'clean';
  return theme === 'editorial' ? <EditorialTheme data={state.data} /> : <CleanTheme data={state.data} />;
}

// ----- Themes -----

function CleanTheme({ data }: { data: PortfolioData }) {
  const fullName = ownerName(data);
  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="mx-auto max-w-3xl px-6 pt-20 pb-12 text-center">
        <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight md:text-6xl" style={{ fontFamily: '"Plus Jakarta Sans", Georgia, serif' }}>
          {data.title}
        </h1>
        {data.tagline && (
          <p className="mt-4 text-lg text-stone-600">{data.tagline}</p>
        )}
        {fullName && (
          <p className="mt-3 text-sm uppercase tracking-[0.2em] text-stone-500">{fullName}</p>
        )}
        {(data.contactEmail || (data.links && data.links.length > 0)) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
            {data.contactEmail && (
              <a href={`mailto:${data.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1 hover:border-stone-900">
                <Mail size={14} /> {data.contactEmail}
              </a>
            )}
            {(data.links ?? []).map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 hover:border-stone-900"
              >
                {l.label} <ArrowUpRight size={12} />
              </a>
            ))}
          </div>
        )}
      </header>

      {data.bio && (
        <section className="mx-auto max-w-2xl px-6 pb-12">
          <p className="text-lg leading-relaxed text-stone-700 whitespace-pre-wrap">{data.bio}</p>
        </section>
      )}

      <hr className="mx-auto max-w-2xl border-stone-200" />

      <main className="mx-auto max-w-2xl px-6 py-12 space-y-16">
        {data.projects.map((p, idx) => (
          <article key={p.id}>
            {p.coverUrl && (
              <img
                src={resolveAsset(p.coverUrl)}
                alt={p.title}
                className="mb-6 w-full rounded-2xl object-cover"
                style={{ aspectRatio: '16 / 9' }}
              />
            )}
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              {String(idx + 1).padStart(2, '0')} {p.role ? `· ${p.role}` : ''}
            </div>
            <h2 className="font-heading text-3xl font-bold leading-tight">{p.title}</h2>
            <p className="mt-3 text-base leading-relaxed text-stone-700 whitespace-pre-wrap">{p.summary}</p>
            {p.techStack.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.techStack.map((t) => (
                  <span key={t} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {p.caseStudyMd && (
              <div className="mt-6 text-base leading-relaxed text-stone-700">
                {renderCaseStudy(p.caseStudyMd)}
              </div>
            )}
            {p.externalUrl && (
              <a
                href={p.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-stone-900 underline"
              >
                Visit project <ExternalLink size={13} />
              </a>
            )}
          </article>
        ))}
      </main>

      <Footer />
    </div>
  );
}

function EditorialTheme({ data }: { data: PortfolioData }) {
  const fullName = ownerName(data);
  return (
    <div className="min-h-screen bg-[#FFFBEB] text-stone-900">
      {/* Hero: 2 columns */}
      <header className="border-b border-stone-200">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr] md:py-24">
          <div>
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-[#065F46]">— Portfolio</div>
            <h1 className="font-heading text-5xl font-extrabold leading-[1.05] md:text-6xl">
              {data.title}
            </h1>
            {data.tagline && (
              <p className="mt-5 max-w-xl text-xl text-stone-700">{data.tagline}</p>
            )}
            {fullName && (
              <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-stone-500">{fullName}</p>
            )}
            {(data.contactEmail || (data.links && data.links.length > 0)) && (
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                {data.contactEmail && (
                  <a href={`mailto:${data.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#065F46] px-3.5 py-1.5 font-semibold text-white hover:bg-[#064E3B]">
                    <Mail size={14} /> Get in touch
                  </a>
                )}
                {(data.links ?? []).map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 hover:border-[#065F46]"
                  >
                    {l.label} <ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div>
            {data.bio && (
              <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#065F46]">About</div>
                <p className="text-base leading-relaxed text-stone-700 whitespace-pre-wrap">{data.bio}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16 space-y-16">
        {data.projects.map((p, idx) => {
          const reverse = idx % 2 === 1;
          return (
            <article
              key={p.id}
              className={`grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}
            >
              <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
                {p.coverUrl ? (
                  <img
                    src={resolveAsset(p.coverUrl)}
                    alt={p.title}
                    className="w-full object-cover"
                    style={{ aspectRatio: '4 / 3' }}
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-[#065F46]/10 to-[#84CC16]/10 text-[#065F46]">
                    <span className="font-heading text-4xl font-bold opacity-30">{String(idx + 1).padStart(2, '0')}</span>
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-[#065F46]">
                  Project {String(idx + 1).padStart(2, '0')} {p.role ? `· ${p.role}` : ''}
                </div>
                <h2 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">{p.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-stone-700 whitespace-pre-wrap">{p.summary}</p>
                {p.techStack.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.techStack.map((t) => (
                      <span key={t} className="rounded-full bg-[#065F46]/10 px-2.5 py-0.5 text-xs font-semibold text-[#065F46]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {p.caseStudyMd && (
                  <div className="mt-5 text-sm leading-relaxed text-stone-700">
                    {renderCaseStudy(p.caseStudyMd)}
                  </div>
                )}
                {p.externalUrl && (
                  <a
                    href={p.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-5 inline-flex items-center gap-1 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
                  >
                    Visit project <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </main>

      <Footer />
    </div>
  );
}

// ----- Helpers -----

function FullBleedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFFBEB] px-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
      <h1 className="font-heading text-2xl font-bold">Portfolio not found</h1>
      <p className="mt-2 text-sm text-stone-600">
        This portfolio doesn't exist or hasn't been published yet.
      </p>
      <a href="/" className="mt-4 inline-block text-sm font-semibold text-[#065F46] underline">
        Back to home
      </a>
    </div>
  );
}

function PasswordGate({
  title,
  slug,
  onUnlocked
}: {
  title: string;
  slug: string;
  onUnlocked: (data: PortfolioData) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/portfolios/public/${slug}/unlock`, { password });
      onUnlocked(data.data);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Incorrect password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#065F46]/10 text-[#065F46]">
        <Lock size={20} />
      </div>
      <h1 className="text-center font-heading text-xl font-bold">{title}</h1>
      <p className="mt-1 text-center text-sm text-stone-600">This portfolio is password-protected.</p>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
        className="mt-5 w-full rounded-xl border-2 border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#065F46]"
      />
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-4 w-full rounded-xl bg-[#065F46] px-4 py-2.5 font-semibold text-white hover:bg-[#064E3B] disabled:opacity-60"
      >
        {busy ? 'Unlocking…' : 'Unlock portfolio'}
      </button>
    </form>
  );
}

function Footer() {
  return (
    <footer className="border-t border-stone-200 py-10 text-center text-xs text-stone-500">
      Built with the UENR Alumni Career Hub
    </footer>
  );
}

function ownerName(data: PortfolioData): string {
  const u = data.user;
  if (!u) return '';
  const parts = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return parts;
}

// Very small markdown-ish renderer: splits on blank lines for paragraphs and
// honors lines starting with "## " as h3 and "# " as h2. No external deps.
function renderCaseStudy(md: string) {
  const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block, i) => {
    if (block.startsWith('## ')) {
      return <h3 key={i} className="mt-6 mb-2 font-heading text-lg font-bold">{block.slice(3).trim()}</h3>;
    }
    if (block.startsWith('# ')) {
      return <h2 key={i} className="mt-6 mb-2 font-heading text-xl font-bold">{block.slice(2).trim()}</h2>;
    }
    if (block.startsWith('- ')) {
      const items = block.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
      return (
        <ul key={i} className="my-2 list-disc pl-5">
          {items.map((it, j) => <li key={j} className="my-0.5">{it}</li>)}
        </ul>
      );
    }
    return <p key={i} className="my-2 whitespace-pre-wrap">{block}</p>;
  });
}

// ----- Document head: title, OG, Twitter, JSON-LD -----

function applyHead(data: PortfolioData): () => void {
  const prevTitle = document.title;
  document.title = `${data.title} — Portfolio`;

  const owner = ownerName(data);
  const description = data.tagline || (data.bio ? data.bio.slice(0, 160) : `Portfolio of ${owner || data.title}`);
  const image = data.projects.find((p) => !!p.coverUrl)?.coverUrl || '';
  const absImage = image ? toAbsolute(resolveAsset(image)) : '';
  const url = typeof window !== 'undefined' ? window.location.href : '';

  const tags: { sel: string; attrs: Record<string, string> }[] = [
    { sel: 'meta[name="description"]', attrs: { name: 'description', content: description } },
    { sel: 'meta[property="og:type"]', attrs: { property: 'og:type', content: 'profile' } },
    { sel: 'meta[property="og:title"]', attrs: { property: 'og:title', content: data.title } },
    { sel: 'meta[property="og:description"]', attrs: { property: 'og:description', content: description } },
    { sel: 'meta[property="og:url"]', attrs: { property: 'og:url', content: url } },
    { sel: 'meta[name="twitter:card"]', attrs: { name: 'twitter:card', content: absImage ? 'summary_large_image' : 'summary' } },
    { sel: 'meta[name="twitter:title"]', attrs: { name: 'twitter:title', content: data.title } },
    { sel: 'meta[name="twitter:description"]', attrs: { name: 'twitter:description', content: description } }
  ];
  if (absImage) {
    tags.push({ sel: 'meta[property="og:image"]', attrs: { property: 'og:image', content: absImage } });
    tags.push({ sel: 'meta[name="twitter:image"]', attrs: { name: 'twitter:image', content: absImage } });
  }

  const inserted: HTMLElement[] = [];
  for (const t of tags) {
    let el = document.head.querySelector(t.sel) as HTMLMetaElement | null;
    let createdHere = false;
    if (!el) {
      el = document.createElement('meta');
      createdHere = true;
    }
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    if (createdHere) {
      el.setAttribute('data-portfolio', 'true');
      document.head.appendChild(el);
      inserted.push(el);
    }
  }

  // JSON-LD (Person)
  const skills = Array.from(new Set(data.projects.flatMap((p) => p.techStack))).slice(0, 30);
  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: owner || data.title,
    description,
    url,
    alumniOf: 'University of Energy and Natural Resources (UENR)',
    knowsAbout: skills
  };
  if (data.user?.currentRole) jsonLd.jobTitle = data.user.currentRole;
  if (data.user?.currentCompany) jsonLd.worksFor = { '@type': 'Organization', name: data.user.currentCompany };
  if (data.contactEmail) jsonLd.email = data.contactEmail;
  if (absImage) jsonLd.image = absImage;
  if (data.links && data.links.length) jsonLd.sameAs = data.links.map((l) => l.url);

  const ldEl = document.createElement('script');
  ldEl.type = 'application/ld+json';
  ldEl.setAttribute('data-portfolio', 'true');
  ldEl.text = JSON.stringify(jsonLd);
  document.head.appendChild(ldEl);
  inserted.push(ldEl);

  return () => {
    document.title = prevTitle;
    for (const el of inserted) el.remove();
  };
}

function toAbsolute(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

