import { Inject, Injectable, Logger } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AppConfig } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import { Prisma, type UploadSession } from '../../../generated/prisma/client';
import {
  MediaKind,
  MediaProjection,
  MediaStatus,
  UploadSessionStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider, type UploadedPart } from '../../../providers';
import { AuditService } from '../../audit';
import {
  DEFAULT_CHUNK_BYTES,
  KIND_RULES,
  MAX_UPLOAD_PARTS,
  maxBytesFor,
  originalKey,
  S3_MIN_PART_BYTES,
  type UploadKind,
} from '../domain/media-rules';
import type { ValidationProblem } from '../domain/panorama-checks';
import type { CreateUploadDto, MediaCompletionDto, UploadSessionDto } from '../dto/media.dto';
import { MediaErrors, mediaFieldError } from '../media-errors';
import {
  ADMIN_ASSET_INCLUDE,
  MediaAssetsService,
  type AssetMetadata,
} from './media-assets.service';
import { MediaJobsService } from './media-jobs.service';
import { MediaValidationService, type ValidationReport } from './media-validation.service';

interface StoredPart extends UploadedPart {
  size: number;
  offset: number;
}

/** Client data kept on the session (never trusted for validation). */
interface SessionMetadata {
  assetId: string;
  licenseId?: string | null;
  previousVersionId?: string | null;
  creditText?: string | null;
  altTextAr?: string | null;
  altTextEn?: string | null;
}

export interface Actor {
  id: string;
  permissions: string[];
}

const KIND_TO_MEDIA: Record<UploadKind, MediaKind> = {
  image: MediaKind.image,
  panorama: MediaKind.panorama,
  video: MediaKind.video,
  document: MediaKind.document,
};

function partsOf(s: Pick<UploadSession, 'parts'>): StoredPart[] {
  return Array.isArray(s.parts) ? (s.parts as unknown as StoredPart[]) : [];
}

function metaOf(s: Pick<UploadSession, 'metadata'>): SessionMetadata {
  return (s.metadata ?? {}) as unknown as SessionMetadata;
}

/**
 * Resumable uploads (REQUIREMENTS §9 "رفع الملفات الكبيرة مع استئناف
 * الرفع"), tus-like without a tus dependency:
 *   1. POST   create a session (declared size / type / optional SHA-256)
 *   2. PATCH  send chunks at `Upload-Offset` = receivedBytes; a chunk at any
 *             other offset is refused with 409 + the expected offset, so an
 *             interrupted client asks (HEAD/GET) and resumes from there
 *   3. POST   complete: the parts are assembled into the private original,
 *             validated (magic bytes, decode, dimensions, 2:1, checksum) and
 *             a media asset is created (rejected files are recorded as
 *             `rejected` and their bytes deleted), then processing is queued.
 * Each chunk is one multipart part of the storage provider (S3 multipart
 * or the local driver's parts directory), so nothing is buffered in the
 * API beyond one chunk.
 */
@Injectable()
export class UploadSessionsService {
  private readonly logger = new Logger(UploadSessionsService.name);
  /** Serialises chunk writes of one session inside this process. */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly validation: MediaValidationService,
    private readonly assets: MediaAssetsService,
    private readonly jobs: MediaJobsService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Smallest accepted chunk except the last one. */
  private minChunk(): number {
    return this.storage.driver === 's3' ? S3_MIN_PART_BYTES : 1;
  }

  private maxChunk(): number {
    return this.config.storage.uploadChunkMaxBytes;
  }

  view(s: UploadSession): UploadSessionDto {
    return {
      id: s.id,
      status: s.status,
      kind: s.kind,
      purpose: s.purpose,
      filename: s.filename,
      declaredMimeType: s.declaredMimeType,
      totalBytes: Number(s.totalBytes),
      receivedBytes: Number(s.receivedBytes),
      chunkSizeBytes: s.chunkSizeBytes ?? DEFAULT_CHUNK_BYTES,
      minChunkBytes: this.minChunk(),
      maxChunkBytes: this.maxChunk(),
      partsReceived: partsOf(s).length,
      expiresAt: s.expiresAt.toISOString(),
      lastChunkAt: s.lastChunkAt?.toISOString() ?? null,
      assetId: s.assetId ?? metaOf(s).assetId ?? null,
      error: s.error,
      createdAt: s.createdAt.toISOString(),
    };
  }

