import type { ValidationError } from 'class-validator';
import { getMetadataStorage } from 'class-validator';
import type { SupportedLanguage } from '../../config/app-config';
import { RequestContext } from '../context/request-context';

/** Text in both UI languages. */
export interface Bilingual {
  ar: string;
  en: string;
}

/** Language of the current request (default: Arabic, contract §4.3). */
export function requestLang(): SupportedLanguage {
  return RequestContext.get()?.lang ?? 'ar';
}

/** Picks the request language from a bilingual text. */
export function tr(text: Bilingual, lang: SupportedLanguage = requestLang()): string {
  return text[lang];
}

/**
 * Validation options `context` carrying a translated message for a custom
 * rule, e.g. `@Matches(HEX, { context: localizedMessage({ ar: '…', en: '…' }) })`.
 */
export function localizedMessage(message: Bilingual): { message: Bilingual } {
  return { message };
}

type Template = (c: unknown[]) => Bilingual;

const list = (values: unknown): string =>
  (Array.isArray(values) ? values : Object.values(values ?? {})).map(String).join(', ');

const num = (v: unknown): string | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;

function lengthMessage(min: string | undefined, max: string | undefined): Bilingual {
  if (min && max && min !== '0') {
    return {
      ar: `يجب أن يكون الطول بين ${min} و${max} حرفًا.`,
      en: `Must be between ${min} and ${max} characters long.`,
    };
  }
  if (max)
    return { ar: `يجب ألا يزيد الطول عن ${max} حرفًا.`, en: `Must be at most ${max} characters.` };
  if (min)
    return { ar: `يجب ألا يقل الطول عن ${min} حرفًا.`, en: `Must be at least ${min} characters.` };
  return { ar: 'الطول غير صالح.', en: 'Invalid length.' };
}

/**
 * Human-readable, translated messages for class-validator constraints
 * (keyed by the constraint name that also appears in `details`). Clients
 * show these under form fields, so they never contain raw regular
 * expressions or English-only text (REQUIREMENTS §1: messages in ar/en).
 */
const TEMPLATES: Record<string, Template> = {
  isString: () => ({ ar: 'يجب أن تكون القيمة نصًا.', en: 'Must be text.' }),
  isInt: () => ({ ar: 'يجب أن تكون القيمة عددًا صحيحًا.', en: 'Must be a whole number.' }),
  isNumber: () => ({ ar: 'يجب أن تكون القيمة رقمًا.', en: 'Must be a number.' }),
  isBoolean: () => ({ ar: 'يجب أن تكون القيمة نعم أو لا.', en: 'Must be true or false.' }),
  isObject: () => ({ ar: 'يجب أن تكون القيمة كائنًا.', en: 'Must be an object.' }),
  isArray: () => ({ ar: 'يجب أن تكون القيمة قائمة.', en: 'Must be a list.' }),
  isDefined: () => ({
    ar: 'هذا الحقل لا يقبل قيمة فارغة (null).',
    en: 'This field cannot be null.',
  }),
  isNotEmpty: () => ({ ar: 'هذا الحقل مطلوب.', en: 'This field is required.' }),
  whitelistValidation: () => ({ ar: 'هذا الحقل غير مسموح به.', en: 'This field is not allowed.' }),
  nestedValidation: () => ({ ar: 'قيمة غير صالحة.', en: 'Invalid value.' }),
  min: (c) => {
    const v = num(c[0]);
    return v
      ? { ar: `يجب ألا تقل القيمة عن ${v}.`, en: `Must be at least ${v}.` }
      : { ar: 'القيمة صغيرة جدًا.', en: 'Value is too small.' };
  },
  max: (c) => {
    const v = num(c[0]);
    return v
      ? { ar: `يجب ألا تزيد القيمة عن ${v}.`, en: `Must be at most ${v}.` }
      : { ar: 'القيمة كبيرة جدًا.', en: 'Value is too large.' };
  },
  isLength: (c) => lengthMessage(num(c[0]), num(c[1])),
  minLength: (c) => lengthMessage(num(c[0]), undefined),
  maxLength: (c) => lengthMessage(undefined, num(c[0])),
  arrayMaxSize: (c) => ({
    ar: `يجب ألا تزيد العناصر عن ${num(c[0]) ?? '?'}.`,
    en: `Must contain at most ${num(c[0]) ?? '?'} items.`,
  }),
  arrayMinSize: (c) => ({
    ar: `يجب ألا تقل العناصر عن ${num(c[0]) ?? '?'}.`,
    en: `Must contain at least ${num(c[0]) ?? '?'} items.`,
  }),
  arrayUnique: () => ({ ar: 'يجب ألا تتكرر العناصر.', en: 'Items must be unique.' }),
  isIn: (c) => ({
    ar: `يجب أن تكون القيمة إحدى: ${list(c[0])}.`,
    en: `Must be one of: ${list(c[0])}.`,
  }),
  isEnum: (c) => ({
    ar: `يجب أن تكون القيمة إحدى: ${list(c[0])}.`,
    en: `Must be one of: ${list(c[0])}.`,
  }),
  matches: () => ({ ar: 'تنسيق القيمة غير صالح.', en: 'Invalid format.' }),
  isEmail: () => ({ ar: 'عنوان البريد الإلكتروني غير صالح.', en: 'Invalid email address.' }),
  isUrl: () => ({ ar: 'الرابط غير صالح.', en: 'Invalid URL.' }),
  isUuid: () => ({ ar: 'المعرّف غير صالح.', en: 'Invalid identifier.' }),
  isUUID: () => ({ ar: 'المعرّف غير صالح.', en: 'Invalid identifier.' }),
  isIso8601: () => ({ ar: 'التاريخ غير صالح (ISO 8601).', en: 'Invalid date (ISO 8601).' }),
  isISO8601: () => ({ ar: 'التاريخ غير صالح (ISO 8601).', en: 'Invalid date (ISO 8601).' }),
  isDateString: () => ({ ar: 'التاريخ غير صالح.', en: 'Invalid date.' }),
  isHexColor: () => ({ ar: 'اللون غير صالح.', en: 'Invalid colour.' }),
  isLatitude: () => ({ ar: 'خط العرض غير صالح.', en: 'Invalid latitude.' }),
  isLongitude: () => ({ ar: 'خط الطول غير صالح.', en: 'Invalid longitude.' }),
};

const FALLBACK: Bilingual = { ar: 'قيمة غير صالحة.', en: 'Invalid value.' };

function constraintArgs(err: ValidationError, name: string): unknown[] {
  const target = err.target;
  if (!target || typeof target !== 'object') return [];
  const metas = getMetadataStorage().getTargetValidationMetadatas(
    target.constructor,
    '',
    true,
    false,
  );
  const meta = metas.find(
    (m) => m.propertyName === err.property && (m.name === name || m.type === name),
  );
  return Array.isArray(meta?.constraints) ? (meta.constraints as unknown[]) : [];
}

/**
 * Translated message for one failed constraint: a DTO-provided message
 * (`context: localizedMessage(...)`) wins, then the template for the
 * constraint name, then a generic "Invalid value".
 */
export function localizeConstraint(
  err: ValidationError,
  name: string,
  lang: SupportedLanguage,
): string {
  const ctx = err.contexts?.[name] as { message?: Bilingual } | undefined;
  if (ctx?.message?.[lang]) return ctx.message[lang];
  const template = TEMPLATES[name];
  return (template ? template(constraintArgs(err, name)) : FALLBACK)[lang];
}
