import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { paginated } from '../../../common/http/responses';
import { toPageRequest } from '../../../common/http/pagination';
import { Prisma } from '../../../generated/prisma/client';
import type { ImportJob, ImportRowStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { STATION_SOURCES } from '../../../providers/provider-tokens';
import type { StationSourceRegistry } from '../../../providers/stations/station-source.registry';
import type {
  ExternalStationRecord,
  StationSource,
  StationSourceQuery,
} from '../../../providers/stations/station-source.types';
import { describeProviderError } from '../../../providers/provider-status';
import { AuditService } from '../../audit';
import {
  ImportJobsService,
  type RowRecord,
  toImportJobRowView,
  toImportJobView,
} from '../../system';
import { STATIONS_CLOCK, type StationsClock } from '../common/clock';
import { StationErrors } from '../common/station-errors';
import type { OcmSyncDto, SyncJobListQueryDto, SyncScheduleDto } from '../dto/admin.dto';
import { StationDuplicatesService } from './station-duplicates.service';

export const OCM_SYNC_JOB_TYPE = 'stations.ocm_sync';
export const OCM_INTEGRATION_KEY = 'stations.ocm';
/** A "running" sync that has not progressed for this long is considered dead. */
const STALE_JOB_MS = 2 * 60 * 60_000;

/**
 * Time zones for countries without a market row (a market's own time zone
 * always wins). Unknown countries fall back to UTC with a row warning; the
 * source publishes no structured hours, so "open now" stays unknown there
 * until an admin enters hours and the right time zone.
 */
export const COUNTRY_TIMEZONES: Record<string, string> = {
  EG: 'Africa/Cairo',
  SA: 'Asia/Riyadh',
  AE: 'Asia/Dubai',
  KW: 'Asia/Kuwait',
  QA: 'Asia/Qatar',
  BH: 'Asia/Bahrain',
  OM: 'Asia/Muscat',
  JO: 'Asia/Amman',
  LB: 'Asia/Beirut',
  IQ: 'Asia/Baghdad',
  MA: 'Africa/Casablanca',
  TN: 'Africa/Tunis',
  DZ: 'Africa/Algiers',
  LY: 'Africa/Tripoli',
  SD: 'Africa/Khartoum',
  TR: 'Europe/Istanbul',
};

const LICENCE_URLS: [RegExp, string][] = [
  [/CC BY-SA 4\.0|Attribution-ShareAlike 4\.0/i, 'https://creativecommons.org/licenses/by-sa/4.0/'],
  [/CC BY 4\.0|Attribution 4\.0/i, 'https://creativecommons.org/licenses/by/4.0/'],
  [/CC0|Public Domain Dedication/i, 'https://creativecommons.org/publicdomain/zero/1.0/'],
  [/ODbL|Open Database Licen[cs]e/i, 'https://opendatacommons.org/licenses/odbl/1-0/'],
];

export function licenceUrlOf(licence: string | null): string | null {
  if (!licence) return null;
  return LICENCE_URLS.find(([re]) => re.test(licence))?.[1] ?? null;
}

export function ocmSourceUrl(externalId: string): string | null {
  return /^\d{1,12}$/.test(externalId)
    ? `https://openchargemap.org/site/poi/details/${externalId}`
    : null;
}

/** Access notes from the source's usage flags (free text, source language). */
export function accessNotesOf(rec: ExternalStationRecord): string | null {
  const notes: string[] = [];
  if (rec.usageFlags.membershipRequired) notes.push('Membership required');
  if (rec.usageFlags.accessKeyRequired) notes.push('Access key or card required');
  return notes.length > 0 ? `${notes.join('. ')}.` : null;
}

export interface SyncOptions {
  countryCode?: string;
  boundingBox?: { south: number; west: number; north: number; east: number };
  modifiedSince?: string;
  pageSize?: number;
  maxPages?: number;
  autoPublish?: boolean;
  trigger?: 'manual' | 'scheduled';
}

interface SyncContext {
  jobId: string;
  provider: string;
  options: SyncOptions;
  markets: Map<string, { code: string; timezone: string }>;
  types: Map<string, { supportsAc: boolean; supportsDc: boolean }>;
}

interface RecordResult {
  status: ImportRowStatus;
  stationId: string | null;
  reason?: string;
  warnings: string[];
  possibleDuplicates?: string[];
}

export interface ScheduleView {
  enabled: boolean;
  intervalHours: number;
  countryCodes: string[];
  autoPublish: boolean;
  lastRuns: Record<string, string>;
  configured: boolean;
}

/**
 * Station registry synchronisation (REQUIREMENTS §10, §18): Open Charge Map
 * import through the providers/stations adapter (OCM_API_KEY), tracked as
 * import jobs with row results. Idempotent: provider_records are unique per
 * (provider, external_id) and an unchanged payload hash is skipped, so a
 * re-run or retry never duplicates stations, connectors or operators.
 * New stations are checked for cross-source duplicates (distance + name /
 * operator) and wait for review; attribution and licence of every record
 * are stored with it.
 */
@Injectable()
export class StationSyncService {
  private readonly logger = new Logger(StationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importJobs: ImportJobsService,
    private readonly audit: AuditService,
    private readonly duplicates: StationDuplicatesService,
    @Inject(STATION_SOURCES) private readonly registry: StationSourceRegistry,
    @Inject(STATIONS_CLOCK) private readonly clock: StationsClock,
  ) {}

  // --- sources & jobs ----------------------------------------------------------------------

  async sources() {
    const lastJob = await this.prisma.importJob.findFirst({
      where: { type: OCM_SYNC_JOB_TYPE },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      this.registry.list().map(async (s) => ({
        key: s.key,
        displayName: s.displayName,
        supportsSync: s.supportsSync,
        status: await s.status(),
        licence: s.licence,
        lastJob: s.key === 'ocm' && lastJob ? toImportJobView(lastJob) : null,
      })),
    );
  }

  async jobs(q: SyncJobListQueryDto) {
    const page = toPageRequest(q);
    const { items, total } = await this.importJobs.list({
      type: OCM_SYNC_JOB_TYPE,
      skip: page.skip,
      take: page.take,
    });
    return paginated(items.map(toImportJobView), total, page);
  }

  async job(id: string, q: SyncJobListQueryDto) {
    const job = await this.importJobs.get(id);
    if (!job.type.startsWith('stations.')) throw StationErrors.notFound('import_job');
    const page = toPageRequest(q);
    const rows = await this.importJobs.listRows(id, { skip: page.skip, take: page.take });
    return {
      job: toImportJobView(job),
      rows: paginated(rows.items.map(toImportJobRowView), rows.total, page),
    };
  }

  // --- OCM sync ------------------------------------------------------------------------------

  private async ocm(): Promise<StationSource> {
    const source = this.registry.get('ocm');
    if (!source?.supportsSync) throw StationErrors.sourceNotSyncable('ocm');
    if (!(await source.status()).configured) {
      throw AppException.integrationNotConfigured('stations.ocm');
    }
    return source;
  }

  /**
   * Starts an Open Charge Map import. `wait` runs it inside the request
   * (small imports, tests); otherwise it runs in the background of this
   * instance and the job is returned at once (poll GET .../jobs/:id).
   */
  async startOcm(dto: OcmSyncDto, userId: string | null): Promise<ImportJob> {
    await this.ocm();
    await this.failStaleJobs();
    const options: SyncOptions = {
      countryCode: dto.countryCode,
      boundingBox: dto.boundingBox ? { ...dto.boundingBox } : undefined,
      modifiedSince: dto.modifiedSince,
      pageSize: dto.pageSize ?? 200,
      maxPages: dto.maxPages ?? 50,
      autoPublish: dto.autoPublish ?? false,
      trigger: userId ? 'manual' : 'scheduled',
    };
    const key = [
      'ocm',
      options.countryCode ?? '*',
      options.boundingBox ? JSON.stringify(options.boundingBox) : '*',
      options.modifiedSince ?? 'full',
    ].join(':');
    const { job, created } = await this.importJobs.create({
      type: OCM_SYNC_JOB_TYPE,
      source: 'ocm',
      options: { ...options },
      createdById: userId,
      idempotencyKey: key,
    });
    if (!created) throw StationErrors.syncRunning(job.id);
    this.audit.annotate({
      entityType: 'import_job',
      entityId: job.id,
      after: { type: job.type, options },
    });
    if (dto.wait) {
      await this.runOcm(job.id, options);
      return this.importJobs.get(job.id);
    }
    void this.runOcm(job.id, options).catch((err: unknown) =>
      this.logger.error(`OCM sync ${job.id} crashed: ${describeProviderError(err)}`),
    );
    return job;
  }

  private async failStaleJobs(): Promise<void> {
    await this.prisma.importJob.updateMany({
      where: {
        type: OCM_SYNC_JOB_TYPE,
        status: { in: ['pending', 'running'] },
        updatedAt: { lt: new Date(this.clock.now().getTime() - STALE_JOB_MS) },
      },
      data: {
        status: 'failed',
        error: 'Stopped: no progress for 2 hours',
        finishedAt: this.clock.now(),
      },
    });
  }

  private async context(jobId: string, options: SyncOptions): Promise<SyncContext> {
    const [markets, types] = await Promise.all([
      this.prisma.market.findMany({ select: { code: true, timezone: true } }),
      this.prisma.connectorType.findMany({
        select: { code: true, supportsAc: true, supportsDc: true },
      }),
    ]);
    return {
      jobId,
      provider: 'ocm',
      options,
      markets: new Map(markets.map((m) => [m.code, m])),
      types: new Map(types.map((t) => [t.code, t])),
    };
  }

  /** Runs a created job page by page (never throws; failures end the job as failed). */
  async runOcm(jobId: string, options: SyncOptions): Promise<void> {
    let source: StationSource;
    try {
      source = await this.ocm();
      await this.importJobs.start(jobId);
    } catch (err) {
      await this.importJobs.fail(jobId, err).catch(() => undefined);
      return;
    }
    const ctx = await this.context(jobId, options);
    let cursor: string | null = null;
    let rowNumber = 0;
    let pages = 0;
    try {
      do {
        if (await this.importJobs.isCancelled(jobId)) break;
        const query: StationSourceQuery = {
          countryCode: options.countryCode,
          boundingBox: options.boundingBox,
          modifiedSince: options.modifiedSince ? new Date(options.modifiedSince) : undefined,
          cursor,
          pageSize: options.pageSize,
          openDataOnly: true,
        };
        const page = await source.fetchPage(query);
        const rows: RowRecord[] = [];
        for (const skipped of page.skipped) {
          rows.push({
            rowNumber: ++rowNumber,
            status: 'skipped',
            data: { externalId: skipped.externalId, reason: skipped.reason },
            errors: [
              { code: skipped.reason, message: `Skipped by the source adapter: ${skipped.reason}` },
            ],
          });
        }
        for (const rec of page.items) {
          rowNumber += 1;
          const base = { externalId: rec.externalId, name: rec.name, countryCode: rec.countryCode };
          try {
            const r = await this.upsertRecord(rec, ctx);
            rows.push({
              rowNumber,
              status: r.status,
              data: {
                ...base,
                ...(r.reason ? { reason: r.reason } : {}),
                warnings: r.warnings,
                ...(r.possibleDuplicates?.length
                  ? { possibleDuplicates: r.possibleDuplicates }
                  : {}),
              },
              errors:
                r.status === 'invalid'
                  ? [{ code: r.reason ?? 'invalid', message: r.reason ?? 'invalid' }]
                  : null,
              entityType: r.stationId ? 'station' : null,
              entityId: r.stationId,
            });
          } catch (err) {
            rows.push({
              rowNumber,
              status: 'failed',
              data: base,
              errors: [
                { code: 'upsert_failed', message: describeProviderError(err).slice(0, 500) },
              ],
            });
          }
        }
        await this.importJobs.recordRows(jobId, rows);
        await this.importJobs.setTotal(jobId, rowNumber);
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < (options.maxPages ?? 50));
      await this.importJobs.complete(jobId);
      await this.markIntegration({ lastSuccessAt: this.clock.now(), lastError: null });
    } catch (err) {
      await this.importJobs.fail(jobId, err).catch(() => undefined);
      await this.markIntegration({
        lastErrorAt: this.clock.now(),
        lastError: describeProviderError(err),
      });
    }
  }

  private async markIntegration(data: {
    lastSuccessAt?: Date;
    lastErrorAt?: Date;
    lastError: string | null;
  }): Promise<void> {
    await this.prisma.integrationSetting
      .upsert({
        where: { provider: OCM_INTEGRATION_KEY },
        create: { provider: OCM_INTEGRATION_KEY, category: 'stations', enabled: false, ...data },
        update: data,
      })
      .catch((err: unknown) => this.logger.warn(`integration status: ${(err as Error).message}`));
  }

  /** One source record → station + operator + connectors + provenance (one transaction). */
  async upsertRecord(rec: ExternalStationRecord, ctx: SyncContext): Promise<RecordResult> {
    const now = this.clock.now();
    const provider = rec.provider;
    const warnings = [...rec.warnings];
    const countryCode = rec.countryCode ?? ctx.options.countryCode ?? null;
    if (!countryCode)
      return { status: 'invalid', stationId: null, reason: 'missing_country', warnings };

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`station-sync:${provider}:${rec.externalId}`}))`;
        const existing = await tx.providerRecord.findUnique({
          where: { provider_externalId: { provider, externalId: rec.externalId } },
          select: {
            id: true,
            payloadHash: true,
            stationId: true,
            removedAtSourceAt: true,
            station: { select: { id: true, deletedAt: true } },
          },
        });
        const touch = async () => {
          if (existing) {
            await tx.providerRecord.update({
              where: { id: existing.id },
              data: { lastSeenAt: now, lastImportJobId: ctx.jobId },
            });
          }
        };
        if (existing?.station?.deletedAt) {
          await touch();
          return {
            status: 'skipped',
            stationId: existing.stationId,
            reason: 'deleted_locally',
            warnings,
          };
        }
        if (existing?.stationId && existing.payloadHash === rec.payloadHash) {
          await touch();
          return {
            status: 'skipped',
            stationId: existing.stationId,
            reason: 'unchanged',
            warnings,
          };
        }

        const operatorId = rec.operator ? await this.upsertOperator(tx, rec, ctx, now) : null;
        const licence = rec.licence;
        const sourceFields = {
          name: rec.name.slice(0, 300),
          latitude: rec.latitude,
          longitude: rec.longitude,
          addressLine: rec.addressLine,
          city: rec.city,
          region: rec.region,
          postalCode: rec.postalCode,
          countryCode,
          accessEntranceNote: rec.accessEntranceNote,
          accessType: rec.accessType,
          phone: rec.phone,
          email: rec.email,
          websiteUrl: rec.websiteUrl,
          operationalStatus: rec.operationalStatus,
          publishedPointCount: rec.numberOfPoints
            ? Math.min(1000, Math.round(rec.numberOfPoints))
            : null,
          usageCostText: rec.usageCostText,
          lastVerifiedAt: rec.lastVerifiedAt ? new Date(rec.lastVerifiedAt) : null,
          sourceUpdatedAt: rec.sourceUpdatedAt ? new Date(rec.sourceUpdatedAt) : null,
          dataSource: 'ocm' as const,
          dataLicense: licence.licence?.slice(0, 200) ?? null,
          attribution: licence.attribution,
          ...(operatorId ? { operatorId } : {}),
        };

        let stationId: string;
        let created = false;
        if (existing?.stationId) {
          stationId = existing.stationId;
          await tx.chargingStation.update({
            where: { id: stationId },
            data: {
              ...sourceFields,
              // Removed as a duplicate at the source → hidden here.
              ...(rec.removedAtSource === 'duplicate' ? { publicationStatus: 'hidden' } : {}),
            },
          });
        } else {
          const market = ctx.markets.get(countryCode);
          const timezone = market?.timezone ?? COUNTRY_TIMEZONES[countryCode] ?? 'UTC';
          if (!market && !COUNTRY_TIMEZONES[countryCode])
            warnings.push('timezone_unknown_utc_used');
          const s = await tx.chargingStation.create({
            data: {
              ...sourceFields,
              marketCode: market?.code ?? null,
              timezone,
              accessRestrictions: accessNotesOf(rec),
              publicationStatus: rec.removedAtSource === 'duplicate' ? 'hidden' : 'pending_review',
            },
            select: { id: true },
          });
          stationId = s.id;
          created = true;
        }

        const stationRecord = {
          entityType: 'station',
          stationId,
          payload: (rec.raw ?? Prisma.DbNull) as Prisma.InputJsonValue,
          payloadHash: rec.payloadHash,
          dataLicense: licence.licence?.slice(0, 200) ?? null,
          licenseUrl: licenceUrlOf(licence.licence),
          sourceUrl: provider === 'ocm' ? ocmSourceUrl(rec.externalId) : null,
          attribution: licence.attribution,
          lastSeenAt: now,
          lastSyncedAt: now,
          lastImportJobId: ctx.jobId,
          syncError: null,
        };
        const removedAt = rec.removedAtSource ? (existing?.removedAtSourceAt ?? now) : null;
        await tx.providerRecord.upsert({
          where: { provider_externalId: { provider, externalId: rec.externalId } },
          create: {
            provider,
            externalId: rec.externalId,
            ...stationRecord,
            removedAtSourceAt: removedAt,
          },
          update: { ...stationRecord, removedAtSourceAt: removedAt },
        });

        const connectorCount = await this.syncConnectors(tx, rec, stationId, ctx, now, warnings);

        let possibleDuplicates: string[] = [];
        if (created) {
          possibleDuplicates = await this.duplicates.findCandidates(stationId, tx);
          const publish =
            ctx.options.autoPublish === true &&
            possibleDuplicates.length === 0 &&
            connectorCount > 0 &&
            !rec.removedAtSource;
          if (publish) {
            await tx.chargingStation.update({
              where: { id: stationId },
              data: { publicationStatus: 'published' },
            });
          }
          if (possibleDuplicates.length > 0) warnings.push('possible_duplicate_needs_review');
        }
        return {
          status: created ? 'imported' : 'updated',
          stationId,
          warnings,
          possibleDuplicates,
        };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  private async upsertOperator(
    tx: Prisma.TransactionClient,
    rec: ExternalStationRecord,
    ctx: SyncContext,
    now: Date,
  ): Promise<string> {
    const op = rec.operator as NonNullable<ExternalStationRecord['operator']>;
    const provider = rec.provider;
    const contact = {
      ...(op.websiteUrl ? { websiteUrl: op.websiteUrl } : {}),
      ...(op.phone ? { phone: op.phone } : {}),
      ...(op.email ? { email: op.email } : {}),
    };
    if (op.externalId) {
      const pr = await tx.providerRecord.findUnique({
        where: { provider_externalId: { provider, externalId: op.externalId } },
        select: { id: true, operatorId: true },
      });
      if (pr?.operatorId) {
        await tx.chargingOperator.update({
          where: { id: pr.operatorId },
          data: { name: op.name.slice(0, 200), ...contact },
        });
        await tx.providerRecord.update({
          where: { id: pr.id },
          data: { lastSeenAt: now, lastSyncedAt: now, lastImportJobId: ctx.jobId },
        });
        return pr.operatorId;
      }
    }
    const byName = await tx.chargingOperator.findFirst({
      where: { name: { equals: op.name, mode: 'insensitive' } },
      select: { id: true },
    });
    const id =
      byName?.id ??
      (
        await tx.chargingOperator.create({
          data: { name: op.name.slice(0, 200), ...contact },
          select: { id: true },
        })
      ).id;
    if (op.externalId) {
      const data = {
        entityType: 'operator',
        operatorId: id,
        attribution: rec.licence.attribution,
        dataLicense: rec.licence.licence?.slice(0, 200) ?? null,
        lastSeenAt: now,
        lastSyncedAt: now,
        lastImportJobId: ctx.jobId,
      };
      await tx.providerRecord.upsert({
        where: { provider_externalId: { provider, externalId: op.externalId } },
        create: { provider, externalId: op.externalId, ...data },
        update: data,
      });
    }
    return id;
  }

  /**
   * Source connectors → connectors of the station (charging_point_id NULL:
   * the source does not group plugs into EVSEs, so none are invented).
   * Connectors that disappeared from the source are removed; connectors an
   * admin added by hand (no provider record) are kept.
   */
  private async syncConnectors(
    tx: Prisma.TransactionClient,
    rec: ExternalStationRecord,
    stationId: string,
    ctx: SyncContext,
    now: Date,
    warnings: string[],
  ): Promise<number> {
    const provider = rec.provider;
    const existing = await tx.providerRecord.findMany({
      where: { provider, entityType: 'connector', stationId },
      select: { id: true, externalId: true, connectorId: true },
    });
    const byExt = new Map(existing.map((r) => [r.externalId, r]));
    const seen = new Set<string>();
    let count = 0;
    for (const conn of rec.connectors) {
      const type = conn.connectorTypeCode ? ctx.types.get(conn.connectorTypeCode) : undefined;
      if (!conn.connectorTypeCode || !type) {
        warnings.push(`connector_skipped_unknown_type:${conn.externalId}`);
        continue;
      }
      const current =
        conn.currentType ??
        (type.supportsAc !== type.supportsDc ? (type.supportsDc ? 'DC' : 'AC') : null);
      if (!current) {
        warnings.push(`connector_skipped_unknown_current:${conn.externalId}`);
        continue;
      }
      if ((current === 'AC' && !type.supportsAc) || (current === 'DC' && !type.supportsDc)) {
        warnings.push(`connector_skipped_current_mismatch:${conn.externalId}`);
        continue;
      }
      if (conn.quantity === null) warnings.push(`quantity_unknown_1_used:${conn.externalId}`);
      const data = {
        connectorTypeCode: conn.connectorTypeCode,
        currentType: current,
        maxPowerKw: conn.maxPowerKw !== null ? Math.round(conn.maxPowerKw * 100) / 100 : null,
        maxVoltage: conn.maxVoltage !== null ? Math.round(conn.maxVoltage) || null : null,
        maxAmperage: conn.maxAmperage !== null ? Math.round(conn.maxAmperage) || null : null,
        phases: current === 'AC' ? conn.phases : null,
        format: conn.format,
        quantity:
          conn.quantity !== null ? Math.max(1, Math.min(1000, Math.round(conn.quantity))) : 1,
        operationalStatus: conn.operationalStatus,
      };
      seen.add(conn.externalId);
      const pr = byExt.get(conn.externalId);
      let connectorId = pr?.connectorId ?? null;
      if (connectorId) {
        await tx.connector.update({ where: { id: connectorId }, data });
      } else {
        connectorId = (
          await tx.connector.create({ data: { ...data, stationId }, select: { id: true } })
        ).id;
      }
      const recordData = {
        entityType: 'connector',
        stationId,
        connectorId,
        dataLicense: rec.licence.licence?.slice(0, 200) ?? null,
        attribution: rec.licence.attribution,
        lastSeenAt: now,
        lastSyncedAt: now,
        lastImportJobId: ctx.jobId,
        removedAtSourceAt: null,
      };
      await tx.providerRecord.upsert({
        where: { provider_externalId: { provider, externalId: conn.externalId } },
        create: { provider, externalId: conn.externalId, ...recordData },
        update: recordData,
      });
      count += 1;
    }
    for (const r of existing) {
      if (seen.has(r.externalId)) continue;
      await tx.providerRecord.delete({ where: { id: r.id } });
      if (r.connectorId) await tx.connector.deleteMany({ where: { id: r.connectorId, stationId } });
    }
    return count;
  }

  // --- schedule ------------------------------------------------------------------------------

  private scheduleOf(
    setting: { enabled: boolean; config: Prisma.JsonValue } | null,
  ): Omit<ScheduleView, 'configured'> {
    const cfg = (setting?.config ?? {}) as Record<string, unknown>;
    const schedule = (cfg.schedule ?? {}) as Record<string, unknown>;
    return {
      enabled: setting?.enabled ?? false,
      intervalHours: typeof schedule.intervalHours === 'number' ? schedule.intervalHours : 24,
      countryCodes: Array.isArray(schedule.countryCodes)
        ? (schedule.countryCodes as unknown[]).filter((c): c is string => typeof c === 'string')
        : [],
      autoPublish: schedule.autoPublish === true,
      lastRuns:
        schedule.lastRuns && typeof schedule.lastRuns === 'object'
          ? (schedule.lastRuns as Record<string, string>)
          : {},
    };
  }

  private async configured(): Promise<boolean> {
    const source = this.registry.get('ocm');
    return source ? (await source.status()).configured : false;
  }

  async getSchedule(): Promise<ScheduleView> {
    const setting = await this.prisma.integrationSetting.findUnique({
      where: { provider: OCM_INTEGRATION_KEY },
    });
    return { ...this.scheduleOf(setting), configured: await this.configured() };
  }

  async putSchedule(dto: SyncScheduleDto, userId: string): Promise<ScheduleView> {
    const before = await this.prisma.integrationSetting.findUnique({
      where: { provider: OCM_INTEGRATION_KEY },
    });
    const current = this.scheduleOf(before);
    const config = {
      ...((before?.config ?? {}) as Record<string, unknown>),
      schedule: {
        intervalHours: dto.intervalHours,
        countryCodes: [...new Set(dto.countryCodes)],
        autoPublish: dto.autoPublish ?? false,
        lastRuns: current.lastRuns,
      },
    };
    await this.prisma.integrationSetting.upsert({
      where: { provider: OCM_INTEGRATION_KEY },
      create: {
        provider: OCM_INTEGRATION_KEY,
        category: 'stations',
        enabled: dto.enabled,
        config,
        updatedById: userId,
      },
      update: { enabled: dto.enabled, config, updatedById: userId },
    });
    this.audit.annotate({
      entityType: 'integration_setting',
      entityId: OCM_INTEGRATION_KEY,
      before: current,
      after: config.schedule,
    });
    return this.getSchedule();
  }

  /**
   * Scheduled incremental syncs (JOBS_ENABLED instances): each configured
   * country is claimed with an optimistic update (several instances never
   * run the same country at once) and synced with modifiedSince = its last
   * run. Returns the job ids started.
   */
  async runScheduled(): Promise<string[]> {
    if (!(await this.configured())) return [];
    const started: string[] = [];
    const setting = await this.prisma.integrationSetting.findUnique({
      where: { provider: OCM_INTEGRATION_KEY },
    });
    if (!setting?.enabled) return started;
    const schedule = this.scheduleOf(setting);
    let version = setting.updatedAt;
    for (const cc of schedule.countryCodes) {
      const now = this.clock.now();
      const last = schedule.lastRuns[cc];
      if (last && now.getTime() - new Date(last).getTime() < schedule.intervalHours * 3_600_000) {
        continue;
      }
      const lastRuns = { ...schedule.lastRuns, [cc]: now.toISOString() };
      const config = {
        ...((setting.config ?? {}) as Record<string, unknown>),
        schedule: { ...((setting.config as Record<string, unknown>).schedule as object), lastRuns },
      };
      const claimed = await this.prisma.integrationSetting.updateMany({
        where: { provider: OCM_INTEGRATION_KEY, updatedAt: version },
        data: { config },
      });
      if (claimed.count !== 1) return started;
      const fresh = await this.prisma.integrationSetting.findUniqueOrThrow({
        where: { provider: OCM_INTEGRATION_KEY },
        select: { updatedAt: true },
      });
      version = fresh.updatedAt;
      schedule.lastRuns = lastRuns;
      setting.config = config;
      try {
        const job = await this.startOcm(
          {
            countryCode: cc,
            modifiedSince: last,
            autoPublish: schedule.autoPublish,
            wait: true,
          },
          null,
        );
        started.push(job.id);
      } catch (err) {
        this.logger.warn(`Scheduled OCM sync of ${cc} not run: ${describeProviderError(err)}`);
      }
    }
    return started;
  }
}
