/**
 * Admin DTOs of 360° interior tours (REQUIREMENTS §8–9): tours bound to a
 * trim (variant → model year) + market + interior colour + drive side,
 * scenes (one panorama per seat position) and hotspots with ar/en plain
 * texts.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import { AdminMediaAssetDto } from '../../media/dto/media.dto';
import {
  FiniteNumber,
  NullableMultiline,
  NullableText,
  NullableUuid,
  OptionalInt,
  QueryBool,
  RequiredText,
} from '../../vehicles/dto/validators';
import { Max, Min } from 'class-validator';
import { applyDecorators } from '@nestjs/common';

export const SCENE_POSITIONS = [
  'driver',
  'front_passenger',
  'rear',
  'third_row',
  'cargo',
  'other',
] as const;
export const HOTSPOT_TYPES = ['info', 'detail_image', 'video', 'spec_link', 'scene_link'] as const;
export const MATCH_TYPES = ['exact', 'reference_similar_trim'] as const;
export const TOUR_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export const DRIVE_SIDES = ['lhd', 'rhd'] as const;
/** Fixed icon set of the app's viewer (unknown keys are refused). */
export const HOTSPOT_ICON_KEYS = [
  'info',
  'screen',
  'seat',
  'steering',
  'console',
  'roof',
  'climate',
  'storage',
  'speaker',
  'light',
  'charging',
  'battery',
  'door',
  'camera',
  'image',
  'video',
  'spec',
  'arrow',
] as const;

const KEY_MESSAGE = localizedMessage({
  ar: 'المفتاح يتكون من حروف لاتينية صغيرة وأرقام وشرطات (حتى 64).',
  en: 'The key may contain lower-case latin letters, digits, "-" and "_" (max 64).',
});
const SLUG_MESSAGE = localizedMessage({
  ar: 'المعرّف النصي يجب أن يتكون من حروف لاتينية صغيرة وأرقام وشرطات فقط.',
  en: 'The slug may only contain lower-case latin letters, digits and dashes.',
});
const HEX_MESSAGE = localizedMessage({
  ar: 'اللون بصيغة #RRGGBB.',
  en: 'The colour must be #RRGGBB.',
});

const Degrees = (min: number, max: number) =>
  applyDecorators(OptionalNotNull(), FiniteNumber(), Min(min), Max(max));
const NullableDegrees = (min: number, max: number) =>
  applyDecorators(IsOptional(), FiniteNumber(), Min(min), Max(max));

// --- tours ------------------------------------------------------------------------

export class AdminTourListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() variantId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() modelYearId?: string;
  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Matches(/^[A-Z]{2,8}$/)
  marketCode?: string;
  @ApiPropertyOptional({ enum: TOUR_STATUSES }) @IsOptional() @IsIn(TOUR_STATUSES) status?: string;
  @ApiPropertyOptional({ enum: MATCH_TYPES }) @IsOptional() @IsIn(MATCH_TYPES) matchType?: string;
  @ApiPropertyOptional({ description: 'Search in titles, slug and colour names.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional() @QueryBool() isDemo?: boolean;
  @ApiPropertyOptional({ default: false }) @QueryBool() includeDeleted?: boolean;
}

export class CreateTourDto {
  @ApiProperty({ format: 'uuid', description: 'Trim (variant → model year).' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ example: 'EG' })
  @Matches(/^[A-Z]{2,8}$/)
  marketCode!: string;

  @ApiProperty({ enum: DRIVE_SIDES }) @IsIn(DRIVE_SIDES) driveSide!: string;

  @ApiProperty({ example: 'Black' }) @RequiredText(100) interiorColorNameEn!: string;
  @ApiProperty({ example: 'أسود' }) @RequiredText(100) interiorColorNameAr!: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: '#1F1F1F' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { context: HEX_MESSAGE })
  interiorColorHex?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(4000) descriptionAr?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(4000) descriptionEn?:
    string | null;

  @ApiPropertyOptional({
    enum: MATCH_TYPES,
    default: 'exact',
    description:
      'reference_similar_trim = imagery of another (similar) trim: needs referenceVariantId, difference notes in ar + en and approval (tours.approve_reference).',
  })
  @OptionalNotNull()
  @IsIn(MATCH_TYPES)
  matchType?: string;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Trim actually photographed.',
  })
  @NullableUuid()
  referenceVariantId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @NullableMultiline(2000)
  differenceNoteAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @NullableMultiline(2000)
  differenceNoteEn?: string | null;

  @ApiPropertyOptional({
    description: 'Generated from trim / market / drive side / colour when omitted.',
  })
  @OptionalNotNull()
  @IsString()
  @Length(3, 200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { context: SLUG_MESSAGE })
  slug?: string;
}

