import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { tr } from '../../../common/validation/messages';
import { Prisma } from '../../../generated/prisma/client';
import type { AvailabilityStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AvailabilityProvider,
  LiveAvailabilityStatus,
} from '../../../providers/availability/availability.types';
import { AVAILABILITY_PROVIDER } from '../../../providers/provider-tokens';
import {
  type AvailabilityCounts,
  type ConnectorAvailabilityView,
  connectorAvailability,
  countAvailability,
  DEFAULT_OBSERVATION_TTL_SECONDS,
  MAX_OBSERVATION_TTL_SECONDS,
  OBSERVATION_RETENTION_DAYS,
  type ObservationLike,
  type PublicAvailabilityStatus,
  stationStatusOf,
} from '../common/availability';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { AVAILABILITY_DISCLAIMER } from '../common/labels';
import { fieldError } from '../common/station-errors';

export interface ConnectorRef {
  id: string;
  stationId: string;
  chargingPointId: string | null;
}

export interface StationAvailabilityView {
  liveProviderConfigured: boolean;
  provider: string | null;
  isLive: boolean;
  status: PublicAvailabilityStatus;
  counts: AvailabilityCounts;
  lastObservedAt: string | null;
  disclaimer: string;
}

export interface ObservationInput {
  stationId?: string;
  connectorId?: string;
  chargingPointId?: string;
  /** Resolve the target through provider_records (e.g. {provider:'ocm', externalId:'conn:123'}). */
  external?: { provider: string; externalId: string };
  /** Resolve a charge point by its eMI3 EVSE id. */
  evseId?: string;
  status: LiveAvailabilityStatus;
  observedAt: string;
  expiresAt?: string;
  ttlSeconds?: number;
}

interface ObservationRow {
  station_id: string;
  connector_id: string | null;
  charging_point_id: string | null;
  provider: string;
  status: AvailabilityStatus;
  observed_at: Date;
  expires_at: Date;
}

const PROVIDER_RE = /^[a-z][a-z0-9_:.-]{1,63}$/;

/**
 * Live availability: reads the newest observation per connector (or per
 * charge point) and applies the expiry policy; ingests observations pushed
 * by a live partner feed; pulls from the configured AvailabilityProvider
 * when it is a live one. Never infers availability from anything else.
 */
@Injectable()
export class StationAvailabilityService {
  private readonly logger = new Logger(StationAvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AVAILABILITY_PROVIDER) private readonly provider: AvailabilityProvider,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  providerInfo(): { configured: boolean; provider: string | null } {
    return {
      configured: this.provider.isLive,
      provider: this.provider.isLive ? this.provider.name : null,
    };
  }

  /** Newest observation per connector and per charge point for these stations. */
  private async newestObservations(stationIds: string[]): Promise<{
    byConnector: Map<string, ObservationLike>;
    byPoint: Map<string, ObservationLike>;
  }> {
    const byConnector = new Map<string, ObservationLike>();
    const byPoint = new Map<string, ObservationLike>();
    if (stationIds.length === 0) return { byConnector, byPoint };
    const ids = Prisma.join(stationIds.map((id) => Prisma.sql`${id}::uuid`));
    const rows = await this.prisma.$queryRaw<ObservationRow[]>(Prisma.sql`
      (SELECT DISTINCT ON (o."connector_id") o."station_id"::text, o."connector_id"::text,
              o."charging_point_id"::text, o."provider", o."status", o."observed_at", o."expires_at"
         FROM "availability_observations" o
        WHERE o."station_id" IN (${ids}) AND o."connector_id" IS NOT NULL
        ORDER BY o."connector_id", o."observed_at" DESC, o."received_at" DESC)
      UNION ALL
      (SELECT DISTINCT ON (o."charging_point_id") o."station_id"::text, NULL,
              o."charging_point_id"::text, o."provider", o."status", o."observed_at", o."expires_at"
         FROM "availability_observations" o
        WHERE o."station_id" IN (${ids}) AND o."connector_id" IS NULL
          AND o."charging_point_id" IS NOT NULL
        ORDER BY o."charging_point_id", o."observed_at" DESC, o."received_at" DESC)`);
    for (const r of rows) {
      const obs: ObservationLike = {
        provider: r.provider,
        status: r.status as LiveAvailabilityStatus,
        observedAt: r.observed_at,
        expiresAt: r.expires_at,
      };
      if (r.connector_id) byConnector.set(r.connector_id, obs);
      else if (r.charging_point_id) byPoint.set(r.charging_point_id, obs);
    }
    return { byConnector, byPoint };
  }

