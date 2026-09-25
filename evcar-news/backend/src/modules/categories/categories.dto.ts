import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ArticleType } from '../../generated/prisma/enums';
import { CleanText, OptionalNotNull } from '../../common/validation/decorators';

export const ARTICLE_TYPES = Object.values(ArticleType);

export class PublicCategoryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'batteries-charging' }) slug!: string;
  @ApiProperty({ description: 'Name in the request language (falls back to the other one).' })
  name!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) parentId!: string | null;
  @ApiProperty({ nullable: true, enum: ARTICLE_TYPES }) defaultArticleType!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Published articles visible in the request market.' })
  articleCount!: number;
  @ApiProperty({ description: 'Demo data (label it in the UI).' }) isDemo!: boolean;
}

export class CategoryUsageDto {
  @ApiProperty() articles!: number;
  @ApiProperty() children!: number;
  @ApiProperty() rssFeeds!: number;
  @ApiProperty() notificationSubscriptions!: number;
  @ApiProperty() userInterests!: number;
}

export class AdminCategoryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Built-in category key (seeded).' })
  systemKey!: string | null;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) parentId!: string | null;
  @ApiProperty({ nullable: true, enum: ARTICLE_TYPES }) defaultArticleType!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: CategoryUsageDto }) usage!: CategoryUsageDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateCategoryDto {
  @ApiPropertyOptional({
    description: 'Lower-case letters/digits/hyphens. Generated from nameEn when omitted.',
    example: 'charging',
  })
  @OptionalNotNull()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @ApiProperty({ example: 'الشحن' })
  @CleanText()
  @IsString()
  @Length(1, 200)
  nameAr!: string;

  @ApiProperty({ example: 'Charging' })
  @CleanText()
  @IsString()
  @Length(1, 200)
  nameEn!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ARTICLE_TYPES })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(ARTICLE_TYPES)
  defaultArticleType?: ArticleType | null;

  @ApiPropertyOptional({ default: 100 })
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @OptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 200)
  nameAr?: string;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 200)
  nameEn?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ARTICLE_TYPES })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(ARTICLE_TYPES)
  defaultArticleType?: ArticleType | null;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminCategoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by name/slug.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
