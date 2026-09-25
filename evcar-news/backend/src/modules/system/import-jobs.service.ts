import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { describeProviderError } from '../../providers/provider-status';
import {
  type ImportJob,
  type ImportJobRow,
  ImportJobStatus,
  ImportRowStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { serverMessage } from '../i18n/server-messages';

/** One problem of a row, stored in import_job_rows.errors. */
export interface RowError {
  /** Column / field name when the error is field-specific. */
  field?: string;
  /** Machine code, e.g. "required", "unknown_brand", "duplicate". */
  code: string;
  /** Human-readable message (the importer chooses the language; keep it short). */
  message: string;
}

export interface CreateImportJobInput {
  /** e.g. "vehicles.csv", "stations.csv", "stations.ocm_sync", "rss.fetch". */
  type: string;
  source?: string | null;
  options?: Record<string, unknown>;
  dryRun?: boolean;
  createdById?: string | null;
  fileAssetId?: string | null;
  /**
   * Retry-safe creation: while a job of the same type with this key is still
   * open (pending/validating/ready/running) it is returned instead of a new
   * one. Use e.g. `ocm:EG:<date>` or the uploaded file's checksum.
   */
  idempotencyKey?: string;
}

export interface RowRecord {
  /** 1-based row number in the source (CSV line without header, record index...). */
  rowNumber: number;
  status: ImportRowStatus;
  /** Raw input of the row (as far as the source licence allows storing it). */
  data: unknown;
  errors?: RowError[] | null;
  entityType?: string | null;
  entityId?: string | null;
}

export interface ImportProgress {
  total: number;
  processed: number;
  success: number;
  errors: number;
  skipped: number;
  /** 0..100, null when the total is unknown. */
  percent: number | null;
}

const OPEN_STATUSES: ImportJobStatus[] = [
  ImportJobStatus.pending,
  ImportJobStatus.validating,
  ImportJobStatus.ready,
  ImportJobStatus.running,
];
const FINISHED_STATUSES: ImportJobStatus[] = [
  ImportJobStatus.completed,
  ImportJobStatus.completed_with_errors,
  ImportJobStatus.failed,
  ImportJobStatus.cancelled,
];
const SUCCESS_ROWS: ImportRowStatus[] = [ImportRowStatus.imported, ImportRowStatus.updated];
const ERROR_ROWS: ImportRowStatus[] = [ImportRowStatus.invalid, ImportRowStatus.failed];
const SKIPPED_ROWS: ImportRowStatus[] = [ImportRowStatus.skipped, ImportRowStatus.duplicate];
/** Rows already handled: a retried job skips them (no duplicate writes). */
const DONE_ROWS: ImportRowStatus[] = [...SUCCESS_ROWS, ...SKIPPED_ROWS];

const MAX_ERRORS_PER_ROW = 50;
const MAX_ERROR_TEXT = 2_000;

export function progressOf(
  job: Pick<ImportJob, 'totalRows' | 'processedRows' | 'successRows' | 'errorRows' | 'skippedRows'>,
): ImportProgress {
  return {
    total: job.totalRows,
    processed: job.processedRows,
    success: job.successRows,
    errors: job.errorRows,
    skipped: job.skippedRows,
    percent:
      job.totalRows > 0
        ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 1000) / 10)
        : null,
  };
}

function cleanErrors(
  errors: RowError[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!errors || errors.length === 0) return Prisma.DbNull;
  return errors.slice(0, MAX_ERRORS_PER_ROW).map((e) => ({
    ...(e.field ? { field: String(e.field).slice(0, 100) } : {}),
    code: String(e.code).slice(0, 64),
    message: String(e.message).slice(0, 500),
  }));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value ?? {};
}

