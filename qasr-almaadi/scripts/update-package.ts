import { createHash, createPublicKey, verify, sign, type KeyLike } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_UPDATE_BYTES = 6 * 1024 * 1024;
export const MAX_CONTENT_BYTES = 4 * 1024 * 1024;
export type Release = { version: string; sequence: number; schema: number };
export type Manifest = Release & { format: 'nicu-update-v1'; app: 'qasr-nicu'; updater: 1; created_at: string; notes: string; files: { path: string; size: number; sha256: string }[] };
export type UpdatePackage = { manifest: Manifest; signature: string; files: { path: string; content: string }[] };
export class UpdateError extends Error {
  constructor(public code: string) { super(code); }
}
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const rootFiles = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html']);
export function safeReleasePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 180 || !/^[A-Za-z0-9_./-]+$/.test(path)) return false;
  if (path.split('/').some(part => !part || part.startsWith('.') || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(part))) return false;
  if (rootFiles.has(path)) return true;
  return /^(?:server|scripts|src|dist|public)\//.test(path) && /\.(?:ts|tsx|js|mjs|json|webmanifest|css|sql|html|svg|png|jpg|jpeg|webp|ico|woff2?|map|sh)$/.test(path);
}
function exactKeys(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new UpdateError('UPDATE_FORMAT');
}
export function newerVersion(next: string, current: string) {
  const a = next.split('.').map(Number), b = current.split('.').map(Number);
  return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
}
export function installedRelease(appDir: string): Release {
  if (existsSync(join(appDir, 'release.json'))) {
    const release = JSON.parse(readFileSync(join(appDir, 'release.json'), 'utf8'));
    return { version: release.version, sequence: release.sequence, schema: release.schema };
  }
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  const migrations = readdirSync(join(appDir, 'server/migrations')).map(name => Number(/^(\d+)_.*\.sql$/.exec(name)?.[1] || 0));
  return { version: pkg.version, sequence: 0, schema: Math.max(0, ...migrations) };
}
export function validateUpdate(input: unknown, publicPem: string | Buffer, current?: Release) {
  if (Buffer.byteLength(JSON.stringify(input) || '') > MAX_UPDATE_BYTES) throw new UpdateError('UPDATE_SIZE');
  exactKeys(input, ['manifest', 'signature', 'files']);
  const value = input as UpdatePackage;
  const m = value.manifest;
  exactKeys(m, ['format', 'app', 'updater', 'version', 'sequence', 'schema', 'created_at', 'notes', 'files']);
  if (m.format !== 'nicu-update-v1' || m.app !== 'qasr-nicu' || m.updater !== 1 || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(m.version) || !Number.isSafeInteger(m.sequence) || m.sequence < 1 || !Number.isSafeInteger(m.schema) || m.schema < 1 || typeof m.notes !== 'string' || m.notes.length > 2000 || typeof m.created_at !== 'string' || !Number.isFinite(Date.parse(m.created_at))) throw new UpdateError('UPDATE_FORMAT');
  if (!Array.isArray(m.files) || !m.files.length || m.files.length > 1500 || !Array.isArray(value.files) || m.files.length !== value.files.length) throw new UpdateError('UPDATE_FORMAT');
  let publicKey;
  try { publicKey = createPublicKey(publicPem); } catch { throw new UpdateError('UPDATE_TRUST'); }
  if (publicKey.asymmetricKeyType !== 'ed25519' || typeof value.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(value.signature) || !verify(null, Buffer.from(canonical(m)), publicKey, Buffer.from(value.signature, 'base64'))) throw new UpdateError('UPDATE_SIGNATURE');
  if (current && (m.sequence <= current.sequence || !newerVersion(m.version, current.version) || m.schema < current.schema)) throw new UpdateError('UPDATE_VERSION');
  const names = new Set<string>(), files = new Map<string, Buffer>();
  let total = 0;
  for (let index = 0; index < m.files.length; index++) {
    const descriptor = m.files[index], file = value.files[index];
    exactKeys(descriptor, ['path', 'size', 'sha256']); exactKeys(file, ['path', 'content']);
    if (!safeReleasePath(descriptor.path) || file.path !== descriptor.path || names.has(file.path.toLowerCase())) throw new UpdateError('UPDATE_PATH');
    names.add(file.path.toLowerCase());
    if (!Number.isSafeInteger(descriptor.size) || descriptor.size < 0 || descriptor.size > 2 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || typeof file.content !== 'string' || file.content.length > 3 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new UpdateError('UPDATE_SIZE');
    const content = Buffer.from(file.content, 'base64');
    total += content.length;
    if (total > MAX_CONTENT_BYTES || content.length !== descriptor.size || sha256(content) !== descriptor.sha256) throw new UpdateError('UPDATE_HASH');
    files.set(file.path, content);
  }
  for (const path of names) {
    const parts = path.split('/'); parts.pop();
    while (parts.length) { if (names.has(parts.join('/'))) throw new UpdateError('UPDATE_PATH'); parts.pop(); }
  }
  for (const path of ['package.json', 'package-lock.json', 'server/index.ts', 'server/app.ts', 'server/db.ts', 'server/security.ts', 'dist/index.html']) if (!files.has(path)) throw new UpdateError('UPDATE_FORMAT');
  const schema = Math.max(0, ...[...files.keys()].map(path => Number(/^server\/migrations\/(\d+)_.*\.sql$/.exec(path)?.[1] || 0)));
  if (schema !== m.schema) throw new UpdateError('UPDATE_SCHEMA');
  let pkg, lock;
  try { pkg = JSON.parse(files.get('package.json')!.toString()); lock = JSON.parse(files.get('package-lock.json')!.toString()); } catch { throw new UpdateError('UPDATE_FORMAT'); }
  if (pkg.name !== 'qasr-almaadi-nicu' || pkg.version !== m.version || lock.name !== pkg.name || lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version || !lock.lockfileVersion) throw new UpdateError('UPDATE_FORMAT');
  return { manifest: m, files, digest: sha256(canonical(m)), bytes: total };
}
export function collectRelease(appDir: string): { path: string; content: string }[] {
  const paths: string[] = [];
  function scan(relative: string) {
    const absolute = join(appDir, relative), stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new UpdateError('UPDATE_PATH');
    if (stat.isDirectory()) for (const name of readdirSync(absolute).sort()) scan(relative ? relative + '/' + name : name);
    else if (stat.isFile() && safeReleasePath(relative)) paths.push(relative);
  }
  for (const name of [...rootFiles, 'server', 'scripts', 'src', 'dist', 'public']) if (existsSync(join(appDir, name))) scan(name);
  return paths.sort().map(path => ({ path, content: readFileSync(join(appDir, path)).toString('base64') }));
}
export function signUpdate(files: UpdatePackage['files'], release: Release, notes: string, privateKey: KeyLike): UpdatePackage {
  const manifest: Manifest = { format: 'nicu-update-v1', app: 'qasr-nicu', updater: 1, ...release, created_at: new Date().toISOString(), notes, files: files.map(file => { const content = Buffer.from(file.content, 'base64'); return { path: file.path, size: content.length, sha256: sha256(content) }; }) };
  return { manifest, signature: sign(null, Buffer.from(canonical(manifest)), privateKey).toString('base64'), files };
}
