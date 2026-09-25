import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fieldErrors } from '../comparisons/common/errors';
import { carKey } from '../comparisons/engine/facts';
import type { CarFacts } from '../comparisons/engine/types';
import {
  NO_SPONSOR_DISCLOSURE,
  NOT_AVAILABLE,
} from '../comparisons/services/comparison-compute.service';
import {
  IMAGE_ASSET_INCLUDE,
  MarketContextService,
  MediaUrlService,
  pickCurrentPrice,
  pointsByKey,
  priceView,
  rangeView,
  variantsInMarketWhere,
} from '../vehicles';
// Pure row → view mappers of the vehicles module not re-exported by its index.
import { consumptionView, inletView } from '../vehicles/common/views';
import {
  DEFAULT_POWERTRAINS,
  type RecommendationCarDto,
  type RecommendationRequestDto,
  type RecommendationResultDto,
} from './dto/recommendation.dto';
import { recommend } from './engine/recommend';
import { FACTORS, type Candidate } from './engine/types';

/** Spec keys the factors read (market row first, then the global row). */
const SPEC_KEYS = [
  'charging.dc_peak_kw',
  'charging.ac_max_kw',
  'practicality.trunk_l',
  'performance.accel_0_100_s',
];
/** Upper bound of trims considered in one market (the list is loaded once per request). */
const MAX_CANDIDATES = 2000;
/** Not-ranked cars returned (the rest are only counted). */
const MAX_NOT_RANKED = 30;

const scoped = (market: string) => ({ OR: [{ marketCode: null }, { marketCode: market }] });

const candidateInclude = (market: string) =>
  ({
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
                bodyType: true,
                heroAsset: { include: IMAGE_ASSET_INCLUDE },
                brand: {
                  select: {
                    id: true,
                    slug: true,
                    nameAr: true,
                    nameEn: true,
                    logoAsset: { include: IMAGE_ASSET_INCLUDE },
                  },
                },
              },
            },
          },
        },
      },
    },
    markets: {
      where: { marketCode: market },
      include: { inlets: { include: { source: true, connectorType: true } } },
    },
    specifications: {
      where: { specKey: { in: SPEC_KEYS }, ...scoped(market) },
      include: { source: true },
    },
    rangeMeasurements: {
      where: { rangeType: 'electric', ...scoped(market) },
      include: { source: true },
    },
    consumptionMeasurements: {
      where: { kind: 'electricity', ...scoped(market) },
      include: { source: true },
    },
    prices: { where: { marketCode: market }, include: { source: true } },
  }) satisfies Prisma.VehicleVariantInclude;

type CandidateRow = Prisma.VehicleVariantGetPayload<{
  include: ReturnType<typeof candidateInclude>;
}>;

const nameIn = (lang: SupportedLanguage, ar: string, en: string): string =>
  (lang === 'en' ? en || ar : ar || en).trim();

