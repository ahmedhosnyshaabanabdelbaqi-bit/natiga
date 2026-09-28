import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { ComparisonsModule } from '../comparisons/comparisons.module';
import { EncyclopediaModule } from '../encyclopedia/encyclopedia.module';
import { SettingsModule } from '../settings/settings.module';
import { StationsModule } from '../stations/stations.module';
import { ToursModule } from '../tours/tours.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { HomeController } from './controllers/home.controller';
import { HomeFlagsService } from './services/home-flags.service';
import { HomeService } from './services/home.service';
import { InterestsService } from './services/interests.service';

/**
 * Home feed (REQUIREMENTS §4, docs/decisions/backend-discovery.md §2):
 *   GET /api/v1/home[?lat&lng], GET/PUT /api/v1/me/interests
 * Items come from the owning modules' public services (same shapes as
 * their list endpoints).
 */
@Module({
  imports: [
    SettingsModule,
    ArticlesModule,
    VehiclesModule,
    ComparisonsModule,
    ToursModule,
    StationsModule,
    EncyclopediaModule,
  ],
  controllers: [HomeController],
  providers: [HomeFlagsService, InterestsService, HomeService],
  exports: [HomeService],
})
export class HomeModule {}
