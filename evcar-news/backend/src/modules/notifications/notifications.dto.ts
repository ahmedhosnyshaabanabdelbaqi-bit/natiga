import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { OptionalNotNull } from '../../common/validation/decorators';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true = unread only' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unread?: boolean;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'article.published' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) body!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '/news/some-slug' }) deepLink!:
    string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) data!: Record<string, unknown>;
  @ApiProperty() isRead!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) readAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class TypeSwitchesDto {
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() news?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() priceAlerts?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() reminders?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() community?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() stationAlerts?: boolean;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() campaigns?: boolean;
}

export class ChannelSwitchesDto {
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() push?: boolean;
}

export class QuietHoursDto {
  @ApiProperty({ example: '22:00' }) @Matches(HHMM) start!: string;
  @ApiProperty({ example: '07:00' }) @Matches(HHMM) end!: string;
  @ApiProperty({ example: 'Africa/Cairo', description: 'IANA time zone' })
  @IsString()
  @MaxLength(64)
  timezone!: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ type: TypeSwitchesDto })
  @OptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => TypeSwitchesDto)
  types?: TypeSwitchesDto;

  @ApiPropertyOptional({ type: ChannelSwitchesDto })
  @OptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => ChannelSwitchesDto)
  channels?: ChannelSwitchesDto;

  @ApiPropertyOptional({
    type: QuietHoursDto,
    nullable: true,
    description: 'null removes quiet hours',
  })
  @IsOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;

  @ApiPropertyOptional({
    description: 'true = stop all notifications (except account); false = resume',
  })
  @OptionalNotNull()
  @IsBoolean()
  unsubscribeAll?: boolean;
}

export const TOPIC_TYPES = [
  'brand',
  'model',
  'variant',
  'category',
  'market',
  'station',
  'price_alert',
] as const;

export class CreateSubscriptionDto {
  @ApiProperty({ enum: TOPIC_TYPES }) @IsIn(TOPIC_TYPES) topicType!: (typeof TOPIC_TYPES)[number];
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() modelId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() variantId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() stationId?: string;
  @ApiPropertyOptional({
    example: 'EG',
    description: 'Narrow to one market (required for market and price_alert).',
  })
  @IsOptional()
  @Matches(/^[A-Za-z]{2,8}$/)
  marketCode?: string;
}

export class SubscriptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TOPIC_TYPES }) topicType!: string;
  @ApiProperty({ type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } })
  target!: { id: string; name: string };
  @ApiProperty({ nullable: true, type: String }) marketCode!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token or APNs device token' })
  @IsString()
  @MinLength(16)
  @MaxLength(1024)
  @Matches(/^[\x21-\x7e]+$/)
  token!: string;

  @ApiProperty({ enum: ['android', 'ios', 'web'] }) @IsIn(['android', 'ios', 'web']) platform!:
    'android' | 'ios' | 'web';
  @ApiPropertyOptional({ enum: ['fcm', 'apns'], default: 'fcm' })
  @IsOptional()
  @IsIn(['fcm', 'apns'])
  provider?: 'fcm' | 'apns';
  @ApiPropertyOptional({
    description: 'The app X-Device-Id (replaces the old token of this installation)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  installationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) appVersion?: string;
  @ApiPropertyOptional({ enum: ['ar', 'en'] }) @IsOptional() @IsIn(['ar', 'en']) locale?: string;
}

export class UnregisterDeviceDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(1024) token!: string;
}

export class DeviceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Last 6 characters only' }) tokenHint!: string;
  @ApiProperty() platform!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ nullable: true, type: String }) appVersion!: string | null;
  @ApiProperty({ nullable: true, type: String }) installationId!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PreferencesDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } }) types!: Record<
    string,
    boolean
  >;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } }) channels!: Record<
    string,
    boolean
  >;
  @ApiProperty({ type: QuietHoursDto, nullable: true }) quietHours!: QuietHoursDto | null;
  @ApiProperty() unsubscribedAll!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) unsubscribedAt!:
    string | null;
  @ApiProperty({
    type: 'object',
    properties: {
      configured: { type: 'boolean' },
      registeredDevices: { type: 'number' },
      status: {
        type: 'string',
        enum: ['active', 'disabled_by_user', 'no_device', 'not_configured'],
      },
    },
  })
  push!: { configured: boolean; registeredDevices: number; status: string };
}
