import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { ContentStatus, ServiceProviderType } from '../../../generated/prisma/enums';
import { ImageDto } from '../../vehicles/dto/shared.dto';
import { QueryBool, QueryNumber } from '../../stations/dto/validators';
import { SERVICE_TYPES } from '../common/labels';

const SERVICE_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
const PHONE_RE = /^\+?[0-9 ()-]{3,30}$/;

// --- public ------------------------------------------------------------------------------

export class ServiceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SERVICE_TYPES })
  @IsOptional()
  @IsIn(SERVICE_TYPES)
  type?: ServiceProviderType;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ description: 'Brand slug or id (dealers / service centres of a brand)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  brand?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional() @QueryNumber(-90, 90) lat?: number;
  @ApiPropertyOptional() @QueryNumber(-180, 180) lng?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, description: 'With lat/lng (default 50)' })
  @QueryNumber(1, 500)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Only providers open now (unknown hours excluded)' })
  @QueryBool()
  openNow?: boolean;
}

export class ServiceContactDto {
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) whatsapp!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) websiteUrl!: string | null;
  @ApiProperty() verified!: boolean;
  @ApiProperty({ nullable: true, type: String }) verifiedAt!: string | null;
  @ApiProperty({ description: 'Verified more than 12 months ago' }) stale!: boolean;
  @ApiProperty({ example: 'تم التحقق في 3 مارس 2026' }) label!: string;
}

export class BrandRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class ServiceProviderViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: SERVICE_TYPES }) type!: string;
  @ApiProperty() typeLabel!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() marketCode!: string;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
  @ApiProperty({ nullable: true, type: Number }) latitude!: number | null;
  @ApiProperty({ nullable: true, type: Number }) longitude!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: 'From lat/lng of the request' })
  distanceM!: number | null;
  @ApiProperty({ type: ServiceContactDto }) contact!: ServiceContactDto;
  @ApiProperty({ enum: ['open', 'closed', 'unknown'] }) openNow!: string;
  @ApiProperty({ nullable: true, type: Boolean }) isAlwaysOpen!: boolean | null;
  @ApiProperty({ type: [String] }) services!: string[];
  @ApiProperty({ type: [BrandRefDto] }) brands!: BrandRefDto[];
  @ApiProperty({ type: ImageDto, nullable: true }) logo!: ImageDto | null;
  @ApiProperty() isSponsored!: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'Always set when sponsored' })
  sponsorLabel!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class OpeningDayDto {
  @ApiProperty({ enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }) day!: string;
  @ApiProperty({
    nullable: true,
    description: 'null = unknown, [] = closed',
    example: [{ start: '09:00', end: '17:00' }],
  })
  windows!: { start: string; end: string }[] | null;
}

export class ServiceProviderDetailDto extends ServiceProviderViewDto {
  @ApiProperty({ type: [OpeningDayDto], nullable: true }) openingHours!: OpeningDayDto[] | null;
  @ApiProperty() timezone!: string;
}

export class ServiceTypeCountDto {
  @ApiProperty({ enum: SERVICE_TYPES }) type!: string;
  @ApiProperty() label!: string;
  @ApiProperty() count!: number;
}

// --- admin -------------------------------------------------------------------------------

class ProviderFieldsDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(5000)
  descriptionAr?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(5000)
  descriptionEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  addressAr?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(500)
  addressEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Changing contact data clears the verification',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(PHONE_RE)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(PHONE_RE)
  whatsapp?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(/^https:\/\/[^\s]+$/i)
  websiteUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '{"mon":[["09:00","17:00"]],…}; [] = closed, missing day = unknown',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsObject()
  openingHours?: Record<string, [string, string][]> | null;

  @ApiPropertyOptional({ nullable: true, description: 'true = 24/7 (openingHours must be null)' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsBoolean()
  isAlwaysOpen?: boolean | null;

  @ApiPropertyOptional({ type: [String], example: ['battery_repair', 'towing'] })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(SERVICE_KEY_RE, { each: true })
  services?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Brand ids' })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  brandIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  logoAssetId?: string | null;

  @ApiPropertyOptional({ description: 'Requires ads.manage' })
  @OptionalNotNull()
  @IsBoolean()
  isSponsored?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 100, description: 'Requires ads.manage' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @Length(1, 100)
  sponsorLabel?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Requires ads.manage' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  sponsoredUntil?: string | null;
}

export class CreateProviderDto extends ProviderFieldsDto {
  @ApiProperty({ enum: SERVICE_TYPES }) @IsIn(SERVICE_TYPES) type!: ServiceProviderType;
  @ApiProperty() @CleanText() @IsString() @Length(1, 200) nameAr!: string;
  @ApiProperty() @CleanText() @IsString() @Length(1, 200) nameEn!: string;
  @ApiProperty({ example: 'EG' }) @IsString() @Matches(/^[A-Z]{2,8}$/) marketCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) slug?: string;
}

export class UpdateProviderDto extends ProviderFieldsDto {
  @ApiPropertyOptional({ enum: SERVICE_TYPES })
  @OptionalNotNull()
  @IsIn(SERVICE_TYPES)
  type?: ServiceProviderType;
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
  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsString()
  @Matches(/^[A-Z]{2,8}$/)
  marketCode?: string;
  @ApiPropertyOptional() @OptionalNotNull() @IsString() @Length(1, 200) slug?: string;
}

export class AdminProviderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ContentStatus) })
  @IsOptional()
  @IsIn(Object.values(ContentStatus))
  status?: ContentStatus;

  @ApiPropertyOptional({ enum: SERVICE_TYPES })
  @IsOptional()
  @IsIn(SERVICE_TYPES)
  type?: ServiceProviderType;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Z]{2,8}$/) market?: string;
  @ApiPropertyOptional() @IsOptional() @CleanText() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @QueryBool() sponsored?: boolean;
  @ApiPropertyOptional() @QueryBool() verified?: boolean;
}

export class VerifyContactDto {
  @ApiProperty({ maxLength: 500, example: 'Phone call to the listed number on 2026-09-20' })
  @CleanText()
  @IsString()
  @Length(3, 500)
  note!: string;
}

export class AdminProviderViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() type!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty() marketCode!: string;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ nullable: true, type: String }) addressAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) addressEn!: string | null;
  @ApiProperty({ nullable: true, type: Number }) latitude!: number | null;
  @ApiProperty({ nullable: true, type: Number }) longitude!: number | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) whatsapp!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) websiteUrl!: string | null;
  @ApiProperty({ nullable: true }) openingHours!: unknown;
  @ApiProperty({ nullable: true, type: Boolean }) isAlwaysOpen!: boolean | null;
  @ApiProperty({ type: [String] }) services!: string[];
  @ApiProperty({ type: [String] }) brandIds!: string[];
  @ApiProperty({ nullable: true, type: String }) logoAssetId!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactVerifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactVerifiedById!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactVerificationNote!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() isSponsored!: boolean;
  @ApiProperty({ nullable: true, type: String }) sponsorLabel!: string | null;
  @ApiProperty({ nullable: true, type: String }) sponsoredUntil!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
