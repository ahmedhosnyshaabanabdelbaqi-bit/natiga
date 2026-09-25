import { AppException } from '../../common/errors/app.exception';
import { NOT_CONFIGURED_CHECK, type ProviderCheckResult } from '../provider-check';
import type { ProviderStatus } from '../provider-status';
import type { RouteResult, RoutingProvider } from './routing.types';

/**
 * No routing provider: the trip planner is hidden (app-config forces the
 * `tripPlanner` flag off) and route() answers 503. External navigation to a
 * station keeps working in the apps.
 */
export class NoneRoutingProvider implements RoutingProvider {
  readonly configured = false;

  constructor(
    readonly name: string = 'none',
    private readonly reason = 'ROUTING_PROVIDER=none: the trip planner is hidden; directions open external navigation apps.',
  ) {}

  status(): ProviderStatus {
    return { type: 'routing', name: this.name, configured: false, reason: this.reason };
  }

  route(): Promise<RouteResult> {
    return Promise.reject(AppException.integrationNotConfigured(`routing.${this.name}`));
  }

  check(): Promise<ProviderCheckResult> {
    return Promise.resolve(NOT_CONFIGURED_CHECK);
  }
}

/** Why ROUTING_PROVIDER=google is not activated (licence), shown in the admin. */
export const GOOGLE_ROUTES_DISABLED_REASON =
  'Google Routes is not enabled: Google Maps Platform terms only allow showing its routes on a Google map, and the apps use OpenStreetMap-based tiles. Use osrm or openrouteservice.';
