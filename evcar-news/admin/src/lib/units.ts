/**
 * Canonical units used by the API (ARCHITECTURE §4.3) and conversions from
 * common alternative input units. Conversions happen only for entry
 * convenience; the original value/unit is kept alongside the canonical value.
 *
 * NOTE: range test cycles (WLTP/EPA/CLTC/NEDC) are NEVER converted into each
 * other — that is not a unit conversion and is intentionally absent here.
 */

export const CANONICAL_UNITS = [
  'km',
  'kWh',
  'kW',
  'Wh/km',
  'min',
  'mm',
  'l',
  'kg',
  's',
  'Nm',
  'hp',
  '%',
] as const;
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

type Converter = (value: number) => number;

/** alternative unit → function converting a value in that unit to the canonical unit */
const TO_CANONICAL: Partial<Record<CanonicalUnit, Record<string, Converter>>> = {
  km: { mi: (v) => v * 1.609344 },
  mm: { cm: (v) => v * 10, m: (v) => v * 1000, in: (v) => v * 25.4 },
  kg: { lb: (v) => v * 0.45359237, t: (v) => v * 1000 },
  l: { 'cu ft': (v) => v * 28.316846592 },
  min: { h: (v) => v * 60 },
  Nm: { 'lb-ft': (v) => v * 1.3558179483314 },
  'Wh/km': {
    'kWh/100km': (v) => v * 10,
    // Efficiency in mi/kWh is inverse to consumption; 0 has no meaning here.
    'mi/kWh': (v) => (v === 0 ? Number.NaN : 1000 / (v * 1.609344)),
  },
};

export function alternativeUnits(unit: CanonicalUnit): string[] {
  return Object.keys(TO_CANONICAL[unit] ?? {});
}

/**
 * Converts `value` expressed in `from` into `canonical`. Returns null when the
 * value is null, not finite, or the conversion is unknown/undefined.
 */
export function toCanonical(
  value: number | null,
  from: string,
  canonical: CanonicalUnit,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (from === canonical) return value;
  const convert = TO_CANONICAL[canonical]?.[from];
  if (!convert) return null;
  const result = convert(value);
  return Number.isFinite(result) ? result : null;
}

/** Rounds for display/storage without float noise (e.g. 0.30000000000000004). */
export function roundTo(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
