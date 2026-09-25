import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest, type PageRequest } from '../../../common/http/pagination';
import { requestLang } from '../../../common/validation/messages';
import { Prisma, type MediaAsset } from '../../../generated/prisma/client';
import {
  AssetVariantKind,
  ContentStatus,
  MediaKind,
  MediaStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../providers';
import { AuditService } from '../../audit';
import { isoDay, licenseValidity } from '../domain/licenses';
import {
  unacknowledged,
  type ValidationWarning,
  type VisualCheck,
} from '../domain/panorama-checks';
import { parseEmbedVideo } from '../domain/video-embed';
import type {
  AdminMediaAssetDetailDto,
  AdminMediaAssetDto,
  AdminMediaListQueryDto,
  EmbedVideoDto,
  MediaFileDto,
  UpdateMediaAssetDto,
  VisualCheckDto,
} from '../dto/media.dto';
import { MediaErrors } from '../media-errors';
import { MediaJobsService } from './media-jobs.service';
import { MediaUrls } from './media-urls.service';

export const ADMIN_ASSET_INCLUDE = {
  license: true,
  variants: {
    where: {
      kind: {
        in: [AssetVariantKind.preview, AssetVariantKind.rendition, AssetVariantKind.thumbnail],
      },
    },
    orderBy: [{ width: 'asc' }, { label: 'asc' }],
  },
  _count: { select: { variants: { where: { kind: AssetVariantKind.tile } } } },
} satisfies Prisma.MediaAssetInclude;

export type AdminAssetRow = Prisma.MediaAssetGetPayload<{ include: typeof ADMIN_ASSET_INCLUDE }>;

/** Shape of media_assets.metadata written by this module. */
export interface AssetMetadata {
  purpose?: string | null;
  uploadSessionId?: string;
  validation?: {
    warnings?: ValidationWarning[];
    [k: string]: unknown;
  };
  visualCheck?: VisualCheck | null;
  embed?: { provider: string; videoId: string; embedUrl: string; watchUrl: string };
  [k: string]: unknown;
}

export function metadataOf(asset: Pick<MediaAsset, 'metadata'>): AssetMetadata {
  const m = asset.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as AssetMetadata) : {};
}

export function warningsOf(asset: Pick<MediaAsset, 'metadata'>): ValidationWarning[] {
  const w = metadataOf(asset).validation?.warnings;
  return Array.isArray(w) ? w : [];
}

export function visualCheckOf(asset: Pick<MediaAsset, 'metadata'>): VisualCheck | null {
  const v = metadataOf(asset).visualCheck;
  return v && typeof v === 'object' && typeof v.confirmedAt === 'string' ? v : null;
}

