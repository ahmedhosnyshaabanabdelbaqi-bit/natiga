import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

/**
 * Explainable recommendations by usage / budget / home charging
 * (REQUIREMENTS §7): POST /api/v1/recommendations. Stateless; visible
 * weights, per-factor contributions, reasons, missing data and "no decisive
 * recommendation" when data is not comparable. No paid influence: the engine
 * never reads ads or sponsorship data. See docs/decisions/backend-comparisons.md.
 */
@Module({
  imports: [VehiclesModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
