import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { AppConfig } from '../../config/app-config';
import { deriveLocalSigningKey, signLocal, verifyLocal } from './local-signed-url';
import { LocalStorageProvider } from './local-storage.provider';
import { assertValidKey, InvalidStorageKeyError, safeFileName, storageKey } from './storage-keys';
import { StorageObjectNotFoundError } from './storage.types';

const DB = 'postgresql://evcar:x@localhost:5432/unit';

describe('storage keys', () => {
  it.each([
    'public/branding/logo.png',
    'private/uploads/2026/09/file-1.bin',
    'tmp/health/probe-1',
    'public/a=b+c@d/x_y-z.webp',
  ])('accepts %s', (key) => {
    expect(assertValidKey(key)).toBe(key);
  });

  it.each([
    ['', 'empty'],
    ['/public/x', 'absolute'],
    ['public/../private/secret', 'dot-dot'],
    ['public/./x', 'dot'],
    ['public//x', 'empty segment'],
    ['public\\..\\x', 'backslash'],
    ['public/x\u0000y', 'NUL'],
    ['public/%2e%2e/x', 'percent'],
    ['etc/passwd', 'unknown root'],
    ['public', 'no object name'],
    ['public/ünicode.png', 'non-ascii'],
    [`public/${'a'.repeat(1100)}`, 'too long'],
  ])('rejects %j (%s)', (key) => {
    expect(() => assertValidKey(key)).toThrow(InvalidStorageKeyError);
  });

  it('builds keys and slugifies user file names', () => {
    expect(storageKey('public', 'branding', 'logo.png')).toBe('public/branding/logo.png');
    expect(safeFileName('../../My Photo (1).JPEG')).toBe('My-Photo-1.jpeg');
    expect(safeFileName('صورة.png')).toBe('file.png');
    expect(safeFileName('')).toBe('file');
  });
});

describe('LocalStorageProvider', () => {
  let root: string;
  let storage: LocalStorageProvider;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'evcar-storage-'));
    storage = new LocalStorageProvider(
      AppConfig.fromEnv({
        NODE_ENV: 'test',
        DATABASE_URL: DB,
        STORAGE_LOCAL_ROOT: root,
        APP_PUBLIC_BASE_URL: 'https://api.example.test',
        JWT_ACCESS_SECRET: 'unit-test-secret-unit-test-secret-1234',
      }),
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports itself configured', () => {
    expect(storage.status()).toMatchObject({ type: 'storage', name: 'local', configured: true });
  });

  it('stores, reads, heads, copies and deletes objects with metadata', async () => {
    const info = await storage.put('public/a/b.txt', Buffer.from('hello'), {
      contentType: 'text/plain',
    });
    expect(info).toMatchObject({ key: 'public/a/b.txt', size: 5, contentType: 'text/plain' });
    expect(info.etag).toMatch(/^[0-9a-f]{64}$/);
    expect((await storage.getBuffer('public/a/b.txt')).toString()).toBe('hello');
    expect(await storage.head('public/a/b.txt')).toMatchObject({ size: 5, contentType: 'text/plain' });

    await storage.copy('public/a/b.txt', 'private/c/d.txt');
    expect((await storage.getBuffer('private/c/d.txt')).toString()).toBe('hello');

    await storage.delete('public/a/b.txt');
    await storage.delete('public/a/b.txt'); // idempotent
    expect(await storage.exists('public/a/b.txt')).toBe(false);
    await expect(storage.get('public/a/b.txt')).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('streams large bodies and deletes by prefix', async () => {
    const chunks = Array.from({ length: 50 }, () => Buffer.alloc(64 * 1024, 7));
    const info = await storage.put('tmp/big/x.bin', Readable.from(chunks));
    expect(info.size).toBe(50 * 64 * 1024);
    await storage.put('tmp/big/y.bin', Buffer.from('y'));
    expect(await storage.deletePrefix('tmp/big/')).toBe(2);
    expect(await storage.exists('tmp/big/x.bin')).toBe(false);
  });

  it('never resolves paths outside the root', () => {
    expect(() => storage.pathFor('public/../../etc/passwd')).toThrow(InvalidStorageKeyError);
    expect(storage.pathFor('public/x.png')).toBe(join(root, 'public', 'x.png'));
  });

  it('refuses to write through a symlink that escapes the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'evcar-outside-'));
    try {
      mkdirSync(join(root, 'public'), { recursive: true });
      symlinkSync(outside, join(root, 'public', 'evil'));
      await expect(storage.put('public/evil/x.txt', Buffer.from('x'))).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('builds public URLs only for public keys', () => {
    expect(storage.publicUrl('public/branding/logo 1.png'.replace(' ', '-'))).toBe(
      'https://api.example.test/media/branding/logo-1.png',
    );
    expect(() => storage.publicUrl('private/x.png')).toThrow(InvalidStorageKeyError);
  });

  it('signs private URLs bound to key, method and expiry', async () => {
    const url = new URL(await storage.signedUrl('private/docs/a.pdf', { expiresInSeconds: 60 }));
    expect(url.pathname).toBe('/api/v1/storage/local/private/docs/a.pdf');
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    const key = storage.urlSigningKey;
    expect(verifyLocal(key, { method: 'GET', key: 'private/docs/a.pdf', exp }, sig)).toBe('ok');
    expect(verifyLocal(key, { method: 'GET', key: 'private/docs/b.pdf', exp }, sig)).toBe('invalid');
    expect(verifyLocal(key, { method: 'PUT', key: 'private/docs/a.pdf', exp }, sig)).toBe('invalid');
    expect(verifyLocal(key, { method: 'GET', key: 'private/docs/a.pdf', exp: exp + 1 }, sig)).toBe(
      'invalid',
    );
    expect(
      verifyLocal(key, { method: 'GET', key: 'private/docs/a.pdf', exp }, sig, exp + 1),
    ).toBe('expired');
    // Another deployment secret never validates the signature.
    const other = deriveLocalSigningKey('another-secret-another-secret-123456');
    expect(verifyLocal(other, { method: 'GET', key: 'private/docs/a.pdf', exp }, sig)).toBe(
      'invalid',
    );
    expect(signLocal(key, { method: 'GET', key: 'private/docs/a.pdf', exp })).toBe(sig);
  });

  it('returns the public URL for signed GETs of public keys', async () => {
    expect(await storage.signedUrl('public/x.png')).toBe('https://api.example.test/media/x.png');
  });

  it('assembles multipart uploads in part order and verifies parts', async () => {
    const upload = await storage.createMultipartUpload('private/big/file.bin', {
      contentType: 'application/octet-stream',
    });
    const p2 = await storage.uploadPart(upload, 2, Buffer.from('world'));
    const p1 = await storage.uploadPart(upload, 1, Buffer.from('hello '));
    const info = await storage.completeMultipartUpload(upload, [p2, p1]);
    expect(info.size).toBe(11);
    expect((await storage.getBuffer('private/big/file.bin')).toString()).toBe('hello world');

    const second = await storage.createMultipartUpload('private/big/other.bin');
    const part = await storage.uploadPart(second, 1, Buffer.from('abc'));
    await expect(
      storage.completeMultipartUpload(second, [{ ...part, etag: 'f'.repeat(64) }]),
    ).rejects.toThrow(/missing or differs/);
    await storage.abortMultipartUpload(second);
    await expect(storage.uploadPart(second, 1, Buffer.from('x'))).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
    await expect(
      storage.uploadPart({ key: 'private/x', uploadId: '../../etc' }, 1, Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('passes its health check', async () => {
    await expect(storage.check()).resolves.toMatchObject({ ok: true });
  });
});
