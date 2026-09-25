import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText } from '../../../common/validation/decorators';
import { ArticleType } from '../../../generated/prisma/enums';
import { ArticleImageViewDto, AuthorRefDto, RefDto, RelatedVehicleDto } from './article-common.dto';

const ARTICLE_TYPES = Object.values(ArticleType);

export class PublicArticleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Category slug or id (includes its sub-categories).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @ApiPropertyOptional({ description: 'Tag slug or id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tag?: string;

  @ApiPropertyOptional({ enum: ARTICLE_TYPES })
  @IsOptional()
  @IsIn(ARTICLE_TYPES)
  type?: ArticleType;

  @ApiPropertyOptional({
    description: 'Text search in title / summary / body (Arabic-normalized).',
  })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description: 'Brand slug or id: articles about the brand or any of its models / variants.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  brand?: string;

  @ApiPropertyOptional({
    description: 'Model slug or id: articles about the model or its variants.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({
    description: 'Variant slug or id: articles about the variant or its whole model.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  variant?: string;

  @ApiPropertyOptional({
    description: 'Any car slug or id (resolved as variant, then model, then brand).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vehicle?: string;

  @ApiPropertyOptional({ format: 'uuid', deprecated: true, description: 'Same as brand=<id>.' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ format: 'uuid', deprecated: true, description: 'Same as model=<id>.' })
  @IsOptional()
  @IsUUID()
  modelId?: string;

  @ApiPropertyOptional({ format: 'uuid', deprecated: true, description: 'Same as variant=<id>.' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Only featured (top) stories.' })
  @IsOptional()
  @IsIn(['true', 'false'])
  featured?: 'true' | 'false';

  @ApiPropertyOptional({
    enum: ['fallback', 'strict'],
    default: 'fallback',
    description:
      'fallback: every article, served in the request language when available, else in its original language (isFallback=true). strict: only articles available in the request language.',
  })
  @IsOptional()
  @IsIn(['fallback', 'strict'])
  languageMode?: 'fallback' | 'strict';

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    default: 'false',
    description: 'true = ignore market targeting (browse content of every market).',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  allMarkets?: 'true' | 'false';

  @ApiPropertyOptional({
    enum: ['latest', 'oldest', 'popular'],
    default: 'latest',
    description: 'popular = most read over the last 7 days.',
  })
  @IsOptional()
  @IsIn(['latest', 'oldest', 'popular'])
  sort?: 'latest' | 'oldest' | 'popular';
}

export class PublicArticleSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Use it for /articles/:slug and share links.' }) slug!: string;
  @ApiProperty({ enum: ARTICLE_TYPES }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ enum: ['ar', 'en'], description: 'Language actually served.' }) language!: string;
  @ApiProperty({ enum: ['ar', 'en'], description: 'Language the client asked for.' })
  requestedLanguage!: string;
  @ApiProperty({ description: 'true when the text is not in the requested language.' })
  isFallback!: boolean;
  @ApiProperty({ type: [String], description: 'Languages readers can switch to.' })
  availableLanguages!: string[];
  @ApiProperty({ type: RefDto, nullable: true }) category!: RefDto | null;
  @ApiProperty({ type: [RefDto] }) tags!: RefDto[];
  @ApiProperty({ type: ArticleImageViewDto, nullable: true })
  coverImage!: ArticleImageViewDto | null;
  @ApiProperty({ type: AuthorRefDto, nullable: true }) author!: AuthorRefDto | null;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Last editorial change after publication ("updated").',
  })
  contentUpdatedAt!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-09-20',
    description: 'When the event happened (not the publication date).',
  })
  eventDate!: string | null;
  @ApiProperty({ nullable: true, type: Number }) readingMinutes!: number | null;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty({ description: 'Sponsored content: always show the label with sponsorName.' })
  isSponsored!: boolean;
  @ApiProperty({ nullable: true, type: String }) sponsorName!: string | null;
  @ApiProperty({ description: 'Demo content: show a visible "demo" label.' }) isDemo!: boolean;
  @ApiProperty({ type: [String], description: 'Target markets ([] = every market).' })
  marketCodes!: string[];
  @ApiProperty({ example: 'https://evcar.news/n/byd-seal-launch' }) shareUrl!: string;
}

export class ArticleSourceDto {
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Attribution text to display.' })
  attribution!: string | null;
}

export class PublicCorrectionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['correction', 'clarification', 'update'] }) kind!: string;
  @ApiProperty() note!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) noteLanguage!: string;
  @ApiProperty({ format: 'date-time' }) correctedAt!: string;
}

export class PublicArticleDetailDto extends PublicArticleSummaryDto {
  @ApiProperty({ description: 'Sanitized HTML (render as HTML; no scripts).' }) bodyHtml!: string;
  @ApiProperty({ nullable: true, type: String }) seoTitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) seoDescription!: string | null;
  @ApiProperty({
    description: 'Text is a machine translation that a person reviewed (show a small note).',
  })
  machineTranslated!: boolean;
  @ApiProperty({ type: ArticleSourceDto, nullable: true }) source!: ArticleSourceDto | null;
  @ApiProperty({ type: [PublicCorrectionDto] }) corrections!: PublicCorrectionDto[];
  @ApiProperty({ type: [PublicArticleSummaryDto] }) relatedArticles!: PublicArticleSummaryDto[];
  @ApiProperty({ type: [RelatedVehicleDto] }) relatedVehicles!: RelatedVehicleDto[];
  @ApiProperty({ description: 'false when the article targets other markets than the request.' })
  marketMatch!: boolean;
  @ApiProperty() allowComments!: boolean;
  @ApiProperty({ format: 'date-time', description: 'Technical last change (cache validation).' })
  updatedAt!: string;
  @ApiPropertyOptional({ description: 'Present (true) on /articles/preview/:token responses.' })
  preview?: boolean;
  @ApiPropertyOptional({ description: 'Workflow status (preview only).' })
  status?: string;
}
