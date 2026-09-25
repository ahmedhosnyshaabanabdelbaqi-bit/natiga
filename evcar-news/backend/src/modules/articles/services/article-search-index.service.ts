import { Injectable, Logger } from '@nestjs/common';
import { SearchEntityType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isServableTranslation } from '../common/visibility';
import { ARTICLE_IMAGE_INCLUDE, ArticleMediaService } from './article-media.service';
import { VEHICLE_LINK_INCLUDE, toVehicleRef } from './article-includes';

const BODY_MAX = 20_000;

/**
 * Keeps the unified search index (search_documents, one row per article ×
 * servable language) in sync with published articles (docs/decisions/
 * phase2-schema.md §5): rows are upserted when an article is published or
 * a published article changes, and removed when it stops being public.
 * Failures are logged, never propagated (search is secondary to saving).
 */
@Injectable()
export class ArticleSearchIndexService {
  private readonly logger = new Logger(ArticleSearchIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ArticleMediaService,
  ) {}

  async sync(articleId: string): Promise<void> {
    try {
      await this.syncOrThrow(articleId);
    } catch (err) {
      this.logger.warn(
        `Search index sync failed for article ${articleId}: ${(err as Error).message}`,
      );
    }
  }

  async syncOrThrow(articleId: string): Promise<void> {
    const a = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: {
        translations: true,
        markets: true,
        tags: { include: { tag: { include: { translations: true } } } },
        vehicleLinks: { include: VEHICLE_LINK_INCLUDE },
        coverAsset: { include: ARTICLE_IMAGE_INCLUDE },
      },
    });
    const isPublic = !!a && a.status === 'published' && !a.deletedAt && !!a.publishedAt;
    if (!a || !isPublic) {
      await this.prisma.searchDocument.deleteMany({
        where: { entityType: SearchEntityType.article, entityId: articleId },
      });
      return;
    }
    const servable = a.translations.filter(isServableTranslation);
    await this.prisma.$transaction(async (tx) => {
      await tx.searchDocument.deleteMany({
        where: {
          entityType: SearchEntityType.article,
          entityId: a.id,
          locale: { notIn: servable.map((t) => t.locale) },
        },
      });
      for (const t of servable) {
        const lang = t.locale === 'en' ? 'en' : 'ar';
        const keywords = [
          ...a.tags.flatMap((x) => x.tag.translations.map((tt) => tt.name)),
          ...a.vehicleLinks
            .map((l) => toVehicleRef(l, lang))
            .filter((v) => v?.isPublic)
            .map((v) => [v!.brandName, v!.name].filter(Boolean).join(' ')),
        ].join(' ');
        const data = {
          marketCodes: a.markets.map((m) => m.marketCode).sort(),
          title: t.title.slice(0, 500),
          subtitle: t.summary?.slice(0, 500) ?? null,
          body: (t.bodyText ?? '').slice(0, BODY_MAX) || null,
          keywords: keywords.slice(0, 4000) || null,
          slug: a.slug,
          imageUrl: this.media.toView(a.coverAsset, lang)?.url ?? null,
          isPublished: true,
          boost: a.isFeatured ? 1.2 : 1,
          publishedAt: a.publishedAt,
        };
        await tx.searchDocument.upsert({
          where: {
            entityType_entityId_locale: {
              entityType: SearchEntityType.article,
              entityId: a.id,
              locale: t.locale,
            },
          },
          create: {
            entityType: SearchEntityType.article,
            entityId: a.id,
            locale: t.locale,
            ...data,
          },
          update: data,
        });
      }
    });
  }

  /** Rebuilds the rows of every article (maintenance / search rebuild tool). */
  async reindexAll(): Promise<{ indexed: number }> {
    const ids = await this.prisma.article.findMany({ select: { id: true } });
    const stale = await this.prisma.searchDocument.findMany({
      where: { entityType: SearchEntityType.article },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    const all = new Set([...ids.map((r) => r.id), ...stale.map((r) => r.entityId)]);
    for (const id of all) await this.syncOrThrow(id);
    return { indexed: ids.length };
  }
}
