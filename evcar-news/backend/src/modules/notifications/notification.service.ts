import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_GATEWAY, type PushGateway } from '../../providers';
import {
  categoryAllowed,
  DEFAULT_PREFERENCES,
  isSafeDeepLink,
  type NotificationCategory,
  quietHoursState,
} from './notification-rules';
import { PushDispatchService } from './push-dispatch.service';

export interface LocalizedContent {
  title: string;
  body?: string | null;
}

export interface NotifyInput {
  userIds: string[];
  /** Machine type, e.g. "article.published", "reminder.due". */
  type: string;
  /** Which preference switch applies ("account" is never muted). */
  category: NotificationCategory;
  /** Same key for the same event: a user never gets it twice (e.g. "article.published:<id>"). */
  dedupeKey: string;
  /** Text per language; each user gets their own locale (fallback: ar). */
  content: Record<SupportedLanguage, LocalizedContent>;
  /** In-app path ("/news/<slug>") or https URL opened on tap. */
  deepLink?: string | null;
  data?: Record<string, string | number | boolean | null>;
  expiresAt?: Date | null;
  campaignId?: string | null;
}

export interface NotifyResult {
  /** Notifications created (one per recipient). */
  created: number;
  /** Already notified for this dedupe key. */
  duplicates: number;
  /** Muted by the user's preferences / unsubscribe, or inactive account. */
  skippedByPreference: number;
  push: { queued: number; scheduledForQuietHours: number; skippedNotConfigured: number };
}

const MAX_BATCH = 1000;

/**
 * The single entry point other modules use to notify users (REQUIREMENTS
 * §16). The in-app notification center always works; push is attempted only
 * when a provider is configured, the user enabled push and has a device.
 * Duplicates are prevented by (user, dedupeKey); quiet hours postpone the
 * push (the in-app entry is immediate). Nothing is sent to guests.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: PushDispatchService,
    @Inject(PUSH_GATEWAY) private readonly push: PushGateway,
  ) {}

  async notify(input: NotifyInput, now = new Date()): Promise<NotifyResult> {
    if (!isSafeDeepLink(input.deepLink)) throw new Error(`Unsafe deep link: ${input.deepLink}`);
    const result: NotifyResult = {
      created: 0,
      duplicates: 0,
      skippedByPreference: 0,
      push: { queued: 0, scheduledForQuietHours: 0, skippedNotConfigured: 0 },
    };
    const ids = [...new Set(input.userIds)];
    for (let i = 0; i < ids.length; i += MAX_BATCH) {
      await this.notifyBatch(input, ids.slice(i, i + MAX_BATCH), now, result);
    }
    return result;
  }

  private async notifyBatch(
    input: NotifyInput,
    userIds: string[],
    now: Date,
    result: NotifyResult,
  ) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, status: 'active' },
      select: { id: true, locale: true, notificationPreference: true },
    });
    result.skippedByPreference += userIds.length - users.length;
    const allowed = users.filter((u) => {
      const ok = categoryAllowed(u.notificationPreference ?? DEFAULT_PREFERENCES, input.category);
      if (!ok) result.skippedByPreference += 1;
      return ok;
    });
    if (!allowed.length) return;

    const rows = allowed.map((u) => {
      const lang: SupportedLanguage = u.locale === 'en' ? 'en' : 'ar';
      const c = input.content[lang] ?? input.content.ar;
      return {
        userId: u.id,
        type: input.type,
        title: c.title.slice(0, 300),
        body: c.body ?? null,
        locale: lang,
        deepLink: input.deepLink ?? null,
        data: input.data ?? {},
        dedupeKey: input.dedupeKey,
        campaignId: input.campaignId ?? null,
        expiresAt: input.expiresAt ?? null,
      };
    });
    const created = await this.prisma.notification.createManyAndReturn({
      data: rows,
      skipDuplicates: true,
      select: { id: true, userId: true },
    });
    result.created += created.length;
    result.duplicates += allowed.length - created.length;
    if (!created.length) return;

    // In-app delivery record (the center itself).
    await this.prisma.notificationDelivery.createMany({
      data: created.map((n) => ({
        notificationId: n.id,
        channel: 'in_app' as const,
        status: 'sent' as const,
        sentAt: now,
      })),
      skipDuplicates: true,
    });

    // Push: only for users who enabled it and have active devices.
    const prefs = new Map(
      allowed.map((u) => [u.id, u.notificationPreference ?? DEFAULT_PREFERENCES]),
    );
    const pushUsers = created.filter((n) => prefs.get(n.userId)!.pushEnabled).map((n) => n.userId);
    if (!pushUsers.length) return;
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: { in: pushUsers }, revokedAt: null },
      select: { id: true, userId: true, provider: true },
    });
    if (!devices.length) return;
    const byUser = new Map(created.map((n) => [n.userId, n.id]));
    const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
    for (const d of devices) {
      const notificationId = byUser.get(d.userId!)!;
      if (!this.push.channel(d.provider).configured) {
        deliveries.push({
          notificationId,
          channel: 'push',
          deviceTokenId: d.id,
          status: 'skipped',
          skipReason: 'channel_not_configured',
        });
        result.push.skippedNotConfigured += 1;
        continue;
      }
      const p = prefs.get(d.userId!)!;
      const quiet = quietHoursState(p.quietHoursStart, p.quietHoursEnd, p.timezone, now);
      deliveries.push({
        notificationId,
        channel: 'push',
        deviceTokenId: d.id,
        status: 'pending',
        scheduledFor: quiet.endsAt,
      });
      if (quiet.quiet) result.push.scheduledForQuietHours += 1;
      else result.push.queued += 1;
    }
    await this.prisma.notificationDelivery.createMany({ data: deliveries, skipDuplicates: true });
    if (result.push.queued > 0) {
      // Fire and forget: the request that triggered the event must not wait for FCM/APNs.
      void this.dispatch
        .flushDue(now)
        .catch((err: Error) => this.logger.warn(`Push dispatch failed: ${err.message}`));
    }
  }
}
