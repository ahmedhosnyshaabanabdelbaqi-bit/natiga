import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { connectorCompatibility } from '../common/compatibility';
import { evaluateOpenNow, type OpeningHours } from '../common/opening-hours';
import { StationErrors } from '../common/station-errors';
import { num, pick } from '../common/values';
import type {
  ListAvailabilityDto,
  StationClusterDto,
  StationClusterQueryDto,
  StationFilterQueryDto,
  StationListItemDto,
  StationSearchQueryDto,
} from '../dto/public.dto';
import { StationAvailabilityService } from './station-availability.service';
import {
  type ResolvedVehicle,
  type VehicleCompatibilityView,
  VehicleCompatService,
} from './vehicle-compat.service';

/** Maximum matches evaluated per request (the map should zoom in / use clusters beyond). */
export const SEARCH_CAP = 2000;
export const DEFAULT_RADIUS_KM = 25;
export const DEFAULT_LIMIT = 100;

interface Geo {
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  center: { lat: number; lng: number } | null;
  radiusM: number | null;
}

interface SearchRow {
  id: string;
  slug: string | null;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  operator_name: string | null;
  operator_name_ar: string | null;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  city: string | null;
  country_code: string;
  access_type: string;
  operational_status: string;
  opening_hours: unknown;
  is_always_open: boolean | null;
  timezone: string;
  published_point_count: number | null;
  is_demo: boolean;
  data_source: string;
  max_power: number | null;
  currents: string[] | null;
  types: string[] | null;
  connector_count: number;
  point_count: number;
}

export interface SearchResult {
  data: StationListItemDto[];
  meta: {
    nextCursor: string | null;
    pageSize: number;
    total: number;
    truncated: boolean;
    center: { lat: number; lng: number } | null;
    compatibility: VehicleCompatibilityView | null;
    liveAvailability: { configured: boolean; provider: string | null };
  };
}

/** Public, visible stations only (published, not deleted, not merged). */
export const PUBLIC_STATION_SQL = Prisma.sql`s."publication_status" = 'published' AND s."deleted_at" IS NULL AND s."duplicate_of_id" IS NULL`;

