import type { ArticleType } from '../../../generated/prisma/client';
import {
  buildSnapshot,
  type ArticleSnapshot,
  type VehicleLinkSnapshot,
} from '../domain/article-snapshot';

/** One language of an article as it will be stored. */
export interface TranslationState {
  title: string;
  summary: string | null;
  bodyHtml: string;
  bodyText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isMachineTranslated: boolean;
  humanReviewedAt: Date | null;
  humanReviewedById: string | null;
}

/**
 * The editorial content of an article, computed in memory before it is
 * written (create, update, restore, draft from RSS). Diffing the snapshot
 * of this state against the stored one decides whether a new version is
 * needed.
 */
export interface ArticleState {
  slug: string;
  type: ArticleType;
  categoryId: string | null;
  authorId: string | null;
  authorName: string | null;
  coverAssetId: string | null;
  originalLanguage: string;
  eventDate: Date | null;
  sourceName: string | null;
  sourceUrl: string | null;
  isFeatured: boolean;
  isSponsored: boolean;
  sponsorName: string | null;
  allowComments: boolean;
  marketCodes: string[];
  tagIds: string[];
  vehicleLinks: VehicleLinkSnapshot[];
  translations: Map<string, TranslationState>;
}

export function stateSnapshot(state: ArticleState): ArticleSnapshot {
  return buildSnapshot({
    ...state,
    markets: state.marketCodes.map((marketCode) => ({ marketCode })),
    tags: state.tagIds.map((tagId) => ({ tagId })),
    translations: [...state.translations].map(([locale, t]) => ({ locale, ...t })),
  });
}

/** State of a stored article (row with translations, markets, tags, vehicle links). */
export function stateFromRow(row: {
  slug: string;
  type: ArticleType;
  categoryId: string | null;
  authorId: string | null;
  authorName: string | null;
  coverAssetId: string | null;
  originalLanguage: string;
  eventDate: Date | null;
  sourceName: string | null;
  sourceUrl: string | null;
  isFeatured: boolean;
  isSponsored: boolean;
  sponsorName: string | null;
  allowComments: boolean;
  markets: Array<{ marketCode: string }>;
  tags: Array<{ tagId: string }>;
  vehicleLinks: Array<{ brandId: string | null; modelId: string | null; variantId: string | null }>;
  translations: Array<{
    locale: string;
    title: string;
    summary: string | null;
    bodyHtml: string;
    bodyText: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    isMachineTranslated: boolean;
    humanReviewedAt: Date | null;
    humanReviewedById: string | null;
  }>;
}): ArticleState {
  return {
    slug: row.slug,
    type: row.type,
    categoryId: row.categoryId,
    authorId: row.authorId,
    authorName: row.authorName,
    coverAssetId: row.coverAssetId,
    originalLanguage: row.originalLanguage,
    eventDate: row.eventDate,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    isFeatured: row.isFeatured,
    isSponsored: row.isSponsored,
    sponsorName: row.sponsorName,
    allowComments: row.allowComments,
    marketCodes: row.markets.map((m) => m.marketCode).sort(),
    tagIds: row.tags.map((t) => t.tagId).sort(),
    vehicleLinks: row.vehicleLinks.map((l) => ({
      brandId: l.brandId,
      modelId: l.modelId,
      variantId: l.variantId,
    })),
    translations: new Map(
      row.translations.map((t) => [
        t.locale,
        {
          title: t.title,
          summary: t.summary,
          bodyHtml: t.bodyHtml,
          bodyText: t.bodyText ?? '',
          seoTitle: t.seoTitle,
          seoDescription: t.seoDescription,
          isMachineTranslated: t.isMachineTranslated,
          humanReviewedAt: t.humanReviewedAt,
          humanReviewedById: t.humanReviewedById,
        },
      ]),
    ),
  };
}

export function cloneState(state: ArticleState): ArticleState {
  return {
    ...state,
    marketCodes: [...state.marketCodes],
    tagIds: [...state.tagIds],
    vehicleLinks: state.vehicleLinks.map((l) => ({ ...l })),
    translations: new Map([...state.translations].map(([k, v]) => [k, { ...v }])),
  };
}

export function sameTranslation(a: TranslationState | undefined, b: TranslationState): boolean {
  return (
    !!a &&
    a.title === b.title &&
    a.summary === b.summary &&
    a.bodyHtml === b.bodyHtml &&
    a.seoTitle === b.seoTitle &&
    a.seoDescription === b.seoDescription &&
    a.isMachineTranslated === b.isMachineTranslated &&
    (a.humanReviewedAt?.getTime() ?? null) === (b.humanReviewedAt?.getTime() ?? null) &&
    a.humanReviewedById === b.humanReviewedById
  );
}
