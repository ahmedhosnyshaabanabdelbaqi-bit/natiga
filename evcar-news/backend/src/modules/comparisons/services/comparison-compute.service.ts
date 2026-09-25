import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CarPagesService, type VariantSheetDto } from '../../vehicles';
import type {
  ComparisonCarDto,
  ComparisonResultDto,
  ComparisonView,
  ComparisonWarningDto,
} from '../dto/comparison.dto';
import { compareCars } from '../engine/compare';
import { factsFromSheet } from '../engine/facts';
import { COMPARABILITY_LABELS, t } from '../engine/labels';
import { COMPARABILITY, type SpecDefLite } from '../engine/types';
import type { ResolvedItem } from './item-resolver.service';

const DEFS_TTL_MS = 60_000;
const LISTED = new Set(['available', 'coming_soon']);

export const NOT_AVAILABLE = { ar: 'غير متوفر', en: 'Not available' } as const;

/** Shown with every comparison and recommendation (§7, §16). */
export const NO_SPONSOR_DISCLOSURE = {
  ar: 'النتائج محسوبة من بيانات الدليل فقط. الإعلانات والرعاية لا تغيّر نتيجة أي مقارنة أو ترشيح.',
  en: 'Results are computed from catalog data only. Ads and sponsorships never change any comparison or recommendation.',
} as const;

const WARNINGS = {
  MIXED_MARKETS: {
    ar: 'السيارات من أسواق مختلفة: السعر والتوافر ومنافذ الشحن تخص سوق كل سيارة، ولا نحوّل العملات.',
    en: "The cars are from different markets: price, availability and inlets are each car's own market; currencies are never converted.",
  },
  MIXED_POWERTRAINS: {
    ar: 'تقارن أنواع دفع مختلفة: المدى الكهربائي والمدى الإجمالي معروضان منفصلين.',
    en: 'Different powertrains are compared: electric range and total range are shown separately.',
  },
  NOT_OFFERED: {
    ar: 'فئة واحدة على الأقل غير معروضة حاليًا في السوق المختار.',
    en: 'At least one trim is not currently offered in the chosen market.',
  },
  DEMO_DATA: {
    ar: 'تتضمن المقارنة بيانات تجريبية وهمية لأغراض العرض فقط.',
    en: 'This comparison includes fictional demo data for display purposes only.',
  },
} as const;

/**
 * Computes a comparison from the public spec sheets of the vehicles module
 * (same visibility, market scoping and provenance as the car pages).
 */
@Injectable()
export class ComparisonComputeService {
  private defsCache?: { at: number; defs: SpecDefLite[] };

  constructor(
    private readonly prisma: PrismaService,
    private readonly pages: CarPagesService,
  ) {}

  async specDefs(): Promise<SpecDefLite[]> {
    if (this.defsCache && Date.now() - this.defsCache.at < DEFS_TTL_MS) return this.defsCache.defs;
    const rows = await this.prisma.specDefinition.findMany();
    const defs: SpecDefLite[] = rows.map((d) => ({
      key: d.key,
      group: d.group,
      dataType: d.dataType,
      unit: d.unit,
      betterDirection: d.betterDirection,
      labelAr: d.labelAr,
      labelEn: d.labelEn,
      descriptionAr: d.descriptionAr,
      descriptionEn: d.descriptionEn,
      isKeySpec: d.isKeySpec,
      isComparable: d.isComparable,
      sortOrder: d.sortOrder,
    }));
    this.defsCache = { at: Date.now(), defs };
    return defs;
  }

  async compute(
    items: ResolvedItem[],
    lang: SupportedLanguage,
    displayMarket: string,
    opts: { view?: ComparisonView; differencesOnly?: boolean } = {},
  ): Promise<ComparisonResultDto> {
    const view = opts.view ?? 'detailed';
    const differencesOnly = opts.differencesOnly ?? false;
    const [sheets, defs] = await Promise.all([
      Promise.all(
        items.map((i) =>
          this.pages.variantSheet(i.variantId, i.marketCode, lang, undefined, { related: false }),
        ),
      ),
      this.specDefs(),
    ]);
    const facts = sheets.map(factsFromSheet);
    const engine = compareCars(facts, defs, { lang, view, differencesOnly });
    const cars = sheets.map((s, i) => this.header(s, items[i]));
    return {
      view,
      differencesOnly,
      marketCode: displayMarket,
      cars,
      groups: engine.groups,
      summary: engine.summary,
      warnings: this.warnings(cars, lang),
      legend: COMPARABILITY.map((status) => ({
        status,
        label: t(lang, COMPARABILITY_LABELS[status]),
      })),
      sponsored: false,
      disclosure: t(lang, NO_SPONSOR_DISCLOSURE),
      notAvailableLabel: t(lang, NOT_AVAILABLE),
      generatedAt: new Date().toISOString(),
    };
  }

  private header(s: VariantSheetDto, item: ResolvedItem): ComparisonCarDto {
    return {
      key: item.key,
      position: item.position,
      variantId: s.id,
      variantSlug: s.slug,
      modelYearId: item.modelYearId,
      modelYear: s.modelYear,
      title: s.title,
      name: s.name,
      brand: s.brand,
      model: s.model,
      powertrainType: s.powertrainType,
      bodyType: s.bodyType,
      driveType: s.driveType,
      seats: s.seats,
      market: {
        code: s.market.code,
        name: s.market.name,
        currencyCode: s.market.currencyCode,
        availability: s.market.availability,
        offered: s.market.offered,
        localName: s.market.localName,
      },
      image: s.images[0] ?? null,
      price: s.price.current,
      hasTour: s.tours.available,
      isDemo: s.isDemo,
    };
  }

  private warnings(cars: ComparisonCarDto[], lang: SupportedLanguage): ComparisonWarningDto[] {
    const out: ComparisonWarningDto[] = [];
    const add = (code: keyof typeof WARNINGS) =>
      out.push({ code, message: t(lang, WARNINGS[code]) });
    if (new Set(cars.map((c) => c.market.code)).size > 1) add('MIXED_MARKETS');
    if (new Set(cars.map((c) => c.powertrainType)).size > 1) add('MIXED_POWERTRAINS');
    if (cars.some((c) => !LISTED.has(c.market.availability))) add('NOT_OFFERED');
    if (cars.some((c) => c.isDemo)) add('DEMO_DATA');
    return out;
  }
}
