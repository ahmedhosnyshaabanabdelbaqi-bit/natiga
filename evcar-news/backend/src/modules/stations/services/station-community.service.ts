import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig, type SupportedLanguage } from '../../../config/app-config';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { DEDUPE_SEARCH_RADIUS_M } from '../common/dedupe';
import { label, REPORT_TYPES } from '../common/labels';
import { fieldError, StationErrors } from '../common/station-errors';
import { num, pick } from '../common/values';
import type {
  CreateStationCheckinDto,
  CreateStationReportDto,
  CreateStationSuggestionDto,
  MyCheckinDto,
  MyListQueryDto,
  MyReportDto,
  MySuggestionDto,
  SuggestionCreatedDto,
} from '../dto/community.dto';
import { StationDetailService } from './station-detail.service';
import { StationMetaService } from './station-meta.service';

/** Abuse limits of community writes (per signed-in user unless noted). */
export const COMMUNITY_LIMITS = {
  reportsPerUserPerDay: 20,
  reportsPerIpPerDay: 40,
  checkinMinIntervalMs: 10 * 60_000,
  checkinsPerUserPerDay: 50,
  pendingSuggestionsPerUser: 10,
} as const;

const DAY_MS = 86_400_000;
const LINK_RE = /(https?:\/\/|www\.)\S+/i;

/**
 * Community writes about stations (REQUIREMENTS §11): reports (not working,
 * wrong location, different connector, price changed, access restricted,
 * other) that go to moderation, check-ins (dated community data, never live
 * availability) and user-suggested stations (review queue, never on the
 * map until approved). Signed-in users only; IP rate limits on the routes
 * plus per-user limits here; the reporter IP is stored only as an HMAC.
 */
