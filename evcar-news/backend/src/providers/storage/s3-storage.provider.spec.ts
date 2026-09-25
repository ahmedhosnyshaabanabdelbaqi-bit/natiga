import type { S3Client } from '@aws-sdk/client-s3';
import { AppConfig } from '../../config/app-config';
import { S3StorageProvider } from './s3-storage.provider';
import { InvalidStorageKeyError } from './storage-keys';

const DB = 'postgresql://evcar:x@localhost:5432/unit';
const cfg = (env: Record<string, string> = {}) =>
  AppConfig.fromEnv({ NODE_ENV: 'test', DATABASE_URL: DB, ...env });

const MINIO = {
  S3_ENDPOINT: 'http://minio.example.test:9000',
  S3_BUCKET: 'evcar-media',
  S3_ACCESS_KEY_ID: 'unit-access',
  S3_SECRET_ACCESS_KEY: 'unit-secret-key',
  S3_FORCE_PATH_STYLE: 'true',
};

describe('S3StorageProvider (offline)', () => {
  it('is not configured without bucket / credentials and refuses operations with 503', async () => {
    const s3 = new S3StorageProvider(cfg({ S3_ENDPOINT: 'http://minio:9000' }));
    expect(s3.status()).toMatchObject({
      configured: false,
      reason: 'Missing S3_BUCKET, S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY',
    });
    await expect(s3.put('public/x.png', Buffer.from('x'))).rejects.toMatchObject({
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
    await expect(s3.check()).resolves.toEqual({ ok: false, error: 'not configured' });
  });

  it('builds public URLs (CDN base, path-style endpoint, AWS virtual host)', () => {
    expect(
      new S3StorageProvider(
        cfg({ ...MINIO, STORAGE_PUBLIC_BASE_URL: 'https://cdn.example.test/media/' }),
      ).publicUrl('public/a b/c.png'.replace(' ', '-')),
    ).toBe('https://cdn.example.test/media/public/a-b/c.png');
    expect(new S3StorageProvider(cfg(MINIO)).publicUrl('public/x.png')).toBe(
      'http://minio.example.test:9000/evcar-media/public/x.png',
    );
    expect(
      new S3StorageProvider(
        cfg({ S3_BUCKET: 'evcar-media', S3_REGION: 'eu-central-1' }),
      ).publicUrl('public/x.png'),
    ).toBe('https://evcar-media.s3.eu-central-1.amazonaws.com/public/x.png');
    expect(() => new S3StorageProvider(cfg(MINIO)).publicUrl('private/x.png')).toThrow(
      InvalidStorageKeyError,
    );
  });

  it('presigns GET and PUT URLs locally (no network)', async () => {
    const s3 = new S3StorageProvider(cfg(MINIO));
    const get = new URL(await s3.signedUrl('private/docs/a.pdf', { expiresInSeconds: 120, downloadName: 'a"b.pdf' }));
    expect(get.origin + get.pathname).toBe('http://minio.example.test:9000/evcar-media/private/docs/a.pdf');
    expect(get.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(get.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(get.searchParams.get('response-content-disposition')).toBe('attachment; filename="ab.pdf"');
    const put = new URL(await s3.signedUrl('tmp/up/x.bin', { method: 'PUT', contentType: 'image/png' }));
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toContain('host');
    // Public GET without download name → plain public URL.
    expect(await s3.signedUrl('public/x.png')).toBe('http://minio.example.test:9000/evcar-media/public/x.png');
  });

  it('sends the expected commands and maps 404 to null / not found', async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const client = {
      send: jest.fn((command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === 'HeadObjectCommand') {
          return Promise.reject(Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }));
        }
        return Promise.resolve({ ETag: '"abc"' });
      }),
    } as unknown as S3Client;
    const s3 = new S3StorageProvider(cfg(MINIO), client);
    const info = await s3.put('public/x.png', Buffer.from('png'), { contentType: 'image/png', cacheControl: 'max-age=1' });
    expect(info).toMatchObject({ key: 'public/x.png', size: 3, etag: 'abc', contentType: 'image/png' });
    expect(sent[0]).toMatchObject({
      name: 'PutObjectCommand',
      input: { Bucket: 'evcar-media', Key: 'public/x.png', ContentType: 'image/png', CacheControl: 'max-age=1' },
    });
    expect(await s3.head('public/missing.png')).toBeNull();
    expect(s3.status()).toMatchObject({ configured: true });
    expect(s3.status().lastError).toBeUndefined();
    await expect(s3.put('../etc/passwd', Buffer.from('x'))).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });
});