/**
 * Shared bookkeeping for imports and provider syncs (import_jobs +
 * import_job_rows), used by the vehicles / stations / rss modules:
 *
 *   const { job } = await importJobs.create({ type: 'stations.csv', idempotencyKey: checksum });
 *   await importJobs.start(job.id);
 *   await importJobs.setTotal(job.id, rows.length);
 *   const done = await importJobs.handledRowNumbers(job.id);   // resume after retry
 *   for (...) { if (done.has(n)) continue; ...; await importJobs.recordRow(job.id, {...}); }
 *   await importJobs.complete(job.id);
 *
 * Rows are upserted by (job, rowNumber) and counters are recomputed from the
 * rows, so re-running a job (BullMQ retry) never double-counts or duplicates.
 */
@Injectable()
export class ImportJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateImportJobInput): Promise<{ job: ImportJob; created: boolean }> {
    const type = input.type.trim();
    if (!/^[a-z0-9_.-]{2,64}$/.test(type)) {
      throw AppException.badRequest(
        serverMessage('errors.IMPORT_TYPE_INVALID'),
        { type },
        'IMPORT_TYPE_INVALID',
      );
    }
    const options: Record<string, unknown> = { ...(input.options ?? {}) };
    if (input.idempotencyKey) options.idempotencyKey = input.idempotencyKey.slice(0, 200);
    const data = {
      type,
      source: input.source?.slice(0, 500) ?? null,
      options: toJson(options),
      dryRun: input.dryRun ?? false,
      createdById: input.createdById ?? null,
      fileAssetId: input.fileAssetId ?? null,
    };
    if (!input.idempotencyKey) {
      return { job: await this.prisma.importJob.create({ data }), created: true };
    }
    const key = `import_job:${type}:${options.idempotencyKey as string}`;
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent creations with the same key.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
      const existing = await tx.importJob.findFirst({
        where: {
          type,
          status: { in: OPEN_STATUSES },
          options: { path: ['idempotencyKey'], equals: options.idempotencyKey as string },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return { job: existing, created: false };
      return { job: await tx.importJob.create({ data }), created: true };
    });
  }

  async get(id: string): Promise<ImportJob> {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw AppException.notFound();
    return job;
  }

  /** Moves a job to running (also used when a failed job is retried). */
  async start(id: string, status: ImportJobStatus = ImportJobStatus.running): Promise<ImportJob> {
    const job = await this.get(id);
    if (job.status === ImportJobStatus.cancelled) {
      throw AppException.conflict(
        'IMPORT_JOB_CANCELLED',
        serverMessage('errors.IMPORT_JOB_CANCELLED'),
      );
    }
    return this.prisma.importJob.update({
      where: { id },
      data: { status, startedAt: job.startedAt ?? new Date(), finishedAt: null, error: null },
    });
  }

  async setTotal(id: string, totalRows: number): Promise<void> {
    await this.prisma.importJob.update({
      where: { id },
      data: { totalRows: Math.max(0, Math.floor(totalRows)) },
    });
  }

  /** Upserts one row result (idempotent per row number). */
  async recordRow(jobId: string, row: RowRecord): Promise<ImportJobRow> {
    return this.prisma.importJobRow.upsert({
      where: { jobId_rowNumber: { jobId, rowNumber: row.rowNumber } },
      create: {
        jobId,
        rowNumber: row.rowNumber,
        status: row.status,
        data: toJson(row.data),
        errors: cleanErrors(row.errors),
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
      },
      update: {
        status: row.status,
        data: toJson(row.data),
        errors: cleanErrors(row.errors),
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
      },
    });
  }

