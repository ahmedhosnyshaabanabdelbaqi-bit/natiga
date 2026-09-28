import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one, all } from "../server/db.js";
import { createApp } from "../server/app.js";

test("clinical tasks stay consistent with recorded care, order resumption and final checkout", { timeout: 90000 }, async (t) => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies: Record<string, string> = {};
  const keyed = (body: Record<string, unknown>) => ({ ...body, idempotency_key: randomUUID() });
  async function req(role: string, method: string, path: string, body?: unknown, expected = 200) {
    if (!cookies[role]) {
      const login = await fetch(origin + "/api/login", {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ username: role, password: "Training@2026" }),
      });
      assert.equal(login.status, 200);
      cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
    }
    const response = await fetch(origin + "/api" + path, {
      method, headers: { Origin: origin, Cookie: cookies[role], "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    return result;
  }
  async function approvedOrder(admissionId: string, scheduled: string) {
    const draft = await req("doctor", "POST", `/admissions/${admissionId}/orders`, keyed({
      type: "medication", name: "Integration medication", dose: 1, unit: "mL", route: "oral", frequency: "once", scheduled_at: scheduled,
    }), 201);
    return req("doctor", "POST", `/orders/${draft.id}/transition`, keyed({ status: "approved", version: draft.version }));
  }
  try {
    await t.test("an order task cannot claim completion without the linked administration and infant identity check", async () => {
      const scheduled = new Date(Date.now() - 60000).toISOString();
      const order = await approvedOrder("admission-1", scheduled);
      const task = await one(db, "SELECT * FROM tasks WHERE order_id=$1 AND status='pending'", [order.id]);
      const queue = await req("nurse", "GET", "/tasks");
      assert.equal(queue.find((row: any) => row.id === task.id).patient_id, "patient-1");
      assert.equal(queue.find((row: any) => row.id === task.id).admission_id, "admission-1");
      await req("nurse", "PATCH", `/tasks/${task.id}`, keyed({ version: task.version, status: "completed" }), 409);
      assert.equal((await one(db, "SELECT status FROM tasks WHERE id=$1", [task.id])).status, "pending");
      assert.equal((await one(db, "SELECT count(*)::int n FROM administrations WHERE order_id=$1", [order.id])).n, 0);
      const dose = keyed({ patient_mrn: "QM-2026-00101", scheduled_at: scheduled, actual_at: new Date().toISOString(), quantity: 1, unit: "mL" });
      await req("nurse", "POST", `/orders/${order.id}/administer`, { ...dose, patient_mrn: "WRONG" }, 409);
      const administered = await req("nurse", "POST", `/orders/${order.id}/administer`, dose, 201);
      assert.equal((await req("nurse", "POST", `/orders/${order.id}/administer`, dose, 201)).id, administered.id);
      assert.equal((await one(db, "SELECT status FROM tasks WHERE id=$1", [task.id])).status, "completed");
      const chart = await req("nurse", "GET", "/patients/patient-1");
      assert.equal(chart.tasks.find((row: any) => row.id === task.id).status, "completed");
      assert.equal(chart.orders.find((row: any) => row.id === order.id).administrations.filter((row: any) => row.id === administered.id).length, 1);
    });

    await t.test("resuming or reapproving an executed schedule does not create an unfulfillable duplicate task", async () => {
      const scheduled = new Date(Date.now() - 60000).toISOString();
      let order = await approvedOrder("admission-2", scheduled);
      await req("nurse", "POST", `/orders/${order.id}/administer`, keyed({ patient_mrn: "QM-2026-00102", scheduled_at: scheduled, actual_at: new Date().toISOString(), quantity: 1, unit: "mL" }), 201);
      order = await req("doctor", "POST", `/orders/${order.id}/transition`, keyed({ status: "suspended", reason: "Review order", version: order.version }));
      order = await req("doctor", "POST", `/orders/${order.id}/transition`, keyed({ status: "approved", version: order.version }));
      assert.equal((await one(db, "SELECT count(*)::int n FROM tasks WHERE order_id=$1 AND status IN ('pending','deferred')", [order.id])).n, 0);
      order = await req("doctor", "PATCH", `/orders/${order.id}`, keyed({ version: order.version, instructions: "Updated instruction", reason: "Clarification after dose" }));
      order = await req("doctor", "POST", `/orders/${order.id}/transition`, keyed({ status: "approved", version: order.version }));
      assert.equal((await one(db, "SELECT count(*)::int n FROM tasks WHERE order_id=$1 AND status IN ('pending','deferred')", [order.id])).n, 0);
      const nextSchedule = new Date(Math.floor(Date.now() / 1000) * 1000 + 60000).toISOString();
      order = await req("doctor", "PATCH", `/orders/${order.id}`, keyed({ version: order.version, scheduled_at: nextSchedule, reason: "Schedule next execution" }));
      await req("doctor", "POST", `/orders/${order.id}/transition`, keyed({ status: "approved", version: order.version }));
      const pending = await all(db, "SELECT * FROM tasks WHERE order_id=$1 AND status='pending'", [order.id]);
      assert.equal(pending.length, 1);
      assert.equal(Date.parse(pending[0].due_at), Date.parse(nextSchedule));
      assert.equal((await one(db, "SELECT count(*)::int n FROM administrations WHERE order_id=$1", [order.id])).n, 1);
    });

    await t.test("checkout closes every pending admission task while preserving general work and pending lab results", async () => {
      const taskBody = { admission_id: "admission-3", title: "Routine infant care", due_at: new Date().toISOString() };
      const pending = await req("nurse", "POST", "/tasks", keyed(taskBody), 201);
      let deferred = await req("nurse", "POST", "/tasks", keyed(taskBody), 201);
      deferred = await req("nurse", "PATCH", `/tasks/${deferred.id}`, keyed({ version: deferred.version, status: "deferred", reason: "Await handover" }));
      let completed = await req("nurse", "POST", "/tasks", keyed(taskBody), 201);
      completed = await req("nurse", "PATCH", `/tasks/${completed.id}`, keyed({ version: completed.version, status: "completed" }));
      const general = await req("head_nurse", "POST", "/tasks", keyed({ title: "Department stock check", due_at: taskBody.due_at }), 201);
      const order = await approvedOrder("admission-3", taskBody.due_at);
      let lab = await req("doctor", "POST", "/admissions/admission-3/labs", keyed({ name: "Pending checkout sample" }), 201);
      for (const status of ["collected", "received"]) lab = await req("lab", "POST", `/labs/${lab.id}/transition`, keyed({ version: lab.version, status }));
      const bill = await req("accountant", "GET", "/billing/admissions/admission-3");
      if (bill.totals.patient_due > 0) await req("accountant", "POST", "/admissions/admission-3/payments", keyed({ amount: bill.totals.patient_due, method: "cash" }), 201);
      const checkout = await req("reception", "POST", "/admissions/admission-3/checkout-request", keyed({ notes: "End-to-end checkout" }), 201);
      const finalBody = keyed({ version: checkout.version, patient_mrn: bill.admission.mrn, recipient: "Verified guardian" });
      const final = await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finalBody);
      assert.equal((await req("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, finalBody)).id, final.id);
      for (const task of [pending, deferred]) {
        const after = await one(db, "SELECT * FROM tasks WHERE id=$1", [task.id]);
        assert.equal(after.status, "cancelled");
        assert.equal(after.version, task.version + 1);
      }
      assert.equal((await one(db, "SELECT status FROM tasks WHERE id=$1", [completed.id])).status, "completed");
      assert.equal((await one(db, "SELECT status FROM tasks WHERE id=$1", [general.id])).status, "pending");
      assert.equal((await one(db, "SELECT status FROM tasks WHERE order_id=$1", [order.id])).status, "cancelled");
      assert.equal((await one(db, "SELECT status FROM labs WHERE id=$1", [lab.id])).status, "received");
      lab = await req("lab", "POST", `/labs/${lab.id}/transition`, keyed({ version: lab.version, status: "resulted", result: "Verified result", critical: true }));
      lab = await req("doctor", "POST", `/labs/${lab.id}/transition`, keyed({ version: lab.version, status: "reviewed" }));
      assert.equal(lab.status, "reviewed");
      const chart = await req("doctor", "GET", "/patients/patient-3");
      assert.equal(chart.admission.status, "discharged");
      assert.equal(chart.labs.find((row: any) => row.id === lab.id).status, "reviewed");
      assert.equal(chart.tasks.filter((row: any) => ["pending", "deferred"].includes(row.status)).length, 0);
      await req("nurse", "POST", "/tasks", keyed(taskBody), 409);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }
});
