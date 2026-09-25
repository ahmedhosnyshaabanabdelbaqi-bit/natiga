import type { SupportedLanguage } from '../../../config/app-config';
import { ContentStatus, type Prisma } from '../../../generated/prisma/client';
import { pickName } from '../common/localized';
import type { RelatedVehicleDto } from '../dto/article-common.dto';
import { ARTICLE_IMAGE_INCLUDE } from './article-media.service';

const BRAND_SELECT = {
  id: true,
  slug: true,
  nameAr: true,
  nameEn: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.BrandSelect;

const MODEL_SELECT = {
  id: true,
  slug: true,
  nameAr: true,
  nameEn: true,
  status: true,
  deletedAt: true,
  brand: { select: BRAND_SELECT },
} satisfies Prisma.CarModelSelect;

export const VEHICLE_LINK_INCLUDE = {
  brand: { select: BRAND_SELECT },
  model: { select: MODEL_SELECT },
  variant: {
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      status: true,
      deletedAt: true,
      modelYear: {
        select: {
          year: true,
          generation: { select: { deletedAt: true, model: { select: MODEL_SELECT } } },
        },
      },
    },
  },
} satisfies Prisma.ArticleVehicleLinkInclude;

export type VehicleLinkRow = Prisma.ArticleVehicleLinkGetPayload<{
  include: typeof VEHICLE_LINK_INCLUDE;
}>;

/** Everything the admin editor needs about one article. */
export const ADMIN_ARTICLE_INCLUDE = {
  translations: true,
  markets: true,
  tags: { include: { tag: { include: { translations: true } } } },
  vehicleLinks: { include: VEHICLE_LINK_INCLUDE },
  category: { include: { translations: true } },
  author: { select: { id: true, displayName: true } },
  reviewedBy: { select: { id: true, displayName: true } },
  coverAsset: { include: ARTICLE_IMAGE_INCLUDE },
} satisfies Prisma.ArticleInclude;

export type AdminArticleRow = Prisma.ArticleGetPayload<{ include: typeof ADMIN_ARTICLE_INCLUDE }>;

/** Lighter include for list rows. */
export const ARTICLE_LIST_INCLUDE = {
  translations: {
    select: {
      locale: true,
      title: true,
      summary: true,
      bodyText: true,
      isMachineTranslated: true,
      humanReviewedAt: true,
    },
  },
  markets: true,
  tags: { include: { tag: { include: { translations: true } } } },
  category: { include: { translations: true } },
  author: { select: { id: true, displayName: true } },
  coverAsset: { include: ARTICLE_IMAGE_INCLUDE },
} satisfies Prisma.ArticleInclude;

export type ArticleListRow = Prisma.ArticleGetPayload<{ include: typeof ARTICLE_LIST_INCLUDE }>;

type Named = { nameAr: string; nameEn: string; status: string; deletedAt: Date | null };
const live = (x: Named | null | undefined) =>
  !!x && x.status === ContentStatus.published && !x.deletedAt;

/** Related-car view of a link (+ whether readers can see it). */
export function toVehicleRef(
  link: VehicleLinkRow,
  lang: SupportedLanguage,
): (RelatedVehicleDto & { isPublic: boolean }) | null {
  const name = (x: Named) => pickName(x.nameAr, x.nameEn, lang) ?? '';
  if (link.brand) {
    const b = link.brand;
    return {
      type: 'brand',
      id: b.id,
      slug: b.slug,
      name: name(b),
      brandName: null,
      modelSlug: null,
      modelYear: null,
      isPublic: live(b),
    };
  }
  if (link.model) {
    const m = link.model;
    return {
      type: 'model',
      id: m.id,
      slug: m.slug,
      name: name(m),
      brandName: name(m.brand),
      modelSlug: m.slug,
      modelYear: null,
      isPublic: live(m) && live(m.brand),
    };
  }
  if (link.variant) {
    const v = link.variant;
    const m = v.modelYear.generation.model;
    return {
      type: 'variant',
      id: v.id,
      slug: v.slug,
      name: `${name(m)} ${name(v)}`.trim(),
      brandName: name(m.brand),
      modelSlug: m.slug,
      modelYear: v.modelYear.year,
      isPublic: live(v) && live(m) && live(m.brand) && !v.modelYear.generation.deletedAt,
    };
  }
  return null;
}
