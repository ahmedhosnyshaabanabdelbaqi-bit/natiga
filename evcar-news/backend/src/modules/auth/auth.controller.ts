import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ok, type DataResponse } from '../../common/http/responses';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { AppConfig } from '../../config/app-config';
import { generateToken } from '../../common/security/tokens';
import {
  clearRefreshCookie,
  clientContextOf,
  isWebClient,
  NoStore,
  refreshTokenOf,
  setDeviceCookie,
  setRefreshCookie,
} from './auth-http';
import type { ClientContext } from './services/auth.service';
import { Public } from './decorators/public.decorator';
import {
  AppleLoginDto,
  EmailDto,
  GoogleLoginDto,
  LoginDto,
  LoginResultDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  RegisterResultDto,
  ResetPasswordDto,
  VerifyEmailDto,
  VerifyEmailResultDto,
} from './dto/auth.dto';
import { AppleIdTokenVerifier, GoogleIdTokenVerifier } from './oauth/oauth-verifiers';
import { AuthService, type LoginResult } from './services/auth.service';
import type { UserView } from './services/user-view.service';
import { extractBearerToken } from './services/token.service';

type LoginBody = Omit<LoginResult, 'refreshToken' | 'refreshTokenExpiresAt'> & {
  refreshToken?: string;
};

const CLIENT_TYPE_DOC = ApiHeader({
  name: 'X-Client-Type',
  required: false,
  description:
    '"web" → the refresh token is set as the httpOnly cookie evcar_rt (Path=/api/v1/auth, SameSite=Strict) and omitted from the body; otherwise it is returned in the body.',
});

