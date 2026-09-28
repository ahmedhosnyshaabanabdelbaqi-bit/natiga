import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDb, one } from '../server/db.js';
import { createApp } from '../server/app.js';

test('maintenance lifecycle, role boundaries and atomic operating expenses', { timeout: 120000 }, async t => {
  delete process.env.DATABASE_URL;
  const db = await initDb(':memory:'), app = await createApp(db, { seed: true });
  await db.query('DELETE FROM payments');
  await db.query("UPDATE money_accounts SET opening_balance=100 WHERE id='cash'");
  await db.query("INSERT INTO equipment(id,code,name,unit,status,created_by) VALUES('test-device','MT-001','Synthetic warmer','use','ready','admin')");
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`, cookies: Record<string, string> = {};
  const key = (body: any) => ({ ...body, idempotency_key: randomUUID() });
  const request = async (role: string, path: string, body?: any, expected = 200, method = body ? 'POST' : 'GET', lang = 'en') => {
    const response = await fetch(base + '/api' + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', 'Accept-Language': lang, ...(cookies[role] ? { Cookie: cookies[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value;
  };
  const future = new Date(Date.now() + 86400000).toISOString();
  let job: any, bank: any;
  try {
    for (const role of ['maintenance', 'head_nurse', 'accountant', 'reception', 'nurse', 'doctor', 'admin']) {
      const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: role, password: 'Training@2026' }) });
      assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie')!.split(';')[0];
    }
    await t.test('read and write permissions separate technician and accountant access without clinical records', async () => {
      await request('anonymous', '/maintenance', undefined, 401);
      for (const role of ['reception', 'nurse']) await request(role, '/maintenance', undefined, 403);
      const list = await request('maintenance', '/maintenance');
      assert.equal(list.can_manage, true); assert.equal(list.can_pay, false);
      assert.ok(!JSON.stringify(list).includes('patient_id')); assert.ok(!JSON.stringify(list).includes('patient_name'));
      assert.ok(list.assets.every((asset: any) => !('unit_price' in asset)));
      const accounts = await request('accountant', '/maintenance'); assert.equal(accounts.can_manage, false); assert.equal(accounts.can_pay, true);
      await request('accountant', '/maintenance', key({ bed_id: 'bed-9', title: 'Forbidden', due_at: future }), 403);
      await request('maintenance', '/maintenance/expenses', undefined, 403);
      await db.query(`UPDATE roles SET permissions=permissions || '"billing.read"'::jsonb || '"billing.write"'::jsonb WHERE name='doctor'`);
      await request('doctor', '/maintenance', undefined, 403);
    });
    await t.test('future scheduling is idempotent and leaves equipment ready', async () => {
      const body = key({ equipment_id: 'test-device', title: 'Scheduled calibration', due_at: future, assigned_to: 'maintenance' });
      job = await request('maintenance', '/maintenance', body, 201);
      assert.equal((await request('maintenance', '/maintenance', body, 201)).id, job.id);
      assert.equal(job.status, 'planned');
      assert.equal((await one(db, "SELECT status FROM equipment WHERE id='test-device'")).status, 'ready');
      await request('maintenance', '/maintenance', key({ ...body, equipment_id: 'test-device', bed_id: 'bed-9' }), 400);
      await request('maintenance', '/maintenance', key({ equipment_id: 'test-device', title: 'Invalid assignee', due_at: future, assigned_to: 'reception' }), 400);
      await request('maintenance', '/maintenance', key({ equipment_id: 'test-device', title: 'Injected cost', due_at: future, expense_total: 1 }), 400);
    });
    await t.test('starting maintenance atomically changes availability and blocks another active job', async () => {
      const body = key({ version: job.version, status: 'in_progress' });
      job = await request('maintenance', `/maintenance/${job.id}`, body, 200, 'PATCH');
      assert.equal((await request('maintenance', `/maintenance/${job.id}`, body, 200, 'PATCH')).version, job.version);
      assert.equal((await one(db, "SELECT status FROM equipment WHERE id='test-device'")).status, 'maintenance');
      await request('admin', '/equipment/test-device', key({ version: 2, status: 'ready', reason: 'Attempt to bypass verified completion' }), 409, 'PATCH');
      const other = await request('head_nurse', '/maintenance', key({ equipment_id: 'test-device', title: 'Concurrent planned job', due_at: future }), 201);
      await request('head_nurse', `/maintenance/${other.id}`, key({ version: 1, status: 'in_progress' }), 409, 'PATCH');
      await request('maintenance', `/maintenance/${job.id}`, key({ version: 1, notes: 'Stale edit' }), 409, 'PATCH');
      assert.equal((await one(db, 'SELECT status FROM maintenance_jobs WHERE id=$1', [other.id])).status, 'planned');
    });
    await t.test('occupied, reserved and inconsistently available occupied beds cannot start maintenance', async () => {
      for (const bed of ['bed-1', 'bed-13']) {
        const item = await request('maintenance', '/maintenance', key({ bed_id: bed, title: 'Unsafe start attempt', due_at: future }), 201);
        const error = await request('maintenance', `/maintenance/${item.id}`, key({ version: 1, status: 'in_progress' }), 409, 'PATCH');
        assert.match(error.error, /occupied or reserved/i);
      }
      await db.query("UPDATE beds SET status='available' WHERE id='bed-1'");
      const item = await request('maintenance', '/maintenance', key({ bed_id: 'bed-1', title: 'Inconsistent occupancy', due_at: future }), 201);
      await request('maintenance', `/maintenance/${item.id}`, key({ version: 1, status: 'in_progress' }), 409, 'PATCH');
      await db.query("UPDATE beds SET status='occupied' WHERE id='bed-1'");
    });
    await t.test('completion requires explicit readiness verification and is immutable', async () => {
      const missing = await request('maintenance', `/maintenance/${job.id}`, key({ version: job.version, status: 'completed' }), 400, 'PATCH');
      assert.match(missing.error, /verify|verified/i);
      const arabic = await request('maintenance', `/maintenance/${job.id}`, key({ version: job.version, status: 'completed' }), 400, 'PATCH', 'ar');
      assert.match(arabic.error, /[\u0600-\u06ff]/);
      await request('maintenance', `/maintenance/${job.id}`, key({ version: job.version, status: 'completed', restore_ready: true }), 400, 'PATCH');
      job = await request('maintenance', `/maintenance/${job.id}`, key({ version: job.version, status: 'completed', restore_ready: true, verified_note: 'Calibration and electrical safety verified' }), 200, 'PATCH');
      assert.equal(job.status, 'completed'); assert.ok(job.completed_at);
      assert.equal((await one(db, "SELECT status FROM equipment WHERE id='test-device'")).status, 'ready');
      await request('maintenance', `/maintenance/${job.id}`, key({ version: job.version, notes: 'Rewrite closed job' }), 409, 'PATCH');
      let bedJob = await request('maintenance', '/maintenance', key({ bed_id: 'bed-9', title: 'Bed check', due_at: future }), 201);
      await request('maintenance', `/maintenance/${bedJob.id}`, key({ version: 1, status: 'completed', restore_ready: true, verified_note: 'Skipped work' }), 409, 'PATCH');
      bedJob = await request('maintenance', `/maintenance/${bedJob.id}`, key({ version: 1, status: 'in_progress' }), 200, 'PATCH');
      assert.equal((await one(db, "SELECT status FROM beds WHERE id='bed-9'")).status, 'maintenance');
      await request('admin', '/beds/bed-9', key({ version: 2, status: 'available', reason: 'Attempt to bypass verified completion' }), 409, 'PATCH');
      await request('maintenance', `/maintenance/${bedJob.id}`, key({ version: bedJob.version, status: 'completed', restore_ready: true, verified_note: 'Safety confirmed' }), 200, 'PATCH');
      assert.equal((await one(db, "SELECT status FROM beds WHERE id='bed-9'")).status, 'available');
    });
    await t.test('actual expenses debit chosen account, preserve revenue, and cannot be forged or duplicated', async () => {
      const before = await one(db, 'SELECT (SELECT count(*) FROM payments) AS payments,(SELECT sum(amount) FROM charges) AS charges');
      const body = key({ amount: 20.25, method: 'cash', vendor: 'Synthetic maintenance vendor', reference: 'MT-INVOICE-001' });
      await request('maintenance', `/maintenance/${job.id}/expenses`, body, 403);
      const expense = await request('accountant', `/maintenance/${job.id}/expenses`, body, 201);
      assert.equal(expense.actor_id, 'accountant'); assert.equal(expense.money_account_id, 'cash');
      assert.equal((await request('accountant', `/maintenance/${job.id}/expenses`, body, 201)).id, expense.id);
      assert.equal(Number((await request('accountant', '/treasury')).cash_balance), 79.75);
      assert.deepEqual(await one(db, 'SELECT (SELECT count(*) FROM payments) AS payments,(SELECT sum(amount) FROM charges) AS charges'), before);
      assert.ok(await one(db, "SELECT id FROM audit WHERE entity='maintenance_expenses' AND entity_id=$1", [expense.id]));
      await request('accountant', `/maintenance/${job.id}/expenses`, key({ ...body, actor_id: 'admin' }), 400);
      await request('accountant', `/maintenance/${job.id}/expenses`, key({ ...body, amount: .001 }), 400);
      await request('accountant', `/maintenance/${job.id}/expenses`, key({ ...body, method: 'transfer' }), 400);
      bank = await request('accountant', '/treasury/accounts', key({ name: 'Maintenance bank', bank_name: 'Synthetic bank', opening_balance: 15 }), 201);
      await request('accountant', `/maintenance/${job.id}/expenses`, key({ ...body, amount: 16, method: 'transfer', money_account_id: bank.id }), 409);
      await request('accountant', `/maintenance/${job.id}/expenses`, key({ ...body, amount: 10.5, method: 'transfer', money_account_id: bank.id }), 201);
      assert.equal(Number((await request('accountant', '/treasury')).accounts.find((row: any) => row.id === bank.id).balance), 4.5);
      assert.equal((await request('accountant', `/maintenance/${job.id}/expenses`)).length, 2);
      const visible = (await request('maintenance', '/maintenance')).jobs.find((row: any) => row.id === job.id);
      assert.ok(!('expense_total' in visible));
      assert.equal(Number((await request('accountant', '/maintenance')).jobs.find((row: any) => row.id === job.id).expense_total), 30.75);
    });
    await t.test('deposit and maintenance expense share one lock and cannot jointly overdraw cash', async () => {
      const responses = await Promise.all([
        fetch(base + `/api/maintenance/${job.id}/expenses`, { method: 'POST', headers: { Cookie: cookies.accountant, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(key({ amount: 60, method: 'cash', vendor: 'Vendor', reference: 'CONCURRENT-EXPENSE' })) }),
        fetch(base + '/api/treasury/transfers', { method: 'POST', headers: { Cookie: cookies.accountant, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(key({ amount: 60, from_account_id: 'cash', to_account_id: bank.id, reference: 'CONCURRENT-DEPOSIT' })) }),
      ]);
      assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
      assert.equal(Number((await request('accountant', '/treasury')).cash_balance), 19.75);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); }
});
