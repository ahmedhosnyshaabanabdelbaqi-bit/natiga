import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { SupportedLanguage } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import { escapeHtml } from '../../../common/sanitize/html-sanitizer';
import { MediaKind, MediaStatus, type Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../providers';
import { contentError } from '../common/content-errors';
import type { ArticleImageViewDto } from '../dto/article-common.dto';
import type { ArticleImageUploadDto, UploadedArticleImageDto } from '../dto/article-image.dto';

export const ARTICLE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const MIN_WIDTH = 200;
const RENDITION_WIDTHS = [480, 960, 1600] as const;
const DEFAULT_WIDTH = 1600;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

export const ARTICLE_IMAGE_INCLUDE = {
  variants: true,
  license: true,
} satisfies Prisma.MediaAssetInclude;

export type ArticleImageAsset = Prisma.MediaAssetGetPayload<{
  include: typeof ARTICLE_IMAGE_INCLUDE;
}>;

export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
  originalname?: string;
  mimetype?: string;
}

/**
 * Images of articles (covers and inline figures) with their rights:
 * - upload: decoded by sharp (corrupt / unsupported files refused), the
 *   original kept privately (it may carry EXIF/GPS), metadata-free WebP
 *   renditions (480 / 960 / 1600 px) published, licence + credit recorded;
 * - views: public URL + sizes + credit/licence for readers;
 * - rights check: every <img> of an article body must be one of these
 *   licensed library images (REQUIREMENTS §5 "حقوق الوسائط").
 */
@Injectable()
export class ArticleMediaService {
  private readonly logger = new Logger(ArticleMediaService.name);
  private publicPrefixCache?: string | null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** URL prefix of public objects: publicUrl('public/x') = prefix + 'x'. */
  private publicPrefix(): string | null {
    if (this.publicPrefixCache === undefined) {
      try {
        this.publicPrefixCache = this.storage.publicUrl('public/x').slice(0, -1);
      } catch {
        this.publicPrefixCache = null;
      }
    }
    return this.publicPrefixCache;
  }

  /** Origins that serve our public media (also allowed over http in development). */
  mediaOrigins(): string[] {
    const prefix = this.publicPrefix();
    if (!prefix) return [];
    try {
      return [new URL(prefix).origin];
    } catch {
      return [];
    }
  }

  private urlOf(key: string): string | null {
    if (!key.startsWith('public/')) return null;
    try {
      return this.storage.publicUrl(key);
    } catch {
      return null;
    }
  }

  /** Storage key of one of our public URLs (null for foreign URLs). */
  keyOfUrl(url: string): string | null {
    const prefix = this.publicPrefix();
    if (!prefix || !url.startsWith(prefix)) return null;
    const rest = url.slice(prefix.length).split(/[?#]/)[0];
    try {
      return `public/${decodeURIComponent(rest)}`;
    } catch {
      return null;
    }
  }

  /** Reader view of an image asset (null when it has no public rendition). */
  toView(
    asset: ArticleImageAsset | null | undefined,
    lang: SupportedLanguage,
  ): ArticleImageViewDto | null {
    if (!asset || asset.deletedAt || asset.kind !== MediaKind.image) return null;
    const variants = asset.variants
      .filter((v) => (v.kind === 'rendition' || v.kind === 'thumbnail') && v.width)
      .map((v) => ({ width: v.width!, height: v.height, url: this.urlOf(v.storageKey) }))
      .filter((v): v is { width: number; height: number | null; url: string } => !!v.url)
      .sort((a, b) => a.width - b.width);
    const direct = this.urlOf(asset.storageKey);
    if (variants.length === 0 && direct && asset.width) {
      variants.push({ width: asset.width, height: asset.height, url: direct });
    }
    const main =
      [...variants].reverse().find((v) => v.width <= DEFAULT_WIDTH) ?? variants[0] ?? null;
    const url = main?.url ?? direct;
    if (!url) return null;
    const license = asset.license;
    const pick = (ar: string | null, en: string | null) =>
      (lang === 'en' ? (en ?? ar) : (ar ?? en)) ?? null;
    return {
      id: asset.id,
      url,
      width: main?.width ?? asset.width,
      height: main?.height ?? asset.height,
      variants,
      alt: pick(asset.altTextAr, asset.altTextEn),
      caption: pick(asset.captionAr, asset.captionEn),
      credit: asset.creditText ?? license?.attributionText ?? license?.rightsHolder ?? null,
      licenseType: license?.licenseType ?? null,
      licenseUrl: license?.licenseUrl ?? null,
      sourceUrl: license?.sourceUrl ?? null,
    };
  }

  /** Is this asset usable as a published cover (ready image with a licence)? */
  static isPublishableImage(asset: {
    kind: string;
    status: string;
    licenseId: string | null;
    deletedAt: Date | null;
  }): boolean {
    return (
      asset.kind === MediaKind.image &&
      asset.status === MediaStatus.ready &&
      !!asset.licenseId &&
      !asset.deletedAt
    );
  }

  /** Validates a cover reference when it is set (must be an image of the library). */
  async assertCoverUsable(assetId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { kind: true, deletedAt: true, status: true },
    });
    if (
      !asset ||
      asset.deletedAt ||
      asset.kind !== MediaKind.image ||
      asset.status === MediaStatus.failed ||
      asset.status === MediaStatus.rejected
    ) {
      throw contentError('ARTICLE_COVER_INVALID', { coverAssetId: assetId });
    }
  }

