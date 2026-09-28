import { Module } from '@nestjs/common';
import { CalculatorsModule } from '../calculators/calculators.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/**
 * Trip planner (REQUIREMENTS §12): POST /api/v1/trips/plan (only with a
 * configured routing provider, else 503) + /api/v1/me/trips (saved plans).
 * Planning logic: ./planner (pure, unit-tested). See
 * docs/decisions/backend-personal.md §7.
 */
@Module({
  imports: [CalculatorsModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
