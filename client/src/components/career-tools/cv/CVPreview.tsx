import { CVTemplateRender } from './CVTemplates';
import type { CVData, CVTemplate } from './types';

type Props = { data: CVData; template: CVTemplate; scale?: number };

// Renders the active template inside a fixed-width A4-shaped sheet so the
// preview matches what will print. We scale the sheet down on smaller viewports
// via CSS transform so it never overflows.
export function CVPreview({ data, template, scale = 1 }: Props) {
  return (
    <div className="cv-preview-wrap" style={{ display: 'flex', justifyContent: 'center' }}>
      <div
        className="cv-preview-sheet"
        style={{
          width: '210mm',
          minHeight: '297mm',
          background: '#fff',
          color: '#1c1917',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          transform: `scale(${scale})`,
          transformOrigin: 'top center'
        }}
      >
        <CVTemplateRender data={data} template={template} />
      </div>
    </div>
  );
}
