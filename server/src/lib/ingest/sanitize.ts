// server/src/lib/ingest/sanitize.ts
import sanitizeHtml from 'sanitize-html';

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 20_000;

// Strip ASCII control chars except tab/newline which we flatten anyway.
const CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripControls(s: string): string {
  return s.replace(CTRL_RE, '');
}

export function sanitizeTitle(input: string): string {
  if (!input) return '';
  const stripped = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  const collapsed = stripControls(stripped).replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, TITLE_MAX);
}

export function sanitizeDescription(input: string): string {
  if (!input) return '';
  const clean = sanitizeHtml(input, {
    allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'h3', 'h4'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
    disallowedTagsMode: 'discard'
  });
  return stripControls(clean).slice(0, DESCRIPTION_MAX);
}
