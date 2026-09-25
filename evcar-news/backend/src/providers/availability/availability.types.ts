import type { StatusReporter } from '../provider-status';

/** Live status vocabulary (aligned with OCPI and the availability_status DB enum). */
export type LiveAvailabilityStatus =
  'available' | 'charging' | 'reserved' | 'blocked' | 'out_of_order' | 'inoperative' | 'unknown';

export interface AvailabilityTarget {
  stationId: string;
  chargingPointId?: string | null;
  connectorId?: string | null;
  /** Provider reference of the target when it came from an external registry. */
  external?: { provider: string; externalId: string } | null;
}

export interface AvailabilityReading {
  target: AvailabilityTarget;
  status: LiveAvailabilityStatus;
  /** When the provider observed the status (null when unknown). */
  observedAt: string | null;
  /** After this instant the reading must be treated as `unknown`. */
  expiresAt: string | null;
  /** Provider name shown to users next to a live status; null when unknown. */
  source: string | null;
}

/**
 * Live availability (contract §3: "only from a live provider observation
 * that is not expired; otherwise unknown"). Implementations for OCPI or
 * partner feeds plug in here; the default reports `unknown` for everything.
 */
export interface AvailabilityProvider extends StatusReporter {
  readonly name: string;
  /** true only for providers that deliver real-time data. */
  readonly isLive: boolean;
  getAvailability(targets: AvailabilityTarget[]): Promise<AvailabilityReading[]>;
}

/**
 * Applies the expiry policy to a stored observation: anything without an
 * observation, expired, or observed in the future is `unknown`.
 */
export function effectiveAvailability(
  observation:
    | { status: LiveAvailabilityStatus; observedAt: Date; expiresAt: Date; provider: string }
    | null
    | undefined,
  now = new Date(),
): {
  status: LiveAvailabilityStatus;
  observedAt: string | null;
  source: string | null;
  expired: boolean;
} {
  if (!observation) return { status: 'unknown', observedAt: null, source: null, expired: false };
  const expired = observation.expiresAt.getTime() <= now.getTime();
  const future = observation.observedAt.getTime() > now.getTime() + 60_000;
  if (expired || future) {
    return {
      status: 'unknown',
      observedAt: observation.observedAt.toISOString(),
      source: observation.provider,
      expired: true,
    };
  }
  return {
    status: observation.status,
    observedAt: observation.observedAt.toISOString(),
    source: observation.provider,
    expired: false,
  };
}