  async create(dto: CreateUploadDto, actor: Actor): Promise<UploadSessionDto> {
    const kind = dto.kind;
    const maxBytes = maxBytesFor(kind, this.config.storage.uploadMaxBytes);
    if (dto.sizeBytes > maxBytes) throw MediaErrors.fileTooLarge(maxBytes);
    const declared = dto.mimeType.toLowerCase();
    if (!KIND_RULES[kind].mimes.includes(declared)) {
      throw new AppException({
        status: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: {
          ar: 'نوع الملف غير مقبول لهذا النوع من الوسائط.',
          en: 'This file type is not accepted for this kind of media.',
        },
        details: { accepted: KIND_RULES[kind].mimes },
      });
    }
    const min = this.minChunk();
    const max = this.maxChunk();
    const chunk = Math.min(max, Math.max(min, dto.chunkSizeBytes ?? DEFAULT_CHUNK_BYTES));
    if (Math.ceil(dto.sizeBytes / chunk) > MAX_UPLOAD_PARTS) {
      throw mediaFieldError('chunkSizeBytes', 'min', {
        ar: 'حجم الجزء صغير جدًا لهذا الملف (الحد 10000 جزء).',
        en: 'The chunk size is too small for this file (max 10 000 chunks).',
      });
    }
    if (dto.licenseId) {
      if (!actor.permissions.includes('licenses.write')) throw MediaErrors.licenseForbidden();
      const l = await this.prisma.assetLicense.findUnique({
        where: { id: dto.licenseId },
        select: { id: true },
      });
      if (!l) throw MediaErrors.unknownLicense();
    }
    if (dto.previousVersionId) {
      const prev = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.previousVersionId },
        select: { kind: true, deletedAt: true },
      });
      if (!prev || prev.deletedAt) {
        throw mediaFieldError('previousVersionId', 'exists', {
          ar: 'الملف السابق غير موجود.',
          en: 'Unknown previous file.',
        });
      }
      if (prev.kind !== KIND_TO_MEDIA[kind]) throw MediaErrors.versionKindMismatch();
    }

    const assetId = uuidv7();
    const key = originalKey(assetId);
    const upload = await this.storage.createMultipartUpload(key, { contentType: declared });
    const meta: SessionMetadata = {
      assetId,
      licenseId: dto.licenseId ?? null,
      previousVersionId: dto.previousVersionId ?? null,
      creditText: dto.creditText?.trim() || null,
      altTextAr: dto.altTextAr?.trim() || null,
      altTextEn: dto.altTextEn?.trim() || null,
    };
    try {
      const session = await this.prisma.uploadSession.create({
        data: {
          userId: actor.id,
          kind: KIND_TO_MEDIA[kind],
          purpose: dto.purpose ?? null,
          filename: dto.filename.slice(0, 255),
          declaredMimeType: declared,
          totalBytes: BigInt(dto.sizeBytes),
          chunkSizeBytes: chunk,
          expectedSha256: dto.sha256?.toLowerCase() ?? null,
          tempKey: key,
          multipartUploadId: upload.uploadId,
          metadata: meta as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + this.config.storage.uploadSessionTtlHours * 3_600_000),
        },
      });
      const view = this.view(session);
      this.audit.annotate({
        entityType: 'upload_session',
        entityId: session.id,
        action: 'media.uploads.create',
        after: view,
      });
      return view;
    } catch (err) {
      await this.storage.abortMultipartUpload(upload).catch(() => undefined);
      throw err;
    }
  }

  /** Loads a session of the caller (media.manage may act on anyone's). */
  private async load(id: string, actor: Actor): Promise<UploadSession> {
    const s = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!s) throw MediaErrors.notFound('upload_session');
    if (s.userId !== actor.id && !actor.permissions.includes('media.manage')) {
      throw MediaErrors.notOwner();
    }
    return s;
  }

  /** Marks an active session past its expiry as expired (and frees its parts). */
  private async expireIfDue(s: UploadSession): Promise<UploadSession> {
    if (s.status !== UploadSessionStatus.active || s.expiresAt > new Date()) return s;
    await this.abortStorage(s);
    return this.prisma.uploadSession.update({
      where: { id: s.id },
      data: { status: UploadSessionStatus.expired },
    });
  }

  async get(id: string, actor: Actor): Promise<UploadSessionDto> {
    return this.view(await this.expireIfDue(await this.load(id, actor)));
  }

  private async withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.locks.set(id, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  /**
   * Appends one chunk at `offset`. Returns the new offset. Idempotent for
   * retries: a chunk already stored answers 409 with the current offset.
   */
  async appendChunk(id: string, offset: number, body: Buffer, actor: Actor): Promise<number> {
    return this.withLock(id, async () => {
      const s = await this.expireIfDue(await this.load(id, actor));
      if (s.status !== UploadSessionStatus.active) throw MediaErrors.sessionGone(s.status);
      const received = Number(s.receivedBytes);
      const total = Number(s.totalBytes);
      if (offset !== received) throw MediaErrors.offsetMismatch(received);
      if (!body.length) throw MediaErrors.emptyChunk();
      if (body.length > this.maxChunk()) {
        throw new AppException({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
      }
      if (offset + body.length > total) throw MediaErrors.exceedsLength(total);
      const isLast = offset + body.length === total;
      if (!isLast && body.length < this.minChunk()) {
        throw MediaErrors.chunkTooSmall(this.minChunk());
      }
      const parts = partsOf(s);
      const partNumber = parts.length + 1;
      if (partNumber > MAX_UPLOAD_PARTS) throw MediaErrors.tooManyParts();
      const part = await this.storage.uploadPart(
        { key: s.tempKey, uploadId: s.multipartUploadId! },
        partNumber,
        body,
      );
      const next = offset + body.length;
      const stored: StoredPart = { ...part, size: body.length, offset };
      // Conditional: another instance may have written the same offset meanwhile.
      const res = await this.prisma.uploadSession.updateMany({
        where: {
          id,
          status: UploadSessionStatus.active,
          receivedBytes: BigInt(offset),
        },
        data: {
          receivedBytes: BigInt(next),
          parts: [...parts, stored] as unknown as Prisma.InputJsonValue,
          lastChunkAt: new Date(),
        },
      });
      if (res.count !== 1) {
        const fresh = await this.prisma.uploadSession.findUniqueOrThrow({ where: { id } });
        throw MediaErrors.offsetMismatch(Number(fresh.receivedBytes));
      }
      return next;
    });
  }

  private async abortStorage(s: UploadSession): Promise<void> {
    if (!s.multipartUploadId) return;
    await this.storage
      .abortMultipartUpload({ key: s.tempKey, uploadId: s.multipartUploadId })
      .catch((err: unknown) =>
        this.logger.warn(`abort multipart ${s.id} failed: ${(err as Error).message}`),
      );
  }

  async abort(id: string, actor: Actor): Promise<void> {
    await this.withLock(id, async () => {
      const s = await this.load(id, actor);
      if (s.status !== UploadSessionStatus.active) return;
      await this.abortStorage(s);
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: UploadSessionStatus.aborted, error: 'aborted by user' },
      });
      this.audit.annotate({ entityType: 'upload_session', entityId: id });
    });
  }

  /** Assembles, validates and registers the file; queues processing. */
  async complete(id: string, actor: Actor): Promise<MediaCompletionDto> {
    return this.withLock(id, async () => {
      let s = await this.load(id, actor);
      if (s.status === UploadSessionStatus.completed && s.assetId) {
        // Idempotent: the client retried after a lost response.
        const asset = await this.assets.load(s.assetId);
        return {
          ...this.assets.view(asset),
          processingJob: { queued: false, jobId: null, reason: 'already_completed' },
          duplicateOf: null,
        };
      }
      s = await this.expireIfDue(s);
      if (s.status !== UploadSessionStatus.active) throw MediaErrors.sessionGone(s.status);
      const total = Number(s.totalBytes);
      if (Number(s.receivedBytes) !== total) {
        throw MediaErrors.incomplete(Number(s.receivedBytes), total);
      }
      const meta = metaOf(s);
      const kind = s.kind as UploadKind;
      const parts = partsOf(s).map(({ partNumber, etag }) => ({ partNumber, etag }));
      try {
        await this.storage.completeMultipartUpload(
          { key: s.tempKey, uploadId: s.multipartUploadId! },
          parts,
        );
      } catch (err) {
        this.logger.warn(`assembling upload ${id} failed: ${(err as Error).message}`);
        await this.abortStorage(s);
        await this.prisma.uploadSession.update({
          where: { id },
          data: { status: UploadSessionStatus.aborted, error: 'assembly_failed' },
        });
        throw MediaErrors.rejectedWithoutAsset([
          {
            code: 'assembly_failed',
            message: {
              ar: 'تعذر تجميع أجزاء الملف؛ أعد الرفع.',
              en: 'The file parts could not be assembled; upload the file again.',
            },
          },
        ]);
      }

      let report: ValidationReport;
      try {
        report = await this.validation.validate({
          key: s.tempKey,
          kind,
          declaredMime: s.declaredMimeType,
          expectedBytes: total,
          expectedSha256: s.expectedSha256,
          maxBytes: maxBytesFor(kind, this.config.storage.uploadMaxBytes),
        });
      } catch (err) {
        this.logger.error(`validation of upload ${id} crashed: ${(err as Error).message}`);
        report = {
          version: 1,
          checkedAt: new Date().toISOString(),
          ok: false,
          problems: [
            {
              code: 'unreadable',
              message: { ar: 'تعذرت قراءة الملف.', en: 'The file could not be read.' },
            },
          ],
          warnings: [],
          sniffedMime: null,
          declaredMime: s.declaredMimeType,
          format: null,
          width: null,
          height: null,
          sizeBytes: total,
          sha256: '',
          measures: null,
          gpano: null,
        };
      }

      if (!report.ok) return this.reject(s, meta, report, actor);
      return this.register(s, meta, report, actor);
    });
  }

  private assetMetadata(s: UploadSession, report: ValidationReport): AssetMetadata {
    return {
      purpose: s.purpose,
      uploadSessionId: s.id,
      validation: report as unknown as AssetMetadata['validation'],
      visualCheck: null,
    };
  }

  private async reject(
    s: UploadSession,
    meta: SessionMetadata,
    report: ValidationReport,
    actor: Actor,
  ): Promise<never> {
    // Keep a record (admin "failed uploads" report) but never the bytes.
    await this.storage.delete(s.tempKey).catch(() => undefined);
    const problems: ValidationProblem[] = report.problems;
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.create({
        data: {
          id: meta.assetId,
          kind: s.kind,
          status: MediaStatus.rejected,
          storageDriver: this.storage.driver,
          storageKey: s.tempKey,
          originalFilename: s.filename,
          mimeType: report.sniffedMime,
          sizeBytes: BigInt(report.sizeBytes),
          width: report.width,
          height: report.height,
          checksumSha256: report.sha256 || null,
          metadata: this.assetMetadata(s, report) as Prisma.InputJsonValue,
          processingError: problems
            .map((p) => p.code)
            .join(', ')
            .slice(0, 1000),
          uploadedById: actor.id,
        },
      });
      await tx.uploadSession.update({
        where: { id: s.id },
        data: {
          status: UploadSessionStatus.aborted,
          assetId: meta.assetId,
          error: `rejected: ${problems.map((p) => p.code).join(', ')}`.slice(0, 1000),
        },
      });
    });
    await this.audit.recordSafe({
      action: 'media.upload_rejected',
      entityType: 'media_asset',
      entityId: meta.assetId,
      after: { problems: problems.map((p) => p.code), filename: s.filename, kind: s.kind },
    });
    this.audit.annotate({ entityType: 'media_asset', entityId: meta.assetId });
    throw MediaErrors.rejected(meta.assetId, problems);
  }

  private async register(
    s: UploadSession,
    meta: SessionMetadata,
    report: ValidationReport,
    actor: Actor,
  ): Promise<MediaCompletionDto> {
    const kind = s.kind as UploadKind;
    const processed = KIND_RULES[kind].processed;
    let version = 1;
    if (meta.previousVersionId) {
      const prev = await this.prisma.mediaAsset.findUnique({
        where: { id: meta.previousVersionId },
        select: { version: true },
      });
      version = (prev?.version ?? 0) + 1;
    }
    const duplicate = report.sha256
      ? await this.prisma.mediaAsset.findFirst({
          where: {
            checksumSha256: report.sha256,
            kind: s.kind,
            deletedAt: null,
            status: { notIn: [MediaStatus.rejected, MediaStatus.failed] },
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    if (duplicate) {
      report.warnings.push({
        code: 'duplicate_file',
        severity: 'info',
        message: {
          ar: 'يوجد ملف مطابق تمامًا في المكتبة بالفعل.',
          en: 'An identical file already exists in the library.',
        },
        data: { assetId: duplicate.id },
      });
    }
    const asset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          id: meta.assetId,
          kind: s.kind,
          status: processed ? MediaStatus.uploaded : MediaStatus.ready,
          storageDriver: this.storage.driver,
          storageKey: s.tempKey,
          originalFilename: s.filename,
          mimeType: report.sniffedMime,
          sizeBytes: BigInt(report.sizeBytes),
          width: report.width,
          height: report.height,
          checksumSha256: report.sha256,
          projection:
            kind === 'panorama'
              ? MediaProjection.equirectangular
              : kind === 'image'
                ? MediaProjection.flat
                : null,
          metadata: this.assetMetadata(s, report) as Prisma.InputJsonValue,
          licenseId: meta.licenseId ?? null,
          creditText: meta.creditText ?? null,
          altTextAr: meta.altTextAr ?? null,
          altTextEn: meta.altTextEn ?? null,
          version,
          previousVersionId: meta.previousVersionId ?? null,
          uploadedById: actor.id,
          processingProgress: processed ? 0 : 100,
          processedAt: processed ? null : new Date(),
        },
        include: ADMIN_ASSET_INCLUDE,
      });
      await tx.uploadSession.update({
        where: { id: s.id },
        data: {
          status: UploadSessionStatus.completed,
          assetId: created.id,
          completedAt: new Date(),
        },
      });
      return created;
    });

    let processingJob: MediaCompletionDto['processingJob'] = {
      queued: false,
      jobId: null,
      reason: processed ? null : 'not_needed',
    };
    if (processed) {
      try {
        const job = await this.jobs.enqueue(asset.id, 'initial');
        processingJob = { queued: true, jobId: job.id, reason: null };
      } catch (err) {
        // Redis down: the file is safe and valid; an admin re-queues it later.
        processingJob = {
          queued: false,
          jobId: null,
          reason: err instanceof AppException ? err.code : 'queue_error',
        };
        this.logger.warn(`processing of ${asset.id} not queued: ${(err as Error).message}`);
      }
    }
    const view = this.assets.view(asset);
    this.audit.annotate({
      entityType: 'media_asset',
      entityId: asset.id,
      action: 'media.uploads.complete',
      after: view,
    });
    return { ...view, processingJob, duplicateOf: duplicate?.id ?? null };
  }

  /** Expires active sessions past their expiry (maintenance). Returns the count. */
  async expireStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.uploadSession.findMany({
      where: { status: UploadSessionStatus.active, expiresAt: { lt: now } },
      take: 200,
    });
    for (const s of stale) {
      await this.abortStorage(s);
      await this.prisma.uploadSession.updateMany({
        where: { id: s.id, status: UploadSessionStatus.active },
        data: { status: UploadSessionStatus.expired },
      });
    }
    return stale.length;
  }
}
