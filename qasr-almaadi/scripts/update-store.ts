import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import { resolve, join, isAbsolute, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { UpdateError, type Manifest } from './update-package.js';

export type UpdateStatus = 'staged' | 'queued' | 'preparing' | 'installing' | 'checking' | 'installed' | 'rolled_back' | 'failed' | 'rollback_failed';
export type UpdateJob = {
  id: string; digest: string; manifest: Manifest; status: UpdateStatus;
  actor_id: string; actor_name: string; created_at: string; updated_at: string;
  install_key?: string; logs: { at: string; code: string }[];
  backup_complete?: boolean; swap_started?: boolean; code_swapped?: boolean; rollback_started?: boolean;
};
export const terminalStatus = new Set<UpdateStatus>(['installed', 'rolled_back', 'failed', 'rollback_failed']);
export function inside(root: string, target: string) {
  const difference = relative(resolve(root), resolve(target));
  if (!difference || difference === '..' || difference.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(difference)) throw new UpdateError('UPDATE_PATH');
  return resolve(target);
}
export function updateRoot() {
  if (!process.env.UPDATE_ROOT || !isAbsolute(process.env.UPDATE_ROOT)) throw new UpdateError('UPDATE_DISABLED');
  return resolve(process.env.UPDATE_ROOT);
}
export function initializeStore(root: string) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink()) throw new UpdateError('UPDATE_PATH');
  mkdirSync(join(root, 'jobs'), { recursive: true, mode: 0o700 });
  if (lstatSync(join(root, 'jobs')).isSymbolicLink()) throw new UpdateError('UPDATE_PATH');
}
export function jobDirectory(root: string, id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new UpdateError('UPDATE_NOT_FOUND');
  const path = inside(root, join(root, 'jobs', id));
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new UpdateError('UPDATE_PATH');
  return path;
}
export function atomicJson(path: string, value: unknown) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
  renameSync(temporary, path);
}
export function readJob(root: string, id: string): UpdateJob {
  const path = join(jobDirectory(root, id), 'state.json');
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new UpdateError('UPDATE_NOT_FOUND');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function saveJob(root: string, job: UpdateJob, code?: string) {
  job.updated_at = new Date().toISOString();
  if (code) job.logs = [...job.logs, { at: job.updated_at, code }].slice(-100);
  atomicJson(join(jobDirectory(root, job.id), 'state.json'), job);
}
export function visibleJob(job: UpdateJob) {
  return { id: job.id, digest: job.digest, version: job.manifest.version, sequence: job.manifest.sequence, schema: job.manifest.schema, notes: job.manifest.notes, files: job.manifest.files.length, bytes: job.manifest.files.reduce((sum, file) => sum + file.size, 0), status: job.status, actor_name: job.actor_name, created_at: job.created_at, updated_at: job.updated_at, logs: job.logs };
}
