import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LISTED_AVAILABILITIES } from '../common/catalog-constants';
import { CatalogErrors } from '../common/catalog-errors';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../common/media-urls';
import { nameIn, textIn } from '../common/values';
import { PUBLIC_BRAND_WHERE, PUBLIC_MODEL_WHERE, PUBLIC_VARIANT_WHERE } from '../common/visibility';
import type { PickerItemDto, PickerQueryDto, PickerResponseDto } from '../dto/public.dto';
import { isUuid } from './catalog-query.service';
import { MarketContextService } from './market-context';

const POWERTRAIN_LABEL: Record<string, { ar: string; en: string }> = {
  BEV: { ar: 'كهربائية', en: 'Electric' },
  PHEV: { ar: 'هجينة قابلة للشحن', en: 'Plug-in hybrid' },
  EREV: { ar: 'موسّع مدى', en: 'Range extender' },
  HEV: { ar: 'هجينة', en: 'Hybrid' },
};
const DRIVE_LABEL: Record<string, { ar: string; en: string }> = {
  fwd: { ar: 'دفع أمامي', en: 'FWD' },
  rwd: { ar: 'دفع خلفي', en: 'RWD' },
  awd: { ar: 'دفع رباعي', en: 'AWD' },
};

/**
 * Cascading pickers for comparisons and the garage:
 * brand → model → year → variant → market. `scope=market` (default) keeps
 * only trims listed in the request market; `scope=all` keeps any public trim
 * (e.g. an imported car). The market level lists the markets where the trim
 * has a record — the only (variant, market) pairs a comparison can use.
 */
