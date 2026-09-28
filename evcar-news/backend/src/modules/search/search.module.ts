import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AdminSearchController, SearchController } from './controllers/search.controller';
import { AliasIndexService } from './services/alias-index.service';
import { SearchAdminService } from './services/search-admin.service';
import { SearchService } from './services/search.service';
import { DocumentsSource } from './services/sources/documents.source';
import { EncyclopediaSource } from './services/sources/encyclopedia.source';
import { ServicesSource } from './services/sources/services.source';
import { StationsSource } from './services/sources/stations.source';

/**
 * Unified search (docs/decisions/backend-discovery.md §1):
 *   GET /api/v1/search, /search/suggest (public, rate limit "search")
 *   /api/v1/admin/search-aliases CRUD, /admin/search/status, /admin/search/reindex
 * Articles / brands / models / variants come from search_documents (kept in
 * sync by their modules); stations, encyclopedia and services are queried
 * directly (read-only).
 */
@Module({
  imports: [ArticlesModule, VehiclesModule],
  controllers: [SearchController, AdminSearchController],
  providers: [
    AliasIndexService,
    DocumentsSource,
    StationsSource,
    EncyclopediaSource,
    ServicesSource,
    SearchService,
    SearchAdminService,
  ],
  exports: [SearchService, AliasIndexService],
})
export class SearchModule {}
