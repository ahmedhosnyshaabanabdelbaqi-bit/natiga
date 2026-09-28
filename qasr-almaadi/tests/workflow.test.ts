import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { initDb } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test(
  "complete NICU journey and data-integrity/security acceptance scenarios",
  { timeout: 120000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(
      join(mkdtempSync(join(tmpdir(), "qasr-workflow-")), "db"),
    );
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const cookies: Record<string, string> = {};
    async function request(
      role: string,
      method: string,
      url: string,
      body?: unknown,
      expected = 200,
    ): Promise<any> {
      const response = await fetch(base + url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get("set-cookie"))
        cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
      const value = await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${url}: ${JSON.stringify(value)}`,
      );
      return value;
    }
    async function post(
      role: string,
      url: string,
      body: unknown,
      expected = 200,
    ) {
      return request(role, "POST", url, body, expected);
    }
    try {
      for (const role of [
        "manager",
        "admin",
        "nurse",
        "doctor",
        "reception",
        "accountant",
        "lab",
        "stock",
      ])
        await post(role, "/api/login", {
          username: role,
          password: "Training@2026",
        });
      await t.test("unauthenticated and role restricted access", async () => {
        await request("anonymous", "GET", "/api/patients", undefined, 401);
        await request("reception", "GET", "/api/billing", undefined, 403);
        const foreign = await fetch(base + "/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies.manager,
            Origin: "https://untrusted.example",
          },
          body: JSON.stringify({
            title: "forbidden",
            due_at: new Date().toISOString(),
          }),
        });
        assert.equal(foreign.status, 403);
      });
      const users = await request("manager", "GET", "/api/users");
      const doctor = users.find((u: any) => u.role === "doctor"),
        nurse = users.find((u: any) => u.role === "nurse");
      const beds = await request("manager", "GET", "/api/beds");
      const available = beds.filter((b: any) => b.status === "available");
      assert.ok(available.length >= 3);
      const registration = {
        name: "طفل اختبار رحلة متكاملة",
        sex: "male",
        birth_at: "2026-09-08T06:00:00Z",
        gestation_weeks: 34,
        birth_weight: 1900,
        mother_name: "أم اختبار مصطنعة",
        guardian_name: "ولي أمر اختبار",
        guardian_phone: "01000009999",
        source: "delivery",
        reason: "توثيق تجريبي",
        care_level: "intermediate",
        doctor_id: doctor.id,
        nurse_id: nurse.id,
      };
      let patient: any, detail: any;
      await t.test(
        "registration, duplicate detection and distinct twin identity",
        async () => {
          patient = await post(
            "manager",
            "/api/patients",
            { ...registration, bed_id: available[0].id },
            201,
          );
          detail = await request(
            "manager",
            "GET",
            `/api/patients/${patient.id}`,
          );
          assert.ok(detail.patient.mrn);
          assert.ok(detail.admission.id);
          await post("manager", "/api/patients", registration, 409);
          const twin = await post(
            "manager",
            "/api/patients",
            {
              ...registration,
              name: "طفل اختبار رحلة متكاملة ب",
              twin_label: "B",
              allow_duplicate: true,
            },
            201,
          );
          assert.notEqual(twin.id, patient.id);
          assert.notEqual(twin.mrn, patient.mrn);
        },
      );
      await t.test(
        "atomic concurrent allocation only admits one child per bed",
        async () => {
          const responses = await Promise.all(
            ["أ", "ب"].map((name) =>
              fetch(base + "/api/patients", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: base,
                  Cookie: cookies.manager,
                },
                body: JSON.stringify({
                  ...registration,
                  name: `طفل تنافس ${name}`,
                  mother_name: `أم تنافس ${name}`,
                  bed_id: available[1].id,
                }),
              }),
            ),
          );
          assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
        },
      );
      const aid = detail.admission.id;
      await t.test(
        "optimistic concurrency preserves the first writer",
        async () => {
          await request("manager", "PATCH", `/api/patients/${patient.id}`, {
            version: detail.patient.version,
            name: "طفل الاختبار بعد تحديث الاسم",
          });
          await request(
            "manager",
            "PATCH",
            `/api/patients/${patient.id}`,
            { version: detail.patient.version, name: "تعديل قديم" },
            409,
          );
        },
      );
      let order: any;
      await t.test(
        "medical approval, matching identity, dose replay and order history",
        async () => {
          order = await post(
            "doctor",
            `/api/admissions/${aid}/orders`,
            {
              type: "medication",
              name: "دواء تدريبي بلا استخدام علاجي",
              dose: 1,
              unit: "mL",
              route: "oral",
              frequency: "تعليمات الاختبار",
              instructions: "بيانات مصطنعة",
              status: "draft",
              scheduled_at: new Date().toISOString(),
            },
            201,
          );
          await post(
            "reception",
            `/api/orders/${order.id}/transition`,
            { status: "approved", version: order.version },
            403,
          );
          order = await post("doctor", `/api/orders/${order.id}/transition`, {
            status: "approved",
            version: order.version,
          });
          const dose = {
            patient_mrn: patient.mrn,
            scheduled_at: "2026-09-09T10:00:00Z",
            actual_at: "2026-09-09T10:01:00Z",
            quantity: 1,
            unit: "mL",
            idempotency_key: randomUUID(),
          };
          await post(
            "nurse",
            `/api/orders/${order.id}/administer`,
            { ...dose, patient_mrn: "WRONG" },
            409,
          );
          const first = await post(
            "nurse",
            `/api/orders/${order.id}/administer`,
            dose,
            201,
          );
          const replay = await post(
            "nurse",
            `/api/orders/${order.id}/administer`,
            dose,
            201,
          );
          assert.equal(first.id, replay.id);
          await post(
            "nurse",
            `/api/orders/${order.id}/administer`,
            { ...dose, idempotency_key: randomUUID() },
            409,
          );
          await post("doctor", `/api/orders/${order.id}/transition`, {
            status: "stopped",
            reason: "انتهاء اختبار التنفيذ",
            version: order.version,
          });
          const count = await db.query(
            "SELECT count(*)::int AS n FROM administrations WHERE order_id=$1",
            [order.id],
          );
          assert.equal(count.rows[0].n, 1);
        },
      );
      let lateLab: any;
      await t.test(
        "observations, lab collection/result/review and late-result tracking",
        async () => {
          await post(
            "nurse",
            `/api/admissions/${aid}/vitals`,
            {
              measured_at: new Date().toISOString(),
              temperature: 36.8,
              weight: 2000,
              heart_rate: 130,
              spo2: 98,
              notes: "قياسات اختبار مصطنعة",
            },
            201,
          );
          let lab = await post(
            "doctor",
            `/api/admissions/${aid}/labs`,
            { name: "تحليل اختبار", priority: "routine" },
            201,
          );
          for (const status of ["collected", "received", "resulted"])
            lab = await post("lab", `/api/labs/${lab.id}/transition`, {
              status,
              version: lab.version,
              ...(status === "resulted"
                ? {
                    result: "8",
                    unit: "test-unit",
                    reference_range: "معتمد في بيئة الاختبار",
                  }
                : {}),
            });
          lab = await post("doctor", `/api/labs/${lab.id}/transition`, {
            status: "reviewed",
            version: lab.version,
          });
          assert.equal(lab.status, "reviewed");
          lateLab = await post(
            "doctor",
            `/api/admissions/${aid}/labs`,
            { name: "نتيجة اختبار معلقة بعد الخروج", priority: "routine" },
            201,
          );
        },
      );
      await t.test(
        "milk identity, partial consumption and expiry",
        async () => {
          const now = Date.now();
          const milk = await post(
            "nurse",
            `/api/admissions/${aid}/milk`,
            {
              quantity: 50,
              received_at: new Date(now - 60000).toISOString(),
              expires_at: new Date(now + 86400000).toISOString(),
              location: "ثلاجة التدريب",
            },
            201,
          );
          await post(
            "nurse",
            `/api/admissions/${aid}/feedings`,
            {
              type: "breast_milk",
              route: "oral",
              quantity: 20,
              actual_at: new Date(now).toISOString(),
              patient_mrn: patient.mrn,
              milk_id: milk.id,
              idempotency_key: randomUUID(),
            },
            201,
          );
          const updated = await request(
            "manager",
            "GET",
            `/api/patients/${patient.id}`,
          );
          assert.equal(
            Number(updated.milk.find((m: any) => m.id === milk.id).remaining),
            30,
          );
        },
      );
      await t.test(
        "inventory enforces expiry and balance atomically",
        async () => {
          const item = await post(
            "stock",
            "/api/inventory",
            {
              name: "مستهلك اختبار",
              unit: "قطعة",
              batch: randomUUID(),
              expires_at: "2030-01-01",
              quantity: 5,
              min_quantity: 1,
              cost: 10,
              location: "اختبار",
            },
            201,
          );
          const body = {
            type: "issue",
            quantity: 2,
            reason: "صرف مخزني عام للاختبار دون تحميل حساب طفل",
            idempotency_key: randomUUID(),
          };
          await post("stock", `/api/inventory/${item.id}/move`, body, 201);
          await post("stock", `/api/inventory/${item.id}/move`, body, 201);
          await post(
            "stock",
            `/api/inventory/${item.id}/move`,
            { ...body, quantity: 10, idempotency_key: randomUUID() },
            409,
          );
          const expired = await post(
            "stock",
            "/api/inventory",
            {
              name: "تشغيلة منتهية للاختبار",
              unit: "قطعة",
              batch: randomUUID(),
              expires_at: "2020-01-01",
              quantity: 5,
              min_quantity: 1,
              cost: 1,
              location: "اختبار",
            },
            201,
          );
          await post(
            "stock",
            `/api/inventory/${expired.id}/move`,
            { ...body, idempotency_key: randomUUID() },
            409,
          );
        },
      );
      await t.test(
        "price snapshots, payment retries, refund and cash close",
        async () => {
          const price = await post(
            "manager",
            "/api/prices",
            {
              name: "خدمة اختبار",
              category: "service",
              price: 120,
              unit: "مرة",
              valid_from: "2026-01-01T00:00:00Z",
            },
            201,
          );
          await post(
            "accountant",
            `/api/admissions/${aid}/charges`,
            { price_id: price.id, quantity: 2, idempotency_key: randomUUID() },
            201,
          );
          await post(
            "manager",
            "/api/prices",
            {
              name: "خدمة اختبار",
              category: "service",
              price: 200,
              unit: "مرة",
              valid_from: new Date().toISOString(),
            },
            201,
          );
          const payment = {
            amount: 100,
            method: "cash",
            idempotency_key: randomUUID(),
          };
          const receipt = await post(
            "accountant",
            `/api/admissions/${aid}/payments`,
            payment,
            201,
          );
          const replay = await post(
            "accountant",
            `/api/admissions/${aid}/payments`,
            payment,
            201,
          );
          assert.equal(receipt.id, replay.id);
          await post(
            "accountant",
            `/api/admissions/${aid}/payments`,
            { ...payment, amount: 101 },
            409,
          );
          const bill = await request("accountant", "GET", "/api/billing");
          assert.equal(
            Number(
              bill.charges.find((c: any) => c.price_id === price.id).unit_price,
            ),
            120,
          );
          await post(
            "accountant",
            "/api/billing/close",
            { reason: "إقفال اختبار" },
            201,
          );
          await post(
            "accountant",
            `/api/payments/${receipt.id}/refund`,
            {
              amount: 10,
              reason: "اختبار منع تعديل الفترة المقفلة",
              idempotency_key: randomUUID(),
            },
            409,
          );
        },
      );
      await t.test(
        "handover acknowledged by receiver and bed move retains history",
        async () => {
          const h = await post(
            "doctor",
            `/api/admissions/${aid}/handovers`,
            {
              summary: "تسليم اختبار",
              pending: "نتيجة معلقة",
              receiver_id: nurse.id,
            },
            201,
          );
          await post("nurse", `/api/handovers/${h.id}/acknowledge`, {});
          const current = await request(
            "manager",
            "GET",
            `/api/patients/${patient.id}`,
          );
          await post("manager", `/api/admissions/${aid}/transfer`, {
            bed_id: available[2].id,
            reason: "نقل اختبار",
            version: current.admission.version,
          });
          const bedList = await request("manager", "GET", "/api/beds");
          assert.equal(
            bedList.find((b: any) => b.id === available[0].id).status,
            "cleaning",
          );
        },
      );
      await t.test(
        "discharge preserves unpaid balance and late results; cleaning gates readiness",
        async () => {
          const current = await request(
            "manager",
            "GET",
            `/api/patients/${patient.id}`,
          );
          await post("doctor", `/api/admissions/${aid}/discharge`, {
            summary: "ملخص خروج اختبار مصطنع",
            recipient: "ولي أمر اختبار موثق",
            discharge_type: "routine",
            followup_at: "2026-09-20T10:00:00Z",
            version: current.admission.version,
            idempotency_key: randomUUID(),
          });
          assert.equal((await request('manager','GET',`/api/patients/${patient.id}`)).admission.status,'active');
          const company=await post('manager','/api/insurance-companies',{code:'WORKFLOW-INS',name:'شركة اختبار للخروج',idempotency_key:randomUUID()},201);
          if(current.billing.totals.balance>0)await post('accountant',`/api/admissions/${aid}/insurance-claims`,{company_id:company.id,policy_number:'EXIT-POL',amount:current.billing.totals.balance,idempotency_key:randomUUID()},201);
          const exitRequest=await post('reception',`/api/admissions/${aid}/checkout-request`,{idempotency_key:randomUUID()},201);
          await post('accountant',`/api/checkout-requests/${exitRequest.id}/finalize`,{version:exitRequest.version,patient_mrn:patient.mrn,recipient:'ولي أمر اختبار موثق',idempotency_key:randomUUID()});
          const after = await request(
            "manager",
            "GET",
            `/api/patients/${patient.id}`,
          );
          assert.equal(after.admission.status, "discharged");
          assert.ok(
            after.labs.some(
              (l: any) => l.id === lateLab.id && l.status === "ordered",
            ),
          );
          let lab = lateLab;
          for (const status of ["collected", "received", "resulted"])
            lab = await post("lab", `/api/labs/${lab.id}/transition`, {
              status,
              version: lab.version,
              ...(status === "resulted"
                ? { result: "وصلت بعد الخروج", unit: "test" }
                : {}),
            });
          await post("doctor", `/api/labs/${lab.id}/transition`, {
            status: "reviewed",
            version: lab.version,
          });
          const bedList = await request("manager", "GET", "/api/beds");
          const bed = bedList.find((b: any) => b.id === available[2].id);
          assert.equal(bed.status, "cleaning");
          await request("manager", "PATCH", `/api/beds/${bed.id}`, {
            status: "available",
            reason: "اعتماد التنظيف التجريبي",
            version: bed.version,
          });
        },
      );
      await t.test(
        "printing audit, export and user deactivation invalidate session",
        async () => {
          await post(
            "manager",
            "/api/print-log",
            { kind: "discharge", patient_id: patient.id },
            201,
          );
          const audit = await request("manager", "GET", "/api/audit");
          assert.ok(audit.length > 0);
          const user = await post(
            "admin",
            "/api/users",
            {
              name: "حساب تعطيل اختبار",
              username: "test-disable",
              password: "StrongTest@2026",
              role: "reception",
            },
            201,
          );
          await post("temporary", "/api/login", {
            username: "test-disable",
            password: "StrongTest@2026",
          });
          await request("admin", "PATCH", `/api/users/${user.id}`, {
            active: false,
          });
          await request("temporary", "GET", "/api/patients", undefined, 401);
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
