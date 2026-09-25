import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  ContentStatus,
  CurrentType,
  PowertrainType,
  type ConsumptionMode,
  type DriveSide,
  type MarketAvailability,
  type Reliability,
  type VehicleMediaKind,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { CatalogErrors, fieldError, Msg } from '../common/catalog-errors';
import { can, resolveDataPoint, type Actor } from '../common/data-point';
import { VERIFY_PERMISSION } from '../common/catalog-constants';
import {
  assertChargingApplicable,
  normalizeChargingTime,
  normalizeConsumption,
  normalizeCurvePoints,
  normalizeRange,
} from '../common/measurements';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../common/media-urls';
import { normalizeSpecValue, specValueChanged } from '../common/spec-values';
import {
  cleanText,
  parseDateOnly,
  round,
  sameNumber,
  todayIn,
  toIso,
  toIsoDate,
  toNum,
} from '../common/values';
import {
  chargingTimeView,
  consumptionView,
  curveView,
  inletView,
  metaOf,
  priceView,
  rangeView,
  sortPriceHistory,
  sortRanges,
  sourceView,
} from '../common/views';
import type {
  AdminSpecValueDto,
  AdminVariantDetailDto,
  AdminVariantMarketDto,
  AdminVehicleMediaDto,
  CreateChargingCurveDto,
  CreateChargingTimeDto,
  CreateConsumptionDto,
  CreateRangeDto,
  CreateVehicleMediaDto,
  ReplaceInletsDto,
  SpecDefinitionDto,
  SpecValueWriteDto,
  UpdateChargingCurveDto,
  UpdateChargingTimeDto,
  UpdateConsumptionDto,
  UpdateRangeDto,
  UpdateVehicleMediaDto,
  UpsertVariantMarketDto,
  VehicleMediaQueryDto,
} from '../dto/admin-data.dto';
import type {
  ChargingCurveDto,
  ChargingTimeDto,
  ConsumptionDto,
  RangeDto,
} from '../dto/shared.dto';
import { VehicleSearchIndexer } from '../search/vehicle-search-indexer';
import { AdminCatalogService } from './admin-catalog.service';
import { AssetGuard } from './asset-guard';

const SRC = { source: true } as const;

type Tx = Prisma.TransactionClient;

/** Current verification fields of a stored row. */
function dpOf(row: { sourceId: string | null; reliability: Reliability; verifiedAt: Date | null }) {
  return { sourceId: row.sourceId, reliability: row.reliability, verifiedAt: row.verifiedAt };
}

/**
 * Admin writes of the data attached to a variant: specs, ranges,
 * consumption, charging curves / times, market availability + inlets and
 * gallery images. Validation happens here first (units, SoC windows,
 * powertrain rules, verification rights); the database re-checks the
 * critical rules (CHECKs / triggers) as a safety net.
 */
