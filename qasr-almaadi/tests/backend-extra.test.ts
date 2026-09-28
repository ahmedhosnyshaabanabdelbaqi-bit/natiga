import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import { seedDatabase } from "../server/seed.js";

test(
  "order amendments retain earlier executions and milk validation prevents invalid consumption",
  { timeout: 60000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const cookies: Record<string, string> = {};
    async function request(
      role: string,
      path: string,
      body: any,
      expected = 200,
      method = "POST",
    ) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        },
        body: JSON.stringify(body),
      });
      if (response.headers.get("set-cookie"))
        cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
      const result = await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result;
    }
    try {
      for (const role of ["doctor", "nurse", "reception"])
        await request(role, "/api/login", {
          username: role,
          password: "Training@2026",
        });
      await t.test(
        "urgent admission accepts an unidentified mother without fabricated demographics",
        async () => {
          const patient = await request(
            "reception",
            "/api/patients",
            {
              name: "طفل عاجل مجهول البيانات — اختبار",
              sex: "unknown",
              birth_at: new Date(Date.now() - 3600000).toISOString(),
              reason: "دخول عاجل للتوثيق التجريبي",
            },
            201,
          );
          assert.ok(patient.mrn);
          assert.equal(patient.mother_name, null);
          assert.ok(patient.admission_id);
          const persisted = (
            await db.query(
              "SELECT mother_name,birth_weight,gestation_weeks FROM patients WHERE id=$1",
              [patient.id],
            )
          ).rows[0];
          assert.deepEqual(persisted, {
            mother_name: null,
            birth_weight: null,
            gestation_weeks: null,
          });
        },
      );
      await t.test(
        "draft orders are blocked; amendment resets approval and does not rewrite past doses",
        async () => {
          const scheduled = new Date(Date.now() - 60000).toISOString(),
            actual = new Date().toISOString();
          let order = await request(
            "doctor",
            "/api/admissions/admission-1/orders",
            {
              type: "medication",
              name: "دواء اختبار دورة الاعتماد فقط",
              dose: 1,
              unit: "mL",
              route: "oral",
              frequency: "اختبار",
              status: "draft",
              scheduled_at: scheduled,
            },
            201,
          );
          const dose = {
            patient_mrn: "QM-2026-00101",
            scheduled_at: scheduled,
            actual_at: actual,
            quantity: 1,
            unit: "mL",
            idempotency_key: randomUUID(),
          };
          await request(
            "nurse",
            `/api/orders/${order.id}/administer`,
            dose,
            409,
          );
          order = await request(
            "doctor",
            `/api/orders/${order.id}/transition`,
            { status: "approved", version: order.version },
          );
          const execution = await request(
            "nurse",
            `/api/orders/${order.id}/administer`,
            dose,
            201,
          );
          order = await request(
            "doctor",
            `/api/orders/${order.id}`,
            {
              version: order.version,
              dose: 2,
              reason: "تعديل تعليمي بعد أول تنفيذ",
            },
            200,
            "PATCH",
          );
          assert.equal(order.status, "draft");
          assert.equal(order.approved_by, null);
          await request(
            "nurse",
            `/api/orders/${order.id}/administer`,
            {
              ...dose,
              scheduled_at: new Date(Date.now() - 30000).toISOString(),
              quantity: 2,
              idempotency_key: randomUUID(),
            },
            409,
          );
          order = await request(
            "doctor",
            `/api/orders/${order.id}/transition`,
            { status: "approved", version: order.version },
          );
          await request(
            "nurse",
            `/api/orders/${order.id}/administer`,
            { ...dose, quantity: 2, idempotency_key: randomUUID() },
            409,
          );
          const previous = (
            await db.query("SELECT * FROM administrations WHERE id=$1", [
              execution.id,
            ])
          ).rows[0];
          assert.equal(Number(previous.quantity), 1);
          const history = await db.query(
            "SELECT data FROM order_versions WHERE order_id=$1",
            [order.id],
          );
          assert.ok(
            history.rows.some(
              (row) =>
                Number(row.data.dose) === 1 && row.data.status === "approved",
            ),
          );
        },
      );
      await t.test(
        "expired or insufficient milk cannot be consumed, balances remain unchanged",
        async () => {
          const now = Date.now();
          const valid = await request(
            "nurse",
            "/api/admissions/admission-1/milk",
            {
              quantity: 20,
              received_at: new Date(now - 3600000).toISOString(),
              expires_at: new Date(now + 3600000).toISOString(),
              location: "ثلاجة اختبار",
            },
            201,
          );
          const expired = await request(
            "nurse",
            "/api/admissions/admission-1/milk",
            {
              quantity: 20,
              received_at: new Date(now - 7200000).toISOString(),
              expires_at: new Date(now - 3600000).toISOString(),
              location: "ثلاجة اختبار",
            },
            201,
          );
          const feed = {
            type: "breast_milk",
            route: "oral",
            actual_at: new Date(now).toISOString(),
            patient_mrn: "QM-2026-00101",
            quantity: 21,
            milk_id: valid.id,
            idempotency_key: randomUUID(),
          };
          await request(
            "nurse",
            "/api/admissions/admission-1/feedings",
            feed,
            409,
          );
          await request(
            "nurse",
            "/api/admissions/admission-1/feedings",
            {
              ...feed,
              milk_id: expired.id,
              quantity: 5,
              idempotency_key: randomUUID(),
            },
            409,
          );
          const balances = await db.query(
            "SELECT remaining FROM milk WHERE id=ANY($1::text[])",
            [[valid.id, expired.id]],
          );
          assert.ok(balances.rows.every((row) => Number(row.remaining) === 20));
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await db.close();
    }
  },
);
