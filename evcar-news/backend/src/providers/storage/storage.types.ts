import type { Readable } from 'node:stream';
import type { StatusReporter } from '../provider-status';

/**
 * Object storage behind one interface (contract §4.6): `local` disk for
 * dev/tests, `s3` for any S3-compatible service (AWS, MinIO, R2...).
 *
 * Keys are relative, validated paths (see storage-keys.ts). The first
 * segment decides visibility:
 *   public/...   readable by anyone through publicUrl() (CDN / bucket policy / /media)
 *   private/...  only through short-lived signed URLs or server-side reads
 *   tmp/...      scratch space (upload assembly, processing); never public
 */
export type StorageDriver = 'local' | 's3';

export interface PutObjectOptions {
  contentType?: string;
  cacheControl?: string;
  /** e.g. `attachment; filename="x.pdf"` */
  contentDisposition?: string;
  /** Small string metadata (ASCII keys). */
  metadata?: Record<string, string>;
}

export interface StoredObjectInfo {
  key: string;
  size: number;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  /** Default 900 s; max 7 days (S3 limit). */
  expiresInSeconds?: number;
  method?: 'GET' | 'PUT';
  /** PUT: content type the uploader must send. */
  contentType?: string;
  /** GET: forces a download with this file name. */
  downloadName?: string;
}

export interface MultipartUpload {
  key: string;
  uploadId: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface StorageCheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface StorageProvider extends StatusReporter {
  readonly driver: StorageDriver;

  /** Writes an object (atomically for the local driver). Streams are consumed fully. */
  put(key: string, body: Buffer | Readable, opts?: PutObjectOptions): Promise<StoredObjectInfo>;
  /** Opens an object for reading; throws StorageObjectNotFoundError when missing. */
  get(key: string): Promise<{ stream: Readable; info: StoredObjectInfo }>;
  /** Reads a whole (small) object into memory. */
  getBuffer(key: string, maxBytes?: number): Promise<Buffer>;
  head(key: string): Promise<StoredObjectInfo | null>;
  exists(key: string): Promise<boolean>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix` (must end with "/"). Returns the count. */
  deletePrefix(prefix: string): Promise<number>;
  copy(fromKey: string, toKey: string): Promise<StoredObjectInfo>;

  /** Public URL of a `public/...` key (throws for other keys). */
  publicUrl(key: string): string;
  /** Time-limited URL (GET for any key, PUT for uploads). Public keys + GET → publicUrl. */
  signedUrl(key: string, opts?: SignedUrlOptions): Promise<string>;

  createMultipartUpload(key: string, opts?: PutObjectOptions): Promise<MultipartUpload>;
  /** Part numbers 1..10000; every part except the last must be >= 5 MiB on S3. */
  uploadPart(upload: MultipartUpload, partNumber: number, body: Buffer): Promise<UploadedPart>;
  completeMultipartUpload(
    upload: MultipartUpload,
    parts: UploadedPart[],
  ): Promise<StoredObjectInfo>;
  abortMultipartUpload(upload: MultipartUpload): Promise<void>;

  /** Round-trip check used by /health (no side effects on S3; probe file on local). */
  check(): Promise<StorageCheckResult>;
}

export class StorageObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Object not found: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
export const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;

export function clampTtl(seconds: number | undefined): number {
  const value = Math.floor(seconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS);
  return Math.min(MAX_SIGNED_URL_TTL_SECONDS, Math.max(1, value));
}