@Injectable()
export class AdminDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaUrlService,
    private readonly assets: AssetGuard,
    private readonly search: VehicleSearchIndexer,
    private readonly catalog: AdminCatalogService,
  ) {}

  /** Variant being edited (404 unknown, 409 soft-deleted). */
  async editableVariant(id: string) {
    const v = await this.prisma.vehicleVariant.findUnique({
      where: { id },
      select: {
        id: true,
        powertrainType: true,
        deletedAt: true,
        modelYear: { select: { generation: { select: { modelId: true } } } },
      },
    });
    if (!v) throw CatalogErrors.notFound('variant');
    if (v.deletedAt) throw CatalogErrors.deleted('variant');
    return { id: v.id, powertrainType: v.powertrainType, modelId: v.modelYear.generation.modelId };
  }

  async assertVariantExists(id: string): Promise<void> {
    const v = await this.prisma.vehicleVariant.findUnique({ where: { id }, select: { id: true } });
    if (!v) throw CatalogErrors.notFound('variant');
  }

  // ------------------------------------------------------------------ detail

  async getVariantDetail(id: string): Promise<AdminVariantDetailDto> {
    const base = this.catalog.variantView(await this.catalog.getVariantRow(id));
    const [markets, specs, ranges, consumption, curves, times, prices, media, tourCount] =
      await Promise.all([
        this.listMarkets(id),
        this.listSpecs(id),
        this.prisma.rangeMeasurement.findMany({ where: { variantId: id }, include: SRC }),
        this.prisma.consumptionMeasurement.findMany({
          where: { variantId: id },
          include: SRC,
          orderBy: [{ kind: 'asc' }, { cycle: 'asc' }],
        }),
        this.prisma.chargingCurve.findMany({
          where: { variantId: id },
          include: { source: true, points: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.chargingTimeMeasurement.findMany({
          where: { variantId: id },
          include: SRC,
          orderBy: [{ currentType: 'asc' }, { fromSoc: 'asc' }, { toSoc: 'asc' }],
        }),
        this.prisma.priceHistory.findMany({
          where: { variantId: id },
          include: { source: true, market: true },
        }),
        this.listMedia({ variantId: id }),
        this.prisma.interiorTour.count({ where: { variantId: id, deletedAt: null } }),
      ]);
    return {
      ...base,
      markets,
      specs,
      ranges: sortRanges(ranges.map(rangeView)),
      consumption: consumption.map(consumptionView),
      chargingCurves: curves.map(curveView),
      chargingTimes: times.map(chargingTimeView),
      prices: sortPriceHistory(prices).map((p) =>
        priceView(p, 'en', todayIn(p.market.timezone), p.market.currencyCode),
      ),
      media,
      tourCount,
    };
  }

  // ------------------------------------------------------------------ specs

  async listSpecDefinitions(): Promise<SpecDefinitionDto[]> {
    const rows = await this.prisma.specDefinition.findMany({
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { key: 'asc' }],
    });
    return rows.map((d) => ({
      key: d.key,
      group: d.group,
      dataType: d.dataType,
      unit: d.unit,
      betterDirection: d.betterDirection,
      labelEn: d.labelEn,
      labelAr: d.labelAr,
      descriptionEn: d.descriptionEn,
      descriptionAr: d.descriptionAr,
      isKeySpec: d.isKeySpec,
      isComparable: d.isComparable,
      sortOrder: d.sortOrder,
    }));
  }

  async listSpecs(variantId: string): Promise<AdminSpecValueDto[]> {
    const rows = await this.prisma.vehicleSpecification.findMany({
      where: { variantId },
      include: { source: true, definition: true },
    });
    rows.sort(
      (a, b) =>
        a.definition.group.localeCompare(b.definition.group) ||
        a.definition.sortOrder - b.definition.sortOrder ||
        a.specKey.localeCompare(b.specKey) ||
        (a.marketCode ?? '').localeCompare(b.marketCode ?? ''),
    );
    return rows.map((r) => ({
      id: r.id,
      specKey: r.specKey,
      group: r.definition.group,
      labelEn: r.definition.labelEn,
      labelAr: r.definition.labelAr,
      value: (toNum(r.valueNum) ?? r.valueText ?? r.valueBool) as number | string | boolean,
      unit: r.unit,
      originalValue: r.originalValue,
      originalUnit: r.originalUnit,
      marketCode: r.marketCode,
      derived: false,
      notes: r.notes,
      updatedAt: r.updatedAt.toISOString(),
      ...metaOf(r),
    }));
  }

  /**
   * Upserts spec values by (spec key, market scope). Values are converted to
   * the definition's canonical unit; `originalValue/originalUnit` keep the
   * published form. One transaction for the whole batch.
   */
  async upsertSpecs(
    variantId: string,
    items: SpecValueWriteDto[],
    actor: Actor,
  ): Promise<AdminSpecValueDto[]> {
    const v = await this.editableVariant(variantId);
    const keys = [...new Set(items.map((i) => i.specKey))];
    const defs = new Map(
      (await this.prisma.specDefinition.findMany({ where: { key: { in: keys } } })).map((d) => [
        d.key,
        d,
      ]),
    );
    const scopes = new Set<string>();
    items.forEach((item, i) => {
      if (!defs.has(item.specKey)) {
        throw fieldError(`items.${i}.specKey`, 'exists', {
          ar: `مفتاح المواصفة "${item.specKey}" غير معروف.`,
          en: `Unknown spec key "${item.specKey}".`,
        });
      }
      const scope = `${item.specKey}@${item.marketCode ?? '*'}`;
      if (scopes.has(scope)) {
        throw fieldError(`items.${i}.specKey`, 'unique', {
          ar: 'تكررت المواصفة نفسها للسوق نفسه في الطلب.',
          en: 'The same spec and market appear twice in the request.',
        });
      }
      scopes.add(scope);
    });
    await this.assets.assertMarkets(
      items.map((i) => i.marketCode),
      (i) => `items.${i}.marketCode`,
    );
    await this.assets.assertSources(
      items.map((i) => i.sourceId),
      (i) => `items.${i}.sourceId`,
    );
    const normalized = items.map((item, i) => {
      const def = defs.get(item.specKey)!;
      if (def.group === 'charging' && v.powertrainType === PowertrainType.HEV) {
        assertChargingApplicable(v.powertrainType);
      }
      return normalizeSpecValue(def, item, `items.${i}.`);
    });

    const before: unknown[] = [];
    const after: unknown[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const [i, item] of items.entries()) {
        const value = normalized[i];
        const marketCode = item.marketCode ?? null;
        const existing = await tx.vehicleSpecification.findFirst({
          where: { variantId, specKey: item.specKey, marketCode },
        });
        const dp = resolveDataPoint(item, existing ? dpOf(existing) : null, {
          valueChanged: existing ? specValueChanged(existing, value) : true,
          actor,
          fieldPrefix: `items.${i}.`,
        });
        const data = {
          ...value,
          sourceId: dp.sourceId,
          reliability: dp.reliability,
          verifiedAt: dp.verifiedAt,
          notes: item.notes === undefined ? (existing?.notes ?? null) : cleanText(item.notes, true),
          updatedById: actor.id,
        };
        if (existing) {
          before.push(existing);
          after.push(await tx.vehicleSpecification.update({ where: { id: existing.id }, data }));
        } else {
          after.push(
            await tx.vehicleSpecification.create({
              data: { variantId, specKey: item.specKey, marketCode, ...data },
            }),
          );
        }
      }
    });
    this.audit.annotate({
      entityType: 'variant',
      entityId: variantId,
      action: 'variants.specs.upsert',
      before,
      after,
    });
    return this.listSpecs(variantId);
  }

  async deleteSpec(variantId: string, specKey: string, marketCode: string | null): Promise<void> {
    await this.editableVariant(variantId);
    const row = await this.prisma.vehicleSpecification.findFirst({
      where: { variantId, specKey, marketCode },
    });
    if (!row) throw CatalogErrors.notFound('spec');
    await this.prisma.vehicleSpecification.delete({ where: { id: row.id } });
    this.audit.annotate({
      entityType: 'variant',
      entityId: variantId,
      action: 'variants.specs.delete',
      before: row,
    });
  }

  // ------------------------------------------------------------------ ranges

  private async assertRangeUnique(
    variantId: string,
    r: {
      marketCode: string | null;
      cycle: string;
      cycleNote: string | null;
      rangeType: string;
      wheelSizeInch: number | null;
    },
    exceptId?: string,
  ) {
    const rows = await this.prisma.rangeMeasurement.findMany({
      where: {
        variantId,
        marketCode: r.marketCode,
        cycle: r.cycle as never,
        rangeType: r.rangeType as never,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    const dup = rows.find(
      (x) =>
        (x.cycleNote ?? '') === (r.cycleNote ?? '') && sameNumber(x.wheelSizeInch, r.wheelSizeInch),
    );
    if (dup) throw CatalogErrors.exists('range', { id: dup.id });
  }

  async createRange(variantId: string, dto: CreateRangeDto, actor: Actor): Promise<RangeDto> {
    const v = await this.editableVariant(variantId);
    const n = normalizeRange(dto, v.powertrainType);
    const marketCode = dto.marketCode ?? null;
    if (marketCode) await this.assets.market(marketCode);
    await this.assets.assertSource(dto.sourceId);
    await this.assertRangeUnique(variantId, { ...n, marketCode });
    const dp = resolveDataPoint(dto, null, { valueChanged: true, actor });
    const row = await this.prisma.rangeMeasurement.create({
      data: { variantId, marketCode, ...n, ...dp },
      include: SRC,
    });
    this.audit.annotate({
      entityType: 'range',
      entityId: row.id,
      after: { ...row, source: undefined },
    });
    return rangeView(row);
  }

  async updateRange(id: string, dto: UpdateRangeDto, actor: Actor): Promise<RangeDto> {
    const before = await this.prisma.rangeMeasurement.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('range');
    const v = await this.editableVariant(before.variantId);
    const n = normalizeRange(
      {
        cycle: dto.cycle ?? before.cycle,
        cycleNote: dto.cycleNote !== undefined ? dto.cycleNote : before.cycleNote,
        rangeType: dto.rangeType ?? before.rangeType,
        value: dto.value ?? (toNum(before.valueKm) as number),
        unit: dto.value !== undefined ? dto.unit : null,
        originalValue:
          dto.originalValue !== undefined
            ? dto.originalValue
            : dto.value !== undefined
              ? null
              : before.originalValue,
        originalUnit:
          dto.originalUnit !== undefined
            ? dto.originalUnit
            : dto.value !== undefined
              ? null
              : before.originalUnit,
        wheelSizeInch:
          dto.wheelSizeInch !== undefined ? dto.wheelSizeInch : toNum(before.wheelSizeInch),
        conditions: dto.conditions !== undefined ? dto.conditions : before.conditions,
      },
      v.powertrainType,
    );
    const marketCode = dto.marketCode !== undefined ? dto.marketCode : before.marketCode;
    if (marketCode && marketCode !== before.marketCode) await this.assets.market(marketCode);
    await this.assets.assertSource(dto.sourceId);
    await this.assertRangeUnique(before.variantId, { ...n, marketCode }, id);
    const valueChanged =
      !sameNumber(before.valueKm, n.valueKm) ||
      before.cycle !== n.cycle ||
      before.rangeType !== n.rangeType ||
      (before.cycleNote ?? '') !== (n.cycleNote ?? '') ||
      !sameNumber(before.wheelSizeInch, n.wheelSizeInch) ||
      before.marketCode !== marketCode;
    const dp = resolveDataPoint(dto, dpOf(before), { valueChanged, actor });
    const row = await this.prisma.rangeMeasurement.update({
      where: { id },
      data: { marketCode, ...n, ...dp },
      include: SRC,
    });
    this.audit.annotate({
      entityType: 'range',
      entityId: id,
      before,
      after: { ...row, source: undefined },
    });
    return rangeView(row);
  }

  async deleteRange(id: string): Promise<void> {
    const before = await this.prisma.rangeMeasurement.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('range');
    await this.prisma.rangeMeasurement.delete({ where: { id } });
    this.audit.annotate({ entityType: 'range', entityId: id, before });
  }

  // ------------------------------------------------------------------ consumption

  async createConsumption(
    variantId: string,
    dto: CreateConsumptionDto,
    actor: Actor,
  ): Promise<ConsumptionDto> {
    const v = await this.editableVariant(variantId);
    const n = normalizeConsumption(dto, v.powertrainType);
    const marketCode = dto.marketCode ?? null;
    if (marketCode) await this.assets.market(marketCode);
    await this.assets.assertSource(dto.sourceId);
    const dp = resolveDataPoint(dto, null, { valueChanged: true, actor });
    const row = await this.prisma.consumptionMeasurement.create({
      data: { variantId, marketCode, ...n, mode: n.mode as ConsumptionMode | null, ...dp },
      include: SRC,
    });
    this.audit.annotate({
      entityType: 'consumption',
      entityId: row.id,
      after: { ...row, source: undefined },
    });
    return consumptionView(row);
  }

  async updateConsumption(
    id: string,
    dto: UpdateConsumptionDto,
    actor: Actor,
  ): Promise<ConsumptionDto> {
    const before = await this.prisma.consumptionMeasurement.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('consumption');
    const v = await this.editableVariant(before.variantId);
    const kindChanged = dto.kind !== undefined && dto.kind !== before.kind;
    const n = normalizeConsumption(
      {
        cycle: dto.cycle ?? before.cycle,
        cycleNote: dto.cycleNote !== undefined ? dto.cycleNote : before.cycleNote,
        kind: dto.kind ?? before.kind,
        mode: dto.mode !== undefined ? dto.mode : before.mode,
        value: dto.value ?? (toNum(before.value) as number),
        unit: dto.value !== undefined ? dto.unit : null,
        originalValue:
          dto.originalValue !== undefined
            ? dto.originalValue
            : dto.value !== undefined || kindChanged
              ? null
              : before.originalValue,
        originalUnit:
          dto.originalUnit !== undefined
            ? dto.originalUnit
            : dto.value !== undefined || kindChanged
              ? null
              : before.originalUnit,
        conditions: dto.conditions !== undefined ? dto.conditions : before.conditions,
      },
      v.powertrainType,
    );
    if (kindChanged && dto.value === undefined) {
      throw fieldError('value', 'required', {
        ar: 'عند تغيير نوع الاستهلاك أرسل القيمة الجديدة بوحدتها.',
        en: 'Send the new value (with its unit) when changing the consumption kind.',
      });
    }
    const marketCode = dto.marketCode !== undefined ? dto.marketCode : before.marketCode;
    if (marketCode && marketCode !== before.marketCode) await this.assets.market(marketCode);
    await this.assets.assertSource(dto.sourceId);
    const valueChanged =
      !sameNumber(before.value, n.value) ||
      before.cycle !== n.cycle ||
      before.kind !== n.kind ||
      before.mode !== n.mode ||
      before.marketCode !== marketCode;
    const dp = resolveDataPoint(dto, dpOf(before), { valueChanged, actor });
    const row = await this.prisma.consumptionMeasurement.update({
      where: { id },
      data: { marketCode, ...n, mode: n.mode as ConsumptionMode | null, ...dp },
      include: SRC,
    });
    this.audit.annotate({
      entityType: 'consumption',
      entityId: id,
      before,
      after: { ...row, source: undefined },
    });
    return consumptionView(row);
  }

  async deleteConsumption(id: string): Promise<void> {
    const before = await this.prisma.consumptionMeasurement.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('consumption');
    await this.prisma.consumptionMeasurement.delete({ where: { id } });
    this.audit.annotate({ entityType: 'consumption', entityId: id, before });
  }

  // ------------------------------------------------------------------ charging curves

  async createCurve(
    variantId: string,
    dto: CreateChargingCurveDto,
    actor: Actor,
  ): Promise<ChargingCurveDto> {
    const v = await this.editableVariant(variantId);
    assertChargingApplicable(v.powertrainType);
    const points = normalizeCurvePoints(dto.points);
    await this.assets.assertSource(dto.sourceId);
    const dp = resolveDataPoint(dto, null, { valueChanged: true, actor });
    const row = await this.prisma.chargingCurve.create({
      data: {
        variantId,
        currentType: (dto.currentType as CurrentType | undefined) ?? CurrentType.DC,
        label: cleanText(dto.label),
        chargerMaxPowerKw: dto.chargerMaxPowerKw ?? null,
        batteryTempC: dto.batteryTempC ?? null,
        preconditioned: dto.preconditioned ?? null,
        conditions: cleanText(dto.conditions, true),
        ...dp,
        points: { create: points },
      },
      include: { source: true, points: true },
    });
    this.audit.annotate({ entityType: 'charging_curve', entityId: row.id, after: curveView(row) });
    return curveView(row);
  }

  async updateCurve(
    id: string,
    dto: UpdateChargingCurveDto,
    actor: Actor,
  ): Promise<ChargingCurveDto> {
    const before = await this.prisma.chargingCurve.findUnique({
      where: { id },
      include: { source: true, points: true },
    });
    if (!before) throw CatalogErrors.notFound('charging_curve');
    const v = await this.editableVariant(before.variantId);
    assertChargingApplicable(v.powertrainType);
    const points = dto.points ? normalizeCurvePoints(dto.points) : null;
    await this.assets.assertSource(dto.sourceId);
    const oldPoints = curveView(before).points;
    const valueChanged =
      (points !== null && JSON.stringify(points) !== JSON.stringify(oldPoints)) ||
      (dto.currentType !== undefined && dto.currentType !== before.currentType) ||
      (dto.chargerMaxPowerKw !== undefined &&
        !sameNumber(before.chargerMaxPowerKw, dto.chargerMaxPowerKw));
    const dp = resolveDataPoint(dto, dpOf(before), { valueChanged, actor });
    const row = await this.prisma.$transaction(async (tx: Tx) => {
      if (points) {
        await tx.chargingCurvePoint.deleteMany({ where: { curveId: id } });
        await tx.chargingCurvePoint.createMany({
          data: points.map((p) => ({ curveId: id, ...p })),
        });
      }
      return tx.chargingCurve.update({
        where: { id },
        data: {
          currentType: dto.currentType as CurrentType | undefined,
          label: dto.label === undefined ? undefined : cleanText(dto.label),
          chargerMaxPowerKw: dto.chargerMaxPowerKw,
          batteryTempC: dto.batteryTempC,
          preconditioned: dto.preconditioned,
          conditions: dto.conditions === undefined ? undefined : cleanText(dto.conditions, true),
          ...dp,
        },
        include: { source: true, points: true },
      });
    });
    this.audit.annotate({
      entityType: 'charging_curve',
      entityId: id,
      before: curveView(before),
      after: curveView(row),
    });
    return curveView(row);
  }

  async deleteCurve(id: string): Promise<void> {
    const before = await this.prisma.chargingCurve.findUnique({
      where: { id },
      include: { source: true, points: true },
    });
    if (!before) throw CatalogErrors.notFound('charging_curve');
    await this.prisma.chargingCurve.delete({ where: { id } });
    this.audit.annotate({ entityType: 'charging_curve', entityId: id, before: curveView(before) });
  }

  // ------------------------------------------------------------------ charging times

  async createTime(
    variantId: string,
    dto: CreateChargingTimeDto,
    actor: Actor,
  ): Promise<ChargingTimeDto> {
    const v = await this.editableVariant(variantId);
    const n = normalizeChargingTime(dto, v.powertrainType);
    await this.assets.assertSource(dto.sourceId);
    const dp = resolveDataPoint(dto, null, { valueChanged: true, actor });
    const row = await this.prisma.chargingTimeMeasurement.create({
      data: { variantId, ...n, ...dp },
      include: SRC,
    });
    this.audit.annotate({
      entityType: 'charging_time',
      entityId: row.id,
      after: { ...row, source: undefined },
    });
    return chargingTimeView(row);
  }

  async updateTime(id: string, dto: UpdateChargingTimeDto, actor: Actor): Promise<ChargingTimeDto> {
    const before = await this.prisma.chargingTimeMeasurement.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('charging_time');
    const v = await this.editableVariant(before.variantId);
    const pick = <T>(next: T | undefined, prev: T): T => (next !== undefined ? next : prev);
    const n = normalizeChargingTime(
      {
        currentType: pick(dto.currentType, before.currentType),
        fromSoc: pick(dto.fromSoc, toNum(before.fromSoc) as number),
        toSoc: pick(dto.toSoc, toNum(before.toSoc) as number),
        duration: dto.duration ?? (toNum(before.durationMinutes) as number),
        durationUnit: dto.duration !== undefined ? dto.durationUnit : 'min',
        chargerPowerKw: pick(dto.chargerPowerKw, toNum(before.chargerPowerKw)),
        peakPowerKw: pick(dto.peakPowerKw, toNum(before.peakPowerKw)),
        averagePowerKw: pick(dto.averagePowerKw, toNum(before.averagePowerKw)),
        onboardChargerLimitKw: pick(dto.onboardChargerLimitKw, toNum(before.onboardChargerLimitKw)),
        conditions: pick(dto.conditions, before.conditions),
      },
      v.powertrainType,
    );
    await this.assets.assertSource(dto.sourceId);
    const valueChanged =
      before.currentType !== n.currentType ||
      !sameNumber(before.fromSoc, n.fromSoc) ||
      !sameNumber(before.toSoc, n.toSoc) ||
      !sameNumber(before.durationMinutes, n.durationMinutes) ||
      !sameNumber(before.chargerPowerKw, n.chargerPowerKw) ||
      !sameNumber(before.peakPowerKw, n.peakPowerKw) ||
      !sameNumber(before.averagePowerKw, n.averagePowerKw);
    const dp = resolveDataPoint(dto, dpOf(before), { valueChanged, actor });
    const row = await this.prisma.chargingTimeMeasurement.update({
      where: { id },
      data: { ...n, ...dp },
      include: SRC,
    });
    this.audit.annotate({
      entityType: 'charging_time',
      entityId: id,
      before,
      after: { ...row, source: undefined },
    });
    return chargingTimeView(row);
  }

  async deleteTime(id: string): Promise<void> {
    const before = await this.prisma.chargingTimeMeasurement.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('charging_time');
    await this.prisma.chargingTimeMeasurement.delete({ where: { id } });
    this.audit.annotate({ entityType: 'charging_time', entityId: id, before });
  }

  // ------------------------------------------------------------------ markets & inlets

  async listMarkets(variantId: string): Promise<AdminVariantMarketDto[]> {
    const rows = await this.prisma.variantMarket.findMany({
      where: { variantId },
      include: {
        source: true,
        market: { select: { sortOrder: true } },
        inlets: {
          include: { source: true, connectorType: true },
          orderBy: [{ currentType: 'asc' }, { connectorTypeCode: 'asc' }],
        },
      },
    });
    rows.sort(
      (a, b) => a.market.sortOrder - b.market.sortOrder || a.marketCode.localeCompare(b.marketCode),
    );
    return rows.map((m) => ({
      id: m.id,
      marketCode: m.marketCode,
      availability: m.availability,
      localNameEn: m.localNameEn,
      localNameAr: m.localNameAr,
      driveSide: m.driveSide,
      launchDate: toIsoDate(m.launchDate),
      discontinuedAt: toIsoDate(m.discontinuedAt),
      source: sourceView(m.source),
      verifiedAt: toIso(m.verifiedAt),
      notes: m.notes,
      inlets: m.inlets.map((i) => inletView(i, 'en')),
    }));
  }

  async upsertMarket(
    variantId: string,
    marketCode: string,
    dto: UpsertVariantMarketDto,
    actor: Actor,
  ): Promise<AdminVariantMarketDto[]> {
    const v = await this.editableVariant(variantId);
    await this.assets.market(marketCode);
    await this.assets.assertSource(dto.sourceId);
    const before = await this.prisma.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId, marketCode } },
    });
    const launchDate =
      dto.launchDate !== undefined
        ? dto.launchDate && parseDateOnly(dto.launchDate)
        : (before?.launchDate ?? null);
    const discontinuedAt =
      dto.discontinuedAt !== undefined
        ? dto.discontinuedAt && parseDateOnly(dto.discontinuedAt)
        : (before?.discontinuedAt ?? null);
    if (launchDate && discontinuedAt && discontinuedAt < launchDate) {
      throw fieldError('discontinuedAt', 'order', {
        ar: 'تاريخ التوقف يجب ألا يسبق تاريخ الإطلاق.',
        en: 'The discontinuation date cannot be before the launch date.',
      });
    }
    const sourceId = dto.sourceId !== undefined ? dto.sourceId : (before?.sourceId ?? null);
    const verifiedAt =
      dto.verifiedAt !== undefined
        ? dto.verifiedAt
          ? new Date(dto.verifiedAt)
          : null
        : (before?.verifiedAt ?? null);
    const availabilityChanged = !before || before.availability !== dto.availability;
    let finalVerifiedAt = verifiedAt;
    if (before?.verifiedAt && dto.verifiedAt === undefined && availabilityChanged) {
      finalVerifiedAt = null; // a verification never covers a changed availability
    }
    if (finalVerifiedAt) {
      if (finalVerifiedAt.getTime() > Date.now() + 5 * 60_000) {
        throw fieldError('verifiedAt', 'notFuture', Msg.futureDate);
      }
      if (!sourceId) throw fieldError('sourceId', 'verifiedNeedsSource', Msg.verifiedNeedsSource);
      const unchanged =
        before?.verifiedAt?.getTime() === finalVerifiedAt.getTime() && !availabilityChanged;
      if (!unchanged && !can(actor, VERIFY_PERMISSION)) throw CatalogErrors.verifyPermission();
    }
    const data = {
      availability: dto.availability as MarketAvailability,
      localNameEn:
        dto.localNameEn !== undefined ? cleanText(dto.localNameEn) : (before?.localNameEn ?? null),
      localNameAr:
        dto.localNameAr !== undefined ? cleanText(dto.localNameAr) : (before?.localNameAr ?? null),
      driveSide:
        dto.driveSide !== undefined
          ? (dto.driveSide as DriveSide | null)
          : (before?.driveSide ?? null),
      launchDate,
      discontinuedAt,
      sourceId,
      verifiedAt: finalVerifiedAt,
      notes: dto.notes !== undefined ? cleanText(dto.notes, true) : (before?.notes ?? null),
    };
    const after = await this.prisma.variantMarket.upsert({
      where: { variantId_marketCode: { variantId, marketCode } },
      create: { variantId, marketCode, ...data },
      update: data,
    });
    this.audit.annotate({
      entityType: 'variant',
      entityId: variantId,
      action: 'variants.markets.upsert',
      before,
      after,
    });
    await this.search.reindexModel(v.modelId);
    return this.listMarkets(variantId);
  }

  async deleteMarket(variantId: string, marketCode: string): Promise<void> {
    const v = await this.editableVariant(variantId);
    const before = await this.prisma.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId, marketCode } },
      include: { inlets: true },
    });
    if (!before) throw CatalogErrors.notFound('variant_market');
    const [comparisons, tours] = await Promise.all([
      this.prisma.comparisonItem.count({ where: { variantId, marketCode } }),
      this.prisma.interiorTour.count({
        where: { variantId, marketCode, status: ContentStatus.published, deletedAt: null },
      }),
    ]);
    if (comparisons + tours > 0) {
      throw CatalogErrors.inUse('variant_market', { comparisons, publishedTours: tours });
    }
    await this.prisma.variantMarket.delete({ where: { id: before.id } });
    this.audit.annotate({
      entityType: 'variant',
      entityId: variantId,
      action: 'variants.markets.delete',
      before,
    });
    await this.search.reindexModel(v.modelId);
  }

  async replaceInlets(
    variantId: string,
    marketCode: string,
    dto: ReplaceInletsDto,
    actor: Actor,
  ): Promise<AdminVariantMarketDto[]> {
    const v = await this.editableVariant(variantId);
    if (dto.inlets.length > 0) assertChargingApplicable(v.powertrainType);
    const vm = await this.prisma.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId, marketCode } },
      include: { inlets: true },
    });
    if (!vm) {
      throw fieldError('marketCode', 'variantMarket', {
        ar: 'أضف توافر الفئة في هذا السوق أولًا.',
        en: 'Add the variant to this market first.',
      });
    }
    const codes = [...new Set(dto.inlets.map((i) => i.connectorTypeCode))];
    const types = new Map(
      (await this.prisma.connectorType.findMany({ where: { code: { in: codes } } })).map((t) => [
        t.code,
        t,
      ]),
    );
    const seen = new Set<string>();
    dto.inlets.forEach((inlet, i) => {
      const t = types.get(inlet.connectorTypeCode);
      if (!t) {
        throw fieldError(`inlets.${i}.connectorTypeCode`, 'exists', {
          ar: 'نوع الموصل غير معروف.',
          en: 'Unknown connector type.',
        });
      }
      if (
        (inlet.currentType === 'AC' && !t.supportsAc) ||
        (inlet.currentType === 'DC' && !t.supportsDc)
      ) {
        throw fieldError(`inlets.${i}.currentType`, 'currentType', {
          ar: `الموصل ${t.nameAr} لا يدعم الشحن ${inlet.currentType}.`,
          en: `${t.nameEn} does not support ${inlet.currentType} charging.`,
        });
      }
      const key = `${inlet.connectorTypeCode}/${inlet.currentType}`;
      if (seen.has(key)) {
        throw fieldError(`inlets.${i}.connectorTypeCode`, 'unique', {
          ar: 'تكرر المنفذ نفسه.',
          en: 'The same inlet appears twice.',
        });
      }
      seen.add(key);
    });
    await this.assets.assertSources(
      dto.inlets.map((i) => i.sourceId),
      (i) => `inlets.${i}.sourceId`,
    );
    const existing = new Map(vm.inlets.map((i) => [`${i.connectorTypeCode}/${i.currentType}`, i]));
    const plans = dto.inlets.map((inlet, i) => {
      const prev = existing.get(`${inlet.connectorTypeCode}/${inlet.currentType}`) ?? null;
      const maxPowerKw =
        inlet.maxPowerKw === undefined || inlet.maxPowerKw === null
          ? null
          : round(inlet.maxPowerKw, 2);
      const dp = resolveDataPoint(inlet, prev ? dpOf(prev) : null, {
        valueChanged: prev ? !sameNumber(prev.maxPowerKw, maxPowerKw) : true,
        actor,
        fieldPrefix: `inlets.${i}.`,
      });
      return {
        prev,
        data: {
          connectorTypeCode: inlet.connectorTypeCode,
          currentType: inlet.currentType as CurrentType,
          maxPowerKw,
          notes: inlet.notes === undefined ? (prev?.notes ?? null) : cleanText(inlet.notes, true),
          ...dp,
        },
      };
    });
    await this.prisma.$transaction(async (tx: Tx) => {
      const keep = plans.filter((p) => p.prev).map((p) => p.prev!.id);
      await tx.variantMarketInlet.deleteMany({
        where: { variantMarketId: vm.id, id: { notIn: keep } },
      });
      for (const p of plans) {
        if (p.prev) {
          await tx.variantMarketInlet.update({ where: { id: p.prev.id }, data: p.data });
        } else {
          await tx.variantMarketInlet.create({ data: { variantMarketId: vm.id, ...p.data } });
        }
      }
    });
    this.audit.annotate({
      entityType: 'variant',
      entityId: variantId,
      action: 'variants.markets.inlets.update',
      before: vm.inlets,
      after: plans.map((p) => p.data),
    });
    return this.listMarkets(variantId);
  }

  // ------------------------------------------------------------------ gallery

  private mediaView(
    m: Prisma.VehicleMediaGetPayload<{
      include: { asset: { include: typeof IMAGE_ASSET_INCLUDE } };
    }>,
  ): AdminVehicleMediaDto {
    return {
      id: m.id,
      modelId: m.modelId,
      generationId: m.generationId,
      variantId: m.variantId,
      assetId: m.assetId,
      kind: m.kind,
      captionEn: m.captionEn,
      captionAr: m.captionAr,
      isCover: m.isCover,
      sortOrder: m.sortOrder,
      image: this.media.image(m.asset, 'en', { ar: m.captionAr, en: m.captionEn }),
    };
  }

  private mediaTarget(q: { modelId?: string; generationId?: string; variantId?: string }) {
    const targets = [q.modelId, q.generationId, q.variantId].filter(Boolean);
    if (targets.length !== 1) {
      throw fieldError('modelId', 'oneTarget', {
        ar: 'حدد هدفًا واحدًا فقط: الموديل أو الجيل أو الفئة.',
        en: 'Give exactly one of modelId, generationId or variantId.',
      });
    }
    return {
      modelId: q.modelId ?? null,
      generationId: q.generationId ?? null,
      variantId: q.variantId ?? null,
    };
  }

  async listMedia(q: VehicleMediaQueryDto): Promise<AdminVehicleMediaDto[]> {
    const target = this.mediaTarget(q);
    const rows = await this.prisma.vehicleMedia.findMany({
      where: target,
      include: { asset: { include: IMAGE_ASSET_INCLUDE } },
      orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((m) => this.mediaView(m));
  }

  async createMedia(dto: CreateVehicleMediaDto): Promise<AdminVehicleMediaDto> {
    const target = this.mediaTarget(dto);
    if (target.modelId) {
      const m = await this.prisma.carModel.findUnique({ where: { id: target.modelId } });
      if (!m || m.deletedAt)
        throw fieldError('modelId', 'exists', { ar: 'الموديل غير موجود.', en: 'Unknown model.' });
    } else if (target.generationId) {
      const g = await this.prisma.generation.findUnique({ where: { id: target.generationId } });
      if (!g || g.deletedAt) {
        throw fieldError('generationId', 'exists', {
          ar: 'الجيل غير موجود.',
          en: 'Unknown generation.',
        });
      }
    } else if (target.variantId) {
      await this.editableVariant(target.variantId);
    }
    await this.assets.assertImage(dto.assetId);
    const row = await this.prisma.$transaction(async (tx: Tx) => {
      if (dto.isCover) {
        await tx.vehicleMedia.updateMany({
          where: { ...target, isCover: true },
          data: { isCover: false },
        });
      }
      return tx.vehicleMedia.create({
        data: {
          ...target,
          assetId: dto.assetId,
          kind: (dto.kind as VehicleMediaKind | undefined) ?? 'gallery',
          captionEn: cleanText(dto.captionEn),
          captionAr: cleanText(dto.captionAr),
          isCover: dto.isCover ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { asset: { include: IMAGE_ASSET_INCLUDE } },
      });
    });
    this.audit.annotate({
      entityType: 'vehicle_media',
      entityId: row.id,
      after: this.mediaView(row),
    });
    return this.mediaView(row);
  }

  async updateMedia(id: string, dto: UpdateVehicleMediaDto): Promise<AdminVehicleMediaDto> {
    const before = await this.prisma.vehicleMedia.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('vehicle_media');
    const target = {
      modelId: before.modelId,
      generationId: before.generationId,
      variantId: before.variantId,
    };
    const row = await this.prisma.$transaction(async (tx: Tx) => {
      if (dto.isCover) {
        await tx.vehicleMedia.updateMany({
          where: { ...target, isCover: true, id: { not: id } },
          data: { isCover: false },
        });
      }
      return tx.vehicleMedia.update({
        where: { id },
        data: {
          kind: dto.kind as VehicleMediaKind | undefined,
          captionEn: dto.captionEn === undefined ? undefined : cleanText(dto.captionEn),
          captionAr: dto.captionAr === undefined ? undefined : cleanText(dto.captionAr),
          isCover: dto.isCover,
          sortOrder: dto.sortOrder,
        },
        include: { asset: { include: IMAGE_ASSET_INCLUDE } },
      });
    });
    this.audit.annotate({
      entityType: 'vehicle_media',
      entityId: id,
      before,
      after: this.mediaView(row),
    });
    return this.mediaView(row);
  }

  async deleteMedia(id: string): Promise<void> {
    const before = await this.prisma.vehicleMedia.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('vehicle_media');
    await this.prisma.vehicleMedia.delete({ where: { id } });
    this.audit.annotate({ entityType: 'vehicle_media', entityId: id, before });
  }
}
