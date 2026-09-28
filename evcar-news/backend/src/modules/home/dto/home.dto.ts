import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { QueryNumber } from '../../stations/dto/validators';

export class HomeQueryDto {
  @ApiPropertyOptional({ description: 'With lng: enables "nearby stations" (not stored)' })
  @QueryNumber(-90, 90)
  lat?: number;

  @ApiPropertyOptional()
  @QueryNumber(-180, 180)
  lng?: number;
}

export class HomeBrowseDto {
  @ApiProperty({ enum: ['articles', 'cars', 'comparisons', 'tours', 'stations', 'encyclopedia'] })
  resource!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  params!: Record<string, string>;
}

export class HomeSectionDto {
  @ApiProperty({
    enum: [
      'top_story',
      'for_you',
      'latest_news',
      'reviews',
      'new_cars',
      'featured_comparisons',
      'interior_tours',
      'nearby_stations',
      'charging_guides',
    ],
  })
  key!: string;
  @ApiProperty({ description: '1..n render order' }) order!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['article', 'car', 'comparison', 'tour', 'station', 'encyclopedia'] })
  itemType!: string;
  @ApiProperty({ enum: ['ok', 'empty', 'location_required', 'unavailable'] }) state!: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description:
      'article = /articles item, car = /cars item, comparison = /comparisons/featured item, tour = /tours item, station = /stations item, encyclopedia = /encyclopedia item',
  })
  items!: unknown[];
  @ApiProperty({ type: HomeBrowseDto }) browse!: HomeBrowseDto;
}

export class HiddenSectionDto {
  @ApiProperty() key!: string;
  @ApiProperty({ enum: ['disabled_by_admin', 'feature_off'] }) reason!: string;
}

export class HomeDto {
  @ApiProperty() market!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) language!: string;
  @ApiProperty() personalized!: boolean;
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ type: [HomeSectionDto] }) sections!: HomeSectionDto[];
  @ApiProperty({ type: [HiddenSectionDto] }) hiddenSections!: HiddenSectionDto[];
}

export class InterestRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class ModelInterestRefDto extends InterestRefDto {
  @ApiProperty() brandName!: string;
}

export class InterestsDto {
  @ApiProperty({ type: [InterestRefDto] }) brands!: InterestRefDto[];
  @ApiProperty({ type: [ModelInterestRefDto] }) models!: ModelInterestRefDto[];
  @ApiProperty({ type: [InterestRefDto] }) categories!: InterestRefDto[];
}

export class UpdateInterestsDto {
  @ApiProperty({ type: [String], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  brandIds!: string[];

  @ApiProperty({ type: [String], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  modelIds!: string[];

  @ApiProperty({ type: [String], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  categoryIds!: string[];
}
