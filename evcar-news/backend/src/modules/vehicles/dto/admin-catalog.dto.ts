/**
 * Admin DTOs of the catalog hierarchy: brand → model → generation → model
 * year → variant (REQUIREMENTS §6). Specs are never attached to a model name:
 * everything technical hangs off a variant with ONE powertrain type.
 */
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CleanText } from '../../../common/validation/decorators';
import { PaginationQueryDto } from '../../../common/http/pagination';
import {
  BODY_TYPES,
  CATALOG_STATUSES,
  COUNTRY_CODE_RE,
  DRIVE_TYPES,
  POWERTRAIN_TYPES,
} from '../common/catalog-constants';
import { ImageDto } from './shared.dto';
import {
  NullableEnum,
  NullableInt,
  NullableMultiline,
  NullableText,
  NullableUuid,
  OptionalEnum,
  OptionalInt,
  OptionalSlug,
  QueryBool,
  QueryInt,
  RequiredText,
  RequiredUuid,
} from './validators';

const STATUS_DESC =
  'draft (default) | published | archived. Setting published/archived needs vehicles.publish.';

// --- list queries ----------------------------------------------------------------

export class AdminCatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in names and slugs (ar/en).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES })
  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Include soft-deleted rows.', default: false })
  @QueryBool()
  includeDeleted?: boolean;
}

export class AdminModelListQueryDto extends AdminCatalogListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() brandId?: string;
}

export class AdminVariantListQueryDto extends AdminCatalogListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() modelId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() generationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() modelYearId?: string;
  @ApiPropertyOptional({ minimum: 1990, maximum: 2100 }) @QueryInt(1990, 2100) year?: number;

  @ApiPropertyOptional({ enum: POWERTRAIN_TYPES })
  @IsOptional()
  @IsIn(POWERTRAIN_TYPES)
  powertrainType?: string;

  @ApiPropertyOptional({ description: 'Only variants with a row in this market.' })
  @IsOptional()
  @Matches(/^[A-Z]{2,8}$/)
  marketCode?: string;
}

// --- brands ---------------------------------------------------------------------------

export class CreateBrandDto {
  @ApiPropertyOptional({ description: 'Latin slug; generated from nameEn when omitted.' })
  @OptionalSlug()
  slug?: string;

  @ApiProperty({ example: 'BYD' }) @RequiredText(120) nameEn!: string;
  @ApiProperty({ example: 'بي واي دي' }) @RequiredText(120) nameAr!: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'CN' })
  @IsOptional()
  @Matches(COUNTRY_CODE_RE)
  countryCode?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'https URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https:\/\/[^\s]+$/)
  websiteUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Media asset (ready, licensed image).',
  })
  @NullableUuid()
  logoAssetId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(5000) descriptionEn?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(5000) descriptionAr?:
    string | null;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES, description: STATUS_DESC })
  @OptionalEnum(CATALOG_STATUSES)
  status?: string;

  @ApiPropertyOptional({ default: 0 }) @OptionalInt(0, 100_000) sortOrder?: number;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto, { skipNullProperties: false }) {}

// --- models ------------------------------------------------------------------------------

export class CreateModelDto {
  @ApiProperty({ format: 'uuid' }) @RequiredUuid() brandId!: string;

  @ApiPropertyOptional({ description: 'Latin slug; generated from brand + nameEn when omitted.' })
  @OptionalSlug()
  slug?: string;

  @ApiProperty({ example: 'Seal' }) @RequiredText(120) nameEn!: string;
  @ApiProperty({ example: 'سيل' }) @RequiredText(120) nameAr!: string;

  @ApiPropertyOptional({ enum: BODY_TYPES, nullable: true, type: String })
  @NullableEnum(BODY_TYPES)
  bodyType?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'D' })
  @NullableText(32)
  segment?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(10_000) descriptionEn?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(10_000) descriptionAr?:
    string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Ready, licensed image.' })
  @NullableUuid()
  heroAssetId?: string | null;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES, description: STATUS_DESC })
  @OptionalEnum(CATALOG_STATUSES)
  status?: string;

  @ApiPropertyOptional({ default: 0 }) @OptionalInt(0, 100_000) sortOrder?: number;
}

export class UpdateModelDto extends PartialType(CreateModelDto, { skipNullProperties: false }) {}

export class ReplaceCompetitorsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Competitor model ids in display order (max 20). Replaces the list.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  competitorModelIds!: string[];
}

// --- generations / model years --------------------------------------------------------

export class CreateGenerationDto {
  @ApiProperty({ format: 'uuid' }) @RequiredUuid() modelId!: string;
  @ApiPropertyOptional({ description: 'Unique per model; generated from nameEn when omitted.' })
  @OptionalSlug()
  slug?: string;
  @ApiProperty({ example: '1st generation' }) @RequiredText(120) nameEn!: string;
  @ApiProperty({ example: 'الجيل الأول' }) @RequiredText(120) nameAr!: string;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'e-Platform 3.0' })
  @NullableText(32)
  code?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableInt(1900, 2100) startYear?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableInt(1900, 2100) endYear?:
    number | null;
}

