import type { ImportJob, ImportJobRow } from '../../generated/prisma/client';
import { progressOf, type RowError } from './import-jobs.service';
import type { ImportJobDto, ImportJobRowDto } from './system.dto';

export function toImportJobView(job: ImportJob): ImportJobDto {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    source: job.source,
    dryRun: job.dryRun,
    progress: progressOf(job),
    error: job.error,
    options: (job.options ?? {}) as Record<string, unknown>,
    fileAssetId: job.fileAssetId,
    createdById: job.createdById,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function toImportJobRowView(row: ImportJobRow): ImportJobRowDto {
  return {
    rowNumber: row.rowNumber,
    status: row.status,
    data: row.data,
    errors: Array.isArray(row.errors) ? (row.errors as unknown as RowError[]) : [],
    entityType: row.entityType,
    entityId: row.entityId,
  };
}
