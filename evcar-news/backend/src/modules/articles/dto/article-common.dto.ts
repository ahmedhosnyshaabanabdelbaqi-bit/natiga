import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Image with its rights information (cover images, inline images). */
export class ImageVariantDto {
  @ApiProperty() width!: number;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty() url!: string;
}

export class ArticleImageViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Default size (≤ 1600 px wide).' }) url!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ type: [ImageVariantDto], description: 'Available widths (pick by screen size).' })
  variants!: ImageVariantDto[];
  @ApiProperty({ nullable: true, type: String, description: 'Alt text in the served language.' })
  alt!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Caption in the served language.' })
  caption!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Credit line to display with the image (photographer / rights holder).',
  })
  credit!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'press_kit' }) licenseType!: string | null;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
}

export class RefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Name in the request language.' }) name!: string;
}

export class AuthorRefDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  id?: string | null;
  @ApiProperty() name!: string;
}

export class RelatedVehicleDto {
  @ApiProperty({ enum: ['brand', 'model', 'variant'] }) type!: 'brand' | 'model' | 'variant';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Name in the request language (variant: full name incl. model).' })
  name!: string;
  @ApiProperty({ nullable: true, type: String }) brandName!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Model slug (variants).' })
  modelSlug!: string | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Model year (variants).' })
  modelYear!: number | null;
}
