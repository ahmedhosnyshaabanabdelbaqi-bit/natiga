import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OptionalNotNull } from '../../common/validation/decorators';
import { localizedMessage } from '../../common/validation/messages';

const HEX_MESSAGE = localizedMessage({
  ar: 'يجب أن يكون اللون بصيغة #RRGGBB.',
  en: 'Must be a colour in #RRGGBB format.',
});
import { HOME_SECTION_KEYS } from './settings.types';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
/** Absolute http(s) URL (https is enforced in production by SettingsService). */
const HTTP_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
const PACKAGE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export class BrandingSettingsDto {
  @ApiProperty({ example: 'EV Car News', maxLength: 60 })
  @IsString()
  @Length(1, 60)
  appName!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Absolute URL of the logo (use POST /admin/settings/branding/logo to upload one).',
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL)
  logoUrl!: string | null;

  @ApiProperty({ example: '#0A5CFF' })
  @Matches(HEX_COLOR, { message: 'primaryColor must be #RRGGBB', context: HEX_MESSAGE })
  primaryColor!: string;

  @ApiProperty({ example: '#00C2E0' })
  @Matches(HEX_COLOR, { message: 'accentColor must be #RRGGBB', context: HEX_MESSAGE })
  accentColor!: string;
}

export class DefaultsSettingsDto {
  @ApiProperty({ enum: ['ar', 'en'] })
  @IsIn(['ar', 'en'])
  defaultLanguage!: 'ar' | 'en';

  @ApiProperty({ example: 'EG', description: 'Must be an enabled market.' })
  @Matches(/^[A-Z]{2,8}$/)
  defaultMarket!: string;

  @ApiProperty({ type: [String], enum: ['ar', 'en'], example: ['ar', 'en'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(['ar', 'en'], { each: true })
  languages!: ('ar' | 'en')[];
}

export class HomeSectionDto {
  @ApiProperty({ enum: HOME_SECTION_KEYS })
  @IsIn(HOME_SECTION_KEYS)
  key!: (typeof HOME_SECTION_KEYS)[number];

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  order!: number;
}

export class HomeSectionsSettingsDto {
  @ApiProperty({ type: [HomeSectionDto], description: 'Each key at most once; orders unique.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(HOME_SECTION_KEYS.length)
  @ValidateNested({ each: true })
  @Type(() => HomeSectionDto)
  sections!: HomeSectionDto[];
}

/** Partial update of feature flags (only listed flags change). */
export class FeaturesSettingsDto {
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() news?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() cars?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() comparisons?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() interiorTours?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() stations?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() calculators?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() garage?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() favorites?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() chargingLogs?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() reminders?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() encyclopedia?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() notifications?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() community?: boolean;
  @ApiPropertyOptional({
    description: 'Effective only while a routing provider is configured.',
  })
  @OptionalNotNull()
  @IsBoolean()
  tripPlanner?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() servicesDirectory?: boolean;
  @ApiPropertyOptional({ description: 'Effective only while an assistant LLM is configured.' })
  @OptionalNotNull()
  @IsBoolean()
  assistant?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() ads?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() exteriorSpin?: boolean;
}

export class MapSettingsDto {
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    description: 'Must contain {z}, {x} and {y}; {s} for subdomains; {r} for retina is allowed.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1024)
  @Matches(/^https?:\/\/[^\s]+$/i)
  tileUrlTemplate!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '© OpenStreetMap contributors',
    description: 'Required whenever tiles are configured (licence attribution).',
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 300)
  attribution!: string | null;

  @ApiProperty({ minimum: 1, maximum: 22, example: 19 })
  @IsInt()
  @Min(1)
  @Max(22)
  maxZoom!: number;

  @ApiPropertyOptional({ type: [String], example: ['a', 'b', 'c'] })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[a-z0-9-]{1,20}$/i, { each: true })
  subdomains?: string[];
}

export class SharePathsDto {
  @ApiProperty({ example: '/n/{slug}' })
  @Matches(/^\/[A-Za-z0-9/_-]*\{slug\}[A-Za-z0-9/_-]*$/)
  article!: string;

  @ApiProperty({ example: '/cars/{slug}' })
  @Matches(/^\/[A-Za-z0-9/_-]*\{slug\}[A-Za-z0-9/_-]*$/)
  car!: string;

  @ApiProperty({ example: '/compare/{shareId}' })
  @Matches(/^\/[A-Za-z0-9/_-]*\{shareId\}[A-Za-z0-9/_-]*$/)
  comparison!: string;
}

export class ShareSettingsDto {
  @ApiProperty({ example: 'https://evcar.news' })
  @IsString()
  @MaxLength(200)
  @Matches(/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/, {
    message: 'baseUrl must be an origin without path, e.g. https://evcar.news',
    context: localizedMessage({
      ar: 'يجب أن يكون أصلًا بلا مسار، مثل https://evcar.news',
      en: 'Must be an origin without a path, e.g. https://evcar.news',
    }),
  })
  baseUrl!: string;

  @ApiProperty({ type: SharePathsDto })
  @ValidateNested()
  @Type(() => SharePathsDto)
  paths!: SharePathsDto;

  @ApiProperty({ nullable: true, type: String, description: 'Default OG image for shared links.' })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL)
  defaultImageUrl!: string | null;

  @ApiPropertyOptional({ enum: ['auto', 'ar', 'en'], default: 'auto' })
  @OptionalNotNull()
  @IsIn(['auto', 'ar', 'en'])
  language?: 'auto' | 'ar' | 'en';
}

export class LegalSettingsDto {
  @ApiProperty({ nullable: true, type: String })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL)
  privacyUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL)
  termsUrl!: string | null;
}

