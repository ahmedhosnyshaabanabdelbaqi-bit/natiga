import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
  listOf,
} from '../../common/http/responses';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionView } from '../auth/services/session.service';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { P } from '../rbac/rbac.constants';
import { AdminUsersService } from './admin-users.service';
import { ApiDataListResponse } from './api-docs';
import {
  AdminUserDetailDto,
  AdminUserListItemDto,
  ListUsersQueryDto,
  SessionDto,
  SetRolesDto,
  SetStatusDto,
} from './dto/users.dto';

const uuid = () => new ParseUUIDPipe();

/**
 * Account administration. Reading needs users.read; role changes and
 * session revocation users.manage (owner/admin roles additionally
 * users.manage_admins / owner); suspension users.block (staff accounts
 * additionally users.manage).
 */
@ApiTags('admin: users')
@RequirePermissions(P.USERS_READ)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List / search users' })
  @ApiPaginatedResponse(AdminUserListItemDto)
  @ApiErrorResponses(422)
  async list(@Query() query: ListUsersQueryDto): Promise<PaginatedResponse<AdminUserListItemDto>> {
    const { items, total, page } = await this.users.list(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User details (roles, permissions, sessions count, lockout state)' })
  @ApiDataResponse(AdminUserDetailDto)
  @ApiErrorResponses(404)
  async get(@Param('id', uuid()) id: string): Promise<DataResponse<AdminUserDetailDto>> {
    return ok(await this.users.get(id));
  }

  @Put(':id/roles')
  @RequirePermissions(P.USERS_MANAGE)
  @ApiOperation({
    summary: 'Replace the role set of a user',
    description:
      'owner can only be granted/removed by an owner; admin needs users.manage_admins. The last active owner keeps the role (409 LAST_OWNER).',
  })
  @ApiDataResponse(AdminUserDetailDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async setRoles(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
    @Body() dto: SetRolesDto,
  ): Promise<DataResponse<AdminUserDetailDto>> {
    return ok(await this.users.setRoles(actor, id, dto.roles));
  }

  @Post(':id/roles/:role')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.USERS_MANAGE)
  @ApiOperation({ summary: 'Grant one role' })
  @ApiDataResponse(AdminUserDetailDto)
  @ApiErrorResponses(403, 404, 422)
  async addRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
    @Param('role') role: string,
  ): Promise<DataResponse<AdminUserDetailDto>> {
    return ok(await this.users.addRole(actor, id, role));
  }

  @Delete(':id/roles/:role')
  @RequirePermissions(P.USERS_MANAGE)
  @ApiOperation({ summary: 'Remove one role' })
  @ApiDataResponse(AdminUserDetailDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async removeRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
    @Param('role') role: string,
  ): Promise<DataResponse<AdminUserDetailDto>> {
    return ok(await this.users.removeRole(actor, id, role));
  }

  @Patch(':id/status')
  @RequirePermissions(P.USERS_BLOCK)
  @ApiOperation({
    summary: 'Suspend (disable) or re-activate an account',
    description:
      'Suspending signs the user out everywhere. users.block alone only covers plain accounts (role "user" only); staff accounts also need users.manage, admins users.manage_admins and owners the owner role (403). You cannot suspend yourself (409 CANNOT_TARGET_SELF) or the last owner (409 LAST_OWNER).',
  })
  @ApiDataResponse(AdminUserDetailDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
    @Body() dto: SetStatusDto,
  ): Promise<DataResponse<AdminUserDetailDto>> {
    return ok(await this.users.setStatus(actor, id, dto.status, dto.reason));
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: 'Active sessions of a user',
    description:
      "Sessions of an owner can only be listed by an owner, an admin's by holders of users.manage_admins (403).",
  })
  @ApiDataListResponse(SessionDto)
  @ApiErrorResponses(403, 404)
  async sessions(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
  ): Promise<PaginatedResponse<SessionView>> {
    return listOf(await this.users.listSessions(actor, id));
  }

  @Delete(':id/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(P.USERS_MANAGE)
  @ApiOperation({ summary: 'Revoke one session of a user' })
  @ApiNoContentResponse({ description: 'Revoked.' })
  @ApiErrorResponses(403, 404)
  async revokeSession(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
    @Param('sessionId', uuid()) sessionId: string,
  ): Promise<void> {
    await this.users.revokeSession(actor, id, sessionId);
  }

  @Delete(':id/sessions')
  @RequirePermissions(P.USERS_MANAGE)
  @ApiOperation({ summary: 'Revoke every session of a user (sign out everywhere)' })
  @ApiOkResponse({ schema: { example: { data: { revoked: 2 } } } })
  @ApiErrorResponses(403, 404)
  async revokeAll(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid()) id: string,
  ): Promise<DataResponse<{ revoked: number }>> {
    return ok({ revoked: await this.users.revokeAllSessions(actor, id) });
  }
}
