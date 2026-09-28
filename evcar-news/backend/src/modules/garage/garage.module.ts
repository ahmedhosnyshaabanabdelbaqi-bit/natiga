import { Module } from '@nestjs/common';
import { GarageController } from './garage.controller';
import { GarageService } from './garage.service';

/**
 * User vehicles ("جراجي"), REQUIREMENTS §14: GET|POST /api/v1/me/vehicles,
 * GET|PATCH|DELETE /api/v1/me/vehicles/:id. See docs/decisions/backend-personal.md.
 * GarageService is exported for charging logs, reminders and trips.
 */
@Module({
  controllers: [GarageController],
  providers: [GarageService],
  exports: [GarageService],
})
export class GarageModule {}
