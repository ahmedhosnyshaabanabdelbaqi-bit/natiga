import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { tr } from '../../../common/validation/messages';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { STATION_SOURCES } from '../../../providers/provider-tokens';
import type { StationSourceRegistry } from '../../../providers/stations/station-source.registry';
import type { ConnectorAvailabilityView } from '../common/availability';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { connectorCompatibility, type InletLike } from '../common/compatibility';
import {
  ACCESS_TYPES,
  AMENITIES,
  CHECKIN_OUTCOMES,
  COMMUNITY_DISCLAIMER,
  label,
  labelled,
  OPERATIONAL_STATUSES,
  PAYMENT_METHODS,
  PRICE_UNITS,
  REPORT_TYPES,
  START_METHODS,
  TARIFF_COMPONENTS,
} from '../common/labels';
import { evaluateOpenNow, type OpeningHours, weeklyView } from '../common/opening-hours';
import { STATION_IMAGE_INCLUDE, StationMediaService } from '../common/station-media';
import { StationErrors } from '../common/station-errors';
import { iso, isUuid, money, num, pick } from '../common/values';
import type {
  ConnectorDto,
  StationAvailabilityResponseDto,
  StationCommunityDto,
  StationDetailDto,
  StationDetailQueryDto,
  TariffDto,
} from '../dto/public.dto';
import { StationAvailabilityService } from './station-availability.service';
import { VehicleCompatService } from './vehicle-compat.service';

