import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";
test(
  "manual monitor readings bind actual equipment to the correct infant and current bed",
  { timeout: 90000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`,
      cookies: Record<string, string> = {};
    const key = () => randomUUID();
    async function req(
      role: string,
      method: string,
      path: string,
      body?: any,
      status = 200,
    ) {
      if (!cookies[role]) {
        const response = await fetch(origin + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ username: role, password: "Training@2026" }),
        });
        assert.equal(response.status, 200);
        cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
      }
      const response = await fetch(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: cookies[role],
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    }
    let device: any, binding: any, reading: any;
    const mrn = "QM-2026-00101";
    try {
      await t.test(
        "system admin has monitoring access while reception is denied and equipment cannot be stolen",
        async () => {
          const adminPage = await req("admin", "GET", "/api/monitoring");
          assert.equal(adminPage.source, "manual");
          await req("reception", "GET", "/api/monitoring", undefined, 403);
          const page = await req("nurse", "GET", "/api/monitoring");
          assert.equal(page.source, "manual");
          assert.equal(page.admissions.length, 8);
          device = await req(
            "admin",
            "POST",
            "/api/equipment",
            {
              code: "MON-TEST",
              name: "شاشة متابعة اختبار",
              unit: "use",
              idempotency_key: key(),
            },
            201,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-binding",
            {
              equipment_id: device.id,
              confirm_mrn: "WRONG",
              idempotency_key: key(),
            },
            409,
          );
          binding = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-binding",
            {
              equipment_id: device.id,
              confirm_mrn: mrn,
              idempotency_key: key(),
            },
            201,
          );
          assert.equal(binding.admission_id, "admission-1");
          assert.equal(binding.actor_id, "nurse");
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-2/monitor-binding",
            {
              equipment_id: device.id,
              confirm_mrn: "QM-2026-00102",
              idempotency_key: key(),
            },
            409,
          );
        },
      );
      await t.test(
        "readings use server manual source and actor, enforce vitals ranges and persist into patient chart once",
        async () => {
          reading = {
            binding_id: binding.id,
            confirm_mrn: mrn,
            measured_at: new Date().toISOString(),
            temperature: 36.7,
            heart_rate: 135,
            spo2: 97,
            idempotency_key: key(),
          };
          await req(
            "doctor",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            reading,
            403,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            { ...reading, source: "live_device" },
            400,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            { ...reading, actor_id: "doctor" },
            400,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            { ...reading, heart_rate: 351 },
            400,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            {
              ...reading,
              measured_at: new Date(Date.now() + 60000).toISOString(),
            },
            400,
          );
          const saved = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            reading,
            201,
          );
          const retry = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            reading,
            201,
          );
          assert.equal(saved.id, retry.id);
          assert.equal(saved.actor_id, "nurse");
          assert.equal(saved.source, "manual");
          assert.equal(saved.monitor_binding_id, binding.id);
          const page = await req("nurse", "GET", "/api/monitoring");
          const infant = page.admissions.find(
            (a: any) => a.id === "admission-1",
          );
          assert.equal(infant.latest_vitals.id, saved.id);
          assert.equal(infant.latest_vitals.source, "manual");
          assert.ok(infant.latest_vitals.actor_name);
          assert.equal(infant.binding.is_current, true);
          const chart = await req("nurse", "GET", "/api/patients/patient-1");
          assert.equal(
            chart.vitals.filter((v: any) => v.id === saved.id).length,
            1,
          );
        },
      );
      await t.test(
        "bed transfer makes old binding stale; even cached reading retries require rebind",
        async () => {
          const a = await one(
            db,
            "SELECT * FROM admissions WHERE id='admission-1'",
          );
          await req(
            "head_nurse",
            "POST",
            "/api/admissions/admission-1/transfer",
            {
              bed_id: "bed-9",
              reason: "نقل اختبار متابعة",
              version: a!.version,
            },
          );
          const page = await req("nurse", "GET", "/api/monitoring");
          assert.equal(
            page.admissions.find((a: any) => a.id === "admission-1").binding
              .is_current,
            false,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            reading,
            409,
          );
          const rebound = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-binding",
            {
              equipment_id: device.id,
              confirm_mrn: mrn,
              idempotency_key: key(),
            },
            201,
          );
          assert.notEqual(rebound.id, binding.id);
          assert.equal(rebound.bed_id, "bed-9");
          assert.ok(
            (await one(
              db,
              "SELECT ended_at FROM monitor_bindings WHERE id=$1",
              [binding.id],
            ))!.ended_at,
          );
          binding = rebound;
        },
      );
      await t.test(
        "assignment scope and maintenance are rechecked before writes and cached replay",
        async () => {
          await db.query(
            "UPDATE admissions SET doctor_id='manager',nurse_id='manager' WHERE id='admission-1'",
          );
          const page = await req("nurse", "GET", "/api/monitoring");
          assert.ok(!page.admissions.some((a: any) => a.id === "admission-1"));
          assert.ok(
            !page.bindings.some((b: any) => b.admission_id === "admission-1"),
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            reading,
            404,
          );
          await db.query(
            "UPDATE admissions SET doctor_id='doctor',nurse_id='nurse' WHERE id='admission-1'",
          );
          await req("admin", "PATCH", `/api/equipment/${device.id}`, {
            status: "maintenance",
            reason: "صيانة اختبار",
            version: device.version,
            idempotency_key: key(),
          });
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            { ...reading, binding_id: binding.id, idempotency_key: key() },
            409,
          );
        },
      );
      await t.test(
        "closed admissions reject manual readings and explicit unbind frees equipment safely",
        async () => {
          await db.query(
            "UPDATE admissions SET status='discharged' WHERE id='admission-1'",
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-readings",
            { ...reading, binding_id: binding.id, idempotency_key: key() },
            409,
          );
          const ended = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/monitor-unbind",
            {
              binding_id: binding.id,
              confirm_mrn: mrn,
              idempotency_key: key(),
            },
          );
          assert.ok(ended.ended_at);
          assert.equal(ended.ended_by, "nurse");
          assert.equal(
            (await one(
              db,
              "SELECT count(*)::int n FROM monitor_bindings WHERE equipment_id=$1 AND ended_at IS NULL",
              [device.id],
            ))!.n,
            0,
          );
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await db.close();
    }
  },
);
