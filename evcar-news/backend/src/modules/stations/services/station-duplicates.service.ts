import { Injectable } from '@nestjs/common';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { DEDUPE_SEARCH_RADIUS_M, dedupeVerdict, orderedPair } from '../common/dedupe';
import { StationErrors } from '../common/station-errors';
import { num } from '../common/values';
import type {
  CreateDuplicateDto,
  DuplicateListQueryDto,
  ScanDuplicatesDto,
} from '../dto/admin.dto';

type Db = PrismaService | Prisma.TransactionClient;

export interface DuplicateCandidateView {
  id: string;
  status: string;
  distanceM: number | null;
  nameSimilarity: number | null;
  reason: string | null;
  note: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  stations: {
    id: string;
    name: string;
    dataSource: string;
    publicationStatus: string;
    operatorName: string | null;
    latitude: number;
    longitude: number;
    duplicateOfId: string | null;
    providers: string[];
  }[];
}

interface NearRow {
  id: string;
  d: number;
  sim: number | null;
  same_operator: boolean;
  a_source: string;
  b_source: string;
}

const PAIR_INCLUDE = {
  select: {
    id: true,
    name: true,
    dataSource: true,
    publicationStatus: true,
    latitude: true,
    longitude: true,
    duplicateOfId: true,
    operator: { select: { name: true } },
    providerRecords: { where: { entityType: 'station' }, select: { provider: true } },
  },
} as const;

/**
 * Cross-source duplicates (REQUIREMENTS §10): candidates are found with
 * PostGIS distance + pg_trgm name similarity + operator, stored as ordered
 * pairs for review, and merged only by a reviewer (the merged station keeps
 * its provider records — so re-syncs never recreate it — gets
 * duplicate_of_id and is hidden).
 */
