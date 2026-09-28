import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { Decimal } from '../../common/money/money';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fieldError, notFound } from '../garage/common/personal-errors';
import { n, VARIANT_SUMMARY_SELECT, variantSummary } from '../garage/common/vehicle-summary';
import { GarageService } from '../garage/garage.service';
import { pick } from '../stations/common/values';
import type {
  ChargingLogFieldsDto,
  ChargingLogPeriodDto,
  CreateChargingLogDto,
  ListChargingLogsQueryDto,
  UpdateChargingLogDto,
} from './charging-logs.dto';
import { buildReport, type ChargingReport } from './charging-report';

const LOG_SELECT = {
  id: true,
  userVehicleId: true,
  stationId: true,
  chargedAt: true,
  energyKwh: true,
  cost: true,
  currencyCode: true,
  odometerKm: true,
  socStart: true,
  socEnd: true,
  durationMinutes: true,
  chargerPowerKw: true,
  currentType: true,
  locationType: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  userVehicle: {
    select: { id: true, nickname: true, variant: { select: VARIANT_SUMMARY_SELECT } },
  },
  station: { select: { id: true, name: true, nameAr: true, nameEn: true } },
} satisfies Prisma.ChargingLogSelect;

type LogRow = Prisma.ChargingLogGetPayload<{ select: typeof LOG_SELECT }>;

export type ChargingLogView = ReturnType<ChargingLogsService['view']>;

const FUTURE_TOLERANCE_MS = 5 * 60_000;

function periodBound(v: string | undefined, end: boolean, field: string): Date | undefined {
  if (!v) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = new Date(dateOnly ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(d.getTime()) || (dateOnly && d.toISOString().slice(0, 10) !== v)) {
    throw fieldError(field, 'isDate', { ar: 'التاريخ غير صالح.', en: 'Invalid date.' });
  }
  return dateOnly && end ? new Date(d.getTime() + 86_400_000 - 1) : d;
}

/**
 * Optional charging log (REQUIREMENTS §14): the user enters date, energy,
 * cost and odometer; reports are computed from these rows only.
 */
