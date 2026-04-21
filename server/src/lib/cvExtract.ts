// PDF / DOCX text extraction for the CV Match upload flow.
// Both libs are runtime-light; pdf-parse is dynamic-imported to dodge
// its CJS index file's "test fixture not found" startup behaviour.

import mammoth from 'mammoth';

export type ExtractResult = {
  text: string;
  charCount: number;
  format: 'pdf' | 'docx';
};

const MAX_CHARS = 30_000;

export class CvExtractError extends Error {
  constructor(public code: 'LEGACY_DOC' | 'UNSUPPORTED_FILE', message: string) {
    super(message);
  }
}

function normalise(raw: string): string {
  let text = raw
    // Strip control chars (preserves \t \n \r).
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // Collapse 3+ newlines into 2.
    .replace(/\n{3,}/g, '\n\n')
    // Collapse 3+ spaces into 1.
    .replace(/[ \t]{3,}/g, ' ')
    .trim();
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + '\n[...truncated]';
  }
  return text;
}

function looksLikePdf(mimetype: string, originalName: string): boolean {
  return mimetype === 'application/pdf' || /\.pdf$/i.test(originalName);
}

function looksLikeDocx(mimetype: string, originalName: string): boolean {
  return (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(originalName)
  );
}

function looksLikeLegacyDoc(mimetype: string, originalName: string): boolean {
  return mimetype === 'application/msword' || /\.doc$/i.test(originalName);
}

export async function extractCvText(
  buffer: Buffer,
  mimetype: string,
  originalName: string
): Promise<ExtractResult> {
  if (looksLikeDocx(mimetype, originalName)) {
    const result = await mammoth.extractRawText({ buffer });
    const text = normalise(result.value || '');
    return { text, charCount: text.length, format: 'docx' };
  }

  if (looksLikePdf(mimetype, originalName)) {
    // Lazy-load: pdf-parse's index module runs a debug script at import
    // time that tries to read a sample PDF and crashes if the file is
    // missing — dodge that by importing only when needed.
    const pdfParseMod: any = await import('pdf-parse');
    const pdfParse = pdfParseMod.default || pdfParseMod;
    const result = await pdfParse(buffer);
    const text = normalise(result.text || '');
    return { text, charCount: text.length, format: 'pdf' };
  }

  if (looksLikeLegacyDoc(mimetype, originalName)) {
    throw new CvExtractError(
      'LEGACY_DOC',
      'Save as .docx and re-upload — legacy .doc isn\'t supported.'
    );
  }

  throw new CvExtractError(
    'UNSUPPORTED_FILE',
    'Only PDF and DOCX files are supported.'
  );
}
