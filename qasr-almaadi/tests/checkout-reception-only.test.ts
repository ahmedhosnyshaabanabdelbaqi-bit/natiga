import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { createApp } from "../server/app.js";

test("reception can request checkout and Accounts can finalize it without medical clearance", { timeout: 60000 }, async () => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const app = await createApp(db, { seed: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies: Record<string, string> = {};
  async function request(role: string, method: string, path: string, body?: unknown, expected = 200) {
    if (!cookies[role]) {
      const login = await fetch(base + "/api/login", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ username: role, password: "Training@2026" }),
      });
      assert.equal(login.status, 200);
      cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
    }
    const response = await fetch(base + "/api" + path, {
      method,
      headers: { Origin: base, Cookie: cookies[role], "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  }
  const keyed = (body: Record<string, unknown>) => ({ ...body, idempotency_key: randomUUID() });
  try {
    const bill = await request("accountant", "GET", "/billing/admissions/admission-1");
    if (Number(bill.totals.patient_due) > 0) {
      await request("accountant", "POST", "/admissions/admission-1/payments", keyed({
        amount: bill.totals.patient_due,
        method: "cash",
      }), 201);
    }
    const checkout = await request("reception", "POST", "/admissions/admission-1/checkout-request", keyed({
      notes: "خروج بمعرفة الاستقبال",
    }), 201);
    assert.ok(!(await one(db, "SELECT id FROM checkout_clearances WHERE admission_id='admission-1'")));
    const result = await request("accountant", "POST", `/checkout-requests/${checkout.id}/finalize`, keyed({
      version: checkout.version,
      patient_mrn: bill.admission.mrn,
      recipient: "ولي الأمر",
    }));
    assert.equal(result.status, "finalized");
    assert.equal(result.clearance_id, null);
    assert.equal((await one(db, "SELECT status FROM admissions WHERE id='admission-1'"))!.status, "discharged");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }
});
