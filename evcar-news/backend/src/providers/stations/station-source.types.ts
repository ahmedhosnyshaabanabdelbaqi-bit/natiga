import type { ProviderCheckResult } from '../provider-check';
import type { StatusReporter } from '../provider-status';

/**
 * Station data sources (contract §4.6): swappable providers of charging
 * station *registry* data (location, connectors, operator, operational
 * status). They NEVER provide live availability — that is the separate
 * availability provider. The stations module turns ExternalStationRecord
 * into charging_stations / charging_points / connectors / provider_records
 * rows (unique (provider, external_id), so re-syncs upsert).
 */
export type StationSourceKey = 'ocm' | 'manual' | (string & {});

export type ExternalOperationalStatus =
  'operational' | 'planned' | 'temporarily_unavailable' | 'permanently_closed' | 'unknown';

export type ExternalAccessType = 'public' | 'customers_only' | 'restricted' | 'private' | 'unknown';

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface StationSourceQuery {
  /** ISO-3166 alpha-2 (e.g. "EG"). */
  countryCode?: string;
  boundingBox?: BoundingBox;
  /** Only records changed since this date (incremental sync). */
  modifiedSince?: Date;
  /** Opaque cursor from the previous page (null/undefined = first page). */
  cursor?: string | null;
  /** Default 200, max 1000. */
  pageSize?: number;
  /**
   * Only records whose data provider publishes them under an open licence
   * (default true). Records that fail this are reported in `skipped`.
   */
  openDataOnly?: boolean;
}

export interface SourceLicence {
  /** Data provider name, e.g. "Open Charge Map Contributors". */
  providerName: string;
  providerUrl?: string | null;
  /** Licence as published by the provider (e.g. "CC BY 4.0"). */
  licence: string | null;
  isOpenData: boolean | null;
  /** Text that must be shown to end users next to the data. */
  attribution: string;
}

export interface ExternalConnector {
  /** Stable id within the provider, e.g. "conn:1234" (provider_records sub-entity). */
  externalId: string;
  /** Mapped connector_types.code, or null when the type could not be mapped (needs review). */
  connectorTypeCode: string | null;
  originalTypeId: number | null;
  originalTypeName: string | null;
  currentType: 'AC' | 'DC' | null;
  phases: 1 | 3 | null;
  format: 'socket' | 'cable' | null;
  /** As published by the source; null when unknown (never 0). */
  maxPowerKw: number | null;
  maxVoltage: number | null;
  maxAmperage: number | null;
  /** Number of identical connectors of this kind (source value; null when unknown). */
  quantity: number | null;
  operationalStatus: ExternalOperationalStatus;
}

export interface ExternalStationRecord {
  provider: StationSourceKey;
  /** Id in the provider (unique with `provider`). */
  externalId: string;
  externalUuid: string | null;
  name: string;
  operator: {
    externalId: string | null;
    name: string;
    websiteUrl: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  latitude: number;
  longitude: number;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  /** ISO-3166 alpha-2 when known. */
  countryCode: string | null;
  /** Provider does not publish time zones: derive it from the market/country. */
  timezone: string | null;
  accessEntranceNote: string | null;
  accessType: ExternalAccessType;
  usageFlags: {
    membershipRequired: boolean | null;
    accessKeyRequired: boolean | null;
    payAtLocation: boolean | null;
  };
  /** Free-text cost note as published. NOT a structured tariff — never parse it into prices. */
  usageCostText: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  /** Structured opening hours are not provided by OCM → null (unknown). */
  openingHours: null;
  isAlwaysOpen: boolean | null;
  operationalStatus: ExternalOperationalStatus;
  /** Set when the source marks the record as removed. */
  removedAtSource: 'decommissioned' | 'duplicate' | null;
  /**
   * Number of bays/EVSEs that can charge simultaneously, as published
   * (null = unknown). Store it in charging_stations.published_point_count.
   */
  numberOfPoints: number | null;
  /**
   * Connectors as published. OCM does not group connectors into EVSEs, so
   * the importer must not assume one car per connector: store them as
   * connectors with station_id set and charging_point_id NULL, keeping the
   * source's Quantity in connectors.quantity (free-text UsageCost goes to
   * charging_stations.usage_cost_text, never into tariffs).
   */
  connectors: ExternalConnector[];
  lastVerifiedAt: string | null;
  sourceUpdatedAt: string | null;
  sourceCreatedAt: string | null;
  licence: SourceLicence;
  /** SHA-256 of the canonical raw payload (change detection). */
  payloadHash: string;
  /** Raw record as received (store only as far as `licence` allows). */
  raw: unknown;
  /** Data-quality notes for reviewers, e.g. "unknown_connector_type:Foo". */
  warnings: string[];
}

export interface SkippedRecord {
  externalId: string | null;
  reason: string;
}

export interface StationSourcePage {
  items: ExternalStationRecord[];
  skipped: SkippedRecord[];
  /** null when there are no more pages. */
  nextCursor: string | null;
  fetchedAt: string;
  /** Number of raw records received (items + skipped). */
  received: number;
}

export interface StationSource extends StatusReporter {
  readonly key: StationSourceKey;
  readonly displayName: string;
  /** true for sources that can be synchronised automatically. */
  readonly supportsSync: boolean;
  /** Source-level licence/attribution (per-record licences may differ). */
  readonly licence: SourceLicence;
  fetchPage(query: StationSourceQuery): Promise<StationSourcePage>;
  check(): Promise<ProviderCheckResult>;
}
