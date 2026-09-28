import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { initDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { englishSystemText, translateError } from '../server/i18n.js';

test('every literal server error has an English catalog entry', async () => {
  const directory = new URL('../server/', import.meta.url);
  const missing = new Set<string>();
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.ts') && name !== 'i18n.ts')) {
    const source = await readFile(new URL(name, directory), 'utf8');
    for (const match of source.matchAll(/(?:new ApiError\(\s*[^,]+,\s*|error:\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
      const message = match[1].slice(1, -1);
      if (/[\u0600-\u06ff]/.test(message) && !englishSystemText[message]) missing.add(`${name}: ${message}`);
    }
    if (name === 'payroll.ts') for (const match of source.matchAll(/(?:message|basis):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
      const message = match[1].slice(1, -1);
      if (/[\u0600-\u06ff]/.test(message) && !englishSystemText[message]) missing.add(`${name}: ${message}`);
    }
  }
  assert.deepEqual([...missing], []);
  assert.equal(translateError('يرجى إدخال اسم المستخدم', 'en'), 'Please enter username.');
  assert.equal(translateError('قيمة الجرعة غير صالحة', 'en'), 'The value for dose is invalid.');
  assert.equal(translateError('تاريخ الميلاد غير صالح', 'en'), 'The date for birth is invalid.');
  assert.equal(translateError('الجنس غير صالح', 'en'), 'The sex is invalid.');
  assert.match(translateError('يوجد ملف محتمل مكرر: QM-TEST-123. راجع الهوية ثم أكد إضافة ملف مستقل', 'en'), /QM-TEST-123/);
  assert.match(translateError('عدد أعمدة CSV غير صحيح في السطر 4', 'en'), /row 4/);
});

test('API errors, reports and all print templates localize without changing patient records', { timeout: 120000 }, async t => {
  delete process.env.DATABASE_URL;
  const db = await initDb(':memory:');
  const server = (await createApp(db, { seed: true })).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const cookies: Record<string, string> = {};
  const request = (role: string, path: string, locale = 'en', body?: unknown, method?: string) => fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'Accept-Language': locale, Origin: base, ...(cookies[role] ? { Cookie: cookies[role] } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    for (const role of ['manager', 'doctor', 'reception', 'lab', 'accountant']) {
      const response = await request(role, '/api/login', 'en', { username: role, password: 'Training@2026' });
      assert.equal(response.status, 200);
      cookies[role] = response.headers.get('set-cookie')!.split(';')[0];
    }
    await t.test('language negotiation, translated errors and stable error codes', async () => {
      const en = await request('anonymous', '/api/patients', 'en-US,en;q=0.8,ar;q=0.5');
      assert.equal(en.status, 401);
      assert.equal(en.headers.get('content-language'), 'en');
      assert.equal((await en.json()).error, 'Please sign in.');
      const ar = await request('anonymous', '/api/patients', 'en;q=0.2,ar-EG;q=0.9');
      assert.equal(ar.headers.get('content-language'), 'ar');
      assert.equal((await ar.json()).error, 'يرجى تسجيل الدخول');
      const fallback = await request('anonymous', '/api/patients', 'fr-FR,en;q=0');
      assert.equal((await fallback.json()).error, 'يرجى تسجيل الدخول');
      const forbidden = await request('reception', '/api/billing');
      assert.equal(forbidden.status, 403);
      assert.deepEqual(await forbidden.json(), { error: 'You do not have permission to perform this action.', code: 'FORBIDDEN' });
      const validation = await request('manager', '/api/patients', 'en', {});
      assert.equal(validation.status, 400);
      assert.equal((await validation.json()).error, 'Please enter patient name.');
      const malformed = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en' }, body: '{' });
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json()).error, 'The request data format is invalid.');
    });
    await t.test('report definitions translate, record strings do not', async () => {
      await db.query("UPDATE patients SET name='الكمية' WHERE id='patient-1'");
      await db.query("UPDATE charges SET name='الحالة' WHERE admission_id='admission-1'");
      await db.query("UPDATE labs SET name='وقت الطلب' WHERE id='lab-1'");
      await db.query("UPDATE admissions SET summary='الرسوم: نص أدخله المستخدم',status='discharged',discharged_at=now() WHERE id='admission-1'");
      const patient = await (await request('manager', '/api/patients/patient-1')).json();
      assert.equal(patient.patient.name, 'الكمية');
      assert.equal(patient.admission.summary, 'الرسوم: نص أدخله المستخدم');
      assert.equal(patient.admission.status, 'discharged');
      await db.query("INSERT INTO audit(id,actor_id,action,entity,entity_id,patient_id,details) VALUES('locale-audit-event','manager','admit','admissions','admission-1','patient-1',$1)", [JSON.stringify({ note: 'الحالة' })]);
      const timeline = await (await request('manager', '/api/patients/patient-1')).json();
      const event = timeline.events.find((row: any) => row.id === 'locale-audit-event');
      assert.equal(event.title, 'Patient admitted · Admission');
      assert.equal(event.action, 'admit');
      assert.equal(event.details.note, 'الحالة');
      const arTimeline = await (await request('manager', '/api/patients/patient-1', 'ar')).json();
      assert.equal(arTimeline.events.find((row: any) => row.id === 'locale-audit-event').title, 'دخول طفل · الإقامة');
      const audit = await (await request('manager', '/api/audit')).json();
      assert.equal(audit.find((row: any) => row.id === 'locale-audit-event').action_label, 'Patient admitted');
      const enReport = await (await request('manager', '/api/reports')).json();
      assert.equal(enReport.period.from, 'Beginning of records');
      assert.match(enReport.definitions.occupancy, /^Current snapshot:/);
      const arReport = await (await request('manager', '/api/reports', 'ar')).json();
      assert.equal(arReport.period.from, 'بداية السجلات');
      assert.match(arReport.definitions.occupancy, /^لقطة حالية:/);
    });
    await t.test('nine templates use English labels and LTR while retaining Arabic entered content', async () => {
      const payment = (await db.query("SELECT id FROM payments WHERE admission_id='admission-1' LIMIT 1")).rows[0];
      const templates: [string, string, string?][] = [
        ['wristband', 'Patient identification wristband'], ['sample', 'Laboratory sample label', 'lab-1'],
        ['milk', 'Breast milk label', 'milk-1'], ['nursing', 'Nursing observation chart'], ['orders', 'Medical orders'],
        ['handover', 'Shift handover'], ['discharge', 'Discharge summary'], ['invoice', 'Admission account statement'], ['receipt', 'Payment receipt', payment.id],
      ];
      for (const [kind, title, id] of templates) {
        const response = await request('manager', `/api/print/${kind}?admission_id=admission-1&lang=en${id ? '&id=' + id : ''}`, 'ar');
        assert.equal(response.status, 200, kind);
        assert.equal(response.headers.get('content-language'), 'en');
        const html = await response.text();
        assert.match(html, /<html lang="en" dir="ltr">/);
        assert.ok(html.includes(title), kind);
        assert.ok(html.includes('الكمية'), 'patient-entered name remains Arabic');
        assert.ok(html.includes(kind === 'wristband' ? 'Print 50×30 mm label' : 'Print / Save PDF'), kind);
        assert.ok(!html.includes('>طباعة / حفظ PDF<'));
        if (kind === 'invoice') { assert.ok(html.includes('<td>الحالة</td>')); assert.ok(html.includes('EGP')); }
        if (kind === 'sample') { assert.ok(html.includes('وقت الطلب')); assert.ok(html.includes('Requested at')); }
        if (kind === 'discharge') assert.ok(html.includes('الرسوم: نص أدخله المستخدم'));
        if (kind === 'orders') assert.ok(html.includes('Approved'));
      }
      const arabic = await request('manager', '/api/print/wristband?admission_id=admission-1&lang=ar', 'en');
      const html = await arabic.text();
      assert.match(html, /<html lang="ar" dir="rtl">/);
      assert.ok(html.includes('سوار تعريف الطفل'));
      assert.equal(arabic.headers.get('content-language'), 'ar');
      const denied = await request('reception', '/api/print/orders?admission_id=admission-1&lang=en', 'ar');
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).code, 'FORBIDDEN');
      assert.equal((await request('lab', '/api/print/sample?admission_id=admission-1&id=lab-1&lang=en')).status, 200);
    });
    await t.test('payroll system issues translate while employee names and issue codes remain unchanged', async () => {
      const created = await request('manager', '/api/attendance/employees', 'en', { name: 'الحالة', employee_no: 'LOCALIZATION-EMPLOYEE', device_pin: 'LOCALIZATION-PIN' });
      assert.equal(created.status, 201);
      const employee = await created.json();
      const preview = await request('manager', '/api/payroll/preview', 'en', { month: '2025-01' });
      assert.equal(preview.status, 201);
      const payroll = await preview.json();
      assert.match(payroll.basis, /^Full monthly salary\./);
      assert.equal(payroll.employees.find((row: any) => row.employee_id === employee.id).name, 'الحالة');
      const issue = payroll.issues.find((row: any) => row.employee_id === employee.id && row.code === 'MISSING_SALARY');
      assert.equal(issue.message, 'The base salary is not set.');
      assert.equal(issue.name, 'الحالة');
      const arabic = await (await request('manager', '/api/payroll/' + payroll.id, 'ar')).json();
      assert.equal(arabic.issues.find((row: any) => row.employee_id === employee.id && row.code === 'MISSING_SALARY').message, 'الراتب الأساسي غير محدد');
      const overview = await (await request('manager', '/api/attendance', 'en')).json();
      assert.match(overview.periods.find((row: any) => row.id === payroll.id).basis, /^Full monthly salary\./);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
});
