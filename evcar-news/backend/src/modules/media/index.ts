/**
 * Public API of the media module for other modules (import MediaModule in
 * your module to inject the services):
 *
 *   import { MediaUrls, UploadSessionsService } from '../media';
 *
 * Pure helpers: licence validity, storage layout, panorama checks,
 * multires plan, embed allow-list.
 */
export { MediaModule } from './media.module';
export { MediaUrls } from './services/media-urls.service';
export {
  ADMIN_ASSET_INCLUDE,
  MediaAssetsService,
  metadataOf,
  visualCheckOf,
  warningsOf,
  type AssetMetadata,
} from './services/media-assets.service';
export { MediaProcessingService } from './services/media-processing.service';
export { MediaJobsService } from './services/media-jobs.service';
export { UploadSessionsService } from './services/upload-sessions.service';
export { LicensesService } from './services/licenses.service';
export { creditLine, licenseValidity, todayUtc, type LicenseValidity } from './domain/licenses';
export { isAllowedEmbedUrl, parseEmbedVideo, EMBED_ORIGINS } from './domain/video-embed';
export { unacknowledged, warningsToAcknowledge } from './domain/panorama-checks';
