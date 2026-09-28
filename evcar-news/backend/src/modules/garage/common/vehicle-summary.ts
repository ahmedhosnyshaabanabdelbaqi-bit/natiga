import type { SupportedLanguage } from '../../../config/app-config';
import type { Prisma } from '../../../generated/prisma/client';
import { pick } from '../../stations/common/values';

/** Prisma select of a trim with its brand / model / model year names. */
export const VARIANT_SUMMARY_SELECT = {
  id: true,
  slug: true,
  nameAr: true,
  nameEn: true,
  powertrainType: true,
  status: true,
  deletedAt: true,
  modelYear: {
    select: {
      year: true,
      generation: {
        select: {
          model: {
            select: {
              id: true,
              slug: true,
              nameAr: true,
              nameEn: true,
              brand: { select: { id: true, slug: true, nameAr: true, nameEn: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.VehicleVariantSelect;

export type VariantSummaryRow = Prisma.VehicleVariantGetPayload<{
  select: typeof VARIANT_SUMMARY_SELECT;
}>;

export interface VariantSummary {
  id: string;
  slug: string;
  /** "Brand Model Year Trim" */
  name: string;
  trimName: string;
  modelYear: number;
  powertrainType: string;
  brand: { id: string; slug: string; name: string };
  model: { id: string; slug: string; name: string };
  isPublished: boolean;
}

export function variantSummary(v: VariantSummaryRow, lang: SupportedLanguage): VariantSummary {
  const model = v.modelYear.generation.model;
  const brandName = pick(lang, model.brand.nameAr, model.brand.nameEn) ?? '';
  const modelName = pick(lang, model.nameAr, model.nameEn) ?? '';
  const trim = pick(lang, v.nameAr, v.nameEn) ?? '';
  return {
    id: v.id,
    slug: v.slug,
    name: [brandName, modelName, String(v.modelYear.year), trim].filter(Boolean).join(' '),
    trimName: trim,
    modelYear: v.modelYear.year,
    powertrainType: v.powertrainType,
    brand: { id: model.brand.id, slug: model.brand.slug, name: brandName },
    model: { id: model.id, slug: model.slug, name: modelName },
    isPublished: v.status === 'published' && v.deletedAt === null,
  };
}

/** Decimal → number (null stays null). */
export function n(v: { toString(): string } | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v.toString());
  return Number.isFinite(x) ? x : null;
}

export function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** "YYYY-MM-DD" → Date at UTC midnight, or null when not a real calendar date. */
export function parseDateOnly(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}
