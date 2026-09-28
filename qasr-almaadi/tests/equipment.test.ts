import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";
test(
  "equipment catalog, charged use snapshots, identity, scope and closed-admission restrictions",
  { timeout: 90000 },
  async () => {
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
    try {
      await req(
        "nurse",
        "POST",
        "/api/equipment",
        {
          code: "DENY",
          name: "غير مخول",
          unit: "hour",
          unit_price: 10,
          idempotency_key: key(),
        },
        403,
      );
      let device = await req(
        "admin",
        "POST",
        "/api/equipment",
        {
          code: "EQ-TEST",
          name: "جهاز اختبار السعر",
          unit: "hour",
          unit_price: 10.5,
          idempotency_key: key(),
        },
        201,
      );
      const body = {
        equipment_id: device.id,
        equipment_version: device.version,
        confirm_mrn: "QM-2026-00101",
        quantity: 2,
        idempotency_key: key(),
      };
      await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        { ...body, confirm_mrn: "WRONG" },
        409,
      );
      await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        { ...body, amount: 0 },
        400,
      );
      const usage = await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        body,
        201,
      );
      const replay = await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        body,
        201,
      );
      assert.equal(usage.id, replay.id);
      assert.equal(Number(usage.amount), 21);
      assert.equal(
        Number(
          (await one(db, "SELECT amount FROM charges WHERE id=$1", [
            usage.charge_id,
          ]))!.amount,
        ),
        21,
      );
      device = await req("admin", "PATCH", `/api/equipment/${device.id}`, {
        unit_price: 20,
        version: device.version,
        idempotency_key: key(),
      });
      await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        { ...body, idempotency_key: key() },
        409,
      );
      assert.equal(
        Number(
          (await one(db, "SELECT unit_price FROM equipment_usage WHERE id=$1", [
            usage.id,
          ]))!.unit_price,
        ),
        10.5,
      );
      device = await req("admin", "PATCH", `/api/equipment/${device.id}`, {
        status: "maintenance",
        reason: "صيانة",
        version: device.version,
        idempotency_key: key(),
      });
      await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        { ...body, equipment_version: device.version, idempotency_key: key() },
        409,
      );
      await db.query(
        "UPDATE admissions SET doctor_id='manager',nurse_id='manager' WHERE id='admission-1'",
      );
      await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        body,
        404,
      );
      const hidden = await req("nurse", "GET", "/api/equipment");
      assert.ok(!hidden.history.some((u: any) => u.id === usage.id));
      await db.query(
        "UPDATE admissions SET doctor_id='doctor',nurse_id='nurse' WHERE id='admission-1'",
      );
      const bill = await req(
        "accountant",
        "GET",
        "/api/billing/admissions/admission-1",
      );
      await req(
        "accountant",
        "POST",
        "/api/admissions/admission-1/payments",
        {
          method: "cash",
          amount: bill.totals.patient_due,
          idempotency_key: key(),
        },
        201,
      );
      await req(
        "doctor",
        "POST",
        "/api/admissions/admission-1/checkout-clearance",
        { idempotency_key: key() },
        201,
      );
      const exit = await req(
        "reception",
        "POST",
        "/api/admissions/admission-1/checkout-request",
        { idempotency_key: key() },
        201,
      );
      const monitor=await req('admin','POST','/api/equipment',{code:'EXIT-MON',name:'شاشة ربط خروج',unit:'use',idempotency_key:key()},201);
      const link=await req('nurse','POST','/api/admissions/admission-1/monitor-binding',{equipment_id:monitor.id,confirm_mrn:body.confirm_mrn,idempotency_key:key()},201);
      await req(
        "accountant",
        "POST",
        `/api/checkout-requests/${exit.id}/finalize`,
        {
          version: exit.version,
          patient_mrn: body.confirm_mrn,
          recipient: "ولي الأمر",
          idempotency_key: key(),
        },
      );
      await req(
        "nurse",
        "POST",
        "/api/admissions/admission-1/equipment",
        { ...body, equipment_version: device.version, idempotency_key: key() },
        409,
      );
      assert.ok((await one(db,'SELECT ended_at FROM monitor_bindings WHERE id=$1',[link.id]))!.ended_at);
      await req('nurse','POST','/api/admissions/admission-1/vitals',{measured_at:new Date().toISOString(),spo2:95,idempotency_key:key()},409);
      await req(
        "accountant",
        "POST",
        "/api/admissions/admission-1/charges",
        { price_id: "price-1", quantity: 1, idempotency_key: key() },
        409,
      );
      assert.equal(
        (await one(
          db,
          "SELECT count(*)::int n FROM equipment_usage WHERE equipment_id=$1",
          [device.id],
        ))!.n,
        1,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await db.close();
    }
  },
);
