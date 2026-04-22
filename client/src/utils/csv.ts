/** Download any blob as a file. */
export function downloadBlob(filename: string, content: string, type = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Parse a CSV string into an array of row objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM
  const normalised = text.replace(/^﻿/, '');
  const lines = normalised.split(/\r?\n/);
  const nonBlank = lines.filter((l) => l.trim());
  if (nonBlank.length < 2) return [];

  // Simple parser that handles quoted fields
  function parseLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = parseLine(nonBlank[0]).map((h) => h.toLowerCase());
  return nonBlank.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

/** Escape a single CSV cell value. */
function escapeCell(value: unknown): string {
  const str = value == null ? '' : String(value);
  // Wrap in quotes if the string contains commas, quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Build a CSV string from an array of row objects. */
export function buildCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

/** Trigger a browser download of the given CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
