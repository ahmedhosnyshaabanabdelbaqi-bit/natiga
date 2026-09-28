import { Inject, Injectable } from '@nestjs/common';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_GATEWAY, type PushGateway } from '../../providers';
import { fieldError, notFound } from '../garage/common/personal-errors';
import { isValidZone } from './notification-rules';
import type {
  CreateSubscriptionDto,
  ListNotificationsQueryDto,
  RegisterDeviceDto,
  UpdatePreferencesDto,
} from './notifications.dto';
import type { SupportedLanguage } from '../../config/app-config';
import { pick } from '../stations/common/values';

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  deepLink: true,
  data: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

export function notificationView(n: NotificationRow) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    deepLink: n.deepLink,
    data: (n.data ?? {}) as Record<string, unknown>,
    isRead: n.readAt !== null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
export type NotificationView = ReturnType<typeof notificationView>;

const MAX_SUBSCRIPTIONS = 200;
const MAX_DEVICES = 20;

/**
 * The signed-in user's notification center, preferences, topic
 * subscriptions and push devices (REQUIREMENTS §16). All queries are scoped
 * to the caller.
 */
@Injectable()
export class NotificationCenterService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_GATEWAY) private readonly push: PushGateway,
  ) {}

  private visible(userId: string, now = new Date()): Prisma.NotificationWhereInput {
    return { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  }

  // ---- center ------------------------------------------------------------------------------

  async list(
    userId: string,
    q: ListNotificationsQueryDto,
  ): Promise<PaginatedResponse<NotificationView>> {
    const page = toPageRequest(q);
    const where: Prisma.NotificationWhereInput = {
      ...this.visible(userId),
      ...(q.unread ? { readAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(rows.map(notificationView), total, page);
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { ...this.visible(userId), readAt: null } });
  }

  async setRead(userId: string, id: string, read: boolean): Promise<NotificationView> {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!n) throw notFound('notification');
    const row = await this.prisma.notification.update({
      where: { id },
      data: { readAt: read ? (n.readAt ?? new Date()) : null },
      select: NOTIFICATION_SELECT,
    });
    return notificationView(row);
  }

  async readAll(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw notFound('notification');
  }

  // ---- preferences ------------------------------------------------------------------------

  async preferences(userId: string) {
    const [p, devices] = await Promise.all([
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
      this.prisma.deviceToken.findMany({
        where: { userId, revokedAt: null },
        select: { provider: true },
      }),
    ]);
    const pushEnabled = p?.pushEnabled ?? true;
    const configuredDevices = devices.filter(
      (d) => this.push.channel(d.provider).configured,
    ).length;
    const configured = this.push.anyConfigured;
    const status = !configured
      ? 'not_configured'
      : !pushEnabled
        ? 'disabled_by_user'
        : configuredDevices === 0
          ? 'no_device'
          : 'active';
    return {
      types: {
        news: p?.newsEnabled ?? true,
        priceAlerts: p?.priceAlertsEnabled ?? true,
        reminders: p?.remindersEnabled ?? true,
        community: p?.communityEnabled ?? true,
        stationAlerts: p?.stationAlertsEnabled ?? true,
        campaigns: p?.campaignsEnabled ?? true,
      },
      channels: { inApp: true, push: pushEnabled, email: false },
      quietHours:
        p?.quietHoursStart && p.quietHoursEnd && p.timezone
          ? { start: p.quietHoursStart, end: p.quietHoursEnd, timezone: p.timezone }
          : null,
      unsubscribedAll: !!p?.unsubscribedAt,
      unsubscribedAt: p?.unsubscribedAt?.toISOString() ?? null,
      push: { configured, registeredDevices: devices.length, status },
    };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const data: Prisma.NotificationPreferenceUncheckedUpdateInput = {};
    const t = dto.types ?? {};
    const map: [keyof typeof t, keyof Prisma.NotificationPreferenceUncheckedUpdateInput][] = [
      ['news', 'newsEnabled'],
      ['priceAlerts', 'priceAlertsEnabled'],
      ['reminders', 'remindersEnabled'],
      ['community', 'communityEnabled'],
      ['stationAlerts', 'stationAlertsEnabled'],
      ['campaigns', 'campaignsEnabled'],
    ];
    let switchedOn = false;
    for (const [k, col] of map) {
      if (t[k] !== undefined) {
        (data as Record<string, unknown>)[col] = t[k];
        if (t[k]) switchedOn = true;
      }
    }
    if (dto.channels?.push !== undefined) {
      data.pushEnabled = dto.channels.push;
      if (dto.channels.push) switchedOn = true;
    }
    if (dto.quietHours === null) {
      data.quietHoursStart = null;
      data.quietHoursEnd = null;
    } else if (dto.quietHours) {
      if (!isValidZone(dto.quietHours.timezone)) {
        throw fieldError('quietHours.timezone', 'timezone', {
          ar: 'المنطقة الزمنية غير صالحة (مثل Africa/Cairo).',
          en: 'Invalid time zone (e.g. Africa/Cairo).',
        });
      }
      if (dto.quietHours.start === dto.quietHours.end) {
        throw fieldError('quietHours.end', 'differentFromStart', {
          ar: 'بداية ساعات الهدوء ونهايتها متساويتان.',
          en: 'Quiet hours start and end are the same.',
        });
      }
      data.quietHoursStart = dto.quietHours.start;
      data.quietHoursEnd = dto.quietHours.end;
      data.timezone = dto.quietHours.timezone;
    }
    if (dto.unsubscribeAll === true) data.unsubscribedAt = new Date();
    else if (dto.unsubscribeAll === false || switchedOn) data.unsubscribedAt = null;

    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { ...(data as Prisma.NotificationPreferenceUncheckedCreateInput), userId },
      update: data,
    });
    return this.preferences(userId);
  }

  // ---- subscriptions -----------------------------------------------------------------------

  async subscriptions(userId: string, lang: SupportedLanguage) {
    const rows = await this.prisma.notificationSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        topicType: true,
        marketCode: true,
        createdAt: true,
        brand: { select: { id: true, nameAr: true, nameEn: true } },
        model: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            brand: { select: { nameAr: true, nameEn: true } },
          },
        },
        variant: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            modelYear: {
              select: {
                year: true,
                generation: { select: { model: { select: { nameAr: true, nameEn: true } } } },
              },
            },
          },
        },
        category: {
          select: { id: true, slug: true, translations: { select: { locale: true, name: true } } },
        },
        market: { select: { code: true, nameAr: true, nameEn: true } },
        station: { select: { id: true, name: true, nameAr: true, nameEn: true } },
      },
    });
    return rows.map((r) => {
      let target: { id: string; name: string };
      switch (r.topicType) {
        case 'brand':
          target = { id: r.brand!.id, name: pick(lang, r.brand!.nameAr, r.brand!.nameEn)! };
          break;
        case 'model':
          target = {
            id: r.model!.id,
            name: `${pick(lang, r.model!.brand.nameAr, r.model!.brand.nameEn)} ${pick(lang, r.model!.nameAr, r.model!.nameEn)}`,
          };
          break;
        case 'variant':
        case 'price_alert': {
          const m = r.variant!.modelYear.generation.model;
          target = {
            id: r.variant!.id,
            name: `${pick(lang, m.nameAr, m.nameEn)} ${r.variant!.modelYear.year} ${pick(lang, r.variant!.nameAr, r.variant!.nameEn)}`,
          };
          break;
        }
        case 'category': {
          const tr = r.category!.translations;
          target = {
            id: r.category!.id,
            name: tr.find((x) => x.locale === lang)?.name ?? tr[0]?.name ?? r.category!.slug,
          };
          break;
        }
        case 'market':
          target = { id: r.market!.code, name: pick(lang, r.market!.nameAr, r.market!.nameEn)! };
          break;
        case 'station':
          target = {
            id: r.station!.id,
            name: pick(lang, r.station!.nameAr, r.station!.nameEn) ?? r.station!.name,
          };
          break;
      }
      return {
        id: r.id,
        topicType: r.topicType,
        target,
        marketCode: r.topicType === 'market' ? null : r.marketCode,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** Idempotent: returns { created: false } with the existing row. */
  async subscribe(userId: string, dto: CreateSubscriptionDto, lang: SupportedLanguage) {
    const market = dto.marketCode?.toUpperCase();
    const ids = {
      brandId: dto.brandId,
      modelId: dto.modelId,
      variantId: dto.variantId,
      categoryId: dto.categoryId,
      stationId: dto.stationId,
    };
    const expected: Record<string, keyof typeof ids | null> = {
      brand: 'brandId',
      model: 'modelId',
      variant: 'variantId',
      price_alert: 'variantId',
      category: 'categoryId',
      station: 'stationId',
      market: null,
    };
    const field = expected[dto.topicType];
    for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
      if (ids[k] && k !== field) {
        throw fieldError(k, 'notAllowed', {
          ar: 'هذا الحقل لا يناسب نوع الاشتراك.',
          en: 'This field does not fit the topic type.',
        });
      }
    }
    if (field && !ids[field]) {
      throw fieldError(field, 'required', {
        ar: 'حدد العنصر المطلوب متابعته.',
        en: 'Choose what to follow.',
      });
    }
    if ((dto.topicType === 'market' || dto.topicType === 'price_alert') && !market) {
      throw fieldError('marketCode', 'required', { ar: 'حدد السوق.', en: 'Choose a market.' });
    }
    if (dto.topicType === 'station' && market) {
      throw fieldError('marketCode', 'notAllowed', {
        ar: 'المحطة لا تحتاج سوقًا.',
        en: 'A station topic has no market.',
      });
    }
    await this.checkTarget(dto, market);
    const count = await this.prisma.notificationSubscription.count({ where: { userId } });
    const where = {
      userId,
      topicType: dto.topicType,
      brandId: dto.brandId ?? null,
      modelId: dto.modelId ?? null,
      variantId: dto.variantId ?? null,
      categoryId: dto.categoryId ?? null,
      stationId: dto.stationId ?? null,
      marketCode: market ?? null,
    };
    const existing = await this.prisma.notificationSubscription.findFirst({
      where,
      select: { id: true },
    });
    let id = existing?.id;
    if (!id) {
      if (count >= MAX_SUBSCRIPTIONS) {
        throw fieldError('topicType', 'limit', {
          ar: `يمكنك متابعة ${MAX_SUBSCRIPTIONS} عنصرًا كحد أقصى.`,
          en: `You can follow up to ${MAX_SUBSCRIPTIONS} topics.`,
        });
      }
      try {
        id = (
          await this.prisma.notificationSubscription.create({ data: where, select: { id: true } })
        ).id;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'))
          throw err;
        id = (
          await this.prisma.notificationSubscription.findFirstOrThrow({
            where,
            select: { id: true },
          })
        ).id;
      }
    }
    const view = (await this.subscriptions(userId, lang)).find((s) => s.id === id)!;
    return { created: !existing, view };
  }

  private async checkTarget(dto: CreateSubscriptionDto, market: string | undefined) {
    const missing = (f: string) =>
      fieldError(f, 'exists', { ar: 'العنصر غير موجود.', en: 'Not found.' });
    if (market) {
      const m = await this.prisma.market.findUnique({
        where: { code: market },
        select: { enabled: true },
      });
      if (!m?.enabled) throw missing('marketCode');
    }
    if (
      dto.brandId &&
      !(await this.prisma.brand.findFirst({
        where: { id: dto.brandId, status: 'published' },
        select: { id: true },
      }))
    )
      throw missing('brandId');
    if (
      dto.modelId &&
      !(await this.prisma.carModel.findFirst({
        where: { id: dto.modelId, status: 'published' },
        select: { id: true },
      }))
    )
      throw missing('modelId');
    if (
      dto.variantId &&
      !(await this.prisma.vehicleVariant.findFirst({
        where: { id: dto.variantId, status: 'published', deletedAt: null },
        select: { id: true },
      }))
    )
      throw missing('variantId');
    if (
      dto.categoryId &&
      !(await this.prisma.category.findFirst({
        where: { id: dto.categoryId, isActive: true },
        select: { id: true },
      }))
    )
      throw missing('categoryId');
    if (
      dto.stationId &&
      !(await this.prisma.chargingStation.findFirst({
        where: { id: dto.stationId, publicationStatus: 'published' },
        select: { id: true },
      }))
    )
      throw missing('stationId');
  }

  async unsubscribe(userId: string, id: string): Promise<void> {
    const res = await this.prisma.notificationSubscription.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw notFound('notification_subscription');
  }

  // ---- devices ------------------------------------------------------------------------------

  private deviceView(d: {
    id: string;
    token: string;
    platform: string;
    provider: string;
    appVersion: string | null;
    installationId: string | null;
    revokedAt: Date | null;
    lastSeenAt: Date;
    createdAt: Date;
  }) {
    return {
      id: d.id,
      tokenHint: `…${d.token.slice(-6)}`,
      platform: d.platform,
      provider: d.provider,
      appVersion: d.appVersion,
      installationId: d.installationId,
      active: d.revokedAt === null,
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    };
  }

  async devices(userId: string) {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((d) => this.deviceView(d));
  }

  /**
   * Registers / refreshes a push token for the caller. A token seen before
   * (e.g. another account on the same phone) moves to this user; the
   * installation's older token is removed.
   */
  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const provider = dto.provider ?? (dto.platform === 'ios' ? 'apns' : 'fcm');
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.installationId) {
        await tx.deviceToken.deleteMany({
          where: { installationId: dto.installationId, NOT: { token: dto.token } },
        });
      }
      const count = await tx.deviceToken.count({ where: { userId, NOT: { token: dto.token } } });
      if (count >= MAX_DEVICES) {
        const oldest = await tx.deviceToken.findFirst({
          where: { userId },
          orderBy: { lastSeenAt: 'asc' },
          select: { id: true },
        });
        if (oldest) await tx.deviceToken.delete({ where: { id: oldest.id } });
      }
      return tx.deviceToken.upsert({
        where: { token: dto.token },
        create: {
          userId,
          token: dto.token,
          platform: dto.platform,
          provider,
          installationId: dto.installationId ?? null,
          appVersion: dto.appVersion ?? null,
          locale: dto.locale ?? null,
          lastSeenAt: now,
        },
        update: {
          userId,
          platform: dto.platform,
          provider,
          installationId: dto.installationId ?? null,
          appVersion: dto.appVersion ?? null,
          locale: dto.locale ?? null,
          lastSeenAt: now,
          revokedAt: null,
          failureCount: 0,
        },
      });
    });
    return this.deviceView(row);
  }

  async unregisterToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }

  async removeDevice(userId: string, id: string): Promise<void> {
    const res = await this.prisma.deviceToken.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw notFound('device');
  }
}
