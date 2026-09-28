import { HttpStatus, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { appError, fieldError, notFound } from '../garage/common/personal-errors';
import {
  dateOnly,
  n,
  parseDateOnly,
  VARIANT_SUMMARY_SELECT,
  variantSummary,
} from '../garage/common/vehicle-summary';
import { GarageService } from '../garage/garage.service';
import {
  nextOccurrence,
  REMINDER_TYPE_LABELS,
  reminderState,
  type ReminderTypeKey,
} from './reminder-rules';
import type {
  CompleteReminderDto,
  CreateReminderDto,
  ListRemindersQueryDto,
  UpdateReminderDto,
} from './reminders.dto';

export const MAX_OPEN_REMINDERS = 200;

const SELECT = {
  id: true,
  userVehicleId: true,
  type: true,
  title: true,
  notes: true,
  dueDate: true,
  dueOdometerKm: true,
  repeatIntervalMonths: true,
  repeatIntervalKm: true,
  notifyDaysBefore: true,
  notifyKmBefore: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  userVehicle: {
    select: {
      id: true,
      nickname: true,
      currentOdometerKm: true,
      variant: { select: VARIANT_SUMMARY_SELECT },
    },
  },
} satisfies Prisma.ReminderSelect;

type Row = Prisma.ReminderGetPayload<{ select: typeof SELECT }>;
export type ReminderView = ReturnType<RemindersService['view']>;

const STATUS_ORDER = { overdue: 0, due_soon: 1, upcoming: 2, completed: 3 } as const;

/**
 * Maintenance / insurance / licence / tyres / custom reminders (REQUIREMENTS
 * §14). The server stores them and computes their status; the app schedules
 * LOCAL notifications from `notifyOn` (no server push needed).
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garage: GarageService,
  ) {}

  view(r: Row, lang: SupportedLanguage, now = new Date()) {
    const odo = r.userVehicle ? n(r.userVehicle.currentOdometerKm) : null;
    const state = reminderState(
      {
        dueDate: r.dueDate,
        dueOdometerKm: n(r.dueOdometerKm),
        notifyDaysBefore: r.notifyDaysBefore,
        notifyKmBefore: n(r.notifyKmBefore),
        completedAt: r.completedAt,
        repeatIntervalMonths: r.repeatIntervalMonths,
        repeatIntervalKm: n(r.repeatIntervalKm),
      },
      odo,
      now,
    );
    return {
      id: r.id,
      type: r.type,
      typeLabel: REMINDER_TYPE_LABELS[r.type][lang],
      title: r.title,
      notes: r.notes,
      vehicle: r.userVehicle
        ? {
            id: r.userVehicle.id,
            displayName:
              r.userVehicle.nickname?.trim() || variantSummary(r.userVehicle.variant, lang).name,
            currentOdometerKm: odo,
          }
        : null,
      dueDate: dateOnly(r.dueDate),
      dueOdometerKm: n(r.dueOdometerKm),
      repeatIntervalMonths: r.repeatIntervalMonths,
      repeatIntervalKm: n(r.repeatIntervalKm),
      notifyDaysBefore: r.notifyDaysBefore,
      notifyKmBefore: n(r.notifyKmBefore),
      completedAt: r.completedAt?.toISOString() ?? null,
      ...state,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async load(userId: string, id: string): Promise<Row> {
    const r = await this.prisma.reminder.findFirst({ where: { id, userId }, select: SELECT });
    if (!r) throw notFound('reminder');
    return r;
  }

  async list(
    userId: string,
    q: ListRemindersQueryDto,
    lang: SupportedLanguage,
  ): Promise<ReminderView[]> {
    const status = q.status ?? 'open';
    const rows = await this.prisma.reminder.findMany({
      where: {
        userId,
        ...(q.vehicleId ? { userVehicleId: q.vehicleId } : {}),
        ...(status === 'open'
          ? { completedAt: null }
          : status === 'completed'
            ? { completedAt: { not: null } }
            : {}),
      },
      orderBy: [
        { completedAt: { sort: 'desc', nulls: 'first' } },
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
      take: 500,
      select: SELECT,
    });
    const views = rows.map((r) => this.view(r, lang));
    if (status === 'completed') return views;
    return views.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.dueInDays ?? Number.MAX_SAFE_INTEGER) - (b.dueInDays ?? Number.MAX_SAFE_INTEGER) ||
        (a.dueInKm ?? Number.MAX_SAFE_INTEGER) - (b.dueInKm ?? Number.MAX_SAFE_INTEGER),
    );
  }

  async get(userId: string, id: string, lang: SupportedLanguage): Promise<ReminderView> {
    return this.view(await this.load(userId, id), lang);
  }

  private static parseDue(v: string | null | undefined): Date | null | undefined {
    if (v === undefined || v === null) return v;
    const d = parseDateOnly(v);
    if (!d) throw fieldError('dueDate', 'isDate', { ar: 'التاريخ غير صالح.', en: 'Invalid date.' });
    return d;
  }

  private static checkShape(s: {
    type: string;
    title: string | null;
    dueDate: Date | null;
    dueOdometerKm: number | null;
    userVehicleId: string | null;
    repeatIntervalKm: number | null;
    notifyKmBefore: number | null;
  }) {
    if (s.type === 'custom' && !s.title) {
      throw fieldError('title', 'required', { ar: 'أدخل عنوان التذكير.', en: 'Enter a title.' });
    }
    if (s.dueDate === null && s.dueOdometerKm === null) {
      throw fieldError('dueDate', 'required', {
        ar: 'حدد تاريخ الاستحقاق أو قراءة العداد.',
        en: 'Give a due date or a due odometer reading.',
      });
    }
    if (
      (s.dueOdometerKm !== null || s.repeatIntervalKm !== null || s.notifyKmBefore !== null) &&
      !s.userVehicleId
    ) {
      throw fieldError('userVehicleId', 'required', {
        ar: 'التذكير بالعداد يحتاج سيارة من جراجك.',
        en: 'An odometer reminder needs a car from your garage.',
      });
    }
  }

  async create(
    userId: string,
    dto: CreateReminderDto,
    lang: SupportedLanguage,
  ): Promise<ReminderView> {
    if (dto.userVehicleId) await this.garage.assertOwn(userId, dto.userVehicleId);
    const dueDate = RemindersService.parseDue(dto.dueDate) ?? null;
    const title = dto.title?.trim() || null;
    RemindersService.checkShape({
      type: dto.type,
      title,
      dueDate,
      dueOdometerKm: dto.dueOdometerKm ?? null,
      userVehicleId: dto.userVehicleId ?? null,
      repeatIntervalKm: dto.repeatIntervalKm ?? null,
      notifyKmBefore: dto.notifyKmBefore ?? null,
    });
    const open = await this.prisma.reminder.count({ where: { userId, completedAt: null } });
    if (open >= MAX_OPEN_REMINDERS) {
      throw appError(
        HttpStatus.CONFLICT,
        'REMINDER_LIMIT_REACHED',
        {
          ar: 'وصلت إلى الحد الأقصى للتذكيرات المفتوحة.',
          en: 'You reached the maximum number of open reminders.',
        },
        { max: MAX_OPEN_REMINDERS },
      );
    }
    const row = await this.prisma.reminder.create({
      data: {
        userId,
        userVehicleId: dto.userVehicleId ?? null,
        type: dto.type,
        title: title ?? REMINDER_TYPE_LABELS[dto.type][lang],
        notes: dto.notes ?? null,
        dueDate,
        dueOdometerKm: dto.dueOdometerKm ?? null,
        repeatIntervalMonths: dto.repeatIntervalMonths ?? null,
        repeatIntervalKm: dto.repeatIntervalKm ?? null,
        notifyDaysBefore: dto.notifyDaysBefore ?? 7,
        notifyKmBefore: dto.notifyKmBefore ?? null,
      },
      select: SELECT,
    });
    return this.view(row, lang);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateReminderDto,
    lang: SupportedLanguage,
  ): Promise<ReminderView> {
    const before = await this.load(userId, id);
    if (dto.userVehicleId) await this.garage.assertOwn(userId, dto.userVehicleId);
    const dueDate = RemindersService.parseDue(dto.dueDate);
    const type = dto.type ?? before.type;
    const title = dto.title !== undefined ? dto.title?.trim() || null : before.title;
    const merged = {
      type,
      title:
        type === 'custom' ? title : (title ?? REMINDER_TYPE_LABELS[type as ReminderTypeKey][lang]),
      dueDate: dueDate !== undefined ? dueDate : before.dueDate,
      dueOdometerKm: dto.dueOdometerKm !== undefined ? dto.dueOdometerKm : n(before.dueOdometerKm),
      userVehicleId: dto.userVehicleId !== undefined ? dto.userVehicleId : before.userVehicleId,
      repeatIntervalKm:
        dto.repeatIntervalKm !== undefined ? dto.repeatIntervalKm : n(before.repeatIntervalKm),
      notifyKmBefore:
        dto.notifyKmBefore !== undefined ? dto.notifyKmBefore : n(before.notifyKmBefore),
    };
    RemindersService.checkShape(merged);
    const row = await this.prisma.reminder.update({
      where: { id },
      data: {
        type: merged.type,
        title: merged.title!,
        dueDate: merged.dueDate,
        dueOdometerKm: merged.dueOdometerKm,
        userVehicleId: merged.userVehicleId,
        repeatIntervalKm: merged.repeatIntervalKm,
        notifyKmBefore: merged.notifyKmBefore,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.repeatIntervalMonths !== undefined
          ? { repeatIntervalMonths: dto.repeatIntervalMonths }
          : {}),
        ...(dto.notifyDaysBefore !== undefined ? { notifyDaysBefore: dto.notifyDaysBefore } : {}),
      },
      select: SELECT,
    });
    return this.view(row, lang);
  }

  async complete(
    userId: string,
    id: string,
    dto: CompleteReminderDto,
    lang: SupportedLanguage,
  ): Promise<{ completed: ReminderView; next: ReminderView | null }> {
    const r = await this.load(userId, id);
    if (r.completedAt) {
      throw appError(HttpStatus.CONFLICT, 'REMINDER_ALREADY_COMPLETED', {
        ar: 'هذا التذكير مكتمل بالفعل.',
        en: 'This reminder is already completed.',
      });
    }
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    if (completedAt.getTime() > Date.now() + 5 * 60_000) {
      throw fieldError('completedAt', 'notFuture', {
        ar: 'التاريخ في المستقبل.',
        en: 'The date is in the future.',
      });
    }
    if (dto.odometerKm !== undefined && !r.userVehicleId) {
      throw fieldError('odometerKm', 'noVehicle', {
        ar: 'هذا التذكير غير مرتبط بسيارة.',
        en: 'This reminder is not linked to a car.',
      });
    }
    const next = nextOccurrence(
      {
        dueDate: r.dueDate,
        dueOdometerKm: n(r.dueOdometerKm),
        notifyDaysBefore: r.notifyDaysBefore,
        notifyKmBefore: n(r.notifyKmBefore),
        completedAt: null,
        repeatIntervalMonths: r.repeatIntervalMonths,
        repeatIntervalKm: n(r.repeatIntervalKm),
      },
      dto.odometerKm ?? null,
    );
    const nextId = await this.prisma.$transaction(async (tx) => {
      await tx.reminder.update({ where: { id }, data: { completedAt } });
      if (r.userVehicleId)
        await this.garage.bumpOdometer(tx, userId, r.userVehicleId, dto.odometerKm);
      if (!next) return null;
      const created = await tx.reminder.create({
        data: {
          userId,
          userVehicleId: r.userVehicleId,
          type: r.type,
          title: r.title,
          notes: r.notes,
          dueDate: next.dueDate,
          dueOdometerKm: next.dueOdometerKm,
          repeatIntervalMonths: r.repeatIntervalMonths,
          repeatIntervalKm: r.repeatIntervalKm,
          notifyDaysBefore: r.notifyDaysBefore,
          notifyKmBefore: r.notifyKmBefore,
        },
        select: { id: true },
      });
      return created.id;
    });
    return {
      completed: await this.get(userId, id, lang),
      next: nextId ? await this.get(userId, nextId, lang) : null,
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.load(userId, id);
    await this.prisma.reminder.delete({ where: { id } });
  }
}
