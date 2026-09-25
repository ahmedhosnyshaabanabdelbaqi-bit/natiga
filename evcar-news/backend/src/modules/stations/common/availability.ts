import { effectiveAvailability } from '../../../providers/availability/availability.types';
import type { LiveAvailabilityStatus } from '../../../providers/availability/availability.types';

/**
 * Live availability (REQUIREMENTS §11, contract §3): only a live provider
 * observation that has not expired says anything about "a free connector
 * now". Expired, future-dated or missing observations are `unknown` —
 * never `available` by default. Community check-ins and reports are NOT
 * availability evidence (they are shown separately, dated).
 */
export type PublicAvailabilityStatus = 'available' | 'occupied' | 'out_of_order' | 'unknown';
export type AvailabilityFreshness = 'live' | 'expired' | 'none';

export interface ObservationLike {
  provider: string;
  status: LiveAvailabilityStatus;
  observedAt: Date;
  expiresAt: Date;
}

export interface ConnectorAvailabilityView {
  status: PublicAvailabilityStatus;
  /** Provider vocabulary (OCPI-like) of the observation, null when none. */
  providerStatus: LiveAvailabilityStatus | null;
  freshness: AvailabilityFreshness;
  source: string | null;
  observedAt: string | null;
  expiresAt: string | null;
}

export function toPublicStatus(status: LiveAvailabilityStatus): PublicAvailabilityStatus {
  switch (status) {
    case 'available':
      return 'available';
    case 'charging':
    case 'reserved':
    case 'blocked':
      return 'occupied';
    case 'out_of_order':
    case 'inoperative':
      return 'out_of_order';
    default:
      return 'unknown';
  }
}

/** Newest observation of a connector (or of its charge point) → public view. */
export function connectorAvailability(
  observation: ObservationLike | null | undefined,
  now: Date,
): ConnectorAvailabilityView {
  if (!observation) {
    return {
      status: 'unknown',
      providerStatus: null,
      freshness: 'none',
      source: null,
      observedAt: null,
      expiresAt: null,
    };
  }
  const eff = effectiveAvailability(observation, now);
  return {
    status: eff.expired ? 'unknown' : toPublicStatus(eff.status),
    providerStatus: observation.status,
    freshness: eff.expired ? 'expired' : 'live',
    source: observation.provider,
    observedAt: observation.observedAt.toISOString(),
    expiresAt: observation.expiresAt.toISOString(),
  };
}

export interface AvailabilityCounts {
  available: number;
  occupied: number;
  outOfOrder: number;
  unknown: number;
}

export function countAvailability(views: ConnectorAvailabilityView[]): AvailabilityCounts {
  const counts: AvailabilityCounts = { available: 0, occupied: 0, outOfOrder: 0, unknown: 0 };
  for (const v of views) {
    if (v.status === 'available') counts.available += 1;
    else if (v.status === 'occupied') counts.occupied += 1;
    else if (v.status === 'out_of_order') counts.outOfOrder += 1;
    else counts.unknown += 1;
  }
  return counts;
}

/**
 * Station-level status for map markers: `available` when at least one
 * connector is live-available; `occupied` / `out_of_order` only when EVERY
 * connector has a live status and none is available; otherwise unknown.
 */
export function stationStatusOf(counts: AvailabilityCounts): PublicAvailabilityStatus {
  if (counts.available > 0) return 'available';
  if (counts.unknown > 0) return 'unknown';
  if (counts.occupied > 0) return 'occupied';
  if (counts.outOfOrder > 0) return 'out_of_order';
  return 'unknown';
}

/** Default and maximum lifetime of an ingested observation. */
export const DEFAULT_OBSERVATION_TTL_SECONDS = 10 * 60;
export const MAX_OBSERVATION_TTL_SECONDS = 24 * 60 * 60;
/** Observations older than this are deleted by the maintenance run. */
export const OBSERVATION_RETENTION_DAYS = 7;
