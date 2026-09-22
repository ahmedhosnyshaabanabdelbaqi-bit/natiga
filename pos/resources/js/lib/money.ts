/**
 * Decimal arithmetic for the browser, on STRINGS.
 *
 * The UI needs instant feedback while typing, so it repeats the server's rules
 * locally — but it does so with integer arithmetic on scaled values, never with
 * JS numbers, so the preview and the committed invoice agree.
 *
 * The SERVER remains the only authority: `expected_grand_total` is sent with the
 * sale and a mismatch is rejected rather than silently overwritten.
 */

const SCALE = 6; // working precision, matches Money::INTERNAL_SCALE

function toUnits(value: string, scale: number): bigint {
    const negative = value.trim().startsWith('-');
    const clean = value.trim().replace(/^[-+]/, '') || '0';
    const [whole, fraction = ''] = clean.split('.');
    const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
    const units = BigInt(whole || '0') * 10n ** BigInt(scale) + BigInt(padded || '0');
    return negative ? -units : units;
}

function fromUnits(units: bigint, scale: number): string {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const divisor = 10n ** BigInt(scale);
    const whole = abs / divisor;
    const fraction = (abs % divisor).toString().padStart(scale, '0');
    const body = scale === 0 ? `${whole}` : `${whole}.${fraction}`;
    return negative ? `-${body}` : body;
}

/** Round half-up to `scale` decimal places. */
export function round(value: string, scale = 2): string {
    const units = toUnits(value, SCALE);
    const factor = 10n ** BigInt(SCALE - scale);
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const rounded = (abs + factor / 2n) / factor;
    return fromUnits(negative ? -rounded : rounded, scale);
}

export function add(a: string, b: string): string {
    return fromUnits(toUnits(a, SCALE) + toUnits(b, SCALE), SCALE);
}

export function subtract(a: string, b: string): string {
    return fromUnits(toUnits(a, SCALE) - toUnits(b, SCALE), SCALE);
}

export function multiply(a: string, b: string): string {
    const product = toUnits(a, SCALE) * toUnits(b, SCALE);
    return fromUnits(product / 10n ** BigInt(SCALE), SCALE);
}

export function divide(a: string, b: string): string {
    const divisor = toUnits(b, SCALE);
    if (divisor === 0n) return '0';
    return fromUnits((toUnits(a, SCALE) * 10n ** BigInt(SCALE)) / divisor, SCALE);
}

export function percentOf(value: string, percent: string): string {
    return divide(multiply(value, percent), '100');
}

export function compare(a: string, b: string): number {
    const x = toUnits(a, SCALE);
    const y = toUnits(b, SCALE);
    return x === y ? 0 : x > y ? 1 : -1;
}

export const isZero = (v: string) => toUnits(v, SCALE) === 0n;
export const isNegative = (v: string) => toUnits(v, SCALE) < 0n;
export const isPositive = (v: string) => toUnits(v, SCALE) > 0n;

export function sum(values: string[]): string {
    return values.reduce((total, value) => add(total, value), '0');
}

/** Round to the nearest cash step, e.g. '0.25'. */
export function roundToStep(value: string, step: string): string {
    if (!step || isZero(step)) return value;
    const stepUnits = toUnits(step, SCALE);
    const units = toUnits(value, SCALE);
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const count = (abs + stepUnits / 2n) / stepUnits;
    const result = count * stepUnits;
    return fromUnits(negative ? -result : result, SCALE);
}

/** Display formatting with Arabic-friendly grouping. */
export function formatMoney(value: string | null | undefined, scale = 2): string {
    if (value === null || value === undefined || value === '') return '—';
    const rounded = round(value, scale);
    const [whole, fraction = ''] = rounded.replace('-', '').split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sign = rounded.startsWith('-') ? '-' : '';
    return scale === 0 ? `${sign}${grouped}` : `${sign}${grouped}.${fraction.padEnd(scale, '0')}`;
}

/**
 * Normalise a quantity for transport: at most 4 decimals (the server's
 * Quantity::SCALE) with trailing zeros dropped.
 *
 * Arithmetic here works at scale 6, so adding two scanned "1.0000" quantities
 * yields "2.000000" — which the API rightly rejects. Everything that writes a
 * cart quantity goes through this.
 */
export function normalizeQty(value: string): string {
    const rounded = round(value, 4);
    const trimmed = rounded.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

/** Trailing zeros dropped, for quantities. */
export function formatQty(value: string | null | undefined): string {
    if (!value) return '0';
    const trimmed = value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return trimmed === '' ? '0' : trimmed;
}
