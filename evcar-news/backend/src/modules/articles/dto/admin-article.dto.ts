import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
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
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { ArticleCorrectionKind, ArticleType, ContentStatus } from '../../../generated/prisma/enums';
import { WORKFLOW_ACTIONS } from '../domain/article-workflow';
import { ArticleImageViewDto, AuthorRefDto, RefDto, RelatedVehicleDto } from './article-common.dto';

export const ARTICLE_TYPES = Object.values(ArticleType);
export const CONTENT_STATUSES = Object.values(ContentStatus);
export const CORRECTION_KINDS = Object.values(ArticleCorrectionKind);
export const BODY_HTML_MAX = 500_000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MARKET_RE = /^[A-Z]{2,8}$/;

const upper = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
      : value,
  );

// ---- input ------------------------------------------------------------------------

export class ArticleTranslationInputDto {
  @ApiProperty({ maxLength: 300 })
  @CleanText()
  @IsString()
  @Length(1, 300)
  title!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: 1000,
    description: 'Plain text.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  summary?: string | null;

  @ApiPropertyOptional({
    description:
      'Rich HTML (sanitized server-side: headings, lists, tables, figure/img from the media library, links, YouTube-nocookie / Vimeo embeds).',
    maxLength: BODY_HTML_MAX,
  })
  @OptionalNotNull()
  @IsString()
  @MaxLength(BODY_HTML_MAX)
  bodyHtml?: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 300 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(300)
  seoTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'true = machine translated / generated: never served to readers until a person marks it reviewed.',
  })
  @OptionalNotNull()
  @IsBoolean()
  isMachineTranslated?: boolean;
}

/** Same fields, all optional (partial update of one language). */
export class ArticleTranslationPatchDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 300)
  title?: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 1000 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  summary?: string | null;

  @ApiPropertyOptional({ maxLength: BODY_HTML_MAX })
  @OptionalNotNull()
  @IsString()
  @MaxLength(BODY_HTML_MAX)
  bodyHtml?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(300)
  seoTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsBoolean()
  isMachineTranslated?: boolean;
}

export class ArticleTranslationsInputDto {
  @ApiPropertyOptional({ type: ArticleTranslationInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleTranslationInputDto)
  ar?: ArticleTranslationInputDto;

  @ApiPropertyOptional({ type: ArticleTranslationInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleTranslationInputDto)
  en?: ArticleTranslationInputDto;
}

export class ArticleTranslationsPatchDto {
  @ApiPropertyOptional({
    nullable: true,
    type: ArticleTranslationPatchDto,
    description: 'null removes the Arabic text (not allowed for the original language).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => ArticleTranslationPatchDto)
  ar?: ArticleTranslationPatchDto | null;

  @ApiPropertyOptional({ nullable: true, type: ArticleTranslationPatchDto })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => ArticleTranslationPatchDto)
  en?: ArticleTranslationPatchDto | null;
}

export class VehicleLinkInputDto {
  @ApiProperty({ enum: ['brand', 'model', 'variant'] })
  @IsIn(['brand', 'model', 'variant'])
  type!: 'brand' | 'model' | 'variant';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

class ArticleFieldsDto {
  @ApiPropertyOptional({
    enum: ARTICLE_TYPES,
    description: 'Default: the category default, else news.',
  })
  @OptionalNotNull()
  @IsIn(ARTICLE_TYPES)
  type?: ArticleType;

  @ApiPropertyOptional({
    description:
      'Share slug (https://evcar.news/n/<slug>). Generated from the English (else original) title when omitted. Locked after the first publication.',
    maxLength: 200,
  })
  @OptionalNotNull()
  @IsString()
  @Length(1, 200)
  slug?: string;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 30 })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['EG'],
    description: 'Target markets; empty = every market.',
  })
  @OptionalNotNull()
  @upper()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @Matches(MARKET_RE, { each: true })
  marketCodes?: string[];

  @ApiPropertyOptional({ type: [VehicleLinkInputDto], maxItems: 50, description: 'Related cars.' })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VehicleLinkInputDto)
  vehicleLinks?: VehicleLinkInputDto[];

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Licensed image from the media library (POST /admin/articles/images).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  coverAssetId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Staff author (default: the caller). Changing it needs articles.update_any.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  authorId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Byline override (guest writer).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 200)
  authorName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '2026-09-20',
    description: 'When the event happened (separate from the publication date).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_ONLY_RE)
  @IsISO8601({ strict: true })
  eventDate?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Original source name.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 200)
  sourceName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Original source URL (http/https).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ description: 'Top story candidate (needs articles.publish).' })
  @OptionalNotNull()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Sponsored content (always labelled; sponsorName required).',
  })
  @OptionalNotNull()
  @IsBoolean()
  isSponsored?: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 200)
  sponsorName?: string | null;

  @ApiPropertyOptional({ default: true })
  @OptionalNotNull()
  @IsBoolean()
  allowComments?: boolean;

  @ApiPropertyOptional({ maxLength: 500, description: 'Note stored with this revision.' })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @MaxLength(500)
  revisionNote?: string;
}