function point(lat: number, lng: number): Prisma.Sql {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography`;
}

/**
 * Station search for the map and list (REQUIREMENTS §10): PostGIS bbox /
 * radius (GIST index on charging_stations.location), connector-level
 * filters met by ONE connector, text, operator, access, amenities, vehicle
 * compatibility (verified inlets only) and "open now" (opening hours in the
 * station time zone). Lightweight rows for client-side clustering.
 */
@Injectable()
export class StationSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: StationAvailabilityService,
    private readonly compat: VehicleCompatService,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  parseGeo(q: StationFilterQueryDto): Geo {
    let bbox: Geo['bbox'] = null;
    if (q.bbox) {
      const [minLng, minLat, maxLng, maxLat] = q.bbox.split(',').map(Number);
      const bad =
        [minLng, maxLng].some((v) => v < -180 || v > 180) ||
        [minLat, maxLat].some((v) => v < -90 || v > 90) ||
        minLat > maxLat ||
        minLng > maxLng;
      if (bad) {
        throw StationErrors.geoRequired();
      }
      bbox = { minLng, minLat, maxLng, maxLat };
    }
    const hasPoint = q.lat !== undefined && q.lng !== undefined;
    if ((q.lat === undefined) !== (q.lng === undefined)) throw StationErrors.geoRequired();
    if (!bbox && !hasPoint) throw StationErrors.geoRequired();
    const center = hasPoint
      ? { lat: q.lat as number, lng: q.lng as number }
      : bbox
        ? { lat: (bbox.minLat + bbox.maxLat) / 2, lng: (bbox.minLng + bbox.maxLng) / 2 }
        : null;
    return {
      bbox,
      center,
      radiusM: bbox ? null : (q.radiusKm ?? DEFAULT_RADIUS_KM) * 1000,
    };
  }

  /** WHERE conditions shared by list and clusters (alias s). */
  whereSql(q: StationFilterQueryDto, geo: Geo, vehicle: ResolvedVehicle | null): Prisma.Sql {
    const parts: Prisma.Sql[] = [PUBLIC_STATION_SQL];
    if (geo.bbox) {
      const b = geo.bbox;
      parts.push(
        Prisma.sql`s."location" && ST_MakeEnvelope(${b.minLng}::double precision, ${b.minLat}::double precision, ${b.maxLng}::double precision, ${b.maxLat}::double precision, 4326)::geography`,
        Prisma.sql`s."latitude" BETWEEN ${b.minLat}::double precision AND ${b.maxLat}::double precision`,
        Prisma.sql`s."longitude" BETWEEN ${b.minLng}::double precision AND ${b.maxLng}::double precision`,
      );
    } else if (geo.center && geo.radiusM) {
      parts.push(
        Prisma.sql`ST_DWithin(s."location", ${point(geo.center.lat, geo.center.lng)}, ${geo.radiusM}::double precision)`,
      );
    }
    if (!q.includeClosed) {
      parts.push(Prisma.sql`s."operational_status" NOT IN ('planned', 'permanently_closed')`);
    }
    if (q.q) {
      parts.push(Prisma.sql`(strpos(s."search_text", app_normalize_text(${q.q})) > 0
        OR strpos(app_normalize_text(coalesce(o."name", '') || ' ' || coalesce(o."name_ar", '')), app_normalize_text(${q.q})) > 0)`);
    }
    if (q.operatorId?.length) {
      parts.push(
        Prisma.sql`s."operator_id" IN (${Prisma.join(q.operatorId.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    if (q.access?.length) {
      parts.push(Prisma.sql`s."access_type"::text IN (${Prisma.join(q.access)})`);
    }
    if (q.amenities?.length) {
      parts.push(Prisma.sql`s."amenities" @> ARRAY[${Prisma.join(q.amenities)}]::text[]`);
    }
    const conn: Prisma.Sql[] = [];
    if (q.connectorTypes?.length) {
      conn.push(Prisma.sql`c."connector_type_code" IN (${Prisma.join(q.connectorTypes)})`);
    }
    if (q.current) conn.push(Prisma.sql`c."current_type"::text = ${q.current}`);
    if (q.minPowerKw !== undefined) {
      conn.push(Prisma.sql`c."max_power_kw" >= ${q.minPowerKw}::numeric`);
    }
    if (vehicle && (q.compatibleOnly ?? true)) {
      conn.push(
        Prisma.sql`(c."connector_type_code", c."current_type"::text) IN (${Prisma.join(
          vehicle.pairs.map((p) => Prisma.sql`(${p.code}::varchar, ${p.current}::text)`),
        )})`,
      );
    }
    if (conn.length > 0) {
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "connectors" c WHERE c."station_id" = s."id" AND ${Prisma.join(conn, ' AND ')})`,
      );
    }
    return Prisma.join(parts, ' AND ');
  }

  async search(
    q: StationSearchQueryDto,
    lang: SupportedLanguage,
    market: string,
    userId: string | undefined,
  ): Promise<SearchResult> {
    const geo = this.parseGeo(q);
    const vehicle = await this.compat.resolve(q, market, userId, lang);
    const where = this.whereSql(q, geo, vehicle);
    const distance = geo.center
      ? Prisma.sql`ST_Distance(s."location", ${point(geo.center.lat, geo.center.lng)})`
      : Prisma.sql`NULL::double precision`;
    const order =
      (q.sort ?? 'distance') === 'name' || !geo.center
        ? Prisma.sql`lower(s."name"), s."id"`
        : Prisma.sql`"distance_m", s."id"`;

    const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT s."id"::text, s."slug", s."name", s."name_ar", s."name_en",
             o."name" AS "operator_name", o."name_ar" AS "operator_name_ar",
             s."latitude", s."longitude", ${distance} AS "distance_m",
             s."city", s."country_code", s."access_type"::text, s."operational_status"::text,
             s."opening_hours", s."is_always_open", s."timezone", s."published_point_count",
             s."is_demo", s."data_source"::text,
             cs."max_power", cs."currents", cs."types", cs."connector_count",
             (SELECT count(*) FROM "charging_points" p WHERE p."station_id" = s."id")::int AS "point_count"
        FROM "charging_stations" s
        LEFT JOIN "charging_operators" o ON o."id" = s."operator_id"
        LEFT JOIN LATERAL (
          SELECT max(c."max_power_kw")::float8 AS "max_power",
                 array_agg(DISTINCT c."current_type"::text) AS "currents",
                 array_agg(DISTINCT c."connector_type_code"::text) AS "types",
                 coalesce(sum(c."quantity"), 0)::int AS "connector_count"
            FROM "connectors" c WHERE c."station_id" = s."id"
        ) cs ON true
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ${SEARCH_CAP + 1}`);

    const truncated = rows.length > SEARCH_CAP;
    const now = this.clock.now();
    let items = rows.slice(0, SEARCH_CAP).map((r) => ({
      row: r,
      openNow: evaluateOpenNow(
        r.opening_hours as OpeningHours | null,
        r.is_always_open,
        r.timezone,
        now,
      ).state,
    }));
    if (q.openNow) items = items.filter((i) => i.openNow === 'open');

    const offset = q.cursor ? Number(q.cursor.slice(1)) : 0;
    const limit = q.limit ?? DEFAULT_LIMIT;
    const page = items.slice(offset, offset + limit);
    const nextCursor = offset + limit < items.length ? `o${offset + limit}` : null;

    const extras = await this.pageExtras(
      page.map((p) => p.row.id),
      vehicle,
    );
    const data: StationListItemDto[] = page.map(({ row, openNow }) => ({
      id: row.id,
      slug: row.slug,
      name: pick(lang, row.name_ar, row.name_en) ?? row.name,
      operatorName: pick(lang, row.operator_name_ar, row.operator_name),
      latitude: row.latitude,
      longitude: row.longitude,
      distanceM: row.distance_m === null ? null : Math.round(Number(row.distance_m)),
      city: row.city,
      countryCode: row.country_code,
      accessType: row.access_type,
      operationalStatus: row.operational_status,
      openNow,
      isAlwaysOpen: row.is_always_open,
      maxPowerKw: num(row.max_power),
      currentTypes: (row.currents ?? []).filter(Boolean).sort(),
      connectorTypes: (row.types ?? []).filter(Boolean).sort(),
      connectorCount: row.connector_count,
      pointCount: row.point_count > 0 ? row.point_count : row.published_point_count,
      availability: extras.availability.get(row.id) ?? {
        status: 'unknown',
        availableConnectors: null,
        liveConnectors: 0,
      },
      compatibility: vehicle
        ? (extras.compat.get(row.id) ?? { compatibleConnectors: 0, maxUsablePowerKw: null })
        : null,
      isDemo: row.is_demo,
      dataSource: row.data_source,
    }));

    return {
      data,
      meta: {
        nextCursor,
        pageSize: limit,
        total: items.length,
        truncated,
        center: geo.center,
        compatibility: vehicle?.view ?? null,
        liveAvailability: this.availability.providerInfo(),
      },
    };
  }

  /** Availability summary + compatibility summary of the stations of one page. */
  private async pageExtras(
    ids: string[],
    vehicle: ResolvedVehicle | null,
  ): Promise<{
    availability: Map<string, ListAvailabilityDto>;
    compat: Map<string, { compatibleConnectors: number; maxUsablePowerKw: number | null }>;
  }> {
    const availability = new Map<string, ListAvailabilityDto>();
    const compat = new Map<string, { compatibleConnectors: number; maxUsablePowerKw: number | null }>();
    if (ids.length === 0) return { availability, compat };
    const connectors = await this.prisma.connector.findMany({
      where: { stationId: { in: ids } },
      select: {
        id: true,
        stationId: true,
        chargingPointId: true,
        connectorTypeCode: true,
        currentType: true,
        maxPowerKw: true,
        quantity: true,
      },
    });
    const views = await this.availability.connectorViews(connectors);
    for (const id of ids) {
      const own = connectors.filter((c) => c.stationId === id);
      const v = own.map((c) => views.get(c.id)).filter((x) => x !== undefined);
      const live = v.filter((x) => x.freshness === 'live');
      const summary = this.availability.summarize(v, 'en');
      availability.set(id, {
        status: summary.status,
        availableConnectors: live.length > 0 ? live.filter((x) => x.status === 'available').length : null,
        liveConnectors: live.length,
      });
      if (vehicle) {
        let count = 0;
        let best: number | null = null;
        for (const c of own) {
          const r = connectorCompatibility(
            {
              connectorTypeCode: c.connectorTypeCode,
              currentType: c.currentType,
              maxPowerKw: num(c.maxPowerKw),
            },
            vehicle.inlets,
          );
          if (!r.compatible) continue;
          count += c.quantity;
          if (r.maxUsablePowerKw !== null) best = Math.max(best ?? 0, r.maxUsablePowerKw);
        }
        compat.set(id, { compatibleConnectors: count, maxUsablePowerKw: best });
      }
    }
    return { availability, compat };
  }

  /**
   * Grid aggregation for low zoom levels (ST_SnapToGrid in degrees):
   * cell = 360 / (2^zoom · 4) (~a quarter of a 256 px web-mercator tile).
   */
  async clusters(
    q: StationClusterQueryDto,
    lang: SupportedLanguage,
    market: string,
    userId: string | undefined,
  ): Promise<{ data: StationClusterDto[]; meta: { cellSizeDeg: number; total: number; zoom: number } }> {
    const geo = this.parseGeo(q);
    const vehicle = await this.compat.resolve(q, market, userId, lang);
    const where = this.whereSql(q, geo, vehicle);
    const zoom = q.zoom ?? 5;
    const cell = 360 / (2 ** zoom * 4);
    const rows = await this.prisma.$queryRaw<
      { lat: number; lng: number; count: number; station_id: string | null }[]
    >(Prisma.sql`
      SELECT ST_Y(ST_Centroid(ST_Collect(x.geom))) AS "lat",
             ST_X(ST_Centroid(ST_Collect(x.geom))) AS "lng",
             count(*)::int AS "count",
             CASE WHEN count(*) = 1 THEN min(x.id::text) END AS "station_id"
        FROM (
          SELECT s."id", s."location"::geometry AS geom,
                 ST_SnapToGrid(s."location"::geometry, ${cell}::double precision) AS cell
            FROM "charging_stations" s
            LEFT JOIN "charging_operators" o ON o."id" = s."operator_id"
           WHERE ${where}
        ) x
       GROUP BY x.cell
       ORDER BY count(*) DESC
       LIMIT ${SEARCH_CAP}`);
    const data = rows.map((r) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lng),
      count: r.count,
      stationId: r.station_id,
    }));
    return {
      data,
      meta: { cellSizeDeg: cell, total: data.reduce((s, c) => s + c.count, 0), zoom },
    };
  }
}