@Injectable()
export class StationDuplicatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Finds possible duplicates of one station and records new pending pairs
   * (pairs already reviewed are never reopened). Returns the ids of the
   * other stations flagged (new or already pending).
   */
  async findCandidates(stationId: string, db: Db = this.prisma): Promise<string[]> {
    const rows = await db.$queryRaw<NearRow[]>(Prisma.sql`
      SELECT o."id"::text AS "id",
             ST_Distance(o."location", s."location") AS "d",
             GREATEST(
               similarity(app_normalize_text(o."name"), app_normalize_text(s."name")),
               similarity(app_normalize_text(coalesce(o."name_en", o."name")), app_normalize_text(coalesce(s."name_en", s."name"))),
               similarity(app_normalize_text(coalesce(o."name_ar", o."name")), app_normalize_text(coalesce(s."name_ar", s."name")))
             )::float8 AS "sim",
             (o."operator_id" IS NOT NULL AND o."operator_id" = s."operator_id")
               OR coalesce(similarity(app_normalize_text(oo."name"), app_normalize_text(so."name")) >= 0.6, false) AS "same_operator",
             s."data_source"::text AS "a_source", o."data_source"::text AS "b_source"
        FROM "charging_stations" s
        JOIN "charging_stations" o
          ON o."id" <> s."id"
         AND ST_DWithin(o."location", s."location", ${DEDUPE_SEARCH_RADIUS_M}::double precision)
        LEFT JOIN "charging_operators" so ON so."id" = s."operator_id"
        LEFT JOIN "charging_operators" oo ON oo."id" = o."operator_id"
       WHERE s."id" = ${stationId}::uuid
         AND s."deleted_at" IS NULL AND s."duplicate_of_id" IS NULL
         AND o."deleted_at" IS NULL AND o."duplicate_of_id" IS NULL
       ORDER BY "d"
       LIMIT 20`);
    const flagged: string[] = [];
    for (const r of rows) {
      const verdict = dedupeVerdict({
        distanceM: Number(r.d),
        nameSimilarity: r.sim === null ? null : Number(r.sim),
        sameOperator: r.same_operator,
      });
      if (!verdict.candidate) continue;
      const [a, b] = orderedPair(stationId, r.id);
      const existing = await db.stationDuplicateCandidate.findUnique({
        where: { stationId_otherStationId: { stationId: a, otherStationId: b } },
        select: { status: true },
      });
      if (existing) {
        if (existing.status === 'pending') flagged.push(r.id);
        continue;
      }
      await db.stationDuplicateCandidate.create({
        data: {
          stationId: a,
          otherStationId: b,
          distanceM: Math.round(Number(r.d) * 10) / 10,
          nameSimilarity: r.sim === null ? null : Math.round(Number(r.sim) * 1000) / 1000,
          reason: `${r.a_source}+${r.b_source}, ${verdict.reason}`.slice(0, 300),
        },
      });
      flagged.push(r.id);
    }
    return flagged;
  }

  async scan(dto: ScanDuplicatesDto): Promise<{ scanned: number; flaggedPairs: number }> {
    let ids: string[];
    if (dto.stationId) {
      ids = [dto.stationId];
    } else {
      const rows = await this.prisma.chargingStation.findMany({
        where: {
          deletedAt: null,
          duplicateOfId: null,
          ...(dto.countryCode ? { countryCode: dto.countryCode } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: dto.limit ?? 500,
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    }
    const pairs = new Set<string>();
    for (const id of ids) {
      for (const other of await this.findCandidates(id))
        pairs.add(orderedPair(id, other).join('|'));
    }
    return { scanned: ids.length, flaggedPairs: pairs.size };
  }

  private view(
    c: Prisma.StationDuplicateCandidateGetPayload<{
      include: { station: typeof PAIR_INCLUDE; otherStation: typeof PAIR_INCLUDE };
    }>,
  ): DuplicateCandidateView {
    const station = (s: typeof c.station) => ({
      id: s.id,
      name: s.name,
      dataSource: s.dataSource,
      publicationStatus: s.publicationStatus,
      operatorName: s.operator?.name ?? null,
      latitude: s.latitude,
      longitude: s.longitude,
      duplicateOfId: s.duplicateOfId,
      providers: s.providerRecords.map((p) => p.provider),
    });
    return {
      id: c.id,
      status: c.status,
      distanceM: num(c.distanceM),
      nameSimilarity: num(c.nameSimilarity),
      reason: c.reason,
      note: c.note,
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
      reviewedById: c.reviewedById,
      createdAt: c.createdAt.toISOString(),
      stations: [station(c.station), station(c.otherStation)],
    };
  }

  async list(q: DuplicateListQueryDto): Promise<PaginatedResponse<DuplicateCandidateView>> {
    const page = toPageRequest(q);
    const where: Prisma.StationDuplicateCandidateWhereInput = {
      ...(q.status?.length
        ? { status: { in: q.status as Prisma.EnumStationDuplicateStatusFilter['in'] } }
        : {}),
      ...(q.stationId ? { OR: [{ stationId: q.stationId }, { otherStationId: q.stationId }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stationDuplicateCandidate.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: page.skip,
        take: page.take,
        include: { station: PAIR_INCLUDE, otherStation: PAIR_INCLUDE },
      }),
      this.prisma.stationDuplicateCandidate.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.view(r)),
      total,
      page,
    );
  }

  async get(id: string): Promise<DuplicateCandidateView> {
    const c = await this.prisma.stationDuplicateCandidate.findUnique({
      where: { id },
      include: { station: PAIR_INCLUDE, otherStation: PAIR_INCLUDE },
    });
    if (!c) throw StationErrors.notFound('station_duplicate');
    return this.view(c);
  }

  /** A reviewer flags a pair by hand (e.g. same site under different names). */
  async create(dto: CreateDuplicateDto): Promise<DuplicateCandidateView> {
    if (dto.stationId === dto.otherStationId) throw StationErrors.duplicateSameStation();
    const stations = await this.prisma.chargingStation.findMany({
      where: { id: { in: [dto.stationId, dto.otherStationId] }, deletedAt: null },
      select: { id: true, duplicateOfId: true },
    });
    if (stations.length !== 2) throw StationErrors.notFound();
    if (stations.some((s) => s.duplicateOfId)) throw StationErrors.alreadyMerged();
    const [a, b] = orderedPair(dto.stationId, dto.otherStationId);
    const rows = await this.prisma.$queryRaw<{ d: number }[]>(Prisma.sql`
      SELECT ST_Distance(x."location", y."location") AS "d"
        FROM "charging_stations" x, "charging_stations" y
       WHERE x."id" = ${a}::uuid AND y."id" = ${b}::uuid`);
    const c = await this.prisma.stationDuplicateCandidate.upsert({
      where: { stationId_otherStationId: { stationId: a, otherStationId: b } },
      create: {
        stationId: a,
        otherStationId: b,
        distanceM: rows[0] ? Math.round(Number(rows[0].d) * 10) / 10 : null,
        reason: 'manual',
        note: dto.note ?? null,
      },
      update: { status: 'pending', reviewedAt: null, reviewedById: null, note: dto.note ?? null },
    });
    this.audit.annotate({ entityType: 'station_duplicate', entityId: c.id, after: c });
    return this.get(c.id);
  }

  /** Merges the pair: the other station gets duplicate_of_id = keep and is hidden. */
  async merge(
    id: string,
    keepStationId: string,
    note: string | null | undefined,
    reviewerId: string,
  ): Promise<DuplicateCandidateView> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.stationDuplicateCandidate.findUnique({ where: { id } });
      if (!c) throw StationErrors.notFound('station_duplicate');
      if (c.status !== 'pending') throw StationErrors.duplicateNotPending();
      if (keepStationId !== c.stationId && keepStationId !== c.otherStationId) {
        throw StationErrors.duplicateKeepInvalid();
      }
      const loserId = keepStationId === c.stationId ? c.otherStationId : c.stationId;
      const [keep, loser] = await Promise.all([
        tx.chargingStation.findUnique({ where: { id: keepStationId } }),
        tx.chargingStation.findUnique({ where: { id: loserId } }),
      ]);
      if (!keep || !loser || keep.deletedAt || loser.deletedAt) throw StationErrors.notFound();
      if (keep.duplicateOfId || loser.duplicateOfId) throw StationErrors.alreadyMerged();
      await tx.chargingStation.update({
        where: { id: loserId },
        data: {
          duplicateOfId: keepStationId,
          publicationStatus: 'hidden',
          updatedById: reviewerId,
        },
      });
      // Anything merged into the loser earlier now points at the kept station.
      await tx.chargingStation.updateMany({
        where: { duplicateOfId: loserId },
        data: { duplicateOfId: keepStationId },
      });
      const now = new Date();
      await tx.stationDuplicateCandidate.update({
        where: { id },
        data: { status: 'merged', reviewedAt: now, reviewedById: reviewerId, note: note ?? c.note },
      });
      this.audit.annotate({
        entityType: 'station_duplicate',
        entityId: id,
        before: {
          candidate: c,
          loser: { id: loser.id, publicationStatus: loser.publicationStatus },
        },
        after: { keepStationId, mergedStationId: loserId },
      });
    });
    return this.get(id);
  }

  async dismiss(
    id: string,
    note: string | null | undefined,
    reviewerId: string,
  ): Promise<DuplicateCandidateView> {
    const res = await this.prisma.stationDuplicateCandidate.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'not_duplicate',
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        ...(note !== undefined ? { note } : {}),
      },
    });
    if (res.count === 0) {
      await this.get(id); // 404 when missing
      throw StationErrors.duplicateNotPending();
    }
    this.audit.annotate({
      entityType: 'station_duplicate',
      entityId: id,
      after: { status: 'not_duplicate' },
    });
    return this.get(id);
  }

  async pendingFor(stationId: string): Promise<DuplicateCandidateView[]> {
    const rows = await this.prisma.stationDuplicateCandidate.findMany({
      where: { status: 'pending', OR: [{ stationId }, { otherStationId: stationId }] },
      include: { station: PAIR_INCLUDE, otherStation: PAIR_INCLUDE },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => this.view(r));
  }
}
