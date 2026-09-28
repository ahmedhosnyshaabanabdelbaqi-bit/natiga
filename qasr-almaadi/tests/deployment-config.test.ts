import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, one } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { verifyPassword } from '../server/security.js';

test('private training seed, session visibility and trusted local proxy preserve existing users', { timeout: 120000 }, async () => {
  const keys = ['DATABASE_URL', 'TRAINING_PASSWORD', 'PUBLIC_DEMO_ACCOUNTS', 'TRUST_PROXY'] as const;
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  delete process.env.DATABASE_URL;
  const db = await initDb(':memory:');
  let server: ReturnType<Awaited<ReturnType<typeof createApp>>['listen']> | undefined;
  try {
    process.env.PUBLIC_DEMO_ACCOUNTS = 'false';
    delete process.env.TRAINING_PASSWORD;
    await assert.rejects(seedDatabase(db), /require TRAINING_PASSWORD/);
    assert.equal((await one(db, 'SELECT count(*)::int AS count FROM users')).count, 0);
    process.env.TRAINING_PASSWORD = 'short';
    await assert.rejects(seedDatabase(db), /require TRAINING_PASSWORD/);
    const initialPassword = 'Private-training-unique-2026!';
    process.env.TRAINING_PASSWORD = initialPassword;
    await seedDatabase(db);
    const original = await one(db, "SELECT password_hash FROM users WHERE username='admin'");
    assert.equal(verifyPassword(initialPassword, original.password_hash), true);
    assert.equal(verifyPassword('Training@2026', original.password_hash), false);
    process.env.TRAINING_PASSWORD = 'Another-secret-that-must-not-reset';
    await seedDatabase(db);
    assert.equal((await one(db, "SELECT password_hash FROM users WHERE username='admin'")).password_hash, original.password_hash);
    delete process.env.TRAINING_PASSWORD;
    await seedDatabase(db); // Even absent configuration must not reset existing users.
    process.env.TRUST_PROXY = 'loopback';
    server = (await createApp(db)).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const session = await (await fetch(base + '/api/session')).json();
    assert.equal(session.training_accounts_visible, false);
    assert.equal(session.mode, 'live');
    assert.equal(session.user, null);
    assert.ok(!JSON.stringify(session).includes(initialPassword));
    assert.ok(!JSON.stringify(session).includes('Training@2026'));
    assert.ok(!Object.keys(session).some(key => /password|secret/i.test(key)));
    delete process.env.PUBLIC_DEMO_ACCOUNTS;
    assert.equal((await (await fetch(base + '/api/session')).json()).training_accounts_visible, false);
    const response = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ username: 'admin', password: initialPassword }),
    });
    assert.equal(response.status, 200, await response.text());
    const uppercaseLogin = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ username: 'AdMiN', password: initialPassword }),
    });
    assert.equal(uppercaseLogin.status, 200, await uppercaseLogin.text());
    const untrustedOrigin = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://other.example', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ username: 'admin', password: initialPassword }),
    });
    assert.equal(untrustedOrigin.status, 403);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await db.close();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