@Injectable()
export class ChargingLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garage: GarageService,
  ) {}

  view(row: LogRow, lang: SupportedLanguage) {
    const variant = variantSummary(row.userVehicle.variant, lang);
    const energy = n(row.energyKwh)!;
    return {
      id: row.id,
      vehicle: {
        id: row.userVehicle.id,
        displayName: row.userVehicle.nickname?.trim() || variant.name,
      },
      station: row.station
        ? {
            id: row.station.id,
            name: pick(lang, row.station.nameAr, row.station.nameEn) ?? row.station.name,
          }
        : null,
      chargedAt: row.chargedAt.toISOString(),
      energyKwh: energy,
      cost:
        row.cost !== null && row.currencyCode
          ? { amount: row.cost.toFixed(2), currency: row.currencyCode }
          : null,
      costPerKwh:
        row.cost !== null && row.currencyCode && energy > 0
          ? {
              amount: new Decimal(row.cost.toString()).div(energy).toDecimalPlaces(4).toString(),
              currency: row.currencyCode,
            }
          : null,
      odometerKm: n(row.odometerKm),
      socStart: n(row.socStart),
      socEnd: n(row.socEnd),
      durationMinutes: n(row.durationMinutes),
      chargerPowerKw: n(row.chargerPowerKw),
      currentType: row.currentType,
      locationType: row.locationType,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async load(userId: string, id: string): Promise<LogRow> {
    const row = await this.prisma.chargingLog.findFirst({
      where: { id, userId },
      select: LOG_SELECT,
    });
    if (!row) throw notFound('charging_log');
    return row;
  }

  async list(
    userId: string,
    q: ListChargingLogsQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<ChargingLogView>> {
    const page = toPageRequest(q);
    const from = periodBound(q.from, false, 'from');
    const to = periodBound(q.to, true, 'to');
    const where: Prisma.ChargingLogWhereInput = {
      userId,
      ...(q.vehicleId ? { userVehicleId: q.vehicleId } : {}),
      ...(from || to
        ? { chargedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.chargingLog.findMany({
        where,
        orderBy: [{ chargedAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
        select: LOG_SELECT,
      }),
      this.prisma.chargingLog.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.view(r, lang)),
      total,
      page,
    );
  }

  async get(userId: string, id: string, lang: SupportedLanguage): Promise<ChargingLogView> {
    return this.view(await this.load(userId, id), lang);
  }

  private async checkStation(stationId: string | null | undefined) {
    if (!stationId) return;
    const s = await this.prisma.chargingStation.findFirst({
      where: { id: stationId, publicationStatus: 'published' },
      select: { id: true },
    });
    if (!s)
      throw fieldError('stationId', 'exists', { ar: 'المحطة غير موجودة.', en: 'Unknown station.' });
  }

  /** Readings of one car must not go backwards in time. */
  private async checkOdometerOrder(
    userId: string,
    vehicleId: string,
    chargedAt: Date,
    odometerKm: number | null,
    excludeId?: string,
  ) {
    if (odometerKm === null) return;
    const base = {
      userId,
      userVehicleId: vehicleId,
      odometerKm: { not: null },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    };
    const [before, after] = await Promise.all([
      this.prisma.chargingLog.findFirst({
        where: { ...base, chargedAt: { lt: chargedAt }, odometerKm: { gt: odometerKm } },
        select: { odometerKm: true },
      }),
      this.prisma.chargingLog.findFirst({
        where: { ...base, chargedAt: { gt: chargedAt }, odometerKm: { lt: odometerKm } },
        select: { odometerKm: true },
      }),
    ]);
    if (before || after) {
      throw fieldError('odometerKm', 'order', {
        ar: 'قراءة العداد لا تتسق مع سجلات الشحن الأخرى لهذه السيارة (أقل من قراءة سابقة أو أعلى من قراءة لاحقة).',
        en: 'The odometer does not fit this car’s other logs (below an earlier or above a later reading).',
      });
    }
  }

  private static checkCommon(
    chargedAt: Date,
    dto: ChargingLogFieldsDto,
    socStart: number | null,
    socEnd: number | null,
  ) {
    if (chargedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw fieldError('chargedAt', 'notFuture', {
        ar: 'تاريخ الشحن لا يمكن أن يكون في المستقبل.',
        en: 'The charging date cannot be in the future.',
      });
    }
    if (socStart !== null && socEnd !== null && socEnd <= socStart) {
      throw fieldError('socEnd', 'greaterThanStart', {
        ar: 'نسبة الشحن النهائية يجب أن تكون أكبر من البداية.',
        en: 'The end state of charge must be above the start.',
      });
    }
    if (dto.currency && (dto.cost === null || dto.cost === undefined)) {
      // A currency without an amount is harmless but meaningless; keep data clean.
      throw fieldError('cost', 'required', {
        ar: 'أدخل التكلفة مع العملة.',
        en: 'Enter the cost with the currency.',
      });
    }
  }

  async create(
    userId: string,
    dto: CreateChargingLogDto,
    lang: SupportedLanguage,
  ): Promise<ChargingLogView> {
    const car = await this.garage.assertOwn(userId, dto.userVehicleId);
    const chargedAt = new Date(dto.chargedAt);
    ChargingLogsService.checkCommon(chargedAt, dto, dto.socStart ?? null, dto.socEnd ?? null);
    await this.checkStation(dto.stationId);
    await this.checkOdometerOrder(userId, car.id, chargedAt, dto.odometerKm ?? null);
    const hasCost = dto.cost !== null && dto.cost !== undefined;
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.chargingLog.create({
        data: {
          userId,
          userVehicleId: car.id,
          stationId: dto.stationId ?? null,
          chargedAt,
          energyKwh: dto.energyKwh,
          cost: hasCost ? dto.cost : null,
          currencyCode: hasCost ? (dto.currency ?? car.market.currencyCode) : null,
          odometerKm: dto.odometerKm ?? null,
          socStart: dto.socStart ?? null,
          socEnd: dto.socEnd ?? null,
          durationMinutes: dto.durationMinutes ?? null,
          chargerPowerKw: dto.chargerPowerKw ?? null,
          currentType: dto.currentType ?? null,
          locationType: dto.locationType ?? 'other',
          notes: dto.notes ?? null,
        },
        select: { id: true },
      });
      await this.garage.bumpOdometer(tx, userId, car.id, dto.odometerKm);
      return row.id;
    });
    return this.get(userId, id, lang);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateChargingLogDto,
    lang: SupportedLanguage,
  ): Promise<ChargingLogView> {
    const before = await this.load(userId, id);
    const car = dto.userVehicleId ? await this.garage.assertOwn(userId, dto.userVehicleId) : null;
    const vehicleId = car?.id ?? before.userVehicleId;
    const chargedAt = dto.chargedAt ? new Date(dto.chargedAt) : before.chargedAt;
    const pickNum = (v: number | null | undefined, old: { toString(): string } | null) =>
      v !== undefined ? v : n(old);
    const socStart = pickNum(dto.socStart, before.socStart);
    const socEnd = pickNum(dto.socEnd, before.socEnd);
    const odometer = pickNum(dto.odometerKm, before.odometerKm);
    ChargingLogsService.checkCommon(
      chargedAt,
      { ...dto, currency: dto.cost === undefined ? undefined : dto.currency },
      socStart,
      socEnd,
    );
    if (dto.stationId !== undefined) await this.checkStation(dto.stationId);
    await this.checkOdometerOrder(userId, vehicleId, chargedAt, odometer, id);

    let cost: { cost: number | null; currencyCode: string | null } | undefined;
    if (dto.cost !== undefined || dto.currency !== undefined) {
      const amount = dto.cost !== undefined ? dto.cost : n(before.cost);
      if (amount === null) cost = { cost: null, currencyCode: null };
      else {
        const currency =
          dto.currency ??
          before.currencyCode ??
          (car ?? (await this.garage.assertOwn(userId, vehicleId))).market.currencyCode;
        cost = { cost: amount, currencyCode: currency };
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.chargingLog.update({
        where: { id },
        data: {
          ...(car ? { userVehicleId: car.id } : {}),
          ...(dto.chargedAt ? { chargedAt } : {}),
          ...(dto.energyKwh !== undefined ? { energyKwh: dto.energyKwh } : {}),
          ...(cost ?? {}),
          ...(dto.stationId !== undefined ? { stationId: dto.stationId } : {}),
          ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
          ...(dto.socStart !== undefined ? { socStart: dto.socStart } : {}),
          ...(dto.socEnd !== undefined ? { socEnd: dto.socEnd } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.chargerPowerKw !== undefined ? { chargerPowerKw: dto.chargerPowerKw } : {}),
          ...(dto.currentType !== undefined ? { currentType: dto.currentType } : {}),
          ...(dto.locationType !== undefined ? { locationType: dto.locationType } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      await this.garage.bumpOdometer(tx, userId, vehicleId, odometer);
    });
    return this.get(userId, id, lang);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.load(userId, id);
    await this.prisma.chargingLog.delete({ where: { id } });
  }

  async report(
    userId: string,
    q: ChargingLogPeriodDto,
    lang: SupportedLanguage,
  ): Promise<
    ChargingReport & {
      period: { from: string | null; to: string | null };
      vehicleId: string | null;
      notes: string[];
    }
  > {
    const from = periodBound(q.from, false, 'from');
    const to = periodBound(q.to, true, 'to');
    if (from && to && from > to) {
      throw fieldError('to', 'afterFrom', {
        ar: 'نهاية الفترة قبل بدايتها.',
        en: 'The period ends before it starts.',
      });
    }
    if (q.vehicleId) await this.garage.assertOwn(userId, q.vehicleId, 'vehicleId');
    const [logs, vehicles] = await Promise.all([
      this.prisma.chargingLog.findMany({
        where: {
          userId,
          ...(q.vehicleId ? { userVehicleId: q.vehicleId } : {}),
          ...(from || to
            ? { chargedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        orderBy: { chargedAt: 'asc' },
        select: {
          userVehicleId: true,
          chargedAt: true,
          energyKwh: true,
          cost: true,
          currencyCode: true,
          odometerKm: true,
          locationType: true,
        },
      }),
      this.prisma.userVehicle.findMany({
        where: { userId, ...(q.vehicleId ? { id: q.vehicleId } : {}) },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, nickname: true, variant: { select: VARIANT_SUMMARY_SELECT } },
      }),
    ]);
    const report = buildReport(
      logs.map((l) => ({
        userVehicleId: l.userVehicleId,
        chargedAt: l.chargedAt,
        energyKwh: n(l.energyKwh)!,
        cost: l.cost === null ? null : new Decimal(l.cost.toString()),
        currency: l.currencyCode,
        odometerKm: n(l.odometerKm),
        locationType: l.locationType,
      })),
      vehicles.map((v) => ({
        id: v.id,
        displayName: v.nickname?.trim() || variantSummary(v.variant, lang).name,
      })),
    );
    const notes =
      lang === 'ar'
        ? [
            'كل الأرقام محسوبة من سجلات الشحن التي أدخلتها فقط.',
            'الاستهلاك = الطاقة المسجّلة بعد أول قراءة للعداد حتى آخر قراءة ÷ المسافة بين القراءتين × 100، بافتراض مستوى بطارية متقارب في أول وآخر جلسة.',
            'الإنفاق يُعرض لكل عملة على حدة دون تحويل.',
          ]
        : [
            'All figures are computed only from the charging logs you entered.',
            'Consumption = energy logged after the first odometer reading up to the last ÷ distance between them × 100, assuming a similar battery level at the first and last sessions.',
            'Spending is shown per currency, never converted.',
          ];
    return {
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      vehicleId: q.vehicleId ?? null,
      ...report,
      notes,
    };
  }
}
