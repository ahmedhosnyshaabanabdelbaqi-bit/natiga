import type { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import {
  expectJson,
  type OutboundHttp,
  UpstreamHttpError,
  upstreamException,
} from '../http/outbound-http';
import { NOT_CONFIGURED_CHECK, timedCheck, type ProviderCheckResult } from '../provider-check';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import {
  assertWaypoints,
  type RouteRequest,
  type RouteResult,
  routeNotFound,
  type RoutingProvider,
} from './routing.types';

interface OsrmResponse {
  code?: string;
  message?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: { type?: string; coordinates?: [number, number][] };
    legs?: { distance?: number; duration?: number }[];
  }[];
}

const NO_ROUTE_CODES = new Set(['NoRoute', 'NoSegment', 'NoMatch', 'NoTrips']);

/** Maps an OSRM /route/v1 response (geometries=geojson) to RouteResult. */
export function mapOsrmRoute(body: OsrmResponse): RouteResult | null {
  if (body.code !== 'Ok') return null;
  const route = body.routes?.[0];
  if (
    !route ||
    typeof route.distance !== 'number' ||
    typeof route.duration !== 'number' ||
    route.geometry?.type !== 'LineString' ||
    !Array.isArray(route.geometry.coordinates)
  ) {
    return null;
  }
  return {
    provider: 'osrm',
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    legs: (route.legs ?? []).map((l) => ({
      distanceMeters: l.distance ?? 0,
      durationSeconds: l.duration ?? 0,
    })),
    geometry: { type: 'LineString', coordinates: route.geometry.coordinates },
    attribution: 'Routing: OSRM · Map data © OpenStreetMap contributors (ODbL)',
  };
}

/**
 * OSRM (self-hosted or third-party). OSRM_BASE_URL is operator-configured;
 * a plain-http private endpoint is allowed for that exact origin only.
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm';
  private readonly activity = new ProviderActivity();

  constructor(
    private readonly config: AppConfig,
    private readonly http: OutboundHttp,
  ) {}

  private get baseUrl(): string {
    return this.config.integrations.routing.osrmBaseUrl.replace(/\/+$/, '');
  }

  get configured(): boolean {
    return /^https?:\/\//.test(this.baseUrl);
  }

  status(): ProviderStatus {
    const base = { type: 'routing', name: 'osrm', ...this.activity.snapshot() };
    if (!this.configured) {
      return { ...base, configured: false, reason: 'OSRM_BASE_URL is not set (http/https URL).' };
    }
    const notes = ['Map data © OpenStreetMap contributors (ODbL) must be attributed.'];
    if (/router\.project-osrm\.org/.test(this.baseUrl)) {
      notes.push('The public OSRM demo server is not for production traffic; self-host OSRM.');
    }
    return { ...base, configured: true, notes, attribution: 'OSRM · © OpenStreetMap contributors' };
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    if (!this.configured) throw AppException.integrationNotConfigured('routing.osrm');
    assertWaypoints(request.waypoints);
    const coords = request.waypoints
      .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
      .join(';');
    const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;
    let body: OsrmResponse;
    try {
      const res = await this.http.fetchOperatorEndpoint(this.baseUrl, url);
      if (res.status === 400) {
        body = res.json<OsrmResponse>();
      } else {
        body = expectJson<OsrmResponse>('routing.osrm', res);
      }
    } catch (err) {
      this.activity.failure(err);
      throw upstreamException('routing.osrm', err);
    }
    if (body.code && NO_ROUTE_CODES.has(body.code)) {
      this.activity.success();
      throw routeNotFound('osrm');
    }
    const result = mapOsrmRoute(body);
    if (!result) {
      const err = new UpstreamHttpError(
        'routing.osrm',
        undefined,
        `OSRM answered ${body.code ?? 'an unexpected body'}`,
      );
      this.activity.failure(err);
      throw upstreamException('routing.osrm', err);
    }
    this.activity.success();
    return result;
  }

  async check(): Promise<ProviderCheckResult> {
    if (!this.configured) return NOT_CONFIGURED_CHECK;
    // Two nearby points in Cairo; any routable response proves connectivity.
    return timedCheck(async () => {
      try {
        await this.route({
          waypoints: [
            { lat: 30.0444, lng: 31.2357 },
            { lat: 30.0626, lng: 31.2497 },
          ],
        });
      } catch (err) {
        if (err instanceof AppException && err.code === 'ROUTE_NOT_FOUND') return;
        throw err;
      }
    });
  }
}