export class UpdateTourDto {
  @ApiPropertyOptional({ format: 'uuid' }) @OptionalNotNull() @IsUUID() variantId?: string;
  @ApiPropertyOptional() @OptionalNotNull() @Matches(/^[A-Z]{2,8}$/) marketCode?: string;
  @ApiPropertyOptional({ enum: DRIVE_SIDES })
  @OptionalNotNull()
  @IsIn(DRIVE_SIDES)
  driveSide?: string;
  @ApiPropertyOptional() @OptionalNotNull() @RequiredText(100) interiorColorNameEn?: string;
  @ApiPropertyOptional() @OptionalNotNull() @RequiredText(100) interiorColorNameAr?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { context: HEX_MESSAGE })
  interiorColorHex?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(4000) descriptionAr?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(4000) descriptionEn?:
    string | null;
  @ApiPropertyOptional({ enum: MATCH_TYPES })
  @OptionalNotNull()
  @IsIn(MATCH_TYPES)
  matchType?: string;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @NullableUuid() referenceVariantId?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @NullableMultiline(2000)
  differenceNoteAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @NullableMultiline(2000)
  differenceNoteEn?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Scene shown first.' })
  @NullableUuid()
  initialSceneId?: string | null;
  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsString()
  @Length(3, 200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { context: SLUG_MESSAGE })
  slug?: string;
}

export class ReturnTourDto {
  @ApiProperty({ description: 'Why the tour goes back to draft (shown to the editor).' })
  @RequiredText(2000)
  note!: string;
}

// --- scenes -----------------------------------------------------------------------

export class CreateSceneDto {
  @ApiProperty({ format: 'uuid', description: 'Panorama asset of the media library.' })
  @IsUUID()
  assetId!: string;

  @ApiProperty({ enum: SCENE_POSITIONS }) @IsIn(SCENE_POSITIONS) position!: string;

  @ApiPropertyOptional({ description: 'Stable id in the viewer config; generated from position.' })
  @OptionalNotNull()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/, { context: KEY_MESSAGE })
  key?: string;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleEn?: string | null;
  @ApiPropertyOptional() @OptionalInt(0, 10_000) sortOrder?: number;
  @ApiPropertyOptional({ minimum: -180, maximum: 180, default: 0 })
  @Degrees(-180, 180)
  initialYaw?: number;
  @ApiPropertyOptional({ minimum: -90, maximum: 90, default: 0 })
  @Degrees(-90, 90)
  initialPitch?: number;
  @ApiPropertyOptional({ minimum: 10, maximum: 150, default: 100 })
  @Degrees(10, 150)
  initialHfov?: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(10, 150) minHfov?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(10, 150) maxHfov?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-90, 90) minPitch?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-90, 90) maxPitch?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-360, 360) northOffset?:
    number | null;
  @ApiPropertyOptional({ description: 'Make it the first scene of the tour.' })
  @OptionalNotNull()
  @IsBoolean()
  isInitial?: boolean;
}

