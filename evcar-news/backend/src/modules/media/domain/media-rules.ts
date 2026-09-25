/**
 * Media library rules (REQUIREMENTS §9): which files each kind accepts
 * (sniffed from the content, never the client-declared type), size and
 * dimension limits, renditions and the storage layout. Pure constants and
 * helpers — unit tested.
 */

/** Kinds that can be uploaded through resumable upload sessions. */
export const UPLOAD_KINDS = ['image', 'panorama', 'video', 'document'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

const MiB = 1024 * 1024;

export interface KindRule {
  /** Sniffed MIME types accepted for the kind. */
  mimes: readonly string[];
  /** Upper bound of one file (also capped by UPLOAD_MAX_BYTES). */
  maxBytes: number;
  /** Whether a background processing job produces derived files. */
  processed: boolean;
}

export const KIND_RULES: Record<UploadKind, KindRule> = {
  image: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    maxBytes: 50 * MiB,
    processed: true,
  },
  panorama: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'],
    maxBytes: 300 * MiB,
    processed: true,
  },
  video: {
    mimes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxBytes: 1024 * MiB,
    processed: true,
  },
  document: { mimes: ['application/pdf'], maxBytes: 25 * MiB, processed: false },
};

/** Limit of one file of `kind` given the deployment limit UPLOAD_MAX_BYTES. */
export function maxBytesFor(kind: UploadKind, uploadMaxBytes: number): number {
  return Math.min(KIND_RULES[kind].maxBytes, uploadMaxBytes);
}

/** S3 refuses multipart parts below 5 MiB (except the last one). */
export const S3_MIN_PART_BYTES = 5 * MiB;
/** S3 / our local driver: at most 10 000 parts per upload. */
export const MAX_UPLOAD_PARTS = 10_000;
/** Default chunk size suggested to clients (capped by UPLOAD_CHUNK_MAX_BYTES). */
export const DEFAULT_CHUNK_BYTES = 8 * MiB;

/** Dimensions (px). */
export const PANORAMA_LIMITS = {
  /** Below this a panorama is refused (unusable in a viewer). */
  minWidth: 2048,
  /** 16384 × 8192 is the largest equirectangular accepted. */
  maxWidth: 16384,
  /** Recommended minimum for a car interior (§8: 4096×2048, 8192×4096). */
  recommendedWidth: 4096,
  /** |width − 2·height| tolerated (rounding of stitchers). */
  ratioTolerancePx: 2,
} as const;

export const IMAGE_LIMITS = {
  minWidth: 200,
  minHeight: 50,
  /** 100 megapixels. */
  maxPixels: 100_000_000,
} as const;

/** sharp decode guard (> 16384 × 8192). */
export const SHARP_PIXEL_LIMIT = 16384 * 8192 + 1;

/** Device renditions of a panorama (only widths the source allows). */
export const PANORAMA_RENDITION_WIDTHS = [2048, 4096, 8192] as const;
/** Fast, low-quality first paint of a panorama. */
export const PANORAMA_PREVIEW = { width: 1024, height: 512, quality: 50 } as const;
export const PANORAMA_RENDITION_QUALITY = 82;
/** Largest source width used to build cube faces / tiles (memory bound). */
export const MULTIRES_MAX_SOURCE_WIDTH = 8192;
export const TILE_RESOLUTION = 512;
export const TILE_QUALITY = 78;
export const FALLBACK_FACE_SIZE = 1024;

/** Flat image renditions (WebP, metadata stripped). */
export const IMAGE_RENDITION_WIDTHS = [480, 960, 1600, 2400] as const;
export const IMAGE_THUMBNAIL_WIDTH = 320;

/** Widths of the device renditions a source of `width` px allows (at least one). */
export function panoramaRenditionWidths(width: number): number[] {
  const widths: number[] = PANORAMA_RENDITION_WIDTHS.filter((w) => w <= width);
  if (widths.length === 0) widths.push(Math.max(2, Math.floor(width / 2) * 2));
  return widths;
}

/** Widths of the flat-image renditions (smaller than the source, else the source width). */
export function imageRenditionWidths(width: number): number[] {
  const widths: number[] = IMAGE_RENDITION_WIDTHS.filter((w) => w < width);
  if (widths.length === 0 || width < IMAGE_RENDITION_WIDTHS[IMAGE_RENDITION_WIDTHS.length - 1]) {
    widths.push(width);
  }
  return [...new Set(widths)].sort((a, b) => a - b);
}

/** Is `width × height` an equirectangular 2:1 frame (± rounding)? */
export function isTwoToOne(width: number, height: number): boolean {
  return (
    width > 0 && height > 0 && Math.abs(width - 2 * height) <= PANORAMA_LIMITS.ratioTolerancePx
  );
}

// --- storage layout ----------------------------------------------------------

/** Private original of an asset (never overwritten; a new file = a new asset). */
export function originalKey(assetId: string): string {
  return `private/media/${assetId}/original`;
}

/** Public prefix of the generated files of an asset. */
export function publicPrefix(assetId: string): string {
  return `public/media/${assetId}`;
}

export function previewKey(assetId: string): string {
  return `${publicPrefix(assetId)}/preview-${PANORAMA_PREVIEW.width}.jpg`;
}

export function panoramaRenditionKey(assetId: string, width: number): string {
  return `${publicPrefix(assetId)}/w${width}.jpg`;
}

export function imageRenditionKey(assetId: string, width: number): string {
  return `${publicPrefix(assetId)}/w${width}.webp`;
}

export function thumbnailKey(assetId: string): string {
  return `${publicPrefix(assetId)}/thumb-${IMAGE_THUMBNAIL_WIDTH}.webp`;
}

export function videoKey(assetId: string, ext: string): string {
  return `${publicPrefix(assetId)}/video.${ext}`;
}

export function tilesPrefix(assetId: string): string {
  return `${publicPrefix(assetId)}/tiles`;
}

/** File extension of a sniffed MIME type (for public copies / download names). */
export function extensionOf(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    case 'image/tiff':
      return 'tif';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

/**
 * Cache headers of generated public files. Keys are per asset and an
 * original never changes (a new file is a new asset), but re-processing may
 * rewrite them, so they are cached for a week rather than forever.
 */
export const PUBLIC_FILE_CACHE = 'public, max-age=604800';
