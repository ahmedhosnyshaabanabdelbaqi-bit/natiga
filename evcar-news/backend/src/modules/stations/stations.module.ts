import { Module } from '@nestjs/common';
import { STATIONS_CLOCK, systemClock } from './common/clock';
import { StationMediaService } from './common/station-media';
import {
  MeStationsController,
  PublicStationsController,
} from './controllers/public-stations.controller';
import { StationAvailabilityService } from './services/station-availability.service';
import { StationCommunityService } from './services/station-community.service';
import { StationDetailService } from './services/station-detail.service';
import { StationMetaService } from './services/station-meta.service';
import { StationSearchService } from './services/station-search.service';
import { VehicleCompatService } from './services/vehicle-compat.service';

/**
 * Charging stations (REQUIREMENTS §10–11), see docs/decisions/backend-stations.md:
 *   GET  /api/v1/stations[?bbox|lat,lng…]      map + list search (PostGIS)
 *   GET  /api/v1/stations/clusters|meta|:id[/availability]
 *   POST /api/v1/stations/:id/reports|checkins, /stations/suggestions (signed in)
 *   /api/v1/me/station-suggestions, /me/station-reports
 *   /api/v1/admin/stations…, charging-operators, station-reports, station-checkins,
 *   station-suggestions, station-duplicates, station-sync, station-availability
 */
@Module({
  controllers: [PublicStationsController, MeStationsController],
  providers: [
    { provide: STATIONS_CLOCK, useValue: systemClock },
    StationMediaService,
    VehicleCompatService,
    StationAvailabilityService,
    StationSearchService,
    StationDetailService,
    StationMetaService,
    StationCommunityService,
  ],
  exports: [StationSearchService, StationDetailService, StationAvailabilityService],
})
export class StationsModule {}
