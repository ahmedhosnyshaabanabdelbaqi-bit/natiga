import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_GATEWAY, type PushGateway } from '../../providers';

export const PUSH_MAX_ATTEMPTS = 5;
/** Tokens reported invalid / failing this many times in a row are revoked. */
export const DEVICE_MAX_FAILURES = 5;
const BATCH = 200;

/**
 * Sends pending push deliveries (notification_deliveries, channel push)
 * whose `scheduled_for` has passed (quiet hours). Outcomes:
 * sent → status sent; invalid token → token revoked + delivery failed;
 * provider not configured → skipped; transient failure → retried with
 * back-off up to PUSH_MAX_ATTEMPTS. Called right after notify() and every
 * minute by NotificationDispatchTrigger on JOBS_ENABLED instances.
 */
@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);
  private running: Promise<number> | null = null;
  private again = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_GATEWAY) private readonly push: PushGateway,
  ) {}

  /**
   * Sends everything due. Calls made while a run is in progress schedule one
   * more run right after it (so new deliveries are never left waiting) and
   * resolve with that combined run.
   */
  flushDue(now?: Date): Promise<number> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const loop = async () => {
      let total = 0;
      do {
        this.again = false;
        total += await this.run(now ?? new Date());
      } while (this.again);
      return total;
    };
    this.running = loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(now: Date): Promise<number> {
    let total = 0;
    for (let round = 0; round < 20; round++) {
      const due = await this.prisma.notificationDelivery.findMany({
        where: {
          channel: 'push',
          status: 'pending',
          attempts: { lt: PUSH_MAX_ATTEMPTS },
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
        select: {
          id: true,
          attempts: true,
          deviceToken: {
            select: { id: true, token: true, provider: true, revokedAt: true, failureCount: true },
          },
          notification: {
            select: {
              id: true,
              type: true,
              title: true,
              body: true,
              deepLink: true,
              dedupeKey: true,
            },
          },
        },
      });
      if (!due.length) break;
      total += due.length;
      for (const d of due) await this.deliver(d, now);
      if (due.length < BATCH) break;
    }
    return total;
  }

  private async deliver(
    d: {
      id: string;
      attempts: number;
      deviceToken: {
        id: string;
        token: string;
        provider: 'fcm' | 'apns';
        revokedAt: Date | null;
        failureCount: number;
      } | null;
      notification: {
        id: string;
        type: string;
        title: string;
        body: string | null;
        deepLink: string | null;
        dedupeKey: string | null;
      };
    },
    now: Date,
  ): Promise<void> {
    const token = d.deviceToken;
    if (!token || token.revokedAt) {
      await this.prisma.notificationDelivery.update({
        where: { id: d.id },
        data: { status: 'skipped', skipReason: 'token_revoked' },
      });
      return;
    }
    // Claim the row (another instance may run the same batch).
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: { id: d.id, status: 'pending', attempts: d.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;

    const [outcome] = await this.push
      .send([{ token: token.token, provider: token.provider }], {
        title: d.notification.title,
        body: d.notification.body ?? '',
        deepLink: d.notification.deepLink ?? undefined,
        data: { type: d.notification.type, notificationId: d.notification.id },
        collapseKey: d.notification.dedupeKey ?? undefined,
      })
      .catch((err: Error) => [
        {
          status: 'failed' as const,
          error: err.message,
          retryable: true,
          providerMessageId: undefined,
        },
      ]);

    switch (outcome?.status) {
      case 'sent':
        await this.prisma.$transaction([
          this.prisma.notificationDelivery.update({
            where: { id: d.id },
            data: {
              status: 'sent',
              sentAt: now,
              providerMessageId: outcome.providerMessageId ?? null,
              lastError: null,
            },
          }),
          this.prisma.deviceToken.update({ where: { id: token.id }, data: { failureCount: 0 } }),
        ]);
        return;
      case 'not_configured':
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: { status: 'skipped', skipReason: 'channel_not_configured' },
        });
        return;
      case 'invalid_token':
        await this.prisma.$transaction([
          this.prisma.notificationDelivery.update({
            where: { id: d.id },
            data: { status: 'failed', lastError: outcome.error ?? 'invalid_token' },
          }),
          this.prisma.deviceToken.update({
            where: { id: token.id },
            data: { revokedAt: now, lastFailureAt: now, failureCount: { increment: 1 } },
          }),
        ]);
        return;
      default: {
        const attempts = d.attempts + 1;
        const giveUp = attempts >= PUSH_MAX_ATTEMPTS || outcome?.retryable === false;
        const failures = token.failureCount + 1;
        await this.prisma.$transaction([
          this.prisma.notificationDelivery.update({
            where: { id: d.id },
            data: {
              status: giveUp ? 'failed' : 'pending',
              lastError: (outcome?.error ?? 'unknown error').slice(0, 1000),
              scheduledFor: giveUp ? undefined : new Date(now.getTime() + 60_000 * 2 ** attempts),
            },
          }),
          this.prisma.deviceToken.update({
            where: { id: token.id },
            data: {
              failureCount: failures,
              lastFailureAt: now,
              ...(failures >= DEVICE_MAX_FAILURES ? { revokedAt: now } : {}),
            },
          }),
        ]);
        if (giveUp)
          this.logger.warn(`Push delivery ${d.id} failed: ${outcome?.error ?? 'unknown error'}`);
      }
    }
  }
}
