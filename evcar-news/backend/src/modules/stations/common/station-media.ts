import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import type { Prisma } from '../../../generated/prisma/client';
import { AssetVariantKind, MediaKind, MediaStatus } from '../../../generated/prisma/enums';
import { STORAGE_PROVIDER } from '../../../providers/provider-tokens';
import { isPublicKey } from '../../../providers/storage/storage-keys';
import type { StorageProvider } from '../../../providers/storage/storage.types';
import { pick } from './values';

/** Same shape as the vehicles API `Image` (docs/decisions/backend-vehicles.md). */
export interface StationImageView {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
  credit: string | null;
  licenseType: string | null;
  sizes: { label: string; width: number | null; height: number | null; url: string }[];
  isDemo: boolean;
}

export const STATION_IMAGE_INCLUDE = {
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

export type StationImageAsset = Prisma.MediaAssetGetPayload<{
  include: typeof STATION_IMAGE_INCLUDE;
}>;

/**
 * Station photos: only processed (`ready`), licensed, not deleted images
 * stored under a public key are returned — with their credit line.
 */
@Injectable()
export class StationMediaService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  private urlOf(key: string | null | undefined): string | null {
    if (!key || !isPublicKey(key)) return null;
    try {
      return this.storage.publicUrl(key);
    } catch {
      return null;
    }
  }

  isPublishable(asset: Pick<StationImageAsset, 'kind' | 'status' | 'deletedAt' | 'licenseId'>) {
    return (
      asset.kind === MediaKind.image &&
      asset.status === MediaStatus.ready &&
      asset.deletedAt === null &&
      asset.licenseId !== null
    );
  }

  image(
    asset: StationImageAsset,
    lang: SupportedLanguage,
    caption: string | null,
  ): StationImageView | null {
    if (!this.isPublishable(asset)) return null;
    const url = this.urlOf(asset.storageKey);
    if (!url) return null;
    return {
      id: asset.id,
      url,
      width: asset.width,
      height: asset.height,
      alt: pick(lang, asset.altTextAr, asset.altTextEn),
      caption: caption ?? pick(lang, asset.captionAr, asset.captionEn),
      credit: asset.creditText ?? asset.license?.attributionText ?? null,
      licenseType: asset.license?.licenseType ?? null,
      sizes: asset.variants
        .map((v) => ({
          label: v.label,
          width: v.width,
          height: v.height,
          url: this.urlOf(v.storageKey),
        }))
        .filter((v): v is StationImageView['sizes'][number] => Boolean(v.url)),
      isDemo: asset.isDemo,
    };
  }
}