export class AppLinksSettingsDto {
  @ApiProperty({ example: 'news.evcar.app' })
  @Matches(PACKAGE_ID)
  androidPackage!: string;

  @ApiProperty({
    type: [String],
    example: [
      '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5',
    ],
    description: 'SHA-256 signing certificate fingerprints (upper-case hex pairs).',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(SHA256_FINGERPRINT, {
    each: true,
    context: localizedMessage({
      ar: 'يجب أن تكون بصمة SHA-256 بصيغة AA:BB:… (32 زوجًا).',
      en: 'Must be a SHA-256 fingerprint like AA:BB:… (32 pairs).',
    }),
  })
  androidSha256CertFingerprints!: string[];

  @ApiProperty({ nullable: true, type: String, example: 'ABCDE12345' })
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9]{10}$/)
  iosTeamId!: string | null;

  @ApiProperty({ example: 'news.evcar.app' })
  @Matches(PACKAGE_ID)
  iosBundleId!: string;

  @ApiPropertyOptional({ type: [String], example: ['/n/*', '/cars/*', '/compare/*'] })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^\/[A-Za-z0-9/_*.-]*$/, { each: true })
  paths?: string[];
}

export class SettingDto {
  @ApiProperty({ example: 'branding' }) key!: string;
  @ApiProperty({ description: 'Typed value of the key (see the PUT body of each key).' })
  value!: unknown;
  @ApiProperty({ description: 'Exposed (in part) by GET /api/v1/app-config.' }) isPublic!: boolean;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'true when no admin value is stored (built-in default).' })
  isDefault!: boolean;
  @ApiProperty({ type: [String], description: 'Admin hints, e.g. licence/usage policy notes.' })
  warnings!: string[];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) updatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) updatedById!: string | null;
}

export class AppConfigBrandingDto {
  @ApiProperty() appName!: string;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ example: '#0A5CFF' }) primaryColor!: string;
  @ApiProperty({ example: '#00C2E0' }) accentColor!: string;
}

export class AppConfigMarketDto {
  @ApiProperty({ example: 'EG' }) code!: string;
  @ApiProperty({ example: 'مصر' }) nameAr!: string;
  @ApiProperty({ example: 'Egypt' }) nameEn!: string;
  @ApiProperty({ example: 'EGP' }) currency!: string;
  @ApiProperty({ example: 'Africa/Cairo' }) timezone!: string;
  @ApiProperty() enabled!: boolean;
}

export class AppConfigHomeSectionDto {
  @ApiProperty({ enum: HOME_SECTION_KEYS }) key!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() order!: number;
}

export class AppConfigMapDto {
  @ApiProperty({ nullable: true, type: String }) tileUrlTemplate!: string | null;
  @ApiProperty({ nullable: true, type: String }) attribution!: string | null;
  @ApiProperty() maxZoom!: number;
  @ApiProperty({ description: 'false → the app must not show a map (no tiles or no attribution).' })
  configured!: boolean;
}

export class AppConfigShareDto {
  @ApiProperty({ example: 'https://evcar.news' }) baseUrl!: string;
}

export class AppConfigLegalDto {
  @ApiProperty({ nullable: true, type: String }) privacyUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) termsUrl!: string | null;
}

/** Shape fixed by docs/ARCHITECTURE.md §4.4.1. */
export class AppConfigDto {
  @ApiProperty({ type: AppConfigBrandingDto }) branding!: AppConfigBrandingDto;
  @ApiProperty({ type: [String], example: ['ar', 'en'] }) languages!: string[];
  @ApiProperty({ enum: ['ar', 'en'] }) defaultLanguage!: string;
  @ApiProperty({ example: 'EG' }) defaultMarket!: string;
  @ApiProperty({ type: [AppConfigMarketDto], description: 'Enabled markets only.' })
  markets!: AppConfigMarketDto[];
  @ApiProperty({ type: [AppConfigHomeSectionDto] }) homeSections!: AppConfigHomeSectionDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description:
      'Effective feature flags (tripPlanner/assistant are false while their service is not configured).',
  })
  features!: Record<string, boolean>;
  @ApiProperty({ type: AppConfigMapDto }) map!: AppConfigMapDto;
  @ApiProperty({ type: AppConfigShareDto }) share!: AppConfigShareDto;
  @ApiProperty({ type: AppConfigLegalDto }) legal!: AppConfigLegalDto;
}

export class LogoUploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'PNG, JPEG or WebP, max 1 MB.' })
  file!: unknown;
}
