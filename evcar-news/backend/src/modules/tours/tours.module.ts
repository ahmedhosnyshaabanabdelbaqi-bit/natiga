import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminToursController } from './controllers/admin-tours.controller';
import { PublicToursController } from './controllers/public-tours.controller';
import { ToursAdminService } from './services/tours-admin.service';
import { ToursPublicService } from './services/tours-public.service';

/**
 * 360° interior tours (REQUIREMENTS §8–9, ARCHITECTURE §4.8):
 *   GET /api/v1/tours, /tours/featured, /tours/:idOrSlug    viewer data for the apps
 *   /api/v1/admin/tours/...                                  tours, scenes, hotspots,
 *                                                            workflow, reference approval
 * A tour is published only when every scene panorama / hotspot file is
 * processed, licensed (valid today) and visually confirmed by an editor.
 * Events: `tour.published` / `tour.unpublished` ({tourId, variantId, marketCode, from, to}).
 * See docs/decisions/backend-tours.md.
 */
@Module({
  imports: [MediaModule],
  controllers: [PublicToursController, AdminToursController],
  providers: [ToursAdminService, ToursPublicService],
  exports: [ToursAdminService, ToursPublicService],
})
export class ToursModule {}