  /**
   * Public availability view of every connector: the connector's own newest
   * observation, else its charge point's; expired → unknown.
   */
  async connectorViews(connectors: ConnectorRef[]): Promise<Map<string, ConnectorAvailabilityView>> {
    const now = this.clock.now();
    const stationIds = [...new Set(connectors.map((c) => c.stationId))];
    const { byConnector, byPoint } = await this.newestObservations(stationIds);
    const out = new Map<string, ConnectorAvailabilityView>();
    for (const c of connectors) {
      const own = byConnector.get(c.id);
      const point = c.chargingPointId ? byPoint.get(c.chargingPointId) : undefined;
      // The newer of the connector's and its point's observation wins.
      const newest =
        own && point ? (own.observedAt >= point.observedAt ? own : point) : (own ?? point);
      out.set(c.id, connectorAvailability(newest, now));
    }
    return out;
  }

  summarize(views: ConnectorAvailabilityView[], lang: SupportedLanguage): StationAvailabilityView {
    const counts = countAvailability(views);
    const live = views.filter((v) => v.freshness === 'live');
    const lastObserved = views
      .map((v) => v.observedAt)
      .filter((v): v is string => v !== null)
      .sort()
      .pop();
    return {
      ...this.providerInfoView(),
      isLive: live.length > 0,
      status: stationStatusOf(counts),
      counts,
      lastObservedAt: lastObserved ?? null,
      disclaimer: tr(AVAILABILITY_DISCLAIMER, lang),
    };
  }

  private providerInfoView(): { liveProviderConfigured: boolean; provider: string | null } {
    const info = this.providerInfo();
    return { liveProviderConfigured: info.configured, provider: info.provider };
  }

  // --- ingestion ---------------------------------------------------------------------

