import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import { deriveLocalSigningKey, signLocal } from './local-signed-url';
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

/** Route (under the /api/v1 prefix) that serves signed local URLs. */
export const LOCAL_SIGNED_ROUTE = 'storage/local';

const META_DIR = '.meta';
const MULTIPART_DIR = '.multipart';
const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{32}$/;
const MAX_PARTS = 10_000;

interface LocalMeta {
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
  etag?: string;
}

/**
 * Local-disk storage (development / tests / single-server installs).
 *
 * Layout under STORAGE_LOCAL_ROOT:
 *   public/...     served read-only at /media by configureApp()
 *   private/...    only via HMAC-signed URLs (LocalFilesController)
 *   tmp/...        scratch
 *   .meta/<key>.json      content type & metadata (never served)
 *   .multipart/<id>/      parts of in-progress multipart uploads
 *
 * Every key is validated (storage-keys.ts) and every resolved path is
 * checked to stay inside the root, including through symlinks.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly logger = new Logger('LocalStorage');
  private readonly root: string;
  private readonly signingKey: Buffer;
  private readonly activity = new ProviderActivity();
  private realRoot?: string;

  constructor(private readonly config: AppConfig) {
    this.root = resolve(config.storage.localRoot);
    this.signingKey = deriveLocalSigningKey(config.auth.accessTokenSecret);
  }

  status(): ProviderStatus {
    const notes = [
      'Files are stored on this server’s disk; use the s3 driver when running more than one instance.',
    ];
    if (this.config.isProduction) {
      notes.push('Make sure STORAGE_LOCAL_ROOT is on a persistent, backed-up volume.');
    }
    return {
      type: 'storage',
      name: 'local',
      configured: true,
      notes,
      ...this.activity.snapshot(),
    };
  }

  /** Absolute path of a validated key (inside the root). */
  pathFor(key: string): string {
    assertValidKey(key);
    const full = resolve(this.root, ...key.split('/'));
    if (!full.startsWith(this.root + sep)) throw new InvalidStorageKeyError(key, 'escapes root');
    return full;
  }

  private metaPath(key: string): string {
    return resolve(this.root, META_DIR, ...key.split('/')) + '.json';
  }

  /** Creates the parent directory and ensures it resolves inside the root (no symlink escape). */
  private async ensureParent(path: string): Promise<void> {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    this.realRoot ??= await realpath(this.root);
    const realDir = await realpath(dir);
    if (realDir !== this.realRoot && !realDir.startsWith(this.realRoot + sep)) {
      throw new InvalidStorageKeyError(path, 'resolves outside the storage root');
    }
  }

  async put(key: string, body: Buffer | Readable, opts: PutObjectOptions = {}): Promise<StoredObjectInfo> {
    const path = this.pathFor(key);
    await mkdir(this.root, { recursive: true });
    await this.ensureParent(path);
    const tmp = `${path}.${randomBytes(6).toString('hex')}.part`;
    const hash = createHash('sha256');
    let size = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try {
      const source = Buffer.isBuffer(body) ? Readable.from([body]) : body;
      await pipeline(source, counter, createWriteStream(tmp, { flags: 'wx', mode: 0o640 }));
      await rename(tmp, path);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      this.activity.failure(err);
      throw err;
    }
    const meta: LocalMeta = {
      contentType: opts.contentType,
      cacheControl: opts.cacheControl,
      contentDisposition: opts.contentDisposition,
      metadata: opts.metadata,
      etag: hash.digest('hex'),
    };
    const metaPath = this.metaPath(key);
    await this.ensureParent(metaPath);
    await writeFile(metaPath, JSON.stringify(meta), { mode: 0o640 });
    this.activity.success();
    return { key, size, lastModified: new Date(), ...meta };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const path = this.pathFor(key);
    try {
      const st = await stat(path);
      if (!st.isFile()) return null;
      const meta = await this.readMeta(key);
      return { key, size: st.size, lastModified: st.mtime, ...meta };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async get(key: string): Promise<{ stream: Readable; info: StoredObjectInfo }> {
    const info = await this.head(key);
    if (!info) throw new StorageObjectNotFoundError(key);
    return { stream: createReadStream(this.pathFor(key)), info };
  }

  async getBuffer(key: string, maxBytes = 50 * 1024 * 1024): Promise<Buffer> {
    const info = await this.head(key);
    if (!info) throw new StorageObjectNotFoundError(key);
    if (info.size > maxBytes) throw new Error(`Object ${key} exceeds ${maxBytes} bytes`);
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(this.metaPath(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<number> {
    assertValidPrefix(prefix);
    const dir = this.pathFor(prefix.slice(0, -1));
    const count = await countFiles(dir);
    await rm(dir, { recursive: true, force: true });
    await rm(resolve(this.root, META_DIR, ...prefix.slice(0, -1).split('/')), {
      recursive: true,
      force: true,
    });
    return count;
  }

  async copy(fromKey: string, toKey: string): Promise<StoredObjectInfo> {
    const { stream, info } = await this.get(fromKey);
    return this.put(toKey, stream, {
      contentType: info.contentType,
      cacheControl: info.cacheControl,
      contentDisposition: info.contentDisposition,
      metadata: info.metadata,
    });
  }

  publicUrl(key: string): string {
    assertValidKey(key);
    if (!isPublicKey(key)) throw new InvalidStorageKeyError(key, 'not a public key');
    const base =
      this.config.storage.publicBaseUrl ||
      `${this.config.http.publicBaseUrl.replace(/\/+$/, '')}/media`;
    return `${base}/${encodeKeyForUrl(key.slice('public/'.length))}`;
  }

  signedUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    assertValidKey(key);
    const method = opts.method ?? 'GET';
    if (method === 'GET' && isPublicKey(key) && !opts.downloadName) {
      return Promise.resolve(this.publicUrl(key));
    }
    const exp = Math.floor(Date.now() / 1000) + clampTtl(opts.expiresInSeconds);
    const payload = {
      method,
      key,
      exp,
      contentType: method === 'PUT' ? opts.contentType : undefined,
      downloadName: method === 'GET' ? opts.downloadName : undefined,
    };
    const sig = signLocal(this.signingKey, payload);
    const params = new URLSearchParams({ exp: String(exp), sig });
    if (payload.contentType) params.set('ct', payload.contentType);
    if (payload.downloadName) params.set('dn', payload.downloadName);
    const base = this.config.http.publicBaseUrl.replace(/\/+$/, '');
    return Promise.resolve(
      `${base}/api/v1/${LOCAL_SIGNED_ROUTE}/${encodeKeyForUrl(key)}?${params.toString()}`,
    );
  }

  /** HMAC key used by LocalFilesController to verify signed URLs. */
  get urlSigningKey(): Buffer {
    return this.signingKey;
  }

  // --- multipart ---------------------------------------------------------------

  private uploadDir(uploadId: string): string {
    if (!UPLOAD_ID_RE.test(uploadId)) throw new InvalidStorageKeyError(uploadId, 'bad upload id');
    return join(this.root, MULTIPART_DIR, uploadId);
  }

  async createMultipartUpload(key: string, opts: PutObjectOptions = {}): Promise<MultipartUpload> {
    assertValidKey(key);
    const uploadId = randomBytes(24).toString('base64url');
    const dir = this.uploadDir(uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'upload.json'), JSON.stringify({ key, opts, createdAt: Date.now() }));
    return { key, uploadId };
  }

  private async readUpload(upload: MultipartUpload): Promise<{ dir: string; opts: PutObjectOptions }> {
    const dir = this.uploadDir(upload.uploadId);
    let parsed: { key: string; opts: PutObjectOptions };
    try {
      parsed = JSON.parse(await readFile(join(dir, 'upload.json'), 'utf8')) as typeof parsed;
    } catch {
      throw new StorageObjectNotFoundError(`multipart:${upload.uploadId}`);
    }
    if (parsed.key !== upload.key) throw new InvalidStorageKeyError(upload.key, 'upload key mismatch');
    return { dir, opts: parsed.opts ?? {} };
  }

  async uploadPart(upload: MultipartUpload, partNumber: number, body: Buffer): Promise<UploadedPart> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) {
      throw new RangeError(`partNumber must be 1..${MAX_PARTS}`);
    }
    const { dir } = await this.readUpload(upload);
    const file = join(dir, `part-${String(partNumber).padStart(5, '0')}`);
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, file);
    return { partNumber, etag: createHash('sha256').update(body).digest('hex') };
  }

  async completeMultipartUpload(upload: MultipartUpload, parts: UploadedPart[]): Promise<StoredObjectInfo> {
    const { dir, opts } = await this.readUpload(upload);
    if (parts.length === 0) throw new RangeError('At least one part is required');
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const files: string[] = [];
    for (const [i, part] of sorted.entries()) {
      if (i > 0 && sorted[i - 1].partNumber === part.partNumber) {
        throw new RangeError(`Duplicate part ${part.partNumber}`);
      }
      const file = join(dir, `part-${String(part.partNumber).padStart(5, '0')}`);
      const digest = createHash('sha256')
        .update(await readFile(file).catch(() => Buffer.alloc(0)))
        .digest('hex');
      if (digest !== part.etag) throw new RangeError(`Part ${part.partNumber} is missing or differs`);
      files.push(file);
    }
    const joined = new PassThrough();
    const feed = (async () => {
      for (const file of files) {
        await pipeline(createReadStream(file), joined, { end: false });
      }
      joined.end();
    })();
    feed.catch((err: unknown) => joined.destroy(err as Error));
    const info = await this.put(upload.key, joined, opts);
    await feed;
    await rm(dir, { recursive: true, force: true });
    return info;
  }

  async abortMultipartUpload(upload: MultipartUpload): Promise<void> {
    await rm(this.uploadDir(upload.uploadId), { recursive: true, force: true });
  }

  /** Removes multipart uploads older than `maxAgeMs` (maintenance job). */
  async cleanupStaleMultipart(maxAgeMs: number): Promise<number> {
    const base = join(this.root, MULTIPART_DIR);
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(base);
    } catch {
      return 0;
    }
    for (const id of entries) {
      if (!UPLOAD_ID_RE.test(id)) continue;
      const st = await stat(join(base, id)).catch(() => null);
      if (st && Date.now() - st.mtimeMs > maxAgeMs) {
        await rm(join(base, id), { recursive: true, force: true });
        removed += 1;
      }
    }
    return removed;
  }

  async check(): Promise<StorageCheckResult> {
    const started = performance.now();
    const key = `tmp/health/probe-${randomBytes(6).toString('hex')}`;
    try {
      await this.put(key, Buffer.from('ok'), { contentType: 'text/plain' });
      const back = await this.getBuffer(key, 16);
      await this.delete(key);
      if (back.toString() !== 'ok') return { ok: false, error: 'read-back mismatch' };
      return { ok: true, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
    } catch (err) {
      this.logger.warn(`Local storage check failed: ${(err as Error).message}`);
      const code = (err as NodeJS.ErrnoException).code;
      return { ok: false, error: code === 'EACCES' || code === 'EROFS' ? 'not writable' : 'error' };
    }
  }

  private async readMeta(key: string): Promise<LocalMeta> {
    try {
      return JSON.parse(await readFile(this.metaPath(key), 'utf8')) as LocalMeta;
    } catch {
      return {};
    }
  }
}

async function countFiles(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return 0;
  }
  return entries.filter((e) => e.isFile()).length;
}
