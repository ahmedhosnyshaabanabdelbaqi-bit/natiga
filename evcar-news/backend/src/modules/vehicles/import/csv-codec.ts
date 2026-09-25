/**
 * CSV reading / writing for the catalog import & export (REQUIREMENTS §17).
 *  - UTF-8 (BOM tolerated), comma separated, first line = header.
 *  - Exported cells that a spreadsheet would run as a formula (=, +, -, @,
 *    tab, CR at the start) are prefixed with an apostrophe; the importer
 *    removes that apostrophe again (CSV / formula injection guard).
 *  - Empty cell = "not given" (keeps the stored value on update).
 */
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;

export type CsvRow = Record<string, string>;

export class CsvFormatError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Escapes a cell that a spreadsheet would evaluate as a formula. */
export function guardCell(value: string): string {
  return FORMULA_START.test(value) && !NUMERIC.test(value) ? `'${value}` : value;
}

/** Reverses guardCell() on import. */
export function unguardCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

export function parseCsv(buffer: Buffer): { headers: string[]; rows: CsvRow[] } {
  if (buffer.length > CSV_MAX_BYTES) {
    throw new CsvFormatError('file_too_large', { maxBytes: CSV_MAX_BYTES });
  }
  const text = buffer.toString('utf8');
  if (text.includes('\u0000')) throw new CsvFormatError('binary_content');
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: false,
    });
  } catch (err) {
    throw new CsvFormatError('parse_error', { reason: (err as Error).message.slice(0, 300) });
  }
  if (records.length === 0) throw new CsvFormatError('empty');
  const headers = records[0].map((h) => h.trim().toLowerCase());
  const body = records.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
  if (body.length > CSV_MAX_ROWS) {
    throw new CsvFormatError('too_many_rows', { maxRows: CSV_MAX_ROWS, rows: body.length });
  }
  const rows = body.map((cells) => {
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = unguardCell((cells[i] ?? '').trim());
    });
    return row;
  });
  return { headers, rows };
}

export function toCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const safe = rows.map((r) =>
    r.map((v) => (v === null || v === undefined ? '' : guardCell(String(v)))),
  );
  // BOM so spreadsheet apps open Arabic text as UTF-8.
  return `\uFEFF${stringify([headers, ...safe], { record_delimiter: '\n' })}`;
}

// --- cell parsers ------------------------------------------------------------------------

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٫': '.',
  '٬': ',',
};

/** "1,234.5" / "1234,5" / "١٢٣" → number; null when empty; NaN when invalid. */
export function parseNumberCell(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let v = raw.trim();
  if (v === '') return null;
  v = v.replace(/[٠-٩۰-۹٫٬]/g, (c) => ARABIC_DIGITS[c] ?? c).replace(/\s/g, '');
  if (v.includes('.') && v.includes(',')) v = v.replace(/,/g, '');
  else if (v.includes(','))
    v = /^\d{1,3}(,\d{3})+$/.test(v) ? v.replace(/,/g, '') : v.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : Number.NaN;
}

const TRUE = new Set(['true', 'yes', 'y', '1', 'نعم']);
const FALSE = new Set(['false', 'no', 'n', '0', 'لا']);

/** true / false / null (empty) / undefined (invalid). */
export function parseBoolCell(raw: string | undefined): boolean | null | undefined {
  const v = raw?.trim().toLowerCase() ?? '';
  if (v === '') return null;
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  return undefined;
}

/** Empty → undefined (not given); otherwise the trimmed text. */
export function textCell(raw: string | undefined): string | undefined {
  const v = raw?.trim() ?? '';
  return v === '' ? undefined : v;
}
