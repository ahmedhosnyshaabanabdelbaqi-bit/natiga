import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { paginated } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  CheckinOutcome,
  ModerationStatus,
  ReportStatus,
  StationReportType,
  StationSuggestionStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import type { AuthUser } from '../../auth';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { label, REPORT_TYPES } from '../common/labels';
import { fieldError, StationErrors } from '../common/station-errors';
import { iso, num } from '../common/values';
import type {
  AdminCheckinListQueryDto,
  AdminReportListQueryDto,
  AdminSuggestionListQueryDto,
  ApproveSuggestionDto,
  CreateConnectorDto,
  DuplicateSuggestionDto,
  RejectSuggestionDto,
  UpdateCheckinDto,
  UpdateReportDto,
} from '../dto/admin.dto';
import { StationAdminService } from './station-admin.service';
import { StationCommunityService } from './station-community.service';
import { StationDetailService } from './station-detail.service';

const REPORT_INCLUDE = {
  station: { select: { id: true, name: true, publicationStatus: true } },
  connector: { select: { id: true, connectorTypeCode: true, currentType: true } },
  user: { select: { id: true, displayName: true } },
  resolvedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.StationReportInclude;

interface SuggestedConnector {
  connectorTypeCode: string;
  currentType: 'AC' | 'DC';
  maxPowerKw: number | null;
  quantity: number | null;
}

/**
 * Moderation of community data about stations: reports (open → in_review →
 * resolved | rejected), check-ins (approved / hidden…) and the review queue
 * of user-suggested stations (approve → new station, reject, duplicate).
 */
@Injectable()
export class StationModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly detail: StationDetailService,
    private readonly admin: StationAdminService,
    private readonly community: StationCommunityService,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  // --- reports -----------------------------------------------------------------------------

  private reportView(
    r: Prisma.StationReportGetPayload<{ include: typeof REPORT_INCLUDE }>,
    lang: SupportedLanguage,
    labels: Map<string, { ar: string; en: string }>,
  ) {
    return {
      id: r.id,
      station: r.station,
      connector: r.connector,
      reporter: r.user,
      type: r.type,
      typeLabel: labels.get(r.type)?.[lang] ?? label(REPORT_TYPES, r.type, lang),
      description: r.description,
      suggestedData: r.suggestedData,
      photoAssetId: r.photoAssetId,
      status: r.status,
      resolvedBy: r.resolvedBy,
      resolvedAt: iso(r.resolvedAt),
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async listReports(q: AdminReportListQueryDto, lang: SupportedLanguage) {
    const page = toPageRequest(q);
    const where: Prisma.StationReportWhereInput = {
      ...(q.status?.length ? { status: { in: q.status as ReportStatus[] } } : {}),
      ...(q.type?.length ? { type: { in: q.type as StationReportType[] } } : {}),
      ...(q.stationId ? { stationId: q.stationId } : {}),
    };
    const [rows, total, labels] = await Promise.all([
      this.prisma.stationReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: REPORT_INCLUDE,
      }),
      this.prisma.stationReport.count({ where }),
      this.detail.reportLabels(),
    ]);
    return paginated(
      rows.map((r) => this.reportView(r, lang, labels)),
      total,
      page,
    );
  }

  async getReport(id: string, lang: SupportedLanguage) {
    const r = await this.prisma.stationReport.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });
    if (!r) throw StationErrors.notFound('station_report');
    return this.reportView(r, lang, await this.detail.reportLabels());
  }

  async updateReport(
    id: string,
    dto: UpdateReportDto,
    moderatorId: string,
    lang: SupportedLanguage,
  ) {
    const before = await this.prisma.stationReport.findUnique({ where: { id } });
    if (!before) throw StationErrors.notFound('station_report');
    const closing = dto.status === 'resolved' || dto.status === 'rejected';
    const after = await this.prisma.stationReport.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote,
        resolvedAt: closing ? this.clock.now() : null,
        resolvedById: closing ? moderatorId : null,
      },
    });
    this.audit.annotate({
      entityType: 'station_report',
      entityId: id,
      before: { status: before.status, resolutionNote: before.resolutionNote },
      after: { status: after.status, resolutionNote: after.resolutionNote },
    });
    return this.getReport(id, lang);
  }

  // --- check-ins ---------------------------------------------------------------------------

  async listCheckins(q: AdminCheckinListQueryDto) {
    const page = toPageRequest(q);
    const where: Prisma.StationCheckinWhereInput = {
      ...(q.status?.length ? { status: { in: q.status as ModerationStatus[] } } : {}),
      ...(q.outcome?.length ? { outcome: { in: q.outcome as CheckinOutcome[] } } : {}),
      ...(q.stationId ? { stationId: q.stationId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stationCheckin.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: {
          station: { select: { id: true, name: true } },
          user: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.stationCheckin.count({ where }),
    ]);
    return paginated(
      rows.map((c) => ({
        id: c.id,
        station: c.station,
        user: c.user,
        outcome: c.outcome,
        connectorId: c.connectorId,
        variantId: c.variantId,
        observedPowerKw: num(c.observedPowerKw),
        waitMinutes: c.waitMinutes,
        comment: c.comment,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page,
    );
  }

  async updateCheckin(id: string, dto: UpdateCheckinDto) {
    const before = await this.prisma.stationCheckin.findUnique({ where: { id } });
    if (!before) throw StationErrors.notFound('station_checkin');
    const after = await this.prisma.stationCheckin.update({
      where: { id },
      data: { status: dto.status },
    });
    this.audit.annotate({
      entityType: 'station_checkin',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return {
      id: after.id,
      stationId: after.stationId,
      outcome: after.outcome,
      status: after.status,
      comment: after.comment,
      createdAt: after.createdAt.toISOString(),
    };
  }

  // --- suggestions -------------------------------------------------------------------------

  private suggestionView(
    s: Prisma.StationSuggestionGetPayload<{
      include: { user: { select: { id: true; displayName: true } } };
    }>,
  ) {
    return {
      id: s.id,
      status: s.status,
      user: s.user,
      name: s.name,
      operatorName: s.operatorName,
      latitude: s.latitude,
      longitude: s.longitude,
      addressText: s.addressText,
      city: s.city,
      countryCode: s.countryCode,
      marketCode: s.marketCode,
      accessType: s.accessType,
      connectors: s.connectors,
      openingHoursText: s.openingHoursText,
      notes: s.notes,
      photoAssetId: s.photoAssetId,
      reviewedById: s.reviewedById,
      reviewedAt: iso(s.reviewedAt),
      reviewNote: s.reviewNote,
      createdStationId: s.createdStationId,
      duplicateOfStationId: s.duplicateOfStationId,
      isDemo: s.isDemo,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async listSuggestions(q: AdminSuggestionListQueryDto) {
    const page = toPageRequest(q);
    const where: Prisma.StationSuggestionWhereInput = q.status?.length
      ? { status: { in: q.status as StationSuggestionStatus[] } }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.stationSuggestion.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: { user: { select: { id: true, displayName: true } } },
      }),
      this.prisma.stationSuggestion.count({ where }),
    ]);
    return paginated(
      rows.map((s) => this.suggestionView(s)),
      total,
      page,
    );
  }

  async getSuggestion(id: string, lang: SupportedLanguage) {
    const s = await this.prisma.stationSuggestion.findUnique({
      where: { id },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (!s) throw StationErrors.notFound('station_suggestion');
    return {
      ...this.suggestionView(s),
      // Any station (published or not) within 150 m, for the reviewer.
      nearbyStations: await this.nearbyAny(s.latitude, s.longitude, lang),
    };
  }

  private async nearbyAny(lat: number, lng: number, lang: SupportedLanguage) {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; publication_status: string; d: number }[]
    >`
      SELECT s."id"::text, s."name", s."publication_status"::text,
             ST_Distance(s."location", ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography) AS "d"
        FROM "charging_stations" s
       WHERE s."deleted_at" IS NULL AND s."duplicate_of_id" IS NULL
         AND ST_DWithin(s."location", ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography, 150)
       ORDER BY "d" LIMIT 10`;
    void lang;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      publicationStatus: r.publication_status,
      distanceM: Math.round(Number(r.d)),
    }));
  }

  private async pending(id: string) {
    const s = await this.prisma.stationSuggestion.findUnique({ where: { id } });
    if (!s) throw StationErrors.notFound('station_suggestion');
    if (s.status !== 'pending') throw StationErrors.suggestionNotPending();
    return s;
  }

  /** Creates a station from the suggestion (+ reviewer edits) and closes it. */
  async approveSuggestion(
    id: string,
    dto: ApproveSuggestionDto,
    user: AuthUser,
    lang: SupportedLanguage,
  ) {
    const s = await this.pending(id);
    const suggested = (Array.isArray(s.connectors)
      ? s.connectors
      : []) as unknown as SuggestedConnector[];
    const connectors: CreateConnectorDto[] =
      dto.createConnectors === false
        ? []
        : suggested.map((c) => ({
            connectorTypeCode: c.connectorTypeCode,
            currentType: c.currentType,
            maxPowerKw: c.maxPowerKw ?? null,
            quantity: c.quantity ?? 1,
          }));
    const { reviewNote, createConnectors: _c, ...rest } = dto;
    // Only fields the reviewer actually sent override the suggestion.
    const overrides = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    ) as Omit<ApproveSuggestionDto, 'reviewNote' | 'createConnectors'>;
    const station = await this.admin.create(
      {
        name: overrides.name ?? s.name,
        latitude: overrides.latitude ?? s.latitude,
        longitude: overrides.longitude ?? s.longitude,
        countryCode: overrides.countryCode ?? s.countryCode,
        marketCode: overrides.marketCode !== undefined ? overrides.marketCode : s.marketCode,
        addressLine: overrides.addressLine !== undefined ? overrides.addressLine : s.addressText,
        city: overrides.city !== undefined ? overrides.city : s.city,
        accessType: overrides.accessType ?? s.accessType,
        openingHoursText:
          overrides.openingHoursText !== undefined
            ? overrides.openingHoursText
            : s.openingHoursText,
        ...overrides,
        lastVerifiedAt: overrides.lastVerifiedAt ?? null,
        attribution:
          overrides.attribution ?? 'Suggested by an app user; reviewed by EV Car News staff',
        operationalStatus: overrides.operationalStatus ?? 'unknown',
        connectors,
      },
      user,
    );
    await this.prisma.chargingStation.update({
      where: { id: station.id },
      data: { dataSource: 'user_suggestion' },
    });
    const now = this.clock.now();
    const updated = await this.prisma.stationSuggestion.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'approved',
        reviewedAt: now,
        reviewedById: user.id,
        reviewNote: reviewNote ?? null,
        createdStationId: station.id,
      },
    });
    if (updated.count === 0) throw StationErrors.suggestionNotPending();
    this.audit.annotate({
      entityType: 'station_suggestion',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'approved', createdStationId: station.id },
    });
    return {
      suggestion: await this.getSuggestion(id, lang),
      station: await this.admin.get(station.id),
    };
  }

  async rejectSuggestion(
    id: string,
    dto: RejectSuggestionDto,
    reviewerId: string,
    lang: SupportedLanguage,
  ) {
    await this.pending(id);
    await this.prisma.stationSuggestion.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedAt: this.clock.now(),
        reviewedById: reviewerId,
        reviewNote: dto.reviewNote ?? null,
      },
    });
    this.audit.annotate({
      entityType: 'station_suggestion',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'rejected' },
    });
    return this.getSuggestion(id, lang);
  }

  async markSuggestionDuplicate(
    id: string,
    dto: DuplicateSuggestionDto,
    reviewerId: string,
    lang: SupportedLanguage,
  ) {
    await this.pending(id);
    const station = await this.prisma.chargingStation.findFirst({
      where: { id: dto.stationId, deletedAt: null },
      select: { id: true },
    });
    if (!station) {
      throw fieldError('stationId', 'exists', { ar: 'المحطة غير موجودة.', en: 'Unknown station.' });
    }
    await this.prisma.stationSuggestion.update({
      where: { id },
      data: {
        status: 'duplicate',
        reviewedAt: this.clock.now(),
        reviewedById: reviewerId,
        reviewNote: dto.reviewNote ?? null,
        duplicateOfStationId: dto.stationId,
      },
    });
    this.audit.annotate({
      entityType: 'station_suggestion',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'duplicate', duplicateOfStationId: dto.stationId },
    });
    return this.getSuggestion(id, lang);
  }

  /** Exposed for the controller: suggested connector types must still exist. */
  assertConnectors(connectors: { connectorTypeCode: string; currentType: 'AC' | 'DC' }[]) {
    return this.community.assertConnectorTypes(connectors);
  }
}
