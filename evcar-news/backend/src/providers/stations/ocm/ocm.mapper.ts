import { createHash } from 'node:crypto';
import type { ConnectorTypeIndex } from '../connector-type-index';
import type {
  ExternalAccessType,
  ExternalConnector,
  ExternalOperationalStatus,
  ExternalStationRecord,
  SourceLicence,
} from '../station-source.types';
import {
  OCM_ATTRIBUTION,
  OCM_CURRENT,
  OCM_STATUS,
  OCM_UNKNOWN_OPERATOR_ID,
  OCM_USER_DATA_LICENCE,
  type OcmConnection,
  type OcmDataProvider,
  type OcmPoi,
  type OcmStatusType,
  type OcmUsageType,
} from './ocm.types';

export type OcmMapResult =
  | { ok: true; record: ExternalStationRecord }
  | { ok: false; externalId: string | null; reason: string };

export interface OcmMapOptions {
  connectorTypes: ConnectorTypeIndex;
  /** Skip records whose data provider is not open-data licensed (default true). */
  openDataOnly?: boolean;
}

const text = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

const positive = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const httpUrl = (v: unknown): string | null => {
  const t = text(v, 2048);
  if (!t) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Deterministic JSON (sorted keys) for change detection. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Operational status only. OCM "Currently Available" / "In Use" (10/20) are
 * snapshot states reported by some feeds; they are NOT live availability and
 * are mapped to `operational` (live availability stays "unknown").
 */
export function mapOcmStatus(
  statusTypeId: number | null | undefined,
  statusType?: OcmStatusType | null,
): { status: ExternalOperationalStatus; removed: 'decommissioned' | 'duplicate' | null } {
  switch (statusTypeId ?? statusType?.ID) {
    case OCM_STATUS.CURRENTLY_AVAILABLE:
    case OCM_STATUS.CURRENTLY_IN_USE:
    case OCM_STATUS.OPERATIONAL:
    case OCM_STATUS.PARTLY_OPERATIONAL:
      return { status: 'operational', removed: null };
    case OCM_STATUS.TEMPORARILY_UNAVAILABLE:
    case OCM_STATUS.NOT_OPERATIONAL:
      return { status: 'temporarily_unavailable', removed: null };
    case OCM_STATUS.PLANNED:
      return { status: 'planned', removed: null };
    case OCM_STATUS.REMOVED_DECOMMISSIONED:
      return { status: 'permanently_closed', removed: 'decommissioned' };
    case OCM_STATUS.REMOVED_DUPLICATE:
      return { status: 'permanently_closed', removed: 'duplicate' };
    case OCM_STATUS.UNKNOWN:
      return { status: 'unknown', removed: null };
    default:
      if (statusType?.IsOperational === true) return { status: 'operational', removed: null };
      if (statusType?.IsOperational === false) {
        return { status: 'temporarily_unavailable', removed: null };
      }
      return { status: 'unknown', removed: null };
  }
}

export function mapOcmAccess(usage: OcmUsageType | null | undefined): ExternalAccessType {
  const title = usage?.Title?.toLowerCase() ?? '';
  if (!title) return 'unknown';
  if (title.startsWith('public')) return 'public';
  if (title.includes('staff, visitors or customers') || title.includes('customers')) {
    return 'customers_only';
  }
  if (title.includes('restricted') || title.includes('notice required')) return 'restricted';
  if (title.startsWith('private')) return 'private';
  return 'unknown';
}

export function licenceOf(provider: OcmDataProvider | null | undefined): SourceLicence {
  const name = text(provider?.Title, 200) ?? 'Open Charge Map Contributors';
  const isUserData = !provider || provider.ID === 1 || /open charge map/i.test(name);
  const licence = text(provider?.License, 300) ?? (isUserData ? OCM_USER_DATA_LICENCE : null);
  const attribution = isUserData
    ? `© ${OCM_ATTRIBUTION} contributors, ${licence ?? OCM_USER_DATA_LICENCE}`
    : `${name}${licence ? ` — ${licence}` : ''} via ${OCM_ATTRIBUTION}`;
  return {
    providerName: name,
    providerUrl: httpUrl(provider?.WebsiteURL),
    licence,
    isOpenData: provider?.IsOpenDataLicensed ?? (isUserData ? true : null),
    attribution,
  };
}

function mapConnection(
  conn: OcmConnection,
  index: number,
  poiId: string,
  types: ConnectorTypeIndex,
  warnings: string[],
): ExternalConnector {
  const title = text(conn.ConnectionType?.Title, 200);
  const ref = types.resolve(title) ?? types.resolve(conn.ConnectionType?.FormalName);
  if (!ref) warnings.push(`unknown_connector_type:${title ?? conn.ConnectionTypeID ?? 'none'}`);

  const currentId = conn.CurrentTypeID ?? conn.CurrentType?.ID ?? null;
  let currentType: 'AC' | 'DC' | null = null;
  let phases: 1 | 3 | null = null;
  if (currentId === OCM_CURRENT.DC) currentType = 'DC';
  else if (currentId === OCM_CURRENT.AC_SINGLE_PHASE) [currentType, phases] = ['AC', 1];
  else if (currentId === OCM_CURRENT.AC_THREE_PHASE) [currentType, phases] = ['AC', 3];
  else if (ref && ref.supportsAc !== ref.supportsDc) currentType = ref.supportsDc ? 'DC' : 'AC';
  if (!currentType) warnings.push(`unknown_current_type:conn:${conn.ID ?? index}`);

  const maxPowerKw = positive(conn.PowerKW);
  if (maxPowerKw === null) warnings.push(`missing_power:conn:${conn.ID ?? index}`);

  const lower = title?.toLowerCase() ?? '';
  const format = lower.includes('socket') ? 'socket' : lower.includes('tethered') ? 'cable' : null;

  return {
    externalId: `conn:${conn.ID ?? `${poiId}-${index}`}`,
    connectorTypeCode: ref?.code ?? null,
    originalTypeId: conn.ConnectionTypeID ?? conn.ConnectionType?.ID ?? null,
    originalTypeName: title,
    currentType,
    phases,
    format,
    maxPowerKw,
    maxVoltage: positive(conn.Voltage),
    maxAmperage: positive(conn.Amps),
    quantity: positive(conn.Quantity),
    operationalStatus: mapOcmStatus(conn.StatusTypeID, conn.StatusType).status,
  };
}

/** Maps one OCM POI to the provider-neutral record (or a skip reason). */
export function mapOcmPoi(raw: unknown, opts: OcmMapOptions): OcmMapResult {
  if (!raw || typeof raw !== 'object')
    return { ok: false, externalId: null, reason: 'not_an_object' };
  const poi = raw as OcmPoi;
  if (typeof poi.ID !== 'number') return { ok: false, externalId: null, reason: 'missing_id' };
  const externalId = String(poi.ID);

  const licence = licenceOf(poi.DataProvider);
  if ((opts.openDataOnly ?? true) && licence.isOpenData !== true) {
    return { ok: false, externalId, reason: 'licence_not_open_data' };
  }

  const addr = poi.AddressInfo ?? {};
  const lat = addr.Latitude;
  const lng = addr.Longitude;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)
  ) {
    return { ok: false, externalId, reason: 'invalid_coordinates' };
  }

  const warnings: string[] = [];
  const { status, removed } = mapOcmStatus(poi.StatusTypeID, poi.StatusType);
  if ((poi.StatusTypeID ?? poi.StatusType?.ID) === OCM_STATUS.PARTLY_OPERATIONAL) {
    warnings.push('partly_operational');
  }

  const operatorId = poi.OperatorID ?? poi.OperatorInfo?.ID ?? null;
  const operatorName = text(poi.OperatorInfo?.Title, 200);
  const operator =
    operatorName && operatorId !== OCM_UNKNOWN_OPERATOR_ID
      ? {
          externalId: operatorId !== null ? `operator:${operatorId}` : null,
          name: operatorName,
          websiteUrl: httpUrl(poi.OperatorInfo?.WebsiteURL),
          phone: text(poi.OperatorInfo?.PhonePrimaryContact, 50),
          email: text(poi.OperatorInfo?.ContactEmail, 320),
        }
      : null;

  const connectors = (Array.isArray(poi.Connections) ? poi.Connections : []).map((c, i) =>
    mapConnection(c ?? {}, i, externalId, opts.connectorTypes, warnings),
  );
  if (connectors.length === 0) warnings.push('no_connectors');

  const addressParts = [text(addr.AddressLine1, 250), text(addr.AddressLine2, 250)].filter(Boolean);
  const countryCode = text(addr.Country?.ISOCode, 2)?.toUpperCase() ?? null;
  const name = text(addr.Title, 300) ?? `OCM ${externalId}`;

  return {
    ok: true,
    record: {
      provider: 'ocm',
      externalId,
      externalUuid: text(poi.UUID, 64),
      name,
      operator,
      latitude: lat,
      longitude: lng,
      addressLine: addressParts.length > 0 ? addressParts.join(', ').slice(0, 500) : null,
      city: text(addr.Town, 120),
      region: text(addr.StateOrProvince, 120),
      postalCode: text(addr.Postcode, 20),
      countryCode: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
      timezone: null,
      accessEntranceNote: text(addr.AccessComments, 1000),
      accessType: mapOcmAccess(poi.UsageType),
      usageFlags: {
        membershipRequired: poi.UsageType?.IsMembershipRequired ?? null,
        accessKeyRequired: poi.UsageType?.IsAccessKeyRequired ?? null,
        payAtLocation: poi.UsageType?.IsPayAtLocation ?? null,
      },
      usageCostText: text(poi.UsageCost, 500),
      phone: text(addr.ContactTelephone1, 50),
      email: text(addr.ContactEmail, 320),
      websiteUrl: httpUrl(addr.RelatedURL),
      openingHours: null,
      isAlwaysOpen: null,
      operationalStatus: status,
      removedAtSource: removed,
      numberOfPoints: positive(poi.NumberOfPoints),
      connectors,
      lastVerifiedAt: isoDate(poi.DateLastVerified) ?? isoDate(poi.DateLastConfirmed),
      sourceUpdatedAt: isoDate(poi.DateLastStatusUpdate),
      sourceCreatedAt: isoDate(poi.DateCreated),
      licence,
      payloadHash: createHash('sha256').update(canonicalJson(raw)).digest('hex'),
      raw,
      warnings,
    },
  };
}