export class UpdateSceneDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Swap the panorama (e.g. a new version).' })
  @OptionalNotNull()
  @IsUUID()
  assetId?: string;
  @ApiPropertyOptional({ enum: SCENE_POSITIONS })
  @OptionalNotNull()
  @IsIn(SCENE_POSITIONS)
  position?: string;
  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/, { context: KEY_MESSAGE })
  key?: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) titleEn?: string | null;
  @ApiPropertyOptional() @OptionalInt(0, 10_000) sortOrder?: number;
  @ApiPropertyOptional() @Degrees(-180, 180) initialYaw?: number;
  @ApiPropertyOptional() @Degrees(-90, 90) initialPitch?: number;
  @ApiPropertyOptional() @Degrees(10, 150) initialHfov?: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(10, 150) minHfov?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(10, 150) maxHfov?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-90, 90) minPitch?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-90, 90) maxPitch?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-360, 360) northOffset?:
    number | null;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() isInitial?: boolean;
}

export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Every id of the list, in the new order.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

// --- hotspots -----------------------------------------------------------------------

export class HotspotTextDto {
  @ApiProperty({ description: 'Plain text (any HTML is stripped).', example: 'Central screen' })
  @IsString()
  @Length(1, 400)
  title!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Plain text, line breaks kept.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string | null;
}

export class HotspotTextsDto {
  @ApiPropertyOptional({ type: HotspotTextDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => HotspotTextDto)
  ar?: HotspotTextDto | null;

  @ApiPropertyOptional({ type: HotspotTextDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => HotspotTextDto)
  en?: HotspotTextDto | null;
}

export class CreateHotspotDto {
  @ApiProperty({ enum: HOTSPOT_TYPES }) @IsIn(HOTSPOT_TYPES) type!: string;
  @ApiProperty({ minimum: -180, maximum: 180 }) @FiniteNumber() @Min(-180) @Max(180) yaw!: number;
  @ApiProperty({ minimum: -90, maximum: 90 }) @FiniteNumber() @Min(-90) @Max(90) pitch!: number;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'scene_link: target scene.' })
  @NullableUuid()
  targetSceneId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-180, 180) targetYaw?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-90, 90) targetPitch?:
    number | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'detail_image: image asset; video: video asset (upload or allow-listed embed).',
  })
  @NullableUuid()
  mediaAssetId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'battery.usable_kwh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  specKey?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: HOTSPOT_ICON_KEYS, type: String })
  @IsOptional()
  @IsIn(HOTSPOT_ICON_KEYS)
  iconKey?: string | null;

  @ApiPropertyOptional() @OptionalInt(0, 10_000) sortOrder?: number;

  @ApiProperty({ type: HotspotTextsDto, description: 'ar and en (both required to publish).' })
  @ValidateNested()
  @Type(() => HotspotTextsDto)
  texts!: HotspotTextsDto;
}

export class UpdateHotspotDto {
  @ApiPropertyOptional({ enum: HOTSPOT_TYPES })
  @OptionalNotNull()
  @IsIn(HOTSPOT_TYPES)
  type?: string;
  @ApiPropertyOptional() @Degrees(-180, 180) yaw?: number;
  @ApiPropertyOptional() @Degrees(-90, 90) pitch?: number;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @NullableUuid() targetSceneId?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-180, 180) targetYaw?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableDegrees(-90, 90) targetPitch?:
    number | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @NullableUuid() mediaAssetId?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  specKey?: string | null;
  @ApiPropertyOptional({ nullable: true, enum: HOTSPOT_ICON_KEYS, type: String })
  @IsOptional()
  @IsIn(HOTSPOT_ICON_KEYS)
  iconKey?: string | null;
  @ApiPropertyOptional() @OptionalInt(0, 10_000) sortOrder?: number;
  @ApiPropertyOptional({
    type: HotspotTextsDto,
    description: 'Per locale: object = replace, null = remove, omitted = keep.',
  })
  @OptionalNotNull()
  @ValidateNested()
  @Type(() => HotspotTextsDto)
  texts?: HotspotTextsDto;
}

