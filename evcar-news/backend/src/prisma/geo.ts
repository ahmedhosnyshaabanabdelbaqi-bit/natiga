import { Prisma } from '../generated/prisma/client';

/**
 * Helpers for PostGIS queries (Prisma cannot read/write geography columns
 * through the typed client). All values are parameterized; identifiers come
 * from a fixed allowlist.
 *
 * `location` columns (geography(Point,4326)) are maintained by triggers from
 * latitude/longitude, so writes simply set latitude/longitude with Prisma.
 */
export const GEO_TABLES = {
  charging_stations: { table: 'charging_stations', column: 'location' },
  service_providers: { table: 'service_providers', column: 'location' },
} as const;
export type GeoTable = keyof typeof GEO_TABLES;

export interface LatLng {
  lat: number;
  lng: number;
}

/** [minLng, minLat, maxLng, maxLat] */
export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export class GeoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoInputError';
  }
}

export function assertLatLng({ lat, lng }: LatLng): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)
    throw new GeoInputError('latitude must be within -90..90');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180)
    throw new GeoInputError('longitude must be within -180..180');
}

/** Parses "minLng,minLat,maxLng,maxLat" (the common map-viewport format). */
export function parseBBox(raw: string): BBox {
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    throw new GeoInputError('bbox must be "minLng,minLat,maxLng,maxLat"');
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  assertLatLng({ lat: minLat, lng: minLng });
  assertLatLng({ lat: maxLat, lng: maxLng });
  if (minLat > maxLat) throw new GeoInputError('bbox minLat must be <= maxLat');
  if (minLng > maxLng) throw new GeoInputError('bbox crossing the antimeridian is not supported');
  return { minLng, minLat, maxLng, maxLat };
}

/** geography point literal for parameters. */
export function geoPoint({ lat, lng }: LatLng): Prisma.Sql {
  assertLatLng({ lat, lng });
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography`;
}

function column(table: GeoTable, alias?: string): Prisma.Sql {
  const def = GEO_TABLES[table];
  return Prisma.raw(alias ? `"${alias}"."${def.column}"` : `"${def.table}"."${def.column}"`);
}

/** `<location> within radius meters of point` (uses the GIST index). */
export function withinRadius(
  table: GeoTable,
  center: LatLng,
  radiusMeters: number,
  alias?: string,
): Prisma.Sql {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0)
    throw new GeoInputError('radius must be > 0');
  return Prisma.sql`ST_DWithin(${column(table, alias)}, ${geoPoint(center)}, ${radiusMeters}::double precision)`;
}

/** Distance in meters from point (for SELECT / ORDER BY). */
export function distanceMeters(table: GeoTable, center: LatLng, alias?: string): Prisma.Sql {
  return Prisma.sql`ST_Distance(${column(table, alias)}, ${geoPoint(center)})`;
}

/** `<location> intersects bbox` (uses the GIST index). */
export function withinBBox(table: GeoTable, bbox: BBox, alias?: string): Prisma.Sql {
  return Prisma.sql`${column(table, alias)} && ST_MakeEnvelope(${bbox.minLng}::double precision, ${bbox.minLat}::double precision, ${bbox.maxLng}::double precision, ${bbox.maxLat}::double precision, 4326)::geography`;
}

export interface NearbyRow {
  id: string;
  distanceMeters: number;
}

/**
 * Builds a query returning ids + distance of rows within a radius, nearest
 * first. `where` adds extra conditions (e.g. publication status) using the
 * table alias "t".
 */
export function nearbyQuery(opts: {
  table: GeoTable;
  center: LatLng;
  radiusMeters: number;
  limit: number;
  where?: Prisma.Sql;
}): Prisma.Sql {
  const { table, center, radiusMeters, limit } = opts;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new GeoInputError('limit must be 1..1000');
  const t = Prisma.raw(`"${GEO_TABLES[table].table}"`);
  const extra = opts.where ? Prisma.sql`AND (${opts.where})` : Prisma.empty;
  return Prisma.sql`
    SELECT t."id"::text AS "id", ${distanceMeters(table, center, 't')} AS "distanceMeters"
    FROM ${t} AS t
    WHERE ${withinRadius(table, center, radiusMeters, 't')} ${extra}
    ORDER BY ${column(table, 't')} <-> ${geoPoint(center)}
    LIMIT ${limit}`;
}
