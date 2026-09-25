import { AppConfig } from '../config/app-config';
import { SafeFetchService } from '../common/security/safe-fetch.service';
import type { PrismaService } from '../prisma/prisma.service';
import { NoneAvailabilityProvider } from './availability/none-availability.provider';
import { effectiveAvailability } from './availability/availability.types';
import { OutboundHttp } from './http/outbound-http';
import { ConsoleMailSender } from './mail/console-mail.sender';
import { SmtpMailSender } from './mail/smtp-mail.sender';
import { RssNewsFetcher } from './news/rss-news.fetcher';
import { OAuthConfig } from './oauth/oauth-config';
import { ProviderRegistry } from './provider-registry';
import { describeProviderError } from './provider-status';
import {
  createAssistantProvider,
  createGeocodingProvider,
  createMailSender,
  createRoutingProvider,
  createStorageProvider,
} from './providers.module';
import { ApnsPushChannel } from './push/apns-push.channel';
import { FcmPushChannel } from './push/fcm-push.channel';
import { PushGateway } from './push/push.gateway';
import { ManualStationSource } from './stations/manual-station.source';
import { OcmStationSource } from './stations/ocm/ocm-station.source';
import {
  connectorTypeIndexLoader,
  StationSourceRegistry,
} from './stations/station-source.registry';

const DB = 'postgresql://evcar:x@localhost:5432/unit';

function registry(env: Record<string, string> = {}) {
  const config = AppConfig.fromEnv({ NODE_ENV: 'test', DATABASE_URL: DB, ...env });
  const safe = new SafeFetchService(config);
  const http = new OutboundHttp(safe, config);
  const prisma = { connectorType: { findMany: () => Promise.reject(new Error('no db')) } };
  const reg = new ProviderRegistry(
    createStorageProvider(config),
    createMailSender(config),
    new StationSourceRegistry([
      new OcmStationSource(
        config,
        http,
        connectorTypeIndexLoader(prisma as unknown as PrismaService),
      ),
      new ManualStationSource(),
    ]),
    new NoneAvailabilityProvider(),
    createRoutingProvider(config, http),
    createGeocodingProvider(config, http),
    new RssNewsFetcher(http),
    new PushGateway(new FcmPushChannel(config, http), new ApnsPushChannel(config)),
    new OAuthConfig(config),
    createAssistantProvider(config),
  );
  return { reg, safe };
}

