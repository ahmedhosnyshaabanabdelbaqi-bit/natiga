import { Module } from '@nestjs/common';
import {
  AdminBrandsController,
  AdminGenerationsController,
  AdminModelsController,
  AdminModelYearsController,
  AdminVariantsController,
} from './admin/admin-catalog.controller';
import { AdminCatalogService } from './admin/admin-catalog.service';
import {
  AdminDataQualityController,
  AdminMeasurementsController,
  AdminSourcesController,
  AdminVariantDataController,
  AdminVehicleSearchController,
} from './admin/admin-data.controller';
import { AdminDataService } from './admin/admin-data.service';
import { AdminPricesService } from './admin/admin-prices.service';
import { AdminSourcesService } from './admin/admin-sources.service';
import { AssetGuard } from './admin/asset-guard';
import { DataQualityService } from './admin/data-quality.service';
import { MediaUrlService } from './common/media-urls';
import { CatalogRowHandlers } from './import/row-handlers';
import { VehicleExportService } from './import/vehicle-export.service';
import { VehicleImportController } from './import/vehicle-import.controller';
import { VehicleImportService } from './import/vehicle-import.service';
import { CarPagesService } from './public/car-pages.service';
import { CatalogQueryService } from './public/catalog-query.service';
import { MarketContextService } from './public/market-context';
import { PickersService } from './public/pickers.service';
import { PublicCatalogController } from './public/public-catalog.controller';
import { RelatedContentService } from './public/related-content.service';
import { VehicleSearchIndexer } from './search/vehicle-search-indexer';

/**
 * Vehicle catalog (REQUIREMENTS §6): brands → models → generations → model
 * years → variants (one powertrain each), per-market availability and
 * local names, specs with canonical units + provenance, ranges and
 * consumption with their cycle, charging inlets / times / curves, price
 * history, galleries, competitors, CSV import/export and the public API
 * used by the apps. See docs/decisions/backend-vehicles.md.
 */
@Module({
  controllers: [
    PublicCatalogController,
    AdminBrandsController,
    AdminModelsController,
    AdminGenerationsController,
    AdminModelYearsController,
    AdminVariantsController,
    AdminVariantDataController,
    AdminMeasurementsController,
    AdminSourcesController,
    AdminVehicleSearchController,
    AdminDataQualityController,
    VehicleImportController,
  ],
  providers: [
    MediaUrlService,
    AssetGuard,
    VehicleSearchIndexer,
    AdminCatalogService,
    AdminDataService,
    AdminPricesService,
    AdminSourcesService,
    DataQualityService,
    MarketContextService,
    CatalogQueryService,
    RelatedContentService,
    CarPagesService,
    PickersService,
    CatalogRowHandlers,
    VehicleImportService,
    VehicleExportService,
  ],
  exports: [MediaUrlService, VehicleSearchIndexer, CarPagesService, MarketContextService],
})
export class VehiclesModule {}