  /**
   * Stores observations from a live feed (partner push / OCPI adapter).
   * Each observation needs a resolvable target that belongs to one station;
   * `expiresAt` defaults to observedAt + 10 min and is capped at 24 h.
   * Future-dated observations (> 1 min) are refused.
   */
  async ingest(
    provider: string,
    inputs: ObservationInput[],
  ): Promise<{ stored: number; ignoredExpired: number; ids: string[] }> {
    if (!PROVIDER_RE.test(provider)) {
      throw fieldError('provider', 'format', {
        ar: 'اسم المزود بصيغة partner:name (حروف صغيرة وأرقام).',
        en: 'Provider must look like partner:name (lower-case letters and digits).',
      });
    }
    const now = this.clock.now();
    const rows: Prisma.AvailabilityObservationCreateManyInput[] = [];
    let ignoredExpired = 0;
    for (const [index, input] of inputs.entries()) {
      const target = await this.resolveTarget(input, index);
      const observedAt = new Date(input.observedAt);
      if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + 60_000) {
        throw fieldError(`observations[${index}].observedAt`, 'notFuture', {
          ar: 'وقت الرصد غير صالح أو في المستقبل.',
          en: 'The observation time is invalid or in the future.',
        });
      }
      let expiresAt: Date;
      if (input.expiresAt) {
        expiresAt = new Date(input.expiresAt);
      } else {
        const ttl = input.ttlSeconds ?? DEFAULT_OBSERVATION_TTL_SECONDS;
        expiresAt = new Date(observedAt.getTime() + ttl * 1000);
      }
      const maxExpiry = observedAt.getTime() + MAX_OBSERVATION_TTL_SECONDS * 1000;
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= observedAt.getTime()) {
        throw fieldError(`observations[${index}].expiresAt`, 'afterObserved', {
          ar: 'يجب أن تنتهي الصلاحية بعد وقت الرصد.',
          en: 'The expiry must be after the observation time.',
        });
      }
      if (expiresAt.getTime() > maxExpiry) expiresAt = new Date(maxExpiry);
      if (expiresAt.getTime() <= now.getTime()) {
        // Already stale: storing it would only ever read as "unknown".
        ignoredExpired += 1;
        continue;
      }
      rows.push({
        provider,
        stationId: target.stationId,
        chargingPointId: target.chargingPointId,
        connectorId: target.connectorId,
        status: input.status,
        observedAt,
        expiresAt,
        rawPayload: { status: input.status, observedAt: input.observedAt },
      });
    }
    const created =
      rows.length > 0
        ? await this.prisma.availabilityObservation.createManyAndReturn({
            data: rows,
            select: { id: true },
          })
        : [];
    return { stored: created.length, ignoredExpired, ids: created.map((c) => c.id) };
  }

  private async resolveTarget(
    input: ObservationInput,
    index: number,
  ): Promise<{ stationId: string; chargingPointId: string | null; connectorId: string | null }> {
    const fail = () =>
      fieldError(`observations[${index}]`, 'target', {
        ar: 'تعذر تحديد المحطة أو المنفذ لهذه القراءة.',
        en: 'The station or connector of this observation could not be resolved.',
      });
    if (input.connectorId) {
      const c = await this.prisma.connector.findUnique({
        where: { id: input.connectorId },
        select: { stationId: true, chargingPointId: true },
      });
      if (!c || (input.stationId && input.stationId !== c.stationId)) throw fail();
      return { stationId: c.stationId, chargingPointId: c.chargingPointId, connectorId: input.connectorId };
    }
    if (input.chargingPointId || input.evseId) {
      const p = await this.prisma.chargingPoint.findFirst({
        where: input.chargingPointId ? { id: input.chargingPointId } : { evseId: input.evseId },
        select: { id: true, stationId: true },
      });
      if (!p || (input.stationId && input.stationId !== p.stationId)) throw fail();
      return { stationId: p.stationId, chargingPointId: p.id, connectorId: null };
    }
    if (input.external) {
      const rec = await this.prisma.providerRecord.findUnique({
        where: {
          provider_externalId: {
            provider: input.external.provider,
            externalId: input.external.externalId,
          },
        },
        select: { stationId: true, connectorId: true, chargingPointId: true },
      });
      if (!rec?.stationId || (!rec.connectorId && !rec.chargingPointId)) throw fail();
      return {
        stationId: rec.stationId,
        chargingPointId: rec.chargingPointId,
        connectorId: rec.connectorId,
      };
    }
    // A station-level status cannot say which connector is free: refused.
    throw fail();
  }

  /**
   * Pulls readings from the configured AvailabilityProvider for these
   * stations and stores them (only when it is a LIVE provider; the default
   * "none" provider returns unknown for everything and nothing is stored).
   */
  async refreshFromProvider(stationIds: string[]): Promise<{ provider: string; stored: number }> {
    if (!this.provider.isLive || stationIds.length === 0) {
      return { provider: this.provider.name, stored: 0 };
    }
    const connectors = await this.prisma.connector.findMany({
      where: { stationId: { in: stationIds } },
      select: { id: true, stationId: true, chargingPointId: true },
    });
    const readings = await this.provider.getAvailability(
      connectors.map((c) => ({
        stationId: c.stationId,
        chargingPointId: c.chargingPointId,
        connectorId: c.id,
      })),
    );
    const inputs: ObservationInput[] = readings
      .filter((r) => r.status !== 'unknown' && r.observedAt)
      .map((r) => ({
        stationId: r.target.stationId,
        connectorId: r.target.connectorId ?? undefined,
        chargingPointId: r.target.connectorId ? undefined : (r.target.chargingPointId ?? undefined),
        status: r.status,
        observedAt: r.observedAt as string,
        expiresAt: r.expiresAt ?? undefined,
      }));
    const provider = PROVIDER_RE.test(this.provider.name) ? this.provider.name : 'live';
    const result = await this.ingest(provider, inputs);
    return { provider, stored: result.stored };
  }

  /** Deletes observations older than the retention window. */
  async purgeOld(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - OBSERVATION_RETENTION_DAYS * 86_400_000);
    const res = await this.prisma.availabilityObservation.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (res.count > 0) this.logger.log(`Purged ${res.count} expired availability observations`);
    return res.count;
  }
}
