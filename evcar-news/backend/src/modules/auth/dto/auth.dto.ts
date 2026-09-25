import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../services/password.service';

/** Trims strings (non-strings are left for the validators to reject). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Trims + collapses internal whitespace and drops control characters. */
/** Re-exported for existing imports; lives in common/validation. */
export { CleanText };

export const SUPPORTED_LOCALES = ['ar', 'en'] as const;
/** Upper bound accepted by the DTO; the policy (8–128 chars) is checked by PasswordService. */
const PASSWORD_INPUT_MAX = 1024;
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]+$/;

export class RegisterDto {
  @ApiProperty({ example: 'driver@example.com', maxLength: 320 })
  @Trim()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'At least 8 characters; common passwords and passwords containing the email/name are rejected (422 on field "password").',
  })
  @IsString()
  @MaxLength(PASSWORD_INPUT_MAX)
  password!: string;

  @ApiProperty({ example: 'Sara', minLength: 1, maxLength: 100 })
  @CleanText()
  @IsString()
  @Length(1, 100)
  displayName!: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, description: 'Default: request language.' })
  @OptionalNotNull()
  @IsIn(SUPPORTED_LOCALES)
  locale?: 'ar' | 'en';
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token from the verification e-mail link.' })
  @Trim()
  @IsString()
  @Length(20, 200)
  @Matches(OPAQUE_TOKEN, { message: 'token is malformed' })
  token!: string;
}

export class EmailDto {
  @ApiProperty({ example: 'driver@example.com' })
  @Trim()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'driver@example.com' })
  @Trim()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, PASSWORD_INPUT_MAX)
  password!: string;

  @ApiPropertyOptional({ example: 'Pixel 9', maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Mobile clients send the refresh token here. Web clients (X-Client-Type: web) omit it; the httpOnly cookie evcar_rt is used.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}

export class LogoutDto extends RefreshDto {}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset e-mail or the create-owner setup link.' })
  @Trim()
  @IsString()
  @Length(20, 200)
  @Matches(OPAQUE_TOKEN, { message: 'token is malformed' })
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MaxLength(PASSWORD_INPUT_MAX)
  password!: string;
}

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token (JWT) obtained by the client SDK.' })
  @IsString()
  @Length(20, 8192)
  idToken!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}

export class AppleLoginDto {
  @ApiProperty({ description: 'Apple identity token (JWT) obtained by Sign in with Apple.' })
  @IsString()
  @Length(20, 8192)
  identityToken!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}

// ---- response models (OpenAPI) ---------------------------------------------

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale!: string;
  @ApiProperty({ type: [String], example: ['user'] }) roles!: string[];
  @ApiProperty({ type: [String], example: [] }) permissions!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RegisterResultDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
}

export class VerifyEmailResultDto {
  @ApiProperty({ example: true }) verified!: boolean;
}

export class LoginResultDto {
  @ApiProperty({ description: 'JWT access token (Authorization: Bearer).' })
  accessToken!: string;
  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  accessTokenExpiresIn!: number;
  @ApiPropertyOptional({
    description:
      'Rotating refresh token (mobile). Omitted for web clients (X-Client-Type: web), which get the httpOnly cookie evcar_rt instead.',
  })
  refreshToken?: string;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
