import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import {
  AdminServicesController,
  PublicServicesController,
} from './controllers/services.controller';
import { ServicesAdminService } from './services/services-admin.service';
import { ServicesPublicService } from './services/services-public.service';

/**
 * Services directory (REQUIREMENTS §15, docs/decisions/backend-discovery.md §5):
 *   GET /api/v1/services[/types|/:slug] (public)
 *   /api/v1/admin/services… CRUD, publish/unpublish/archive, verify-contact
 */
@Module({
  imports: [VehiclesModule],
  controllers: [PublicServicesController, AdminServicesController],
  providers: [ServicesPublicService, ServicesAdminService],
  exports: [ServicesPublicService],
})
export class ServicesDirectoryModule {}