@Injectable()
export class StationCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly detail: StationDetailService,
    private readonly meta: StationMetaService,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  private ipHash(ip: string | undefined): string | null {
    if (!ip) return null;
    return createHmac('sha256', this.config.auth.ipHashSalt || 'evcar-stations')
      .update(`station-report:${ip}`)
      .digest('hex');
  }

  private async assertConnector(stationId: string, connectorId: string | undefined) {
    if (!connectorId) return;
    const c = await this.prisma.connector.findFirst({
      where: { id: connectorId, stationId },
      select: { id: true },
    });
    if (!c) {
      throw fieldError('connectorId', 'belongsToStation', {
        ar: 'المنفذ لا يتبع هذه المحطة.',
        en: 'The connector does not belong to this station.',
      });
    }
  }

  // --- reports ---------------------------------------------------------------------------

  async createReport(
    idOrSlug: string,
    dto: CreateStationReportDto,
    userId: string,
    ip: string | undefined,
    lang: SupportedLanguage,
  ): Promise<MyReportDto> {
    const { id: stationId } = await this.detail.findPublic(idOrSlug);
    await this.assertConnector(stationId, dto.connectorId);
    const reason = await this.meta.reportReason(dto.type);
    const needsDetails = reason ? reason.requiresDetails : dto.type === 'other';
    if (needsDetails && !dto.description) {
      throw fieldError('description', 'required', {
        ar: 'اكتب وصفًا مختصرًا للمشكلة.',
        en: 'Describe the problem briefly.',
      });
    }
    const now = this.clock.now();
    const since = new Date(now.getTime() - DAY_MS);
    const ipHash = this.ipHash(ip);

    const report = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent reports of one user (duplicate / limit checks).
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`station-report:${userId}`}))`;
      const open = await tx.stationReport.findFirst({
        where: { stationId, userId, type: dto.type, status: { in: ['open', 'in_review'] } },
        select: { id: true },
      });
      if (open) throw StationErrors.reportDuplicate(open.id);
      const [byUser, byIp] = await Promise.all([
        tx.stationReport.count({ where: { userId, createdAt: { gte: since } } }),
        ipHash
          ? tx.stationReport.count({ where: { reporterIpHash: ipHash, createdAt: { gte: since } } })
          : Promise.resolve(0),
      ]);
      if (
        byUser >= COMMUNITY_LIMITS.reportsPerUserPerDay ||
        byIp >= COMMUNITY_LIMITS.reportsPerIpPerDay
      ) {
        throw StationErrors.reportLimit();
      }
      return tx.stationReport.create({
        data: {
          stationId,
          connectorId: dto.connectorId ?? null,
          userId,
          type: dto.type,
          description: dto.description ?? null,
          suggestedData: dto.suggestedData
            ? (JSON.parse(JSON.stringify(dto.suggestedData)) as Prisma.InputJsonObject)
            : Prisma.DbNull,
          reporterIpHash: ipHash,
        },
        include: { station: { select: { name: true, nameAr: true, nameEn: true } } },
      });
    });
    return this.myReport(report, lang, await this.detail.reportLabels());
  }

  private myReport(
    r: Prisma.StationReportGetPayload<{
      include: { station: { select: { name: true; nameAr: true; nameEn: true } } };
    }>,
    lang: SupportedLanguage,
    labels: Map<string, { ar: string; en: string }>,
  ): MyReportDto {
    return {
      id: r.id,
      stationId: r.stationId,
      stationName: pick(lang, r.station.nameAr, r.station.nameEn) ?? r.station.name,
      type: r.type,
      typeLabel: labels.get(r.type)?.[lang] ?? label(REPORT_TYPES, r.type, lang),
      status: r.status,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionNote: r.resolutionNote,
    };
  }

  async myReports(
    userId: string,
    q: MyListQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<MyReportDto>> {
    const page = toPageRequest(q);
    const where = { userId };
    const [rows, total, labels] = await Promise.all([
      this.prisma.stationReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
        include: { station: { select: { name: true, nameAr: true, nameEn: true } } },
      }),
      this.prisma.stationReport.count({ where }),
      this.detail.reportLabels(),
    ]);
    return paginated(
      rows.map((r) => this.myReport(r, lang, labels)),
      total,
      page,
    );
  }

  // --- check-ins -------------------------------------------------------------------------

  async createCheckin(
    idOrSlug: string,
    dto: CreateStationCheckinDto,
    userId: string,
  ): Promise<MyCheckinDto> {
    const { id: stationId } = await this.detail.findPublic(idOrSlug);
    await this.assertConnector(stationId, dto.connectorId);
    if (dto.variantId) {
      const v = await this.prisma.vehicleVariant.findFirst({
        where: { id: dto.variantId, status: 'published', deletedAt: null },
        select: { id: true },
      });
      if (!v) throw StationErrors.vehicleNotFound('variantId');
    }
    const now = this.clock.now();
    const checkin = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`station-checkin:${userId}`}))`;
      const last = await tx.stationCheckin.findFirst({
        where: { userId, stationId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (last) {
        const elapsed = now.getTime() - last.createdAt.getTime();
        if (elapsed < COMMUNITY_LIMITS.checkinMinIntervalMs) {
          throw StationErrors.checkinTooSoon((COMMUNITY_LIMITS.checkinMinIntervalMs - elapsed) / 1000);
        }
      }
      const today = await tx.stationCheckin.count({
        where: { userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      });
      if (today >= COMMUNITY_LIMITS.checkinsPerUserPerDay) throw StationErrors.checkinLimit();
      return tx.stationCheckin.create({
        data: {
          stationId,
          userId,
          connectorId: dto.connectorId ?? null,
          variantId: dto.variantId ?? null,
          outcome: dto.outcome,
          observedPowerKw: dto.observedPowerKw ?? null,
          waitMinutes: dto.waitMinutes ?? null,
          comment: dto.comment ?? null,
          // Comments with links wait for a moderator (spam protection).
          status: dto.comment && LINK_RE.test(dto.comment) ? 'pending' : 'approved',
        },
      });
    });
    return {
      id: checkin.id,
      stationId: checkin.stationId,
      outcome: checkin.outcome,
      connectorId: checkin.connectorId,
      variantId: checkin.variantId,
      observedPowerKw: num(checkin.observedPowerKw),
      waitMinutes: checkin.waitMinutes,
      comment: checkin.comment,
      status: checkin.status,
      createdAt: checkin.createdAt.toISOString(),
    };
  }

  // --- suggestions -----------------------------------------------------------------------

  private mySuggestion(s: {
    id: string;
    status: string;
    name: string;
    latitude: number;
    longitude: number;
    countryCode: string;
    createdAt: Date;
    reviewedAt: Date | null;
    reviewNote: string | null;
    createdStationId: string | null;
    duplicateOfStationId: string | null;
  }): MySuggestionDto {
    return {
      id: s.id,
      status: s.status,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      countryCode: s.countryCode,
      createdAt: s.createdAt.toISOString(),
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
      reviewNote: s.reviewNote,
      createdStationId: s.createdStationId,
      duplicateOfStationId: s.duplicateOfStationId,
    };
  }

  /** Validates suggested / admin connectors against connector_types (code + AC/DC). */
  async assertConnectorTypes(
    connectors: { connectorTypeCode: string; currentType: 'AC' | 'DC' }[],
    field = 'connectors',
  ): Promise<void> {
    if (connectors.length === 0) return;
    const codes = [...new Set(connectors.map((c) => c.connectorTypeCode))];
    const types = await this.prisma.connectorType.findMany({
      where: { code: { in: codes } },
      select: { code: true, supportsAc: true, supportsDc: true },
    });
    const byCode = new Map(types.map((t) => [t.code, t]));
    connectors.forEach((c, i) => {
      const t = byCode.get(c.connectorTypeCode);
      if (!t) {
        throw fieldError(`${field}[${i}].connectorTypeCode`, 'exists', {
          ar: 'نوع الموصل غير معروف.',
          en: 'Unknown connector type.',
        });
      }
      if ((c.currentType === 'AC' && !t.supportsAc) || (c.currentType === 'DC' && !t.supportsDc)) {
        throw fieldError(`${field}[${i}].currentType`, 'supported', {
          ar: 'هذا الموصل لا يدعم نوع التيار المحدد.',
          en: 'This connector type does not support the selected current.',
        });
      }
    });
  }

  async createSuggestion(
    dto: CreateStationSuggestionDto,
    userId: string,
    lang: SupportedLanguage,
  ): Promise<SuggestionCreatedDto> {
    const connectors = dto.connectors ?? [];
    await this.assertConnectorTypes(connectors);
    const market = await this.prisma.market.findUnique({
      where: { code: dto.countryCode },
      select: { code: true },
    });
    const suggestion = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`station-suggestion:${userId}`}))`;
      const pending = await tx.stationSuggestion.count({ where: { userId, status: 'pending' } });
      if (pending >= COMMUNITY_LIMITS.pendingSuggestionsPerUser) {
        throw StationErrors.suggestionLimit();
      }
      return tx.stationSuggestion.create({
        data: {
          userId,
          name: dto.name,
          operatorName: dto.operatorName ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          addressText: dto.addressText ?? null,
          city: dto.city ?? null,
          countryCode: dto.countryCode,
          marketCode: market?.code ?? null,
          accessType: dto.accessType ?? 'unknown',
          connectors: connectors.map((c) => ({
            connectorTypeCode: c.connectorTypeCode,
            currentType: c.currentType,
            maxPowerKw: c.maxPowerKw ?? null,
            quantity: c.quantity ?? null,
          })),
          openingHoursText: dto.openingHoursText ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
    const nearby = await this.nearbyPublished(dto.latitude, dto.longitude, lang);
    return { suggestion: this.mySuggestion(suggestion), possibleDuplicates: nearby };
  }

  /** Published stations within the dedupe radius of a point, nearest first. */
  async nearbyPublished(
    lat: number,
    lng: number,
    lang: SupportedLanguage,
    radiusM = DEDUPE_SEARCH_RADIUS_M,
  ): Promise<{ id: string; name: string; distanceM: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; name_ar: string | null; name_en: string | null; d: number }[]
    >(Prisma.sql`
      SELECT s."id"::text, s."name", s."name_ar", s."name_en",
             ST_Distance(s."location", ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography) AS "d"
        FROM "charging_stations" s
       WHERE s."publication_status" = 'published' AND s."deleted_at" IS NULL AND s."duplicate_of_id" IS NULL
         AND ST_DWithin(s."location", ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography, ${radiusM}::double precision)
       ORDER BY "d" LIMIT 10`);
    return rows.map((r) => ({
      id: r.id,
      name: pick(lang, r.name_ar, r.name_en) ?? r.name,
      distanceM: Math.round(Number(r.d)),
    }));
  }

  async mySuggestions(
    userId: string,
    q: MyListQueryDto,
  ): Promise<PaginatedResponse<MySuggestionDto>> {
    const page = toPageRequest(q);
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.stationSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.stationSuggestion.count({ where }),
    ]);
    return paginated(
      rows.map((s) => this.mySuggestion(s)),
      total,
      page,
    );
  }

  async withdrawSuggestion(id: string, userId: string): Promise<MySuggestionDto> {
    const res = await this.prisma.stationSuggestion.updateMany({
      where: { id, userId, status: 'pending' },
      data: { status: 'withdrawn' },
    });
    const s = await this.prisma.stationSuggestion.findFirst({ where: { id, userId } });
    if (!s) throw StationErrors.notFound('station_suggestion');
    if (res.count === 0) throw StationErrors.suggestionNotPending();
    return this.mySuggestion(s);
  }
}
