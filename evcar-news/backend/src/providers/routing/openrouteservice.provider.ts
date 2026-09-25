import type { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { type OutboundHttp, UpstreamHttpError, upstreamException } from '../http/outbound-http';
import { NOT_CONFIGURED_CHECK, timedCheck, type ProviderCheckResult } from '../provider-check';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import {
  assertWaypoints,
  type RouteRequest,
  type RouteResult,
  routeNotFound,
  type RoutingProvider,
} from './routing.types';

export const ORS_BASE_URL = 'https://api.openrouteservice.org';

interface OrsGeoJson {
  type?: string;
  features?: {
    geometry?: { type?: string; coordinates?: [number, number][] };
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: { distance?: number; duration?: number }[];
    };
  }[];
  error?: { code?: number; message?: string } | string;
}

/** ORS error codes meaning "no route" (2004 = route not found, 2010 = point not routable, 2009 = too far). */
const ORS_NO_ROUTE = new Set([2004, 2009, 2010]);

export function mapOrsRoute(body: OrsGeoJson): RouteResult | null {
  const feature = body.features?.[0];
  const summary = feature?.properties?.summary;
  if (
    !feature ||
    feature.geometry?.type !== 'LineString' ||
    !Array.isArray(feature.geometry.coordinates) ||
    typeof summary?.distance !== 'number' ||
    typeof summary.duration !== 'number'
  ) {
    return null;
  }
  return {
    provider: 'openrouteservice',
    distanceMeters: summary.distance,
    durationSeconds: summary.duration,
    legs: (feature.properties?.segments ?? []).map((s) => ({
      distanceMeters: s.distance ?? 0,
      durationSeconds: s.duration ?? 0,
    })),
    geometry: {
      type: 'LineString',
      // ORS may return [lng, lat, elevation]; keep [lng, lat].
      coordinates: feature.geometry.coordinates.map((c) => [c[0], c[1]] as [number, number]),
    },
    attribution: '© openrouteservice.org by HeiGIT · Map data © OpenStreetMap contributors',
  };
}

/** OpenRouteService directions (driving-car). Requires ORS_API_KEY. */
export class OpenRouteServiceProvider implements RoutingProvider {
  readonly name = 'openrouteservice';
  private readonly activity = new ProviderActivity();

  constructor(
    private readonly config: AppConfig,
    private readonly http: OutboundHttp,
  ) {}

  get configured(): boolean {
    return !!this.config.integrations.routing.orsApiKey;
  }

  status(): ProviderStatus {
    const base = { type: 'routing', name: 'openrouteservice', ...this.activity.snapshot() };
    if (!this.configured) return { ...base, configured: false, reason: 'ORS_API_KEY is not set.' };
    return {
      ...base,
      configured: true,
      attribution: '© openrouteservice.org by HeiGIT · © OpenStreetMap contributors',
      notes: ['The ORS plan has daily/minute request quotas; watch usage in the ORS dashboard.'],
    };
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    if (!this.configured) throw AppException.integrationNotConfigured('routing.openrouteservice');
    assertWaypoints(request.waypoints);
    let body: OrsGeoJson;
    let status: number;
    try {
      const res = await this.http.fetch(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
        method: 'POST',
        // The API key must never follow a redirect.
        followRedirects: false,
        headers: {
          authorization: this.config.integrations.routing.orsApiKey,
          accept: 'application/geo+json, application/json',
        },
        body: {
          coordinates: request.waypoints.map((p) => [p.lng, p.lat]),
          instructions: false,
          language: request.language ?? 'en',
        },
      });
      status = res.status;
      body = res.json<OrsGeoJson>();
    } catch (err) {
      this.activity.failure(err);
      throw upstreamException('routing.openrouteservice', err);
    }
    const errorCode = typeof body.error === 'object' ? body.error?.code : undefined;
    if (errorCode !== undefined && ORS_NO_ROUTE.has(errorCode)) {
      this.activity.success();
      throw routeNotFound('openrouteservice');
    }
    const result = status >= 200 && status < 300 ? mapOrsRoute(body) : null;
    if (!result) {
      const err = new UpstreamHttpError(
        'routing.openrouteservice',
        status,
        `ORS answered HTTP ${status}`,
      );
      this.activity.failure(err);
      throw upstreamException('routing.openrouteservice', err);
    }
    this.activity.success();
    return result;
  }

  async check(): Promise<ProviderCheckResult> {
    if (!this.configured) return NOT_CONFIGURED_CHECK;
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
