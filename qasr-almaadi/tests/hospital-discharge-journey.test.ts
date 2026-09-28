import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initDb, one, all } from "../server/db.js";
import { createApp } from "../server/app.js";
import { insert } from "../server/seed.js";

test("migration 027 backfills financial department snapshots without altering historical amounts", { timeout: 60000 }, async () => {
  const old = new PGlite();
  await old.waitReady;
  try {
    const directory = new URL("../server/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name) && Number(name.split("_")[0]) < 27).sort()) {
      const source = name.startsWith("016_") ? new URL("../server/migration-overrides/016_preserve_existing_data.sql", import.meta.url) : new URL(name, directory);
      await old.exec(await readFile(source, "utf8"));
    }
    await old.exec(`
      INSERT INTO roles(name,permissions) VALUES('doctor','[]') ON CONFLICT DO NOTHING;
      INSERT INTO users(id,name,username,password_hash,role) VALUES('snapshot-user','Synthetic user','snapshot-user','fixture-only','doctor');
      INSERT INTO patients(id,mrn,name,sex,birth_at) VALUES('snapshot-patient','SNAPSHOT-MRN','Synthetic adult','male','1985-01-01');
      INSERT INTO admissions(id,admission_no,patient_id,department_id,encounter_type,admitted_at) VALUES('snapshot-admission','SNAPSHOT-ADM','snapshot-patient','dept-inpatient','inpatient','2026-01-01');
      INSERT INTO hospital_department_movements(id,admission_id,from_department_id,to_department_id,from_encounter_type,to_encounter_type,reason,actor_id,created_at) VALUES
      ('move-1','snapshot-admission','dept-outpatient','dept-emergency','outpatient','emergency','Synthetic transfer','snapshot-user','2026-01-02'),
      ('move-2','snapshot-admission','dept-emergency','dept-inpatient','emergency','inpatient','Synthetic transfer','snapshot-user','2026-01-03');
      INSERT INTO charges(id,admission_id,name,quantity,unit_price,amount,created_at) VALUES
      ('before-transfer','snapshot-admission','Original clinic fee',1,10,10,'2026-01-01'),
      ('during-emergency','snapshot-admission','Emergency fee',1,20,20,'2026-01-02 12:00Z'),
      ('after-ward','snapshot-admission','Ward fee',1,30,30,'2026-01-04');
      INSERT INTO payments(id,receipt_no,admission_id,amount,method,created_at) VALUES('old-payment','OLD-REC','snapshot-admission',5,'cash','2026-01-01 12:00Z');
      INSERT INTO insurance_companies(id,code,name,created_by) VALUES('snapshot-company','SNAPSHOT-COMPANY','Synthetic payer','snapshot-user');
      INSERT INTO insurance_claims(id,admission_id,company_id,company_snapshot,policy_number,amount,actor_id,created_at) VALUES('old-claim','snapshot-admission','snapshot-company','{}','SYNTHETIC-POLICY',10,'snapshot-user','2026-01-02 12:00Z');
      INSERT INTO inventory(id,name,unit,batch,expires_at,quantity,cost) VALUES('snapshot-item','Synthetic item','unit','TEST','2099-01-01',2,1);
      INSERT INTO stock_movements(id,item_id,type,quantity,admission_id,reason,cost_snapshot,created_at) VALUES('old-issue','snapshot-item','issue',1,'snapshot-admission','Synthetic issue',1,'2026-01-04'),('old-receipt','snapshot-item','receive',3,NULL,'Synthetic receipt',1,'2026-01-01');
    `);
    await old.exec(await readFile(new URL("027_hospital_cost_centers.sql", directory), "utf8"));
    const charges = (await old.query<any>("SELECT id,amount,department_id_snapshot FROM charges ORDER BY id")).rows;
    assert.deepEqual(charges.map(x => [x.id, Number(x.amount), x.department_id_snapshot]), [
      ["after-ward", 30, "dept-inpatient"], ["before-transfer", 10, "dept-outpatient"], ["during-emergency", 20, "dept-emergency"],
    ]);
    assert.equal((await old.query<any>("SELECT department_id_snapshot FROM payments WHERE id='old-payment'")).rows[0].department_id_snapshot, "dept-outpatient");
    assert.equal((await old.query<any>("SELECT department_id_snapshot FROM insurance_claims WHERE id='old-claim'")).rows[0].department_id_snapshot, "dept-emergency");
    assert.equal((await old.query<any>("SELECT department_id_snapshot FROM stock_movements WHERE id='old-issue'")).rows[0].department_id_snapshot, "dept-inpatient");
    assert.equal((await old.query<any>("SELECT department_id_snapshot FROM stock_movements WHERE id='old-receipt'")).rows[0].department_id_snapshot, null);
    assert.equal((await old.query<any>("SELECT c.code FROM hospital_departments d JOIN cost_centers c ON c.id=d.cost_center_id WHERE d.id='dept-nicu'")).rows[0].code, "NICU");
    assert.equal((await old.query<any>("SELECT count(*)::int n FROM hospital_departments d JOIN cost_centers c ON c.id=d.cost_center_id")).rows[0].n, 9);
  } finally { await old.close(); }
});

