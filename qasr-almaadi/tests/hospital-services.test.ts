import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one, all } from "../server/db.js";
import { createApp } from "../server/app.js";
import { insert } from "../server/seed.js";
import { hashPassword } from "../server/security.js";
import { hospitalServicesFor } from "../server/hospital-services.js";
import { accountingJournals } from "../server/accounting.js";
import type { Req } from "../server/context.js";

test("hospital ancillary services link orders, results, pharmacy stock and patient billing", { timeout: 120000 }, async t => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies: Record<string, string> = {};
  const keyed = (body: Record<string, unknown>) => ({ ...body, idempotency_key: randomUUID() });
  async function req(role: string, method: string, path: string, body?: unknown, expected = 200) {
    if (!cookies[role]) {
      const response = await fetch(origin + "/api/login", {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ username: role, password: "Training@2026" }),
      });
      assert.equal(response.status, 200, `login ${role}`);
      cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
    }
    const response = await fetch(origin + "/api" + path, {
      method, headers: { Origin: origin, Cookie: cookies[role], "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
  async function transition(kind: string, row: any, status: string, extra: Record<string, unknown> = {}, expected = 200) {
    return req(status === "reviewed" ? "doctor" : kind === "radiology" ? "radiology-tech" : "surgery-tech", "POST", `/hospital/${kind}/${row.id}/transition`, keyed({ status, version: row.version, ...extra }), expected);
  }
  try {
    // Service-only accounts prove that queues don't depend on billing or dashboard access.
    for (const [role, permissions] of Object.entries({
      "radiology-tech": ["radiology.read", "radiology.write"],
      "surgery-tech": ["surgery.read", "surgery.write"],
      "pharmacy-tech": ["pharmacy.read", "pharmacy.write"],
    })) {
      await db.query("INSERT INTO roles(name,permissions) VALUES($1,$2)", [role, JSON.stringify(permissions)]);
      await insert(db, "users", { id: role, name: role, username: role, role, password_hash: hashPassword("Training@2026") });
    }
    const validFrom = new Date(Date.now() - 86400000).toISOString();
    const price = await insert(db, "prices", { id: randomUUID(), name: "Hospital radiology test", category: "radiology", unit: "service", price: 120, valid_from: validFrom });
    const surgeryPrice = await insert(db, "prices", { id: randomUUID(), name: "Hospital surgery test", category: "surgery", unit: "service", price: 350, valid_from: validFrom });
    let radiology: any;
    await t.test("radiology order, state checks, signed report and clinical review create one invoice line", async () => {
      await req("reception", "GET", "/hospital/radiology", undefined, 403);
      await req("reception", "GET", "/hospital/service-prices", undefined, 403);
      const servicePrices = await req("doctor", "GET", "/hospital/service-prices");
      assert.ok(servicePrices.some((x: any) => x.id === price.id));
      assert.ok(servicePrices.every((x: any) => !x.id.startsWith("consumable-price-")));
      assert.deepEqual(Object.keys(servicePrices[0]).sort(), ["id", "name", "price", "unit", "valid_from"]);
      const body = keyed({ name: "Chest imaging", priority: "urgent", price_id: price.id });
      radiology = await req("doctor", "POST", "/admissions/admission-1/radiology", body, 201);
      assert.equal((await req("doctor", "POST", "/admissions/admission-1/radiology", body, 201)).id, radiology.id);
      await transition("radiology", radiology, "reported", { result: "Cannot report before acquisition" }, 409);
      radiology = await transition("radiology", radiology, "scheduled");
      await transition("radiology", radiology, "performed", { version: radiology.version - 1 }, 409);
      assert.equal((await one(db, "SELECT count(*)::int n FROM charges WHERE source='radiology'")).n, 0);
      const performed = keyed({ status: "performed", version: radiology.version });
      radiology = await req("radiology-tech", "POST", `/hospital/radiology/${radiology.id}/transition`, performed);
      assert.equal((await req("radiology-tech", "POST", `/hospital/radiology/${radiology.id}/transition`, performed)).charge_id, radiology.charge_id);
      assert.ok(radiology.charge_id);
      await transition("radiology", radiology, "cancelled", { reason: "Cannot erase performed evidence" }, 409);
      await transition("radiology", radiology, "reported", {}, 400);
      radiology = await transition("radiology", radiology, "reported", { result: "Documented test report supplied by radiologist." });
      await req("radiology-tech", "POST", `/hospital/radiology/${radiology.id}/transition`, keyed({ status: "reviewed", version: radiology.version }), 403);
      radiology = await transition("radiology", radiology, "reviewed");
      const queue = await req("radiology-tech", "GET", "/hospital/radiology");
      const found = queue.find((x: any) => x.id === radiology.id);
      assert.equal(found.patient_id, "patient-1"); assert.equal(found.mrn, "QM-2026-00101");
      assert.equal(found.reviewed_by, "doctor");
      const bill = await req("accountant", "GET", "/billing/admissions/admission-1");
      assert.equal(bill.charges.filter((x: any) => x.id === radiology.charge_id).length, 1);
      assert.equal(Number(bill.charges.find((x: any) => x.id === radiology.charge_id).amount), 120);
      assert.equal((await one(db, "SELECT count(*)::int n FROM hospital_service_events WHERE service_id=$1", [radiology.id])).n, 5);
    });

    await t.test("surgery scheduling prevents overlapping theatre/surgeon and charges only after completion", async () => {
      const start = new Date(Date.now() + 86400000).toISOString();
      const body = keyed({ name: "Test procedure", scheduled_at: start, theatre: "Theatre A", surgeon_id: "doctor", price_id: surgeryPrice.id });
      let row = await req("doctor", "POST", "/admissions/admission-1/surgeries", body, 201);
      assert.equal((await req("doctor", "POST", "/admissions/admission-1/surgeries", body, 201)).id, row.id);
      await req("doctor", "POST", "/admissions/admission-2/surgeries", keyed({ ...body, theatre: "Theatre B" }), 409);
      await req("doctor", "POST", "/admissions/admission-2/surgeries", keyed({ ...body, surgeon_id: "manager" }), 409);
      await transition("surgeries", row, "completed", { result: "Premature completion" }, 409);
      row = await transition("surgeries", row, "in_progress");
      await transition("surgeries", row, "cancelled", { reason: "Cannot remove active operation" }, 409);
      await transition("surgeries", row, "completed", {}, 400);
      row = await transition("surgeries", row, "completed", { result: "Operation documentation by surgical team." });
      assert.ok(row.charge_id);
      row = await transition("surgeries", row, "reviewed");
      const queue = await req("surgery-tech", "GET", "/hospital/surgeries");
      assert.equal(queue.find((x: any) => x.id === row.id).patient_id, "patient-1");
      assert.equal((await one(db, "SELECT amount FROM charges WHERE id=$1", [row.charge_id])).amount, "350");
    });

    await t.test("a separately assigned surgeon can treat only assigned surgical encounters and cancellation revokes access", async () => {
      await insert(db, "users", { id: "second-surgeon", name: "Second surgeon", username: "second-surgeon", role: "doctor", password_hash: hashPassword("Training@2026") });
      await req("second-surgeon", "GET", "/patients/patient-1?admission_id=admission-1", undefined, 404);
      const body = { name: "Care team surgery", scheduled_at: new Date(Date.now() + 10 * 86400000).toISOString(), theatre: "Care team theatre", surgeon_id: "second-surgeon" };
      let operation = await req("doctor", "POST", "/admissions/admission-1/surgeries", keyed(body), 201);
      const chart = await req("second-surgeon", "GET", "/patients/patient-1?admission_id=admission-1");
      assert.equal(chart.admission.id, "admission-1");
      assert.ok(chart.surgeries.some((x: any) => x.id === operation.id));
      const queue = await req("second-surgeon", "GET", "/hospital/surgeries");
      assert.ok(queue.some((x: any) => x.id === operation.id));
      assert.ok(queue.every((x: any) => x.admission_id === "admission-1"));
      await req("second-surgeon", "GET", "/patients/patient-2?admission_id=admission-2", undefined, 404);
      await req("second-surgeon", "POST", "/admissions/admission-2/radiology", keyed({ name: "Unassigned case" }), 404);
      await req("second-surgeon", "POST", "/admissions/admission-1/radiology", keyed({ name: "Surgical team imaging" }), 201);
      operation = await req("second-surgeon", "POST", `/hospital/surgeries/${operation.id}/transition`, keyed({ status: "in_progress", version: operation.version }));
      operation = await req("second-surgeon", "POST", `/hospital/surgeries/${operation.id}/transition`, keyed({ status: "completed", version: operation.version, result: "Assigned operating surgeon documented the procedure." }));
      assert.equal(operation.completed_by, "second-surgeon");

      let cancelled = await req("doctor", "POST", "/admissions/admission-4/surgeries", keyed({ ...body, scheduled_at: new Date(Date.now() + 11 * 86400000).toISOString() }), 201);
      await req("second-surgeon", "GET", "/patients/patient-4?admission_id=admission-4");
      const imaging = keyed({ name: "Preoperative imaging on subsequently cancelled case" });
      await req("second-surgeon", "POST", "/admissions/admission-4/radiology", imaging, 201);
      cancelled = await req("second-surgeon", "POST", `/hospital/surgeries/${cancelled.id}/transition`, keyed({ status: "cancelled", version: cancelled.version, reason: "Operating team no longer assigned" }));
      assert.equal(cancelled.status, "cancelled");
      await req("second-surgeon", "GET", "/patients/patient-4?admission_id=admission-4", undefined, 404);
      await req("second-surgeon", "POST", "/admissions/admission-4/radiology", imaging, 404);
      const patients = await req("second-surgeon", "GET", "/patients");
      assert.deepEqual(patients.map((x: any) => x.id), ["patient-1"]);
    });

    await t.test("pharmacy verifies patient, approved prescription, exact medication and stock version atomically", async () => {
      const name = "Hospital test medication";
      const draft = await req("doctor", "POST", "/admissions/admission-1/orders", keyed({ type: "medication", name, dose: 1, unit: "mL", route: "oral", frequency: "once" }), 201);
      const item = await insert(db, "inventory", { id: randomUUID(), name, unit: "bottle", batch: "B-001", expires_at: "2099-01-01", quantity: 10, cost: 4, location: "Pharmacy" });
      const medPrice = await insert(db, "prices", { id: randomUUID(), name, category: "pharmacy", unit: "bottle", price: 7.5, valid_from: validFrom });
      const baseBody = { order_id: draft.id, order_version: draft.version, item_id: item.id, item_version: item.version, quantity: 2, price_id: medPrice.id, patient_mrn: "QM-2026-00101" };
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", keyed(baseBody), 409);
      const order = await req("doctor", "POST", `/orders/${draft.id}/transition`, keyed({ status: "approved", version: draft.version }));
      const body = keyed({ ...baseBody, order_version: order.version });
      await req("reception", "POST", "/hospital/pharmacy/dispense", body, 403);
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", { ...body, patient_mrn: "WRONG" }, 409);
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", { ...body, quantity: 11 }, 409);
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", { ...body, item_version: 99 }, 409);
      const other = await insert(db, "inventory", { id: randomUUID(), name: "Unprescribed medication", unit: "bottle", batch: "B-001", expires_at: "2099-01-01", quantity: 10, cost: 4, location: "Pharmacy" });
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", { ...body, item_id: other.id }, 409);
      const expired = await insert(db, "inventory", { id: randomUUID(), name, unit: "bottle", batch: "EXPIRED", expires_at: "2000-01-01", quantity: 10, cost: 4, location: "Pharmacy" });
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", { ...body, item_id: expired.id }, 409);
      const dispensed = await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", body, 201);
      assert.equal((await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", body, 201)).id, dispensed.id);
      assert.equal(Number((await one(db, "SELECT quantity FROM inventory WHERE id=$1", [item.id])).quantity), 8);
      const move = await one(db, "SELECT * FROM stock_movements WHERE id=$1", [dispensed.movement_id]);
      assert.equal(move.admission_id, "admission-1"); assert.equal(Number(move.cost_snapshot), 4);
      assert.equal(Number((await one(db, "SELECT amount FROM charges WHERE id=$1", [dispensed.charge_id])).amount), 15);
      assert.equal(dispensed.order_snapshot.dose, "1");
      const queue = await req("pharmacy-tech", "GET", "/hospital/pharmacy");
      assert.equal(Number(queue.orders.find((x: any) => x.id === order.id).quantity_dispensed), 2);
      assert.equal(queue.dispensations.find((x: any) => x.id === dispensed.id).patient_id, "patient-1");
      assert.equal(queue.inventory.some((x: any) => x.id === expired.id), false);
      assert.equal(queue.inventory.find((x: any) => x.id === item.id).cost, undefined);
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", keyed({ ...body }), 409);
      assert.equal((await one(db, "SELECT count(*)::int n FROM pharmacy_dispenses WHERE order_id=$1", [order.id])).n, 1);
      const journals = await accountingJournals(db, "2000-01-01", "2099-12-31");
      assert.ok(journals.find(x => x.source_id === dispensed.charge_id));
      assert.ok(journals.find(x => x.source_id === move.id)?.lines.some(x => x.account === "inventory" && x.credit === 8));
    });

    await t.test("closed accounting period blocks fresh stock and billing but permits result followup and safe replay", async () => {
      let row = await req("doctor", "POST", "/admissions/admission-2/radiology", keyed({ name: "Period guard test", price_id: price.id }), 201);
      row = await transition("radiology", row, "scheduled");
      const month = (await one(db, "SELECT to_char(now() AT TIME ZONE 'Africa/Cairo','YYYY-MM') AS month")).month;
      const period = await insert(db, "accounting_periods", { id: randomUUID(), month, status: "closed", closed_by: "manager" });
      const before = (await one(db, "SELECT count(*)::int n FROM charges")).n;
      await transition("radiology", row, "performed", {}, 409);
      assert.equal((await one(db, "SELECT count(*)::int n FROM charges")).n, before);
      assert.equal((await one(db, "SELECT status FROM hospital_radiology WHERE id=$1", [row.id])).status, "scheduled");
      // No price means no financial posting; follow-up reports remain available.
      let unpriced = await req("doctor", "POST", "/admissions/admission-2/radiology", keyed({ name: "Followup report" }), 201);
      unpriced = await transition("radiology", unpriced, "scheduled");
      unpriced = await transition("radiology", unpriced, "performed");
      unpriced = await transition("radiology", unpriced, "reported", { result: "Documented follow-up result." });
      assert.equal(unpriced.status, "reported");
      const dispense = await one(db, "SELECT d.*,i.version item_version FROM pharmacy_dispenses d JOIN inventory i ON i.id=d.item_id LIMIT 1");
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", keyed({ order_id: dispense.order_id, order_version: dispense.order_version, item_id: dispense.item_id, item_version: dispense.item_version, quantity: 1, patient_mrn: "QM-2026-00101" }), 409);
      const cached = await one(db, "SELECT * FROM idempotency WHERE response->>'id'=$1", [dispense.id]);
      const original = { order_id: dispense.order_id, order_version: dispense.order_version, item_id: dispense.item_id, item_version: 1, quantity: 2, price_id: (await one(db, "SELECT price_id FROM charges WHERE id=$1", [dispense.charge_id])).price_id, patient_mrn: "QM-2026-00101", idempotency_key: cached.key };
      assert.equal((await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", original, 201)).id, dispense.id);
      await db.query("UPDATE accounting_periods SET status='open' WHERE id=$1", [period.id]);
    });

    await t.test("discharge blocks surgery in progress, cancels unperformed services and preserves acquired images for reporting", async () => {
      let pending = await req("doctor", "POST", "/admissions/admission-3/radiology", keyed({ name: "Unperformed imaging" }), 201);
      pending = await transition("radiology", pending, "scheduled");
      let performed = await req("doctor", "POST", "/admissions/admission-3/radiology", keyed({ name: "Acquired imaging pending report" }), 201);
      performed = await transition("radiology", performed, "scheduled");
      performed = await transition("radiology", performed, "performed");
      let surgery = await req("doctor", "POST", "/admissions/admission-3/surgeries", keyed({ name: "In progress surgery", scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), theatre: "Discharge theatre", surgeon_id: "doctor" }), 201);
      surgery = await transition("surgeries", surgery, "in_progress");
      const scheduled = await req("doctor", "POST", "/admissions/admission-3/surgeries", keyed({ name: "Unperformed surgery", scheduled_at: new Date(Date.now() + 4 * 86400000).toISOString(), theatre: "Discharge theatre", surgeon_id: "doctor" }), 201);
      const bill = await req("accountant", "GET", "/billing/admissions/admission-3");
      if (bill.totals.patient_due > 0) await req("accountant", "POST", "/admissions/admission-3/payments", keyed({ amount: bill.totals.patient_due, method: "cash" }), 201);
      const checkout = await req("reception", "POST", "/admissions/admission-3/checkout-request", keyed({ notes: "Hospital discharge" }), 201);
      const finish = keyed({ version: checkout.version, patient_mrn: "QM-2026-00103", recipient: "Verified recipient" });
      const rejected = await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finish, 409);
      assert.equal(rejected.code, "CHECKOUT_SURGERY_IN_PROGRESS");
      assert.equal((await one(db, "SELECT status FROM hospital_radiology WHERE id=$1", [pending.id])).status, "scheduled");
      surgery = await transition("surgeries", surgery, "completed", { result: "Documented completion before discharge." });
      await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finish);
      assert.equal((await one(db, "SELECT status FROM hospital_radiology WHERE id=$1", [pending.id])).status, "cancelled");
      assert.equal((await one(db, "SELECT status FROM hospital_surgeries WHERE id=$1", [scheduled.id])).status, "cancelled");
      assert.equal((await one(db, "SELECT status FROM hospital_radiology WHERE id=$1", [performed.id])).status, "performed");
      performed = await transition("radiology", performed, "reported", { result: "Result delivered after discharge." });
      performed = await transition("radiology", performed, "reviewed");
      assert.equal(performed.status, "reviewed");
      await req("doctor", "POST", "/admissions/admission-3/radiology", keyed({ name: "New order on closed visit" }), 409);
      const dispense = await one(db, "SELECT d.*,i.version item_version FROM pharmacy_dispenses d JOIN inventory i ON i.id=d.item_id LIMIT 1");
      await db.query("UPDATE orders SET admission_id='admission-3' WHERE id=$1", [dispense.order_id]);
      await req("pharmacy-tech", "POST", "/hospital/pharmacy/dispense", keyed({ order_id: dispense.order_id, order_version: dispense.order_version, item_id: dispense.item_id, item_version: dispense.item_version, quantity: 1, patient_mrn: "QM-2026-00103" }), 409);
      await db.query("UPDATE orders SET admission_id='admission-1' WHERE id=$1", [dispense.order_id]);
    });

    await t.test("chart helpers follow clinician assignment and never disclose clinical data to reception", async () => {
      const doctor = { user: { id: "doctor", role: "doctor", permissions: ["clinical.read"] } } as Req;
      const chart = await hospitalServicesFor(db, doctor, "admission-1");
      assert.ok(chart.radiology.some(x => x.id === radiology.id));
      assert.ok(chart.surgeries.length > 0); assert.ok(chart.dispensations.length > 0);
      const reception = { user: { id: "reception", role: "reception", permissions: ["patients.read"] } } as Req;
      assert.deepEqual(await hospitalServicesFor(db, reception, "admission-1"), { radiology: [], surgeries: [], dispensations: [] });
      await db.query("UPDATE admissions SET doctor_id='manager',nurse_id=NULL WHERE id='admission-2'");
      await assert.rejects(hospitalServicesFor(db, doctor, "admission-2"), /خارج نطاق/);
      assert.equal((await all(db, "SELECT id FROM hospital_service_events")).length > 0, true);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
});
