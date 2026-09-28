import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { signUpdate } from '../scripts/update-package.js';

function signedPackage(privateKey: KeyObject) {
  const version = '2.0.0';
  const schema = Math.max(...readdirSync(new URL('../server/migrations/', import.meta.url)).filter(n => /^\d+.*\.sql$/.test(n)).map(n => Number(n.split('_')[0])));
  const files = Object.entries({
    'package.json': JSON.stringify({ name: 'qasr-almaadi-nicu', version }),
    'package-lock.json': JSON.stringify({ name: 'qasr-almaadi-nicu', version, lockfileVersion: 3, packages: { '': { version } } }),
    'server/index.ts': 'export {};',
    'server/app.ts': 'export {};',
    'server/db.ts': 'export {};',
    'server/security.ts': 'export {};',
    [`server/migrations/${String(schema).padStart(3, '0')}_test.sql`]: 'SELECT 1;',
    'dist/index.html': '<!doctype html><title>Test</title>',
  }).map(([path, content]) => ({ path, content: Buffer.from(content).toString('base64') }));
  return signUpdate(files, { version, sequence: 18, schema }, 'Automatic update test', privateKey);
}

function configure(fixture: string, publicKey: KeyObject, ready: boolean) {
  const updateRoot = join(fixture, 'updates'), installed = join(fixture, 'installed');
  mkdirSync(updateRoot); mkdirSync(join(updateRoot, 'jobs')); mkdirSync(installed);
  if (ready) writeFileSync(join(updateRoot, 'worker-ready.json'), '{}');
  writeFileSync(join(installed, 'release.json'), JSON.stringify({ version: '1.1.0', sequence: 15, schema: 21 }));
  const publicKeyPath = join(fixture, 'public.pem');
  writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  process.env.UPDATE_ENABLED = 'true'; process.env.UPDATE_ROOT = updateRoot;
  process.env.UPDATE_APP_DIR = installed; process.env.UPDATE_PUBLIC_KEY_FILE = publicKeyPath;
  return updateRoot;
}

async function withAdmin(run: (origin: string, cookie: string) => Promise<void>) {
  delete process.env.DATABASE_URL;
  const db = await initDb(':memory:');
  const server = (await createApp(db, { seed: true })).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Training@2026' }) });
    assert.equal(login.status, 200);
    await run(origin, login.headers.get('set-cookie')!.split(';')[0]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await db.close();
  }
}

test('uploading a verified package queues installation automatically and safely replays', { timeout: 60000 }, async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'nicu-auto-update-')), keys = generateKeyPairSync('ed25519');
  const updateRoot = configure(fixture, keys.publicKey, true), key = randomUUID();
  await withAdmin(async (origin, cookie) => {
    const body = JSON.stringify({ package: signedPackage(keys.privateKey), idempotency_key: key });
    const upload = () => fetch(origin + '/api/software-updates/upload', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body });
    const first = await upload(), firstJob = await first.json();
    assert.equal(first.status, 202, JSON.stringify(firstJob));
    assert.equal(firstJob.status, 'queued');
    assert.deepEqual(firstJob.logs.map((entry: any) => entry.code), ['PACKAGE_VERIFIED', 'INSTALL_REQUESTED']);
    assert.equal(JSON.parse(readFileSync(join(updateRoot, 'install-request.json'), 'utf8')).id, firstJob.id);
    assert.equal(JSON.parse(readFileSync(join(updateRoot, 'install-lock.json'), 'utf8')).id, firstJob.id);
    const replay = await upload(), replayJob = await replay.json();
    assert.equal(replay.status, 202); assert.equal(replayJob.id, firstJob.id);
    assert.equal(replayJob.logs.filter((entry: any) => entry.code === 'INSTALL_REQUESTED').length, 1);
  });
});

test('upload is rejected before storage when the automatic installer is unavailable', { timeout: 60000 }, async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'nicu-auto-update-unready-')), keys = generateKeyPairSync('ed25519');
  const updateRoot = configure(fixture, keys.publicKey, false);
  await withAdmin(async (origin, cookie) => {
    const response = await fetch(origin + '/api/software-updates/upload', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ package: signedPackage(keys.privateKey), idempotency_key: randomUUID() }) });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'UPDATE_WORKER');
    assert.equal(existsSync(join(updateRoot, 'install-request.json')), false);
    assert.deepEqual(readdirSync(join(updateRoot, 'jobs')), []);
  });
});
