import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { FavoriteTargetType } from '../../../generated/prisma/enums';

const TYPES = Object.values(FavoriteTargetType);

export class FavoriteListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: FavoriteTargetType;
}

export class FavoriteViewDto {
  @ApiProperty({ enum: TYPES }) type!: FavoriteTargetType;
  @ApiProperty({ format: 'uuid', description: 'Target id' }) id!: string;
  @ApiProperty() savedAt!: string;
  @ApiProperty({ description: 'false = unpublished / removed since (show a note)' })
  available!: boolean;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) subtitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Comparisons: /comparisons/s/:shareId',
  })
  shareId!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class FavoriteKeyDto {
  @ApiProperty({ enum: TYPES }) type!: FavoriteTargetType;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() savedAt!: string;
}

export class MergeItemDto {
  @ApiProperty({ enum: TYPES }) @IsIn(TYPES) type!: FavoriteTargetType;
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
  @ApiPropertyOptional({ description: 'When it was saved on the device (future dates → now)' })
  @IsOptional()
  @IsDateString()
  savedAt?: string;
}

export class MergeFavoritesDto {
  @ApiProperty({ type: [MergeItemDto], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MergeItemDto)
  items!: MergeItemDto[];
}

export class MergeSkippedDto {
  @ApiProperty({ enum: TYPES }) type!: string;
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['not_found', 'limit_reached'] }) reason!: 'not_found' | 'limit_reached';
}

export class MergeResultDto {
  @ApiProperty() added!: number;
  @ApiProperty() alreadyPresent!: number;
  @ApiProperty({ type: [MergeSkippedDto] }) skipped!: MergeSkippedDto[];
  @ApiProperty({ type: [FavoriteKeyDto], description: 'All keys of the account after the merge' })
  keys!: FavoriteKeyDto[];
}
