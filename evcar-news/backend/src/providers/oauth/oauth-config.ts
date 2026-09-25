import type { AppConfig } from '../../config/app-config';
import type { ProviderStatus } from '../provider-status';

export type OAuthProviderName = 'google' | 'apple';

export interface OAuthProviderConfig {
  provider: OAuthProviderName;
  configured: boolean;
  /** Accepted ID-token audiences (client ids / bundle ids / service ids). */
  clientIds: string[];
  /** Accepted `iss` values of ID tokens. */
  issuers: string[];
  /** JWKS used to verify ID-token signatures. */
  jwksUrl: string;
}

/**
 * Google / Apple sign-in configuration (inject OAUTH_CONFIG). The auth
 * module verifies ID tokens against these values and answers
 * 503 INTEGRATION_NOT_CONFIGURED while `configured` is false.
 */
export class OAuthConfig {
  readonly google: OAuthProviderConfig;
  readonly apple: OAuthProviderConfig;

  constructor(config: AppConfig) {
    const google = config.auth.googleClientIds.filter(Boolean);
    const apple = config.auth.appleClientIds.filter(Boolean);
    this.google = {
      provider: 'google',
      configured: google.length > 0,
      clientIds: google,
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    };
    this.apple = {
      provider: 'apple',
      configured: apple.length > 0,
      clientIds: apple,
      issuers: ['https://appleid.apple.com'],
      jwksUrl: 'https://appleid.apple.com/auth/keys',
    };
  }

  get(provider: OAuthProviderName): OAuthProviderConfig {
    return provider === 'google' ? this.google : this.apple;
  }

  statuses(): ProviderStatus[] {
    return [
      this.google.configured
        ? {
            type: 'oauth',
            name: 'google',
            configured: true,
            notes: [`${this.google.clientIds.length} accepted client id(s).`],
          }
        : {
            type: 'oauth',
            name: 'google',
            configured: false,
            reason: 'GOOGLE_OAUTH_CLIENT_IDS is empty: Google sign-in answers 503.',
          },
      this.apple.configured
        ? {
            type: 'oauth',
            name: 'apple',
            configured: true,
            notes: [`${this.apple.clientIds.length} accepted client id(s).`],
          }
        : {
            type: 'oauth',
            name: 'apple',
            configured: false,
            reason: 'APPLE_OAUTH_CLIENT_IDS is empty: Sign in with Apple answers 503.',
          },
    ];
  }
}
