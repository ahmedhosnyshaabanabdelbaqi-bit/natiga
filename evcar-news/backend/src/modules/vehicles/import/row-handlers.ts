/**
 * One handler per CSV template: validates a row, finds the existing record
 * by the template's natural key and creates / updates it (or reports it
 * unchanged). Handlers run inside the import transaction (a savepoint per
 * row) and reuse the same validators as the admin API (units, SoC, BEV /
 * hybrid rules, verification rights, price rules).
 */
import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import { pickLocalized } from '../../../common/i18n/localized-text';
import type { Prisma } from '../../../generated/prisma/client';
import {
  ContentStatus,
  PriceType,
  SpecDataType,
  type BodyType,
  type ConsumptionMode,
  type CurrentType,
  type DriveSide,
  type DriveType,
  type MarketAvailability,
  type PowertrainType,
  type RangeCycle,
  type RangeType,
} from '../../../generated/prisma/enums';
import type { RowError } from '../../system';
import {
  AVAILABILITIES,
  BODY_TYPES,
  CONSUMPTION_KINDS,
  CONSUMPTION_MODES,
  CURRENT_TYPES,
  DRIVE_TYPES,
  MARKET_CODE_RE,
  POWERTRAIN_TYPES,
  PRICE_TYPES,
  RANGE_CYCLES,
  RANGE_TYPES,
  RELIABILITIES,
  SLUG_MAX,
  SLUG_RE,
  SOURCE_TYPES,
  VERIFY_PERMISSION,
} from '../common/catalog-constants';
import { can, resolveDataPoint, type Actor, type DataPointInput } from '../common/data-point';
import {
  assertChargingApplicable,
  normalizeChargingTime,
  normalizeConsumption,
  normalizeRange,
} from '../common/measurements';
import { latinSlug, resolveSlug } from '../common/slugs';
import { normalizeSpecValue, specValueChanged } from '../common/spec-values';
import { cleanText, isValidDateOnly, parseDateOnly, sameNumber } from '../common/values';
import { AdminPricesService } from '../admin/admin-prices.service';
import { parseBoolCell, parseNumberCell, textCell, type CsvRow } from './csv-codec';
import type { ImportType } from './templates';

type Tx = Prisma.TransactionClient;

export type RowAction = 'create' | 'update' | 'unchanged';

export interface RowOutcome {
  action: RowAction;
  entityType: string;
  entityId: string;
  modelId: string | null;
}

export interface RowCtx {
  tx: Tx;
  actor: Actor;
  lang: SupportedLanguage;
}

/** A row that failed validation (reported as `invalid`). */
export class RowInvalid extends Error {
  constructor(readonly errors: RowError[]) {
    super('row_invalid');
    this.name = 'RowInvalid';
  }
}

const snake = (field: string) =>
  field.replace(/^items\.\d+\./, '').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Converts an AppException raised by a shared validator into row errors. */
export function rowErrorsOf(err: AppException, lang: SupportedLanguage): RowError[] {
  const message = pickLocalized(err.localizedMessage, lang) ?? err.code;
  const details = err.details as
    { field?: string; constraints?: Record<string, string> }[] | undefined;
  if (Array.isArray(details) && details.length && details[0]?.field) {
    return details.flatMap((d) =>
      Object.entries(d.constraints ?? {}).map(([code, msg]) => ({
        field: snake(d.field ?? ''),
        code,
        message: msg,
      })),
    );
  }
  return [{ code: err.code.toLowerCase(), message }];
}

const MSG = {
  required: { ar: 'قيمة مطلوبة.', en: 'Required.' },
  number: { ar: 'رقم غير صالح.', en: 'Invalid number.' },
  int: { ar: 'يجب أن يكون عددًا صحيحًا ضمن الحدود.', en: 'Must be a whole number within range.' },
  date: { ar: 'تاريخ غير صالح (YYYY-MM-DD).', en: 'Invalid date (YYYY-MM-DD).' },
  timestamp: { ar: 'تاريخ ووقت غير صالحين (ISO 8601).', en: 'Invalid timestamp (ISO 8601).' },
  slug: { ar: 'معرّف نصي غير صالح.', en: 'Invalid slug.' },
  bool: { ar: 'استخدم true أو false.', en: 'Use true or false.' },
};

/** Collects cell errors of one row; `done()` throws RowInvalid when any. */
class Cells {
  readonly errors: RowError[] = [];
  constructor(
    private readonly row: CsvRow,
    private readonly lang: SupportedLanguage,
  ) {}

  fail(field: string, code: string, message: { ar: string; en: string }): void {
    this.errors.push({ field, code, message: message[this.lang] });
  }

  text(col: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
    const v = textCell(this.row[col]);
    if (v === undefined) {
      if (opts.required) this.fail(col, 'required', MSG.required);
      return undefined;
    }
    const clean = cleanText(v) ?? undefined;
    if (clean && opts.max && clean.length > opts.max) {
      this.fail(col, 'maxLength', {
        ar: `بحد أقصى ${opts.max} حرفًا.`,
        en: `At most ${opts.max} characters.`,
      });
    }
    return clean;
  }

  multiline(col: string, max = 2000): string | undefined {
    const v = textCell(this.row[col]);
    if (v === undefined) return undefined;
    const clean = cleanText(v, true) ?? undefined;
    if (clean && clean.length > max) {
      this.fail(col, 'maxLength', {
        ar: `بحد أقصى ${max} حرفًا.`,
        en: `At most ${max} characters.`,
      });
    }
    return clean;
  }

