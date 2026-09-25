/**
 * Public DTOs of 360° interior tours used by the apps (contract in
 * docs/decisions/backend-tours.md §1). Only published tours with licensed,
 * processed files are served; missing values are null (never 0).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { QueryInt } from '../../vehicles/dto/validators';
import { DRIVE_SIDES, HOTSPOT_TYPES, MATCH_TYPES, SCENE_POSITIONS } from './admin-tour.dto';

export class PublicTourListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Tours of this trim.' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Tours of the trims of this model year.' })
  @IsOptional()
  @IsUUID()
  modelYearId?: string;
}

export class FeaturedToursQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @QueryInt(1, 20)
  limit?: number;
}

export class TourDetailQueryDto {
  @ApiPropertyOptional({
    minimum: 512,
    maximum: 16384,
    description:
      'Largest panorama width the device can display (max texture size / memory class). Default 4096.',
  })
  @QueryInt(512, 16384)
  maxWidth?: number;
}

export class TourSeatSceneDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ enum: SCENE_POSITIONS }) position!: string;
  @ApiProperty() title!: string;
}

export class PublicTourCardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() variantSlug!: string;
  @ApiProperty({ description: 'Trim name.' }) variantName!: string;
  @ApiProperty({ description: 'Brand + model + trim, localized.' }) carName!: string;
  @ApiProperty() brandName!: string;
  @ApiProperty() modelName!: string;
  @ApiProperty() modelSlug!: string;
  @ApiProperty({ format: 'uuid' }) modelYearId!: string;
  @ApiProperty() modelYear!: number;
  @ApiProperty() marketCode!: string;
  @ApiProperty({ enum: DRIVE_SIDES }) driveSide!: string;
  @ApiProperty() interiorColorName!: string;
  @ApiProperty({ nullable: true, type: String, example: '#1F1F1F' }) interiorColorHex!:
    string | null;
  @ApiProperty({ type: [TourSeatSceneDto] }) seatScenes!: TourSeatSceneDto[];
  @ApiProperty() sceneCount!: number;
  @ApiProperty({ description: 'Imagery of a similar trim: show differenceNote prominently.' })
  isReferenceForSimilarTrim!: boolean;
  @ApiProperty({ nullable: true, type: String }) differenceNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) referenceVariantName!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Low-res preview of the first scene.' })
  previewUrl!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, type: String }) demoLabel!: string | null;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
}

export class TourImageFileDto {
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}

export class TourRenditionDto extends TourImageFileDto {
  @ApiProperty({ nullable: true, type: Number }) sizeBytes!: number | null;
}

export class TourMultiresDto {
  @ApiProperty({ description: 'Absolute URL prefix of the tiles (Pannellum basePath).' })
  basePath!: string;
  @ApiProperty({ example: '/%l/%s%y_%x' }) path!: string;
  @ApiProperty({ example: '/fallback/%s' }) fallbackPath!: string;
  @ApiProperty({ example: 'jpg' }) extension!: string;
  @ApiProperty({ example: 512 }) tileResolution!: number;
  @ApiProperty() maxLevel!: number;
  @ApiProperty() cubeResolution!: number;
}

export class TourPanoramaDto {
  @ApiProperty({ format: 'uuid' }) assetId!: string;
  @ApiProperty({ enum: ['equirectangular', 'cubemap'] }) projection!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: TourImageFileDto }) preview!: TourImageFileDto | null;
  @ApiProperty({ type: [TourRenditionDto], description: 'Ascending width, ≤ maxWidth.' })
  renditions!: TourRenditionDto[];
  @ApiProperty({ nullable: true, type: TourRenditionDto })
  recommendedRendition!: TourRenditionDto | null;
  @ApiProperty({ nullable: true, type: TourMultiresDto }) multires!: TourMultiresDto | null;
}

export class TourAttributionDto {
  @ApiProperty({ nullable: true, type: String }) credit!: string | null;
  @ApiProperty() rightsHolder!: string;
  @ApiProperty() licenseType!: string;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
}

export class TourViewDto {
  @ApiProperty() yaw!: number;
  @ApiProperty() pitch!: number;
  @ApiProperty() hfov!: number;
  @ApiProperty({ nullable: true, type: Number }) minHfov!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxHfov!: number | null;
  @ApiProperty({ nullable: true, type: Number }) minPitch!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxPitch!: number | null;
  @ApiProperty({ nullable: true, type: Number }) northOffset!: number | null;
}

export class TourHotspotImageDto extends TourImageFileDto {
  @ApiProperty({ type: [TourImageFileDto] }) sizes!: TourImageFileDto[];
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty({ nullable: true, type: String }) credit!: string | null;
}

export class TourHotspotVideoDto {
  @ApiProperty({ enum: ['file', 'embed'] }) kind!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ enum: ['self', 'youtube', 'vimeo'] }) provider!: string;
  @ApiProperty({ nullable: true, type: String }) mimeType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: Number }) durationSeconds!: number | null;
  @ApiProperty({ nullable: true, type: String }) credit!: string | null;
}

export class TourHotspotSpecDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({
    nullable: true,
    oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
    description: 'null → "غير متوفر / Not available".',
  })
  value!: number | string | boolean | null;
  @ApiProperty({ nullable: true, type: String }) reliability!: string | null;
  @ApiProperty() variantSlug!: string;
}

export class TourHotspotDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: HOTSPOT_TYPES }) type!: string;
  @ApiProperty() yaw!: number;
  @ApiProperty() pitch!: number;
  @ApiProperty({ nullable: true, type: String }) iconKey!: string | null;
  @ApiProperty({ description: 'Plain text.' }) title!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Plain text.' }) body!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) targetSceneId!: string | null;
  @ApiProperty({ nullable: true, type: Number }) targetYaw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) targetPitch!: number | null;
  @ApiProperty({ nullable: true, type: TourHotspotImageDto }) image!: TourHotspotImageDto | null;
  @ApiProperty({ nullable: true, type: TourHotspotVideoDto }) video!: TourHotspotVideoDto | null;
  @ApiProperty({ nullable: true, type: TourHotspotSpecDto }) spec!: TourHotspotSpecDto | null;
}

export class TourSceneDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ enum: SCENE_POSITIONS }) position!: string;
  @ApiProperty() positionLabel!: string;
  @ApiProperty() title!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: TourViewDto }) view!: TourViewDto;
  @ApiProperty({ type: TourPanoramaDto }) panorama!: TourPanoramaDto;
  @ApiProperty({ type: TourAttributionDto }) attribution!: TourAttributionDto;
  @ApiProperty({ type: [TourHotspotDto] }) hotspots!: TourHotspotDto[];
}

export class TourAttributionLineDto {
  @ApiProperty() text!: string;
  @ApiProperty() licenseType!: string;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
}

export class PublicTourDetailDto extends PublicTourCardDto {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ description: 'The tour belongs to the request market.' }) marketMatch!: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'Origin of every media URL.' })
  mediaOrigin!: string | null;
  @ApiProperty({ format: 'uuid' }) initialSceneId!: string;
  @ApiProperty({ type: [TourSceneDto] }) scenes!: TourSceneDto[];
  @ApiProperty({ type: [TourAttributionLineDto] }) attributions!: TourAttributionLineDto[];
  @ApiProperty({ enum: MATCH_TYPES }) matchType!: string;
}
