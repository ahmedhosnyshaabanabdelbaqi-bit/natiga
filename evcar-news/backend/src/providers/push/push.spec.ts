import { generateKeyPairSync } from 'node:crypto';
import { AppConfig } from '../../config/app-config';
import type { OutboundHttp } from '../http/outbound-http';
import { ApnsPushChannel, buildApnsPayload, classifyApnsResponse } from './apns-push.channel';
import { buildFcmMessage, classifyFcmError, FcmPushChannel } from './fcm-push.channel';
import { PushGateway } from './push.gateway';
import { mapLimit, readSecretMaterial } from './push.types';

const DB = 'postgresql://evcar:x@localhost:5432/unit';
const cfg = (env: Record<string, string> = {}) =>
  AppConfig.fromEnv({ NODE_ENV: 'test', DATABASE_URL: DB, ...env });
const http = { fetch: jest.fn() } as unknown as OutboundHttp;

describe('push providers', () => {
  it('report not configured and never claim delivery without credentials', async () => {
    const gateway = new PushGateway(new FcmPushChannel(cfg(), http), new ApnsPushChannel(cfg()));
    expect(gateway.anyConfigured).toBe(false);
    const statuses = gateway.statuses();
    expect(statuses.map((s) => [s.name, s.configured])).toEqual([
      ['fcm', false],
      ['apns', false],
      ['in_app', true],
    ]);
    const outcomes = await gateway.send(
      [
        { token: 'fcm-token', provider: 'fcm' },
        { token: 'a'.repeat(64), provider: 'apns' },
      ],
      { title: 't', body: 'b' },
    );
    expect(outcomes.map((o) => o.status)).toEqual(['not_configured', 'not_configured']);
    expect(http.fetch).not.toHaveBeenCalled();
  });

  it('explains unreadable FCM credentials', () => {
    const fcm = new FcmPushChannel(cfg({ FCM_SERVICE_ACCOUNT_JSON: '{not json' }), http);
    expect(fcm.status()).toMatchObject({
      configured: false,
      reason: expect.stringMatching(/not valid JSON/) as string,
    });
    const noProject = new FcmPushChannel(
      cfg({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'a@b', private_key: 'k' }) }),
      http,
    );
    expect(noProject.status().reason).toMatch(/FCM_PROJECT_ID/);
    const ok = new FcmPushChannel(
      cfg({
        FCM_SERVICE_ACCOUNT_JSON: Buffer.from(
          JSON.stringify({ client_email: 'a@b', private_key: 'k', project_id: 'demo-proj' }),
        ).toString('base64'),
      }),
      http,
    );
    expect(ok.status()).toMatchObject({ configured: true });
    expect(JSON.stringify(ok.status())).not.toContain('private_key');
  });

  it('configures APNs from a .p8 key and signs a provider token', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const apns = new ApnsPushChannel(
      cfg({ APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM123', APNS_PRIVATE_KEY: pem }),
    );
    expect(apns.status()).toMatchObject({ configured: true });
    await expect(apns.check()).resolves.toMatchObject({ ok: true });
    const outcome = await apns.send(['not-hex'], { title: 't', body: 'b' });
    expect(outcome[0]).toMatchObject({ status: 'invalid_token' });
    apns.close();
    expect(
      new ApnsPushChannel(
        cfg({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: 'nope' }),
      ).status().reason,
    ).toMatch(/PEM/);
  });

  it('builds FCM v1 and APNs payloads', () => {
    const m = buildFcmMessage('tok', {
      title: 'T',
      body: 'B',
      data: { type: 'article' },
      deepLink: '/news/x',
      collapseKey: 'article-1',
      ttlSeconds: 60,
      badge: 2,
    });
    expect(m).toMatchObject({
      token: 'tok',
      notification: { title: 'T', body: 'B' },
      data: { type: 'article', deepLink: '/news/x' },
      android: { ttl: '60s', collapse_key: 'article-1' },
      apns: { payload: { aps: { badge: 2 } } },
    });
    expect(buildApnsPayload({ title: 'T', body: 'B', deepLink: '/x' })).toEqual({
      aps: { alert: { title: 'T', body: 'B' }, sound: 'default' },
      deepLink: '/x',
    });
  });

  it('classifies provider errors (dead tokens vs retryable)', () => {
    expect(
      classifyFcmError(404, {
        error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] },
      }).status,
    ).toBe('invalid_token');
    expect(
      classifyFcmError(400, {
        error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not valid' },
      }).status,
    ).toBe('invalid_token');
    expect(classifyFcmError(503, undefined)).toMatchObject({ status: 'failed', retryable: true });
    expect(classifyFcmError(403, { error: { status: 'PERMISSION_DENIED' } })).toMatchObject({
      status: 'failed',
      retryable: false,
    });
    expect(classifyApnsResponse(200, undefined).status).toBe('sent');
    expect(classifyApnsResponse(410, 'Unregistered').status).toBe('invalid_token');
    expect(classifyApnsResponse(400, 'BadDeviceToken').status).toBe('invalid_token');
    expect(classifyApnsResponse(429, 'TooManyRequests')).toMatchObject({
      status: 'failed',
      retryable: true,
    });
  });

  it('reads secrets inline, base64 or from files', () => {
    expect(readSecretMaterial('{"a":1}', () => '')).toBe('{"a":1}');
    expect(readSecretMaterial(Buffer.from('{"b":2}').toString('base64'), () => '')).toBe('{"b":2}');
    expect(readSecretMaterial('/secrets/key.p8', (p) => `file:${p}`)).toBe('file:/secrets/key.p8');
    expect(readSecretMaterial('garbage', () => '')).toBeNull();
  });

  it('maps with bounded concurrency preserving order', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
