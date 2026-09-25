import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { AssetVariantKind, MediaKind, MediaStatus } from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import { STORAGE_PROVIDER } from '../../../providers/provider-tokens';
import { isPublicKey } from '../../../providers/storage/storage-keys';
import type { StorageProvider } from '../../../providers/storage/storage.types';
import type { ImageDto } from '../dto/shared.dto';
import { textIn } from './values';

/** Prisma include for an asset rendered as an image. */
export const IMAGE_ASSET_INCLUDE = {
  license: true,
  variants: {
    where: {
      kind: {
        in: [AssetVariantKind.thumbnail, AssetVariantKind.rendition, AssetVariantKind.preview],
      },
    },
    orderBy: { width: 'asc' },
  },
} satisfies Prisma.MediaAssetInclude;

export type ImageAsset = Prisma.MediaAssetGetPayload<{ include: typeof IMAGE_ASSET_INCLUDE }>;

/**
 * Turns media assets into public image views. Only images that are
 * processed (`ready`), not deleted, stored under a public key and carry a
 * licence are ever returned — anything else is `null` (no unlicensed or
 * unfinished file reaches the apps).
 */
@Injectable()
export class MediaUrlService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  urlOf(storageKey: string | null | undefined): string | null {
    if (!storageKey || !isPublicKey(storageKey)) return null;
    try {
      return this.storage.publicUrl(storageKey);
    } catch {
      return null;
    }
  }

  isPublishable(asset: Pick<ImageAsset, 'kind' | 'status' | 'deletedAt' | 'licenseId'>): boolean {
    return (
      asset.kind === MediaKind.image &&
      asset.status === MediaStatus.ready &&
      asset.deletedAt === null &&
      asset.licenseId !== null
    );
  }

  image(
    asset: ImageAsset | null | undefined,
    lang: SupportedLanguage,
    caption?: { ar: string | null; en: string | null },
  ): ImageDto | null {
    if (!asset || !this.isPublishable(asset)) return null;
    const url = this.urlOf(asset.storageKey);
    if (!url) return null;
    const license = asset.license;
    const sizes = asset.variants
      .map((v) => ({
        label: v.label,
        width: v.width,
        height: v.height,
        url: this.urlOf(v.storageKey),
      }))
      .filter(
        (v): v is { label: string; width: number | null; height: number | null; url: string } =>
          Boolean(v.url),
      );
    return {
      id: asset.id,
      url,
      width: asset.width,
      height: asset.height,
      alt: textIn(lang, asset.altTextAr, asset.altTextEn),
      caption:
        textIn(lang, caption?.ar ?? null, caption?.en ?? null) ??
        textIn(lang, asset.captionAr, asset.captionEn),
      credit: asset.creditText ?? license?.attributionText ?? null,
      licenseType: license?.licenseType ?? null,
      sizes,
      isDemo: asset.isDemo,
    };
  }
}
