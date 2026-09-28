import type { SupportedLanguage } from '../../../config/app-config';
import type { LocalizedText } from '../../../common/i18n/localized-text';
import { ContentStatus, type Prisma } from '../../../generated/prisma/client';

/**
 * Publicly visible encyclopedia entry: published, technically reviewed
 * (also a DB CHECK), publication time reached, not deleted, in an active
 * category.
 */
export function publicEntryWhere(now: Date = new Date()): Prisma.EncyclopediaEntryWhereInput {
  return {
    status: ContentStatus.published,
    deletedAt: null,
    technicalReviewedAt: { not: null },
    publishedAt: { lte: now },
    category: { isActive: true },
  };
}

/** Same rule for raw SQL (alias e, category c joined). */
export const PUBLIC_ENTRY_SQL_TEXT = `e."status" = 'published' AND e."deleted_at" IS NULL
  AND e."technical_reviewed_at" IS NOT NULL AND e."published_at" <= now()
  AND c."is_active"`;

export const REVIEWED_LABEL: LocalizedText = {
  ar: 'راجعه مختص تقني',
  en: 'Reviewed by a technical specialist',
};

/**
 * Categories dealing with electricity: their entries carry a fixed safety
 * notice (REQUIREMENTS §15: no instructions for bypassing safety devices or
 * unsafe electrical connections).
 */
export const ELECTRICAL_CATEGORIES: ReadonlySet<string> = new Set([
  'home_charging',
  'fast_charging',
  'connectors',
  'batteries',
]);

export const SAFETY_NOTICE: LocalizedText = {
  ar: 'تنبيه أمان: أي تركيب أو تعديل كهربائي (شاحن منزلي، خط تغذية، لوحة كهرباء) يجب أن ينفذه كهربائي مؤهل ومرخّص وفق الأكواد المحلية. لا تتجاوز وسائل الحماية ولا تستخدم وصلات أو محولات غير معتمدة.',
  en: 'Safety notice: any electrical installation or change (home charger, supply line, distribution board) must be carried out by a qualified, licensed electrician according to local codes. Never bypass protective devices or use uncertified adapters or extension leads.',
};

export function safetyNoticeFor(categoryKey: string, lang: SupportedLanguage): string | null {
  return ELECTRICAL_CATEGORIES.has(categoryKey) ? SAFETY_NOTICE[lang] : null;
}

/**
 * Technical review checklist the reviewer must confirm item by item before
 * an entry can be approved (all must be true) + a personal attestation.
 * Stored in the audit record of the review (schema has no column; see
 * decisions §9).
 */
export const REVIEW_CHECKLIST = [
  /** Facts checked against cited, reliable sources. */
  'facts_verified',
  /** No instructions to bypass protective devices (RCD, breakers, interlocks, BMS…). */
  'no_safety_bypass',
  /** No do-it-yourself mains wiring / unsafe electrical connection instructions. */
  'no_unsafe_electrical_instructions',
  /** Electrical work is referred to a qualified electrician. */
  'qualified_electrician_referral',
  /** Units, standards and range cycles are named correctly (WLTP ≠ EPA ≠ CLTC…). */
  'units_and_standards_correct',
  /** Arabic and English versions say the same thing. */
  'translations_consistent',
] as const;
export type ReviewChecklistKey = (typeof REVIEW_CHECKLIST)[number];

export const ATTESTATION_TEXT: LocalizedText = {
  ar: 'أقر بأنني راجعت هذه المادة تقنيًا وأنها لا تتضمن تعليمات لتجاوز وسائل الأمان أو توصيلات كهربائية غير مأمونة.',
  en: 'I confirm that I technically reviewed this entry and that it contains no instructions for bypassing safety devices or making unsafe electrical connections.',
};

/**
 * Phrases that must never appear in an entry (checked on submit / approve;
 * normalized comparison). Not exhaustive — the human checklist is the real
 * control; this only catches the obvious cases early.
 */
export const UNSAFE_PHRASES: readonly string[] = [
  'bypass the rcd',
  'bypass rcd',
  'disable the rcd',
  'remove the earth',
  'remove the ground',
  'bypass the breaker',
  'jumper the breaker',
  'bypass the bms',
  'disable the bms',
  'suicide cord',
  'تجاوز القاطع',
  'فصل الأرضي',
  'الغاء الارضي',
  'إلغاء الأرضي',
  'تعطيل القاطع',
  'تجاوز نظام ادارة البطاريه',
];
