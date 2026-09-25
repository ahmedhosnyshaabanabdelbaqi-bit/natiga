import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AdminComparisonsController } from './controllers/admin-comparisons.controller';
import {
  MeComparisonsController,
  PublicComparisonsController,
} from './controllers/public-comparisons.controller';
import { ComparisonAdminService } from './services/comparison-admin.service';
import { ComparisonComputeService } from './services/comparison-compute.service';
import { ComparisonStatsService } from './services/comparison-stats.service';
import { ComparisonsService } from './services/comparisons.service';
import { ItemResolverService } from './services/item-resolver.service';

/**
 * Comparisons (REQUIREMENTS §7), see docs/decisions/backend-comparisons.md:
 *   POST /api/v1/comparisons/compute          2–4 trims → grouped, explained rows
 *   POST /api/v1/comparisons                  guest share link / saved in account
 *   GET  /api/v1/comparisons/s/:shareId       open a shared / featured comparison
 *   GET  /api/v1/comparisons/featured         home "مقارنات مختارة"
 *   GET|PATCH|DELETE /api/v1/me/comparisons[/:id]
 *   /api/v1/admin/comparisons (comparisons.curate), stats/most-compared (analytics.read)
 * The pure engine (engine/) never reads ads or sponsorship data.
 */
@Module({
  imports: [VehiclesModule],
  controllers: [PublicComparisonsController, MeComparisonsController, AdminComparisonsController],
  providers: [
    ItemResolverService,
    ComparisonComputeService,
    ComparisonStatsService,
    ComparisonsService,
    ComparisonAdminService,
  ],
  exports: [ComparisonsService, ComparisonComputeService, ItemResolverService],
})
export class ComparisonsModule {}
