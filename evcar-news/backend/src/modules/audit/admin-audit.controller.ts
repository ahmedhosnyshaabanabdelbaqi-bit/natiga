import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toPageRequest } from '../../common/http/pagination';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../common/http/responses';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { AppException } from '../../common/errors/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_ERROR_MESSAGES, AuthErrorCode } from '../auth/auth.errors';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { P } from '../rbac/rbac.constants';
import { AuditLogDto, ListAuditLogsQueryDto } from './dto/audit-log.dto';

const SELECT = {
  id: true,
  createdAt: true,
  actorId: true,
  actorLabel: true,
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  diff: true,
  ip: true,
  userAgent: true,
  requestId: true,
  actor: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.AuditLogSelect;

type Row = Prisma.AuditLogGetPayload<{ select: typeof SELECT }>;

function toDto(row: Row): AuditLogDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Read-only audit log for administrators (permission audit.read). */
@ApiTags('admin: audit')
@RequirePermissions(P.AUDIT_READ)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Search the audit log (newest first by default)' })
  @ApiPaginatedResponse(AuditLogDto)
  @ApiErrorResponses(422)
  async list(@Query() query: ListAuditLogsQueryDto): Promise<PaginatedResponse<AuditLogDto>> {
    const page = toPageRequest(query);
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.entityId) and.push({ entityId: query.entityId });
    if (query.actorId) and.push({ actorId: query.actorId });
    if (query.action) {
      and.push(
        query.action.endsWith('*')
          ? { action: { startsWith: query.action.slice(0, -1) } }
          : { action: query.action },
      );
    }
    if (query.from || query.to) {
      and.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}),
        },
      });
    }
    if (query.q) {
      const q = query.q;
      and.push({
        OR: [
          { action: { contains: q, mode: 'insensitive' } },
          { entityType: { contains: q, mode: 'insensitive' } },
          { entityId: { contains: q, mode: 'insensitive' } },
          { actorLabel: { contains: q, mode: 'insensitive' } },
          { requestId: q },
        ],
      });
    }
    const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};
    const direction = query.sort === 'createdAt' ? 'asc' : 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: direction }, { id: direction }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(rows.map(toDto), total, page);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One audit log entry' })
  @ApiDataResponse(AuditLogDto)
  @ApiErrorResponses(404)
  async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<DataResponse<AuditLogDto>> {
    const row = await this.prisma.auditLog.findUnique({ where: { id }, select: SELECT });
    if (!row) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: AuthErrorCode.AUDIT_LOG_NOT_FOUND,
        message: AUTH_ERROR_MESSAGES.AUDIT_LOG_NOT_FOUND,
      });
    }
    return ok(toDto(row));
  }
}
