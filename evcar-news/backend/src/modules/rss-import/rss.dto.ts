import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../common/validation/decorators';
import { RssItemStatus } from '../../generated/prisma/enums';
import { AdminArticleDto } from '../articles/dto/admin-article.dto';
import { LICENSE_MODES, type LicenseMode } from './rss-dedupe';

export const RSS_ITEM_STATUSES = Object.values(RssItemStatus);

class FeedFieldsDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Publisher web site.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  siteUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['ar', 'en'],
    description: 'Language of the items.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en' | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'EG',
    description: 'Market of the drafts.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z]{2,8}$/)
  marketCode?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  defaultCategoryId?: string | null;

  @ApiPropertyOptional({ default: true })
  @OptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 60, minimum: 15, maximum: 1440 })
  @OptionalNotNull()
  @IsInt()
  @Min(15)
  @Max(1440)
  fetchIntervalMinutes?: number;

  @ApiPropertyOptional({
    enum: LICENSE_MODES,
    default: 'link_only',
    description:
      'link_only: headline + link only. summary_only: the feed excerpt may be shown. full_permitted: republishing is licensed (the importer still only copies the excerpt). Anything but link_only needs permissionReference.',
  })
  @OptionalNotNull()
  @IsIn(LICENSE_MODES)
  licenseMode?: LicenseMode;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  licenseNotes?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Publisher's terms page." })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  licenseUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Where the permission is recorded (contract no., e-mail subject + date, terms clause URL). The server records who confirmed it and when.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(1000)
  permissionReference?: string | null;

  @ApiPropertyOptional({
    default: false,
    description: 'Feed images may be shown (needs permission).',
  })
  @OptionalNotNull()
  @IsBoolean()
  allowImages?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Credit shown with drafts from this feed.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  attributionText?: string | null;
}

export class CreateRssFeedDto extends FeedFieldsDto {
  @ApiProperty({ example: 'Example EV News' })
  @CleanText()
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({
    example: 'https://example.com/feed.xml',
    description: 'https only; public hosts only.',
  })
  @IsString()
  @MaxLength(2048)
  url!: string;
}

export class UpdateRssFeedDto extends FeedFieldsDto {
  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsString()
  @MaxLength(2048)
  url?: string;
}

export class RssFeedQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}

export class RssItemQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  feedId?: string;

  @ApiPropertyOptional({ enum: RSS_ITEM_STATUSES })
  @IsOptional()
  @IsIn(RSS_ITEM_STATUSES)
  status?: RssItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class IgnoreRssItemDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateDraftFromItemDto {
  @ApiPropertyOptional({ enum: ['ar', 'en'], description: 'Default: item / feed language.' })
  @OptionalNotNull()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';

  @ApiPropertyOptional({ format: 'uuid', description: 'Default: the feed default category.' })
  @OptionalNotNull()
  @IsUUID()
  categoryId?: string;
}

// ---- output -----------------------------------------------------------------------

export class RssItemCountsDto {
  @ApiProperty() new!: number;
  @ApiProperty() drafted!: number;
  @ApiProperty() ignored!: number;
  @ApiProperty() duplicate!: number;
  @ApiProperty() failed!: number;
}

export class RssFeedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: String }) siteUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) language!: string | null;
  @ApiProperty({ nullable: true, type: String }) marketCode!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) defaultCategoryId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() fetchIntervalMinutes!: number;
  @ApiProperty({ enum: LICENSE_MODES }) licenseMode!: LicenseMode;
  @ApiProperty({ nullable: true, type: String }) licenseNotes!: string | null;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) permissionReference!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  permissionConfirmedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  permissionConfirmedById!: string | null;
  @ApiProperty() allowImages!: boolean;
  @ApiProperty({ nullable: true, type: String }) attributionText!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastFetchedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastSuccessAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) lastError!: string | null;
  @ApiProperty() consecutiveFailures!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) nextFetchAt!: string | null;
  @ApiProperty({ type: RssItemCountsDto }) itemCounts!: RssItemCountsDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class RssItemRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() url!: string;
}

export class RssItemArticleRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() status!: string;
}

export class RssItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) feedId!: string;
  @ApiProperty() feedName!: string;
  @ApiProperty({ enum: LICENSE_MODES }) licenseMode!: LicenseMode;
  @ApiProperty() title!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Feed excerpt (stored only when the licence allows summaries).',
  })
  summary!: string | null;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: String }) canonicalUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) author!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Only when the feed allows images.' })
  imageUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) language!: string | null;
  @ApiProperty({ type: [String] }) feedCategories!: string[];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) fetchedAt!: string;
  @ApiProperty({ enum: RSS_ITEM_STATUSES }) status!: string;
  @ApiProperty({ nullable: true, type: String }) statusReason!: string | null;
  @ApiProperty({ type: RssItemRefDto, nullable: true }) duplicateOf!: RssItemRefDto | null;
  @ApiProperty({ type: RssItemArticleRefDto, nullable: true })
  article!: RssItemArticleRefDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) processedAt!: string | null;
}

export class RssFetchSummaryDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: 'import_jobs.id' })
  jobId!: string | null;
  @ApiProperty({ format: 'uuid' }) feedId!: string;
  @ApiProperty({
    enum: ['completed', 'completed_with_errors', 'not_modified', 'failed', 'skipped'],
  })
  outcome!: string;
  @ApiProperty() received!: number;
  @ApiProperty({ description: 'New items.' }) created!: number;
  @ApiProperty({ description: 'Same story found under another URL / feed (kept as duplicate).' })
  duplicates!: number;
  @ApiProperty({ description: 'Already imported earlier.' }) alreadyKnown!: number;
  @ApiProperty() invalid!: number;
  @ApiProperty({ nullable: true, type: String }) error!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) nextFetchAt!: string | null;
}

export class DraftFromItemResultDto {
  @ApiProperty({ type: AdminArticleDto }) article!: AdminArticleDto;
  @ApiProperty({ type: RssItemDto }) item!: RssItemDto;
}