// --- views ------------------------------------------------------------------------

export class AdminVariantRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ format: 'uuid' }) modelYearId!: string;
  @ApiProperty() year!: number;
  @ApiProperty() modelNameAr!: string;
  @ApiProperty() modelNameEn!: string;
  @ApiProperty() brandNameAr!: string;
  @ApiProperty() brandNameEn!: string;
  @ApiProperty() status!: string;
}

export class ReadinessIssueDto {
  @ApiProperty() code!: string;
  @ApiProperty({ description: 'Localized.' }) message!: string;
  @ApiPropertyOptional({ format: 'uuid' }) sceneId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) hotspotId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) assetId?: string;
}

export class TourReadinessDto {
  @ApiProperty() publishable!: boolean;
  @ApiProperty({ type: [ReadinessIssueDto] }) problems!: ReadinessIssueDto[];
  @ApiProperty({ type: [ReadinessIssueDto] }) warnings!: ReadinessIssueDto[];
}

export class AdminTourDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: [...TOUR_STATUSES, 'scheduled'] }) status!: string;
  @ApiProperty({ enum: MATCH_TYPES }) matchType!: string;
  @ApiProperty({ type: AdminVariantRefDto }) variant!: AdminVariantRefDto;
  @ApiProperty({ nullable: true, type: AdminVariantRefDto })
  referenceVariant!: AdminVariantRefDto | null;
  @ApiProperty() marketCode!: string;
  @ApiProperty({ enum: DRIVE_SIDES }) driveSide!: string;
  @ApiProperty() interiorColorNameAr!: string;
  @ApiProperty() interiorColorNameEn!: string;
  @ApiProperty({ nullable: true, type: String }) interiorColorHex!: string | null;
  @ApiProperty({ nullable: true, type: String }) titleAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) titleEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) differenceNoteAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) differenceNoteEn!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) approvedAt!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) approvedById!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewNote!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) initialSceneId!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) publishedAt!: string | null;
  @ApiProperty() sceneCount!: number;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) deletedAt!: string | null;
}

export class AdminHotspotTextDto {
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) body!: string | null;
}

export class AdminHotspotDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sceneId!: string;
  @ApiProperty({ enum: HOTSPOT_TYPES }) type!: string;
  @ApiProperty() yaw!: number;
  @ApiProperty() pitch!: number;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) targetSceneId!: string | null;
  @ApiProperty({ nullable: true, type: Number }) targetYaw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) targetPitch!: number | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String }) mediaAssetId!: string | null;
  @ApiProperty({ nullable: true, type: String }) specKey!: string | null;
  @ApiProperty({ nullable: true, type: String }) iconKey!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({
    type: Object,
    description: '{ ar: {title, body} | null, en: {title, body} | null }',
  })
  texts!: { ar: AdminHotspotTextDto | null; en: AdminHotspotTextDto | null };
}

export class AdminSceneDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ enum: SCENE_POSITIONS }) position!: string;
  @ApiProperty({ nullable: true, type: String }) titleAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) titleEn!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() initialYaw!: number;
  @ApiProperty() initialPitch!: number;
  @ApiProperty() initialHfov!: number;
  @ApiProperty({ nullable: true, type: Number }) minHfov!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxHfov!: number | null;
  @ApiProperty({ nullable: true, type: Number }) minPitch!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxPitch!: number | null;
  @ApiProperty({ nullable: true, type: Number }) northOffset!: number | null;
  @ApiProperty() isInitial!: boolean;
  @ApiProperty({ type: AdminMediaAssetDto }) asset!: AdminMediaAssetDto;
  @ApiProperty({ type: [AdminHotspotDto] }) hotspots!: AdminHotspotDto[];
}

export class AdminTourDetailDto extends AdminTourDto {
  @ApiProperty({ type: [AdminSceneDto] }) scenes!: AdminSceneDto[];
  @ApiProperty({ type: TourReadinessDto }) readiness!: TourReadinessDto;
}
