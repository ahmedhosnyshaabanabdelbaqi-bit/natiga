import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import type { RouteRequest, RouteResult, RoutingProvider } from '../../providers';
import { RATE_LIMIT_PRESETS } from '../../common/throttle/rate-limit.decorator';
import { RoutingGuardService } from './routing-guard.service';

const offlineRedis = { status: 'end' } as unknown as Redis;

function cfg(env: Record<string, string> = {}) {
  return AppConfig.fromEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://x:y@localhost:5432/unit',
    ...env,
  });
}

class CountingProvider {
  readonly name = 'counting';
  readonly configured = true;
  calls = 0;
  route(req: RouteRequest): Promise<RouteResult> {
    this.calls += 1;
    return Promise.resolve({
      provider: this.name,
      distanceMeters: 1000 * req.waypoints.length,
      durationSeconds: 60,
      legs: [],
      geometry: { type: 'LineString', coordinates: [] },
      attribution: 'test',
    });
  }
}

const req = (lat: number): RouteRequest => ({
  waypoints: [
    { lat, lng: 31 },
    { lat: 30, lng: 32 },
  ],
  language: 'en',
});

function guard(env: Record<string, string>) {
  const p = new CountingProvider();
  const g = new RoutingGuardService(p as unknown as RoutingProvider, offlineRedis, cfg(env));
  return { p, g };
}

describe('RoutingGuardService (review 3: paid routing quota)', () => {
  it('defaults protect a keyed provider: budgets on, cache on, tight per-IP preset', () => {
    const c = cfg();
    expect(c.integrations.routing).toMatchObject({
      dailyBudget: 1500,
      minuteBudget: 30,
      cacheTtlSeconds: 21600,
    });
    expect(RATE_LIMIT_PRESETS.tripPlan.limit).toBeLessThanOrEqual(10);
  });

  it('serves identical waypoints from the cache (no upstream call, no budget used)', async () => {
    const { p, g } = guard({ ROUTING_MINUTE_BUDGET: '2' });
    await g.route(req(30));
    await g.route(req(30));
    await g.route(req(30.000001)); // same after rounding to 5 decimals
    expect(p.calls).toBe(1);
    await g.route(req(30.1));
    expect(p.calls).toBe(2);
  });

  it('refuses with 503 INTEGRATION_QUOTA + Retry-After once the minute budget is used', async () => {
    const { p, g } = guard({ ROUTING_MINUTE_BUDGET: '3', ROUTING_CACHE_TTL_SECONDS: '0' });
    for (let i = 0; i < 3; i++) await g.route(req(30));
    const err = await g.route(req(30)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    const e = err as AppException;
    expect(e.getStatus()).toBe(503);
    expect(e.code).toBe('INTEGRATION_QUOTA');
    expect(e.details).toMatchObject({ integration: 'routing.counting', window: 'minute' });
    expect(Number(e.headers?.['Retry-After'])).toBeGreaterThan(0);
    expect(p.calls).toBe(3);
  });

  it('enforces the daily budget across different routes', async () => {
    const { p, g } = guard({ ROUTING_DAILY_BUDGET: '2', ROUTING_MINUTE_BUDGET: '0' });
    await g.route(req(30));
    await g.route(req(31));
    await expect(g.route(req(32))).rejects.toMatchObject({
      code: 'INTEGRATION_QUOTA',
      details: { window: 'day' },
    });
    // A cached route still works after the budget is used up.
    await expect(g.route(req(30))).resolves.toMatchObject({ provider: 'counting' });
    expect(p.calls).toBe(2);
  });

  it('0 = unlimited', async () => {
    const { p, g } = guard({
      ROUTING_DAILY_BUDGET: '0',
      ROUTING_MINUTE_BUDGET: '0',
      ROUTING_CACHE_TTL_SECONDS: '0',
    });
    for (let i = 0; i < 50; i++) await g.route(req(30));
    expect(p.calls).toBe(50);
  });
});
