import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { CVTemplateRender } from '../../components/career-tools/cv/CVTemplates';
import {
  normalizeCVData, type CVRecord, type CVTemplate
} from '../../components/career-tools/cv/types';

type RawCV = {
  id: string; userId: string; title: string; template: string;
  data: unknown; pdfUrl: string | null; createdAt: string; updatedAt: string;
};

function toRecord(raw: RawCV): CVRecord {
  const tpl: CVTemplate =
    raw.template === 'classic' || raw.template === 'ats-pure' ? raw.template : 'modern';
  return {
    id: raw.id, userId: raw.userId, title: raw.title, template: tpl,
    data: normalizeCVData(raw.data), pdfUrl: raw.pdfUrl,
    createdAt: raw.createdAt, updatedAt: raw.updatedAt
  };
}

export default function CVPrintPage() {
  const { id } = useParams<{ id: string }>();
  const printedRef = useRef(false);

  const { data: cv, isLoading, error } = useQuery<CVRecord>({
    queryKey: ['cvs', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get(`/cvs/${id}`);
      return toRecord(data.data as RawCV);
    }
  });

  useEffect(() => {
    if (!cv || printedRef.current) return;
    printedRef.current = true;
    document.title = `${cv.title} — CV`;
    // Defer print so the browser has painted the page first.
    const t = window.setTimeout(() => {
      try { window.print(); } catch { /* ignore */ }
    }, 350);
    return () => window.clearTimeout(t);
  }, [cv]);

  return (
    <div className="cv-print-root">
      {/* Print-only stylesheet — hides the global app chrome (nav, footer,
          mobile tab bar, chat widget) AND removes default margins so the CV
          fills the printable area. */}
      <style>{`
        :root, body, html { background: #e7e5e4; }
        body { margin: 0; }
        .cv-print-root { padding: 24px; display: flex; justify-content: center; }
        .cv-print-sheet {
          width: 210mm;
          min-height: 297mm;
          background: #fff;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        .cv-print-toolbar {
          position: fixed; top: 12px; right: 12px;
          display: flex; gap: 8px; z-index: 10;
        }
        .cv-print-toolbar button {
          background: #065F46; color: #fff; border: 0;
          padding: 8px 14px; border-radius: 8px; font-weight: 600;
          font-family: system-ui, sans-serif; cursor: pointer;
        }
        .cv-print-toolbar button.secondary { background: #fff; color: #065F46; border: 1px solid #065F46; }

        /* === HIDE APP CHROME on the print route ===
           Targets every Navbar/Footer/MobileTabBar/CareerMate root that the
           AppLayout might render around our outlet. Selectors are intentionally
           broad — we'd rather over-hide than show app chrome on a printable. */
        body header,
        body footer,
        body nav.fixed,
        body [data-app-chrome],
        body .careermate-widget,
        body [class*="careermate" i] { display: none !important; }
        body main { padding-bottom: 0 !important; }

        @media print {
          @page { size: A4; margin: 0; }
          html, body, .cv-print-root { background: #fff !important; padding: 0 !important; margin: 0 !important; }
          .cv-print-sheet { box-shadow: none !important; width: 210mm; min-height: 297mm; }
          .cv-print-toolbar { display: none !important; }
        }
      `}</style>

      <div className="cv-print-toolbar">
        <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        <button type="button" className="secondary" onClick={() => window.close()}>Close</button>
      </div>

      {isLoading && <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>}
      {error && <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#b91c1c' }}>Could not load CV.</div>}

      {cv && (
        <div className="cv-print-sheet">
          <CVTemplateRender data={cv.data} template={cv.template} />
        </div>
      )}
    </div>
  );
}
