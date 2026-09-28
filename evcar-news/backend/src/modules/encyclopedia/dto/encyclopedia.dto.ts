import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { ContentStatus } from '../../../generated/prisma/enums';
import { ImageDto } from '../../vehicles/dto/shared.dto';
import { REVIEW_CHECKLIST } from '../common/encyclopedia-rules';

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

// --- public ------------------------------------------------------------------------------

export class EncyclopediaListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Category key, e.g. home_charging' })
  @IsOptional()
  @IsString()
  @Matches(KEY_RE)
  category?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Text filter (Arabic-normalized)' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class EncyclopediaCategoryViewDto {
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) iconKey!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() entryCount!: number;
}

export class EncyclopediaCategoryRefDto {
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) iconKey!: string | null;
}

export class EncyclopediaReviewBadgeDto {
  @ApiProperty({ example: true }) reviewed!: boolean;
  @ApiProperty() reviewedAt!: string;
  @ApiProperty({ example: 'راجعه مختص تقني' }) label!: string;
}

export class EncyclopediaEntrySummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: EncyclopediaCategoryRefDto }) category!: EncyclopediaCategoryRefDto;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ enum: ['ar', 'en'] }) language!: string;
  @ApiProperty() isFallback!: boolean;
  @ApiProperty({ type: [String] }) availableLanguages!: string[];
  @ApiProperty({ type: ImageDto, nullable: true }) coverImage!: ImageDto | null;
  @ApiProperty({ nullable: true, type: Number }) readingMinutes!: number | null;
  @ApiProperty({ type: EncyclopediaReviewBadgeDto }) review!: EncyclopediaReviewBadgeDto;
  @ApiProperty() publishedAt!: string;
  @ApiProperty({ nullable: true, type: String }) contentUpdatedAt!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class EncyclopediaEntryDetailDto extends EncyclopediaEntrySummaryDto {
  @ApiProperty({ description: 'Sanitized HTML' }) bodyHtml!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Shown on electrical topics' })
  safetyNotice!: string | null;
  @ApiProperty({ type: [EncyclopediaEntrySummaryDto] }) related!: EncyclopediaEntrySummaryDto[];
}

// --- admin -------------------------------------------------------------------------------

export class EntryTranslationInputDto {
  @ApiProperty({ maxLength: 300 })
  @CleanText()
  @IsString()
  @Length(1, 300)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(1000)
  summary?: string | null;

  @ApiProperty({ description: 'HTML (sanitized on save)', maxLength: 200_000 })
  @IsString()
  @MaxLength(200_000)
  bodyHtml!: string;
}

export class EntryTranslationsDto {
  @ApiPropertyOptional({ type: EntryTranslationInputDto, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @ValidateNested()
  @Type(() => EntryTranslationInputDto)
  ar?: EntryTranslationInputDto | null;

  @ApiPropertyOptional({ type: EntryTranslationInputDto, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @ValidateNested()
  @Type(() => EntryTranslationInputDto)
  en?: EntryTranslationInputDto | null;
}

export class CreateEntryDto {
  @ApiPropertyOptional({ description: 'Default: from the English / Arabic title' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  slug?: string;

  @ApiProperty() @IsString() @Matches(KEY_RE) categoryKey!: string;

  @ApiPropertyOptional({ default: 0 })
  @OptionalNotNull()
  @IsInt()
  @Min(-100_000)
  @Max(100_000)
  sortOrder?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Licensed, ready image' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  coverAssetId?: string | null;

  @ApiProperty({ type: EntryTranslationsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => EntryTranslationsDto)
  translations!: EntryTranslationsDto;
}

export class UpdateEntryDto {
  @ApiPropertyOptional() @OptionalNotNull() @IsString() @Length(1, 200) slug?: string;
  @ApiPropertyOptional() @OptionalNotNull() @IsString() @Matches(KEY_RE) categoryKey?: string;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsInt()
  @Min(-100_000)
  @Max(100_000)
  sortOrder?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  coverAssetId?: string | null;

  @ApiPropertyOptional({
    type: EntryTranslationsDto,
    description: 'Per language: object = replace, null = remove, omitted = keep',
  })
  @OptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => EntryTranslationsDto)
  translations?: EntryTranslationsDto;
}

export class AdminEntryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ContentStatus) })
  @IsOptional()
  @IsIn(Object.values(ContentStatus))
  status?: ContentStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(KEY_RE) category?: string;

  @ApiPropertyOptional() @IsOptional() @CleanText() @IsString() @MaxLength(100) q?: string;
}

export class ReviewChecklistDto {
  @ApiProperty() @IsBoolean() facts_verified!: boolean;
  @ApiProperty() @IsBoolean() no_safety_bypass!: boolean;
  @ApiProperty() @IsBoolean() no_unsafe_electrical_instructions!: boolean;
  @ApiProperty() @IsBoolean() qualified_electrician_referral!: boolean;
  @ApiProperty() @IsBoolean() units_and_standards_correct!: boolean;
  @ApiProperty() @IsBoolean() translations_consistent!: boolean;
}

export class TechnicalReviewDto {
  @ApiProperty({
    type: ReviewChecklistDto,
    description: `Every item must be true: ${REVIEW_CHECKLIST.join(', ')}`,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ReviewChecklistDto)
  checklist!: ReviewChecklistDto;

  @ApiProperty({ description: 'Reviewer attestation (must be true)', example: true })
  @Equals(true)
  attestation!: boolean;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RejectEntryDto {
  @ApiProperty({ maxLength: 2000 })
  @CleanText()
  @IsString()
  @Length(1, 2000)
  note!: string;
}

export class AdminTranslationViewDto {
  @ApiProperty() locale!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty() bodyHtml!: string;
}

export class AdminEntryViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() categoryKey!: string;
  @ApiProperty({ enum: Object.values(ContentStatus) }) status!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ nullable: true, type: String }) coverAssetId!: string | null;
  @ApiProperty({ type: [AdminTranslationViewDto] }) translations!: AdminTranslationViewDto[];
  @ApiProperty({
    description:
      'technicalReviewedAt/By + checklist of the last approval (from the audit log), reviewNote of the last rejection',
  })
  review!: {
    reviewedAt: string | null;
    reviewedById: string | null;
    checklist: Record<string, boolean> | null;
    note: string | null;
  };
  @ApiProperty({ nullable: true, type: String }) publishedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) contentUpdatedAt!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, type: String }) createdById!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: [String], description: 'Workflow actions possible now' })
  allowedActions!: string[];
}

export class ChecklistItemDto {
  @ApiProperty() key!: string;
}

export class ReviewChecklistInfoDto {
  @ApiProperty({ type: [String] }) items!: string[];
  @ApiProperty() attestationText!: string;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'charging_etiquette' }) @IsString() @Matches(KEY_RE) key!: string;
  @ApiProperty() @CleanText() @IsString() @Length(1, 120) nameAr!: string;
  @ApiProperty() @CleanText() @IsString() @Length(1, 120) nameEn!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  descriptionAr?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(/^[a-z0-9_-]{1,32}$/)
  iconKey?: string | null;

  @ApiPropertyOptional() @OptionalNotNull() @IsInt() @Min(-1000) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() isActive?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 120)
  nameAr?: string;
  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 120)
  nameEn?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  descriptionAr?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(/^[a-z0-9_-]{1,32}$/)
  iconKey?: string | null;

  @ApiPropertyOptional() @OptionalNotNull() @IsInt() @Min(-1000) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() isActive?: boolean;
}

export class AdminCategoryViewDto {
  @ApiProperty() key!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) iconKey!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() entryCount!: number;
}