export class CreateArticleDto extends ArticleFieldsDto {
  @ApiProperty({ enum: ['ar', 'en'], description: 'Language the article is written in.' })
  @IsIn(['ar', 'en'])
  originalLanguage!: 'ar' | 'en';

  @ApiProperty({
    type: ArticleTranslationsInputDto,
    description: 'Text per language; must contain the original language.',
  })
  @ValidateNested()
  @Type(() => ArticleTranslationsInputDto)
  translations!: ArticleTranslationsInputDto;
}

export class UpdateArticleDto extends ArticleFieldsDto {
  @ApiProperty({
    description: 'currentVersion the edit is based on (409 ARTICLE_VERSION_CONFLICT otherwise).',
  })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ enum: ['ar', 'en'] })
  @OptionalNotNull()
  @IsIn(['ar', 'en'])
  originalLanguage?: 'ar' | 'en';

  @ApiPropertyOptional({ type: ArticleTranslationsPatchDto })
  @OptionalNotNull()
  @ValidateNested()
  @Type(() => ArticleTranslationsPatchDto)
  translations?: ArticleTranslationsPatchDto;
}

export class WorkflowActionDto {
  @ApiPropertyOptional({ maxLength: 2000, description: 'Reviewer / editor note.' })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Optional optimistic-concurrency check.' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class RejectArticleDto {
  @ApiProperty({ maxLength: 2000, description: 'Why the article goes back to draft.' })
  @CleanText()
  @IsString()
  @Length(1, 2000)
  note!: string;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ScheduleArticleDto extends WorkflowActionDto {
  @ApiProperty({ format: 'date-time', description: 'Future publication time (ISO-8601).' })
  @IsISO8601({ strict: true })
  scheduledAt!: string;
}

export class AdminArticleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Title / summary / slug (Arabic-normalized).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: CONTENT_STATUSES })
  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional({ enum: ARTICLE_TYPES })
  @IsOptional()
  @IsIn(ARTICLE_TYPES)
  type?: ArticleType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({ description: 'Articles targeting this market (or every market).' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2,8}$/)
  targetMarket?: string;

  @ApiPropertyOptional({ enum: ['ar', 'en'], description: 'Has a text in this language.' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'In review and approved / not.' })
  @IsOptional()
  @IsIn(['true', 'false'])
  approved?: 'true' | 'false';

  @ApiPropertyOptional({ enum: ['exclude', 'include', 'only'], default: 'exclude' })
  @IsOptional()
  @IsIn(['exclude', 'include', 'only'])
  deleted?: 'exclude' | 'include' | 'only';

  @ApiPropertyOptional({
    enum: ['-updatedAt', 'updatedAt', '-createdAt', '-publishedAt', 'scheduledAt'],
    default: '-updatedAt',
  })
  @IsOptional()
  @IsIn(['-updatedAt', 'updatedAt', '-createdAt', '-publishedAt', 'scheduledAt'])
  sort?: '-updatedAt' | 'updatedAt' | '-createdAt' | '-publishedAt' | 'scheduledAt';
}

export class CreateCorrectionDto {
  @ApiPropertyOptional({ enum: CORRECTION_KINDS, default: 'correction' })
  @OptionalNotNull()
  @IsIn(CORRECTION_KINDS)
  kind?: ArticleCorrectionKind;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'At least one of noteAr / noteEn.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 2000)
  noteAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 2000)
  noteEn?: string | null;

  @ApiPropertyOptional({ format: 'date-time', description: 'Default: now.' })
  @OptionalNotNull()
  @IsISO8601({ strict: true })
  correctedAt?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Article version with the fix.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  revisionVersion?: number | null;

  @ApiPropertyOptional({
    default: true,
    description: 'false = internal note, not shown to readers.',
  })
  @OptionalNotNull()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateCorrectionDto extends CreateCorrectionDto {}

export class PreviewTokenRequestDto {
  @ApiPropertyOptional({ default: 1440, minimum: 5, maximum: 10080, description: 'Minutes.' })
  @OptionalNotNull()
  @IsInt()
  @Min(5)
  @Max(10080)
  ttlMinutes?: number;
}

