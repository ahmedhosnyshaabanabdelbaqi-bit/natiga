import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ok, type DataResponse, listOf, type PaginatedResponse } from '../../common/http/responses';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-responses';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiDataListResponse } from '../users/api-docs';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { PermissionDto, RoleDto, SetRolePermissionsDto } from './dto/roles.dto';
import { P } from './rbac.constants';
import { RolesService } from './roles.service';

/** Roles and the permission matrix (read: roles.read; edit: roles.manage + owner). */
@ApiTags('admin: roles')
@RequirePermissions(P.ROLES_READ)
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Roles with their permissions and user counts' })
  @ApiDataListResponse(RoleDto)
  async list(): Promise<PaginatedResponse<RoleDto>> {
    return listOf(await this.roles.list());
  }

  @Get(':key')
  @ApiOperation({ summary: 'One role' })
  @ApiDataResponse(RoleDto)
  @ApiErrorResponses(404)
  async get(@Param('key') key: string): Promise<DataResponse<RoleDto>> {
    return ok(await this.roles.get(key));
  }

  @Put(':key/permissions')
  @RequirePermissions(P.ROLES_MANAGE)
  @ApiOperation({
    summary: 'Replace the permissions of a role (owners only)',
    description:
      '403 OWNER_ONLY for non-owners; 409 ROLE_NOT_EDITABLE for the owner role; 422 UNKNOWN_PERMISSION.',
  })
  @ApiDataResponse(RoleDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async setPermissions(
    @CurrentUser() actor: AuthUser,
    @Param('key') key: string,
    @Body() dto: SetRolePermissionsDto,
  ): Promise<DataResponse<RoleDto>> {
    return ok(await this.roles.setPermissions(actor, key, dto.permissions));
  }
}

/** Catalogue of permission keys (roles.read). */
@ApiTags('admin: roles')
@RequirePermissions(P.ROLES_READ)
@Controller('admin/permissions')
export class AdminPermissionsController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Every permission key with its group and description' })
  @ApiDataListResponse(PermissionDto)
  async list(): Promise<PaginatedResponse<PermissionDto>> {
    return listOf(await this.roles.permissions());
  }
}
