import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { audit, wrap, permit, type Req, type RouteContext } from './context.js';
import { ApiError } from './security.js';
import { getLocale } from './i18n.js';
import { one } from './db.js';
import { updateMessages } from './update-messages.js';
import { validateUpdate, installedRelease, UpdateError, MAX_UPDATE_BYTES, sha256 } from '../scripts/update-package.js';
import { updateRoot, initializeStore, jobDirectory, readJob, saveJob, visibleJob, terminalStatus, type UpdateJob } from '../scripts/update-store.js';

function reject(r: Request, code: string, status = 400): never {
  const messages = updateMessages[code] || updateMessages.UPDATE_FORMAT;
  throw new ApiError(status, messages[getLocale(r) === 'en' ? 1 : 0], code);
}
function admin(r: Req) {
  permit(r, 'settings.write');
  if (r.user.role !== 'admin') reject(r, 'UPDATE_ADMIN', 403);
}
function retryKey(r: Req) {
  const key = r.body?.idempotency_key;
  if (typeof key !== 'string' || key.length < 8 || key.length > 160) reject(r, 'UPDATE_KEY');
  return key;
}
function configuration(r: Req) {
  if (process.env.UPDATE_ENABLED !== 'true' || !process.env.UPDATE_PUBLIC_KEY_FILE || !existsSync(process.env.UPDATE_PUBLIC_KEY_FILE)) reject(r, 'UPDATE_DISABLED', 503);
  const root = updateRoot(); initializeStore(root);
  return { root, key: readFileSync(process.env.UPDATE_PUBLIC_KEY_FILE), appDir: resolve(process.env.UPDATE_APP_DIR || process.cwd()) };
}
function guarded(handler: (r: Req, s: Response) => Promise<any>) {
  return wrap(async (r, s) => {
    try { return await handler(r, s); }
    catch (error) { if (error instanceof UpdateError) reject(r, error.code, error.code === 'UPDATE_NOT_FOUND' ? 404 : 400); throw error; }
  });
}
async function queueInstallation(db: RouteContext['db'], r: Req, root: string, publicKey: Buffer, appDir: string, job: UpdateJob, key: string) {
  if (!existsSync(join(root, 'worker-ready.json'))) reject(r, 'UPDATE_WORKER', 503);
  if (job.install_key === key && job.status !== 'staged') return job;
  if (terminalStatus.has(job.status)) reject(r, 'UPDATE_TERMINAL', 409);
  if (job.status !== 'staged' || existsSync(join(root, 'install-request.json')) || existsSync(join(root, 'maintenance.json'))) reject(r, 'UPDATE_BUSY', 409);
  validateUpdate(JSON.parse(readFileSync(join(jobDirectory(root, job.id), 'package.json'), 'utf8')), publicKey, installedRelease(appDir));
  await audit(db, r, 'update_install', 'software_updates', job.id, { version: job.manifest.version, digest: job.digest, automatic: true });
  // Claim the fixed worker before publishing its request. Retrying the same upload
  // returns the queued job instead of creating or installing it twice.
  const marker = join(root, 'install-lock.json');
  try { writeFileSync(marker, JSON.stringify({ id: job.id }), { flag: 'wx', mode: 0o600 }); }
  catch (error: any) { if (error.code === 'EEXIST') reject(r, 'UPDATE_BUSY', 409); throw error; }
  try {
    job.status = 'queued'; job.install_key = key; saveJob(root, job, 'INSTALL_REQUESTED');
    writeFileSync(join(root, 'install-request.json'), JSON.stringify({ id: job.id }), { flag: 'wx', mode: 0o600 });
  } catch (error) { unlinkSync(marker); throw error; }
  return job;
}
// Register before /api auth and audit middleware: maintenance reads must not mutate the DB.
export function updateMaintenanceMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!process.env.UPDATE_ROOT || !existsSync(join(process.env.UPDATE_ROOT, 'maintenance.json'))) return next();
  if (req.path === '/api/health' || (req.method === 'GET' && (req.path === '/api/session' || req.path.startsWith('/api/software-updates')))) return next();
  if (!req.path.startsWith('/api') && !req.path.startsWith('/iclock')) return next();
  const message = updateMessages.UPDATE_MAINTENANCE[getLocale(req) === 'en' ? 1 : 0];
  res.setHeader('Retry-After', '10');
  res.status(503).json({ error: message, code: 'UPDATE_MAINTENANCE' });
}
export function updateRoutes({ app, db }: RouteContext) {
  app.get('/api/software-updates', guarded(async (r, s) => {
    admin(r);
    const appDir = resolve(process.env.UPDATE_APP_DIR || process.cwd());
    const enabled = process.env.UPDATE_ENABLED === 'true' && !!process.env.UPDATE_ROOT && !!process.env.UPDATE_PUBLIC_KEY_FILE && existsSync(process.env.UPDATE_PUBLIC_KEY_FILE);
    if (!enabled) return s.json({ enabled: false, ready: false, current: installedRelease(appDir), jobs: [], limits: { package_bytes: MAX_UPDATE_BYTES }, maintenance: false });
    const { root, key } = configuration(r);
    const jobs = readdirSync(join(root, 'jobs')).filter(id => /^[a-f0-9]{32}$/.test(id)).map(id => readJob(root, id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    s.json({ enabled: true, ready: existsSync(join(root, 'worker-ready.json')), current: installedRelease(appDir), maintenance: existsSync(join(root, 'maintenance.json')), limits: { package_bytes: MAX_UPDATE_BYTES }, public_key_fingerprint: sha256(key), jobs: jobs.slice(0, 50).map(visibleJob) });
  }));
  app.get('/api/software-updates/:id', guarded(async (r, s) => {
    admin(r); const { root } = configuration(r);
    s.json(visibleJob(readJob(root, String(r.params.id))));
  }));
  app.post('/api/software-updates/upload', guarded(async (r, s) => {
    admin(r); const key = retryKey(r), { root, key: publicKey, appDir } = configuration(r);
    const release = installedRelease(appDir);
    release.schema = Math.max(release.schema, Number((await one(db, 'SELECT COALESCE(MAX(version),0) AS schema FROM schema_migrations')).schema));
    const checked = validateUpdate(r.body.package, publicKey, release);
    const id = sha256(r.user.id + ':' + key).slice(0, 32), directory = jobDirectory(root, id);
    if (existsSync(join(directory, 'state.json'))) {
      const job = readJob(root, id);
      if (job.digest !== checked.digest) reject(r, 'UPDATE_KEY', 409);
      if (job.status === 'staged') await queueInstallation(db, r, root, publicKey, appDir, job, key);
      return s.status(job.status === 'queued' ? 202 : 200).json(visibleJob(job));
    }
    if (!existsSync(join(root, 'worker-ready.json'))) reject(r, 'UPDATE_WORKER', 503);
    if (existsSync(join(root, 'install-lock.json')) || existsSync(join(root, 'install-request.json')) || existsSync(join(root, 'maintenance.json'))) reject(r, 'UPDATE_BUSY', 409);
    if (readdirSync(join(root, 'jobs')).length >= 50) reject(r, 'UPDATE_UPLOAD_LIMIT', 409);
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(join(directory, 'package.json'), JSON.stringify(r.body.package), { flag: 'wx', mode: 0o600 });
    const now = new Date().toISOString();
    const job: UpdateJob = { id, digest: checked.digest, manifest: checked.manifest, status: 'staged', actor_id: r.user.id, actor_name: r.user.name, created_at: now, updated_at: now, logs: [] };
    saveJob(root, job, 'PACKAGE_VERIFIED');
    await audit(db, r, 'update_upload', 'software_updates', id, { version: job.manifest.version, digest: job.digest });
    await queueInstallation(db, r, root, publicKey, appDir, job, key);
    s.status(202).json(visibleJob(job));
  }));
  app.post('/api/software-updates/:id/install', guarded(async (r, s) => {
    admin(r); const key = retryKey(r), { root, key: publicKey, appDir } = configuration(r);
    const job = readJob(root, String(r.params.id));
    if (r.body.confirm_version !== job.manifest.version) reject(r, 'UPDATE_CONFIRM');
    await queueInstallation(db, r, root, publicKey, appDir, job, key);
    s.status(202).json(visibleJob(job));
  }));
}