  slug(col: string, required = false): string | undefined {
    const v = this.text(col, { required });
    if (v !== undefined && (!SLUG_RE.test(v) || v.length > SLUG_MAX)) {
      this.fail(col, 'slug', MSG.slug);
      return undefined;
    }
    return v;
  }

  enumOf<T extends string>(
    col: string,
    allowed: readonly string[],
    required = false,
  ): T | undefined {
    const v = this.text(col, { required });
    if (v === undefined) return undefined;
    const match = allowed.find((a) => a.toLowerCase() === v.toLowerCase());
    if (!match) {
      this.fail(col, 'isIn', {
        ar: `القيمة يجب أن تكون إحدى: ${allowed.join(', ')}`,
        en: `Must be one of: ${allowed.join(', ')}`,
      });
      return undefined;
    }
    return match as T;
  }

  num(
    col: string,
    opts: { required?: boolean; min?: number; max?: number } = {},
  ): number | undefined {
    const raw = this.row[col];
    const n = parseNumberCell(raw);
    if (n === null) {
      if (opts.required) this.fail(col, 'required', MSG.required);
      return undefined;
    }
    if (
      Number.isNaN(n) ||
      (opts.min !== undefined && n < opts.min) ||
      (opts.max !== undefined && n > opts.max)
    ) {
      this.fail(col, 'isNumber', MSG.number);
      return undefined;
    }
    return n;
  }

  int(col: string, min: number, max: number, required = false): number | undefined {
    const n = this.num(col, { required });
    if (n === undefined) return undefined;
    if (!Number.isInteger(n) || n < min || n > max) {
      this.fail(col, 'isInt', MSG.int);
      return undefined;
    }
    return n;
  }

  date(col: string, required = false): Date | undefined {
    const v = this.text(col, { required });
    if (v === undefined) return undefined;
    if (!isValidDateOnly(v)) {
      this.fail(col, 'date', MSG.date);
      return undefined;
    }
    return parseDateOnly(v);
  }

  timestamp(col: string): string | undefined {
    const v = this.text(col);
    if (v === undefined) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
      this.fail(col, 'timestamp', MSG.timestamp);
      return undefined;
    }
    return d.toISOString();
  }

  market(col: string, required = false): string | undefined {
    const v = this.text(col, { required })?.toUpperCase();
    if (v !== undefined && !MARKET_CODE_RE.test(v)) {
      this.fail(col, 'matches', { ar: 'رمز سوق غير صالح.', en: 'Invalid market code.' });
      return undefined;
    }
    return v;
  }

  done(): void {
    if (this.errors.length) throw new RowInvalid(this.errors);
  }
}

function invalid(
  field: string,
  code: string,
  message: { ar: string; en: string },
  lang: SupportedLanguage,
): RowInvalid {
  return new RowInvalid([{ field, code, message: message[lang] }]);
}

export interface RowHandler {
  /** Natural key for duplicate detection inside one file. */
  key(row: CsvRow): string;
  apply(row: CsvRow, ctx: RowCtx): Promise<RowOutcome>;
}

const k = (row: CsvRow, ...cols: string[]) =>
  cols.map((c) => (row[c] ?? '').trim().toLowerCase()).join('|');

@Injectable()
export class CatalogRowHandlers {
  constructor(private readonly prices: AdminPricesService) {}

  handler(type: ImportType): RowHandler {
    switch (type) {
      case 'variants':
        return {
          key: (r) =>
            textCell(r.variant_slug)
              ? `slug|${k(r, 'variant_slug')}`
              : k(r, 'model_slug', 'generation_slug', 'year', 'powertrain', 'variant_name_en'),
          apply: (r, c) => this.variant(r, c),
        };
      case 'variant_markets':
        return {
          key: (r) => k(r, 'variant_slug', 'market'),
          apply: (r, c) => this.variantMarket(r, c),
        };
      case 'specs':
        return {
          key: (r) => k(r, 'variant_slug', 'spec_key', 'market'),
          apply: (r, c) => this.spec(r, c),
        };
      case 'ranges':
        return {
          key: (r) =>
            `${k(r, 'variant_slug', 'market', 'cycle', 'cycle_note', 'range_type')}|${parseNumberCell(r.wheel_size_inch) ?? ''}`,
          apply: (r, c) => this.range(r, c),
        };
      case 'consumption':
        return {
          key: (r) => k(r, 'variant_slug', 'market', 'cycle', 'cycle_note', 'kind', 'mode'),
          apply: (r, c) => this.consumption(r, c),
        };
      case 'charging_times':
        return {
          key: (r) =>
            `${k(r, 'variant_slug', 'current_type')}|${parseNumberCell(r.from_soc)}|${parseNumberCell(r.to_soc)}|${parseNumberCell(r.charger_power_kw) ?? ''}|${k(r, 'conditions')}`,
          apply: (r, c) => this.chargingTime(r, c),
        };
      case 'prices':
        return {
          key: (r) => k(r, 'variant_slug', 'market', 'price_type', 'currency', 'effective_from'),
          apply: (r, c) => this.price(r, c),
        };
    }
  }

  // ------------------------------------------------------------------ shared lookups

  private async variantOf(row: CsvRow, ctx: RowCtx) {
    const slug = textCell(row.variant_slug)?.toLowerCase();
    if (!slug) throw invalid('variant_slug', 'required', MSG.required, ctx.lang);
    const v = await ctx.tx.vehicleVariant.findUnique({
      where: { slug },
      select: {
        id: true,
        powertrainType: true,
        deletedAt: true,
        modelYear: { select: { generation: { select: { modelId: true } } } },
      },
    });
    if (!v || v.deletedAt) {
      throw invalid(
        'variant_slug',
        'exists',
        { ar: 'لا توجد فئة بهذا المعرّف.', en: 'No variant with this slug.' },
        ctx.lang,
      );
    }
    return { id: v.id, powertrainType: v.powertrainType, modelId: v.modelYear.generation.modelId };
  }

