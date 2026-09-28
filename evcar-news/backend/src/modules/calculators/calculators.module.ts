import { Module } from '@nestjs/common';
import { AdminEnergyPricesController, CalculatorsController } from './calculators.controller';
import { CalculatorsService } from './calculators.service';
import { EnergyPricesService } from './energy-prices.service';
import { VehicleDataService } from './vehicle-data.service';

/**
 * Calculators (REQUIREMENTS §13), see docs/decisions/backend-personal.md:
 *   POST /api/v1/calculators/{charge-cost,charge-time,cost-per-100km,monthly-cost,vs-fuel,tco}
 *   GET  /api/v1/calculators/reference-prices
 *   /api/v1/admin/energy-prices (prices.write)
 * The math is the pure engine in ./engine (fully unit-tested).
 * VehicleDataService (catalog battery / charging / consumption values) is
 * also used by the trip planner.
 */
@Module({
  controllers: [CalculatorsController, AdminEnergyPricesController],
  providers: [CalculatorsService, EnergyPricesService, VehicleDataService],
  exports: [VehicleDataService, EnergyPricesService],
})
export class CalculatorsModule {}
