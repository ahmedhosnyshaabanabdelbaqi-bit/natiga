import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest, type PageRequest } from '../../../common/http/pagination';
import type { Prisma } from '../../../generated/prisma/client';
import { MarketAvailability, type PriceType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  LISTED_AVAILABILITIES,
  MODEL_PAGE_AVAILABILITIES,
  NOT_AVAILABLE_LABEL,
} from '../common/catalog-constants';
import { CatalogErrors } from '../common/catalog-errors';
import { IMAGE_ASSET_INCLUDE, MediaUrlService, type ImageAsset } from '../common/media-urls';
import { nameIn, pick, textIn, toIso, toIsoDate, toNum } from '../common/values';
import {
  chargingTimeView,
  consumptionView,
  curveView,
  inletView,
  inScope,
  pickCurrentPrice,
  PRICE_TYPE_LABELS,
  priceView,
  rangeView,
  sortPriceHistory,
  sortRanges,
  sourceView,
} from '../common/views';
import { PUBLIC_BRAND_WHERE, PUBLIC_MODEL_WHERE, PUBLIC_VARIANT_WHERE } from '../common/visibility';
import type {
  BrandDetailDto,
  BrandListQueryDto,
  BrandRefDto,
  BrandSummaryDto,
  CarCardDto,
  CarDetailDto,
  CarListQueryDto,
  GenerationViewDto,
  MarketRefDto,
  PriceSummaryDto,
  RangeSpanDto,
  VariantKeyFactsDto,
  VariantSheetDto,
  VariantSummaryDto,
} from '../dto/public.dto';
import type { ImageDto, SourceSummaryDto } from '../dto/shared.dto';
import { CatalogQueryService, isUuid, type ModelMatch } from './catalog-query.service';
import { MarketContextService, type MarketCtx } from './market-context';
import { RelatedContentService } from './related-content.service';
import { buildSpecGroups, numOf, pointsByKey, scopeSpecs, specPoint } from './spec-sheet';

const K = {
  usable: 'battery.usable_kwh',
  gross: 'battery.gross_kwh',
  powerKw: 'performance.power_kw',
  powerHp: 'performance.power_hp',
  torque: 'performance.torque_nm',
  accel: 'performance.accel_0_100_s',
  ac: 'charging.ac_max_kw',
  dc: 'charging.dc_peak_kw',
} as const;
const KEY_FACT_KEYS = Object.values(K);

const MEDIA_INCLUDE = {
  include: { asset: { include: IMAGE_ASSET_INCLUDE } },
  orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
} satisfies Prisma.CarModel$mediaArgs;

const BRAND_INCLUDE = {
  logoAsset: { include: IMAGE_ASSET_INCLUDE },
} satisfies Prisma.BrandInclude;

const MODEL_MEDIA_INCLUDE = {
  brand: { include: BRAND_INCLUDE },
  heroAsset: { include: IMAGE_ASSET_INCLUDE },
  media: MEDIA_INCLUDE,
  generations: {
    where: { deletedAt: null },
    orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
    include: { media: MEDIA_INCLUDE },
  },
} satisfies Prisma.CarModelInclude;

type ModelWithMedia = Prisma.CarModelGetPayload<{ include: typeof MODEL_MEDIA_INCLUDE }>;
type MediaRow = { asset: ImageAsset; captionAr: string | null; captionEn: string | null };

const SCOPED = (market: string) => ({ OR: [{ marketCode: null }, { marketCode: market }] });

const CARD_VARIANT_SELECT = (market: string) =>
  ({
    id: true,
    powertrainType: true,
    modelYear: { select: { year: true, generation: { select: { modelId: true } } } },
    markets: { where: { marketCode: market }, select: { availability: true } },
    prices: {
      where: { marketCode: market },
      select: {
        id: true,
        amount: true,
        currencyCode: true,
        priceType: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
      },
    },
    rangeMeasurements: {
      where: SCOPED(market),
      select: { cycle: true, rangeType: true, valueKm: true },
    },
    specifications: {
      where: { specKey: { in: [K.usable, K.dc] }, ...SCOPED(market) },
      select: {
        specKey: true,
        marketCode: true,
        valueNum: true,
        valueText: true,
        valueBool: true,
        unit: true,
        originalValue: true,
        originalUnit: true,
        reliability: true,
        verifiedAt: true,
      },
    },
  }) satisfies Prisma.VehicleVariantSelect;

