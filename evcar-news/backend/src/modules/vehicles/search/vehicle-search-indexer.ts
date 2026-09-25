import { Injectable, Logger } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { ContentStatus, SearchEntityType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { LISTED_AVAILABILITIES } from '../common/catalog-constants';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../common/media-urls';
import { nameIn } from '../common/values';

const LOCALES: SupportedLanguage[] = ['ar', 'en'];

const POWERTRAIN_WORDS: Record<string, { ar: string; en: string }> = {
  BEV: { ar: 'كهربائية بالكامل', en: 'Battery electric' },
  PHEV: { ar: 'هجينة قابلة للشحن', en: 'Plug-in hybrid' },
  EREV: { ar: 'كهربائية بموسّع مدى', en: 'Range-extended electric' },
  HEV: { ar: 'هجينة', en: 'Hybrid' },
};

interface DocInput {
  entityType: SearchEntityType;
  entityId: string;
  visible: boolean;
  marketCodes: string[];
  slug: string;
  imageUrl: string | null;
  boost: number;
  publishedAt: Date | null;
  text: (lang: SupportedLanguage) => {
    title: string;
    subtitle: string | null;
    body: string | null;
    keywords: string;
  };
}

/**
 * Keeps search_documents in sync for brands, models and variants (one row
 * per entity × locale; decisions phase2-schema §5). A document exists only
 * while the entity is public AND listed in at least one market
 * (`market_codes` = those markets); otherwise its rows are deleted.
 * Failures are logged, never thrown: search must not block catalog edits.
 */
@Injectable()
export class VehicleSearchIndexer {
  private readonly logger = new Logger(VehicleSearchIndexer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  async reindexVariant(variantId: string): Promise<void> {
    const v = await this.prisma.vehicleVariant.findUnique({
      where: { id: variantId },
      select: { modelYear: { select: { generation: { select: { modelId: true } } } } },
    });
    if (v) await this.reindexModel(v.modelYear.generation.modelId);
    else await this.remove(SearchEntityType.variant, [variantId]);
  }

  /** The model, all its variants and its brand. */
  async reindexModel(modelId: string): Promise<void> {
    await this.safe(`model ${modelId}`, async () => {
      const model = await this.prisma.carModel.findUnique({
        where: { id: modelId },
        include: {
          brand: true,
          heroAsset: { include: IMAGE_ASSET_INCLUDE },
          generations: {
            include: {
              modelYears: {
                include: {
                  variants: {
                    include: {
                      markets: {
                        where: { availability: { in: LISTED_AVAILABILITIES } },
                        select: { marketCode: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!model) {
        await this.remove(SearchEntityType.model, [modelId]);
        return;
      }
      const brandVisible = model.brand.status === ContentStatus.published && !model.brand.deletedAt;
      const modelVisible =
        brandVisible && model.status === ContentStatus.published && !model.deletedAt;
      const modelMarkets = new Set<string>();
      const imageUrl = this.media.image(model.heroAsset, 'en')?.url ?? null;

      for (const g of model.generations) {
        for (const y of g.modelYears) {
          for (const v of y.variants) {
            const visible =
              modelVisible && !g.deletedAt && v.status === ContentStatus.published && !v.deletedAt;
            const markets = visible ? v.markets.map((m) => m.marketCode) : [];
            markets.forEach((m) => modelMarkets.add(m));
            await this.write({
              entityType: SearchEntityType.variant,
              entityId: v.id,
              visible,
              marketCodes: markets,
              slug: v.slug,
              imageUrl,
              boost: 1,
              publishedAt: v.publishedAt,
              text: (lang) => ({
                title: `${nameIn(lang, model.brand.nameAr, model.brand.nameEn)} ${nameIn(lang, model.nameAr, model.nameEn)} ${nameIn(lang, v.nameAr, v.nameEn)}`,
                subtitle: `${y.year} · ${POWERTRAIN_WORDS[v.powertrainType][lang]}`,
                body: null,
                keywords: [
                  model.brand.nameEn,
                  model.brand.nameAr,
                  model.nameEn,
                  model.nameAr,
                  v.nameEn,
                  v.nameAr,
                  v.trimCode,
                  v.powertrainType,
                  String(y.year),
                ]
                  .filter(Boolean)
                  .join(' '),
              }),
            });
          }
        }
      }

      await this.write({
        entityType: SearchEntityType.model,
        entityId: model.id,
        visible: modelVisible,
        marketCodes: [...modelMarkets].sort(),
        slug: model.slug,
        imageUrl,
        boost: 1.2,
        publishedAt: model.updatedAt,
        text: (lang) => ({
          title: `${nameIn(lang, model.brand.nameAr, model.brand.nameEn)} ${nameIn(lang, model.nameAr, model.nameEn)}`,
          subtitle: model.segment,
          body: (lang === 'en' ? model.descriptionEn : model.descriptionAr)?.slice(0, 2000) ?? null,
          keywords: [model.brand.nameEn, model.brand.nameAr, model.nameEn, model.nameAr, model.slug]
            .filter(Boolean)
            .join(' '),
        }),
      });
      await this.reindexBrandDoc(model.brandId);
    });
  }

  /** The brand document and every model (with variants) of the brand. */
  async reindexBrand(brandId: string): Promise<void> {
    const models = await this.prisma.carModel.findMany({
      where: { brandId },
      select: { id: true },
    });
    for (const m of models) await this.reindexModel(m.id);
    await this.safe(`brand ${brandId}`, () => this.reindexBrandDoc(brandId));
  }

  /** Rebuilds every brand / model / variant document; returns the number of models processed. */
  async rebuildAll(): Promise<number> {
    const brands = await this.prisma.brand.findMany({ select: { id: true } });
    let models = 0;
    for (const b of brands) {
      models += await this.prisma.carModel.count({ where: { brandId: b.id } });
      await this.reindexBrand(b.id);
    }
    // Documents of rows that no longer exist.
    const [bIds, mIds, vIds] = await Promise.all([
      this.prisma.brand.findMany({ select: { id: true } }),
      this.prisma.carModel.findMany({ select: { id: true } }),
      this.prisma.vehicleVariant.findMany({ select: { id: true } }),
    ]);
    await this.prisma.searchDocument.deleteMany({
      where: {
        OR: [
          { entityType: SearchEntityType.brand, entityId: { notIn: bIds.map((x) => x.id) } },
          { entityType: SearchEntityType.model, entityId: { notIn: mIds.map((x) => x.id) } },
          { entityType: SearchEntityType.variant, entityId: { notIn: vIds.map((x) => x.id) } },
        ],
      },
    });
    return models;
  }

  private async reindexBrandDoc(brandId: string): Promise<void> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      include: { logoAsset: { include: IMAGE_ASSET_INCLUDE } },
    });
    if (!brand) {
      await this.remove(SearchEntityType.brand, [brandId]);
      return;
    }
    const visible = brand.status === ContentStatus.published && !brand.deletedAt;
    const markets = visible
      ? await this.prisma.variantMarket.findMany({
          where: {
            availability: { in: LISTED_AVAILABILITIES },
            variant: {
              status: ContentStatus.published,
              deletedAt: null,
              modelYear: {
                generation: {
                  deletedAt: null,
                  model: { brandId, status: ContentStatus.published, deletedAt: null },
                },
              },
            },
          },
          distinct: ['marketCode'],
          select: { marketCode: true },
        })
      : [];
    await this.write({
      entityType: SearchEntityType.brand,
      entityId: brand.id,
      visible,
      marketCodes: markets.map((m) => m.marketCode).sort(),
      slug: brand.slug,
      imageUrl: this.media.image(brand.logoAsset, 'en')?.url ?? null,
      boost: 1.5,
      publishedAt: brand.updatedAt,
      text: (lang) => ({
        title: nameIn(lang, brand.nameAr, brand.nameEn),
        subtitle: brand.countryCode,
        body: (lang === 'en' ? brand.descriptionEn : brand.descriptionAr)?.slice(0, 2000) ?? null,
        keywords: [brand.nameEn, brand.nameAr, brand.slug].join(' '),
      }),
    });
  }

  private async write(doc: DocInput): Promise<void> {
    if (!doc.visible || doc.marketCodes.length === 0) {
      await this.remove(doc.entityType, [doc.entityId]);
      return;
    }
    for (const locale of LOCALES) {
      const t = doc.text(locale);
      const data = {
        marketCodes: doc.marketCodes,
        title: t.title.slice(0, 500),
        subtitle: t.subtitle?.slice(0, 500) ?? null,
        body: t.body,
        keywords: t.keywords,
        slug: doc.slug,
        imageUrl: doc.imageUrl,
        isPublished: true,
        boost: doc.boost,
        publishedAt: doc.publishedAt,
      };
      await this.prisma.searchDocument.upsert({
        where: {
          entityType_entityId_locale: {
            entityType: doc.entityType,
            entityId: doc.entityId,
            locale,
          },
        },
        create: { entityType: doc.entityType, entityId: doc.entityId, locale, ...data },
        update: data,
      });
    }
  }

  private async remove(entityType: SearchEntityType, ids: string[]): Promise<void> {
    await this.prisma.searchDocument.deleteMany({ where: { entityType, entityId: { in: ids } } });
  }

  private async safe(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn({ err }, `Search index update failed for ${what}`);
    }
  }
}
