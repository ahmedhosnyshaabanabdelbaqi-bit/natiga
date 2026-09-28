import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import { SearchEntityType } from '../../../generated/prisma/enums';
import { QueryBool, QueryInt, QueryList } from '../../stations/dto/validators';
import { SEARCH_GROUPS, type SearchGroupKey } from '../common/search-types';

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const HAS_LETTER = localizedMessage({
  ar: 'اكتب حرفًا أو رقمًا واحدًا على الأقل.',
  en: 'Type at least one letter or digit.',
});

export class SearchQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'بي واي دي' })
  @CleanText()
  @IsString()
  @Length(1, 100)
  @Matches(LETTER_OR_DIGIT, { context: HAS_LETTER })
  q!: string;

  @ApiPropertyOptional({
    description: `Comma list of groups (default: all): ${SEARCH_GROUPS.join(', ')}`,
    example: 'articles,models',
  })
  @QueryList(SEARCH_GROUPS, SEARCH_GROUPS.length)
  types?: SearchGroupKey[];

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5, description: 'Items per group' })
  @QueryInt(1, 20)
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 1 })
  @QueryInt(1, 50)
  page?: number;

  @ApiPropertyOptional({ description: 'true = ignore the market (default false)' })
  @QueryBool()
  allMarkets?: boolean;
}

export class SuggestQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'تسل' })
  @CleanText()
  @IsString()
  @Length(1, 100)
  @Matches(LETTER_OR_DIGIT, { context: HAS_LETTER })
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 15, default: 8 })
  @QueryInt(1, 15)
  limit?: number;
}

export class RangeDto {
  @ApiProperty() start!: number;
  @ApiProperty() end!: number;
}

export class SearchHitDto {
  @ApiProperty({
    enum: ['article', 'brand', 'model', 'variant', 'station', 'encyclopedia', 'service'],
  })
  type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) snippet!: string | null;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ enum: ['ar', 'en'] }) language!: string;
  @ApiProperty() isFallback!: boolean;
  @ApiProperty({
    description: 'UTF-16 ranges (start inclusive, end exclusive) in title / snippet',
    example: { title: [{ start: 0, end: 3 }], snippet: [] },
  })
  highlights!: { title: RangeDto[]; snippet: RangeDto[] };
  @ApiProperty({ enum: ['exact', 'prefix', 'text', 'alias', 'fuzzy'] }) matchedBy!: string;
  @ApiProperty() score!: number;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true }) details!: Record<string, unknown>;
}

export class SearchGroupDto {
  @ApiProperty({ enum: SEARCH_GROUPS }) type!: string;
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ type: [SearchHitDto] }) items!: SearchHitDto[];
}

export class ExpansionDto {
  @ApiProperty() term!: string;
  @ApiProperty() canonical!: string;
}

export class SearchResultDto {
  @ApiProperty() query!: string;
  @ApiProperty() normalizedQuery!: string;
  @ApiProperty({ type: [ExpansionDto] }) expansions!: ExpansionDto[];
  @ApiProperty() totalHits!: number;
  @ApiProperty({ type: [SearchGroupDto] }) groups!: SearchGroupDto[];
}

export class SuggestionDto {
  @ApiProperty() text!: string;
  @ApiProperty({ enum: ['query', 'entity'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) type!: string | null;
  @ApiProperty({ nullable: true, type: String }) id!: string | null;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty({ type: [RangeDto] }) highlights!: RangeDto[];
}

// --- admin -------------------------------------------------------------------------------

const ENTITY_TYPES = Object.values(SearchEntityType);
const LOCALES = ['ar', 'en'] as const;

export class AliasListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches term or canonical (normalized)' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional() @QueryBool() active?: boolean;
  @ApiPropertyOptional() @QueryBool() system?: boolean;

  @ApiPropertyOptional({ enum: ENTITY_TYPES })
  @IsOptional()
  @IsIn(ENTITY_TYPES)
  entityType?: SearchEntityType;
}

export class CreateAliasDto {
  @ApiProperty({ example: 'بي واي دي', maxLength: 200 })
  @CleanText()
  @IsString()
  @Length(1, 200)
  term!: string;

  @ApiProperty({ example: 'BYD', maxLength: 200 })
  @CleanText()
  @IsString()
  @Length(1, 200)
  canonical!: string;

  @ApiPropertyOptional({ enum: LOCALES, nullable: true, description: 'Language of the term' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(LOCALES)
  locale?: 'ar' | 'en' | null;

  @ApiPropertyOptional({ enum: ENTITY_TYPES, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(ENTITY_TYPES)
  entityType?: SearchEntityType | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  entityId?: string | null;

  @ApiPropertyOptional({ default: true })
  @OptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAliasDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 200)
  term?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 200)
  canonical?: string;

  @ApiPropertyOptional({ enum: LOCALES, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(LOCALES)
  locale?: 'ar' | 'en' | null;

  @ApiPropertyOptional({ enum: ENTITY_TYPES, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(ENTITY_TYPES)
  entityType?: SearchEntityType | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  entityId?: string | null;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class AliasViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() term!: string;
  @ApiProperty() canonical!: string;
  @ApiProperty() termNormalized!: string;
  @ApiProperty() canonicalNormalized!: string;
  @ApiProperty({ nullable: true, type: String }) locale!: string | null;
  @ApiProperty({ nullable: true, enum: ENTITY_TYPES }) entityType!: string | null;
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class IndexStatusDto {
  @ApiProperty() entityType!: string;
  @ApiProperty({ description: 'Distinct entities with a published index row' }) indexed!: number;
  @ApiProperty({ description: 'Publicly visible rows in the source table' }) visible!: number;
  @ApiProperty({ description: 'false = run POST /admin/search/reindex' }) inSync!: boolean;
  @ApiProperty({
    enum: ['index', 'direct'],
    description: 'direct = queried from its table (always current)',
  })
  source!: string;
}

export class ReindexResultDto {
  @ApiProperty() articles!: number;
  @ApiProperty() models!: number;
}