describe('ProviderRegistry', () => {
  it('lists every provider type with honest defaults', async () => {
    const { reg, safe } = registry();
    const statuses = await reg.statuses();
    const byId = Object.fromEntries(statuses.map((s) => [s.id, s]));
    expect(Object.keys(byId).sort()).toEqual(
      [
        'assistant.none',
        'availability.none',
        'geocoding.none',
        'mail.console',
        'news.rss',
        'oauth.apple',
        'oauth.google',
        'push.apns',
        'push.fcm',
        'push.in_app',
        'routing.none',
        'stations.manual',
        'stations.open_charge_map',
        'storage.local',
      ].sort(),
    );
    for (const id of [
      'assistant.none',
      'availability.none',
      'geocoding.none',
      'oauth.apple',
      'oauth.google',
      'push.apns',
      'push.fcm',
      'routing.none',
      'stations.open_charge_map',
    ]) {
      expect(byId[id]).toMatchObject({ configured: false, enabled: false, checkable: false });
      expect(byId[id].reason).toEqual(expect.any(String));
    }
    for (const id of [
      'storage.local',
      'mail.console',
      'news.rss',
      'push.in_app',
      'stations.manual',
    ]) {
      expect(byId[id].configured).toBe(true);
    }
    expect(reg.capabilities()).toEqual({
      routing: false,
      geocoding: false,
      assistant: false,
      push: false,
      liveAvailability: false,
      stationsSync: false,
    });
    await expect(reg.check('routing.none')).resolves.toMatchObject({ ok: false, skipped: true });
    await expect(reg.check('nope.nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await safe.onApplicationShutdown();
  });

  it('never leaks secrets in statuses', async () => {
    const { reg, safe } = registry({
      OCM_API_KEY: 'super-secret-ocm-key',
      ORS_API_KEY: 'super-secret-ors-key',
      ROUTING_PROVIDER: 'openrouteservice',
      SMTP_PASSWORD: 'super-secret-smtp',
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.example.invalid',
      S3_SECRET_ACCESS_KEY: 'super-secret-s3',
      ASSISTANT_PROVIDER: 'anthropic',
      ASSISTANT_API_KEY: 'super-secret-llm',
    });
    const text = JSON.stringify(await reg.statuses());
    expect(text).not.toMatch(/super-secret/);
    const byId = Object.fromEntries((await reg.statuses()).map((s) => [s.id, s]));
    expect(byId['stations.open_charge_map'].configured).toBe(true);
    expect(byId['routing.openrouteservice'].configured).toBe(true);
    expect(byId['mail.smtp'].configured).toBe(true);
    expect(byId['assistant.anthropic']).toMatchObject({
      configured: false,
      reason: expect.stringContaining('not implemented') as string,
    });
    expect(reg.capabilities()).toMatchObject({
      routing: true,
      stationsSync: true,
      assistant: false,
    });
    await safe.onApplicationShutdown();
  });

  it('masks key-like query parameters in error descriptions', () => {
    expect(describeProviderError(new Error('GET https://x/y?key=abc&token=def failed'))).toBe(
      'GET https://x/y?key=*** &token=*** failed'.replace(' &', '&'),
    );
  });
});

describe('mail drivers', () => {
  const cfg = (env: Record<string, string>) => AppConfig.fromEnv({ DATABASE_URL: DB, ...env });

  it('console driver logs, captures (dev/test) and never claims delivery', async () => {
    const mail = new ConsoleMailSender(cfg({ NODE_ENV: 'test' }));
    const res = await mail.send({
      to: 'a@example.invalid',
      subject: 'S',
      text: 'link: https://x/t=1',
    });
    expect(res).toMatchObject({ driver: 'console', delivered: false });
    expect(mail.outbox()).toHaveLength(1);
    expect(mail.status()).toMatchObject({ configured: true });
  });

  it('console driver in production keeps no bodies and reports not configured', async () => {
    // Env validation already forbids MAIL_DRIVER=console in production; the driver is defensive anyway.
    const mail = new ConsoleMailSender({ isProduction: true } as AppConfig);
    await mail.send({ to: 'a@example.invalid', subject: 'S', text: 'secret token' });
    expect(mail.outbox()).toHaveLength(0);
    expect(mail.status()).toMatchObject({ configured: false });
  });

  it('smtp driver without host answers 503', async () => {
    // Env validation requires SMTP_HOST with MAIL_DRIVER=smtp; the driver is defensive anyway.
    const stub = {
      isProduction: false,
      mail: { from: 'x', smtp: { host: '' } },
    } as unknown as AppConfig;
    const mail = new SmtpMailSender(stub);
    expect(mail.status()).toMatchObject({ configured: false, reason: 'SMTP_HOST is not set.' });
    await expect(mail.send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toMatchObject({
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
    await expect(mail.check()).resolves.toMatchObject({ skipped: true });
  });
});

describe('availability', () => {
  it('none provider answers unknown for everything', async () => {
    const readings = await new NoneAvailabilityProvider().getAvailability([{ stationId: 's1' }]);
    expect(readings).toEqual([
      {
        target: { stationId: 's1' },
        status: 'unknown',
        observedAt: null,
        expiresAt: null,
        source: null,
      },
    ]);
  });

  it('expired or missing observations are unknown, never available', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    expect(effectiveAvailability(null, now).status).toBe('unknown');
    const obs = {
      status: 'available' as const,
      provider: 'partner-x',
      observedAt: new Date('2026-09-25T11:55:00Z'),
      expiresAt: new Date('2026-09-25T12:05:00Z'),
    };
    expect(effectiveAvailability(obs, now)).toMatchObject({ status: 'available', expired: false });
    expect(
      effectiveAvailability({ ...obs, expiresAt: new Date('2026-09-25T11:59:59Z') }, now),
    ).toMatchObject({ status: 'unknown', expired: true, source: 'partner-x' });
  });
});
