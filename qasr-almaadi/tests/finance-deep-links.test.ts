import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initDb, one } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';
import { createApp } from '../server/app.js';

test('financial postings reconcile stock, purchasing, payroll and closed periods', { timeout: 90000 }, async t => {
  delete process.env.DATABASE_URL;
  const db = await initDb(':memory:');
  await seedDatabase(db);
  const server = (await createApp(db)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const cookies: Record<string, string> = {};
  const key = () => randomUUID();
  let replayConsumption: {body:any;id:string}|undefined;
  async function req(role: string, method: string, path: string, body?: any, status = 200) {
    if (!cookies[role]) {
      const login = await fetch(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: role, password: 'Training@2026' }) });
      assert.equal(login.status, 200);
      cookies[role] = login.headers.get('set-cookie')!.split(';')[0];
    }
    const response = await fetch(origin + '/api' + path, { method, headers: { Origin: origin, Cookie: cookies[role], 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
    return result;
  }
  const ledger = () => req('manager', 'GET', '/accounting?from=2020-01-01&end=2035-12-31');
  const balance = (journals: any[], account: string) => Math.round(journals.flatMap(j => j.lines).filter(l => l.account === account).reduce((sum, l) => sum + l.debit - l.credit, 0) * 100) / 100;
  try {
    await t.test('supplier creation and editing accept the supported zero credit limit', async () => {
      const supplier = await req('manager', 'POST', '/accounting/suppliers', { code: 'ZERO-CREDIT', name: 'مورد بدون حد ائتمان', idempotency_key: key() }, 201);
      assert.equal(Number(supplier.credit_limit), 0);
      const updated = await req('manager', 'PATCH', `/accounting/suppliers/${supplier.id}`, { version: supplier.version, credit_limit: 0, idempotency_key: key() });
      assert.equal(Number(updated.credit_limit), 0);
    });

    await t.test('patient consumption recognizes its stock cost once and preserves invoice revenue on retry', async () => {
      const before = await ledger();
      const mrn = (await one(db, "SELECT mrn FROM patients WHERE id='patient-1'"))!.mrn;
      const body = { consumable_id: 'consumable-1', quantity: 2, patient_mrn: mrn, idempotency_key: key() };
      const consumption = await req('nurse', 'POST', '/admissions/admission-1/consumables', body, 201);
      const replay = await req('nurse', 'POST', '/admissions/admission-1/consumables', body, 201);
      assert.equal(replay.id, consumption.id);
      replayConsumption={body,id:consumption.id};
      const movements = (await db.query('SELECT m.* FROM stock_movements m JOIN consumption_movements cm ON cm.movement_id=m.id WHERE cm.consumption_id=$1', [consumption.id])).rows;
      const cost = movements.reduce((sum, m) => sum + Math.round(Number(m.quantity) * Number(m.cost_snapshot) * 100) / 100, 0);
      assert.ok(cost > 0);
      const after = await ledger();
      for (const movement of movements) assert.equal(after.journals.filter((j: any) => j.id === `stock:${movement.id}`).length, 1);
      assert.equal(balance(after.journals, 'inventory') - balance(before.journals, 'inventory'), -cost);
      assert.equal(balance(after.journals, 'consumables_expense') - balance(before.journals, 'consumables_expense'), cost);
      assert.equal(balance(before.journals, 'revenue') - balance(after.journals, 'revenue'), Number(consumption.amount));
      assert.equal(after.summary.debit, after.summary.credit);
    });

    await t.test('purchase receiving retains earlier and later independent receipts on the same batch', async () => {
      const item = await req('stock', 'POST', '/inventory', { name: 'تشغيلة ربط مشتريات', unit: 'قطعة', batch: 'SHARED-RECEIPT', quantity: 5, cost: 2, expires_at: '2030-01-01', location: 'اختبار التكامل', idempotency_key: key() }, 201);
      const original = (await one(db, 'SELECT id FROM stock_movements WHERE item_id=$1', [item.id]))!.id;
      const before = await ledger();
      const cashBefore = Number((await req('manager', 'GET', '/treasury')).cash_balance);
      let order = await req('reception', 'POST', '/purchase-orders', { lines: [{ consumable_id: item.consumable_id, quantity: 3, stock_section: item.stock_section }], idempotency_key: key() }, 201);
      order = await req('manager', 'POST', `/purchase-orders/${order.id}/approve`, { version: order.version, idempotency_key: key() });
      order = (await req('manager', 'GET', '/purchase-orders')).find((x: any) => x.id === order.id);
      order = await req('manager', 'POST', `/purchase-orders/${order.id}/review-receipt`, { version: order.version, settlement: 'paid', method: 'cash', money_account_id: 'cash', reference: 'SHARED-INVOICE', invoice_date: '2026-09-01', lines: [{ line_id: order.lines[0].id, quantity: 3, unit_cost: 2, batch: item.batch, expires_at: '2030-01-01', location: item.location }], idempotency_key: key() });
      const body = { version: order.version, idempotency_key: key() };
      order = await req('manager', 'POST', `/purchase-orders/${order.id}/receive`, body);
      assert.equal((await req('manager', 'POST', `/purchase-orders/${order.id}/receive`, body)).id, order.id);
      assert.equal(order.lines[0].inventory_id, item.id);
      const later = await req('stock', 'POST', `/inventory/${item.id}/move`, { type: 'receive', quantity: 4, reason: 'رصيد إضافي مستقل', idempotency_key: key() }, 201);
      const after = await ledger();
      assert.equal(after.journals.filter((j: any) => j.id === `stock:${original}`).length, 1);
      assert.equal(after.journals.filter((j: any) => j.id === `stock:${later.id}`).length, 1);
      assert.equal(after.journals.filter((j: any) => j.id === `purchase:${order.id}`).length, 1);
      assert.equal(balance(after.journals, 'inventory') - balance(before.journals, 'inventory'), 14);
      assert.equal(Number((await req('manager', 'GET', '/treasury')).cash_balance), cashBefore - 6);
      assert.equal(Number((await one(db, 'SELECT quantity FROM inventory WHERE id=$1', [item.id]))!.quantity), 12);
      // Recreate the missing link from schema 21 and apply the migration backfill.
      await db.query('UPDATE stock_movements SET purchase_order_line_id=NULL WHERE purchase_order_line_id=$1',[order.lines[0].id]);
      const migration=await readFile(new URL('../server/migrations/022_purchase_stock_link.sql',import.meta.url),'utf8');
      await db.query(migration.slice(migration.indexOf('WITH matches')));
      assert.equal(Number((await one(db,'SELECT count(*) n FROM stock_movements WHERE purchase_order_line_id=$1',[order.lines[0].id]))!.n),1);
      assert.equal((await one(db,'SELECT purchase_order_line_id FROM stock_movements WHERE id=$1',[original]))!.purchase_order_line_id,null);
      assert.equal((await one(db,'SELECT purchase_order_line_id FROM stock_movements WHERE id=$1',[later.id]))!.purchase_order_line_id,null);
      assert.equal(balance((await ledger()).journals,'inventory'),balance(after.journals,'inventory'));
    });

    await t.test('fractional purchase lines reconcile cents with the treasury payment', async () => {
      const catalog = await req('reception', 'GET', '/purchase-orders/catalog');
      const selected = catalog.slice(0, 2);
      assert.equal(selected.length, 2);
      const before = await ledger();
      let order = await req('reception', 'POST', '/purchase-orders', { lines: selected.map((x: any) => ({ consumable_id: x.id, quantity: .5 })), idempotency_key: key() }, 201);
      order = await req('manager', 'POST', `/purchase-orders/${order.id}/approve`, { version: order.version, idempotency_key: key() });
      order = (await req('manager', 'GET', '/purchase-orders')).find((x: any) => x.id === order.id);
      order = await req('manager', 'POST', `/purchase-orders/${order.id}/review-receipt`, { version: order.version, settlement: 'paid', method: 'cash', money_account_id: 'cash', reference: 'CENTS-INVOICE', invoice_date: '2026-09-01', lines: order.lines.map((x: any) => ({ line_id: x.id, quantity: .5, unit_cost: .01, batch: 'CENTS-' + x.id, expires_at: '2030-01-01' })), idempotency_key: key() });
      assert.equal(Number(order.total_amount), .02);
      order = await req('manager', 'POST', `/purchase-orders/${order.id}/receive`, { version: order.version, idempotency_key: key() });
      const after = await ledger();
      const journal = after.journals.find((j: any) => j.id === `purchase:${order.id}`);
      assert.equal(journal.lines.find((x: any) => x.account === 'money').credit, Number(order.total_amount));
      assert.equal(Math.round((balance(before.journals, 'money') - balance(after.journals, 'money')) * 100), 2);
    });

    await t.test('voiding the next-month out punch invalidates the prior payroll and is blocked after approval', async () => {
      const employee = await req('manager', 'POST', '/attendance/employees', { name: 'اختبار ربط حدود الشهر', employee_no: 'MONTH-EDGE', device_pin: 'MONTH-EDGE', monthly_salary: 3000, idempotency_key: key() }, 201);
      await req('manager', 'POST', '/attendance/shifts', { employee_id: employee.id, shift_date: '2025-01-31', start_time: '20:00', end_time: '04:00', idempotency_key: key() }, 201);
      await req('manager', 'POST', '/attendance/punches', { employee_id: employee.id, occurred_at: '2025-01-31T20:00:00+02:00', event: 'in', reason: 'اختبار', idempotency_key: key() }, 201);
      const out = await req('manager', 'POST', '/attendance/punches', { employee_id: employee.id, occurred_at: '2025-02-01T04:00:00+02:00', event: 'out', reason: 'اختبار', idempotency_key: key() }, 201);
      let period = await req('manager', 'POST', '/payroll/preview', { month: '2025-01', idempotency_key: key() }, 201);
      assert.equal(period.issues.length, 0);
      await req('manager', 'POST', `/attendance/punches/${out.id}/void`, { version: out.version, reason: 'تصحيح البصمة', idempotency_key: key() });
      period = await req('manager', 'GET', `/payroll/${period.id}`);
      assert.equal(period.stale, true);
      await req('manager', 'POST', `/payroll/${period.id}/approve`, { version: period.version, idempotency_key: key() }, 409);
      const replacement = await req('manager', 'POST', '/attendance/punches', { employee_id: employee.id, occurred_at: '2025-02-01T04:01:00+02:00', event: 'out', reason: 'البصمة المصححة', idempotency_key: key() }, 201);
      period = await req('manager', 'GET', `/payroll/${period.id}`);
      period = await req('manager', 'POST', `/payroll/${period.id}/recalculate`, { version: period.version, idempotency_key: key() });
      period = await req('manager', 'POST', `/payroll/${period.id}/approve`, { version: period.version, idempotency_key: key() });
      const voided = await req('manager', 'POST', `/attendance/punches/${replacement.id}/void`, { version: replacement.version, reason: 'محاولة تعديل مسير معتمد', idempotency_key: key() }, 409);
      assert.equal(voided.code, 'PAYROLL_LOCKED');
      assert.equal((await one(db, 'SELECT voided FROM attendance_punches WHERE id=$1', [replacement.id]))!.voided, false);
    });
    await t.test('closing a financial period blocks stock and billable use while clinical records stay available', async () => {
      const month = (await one(db,"SELECT to_char(now() AT TIME ZONE 'Africa/Cairo','YYYY-MM') AS month"))!.month;
      const before = await one(db,"SELECT (SELECT sum(quantity) FROM inventory) quantity,(SELECT count(*) FROM stock_movements) movements,(SELECT count(*) FROM charges) charges");
      const mrn = (await one(db,"SELECT mrn FROM patients WHERE id='patient-1'"))!.mrn;
      const closed = await req('manager', 'POST', '/accounting/periods/close', { month, note: 'تثبيت الفترة المالية', idempotency_key: key() }, 201);
      try {
        assert.ok(replayConsumption);
        const replay=await req('nurse','POST','/admissions/admission-1/consumables',replayConsumption.body,201);
        assert.equal(replay.id,replayConsumption.id);
        for (const [role, path, body] of [
          ['stock', '/inventory', {name:'مخزون فترة مقفلة',unit:'قطعة',batch:'CLOSED',quantity:5,cost:2,expires_at:'2030-01-01',location:'اختبار'}],
          ['stock', '/inventory/item-1/move', {type:'issue',quantity:1,reason:'محاولة صرف بعد الإقفال'}],
          ['stock', '/consumables/consumable-1/batches', {batch:'CLOSED',quantity:5,cost:2,expires_at:'2030-01-01',location:'اختبار'}],
          ['nurse', '/admissions/admission-1/consumables', {consumable_id:'consumable-1',quantity:1,patient_mrn:mrn}],
          ['nurse', '/admissions/admission-1/equipment', {equipment_id:'closed-test',quantity:1,confirm_mrn:mrn}],
        ]) {
          const blocked = await req(String(role), 'POST', String(path), { ...(body as object), idempotency_key: key() }, 409);
          assert.equal(blocked.code, 'ACCOUNTING_PERIOD_CLOSED');
        }
        assert.deepEqual(await one(db,"SELECT (SELECT sum(quantity) FROM inventory) quantity,(SELECT count(*) FROM stock_movements) movements,(SELECT count(*) FROM charges) charges"),before);
        await req('nurse', 'GET', '/patients/patient-1');
        await req('nurse', 'POST', '/admissions/admission-1/vitals', { measured_at:new Date().toISOString(),temperature:36.8,weight:2000,heart_rate:130,spo2:98,notes:'قياسات مصطنعة أثناء إقفال الحسابات',idempotency_key:key() },201);
      } finally {
        await req('admin', 'POST', `/accounting/periods/${closed.id}/reopen`, { version: closed.version, note: 'انتهاء اختبار الإقفال', idempotency_key: key() });
      }
    });

    await t.test('manual cash journals affect only their selected account on posting and reversal', async () => {
      const bank = await req('manager', 'POST', '/treasury/accounts', { name: 'اختبار القيد البنكي', bank_name: 'بنك اختبار', opening_balance: 100, idempotency_key: key() }, 201);
      const accounts = (await ledger()).accounts;
      const expense = accounts.find((a: any) => a.system_key === 'maintenance_expense');
      const money = accounts.find((a: any) => a.system_key === 'money');
      const journalBody = { journal_date: '2026-09-01', description: 'مصروف صيانة بقيد بنكي', lines: [{ account_id: expense.id, debit: 60 }, { account_id: money.id, credit: 60, money_account_id: bank.id }], idempotency_key: key() };
      const cashBefore = Number((await req('manager', 'GET', '/treasury')).cash_balance);
      const draft = await req('manager', 'POST', '/accounting/manual-journals', journalBody, 201);
      const bankBalance = async () => Number((await req('manager', 'GET', '/treasury')).accounts.find((a: any) => a.id === bank.id).balance);
      assert.equal(await bankBalance(), 100);
      const posted = await req('admin', 'POST', `/accounting/manual-journals/${draft.id}/approve`, { version: draft.version, idempotency_key: key() });
      assert.equal(await bankBalance(), 40);
      assert.equal(Number((await req('manager', 'GET', '/treasury')).cash_balance), cashBefore);
      const reversalBody = { version: posted.version, reason: 'عكس القيد للاختبار', idempotency_key: key() };
      const reversal = await req('admin', 'POST', `/accounting/manual-journals/${posted.id}/reverse`, reversalBody, 201);
      assert.equal((await req('admin', 'POST', `/accounting/manual-journals/${posted.id}/reverse`, reversalBody, 201)).id, reversal.id);
      assert.equal(await bankBalance(), 100);
      const excessive = await req('manager', 'POST', '/accounting/manual-journals', { ...journalBody, lines: [{ account_id: expense.id, debit: 150 }, { account_id: money.id, credit: 150, money_account_id: bank.id }], idempotency_key: key() }, 201);
      const rejected = await req('admin', 'POST', `/accounting/manual-journals/${excessive.id}/approve`, { version: excessive.version, idempotency_key: key() }, 409);
      assert.equal(rejected.code, 'MONEY_INSUFFICIENT');
      assert.equal(await bankBalance(), 100);
      await req('manager', 'POST', '/accounting/manual-journals', { ...journalBody, lines: [{ account_id: expense.id, debit: 1 }, { account_id: money.id, credit: 1 }], idempotency_key: key() }, 400);
      const equity = accounts.find((a: any) => a.system_key === 'equity');
      const depositDraft = await req('manager', 'POST', '/accounting/manual-journals', { journal_date:'2026-09-01',description:'تمويل بنكي للاختبار',lines:[{account_id:money.id,money_account_id:bank.id,debit:150},{account_id:equity.id,credit:150}],idempotency_key:key() },201);
      const deposit = await req('admin','POST',`/accounting/manual-journals/${depositDraft.id}/approve`,{version:depositDraft.version,idempotency_key:key()});
      const expenseDraft = await req('manager','POST','/accounting/manual-journals',{...journalBody,lines:[{account_id:expense.id,debit:240},{account_id:money.id,money_account_id:bank.id,credit:240}],idempotency_key:key()},201);
      await req('admin','POST',`/accounting/manual-journals/${expenseDraft.id}/approve`,{version:expenseDraft.version,idempotency_key:key()});
      assert.equal(await bankBalance(),10);
      const blockedReverse = await req('admin','POST',`/accounting/manual-journals/${deposit.id}/reverse`,{version:deposit.version,reason:'عكس تمويل تم إنفاقه',idempotency_key:key()},409);
      assert.equal(blockedReverse.code,'MONEY_INSUFFICIENT');
      assert.equal(await bankBalance(),10);
      assert.equal((await one(db,'SELECT status FROM manual_journals WHERE id=$1',[deposit.id]))!.status,'posted');
      assert.equal(Number((await one(db,'SELECT count(*) n FROM manual_journals WHERE reversal_of=$1',[deposit.id]))!.n),0);
    });

    await t.test('historical cash journals remain explicit and unallocated without inventing a bank balance', async () => {
      const before = await req('manager','GET','/treasury');
      await db.query("INSERT INTO manual_journals(id,journal_no,journal_date,description,status,created_by,approved_by) VALUES('legacy-manual','LEGACY-1','2026-09-01','قيد قديم دون حساب محدد','posted','manager','admin')");
      await db.query("INSERT INTO manual_journal_lines(id,journal_id,account_id,debit,credit) VALUES('legacy-money','legacy-manual','acc-cash',25,0),('legacy-equity','legacy-manual','acc-equity',0,25)");
      const after = await req('manager','GET','/treasury');
      assert.deepEqual(after.accounts.map((a:any)=>[a.id,a.balance]),before.accounts.map((a:any)=>[a.id,a.balance]));
      assert.equal(after.unallocated.manual_journals.line_count,1);
      assert.equal(Number(after.unallocated.manual_journals.total),25);
      assert.equal(Number(after.unallocated.total),Number(before.unallocated.total)+25);
      const statements=await req('manager','GET','/financial-statements?from=2020-01-01&end=2035-12-31');
      const actual=after.accounts.reduce((sum:number,a:any)=>sum+Number(a.balance),0)+Number(after.unallocated.total);
      assert.equal(statements.summary.cash,Math.round(actual*100)/100);
    });
    await t.test('internal cash-to-bank transfers do not inflate statement cash inflows and outflows', async () => {
      const treasury=await req('manager','GET','/treasury');
      const bank=treasury.accounts.find((account:any)=>account.kind==='bank'&&account.active);
      assert.ok(bank);
      const before=await req('manager','GET','/financial-statements?from=2020-01-01&end=2035-12-31');
      await req('manager','POST','/treasury/transfers',{from_account_id:'cash',to_account_id:bank.id,amount:10,reference:'INTERNAL-FLOW-TEST',notes:'تحويل داخلي',idempotency_key:key()},201);
      const after=await req('manager','GET','/financial-statements?from=2020-01-01&end=2035-12-31');
      assert.deepEqual(after.cashflow,before.cashflow);
      assert.equal(after.summary.cash,before.summary.cash);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
});
