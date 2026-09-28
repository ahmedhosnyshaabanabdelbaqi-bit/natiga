import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

async function fixture() {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const cookies: Record<string, string> = {};
  async function request(user: string, method: string, path: string, body?: any, expected = 200) {
    if (!cookies[user]) {
      const login = await fetch(base + "/api/login", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ username: user, password: "Training@2026" }) });
      assert.equal(login.status, 200);
      cookies[user] = login.headers.get("set-cookie")!.split(";")[0];
    }
    const response = await fetch(base + "/api" + path, { method, headers: { Origin: base, Cookie: cookies[user], "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json();
    assert.equal(response.status, expected, `${user} ${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
  return { db, request, cookies, async close() { await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); } };
}

test("bed map hides the patient barcode together with all other identity fields outside assignment", async () => {
  const f = await fixture();
  try {
    await f.db.query("UPDATE admissions SET doctor_id='manager',nurse_id='head_nurse' WHERE id='admission-8'");
    for (const user of ["maintenance", "doctor", "nurse"]) {
      const rows = await f.request(user, "GET", "/beds");
      const hidden = rows.find((row: any) => row.id === "bed-8");
      assert.equal(hidden.status, "occupied");
      assert.ok(hidden.barcode_no, "the bed's own barcode remains usable");
      for (const key of ["patient_id", "patient_name", "patient_barcode_no", "mrn", "admission_id", "admitted_at"])
        assert.equal(hidden[key], null, `${user}: ${key} must be hidden`);
    }
    const own = (await f.request("doctor", "GET", "/beds")).find((row: any) => row.id === "bed-1");
    assert.ok(own.patient_barcode_no);
  } finally { await f.close(); }
});

test("a saved response cannot disclose clinical fields after a user's role is reduced", async () => {
  const f = await fixture();
  try {
    const body = { name: "Synthetic role-change infant", birth_at: "2026-09-01", sex: "female", birth_weight: 2200, gestation_weeks: 35, reason: "Integration test", doctor_id: "doctor", nurse_id: "nurse", idempotency_key: randomUUID() };
    const created = await f.request("manager", "POST", "/patients", body, 201);
    assert.equal(Number(created.birth_weight), 2200);
    const users = await f.request("admin", "GET", "/users");
    const manager = users.find((row: any) => row.id === "manager");
    await f.request("admin", "PATCH", "/users/manager", { role: "reception", version: manager.version });
    delete f.cookies.manager;
    await f.request("manager", "POST", "/patients", body, 409);
    const publicCopy = await f.request("manager", "GET", `/patients/${created.id}`);
    assert.equal("birth_weight" in publicCopy.patient, false);
    assert.equal((await f.db.query("SELECT count(*)::int n FROM patients WHERE name=$1", [body.name])).rows[0].n, 1);
  } finally { await f.close(); }
});

test("a cached demographic edit rechecks the clinician's current patient assignment", async () => {
  const f = await fixture();
  try {
    await f.db.query("UPDATE roles SET permissions=permissions || '[\"patients.write\"]'::jsonb WHERE name='doctor'");
    const detail = await f.request("doctor", "GET", "/patients/patient-1");
    const body = { guardian_phone: "01000001111", version: detail.patient.version, idempotency_key: randomUUID() };
    await f.request("doctor", "PATCH", "/patients/patient-1", body);
    await f.db.query("UPDATE admissions SET doctor_id='manager',nurse_id='head_nurse' WHERE patient_id='patient-1'");
    await f.request("doctor", "PATCH", "/patients/patient-1", body, 404);
  } finally { await f.close(); }
});
