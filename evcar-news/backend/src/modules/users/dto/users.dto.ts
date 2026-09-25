import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { SUPPORTED_LOCALES } from '../../auth/dto/auth.dto';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

// ---- /me ------------------------------------------------------------------

export class UpdateMeDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @OptionalNotNull()
  @IsIn(SUPPORTED_LOCALES)
  locale?: 'ar' | 'en';
}

export class DeleteMeDto {
  @ApiProperty({ description: 'Current password (re-authentication).' })
  @IsString()
  @Length(1, 1024)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @Length(1, 1024)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MaxLength(1024)
  newPassword!: string;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['web', 'mobile', 'cli'] }) clientType!: string;
  @ApiProperty({ nullable: true, type: String }) deviceName!: string | null;
  @ApiProperty({ nullable: true, type: String }) userAgent!: string | null;
  @ApiProperty({ nullable: true, type: String }) ip!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastUsedAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ description: 'True for the session of the calling access token.' })
  current!: boolean;
}

// ---- /admin/users -----------------------------------------------------------

export const USER_SORTS = [
  'createdAt',
  '-createdAt',
  'email',
  '-email',
  'displayName',
  '-displayName',
  'lastLoginAt',
  '-lastLoginAt',
] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const USER_STATUSES = ['active', 'suspended'] as const;
const ROLE_KEY = /^[a-z][a-z0-9_]{1,63}$/;

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in e-mail and display name.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ example: 'editor' })
  @IsOptional()
  @trim()
  @Matches(ROLE_KEY, { message: 'role must be a role key' })
  role?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];

  @ApiPropertyOptional({ enum: USER_SORTS, default: '-createdAt' })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort?: UserSort;
}

export class SetRolesDto {
  @ApiProperty({
    type: [String],
    example: ['editor'],
    description: 'Complete role set; "user" is always kept.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(ROLE_KEY, { each: true, message: 'each role must be a role key' })
  roles!: string[];
}

export class SetStatusDto {
  @ApiProperty({ enum: USER_STATUSES })
  @IsIn(USER_STATUSES)
  status!: (typeof USER_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminUserListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() locale!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ enum: USER_STATUSES }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) lastLoginAt!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class AdminUserDetailDto extends AdminUserListItemDto {
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty({ type: [String], example: ['google'] }) oauthProviders!: string[];
  @ApiProperty() activeSessions!: number;
  @ApiProperty() failedLoginCount!: number;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) lockedUntil!: string | null;
}
