import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, unlinkSync, lstatSync, readdirSync, statfsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { backupDatabase, restoreDatabase } from './backup-lib.js';
import { validateUpdate, installedRelease, UpdateError } from './update-package.js';
import { updateRoot, inside, jobDirectory, readJob, saveJob, atomicJson, type UpdateJob } from './update-store.js';

export type WorkerConfig = { root: string; project: string; appDir: string; dataDir: string; publicKey: string; passphrase: string; node: string };
export function workerConfig(): WorkerConfig {
  const root = updateRoot(), project = resolve(root, '..');
  if (process.env.DATABASE_URL) throw new UpdateError('UPDATE_EXTERNAL_DB');
  const appDir = inside(project, resolve(process.env.UPDATE_APP_DIR || join(project, 'app')));
  const dataDir = inside(project, resolve(process.env.DATA_DIR || join(project, 'data/training')));
  if (appDir === root || dataDir === root || appDir.startsWith(root + '/') || dataDir.startsWith(root + '/') || dataDir.startsWith(appDir + '/') || root.startsWith(appDir + '/')) throw new UpdateError('UPDATE_PATH');
  if (!process.env.UPDATE_PUBLIC_KEY_FILE || !process.env.BACKUP_PASSPHRASE || process.env.BACKUP_PASSPHRASE.length < 16) throw new UpdateError('UPDATE_TRUST');
  return { root, project, appDir, dataDir, publicKey: readFileSync(process.env.UPDATE_PUBLIC_KEY_FILE, 'utf8'), passphrase: process.env.BACKUP_PASSPHRASE, node: process.execPath };
}
function requestJob(config: WorkerConfig) {
  const request = JSON.parse(readFileSync(join(config.root, 'install-request.json'), 'utf8'));
  return readJob(config.root, request.id);
}
function safeDirectory(root: string, path: string) {
  const result = inside(root, path);
  if (existsSync(result) && lstatSync(result).isSymbolicLink()) throw new UpdateError('UPDATE_PATH');
  return result;
}
function event(config: WorkerConfig, job: UpdateJob, code: string) { saveJob(config.root, job, code); }
export async function beginUpdate(config: WorkerConfig) {
  const job = requestJob(config);
  if (['installed', 'rolled_back', 'failed', 'rollback_failed'].includes(job.status)) throw new UpdateError('UPDATE_TERMINAL');
  atomicJson(join(config.root, 'maintenance.json'), { id: job.id, started_at: new Date().toISOString() });
  if (job.status === 'queued') { job.status = 'preparing'; event(config, job, 'MAINTENANCE_STARTED'); }
  return job;
}
function command(executable: string, args: string[], directory: string, config: WorkerConfig) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: directory, shell: false, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
      env: { PATH: dirname(config.node) + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '/usr/bin:/bin'), HOME: join(config.project, '.home'), TMPDIR: join(config.project, '.tmp'), npm_config_cache: join(config.project, '.cache/npm'), npm_config_registry: 'https://registry.npmjs.org', npm_config_userconfig: join(config.root, 'empty-user-npmrc'), npm_config_globalconfig: join(config.root, 'empty-global-npmrc'), ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot || 'C:\\Windows' } : {}) },
    });
    // Keep bounded diagnostic output in the operator journal, never API state or secrets.
    let diagnostic = '';
    child.stderr?.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-3000); });
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); if (code === 0) resolvePromise(); else { if (diagnostic) process.stderr.write(diagnostic); reject(new UpdateError('DEPENDENCIES_FAILED')); } });
  });
}
export async function installDependencies(stage: string, config: WorkerConfig) {
  for (const name of ['empty-user-npmrc', 'empty-global-npmrc']) writeFileSync(join(config.root, name), '', { mode: 0o600 });
  const npm = resolve(dirname(config.node), '../lib/node_modules/npm/bin/npm-cli.js');
  if (!existsSync(npm)) throw new UpdateError('UPDATE_RUNTIME');
  await command(config.node, [npm, 'ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stage, config);
  await command(config.node, [join(stage, 'node_modules/typescript/bin/tsc'), '--noEmit'], stage, config);
}
function directoryBytes(path: string): number {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + directoryBytes(join(path, name)), 0);
}
export async function applyUpdate(config: WorkerConfig, dependencies = installDependencies) {
  const job = requestJob(config), directory = jobDirectory(config.root, job.id);
  if (job.status !== 'preparing' || job.swap_started || job.backup_complete) throw new UpdateError('UPDATE_RECOVERY_REQUIRED');
  const checked = validateUpdate(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')), config.publicKey, installedRelease(config.appDir));
  if (checked.digest !== job.digest) throw new UpdateError('UPDATE_HASH');
  const stage = safeDirectory(directory, join(directory, 'next-app'));
  if (existsSync(stage)) rmSync(stage, { recursive: true }); // Bounded, validated scratch directory only.
  mkdirSync(stage, { mode: 0o700 });
  const disk = statfsSync(config.project);
  if (disk.bavail * disk.bsize < Math.max(256 * 1024 * 1024, directoryBytes(config.dataDir) * 3 + directoryBytes(config.appDir))) throw new UpdateError('UPDATE_DISK');
  // Existing migrations are immutable. A release may only append migrations.
  for (const name of readdirSync(join(config.appDir, 'server/migrations'))) {
    if (!/^\d+_.*\.sql$/.test(name)) continue;
    const next = checked.files.get('server/migrations/' + name);
    if (!next || !next.equals(readFileSync(join(config.appDir, 'server/migrations', name)))) throw new UpdateError('UPDATE_SCHEMA');
  }
  for (const [path, content] of checked.files) {
    const destination = inside(stage, join(stage, path));
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  }
  atomicJson(join(stage, 'release.json'), { version: checked.manifest.version, sequence: checked.manifest.sequence, schema: checked.manifest.schema, digest: checked.digest, installed_at: new Date().toISOString() });
  event(config, job, 'FILES_STAGED');
  await dependencies(stage, config);
  event(config, job, 'DEPENDENCIES_READY');
  // Both the web service and its DB connection MUST be stopped by the fixed coordinator.
  const backup = await backupDatabase(config.dataDir, join(directory, 'database-before.enc'), config.passphrase);
  atomicJson(join(directory, 'database-before.enc.manifest.json'), backup);
  job.backup_complete = true; job.status = 'installing'; event(config, job, 'DATABASE_BACKED_UP');
  job.swap_started = true; event(config, job, 'CODE_SWAP_STARTED');
  renameSync(config.appDir, safeDirectory(directory, join(directory, 'previous-app')));
  renameSync(stage, config.appDir);
  job.code_swapped = true; job.status = 'checking'; event(config, job, 'CODE_INSTALLED');
  return job;
}
export async function rollbackUpdate(config: WorkerConfig) {
  const job = requestJob(config), directory = jobDirectory(config.root, job.id);
  job.rollback_started = true; event(config, job, 'ROLLBACK_STARTED');
  try {
    const previous = safeDirectory(directory, join(directory, 'previous-app'));
    if (existsSync(previous)) {
      if (existsSync(config.appDir)) renameSync(config.appDir, safeDirectory(directory, join(directory, 'failed-app-' + Date.now())));
      renameSync(previous, config.appDir);
      event(config, job, 'PREVIOUS_CODE_RESTORED');
    } else if (job.code_swapped && !existsSync(config.appDir)) throw new UpdateError('ROLLBACK_CODE_MISSING');
    if (job.backup_complete) {
      const restore = safeDirectory(directory, join(directory, 'restored-data'));
      if (existsSync(restore)) rmSync(restore, { recursive: true });
      await restoreDatabase(join(directory, 'database-before.enc'), restore, config.passphrase);
      if (existsSync(config.dataDir)) renameSync(config.dataDir, safeDirectory(directory, join(directory, 'failed-data-' + Date.now())));
      renameSync(restore, config.dataDir);
      event(config, job, 'DATABASE_RESTORED');
    }
    job.status = job.backup_complete || job.swap_started ? 'rolled_back' : 'failed';
    event(config, job, 'ROLLBACK_AWAITING_HEALTH');
  } catch (error) {
    job.status = 'rollback_failed'; event(config, job, 'ROLLBACK_FAILED');
    throw error;
  }
  return job;
}
export function finishUpdate(config: WorkerConfig, success: boolean) {
  const job = requestJob(config);
  if (success) { if (job.status !== 'checking') throw new UpdateError('UPDATE_FORMAT'); job.status = 'installed'; event(config, job, 'HEALTH_PASSED'); }
  else if (!['rolled_back', 'failed'].includes(job.status)) throw new UpdateError('UPDATE_FORMAT');
  else event(config, job, 'PREVIOUS_HEALTH_PASSED');
  for (const name of ['install-request.json', 'install-lock.json', 'maintenance.json']) {
    const path = inside(config.root, join(config.root, name));
    if (existsSync(path)) unlinkSync(path);
  }
  return job;
}
export function recordWorkerFailure(config: WorkerConfig, code: string) {
  const job = requestJob(config); event(config, job, /^[A-Z_]{3,60}$/.test(code) ? code : 'UPDATE_FAILED');
}
export async function verifyRunningRelease(config: WorkerConfig, expected: 'new' | 'previous') {
  const job = requestJob(config);
  const response = await fetch('http://127.0.0.1:4317/api/health', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new UpdateError('HEALTH_FAILED');
  const health: any = await response.json();
  if (health?.ok !== true) throw new UpdateError('HEALTH_FAILED');
  if (expected === 'new' && (health.release?.version !== job.manifest.version || Number(health.release?.sequence) !== job.manifest.sequence || health.release?.digest !== job.digest)) throw new UpdateError('HEALTH_FAILED');
  if (expected === 'previous' && Number(health.release?.sequence) === job.manifest.sequence) throw new UpdateError('ROLLBACK_HEALTH_FAILED');
}
// The fake-service harness uses the same real filesystem/database operations as Linux.
export async function runUpdateWithService(config: WorkerConfig, service: { stop(): Promise<void>; start(): Promise<void>; healthy(): Promise<boolean> }, dependencies = installDependencies) {
  await beginUpdate(config); await service.stop();
  try {
    await applyUpdate(config, dependencies); await service.start();
    if (!(await service.healthy())) throw new UpdateError('HEALTH_FAILED');
    return finishUpdate(config, true);
  } catch (error) {
    recordWorkerFailure(config, error instanceof UpdateError ? error.code : 'UPDATE_FAILED');
    await service.stop(); await rollbackUpdate(config); await service.start();
    if (!(await service.healthy())) { recordWorkerFailure(config, 'ROLLBACK_HEALTH_FAILED'); throw new UpdateError('ROLLBACK_HEALTH_FAILED'); }
    return finishUpdate(config, false);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = workerConfig();
  try {
    const phase = process.argv[2];
    if (phase === 'begin') await beginUpdate(config);
    else if (phase === 'apply') await applyUpdate(config);
    else if (phase === 'rollback') await rollbackUpdate(config);
    else if (phase === 'success') finishUpdate(config, true);
    else if (phase === 'recovered') finishUpdate(config, false);
    else if (phase === 'health-failed') recordWorkerFailure(config, 'HEALTH_FAILED');
    else if (phase === 'verify-new') await verifyRunningRelease(config, 'new');
    else if (phase === 'verify-previous') await verifyRunningRelease(config, 'previous');
    else throw new UpdateError('UPDATE_FORMAT');
  } catch (error) {
    try { recordWorkerFailure(config, error instanceof UpdateError ? error.code : 'UPDATE_FAILED'); } catch { /* Preserve the original failure. */ }
    console.error(error instanceof UpdateError ? error.code : 'UPDATE_FAILED');
    process.exitCode = 1;
  }
}
