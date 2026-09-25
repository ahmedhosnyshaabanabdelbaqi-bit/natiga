import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { CleanText } from '../../common/validation/decorators';
import { LocaleQueryDto } from './locale-query.dto';

export const TRANSLATION_SORT_FIELDS = ['namespace', 'key', 'locale', 'updatedAt'] as const;
export const TRANSLATION_SORTS = TRANSLATION_SORT_FIELDS.flatMap((f) => [f, `-${f}`]);
export type TranslationSort =
  (typeof TRANSLATION_SORT_FIELDS)[number] | `-${(typeof TRANSLATION_SORT_FIELDS)[number]}`;

export const NAMESPACE_RE = /^[a-z][a-z0-9_-]{0,63}$/;
export const KEY_RE = /^[A-Za-z0-9_.-]{1,191}$/;
export const LOCALES = ['ar', 'en'] as const;

export class TranslationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'home' }) namespace!: string;
  @ApiProperty({ example: 'sections.latest_news' }) key!: string;
  @ApiProperty({ enum: LOCALES }) locale!: string;
  @ApiProperty({ description: 'Plain text (clients must render it as text, never HTML).' })
  value!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) updatedById!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateTranslationDto {
  @ApiProperty({
    example: 'home',
    description:
      'Feature namespace (admin/mobile UI) or a server namespace: errors, notifications, labels.',
  })
  @IsString()
  @Matches(NAMESPACE_RE)
  namespace!: string;

  @ApiProperty({ example: 'sections.latest_news' })
  @IsString()
  @Matches(KEY_RE)
  key!: string;

  @ApiProperty({ enum: LOCALES })
  @IsIn(LOCALES)
  locale!: (typeof LOCALES)[number];

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  value!: string;
}

export class UpdateTranslationDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  value!: string;
}

export class ListTranslationsQueryDto extends IntersectionType(PaginationQueryDto, LocaleQueryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(NAMESPACE_RE)
  namespace?: string;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: (typeof LOCALES)[number];

  @ApiPropertyOptional({ description: 'Searches keys and values (case-insensitive).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: TRANSLATION_SORTS,
    description: 'Field, `-` prefix for descending. Default: namespace, key, locale.',
  })
  @IsOptional()
  @IsIn(TRANSLATION_SORTS)
  sort?: TranslationSort;
}

export class CatalogQueryDto extends LocaleQueryDto {
  @ApiPropertyOptional({ enum: ['errors', 'notifications', 'labels'] })
  @IsOptional()
  @IsIn(['errors', 'notifications', 'labels'])
  namespace?: string;
}

export class CatalogOverrideDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() value!: string;
}

export class CatalogOverridesDto {
  @ApiProperty({ type: CatalogOverrideDto, nullable: true }) ar!: CatalogOverrideDto | null;
  @ApiProperty({ type: CatalogOverrideDto, nullable: true }) en!: CatalogOverrideDto | null;
}

export class CatalogEntryDto {
  @ApiProperty({ example: 'errors' }) namespace!: string;
  @ApiProperty({ example: 'NOT_FOUND' }) key!: string;
  @ApiProperty({ description: 'Built-in Arabic text.' }) ar!: string;
  @ApiProperty({ description: 'Built-in English text.' }) en!: string;
  @ApiProperty({ type: [String], description: 'Placeholders an override must keep.' })
  placeholders!: string[];
  @ApiProperty({ type: () => CatalogOverridesDto })
  overrides!: { ar: CatalogOverrideDto | null; en: CatalogOverrideDto | null };
}

export class PublicTranslationsQueryDto extends LocaleQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated namespaces (default: all).',
    example: 'home,cars',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[a-z][a-z0-9_-]{0,63}(,[a-z][a-z0-9_-]{0,63})*$/)
  namespaces?: string;
}

export class PublicTranslationsDto {
  @ApiProperty({ enum: LOCALES }) lang!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'object', additionalProperties: { type: 'string' } },
    description: '{ namespace: { key: text } } — overrides to layer over bundled strings.',
  })
  namespaces!: Record<string, Record<string, string>>;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) updatedAt!: string | null;
}
