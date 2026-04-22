// server/src/lib/ingest/language.ts
import { ENGLISH_LETTER_RATIO } from './config.js';

// Cheap English heuristic: Latin-letter ratio against script-bearing chars.
// We exclude ASCII digits, punctuation, and whitespace from the denominator so
// that dates, numbers, and symbols don't dilute the ratio. Goal is to reject
// clearly non-Latin content (CJK, Arabic, emoji-heavy, etc.) before burning
// classifier tokens.

// Matches ASCII digits, punctuation (0x21-0x2F, 0x3A-0x40, 0x5B-0x60,
// 0x7B-0x7E) and currency/common symbols that are not script-bearing.
const NEUTRAL_RE = /[\x00-\x40\x5B-\x60\x7B-\x7F£€¥©®™°±×÷]/gu;

export function isEnglish(text: string): boolean {
  if (!text) return false;
  const nonWs = text.replace(/\s+/g, '');
  if (nonWs.length === 0) return false;

  // Remove neutral/non-script chars to get script-bearing characters only.
  const scriptBearing = nonWs.replace(NEUTRAL_RE, '');
  if (scriptBearing.length === 0) return false;

  let latin = 0;
  for (const ch of scriptBearing) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) latin++;
  }
  return latin / scriptBearing.length >= ENGLISH_LETTER_RATIO;
}
