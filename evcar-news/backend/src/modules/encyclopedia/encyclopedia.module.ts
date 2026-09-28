import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import {
  AdminEncyclopediaController,
  PublicEncyclopediaController,
} from './controllers/encyclopedia.controller';
import { EncyclopediaAdminService } from './services/encyclopedia-admin.service';
import { EncyclopediaPublicService } from './services/encyclopedia-public.service';

/**
 * Beginner encyclopedia (REQUIREMENTS §15, docs/decisions/backend-discovery.md §4):
 *   GET /api/v1/encyclopedia[/categories|/:slug] (public, reviewed entries only)
 *   /api/v1/admin/encyclopedia/… entries CRUD + technical review workflow, categories
 */
@Module({
  imports: [VehiclesModule, ArticlesModule],
  controllers: [PublicEncyclopediaController, AdminEncyclopediaController],
  providers: [EncyclopediaPublicService, EncyclopediaAdminService],
  exports: [EncyclopediaPublicService],
})
export class EncyclopediaModule {}
