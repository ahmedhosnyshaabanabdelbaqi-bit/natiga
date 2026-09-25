/**
 * Every feature module of the modular monolith (contract §4.2), registered
 * in AppModule. Module owners only edit files inside their own directory.
 */
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { MarketsModule } from './markets/markets.module';
import { I18nModule } from './i18n/i18n.module';
import { ArticlesModule } from './articles/articles.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { RssImportModule } from './rss-import/rss-import.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ComparisonsModule } from './comparisons/comparisons.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { SearchModule } from './search/search.module';
import { HomeModule } from './home/home.module';
import { MediaModule } from './media/media.module';
import { ToursModule } from './tours/tours.module';
import { StationsModule } from './stations/stations.module';
import { CalculatorsModule } from './calculators/calculators.module';
import { GarageModule } from './garage/garage.module';
import { ChargingLogsModule } from './charging-logs/charging-logs.module';
import { RemindersModule } from './reminders/reminders.module';
import { FavoritesModule } from './favorites/favorites.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TripsModule } from './trips/trips.module';
import { CommunityModule } from './community/community.module';
import { ServicesDirectoryModule } from './services-directory/services-directory.module';
import { EncyclopediaModule } from './encyclopedia/encyclopedia.module';
import { AdsModule } from './ads/ads.module';
import { AssistantModule } from './assistant/assistant.module';
import { ShareModule } from './share/share.module';
import { SystemModule } from './system/system.module';
import { HealthModule } from './health/health.module';

export const FEATURE_MODULES = [
  AuthModule,
  UsersModule,
  RbacModule,
  AuditModule,
  SettingsModule,
  MarketsModule,
  I18nModule,
  ArticlesModule,
  CategoriesModule,
  TagsModule,
  RssImportModule,
  VehiclesModule,
  ComparisonsModule,
  RecommendationsModule,
  SearchModule,
  HomeModule,
  MediaModule,
  ToursModule,
  StationsModule,
  CalculatorsModule,
  GarageModule,
  ChargingLogsModule,
  RemindersModule,
  FavoritesModule,
  NotificationsModule,
  TripsModule,
  CommunityModule,
  ServicesDirectoryModule,
  EncyclopediaModule,
  AdsModule,
  AssistantModule,
  ShareModule,
  SystemModule,
  HealthModule,
];
