import { Module } from '@nestjs/common';
import { GarageModule } from '../garage/garage.module';
import { ChargingLogsController } from './charging-logs.controller';
import { ChargingLogsService } from './charging-logs.service';

/**
 * Charging logs (REQUIREMENTS §14): /api/v1/me/charging-logs CRUD +
 * /api/v1/me/charging-logs/report (computed from the user's rows only).
 * See docs/decisions/backend-personal.md §3.
 */
@Module({
  imports: [GarageModule],
  controllers: [ChargingLogsController],
  providers: [ChargingLogsService],
})
export class ChargingLogsModule {}