  private async assertMarket(code: string | undefined, col: string, ctx: RowCtx) {
    if (!code) return null;
    const m = await ctx.tx.market.findUnique({ where: { code } });
    if (!m)
      throw invalid(col, 'exists', { ar: 'السوق غير موجود.', en: 'Unknown market.' }, ctx.lang);
    return m;
  }

  /**
   * Source of a row: `source_id`, else an existing source with `source_url`,
   * else a NEW source from source_title + source_type (needs sources.write).
   * undefined = no source columns filled (keep the stored source).
   */
  private async sourceOf(row: CsvRow, ctx: RowCtx): Promise<string | undefined> {
    const id = textCell(row.source_id);
    const url = textCell(row.source_url);
    const title = cleanText(textCell(row.source_title) ?? null) ?? undefined;
    if (id) {
      const s = /^[0-9a-f-]{36}$/i.test(id)
        ? await ctx.tx.specificationSource.findUnique({ where: { id }, select: { id: true } })
        : null;
      if (!s)
        throw invalid(
          'source_id',
          'exists',
          { ar: 'المصدر غير موجود.', en: 'Unknown source.' },
          ctx.lang,
        );
      return s.id;
    }
    if (!url && !title) return undefined;
    if (url && !/^https?:\/\/\S+$/.test(url)) {
      throw invalid('source_url', 'isUrl', { ar: 'رابط غير صالح.', en: 'Invalid URL.' }, ctx.lang);
    }
    const existing = await ctx.tx.specificationSource.findFirst({
      where: url ? { url } : { title },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const typeRaw = textCell(row.source_type);
    const type = SOURCE_TYPES.find((t) => t === typeRaw);
    if (!title || !type) {
      throw invalid(
        'source_title',
        'required',
        {
          ar: 'لإنشاء مصدر جديد املأ source_title وsource_type.',
          en: 'To create a new source fill source_title and source_type.',
        },
        ctx.lang,
      );
    }
    if (!can(ctx.actor, 'sources.write')) {
      throw invalid(
        'source_title',
        'forbidden',
        {
          ar: 'إنشاء المصادر يتطلب صلاحية sources.write.',
          en: 'Creating sources needs sources.write.',
        },
        ctx.lang,
      );
    }
    const s = await ctx.tx.specificationSource.create({
      data: {
        type,
        title: title.slice(0, 300),
        url: url ?? null,
        createdById: ctx.actor.id,
      },
    });
    return s.id;
  }

  private dpInput(
    cells: Cells,
    sourceId: string | undefined,
    withReliability = true,
  ): DataPointInput {
    const reliability = withReliability
      ? cells.enumOf<string>('reliability', RELIABILITIES)
      : undefined;
    const verifiedAt = cells.timestamp('verified_at');
    return {
      ...(sourceId !== undefined ? { sourceId } : {}),
      ...(reliability !== undefined ? { reliability } : {}),
      ...(verifiedAt !== undefined ? { verifiedAt } : {}),
    };
  }

  // ------------------------------------------------------------------ variants

  private async variant(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const brandSlug = c.slug('brand_slug', true);
    const modelSlug = c.slug('model_slug', true);
    const generationSlug = c.slug('generation_slug', true);
    const year = c.int('year', 1990, 2100, true);
    const variantSlug = c.slug('variant_slug');
    const nameEn = c.text('variant_name_en', { required: true, max: 160 });
    const nameAr = c.text('variant_name_ar', { required: true, max: 160 });
    const powertrain = c.enumOf<PowertrainType>('powertrain', POWERTRAIN_TYPES, true);
    const drive = c.enumOf<DriveType>('drive', DRIVE_TYPES);
    const seats = c.int('seats', 1, 12);
    const doors = c.int('doors', 1, 6);
    const bodyType = c.enumOf<BodyType>('body_type', BODY_TYPES);
    const variantBody = c.enumOf<BodyType>('variant_body_type', BODY_TYPES);
    const sortOrder = c.int('sort_order', 0, 100_000);
    const trimCode = c.text('trim_code', { max: 64 });
    const genStart = c.int('generation_start_year', 1900, 2100);
    const genEnd = c.int('generation_end_year', 1900, 2100);
    const brandEn = c.text('brand_name_en', { max: 120 });
    const brandAr = c.text('brand_name_ar', { max: 120 });
    const modelEn = c.text('model_name_en', { max: 120 });
    const modelAr = c.text('model_name_ar', { max: 120 });
    const genEn = c.text('generation_name_en', { max: 120 });
    const genAr = c.text('generation_name_ar', { max: 120 });
    const genCode = c.text('generation_code', { max: 32 });
    c.done();

    let brand = await tx.brand.findUnique({ where: { slug: brandSlug! } });
    if (brand?.deletedAt)
      throw invalid(
        'brand_slug',
        'deleted',
        { ar: 'الماركة محذوفة.', en: 'The brand is deleted.' },
        lang,
      );
    if (!brand) {
      if (!brandEn || !brandAr) {
        throw invalid(
          'brand_name_en',
          'required',
          { ar: 'ماركة جديدة: املأ الاسمين العربي والإنجليزي.', en: 'New brand: fill both names.' },
          lang,
        );
      }
      brand = await tx.brand.create({
        data: {
          slug: brandSlug!,
          nameEn: brandEn,
          nameAr: brandAr,
          status: ContentStatus.draft,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }
    let model = await tx.carModel.findUnique({ where: { slug: modelSlug! } });
    if (model && model.brandId !== brand.id) {
      throw invalid(
        'model_slug',
        'brand',
        { ar: 'هذا الموديل تابع لماركة أخرى.', en: 'This model belongs to another brand.' },
        lang,
      );
    }
    if (model?.deletedAt)
      throw invalid(
        'model_slug',
        'deleted',
        { ar: 'الموديل محذوف.', en: 'The model is deleted.' },
        lang,
      );
    if (!model) {
      if (!modelEn || !modelAr) {
        throw invalid(
          'model_name_en',
          'required',
          { ar: 'موديل جديد: املأ الاسمين العربي والإنجليزي.', en: 'New model: fill both names.' },
          lang,
        );
      }
      model = await tx.carModel.create({
        data: {
          brandId: brand.id,
          slug: modelSlug!,
          nameEn: modelEn,
          nameAr: modelAr,
          bodyType: bodyType ?? null,
          status: ContentStatus.draft,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }
    let generation = await tx.generation.findUnique({
      where: { modelId_slug: { modelId: model.id, slug: generationSlug! } },
    });
    if (generation?.deletedAt)
      throw invalid(
        'generation_slug',
        'deleted',
        { ar: 'الجيل محذوف.', en: 'The generation is deleted.' },
        lang,
      );
    if (!generation) {
      if (!genEn || !genAr) {
        throw invalid(
          'generation_name_en',
          'required',
          {
            ar: 'جيل جديد: املأ الاسمين العربي والإنجليزي.',
            en: 'New generation: fill both names.',
          },
          lang,
        );
      }
      if (genStart !== undefined && genEnd !== undefined && genStart > genEnd) {
        throw invalid(
          'generation_end_year',
          'order',
          { ar: 'سنة النهاية قبل البداية.', en: 'End year before start year.' },
          lang,
        );
      }
      generation = await tx.generation.create({
        data: {
          modelId: model.id,
          slug: generationSlug!,
          nameEn: genEn,
          nameAr: genAr,
          code: genCode ?? null,
          startYear: genStart ?? null,
          endYear: genEnd ?? null,
        },
      });
    }
    const modelYear =
      (await tx.modelYear.findUnique({
        where: { generationId_year: { generationId: generation.id, year: year! } },
      })) ?? (await tx.modelYear.create({ data: { generationId: generation.id, year: year! } }));

    let existing = variantSlug
      ? await tx.vehicleVariant.findUnique({ where: { slug: variantSlug } })
      : null;
    if (existing && existing.modelYearId !== modelYear.id) {
      throw invalid(
        'variant_slug',
        'modelYear',
        {
          ar: 'هذه الفئة مسجلة تحت سنة موديل أخرى.',
          en: 'This variant belongs to another model year.',
        },
        lang,
      );
    }
    if (existing && existing.powertrainType !== powertrain) {
      throw invalid(
        'powertrain',
        'powertrain',
        {
          ar: 'نوع منظومة الدفع مختلف: أنشئ فئة منفصلة بدل تغيير الفئة الحالية.',
          en: 'Different powertrain: create a separate variant instead of changing this one.',
        },
        lang,
      );
    }
    if (!existing && !variantSlug) {
      existing = await tx.vehicleVariant.findFirst({
        where: { modelYearId: modelYear.id, powertrainType: powertrain!, nameEn: nameEn! },
      });
    }
    if (existing?.deletedAt)
      throw invalid(
        'variant_slug',
        'deleted',
        { ar: 'الفئة محذوفة.', en: 'The variant is deleted.' },
        lang,
      );

    const fields = {
      nameEn: nameEn!,
      nameAr: nameAr!,
      ...(trimCode !== undefined ? { trimCode } : {}),
      ...(drive !== undefined ? { driveType: drive } : {}),
      ...(seats !== undefined ? { seats } : {}),
      ...(doors !== undefined ? { doors } : {}),
      ...(variantBody !== undefined ? { bodyType: variantBody } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    };
    if (!existing) {
      const clash = await tx.vehicleVariant.findFirst({
        where: { modelYearId: modelYear.id, powertrainType: powertrain!, nameEn: nameEn! },
        select: { id: true },
      });
      if (clash) {
        throw invalid(
          'variant_name_en',
          'exists',
          {
            ar: 'توجد فئة بالاسم نفسه ونوع الدفع نفسه.',
            en: 'A variant with this name and powertrain exists.',
          },
          lang,
        );
      }
      const slug = await resolveSlug(
        variantSlug,
        latinSlug(model.slug, year, nameEn, powertrain),
        async (s) =>
          Boolean(await tx.vehicleVariant.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const created = await tx.vehicleVariant.create({
        data: {
          modelYearId: modelYear.id,
          slug,
          powertrainType: powertrain!,
          status: ContentStatus.draft,
          createdById: actor.id,
          updatedById: actor.id,
          ...fields,
        },
      });
      return { action: 'create', entityType: 'variant', entityId: created.id, modelId: model.id };
    }
    const changed = Object.entries(fields).some(
      ([key, value]) => (existing as Record<string, unknown>)[key] !== value,
    );
    if (!changed)
      return {
        action: 'unchanged',
        entityType: 'variant',
        entityId: existing.id,
        modelId: model.id,
      };
    if (fields.nameEn !== existing.nameEn) {
      const clash = await tx.vehicleVariant.findFirst({
        where: {
          modelYearId: modelYear.id,
          powertrainType: powertrain!,
          nameEn: fields.nameEn,
          id: { not: existing.id },
        },
        select: { id: true },
      });
      if (clash)
        throw invalid(
          'variant_name_en',
          'exists',
          { ar: 'الاسم مستخدم لفئة أخرى.', en: 'Name used by another variant.' },
          lang,
        );
    }
    await tx.vehicleVariant.update({
      where: { id: existing.id },
      data: { ...fields, updatedById: actor.id },
    });
    return { action: 'update', entityType: 'variant', entityId: existing.id, modelId: model.id };
  }

  // ------------------------------------------------------------------ markets

  private async variantMarket(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const marketCode = c.market('market', true);
    const availability = c.enumOf<MarketAvailability>('availability', AVAILABILITIES, true);
    const localEn = c.text('local_name_en', { max: 200 });
    const localAr = c.text('local_name_ar', { max: 200 });
    const driveSide = c.enumOf<DriveSide>('drive_side', ['lhd', 'rhd']);
    const launch = c.date('launch_date');
    const discontinued = c.date('discontinued_at');
    const verifiedAtRaw = c.timestamp('verified_at');
    const notes = c.multiline('notes');
    c.done();
    const v = await this.variantOf(row, ctx);
    await this.assertMarket(marketCode, 'market', ctx);
    const sourceId = await this.sourceOf(row, ctx);
    const before = await tx.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId: v.id, marketCode: marketCode! } },
    });
    const next = {
      availability: availability!,
      localNameEn: localEn ?? before?.localNameEn ?? null,
      localNameAr: localAr ?? before?.localNameAr ?? null,
      driveSide: driveSide ?? before?.driveSide ?? null,
      launchDate: launch ?? before?.launchDate ?? null,
      discontinuedAt: discontinued ?? before?.discontinuedAt ?? null,
      sourceId: sourceId ?? before?.sourceId ?? null,
      verifiedAt: verifiedAtRaw ? new Date(verifiedAtRaw) : (before?.verifiedAt ?? null),
      notes: notes ?? before?.notes ?? null,
    };
    if (next.launchDate && next.discontinuedAt && next.discontinuedAt < next.launchDate) {
      throw invalid(
        'discontinued_at',
        'order',
        { ar: 'تاريخ التوقف قبل الإطلاق.', en: 'Discontinued before launch.' },
        lang,
      );
    }
    const availabilityChanged = !before || before.availability !== next.availability;
    if (before?.verifiedAt && !verifiedAtRaw && availabilityChanged) next.verifiedAt = null;
    if (next.verifiedAt) {
      if (!next.sourceId) {
        throw invalid(
          'source_id',
          'verifiedNeedsSource',
          { ar: 'لا يمكن التوثيق بلا مصدر.', en: 'Verification needs a source.' },
          lang,
        );
      }
      const unchanged =
        before?.verifiedAt?.getTime() === next.verifiedAt.getTime() && !availabilityChanged;
      if (!unchanged && !can(actor, VERIFY_PERMISSION)) {
        throw invalid(
          'verified_at',
          'forbidden',
          { ar: 'التوثيق يتطلب صلاحية specs.verify.', en: 'Verification needs specs.verify.' },
          lang,
        );
      }
    }
    const same =
      before &&
      before.availability === next.availability &&
      before.localNameEn === next.localNameEn &&
      before.localNameAr === next.localNameAr &&
      before.driveSide === next.driveSide &&
      (before.launchDate?.getTime() ?? null) === (next.launchDate?.getTime() ?? null) &&
      (before.discontinuedAt?.getTime() ?? null) === (next.discontinuedAt?.getTime() ?? null) &&
      before.sourceId === next.sourceId &&
      (before.verifiedAt?.getTime() ?? null) === (next.verifiedAt?.getTime() ?? null) &&
      before.notes === next.notes;
    if (before && same)
      return {
        action: 'unchanged',
        entityType: 'variant_market',
        entityId: before.id,
        modelId: v.modelId,
      };
    const saved = await tx.variantMarket.upsert({
      where: { variantId_marketCode: { variantId: v.id, marketCode: marketCode! } },
      create: { variantId: v.id, marketCode: marketCode!, ...next },
      update: next,
    });
    return {
      action: before ? 'update' : 'create',
      entityType: 'variant_market',
      entityId: saved.id,
      modelId: v.modelId,
    };
  }

  // ------------------------------------------------------------------ specs

  private async spec(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const specKey = c.text('spec_key', { required: true, max: 100 });
    const marketCode = c.market('market');
    const rawValue = c.text('value', { required: true, max: 500 });
    const unit = c.text('unit', { max: 20 });
    const originalValue = c.text('original_value', { max: 200 });
    const originalUnit = c.text('original_unit', { max: 20 });
    const notes = c.multiline('notes');
    const dpCells = this.dpInput(c, undefined);
    c.done();
    const v = await this.variantOf(row, ctx);
    const def = await tx.specDefinition.findUnique({ where: { key: specKey! } });
    if (!def)
      throw invalid(
        'spec_key',
        'exists',
        { ar: 'مفتاح مواصفة غير معروف.', en: 'Unknown spec key.' },
        lang,
      );
    if (def.group === 'charging') assertChargingApplicable(v.powertrainType);
    await this.assertMarket(marketCode, 'market', ctx);
    let value: number | string | boolean;
    if (def.dataType === SpecDataType.number) {
      const n = parseNumberCell(rawValue);
      if (n === null || Number.isNaN(n)) throw invalid('value', 'isNumber', MSG.number, lang);
      value = n;
    } else if (def.dataType === SpecDataType.boolean) {
      const b = parseBoolCell(rawValue);
      if (b === null || b === undefined) throw invalid('value', 'isBoolean', MSG.bool, lang);
      value = b;
    } else {
      value = rawValue!;
    }
    const stored = normalizeSpecValue(def, { value, unit, originalValue, originalUnit });
    const sourceId = await this.sourceOf(row, ctx);
    const existing = await tx.vehicleSpecification.findFirst({
      where: { variantId: v.id, specKey: def.key, marketCode: marketCode ?? null },
    });
    const valueChanged = existing ? specValueChanged(existing, stored) : true;
    const dp = resolveDataPoint(
      { ...dpCells, ...(sourceId !== undefined ? { sourceId } : {}) },
      existing,
      {
        valueChanged,
        actor,
      },
    );
    const data = {
      ...stored,
      ...dp,
      notes: notes ?? existing?.notes ?? null,
      updatedById: actor.id,
    };
    if (existing) {
      const same =
        !valueChanged &&
        existing.originalValue === data.originalValue &&
        existing.originalUnit === data.originalUnit &&
        existing.sourceId === data.sourceId &&
        existing.reliability === data.reliability &&
        (existing.verifiedAt?.getTime() ?? null) === (data.verifiedAt?.getTime() ?? null) &&
        existing.notes === data.notes;
      if (same)
        return {
          action: 'unchanged',
          entityType: 'vehicle_specification',
          entityId: existing.id,
          modelId: v.modelId,
        };
      await tx.vehicleSpecification.update({ where: { id: existing.id }, data });
      return {
        action: 'update',
        entityType: 'vehicle_specification',
        entityId: existing.id,
        modelId: v.modelId,
      };
    }
    const created = await tx.vehicleSpecification.create({
      data: { variantId: v.id, specKey: def.key, marketCode: marketCode ?? null, ...data },
    });
    return {
      action: 'create',
      entityType: 'vehicle_specification',
      entityId: created.id,
      modelId: v.modelId,
    };
  }

  // ------------------------------------------------------------------ ranges

  private async range(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const marketCode = c.market('market');
    const cycle = c.enumOf<RangeCycle>('cycle', RANGE_CYCLES, true);
    const cycleNote = c.text('cycle_note', { max: 100 });
    const rangeType = c.enumOf<RangeType>('range_type', RANGE_TYPES, true);
    const value = c.num('value', { required: true, min: 0 });
    const unit = c.text('unit', { max: 20 });
    const wheel = c.num('wheel_size_inch', { min: 1, max: 40 });
    const conditions = c.multiline('conditions');
    const originalValue = c.text('original_value', { max: 50 });
    const originalUnit = c.text('original_unit', { max: 20 });
    const dpCells = this.dpInput(c, undefined);
    c.done();
    const v = await this.variantOf(row, ctx);
    await this.assertMarket(marketCode, 'market', ctx);
    const n = normalizeRange(
      {
        cycle: cycle!,
        cycleNote,
        rangeType: rangeType!,
        value: value!,
        unit,
        wheelSizeInch: wheel ?? null,
        conditions,
        originalValue,
        originalUnit,
      },
      v.powertrainType,
    );
    const sourceId = await this.sourceOf(row, ctx);
    const candidates = await tx.rangeMeasurement.findMany({
      where: {
        variantId: v.id,
        marketCode: marketCode ?? null,
        cycle: n.cycle,
        rangeType: n.rangeType,
      },
    });
    const existing =
      candidates.find(
        (x) =>
          (x.cycleNote ?? '') === (n.cycleNote ?? '') &&
          sameNumber(x.wheelSizeInch, n.wheelSizeInch),
      ) ?? null;
    const valueChanged = existing ? !sameNumber(existing.valueKm, n.valueKm) : true;
    const dp = resolveDataPoint(
      { ...dpCells, ...(sourceId !== undefined ? { sourceId } : {}) },
      existing,
      { valueChanged, actor },
    );
    const data = {
      ...n,
      conditions: n.conditions ?? existing?.conditions ?? null,
      ...dp,
    };
    if (existing) {
      const same =
        !valueChanged &&
        existing.originalValue === data.originalValue &&
        existing.originalUnit === data.originalUnit &&
        existing.conditions === data.conditions &&
        existing.sourceId === data.sourceId &&
        existing.reliability === data.reliability &&
        (existing.verifiedAt?.getTime() ?? null) === (data.verifiedAt?.getTime() ?? null);
      if (same)
        return {
          action: 'unchanged',
          entityType: 'range',
          entityId: existing.id,
          modelId: v.modelId,
        };
      await tx.rangeMeasurement.update({ where: { id: existing.id }, data });
      return { action: 'update', entityType: 'range', entityId: existing.id, modelId: v.modelId };
    }
    const created = await tx.rangeMeasurement.create({
      data: { variantId: v.id, marketCode: marketCode ?? null, ...data },
    });
    return { action: 'create', entityType: 'range', entityId: created.id, modelId: v.modelId };
  }

  // ------------------------------------------------------------------ consumption

  private async consumption(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const marketCode = c.market('market');
    const cycle = c.enumOf<RangeCycle>('cycle', RANGE_CYCLES, true);
    const cycleNote = c.text('cycle_note', { max: 100 });
    const kind = c.enumOf<string>('kind', CONSUMPTION_KINDS, true);
    const mode = c.enumOf<ConsumptionMode>('mode', CONSUMPTION_MODES);
    const value = c.num('value', { required: true, min: 0 });
    const unit = c.text('unit', { max: 20 });
    const conditions = c.multiline('conditions');
    const originalValue = c.text('original_value', { max: 50 });
    const originalUnit = c.text('original_unit', { max: 20 });
    const dpCells = this.dpInput(c, undefined);
    c.done();
    const v = await this.variantOf(row, ctx);
    await this.assertMarket(marketCode, 'market', ctx);
    const n = normalizeConsumption(
      {
        cycle: cycle!,
        cycleNote,
        kind: kind!,
        mode: mode ?? null,
        value: value!,
        unit,
        conditions,
        originalValue,
        originalUnit,
      },
      v.powertrainType,
    );
    const sourceId = await this.sourceOf(row, ctx);
    const candidates = await tx.consumptionMeasurement.findMany({
      where: {
        variantId: v.id,
        marketCode: marketCode ?? null,
        cycle: n.cycle,
        kind: n.kind,
        mode: (n.mode as ConsumptionMode | null) ?? null,
      },
    });
    const existing = candidates.find((x) => (x.cycleNote ?? '') === (n.cycleNote ?? '')) ?? null;
    const valueChanged = existing ? !sameNumber(existing.value, n.value) : true;
    const dp = resolveDataPoint(
      { ...dpCells, ...(sourceId !== undefined ? { sourceId } : {}) },
      existing,
      { valueChanged, actor },
    );
    const data = {
      ...n,
      mode: n.mode as ConsumptionMode | null,
      conditions: n.conditions ?? existing?.conditions ?? null,
      ...dp,
    };
    if (existing) {
      const same =
        !valueChanged &&
        existing.originalValue === data.originalValue &&
        existing.originalUnit === data.originalUnit &&
        existing.conditions === data.conditions &&
        existing.sourceId === data.sourceId &&
        existing.reliability === data.reliability &&
        (existing.verifiedAt?.getTime() ?? null) === (data.verifiedAt?.getTime() ?? null);
      if (same)
        return {
          action: 'unchanged',
          entityType: 'consumption',
          entityId: existing.id,
          modelId: v.modelId,
        };
      await tx.consumptionMeasurement.update({ where: { id: existing.id }, data });
      return {
        action: 'update',
        entityType: 'consumption',
        entityId: existing.id,
        modelId: v.modelId,
      };
    }
    const created = await tx.consumptionMeasurement.create({
      data: { variantId: v.id, marketCode: marketCode ?? null, ...data },
    });
    return {
      action: 'create',
      entityType: 'consumption',
      entityId: created.id,
      modelId: v.modelId,
    };
  }

  // ------------------------------------------------------------------ charging times

  private async chargingTime(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const currentType = c.enumOf<CurrentType>('current_type', CURRENT_TYPES, true);
    const fromSoc = c.num('from_soc', { required: true });
    const toSoc = c.num('to_soc', { required: true });
    const duration = c.num('duration', { required: true, min: 0 });
    const durationUnit = c.enumOf<string>('duration_unit', ['min', 'h', 's']);
    const charger = c.num('charger_power_kw', { min: 0 });
    const peak = c.num('peak_power_kw', { min: 0 });
    const avg = c.num('average_power_kw', { min: 0 });
    const onboard = c.num('onboard_charger_limit_kw', { min: 0 });
    const conditions = c.multiline('conditions');
    const dpCells = this.dpInput(c, undefined);
    c.done();
    const v = await this.variantOf(row, ctx);
    const n = normalizeChargingTime(
      {
        currentType: currentType!,
        fromSoc: fromSoc!,
        toSoc: toSoc!,
        duration: duration!,
        durationUnit,
        chargerPowerKw: charger ?? null,
        peakPowerKw: peak ?? null,
        averagePowerKw: avg ?? null,
        onboardChargerLimitKw: onboard ?? null,
        conditions,
      },
      v.powertrainType,
    );
    const sourceId = await this.sourceOf(row, ctx);
    const candidates = await tx.chargingTimeMeasurement.findMany({
      where: { variantId: v.id, currentType: n.currentType, fromSoc: n.fromSoc, toSoc: n.toSoc },
    });
    const existing =
      candidates.find(
        (x) =>
          sameNumber(x.chargerPowerKw, n.chargerPowerKw) &&
          (x.conditions ?? '') === (n.conditions ?? ''),
      ) ?? null;
    const valueChanged = existing
      ? !sameNumber(existing.durationMinutes, n.durationMinutes) ||
        !sameNumber(existing.peakPowerKw, n.peakPowerKw) ||
        !sameNumber(existing.averagePowerKw, n.averagePowerKw)
      : true;
    const dp = resolveDataPoint(
      { ...dpCells, ...(sourceId !== undefined ? { sourceId } : {}) },
      existing,
      { valueChanged, actor },
    );
    const data = { ...n, ...dp };
    if (existing) {
      const same =
        !valueChanged &&
        sameNumber(existing.onboardChargerLimitKw, n.onboardChargerLimitKw) &&
        existing.sourceId === data.sourceId &&
        existing.reliability === data.reliability &&
        (existing.verifiedAt?.getTime() ?? null) === (data.verifiedAt?.getTime() ?? null);
      if (same)
        return {
          action: 'unchanged',
          entityType: 'charging_time',
          entityId: existing.id,
          modelId: v.modelId,
        };
      await tx.chargingTimeMeasurement.update({ where: { id: existing.id }, data });
      return {
        action: 'update',
        entityType: 'charging_time',
        entityId: existing.id,
        modelId: v.modelId,
      };
    }
    const created = await tx.chargingTimeMeasurement.create({ data: { variantId: v.id, ...data } });
    return {
      action: 'create',
      entityType: 'charging_time',
      entityId: created.id,
      modelId: v.modelId,
    };
  }

  // ------------------------------------------------------------------ prices

  private async price(row: CsvRow, ctx: RowCtx): Promise<RowOutcome> {
    const { tx, actor, lang } = ctx;
    const c = new Cells(row, lang);
    const marketCode = c.market('market', true);
    const amount = c.text('amount', { required: true });
    const currency = c.text('currency', { required: true })?.toUpperCase();
    const priceType = c.enumOf<PriceType>('price_type', PRICE_TYPES, true);
    const from = c.date('effective_from', true);
    const to = c.date('effective_to');
    const notes = c.multiline('notes');
    const dpCells = this.dpInput(c, undefined);
    const amountNum = parseNumberCell(amount);
    if (
      amount !== undefined &&
      (amountNum === null ||
        Number.isNaN(amountNum) ||
        amountNum <= 0 ||
        !/^\d{1,12}(\.\d{1,2})?$/.test(String(amountNum)))
    ) {
      c.fail('amount', 'amount', {
        ar: 'مبلغ غير صالح (موجب، منزلتان عشريتان كحد أقصى).',
        en: 'Invalid amount (positive, at most 2 decimals).',
      });
    }
    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
      c.fail('currency', 'matches', { ar: 'رمز عملة غير صالح.', en: 'Invalid currency code.' });
    }
    c.done();
    const v = await this.variantOf(row, ctx);
    const market = await this.assertMarket(marketCode, 'market', ctx);
    const cur = await tx.currency.findUnique({ where: { code: currency! } });
    if (!cur)
      throw invalid(
        'currency',
        'exists',
        { ar: 'العملة غير موجودة.', en: 'Unknown currency.' },
        lang,
      );
    const vm = await tx.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId: v.id, marketCode: marketCode! } },
      select: { id: true },
    });
    if (!vm) {
      throw invalid(
        'market',
        'variantMarket',
        {
          ar: 'الفئة غير مسجلة في هذا السوق؛ استورد التوافر أولًا.',
          en: 'The variant has no record in this market; import its availability first.',
        },
        lang,
      );
    }
    const sourceId = await this.sourceOf(row, ctx);
    const existing = await tx.priceHistory.findFirst({
      where: {
        variantId: v.id,
        marketCode: marketCode!,
        priceType: priceType!,
        currencyCode: currency!,
        effectiveFrom: from!,
      },
    });
    const effectiveSource = sourceId !== undefined ? sourceId : (existing?.sourceId ?? null);
    if (priceType !== PriceType.market_estimate) {
      if (currency !== market!.currencyCode) {
        throw invalid(
          'currency',
          'marketCurrency',
          {
            ar: `السعر الرسمي أو سعر الوكيل يجب أن يكون بعملة السوق (${market!.currencyCode}). السعر المحوَّل يُسجل كتقدير سوق فقط.`,
            en: `Official and dealer prices must be in the market currency (${market!.currencyCode}). A converted price can only be a market estimate.`,
          },
          lang,
        );
      }
      if (!effectiveSource) {
        throw invalid(
          'source_id',
          'required',
          {
            ar: 'السعر الرسمي وسعر الوكيل يحتاجان مصدرًا.',
            en: 'Official and dealer prices need a source.',
          },
          lang,
        );
      }
    }
    const effectiveTo = to ?? existing?.effectiveTo ?? null;
    if (effectiveTo && effectiveTo < from!) {
      throw invalid(
        'effective_to',
        'order',
        { ar: 'تاريخ النهاية قبل البداية.', en: 'End date before start date.' },
        lang,
      );
    }
    const valueChanged = existing ? !sameNumber(existing.amount, amountNum) : true;
    const dp = resolveDataPoint(
      { ...dpCells, ...(sourceId !== undefined ? { sourceId } : {}) },
      existing,
      { valueChanged, actor },
    );
    const input = {
      marketCode: marketCode!,
      amount: String(amountNum),
      currencyCode: currency!,
      priceType: priceType!,
      effectiveFrom: from!,
      effectiveTo,
      sourceId: dp.sourceId,
    };
    if (existing) {
      const same =
        !valueChanged &&
        (existing.effectiveTo?.getTime() ?? null) === (effectiveTo?.getTime() ?? null) &&
        existing.sourceId === dp.sourceId &&
        existing.reliability === dp.reliability &&
        (existing.verifiedAt?.getTime() ?? null) === (dp.verifiedAt?.getTime() ?? null) &&
        (notes === undefined || existing.notes === notes);
      if (same)
        return {
          action: 'unchanged',
          entityType: 'price',
          entityId: existing.id,
          modelId: v.modelId,
        };
      await this.prices.prepareOfficialPeriod(tx, v.id, input, {
        closePrevious: false,
        exceptId: existing.id,
      });
      await tx.priceHistory.update({
        where: { id: existing.id },
        data: { ...input, ...dp, notes: notes ?? existing.notes },
      });
      return { action: 'update', entityType: 'price', entityId: existing.id, modelId: v.modelId };
    }
    await this.prices.prepareOfficialPeriod(tx, v.id, input, { closePrevious: true });
    const created = await tx.priceHistory.create({
      data: { variantId: v.id, ...input, ...dp, notes: notes ?? null, createdById: actor.id },
    });
    return { action: 'create', entityType: 'price', entityId: created.id, modelId: v.modelId };
  }
}
