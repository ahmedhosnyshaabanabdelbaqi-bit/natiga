import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import {
  type FieldProblem,
  fieldError,
  fieldErrors,
  StationErrors,
} from '../common/station-errors';
import type { TariffDto } from '../dto/public.dto';
import type { CreateTariffDto, TariffElementInputDto, UpdateTariffDto } from '../dto/admin.dto';
import { StationDetailService } from './station-detail.service';

/** Unit allowed for each component (mirrors tariff_elements_unit_chk). */
export const UNITS_BY_COMPONENT: Record<string, readonly string[]> = {
  energy: ['per_kwh'],
  flat: ['per_session'],
  time: ['per_minute', 'per_hour'],
  parking_time: ['per_minute', 'per_hour'],
  idle: ['per_minute', 'per_hour'],
};

export function tariffElementProblems(elements: TariffElementInputDto[]): FieldProblem[] {
  const problems: FieldProblem[] = [];
  elements.forEach((e, i) => {
    if (!UNITS_BY_COMPONENT[e.componentType]?.includes(e.priceUnit)) {
      problems.push({
        field: `elements[${i}].priceUnit`,
        rule: 'unitForComponent',
        message: {
          ar: 'الوحدة لا تناسب نوع الرسوم (الطاقة لكل kWh، رسوم الجلسة لكل جلسة، الوقت والوقوف والخمول لكل دقيقة أو ساعة).',
          en: 'The unit does not fit the component (energy per kWh, session fee per session, time/parking/idle per minute or hour).',
        },
      });
    }
    if (
      e.minPowerKw !== undefined &&
      e.minPowerKw !== null &&
      e.maxPowerKw !== undefined &&
      e.maxPowerKw !== null &&
      e.minPowerKw > e.maxPowerKw
    ) {
      problems.push({
        field: `elements[${i}].minPowerKw`,
        rule: 'range',
        message: { ar: 'الحد الأدنى أكبر من الحد الأقصى.', en: 'Minimum is above maximum.' },
      });
    }
  });
  return problems;
}

const TARIFF_INCLUDE = {
  elements: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  source: { select: { id: true, title: true, publisher: true, url: true } },
} satisfies Prisma.TariffInclude;

/**
 * Station tariffs (REQUIREMENTS §10): price components with their unit
 * (per kWh / minute / hour / session), parking and idle fees, taxes,
 * currency, validity dates, source and reliability. Free-text prices from
 * a source stay in charging_stations.usage_cost_text and are never parsed.
 */
