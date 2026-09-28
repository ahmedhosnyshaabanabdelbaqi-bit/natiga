import { Module } from '@nestjs/common';
import { jobsEnabledProviders } from '../../jobs/queues';
import { ArticlePublishedListener } from './article-published.listener';
import { NotificationCenterService } from './notification-center.service';
import { NotificationDispatchTrigger } from './notification-dispatch.trigger';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushDispatchService } from './push-dispatch.service';

/**
 * Notifications (REQUIREMENTS §16), see docs/decisions/backend-personal.md §6:
 *   /api/v1/me/notifications (center), /me/notification-preferences,
 *   /me/notification-subscriptions, /me/devices.
 * NotificationService.notify() is exported for other modules (dedupe,
 * preferences, quiet hours, push only when configured). Article publish →
 * followers are notified (ArticlePublishedListener).
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    NotificationCenterService,
    PushDispatchService,
    ArticlePublishedListener,
    ...jobsEnabledProviders([NotificationDispatchTrigger]),
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
