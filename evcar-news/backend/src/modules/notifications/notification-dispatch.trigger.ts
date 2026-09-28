import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PushDispatchService } from './push-dispatch.service';

/**
 * JOBS_ENABLED instances only: sends push deliveries that were postponed by
 * quiet hours or are waiting for a retry, every minute.
 */
@Injectable()
export class NotificationDispatchTrigger {
  private readonly logger = new Logger(NotificationDispatchTrigger.name);

  constructor(private readonly dispatch: PushDispatchService) {}

  @Interval('notifications-push-due', 60_000)
  async tick(): Promise<void> {
    try {
      await this.dispatch.flushDue();
    } catch (err) {
      this.logger.warn(`Push dispatch run failed: ${(err as Error).message}`);
    }
  }
}