const DETAIL_INCLUDE = {
  operator: true,
  points: { orderBy: [{ label: 'asc' }, { createdAt: 'asc' }] },
  connectors: {
    include: { connectorType: { select: { code: true, nameAr: true, nameEn: true } } },
    orderBy: [{ currentType: 'desc' }, { maxPowerKw: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
  },
  tariffs: {
    include: {
      elements: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      source: { select: { id: true, title: true, publisher: true, url: true } },
    },
    orderBy: [{ validFrom: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  },
  media: {
    where: { status: 'approved' },
    include: { asset: { include: STATION_IMAGE_INCLUDE } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  providerRecords: {
    where: { entityType: 'station' },
    orderBy: { lastSeenAt: 'desc' },
  },
} satisfies Prisma.ChargingStationInclude;

type DetailStation = Prisma.ChargingStationGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type DetailConnector = DetailStation['connectors'][number];

const COMMUNITY_RECENT = 10;
const REPORT_WINDOW_DAYS = 90;
const SUCCESS_RATE_MIN = 3;

/**
 * Station page (REQUIREMENTS §10–11): location, operator, access, hours +
 * time zone + open now, contact, photos with credit, services, start and
 * payment methods, charge points → connectors (AC/DC, power), tariffs by
 * unit with fees and taxes, provenance + licence, and the three separate
 * statuses (operational / open now / live availability). Community data is
 * a separate, dated section.
 */
@Injectable()
export class StationDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: StationAvailabilityService,
    private readonly compat: VehicleCompatService,
    private readonly media: StationMediaService,
    @Inject(STATION_SOURCES) private readonly sources: StationSourceRegistry,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  /** Published station by id or slug (404 otherwise; merged → STATION_MERGED). */
  async findPublic(idOrSlug: string): Promise<{ id: string }> {
    const where: Prisma.ChargingStationWhereInput = isUuid(idOrSlug)
      ? { id: idOrSlug.toLowerCase() }
      : { slug: idOrSlug };
    const s = await this.prisma.chargingStation.findFirst({
      where: { ...where, deletedAt: null },
      select: { id: true, publicationStatus: true, duplicateOfId: true },
    });
    if (!s) throw StationErrors.notFound();
    if (s.duplicateOfId) {
      // Follow the merge chain to a public station (old links / favorites).
      const target = await this.prisma.chargingStation.findFirst({
        where: { id: s.duplicateOfId, deletedAt: null, publicationStatus: 'published' },
        select: { id: true },
      });
      if (target) throw StationErrors.merged(target.id);
      throw StationErrors.notFound();
    }
    if (s.publicationStatus !== 'published') throw StationErrors.notFound();
    return { id: s.id };
  }

  async detail(
    idOrSlug: string,
    q: StationDetailQueryDto,
    lang: SupportedLanguage,
    market: string,
    userId: string | undefined,
  ): Promise<StationDetailDto> {
    const { id } = await this.findPublic(idOrSlug);
    const [s, vehicle] = await Promise.all([
      this.prisma.chargingStation.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE }),
      this.compat.resolve(q, market, userId, lang),
    ]);
    const now = this.clock.now();

    const views = await this.availability.connectorViews(s.connectors);
    const connectorView = (c: DetailConnector): ConnectorDto =>
      this.connectorDto(c, views.get(c.id), vehicle?.inlets ?? null, lang);
    const points = s.points.map((p) => ({
      id: p.id,
      label: p.label,
      evseId: p.evseId,
      floorLevel: p.floorLevel,
      parkingRestrictions: p.parkingRestrictions,
      operationalStatus: p.operationalStatus,
      connectors: s.connectors.filter((c) => c.chargingPointId === p.id).map(connectorView),
    }));
    const unassigned = s.connectors.filter((c) => c.chargingPointId === null).map(connectorView);

    let distanceM: number | null = null;
    if (q.lat !== undefined && q.lng !== undefined) {
      const rows = await this.prisma.$queryRaw<{ d: number }[]>(Prisma.sql`
        SELECT ST_Distance("location", ST_SetSRID(ST_MakePoint(${q.lng}::double precision, ${q.lat}::double precision), 4326)::geography) AS "d"
          FROM "charging_stations" WHERE "id" = ${id}::uuid`);
      distanceM = rows[0] ? Math.round(Number(rows[0].d)) : null;
    }

    const photos = s.media
      .map((m) => this.media.image(m.asset, lang, m.caption))
      .filter((p) => p !== null);

    return {
      id: s.id,
      slug: s.slug,
      name: pick(lang, s.nameAr, s.nameEn) ?? s.name,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      isDemo: s.isDemo,
      operator: s.operator
        ? {
            id: s.operator.id,
            name: pick(lang, s.operator.nameAr, s.operator.name) ?? s.operator.name,
            websiteUrl: s.operator.websiteUrl,
            phone: s.operator.phone,
            email: s.operator.email,
          }
        : null,
      latitude: s.latitude,
      longitude: s.longitude,
      distanceM,
      address: {
        line: pick(lang, s.addressAr, s.addressEn) ?? s.addressLine,
        city: s.city,
        region: s.region,
        postalCode: s.postalCode,
        countryCode: s.countryCode,
        marketCode: s.marketCode,
      },
      accessEntranceNote: s.accessEntranceNote,
      accessType: s.accessType,
      accessTypeLabel: label(ACCESS_TYPES, s.accessType, lang),
      accessRestrictions: s.accessRestrictions,
      hours: {
        timezone: s.timezone,
        isAlwaysOpen: s.isAlwaysOpen,
        openingHoursText: s.openingHoursText,
        weekly: weeklyView(s.openingHours as OpeningHours | null),
        openNow: evaluateOpenNow(
          s.openingHours as OpeningHours | null,
          s.isAlwaysOpen,
          s.timezone,
          now,
        ),
      },
      contact: {
        phone: s.phone ?? s.operator?.phone ?? null,
        email: s.email ?? null,
        websiteUrl: s.websiteUrl ?? null,
      },
      photos,
      amenities: labelled(AMENITIES, s.amenities, lang),
      paymentMethods: labelled(PAYMENT_METHODS, s.paymentMethods, lang),
      startMethods: labelled(START_METHODS, s.startMethods, lang),
      operationalStatus: s.operationalStatus,
      operationalStatusLabel: label(OPERATIONAL_STATUSES, s.operationalStatus, lang),
      points,
      unassignedConnectors: unassigned,
      pointCount: s.points.length > 0 ? s.points.length : s.publishedPointCount,
      connectorCount: s.connectors.reduce((sum, c) => sum + c.quantity, 0),
      tariffs: s.tariffs.map((t) => this.tariffDto(t, now, lang)),
      usageCostText: s.usageCostText,
      availability: this.availability.summarize([...views.values()], lang),
      source: this.sourceInfo(s),
      community: await this.community(s.id, lang, now),
      compatibility: vehicle?.view ?? null,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private connectorDto(
    c: DetailConnector,
    view: ConnectorAvailabilityView | undefined,
    inlets: InletLike[] | null,
    lang: SupportedLanguage,
  ): ConnectorDto {
    const maxPowerKw = num(c.maxPowerKw);
    return {
      id: c.id,
      chargingPointId: c.chargingPointId,
      connectorType: {
        code: c.connectorTypeCode,
        name: pick(lang, c.connectorType.nameAr, c.connectorType.nameEn) ?? c.connectorTypeCode,
      },
      currentType: c.currentType,
      maxPowerKw,
      maxVoltage: c.maxVoltage,
      maxAmperage: c.maxAmperage,
      phases: c.phases,
      format: c.format,
      quantity: c.quantity,
      operationalStatus: c.operationalStatus,
      availability: view ?? {
        status: 'unknown',
        providerStatus: null,
        freshness: 'none',
        source: null,
        observedAt: null,
        expiresAt: null,
      },
      compatibility: inlets
        ? connectorCompatibility(
            { connectorTypeCode: c.connectorTypeCode, currentType: c.currentType, maxPowerKw },
            inlets,
          )
        : null,
    };
  }

  tariffDto(t: DetailStation['tariffs'][number], now: Date, lang: SupportedLanguage): TariffDto {
    const current =
      (t.validFrom === null || t.validFrom.getTime() <= now.getTime()) &&
      (t.validTo === null || t.validTo.getTime() > now.getTime());
    return {
      id: t.id,
      name: t.name,
      chargingPointId: t.chargingPointId,
      connectorId: t.connectorId,
      currency: t.currencyCode,
      validFrom: iso(t.validFrom),
      validTo: iso(t.validTo),
      isCurrent: current,
      taxIncluded: t.taxIncluded,
      taxPercent: num(t.taxPercent),
      notes: t.notes,
      reliability: t.reliability,
      verifiedAt: iso(t.verifiedAt),
      source: t.source
        ? { id: t.source.id, title: t.source.title, publisher: t.source.publisher, url: t.source.url }
        : null,
      isDemo: t.isDemo,
      elements: t.elements.map((e) => ({
        componentType: e.componentType,
        componentLabel: label(TARIFF_COMPONENTS, e.componentType, lang),
        price: money(e.price, t.currencyCode),
        priceUnit: e.priceUnit,
        unitLabel: label(PRICE_UNITS, e.priceUnit, lang),
        stepSize: e.stepSize,
        graceMinutes: e.graceMinutes,
        minPowerKw: num(e.minPowerKw),
        maxPowerKw: num(e.maxPowerKw),
        currentType: e.currentType,
        startTime: e.startTime,
        endTime: e.endTime,
        daysOfWeek: e.daysOfWeek,
      })),
    };
  }

  private sourceInfo(s: DetailStation): StationDetailDto['source'] {
    const displayName = (provider: string) =>
      this.sources.get(provider)?.displayName ??
      (provider === 'demo' ? 'Demo data (fictional)' : provider);
    const dates = [s.updatedAt, ...s.providerRecords.map((p) => p.lastSyncedAt)].filter(
      (d): d is Date => d instanceof Date,
    );
    return {
      dataSource: s.dataSource,
      license: s.dataLicense,
      attribution: s.attribution,
      lastVerifiedAt: iso(s.lastVerifiedAt),
      sourceUpdatedAt: iso(s.sourceUpdatedAt),
      lastUpdated: new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString(),
      providers: s.providerRecords.map((p) => ({
        provider: p.provider,
        displayName: displayName(p.provider),
        sourceUrl: p.sourceUrl,
        license: p.dataLicense,
        licenseUrl: p.licenseUrl,
        attribution: p.attribution,
        lastSyncedAt: iso(p.lastSyncedAt),
      })),
    };
  }

  /** Dated community data (never live evidence): approved check-ins + recent reports. */
  async community(
    stationId: string,
    lang: SupportedLanguage,
    now: Date,
  ): Promise<StationCommunityDto> {
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const since90 = new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000);
    const approved = { stationId, status: 'approved' as const };
    const [total, last30, recent, outcomes30, openCount, reports, reasons] = await Promise.all([
      this.prisma.stationCheckin.count({ where: approved }),
      this.prisma.stationCheckin.count({ where: { ...approved, createdAt: { gte: since30 } } }),
      this.prisma.stationCheckin.findMany({
        where: approved,
        orderBy: { createdAt: 'desc' },
        take: COMMUNITY_RECENT,
        include: {
          connector: {
            select: {
              connectorTypeCode: true,
              currentType: true,
              connectorType: { select: { nameAr: true, nameEn: true } },
            },
          },
          variant: {
            select: {
              id: true,
              slug: true,
              nameAr: true,
              nameEn: true,
              status: true,
              deletedAt: true,
              modelYear: {
                select: {
                  year: true,
                  generation: {
                    select: {
                      model: {
                        select: {
                          nameAr: true,
                          nameEn: true,
                          brand: { select: { nameAr: true, nameEn: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.stationCheckin.groupBy({
        by: ['outcome'],
        where: { ...approved, createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.stationReport.count({
        where: { stationId, status: { in: ['open', 'in_review'] } },
      }),
      this.prisma.stationReport.findMany({
        where: { stationId, createdAt: { gte: since90 }, status: { not: 'rejected' } },
        orderBy: { createdAt: 'desc' },
        take: COMMUNITY_RECENT,
        select: { id: true, type: true, status: true, createdAt: true },
      }),
      this.reportLabels(),
    ]);
    const success = outcomes30
      .filter((o) => o.outcome === 'charged_successfully' || o.outcome === 'waited_then_charged')
      .reduce((s, o) => s + o._count._all, 0);
    const counted = outcomes30
      .filter((o) => o.outcome !== 'other')
      .reduce((s, o) => s + o._count._all, 0);

    return {
      isLive: false,
      disclaimer: tr(COMMUNITY_DISCLAIMER, lang),
      checkins: {
        total,
        last30Days: last30,
        lastAt: recent[0]?.createdAt.toISOString() ?? null,
        successRate30d:
          counted >= SUCCESS_RATE_MIN ? Math.round((success / counted) * 100) / 100 : null,
        recent: recent.map((c) => {
          const v = c.variant && c.variant.status === 'published' && !c.variant.deletedAt ? c.variant : null;
          const model = v?.modelYear.generation.model;
          return {
            id: c.id,
            outcome: c.outcome,
            outcomeLabel: label(CHECKIN_OUTCOMES, c.outcome, lang),
            connectorType: c.connector
              ? {
                  code: c.connector.connectorTypeCode,
                  name:
                    pick(lang, c.connector.connectorType.nameAr, c.connector.connectorType.nameEn) ??
                    c.connector.connectorTypeCode,
                }
              : null,
            currentType: c.connector?.currentType ?? null,
            observedPowerKw: num(c.observedPowerKw),
            waitMinutes: c.waitMinutes,
            comment: c.comment,
            vehicle:
              v && model
                ? {
                    id: v.id,
                    slug: v.slug,
                    name: [
                      pick(lang, model.brand.nameAr, model.brand.nameEn),
                      pick(lang, model.nameAr, model.nameEn),
                      String(v.modelYear.year),
                      pick(lang, v.nameAr, v.nameEn),
                    ]
                      .filter(Boolean)
                      .join(' '),
                  }
                : null,
            createdAt: c.createdAt.toISOString(),
          };
        }),
      },
      reports: {
        openCount,
        recent: reports.map((r) => ({
          id: r.id,
          type: r.type,
          typeLabel: reasons.get(r.type)?.[lang] ?? label(REPORT_TYPES, r.type, lang),
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    };
  }

  /** Station report labels from report_reasons (scope station), code → {ar,en}. */
  async reportLabels(): Promise<Map<string, { ar: string; en: string }>> {
    const rows = await this.prisma.reportReason.findMany({
      where: { scope: 'station' },
      select: { code: true, labelAr: true, labelEn: true },
    });
    return new Map(rows.map((r) => [r.code, { ar: r.labelAr, en: r.labelEn }]));
  }

  async availabilityOf(idOrSlug: string, lang: SupportedLanguage): Promise<StationAvailabilityResponseDto> {
    const { id } = await this.findPublic(idOrSlug);
    const connectors = await this.prisma.connector.findMany({
      where: { stationId: id },
      select: { id: true, stationId: true, chargingPointId: true },
      orderBy: { createdAt: 'asc' },
    });
    const views = await this.availability.connectorViews(connectors);
    return {
      stationId: id,
      availability: this.availability.summarize([...views.values()], lang),
      connectors: connectors.map((c) => ({
        connectorId: c.id,
        ...(views.get(c.id) as ConnectorAvailabilityView),
      })),
    };
  }
}
