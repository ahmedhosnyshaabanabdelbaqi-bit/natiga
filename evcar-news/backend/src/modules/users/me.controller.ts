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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ok, type DataResponse, listOf, type PaginatedResponse } from '../../common/http/responses';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-responses';
import { ApiDataListResponse } from './api-docs';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { NoStore } from '../auth/auth-http';
import type { AuthUser } from '../auth/auth.types';
import { ApiAccessToken } from '../auth/decorators/api-access-token.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserDto } from '../auth/dto/auth.dto';
import type { SessionView } from '../auth/services/session.service';
import type { UserView } from '../auth/services/user-view.service';
import { ChangePasswordDto, DeleteMeDto, SessionDto, UpdateMeDto } from './dto/users.dto';
import { MeService } from './me.service';

/** The signed-in user's account (contract §4.4.1). Requires an access token. */
@ApiTags('me')
@ApiAccessToken()
@ApiErrorResponses(401)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @NoStore()
  @ApiOperation({ summary: 'Current user' })
  @ApiDataResponse(UserDto)
  async get(@CurrentUser() user: AuthUser): Promise<DataResponse<UserView>> {
    return ok(await this.me.get(user));
  }

  @Patch()
  @NoStore()
  @ApiOperation({ summary: 'Update display name and/or locale' })
  @ApiDataResponse(UserDto)
  @ApiErrorResponses(422)
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<DataResponse<UserView>> {
    return ok(await this.me.update(user, dto));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('auth')
  @ApiOperation({
    summary: 'Delete the account and personal data (password required)',
    description:
      'Personal data is deleted; public contributions are kept anonymized. Wrong password → 422 on field "password". The last owner cannot delete their account (409 LAST_OWNER).',
  })
  @ApiNoContentResponse({ description: 'Account deleted.' })
  @ApiErrorResponses(409, 422, 429)
  async delete(@CurrentUser() user: AuthUser, @Body() dto: DeleteMeDto): Promise<void> {
    await this.me.deleteAccount(user, dto.password);
  }

  @Get('sessions')
  @NoStore()
  @ApiOperation({ summary: 'Active sessions (devices) of the current user' })
  @ApiDataListResponse(SessionDto)
  async sessions(@CurrentUser() user: AuthUser): Promise<PaginatedResponse<SessionView>> {
    return listOf(await this.me.listSessions(user));
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out one of the current user’s sessions' })
  @ApiNoContentResponse({ description: 'Session revoked.' })
  @ApiErrorResponses(404)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.me.revokeSession(user, id);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('auth')
  @ApiOperation({
    summary: 'Change the password (signs out all other sessions)',
    description:
      'Wrong current password → 422 on "currentPassword"; policy violation → 422 on "newPassword".',
  })
  @ApiNoContentResponse({ description: 'Password changed.' })
  @ApiErrorResponses(422, 429)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.me.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
