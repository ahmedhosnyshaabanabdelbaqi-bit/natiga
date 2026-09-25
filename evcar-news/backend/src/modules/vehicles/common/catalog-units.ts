/**
 * Canonical units of the catalog (contract §4.3) with the value "as
 * published" kept next to it (REQUIREMENTS §7: "وحّد الوحدات قبل الحساب مع
 * الحفاظ على القيم الأصلية"). Conversion is a unit change only — never a
 * conversion between range test cycles.
 */
import {
  convertUnit,
  dimensionOf,
  isKnownUnit,
  UnitConversionError,
  UNITS,
} from '../../../common/units/units';
import { fieldError } from './catalog-errors';
import { numberText, round } from './values';

/** Units that are not physical dimensions of src/common/units (compared literally). */
const LITERAL_UNITS: Record<string, string[]> = {
  year: ['year', 'years', 'yr', 'yrs', 'y', 'سنة', 'سنوات'],
};

const ALIASES: Record<string, string> = {
  kmh: 'km/h',
  'km/hr': 'km/h',
  kph: 'km/h',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  sec: 's',
  secs: 's',
  second: 's',
  seconds: 's',
  minute: 'min',
  minutes: 'min',
  mins: 'min',
  hour: 'h',
  hours: 'h',
  hr: 'h',
  inch: 'in',
  inches: 'in',
  '"': 'in',
  lbft: 'lb-ft',
  'lb ft': 'lb-ft',
  'lb·ft': 'lb-ft',
  mile: 'mi',
  miles: 'mi',
  'kwh/100 km': 'kWh/100km',
  'kwh/100mi': 'kWh/100mi',
  'wh/mile': 'Wh/mi',
  'l/100 km': 'L/100km',
  kilogram: 'kg',
  kilograms: 'kg',
  pound: 'lb',
  pounds: 'lb',
  cv: 'PS',
};

const LOWER_INDEX: Record<string, string> = Object.fromEntries(
  Object.keys(UNITS).map((u) => [u.toLowerCase(), u]),
);

/** Normalizes the spelling of a unit ("KWH" → "kWh"); unknown units return null. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const u = raw.trim();
  if (u === '') return null;
  if (isKnownUnit(u)) return u;
  const lower = u.toLowerCase();
  for (const [canonical, spellings] of Object.entries(LITERAL_UNITS)) {
    if (spellings.includes(lower) || spellings.includes(u)) return canonical;
  }
  const alias = ALIASES[lower];
  if (alias) return alias;
  return LOWER_INDEX[lower] ?? null;
}

export interface CanonicalValue {
  value: number;
  /** Value/unit as given, when they differ from the canonical form (else null). */
  originalValue: string | null;
  originalUnit: string | null;
}

export interface ToCanonicalOptions {
  /** Field name used in validation errors. */
  field?: string;
  /** Decimal places of the storage column. */
  decimals?: number;
  /** Explicit "as published" value/unit (wins over the automatic one). */
  originalValue?: string | null;
  originalUnit?: string | null;
}

/**
 * Converts `value` given in `inputUnit` (default: canonical) to `canonical`.
 * Throws 422 VALIDATION_FAILED for unknown units, a unit of another
 * dimension, or a unit on a unitless value.
 */
export function toCanonical(
  value: number,
  inputUnit: string | null | undefined,
  canonical: string | null,
  opts: ToCanonicalOptions = {},
): CanonicalValue {
  const field = opts.field ?? 'unit';
  const decimals = opts.decimals ?? 6;
  const explicitOriginal = (opts.originalValue ?? null) !== null;
  const given = inputUnit === undefined || inputUnit === null || inputUnit.trim() === '';
  const unit = given ? canonical : normalizeUnit(inputUnit);
  if (!given && unit === null) {
    throw fieldError(field, 'unknownUnit', {
      ar: `وحدة القياس "${inputUnit}" غير معروفة.`,
      en: `Unknown unit "${inputUnit}".`,
    });
  }
  if (canonical === null) {
    if (!given) {
      throw fieldError(field, 'unitNotAllowed', {
        ar: 'هذه القيمة بلا وحدة قياس.',
        en: 'This value has no unit.',
      });
    }
    return {
      value: round(value, decimals),
      originalValue: explicitOriginal ? (opts.originalValue ?? null) : null,
      originalUnit: explicitOriginal ? (opts.originalUnit ?? null) : null,
    };
  }
  let converted = value;
  if (unit !== canonical) {
    const literal = canonical in LITERAL_UNITS || (unit !== null && unit in LITERAL_UNITS);
    if (literal || !isKnownUnit(canonical) || unit === null || !isKnownUnit(unit)) {
      throw wrongDimension(field, inputUnit ?? '', canonical);
    }
    if (dimensionOf(unit) !== dimensionOf(canonical)) {
      throw wrongDimension(field, inputUnit ?? '', canonical);
    }
    try {
      converted = convertUnit(value, unit, canonical);
    } catch (e) {
      if (e instanceof UnitConversionError) {
        throw fieldError(field, 'conversion', {
          ar: 'تعذر تحويل القيمة إلى الوحدة الموحدة.',
          en: 'The value cannot be converted to the canonical unit.',
        });
      }
      throw e;
    }
  }
  const auto = unit !== canonical;
  return {
    value: round(converted, decimals),
    originalValue: explicitOriginal
      ? (opts.originalValue ?? null)
      : auto
        ? numberText(value)
        : null,
    originalUnit: explicitOriginal
      ? (opts.originalUnit ?? null)
      : auto
        ? (inputUnit?.trim() ?? null)
        : null,
  };
}

function wrongDimension(field: string, unit: string, canonical: string) {
  return fieldError(field, 'unitDimension', {
    ar: `لا يمكن استخدام الوحدة "${unit}" هنا؛ الوحدة الموحدة هي ${canonical}.`,
    en: `The unit "${unit}" cannot be used here; the canonical unit is ${canonical}.`,
  });
}