test("adult hospital journey reconciles departments, care, pharmacy, accounts, discharge and a later visit", { timeout: 120000 }, async t => {
  delete process.env.DATABASE_URL;
  delete process.env.UPDATE_ROOT;
  delete process.env.TRAINING_PASSWORD;
  delete process.env.PUBLIC_DEMO_ACCOUNTS;
  const db = await initDb(":memory:");
  const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies: Record<string, string> = {};
  const keyed = (body: Record<string, unknown>) => ({ ...body, idempotency_key: randomUUID() });
  const cents = (value: unknown) => Math.round(Number(value) * 100);
  async function req(role: string, method: string, path: string, body?: unknown, expected = 200) {
    if (!cookies[role]) {
      const login = await fetch(origin + "/api/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: role, password: "Training@2026" }) });
      assert.equal(login.status, 200, `login ${role}`);
      cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
    }
    const response = await fetch(origin + "/api" + path, { method, headers: { Origin: origin, Cookie: cookies[role], "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
  async function once(role: string, path: string, body: Record<string, unknown>, expected = 201) {
    const input = keyed(body), first = await req(role, "POST", path, input, expected), replay = await req(role, "POST", path, input, expected);
    assert.equal(replay.id, first.id, `retry ${path}`);
    return first;
  }
  async function service(kind: string, row: any, status: string, extra: Record<string, unknown> = {}) {
    const role = kind === "radiology" && status !== "reviewed" ? "radiologist" : "ward-doctor";
    return once(role, `/hospital/${kind}/${row.id}/transition`, { status, version: row.version, ...extra }, 200);
  }
  let patient: any, appointment: any, visit: any, bed: any, order: any, task: any, lab: any, imaging: any, operation: any, dispensed: any, checkout: any;
  const prices: Record<string, any> = {};
  let cashBefore = 0;
  const dueTotal = 215150;
  try {
    for (const [id, role] of [["ward-doctor", "doctor"], ["ward-nurse", "nurse"]]) {
      const source = await one(db, "SELECT password_hash FROM users WHERE id=$1", [role]);
      await insert(db, "users", { id, username: id, name: id, role, password_hash: source.password_hash });
    }
    const list = [
      ["consult", "كشف عيادة اختباري", "consultation", 125.25, "خدمة"],
      ["lab", "تحليل رحلة المستشفى", "lab", 80.5, "تحليل"],
      ["radiology", "أشعة رحلة المستشفى", "radiology", 220.75, "فحص"],
      ["pharmacy", "دواء رحلة المستشفى المصطنع", "pharmacy", 12.5, "عبوة"],
      ["surgery", "عملية رحلة المستشفى", "surgery", 1000, "عملية"],
      ["ward", "إقامة قسم داخلي اختباري", "stay", 350, "يوم"],
    ] as const;
    for (const [key, name, category, price, unit] of list) prices[key] = await req("manager", "POST", "/prices", keyed({ name, category, price, unit, valid_from: new Date(Date.now() - 86400000).toISOString() }), 201);
    cashBefore = cents((await req("accountant", "GET", "/treasury")).cash_balance);

    await t.test("adult registration and appointment retries create one identity and one outpatient encounter", async () => {
      patient = await once("reception", "/patients", { name: "مريض بالغ مصطنع لرحلة المستشفى الكاملة", sex: "male", birth_at: "1985-06-15T00:00:00Z", national_id: "SYNTHETIC-HOSPITAL-JOURNEY", phone: "01000000000", registration_only: true, encounter_type: "outpatient", department_id: "dept-outpatient" });
      assert.equal(patient.admission_id, null);
      appointment = await once("reception", "/hospital/appointments", { patient_id: patient.id, doctor_id: "doctor", department_id: "dept-outpatient", scheduled_at: new Date().toISOString(), duration_minutes: 30 });
      appointment = await once("reception", `/hospital/appointments/${appointment.id}/check-in`, { version: appointment.version }, 200);
      visit = appointment.encounter;
      assert.equal(visit.patient_id, patient.id); assert.equal(visit.encounter_type, "outpatient");
      assert.equal((await one(db, "SELECT count(*)::int n FROM admissions WHERE patient_id=$1", [patient.id])).n, 1);
      await once("accountant", `/admissions/${visit.id}/charges`, { price_id: prices.consult.id, quantity: 1 });
      await once("accountant", `/admissions/${visit.id}/payments`, { amount: 100, method: "cash" });
      assert.equal(cents((await req("accountant", "GET", "/treasury")).cash_balance) - cashBefore, 10000);
    });

    await t.test("emergency triage, approved treatment and ward transfer preserve identity while changing care assignment", async () => {
      visit = await once("reception", `/hospital/encounters/${visit.id}/transfer`, { version: visit.version, department_id: "dept-emergency", encounter_type: "emergency", nurse_id: "nurse", reason: "تقييم طوارئ مصطنع" }, 200);
      visit = await once("nurse", `/hospital/encounters/${visit.id}/triage`, { version: visit.version, triage_level: "urgent", notes: "تقييم فرز موثق للاختبار فقط" }, 200);
      const scheduled = new Date(Date.now() - 60000).toISOString();
      order = await once("doctor", `/admissions/${visit.id}/orders`, { type: "medication", name: prices.pharmacy.name, dose: 1, unit: "mL", route: "oral", frequency: "تعليمات اختبار فقط", scheduled_at: scheduled });
      order = await once("doctor", `/orders/${order.id}/transition`, { version: order.version, status: "approved" }, 200);
      task = await one(db, "SELECT * FROM tasks WHERE order_id=$1 AND status='pending'", [order.id]);
      assert.equal(task.assignee_id, "nurse");
      bed = await once("reception", "/beds", { name: "سرير رحلة اختبار المستشفى", room: "قسم اختباري", care_level: "general", department_id: "dept-inpatient", status: "available" });
      visit = await once("reception", `/hospital/encounters/${visit.id}/transfer`, { version: visit.version, department_id: "dept-inpatient", encounter_type: "inpatient", bed_id: bed.id, doctor_id: "ward-doctor", nurse_id: "ward-nurse", reason: "نقل للقسم الداخلي وتسليم فريق الرعاية" }, 200);
      assert.equal((await one(db, "SELECT assignee_id FROM tasks WHERE id=$1", [task.id])).assignee_id, "ward-nurse");
      assert.equal((await one(db, "SELECT status FROM beds WHERE id=$1", [bed.id])).status, "occupied");
      await req("doctor", "GET", `/patients/${patient.id}?admission_id=${visit.id}`, undefined, 404);
      await req("nurse", "POST", `/admissions/${visit.id}/vitals`, keyed({ measured_at: new Date().toISOString(), systolic: 120, diastolic: 80 }), 404);
      const chart = await req("ward-doctor", "GET", `/patients/${patient.id}?admission_id=${visit.id}`);
      assert.equal(chart.orders.find((x: any) => x.id === order.id).admission_id, visit.id);
      const vitals = await once("ward-nurse", `/admissions/${visit.id}/vitals`, { measured_at: new Date().toISOString(), weight: 75000, height_cm: 175, systolic: 120, diastolic: 80, heart_rate: 72, respiratory_rate: 16, spo2: 98, pain_score: 2 });
      assert.equal(Number(vitals.weight), 75000);
      await once("accountant", `/admissions/${visit.id}/charges`, { price_id: prices.ward.id, quantity: 2 });
    });

    await t.test("laboratory, radiology, pharmacy and nursing remain on the same encounter and bill exactly once", async () => {
      lab = await once("ward-doctor", `/admissions/${visit.id}/labs`, { name: prices.lab.name, priority: "urgent" });
      for (const status of ["collected", "received", "resulted", "reviewed"]) lab = await once(status === "reviewed" ? "ward-doctor" : "lab", `/labs/${lab.id}/transition`, { status, version: lab.version, ...(status === "resulted" ? { result: "نتيجة اختبار مدخلة بواسطة المختص", critical: true } : {}) }, 200);
      assert.equal((await one(db, "SELECT count(*)::int n FROM records WHERE kind='alerts' AND data->>'lab_id'=$1 AND status='closed'", [lab.id])).n, 1);
      // Existing laboratory services are charged explicitly from the patient account.
      await once("accountant", `/admissions/${visit.id}/charges`, { price_id: prices.lab.id, quantity: 1 });
      imaging = await once("ward-doctor", `/admissions/${visit.id}/radiology`, { name: prices.radiology.name, priority: "routine", price_id: prices.radiology.id });
      for (const status of ["scheduled", "performed", "reported", "reviewed"]) imaging = await service("radiology", imaging, status, status === "reported" ? { result: "تقرير أشعة مصطنع لاختبار الترابط" } : {});
      const item = await once("stock", "/inventory", { name: prices.pharmacy.name, unit: "عبوة", batch: "SYNTHETIC-JOURNEY", expires_at: "2099-01-01", quantity: 10, min_quantity: 1, cost: 5.25, location: "صيدلية اختبارية" });
      dispensed = await once("pharmacist", "/hospital/pharmacy/dispense", { order_id: order.id, order_version: order.version, item_id: item.id, item_version: item.version, quantity: 2, price_id: prices.pharmacy.id, patient_mrn: patient.mrn });
      assert.equal(Number((await one(db, "SELECT quantity FROM inventory WHERE id=$1", [item.id])).quantity), 8);
      assert.equal(Number((await one(db, "SELECT cost_snapshot FROM stock_movements WHERE id=$1", [dispensed.movement_id])).cost_snapshot), 5.25);
      await req("ward-nurse", "POST", `/orders/${order.id}/administer`, keyed({ patient_mrn: "WRONG-PATIENT", scheduled_at: order.scheduled_at, actual_at: new Date().toISOString(), quantity: 1, unit: "mL" }), 409);
      await once("ward-nurse", `/orders/${order.id}/administer`, { patient_mrn: patient.mrn, scheduled_at: order.scheduled_at, actual_at: new Date().toISOString(), quantity: 1, unit: "mL" });
      assert.equal((await one(db, "SELECT status FROM tasks WHERE id=$1", [task.id])).status, "completed");
      const chart = await req("ward-doctor", "GET", `/patients/${patient.id}?admission_id=${visit.id}`);
      assert.equal(chart.labs.find((x: any) => x.id === lab.id).status, "reviewed");
      assert.equal(chart.radiology.find((x: any) => x.id === imaging.id).status, "reviewed");
      assert.equal(chart.dispensations.find((x: any) => x.id === dispensed.id).admission_id, visit.id);
      assert.equal(chart.orders.find((x: any) => x.id === order.id).administrations.length, 1);
    });

    await t.test("surgery completes the shared bill and exact settlement blocks premature discharge", async () => {
      operation = await once("ward-doctor", `/admissions/${visit.id}/surgeries`, { name: prices.surgery.name, scheduled_at: new Date().toISOString(), theatre: "غرفة عمليات اختبارية", surgeon_id: "ward-doctor", price_id: prices.surgery.id });
      operation = await service("surgeries", operation, "in_progress");
      operation = await service("surgeries", operation, "completed", { result: "توثيق إجراء مصطنع ونتيجته للاختبار" });
      operation = await service("surgeries", operation, "reviewed");
      const bill = await req("accountant", "GET", `/billing/admissions/${visit.id}`);
      assert.equal(bill.charges.length, 6); assert.equal(bill.payments.length, 1);
      assert.equal(cents(bill.totals.charged), dueTotal); assert.equal(cents(bill.totals.paid), 10000);
      assert.equal(cents(bill.totals.patient_due), dueTotal - 10000);
      assert.deepEqual(bill.charges.map((x: any) => x.price_id).sort(), Object.values(prices).map(x => x.id).sort());
      checkout = await once("reception", `/admissions/${visit.id}/checkout-request`, { notes: "طلب إنهاء زيارة الاختبار" });
      const finish = keyed({ version: checkout.version, patient_mrn: patient.mrn, recipient: "المريض البالغ - هوية متحققة للاختبار" });
      const blocked = await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finish, 409);
      assert.equal(blocked.code, "CHECKOUT_PATIENT_BALANCE");
      assert.equal((await one(db, "SELECT status FROM admissions WHERE id=$1", [visit.id])).status, "active");
      await once("ward-doctor", `/admissions/${visit.id}/checkout-clearance`, { version: visit.version, summary: "ملخص خروج اختباري", discharge_type: "routine" });
      await once("accountant", `/admissions/${visit.id}/payments`, { amount: (dueTotal - 10000) / 100, method: "cash" });
      checkout = await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finish);
      assert.equal((await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finish)).id, checkout.id);
      assert.equal(checkout.status, "finalized");
      assert.equal((await one(db, "SELECT status FROM beds WHERE id=$1", [bed.id])).status, "cleaning");
      assert.equal((await one(db, "SELECT status FROM orders WHERE id=$1", [order.id])).status, "stopped");
      assert.equal((await one(db, "SELECT count(*)::int n FROM tasks WHERE admission_id=$1 AND status IN ('pending','deferred')", [visit.id])).n, 0);
      appointment = await once("reception", `/hospital/appointments/${appointment.id}/transition`, { version: appointment.version, status: "completed" }, 200);
      assert.equal(appointment.status, "completed");
      const bedAfter = await one(db, "SELECT * FROM beds WHERE id=$1", [bed.id]);
      await req("reception", "PATCH", `/beds/${bed.id}`, keyed({ version: bedAfter.version, status: "available", reason: "تم التنظيف والتجهيز للاختبار" }));
      assert.equal((await one(db, "SELECT status FROM beds WHERE id=$1", [bed.id])).status, "available");
    });

    await t.test("cash, patient balances and journal entries reconcile without duplicated charges, payment or inventory movement", async () => {
      const bill = await req("accountant", "GET", `/billing/admissions/${visit.id}`);
      assert.equal(bill.charges.length, 6); assert.equal(bill.payments.length, 2);
      assert.equal(cents(bill.totals.charged), dueTotal); assert.equal(cents(bill.totals.paid), dueTotal);
      assert.equal(cents(bill.totals.balance), 0); assert.equal(cents(bill.totals.patient_due), 0);
      assert.equal(cents((await req("accountant", "GET", "/treasury")).cash_balance) - cashBefore, dueTotal);
      const accounting = await req("accountant", "GET", "/accounting?from=2000-01-01&end=2099-12-31");
      const ids = new Set([...bill.charges, ...bill.payments].map((x: any) => x.id));
      const journals = accounting.journals.filter((x: any) => ids.has(x.source_id));
      assert.equal(journals.length, 8);
      for (const journal of journals) assert.equal(journal.lines.reduce((n: number, x: any) => n + cents(x.debit), 0), journal.lines.reduce((n: number, x: any) => n + cents(x.credit), 0));
      const receivable = journals.flatMap((x: any) => x.lines).filter((x: any) => x.account === "patient_receivable");
      assert.equal(receivable.reduce((n: number, x: any) => n + cents(x.debit) - cents(x.credit), 0), 0);
      assert.equal(journals.flatMap((x: any) => x.lines).filter((x: any) => x.account === "money").reduce((n: number, x: any) => n + cents(x.debit) - cents(x.credit), 0), dueTotal);
      const stock = accounting.journals.filter((x: any) => x.source_id === dispensed.movement_id);
      assert.equal(stock.length, 1); assert.ok(stock[0].lines.some((x: any) => x.account === "inventory" && cents(x.credit) === 1050));
      const centers = await all(db, "SELECT d.id,c.code FROM hospital_departments d JOIN cost_centers c ON c.id=d.cost_center_id");
      const outpatientCenter = centers.find(x => x.id === "dept-outpatient")!.code;
      const wardCenter = centers.find(x => x.id === "dept-inpatient")!.code;
      assert.notEqual(outpatientCenter, wardCenter);
      for (const charge of bill.charges) {
        const expectedCenter = charge.price_id === prices.consult.id ? outpatientCenter : wardCenter;
        assert.equal(charge.department_id_snapshot, charge.price_id === prices.consult.id ? "dept-outpatient" : "dept-inpatient");
        const journal = journals.find((x: any) => x.source_id === charge.id);
        assert.ok(journal.lines.every((x: any) => x.cost_center === expectedCenter), "Each charge retains its department at posting time after ward transfer");
      }
      for (const payment of bill.payments) {
        const expectedCenter = cents(payment.amount) === 10000 ? outpatientCenter : wardCenter;
        assert.equal(payment.department_id_snapshot, cents(payment.amount) === 10000 ? "dept-outpatient" : "dept-inpatient");
        const journal = journals.find((x: any) => x.source_id === payment.id);
        assert.equal(journal.lines.find((x: any) => x.account === "patient_receivable").cost_center, expectedCenter);
      }
      assert.ok(stock[0].lines.every((x: any) => x.cost_center === wardCenter));
      assert.equal((await one(db, "SELECT department_id_snapshot FROM stock_movements WHERE id=$1", [dispensed.movement_id])).department_id_snapshot, "dept-inpatient");
      const legacyCharge = await one(db, "SELECT id FROM charges WHERE admission_id='admission-1' LIMIT 1");
      assert.ok(accounting.journals.find((x: any) => x.source_id === legacyCharge.id).lines.every((x: any) => x.cost_center === "NICU"));
      assert.equal((await one(db, "SELECT count(*)::int n FROM pharmacy_dispenses WHERE admission_id=$1", [visit.id])).n, 1);
      assert.equal((await one(db, "SELECT count(*)::int n FROM stock_movements WHERE admission_id=$1 AND type='issue'", [visit.id])).n, 1);
      assert.equal((await one(db, "SELECT count(*)::int n FROM administrations WHERE order_id=$1", [order.id])).n, 1);
    });

    await t.test("a new visit keeps the same patient identity and leaves historical care and settled invoices isolated", async () => {
      const followup = await once("reception", `/patients/${patient.id}/admissions`, { department_id: "dept-outpatient", encounter_type: "outpatient", doctor_id: "ward-doctor", reason: "متابعة في زيارة مستقلة" });
      const nextId = followup.id;
      assert.notEqual(nextId, visit.id); assert.equal(followup.patient_id, patient.id);
      const current = await req("ward-doctor", "GET", `/patients/${patient.id}?admission_id=${nextId}`);
      assert.equal(current.patient.mrn, patient.mrn); assert.equal(current.admission.id, nextId);
      for (const key of ["orders", "labs", "radiology", "surgeries", "dispensations"]) assert.equal(current[key].length, 0, key);
      const newBill = await req("accountant", "GET", `/billing/admissions/${nextId}`);
      assert.equal(newBill.charges.length, 0); assert.equal(newBill.payments.length, 0); assert.equal(cents(newBill.totals.patient_due), 0);
      const historical = await req("ward-doctor", "GET", `/patients/${patient.id}?admission_id=${visit.id}`);
      assert.equal(historical.admission.status, "discharged"); assert.equal(historical.orders[0].id, order.id);
      assert.equal(historical.radiology[0].id, imaging.id); assert.equal(historical.surgeries[0].id, operation.id);
      const oldBill = await req("accountant", "GET", `/billing/admissions/${visit.id}`);
      assert.equal(cents(oldBill.totals.charged), dueTotal); assert.equal(cents(oldBill.totals.paid), dueTotal);
      const timeline = await req("ward-doctor", "GET", `/hospital/patients/${patient.id}/timeline`);
      assert.equal(timeline.events.filter((x: any) => x.kind === "admission").length, 2);
      assert.equal(timeline.events.filter((x: any) => x.kind === "department_transfer").length, 2);
      assert.equal(timeline.events.filter((x: any) => x.kind === "triage").length, 1);
      assert.equal(timeline.events.filter((x: any) => x.kind === "discharge").length, 1);
      assert.equal((await all(db, "SELECT id FROM admissions WHERE patient_id=$1", [patient.id])).length, 2);
    });

    await t.test("new departments receive a real stable cost center and their transactions never rewrite previous visit attribution", async () => {
      const before = (await one(db, "SELECT count(*)::int n FROM cost_centers")).n;
      const department = await once("admin", "/hospital/departments", { name: "عيادة تخصصية مصطنعة", type: "outpatient" });
      const center = await one(db, "SELECT * FROM cost_centers WHERE id=$1", [department.cost_center_id]);
      assert.ok(center); assert.equal(center.name_ar, department.name);
      assert.equal(center.code.length, 20);
      assert.equal((await one(db, "SELECT count(*)::int n FROM cost_centers")).n, before + 1);
      const followup = await one(db, "SELECT * FROM admissions WHERE patient_id=$1 AND status='active'", [patient.id]);
      await once("reception", `/hospital/encounters/${followup.id}/transfer`, { version: followup.version, department_id: department.id, encounter_type: "outpatient", reason: "متابعة في تخصص آخر" }, 200);
      const charged = await once("accountant", `/admissions/${followup.id}/charges`, { price_id: prices.consult.id, quantity: 1 });
      const report = await req("accountant", "GET", "/accounting?from=2000-01-01&end=2099-12-31");
      assert.ok(report.cost_centers.some((x: any) => x.id === center.id));
      assert.ok(report.journals.find((x: any) => x.source_id === charged.id).lines.every((x: any) => x.cost_center === center.code));
      const priorIds = new Set((await all(db, "SELECT id FROM charges WHERE admission_id=$1", [visit.id])).map(x => x.id));
      assert.ok(report.journals.filter((x: any) => priorIds.has(x.source_id)).every((x: any) => x.lines.every((l: any) => l.cost_center !== center.code)));
    });

    await t.test("the posting snapshot overrides an older financial transaction timestamp and survives a later transfer", async () => {
      const current = await one(db, "SELECT * FROM admissions WHERE patient_id=$1 AND status='active'", [patient.id]);
      // PostgreSQL now() retains a transaction's start time even when a posting
      // waits behind another transaction. Reproduce that old timestamp on insert.
      const started = await one(db, "SELECT now() AS at");
      const moved = await once("reception", `/hospital/encounters/${current.id}/transfer`, { version: current.version, department_id: "dept-emergency", encounter_type: "emergency", reason: "نقل قبل إتمام القيد المتأخر" }, 200);
      const charge = await db.transaction(tx => insert(tx, "charges", {
        id: randomUUID(), admission_id: current.id, name: "اختبار توقيت القيد", quantity: 1, unit_price: 1, amount: 1,
        actor_id: "accountant", created_at: started.at, department_id_snapshot: "dept-nicu",
      }));
      assert.equal(charge.department_id_snapshot, "dept-emergency", "The locked INSERT derives the actual posting department and ignores a supplied snapshot");
      const transfer = await one(db, "SELECT created_at FROM hospital_department_movements WHERE admission_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [current.id]);
      assert.ok(new Date(charge.created_at).getTime() <= new Date(transfer.created_at).getTime());
      await once("reception", `/hospital/encounters/${current.id}/transfer`, { version: moved.version, department_id: current.department_id, encounter_type: "outpatient", reason: "تحويل لاحق يجب ألا يغير مركز القيد السابق" }, 200);
      const center = await one(db, "SELECT c.code FROM hospital_departments d JOIN cost_centers c ON c.id=d.cost_center_id WHERE d.id='dept-emergency'");
      const report = await req("accountant", "GET", "/accounting?from=2000-01-01&end=2099-12-31");
      const journal = report.journals.find((x: any) => x.source_id === charge.id);
      assert.ok(journal.lines.every((x: any) => x.cost_center === center.code));
      assert.equal((await one(db, "SELECT department_id_snapshot FROM charges WHERE id=$1", [charge.id])).department_id_snapshot, "dept-emergency");
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
