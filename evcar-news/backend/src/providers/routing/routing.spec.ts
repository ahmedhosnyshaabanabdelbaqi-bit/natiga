import { AppConfig } from '../../config/app-config';
import type { OutboundHttp, OutboundResponse } from '../http/outbound-http';
import { mapNominatimPlace } from '../geocoding/nominatim.provider';
import { IntervalRateLimiter, TtlCache } from '../geocoding/rate-limiter';
import { createGeocodingProvider, createRoutingProvider } from '../providers.module';
import { mapOrsRoute } from './openrouteservice.provider';
import { mapOsrmRoute } from './osrm-routing.provider';
import { assertWaypoints } from './routing.types';

const DB = 'postgresql://evcar:x@localhost:5432/unit';
const cfg = (env: Record<string, string> = {}) =>
  AppConfig.fromEnv({ NODE_ENV: 'test', DATABASE_URL: DB, ...env });
const http = {} as OutboundHttp;

describe('routing providers', () => {
  it('is unconfigured by default and refuses to route (503, never straight lines)', async () => {
    const routing = createRoutingProvider(cfg(), http);
    expect(routing.configured).toBe(false);
    expect(routing.status()).toMatchObject({ type: 'routing', name: 'none', configured: false });
    await expect(
      routing.route({
        waypoints: [
          { lat: 1, lng: 1 },
          { lat: 2, lng: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
  });

  it('reports missing settings of the selected provider', async () => {
    expect(createRoutingProvider(cfg({ ROUTING_PROVIDER: 'osrm' }), http).status()).toMatchObject({
      name: 'osrm',
      configured: false,
      reason: expect.stringContaining('OSRM_BASE_URL') as string,
    });
    expect(
      createRoutingProvider(cfg({ ROUTING_PROVIDER: 'openrouteservice' }), http).status(),
    ).toMatchObject({ name: 'openrouteservice', configured: false });
    const google = createRoutingProvider(
      cfg({ ROUTING_PROVIDER: 'google', GOOGLE_ROUTES_API_KEY: 'k' }),
      http,
    );
    expect(google.configured).toBe(false);
    expect((await google.status()).reason).toMatch(/Google Maps Platform terms/);
  });

  it('configures OSRM / ORS when their settings exist', async () => {
    const osrm = createRoutingProvider(
      cfg({ ROUTING_PROVIDER: 'osrm', OSRM_BASE_URL: 'https://router.project-osrm.org' }),
      http,
    );
    expect(osrm.configured).toBe(true);
    expect((await osrm.status()).notes?.join(' ')).toMatch(/demo server/);
    expect(
      createRoutingProvider(cfg({ ROUTING_PROVIDER: 'openrouteservice', ORS_API_KEY: 'k' }), http)
        .configured,
    ).toBe(true);
  });

  it('maps OSRM and ORS responses', () => {
    expect(
      mapOsrmRoute({
        code: 'Ok',
        routes: [
          {
            distance: 10,
            duration: 5,
            geometry: {
              type: 'LineString',
              coordinates: [
                [1, 2],
                [3, 4],
              ],
            },
            legs: [{ distance: 10, duration: 5 }],
          },
        ],
      }),
    ).toMatchObject({ distanceMeters: 10, durationSeconds: 5, legs: [{ distanceMeters: 10 }] });
    expect(mapOsrmRoute({ code: 'NoRoute' })).toBeNull();
    expect(
      mapOrsRoute({
        features: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [[1, 2, 99] as unknown as [number, number]],
            },
            properties: {
              summary: { distance: 7, duration: 3 },
              segments: [{ distance: 7, duration: 3 }],
            },
          },
        ],
      }),
    ).toMatchObject({ distanceMeters: 7, geometry: { coordinates: [[1, 2]] } });
    expect(mapOrsRoute({})).toBeNull();
  });

  it('ORS sends its API key without following redirects', async () => {
    const payload = {
      features: [
        {
          geometry: { type: 'LineString', coordinates: [[1, 2]] },
          properties: { summary: { distance: 7, duration: 3 }, segments: [] },
        },
      ],
    };
    const fetch = jest.fn(() =>
      Promise.resolve({ status: 200, json: () => payload } as unknown as OutboundResponse),
    );
    const routing = createRoutingProvider(
      cfg({ ROUTING_PROVIDER: 'openrouteservice', ORS_API_KEY: 'ors-key' }),
      { fetch } as unknown as OutboundHttp,
    );
    await routing.route({
      waypoints: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        followRedirects: false,
        headers: expect.objectContaining({ authorization: 'ors-key' }) as object,
      }),
    );
  });

  it('validates waypoints', () => {
    expect(() => assertWaypoints([{ lat: 1, lng: 1 }])).toThrow();
    expect(() =>
      assertWaypoints([
        { lat: 91, lng: 1 },
        { lat: 1, lng: 1 },
      ]),
    ).toThrow();
    expect(() =>
      assertWaypoints([
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ]),
    ).not.toThrow();
  });
});

describe('geocoding', () => {
  it('is optional and unconfigured by default', async () => {
    const geo = createGeocodingProvider(cfg(), http);
    expect(geo.status()).toMatchObject({ configured: false });
    await expect(geo.search('Cairo')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
  });

  it('warns about the public Nominatim usage policy', async () => {
    const geo = createGeocodingProvider(
      cfg({ GEOCODING_BASE_URL: 'https://nominatim.openstreetmap.org' }),
      http,
    );
    expect(geo.configured).toBe(true);
    expect((await geo.status()).notes?.join(' ')).toMatch(/no autocomplete/);
  });

  it('maps Nominatim places', () => {
    expect(
      mapNominatimPlace({
        display_name: 'Fixture Place',
        lat: '30.1',
        lon: '31.2',
        type: 'city',
        category: 'place',
        boundingbox: ['30', '30.2', '31', '31.4'],
        osm_type: 'relation',
        osm_id: 42,
        address: { city: 'Fixture', country_code: 'eg', country: 'Egypt' },
      }),
    ).toEqual({
      displayName: 'Fixture Place',
      lat: 30.1,
      lng: 31.2,
      type: 'city',
      category: 'place',
      countryCode: 'EG',
      boundingBox: [30, 30.2, 31, 31.4],
      address: {
        road: undefined,
        city: 'Fixture',
        state: undefined,
        postcode: undefined,
        country: 'Egypt',
      },
      osmRef: 'relation/42',
    });
    expect(mapNominatimPlace({ lat: 'x' })).toBeNull();
  });

  it('spaces calls by the interval and rejects callers beyond the queue', async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new IntervalRateLimiter(
      1000,
      2,
      () => now,
      (ms) => {
        slept.push(ms);
        now += ms;
        return Promise.resolve();
      },
    );
    await Promise.all([
      limiter.schedule(() => Promise.resolve(1)),
      limiter.schedule(() => Promise.resolve(2)),
    ]);
    expect(slept).toEqual([1000]);

    const blocker = new IntervalRateLimiter(
      1000,
      1,
      () => 0,
      () => new Promise(() => undefined),
    );
    void blocker.schedule(() => Promise.resolve(0));
    await expect(blocker.schedule(() => Promise.resolve(0))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('caches with TTL and LRU eviction', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});
