import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_PROVIDER, isPublicKey, type StorageProvider } from '../../../providers';
import { tilesPrefix } from '../domain/media-rules';

/**
 * URLs of stored media: public URLs of `public/...` keys (CDN / bucket /
 * /media), the origin they are served from (the 360° viewer's allow-list)
 * and short-lived signed URLs of private originals (admin only).
 */
@Injectable()
export class MediaUrls {
  private prefixCache?: string | null;

  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  /** Public URL of a public key; null for private / invalid keys. */
  publicUrl(key: string | null | undefined): string | null {
    if (!key || !isPublicKey(key)) return null;
    try {
      return this.storage.publicUrl(key);
    } catch {
      return null;
    }
  }

  private prefix(): string | null {
    if (this.prefixCache === undefined) {
      const probe = this.publicUrl('public/x');
      this.prefixCache = probe ? probe.slice(0, -1) : null;
    }
    return this.prefixCache;
  }

  /** Origin (scheme://host[:port]) serving every public media URL. */
  mediaOrigin(): string | null {
    const prefix = this.prefix();
    if (!prefix) return null;
    try {
      return new URL(prefix).origin;
    } catch {
      return null;
    }
  }

  /** Absolute URL of the tiles prefix of an asset (Pannellum multires basePath, no trailing /). */
  tilesBaseUrl(assetId: string): string | null {
    const url = this.publicUrl(`${tilesPrefix(assetId)}/x`);
    return url ? url.slice(0, -2) : null;
  }

  /** Signed, short-lived URL of any key (private originals for the admin preview). */
  async signedUrl(key: string, downloadName?: string): Promise<string | null> {
    try {
      return await this.storage.signedUrl(key, { expiresInSeconds: 600, downloadName });
    } catch {
      return null;
    }
  }
}
