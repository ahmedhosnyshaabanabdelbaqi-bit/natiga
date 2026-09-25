import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AppConfig } from '../../config/app-config';
import { SafeFetchError } from '../../common/security/safe-fetch';
import { SafeFetchService } from '../../common/security/safe-fetch.service';
import { NominatimGeocodingProvider } from '../geocoding/nominatim.provider';
import { RssNewsFetcher } from '../news/rss-news.fetcher';
import { OsrmRoutingProvider } from '../routing/osrm-routing.provider';
import { ConnectorTypeIndex } from '../stations/connector-type-index';
import { OcmStationSource } from '../stations/ocm/ocm-station.source';
import { OutboundHttp } from './outbound-http';

/**
 * The fetchers must route every request through the SSRF guard. These tests
 * use the real SafeFetchService with IP-literal / localhost URLs, so they
 * never touch the network: the guard refuses before connecting.
 */
const DB = 'postgresql://evcar:x@localhost:5432/unit';

function build(env: Record<string, string> = {}) {
  const config = AppConfig.fromEnv({
    NODE_ENV: 'test',
    DATABASE_URL: DB,
    SAFE_FETCH_TIMEOUT_MS: '2000',
    ...env,
  });
  const safe = new SafeFetchService(config);
  return { config, safe, http: new OutboundHttp(safe, config) };
}

const BLOCKED_FEEDS: [string, string][] = [
  ['http://feeds.example.com/rss', 'PROTOCOL_NOT_ALLOWED'],
  ['ftp://feeds.example.com/rss', 'PROTOCOL_NOT_ALLOWED'],
  ['file:///etc/passwd', 'PROTOCOL_NOT_ALLOWED'],
  ['https://127.0.0.1/rss', 'BLOCKED_ADDRESS'],
  ['https://10.0.0.8/rss', 'BLOCKED_ADDRESS'],
  ['https://192.168.1.10/rss', 'BLOCKED_ADDRESS'],
  ['https://169.254.169.254/latest/meta-data/', 'BLOCKED_ADDRESS'],
  ['https://[::1]/rss', 'BLOCKED_ADDRESS'],
  ['https://[::ffff:10.0.0.1]/rss', 'BLOCKED_ADDRESS'],
  ['https://[fd00::1]/rss', 'BLOCKED_ADDRESS'],
  ['https://0.0.0.0/rss', 'BLOCKED_ADDRESS'],
  ['https://localhost/rss', 'HOST_NOT_ALLOWED'],
  ['https://metadata.internal/rss', 'HOST_NOT_ALLOWED'],
  ['https://user:secret@8.8.8.8/rss', 'CREDENTIALS_IN_URL'],
  ['https://8.8.8.8:8443/rss', 'PORT_NOT_ALLOWED'],
  ['not a url', 'INVALID_URL'],
];

describe('SSRF guard usage in provider fetchers', () => {
  const t = build();
  const news = new RssNewsFetcher(t.http);
  afterAll(() => t.safe.onApplicationShutdown());

  describe('RSS / Atom fetcher', () => {
    it.each(BLOCKED_FEEDS)('refuses %s (%s) on fetch', async (url, reason) => {
      await expect(news.fetchFeed(url)).rejects.toMatchObject({
        code: 'FEED_URL_NOT_ALLOWED',
        details: { reason },
      });
    });

    it.each(BLOCKED_FEEDS)('refuses %s (%s) when an admin saves it', async (url, reason) => {
      await expect(news.validateFeedUrl(url)).rejects.toMatchObject({
        code: 'FEED_URL_NOT_ALLOWED',
        details: { reason },
      });
    });
  });

  it('Open Charge Map client refuses a base URL on a private address', async () => {
    const b = build({ OCM_API_KEY: 'k', OCM_BASE_URL: 'https://10.1.2.3/v3' });
    const ocm = new OcmStationSource(b.config, b.http, () =>
      Promise.resolve(ConnectorTypeIndex.default()),
    );
    await expect(ocm.fetchPage({})).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      details: { provider: 'stations.ocm', reason: 'BLOCKED_ADDRESS' },
    });
    await b.safe.onApplicationShutdown();
  });

  it('Open Charge Map client refuses plain http', async () => {
    const b = build({ OCM_API_KEY: 'k', OCM_BASE_URL: 'http://api.openchargemap.io/v3' });
    const ocm = new OcmStationSource(b.config, b.http, () =>
      Promise.resolve(ConnectorTypeIndex.default()),
    );
    await expect(ocm.fetchPage({})).rejects.toMatchObject({
      details: { reason: 'PROTOCOL_NOT_ALLOWED' },
    });
    await b.safe.onApplicationShutdown();
  });

  it('geocoder on an https private address is refused by the guard', async () => {
    const b = build({ GEOCODING_BASE_URL: 'https://127.0.0.1' });
    const geo = new NominatimGeocodingProvider(b.config, b.http);
    await expect(geo.search('Cairo')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      details: { reason: 'BLOCKED_ADDRESS' },
    });
    await b.safe.onApplicationShutdown();
  });

  describe('operator-configured plain-http endpoints (e.g. self-hosted OSRM)', () => {
    let server: Server;
    let base: string;
    const hits: string[] = [];

    beforeAll(async () => {
      server = createServer((req, res) => {
        hits.push(req.url ?? '');
        if (req.url?.startsWith('/redirect')) {
          res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 1234.5,
                duration: 321.1,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [31.2, 30.0],
                    [31.25, 30.06],
                  ],
                },
                legs: [{ distance: 1234.5, duration: 321.1 }],
              },
            ],
          }),
        );
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('works for the exact configured origin', async () => {
      const b = build({ ROUTING_PROVIDER: 'osrm', OSRM_BASE_URL: base });
      const osrm = new OsrmRoutingProvider(b.config, b.http);
      const route = await osrm.route({
        waypoints: [
          { lat: 30.0, lng: 31.2 },
          { lat: 30.06, lng: 31.25 },
        ],
      });
      expect(route).toMatchObject({
        provider: 'osrm',
        distanceMeters: 1234.5,
        durationSeconds: 321.1,
      });
      expect(hits.at(-1)).toMatch(
        /^\/route\/v1\/driving\/31\.200000,30\.000000;31\.250000,30\.060000\?/,
      );
      await b.safe.onApplicationShutdown();
    });

    it('refuses any other origin and never follows redirects', async () => {
      const b = build();
      await expect(
        b.http.fetchOperatorEndpoint(base, 'http://169.254.169.254/latest/meta-data/'),
      ).rejects.toBeInstanceOf(SafeFetchError);
      const res = await b.http.fetchOperatorEndpoint(base, `${base}/redirect`);
      expect(res.status).toBe(302);
      expect(hits.filter((h) => h.includes('meta-data'))).toHaveLength(0);
      await b.safe.onApplicationShutdown();
    });
  });
});
