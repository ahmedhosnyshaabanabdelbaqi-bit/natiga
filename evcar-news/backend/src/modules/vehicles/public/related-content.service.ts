import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import type { Prisma } from '../../../generated/prisma/client';
import { AssetVariantKind, ContentStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../common/media-urls';
import { nameIn, textIn } from '../common/values';
import type { ArticleCardDto, TourCardDto, ToursSummaryDto } from '../dto/public.dto';

export const TOUR_UNAVAILABLE_LABEL = {
  ar: 'الجولة غير متاحة لهذه الفئة',
  en: 'The interior tour is not available for this trim',
};

const TOUR_INCLUDE = {
  referenceVariant: { select: { id: true, nameAr: true, nameEn: true } },
  initialScene: {
    select: {
      asset: {
        select: {
          variants: {
            where: { kind: AssetVariantKind.preview },
            select: { storageKey: true },
            take: 1,
          },
        },
      },
    },
  },
  scenes: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      key: true,
      position: true,
      titleAr: true,
      titleEn: true,
      asset: {
        select: {
          variants: {
            where: { kind: AssetVariantKind.preview },
            select: { storageKey: true },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.InteriorTourInclude;

type TourRow = Prisma.InteriorTourGetPayload<{ include: typeof TOUR_INCLUDE }>;

/**
 * Read-only access to content owned by other modules that the car pages
 * show: related articles (article_vehicle_links) and published 360°
 * interior tours (integration point with backend-tours: only
 * status=published, non-deleted tours of the trim IN the request market are
 * listed; the viewer itself is served by the tours module).
 */
@Injectable()
export class RelatedContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  // ------------------------------------------------------------------ tours

  async tourRows(variantIds: string[], market: string): Promise<TourRow[]> {
    if (variantIds.length === 0) return [];
    return this.prisma.interiorTour.findMany({
      where: {
        variantId: { in: variantIds },
        marketCode: market,
        status: ContentStatus.published,
        deletedAt: null,
      },
      include: TOUR_INCLUDE,
      orderBy: [{ matchType: 'asc' }, { publishedAt: 'desc' }],
    });
  }

  /** Variant ids (of `variantIds`) with at least one published tour in `market`. */
  async variantsWithTours(variantIds: string[], market: string): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();
    const rows = await this.prisma.interiorTour.findMany({
      where: {
        variantId: { in: variantIds },
        marketCode: market,
        status: ContentStatus.published,
        deletedAt: null,
      },
      select: { variantId: true },
      distinct: ['variantId'],
    });
    return new Set(rows.map((r) => r.variantId));
  }

  tourCard(t: TourRow, lang: SupportedLanguage): TourCardDto {
    const preview =
      t.initialScene?.asset.variants[0]?.storageKey ?? t.scenes[0]?.asset.variants[0]?.storageKey;
    const reference = t.matchType === 'reference_similar_trim';
    return {
      id: t.id,
      slug: t.slug,
      title: textIn(lang, t.titleAr, t.titleEn),
      variantId: t.variantId,
      marketCode: t.marketCode,
      driveSide: t.driveSide,
      interiorColorName: nameIn(lang, t.interiorColorNameAr, t.interiorColorNameEn),
      interiorColorHex: t.interiorColorHex,
      seatScenes: t.scenes.map((s) => ({
        id: s.id,
        key: s.key,
        position: s.position,
        title: textIn(lang, s.titleAr, s.titleEn),
      })),
      isReferenceForSimilarTrim: reference,
      differenceNote: reference ? textIn(lang, t.differenceNoteAr, t.differenceNoteEn) : null,
      referenceVariantName: t.referenceVariant
        ? nameIn(lang, t.referenceVariant.nameAr, t.referenceVariant.nameEn)
        : null,
      previewUrl: this.media.urlOf(preview),
      isDemo: t.isDemo,
    };
  }

  async toursSummary(
    variantIds: string[],
    market: string,
    lang: SupportedLanguage,
  ): Promise<ToursSummaryDto> {
    const tours = (await this.tourRows(variantIds, market)).map((t) => this.tourCard(t, lang));
    return {
      available: tours.length > 0,
      tours,
      unavailableLabel: TOUR_UNAVAILABLE_LABEL[lang],
    };
  }

  // ------------------------------------------------------------------ articles

  /**
   * Published articles linked to the given variants / model, visible in the
   * market (no market rows = all markets), in the request language when a
   * publishable translation exists, else in the article's original language.
   * Unreviewed machine translations are never served.
   */
  async articles(
    target: { variantIds: string[]; modelId?: string },
    market: string,
    lang: SupportedLanguage,
    limit = 10,
  ): Promise<ArticleCardDto[]> {
    const links: Prisma.ArticleVehicleLinkWhereInput[] = [];
    if (target.variantIds.length) links.push({ variantId: { in: target.variantIds } });
    if (target.modelId) links.push({ modelId: target.modelId });
    if (links.length === 0) return [];
    const rows = await this.prisma.article.findMany({
      where: {
        status: ContentStatus.published,
        publishedAt: { lte: new Date() },
        deletedAt: null,
        vehicleLinks: { some: { OR: links } },
        OR: [{ markets: { none: {} } }, { markets: { some: { marketCode: market } } }],
      },
      include: {
        translations: true,
        coverAsset: { include: IMAGE_ASSET_INCLUDE },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit * 2,
    });
    const out: ArticleCardDto[] = [];
    for (const a of rows) {
      const usable = a.translations.filter(
        (t) => !(t.isMachineTranslated && t.humanReviewedAt === null),
      );
      const tr =
        usable.find((t) => t.locale === lang) ??
        usable.find((t) => t.locale === a.originalLanguage) ??
        null;
      if (!tr || !a.publishedAt) continue;
      out.push({
        id: a.id,
        slug: a.slug,
        type: a.type,
        title: tr.title,
        summary: tr.summary,
        language: tr.locale,
        coverImage: this.media.image(a.coverAsset, lang),
        publishedAt: a.publishedAt.toISOString(),
        isSponsored: a.isSponsored,
        sponsorName: a.sponsorName,
        isDemo: a.isDemo,
      });
      if (out.length >= limit) break;
    }
    return out;
  }
}
