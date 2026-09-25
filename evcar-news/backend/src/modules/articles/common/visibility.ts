import { ContentStatus, type Prisma } from '../../../generated/prisma/client';

/**
 * Where-clause of articles readers may see (docs/decisions/phase2-schema.md
 * §5): published, publication time reached, not deleted, and targeted at
 * `market` (no article_markets row = every market). Pass `market = null`
 * to ignore targeting (the reader asked for every market).
 */
export function visibleArticleWhere(
  market: string | null,
  now: Date = new Date(),
): Prisma.ArticleWhereInput {
  const where: Prisma.ArticleWhereInput = {
    status: ContentStatus.published,
    publishedAt: { lte: now },
    deletedAt: null,
  };
  if (market) {
    where.OR = [{ markets: { none: {} } }, { markets: { some: { marketCode: market } } }];
  }
  return where;
}

/**
 * A translation may be served to readers unless it is an unreviewed
 * machine translation (REQUIREMENTS §5: machine output stays a draft until
 * a person reviews it).
 */
export function isServableTranslation(t: {
  isMachineTranslated: boolean;
  humanReviewedAt: Date | null;
}): boolean {
  return !t.isMachineTranslated || t.humanReviewedAt !== null;
}

export const SERVABLE_TRANSLATION_WHERE: Prisma.ArticleTranslationWhereInput = {
  OR: [{ isMachineTranslated: false }, { humanReviewedAt: { not: null } }],
};
