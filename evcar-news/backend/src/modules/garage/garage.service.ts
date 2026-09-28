import { HttpStatus, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { appError, fieldError, notFound, VEHICLE_NOT_FOUND } from './common/personal-errors';
import {
  dateOnly,
  n,
  parseDateOnly,
  VARIANT_SUMMARY_SELECT,
  variantSummary,
  type VariantSummary,
} from './common/vehicle-summary';
import type { CreateUserVehicleDto, UpdateUserVehicleDto } from './garage.dto';

export const GARAGE_MAX_VEHICLES = 20;

const VEHICLE_SELECT = {
  id: true,
  userId: true,
  variantId: true,
  marketCode: true,
  nickname: true,
  purchaseDate: true,
  initialOdometerKm: true,
  currentOdometerKm: true,
  odometerUpdatedAt: true,
  isPrimary: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  variant: {
    select: {
      ...VARIANT_SUMMARY_SELECT,
      markets: { select: { marketCode: true } },
    },
  },
  _count: {
    select: {
      chargingLogs: true,
      reminders: { where: { completedAt: null } },
    },
  },
} satisfies Prisma.UserVehicleSelect;

type VehicleRow = Prisma.UserVehicleGetPayload<{ select: typeof VEHICLE_SELECT }>;

export interface UserVehicleView {
  id: string;
  nickname: string | null;
  displayName: string;
  variant: VariantSummary;
  marketCode: string;
  listedInMarket: boolean;
  purchaseDate: string | null;
  initialOdometerKm: number | null;
  currentOdometerKm: number | null;
  odometerUpdatedAt: string | null;
  isPrimary: boolean;
  notes: string | null;
  stats: { chargingLogs: number; openReminders: number };
  createdAt: string;
  updatedAt: string;
}

type Tx = Prisma.TransactionClient;

/**
 * "جراجي" (REQUIREMENTS §14): a user's cars, each a catalog trim (→ brand,
 * model, model year) in a market, with an optional nickname and odometer.
 * Every query is scoped to the caller (another user's car is a 404).
 */
@Injectable()
export class GarageService {
  constructor(private readonly prisma: PrismaService) {}

  view(row: VehicleRow, lang: SupportedLanguage): UserVehicleView {
    const variant = variantSummary(row.variant, lang);
    return {
      id: row.id,
      nickname: row.nickname,
      displayName: row.nickname?.trim() || variant.name,
      variant,
      marketCode: row.marketCode,
      listedInMarket: row.variant.markets.some((m) => m.marketCode === row.marketCode),
      purchaseDate: dateOnly(row.purchaseDate),
      initialOdometerKm: n(row.initialOdometerKm),
      currentOdometerKm: n(row.currentOdometerKm),
      odometerUpdatedAt: row.odometerUpdatedAt?.toISOString() ?? null,
      isPrimary: row.isPrimary,
      notes: row.notes,
      stats: { chargingLogs: row._count.chargingLogs, openReminders: row._count.reminders },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(userId: string, lang: SupportedLanguage): Promise<UserVehicleView[]> {
    const rows = await this.prisma.userVehicle.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: VEHICLE_SELECT,
    });
    return rows.map((r) => this.view(r, lang));
  }

  private async load(
    userId: string,
    id: string,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<VehicleRow> {
    const row = await tx.userVehicle.findFirst({ where: { id, userId }, select: VEHICLE_SELECT });
    if (!row) throw notFound('user_vehicle');
    return row;
  }

  async get(userId: string, id: string, lang: SupportedLanguage): Promise<UserVehicleView> {
    return this.view(await this.load(userId, id), lang);
  }

  /** For other personal modules: the caller's car or a 422 on `field`. */
  async assertOwn(userId: string, id: string, field = 'userVehicleId') {
    const row = await this.prisma.userVehicle.findFirst({
      where: { id, userId },
      select: {
        id: true,
        marketCode: true,
        currentOdometerKm: true,
        market: { select: { currencyCode: true } },
      },
    });
    if (!row) throw VEHICLE_NOT_FOUND(field);
    return row;
  }

  /** Raises the car's current odometer when `km` is higher (never lowers it). */
  async bumpOdometer(
    tx: Tx,
    userId: string,
    vehicleId: string,
    km: number | null | undefined,
  ): Promise<void> {
    if (km === null || km === undefined) return;
    await tx.userVehicle.updateMany({
      where: {
        id: vehicleId,
        userId,
        OR: [{ currentOdometerKm: null }, { currentOdometerKm: { lt: km } }],
      },
      data: { currentOdometerKm: km, odometerUpdatedAt: new Date() },
    });
  }

  private async checkVariant(variantId: string, marketCode: string, requirePublished: boolean) {
    const [variant, market] = await Promise.all([
      this.prisma.vehicleVariant.findFirst({
        where: {
          id: variantId,
          deletedAt: null,
          ...(requirePublished ? { status: 'published' } : {}),
        },
        select: { id: true },
      }),
      this.prisma.market.findUnique({ where: { code: marketCode }, select: { enabled: true } }),
    ]);
    if (!variant) throw VEHICLE_NOT_FOUND('variantId');
    if (!market?.enabled) {
      throw fieldError('marketCode', 'exists', {
        ar: 'السوق غير متاح.',
        en: 'The market is not available.',
      });
    }
  }

  private checkDates(purchaseDate: string | null | undefined): Date | null | undefined {
    if (purchaseDate === undefined) return undefined;
    if (purchaseDate === null) return null;
    const d = parseDateOnly(purchaseDate);
    if (!d)
      throw fieldError('purchaseDate', 'isDate', { ar: 'التاريخ غير صالح.', en: 'Invalid date.' });
    if (d.getTime() > Date.now()) {
      throw fieldError('purchaseDate', 'notFuture', {
        ar: 'تاريخ الشراء لا يمكن أن يكون في المستقبل.',
        en: 'The purchase date cannot be in the future.',
      });
    }
    return d;
  }

  private static checkOdometers(initial: number | null, current: number | null) {
    if (initial !== null && current !== null && current < initial) {
      throw fieldError('currentOdometerKm', 'notBelowInitial', {
        ar: 'قراءة العداد الحالية أقل من القراءة الأولى.',
        en: 'The current odometer is below the initial reading.',
      });
    }
  }

  async create(
    userId: string,
    dto: CreateUserVehicleDto,
    market: string,
    lang: SupportedLanguage,
  ): Promise<UserVehicleView> {
    const marketCode = (dto.marketCode ?? market).toUpperCase();
    await this.checkVariant(dto.variantId, marketCode, true);
    const purchaseDate = this.checkDates(dto.purchaseDate);
    GarageService.checkOdometers(dto.initialOdometerKm ?? null, dto.currentOdometerKm ?? null);
    const current = dto.currentOdometerKm ?? dto.initialOdometerKm ?? null;

    const id = await this.prisma.$transaction(
      async (tx) => {
        const count = await tx.userVehicle.count({ where: { userId } });
        if (count >= GARAGE_MAX_VEHICLES) {
          throw appError(
            HttpStatus.CONFLICT,
            'GARAGE_LIMIT_REACHED',
            {
              ar: `يمكنك حفظ ${GARAGE_MAX_VEHICLES} سيارة كحد أقصى.`,
              en: `You can save up to ${GARAGE_MAX_VEHICLES} cars.`,
            },
            { max: GARAGE_MAX_VEHICLES },
          );
        }
        const primary = count === 0 || dto.isPrimary === true;
        if (primary)
          await tx.userVehicle.updateMany({ where: { userId }, data: { isPrimary: false } });
        const row = await tx.userVehicle.create({
          data: {
            userId,
            variantId: dto.variantId,
            marketCode,
            nickname: dto.nickname?.trim() || null,
            purchaseDate: purchaseDate ?? null,
            initialOdometerKm: dto.initialOdometerKm ?? null,
            currentOdometerKm: current,
            odometerUpdatedAt: current !== null ? new Date() : null,
            isPrimary: primary,
            notes: dto.notes ?? null,
          },
          select: { id: true },
        });
        return row.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(userId, id, lang);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateUserVehicleDto,
    lang: SupportedLanguage,
  ): Promise<UserVehicleView> {
    const before = await this.load(userId, id);
    const marketCode = dto.marketCode?.toUpperCase();
    if (dto.variantId !== undefined || marketCode !== undefined) {
      // Changing the trim needs a published one; keeping it does not.
      await this.checkVariant(
        dto.variantId ?? before.variantId,
        marketCode ?? before.marketCode,
        dto.variantId !== undefined && dto.variantId !== before.variantId,
      );
    }
    const purchaseDate = this.checkDates(dto.purchaseDate);
    const initial =
      dto.initialOdometerKm !== undefined ? dto.initialOdometerKm : n(before.initialOdometerKm);
    const current =
      dto.currentOdometerKm !== undefined ? dto.currentOdometerKm : n(before.currentOdometerKm);
    GarageService.checkOdometers(initial, current);
    const odometerChanged =
      dto.currentOdometerKm !== undefined && dto.currentOdometerKm !== n(before.currentOdometerKm);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.userVehicle.updateMany({
          where: { userId, NOT: { id } },
          data: { isPrimary: false },
        });
      }
      await tx.userVehicle.update({
        where: { id },
        data: {
          ...(dto.variantId !== undefined ? { variantId: dto.variantId } : {}),
          ...(marketCode !== undefined ? { marketCode } : {}),
          ...(dto.nickname !== undefined ? { nickname: dto.nickname?.trim() || null } : {}),
          ...(purchaseDate !== undefined ? { purchaseDate } : {}),
          ...(dto.initialOdometerKm !== undefined
            ? { initialOdometerKm: dto.initialOdometerKm }
            : {}),
          ...(dto.currentOdometerKm !== undefined
            ? { currentOdometerKm: dto.currentOdometerKm }
            : {}),
          ...(odometerChanged
            ? { odometerUpdatedAt: dto.currentOdometerKm === null ? null : new Date() }
            : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
    });
    return this.get(userId, id, lang);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.load(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.userVehicle.delete({ where: { id } });
      if (row.isPrimary) {
        const next = await tx.userVehicle.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next)
          await tx.userVehicle.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    });
  }
}
