/**
 * DTOs of the media library admin API (REQUIREMENTS §9): resumable upload
 * sessions, assets (validation report, processing state, derived files,
 * rights), licences and the editor's visual check of panoramas.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import {
  NullableDateOnly,
  NullableMultiline,
  NullableText,
  NullableUuid,
  QueryBool,
  QueryInt,
  RequiredText,
} from '../../vehicles/dto/validators';
import { UPLOAD_KINDS } from '../domain/media-rules';

export const LICENSE_TYPES = [
  'owned',
  'commissioned',
  'press_kit',
  'licensed',
  'cc0',
  'cc_by',
  'cc_by_sa',
  'permission',
  'other',
] as const;

export const MEDIA_KINDS = ['image', 'panorama', 'video', 'document', 'model_3d', 'other'] as const;
export const MEDIA_STATUSES = [
  'uploading',
  'uploaded',
  'processing',
  'ready',
  'failed',
  'rejected',
] as const;

const HTTPS_URL = /^https:\/\/[^\s<>"]+$/;
const HTTPS_MESSAGE = localizedMessage({
  ar: 'يجب أن يكون الرابط بصيغة https://',
  en: 'The link must be an https:// URL.',
});
const SHA256_MESSAGE = localizedMessage({
  ar: 'بصمة SHA-256 يجب أن تكون 64 خانة ست عشرية.',
  en: 'The SHA-256 must be 64 hexadecimal characters.',
});
const MIME_MESSAGE = localizedMessage({
  ar: 'نوع المحتوى غير صالح (مثل image/jpeg).',
  en: 'Invalid content type (e.g. image/jpeg).',
});
const PURPOSE_MESSAGE = localizedMessage({
  ar: 'الغرض يتكون من حروف لاتينية صغيرة وأرقام وشرطة سفلية.',
  en: 'The purpose may only contain lower-case latin letters, digits and underscores.',
});

const HttpsUrl = () => Matches(HTTPS_URL, { context: HTTPS_MESSAGE });

// --- upload sessions ------------------------------------------------------------

export class CreateUploadDto {
  @ApiProperty({ example: 'driver-seat.jpg', description: 'Original file name (display only).' })
  @RequiredText(255)
  filename!: string;

  @ApiProperty({ example: 48_123_456, description: 'Exact size of the whole file in bytes.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'Declared type (the server sniffs the real type from the bytes).',
  })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z]+\/[a-z0-9.+-]+$/i, { context: MIME_MESSAGE })
  mimeType!: string;

  @ApiProperty({ enum: UPLOAD_KINDS, description: 'panorama = equirectangular 360° image.' })
  @IsIn(UPLOAD_KINDS)
  kind!: (typeof UPLOAD_KINDS)[number];

  @ApiPropertyOptional({
    example: 'tour_scene',
    description:
      'What the file is for: tour_scene, hotspot_media, vehicle_gallery, article_image, station_photo, license_proof...',
  })
  @OptionalNotNull()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/, { context: PURPOSE_MESSAGE })
  purpose?: string;

  @ApiPropertyOptional({ description: 'SHA-256 (hex) of the whole file; verified on completion.' })
  @OptionalNotNull()
  @Matches(/^[0-9a-fA-F]{64}$/, { context: SHA256_MESSAGE })
  sha256?: string;

  @ApiPropertyOptional({
    description: 'Planned chunk size (bytes). Default 8 MiB, max UPLOAD_CHUNK_MAX_BYTES.',
  })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  chunkSizeBytes?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Licence to record on the file (needs licenses.write).',
  })
  @NullableUuid()
  licenseId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Replaces this asset: the new file becomes its next version (same kind).',
  })
  @NullableUuid()
  previousVersionId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(300) creditText?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) altTextAr?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) altTextEn?:
    string | null;
}

export class UploadSessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['active', 'completed', 'aborted', 'expired'] }) status!: string;
  @ApiProperty({ enum: UPLOAD_KINDS }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) purpose!: string | null;
  @ApiProperty() filename!: string;
  @ApiProperty({ nullable: true, type: String }) declaredMimeType!: string | null;
  @ApiProperty() totalBytes!: number;
  @ApiProperty({ description: 'Upload-Offset: send the next chunk at this offset.' })
  receivedBytes!: number;
  @ApiProperty() chunkSizeBytes!: number;
  @ApiProperty({ description: 'Smallest accepted chunk except the last one.' })
  minChunkBytes!: number;
  @ApiProperty() maxChunkBytes!: number;
  @ApiProperty() partsReceived!: number;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) lastChunkAt!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) assetId!: string | null;
  @ApiProperty({ nullable: true, type: String }) error!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

// --- assets -------------------------------------------------------------------------

export class AdminMediaListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MEDIA_KINDS }) @IsOptional() @IsIn(MEDIA_KINDS) kind?: string;
  @ApiPropertyOptional({ enum: MEDIA_STATUSES })
  @IsOptional()
  @IsIn(MEDIA_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Search in file name, alt texts and captions.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'true = with a licence, false = without one.' })
  @QueryBool()
  licensed?: boolean;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() licenseId?: string;

  @ApiPropertyOptional({ example: 'tour_scene' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/, { context: PURPOSE_MESSAGE })
  purpose?: string;

  @ApiPropertyOptional() @QueryBool() isDemo?: boolean;
  @ApiPropertyOptional({ default: false }) @QueryBool() includeDeleted?: boolean;
}

export class UpdateMediaAssetDto {
  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Assign / remove the licence (needs licenses.write).',
  })
  @NullableUuid()
  licenseId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(300) creditText?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) altTextAr?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) altTextEn?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(1000) captionAr?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(1000) captionEn?:
    string | null;
}

export class VisualCheckDto {
  @ApiProperty({
    description:
      'The editor looked at the preview and confirms a real, correctly oriented 360° interior of the right trim.',
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  confirmed!: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Codes of the validation warnings the editor reviewed (all must be listed).',
  })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  acknowledgedWarnings?: string[];

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(1000) note?:
    string | null;
}

export class EmbedVideoDto {
  @ApiProperty({
    example: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    description: 'YouTube or Vimeo link (https). Stored as the privacy-friendly embed URL.',
  })
  @IsString()
  @MaxLength(2048)
  @HttpsUrl()
  url!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Licence of the video (licenses.write).' })
  @NullableUuid()
  licenseId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(300) creditText?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) altTextAr?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) altTextEn?:
    string | null;
}

export class MediaMessageDto {
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ['warning', 'info'] }) severity!: string;
  @ApiProperty({ description: 'Localized.' }) message!: string;
  @ApiPropertyOptional({ type: Object }) data?: Record<string, unknown>;
}

export class MediaFileDto {
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: Number }) sizeBytes!: number | null;
  @ApiProperty() label!: string;
}

export class MediaLicenseSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: LICENSE_TYPES }) licenseType!: string;
  @ApiProperty() rightsHolder!: string;
  @ApiProperty({ nullable: true, type: String }) attributionText!: string | null;
  @ApiProperty() attributionRequired!: boolean;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '2027-12-31' }) validUntil!: string | null;
  @ApiProperty({ description: 'Valid today (not expired, already started).' }) isValid!: boolean;
}

export class AdminMediaAssetDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: MEDIA_KINDS }) kind!: string;
  @ApiProperty({ enum: MEDIA_STATUSES }) status!: string;
  @ApiProperty({ nullable: true, type: String }) purpose!: string | null;
  @ApiProperty({ nullable: true, type: String }) originalFilename!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Sniffed from the content.' })
  mimeType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) sizeBytes!: number | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, enum: ['flat', 'equirectangular', 'cubemap'], type: String })
  projection!: string | null;
  @ApiProperty({ nullable: true, type: String }) checksumSha256!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) previousVersionId!: string | null;
  @ApiProperty({
    type: Object,
    description: '{ progress 0..100, attempts, error, startedAt, processedAt }',
  })
  processing!: {
    progress: number;
    attempts: number;
    error: string | null;
    startedAt: string | null;
    processedAt: string | null;
  };
  @ApiProperty({ type: [MediaMessageDto], description: 'Validation warnings (localized).' })
  warnings!: MediaMessageDto[];
  @ApiProperty({
    nullable: true,
    type: Object,
    description:
      'Editor confirmation of a panorama: { confirmedAt, confirmedById, note, acknowledgedWarnings }.',
  })
  visualCheck!: Record<string, unknown> | null;
  @ApiProperty({
    description: 'Panorama: the editor must confirm the visual check before publishing.',
  })
  visualCheckRequired!: boolean;
  @ApiProperty({ nullable: true, type: MediaLicenseSummaryDto })
  license!: MediaLicenseSummaryDto | null;
  @ApiProperty({ nullable: true, type: String }) creditText!: string | null;
  @ApiProperty({ nullable: true, type: String }) altTextAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) altTextEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) captionAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) captionEn!: string | null;
  @ApiProperty({ nullable: true, type: MediaFileDto }) preview!: MediaFileDto | null;
  @ApiProperty({ type: [MediaFileDto] }) renditions!: MediaFileDto[];
  @ApiProperty({ nullable: true, type: MediaFileDto }) thumbnail!: MediaFileDto | null;
  @ApiProperty({ description: 'Generated multires tiles.' }) tileCount!: number;
  @ApiProperty({ nullable: true, type: Object }) multires!: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: Object, description: 'External video (embed).' })
  embed!: Record<string, unknown> | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) uploadedById!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) deletedAt!: string | null;
}

export class MediaUsageDto {
  @ApiProperty() tourScenes!: number;
  @ApiProperty() hotspots!: number;
  @ApiProperty() publishedTours!: number;
  @ApiProperty() articleCovers!: number;
  @ApiProperty() vehicleMedia!: number;
  @ApiProperty() stationMedia!: number;
}

export class AdminMediaAssetDetailDto extends AdminMediaAssetDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Signed URL of the private original (10 minutes).',
  })
  originalUrl!: string | null;
  @ApiProperty({ type: MediaUsageDto }) usage!: MediaUsageDto;
  @ApiProperty({ nullable: true, type: Object, description: 'Full validation report.' })
  validation!: Record<string, unknown> | null;
}

export class MediaCompletionDto extends AdminMediaAssetDto {
  @ApiProperty({
    type: Object,
    description: '{ queued: boolean, jobId: string|null, reason: string|null }',
  })
  processingJob!: { queued: boolean; jobId: string | null; reason: string | null };
  @ApiProperty({
    nullable: true,
    format: 'uuid',
    type: String,
    description: 'An existing asset with the same bytes (SHA-256).',
  })
  duplicateOf!: string | null;
}

export class ReprocessResultDto {
  @ApiProperty() queued!: boolean;
  @ApiProperty({ nullable: true, type: String }) jobId!: string | null;
}

// --- licences --------------------------------------------------------------------------

export class LicenseListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Only licences ending within N days (incl. expired).' })
  @QueryInt(0, 3650)
  expiringWithinDays?: number;

  @ApiPropertyOptional({ enum: LICENSE_TYPES })
  @IsOptional()
  @IsIn(LICENSE_TYPES)
  licenseType?: string;
}

export class CreateLicenseDto {
  @ApiProperty({ enum: LICENSE_TYPES }) @IsIn(LICENSE_TYPES) licenseType!: string;

  @ApiProperty({ example: 'Photographer name / agency', description: 'Who holds the rights.' })
  @RequiredText(300)
  rightsHolder!: string;

  @ApiPropertyOptional({ default: false })
  @OptionalNotNull()
  @IsBoolean()
  attributionRequired?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Credit line (required when attribution is required).',
  })
  @NullableText(500)
  attributionText?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @HttpsUrl()
  licenseUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @HttpsUrl()
  sourceUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) permittedUses?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) restrictions?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-01-01' })
  @NullableDateOnly()
  validFrom?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: '2028-12-31' })
  @NullableDateOnly()
  validUntil?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Document / image proving the licence (media library).',
  })
  @NullableUuid()
  proofAssetId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(4000) notes?:
    string | null;
}

export class UpdateLicenseDto {
  @ApiPropertyOptional({ enum: LICENSE_TYPES })
  @OptionalNotNull()
  @IsIn(LICENSE_TYPES)
  licenseType?: string;
  @ApiPropertyOptional() @OptionalNotNull() @RequiredText(300) rightsHolder?: string;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() attributionRequired?: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) attributionText?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @HttpsUrl()
  licenseUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @HttpsUrl()
  sourceUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) permittedUses?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) restrictions?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableDateOnly() validFrom?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableDateOnly() validUntil?:
    string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @NullableUuid() proofAssetId?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(4000) notes?:
    string | null;
}

export class LicenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: LICENSE_TYPES }) licenseType!: string;
  @ApiProperty() rightsHolder!: string;
  @ApiProperty({ nullable: true, type: String }) attributionText!: string | null;
  @ApiProperty() attributionRequired!: boolean;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) permittedUses!: string | null;
  @ApiProperty({ nullable: true, type: String }) restrictions!: string | null;
  @ApiProperty({ nullable: true, type: String }) validFrom!: string | null;
  @ApiProperty({ nullable: true, type: String }) validUntil!: string | null;
  @ApiProperty({ enum: ['valid', 'expired', 'not_yet_valid'] }) validity!: string;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Days until validUntil (negative = expired).',
  })
  daysLeft!: number | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) proofAssetId!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() assetCount!: number;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
