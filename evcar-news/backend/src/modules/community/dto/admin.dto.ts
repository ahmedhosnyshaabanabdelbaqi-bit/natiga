import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText } from '../../../common/validation/decorators';
import { CONTENT_REPORT_REASONS } from '../common/labels';
import { MODERATION_STATUSES, REPORT_TARGETS } from './community.dto';
import { IsUuidField, QueryBool, QueryList } from './validators';

export const MODERATION_ACTIONS = ['approve', 'reject', 'hide', 'restore', 'delete'] as const;
export type ModerationActionName = (typeof MODERATION_ACTIONS)[number];
export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'rejected'] as const;
export const VERIFICATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'revoked',
  'expired',
] as const;
export const BLOCK_SCOPES = ['community', 'all'] as const;
export const ADMIN_CONTENT_SORTS = ['newest', 'oldest', 'most_reported'] as const;

export class AdminContentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: MODERATION_STATUSES,
    isArray: true,
    description: 'Default: pending.',
  })
  @QueryList(MODERATION_STATUSES)
  status?: string[];

  @ApiPropertyOptional({ description: 'Also include soft-deleted items.' })
  @QueryBool()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ description: 'Only items with open reports.' })
  @QueryBool()
  reported?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  userId?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Text search.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @Length(2, 100)
  q?: string;

  @ApiPropertyOptional({ enum: ADMIN_CONTENT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(ADMIN_CONTENT_SORTS)
  sort?: (typeof ADMIN_CONTENT_SORTS)[number];
}

export class ModerateDto {
  @ApiProperty({
    enum: MODERATION_ACTIONS,
    description:
      'approve (pending → approved), reject (pending → rejected), hide (→ hidden), restore (hidden / rejected / deleted → approved), delete (soft delete). Open reports on the item are closed: resolved for reject / hide / delete, rejected for approve / restore.',
  })
  @IsIn(MODERATION_ACTIONS)
  action!: ModerationActionName;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The report that led to this action.' })
  @IsOptional()
  @IsUuidField()
  reportId?: string;
}

export class AdminReportListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: REPORT_STATUSES,
    isArray: true,
    description: 'Default: open, in_review.',
  })
  @QueryList(REPORT_STATUSES)
  status?: string[];

  @ApiPropertyOptional({ enum: REPORT_TARGETS, isArray: true })
  @QueryList(REPORT_TARGETS)
  targetType?: string[];

  @ApiPropertyOptional({ enum: CONTENT_REPORT_REASONS, isArray: true })
  @QueryList(CONTENT_REPORT_REASONS)
  reason?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  targetId?: string;
}

export class UpdateContentReportDto {
  @ApiProperty({ enum: REPORT_STATUSES })
  @IsIn(REPORT_STATUSES)
  status!: (typeof REPORT_STATUSES)[number];
}

export class BlockUserDto {
  @ApiPropertyOptional({
    enum: BLOCK_SCOPES,
    default: 'community',
    description:
      'community = no community posting / voting / reporting; all = recorded for every area.',
  })
  @IsOptional()
  @IsIn(BLOCK_SCOPES)
  scope?: (typeof BLOCK_SCOPES)[number];

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @CleanText()
  @IsString()
  @Length(3, 1000)
  reason!: string;

  @ApiPropertyOptional({ description: 'ISO date-time; omitted = until revoked.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Also hide all the user’s published and pending posts.' })
  @IsOptional()
  @QueryBool()
  hideContent?: boolean;
}

export class UnblockUserDto {
  @ApiPropertyOptional({ enum: BLOCK_SCOPES, description: 'Default: every active block.' })
  @IsOptional()
  @IsIn(BLOCK_SCOPES)
  scope?: (typeof BLOCK_SCOPES)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class WarnUserDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @CleanText()
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class AdminBlockListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only blocks in force now (default true).' })
  @QueryBool()
  active?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  userId?: string;
}

export class AdminVerificationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: VERIFICATION_STATUSES,
    isArray: true,
    description: 'Default: pending.',
  })
  @QueryList(VERIFICATION_STATUSES)
  status?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  variantId?: string;
}

export class ApproveVerificationDto {
  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Required for dealer_confirmation / other: how ownership was confirmed.',
  })
  @IsOptional()
  @CleanText()
  @IsString()
  @Length(3, 2000)
  decisionNote?: string;

  @ApiPropertyOptional({ description: 'Optional end of validity (ISO date-time, future).' })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}

export class DecisionNoteDto {
  @ApiProperty({ minLength: 3, maxLength: 2000 })
  @CleanText()
  @IsString()
  @Length(3, 2000)
  decisionNote!: string;
}