  /** Records several rows in one transaction, then refreshes the counters. */
  async recordRows(jobId: string, rows: RowRecord[]): Promise<ImportProgress> {
    if (rows.length > 0) {
      await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.importJobRow.upsert({
            where: { jobId_rowNumber: { jobId, rowNumber: row.rowNumber } },
            create: {
              jobId,
              rowNumber: row.rowNumber,
              status: row.status,
              data: toJson(row.data),
              errors: cleanErrors(row.errors),
              entityType: row.entityType ?? null,
              entityId: row.entityId ?? null,
            },
            update: {
              status: row.status,
              data: toJson(row.data),
              errors: cleanErrors(row.errors),
              entityType: row.entityType ?? null,
              entityId: row.entityId ?? null,
            },
          }),
        ),
      );
    }
    return this.refreshCounters(jobId);
  }

  /** Convenience for a row that failed validation or processing. */
  logRowError(
    jobId: string,
    rowNumber: number,
    data: unknown,
    errors: RowError[],
    status: 'invalid' | 'failed' = 'invalid',
  ): Promise<ImportJobRow> {
    return this.recordRow(jobId, { rowNumber, status, data, errors });
  }

  /** Row numbers already imported/updated/skipped — skip them when a job is retried. */
  async handledRowNumbers(jobId: string): Promise<Set<number>> {
    const rows = await this.prisma.importJobRow.findMany({
      where: { jobId, status: { in: DONE_ROWS } },
      select: { rowNumber: true },
    });
    return new Set(rows.map((r) => r.rowNumber));
  }

  /** Recomputes the counters from the rows (safe to call any number of times). */
  async refreshCounters(jobId: string): Promise<ImportProgress> {
    const groups = await this.prisma.importJobRow.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const count = (statuses: ImportRowStatus[]) =>
      groups.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + g._count._all, 0);
    const success = count(SUCCESS_ROWS);
    const errors = count(ERROR_ROWS);
    const skipped = count(SKIPPED_ROWS);
    const processed = groups
      .filter((g) => g.status !== ImportRowStatus.pending)
      .reduce((s, g) => s + g._count._all, 0);
    const job = await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        processedRows: processed,
        successRows: success,
        errorRows: errors,
        skippedRows: skipped,
      },
    });
    return progressOf(job);
  }

  /**
   * Finishes a job: counters from rows; dry runs end as `ready` (preview
   * awaiting confirmation), others as completed / completed_with_errors.
   */
  async complete(jobId: string): Promise<ImportJob> {
    const progress = await this.refreshCounters(jobId);
    const job = await this.get(jobId);
    if (job.status === ImportJobStatus.cancelled) return job;
    const status = job.dryRun
      ? ImportJobStatus.ready
      : progress.errors > 0
        ? ImportJobStatus.completed_with_errors
        : ImportJobStatus.completed;
    return this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt: job.dryRun ? null : new Date(),
        totalRows: job.totalRows > 0 ? job.totalRows : progress.processed,
      },
    });
  }

  async fail(jobId: string, error: unknown): Promise<ImportJob> {
    await this.refreshCounters(jobId).catch(() => undefined);
    return this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: ImportJobStatus.failed,
        error: describeProviderError(error).slice(0, MAX_ERROR_TEXT),
        finishedAt: new Date(),
      },
    });
  }

  /** Cancels an unfinished job; processors should poll isCancelled() between batches. */
  async cancel(jobId: string): Promise<ImportJob> {
    const job = await this.get(jobId);
    if (FINISHED_STATUSES.includes(job.status)) {
      throw AppException.conflict(
        'IMPORT_JOB_FINISHED',
        serverMessage('errors.IMPORT_JOB_FINISHED'),
      );
    }
    return this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportJobStatus.cancelled, finishedAt: new Date() },
    });
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const job = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return job?.status === ImportJobStatus.cancelled;
  }

  async list(query: {
    type?: string;
    status?: ImportJobStatus;
    skip: number;
    take: number;
  }): Promise<{ items: ImportJob[]; total: number }> {
    const where: Prisma.ImportJobWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.importJob.count({ where }),
    ]);
    return { items, total };
  }

  async listRows(
    jobId: string,
    query: { status?: ImportRowStatus; skip: number; take: number },
  ): Promise<{ items: ImportJobRow[]; total: number }> {
    await this.get(jobId);
    const where: Prisma.ImportJobRowWhereInput = {
      jobId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.importJobRow.findMany({
        where,
        orderBy: { rowNumber: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.importJobRow.count({ where }),
    ]);
    return { items, total };
  }
}
