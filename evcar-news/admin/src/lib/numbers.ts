const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Converts Arabic-Indic / Persian digits and the Arabic decimal separator to
 * ASCII so values typed on an Arabic keyboard parse correctly.
 */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const a = ARABIC_INDIC.indexOf(ch);
    const e = EASTERN_ARABIC_INDIC.indexOf(ch);
    if (a >= 0) out += String(a);
    else if (e >= 0) out += String(e);
    else if (ch === '٫') out += '.';
    else if (ch === '٬') out += '';
    else out += ch;
  }
  return out;
}

/** Decimal string with up to `scale` fraction digits, e.g. "1250000.50". */
export function isDecimalString(value: string, scale = 2): boolean {
  return new RegExp(`^\\d{1,15}(\\.\\d{1,${scale}})?$`).test(value);
}

/** Parses user input to a finite number or null (empty stays null, never 0). */
export function parseNumberInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = normalizeDigits(input).replace(/,/g, '').trim();
  if (s === '') return null;
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