type CardVariant = Prisma.VehicleVariantGetPayload<{
  select: ReturnType<typeof CARD_VARIANT_SELECT>;
}>;

interface PriceLike {
  id?: string;
  amount: { toFixed: (n: number) => string; toString: () => string };
  currencyCode: string;
  priceType: PriceType;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

const AVAILABILITY_RANK: Record<string, number> = {
  available: 0,
  coming_soon: 1,
  discontinued: 2,
  unknown: 3,
  not_available: 4,
};

function spans(rows: { cycle: string; rangeType: string; valueKm: unknown }[]): RangeSpanDto[] {
  const map = new Map<string, RangeSpanDto>();
  for (const r of rows) {
    const km = toNum(String(r.valueKm));
    if (km === null) continue;
    const key = `${r.rangeType}/${r.cycle}`;
    const s = map.get(key);
    if (!s) map.set(key, { cycle: r.cycle, rangeType: r.rangeType, minKm: km, maxKm: km });
    else {
      s.minKm = Math.min(s.minKm, km);
      s.maxKm = Math.max(s.maxKm, km);
    }
  }
  return sortRanges([...map.values()].map((s) => ({ ...s, valueKm: s.maxKm }))).map(
    ({ valueKm: _v, ...s }) => s,
  );
}

/**
 * Public car pages: brand list/detail, the catalog list (cards), the model
 * page, the variant spec sheet and competitors. Everything is scoped to the
 * request market (listing, local names, prices, inlets, tours) and language.
 */
@Injectable()
export class CarPagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly markets: MarketContextService,
    private readonly query: CatalogQueryService,
    private readonly related: RelatedContentService,
  ) {}

  // ------------------------------------------------------------------ helpers

  brandRef(
    b: Prisma.BrandGetPayload<{ include: typeof BRAND_INCLUDE }>,
    lang: SupportedLanguage,
  ): BrandRefDto {
    return {
      id: b.id,
      slug: b.slug,
      name: nameIn(lang, b.nameAr, b.nameEn),
      logo: this.media.image(b.logoAsset, lang),
    };
  }

  private mediaImages(rows: MediaRow[], lang: SupportedLanguage): ImageDto[] {
    return rows
      .map((m) => this.media.image(m.asset, lang, { ar: m.captionAr, en: m.captionEn }))
      .filter((i): i is ImageDto => i !== null);
  }

  /** Hero, model gallery, then generation galleries (newest generation first), de-duplicated. */
  private modelImages(m: ModelWithMedia, lang: SupportedLanguage): ImageDto[] {
    const all = [
      this.media.image(m.heroAsset, lang),
      ...this.mediaImages(m.media, lang),
      ...m.generations.flatMap((g) => this.mediaImages(g.media, lang)),
    ].filter((i): i is ImageDto => i !== null);
    const seen = new Set<string>();
    return all.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }

  private priceSummary(
    p: PriceLike & { variantId: string },
    lang: SupportedLanguage,
    market: MarketCtx,
  ): PriceSummaryDto {
    return {
      amount: { amount: p.amount.toFixed(market.currencyDecimals), currency: p.currencyCode },
      priceType: p.priceType,
      priceTypeLabel: pick(
        lang,
        PRICE_TYPE_LABELS[p.priceType].ar,
        PRICE_TYPE_LABELS[p.priceType].en,
      ),
      effectiveFrom: toIsoDate(p.effectiveFrom) as string,
      variantId: p.variantId,
    };
  }

  /** Lowest and highest CURRENT local-currency price among trims. */
  private priceRange(
    variants: { id: string; prices: PriceLike[] }[],
    market: MarketCtx,
    lang: SupportedLanguage,
  ): { from: PriceSummaryDto | null; to: PriceSummaryDto | null } {
    const current = variants
      .map((v) => {
        const local = v.prices.filter((p) => p.currencyCode === market.currencyCode);
        const p = pickCurrentPrice(local, market.today, market.currencyCode);
        return p ? { ...p, variantId: v.id } : null;
      })
      .filter((p): p is PriceLike & { variantId: string } => p !== null);
    if (current.length === 0) return { from: null, to: null };
    current.sort((a, b) => Number(a.amount.toString()) - Number(b.amount.toString()));
    return {
      from: this.priceSummary(current[0], lang, market),
      to: this.priceSummary(current[current.length - 1], lang, market),
    };
  }

  private async marketRefs(
    codes: Map<string, string>,
    lang: SupportedLanguage,
  ): Promise<MarketRefDto[]> {
    const all = await this.markets.all();
    return [...codes.entries()]
      .filter(([code]) => all.get(code)?.enabled)
      .sort(([a], [b]) => (all.get(a)?.sortOrder ?? 0) - (all.get(b)?.sortOrder ?? 0))
      .map(([code, availability]) => ({
        code,
        name: this.markets.name(all.get(code), code, lang),
        availability,
      }));
  }

  // ------------------------------------------------------------------ cards

  async cards(
    matches: ModelMatch[],
    market: MarketCtx,
    lang: SupportedLanguage,
  ): Promise<CarCardDto[]> {
    if (matches.length === 0) return [];
    const variantIds = matches.flatMap((m) => m.variantIds);
    const [models, variants, withTours] = await Promise.all([
      this.prisma.carModel.findMany({
        where: { id: { in: matches.map((m) => m.modelId) } },
        include: MODEL_MEDIA_INCLUDE,
      }),
      this.prisma.vehicleVariant.findMany({
        where: { id: { in: variantIds } },
        select: CARD_VARIANT_SELECT(market.code),
      }),
      this.related.variantsWithTours(variantIds, market.code),
    ]);
    const modelById = new Map(models.map((m) => [m.id, m]));
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const out: CarCardDto[] = [];
    for (const match of matches) {
      const m = modelById.get(match.modelId);
      if (!m) continue;
      const vs = match.variantIds
        .map((id) => variantById.get(id))
        .filter((v): v is CardVariant => Boolean(v));
      out.push(this.card(m, vs, withTours, market, lang));
    }
    return out;
  }

  private card(
    m: ModelWithMedia,
    vs: CardVariant[],
    withTours: Set<string>,
    market: MarketCtx,
    lang: SupportedLanguage,
  ): CarCardDto {
    const images = this.modelImages(m, lang);
    const { from, to } = this.priceRange(vs, market, lang);
    const keyNumbers = (key: string) =>
      vs
        .map((v) => {
          const row = scopeSpecs(v.specifications, market.code).get(key);
          return row ? numOf(specPoint(row)) : null;
        })
        .filter((n): n is number => n !== null);
    const usable = keyNumbers(K.usable);
    const dc = keyNumbers(K.dc);
    const availability =
      vs
        .map((v) => v.markets[0]?.availability ?? MarketAvailability.unknown)
        .sort((a, b) => AVAILABILITY_RANK[a] - AVAILABILITY_RANK[b])[0] ??
      MarketAvailability.unknown;
    const brandName = nameIn(lang, m.brand.nameAr, m.brand.nameEn);
    const modelName = nameIn(lang, m.nameAr, m.nameEn);
    return {
      id: m.id,
      slug: m.slug,
      title: `${brandName} ${modelName}`,
      name: modelName,
      nameAr: m.nameAr,
      nameEn: m.nameEn,
      brand: this.brandRef(m.brand, lang),
      bodyType: m.bodyType,
      segment: m.segment,
      image: images[0] ?? null,
      powertrainTypes: [...new Set(vs.map((v) => v.powertrainType))].sort(),
      modelYears: [...new Set(vs.map((v) => v.modelYear.year))].sort((a, b) => b - a),
      variantCount: vs.length,
      priceFrom: from,
      priceTo: to,
      ranges: spans(vs.flatMap((v) => v.rangeMeasurements)),
      usableBatteryKwh: usable.length
        ? { min: Math.min(...usable), max: Math.max(...usable) }
        : null,
      maxDcPeakKw: dc.length ? Math.max(...dc) : null,
      hasTour: vs.some((v) => withTours.has(v.id)),
      availability,
      isDemo: m.isDemo,
    };
  }

  // ------------------------------------------------------------------ brands

  async listBrands(q: BrandListQueryDto, marketCode: string, lang: SupportedLanguage) {
    const page = toPageRequest(q);
    const counts = await this.query.carCountsByBrand(marketCode);
    const where: Prisma.BrandWhereInput = {
      ...PUBLIC_BRAND_WHERE,
      ...(q.hasCars
        ? { id: { in: [...counts.entries()].filter(([, n]) => n > 0).map(([id]) => id) } }
        : {}),
      ...(q.q
        ? {
            OR: [
              { nameEn: { contains: q.q, mode: 'insensitive' } },
              { nameAr: { contains: q.q, mode: 'insensitive' } },
              { slug: { contains: q.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        include: BRAND_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, lang === 'en' ? { nameEn: 'asc' } : { nameAr: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.brand.count({ where }),
    ]);
    const items: BrandSummaryDto[] = rows.map((b) => ({
      ...this.brandRef(b, lang),
      nameAr: b.nameAr,
      nameEn: b.nameEn,
      countryCode: b.countryCode,
      carCount: counts.get(b.id) ?? 0,
      isDemo: b.isDemo,
    }));
    return { items, total, page };
  }

  async brandDetail(
    ref: string,
    marketCode: string,
    lang: SupportedLanguage,
  ): Promise<BrandDetailDto> {
    const b = await this.prisma.brand.findFirst({
      where: {
        ...PUBLIC_BRAND_WHERE,
        ...(isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() }),
      },
      include: BRAND_INCLUDE,
    });
    if (!b) throw CatalogErrors.notFound('brand');
    const market = await this.markets.get(marketCode);
    const models = await this.prisma.carModel.findMany({
      where: { ...PUBLIC_MODEL_WHERE, brandId: b.id },
      include: MODEL_MEDIA_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    const listed = await this.query.listedVariantsByModel(
      models.map((m) => m.id),
      market.code,
    );
    const inMarket = models.filter((m) => (listed.get(m.id) ?? []).length > 0);
    const cars = await this.cards(
      inMarket.map((m) => ({ modelId: m.id, variantIds: listed.get(m.id)! })),
      market,
      lang,
    );
    const elsewhere = models.filter((m) => !listed.has(m.id));
    const elsewhereMarkets = await this.marketsOfModels(elsewhere.map((m) => m.id));
    return {
      ...this.brandRef(b, lang),
      nameAr: b.nameAr,
      nameEn: b.nameEn,
      countryCode: b.countryCode,
      carCount: cars.length,
      isDemo: b.isDemo,
      description: textIn(lang, b.descriptionAr, b.descriptionEn),
      websiteUrl: b.websiteUrl,
      cars,
      notInMarket: elsewhere
        .map((m) => ({
          id: m.id,
          slug: m.slug,
          name: nameIn(lang, m.nameAr, m.nameEn),
          image: this.modelImages(m, lang)[0] ?? null,
          marketCodes: elsewhereMarkets.get(m.id) ?? [],
        }))
        .filter((m) => m.marketCodes.length > 0),
    };
  }

  /** Markets (listed) of public trims per model. */
  private async marketsOfModels(modelIds: string[]): Promise<Map<string, string[]>> {
    if (modelIds.length === 0) return new Map();
    const rows = await this.prisma.variantMarket.findMany({
      where: {
        availability: { in: LISTED_AVAILABILITIES },
        variant: {
          ...PUBLIC_VARIANT_WHERE,
          modelYear: { generation: { deletedAt: null, modelId: { in: modelIds } } },
        },
      },
      select: {
        marketCode: true,
        variant: {
          select: { modelYear: { select: { generation: { select: { modelId: true } } } } },
        },
      },
    });
    const out = new Map<string, Set<string>>();
    for (const r of rows) {
      const id = r.variant.modelYear.generation.modelId;
      const set = out.get(id) ?? new Set<string>();
      set.add(r.marketCode);
      out.set(id, set);
    }
    return new Map([...out.entries()].map(([k, v]) => [k, [...v].sort()]));
  }

  // ------------------------------------------------------------------ catalog list

  async listCars(
    q: CarListQueryDto,
    marketCode: string,
    lang: SupportedLanguage,
  ): Promise<{ items: CarCardDto[]; total: number; page: PageRequest; market: MarketCtx }> {
    const page = toPageRequest(q);
    const market = await this.markets.get(marketCode);
    const { items, total } = await this.query.listModels(q, market, lang, page);
    return { items: await this.cards(items, market, lang), total, page, market };
  }

  // ------------------------------------------------------------------ model page

  private async publicModel(ref: string): Promise<{ id: string }> {
    const m = await this.prisma.carModel.findFirst({
      where: {
        ...PUBLIC_MODEL_WHERE,
        ...(isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() }),
      },
      select: { id: true },
    });
    if (!m) throw CatalogErrors.notFound('model');
    return m;
  }

  async competitorCards(
    modelId: string,
    market: MarketCtx,
    lang: SupportedLanguage,
  ): Promise<CarCardDto[]> {
    const rows = await this.prisma.modelCompetitor.findMany({
      where: { OR: [{ modelId }, { competitorModelId: modelId }] },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    // Curated order first ("X competes with"), then models that list X.
    const ids: string[] = [];
    for (const r of [
      ...rows.filter((r) => r.modelId === modelId),
      ...rows.filter((r) => r.modelId !== modelId),
    ]) {
      const other = r.modelId === modelId ? r.competitorModelId : r.modelId;
      if (!ids.includes(other)) ids.push(other);
    }
    const listed = await this.query.listedVariantsByModel(ids, market.code);
    return this.cards(
      ids
        .filter((id) => listed.has(id))
        .map((id) => ({ modelId: id, variantIds: listed.get(id)! })),
      market,
      lang,
    );
  }

  async competitors(
    ref: string,
    marketCode: string,
    lang: SupportedLanguage,
  ): Promise<CarCardDto[]> {
    const m = await this.publicModel(ref);
    return this.competitorCards(m.id, await this.markets.get(marketCode), lang);
  }

  async carDetail(ref: string, marketCode: string, lang: SupportedLanguage): Promise<CarDetailDto> {
    const { id } = await this.publicModel(ref);
    const market = await this.markets.get(marketCode);
    const m = await this.prisma.carModel.findUniqueOrThrow({
      where: { id },
      include: {
        ...MODEL_MEDIA_INCLUDE,
        generations: {
          where: { deletedAt: null },
          orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
          include: {
            media: MEDIA_INCLUDE,
            modelYears: {
              orderBy: { year: 'desc' },
              include: {
                variants: {
                  where: { status: 'published', deletedAt: null },
                  orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
                  include: {
                    markets: true,
                    prices: { where: { marketCode: market.code }, include: { source: true } },
                    rangeMeasurements: { where: SCOPED(market.code) },
                    specifications: {
                      where: { specKey: { in: KEY_FACT_KEYS }, ...SCOPED(market.code) },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const allVariants = m.generations.flatMap((g) => g.modelYears.flatMap((y) => y.variants));
    const listedHere = (v: (typeof allVariants)[number]) =>
      v.markets.find(
        (x) => x.marketCode === market.code && MODEL_PAGE_AVAILABILITIES.includes(x.availability),
      );
    const shown = allVariants.filter(listedHere);
    const shownIds = shown.map((v) => v.id);
    const listedIds = shown
      .filter((v) => LISTED_AVAILABILITIES.includes(listedHere(v)!.availability))
      .map((v) => v.id);

    const availableMarkets = new Map<string, string>();
    for (const v of allVariants) {
      for (const vm of v.markets) {
        if (!LISTED_AVAILABILITIES.includes(vm.availability)) continue;
        const prev = availableMarkets.get(vm.marketCode);
        if (!prev || AVAILABILITY_RANK[vm.availability] < AVAILABILITY_RANK[prev]) {
          availableMarkets.set(vm.marketCode, vm.availability);
        }
      }
    }

    const [withTours, tours, competitors, relatedArticles, marketRefs] = await Promise.all([
      this.related.variantsWithTours(shownIds, market.code),
      this.related.toursSummary(shownIds, market.code, lang),
      this.competitorCards(m.id, market, lang),
      this.related.articles(
        { variantIds: allVariants.map((v) => v.id), modelId: m.id },
        market.code,
        lang,
      ),
      this.marketRefs(availableMarkets, lang),
    ]);

    const summary = (v: (typeof allVariants)[number], year: number): VariantSummaryDto => {
      const vm = listedHere(v)!;
      const points = pointsByKey(v.specifications, market.code);
      const current = pickCurrentPrice(v.prices, market.today, market.currencyCode);
      return {
        id: v.id,
        slug: v.slug,
        name: nameIn(lang, v.nameAr, v.nameEn),
        localName: textIn(lang, vm.localNameAr, vm.localNameEn),
        trimCode: v.trimCode,
        powertrainType: v.powertrainType,
        bodyType: v.bodyType ?? m.bodyType,
        driveType: v.driveType,
        seats: v.seats,
        modelYear: year,
        availability: vm.availability,
        currentPrice: current
          ? priceView(current, lang, market.today, market.currencyCode, market.currencyDecimals)
          : null,
        keyFacts: this.keyFactsSummary(points, v.rangeMeasurements),
        hasTour: withTours.has(v.id),
        isDemo: v.isDemo,
      };
    };

    const generations: GenerationViewDto[] = m.generations
      .map((g) => ({
        id: g.id,
        slug: g.slug,
        name: nameIn(lang, g.nameAr, g.nameEn),
        code: g.code,
        startYear: g.startYear,
        endYear: g.endYear,
        years: g.modelYears
          .map((y) => ({
            id: y.id,
            year: y.year,
            variants: y.variants.filter(listedHere).map((v) => summary(v, y.year)),
          }))
          .filter((y) => y.variants.length > 0),
      }))
      .filter((g) => g.years.length > 0);

    const flat = generations.flatMap((g) => g.years.flatMap((y) => y.variants));
    const defaultVariant =
      flat.find((v) => v.availability === MarketAvailability.available) ?? flat[0] ?? null;
    const { from, to } = this.priceRange(
      shown.filter((v) => listedIds.includes(v.id)),
      market,
      lang,
    );
    const images = this.modelImages(m, lang);
    const brandName = nameIn(lang, m.brand.nameAr, m.brand.nameEn);
    const modelName = nameIn(lang, m.nameAr, m.nameEn);
    return {
      id: m.id,
      slug: m.slug,
      title: `${brandName} ${modelName}`,
      name: modelName,
      nameAr: m.nameAr,
      nameEn: m.nameEn,
      description: textIn(lang, m.descriptionAr, m.descriptionEn),
      bodyType: m.bodyType,
      segment: m.segment,
      brand: this.brandRef(m.brand, lang),
      heroImage: images[0] ?? null,
      images,
      marketCode: market.code,
      availableInMarket: listedIds.length > 0,
      availableMarkets: marketRefs,
      powertrainTypes: [...new Set(shown.map((v) => v.powertrainType))].sort(),
      priceFrom: from,
      priceTo: to,
      generations,
      defaultVariantId: defaultVariant?.id ?? null,
      tours,
      competitors,
      relatedArticles,
      isDemo: m.isDemo,
      notAvailableLabel: NOT_AVAILABLE_LABEL[lang],
    };
  }

  private keyFactsSummary(
    points: ReturnType<typeof pointsByKey>,
    ranges: { cycle: string; rangeType: string; valueKm: unknown }[],
  ): VariantKeyFactsDto {
    return {
      usableBatteryKwh: numOf(points.get(K.usable)),
      grossBatteryKwh: numOf(points.get(K.gross)),
      powerKw: numOf(points.get(K.powerKw)),
      accel0100S: numOf(points.get(K.accel)),
      acMaxKw: numOf(points.get(K.ac)),
      dcPeakKw: numOf(points.get(K.dc)),
      ranges: spans(ranges),
    };
  }

  // ------------------------------------------------------------------ variant sheet

  /**
   * Full spec sheet of a public trim in a market. `opts.related = false`
   * skips related articles and competitors (e.g. for comparisons, which
   * load several sheets at once); tours are always included.
   */
  async variantSheet(
    variantRef: string,
    marketCode: string,
    lang: SupportedLanguage,
    modelRef?: string,
    opts: { related?: boolean } = {},
  ): Promise<VariantSheetDto> {
    const withRelated = opts.related ?? true;
    const found = await this.prisma.vehicleVariant.findFirst({
      where: {
        ...PUBLIC_VARIANT_WHERE,
        ...(isUuid(variantRef) ? { id: variantRef } : { slug: variantRef.toLowerCase() }),
      },
      select: {
        id: true,
        modelYear: {
          select: { generation: { select: { model: { select: { id: true, slug: true } } } } },
        },
      },
    });
    if (!found) throw CatalogErrors.notFound('variant');
    const model = found.modelYear.generation.model;
    if (modelRef && modelRef !== model.id && modelRef.toLowerCase() !== model.slug) {
      throw CatalogErrors.notFound('variant');
    }
    const market = await this.markets.get(marketCode);
    const [v, defs] = await Promise.all([
      this.prisma.vehicleVariant.findUniqueOrThrow({
        where: { id: found.id },
        include: {
          modelYear: {
            include: {
              generation: {
                include: {
                  media: MEDIA_INCLUDE,
                  model: {
                    include: {
                      brand: { include: BRAND_INCLUDE },
                      heroAsset: { include: IMAGE_ASSET_INCLUDE },
                      media: MEDIA_INCLUDE,
                    },
                  },
                },
              },
            },
          },
          markets: {
            include: {
              source: true,
              inlets: {
                include: { source: true, connectorType: true },
                orderBy: [{ currentType: 'asc' }, { connectorTypeCode: 'asc' }],
              },
            },
          },
          specifications: { where: SCOPED(market.code), include: { source: true } },
          rangeMeasurements: { where: SCOPED(market.code), include: { source: true } },
          consumptionMeasurements: {
            where: SCOPED(market.code),
            include: { source: true },
            orderBy: [{ kind: 'asc' }, { cycle: 'asc' }],
          },
          chargingCurves: {
            include: { source: true, points: true },
            orderBy: { createdAt: 'asc' },
          },
          chargingTimes: {
            include: { source: true },
            orderBy: [{ currentType: 'asc' }, { fromSoc: 'asc' }, { toSoc: 'asc' }],
          },
          prices: { where: { marketCode: market.code }, include: { source: true } },
          media: MEDIA_INCLUDE,
        },
      }),
      this.prisma.specDefinition.findMany(),
    ]);
    const g = v.modelYear.generation;
    const m = g.model;
    const vmHere = v.markets.find((x) => x.marketCode === market.code) ?? null;
    const offered = vmHere ? LISTED_AVAILABILITIES.includes(vmHere.availability) : false;

    const points = pointsByKey(v.specifications, market.code);
    const ranges = sortRanges(inScope(v.rangeMeasurements, market.code).map(rangeView));
    const consumption = v.consumptionMeasurements.map(consumptionView);
    const inlets = (vmHere?.inlets ?? []).map((i) => inletView(i, lang));
    const times = v.chargingTimes.map(chargingTimeView);
    const curves = v.chargingCurves.map(curveView);
    const history = sortPriceHistory(v.prices).map((p) =>
      priceView(p, lang, market.today, market.currencyCode, market.currencyDecimals),
    );
    const currentRow = pickCurrentPrice(v.prices, market.today, market.currencyCode);
    const current = currentRow ? (history.find((p) => p.id === currentRow.id) ?? null) : null;

    const listedMarkets = new Map<string, string>();
    for (const x of v.markets) {
      if (LISTED_AVAILABILITIES.includes(x.availability))
        listedMarkets.set(x.marketCode, x.availability);
    }
    const allMarkets = await this.markets.all();

    const images = (() => {
      const list = [
        ...this.mediaImages(v.media, lang),
        ...this.mediaImages(g.media, lang),
        this.media.image(m.heroAsset, lang),
        ...this.mediaImages(m.media, lang),
      ].filter((i): i is ImageDto => i !== null);
      const seen = new Set<string>();
      return list.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
    })();

    const [tours, relatedArticles, competitors, availableMarkets] = await Promise.all([
      this.related.toursSummary([v.id], market.code, lang),
      withRelated
        ? this.related.articles({ variantIds: [v.id], modelId: m.id }, market.code, lang)
        : Promise.resolve([]),
      withRelated ? this.competitorCards(m.id, market, lang) : Promise.resolve([]),
      this.marketRefs(listedMarkets, lang),
    ]);

    const sources = new Map<string, SourceSummaryDto>();
    const addSource = (s: SourceSummaryDto | null) => {
      if (s) sources.set(s.id, s);
    };
    for (const p of points.values()) addSource(p.source);
    [...ranges, ...consumption, ...inlets, ...times, ...curves, ...history].forEach((x) =>
      addSource(x.source),
    );
    const marketSource = sourceView(vmHere?.source ?? null);
    addSource(marketSource);

    const brandName = nameIn(lang, m.brand.nameAr, m.brand.nameEn);
    const modelName = nameIn(lang, m.nameAr, m.nameEn);
    const name = nameIn(lang, v.nameAr, v.nameEn);
    return {
      id: v.id,
      slug: v.slug,
      name,
      nameAr: v.nameAr,
      nameEn: v.nameEn,
      title: `${brandName} ${modelName} ${v.modelYear.year} ${name}`,
      trimCode: v.trimCode,
      powertrainType: v.powertrainType,
      bodyType: v.bodyType ?? m.bodyType,
      driveType: v.driveType,
      seats: v.seats,
      doors: v.doors,
      modelYear: v.modelYear.year,
      publishedAt: toIso(v.publishedAt),
      isDemo: v.isDemo,
      brand: this.brandRef(m.brand, lang),
      model: { id: m.id, slug: m.slug, name: modelName },
      generation: {
        id: g.id,
        slug: g.slug,
        name: nameIn(lang, g.nameAr, g.nameEn),
        code: g.code,
        startYear: g.startYear,
        endYear: g.endYear,
      },
      market: {
        code: market.code,
        name: this.markets.name(allMarkets.get(market.code), market.code, lang),
        currencyCode: market.currencyCode,
        offered,
        availability: vmHere?.availability ?? 'not_listed',
        localName: vmHere ? textIn(lang, vmHere.localNameAr, vmHere.localNameEn) : null,
        launchDate: toIsoDate(vmHere?.launchDate),
        discontinuedAt: toIsoDate(vmHere?.discontinuedAt),
        driveSide: vmHere?.driveSide ?? null,
        source: marketSource,
        verifiedAt: toIso(vmHere?.verifiedAt),
      },
      availableMarkets,
      images,
      price: { current, history },
      keyFacts: {
        usableBatteryKwh: points.get(K.usable) ?? null,
        grossBatteryKwh: points.get(K.gross) ?? null,
        powerKw: points.get(K.powerKw) ?? null,
        powerHp: points.get(K.powerHp) ?? null,
        torqueNm: points.get(K.torque) ?? null,
        accel0100S: points.get(K.accel) ?? null,
        acMaxKw: points.get(K.ac) ?? null,
        dcPeakKw: points.get(K.dc) ?? null,
        electricRanges: ranges.filter((r) => r.rangeType === 'electric'),
      },
      specGroups: buildSpecGroups(defs, points, lang),
      ranges,
      consumption,
      charging: { inlets, times, curves },
      tours,
      relatedArticles,
      competitors,
      sources: [...sources.values()],
      notAvailableLabel: NOT_AVAILABLE_LABEL[lang],
    };
  }
}
