import { Module } from '@nestjs/common';
import { GarageModule } from '../garage/garage.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/**
 * Reminders (REQUIREMENTS §14): /api/v1/me/reminders (+ /:id/complete).
 * The server stores them; the app schedules local notifications from
 * `notifyOn`. See docs/decisions/backend-personal.md §4.
 */
@Module({
  imports: [GarageModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
