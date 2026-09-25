import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText } from '../../../common/validation/decorators';

/** Free-text filters: trimmed, control characters (e.g. NUL) removed. */
const trim = CleanText;

export const AUDIT_SORTS = ['createdAt', '-createdAt'] as const;

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free text: matches action, entity type/id, actor e-mail label or request id.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ example: 'users' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({
    example: 'auth.login_failed',
    description: 'Exact action, or a prefix ending with "*" (e.g. "auth.*").',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusive lower bound (ISO-8601).' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Exclusive upper bound (ISO-8601).' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ enum: AUDIT_SORTS, default: '-createdAt' })
  @IsOptional()
  @IsIn(AUDIT_SORTS)
  sort?: (typeof AUDIT_SORTS)[number];
}

export class AuditActorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
}

export class AuditLogDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) actorId!: string | null;
  @ApiPropertyOptional({ type: AuditActorDto, nullable: true }) actor!: AuditActorDto | null;
  @ApiProperty({ nullable: true, type: String }) actorLabel!: string | null;
  @ApiProperty({ example: 'users.roles.update' }) action!: string;
  @ApiProperty({ example: 'users' }) entityType!: string;
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'State before (secrets redacted).' })
  before!: unknown;
  @ApiPropertyOptional({ nullable: true, description: 'State after (secrets redacted).' })
  after!: unknown;
  @ApiPropertyOptional({ nullable: true, description: '{ field: { from, to } }' })
  diff!: unknown;
  @ApiProperty({ nullable: true, type: String }) ip!: string | null;
  @ApiProperty({ nullable: true, type: String }) userAgent!: string | null;
  @ApiProperty({ nullable: true, type: String }) requestId!: string | null;
}
