import { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { withTimeout } from '../../common/utils/app-version';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import {
  assertValidKey,
  assertValidPrefix,
  encodeKeyForUrl,
  InvalidStorageKeyError,
  isPublicKey,
} from './storage-keys';
import {
  clampTtl,
  type MultipartUpload,
  type PutObjectOptions,
  type SignedUrlOptions,
  type StorageCheckResult,
  StorageObjectNotFoundError,
  type StoredObjectInfo,
  type StorageProvider,
  type UploadedPart,
} from './storage.types';

const STREAM_PART_SIZE = 8 * 1024 * 1024;

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * S3-compatible storage (AWS S3, MinIO, Cloudflare R2, ...).
 *
 * Public objects live under `public/`; the bucket policy must allow
 * anonymous GET on that prefix only (docker-compose's minio-init does this)
 * or STORAGE_PUBLIC_BASE_URL must point at a CDN in front of the bucket.
 * Private objects are only reachable with presigned URLs.
 */
export class S3StorageProvider implements StorageProvider {
  readonly driver = 's3' as const;
  private readonly logger = new Logger('S3Storage');
  private readonly activity = new ProviderActivity();
  private readonly client?: S3Client;
  private readonly bucket: string;
  private readonly missing: string[];

  constructor(
    private readonly config: AppConfig,
    client?: S3Client,
  ) {
    const s3 = config.storage.s3;
    this.bucket = s3.bucket;
    this.missing = [];
    if (!s3.bucket) this.missing.push('S3_BUCKET');
    // A custom endpoint (MinIO, R2...) needs explicit keys; AWS can use the default chain (IAM role).
    if (s3.endpoint && (!s3.accessKeyId || !s3.secretAccessKey)) {
      this.missing.push('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY');
    }
    if (this.missing.length === 0) {
      this.client =
        client ??
        new S3Client({
          region: s3.region,
          endpoint: s3.endpoint || undefined,
          forcePathStyle: s3.forcePathStyle,
          credentials:
            s3.accessKeyId && s3.secretAccessKey
              ? { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey }
              : undefined,
          maxAttempts: 3,
        });
    }
  }

  status(): ProviderStatus {
    if (!this.client) {
      return {
        type: 'storage',
        name: 's3',
        configured: false,
        reason: `Missing ${this.missing.join(', ')}`,
        ...this.activity.snapshot(),
      };
    }
    const notes: string[] = [];
    if (!this.config.storage.publicBaseUrl) {
      notes.push(
        'STORAGE_PUBLIC_BASE_URL is empty: public URLs point directly at the bucket endpoint.',
      );
    }
    return { type: 'storage', name: 's3', configured: true, notes, ...this.activity.snapshot() };
  }

  private s3(): S3Client {
    if (!this.client) {
      throw AppException.integrationNotConfigured('storage.s3');
    }
    return this.client;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.activity.success();
      return result;
    } catch (err) {
      if (!isNotFound(err)) this.activity.failure(err);
      throw err;
    }
  }

  async put(
    key: string,
    body: Buffer | Readable,
    opts: PutObjectOptions = {},
  ): Promise<StoredObjectInfo> {
    assertValidKey(key);
    const client = this.s3();
    const params = {
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl,
      ContentDisposition: opts.contentDisposition,
      Metadata: opts.metadata,
    };
    return this.run(async () => {
      if (Buffer.isBuffer(body)) {
        const res = await client.send(new PutObjectCommand({ ...params, Body: body }));
        return {
          key,
          size: body.length,
          etag: res.ETag?.replace(/"/g, ''),
          contentType: opts.contentType,
          cacheControl: opts.cacheControl,
          contentDisposition: opts.contentDisposition,
          metadata: opts.metadata,
          lastModified: new Date(),
        };
      }
      const upload = new Upload({
        client,
        params: { ...params, Body: body },
        partSize: STREAM_PART_SIZE,
        queueSize: 4,
        leavePartsOnError: false,
      });
      await upload.done();
      const info = await this.head(key);
      if (!info) throw new StorageObjectNotFoundError(key);
      return info;
    });
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    assertValidKey(key);
    const client = this.s3();
    try {
      const res = await this.run(() =>
        client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })),
      );
      return {
        key,
        size: res.ContentLength ?? 0,
        contentType: res.ContentType,
        cacheControl: res.CacheControl,
        contentDisposition: res.ContentDisposition,
        etag: res.ETag?.replace(/"/g, ''),
        lastModified: res.LastModified,
        metadata: res.Metadata,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async get(key: string): Promise<{ stream: Readable; info: StoredObjectInfo }> {
    assertValidKey(key);
    const client = this.s3();
    try {
      const res = await this.run(() =>
        client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })),
      );
      const body = res.Body;
      if (!body) throw new StorageObjectNotFoundError(key);
      const stream = body instanceof Readable ? body : Readable.fromWeb(body.transformToWebStream() as never);
      return {
        stream,
        info: {
          key,
          size: res.ContentLength ?? 0,
          contentType: res.ContentType,
          cacheControl: res.CacheControl,
          contentDisposition: res.ContentDisposition,
          etag: res.ETag?.replace(/"/g, ''),
          lastModified: res.LastModified,
          metadata: res.Metadata,
        },
      };
    } catch (err) {
      if (isNotFound(err)) throw new StorageObjectNotFoundError(key);
      throw err;
    }
  }

  async getBuffer(key: string, maxBytes = 50 * 1024 * 1024): Promise<Buffer> {
    const { stream, info } = await this.get(key);
    if (info.size > maxBytes) {
      stream.destroy();
      throw new Error(`Object ${key} exceeds ${maxBytes} bytes`);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buf.length;
      if (size > maxBytes) {
        stream.destroy();
        throw new Error(`Object ${key} exceeds ${maxBytes} bytes`);
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const client = this.s3();
    await this.run(() => client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })));
  }

  async deletePrefix(prefix: string): Promise<number> {
    assertValidPrefix(prefix);
    const client = this.s3();
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.run(() =>
        client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
            MaxKeys: 1000,
          }),
        ),
      );
      const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
      if (keys.length > 0) {
        await this.run(() =>
          client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
            }),
          ),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  async copy(fromKey: string, toKey: string): Promise<StoredObjectInfo> {
    assertValidKey(fromKey);
    assertValidKey(toKey);
    const client = this.s3();
    try {
      await this.run(() =>
        client.send(
          new CopyObjectCommand({
            Bucket: this.bucket,
            Key: toKey,
            CopySource: `${this.bucket}/${encodeKeyForUrl(fromKey)}`,
          }),
        ),
      );
    } catch (err) {
      if (isNotFound(err)) throw new StorageObjectNotFoundError(fromKey);
      throw err;
    }
    const info = await this.head(toKey);
    if (!info) throw new StorageObjectNotFoundError(toKey);
    return info;
  }

  publicUrl(key: string): string {
    assertValidKey(key);
    if (!isPublicKey(key)) throw new InvalidStorageKeyError(key, 'not a public key');
    return `${this.publicBase()}/${encodeKeyForUrl(key)}`;
  }

  private publicBase(): string {
    const { publicBaseUrl, s3 } = this.config.storage;
    if (publicBaseUrl) return publicBaseUrl;
    if (s3.endpoint) {
      const endpoint = new URL(s3.endpoint);
      const base = endpoint.origin + endpoint.pathname.replace(/\/+$/, '');
      return s3.forcePathStyle
        ? `${base}/${s3.bucket}`
        : `${endpoint.protocol}//${s3.bucket}.${endpoint.host}`;
    }
    return `https://${s3.bucket}.s3.${s3.region}.amazonaws.com`;
  }

  async signedUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    assertValidKey(key);
    const method = opts.method ?? 'GET';
    if (method === 'GET' && isPublicKey(key) && !opts.downloadName) return this.publicUrl(key);
    const client = this.s3();
    const expiresIn = clampTtl(opts.expiresInSeconds);
    const command =
      method === 'PUT'
        ? new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType })
        : new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ResponseContentDisposition: opts.downloadName
              ? `attachment; filename="${opts.downloadName.replace(/["\\\r\n]/g, '')}"`
              : undefined,
          });
    return getSignedUrl(client, command, { expiresIn });
  }

  async createMultipartUpload(key: string, opts: PutObjectOptions = {}): Promise<MultipartUpload> {
    assertValidKey(key);
    const client = this.s3();
    const res = await this.run(() =>
      client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: opts.contentType,
          CacheControl: opts.cacheControl,
          ContentDisposition: opts.contentDisposition,
          Metadata: opts.metadata,
        }),
      ),
    );
    if (!res.UploadId) throw new Error('S3 did not return an upload id');
    return { key, uploadId: res.UploadId };
  }

  async uploadPart(
    upload: MultipartUpload,
    partNumber: number,
    body: Buffer,
  ): Promise<UploadedPart> {
    assertValidKey(upload.key);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      throw new RangeError('partNumber must be 1..10000');
    }
    const client = this.s3();
    const res = await this.run(() =>
      client.send(
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: upload.key,
          UploadId: upload.uploadId,
          PartNumber: partNumber,
          Body: body,
        }),
      ),
    );
    if (!res.ETag) throw new Error('S3 did not return a part ETag');
    return { partNumber, etag: res.ETag };
  }

  async completeMultipartUpload(
    upload: MultipartUpload,
    parts: UploadedPart[],
  ): Promise<StoredObjectInfo> {
    assertValidKey(upload.key);
    const client = this.s3();
    await this.run(() =>
      client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: upload.key,
          UploadId: upload.uploadId,
          MultipartUpload: {
            Parts: [...parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      ),
    );
    const info = await this.head(upload.key);
    if (!info) throw new StorageObjectNotFoundError(upload.key);
    return info;
  }

  async abortMultipartUpload(upload: MultipartUpload): Promise<void> {
    assertValidKey(upload.key);
    const client = this.s3();
    await this.run(() =>
      client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: upload.key,
          UploadId: upload.uploadId,
        }),
      ),
    );
  }

  async check(): Promise<StorageCheckResult> {
    if (!this.client) return { ok: false, error: 'not configured' };
    const started = performance.now();
    try {
      await withTimeout(
        this.client.send(new HeadBucketCommand({ Bucket: this.bucket })),
        3_000,
        's3 head bucket',
      );
      this.activity.success();
      return { ok: true, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
    } catch (err) {
      this.activity.failure(err);
      this.logger.warn(`S3 check failed: ${(err as Error).message}`);
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      return {
        ok: false,
        error:
          status === 404
            ? 'bucket not found'
            : status === 403
              ? 'access denied'
              : /timed out/i.test((err as Error).message)
                ? 'timeout'
                : 'unreachable',
      };
    }
  }
}
