import { Inject, Injectable } from '@nestjs/common';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { Prisma } from '../../../generated/prisma/client';
import type {
  StationAccessType,
  StationDataSource,
  StationOperationalStatus,
  StationPublicationStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import type { AuthUser } from '../../auth';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { evaluateOpenNow, type OpeningHours, validateOpeningHours, isValidTimezone } from '../common/opening-hours';
import { fieldError, fieldErrors, StationErrors } from '../common/station-errors';
import { iso, num } from '../common/values';
import type {
  AddStationPhotoDto,
  AdminStationListQueryDto,
  CreateConnectorDto,
  CreateOperatorDto,
  CreatePointDto,
  CreateStationDto,
  CreateStationWithConnectorsDto,
  OperatorListQueryDto,
  UpdateConnectorDto,
  UpdateOperatorDto,
  UpdatePointDto,
  UpdateStationDto,
} from '../dto/admin.dto';
import { StationCommunityService } from './station-community.service';
import { type DuplicateCandidateView, StationDuplicatesService } from './station-duplicates.service';

const ADMIN_INCLUDE = {
  operator: { select: { id: true, name: true, nameAr: true } },
  points: { orderBy: [{ label: 'asc' }, { createdAt: 'asc' }] },
  connectors: { orderBy: [{ createdAt: 'asc' }] },
  media: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  providerRecords: { orderBy: [{ entityType: 'asc' }, { lastSeenAt: 'desc' }], take: 100 },
  _count: { select: { tariffs: true, checkins: true, reports: true } },
} satisfies Prisma.ChargingStationInclude;

type AdminStation = Prisma.ChargingStationGetPayload<{ include: typeof ADMIN_INCLUDE }>;

export const MANUAL_ATTRIBUTION = 'EV Car News editorial data (verified by staff)';

/**
 * Admin maintenance of stations entered and verified by staff (source
 * "manual"), plus charge points, connectors, photos and operators of any
 * station. Publishing needs `stations.publish`; a merged duplicate can
 * never be published; a station without connectors cannot be published.
 */
@Injectable()
export class StationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly duplicates: StationDuplicatesService,
    private readonly community: StationCommunityService,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  // --- views -----------------------------------------------------------------------------

  private async adminView(s: AdminStation, duplicates?: DuplicateCandidateView[]) {
    const openReports = await this.prisma.stationReport.count({
      where: { stationId: s.id, status: { in: ['open', 'in_review'] } },
    });
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      operator: s.operator,
      latitude: s.latitude,
      longitude: s.longitude,
      addressLine: s.addressLine,
      addressAr: s.addressAr,
      addressEn: s.addressEn,
      city: s.city,
      region: s.region,
      postalCode: s.postalCode,
      countryCode: s.countryCode,
      marketCode: s.marketCode,
      accessEntranceNote: s.accessEntranceNote,
      accessType: s.accessType,
      accessRestrictions: s.accessRestrictions,
      openingHours: s.openingHours,
      isAlwaysOpen: s.isAlwaysOpen,
      openingHoursText: s.openingHoursText,
      timezone: s.timezone,
      openNow: evaluateOpenNow(
        s.openingHours as OpeningHours | null,
        s.isAlwaysOpen,
        s.timezone,
        this.clock.now(),
      ),
      phone: s.phone,
      email: s.email,
      websiteUrl: s.websiteUrl,
      paymentMethods: s.paymentMethods,
      startMethods: s.startMethods,
      amenities: s.amenities,
      operationalStatus: s.operationalStatus,
      publicationStatus: s.publicationStatus,
      dataSource: s.dataSource,
      dataLicense: s.dataLicense,
      attribution: s.attribution,
      publishedPointCount: s.publishedPointCount,
      usageCostText: s.usageCostText,
      lastVerifiedAt: iso(s.lastVerifiedAt),
      sourceUpdatedAt: iso(s.sourceUpdatedAt),
      duplicateOfId: s.duplicateOfId,
      isDemo: s.isDemo,
      points: s.points.map((p) => ({
        id: p.id,
        label: p.label,
        evseId: p.evseId,
        physicalReference: p.physicalReference,
        floorLevel: p.floorLevel,
        parkingRestrictions: p.parkingRestrictions,
        operationalStatus: p.operationalStatus,
        notes: p.notes,
      })),
      connectors: s.connectors.map((c) => this.connectorView(c)),
      photos: s.media.map((m) => ({
        assetId: m.assetId,
        caption: m.caption,
        sortOrder: m.sortOrder,
        status: m.status,
        uploadedById: m.uploadedById,
      })),
      providerRecords: s.providerRecords.map((p) => ({
        provider: p.provider,
        externalId: p.externalId,
        entityType: p.entityType,
        connectorId: p.connectorId,
        sourceUrl: p.sourceUrl,
        dataLicense: p.dataLicense,
        licenseUrl: p.licenseUrl,
        attribution: p.attribution,
        payloadHash: p.payloadHash,
        lastSeenAt: p.lastSeenAt.toISOString(),
        lastSyncedAt: iso(p.lastSyncedAt),
        removedAtSourceAt: iso(p.removedAtSourceAt),
        lastImportJobId: p.lastImportJobId,
      })),
      counts: { ...s._count, openReports },
      possibleDuplicates: duplicates ?? (await this.duplicates.pendingFor(s.id)),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      deletedAt: iso(s.deletedAt),
    };
  }

  connectorView(c: AdminStation['connectors'][number]) {
    return {
      id: c.id,
      chargingPointId: c.chargingPointId,
      connectorTypeCode: c.connectorTypeCode,
      currentType: c.currentType,
      maxPowerKw: num(c.maxPowerKw),
      maxVoltage: c.maxVoltage,
      maxAmperage: c.maxAmperage,
      phases: c.phases,
      format: c.format,
      quantity: c.quantity,
      operationalStatus: c.operationalStatus,
    };
  }

  async list(q: AdminStationListQueryDto) {
    const page = toPageRequest(q);
    const where: Prisma.ChargingStationWhereInput = {
      ...(q.includeMerged ? {} : { deletedAt: null, duplicateOfId: null }),
      ...(q.q ? { searchText: { contains: normalizeSearchText(q.q) } } : {}),
      ...(q.publicationStatus?.length
        ? { publicationStatus: { in: q.publicationStatus as StationPublicationStatus[] } }
        : {}),
      ...(q.operationalStatus?.length
        ? { operationalStatus: { in: q.operationalStatus as StationOperationalStatus[] } }
        : {}),
      ...(q.dataSource?.length ? { dataSource: { in: q.dataSource as StationDataSource[] } } : {}),
      ...(q.countryCode ? { countryCode: q.countryCode } : {}),
      ...(q.marketCode ? { marketCode: q.marketCode } : {}),
      ...(q.operatorId ? { operatorId: q.operatorId } : {}),
      ...(q.isDemo !== undefined ? { isDemo: q.isDemo } : {}),
      ...(q.hasOpenReports ? { reports: { some: { status: { in: ['open', 'in_review'] } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.chargingStation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: {
          operator: { select: { id: true, name: true } },
          connectors: { select: { quantity: true } },
          _count: {
            select: { reports: { where: { status: { in: ['open', 'in_review'] } } } },
          },
        },
      }),
      this.prisma.chargingStation.count({ where }),
    ]);
    return paginated(
      rows.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        nameAr: s.nameAr,
        operator: s.operator,
        city: s.city,
        countryCode: s.countryCode,
        marketCode: s.marketCode,
        latitude: s.latitude,
        longitude: s.longitude,
        publicationStatus: s.publicationStatus,
        operationalStatus: s.operationalStatus,
        dataSource: s.dataSource,
        isDemo: s.isDemo,
        connectorCount: s.connectors.reduce((sum, c) => sum + c.quantity, 0),
        openReports: s._count.reports,
        duplicateOfId: s.duplicateOfId,
        lastVerifiedAt: iso(s.lastVerifiedAt),
        updatedAt: s.updatedAt.toISOString(),
        deletedAt: iso(s.deletedAt),
      })),
      total,
      page,
    );
  }

  private async load(id: string, includeDeleted = false): Promise<AdminStation> {
    const s = await this.prisma.chargingStation.findUnique({ where: { id }, include: ADMIN_INCLUDE });
    if (!s || (!includeDeleted && s.deletedAt)) throw StationErrors.notFound();
    return s;
  }

  async get(id: string) {
    return this.adminView(await this.load(id, true));
  }

  // --- validation --------------------------------------------------------------------------

  /** Checks the final state of the editable fields (after merging a PATCH). */
  private async validateStation(
    next: {
      timezone?: string | null;
      openingHours?: unknown;
      isAlwaysOpen?: boolean | null;
      marketCode?: string | null;
      operatorId?: string | null;
      slug?: string | null;
    },
    selfId?: string,
  ): Promise<void> {
    const problems: Parameters<typeof fieldErrors>[0] = [];
    if (next.timezone !== undefined && next.timezone !== null && !isValidTimezone(next.timezone)) {
      problems.push({
        field: 'timezone',
        rule: 'ianaZone',
        message: { ar: 'منطقة زمنية غير معروفة (IANA).', en: 'Unknown IANA time zone.' },
      });
    }
    for (const p of validateOpeningHours(next.openingHours)) {
      problems.push({
        field: p.path,
        rule: p.rule,
        message: {
          ar: 'ساعات العمل بصيغة {"mon":[["08:00","22:00"]]} (أيام mon..sun، حتى 6 فترات لليوم، "24:00" مسموح كنهاية).',
          en: 'Opening hours must look like {"mon":[["08:00","22:00"]]} (days mon..sun, up to 6 windows a day, "24:00" allowed as end).',
        },
      });
    }
    if (next.isAlwaysOpen === true && next.openingHours !== null && next.openingHours !== undefined) {
      problems.push({
        field: 'openingHours',
        rule: 'alwaysOpen',
        message: {
          ar: 'المحطة المفتوحة دائمًا (24/7) لا تحتاج جدول ساعات؛ اجعله فارغًا.',
          en: 'A station open 24/7 has no weekly schedule; set openingHours to null.',
        },
      });
    }
    if (problems.length > 0) throw fieldErrors(problems);
    if (next.marketCode) {
      const m = await this.prisma.market.findUnique({ where: { code: next.marketCode }, select: { code: true } });
      if (!m) throw fieldError('marketCode', 'exists', { ar: 'السوق غير موجود.', en: 'Unknown market.' });
    }
    if (next.operatorId) {
      const o = await this.prisma.chargingOperator.findUnique({ where: { id: next.operatorId }, select: { id: true } });
      if (!o) throw fieldError('operatorId', 'exists', { ar: 'المشغّل غير موجود.', en: 'Unknown operator.' });
    }
    if (next.slug) {
      const s = await this.prisma.chargingStation.findUnique({ where: { slug: next.slug }, select: { id: true } });
      if (s && s.id !== selfId) throw StationErrors.slugTaken(next.slug);
    }
  }

  private assertCanPublish(user: AuthUser): void {
    if (!user.permissions.includes('stations.publish')) throw StationErrors.publishForbidden();
  }

  private json(value: Record<string, unknown> | null | undefined) {
    if (value === undefined) return undefined;
    return value === null ? Prisma.DbNull : (value as Prisma.InputJsonObject);
  }

  /** Market (explicit or by country) and its time zone. */
  private async marketDefaults(
    countryCode: string,
    marketCode: string | null | undefined,
  ): Promise<{ marketCode: string | null; timezone: string | null }> {
    const code = marketCode === undefined ? countryCode : marketCode;
    if (!code) return { marketCode: null, timezone: null };
    const m = await this.prisma.market.findUnique({ where: { code }, select: { code: true, timezone: true } });
    return { marketCode: m?.code ?? (marketCode ? marketCode : null), timezone: m?.timezone ?? null };
  }

  // --- stations ----------------------------------------------------------------------------

  async create(dto: CreateStationWithConnectorsDto, user: AuthUser) {
    if (dto.publish) this.assertCanPublish(user);
    const defaults = await this.marketDefaults(dto.countryCode, dto.marketCode);
    const timezone = dto.timezone ?? defaults.timezone;
    if (!timezone) {
      throw fieldError('timezone', 'required', {
        ar: 'حدد المنطقة الزمنية للمحطة (لا يوجد سوق لهذه الدولة).',
        en: 'Set the station time zone (there is no market for this country).',
      });
    }
    await this.validateStation({ ...dto, timezone, marketCode: defaults.marketCode });
    const connectors = dto.connectors ?? [];
    await this.community.assertConnectorTypes(connectors);
    if (connectors.some((c) => c.chargingPointId)) {
      throw fieldError('connectors', 'noPointYet', {
        ar: 'أنشئ نقاط الشحن بعد إنشاء المحطة ثم اربط المنافذ بها.',
        en: 'Create charge points after the station, then attach connectors to them.',
      });
    }
    if (dto.publish && connectors.length === 0) {
      // A station without connectors cannot be published.
      throw fieldError('publish', 'needsConnectors', {
        ar: 'أضف منافذ الشحن أولًا ثم انشر المحطة.',
        en: 'Add the connectors first, then publish the station.',
      });
    }
    const s = await this.prisma.chargingStation.create({
      data: {
        slug: dto.slug ?? null,
        name: dto.name,
        nameAr: dto.nameAr ?? null,
        nameEn: dto.nameEn ?? null,
        operatorId: dto.operatorId ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        addressLine: dto.addressLine ?? null,
        addressAr: dto.addressAr ?? null,
        addressEn: dto.addressEn ?? null,
        city: dto.city ?? null,
        region: dto.region ?? null,
        postalCode: dto.postalCode ?? null,
        countryCode: dto.countryCode,
        marketCode: defaults.marketCode,
        accessEntranceNote: dto.accessEntranceNote ?? null,
        accessType: (dto.accessType ?? 'unknown') as StationAccessType,
        accessRestrictions: dto.accessRestrictions ?? null,
        openingHours: this.json(dto.openingHours) ?? Prisma.DbNull,
        isAlwaysOpen: dto.isAlwaysOpen ?? null,
        openingHoursText: dto.openingHoursText ?? null,
        timezone,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        websiteUrl: dto.websiteUrl ?? null,
        paymentMethods: dto.paymentMethods ?? [],
        startMethods: dto.startMethods ?? [],
        amenities: dto.amenities ?? [],
        operationalStatus: (dto.operationalStatus ?? 'unknown') as StationOperationalStatus,
        publicationStatus: 'draft',
        dataSource: 'manual',
        dataLicense: dto.dataLicense ?? null,
        attribution: dto.attribution ?? MANUAL_ATTRIBUTION,
        publishedPointCount: dto.publishedPointCount ?? null,
        usageCostText: dto.usageCostText ?? null,
        lastVerifiedAt: dto.lastVerifiedAt ? new Date(dto.lastVerifiedAt) : this.clock.now(),
        createdById: user.id,
        updatedById: user.id,
        connectors: {
          create: connectors.map((c) => ({
            connectorTypeCode: c.connectorTypeCode,
            currentType: c.currentType,
            maxPowerKw: c.maxPowerKw ?? null,
            maxVoltage: c.maxVoltage ?? null,
            maxAmperage: c.maxAmperage ?? null,
            phases: c.phases ?? null,
            format: c.format ?? null,
            quantity: c.quantity ?? 1,
            operationalStatus: (c.operationalStatus ?? 'unknown') as StationOperationalStatus,
          })),
        },
      },
    });
    const flagged = await this.duplicates.findCandidates(s.id);
    this.audit.annotate({ entityType: 'station', entityId: s.id, after: s });
    // Possible duplicates wait for a reviewer even when publishing was asked for.
    if (dto.publish && flagged.length === 0) return this.setPublication(s.id, 'published', user);
    return this.get(s.id);
  }

  async update(id: string, dto: UpdateStationDto, user: AuthUser) {
    const before = await this.load(id);
    if (dto.publish) this.assertCanPublish(user);
    const next = {
      timezone: dto.timezone ?? before.timezone,
      openingHours: dto.openingHours !== undefined ? dto.openingHours : before.openingHours,
      isAlwaysOpen: dto.isAlwaysOpen !== undefined ? dto.isAlwaysOpen : before.isAlwaysOpen,
      marketCode: dto.marketCode,
      operatorId: dto.operatorId,
      slug: dto.slug,
    };
    await this.validateStation(next, id);
    const moved = dto.latitude !== undefined || dto.longitude !== undefined;
    const s = await this.prisma.chargingStation.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        operatorId: dto.operatorId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        addressLine: dto.addressLine,
        addressAr: dto.addressAr,
        addressEn: dto.addressEn,
        city: dto.city,
        region: dto.region,
        postalCode: dto.postalCode,
        countryCode: dto.countryCode,
        marketCode: dto.marketCode,
        accessEntranceNote: dto.accessEntranceNote,
        accessType: dto.accessType as StationAccessType | undefined,
        accessRestrictions: dto.accessRestrictions,
        openingHours: this.json(dto.openingHours),
        isAlwaysOpen: dto.isAlwaysOpen,
        openingHoursText: dto.openingHoursText,
        timezone: dto.timezone,
        phone: dto.phone,
        email: dto.email,
        websiteUrl: dto.websiteUrl,
        paymentMethods: dto.paymentMethods,
        startMethods: dto.startMethods,
        amenities: dto.amenities,
        operationalStatus: dto.operationalStatus as StationOperationalStatus | undefined,
        dataLicense: dto.dataLicense,
        attribution: dto.attribution,
        publishedPointCount: dto.publishedPointCount,
        usageCostText: dto.usageCostText,
        lastVerifiedAt:
          dto.lastVerifiedAt === undefined
            ? undefined
            : dto.lastVerifiedAt === null
              ? null
              : new Date(dto.lastVerifiedAt),
        updatedById: user.id,
      },
    });
    if (moved) await this.duplicates.findCandidates(id);
    if (dto.publish) await this.setPublication(id, 'published', user);
    this.audit.annotate({ entityType: 'station', entityId: id, before, after: s });
    return this.get(id);
  }

  async setPublication(id: string, status: StationPublicationStatus, user: AuthUser) {
    const before = await this.load(id);
    if (status === 'published') {
      this.assertCanPublish(user);
      if (before.duplicateOfId) throw StationErrors.mergedCannotPublish();
      if (before.connectors.length === 0) {
        throw fieldError('status', 'needsConnectors', {
          ar: 'لا يمكن نشر محطة بلا منافذ شحن.',
          en: 'A station without connectors cannot be published.',
        });
      }
    }
    await this.prisma.chargingStation.update({
      where: { id },
      data: { publicationStatus: status, updatedById: user.id },
    });
    this.audit.annotate({
      action: `stations.publication.${status}`,
      entityType: 'station',
      entityId: id,
      before: { publicationStatus: before.publicationStatus },
      after: { publicationStatus: status },
    });
    return this.get(id);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const before = await this.load(id);
    await this.prisma.chargingStation.update({
      where: { id },
      data: { deletedAt: this.clock.now(), publicationStatus: 'hidden', updatedById: user.id },
    });
    this.audit.annotate({
      entityType: 'station',
      entityId: id,
      before: { publicationStatus: before.publicationStatus, deletedAt: null },
      after: { deletedAt: 'now' },
    });
  }

  // --- points ------------------------------------------------------------------------------

  async createPoint(stationId: string, dto: CreatePointDto) {
    await this.load(stationId);
    const p = await this.prisma.chargingPoint.create({
      data: {
        stationId,
        label: dto.label ?? null,
        evseId: dto.evseId ?? null,
        physicalReference: dto.physicalReference ?? null,
        floorLevel: dto.floorLevel ?? null,
        parkingRestrictions: dto.parkingRestrictions ?? null,
        operationalStatus: (dto.operationalStatus ?? 'unknown') as StationOperationalStatus,
        notes: dto.notes ?? null,
      },
    });
    await this.touch(stationId);
    this.audit.annotate({ entityType: 'charging_point', entityId: p.id, after: p });
    return this.get(stationId);
  }

  private async point(stationId: string, pointId: string) {
    const p = await this.prisma.chargingPoint.findFirst({ where: { id: pointId, stationId } });
    if (!p) throw StationErrors.notFound('charging_point');
    return p;
  }

  async updatePoint(stationId: string, pointId: string, dto: UpdatePointDto) {
    const before = await this.point(stationId, pointId);
    const p = await this.prisma.chargingPoint.update({
      where: { id: pointId },
      data: {
        label: dto.label,
        evseId: dto.evseId,
        physicalReference: dto.physicalReference,
        floorLevel: dto.floorLevel,
        parkingRestrictions: dto.parkingRestrictions,
        operationalStatus: dto.operationalStatus as StationOperationalStatus | undefined,
        notes: dto.notes,
      },
    });
    await this.touch(stationId);
    this.audit.annotate({ entityType: 'charging_point', entityId: pointId, before, after: p });
    return this.get(stationId);
  }

  async deletePoint(stationId: string, pointId: string) {
    const before = await this.point(stationId, pointId);
    const connectors = await this.prisma.connector.count({ where: { chargingPointId: pointId } });
    if (connectors > 0) throw StationErrors.inUse('charging_point', { connectors });
    await this.prisma.chargingPoint.delete({ where: { id: pointId } });
    await this.touch(stationId);
    this.audit.annotate({ entityType: 'charging_point', entityId: pointId, before });
    return this.get(stationId);
  }

  // --- connectors --------------------------------------------------------------------------

  private async validateConnector(
    stationId: string,
    next: { connectorTypeCode: string; currentType: 'AC' | 'DC'; chargingPointId?: string | null },
  ) {
    await this.community.assertConnectorTypes(
      [{ connectorTypeCode: next.connectorTypeCode, currentType: next.currentType }],
      'connector',
    );
    if (next.chargingPointId) await this.point(stationId, next.chargingPointId);
  }

  async createConnector(stationId: string, dto: CreateConnectorDto) {
    await this.load(stationId);
    await this.validateConnector(stationId, dto);
    const c = await this.prisma.connector.create({
      data: {
        stationId,
        chargingPointId: dto.chargingPointId ?? null,
        connectorTypeCode: dto.connectorTypeCode,
        currentType: dto.currentType,
        maxPowerKw: dto.maxPowerKw ?? null,
        maxVoltage: dto.maxVoltage ?? null,
        maxAmperage: dto.maxAmperage ?? null,
        phases: dto.phases ?? null,
        format: dto.format ?? null,
        quantity: dto.quantity ?? 1,
        operationalStatus: (dto.operationalStatus ?? 'unknown') as StationOperationalStatus,
      },
    });
    await this.touch(stationId);
    this.audit.annotate({ entityType: 'connector', entityId: c.id, after: c });
    return this.get(stationId);
  }

  private async connector(stationId: string, connectorId: string) {
    const c = await this.prisma.connector.findFirst({ where: { id: connectorId, stationId } });
    if (!c) throw StationErrors.notFound('connector');
    return c;
  }

  async updateConnector(stationId: string, connectorId: string, dto: UpdateConnectorDto) {
    const before = await this.connector(stationId, connectorId);
    await this.validateConnector(stationId, {
      connectorTypeCode: dto.connectorTypeCode ?? before.connectorTypeCode,
      currentType: dto.currentType ?? before.currentType,
      chargingPointId: dto.chargingPointId,
    });
    const c = await this.prisma.connector.update({
      where: { id: connectorId },
      data: {
        chargingPointId: dto.chargingPointId,
        connectorTypeCode: dto.connectorTypeCode,
        currentType: dto.currentType,
        maxPowerKw: dto.maxPowerKw,
        maxVoltage: dto.maxVoltage,
        maxAmperage: dto.maxAmperage,
        phases: dto.phases,
        format: dto.format,
        quantity: dto.quantity,
        operationalStatus: dto.operationalStatus as StationOperationalStatus | undefined,
      },
    });
    await this.touch(stationId);
    this.audit.annotate({ entityType: 'connector', entityId: connectorId, before, after: c });
    return this.get(stationId);
  }

  async deleteConnector(stationId: string, connectorId: string, user: AuthUser) {
    const before = await this.connector(stationId, connectorId);
    await this.prisma.$transaction(async (tx) => {
      await tx.providerRecord.deleteMany({ where: { connectorId, entityType: 'connector' } });
      await tx.connector.delete({ where: { id: connectorId } });
      const left = await tx.connector.count({ where: { stationId } });
      const s = await tx.chargingStation.findUniqueOrThrow({ where: { id: stationId } });
      if (left === 0 && s.publicationStatus === 'published') {
        // A published station must keep at least one connector.
        throw fieldError('connectorId', 'lastConnector', {
          ar: 'لا يمكن حذف آخر منفذ في محطة منشورة. أخفِ المحطة أولًا.',
          en: 'The last connector of a published station cannot be deleted. Hide the station first.',
        });
      }
      await tx.chargingStation.update({ where: { id: stationId }, data: { updatedById: user.id } });
    });
    this.audit.annotate({ entityType: 'connector', entityId: connectorId, before });
    return this.get(stationId);
  }

  private async touch(stationId: string) {
    await this.prisma.chargingStation.update({ where: { id: stationId }, data: { updatedAt: this.clock.now() } });
  }

  // --- photos ------------------------------------------------------------------------------

  async addPhoto(stationId: string, dto: AddStationPhotoDto, user: AuthUser) {
    await this.load(stationId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: dto.assetId, deletedAt: null },
      select: { id: true, kind: true },
    });
    if (!asset || asset.kind !== 'image') {
      throw fieldError('assetId', 'image', {
        ar: 'الملف غير موجود أو ليس صورة.',
        en: 'The file does not exist or is not an image.',
      });
    }
    const m = await this.prisma.stationMedia.upsert({
      where: { stationId_assetId: { stationId, assetId: dto.assetId } },
      create: {
        stationId,
        assetId: dto.assetId,
        caption: dto.caption ?? null,
        sortOrder: dto.sortOrder ?? 0,
        status: 'approved',
        uploadedById: user.id,
      },
      update: { caption: dto.caption, sortOrder: dto.sortOrder, status: 'approved' },
    });
    this.audit.annotate({ entityType: 'station_media', entityId: m.id, after: m });
    return this.get(stationId);
  }

  async removePhoto(stationId: string, assetId: string) {
    const res = await this.prisma.stationMedia.deleteMany({ where: { stationId, assetId } });
    if (res.count === 0) throw StationErrors.notFound('station_media');
    this.audit.annotate({ entityType: 'station_media', entityId: assetId });
    return this.get(stationId);
  }

  // --- operators ---------------------------------------------------------------------------

  async listOperators(q: OperatorListQueryDto) {
    const page = toPageRequest(q);
    const where: Prisma.ChargingOperatorWhereInput = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { nameAr: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.chargingOperator.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
        include: { _count: { select: { stations: true } } },
      }),
      this.prisma.chargingOperator.count({ where }),
    ]);
    return paginated(
      rows.map((o) => this.operatorView(o)),
      total,
      page,
    );
  }

  private operatorView(
    o: Prisma.ChargingOperatorGetPayload<{ include: { _count: { select: { stations: true } } } }>,
  ) {
    return {
      id: o.id,
      name: o.name,
      nameAr: o.nameAr,
      websiteUrl: o.websiteUrl,
      phone: o.phone,
      email: o.email,
      isDemo: o.isDemo,
      stationCount: o._count.stations,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }

  async getOperator(id: string) {
    const o = await this.prisma.chargingOperator.findUnique({
      where: { id },
      include: { _count: { select: { stations: true } } },
    });
    if (!o) throw StationErrors.notFound('charging_operator');
    return this.operatorView(o);
  }

  async createOperator(dto: CreateOperatorDto) {
    const o = await this.prisma.chargingOperator.create({
      data: {
        name: dto.name,
        nameAr: dto.nameAr ?? null,
        websiteUrl: dto.websiteUrl ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
      },
    });
    this.audit.annotate({ entityType: 'charging_operator', entityId: o.id, after: o });
    return this.getOperator(o.id);
  }

  async updateOperator(id: string, dto: UpdateOperatorDto) {
    const before = await this.prisma.chargingOperator.findUnique({ where: { id } });
    if (!before) throw StationErrors.notFound('charging_operator');
    const o = await this.prisma.chargingOperator.update({
      where: { id },
      data: {
        name: dto.name,
        nameAr: dto.nameAr,
        websiteUrl: dto.websiteUrl,
        phone: dto.phone,
        email: dto.email,
      },
    });
    this.audit.annotate({ entityType: 'charging_operator', entityId: id, before, after: o });
    return this.getOperator(id);
  }

  async deleteOperator(id: string) {
    const o = await this.getOperator(id);
    if (o.stationCount > 0) throw StationErrors.inUse('charging_operator', { stations: o.stationCount });
    await this.prisma.$transaction([
      this.prisma.providerRecord.deleteMany({ where: { operatorId: id, entityType: 'operator' } }),
      this.prisma.chargingOperator.delete({ where: { id } }),
    ]);
    this.audit.annotate({ entityType: 'charging_operator', entityId: id, before: o });
  }
}
