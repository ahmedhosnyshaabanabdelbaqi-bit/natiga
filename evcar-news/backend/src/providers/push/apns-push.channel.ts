import { readFileSync } from 'node:fs';
import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { Logger } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import type { AppConfig } from '../../config/app-config';
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

const TOKEN_TTL_MS = 50 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEVICE_TOKEN_RE = /^[0-9a-fA-F]{32,200}$/;

export function buildApnsPayload(m: PushMessage): Record<string, unknown> {
  return {
    aps: {
      alert: { title: m.title, body: m.body },
      sound: 'default',
      ...(m.badge !== undefined ? { badge: m.badge } : {}),
    },
    ...(m.data ?? {}),
    ...(m.deepLink ? { deepLink: m.deepLink } : {}),
  };
}

/** Maps an APNs response to an outcome (410 / BadDeviceToken / Unregistered = dead token). */
export function classifyApnsResponse(
  status: number,
  reason: string | undefined,
): Pick<PushSendOutcome, 'status' | 'retryable' | 'error'> {
  if (status === 200) return { status: 'sent' };
  if (
    status === 410 ||
    reason === 'BadDeviceToken' ||
    reason === 'Unregistered' ||
    reason === 'DeviceTokenNotForTopic'
  ) {
    return { status: 'invalid_token', retryable: false, error: reason ?? `HTTP_${status}` };
  }
  return {
    status: 'failed',
    retryable: status === 429 || status >= 500,
    error: reason ?? `HTTP_${status}`,
  };
}

/**
 * Apple Push Notification service over HTTP/2 with token-based auth (.p8
 * key, ES256 JWT refreshed every 50 min). Configured when APNS_KEY_ID,
 * APNS_TEAM_ID, APNS_BUNDLE_ID and APNS_PRIVATE_KEY are set. Used for
 * device tokens registered with provider "apns" (FCM tokens on iOS go
 * through the FCM channel).
 */
export class ApnsPushChannel implements PushChannel {
  readonly name = 'apns' as const;
  private readonly logger = new Logger('ApnsPush');
  private readonly activity = new ProviderActivity();
  private readonly keyPem: string | null;
  private readonly problem: string | null;
  private bearer?: { token: string; at: number };
  private session?: ClientHttp2Session;

  constructor(private readonly config: AppConfig) {
    const p = config.integrations.push;
    const missing = [
      !p.apnsKeyId && 'APNS_KEY_ID',
      !p.apnsTeamId && 'APNS_TEAM_ID',
      !p.apnsBundleId && 'APNS_BUNDLE_ID',
      !p.apnsPrivateKey && 'APNS_PRIVATE_KEY',
    ].filter(Boolean) as string[];
    this.keyPem = p.apnsPrivateKey
      ? readSecretMaterial(p.apnsPrivateKey, (path) => readFileSync(path, 'utf8'))
      : null;
    if (missing.length > 0) this.problem = `Missing ${missing.join(', ')}.`;
    else if (!this.keyPem?.includes('PRIVATE KEY')) {
      this.problem = 'APNS_PRIVATE_KEY is not a PEM .p8 key (inline, base64 or file path).';
    } else this.problem = null;
  }

  get configured(): boolean {
    return this.problem === null;
  }

  private get host(): string {
    return this.config.integrations.push.apnsProduction
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
  }

  status(): ProviderStatus {
    const base = { type: 'push', name: 'apns', ...this.activity.snapshot() };
    if (!this.configured)
      return { ...base, configured: false, reason: this.problem ?? 'Not configured.' };
    return {
      ...base,
      configured: true,
      notes: [
        `${this.config.integrations.push.apnsProduction ? 'Production' : 'Sandbox'} APNs, topic ${this.config.integrations.push.apnsBundleId}.`,
      ],
    };
  }

  private async providerToken(): Promise<string> {
    if (this.bearer && Date.now() - this.bearer.at < TOKEN_TTL_MS) return this.bearer.token;
    const p = this.config.integrations.push;
    const key = await importPKCS8(this.keyPem!, 'ES256');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: p.apnsKeyId })
      .setIssuer(p.apnsTeamId)
      .setIssuedAt()
      .sign(key);
    this.bearer = { token, at: Date.now() };
    return token;
  }

  private connection(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = connect(this.host);
    session.on('error', (err: Error) => this.logger.warn(`APNs connection error: ${err.message}`));
    session.on('goaway', () => session.close());
    session.setTimeout(60_000, () => session.close());
    session.unref();
    this.session = session;
    return session;
  }

  private post(
    token: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number; reason?: string; apnsId?: string }> {
    return new Promise((resolve, reject) => {
      const req = this.connection().request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        'content-type': 'application/json',
        ...headers,
      });
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.close(constants.NGHTTP2_CANCEL));
      let status = 0;
      let apnsId: string | undefined;
      const chunks: Buffer[] = [];
      req.on('response', (h) => {
        status = Number(h[constants.HTTP2_HEADER_STATUS]);
        apnsId = typeof h['apns-id'] === 'string' ? h['apns-id'] : undefined;
      });
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        let reason: string | undefined;
        if (chunks.length > 0) {
          try {
            reason = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { reason?: string })
              .reason;
          } catch {
            reason = undefined;
          }
        }
        if (status === 0) reject(new Error('APNs request was cancelled or timed out'));
        else resolve({ status, reason, apnsId });
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  async send(tokens: string[], message: PushMessage): Promise<PushSendOutcome[]> {
    if (!this.configured) {
      return tokens.map((token) => ({
        token,
        provider: 'apns' as const,
        status: 'not_configured' as const,
        error: this.problem ?? undefined,
      }));
    }
    let jwt: string;
    try {
      jwt = await this.providerToken();
    } catch (err) {
      this.activity.failure(err);
      const error = describeProviderError(err);
      return tokens.map((token) => ({
        token,
        provider: 'apns' as const,
        status: 'failed' as const,
        retryable: false,
        error,
      }));
    }
    const p = this.config.integrations.push;
    const body = JSON.stringify(buildApnsPayload(message));
    const ttl = message.ttlSeconds ?? DEFAULT_PUSH_TTL_SECONDS;
    return mapLimit(tokens, PUSH_CONCURRENCY, async (token): Promise<PushSendOutcome> => {
      if (!DEVICE_TOKEN_RE.test(token)) {
        return {
          token,
          provider: 'apns',
          status: 'invalid_token',
          retryable: false,
          error: 'BadDeviceToken',
        };
      }
      try {
        const res = await this.post(
          token,
          {
            authorization: `bearer ${jwt}`,
            'apns-topic': p.apnsBundleId,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
            ...(message.collapseKey
              ? { 'apns-collapse-id': message.collapseKey.slice(0, 64) }
              : {}),
          },
          body,
        );
        const outcome = classifyApnsResponse(res.status, res.reason);
        if (outcome.status === 'sent') this.activity.success();
        else if (outcome.status === 'failed') this.activity.failure(new Error(outcome.error));
        return { token, provider: 'apns', ...outcome, providerMessageId: res.apnsId };
      } catch (err) {
        this.activity.failure(err);
        return {
          token,
          provider: 'apns',
          status: 'failed',
          retryable: true,
          error: describeProviderError(err),
        };
      }
    });
  }

  async check(): Promise<ProviderCheckResult> {
    if (!this.configured) return NOT_CONFIGURED_CHECK;
    // Signing the provider token validates the key material (sends nothing).
    return timedCheck(() => this.providerToken());
  }

  close(): void {
    this.session?.close();
  }
}
