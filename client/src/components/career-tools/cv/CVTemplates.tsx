// Three CV templates. Same data, different layout. All renderable into a print
// pane sized to A4. Templates write their own typography + spacing — they do not
// consume the app's CSS tokens, because we want the rendered preview to look the
// same in light/dark mode AND when printed.
import type { CVData, CVTemplate } from './types';

type Props = { data: CVData; template: CVTemplate };

export function CVTemplateRender({ data, template }: Props) {
  if (template === 'classic') return <ClassicTemplate data={data} />;
  if (template === 'ats-pure') return <AtsPureTemplate data={data} />;
  return <ModernTemplate data={data} />;
}

// ---------- Helpers ----------
function fmtDate(s: string): string {
  if (!s) return '';
  // Accept "YYYY-MM" or "YYYY-MM-DD" or freeform.
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return s;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[Math.max(0, Math.min(11, Number(m[2]) - 1))];
  return `${month} ${m[1]}`;
}
function dateRange(start: string, end: string, current: boolean): string {
  const s = fmtDate(start);
  const e = current ? 'Present' : fmtDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}
function joinDot(parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(' · ');
}

// =====================================================================
// MODERN — accent header + sidebar feel (single column for print safety)
// =====================================================================
function ModernTemplate({ data }: { data: CVData }) {
  const p = data.personal;
  return (
    <div className="cv-modern" style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#1c1917', background: '#fff' }}>
      <header style={{ background: '#065F46', color: '#fff', padding: '24px 32px' }}>
        <h1 style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          {p.fullName || 'Your Name'}
        </h1>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.95 }}>
          {joinDot([p.email, p.phone, p.location])}
        </div>
        {(p.linkedin || p.website) && (
          <div style={{ marginTop: 2, fontSize: 12, opacity: 0.9 }}>
            {joinDot([p.linkedin, p.website])}
          </div>
        )}
      </header>

      <div style={{ padding: '20px 32px 28px' }}>
        {data.sectionOrder.map((kind) => {
          if (kind === 'summary' && data.summary) {
            return (
              <Section key={kind} title="Summary" accent="#065F46">
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>{data.summary}</p>
              </Section>
            );
          }
          if (kind === 'experience' && data.experience.length > 0) {
            return (
              <Section key={kind} title="Experience" accent="#065F46">
                {data.experience.map((e) => (
                  <div key={e.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{e.role || 'Role'}</div>
                      <div style={{ fontSize: 11, color: '#57534e', whiteSpace: 'nowrap' }}>{dateRange(e.start, e.end, e.current)}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#57534e' }}>{joinDot([e.company, e.location])}</div>
                    {e.bullets.length > 0 && (
                      <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.5 }}>
                        {e.bullets.filter(Boolean).map((b, i) => <li key={i} style={{ marginBottom: 2 }}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </Section>
            );
          }
          if (kind === 'education' && data.education.length > 0) {
            return (
              <Section key={kind} title="Education" accent="#065F46">
                {data.education.map((e) => (
                  <div key={e.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{e.school || 'School'}</div>
                      <div style={{ fontSize: 11, color: '#57534e', whiteSpace: 'nowrap' }}>{dateRange(e.start, e.end, false)}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#57534e' }}>{joinDot([e.degree, e.field, e.gpa && `GPA ${e.gpa}`])}</div>
                  </div>
                ))}
              </Section>
            );
          }
          if (kind === 'skills' && data.skills.length > 0) {
            return (
              <Section key={kind} title="Skills" accent="#065F46">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {data.skills.map((s, i) => (
                    <span key={i} style={{ background: '#ecfccb', color: '#365314', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              </Section>
            );
          }
          if (kind === 'projects' && data.projects.length > 0) {
            return (
              <Section key={kind} title="Projects" accent="#065F46">
                {data.projects.map((p2) => (
                  <div key={p2.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p2.name || 'Project'}{p2.link && <span style={{ fontWeight: 400, color: '#57534e', fontSize: 11 }}> — {p2.link}</span>}</div>
                    {p2.description && <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{p2.description}</div>}
                    {p2.tech.length > 0 && <div style={{ fontSize: 11, color: '#57534e', marginTop: 2 }}>{p2.tech.join(' · ')}</div>}
                  </div>
                ))}
              </Section>
            );
          }
          if (kind === 'certifications' && data.certifications.length > 0) {
            return (
              <Section key={kind} title="Certifications" accent="#065F46">
                {data.certifications.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 4 }}>
                    <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700 }}>{c.name || 'Certification'}</span>{c.issuer && <span style={{ color: '#57534e' }}> — {c.issuer}</span>}</div>
                    <div style={{ fontSize: 11, color: '#57534e', whiteSpace: 'nowrap' }}>{fmtDate(c.date)}</div>
                  </div>
                ))}
              </Section>
            );
          }
          if (kind === 'languages' && data.languages.length > 0) {
            return (
              <Section key={kind} title="Languages" accent="#065F46">
                <div style={{ fontSize: 12 }}>
                  {data.languages.map((l, i) => (
                    <span key={l.id}>
                      <span style={{ fontWeight: 600 }}>{l.language}</span>
                      {l.proficiency && <span style={{ color: '#57534e' }}> ({l.proficiency})</span>}
                      {i < data.languages.length - 1 ? '  ·  ' : ''}
                    </span>
                  ))}
                </div>
              </Section>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 14, breakInside: 'avoid' }}>
      <h2 style={{
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: accent,
        margin: '0 0 6px',
        paddingBottom: 4,
        borderBottom: `2px solid ${accent}22`
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// =====================================================================
// CLASSIC — single column, serif, conservative
// =====================================================================
function ClassicTemplate({ data }: { data: CVData }) {
  const p = data.personal;
  return (
    <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#1c1917', background: '#fff', padding: '32px 36px' }}>
      <header style={{ textAlign: 'center', borderBottom: '1px solid #1c1917', paddingBottom: 10, marginBottom: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '0.04em' }}>{(p.fullName || 'YOUR NAME').toUpperCase()}</h1>
        <div style={{ fontSize: 11, marginTop: 6 }}>
          {joinDot([p.email, p.phone, p.location, p.linkedin, p.website])}
        </div>
      </header>

      {data.sectionOrder.map((kind) => {
        if (kind === 'summary' && data.summary) {
          return <ClassicSection key={kind} title="Professional Summary"><p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{data.summary}</p></ClassicSection>;
        }
        if (kind === 'experience' && data.experience.length > 0) {
          return (
            <ClassicSection key={kind} title="Experience">
              {data.experience.map((e) => (
                <div key={e.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13 }}><strong>{e.role || 'Role'}</strong>, {e.company}</div>
                    <div style={{ fontSize: 11, fontStyle: 'italic' }}>{dateRange(e.start, e.end, e.current)}</div>
                  </div>
                  {e.location && <div style={{ fontSize: 11, fontStyle: 'italic' }}>{e.location}</div>}
                  {e.bullets.length > 0 && (
                    <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: 12, lineHeight: 1.45 }}>
                      {e.bullets.filter(Boolean).map((b, i) => <li key={i} style={{ marginBottom: 2 }}>{b}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </ClassicSection>
          );
        }
        if (kind === 'education' && data.education.length > 0) {
          return (
            <ClassicSection key={kind} title="Education">
              {data.education.map((e) => (
                <div key={e.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13 }}><strong>{e.school || 'School'}</strong>{e.degree && ` — ${e.degree}`}{e.field && `, ${e.field}`}</div>
                    <div style={{ fontSize: 11, fontStyle: 'italic' }}>{dateRange(e.start, e.end, false)}</div>
                  </div>
                  {e.gpa && <div style={{ fontSize: 11 }}>GPA: {e.gpa}</div>}
                </div>
              ))}
            </ClassicSection>
          );
        }
        if (kind === 'skills' && data.skills.length > 0) {
          return <ClassicSection key={kind} title="Skills"><div style={{ fontSize: 12 }}>{data.skills.join(' • ')}</div></ClassicSection>;
        }
        if (kind === 'projects' && data.projects.length > 0) {
          return (
            <ClassicSection key={kind} title="Projects">
              {data.projects.map((p2) => (
                <div key={p2.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13 }}><strong>{p2.name || 'Project'}</strong>{p2.link && ` — ${p2.link}`}</div>
                  {p2.description && <div style={{ fontSize: 12, lineHeight: 1.45 }}>{p2.description}</div>}
                  {p2.tech.length > 0 && <div style={{ fontSize: 11, fontStyle: 'italic' }}>{p2.tech.join(', ')}</div>}
                </div>
              ))}
            </ClassicSection>
          );
        }
        if (kind === 'certifications' && data.certifications.length > 0) {
          return (
            <ClassicSection key={kind} title="Certifications">
              {data.certifications.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <div><strong>{c.name}</strong>{c.issuer && `, ${c.issuer}`}</div>
                  <div style={{ fontStyle: 'italic', fontSize: 11 }}>{fmtDate(c.date)}</div>
                </div>
              ))}
            </ClassicSection>
          );
        }
        if (kind === 'languages' && data.languages.length > 0) {
          return (
            <ClassicSection key={kind} title="Languages">
              <div style={{ fontSize: 12 }}>
                {data.languages.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`).join(', ')}
              </div>
            </ClassicSection>
          );
        }
        return null;
      })}
    </div>
  );
}

function ClassicSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 12, breakInside: 'avoid' }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1c1917', paddingBottom: 2, margin: '0 0 6px' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// =====================================================================
// ATS PURE — no decoration, plain text-shaped layout
// =====================================================================
function AtsPureTemplate({ data }: { data: CVData }) {
  const p = data.personal;
  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#000', background: '#fff', padding: '28px 32px', fontSize: 11.5, lineHeight: 1.4 }}>
      <h1 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>{p.fullName || 'Your Name'}</h1>
      <div>{joinDot([p.email, p.phone, p.location])}</div>
      {(p.linkedin || p.website) && <div>{joinDot([p.linkedin, p.website])}</div>}

      {data.sectionOrder.map((kind) => {
        if (kind === 'summary' && data.summary) {
          return <AtsBlock key={kind} title="SUMMARY"><p style={{ margin: 0 }}>{data.summary}</p></AtsBlock>;
        }
        if (kind === 'experience' && data.experience.length > 0) {
          return (
            <AtsBlock key={kind} title="EXPERIENCE">
              {data.experience.map((e) => (
                <div key={e.id} style={{ marginBottom: 8 }}>
                  <div><strong>{e.role}</strong> — {e.company}{e.location ? `, ${e.location}` : ''}</div>
                  <div>{dateRange(e.start, e.end, e.current)}</div>
                  {e.bullets.length > 0 && (
                    <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                      {e.bullets.filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </AtsBlock>
          );
        }
        if (kind === 'education' && data.education.length > 0) {
          return (
            <AtsBlock key={kind} title="EDUCATION">
              {data.education.map((e) => (
                <div key={e.id} style={{ marginBottom: 4 }}>
                  <div><strong>{e.school}</strong>{e.degree && ` — ${e.degree}`}{e.field && `, ${e.field}`}</div>
                  <div>{dateRange(e.start, e.end, false)}{e.gpa && ` · GPA ${e.gpa}`}</div>
                </div>
              ))}
            </AtsBlock>
          );
        }
        if (kind === 'skills' && data.skills.length > 0) {
          return <AtsBlock key={kind} title="SKILLS"><div>{data.skills.join(', ')}</div></AtsBlock>;
        }
        if (kind === 'projects' && data.projects.length > 0) {
          return (
            <AtsBlock key={kind} title="PROJECTS">
              {data.projects.map((p2) => (
                <div key={p2.id} style={{ marginBottom: 6 }}>
                  <div><strong>{p2.name}</strong>{p2.link && ` (${p2.link})`}</div>
                  {p2.description && <div>{p2.description}</div>}
                  {p2.tech.length > 0 && <div>Tech: {p2.tech.join(', ')}</div>}
                </div>
              ))}
            </AtsBlock>
          );
        }
        if (kind === 'certifications' && data.certifications.length > 0) {
          return (
            <AtsBlock key={kind} title="CERTIFICATIONS">
              {data.certifications.map((c) => (
                <div key={c.id}>{c.name}{c.issuer && ` — ${c.issuer}`}{c.date && ` (${fmtDate(c.date)})`}</div>
              ))}
            </AtsBlock>
          );
        }
        if (kind === 'languages' && data.languages.length > 0) {
          return (
            <AtsBlock key={kind} title="LANGUAGES">
              <div>{data.languages.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`).join(', ')}</div>
            </AtsBlock>
          );
        }
        return null;
      })}
    </div>
  );
}

function AtsBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 10, breakInside: 'avoid' }}>
      <h2 style={{ fontSize: 12, margin: '0 0 4px', fontWeight: 700 }}>{title}</h2>
      {children}
    </section>
  );
}
