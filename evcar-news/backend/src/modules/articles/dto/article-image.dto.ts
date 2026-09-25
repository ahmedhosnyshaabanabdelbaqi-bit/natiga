import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { CleanText } from '../../../common/validation/decorators';
import { LicenseType } from '../../../generated/prisma/enums';
import { ArticleImageViewDto } from './article-common.dto';

export const LICENSE_TYPES = Object.values(LicenseType);

const bool = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );
const emptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

/** Multipart fields sent with an article image (rights are mandatory). */
export class ArticleImageUploadDto {
  @ApiProperty({ enum: LICENSE_TYPES, description: 'Licence of the image.' })
  @IsIn(LICENSE_TYPES)
  licenseType!: LicenseType;

  @ApiProperty({ description: 'Who holds the rights (photographer, agency, brand).' })
  @CleanText()
  @IsString()
  @Length(1, 300)
  rightsHolder!: string;

  @ApiPropertyOptional({ description: 'Required when attributionRequired=true.' })
  @IsOptional()
  @emptyToUndefined()
  @CleanText()
  @IsString()
  @MaxLength(500)
  attributionText?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @bool()
  @IsBoolean()
  attributionRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  licenseUrl?: string;

  @ApiPropertyOptional({ description: 'Where the image comes from (press kit page...).' })
  @IsOptional()
  @emptyToUndefined()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Credit line shown under the image.' })
  @IsOptional()
  @emptyToUndefined()
  @CleanText()
  @IsString()
  @MaxLength(300)
  creditText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @CleanText()
  @IsString()
  @MaxLength(500)
  altTextAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @CleanText()
  @IsString()
  @MaxLength(500)
  altTextEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @CleanText()
  @IsString()
  @MaxLength(1000)
  captionAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToUndefined()
  @CleanText()
  @IsString()
  @MaxLength(1000)
  captionEn?: string;
}

/** OpenAPI schema of the multipart body (file + rights fields). */
export class ArticleImageUploadSchemaDto extends ArticleImageUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'JPEG / PNG / WebP / AVIF, ≤ 15 MB, ≥ 200 px wide.',
  })
  file!: unknown;
}

export class UploadedArticleImageDto extends ArticleImageViewDto {
  @ApiProperty({ description: 'HTML snippet to insert into the body (figure + credit).' })
  html!: string;
}
