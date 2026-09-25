import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import type { AppConfig } from '../../config/app-config';
import type { OutboundHttp } from '../http/outbound-http';
import { NOT_CONFIGURED_CHECK, timedCheck, type ProviderCheckResult } from '../provider-check';
import { describeProviderError, ProviderActivity, type ProviderStatus } from '../provider-status';
import {
  DEFAULT_PUSH_TTL_SECONDS,
  mapLimit,
  PUSH_CONCURRENCY,
  type PushChannel,
  type PushMessage,
  type PushSendOutcome,
  readSecretMaterial,
} from './push.types';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface FcmErrorBody {
  error?: {
    status?: string;
    message?: string;
    details?: { '@type'?: string; errorCode?: string }[];
  };
}

/** Builds the FCM v1 `message` object for one device token. */
export function buildFcmMessage(token: string, m: PushMessage): Record<string, unknown> {
  const data = { ...(m.data ?? {}), ...(m.deepLink ? { deepLink: m.deepLink } : {}) };
  const ttl = m.ttlSeconds ?? DEFAULT_PUSH_TTL_SECONDS;
  return {
    token,
    notification: { title: m.title, body: m.body },
    ...(Object.keys(data).length > 0 ? { data } : {}),
    android: {
      priority: 'high',
      ttl: `${ttl}s`,
      ...(m.collapseKey ? { collapse_key: m.collapseKey } : {}),
    },
    apns: {
      headers: {
        'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
        ...(m.collapseKey ? { 'apns-collapse-id': m.collapseKey.slice(0, 64) } : {}),
      },
      payload: { aps: { sound: 'default', ...(m.badge !== undefined ? { badge: m.badge } : {}) } },
    },
  };
}

/** Classifies an FCM v1 error response. */
export function classifyFcmError(
  status: number,
  body: FcmErrorBody | undefined,
): { status: PushSendOutcome['status']; retryable: boolean; error: string } {
  const code =
    body?.error?.details?.find((d) => d.errorCode)?.errorCode ??
    body?.error?.status ??
    `HTTP_${status}`;
  if (code === 'UNREGISTERED' || status === 404) {
    return { status: 'invalid_token', retryable: false, error: code };
  }
  if (code === 'INVALID_ARGUMENT' && /token/i.test(body?.error?.message ?? '')) {
    return { status: 'invalid_token', retryable: false, error: code };
  }
  const retryable =
    status === 429 || status >= 500 || code === 'UNAVAILABLE' || code === 'INTERNAL';
  return { status: 'failed', retryable, error: code };
}

/**
 * Firebase Cloud Messaging HTTP v1. Configured when FCM_SERVICE_ACCOUNT_JSON
 * (inline JSON, base64 or file path) holds a service account; the project id
 * comes from FCM_PROJECT_ID or the service account. OAuth2 access tokens
 * are obtained with google-auth-library (scope firebase.messaging).
 */
export class FcmPushChannel implements PushChannel {
  readonly name = 'fcm' as const;
  private readonly logger = new Logger('FcmPush');
  private readonly activity = new ProviderActivity();
  private readonly account: ServiceAccount | null;
  private readonly projectId: string | null;
  private readonly problem: string | null;
  private jwt?: JWT;

  constructor(
    config: AppConfig,
    private readonly http: OutboundHttp,
  ) {
    const push = config.integrations.push;
    const material = readSecretMaterial(push.fcmServiceAccountJson, (p) => readFileSync(p, 'utf8'));
    let account: ServiceAccount | null = null;
    let problem: string | null = null;
    if (!push.fcmServiceAccountJson) {
      problem = 'FCM_SERVICE_ACCOUNT_JSON is not set.';
    } else if (!material) {
      problem = 'FCM_SERVICE_ACCOUNT_JSON could not be read (inline JSON, base64 or file path).';
    } else {
      try {
        const parsed = JSON.parse(material) as Partial<ServiceAccount>;
        if (parsed.client_email && parsed.private_key) account = parsed as ServiceAccount;
        else problem = 'The service account JSON lacks client_email/private_key.';
      } catch {
        problem = 'FCM_SERVICE_ACCOUNT_JSON is not valid JSON.';
      }
    }
    this.account = account;
    this.projectId = push.fcmProjectId || account?.project_id || null;
    if (account && !this.projectId) problem = 'FCM_PROJECT_ID is not set.';
    this.problem = problem;
  }

  get configured(): boolean {
    return this.problem === null && this.account !== null;
  }

  status(): ProviderStatus {
    const base = { type: 'push', name: 'fcm', ...this.activity.snapshot() };
    if (!this.configured)
      return { ...base, configured: false, reason: this.problem ?? 'Not configured.' };
    return { ...base, configured: true, notes: [`Firebase project: ${this.projectId}`] };
  }

  private async accessToken(): Promise<string> {
    if (!this.account) throw new Error('FCM not configured');
    this.jwt ??= new JWT({
      email: this.account.client_email,
      key: this.account.private_key,
      scopes: [FCM_SCOPE],
    });
    const { token } = await this.jwt.getAccessToken();
    if (!token) throw new Error('Could not obtain an FCM access token');
    return token;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushSendOutcome[]> {
    if (!this.configured) {
      return tokens.map((token) => ({
        token,
        provider: 'fcm' as const,
        status: 'not_configured' as const,
        error: this.problem ?? undefined,
      }));
    }
    let bearer: string;
    try {
      bearer = await this.accessToken();
    } catch (err) {
      this.activity.failure(err);
      const error = describeProviderError(err);
      return tokens.map((token) => ({
        token,
        provider: 'fcm' as const,
        status: 'failed' as const,
        retryable: true,
        error,
      }));
    }
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId!)}/messages:send`;
    return mapLimit(tokens, PUSH_CONCURRENCY, async (token): Promise<PushSendOutcome> => {
      try {
        const res = await this.http.fetch(url, {
          method: 'POST',
          // The access token must never follow a redirect.
          followRedirects: false,
          headers: { authorization: `Bearer ${bearer}` },
          body: { message: buildFcmMessage(token, message) },
          timeoutMs: 10_000,
        });
        if (res.status >= 200 && res.status < 300) {
          this.activity.success();
          const name = (() => {
            try {
              return res.json<{ name?: string }>().name;
            } catch {
              return undefined;
            }
          })();
          return { token, provider: 'fcm', status: 'sent', providerMessageId: name };
        }
        let body: FcmErrorBody | undefined;
        try {
          body = res.json<FcmErrorBody>();
        } catch {
          body = undefined;
        }
        const c = classifyFcmError(res.status, body);
        if (c.status === 'failed') this.activity.failure(new Error(c.error));
        return { token, provider: 'fcm', ...c };
      } catch (err) {
        this.activity.failure(err);
        this.logger.warn(`FCM send failed: ${describeProviderError(err)}`);
        return {
          token,
          provider: 'fcm',
          status: 'failed',
          retryable: true,
          error: describeProviderError(err),
        };
      }
    });
  }

  async check(): Promise<ProviderCheckResult> {
    if (!this.configured) return NOT_CONFIGURED_CHECK;
    // Obtaining an OAuth token proves the service account is valid (sends nothing).
    return timedCheck(() => this.accessToken());
  }
}
