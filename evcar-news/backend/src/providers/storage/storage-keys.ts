/**
 * Storage key rules shared by every driver. Keys are what callers pass to
 * the StorageProvider; they are validated so that no key can escape the
 * storage root (local driver) or address unexpected objects (S3).
 *
 *  - 1..1024 characters, relative (no leading "/"), "/" as separator;
 *  - allowed characters: A-Z a-z 0-9 . _ - = + @ / (callers slugify user file names);
 *  - no empty, "." or ".." segments, no backslashes, no control characters;
 *  - the first segment is one of STORAGE_ROOTS (public | private | tmp).
 */
export const STORAGE_ROOTS = ['public', 'private', 'tmp'] as const;
export type StorageRoot = (typeof STORAGE_ROOTS)[number];

const KEY_CHARS = /^[A-Za-z0-9._\-=+@/]+$/;
const MAX_KEY_LENGTH = 1024;

export class InvalidStorageKeyError extends Error {
  constructor(
    readonly key: string,
    reason: string,
  ) {
    super(`Invalid storage key: ${reason}`);
    this.name = 'InvalidStorageKeyError';
  }
}

/** Returns the key unchanged when valid, throws InvalidStorageKeyError otherwise. */
export function assertValidKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new InvalidStorageKeyError(String(key), 'empty');
  }
  if (key.length > MAX_KEY_LENGTH) throw new InvalidStorageKeyError(key, 'too long');
  if (!KEY_CHARS.test(key)) throw new InvalidStorageKeyError(key, 'forbidden characters');
  if (key.startsWith('/')) throw new InvalidStorageKeyError(key, 'absolute path');
  const segments = key.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new InvalidStorageKeyError(key, 'empty or relative segment');
  }
  if (!(STORAGE_ROOTS as readonly string[]).includes(segments[0])) {
    throw new InvalidStorageKeyError(key, `must start with ${STORAGE_ROOTS.join('/, ')}/`);
  }
  if (segments.length < 2) throw new InvalidStorageKeyError(key, 'missing object name');
  return key;
}

/** Validates a prefix for deletePrefix(): a valid key path ending with "/". */
export function assertValidPrefix(prefix: string): string {
  if (!prefix.endsWith('/')) throw new InvalidStorageKeyError(prefix, 'prefix must end with /');
  assertValidKey(`${prefix}x`);
  return prefix;
}

export function isPublicKey(key: string): boolean {
  return key.startsWith('public/');
}

export function rootOf(key: string): StorageRoot {
  return assertValidKey(key).split('/')[0] as StorageRoot;
}

/**
 * Turns an arbitrary (user supplied) file name into a safe key segment:
 * keeps ASCII letters/digits/._-, lower-cases the extension, max 120 chars.
 */
export function safeFileName(name: string, fallback = 'file'): string {
  const base = (name.split(/[\\/]/).pop() ?? '').trim();
  const dot = base.lastIndexOf('.');
  const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
  const stem = ascii(dot >= 0 ? base.slice(0, dot) : base)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  const ext =
    dot >= 0
      ? ascii(base.slice(dot + 1))
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 10)
      : '';
  const safeStem = stem || fallback;
  return ext ? `${safeStem}.${ext}` : safeStem;
}

/** Joins validated segments into a key, e.g. storageKey('public', 'branding', 'logo.png'). */
export function storageKey(root: StorageRoot, ...parts: string[]): string {
  return assertValidKey([root, ...parts.map((p) => p.replace(/^\/+|\/+$/g, ''))].join('/'));
}

/** Percent-encodes each key segment for use in a URL path. */
export function encodeKeyForUrl(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}