/**
 * Explainable recommendations by usage, budget and home charging
 * (REQUIREMENTS §7). Stateless (nothing is stored). Loads the trims listed
 * in the market once, turns them into the same canonical facts the
 * comparison engine uses, and ranks them with the pure engine. Ads and
 * sponsorship are never read here.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketContextService,
    private readonly media: MediaUrlService,
  ) {}

  async recommend(
    dto: RecommendationRequestDto,
    requestMarket: string,
    lang: SupportedLanguage,
  ): Promise<RecommendationResultDto> {
    const code = dto.market ?? requestMarket;
    const all = await this.markets.all();
    if (!all.get(code)?.enabled) {
      throw fieldErrors([
        {
          field: 'market',
          rule: 'unknownMarket',
          message: { ar: 'السوق غير معروف أو غير مفعّل.', en: 'Unknown or disabled market.' },
        },
      ]);
    }
    if (dto.weights && FACTORS.every((f) => (dto.weights?.[f] ?? 1) === 0)) {
      throw fieldErrors([
        {
          field: 'weights',
          rule: 'allZero',
          message: {
            ar: 'يجب أن يكون لعامل واحد على الأقل وزن أكبر من صفر.',
            en: 'At least one factor needs a weight above 0.',
          },
        },
      ]);
    }
    const market = await this.markets.get(code);
    const rows = await this.prisma.vehicleVariant.findMany({
      where: variantsInMarketWhere(code),
      include: candidateInclude(code),
      orderBy: [{ id: 'asc' }],
      take: MAX_CANDIDATES,
    });

    const cars = new Map<string, RecommendationCarDto>();
    const candidates: Candidate[] = rows.map((v) => {
      const { facts, car } = this.toCandidate(
        v,
        code,
        market.currencyCode,
        market.today,
        market.currencyDecimals,
        lang,
      );
      cars.set(facts.key, car);
      return { facts, bodyType: car.bodyType };
    });

    const powertrains = dto.powertrains?.length ? dto.powertrains : DEFAULT_POWERTRAINS;
    const result = recommend(
      candidates,
      {
        budget: dto.budget,
        currency: market.currencyCode,
        dailyKm: dto.dailyKm,
        longTripsPerMonth: dto.longTripsPerMonth,
        homeCharging: dto.homeCharging,
        seatsNeeded: dto.seatsNeeded,
        bodyTypes: dto.bodyTypes?.length ? dto.bodyTypes : null,
        powertrains,
        weights: dto.weights,
        limit: dto.limit ?? 10,
      },
      lang,
    );

    return {
      market: {
        code,
        name: this.markets.name(all.get(code), code, lang),
        currencyCode: market.currencyCode,
      },
      input: {
        budget: {
          amount: dto.budget.toFixed(market.currencyDecimals),
          currency: market.currencyCode,
        },
        dailyKm: dto.dailyKm,
        longTripsPerMonth: dto.longTripsPerMonth,
        homeCharging: dto.homeCharging,
        seatsNeeded: dto.seatsNeeded,
        bodyTypes: dto.bodyTypes?.length ? dto.bodyTypes : null,
        powertrains,
      },
      weights: result.weights,
      weightNotes: result.weightNotes,
      basis: result.basis,
      decision: result.decision,
      ranked: result.ranked.map((r) => ({ ...r, car: cars.get(r.key)! })),
      notRanked: result.notRanked
        .slice(0, MAX_NOT_RANKED)
        .map((n) => ({ ...n, car: cars.get(n.key)! })),
      excluded: result.excluded,
      factorAvailability: result.factorAvailability,
      candidatesConsidered: result.candidatesConsidered,
      notes: result.notes,
      sponsored: false,
      disclosure: NO_SPONSOR_DISCLOSURE[lang],
      notAvailableLabel: NOT_AVAILABLE[lang],
      generatedAt: new Date().toISOString(),
    };
  }

  private toCandidate(
    v: CandidateRow,
    market: string,
    currency: string,
    today: string,
    decimals: number,
    lang: SupportedLanguage,
  ): { facts: CarFacts; car: RecommendationCarDto } {
    const m = v.modelYear.generation.model;
    const vm = v.markets[0];
    const current = pickCurrentPrice(v.prices, today, currency);
    const price = current ? priceView(current, lang, today, currency, decimals) : null;
    const key = carKey(v.id, market);
    const facts: CarFacts = {
      key,
      powertrainType: v.powertrainType,
      seats: v.seats,
      doors: v.doors,
      driveType: v.driveType,
      marketCurrency: currency,
      price,
      ranges: v.rangeMeasurements.map(rangeView),
      consumption: v.consumptionMeasurements.map(consumptionView),
      chargingTimes: [],
      inlets: (vm?.inlets ?? []).map((i) => inletView(i, lang)),
      specs: pointsByKey(v.specifications, market),
    };
    const brand = nameIn(lang, m.brand.nameAr, m.brand.nameEn);
    const model = nameIn(lang, m.nameAr, m.nameEn);
    const name = nameIn(lang, v.nameAr, v.nameEn);
    return {
      facts,
      car: {
        key,
        variantId: v.id,
        variantSlug: v.slug,
        modelYearId: v.modelYearId,
        modelYear: v.modelYear.year,
        title: `${brand} ${model} ${v.modelYear.year} ${name}`,
        name,
        brand: {
          id: m.brand.id,
          slug: m.brand.slug,
          name: brand,
          logo: this.media.image(m.brand.logoAsset, lang),
        },
        model: { id: m.id, slug: m.slug, name: model },
        powertrainType: v.powertrainType,
        bodyType: v.bodyType ?? m.bodyType,
        seats: v.seats,
        availability: vm?.availability ?? 'unknown',
        image: this.media.image(m.heroAsset, lang),
        price,
        isDemo: v.isDemo,
      },
    };
  }
}