const num = (v: bigint | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * The media library (REQUIREMENTS §9): browse assets with their validation
 * report, processing progress / errors, generated files, rights and usage;
 * edit texts and licence; the editor's visual check of panoramas; versions;
 * re-processing; soft deletion (never while used); allow-listed embeds.
 */
@Injectable()
export class MediaAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrls,
    private readonly jobs: MediaJobsService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private file(v: {
    label: string;
    storageKey: string;
    width: number | null;
    height: number | null;
    sizeBytes: bigint | null;
  }): MediaFileDto {
    return {
      label: v.label,
      url: this.urls.publicUrl(v.storageKey),
      width: v.width,
      height: v.height,
      sizeBytes: num(v.sizeBytes),
    };
  }

  view(a: AdminAssetRow, lang: SupportedLanguage = requestLang()): AdminMediaAssetDto {
    const meta = metadataOf(a);
    const preview = a.variants.find((v) => v.kind === AssetVariantKind.preview);
    const thumb = a.variants.find((v) => v.kind === AssetVariantKind.thumbnail);
    return {
      id: a.id,
      kind: a.kind,
      status: a.status,
      purpose: typeof meta.purpose === 'string' ? meta.purpose : null,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      sizeBytes: num(a.sizeBytes),
      width: a.width,
      height: a.height,
      projection: a.projection,
      checksumSha256: a.checksumSha256,
      version: a.version,
      previousVersionId: a.previousVersionId,
      processing: {
        progress: a.processingProgress,
        attempts: a.processingAttempts,
        error: a.processingError,
        startedAt: a.processingStartedAt?.toISOString() ?? null,
        processedAt: a.processedAt?.toISOString() ?? null,
      },
      warnings: warningsOf(a).map((w) => ({
        code: w.code,
        severity: w.severity,
        message: w.message?.[lang] ?? w.code,
        ...(w.data ? { data: w.data } : {}),
      })),
      visualCheck: (visualCheckOf(a) as unknown as Record<string, unknown>) ?? null,
      visualCheckRequired: a.kind === MediaKind.panorama,
      license: a.license
        ? {
            id: a.license.id,
            licenseType: a.license.licenseType,
            rightsHolder: a.license.rightsHolder,
            attributionText: a.license.attributionText,
            attributionRequired: a.license.attributionRequired,
            licenseUrl: a.license.licenseUrl,
            sourceUrl: a.license.sourceUrl,
            validUntil: a.license.validUntil ? isoDay(a.license.validUntil) : null,
            isValid: licenseValidity(a.license) === 'valid',
          }
        : null,
      creditText: a.creditText,
      altTextAr: a.altTextAr,
      altTextEn: a.altTextEn,
      captionAr: a.captionAr,
      captionEn: a.captionEn,
      preview: preview ? this.file(preview) : null,
      renditions: a.variants
        .filter((v) => v.kind === AssetVariantKind.rendition)
        .map((v) => this.file(v)),
      thumbnail: thumb ? this.file(thumb) : null,
      tileCount: a._count.variants,
      multires:
        a.multiresConfig && typeof a.multiresConfig === 'object'
          ? {
              ...(a.multiresConfig as Record<string, unknown>),
              basePath: this.urls.tilesBaseUrl(a.id),
            }
          : null,
      embed: meta.embed ? { ...meta.embed } : null,
      isDemo: a.isDemo,
      uploadedById: a.uploadedById,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      deletedAt: a.deletedAt?.toISOString() ?? null,
    };
  }

  async load(id: string): Promise<AdminAssetRow> {
    const a = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: ADMIN_ASSET_INCLUDE,
    });
    if (!a) throw MediaErrors.notFound();
    return a;
  }

  async list(
    query: AdminMediaListQueryDto,
  ): Promise<{ items: AdminMediaAssetDto[]; total: number; page: PageRequest }> {
    const page = toPageRequest(query);
    const where: Prisma.MediaAssetWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.kind) where.kind = query.kind as MediaKind;
    if (query.status) where.status = query.status as MediaStatus;
    if (query.licensed === true) where.licenseId = { not: null };
    if (query.licensed === false) where.licenseId = null;
    if (query.licenseId) where.licenseId = query.licenseId;
    if (query.isDemo !== undefined) where.isDemo = query.isDemo;
    if (query.purpose) where.metadata = { path: ['purpose'], equals: query.purpose };
    if (query.q) {
      where.OR = [
        { originalFilename: { contains: query.q, mode: 'insensitive' } },
        { altTextAr: { contains: query.q, mode: 'insensitive' } },
        { altTextEn: { contains: query.q, mode: 'insensitive' } },
        { captionAr: { contains: query.q, mode: 'insensitive' } },
        { captionEn: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        include: ADMIN_ASSET_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page };
  }

  async usage(id: string): Promise<AdminMediaAssetDetailDto['usage']> {
    const published = { status: ContentStatus.published, deletedAt: null };
    const [tourScenes, hotspots, publishedScenes, publishedHotspots, articleCovers, vehicleMedia, stationMedia] =
      await Promise.all([
        this.prisma.tourScene.count({ where: { assetId: id, tour: { deletedAt: null } } }),
        this.prisma.sceneHotspot.count({
          where: { mediaAssetId: id, scene: { tour: { deletedAt: null } } },
        }),
        this.prisma.tourScene.count({ where: { assetId: id, tour: published } }),
        this.prisma.sceneHotspot.count({ where: { mediaAssetId: id, scene: { tour: published } } }),
        this.prisma.article.count({ where: { coverAssetId: id, deletedAt: null } }),
        this.prisma.vehicleMedia.count({ where: { assetId: id } }),
        this.prisma.stationMedia.count({ where: { assetId: id } }),
      ]);
    return {
      tourScenes,
      hotspots,
      publishedTours: publishedScenes + publishedHotspots,
      articleCovers,
      vehicleMedia,
      stationMedia,
    };
  }

  async detail(id: string): Promise<AdminMediaAssetDetailDto> {
    const a = await this.load(id);
    const meta = metadataOf(a);
    const ext = a.mimeType ? a.mimeType.split('/')[1] : 'bin';
    const originalUrl = meta.embed
      ? meta.embed.embedUrl
      : await this.urls.signedUrl(
          a.storageKey,
          a.originalFilename ?? `original-${a.id}.${ext}`,
        );
    return {
      ...this.view(a),
      originalUrl,
      usage: await this.usage(id),
      validation: meta.validation ? { ...meta.validation } : null,
    };
  }

  async update(
    id: string,
    dto: UpdateMediaAssetDto,
    actor: { id: string; permissions: string[] },
  ): Promise<AdminMediaAssetDto> {
    const before = await this.load(id);
    if (before.deletedAt) throw MediaErrors.notFound();
    const data: Prisma.MediaAssetUncheckedUpdateInput = {};
    if (dto.licenseId !== undefined) {
      if (!actor.permissions.includes('licenses.write')) throw MediaErrors.licenseForbidden();
      if (dto.licenseId !== null) {
        const l = await this.prisma.assetLicense.findUnique({ where: { id: dto.licenseId } });
        if (!l) throw MediaErrors.unknownLicense();
      }
      data.licenseId = dto.licenseId;
    }
    for (const k of ['creditText', 'altTextAr', 'altTextEn', 'captionAr', 'captionEn'] as const) {
      const v = dto[k];
      if (v !== undefined) data[k] = v === null || v.trim() === '' ? null : v;
    }
    const after = await this.prisma.mediaAsset.update({
      where: { id },
      data,
      include: ADMIN_ASSET_INCLUDE,
    });
    const view = this.view(after);
    this.audit.annotate({ entityId: id, before: this.view(before), after: view });
    return view;
  }

  /** Editor confirmation that a panorama really is a correct 360° interior (§9). */
  async confirmVisualCheck(
    id: string,
    dto: VisualCheckDto,
    userId: string,
  ): Promise<AdminMediaAssetDto> {
    const a = await this.load(id);
    if (a.deletedAt) throw MediaErrors.notFound();
    if (a.kind !== MediaKind.panorama) throw MediaErrors.notPanorama();
    if (a.status !== MediaStatus.ready) throw MediaErrors.notReadyForCheck(a.status);
    const missing = unacknowledged(warningsOf(a), dto.acknowledgedWarnings ?? []);
    if (missing.length > 0) throw MediaErrors.warningsNotAcknowledged(missing);
    const check: VisualCheck = {
      confirmedAt: new Date().toISOString(),
      confirmedById: userId,
      note: dto.note?.trim() || null,
      acknowledgedWarnings: dto.acknowledgedWarnings ?? [],
    };
    const meta = { ...metadataOf(a), visualCheck: check };
    const after = await this.prisma.mediaAsset.update({
      where: { id },
      data: { metadata: meta as unknown as Prisma.InputJsonValue },
      include: ADMIN_ASSET_INCLUDE,
    });
    this.audit.annotate({ entityId: id, action: 'media.visual_check.confirm', after: check });
    return this.view(after);
  }

  /** Withdraws a visual check (e.g. wrong trim noticed later). */
  async revokeVisualCheck(id: string): Promise<AdminMediaAssetDto> {
    const a = await this.load(id);
    if (a.kind !== MediaKind.panorama) throw MediaErrors.notPanorama();
    const meta = { ...metadataOf(a), visualCheck: null };
    const after = await this.prisma.mediaAsset.update({
      where: { id },
      data: { metadata: meta as unknown as Prisma.InputJsonValue },
      include: ADMIN_ASSET_INCLUDE,
    });
    this.audit.annotate({
      entityId: id,
      action: 'media.visual_check.revoke',
      before: visualCheckOf(a),
    });
    return this.view(after);
  }

  async reprocess(id: string): Promise<{ queued: boolean; jobId: string | null }> {
    const a = await this.load(id);
    if (
      a.deletedAt ||
      a.status === MediaStatus.rejected ||
      a.status === MediaStatus.uploading ||
      (a.kind !== MediaKind.panorama && a.kind !== MediaKind.image && a.kind !== MediaKind.video) ||
      metadataOf(a).embed
    ) {
      throw MediaErrors.notProcessable(a.kind, a.status);
    }
    const job = await this.jobs.enqueue(id, 'reprocess');
    return { queued: true, jobId: job.id };
  }

  /** Soft deletion (files are kept per the retention policy); refused while the file is used. */
  async remove(id: string): Promise<void> {
    const a = await this.load(id);
    if (a.deletedAt) return;
    const usage = await this.usage(id);
    const used =
      usage.tourScenes + usage.hotspots + usage.articleCovers + usage.vehicleMedia + usage.stationMedia;
    if (used > 0) throw MediaErrors.inUse({ ...usage });
    await this.prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({ entityId: id, before: this.view(a) });
  }

  /** The version chain of an asset, oldest first. */
  async versions(id: string): Promise<AdminMediaAssetDto[]> {
    const start = await this.load(id);
    const chain: AdminAssetRow[] = [start];
    let cursor: AdminAssetRow = start;
    for (let i = 0; i < 50 && cursor.previousVersionId; i++) {
      const prev = await this.prisma.mediaAsset.findUnique({
        where: { id: cursor.previousVersionId },
        include: ADMIN_ASSET_INCLUDE,
      });
      if (!prev) break;
      chain.unshift(prev);
      cursor = prev;
    }
    cursor = start;
    for (let i = 0; i < 50; i++) {
      const next = await this.prisma.mediaAsset.findFirst({
        where: { previousVersionId: cursor.id },
        include: ADMIN_ASSET_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
      if (!next) break;
      chain.push(next);
      cursor = next;
    }
    return chain.map((a) => this.view(a));
  }

  /**
   * Registers an allow-listed external video (YouTube / Vimeo) as a `video`
   * asset: the "original" kept in storage is a small JSON record of the
   * link; the apps only ever get the normalised embed URL.
   */
  async registerEmbed(
    dto: EmbedVideoDto,
    actor: { id: string; permissions: string[] },
  ): Promise<AdminMediaAssetDto> {
    const parsed = parseEmbedVideo(dto.url);
    if (!parsed) throw MediaErrors.videoNotAllowed();
    if (dto.licenseId) {
      if (!actor.permissions.includes('licenses.write')) throw MediaErrors.licenseForbidden();
      const l = await this.prisma.assetLicense.findUnique({ where: { id: dto.licenseId } });
      if (!l) throw MediaErrors.unknownLicense();
    }
    const id = uuidv7();
    const key = `private/media/${id}/embed.json`;
    const record = Buffer.from(
      JSON.stringify({ ...parsed, registeredAt: new Date().toISOString() }),
    );
    await this.storage.put(key, record, { contentType: 'application/json' });
    try {
      const created = await this.prisma.mediaAsset.create({
        data: {
          id,
          kind: MediaKind.video,
          status: MediaStatus.ready,
          storageDriver: this.storage.driver,
          storageKey: key,
          mimeType: null,
          sizeBytes: BigInt(record.length),
          checksumSha256: null,
          metadata: {
            purpose: 'hotspot_media',
            embed: parsed,
          } as unknown as Prisma.InputJsonValue,
          licenseId: dto.licenseId ?? null,
          creditText: dto.creditText?.trim() || null,
          altTextAr: dto.altTextAr?.trim() || null,
          altTextEn: dto.altTextEn?.trim() || null,
          uploadedById: actor.id,
          processingProgress: 100,
          processedAt: new Date(),
        },
        include: ADMIN_ASSET_INCLUDE,
      });
      const view = this.view(created);
      this.audit.annotate({ entityId: id, action: 'media.embed.create', after: view });
      return view;
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined);
      throw err;
    }
  }
}