  /**
   * Every inline image must be a ready, licensed image of the media library
   * (matched by the storage key of its public URL). Returns the offending
   * sources (empty = fine).
   */
  async unlicensedImages(sources: string[]): Promise<string[]> {
    const unique = [...new Set(sources)];
    if (unique.length === 0) return [];
    const keyBySrc = new Map<string, string>();
    for (const src of unique) {
      const key = this.keyOfUrl(src);
      if (key) keyBySrc.set(src, key);
    }
    const keys = [...new Set(keyBySrc.values())];
    const okKeys = new Set<string>();
    if (keys.length) {
      const assetOk = {
        kind: MediaKind.image,
        status: MediaStatus.ready,
        licenseId: { not: null },
        deletedAt: null,
      } satisfies Prisma.MediaAssetWhereInput;
      const [variants, assets] = await Promise.all([
        this.prisma.assetVariant.findMany({
          where: { storageKey: { in: keys }, asset: assetOk },
          select: { storageKey: true },
        }),
        this.prisma.mediaAsset.findMany({
          where: { storageKey: { in: keys }, ...assetOk },
          select: { storageKey: true },
        }),
      ]);
      for (const r of [...variants, ...assets]) okKeys.add(r.storageKey);
    }
    return unique.filter((src) => {
      const key = keyBySrc.get(src);
      return !key || !okKeys.has(key);
    });
  }

  async loadImage(id: string): Promise<ArticleImageAsset | null> {
    return this.prisma.mediaAsset.findUnique({ where: { id }, include: ARTICLE_IMAGE_INCLUDE });
  }

  /** Stores a licensed article image (see class doc). */
  async upload(
    file: UploadedFileLike | undefined,
    dto: ArticleImageUploadDto,
    userId: string,
    lang: SupportedLanguage,
  ): Promise<UploadedArticleImageDto> {
    if (!file?.buffer?.length) throw invalidImage('missing');
    if (file.buffer.length > ARTICLE_IMAGE_MAX_BYTES) {
      throw new AppException({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'PAYLOAD_TOO_LARGE',
        details: { maxBytes: ARTICLE_IMAGE_MAX_BYTES },
      });
    }
    if (dto.attributionRequired && !dto.attributionText?.trim()) {
      throw AppException.validation([
        {
          field: 'attributionText',
          constraints: { isNotEmpty: 'attributionText is required when attribution is required' },
        },
      ]);
    }
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata();
    } catch {
      throw invalidImage('corrupt');
    }
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw invalidImage('format');
    // Width/height after EXIF orientation.
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? 0;
    const height = (rotated ? meta.width : meta.height) ?? 0;
    if (width < MIN_WIDTH || height < 50) throw invalidImage('too_small');

