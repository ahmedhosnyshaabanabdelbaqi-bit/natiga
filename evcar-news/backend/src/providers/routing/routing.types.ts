import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { ProviderCheckResult } from '../provider-check';
import type { StatusReporter } from '../provider-status';
import { serverMessage } from '../../modules/i18n/server-messages';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteRequest {
  /** Start, optional intermediate stops, destination (2..25 points). */
  waypoints: LatLng[];
  language?: 'ar' | 'en';
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult {
  provider: string;
  /** Road distance (never a straight line). */
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
  /** GeoJSON LineString, coordinates as [lng, lat]. */
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  attribution: string;
}

/**
 * Road routing for the trip planner (contract §4.6). When no provider is
 * configured the planner is hidden (feature flag forced off) and route()
 * answers 503 INTEGRATION_NOT_CONFIGURED — never a straight-line estimate.
 */
export interface RoutingProvider extends StatusReporter {
  readonly name: string;
  readonly configured: boolean;
  route(request: RouteRequest): Promise<RouteResult>;
  check(): Promise<ProviderCheckResult>;
}

export const MAX_WAYPOINTS = 25;

export function assertWaypoints(points: LatLng[]): void {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_WAYPOINTS) {
    throw AppException.validation([
      { field: 'waypoints', constraints: { count: `2..${MAX_WAYPOINTS} waypoints are required` } },
    ]);
  }
  points.forEach((p, i) => {
    if (
      typeof p?.lat !== 'number' ||
      typeof p?.lng !== 'number' ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lng) > 180
    ) {
      throw AppException.validation([
        { field: `waypoints.${i}`, constraints: { range: 'lat -90..90, lng -180..180' } },
      ]);
    }
  });
}

export function routeNotFound(provider: string): AppException {
  return new AppException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'ROUTE_NOT_FOUND',
    message: serverMessage('errors.ROUTE_NOT_FOUND'),
    details: { provider },
  });
}