export class RevisionListQueryDto extends PaginationQueryDto {}

export class RevisionDiffQueryDto {
  @ApiPropertyOptional({ description: 'Version to compare with (default: previous version).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  against?: number;
}

export class RestoreRevisionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

// ---- output -----------------------------------------------------------------------

export class AdminTranslationDto {
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty() bodyHtml!: string;
  @ApiProperty({ nullable: true, type: String }) seoTitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) seoDescription!: string | null;
  @ApiProperty() isMachineTranslated!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  humanReviewedAt!: string | null;
  @ApiProperty({ description: 'false = unreviewed machine text (never served to readers).' })
  servable!: boolean;
  @ApiProperty({ nullable: true, type: Number }) readingMinutes!: number | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class VehicleLinkViewDto extends RelatedVehicleDto {
  @ApiProperty({ description: 'Published and visible to readers.' }) isPublic!: boolean;
}

export class AdminArticleSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ARTICLE_TYPES }) type!: string;
  @ApiProperty({ enum: CONTENT_STATUSES }) status!: string;
  @ApiProperty({ description: 'In review with a recorded approval.' }) approved!: boolean;
  @ApiProperty({ description: 'Title in the request language (else the original).' })
  title!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) originalLanguage!: string;
  @ApiProperty({ type: [String] }) languages!: string[];
  @ApiProperty({ type: RefDto, nullable: true }) category!: RefDto | null;
  @ApiProperty({ type: AuthorRefDto, nullable: true }) author!: AuthorRefDto | null;
  @ApiProperty({ type: [String] }) marketCodes!: string[];
  @ApiProperty({ type: ArticleImageViewDto, nullable: true })
  coverImage!: ArticleImageViewDto | null;
  @ApiProperty() currentVersion!: number;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty() isSponsored!: boolean;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) rssItemId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) scheduledAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminArticleDto extends AdminArticleSummaryDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(AdminTranslationDto) },
    description: 'Texts keyed by locale.',
  })
  translations!: Record<string, AdminTranslationDto>;
  @ApiProperty({ type: [RefDto] }) tags!: RefDto[];
  @ApiProperty({ type: [VehicleLinkViewDto] }) vehicleLinks!: VehicleLinkViewDto[];
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) categoryId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) coverAssetId!: string | null;
  @ApiProperty({ nullable: true, type: String }) authorName!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '2026-09-20' }) eventDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceName!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sponsorName!: string | null;
  @ApiProperty() allowComments!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) submittedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) reviewedAt!: string | null;
  @ApiProperty({ type: AuthorRefDto, nullable: true }) reviewedBy!: AuthorRefDto | null;
  @ApiProperty({ nullable: true, type: String }) reviewNote!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) contentUpdatedAt!:
    string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt!: string | null;
  @ApiProperty({
    enum: WORKFLOW_ACTIONS,
    isArray: true,
    description: 'Actions the caller may perform now.',
  })
  allowedActions!: string[];
  @ApiProperty({ description: 'Caller may edit the content now.' }) canEdit!: boolean;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Why it cannot be published yet ([] = ready): [{code, field?, locale?}].',
  })
  publishIssues!: Array<{ code: string; field?: string; locale?: string }>;
  @ApiProperty({ description: 'Public share URL (works once published).' }) shareUrl!: string;
}

export class RevisionSummaryDto {
  @ApiProperty() version!: number;
  @ApiProperty({ enum: CONTENT_STATUSES }) status!: string;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: Number }) restoredFromVersion!: number | null;
  @ApiProperty({ type: AuthorRefDto, nullable: true }) createdBy!: AuthorRefDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RevisionDetailDto extends RevisionSummaryDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Full content snapshot.',
  })
  snapshot!: Record<string, unknown>;
}

export class RevisionDiffDto {
  @ApiProperty() from!: number;
  @ApiProperty() to!: number;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: '[{field, before, after}]',
  })
  changes!: Array<{ field: string; before: unknown; after: unknown }>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Word diff of the body text per locale ([{op: equal|insert|delete, text}] or null when too large).',
  })
  bodyDiff!: Record<string, unknown>;
}

export class CorrectionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CORRECTION_KINDS }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) noteAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) noteEn!: string | null;
  @ApiProperty({ nullable: true, type: Number }) revisionVersion!: number | null;
  @ApiProperty({ format: 'date-time' }) correctedAt!: string;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty({ type: AuthorRefDto, nullable: true }) createdBy!: AuthorRefDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PreviewTokenDto {
  @ApiProperty() token!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ description: 'GET this URL (API) to read the unpublished article.' }) url!: string;
}

export class AuthorOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}
