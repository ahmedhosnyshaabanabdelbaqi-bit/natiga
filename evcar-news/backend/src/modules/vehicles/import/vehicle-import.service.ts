import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import type { ImportJob } from '../../../generated/prisma/client';
import { ImportJobStatus, ImportRowStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { ImportJobsService, toImportJobView, type RowError, type RowRecord } from '../../system';
import { CatalogErrors } from '../common/catalog-errors';
import { can, type Actor } from '../common/data-point';
import type { ImportResultDto, ImportRowResultDto, ImportTemplateDto } from '../dto/import.dto';
import { VehicleSearchIndexer } from '../search/vehicle-search-indexer';
import { CsvFormatError, parseCsv, toCsv, type CsvRow } from './csv-codec';
import { CatalogRowHandlers, RowInvalid, rowErrorsOf, type RowAction } from './row-handlers';
import { IMPORT_TYPES, TEMPLATES, type ImportType } from './templates';

export const JOB_TYPE_PREFIX = 'vehicles.';
const RESULT_ROWS = 500;

class DryRunRollback extends Error {}

interface StoredRow {
  input: CsvRow;
  action: RowAction | null;
}

const CSV_MESSAGES: Record<string, { ar: string; en: string }> = {
  file_too_large: { ar: 'حجم الملف أكبر من 5 ميجابايت.', en: 'The file is larger than 5 MB.' },
  too_many_rows: { ar: 'الملف يتجاوز 5000 صف.', en: 'The file has more than 5000 rows.' },
  empty: { ar: 'الملف فارغ.', en: 'The file is empty.' },
  binary_content: { ar: 'الملف ليس نص CSV.', en: 'The file is not CSV text.' },
  parse_error: {
    ar: 'تعذرت قراءة CSV (تحقق من الفواصل وعلامات الاقتباس).',
    en: 'The CSV could not be parsed (check separators and quotes).',
  },
};

/**
 * CSV import of the catalog (REQUIREMENTS §17): templates with column
 * definitions, dry run with row-level errors and duplicate detection (the
 * whole import runs in one transaction with a savepoint per row and is
 * rolled back for a dry run, so the preview is exactly what a commit would
 * do), and an idempotent commit (natural keys → unchanged rows are skipped;
 * committing the same preview twice returns the first commit).
 * Bookkeeping in import_jobs / import_job_rows (type "vehicles.<template>").
 */
@Injectable()
export class VehicleImportService {
  private readonly logger = new Logger(VehicleImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ImportJobsService,
    private readonly handlers: CatalogRowHandlers,
    private readonly search: VehicleSearchIndexer,
    private readonly audit: AuditService,
  ) {}

  templates(lang: SupportedLanguage): ImportTemplateDto[] {
    return IMPORT_TYPES.map((type) => {
      const t = TEMPLATES[type];
      return {
        type,
        title: lang === 'en' ? t.titleEn : t.titleAr,
        key: lang === 'en' ? t.keyEn : t.keyAr,
        permissions: [
          'imports.run',
          'vehicles.write',
          ...(t.extraPermission ? [t.extraPermission] : []),
        ],
        columns: t.columns.map((c) => ({
          name: c.name,
          required: c.required,
          description: lang === 'en' ? c.descriptionEn : c.descriptionAr,
          ...(c.allowed ? { allowed: [...c.allowed] } : {}),
          ...(c.example ? { example: c.example } : {}),
        })),
        header: t.columns.map((c) => c.name).join(','),
      };
    });
  }

  templateCsv(type: ImportType): string {
    return toCsv(
      TEMPLATES[type].columns.map((c) => c.name),
      [],
    );
  }

  private assertPermission(type: ImportType, actor: Actor): void {
    const extra = TEMPLATES[type].extraPermission;
    if (extra && !can(actor, extra)) throw CatalogErrors.permission(extra);
  }

  private parse(type: ImportType, buffer: Buffer | undefined): CsvRow[] {
    if (!buffer?.length) {
      throw CatalogErrors.csvInvalid(
        { ar: 'أرسل ملف CSV في الحقل file.', en: 'Send the CSV file in the "file" field.' },
        { reason: 'missing_file' },
      );
    }
    let parsed: ReturnType<typeof parseCsv>;
    try {
      parsed = parseCsv(buffer);
    } catch (err) {
      if (err instanceof CsvFormatError) {
        throw CatalogErrors.csvInvalid(CSV_MESSAGES[err.message] ?? CSV_MESSAGES.parse_error, {
          reason: err.message,
          ...(err.details && typeof err.details === 'object' ? err.details : {}),
        });
      }
      throw err;
    }
    const columns = TEMPLATES[type].columns;
    const known = new Set(columns.map((c) => c.name));
    const unknown = parsed.headers.filter((h) => !known.has(h));
    const missing = columns
      .filter((c) => c.required && !parsed.headers.includes(c.name))
      .map((c) => c.name);
    const duplicated = parsed.headers.filter((h, i) => parsed.headers.indexOf(h) !== i);
    if (unknown.length || missing.length || duplicated.length) {
      throw CatalogErrors.csvInvalid(
        {
          ar: 'أعمدة الملف لا تطابق القالب. نزّل القالب من /admin/vehicles/import/templates.',
          en: 'The file columns do not match the template. Download it from /admin/vehicles/import/templates.',
        },
        {
          reason: 'columns',
          unknownColumns: unknown,
          missingColumns: missing,
          duplicatedColumns: duplicated,
        },
      );
    }
    if (parsed.rows.length === 0) {
      throw CatalogErrors.csvInvalid(CSV_MESSAGES.empty, { reason: 'empty' });
    }
    return parsed.rows;
  }

  /** Upload: dry run (default) or direct import. */
  async upload(
    type: ImportType,
    buffer: Buffer | undefined,
    filename: string | undefined,
    dryRun: boolean,
    actor: Actor,
    lang: SupportedLanguage,
  ): Promise<ImportResultDto> {
    this.assertPermission(type, actor);
    const rows = this.parse(type, buffer);
    const checksum = createHash('sha256').update(buffer!).digest('hex');
    const { job } = await this.jobs.create({
      type: `${JOB_TYPE_PREFIX}${type}`,
      source: filename?.slice(0, 200) ?? null,
      dryRun,
      createdById: actor.id,
      options: { checksum, rows: rows.length, template: type },
      ...(dryRun ? {} : { idempotencyKey: `${checksum}:${actor.id ?? 'system'}` }),
    });
    return this.run(
      job,
      type,
      rows.map((input, i) => ({ rowNumber: i + 1, input })),
      actor,
      lang,
    );
  }

  /** Applies a dry-run preview. Idempotent: a second commit returns the first result. */
  async commit(jobId: string, actor: Actor, lang: SupportedLanguage): Promise<ImportResultDto> {
    const preview = await this.jobs.get(jobId);
    const type = this.typeOf(preview);
    if (!preview.dryRun) {
      throw CatalogErrors.importJobState({
        ar: 'هذه المهمة ليست معاينة؛ لا شيء لتأكيده.',
        en: 'This job is not a dry run; there is nothing to commit.',
      });
    }
    this.assertPermission(type, actor);
    const previous = await this.commitOf(jobId);
    if (previous) return this.result(previous);
    if (preview.status !== ImportJobStatus.ready) {
      throw CatalogErrors.importJobState(
        {
          ar: 'لا يمكن تأكيد هذه المعاينة في حالتها الحالية.',
          en: 'This preview cannot be committed in its current state.',
        },
        { status: preview.status },
      );
    }
    const stored = await this.prisma.importJobRow.findMany({
      where: { jobId },
      orderBy: { rowNumber: 'asc' },
      select: { rowNumber: true, data: true },
    });
    const { job, created } = await this.jobs.create({
      type: preview.type,
      source: preview.source,
      dryRun: false,
      createdById: actor.id,
      options: { ...(preview.options as Record<string, unknown>), commitOf: jobId },
      idempotencyKey: `commit:${jobId}`,
    });
    if (!created) return this.result(job);
    const result = await this.run(
      job,
      type,
      stored.map((r) => ({
        rowNumber: r.rowNumber,
        input: (r.data as unknown as StoredRow).input ?? {},
      })),
      actor,
      lang,
    );
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: ImportJobStatus.completed,
        finishedAt: new Date(),
        options: { ...(preview.options as Record<string, unknown>), committedJobId: job.id },
      },
    });
    return result;
  }

  async get(jobId: string): Promise<ImportResultDto> {
    const job = await this.jobs.get(jobId);
    this.typeOf(job);
    return this.result(job);
  }

  private typeOf(job: ImportJob): ImportType {
    const type = job.type.startsWith(JOB_TYPE_PREFIX) ? job.type.slice(JOB_TYPE_PREFIX.length) : '';
    if (!(IMPORT_TYPES as readonly string[]).includes(type)) throw AppException.notFound();
    return type as ImportType;
  }

  private async commitOf(previewId: string): Promise<ImportJob | null> {
    return this.prisma.importJob.findFirst({
      where: {
        options: { path: ['commitOf'], equals: previewId },
        status: { notIn: [ImportJobStatus.failed, ImportJobStatus.cancelled] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async run(
    job: ImportJob,
    type: ImportType,
    rows: { rowNumber: number; input: CsvRow }[],
    actor: Actor,
    lang: SupportedLanguage,
  ): Promise<ImportResultDto> {
    const dryRun = job.dryRun;
    await this.jobs.start(job.id, dryRun ? ImportJobStatus.validating : ImportJobStatus.running);
    await this.jobs.setTotal(job.id, rows.length);
    const handler = this.handlers.handler(type);
    const records: RowRecord[] = [];
    const seen = new Map<string, number>();
    const models = new Set<string>();
    const timeout = Math.min(600_000, 30_000 + rows.length * 60);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const { rowNumber, input } of rows) {
            const key = handler.key(input);
            const first = seen.get(key);
            if (first !== undefined) {
              records.push({
                rowNumber,
                status: ImportRowStatus.duplicate,
                data: { input, action: null } satisfies StoredRow,
                errors: [
                  {
                    code: 'duplicate_in_file',
                    message:
                      lang === 'en'
                        ? `Same key as row ${first} (${TEMPLATES[type].keyEn}).`
                        : `نفس مفتاح الصف ${first} (${TEMPLATES[type].keyAr}).`,
                  },
                ],
              });
              continue;
            }
            seen.set(key, rowNumber);
            await tx.$executeRawUnsafe('SAVEPOINT vehicles_import_row');
            try {
              const out = await handler.apply(input, { tx, actor, lang });
              await tx.$executeRawUnsafe('RELEASE SAVEPOINT vehicles_import_row');
              const status =
                out.action === 'unchanged'
                  ? ImportRowStatus.skipped
                  : dryRun
                    ? ImportRowStatus.valid
                    : out.action === 'create'
                      ? ImportRowStatus.imported
                      : ImportRowStatus.updated;
              records.push({
                rowNumber,
                status,
                data: { input, action: out.action } satisfies StoredRow,
                entityType: out.entityType,
                entityId: dryRun && out.action === 'create' ? null : out.entityId,
              });
              if (!dryRun && out.action !== 'unchanged' && out.modelId) models.add(out.modelId);
            } catch (err) {
              await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT vehicles_import_row');
              records.push(this.errorRecord(rowNumber, input, err, lang));
            }
          }
          if (dryRun) throw new DryRunRollback();
        },
        { timeout, maxWait: 10_000 },
      );
    } catch (err) {
      if (!(err instanceof DryRunRollback)) {
        this.logger.error({ err, jobId: job.id }, 'Catalog import failed');
        await this.jobs.fail(job.id, err);
        throw err;
      }
    }
    for (let i = 0; i < records.length; i += 500) {
      await this.jobs.recordRows(job.id, records.slice(i, i + 500));
    }
    const finished = await this.jobs.complete(job.id);
    for (const modelId of models) await this.search.reindexModel(modelId);
    const result = await this.result(finished);
    this.audit.annotate({
      entityType: 'import_job',
      entityId: job.id,
      after: { type: job.type, dryRun, status: finished.status, summary: result.summary },
    });
    return result;
  }

  private errorRecord(
    rowNumber: number,
    input: CsvRow,
    err: unknown,
    lang: SupportedLanguage,
  ): RowRecord {
    let errors: RowError[];
    let status: ImportRowStatus = ImportRowStatus.invalid;
    if (err instanceof RowInvalid) errors = err.errors;
    else if (err instanceof AppException && err.getStatus() < 500) errors = rowErrorsOf(err, lang);
    else {
      status = ImportRowStatus.failed;
      this.logger.warn({ err }, `Import row ${rowNumber} failed`);
      const constraint = (
        err as { meta?: { driverAdapterError?: { cause?: { constraint?: string } } } }
      )?.meta?.driverAdapterError?.cause?.constraint;
      errors = [
        {
          code: constraint ?? 'failed',
          message:
            lang === 'en' ? 'The database refused this row.' : 'رفضت قاعدة البيانات هذا الصف.',
        },
      ];
    }
    return { rowNumber, status, data: { input, action: null } satisfies StoredRow, errors };
  }

  private async result(job: ImportJob): Promise<ImportResultDto> {
    const rows = await this.prisma.importJobRow.findMany({
      where: { jobId: job.id },
      orderBy: { rowNumber: 'asc' },
    });
    const summary = {
      total: rows.length,
      create: 0,
      update: 0,
      unchanged: 0,
      duplicate: 0,
      invalid: 0,
      failed: 0,
    };
    const views: ImportRowResultDto[] = rows.map((r) => {
      const action: RowAction | null = (r.data as unknown as StoredRow | null)?.action ?? null;
      if (r.status === ImportRowStatus.duplicate) summary.duplicate++;
      else if (r.status === ImportRowStatus.invalid) summary.invalid++;
      else if (r.status === ImportRowStatus.failed) summary.failed++;
      else if (action === 'create') summary.create++;
      else if (action === 'update') summary.update++;
      else if (action === 'unchanged') summary.unchanged++;
      return {
        rowNumber: r.rowNumber,
        status: r.status,
        action,
        errors: Array.isArray(r.errors) ? (r.errors as unknown as RowError[]) : [],
        entityType: r.entityType,
        entityId: r.entityId,
      };
    });
    const problems = views.filter((v) => v.errors.length > 0);
    const others = views.filter((v) => v.errors.length === 0);
    const options = (job.options ?? {}) as Record<string, unknown>;
    return {
      job: toImportJobView(job),
      summary,
      rows: [...problems, ...others].slice(0, RESULT_ROWS),
      committedJobId: typeof options.committedJobId === 'string' ? options.committedJobId : null,
    };
  }
}
