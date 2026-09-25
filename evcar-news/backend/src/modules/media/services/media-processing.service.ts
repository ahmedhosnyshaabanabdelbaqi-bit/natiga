import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { AppConfig } from '../../../config/app-config';
import { Prisma, type MediaAsset } from '../../../generated/prisma/client';
import {
  AssetVariantKind,
  ContentStatus,
  MediaKind,
  MediaStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../providers';
import { CUBE_FACES, renderCubeFace } from '../domain/cubemap';
import {
  extensionOf,
  imageRenditionKey,
  imageRenditionWidths,
  maxBytesFor,
  MULTIRES_MAX_SOURCE_WIDTH,
  PANORAMA_PREVIEW,
  PANORAMA_RENDITION_QUALITY,
  panoramaRenditionKey,
  panoramaRenditionWidths,
  previewKey,
  PUBLIC_FILE_CACHE,
  SHARP_PIXEL_LIMIT,
  thumbnailKey,
  IMAGE_THUMBNAIL_WIDTH,
  TILE_QUALITY,
  tilesPrefix,
  videoKey,
  type UploadKind,
} from '../domain/media-rules';
import {
  fallbackPath,
  multiresConfig,
  planMultires,
  tilePath,
  tileRects,
  type MultiresConfig,
} from '../domain/multires';
import { metadataOf } from './media-assets.service';

/** Variant kinds owned (fully rewritten) by the processing job. */
const GENERATED_KINDS = [
  AssetVariantKind.preview,
  AssetVariantKind.rendition,
  AssetVariantKind.thumbnail,
  AssetVariantKind.tile,
  AssetVariantKind.cubemap_face,
  AssetVariantKind.multires_config,
];

interface GeneratedFile {
  kind: AssetVariantKind;
  label: string;
  storageKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  level?: number | null;
  face?: string | null;
}

export interface ProcessContext {
  /** 1-based attempt of the job (BullMQ attemptsMade + 1). */
  attempt?: number;
  maxAttempts?: number;
  /** Progress callback (e.g. job.updateProgress). */
  onProgress?: (percent: number) => void | Promise<void>;
}

export interface ProcessResult {
  assetId: string;
  status: 'ready' | 'skipped' | 'failed';
  files: number;
  reason?: string;
}

class Progress {
  private last = -1;
  private lastAt = 0;
  constructor(
    private readonly save: (p: number) => Promise<void>,
    private readonly hook?: (p: number) => void | Promise<void>,
  ) {}
  async set(p: number, force = false): Promise<void> {
    const value = Math.max(0, Math.min(99, Math.floor(p)));
    if (!force && (value === this.last || (value - this.last < 5 && Date.now() - this.lastAt < 1500))) {
      return;
    }
    this.last = value;
    this.lastAt = Date.now();
    await this.save(value);
    await this.hook?.(value);
  }
}

/**
 * Background processing of media assets (REQUIREMENTS §8–9, ARCHITECTURE
 * §4.8), run by the BullMQ worker (MediaProcessingProcessor) — or inline in
 * tests. Output per kind:
 *  - panorama: fast preview (1024×512, low quality), device renditions
 *    (2048 / 4096 / 8192 px wide when the source allows) and Pannellum
 *    multires tiles (6 cube faces × levels + fallback faces + config JSON);
 *  - image: WebP thumbnail + renditions (metadata / GPS stripped);
 *  - video: a public copy of the (validated) original — no transcoding.
 * The original is never modified. Idempotent: output keys are deterministic,
 * the generated variant rows are replaced in one transaction and files of
 * an earlier run that are no longer produced are deleted, so a retry or a
 * re-run converges to the same state. Progress (0–100), attempts, start
 * time and errors are persisted on the asset.
 */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Is the asset used by live content (then it must stay `ready`, database rule)? */
  private async inUse(id: string): Promise<boolean> {
    const live = { status: ContentStatus.published, deletedAt: null };
    const [scenes, hotspots, covers] = await Promise.all([
      this.prisma.tourScene.count({ where: { assetId: id, tour: live } }),
      this.prisma.sceneHotspot.count({ where: { mediaAssetId: id, scene: { tour: live } } }),
      this.prisma.article.count({
        where: {
          coverAssetId: id,
          status: { in: [ContentStatus.scheduled, ContentStatus.published] },
          deletedAt: null,
        },
      }),
    ]);
    return scenes + hotspots + covers > 0;
  }

  async process(assetId: string, ctx: ProcessContext = {}): Promise<ProcessResult> {
    const attempt = ctx.attempt ?? 1;
    const maxAttempts = ctx.maxAttempts ?? 1;
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.deletedAt) {
      return { assetId, status: 'skipped', files: 0, reason: 'missing_or_deleted' };
    }
    if (
      asset.status === MediaStatus.rejected ||
      asset.status === MediaStatus.uploading ||
      metadataOf(asset).embed
    ) {
      return { assetId, status: 'skipped', files: 0, reason: `status_${asset.status}` };
    }
    if (asset.kind === MediaKind.document) {
      if (asset.status !== MediaStatus.ready) {
        await this.prisma.mediaAsset.update({
          where: { id: assetId },
          data: { status: MediaStatus.ready, processingProgress: 100, processedAt: new Date() },
        });
      }
      return { assetId, status: 'ready', files: 0, reason: 'nothing_to_generate' };
    }
    const wasReady = asset.status === MediaStatus.ready;
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        // A ready file keeps serving while it is re-processed (live content needs it ready).
        status: wasReady ? MediaStatus.ready : MediaStatus.processing,
        processingAttempts: { increment: 1 },
        processingStartedAt: new Date(),
        processingProgress: 0,
        processingError: null,
      },
    });
    const progress = new Progress(async (p) => {
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: { processingProgress: p },
      });
    }, ctx.onProgress);

    const previous = await this.prisma.assetVariant.findMany({
      where: { assetId, kind: { in: GENERATED_KINDS } },
      select: { storageKey: true },
    });
    const written: string[] = [];
    try {
      let files: GeneratedFile[];
      let multires: MultiresConfig | null = null;
      if (asset.kind === MediaKind.panorama) {
        const out = await this.processPanorama(asset, progress, written);
        files = out.files;
        multires = out.multires;
      } else if (asset.kind === MediaKind.image) {
        files = await this.processImage(asset, progress, written);
      } else if (asset.kind === MediaKind.video) {
        files = await this.processVideo(asset, written);
      } else {
        return { assetId, status: 'skipped', files: 0, reason: `kind_${asset.kind}` };
      }
      await progress.set(98, true);
      await this.prisma.$transaction(async (tx) => {
        await tx.assetVariant.deleteMany({ where: { assetId, kind: { in: GENERATED_KINDS } } });
        await tx.assetVariant.createMany({
          data: files.map((f) => ({
            assetId,
            kind: f.kind,
            label: f.label,
            storageKey: f.storageKey,
            mimeType: f.mimeType,
            width: f.width,
            height: f.height,
            sizeBytes: BigInt(f.sizeBytes),
            level: f.level ?? null,
            face: f.face ?? null,
          })),
        });
        await tx.mediaAsset.update({
          where: { id: assetId },
          data: {
            status: MediaStatus.ready,
            processingProgress: 100,
            processingError: null,
            processedAt: new Date(),
            multiresConfig: multires
              ? (multires as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
          },
        });
      });
      // Files of an earlier run that this run did not produce (e.g. another tile plan).
      const keep = new Set(files.map((f) => f.storageKey));
      const stale = previous.map((p) => p.storageKey).filter((k) => !keep.has(k));
      await Promise.all(stale.map((k) => this.storage.delete(k).catch(() => undefined)));
      await ctx.onProgress?.(100);
      return { assetId, status: 'ready', files: files.length };
    } catch (err) {
      const message = ((err as Error).message ?? String(err)).slice(0, 1000);
      const final = attempt >= maxAttempts;
      const keepReady = wasReady || (await this.inUse(assetId).catch(() => true));
      this.logger.warn(
        `Processing of media ${assetId} failed (attempt ${attempt}/${maxAttempts}): ${message}`,
      );
      await this.prisma.mediaAsset
        .update({
          where: { id: assetId },
          data: {
            processingError: message,
            ...(final && !keepReady ? { status: MediaStatus.failed } : {}),
          },
        })
        .catch(() => undefined);
      // Files written by this run but not registered (the previous run's rows still point
      // to the files it produced; with deterministic keys those are the same objects).
      const registered = new Set(previous.map((p) => p.storageKey));
      await Promise.all(
        written
          .filter((k) => !registered.has(k))
          .map((k) => this.storage.delete(k).catch(() => undefined)),
      );
      throw err;
    }
  }

  private async put(
    key: string,
    body: Buffer,
    contentType: string,
    written: string[],
  ): Promise<number> {
    await this.storage.put(key, body, { contentType, cacheControl: PUBLIC_FILE_CACHE });
    written.push(key);
    return body.length;
  }

  private async loadOriginal(asset: MediaAsset): Promise<Buffer> {
    return this.storage.getBuffer(
      asset.storageKey,
      maxBytesFor(asset.kind as UploadKind, this.config.storage.uploadMaxBytes),
    );
  }

  private async processPanorama(
    asset: MediaAsset,
    progress: Progress,
    written: string[],
  ): Promise<{ files: GeneratedFile[]; multires: MultiresConfig }> {
    const original = await this.loadOriginal(asset);
    const opts = { failOn: 'error' as const, limitInputPixels: SHARP_PIXEL_LIMIT };
    const meta = await sharp(original, opts).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? asset.width ?? 0;
    const base = () => sharp(original, opts).rotate().removeAlpha().toColourspace('srgb');
    const files: GeneratedFile[] = [];
    await progress.set(2, true);

    // 1. Fast preview (shown first by the viewer).
    const preview = await base()
      .resize(PANORAMA_PREVIEW.width, PANORAMA_PREVIEW.height, { fit: 'fill' })
      .blur(0.6)
      .jpeg({ quality: PANORAMA_PREVIEW.quality, progressive: true, mozjpeg: true })
      .toBuffer();
    files.push({
      kind: AssetVariantKind.preview,
      label: 'preview',
      storageKey: previewKey(asset.id),
      mimeType: 'image/jpeg',
      width: PANORAMA_PREVIEW.width,
      height: PANORAMA_PREVIEW.height,
      sizeBytes: await this.put(previewKey(asset.id), preview, 'image/jpeg', written),
    });
    await progress.set(8);

    // 2. Device renditions.
    const widths = panoramaRenditionWidths(width);
    for (const [i, w] of widths.entries()) {
      const h = Math.round(w / 2);
      const body = await base()
        .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
        .jpeg({ quality: PANORAMA_RENDITION_QUALITY, progressive: true, mozjpeg: true })
        .toBuffer();
      const key = panoramaRenditionKey(asset.id, w);
      files.push({
        kind: AssetVariantKind.rendition,
        label: String(w),
        storageKey: key,
        mimeType: 'image/jpeg',
        width: w,
        height: h,
        sizeBytes: await this.put(key, body, 'image/jpeg', written),
      });
      await progress.set(8 + ((i + 1) / widths.length) * 27);
    }

    // 3. Multires tiles (cube faces from a source ≤ 8192 px wide).
    const plan = planMultires(width);
    const srcWidth = Math.min(width, MULTIRES_MAX_SOURCE_WIDTH);
    const src = await base()
      .resize(srcWidth, Math.round(srcWidth / 2), { fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const frame = {
      data: src.data,
      width: src.info.width,
      height: src.info.height,
      channels: src.info.channels,
    };
    const prefix = tilesPrefix(asset.id);
    const totalSteps = CUBE_FACES.length * (plan.levels.length + 1);
    let step = 0;
    for (const face of CUBE_FACES) {
      const faceRaw = renderCubeFace(frame, face, plan.cubeResolution);
      const raw = { raw: { width: plan.cubeResolution, height: plan.cubeResolution, channels: 3 as const } };
      for (const level of plan.levels) {
        const levelBuf =
          level.size === plan.cubeResolution
            ? faceRaw
            : await sharp(faceRaw, raw)
                .resize(level.size, level.size, { kernel: 'lanczos3' })
                .raw()
                .toBuffer();
        const levelRaw = { raw: { width: level.size, height: level.size, channels: 3 as const } };
        for (const r of tileRects(level, plan.tileResolution)) {
          const tile = await sharp(levelBuf, levelRaw)
            .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
            .jpeg({ quality: TILE_QUALITY, mozjpeg: true })
            .toBuffer();
          const rel = tilePath(level.level, face, r.row, r.col);
          const key = `${prefix}/${rel}`;
          files.push({
            kind: AssetVariantKind.tile,
            label: rel,
            storageKey: key,
            mimeType: 'image/jpeg',
            width: r.width,
            height: r.height,
            sizeBytes: await this.put(key, tile, 'image/jpeg', written),
            level: level.level,
            face,
          });
        }
        step += 1;
        await progress.set(35 + (step / totalSteps) * 60);
      }
      const fallback = await sharp(faceRaw, raw)
        .resize(plan.fallbackSize, plan.fallbackSize, { kernel: 'lanczos3' })
        .jpeg({ quality: TILE_QUALITY, mozjpeg: true })
        .toBuffer();
      const fbRel = fallbackPath(face);
      const fbKey = `${prefix}/${fbRel}`;
      files.push({
        kind: AssetVariantKind.cubemap_face,
        label: fbRel,
        storageKey: fbKey,
        mimeType: 'image/jpeg',
        width: plan.fallbackSize,
        height: plan.fallbackSize,
        sizeBytes: await this.put(fbKey, fallback, 'image/jpeg', written),
        level: null,
        face,
      });
      step += 1;
      await progress.set(35 + (step / totalSteps) * 60);
    }
    const config = multiresConfig(plan);
    const configBody = Buffer.from(JSON.stringify(config));
    const configKey = `${prefix}/config.json`;
    files.push({
      kind: AssetVariantKind.multires_config,
      label: 'config',
      storageKey: configKey,
      mimeType: 'application/json',
      width: null,
      height: null,
      sizeBytes: await this.put(configKey, configBody, 'application/json', written),
    });
    return { files, multires: config };
  }

  private async processImage(
    asset: MediaAsset,
    progress: Progress,
    written: string[],
  ): Promise<GeneratedFile[]> {
    const original = await this.loadOriginal(asset);
    const opts = { failOn: 'error' as const, limitInputPixels: SHARP_PIXEL_LIMIT };
    const meta = await sharp(original, opts).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? asset.width ?? 0;
    const files: GeneratedFile[] = [];
    const widths = [IMAGE_THUMBNAIL_WIDTH, ...imageRenditionWidths(width)];
    for (const [i, w] of widths.entries()) {
      const thumb = i === 0;
      const { data, info } = await sharp(original, opts)
        .rotate()
        .resize({ width: Math.min(w, width), withoutEnlargement: true })
        .webp({ quality: thumb ? 70 : 82 })
        .toBuffer({ resolveWithObject: true });
      const key = thumb ? thumbnailKey(asset.id) : imageRenditionKey(asset.id, info.width);
      files.push({
        kind: thumb ? AssetVariantKind.thumbnail : AssetVariantKind.rendition,
        label: thumb ? 'thumbnail' : `w${info.width}`,
        storageKey: key,
        mimeType: 'image/webp',
        width: info.width,
        height: info.height,
        sizeBytes: await this.put(key, data, 'image/webp', written),
      });
      await progress.set(((i + 1) / widths.length) * 95);
    }
    // Several target widths may collapse to the source width: keep one row per key.
    return [...new Map(files.map((f) => [f.storageKey, f])).values()];
  }

  private async processVideo(asset: MediaAsset, written: string[]): Promise<GeneratedFile[]> {
    const mime = asset.mimeType ?? 'video/mp4';
    const key = videoKey(asset.id, extensionOf(mime));
    const { stream } = await this.storage.get(asset.storageKey);
    const info = await this.storage.put(key, stream, {
      contentType: mime,
      cacheControl: PUBLIC_FILE_CACHE,
    });
    written.push(key);
    return [
      {
        kind: AssetVariantKind.rendition,
        label: 'source',
        storageKey: key,
        mimeType: mime,
        width: asset.width,
        height: asset.height,
        sizeBytes: info.size,
      },
    ];
  }
}