    const folder = randomUUID();
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
    const originalKey = `private/articles/originals/${folder}.${ext}`;
    const written: string[] = [];
    const renditions: Array<{ key: string; width: number; height: number; size: number }> = [];
    try {
      await this.storage.put(originalKey, file.buffer, { contentType: `image/${meta.format}` });
      written.push(originalKey);
      const widths: number[] = RENDITION_WIDTHS.filter((w) => w < width);
      if (widths.length === 0 || width <= DEFAULT_WIDTH)
        widths.push(Math.min(width, DEFAULT_WIDTH));
      for (const w of [...new Set(widths)].sort((a, b) => a - b)) {
        const { data, info } = await sharp(file.buffer, {
          failOn: 'error',
          limitInputPixels: 80_000_000,
        })
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        const key = `public/articles/${folder}/w${info.width}.webp`;
        await this.storage.put(key, data, {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        });
        written.push(key);
        renditions.push({ key, width: info.width, height: info.height, size: data.length });
      }
    } catch (err) {
      await this.cleanup(written);
      if (err instanceof AppException) throw err;
      this.logger.warn(`Article image processing failed: ${(err as Error).message}`);
      throw invalidImage('corrupt');
    }

    let asset: ArticleImageAsset;
    try {
      asset = await this.prisma.$transaction(async (tx) => {
        const license = await tx.assetLicense.create({
          data: {
            licenseType: dto.licenseType,
            rightsHolder: dto.rightsHolder,
            attributionText: dto.attributionText ?? null,
            attributionRequired: dto.attributionRequired ?? false,
            licenseUrl: dto.licenseUrl ?? null,
            sourceUrl: dto.sourceUrl ?? null,
            createdById: userId,
          },
        });
        return tx.mediaAsset.create({
          data: {
            kind: MediaKind.image,
            status: MediaStatus.ready,
            storageDriver: this.storage.driver,
            storageKey: originalKey,
            originalFilename: file.originalname?.slice(0, 255) ?? null,
            mimeType: `image/${meta.format}`,
            sizeBytes: BigInt(file.buffer.length),
            width,
            height,
            checksumSha256: checksum,
            projection: 'flat',
            licenseId: license.id,
            creditText: dto.creditText?.trim() || null,
            altTextAr: dto.altTextAr ?? null,
            altTextEn: dto.altTextEn ?? null,
            captionAr: dto.captionAr ?? null,
            captionEn: dto.captionEn ?? null,
            uploadedById: userId,
            processingProgress: 100,
            processedAt: new Date(),
            metadata: { purpose: 'article_image' },
            variants: {
              create: renditions.map((r) => ({
                kind: 'rendition' as const,
                label: `w${r.width}`,
                storageKey: r.key,
                mimeType: 'image/webp',
                width: r.width,
                height: r.height,
                sizeBytes: BigInt(r.size),
              })),
            },
          },
          include: ARTICLE_IMAGE_INCLUDE,
        });
      });
    } catch (err) {
      await this.cleanup(written);
      throw err;
    }
    const view = this.toView(asset, lang)!;
    return { ...view, html: figureHtml(view) };
  }

  private async cleanup(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.storage.delete(k).catch(() => undefined)));
  }
}

function invalidImage(reason: string): AppException {
  return new AppException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'ARTICLE_IMAGE_INVALID',
    message: {
      ar: 'تعذر قراءة الصورة. ارفع صورة JPEG أو PNG أو WebP أو AVIF سليمة بعرض 200 بكسل على الأقل.',
      en: 'The image could not be read. Upload a valid JPEG, PNG, WebP or AVIF image at least 200 px wide.',
    },
    details: { reason },
  });
}

/** <figure> snippet for the editor (credit in figcaption). */
export function figureHtml(view: ArticleImageViewDto): string {
  const caption = [view.caption, view.credit ? `© ${view.credit}` : null]
    .filter(Boolean)
    .join(' — ');
  return `<figure><img src="${escapeHtml(view.url)}" alt="${escapeHtml(view.alt ?? '')}"${
    view.width ? ` width="${view.width}"` : ''
  }${view.height ? ` height="${view.height}"` : ''}>${
    caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
  }</figure>`;
}