export class UpdateGenerationDto extends PartialType(CreateGenerationDto, {
  skipNullProperties: false,
}) {}

export class CreateModelYearDto {
  @ApiProperty({ format: 'uuid' }) @RequiredUuid() generationId!: string;
  @ApiProperty({ example: 2025, minimum: 1990, maximum: 2100 })
  @IsInt()
  @Min(1990)
  @Max(2100)
  year!: number;
}

// --- variants ----------------------------------------------------------------------------

export class CreateVariantDto {
  @ApiProperty({ format: 'uuid' }) @RequiredUuid() modelYearId!: string;
  @ApiPropertyOptional({ description: 'Generated from model + year + name + powertrain.' })
  @OptionalSlug()
  slug?: string;
  @ApiProperty({ example: 'Design AWD' }) @RequiredText(160) nameEn!: string;
  @ApiProperty({ example: 'ديزاين دفع رباعي' }) @RequiredText(160) nameAr!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(64) trimCode?: string | null;

  @ApiProperty({
    enum: POWERTRAIN_TYPES,
    description:
      'BEV / PHEV / EREV / HEV. A BEV and a same-named hybrid are separate variants and never share data.',
  })
  @IsIn(POWERTRAIN_TYPES)
  powertrainType!: string;

  @ApiPropertyOptional({
    enum: BODY_TYPES,
    nullable: true,
    type: String,
    description: 'Overrides the model body type.',
  })
  @NullableEnum(BODY_TYPES)
  bodyType?: string | null;
  @ApiPropertyOptional({ enum: DRIVE_TYPES, nullable: true, type: String })
  @NullableEnum(DRIVE_TYPES)
  driveType?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 1, maximum: 12 })
  @NullableInt(1, 12)
  seats?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 1, maximum: 6 })
  @NullableInt(1, 6)
  doors?: number | null;
  @ApiPropertyOptional({ enum: CATALOG_STATUSES, description: STATUS_DESC })
  @OptionalEnum(CATALOG_STATUSES)
  status?: string;
  @ApiPropertyOptional({ default: 0 }) @OptionalInt(0, 100_000) sortOrder?: number;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto, {
  skipNullProperties: false,
}) {}

// --- views -------------------------------------------------------------------------------

export class AdminAuditFieldsDto {
  @ApiProperty({ enum: CATALOG_STATUSES }) status!: string;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: string | null;
}

export class AdminBrandDto extends AdminAuditFieldsDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) countryCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) websiteUrl!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) logoAssetId!: string | null;
  @ApiProperty({ nullable: true, type: ImageDto }) logo!: ImageDto | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Non-deleted models.' }) modelCount!: number;
}

export class AdminModelDto extends AdminAuditFieldsDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) brandId!: string;
  @ApiProperty() brandName!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String }) segment!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) heroAssetId!: string | null;
  @ApiProperty({ nullable: true, type: ImageDto }) heroImage!: ImageDto | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() variantCount!: number;
  @ApiProperty({
    type: [String],
    description: 'Why the model is not public (empty = public).',
    example: ['brand_not_published'],
  })
  visibilityBlockers!: string[];
}

export class AdminVariantSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) trimCode!: string | null;
  @ApiProperty({ enum: POWERTRAIN_TYPES }) powertrainType!: string;
  @ApiProperty({ enum: CATALOG_STATUSES }) status!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [String], description: 'Markets with a row (any availability).' })
  marketCodes!: string[];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: string | null;
}

export class AdminModelYearDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) generationId!: string;
  @ApiProperty() year!: number;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: [AdminVariantSummaryDto] }) variants!: AdminVariantSummaryDto[];
}

export class AdminGenerationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) modelId!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty({ nullable: true, type: Number }) startYear!: number | null;
  @ApiProperty({ nullable: true, type: Number }) endYear!: number | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: string | null;
  @ApiProperty({ type: [AdminModelYearDto] }) modelYears!: AdminModelYearDto[];
}

export class AdminModelDetailDto extends AdminModelDto {
  @ApiProperty({ type: [AdminGenerationDto] }) generations!: AdminGenerationDto[];
  @ApiProperty({ type: [String], format: 'uuid' }) competitorModelIds!: string[];
}

export class AdminVariantDto extends AdminAuditFieldsDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) trimCode!: string | null;
  @ApiProperty({ enum: POWERTRAIN_TYPES }) powertrainType!: string;
  @ApiProperty({ nullable: true, type: String }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String }) driveType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) seats!: number | null;
  @ApiProperty({ nullable: true, type: Number }) doors!: number | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty({ format: 'uuid' }) modelYearId!: string;
  @ApiProperty() year!: number;
  @ApiProperty({ format: 'uuid' }) generationId!: string;
  @ApiProperty() generationName!: string;
  @ApiProperty({ format: 'uuid' }) modelId!: string;
  @ApiProperty() modelSlug!: string;
  @ApiProperty() modelName!: string;
  @ApiProperty({ format: 'uuid' }) brandId!: string;
  @ApiProperty() brandName!: string;
  @ApiProperty({ type: [String] }) marketCodes!: string[];
  @ApiProperty({ type: [String], description: 'Why the variant is not public (empty = public).' })
  visibilityBlockers!: string[];
}