@Injectable()
export class StationTariffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly detail: StationDetailService,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  private async station(stationId: string) {
    const s = await this.prisma.chargingStation.findFirst({
      where: { id: stationId, deletedAt: null },
      select: { id: true },
    });
    if (!s) throw StationErrors.notFound();
  }

  async list(stationId: string, lang: SupportedLanguage): Promise<TariffDto[]> {
    await this.station(stationId);
    const rows = await this.prisma.tariff.findMany({
      where: { stationId },
      include: TARIFF_INCLUDE,
      orderBy: [{ validFrom: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    const now = this.clock.now();
    return rows.map((t) => this.detail.tariffDto(t, now, lang));
  }

  private async get(stationId: string, tariffId: string, lang: SupportedLanguage) {
    const t = await this.prisma.tariff.findFirst({
      where: { id: tariffId, stationId },
      include: TARIFF_INCLUDE,
    });
    if (!t) throw StationErrors.notFound('tariff');
    return this.detail.tariffDto(t, this.clock.now(), lang);
  }

  private async validate(
    stationId: string,
    next: {
      currencyCode: string;
      chargingPointId: string | null;
      connectorId: string | null;
      sourceId: string | null;
      validFrom: string | null;
      validTo: string | null;
      elements?: TariffElementInputDto[];
    },
  ): Promise<void> {
    const problems: FieldProblem[] = next.elements ? tariffElementProblems(next.elements) : [];
    if (next.validFrom && next.validTo && new Date(next.validTo) <= new Date(next.validFrom)) {
      problems.push({
        field: 'validTo',
        rule: 'afterValidFrom',
        message: { ar: 'يجب أن ينتهي السريان بعد بدايته.', en: 'validTo must be after validFrom.' },
      });
    }
    if (problems.length > 0) throw fieldErrors(problems);
    const currency = await this.prisma.currency.findUnique({
      where: { code: next.currencyCode },
      select: { code: true },
    });
    if (!currency) {
      throw fieldError('currencyCode', 'exists', {
        ar: 'العملة غير مسجلة.',
        en: 'Unknown currency.',
      });
    }
    if (next.chargingPointId) {
      const p = await this.prisma.chargingPoint.findFirst({
        where: { id: next.chargingPointId, stationId },
        select: { id: true },
      });
      if (!p) {
        throw fieldError('chargingPointId', 'belongsToStation', {
          ar: 'نقطة الشحن لا تتبع هذه المحطة.',
          en: 'The charge point does not belong to this station.',
        });
      }
    }
    if (next.connectorId) {
      const c = await this.prisma.connector.findFirst({
        where: { id: next.connectorId, stationId },
        select: { chargingPointId: true },
      });
      if (
        !c ||
        (next.chargingPointId && c.chargingPointId && c.chargingPointId !== next.chargingPointId)
      ) {
        throw fieldError('connectorId', 'belongsToStation', {
          ar: 'المنفذ لا يتبع هذه المحطة أو نقطة الشحن.',
          en: 'The connector does not belong to this station or charge point.',
        });
      }
    }
    if (next.sourceId) {
      const s = await this.prisma.specificationSource.findUnique({
        where: { id: next.sourceId },
        select: { id: true },
      });
      if (!s)
        throw fieldError('sourceId', 'exists', { ar: 'المصدر غير موجود.', en: 'Unknown source.' });
    }
  }

  private elementsData(elements: TariffElementInputDto[]) {
    return elements.map((e, i) => ({
      componentType: e.componentType,
      price: e.price,
      priceUnit: e.priceUnit,
      stepSize: e.stepSize ?? null,
      graceMinutes: e.graceMinutes ?? null,
      minPowerKw: e.minPowerKw ?? null,
      maxPowerKw: e.maxPowerKw ?? null,
      currentType: e.currentType ?? null,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      daysOfWeek: e.daysOfWeek ?? [],
      sortOrder: i,
    }));
  }

  async create(stationId: string, dto: CreateTariffDto, userId: string, lang: SupportedLanguage) {
    await this.station(stationId);
    await this.validate(stationId, {
      currencyCode: dto.currencyCode,
      chargingPointId: dto.chargingPointId ?? null,
      connectorId: dto.connectorId ?? null,
      sourceId: dto.sourceId ?? null,
      validFrom: dto.validFrom ?? null,
      validTo: dto.validTo ?? null,
      elements: dto.elements,
    });
    const t = await this.prisma.tariff.create({
      data: {
        stationId,
        chargingPointId: dto.chargingPointId ?? null,
        connectorId: dto.connectorId ?? null,
        name: dto.name ?? null,
        currencyCode: dto.currencyCode,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        taxIncluded: dto.taxIncluded ?? null,
        taxPercent: dto.taxPercent ?? null,
        notes: dto.notes ?? null,
        sourceId: dto.sourceId ?? null,
        verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : null,
        reliability: dto.reliability ?? 'unverified',
        createdById: userId,
        elements: { create: this.elementsData(dto.elements) },
      },
      include: { elements: true },
    });
    await this.prisma.chargingStation.update({
      where: { id: stationId },
      data: { updatedById: userId },
    });
    this.audit.annotate({ entityType: 'tariff', entityId: t.id, after: t });
    return this.get(stationId, t.id, lang);
  }

  async update(
    stationId: string,
    tariffId: string,
    dto: UpdateTariffDto,
    userId: string,
    lang: SupportedLanguage,
  ) {
    const before = await this.prisma.tariff.findFirst({
      where: { id: tariffId, stationId },
      include: { elements: true },
    });
    if (!before) throw StationErrors.notFound('tariff');
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    await this.validate(stationId, {
      currencyCode: dto.currencyCode ?? before.currencyCode,
      chargingPointId:
        dto.chargingPointId !== undefined ? dto.chargingPointId : before.chargingPointId,
      connectorId: dto.connectorId !== undefined ? dto.connectorId : before.connectorId,
      sourceId: dto.sourceId !== undefined ? dto.sourceId : before.sourceId,
      validFrom: dto.validFrom !== undefined ? dto.validFrom : iso(before.validFrom),
      validTo: dto.validTo !== undefined ? dto.validTo : iso(before.validTo),
      elements: dto.elements,
    });
    const date = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null ? null : new Date(v);
    const t = await this.prisma.$transaction(async (tx) => {
      if (dto.elements) {
        await tx.tariffElement.deleteMany({ where: { tariffId } });
      }
      return tx.tariff.update({
        where: { id: tariffId },
        data: {
          name: dto.name,
          chargingPointId: dto.chargingPointId,
          connectorId: dto.connectorId,
          currencyCode: dto.currencyCode,
          validFrom: date(dto.validFrom),
          validTo: date(dto.validTo),
          taxIncluded: dto.taxIncluded,
          taxPercent: dto.taxPercent,
          notes: dto.notes,
          sourceId: dto.sourceId,
          verifiedAt: date(dto.verifiedAt),
          reliability: dto.reliability,
          ...(dto.elements ? { elements: { create: this.elementsData(dto.elements) } } : {}),
        },
        include: { elements: true },
      });
    });
    await this.prisma.chargingStation.update({
      where: { id: stationId },
      data: { updatedById: userId },
    });
    this.audit.annotate({ entityType: 'tariff', entityId: tariffId, before, after: t });
    return this.get(stationId, tariffId, lang);
  }

  async remove(stationId: string, tariffId: string): Promise<void> {
    const before = await this.prisma.tariff.findFirst({
      where: { id: tariffId, stationId },
      include: { elements: true },
    });
    if (!before) throw StationErrors.notFound('tariff');
    await this.prisma.tariff.delete({ where: { id: tariffId } });
    this.audit.annotate({ entityType: 'tariff', entityId: tariffId, before });
  }
}
