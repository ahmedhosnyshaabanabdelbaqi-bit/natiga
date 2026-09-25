import { Injectable } from '@nestjs/common';
import type { Prisma, SpecificationSource } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { toIso, toIsoDate } from '../common/values';
import type { ExportQueryDto } from '../dto/import.dto';
import { toCsv } from './csv-codec';
import { TEMPLATES, type ImportType } from './templates';

type Cell = string | number | boolean | null | undefined;

const num = (v: { toString(): string } | null | undefined): string | null =>
  v === null || v === undefined ? null : String(Number(v.toString()));

function sourceCells(s: SpecificationSource | null): Record<string, Cell> {
  return {
    source_id: s?.id,
    source_url: s?.url,
    source_title: s?.title,
    source_type: s?.type,
  };
}

/**
 * Restricted CSV export (data.export + vehicles.read) in exactly the import
 * template columns, so an export can be edited and re-imported (identical
 * rows come back as "unchanged"). Drafts are included; demo rows only on
 * request. Every export is written to the audit log.
 */
@Injectable()
export class VehicleExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private variantWhere(q: ExportQueryDto): Prisma.VehicleVariantWhereInput {
    return {
      deletedAt: null,
      ...(q.includeDemo ? {} : { isDemo: false }),
      modelYear: {
        generation: {
          deletedAt: null,
          model: {
            deletedAt: null,
            ...(q.model ? { slug: q.model } : {}),
            brand: { deletedAt: null, ...(q.brand ? { slug: q.brand } : {}) },
          },
        },
      },
    };
  }

  private scoped(q: ExportQueryDto) {
    return q.marketCode ? { OR: [{ marketCode: null }, { marketCode: q.marketCode }] } : {};
  }

  async export(
    type: ImportType,
    q: ExportQueryDto,
    actorId: string | null,
  ): Promise<{ filename: string; csv: string; rows: number }> {
    const columns = TEMPLATES[type].columns.map((c) => c.name);
    const records = await this.rows(type, q);
    const csv = toCsv(
      columns,
      records.map((r) => columns.map((c) => r[c])),
    );
    await this.audit.record({
      action: 'vehicles.export',
      entityType: 'vehicles_export',
      entityId: null,
      actorId,
      after: { type, filters: q, rows: records.length },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `evcar-${type}-${stamp}.csv`, csv, rows: records.length };
  }

  private async rows(type: ImportType, q: ExportQueryDto): Promise<Record<string, Cell>[]> {
    const where = this.variantWhere(q);
    const slugOf = { variant: { select: { slug: true } } } as const;
    switch (type) {
      case 'variants': {
        const rows = await this.prisma.vehicleVariant.findMany({
          where,
          include: {
            modelYear: {
              include: { generation: { include: { model: { include: { brand: true } } } } },
            },
          },
          orderBy: [{ slug: 'asc' }],
        });
        return rows.map((v) => {
          const g = v.modelYear.generation;
          const m = g.model;
          return {
            brand_slug: m.brand.slug,
            brand_name_en: m.brand.nameEn,
            brand_name_ar: m.brand.nameAr,
            model_slug: m.slug,
            model_name_en: m.nameEn,
            model_name_ar: m.nameAr,
            body_type: m.bodyType,
            generation_slug: g.slug,
            generation_name_en: g.nameEn,
            generation_name_ar: g.nameAr,
            generation_code: g.code,
            generation_start_year: g.startYear,
            generation_end_year: g.endYear,
            year: v.modelYear.year,
            variant_slug: v.slug,
            variant_name_en: v.nameEn,
            variant_name_ar: v.nameAr,
            powertrain: v.powertrainType,
            trim_code: v.trimCode,
            drive: v.driveType,
            seats: v.seats,
            doors: v.doors,
            variant_body_type: v.bodyType,
            sort_order: v.sortOrder,
          };
        });
      }
      case 'variant_markets': {
        const rows = await this.prisma.variantMarket.findMany({
          where: { variant: where, ...(q.marketCode ? { marketCode: q.marketCode } : {}) },
          include: { ...slugOf, source: true },
          orderBy: [{ variant: { slug: 'asc' } }, { marketCode: 'asc' }],
        });
        return rows.map((r) => ({
          variant_slug: r.variant.slug,
          market: r.marketCode,
          availability: r.availability,
          local_name_en: r.localNameEn,
          local_name_ar: r.localNameAr,
          drive_side: r.driveSide,
          launch_date: toIsoDate(r.launchDate),
          discontinued_at: toIsoDate(r.discontinuedAt),
          ...sourceCells(r.source),
          verified_at: toIso(r.verifiedAt),
          notes: r.notes,
        }));
      }
      case 'specs': {
        const rows = await this.prisma.vehicleSpecification.findMany({
          where: { variant: where, ...this.scoped(q) },
          include: { ...slugOf, source: true },
          orderBy: [{ variant: { slug: 'asc' } }, { specKey: 'asc' }, { marketCode: 'asc' }],
        });
        return rows.map((r) => ({
          variant_slug: r.variant.slug,
          spec_key: r.specKey,
          market: r.marketCode,
          value:
            r.valueNum !== null
              ? num(r.valueNum)
              : (r.valueText ?? (r.valueBool === null ? null : String(r.valueBool))),
          unit: null,
          original_value: r.originalValue,
          original_unit: r.originalUnit,
          ...sourceCells(r.source),
          reliability: r.reliability,
          verified_at: toIso(r.verifiedAt),
          notes: r.notes,
        }));
      }
      case 'ranges': {
        const rows = await this.prisma.rangeMeasurement.findMany({
          where: { variant: where, ...this.scoped(q) },
          include: { ...slugOf, source: true },
          orderBy: [{ variant: { slug: 'asc' } }, { rangeType: 'asc' }, { cycle: 'asc' }],
        });
        return rows.map((r) => ({
          variant_slug: r.variant.slug,
          market: r.marketCode,
          cycle: r.cycle,
          cycle_note: r.cycleNote,
          range_type: r.rangeType,
          value: num(r.valueKm),
          unit: null,
          wheel_size_inch: num(r.wheelSizeInch),
          conditions: r.conditions,
          original_value: r.originalValue,
          original_unit: r.originalUnit,
          ...sourceCells(r.source),
          reliability: r.reliability,
          verified_at: toIso(r.verifiedAt),
        }));
      }
      case 'consumption': {
        const rows = await this.prisma.consumptionMeasurement.findMany({
          where: { variant: where, ...this.scoped(q) },
          include: { ...slugOf, source: true },
          orderBy: [{ variant: { slug: 'asc' } }, { kind: 'asc' }, { cycle: 'asc' }],
        });
        return rows.map((r) => ({
          variant_slug: r.variant.slug,
          market: r.marketCode,
          cycle: r.cycle,
          cycle_note: r.cycleNote,
          kind: r.kind,
          mode: r.mode,
          value: num(r.value),
          unit: null,
          conditions: r.conditions,
          original_value: r.originalValue,
          original_unit: r.originalUnit,
          ...sourceCells(r.source),
          reliability: r.reliability,
          verified_at: toIso(r.verifiedAt),
        }));
      }
      case 'charging_times': {
        const rows = await this.prisma.chargingTimeMeasurement.findMany({
          where: { variant: where },
          include: { ...slugOf, source: true },
          orderBy: [{ variant: { slug: 'asc' } }, { currentType: 'asc' }, { fromSoc: 'asc' }],
        });
        return rows.map((r) => ({
          variant_slug: r.variant.slug,
          current_type: r.currentType,
          from_soc: num(r.fromSoc),
          to_soc: num(r.toSoc),
          duration: num(r.durationMinutes),
          duration_unit: 'min',
          charger_power_kw: num(r.chargerPowerKw),
          peak_power_kw: num(r.peakPowerKw),
          average_power_kw: num(r.averagePowerKw),
          onboard_charger_limit_kw: num(r.onboardChargerLimitKw),
          conditions: r.conditions,
          ...sourceCells(r.source),
          reliability: r.reliability,
          verified_at: toIso(r.verifiedAt),
        }));
      }
      case 'prices': {
        const rows = await this.prisma.priceHistory.findMany({
          where: {
            variant: where,
            ...(q.includeDemo ? {} : { isDemo: false }),
            ...(q.marketCode ? { marketCode: q.marketCode } : {}),
          },
          include: { ...slugOf, source: true },
          orderBy: [{ variant: { slug: 'asc' } }, { marketCode: 'asc' }, { effectiveFrom: 'asc' }],
        });
        return rows.map((r) => ({
          variant_slug: r.variant.slug,
          market: r.marketCode,
          amount: r.amount.toFixed(2),
          currency: r.currencyCode,
          price_type: r.priceType,
          effective_from: toIsoDate(r.effectiveFrom),
          effective_to: toIsoDate(r.effectiveTo),
          ...sourceCells(r.source),
          reliability: r.reliability,
          verified_at: toIso(r.verifiedAt),
          notes: r.notes,
        }));
      }
    }
  }
}
