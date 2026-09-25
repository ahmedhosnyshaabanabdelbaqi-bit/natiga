import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { jobsEnabledProviders } from '../../jobs/queues';
import type { OAuthConfig } from '../../providers/oauth/oauth-config';
import { OAUTH_CONFIG } from '../../providers/provider-tokens';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AppleIdTokenVerifier, GoogleIdTokenVerifier } from './oauth/oauth-verifiers';
import { AccessAuthService } from './services/access-auth.service';
import { AuthMailService } from './services/auth-mail.service';
import { AuthMaintenanceService } from './services/auth-maintenance.service';
import { AuthService } from './services/auth.service';
import { EmailTokenService } from './services/email-token.service';
import { LoginAttemptsService } from './services/login-attempts.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';
import { UserViewService } from './services/user-view.service';

/**
 * Authentication (contract §4.4 / §4.4.1): register, e-mail verification,
 * login, refresh-token rotation with reuse detection, logout, password
 * reset, Google/Apple sign-in, and the global JwtAuthGuard (every route
 * requires an access token unless marked @Public()).
 */
@Module({
  controllers: [AuthController],
  providers: [
    TokenService,
    PasswordService,
    AccessAuthService,
    SessionService,
    EmailTokenService,
    LoginAttemptsService,
    AuthMailService,
    UserViewService,
    AuthService,
    {
      provide: GoogleIdTokenVerifier,
      inject: [OAUTH_CONFIG],
      useFactory: (oauth: OAuthConfig) => new GoogleIdTokenVerifier(oauth),
    },
    {
      provide: AppleIdTokenVerifier,
      inject: [OAUTH_CONFIG],
      useFactory: (oauth: OAuthConfig) => new AppleIdTokenVerifier(oauth),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    ...jobsEnabledProviders([AuthMaintenanceService]),
  ],
  exports: [
    TokenService,
    PasswordService,
    AccessAuthService,
    SessionService,
    EmailTokenService,
    LoginAttemptsService,
    AuthMailService,
    UserViewService,
    GoogleIdTokenVerifier,
    AppleIdTokenVerifier,
  ],
})
export class AuthModule {}