@Injectable()
export class PickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly markets: MarketContextService,
  ) {}

  private variantScope(scope: 'market' | 'all', market: string): Prisma.VehicleVariantWhereInput {
    return scope === 'all'
      ? PUBLIC_VARIANT_WHERE
      : {
          ...PUBLIC_VARIANT_WHERE,
          markets: { some: { marketCode: market, availability: { in: LISTED_AVAILABILITIES } } },
        };
  }

  private ref(ref: string) {
    return isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() };
  }

  async pick(
    q: PickerQueryDto,
    market: string,
    lang: SupportedLanguage,
  ): Promise<PickerResponseDto> {
    const scope = q.scope ?? 'market';
    const base = { marketCode: market, scope };
    if (q.variant)
      return { ...base, level: 'market', items: await this.marketsOf(q.variant, lang) };
    if (q.model && q.year !== undefined) {
      return {
        ...base,
        level: 'variant',
        items: await this.variants(q.model, q.year, scope, market, lang),
      };
    }
    if (q.model) return { ...base, level: 'year', items: await this.years(q.model, scope, market) };
    if (q.brand)
      return { ...base, level: 'model', items: await this.models(q.brand, scope, market, lang) };
    return { ...base, level: 'brand', items: await this.brands(scope, market, lang) };
  }

  private async brands(scope: 'market' | 'all', market: string, lang: SupportedLanguage) {
    const variants = await this.prisma.vehicleVariant.findMany({
      where: this.variantScope(scope, market),
      select: {
        modelYear: {
          select: { generation: { select: { model: { select: { id: true, brandId: true } } } } },
        },
      },
    });
    const modelsByBrand = new Map<string, Set<string>>();
    for (const v of variants) {
      const m = v.modelYear.generation.model;
      const set = modelsByBrand.get(m.brandId) ?? new Set<string>();
      set.add(m.id);
      modelsByBrand.set(m.brandId, set);
    }
    const brands = await this.prisma.brand.findMany({
      where: { ...PUBLIC_BRAND_WHERE, id: { in: [...modelsByBrand.keys()] } },
      include: { logoAsset: { include: IMAGE_ASSET_INCLUDE } },
      orderBy: [{ sortOrder: 'asc' }, lang === 'en' ? { nameEn: 'asc' } : { nameAr: 'asc' }],
    });
    return brands.map((b): PickerItemDto => ({
      id: b.id,
      slug: b.slug,
      label: nameIn(lang, b.nameAr, b.nameEn),
      sublabel: null,
      imageUrl: this.media.image(b.logoAsset, lang)?.url ?? null,
      count: modelsByBrand.get(b.id)?.size ?? 0,
    }));
  }

  private async models(
    brandRef: string,
    scope: 'market' | 'all',
    market: string,
    lang: SupportedLanguage,
  ) {
    const brand = await this.prisma.brand.findFirst({
      where: { ...PUBLIC_BRAND_WHERE, ...this.ref(brandRef) },
    });
    if (!brand) throw CatalogErrors.notFound('brand');
    const models = await this.prisma.carModel.findMany({
      where: { ...PUBLIC_MODEL_WHERE, brandId: brand.id },
      include: {
        heroAsset: { include: IMAGE_ASSET_INCLUDE },
        generations: {
          where: { deletedAt: null },
          select: {
            modelYears: {
              select: {
                year: true,
                variants: { where: this.variantScope(scope, market), select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    return models
      .map((m) => {
        const years = new Set(
          m.generations.flatMap((g) =>
            g.modelYears.filter((y) => y.variants.length > 0).map((y) => y.year),
          ),
        );
        return {
          id: m.id,
          slug: m.slug,
          label: nameIn(lang, m.nameAr, m.nameEn),
          sublabel: nameIn(lang, brand.nameAr, brand.nameEn),
          imageUrl: this.media.image(m.heroAsset, lang)?.url ?? null,
          count: years.size,
        } satisfies PickerItemDto;
      })
      .filter((m) => m.count > 0);
  }

  private async publicModel(modelRef: string) {
    const model = await this.prisma.carModel.findFirst({
      where: { ...PUBLIC_MODEL_WHERE, ...this.ref(modelRef) },
      include: { brand: true, heroAsset: { include: IMAGE_ASSET_INCLUDE } },
    });
    if (!model) throw CatalogErrors.notFound('model');
    return model;
  }

  private async years(modelRef: string, scope: 'market' | 'all', market: string) {
    const model = await this.publicModel(modelRef);
    const variants = await this.prisma.vehicleVariant.findMany({
      where: {
        ...this.variantScope(scope, market),
        modelYear: { generation: { deletedAt: null, modelId: model.id } },
      },
      select: { modelYear: { select: { id: true, year: true } } },
    });
    const byYear = new Map<number, { ids: Set<string>; n: number }>();
    for (const v of variants) {
      const e = byYear.get(v.modelYear.year) ?? { ids: new Set<string>(), n: 0 };
      e.ids.add(v.modelYear.id);
      e.n += 1;
      byYear.set(v.modelYear.year, e);
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, e]): PickerItemDto => ({
        id: [...e.ids][0],
        slug: null,
        label: String(year),
        sublabel: null,
        imageUrl: null,
        count: e.n,
        year,
      }));
  }

  private async variants(
    modelRef: string,
    year: number,
    scope: 'market' | 'all',
    market: string,
    lang: SupportedLanguage,
  ) {
    const model = await this.publicModel(modelRef);
    const rows = await this.prisma.vehicleVariant.findMany({
      where: {
        ...this.variantScope(scope, market),
        modelYear: { year, generation: { deletedAt: null, modelId: model.id } },
      },
      include: { markets: true, modelYear: { select: { year: true } } },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    const all = await this.markets.all();
    const brandName = nameIn(lang, model.brand.nameAr, model.brand.nameEn);
    const modelName = nameIn(lang, model.nameAr, model.nameEn);
    const imageUrl = this.media.image(model.heroAsset, lang)?.url ?? null;
    return rows.map((v): PickerItemDto => {
      const here = v.markets.find((m) => m.marketCode === market);
      const name = nameIn(lang, v.nameAr, v.nameEn);
      const local = here ? textIn(lang, here.localNameAr, here.localNameEn) : null;
      return {
        id: v.id,
        slug: v.slug,
        label: local ?? name,
        sublabel: [
          POWERTRAIN_LABEL[v.powertrainType][lang],
          v.driveType ? DRIVE_LABEL[v.driveType][lang] : null,
        ]
          .filter(Boolean)
          .join(' · '),
        imageUrl,
        count: v.markets.length,
        powertrainType: v.powertrainType,
        modelYear: v.modelYear.year,
        modelId: model.id,
        modelSlug: model.slug,
        title: `${brandName} ${modelName} ${v.modelYear.year} ${name}`,
        markets: v.markets
          .filter((m) => all.get(m.marketCode)?.enabled)
          .map((m) => ({ code: m.marketCode, availability: m.availability })),
      };
    });
  }

  private async marketsOf(variantRef: string, lang: SupportedLanguage) {
    const v = await this.prisma.vehicleVariant.findFirst({
      where: { ...PUBLIC_VARIANT_WHERE, ...this.ref(variantRef) },
      include: { markets: true },
    });
    if (!v) throw CatalogErrors.notFound('variant');
    const all = await this.markets.all();
    const rank = (a: string) => (LISTED_AVAILABILITIES.includes(a as never) ? 0 : 1);
    return v.markets
      .filter((m) => all.get(m.marketCode)?.enabled)
      .sort(
        (a, b) =>
          rank(a.availability) - rank(b.availability) ||
          (all.get(a.marketCode)?.sortOrder ?? 0) - (all.get(b.marketCode)?.sortOrder ?? 0),
      )
      .map((m): PickerItemDto => {
        const info = all.get(m.marketCode);
        return {
          id: m.marketCode,
          slug: null,
          label: this.markets.name(info, m.marketCode, lang),
          sublabel: null,
          imageUrl: null,
          count: null,
          availability: m.availability,
          localName: textIn(lang, m.localNameAr, m.localNameEn),
          currencyCode: info?.currencyCode ?? '',
        };
      });
  }
}