/** Contract §4.4.1 authentication endpoints (all public, rate limited). */
@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
    private readonly googleVerifier: GoogleIdTokenVerifier,
    private readonly appleVerifier: AppleIdTokenVerifier,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit('auth')
  @NoStore()
  @ApiOperation({
    summary: 'Create an account and send the verification e-mail',
    description:
      'Never reveals whether the address is already registered: for an existing address the response looks the same (the id is not persisted) and the address owner is e-mailed instead.',
  })
  @ApiExtraModels(RegisterResultDto)
  @ApiCreatedResponse({
    schema: { properties: { data: { $ref: getSchemaPath(RegisterResultDto) } } },
  })
  @ApiErrorResponses(422, 429)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<DataResponse<{ user: UserView }>> {
    const user = await this.auth.register(dto, clientContextOf(req));
    return ok({ user });
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @RateLimit('auth')
  @NoStore()
  @ApiOperation({ summary: 'Verify the e-mail address with the token from the e-mail' })
  @ApiDataResponse(VerifyEmailResultDto)
  @ApiErrorResponses(400, 422, 429)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<DataResponse<{ verified: true }>> {
    await this.auth.verifyEmail(dto.token);
    return ok({ verified: true });
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit('authEmail')
  @NoStore()
  @ApiOperation({ summary: 'Re-send the verification e-mail (always 202)' })
  @ApiAcceptedResponse({ description: 'Accepted (does not reveal whether the address exists).' })
  @ApiErrorResponses(422, 429)
  async resendVerification(@Body() dto: EmailDto, @Req() req: Request): Promise<void> {
    await this.auth.resendVerification(dto.email, clientContextOf(req));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit('auth')
  @NoStore()
  @CLIENT_TYPE_DOC
  @ApiOperation({
    summary: 'Sign in with e-mail and password',
    description:
      '401 INVALID_CREDENTIALS (same for unknown e-mail and wrong password), 403 EMAIL_NOT_VERIFIED / ACCOUNT_DISABLED (only after a correct password), 429 TOO_MANY_ATTEMPTS with Retry-After after repeated failures. Optional header X-Device-Id (mobile installation id, 16-128 chars [A-Za-z0-9_-]); web clients get an httpOnly evcar_dev cookie. A device or IP that signed in before is exempt from the account-wide lock that failures from other clients trigger.',
  })
  @ApiHeader({
    name: 'X-Device-Id',
    required: false,
    description: 'Random per-installation id (mobile). Ignored for X-Client-Type: web.',
  })
  @ApiDataResponse(LoginResultDto)
  @ApiErrorResponses(401, 403, 422, 429)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<LoginBody>> {
    const ctx = this.signInContext(req);
    const result = await this.auth.login(dto, ctx);
    return ok(this.deliver(req, res, result, ctx));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit('write')
  @NoStore()
  @CLIENT_TYPE_DOC
  @ApiOperation({
    summary: 'Rotate the refresh token and get a new access token',
    description:
      'Every refresh returns a NEW refresh token; the old one stops working. The immediately previous token is accepted for AUTH_REFRESH_REUSE_GRACE_SECONDS (default 60 s) after a rotation while its successor is unused, and returns the SAME new token (safe retry after a lost response). Re-using any other rotated token revokes the whole session (401 REFRESH_TOKEN_REUSED). Sessions end JWT_SESSION_MAX_AGE_DAYS after sign-in at the latest.',
  })
  @ApiDataResponse(LoginResultDto)
  @ApiErrorResponses(401, 422, 429)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<LoginBody>> {
    try {
      const result = await this.auth.refresh(refreshTokenOf(req, dto.refreshToken), {
        ...clientContextOf(req),
      });
      return ok(this.deliver(req, res, result));
    } catch (err) {
      if (isWebClient(req)) clearRefreshCookie(res, this.config);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('write')
  @NoStore()
  @CLIENT_TYPE_DOC
  @ApiOperation({
    summary: 'End the current session (refresh token from body/cookie, or the bearer token)',
  })
  @ApiNoContentResponse({ description: 'Always 204 (idempotent).' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(
      refreshTokenOf(req, dto.refreshToken),
      extractBearerToken(req.headers.authorization),
    );
    if (isWebClient(req)) clearRefreshCookie(res, this.config);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit('authEmail')
  @NoStore()
  @CLIENT_TYPE_DOC
  @ApiOperation({
    summary: 'Send a password reset e-mail (always 202, never reveals existence)',
    description:
      'Web clients (X-Client-Type: web) get a link to the admin panel, others an app link (SHARE base URL /reset-password?token=).',
  })
  @ApiAcceptedResponse({ description: 'Accepted.' })
  @ApiErrorResponses(422, 429)
  async forgotPassword(@Body() dto: EmailDto, @Req() req: Request): Promise<void> {
    await this.auth.forgotPassword(dto.email, clientContextOf(req));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('auth')
  @NoStore()
  @ApiOperation({
    summary: 'Set a new password with a reset token or the create-owner setup token',
    description:
      'Signs the account out everywhere. 400 INVALID_OR_EXPIRED_TOKEN; 422 on field "password" when the policy is not met (the token stays valid).',
  })
  @ApiNoContentResponse({ description: 'Password changed.' })
  @ApiErrorResponses(400, 422, 429)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  @RateLimit('auth')
  @NoStore()
  @CLIENT_TYPE_DOC
  @ApiOperation({
    summary: 'Sign in with a Google ID token',
    description: '503 INTEGRATION_NOT_CONFIGURED until GOOGLE_OAUTH_CLIENT_IDS is set.',
  })
  @ApiDataResponse(LoginResultDto)
  @ApiErrorResponses(401, 403, 422, 429, 503)
  async google(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<LoginBody>> {
    const ctx = this.signInContext(req);
    const result = await this.auth.oauthLogin(
      this.googleVerifier,
      dto.idToken,
      ctx,
      dto.deviceName,
    );
    return ok(this.deliver(req, res, result, ctx));
  }

  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  @RateLimit('auth')
  @NoStore()
  @CLIENT_TYPE_DOC
  @ApiOperation({
    summary: 'Sign in with an Apple identity token',
    description: '503 INTEGRATION_NOT_CONFIGURED until APPLE_OAUTH_CLIENT_IDS is set.',
  })
  @ApiDataResponse(LoginResultDto)
  @ApiErrorResponses(401, 403, 422, 429, 503)
  async apple(
    @Body() dto: AppleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<LoginBody>> {
    const ctx = this.signInContext(req);
    const result = await this.auth.oauthLogin(
      this.appleVerifier,
      dto.identityToken,
      ctx,
      dto.deviceName,
    );
    return ok(this.deliver(req, res, result, ctx));
  }

  /**
   * Client context of a sign-in. Web browsers without a device cookie get a
   * fresh device id, stored as a cookie once the sign-in succeeds.
   */
  private signInContext(req: Request): ClientContext {
    const ctx = clientContextOf(req);
    if (ctx.clientType === 'web' && !ctx.deviceId) ctx.deviceId = generateToken(24);
    return ctx;
  }

  /** Web: refresh token → httpOnly cookie, omitted from the body. Mobile: in the body. */
  private deliver(
    req: Request,
    res: Response,
    result: LoginResult,
    ctx?: ClientContext,
  ): LoginBody {
    const { refreshToken, refreshTokenExpiresAt, ...rest } = result;
    if (isWebClient(req)) {
      setRefreshCookie(res, this.config, refreshToken, refreshTokenExpiresAt);
      if (ctx?.deviceId) setDeviceCookie(res, this.config, ctx.deviceId);
      return rest;
    }
    return { ...rest, refreshToken };
  }
}
