import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../common/validation/decorators';

export class PublicTagDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'fast-charging' }) slug!: string;
  @ApiProperty({ description: 'Name in the request language (falls back to the other one).' })
  name!: string;
  @ApiProperty({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ description: 'Published articles visible in the request market.' })
  articleCount!: number;
  @ApiProperty() isDemo!: boolean;
}

export class AdminTagDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ description: 'Articles (any status) using the tag.' }) articleCount!: number;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PublicTagQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches names (Arabic-normalized) and slugs.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminTagQueryDto extends PublicTagQueryDto {
  @ApiPropertyOptional({ enum: ['name', 'usage', 'created'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'usage', 'created'])
  sort?: 'name' | 'usage' | 'created';
}

export class CreateTagDto {
  @ApiPropertyOptional({
    description: 'Generated from the English (else Arabic) name when omitted.',
  })
  @OptionalNotNull()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'At least one name is required.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 200)
  nameAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 200)
  nameEn?: string | null;
}

export class UpdateTagDto extends CreateTagDto {}

export class MergeTagDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Tag that receives the articles; the source is deleted.',
  })
  @IsUUID()
  targetId!: string;
}

export class DeleteTagQueryDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Remove the tag from its articles.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  force?: 'true' | 'false';
}
