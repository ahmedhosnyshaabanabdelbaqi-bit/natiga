import { Module } from '@nestjs/common';
import { jobsEnabledProviders } from '../../jobs/queues';
import { STATIONS_CLOCK, systemClock } from './common/clock';
import { StationMediaService } from './common/station-media';
import {
  AdminChargingOperatorsController,
  AdminStationAvailabilityController,
  AdminStationCheckinsController,
  AdminStationDuplicatesController,
  AdminStationReportsController,
  AdminStationsController,
  AdminStationSuggestionsController,
  AdminStationSyncController,
} from './controllers/admin-stations.controller';
import {
  MeStationsController,
  PublicStationsController,
} from './controllers/public-stations.controller';
import { StationAdminService } from './services/station-admin.service';
import { StationAvailabilityService } from './services/station-availability.service';
import { StationCommunityService } from './services/station-community.service';
import { StationDetailService } from './services/station-detail.service';
import { StationDuplicatesService } from './services/station-duplicates.service';
import { StationMetaService } from './services/station-meta.service';
import { StationModerationService } from './services/station-moderation.service';
import { StationSearchService } from './services/station-search.service';
import { StationSyncService } from './services/station-sync.service';
import { StationSyncTrigger } from './services/station-sync.trigger';
import { StationTariffsService } from './services/station-tariffs.service';
import { VehicleCompatService } from './services/vehicle-compat.service';

/**
 * Charging stations (REQUIREMENTS §10–11), see docs/decisions/backend-stations.md:
 *   GET  /api/v1/stations[?bbox|lat,lng…]      map + list search (PostGIS)
 *   GET  /api/v1/stations/clusters|meta|:id[/availability]
 *   POST /api/v1/stations/:id/reports|checkins, /stations/suggestions (signed in)
 *   /api/v1/me/station-suggestions, /me/station-reports
 *   /api/v1/admin/stations…, charging-operators, station-reports, station-checkins,
 *   station-suggestions, station-duplicates, station-sync, station-availability
 * Scheduled OCM syncs + observation purge run on JOBS_ENABLED instances.
 */
@Module({
  controllers: [
    PublicStationsController,
    MeStationsController,
    AdminStationsController,
    AdminChargingOperatorsController,
    AdminStationReportsController,
    AdminStationCheckinsController,
    AdminStationSuggestionsController,
    AdminStationDuplicatesController,
    AdminStationSyncController,
    AdminStationAvailabilityController,
  ],
  providers: [
    { provide: STATIONS_CLOCK, useValue: systemClock },
    StationMediaService,
    VehicleCompatService,
    StationAvailabilityService,
    StationSearchService,
    StationDetailService,
    StationMetaService,
    StationCommunityService,
    StationDuplicatesService,
    StationAdminService,
    StationTariffsService,
    StationModerationService,
    StationSyncService,
    ...jobsEnabledProviders([StationSyncTrigger]),
  ],
  exports: [
    StationSearchService,
    StationDetailService,
    StationAvailabilityService,
    StationSyncService,
  ],
})
export class StationsModule {}
