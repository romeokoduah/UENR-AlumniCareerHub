// Print-only cover letter view. Loaded in a new tab from the editor's
// "Export PDF" action, this page renders ONLY the rendered letter on an
// A4 sheet and immediately calls window.print() so the user can pick
// "Save as PDF" in the browser print dialog.
//
// Mounted OUTSIDE AppLayout so the navbar/footer/chatbot widget never
// appear in the printed output.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import {
  emptyFormData,
  renderLetter,
  type CoverLetterFormData
} from './coverLetterTemplates';

type CoverLetter = {
  id: string;
  title: string;
  template: string;
  data: CoverLetterFormData;
};

export default function CoverLetterPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/cover-letters/${id}`);
        if (!cancelled) setLetter(data.data);
      } catch {
        if (!cancelled) setError('Could not load this cover letter');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Once the letter is rendered, fire the browser print dialog. A small
  // delay lets the layout settle (web fonts, paint) before the dialog
  // snapshots the page.
  useEffect(() => {
    if (!letter) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [letter]);

  if (error) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!letter) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <p>Loading…</p>
      </div>
    );
  }

  const data = { ...emptyFormData(), ...letter.data };
  const body = renderLetter(data, letter.template);
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <>
      {/* Inlined print CSS so this works without touching global styles. */}
      <style>{PRINT_CSS}</style>
      <div className="print-shell">
        <article className="print-sheet">
          <header className="print-header">
            <h1 className="print-name">{data.senderName || 'Your Name'}</h1>
            <p className="print-contact">
              {[data.senderEmail, data.senderPhone, data.senderLocation]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
          </header>

          <p className="print-date">{today}</p>

          {(data.recipientName || data.companyName || data.companyCity) && (
            <address className="print-recipient">
              {data.recipientName && <div>{data.recipientName}</div>}
              {data.companyName && <div>{data.companyName}</div>}
              {data.companyCity && <div>{data.companyCity}</div>}
            </address>
          )}

          <div className="print-body">
            {body.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </article>
      </div>
    </>
  );
}

const PRINT_CSS = `
  @page { size: A4; margin: 0; }

  html, body {
    margin: 0;
    padding: 0;
    background: #f3f3f3;
    color: #1c1917;
    font-family: 'DM Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }

  .print-shell {
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .print-sheet {
    background: #ffffff;
    width: 210mm;
    min-height: 297mm;
    padding: 22mm 20mm;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    box-sizing: border-box;
    color: #1c1917;
    line-height: 1.55;
  }

  .print-header { margin-bottom: 18px; }

  .print-name {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }

  .print-contact {
    font-size: 11px;
    color: #57534e;
    margin: 0;
  }

  .print-date {
    font-size: 11px;
    color: #57534e;
    margin: 0;
  }

  .print-recipient {
    margin-top: 16px;
    font-size: 13px;
    line-height: 1.5;
    font-style: normal;
  }

  .print-body { margin-top: 22px; font-size: 13px; }
  .print-body p {
    margin: 0 0 14px;
    white-space: pre-wrap;
  }

  @media print {
    body { background: #ffffff; }
    .print-shell { padding: 0; }
    .print-sheet {
      box-shadow: none;
      width: 210mm;
      min-height: 297mm;
    }
  }
`;
