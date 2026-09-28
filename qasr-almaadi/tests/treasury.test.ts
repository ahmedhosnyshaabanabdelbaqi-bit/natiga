import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDb, one } from '../server/db.js';
import { createApp } from '../server/app.js';

test('bank ledger conserves money, tracks legacy allocation and serializes cash withdrawals', { timeout: 120000 }, async t => {
  delete process.env.DATABASE_URL;
  const db = await initDb(':memory:');
  const app = await createApp(db, { seed: true });
  await db.query('DELETE FROM payments');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`, cookies: Record<string, string> = {};
  const request = async (role: string, path: string, body?: any, expected = 200) => {
    const response = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { Origin: base, 'Content-Type': 'application/json', 'Accept-Language': 'en', ...(cookies[role] ? { Cookie: cookies[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value;
  };
  const keyed = (body: any) => ({ ...body, idempotency_key: randomUUID() });
  let bank: any, cashPayment: any, bankPayment: any;
  try {
    for (const role of ['accountant', 'nurse', 'doctor']) {
      const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: role, password: 'Training@2026' }) });
      assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie')!.split(';')[0];
    }
    await t.test('permissions prevent patient-scoped roles from department bank data', async () => {
      await request('anonymous', '/treasury', undefined, 401);
      await request('nurse', '/treasury', undefined, 403);
      await db.query(`UPDATE roles SET permissions=permissions || '"billing.read"'::jsonb || '"billing.write"'::jsonb WHERE name='doctor'`);
      await request('doctor', '/treasury', undefined, 403);
      await request('doctor', '/treasury/accounts', keyed({ name: 'Disallowed', bank_name: 'Test bank' }), 403);
    });
    await t.test('bank account creation is precise, audited and idempotent', async () => {
      const body = keyed({ name: 'Operating bank', bank_name: 'Synthetic bank', account_number: 'TEST-001', opening_balance: 250.25 });
      bank = await request('accountant', '/treasury/accounts', body, 201);
      assert.equal((await request('accountant', '/treasury/accounts', body, 201)).id, bank.id);
      await request('accountant', '/treasury/accounts', { ...body, name: 'Changed intent' }, 409);
      assert.equal((await one(db, "SELECT count(*)::int AS count FROM money_accounts WHERE kind='bank'")).count, 1);
      assert.ok(await one(db, "SELECT id FROM audit WHERE entity='money_accounts' AND entity_id=$1", [bank.id]));
      for (const value of [-1, 0.001, 'NaN', '', 1e13]) await request('accountant', '/treasury/accounts', keyed({ name: 'Invalid', bank_name: 'Test', opening_balance: value }), 400);
      await request('accountant', '/treasury/accounts', keyed({ name: 'Invalid', bank_name: 'Test', opening_balance: 0, password: 'never' }), 400);
    });
    await t.test('payments use their account and noncash legacy balances remain explicit', async () => {
      cashPayment = await request('accountant', '/admissions/admission-1/payments', keyed({ amount: 100.50, method: 'cash' }), 201);
      assert.equal(cashPayment.money_account_id, 'cash');
      bankPayment = await request('accountant', '/admissions/admission-1/payments', keyed({ amount: 23.45, method: 'transfer', reference: 'BANK-REFERENCE', money_account_id: bank.id }), 201);
      assert.equal(bankPayment.money_account_id, bank.id);
      await request('accountant', '/admissions/admission-1/payments', keyed({ amount: 3, method: 'cash', money_account_id: bank.id }), 400);
      // Represents pre-ledger electronic collections. It must not inflate the cash balance.
      await db.query("INSERT INTO payments(id,receipt_no,admission_id,amount,method,actor_id) VALUES('legacy-electronic','LEGACY-E','admission-1',25.50,'transfer','accountant')");
      const result = await request('accountant', '/treasury');
      assert.equal(Number(result.cash_balance), 100.50);
      assert.equal(Number(result.accounts.find((row: any) => row.id === bank.id).balance), 273.70);
      assert.equal(Number(result.unallocated.total), 25.50);
      assert.equal(result.unallocated.payment_count, 1);
    });
    await t.test('cash-to-bank deposit preserves collections and does not create revenue', async () => {
      const before = await one(db, 'SELECT count(*)::int AS count,sum(amount) AS amount FROM payments');
      const body = keyed({ from_account_id: 'cash', to_account_id: bank.id, amount: 60.25, reference: 'DEPOSIT-001', notes: 'Synthetic deposit slip' });
      const transfer = await request('accountant', '/treasury/transfers', body, 201);
      assert.equal((await request('accountant', '/treasury/transfers', body, 201)).id, transfer.id);
      const result = await request('accountant', '/treasury');
      assert.equal(Number(result.cash_balance), 40.25);
      assert.equal(Number(result.accounts.find((row: any) => row.id === bank.id).balance), 333.95);
      assert.deepEqual(await one(db, 'SELECT count(*)::int AS count,sum(amount) AS amount FROM payments'), before);
      assert.equal(result.transfers[0].actor_name, 'خالد إبراهيم');
      await request('accountant', '/treasury/transfers', keyed({ from_account_id: bank.id, to_account_id: 'cash', amount: 1, reference: 'Invalid direction' }), 400);
      await request('accountant', '/treasury/transfers', keyed({ from_account_id: 'cash', to_account_id: bank.id, amount: 0.001, reference: 'Invalid fraction' }), 400);
    });
    await t.test('concurrent withdrawals cannot overdraw cash', async () => {
      const responses = await Promise.all([1, 2].map(index => fetch(base + '/api/treasury/transfers', { method: 'POST', headers: { Cookie: cookies.accountant, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(keyed({ from_account_id: 'cash', to_account_id: bank.id, amount: 30, reference: 'CONCURRENT-' + index })) })));
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
      assert.equal(Number((await request('accountant', '/treasury')).cash_balance), 10.25);
    });
    await t.test('refunds use the original account and share cash overdraft protection', async () => {
      await request('accountant', `/payments/${cashPayment.id}/refund`, keyed({ amount: 20, reason: 'Insufficient cash after deposit' }), 409);
      const body = keyed({ amount: 10, reason: 'Cash refund after verified balance' });
      const refund = await request('accountant', `/payments/${cashPayment.id}/refund`, body, 201);
      assert.equal(refund.money_account_id, 'cash');
      assert.equal((await request('accountant', `/payments/${cashPayment.id}/refund`, body, 201)).id, refund.id);
      assert.equal(Number((await request('accountant', '/treasury')).cash_balance), 0.25);
      const bankRefund = await request('accountant', `/payments/${bankPayment.id}/refund`, keyed({ amount: 5.25, reason: 'Bank refund' }), 201);
      assert.equal(bankRefund.money_account_id, bank.id);
      assert.equal(Number((await request('accountant', '/treasury')).accounts.find((row: any) => row.id === bank.id).balance), 358.70);
    });
    await t.test('inactive bank accounts reject new deposits', async () => {
      await db.query('UPDATE money_accounts SET active=false WHERE id=$1', [bank.id]);
      await request('accountant', '/treasury/transfers', keyed({ from_account_id: 'cash', to_account_id: bank.id, amount: .25, reference: 'Inactive destination' }), 404);
      assert.equal(Number((await request('accountant', '/treasury')).cash_balance), .25);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); }
});
