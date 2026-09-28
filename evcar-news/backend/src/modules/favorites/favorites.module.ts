import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { FavoritesController } from './controllers/favorites.controller';
import { FavoriteTargetsService } from './services/favorite-targets.service';
import { FavoritesService } from './services/favorites.service';

/**
 * Personal favorites (REQUIREMENTS §14, docs/decisions/backend-discovery.md §3):
 *   GET/PUT/DELETE /api/v1/me/favorites…, GET /me/favorites/keys, POST /me/favorites/merge
 */
@Module({
  imports: [VehiclesModule],
  controllers: [FavoritesController],
  providers: [FavoriteTargetsService, FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
