import { Module } from '@nestjs/common';
import { jobsEnabledProviders } from '../../jobs/queues';
import {
  AdminLicensesController,
  AdminMediaAssetsController,
  AdminMediaUploadsController,
  AdminMediaVideosController,
} from './controllers/admin-media.controller';
import {
  MediaMaintenanceTrigger,
  MediaProcessingProcessor,
} from './jobs/media-processing.processor';
import { LicensesService } from './services/licenses.service';
import { MediaAssetsService } from './services/media-assets.service';
import { MediaJobsService } from './services/media-jobs.service';
import { MediaProcessingService } from './services/media-processing.service';
import { MediaUrls } from './services/media-urls.service';
import { MediaValidationService } from './services/media-validation.service';
import { UploadSessionsService } from './services/upload-sessions.service';

/**
 * Media library (REQUIREMENTS §8–9, ARCHITECTURE §4.8):
 *   /api/v1/admin/media/uploads    resumable upload sessions (create, PATCH chunks at
 *                                  Upload-Offset, HEAD/GET offset, complete, cancel)
 *   /api/v1/admin/media/assets     library, validation report, processing state, visual
 *                                  check of panoramas, versions, re-processing, deletion
 *   /api/v1/admin/media/videos     allow-listed YouTube / Vimeo embeds
 *   /api/v1/admin/media/licenses   rights holders, licences, attribution, validity
 * Processing (previews, renditions, Pannellum multires tiles) runs on
 * QUEUES.MEDIA_PROCESSING (MediaProcessingProcessor, JOBS_ENABLED instances).
 * See docs/decisions/backend-tours.md.
 */
@Module({
  controllers: [
    AdminMediaUploadsController,
    AdminMediaAssetsController,
    AdminMediaVideosController,
    AdminLicensesController,
  ],
  providers: [
    MediaUrls,
    MediaValidationService,
    MediaJobsService,
    MediaAssetsService,
    UploadSessionsService,
    LicensesService,
    MediaProcessingService,
    ...jobsEnabledProviders([MediaProcessingProcessor, MediaMaintenanceTrigger]),
  ],
  exports: [
    MediaUrls,
    MediaAssetsService,
    MediaProcessingService,
    MediaJobsService,
    UploadSessionsService,
    LicensesService,
  ],
})
export class MediaModule {}
