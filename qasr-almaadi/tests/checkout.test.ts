import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test(
  "reception referral, explicit doctor authority and accounting-only checkout",
  { timeout: 90000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const cookies: Record<string, string> = {};
    const key = () => randomUUID();
    async function req(
      role: string,
      method: string,
      path: string,
      body?: any,
      status = 200,
    ) {
      if (!cookies[role]) {
        const login = await fetch(origin + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ username: role, password: "Training@2026" }),
        });
        assert.equal(login.status, 200);
        cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
      }
      const response = await fetch(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: cookies[role],
          "Accept-Language": "en",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    }
    let request: any, medical: any;
    let mrn: string;
    let original: any;
    try {
      await t.test(
        "reception request queues the admission without releasing the bed",
        async () => {
          original = await one(
            db,
            "SELECT a.*,p.mrn FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE a.id='admission-1'",
          );
          mrn = original.mrn;
          const body = {
            notes: "إحالة للحسابات للمراجعة",
            idempotency_key: key(),
          };
          request = await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/checkout-request",
            body,
            201,
          );
          const replay = await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/checkout-request",
            body,
            201,
          );
          assert.equal(replay.id, request.id);
          assert.equal(
            (await one(
              db,
              "SELECT status FROM admissions WHERE id='admission-1'",
            ))!.status,
            "active",
          );
          assert.equal(
            (await one(db, "SELECT status FROM beds WHERE id=$1", [
              original.bed_id,
            ]))!.status,
            "occupied",
          );
          await req(
            "reception",
            "GET",
            "/api/checkout-requests",
            undefined,
            403,
          );
          const queue = await req(
            "accountant",
            "GET",
            "/api/checkout-requests",
          );
          assert.equal(queue[0].id, request.id);
          assert.equal(queue[0].clearance, null);
          assert.ok(!("diagnosis" in queue[0]));
          const denied = await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            {
              version: 1,
              patient_mrn: mrn,
              recipient: "ولي الأمر",
              idempotency_key: key(),
            },
            409,
          );
          assert.equal(denied.code, "CHECKOUT_PATIENT_BALANCE");
          assert.ok(!/[\u0600-\u06ff]/.test(denied.error));
        },
      );
      await t.test(
        "reception confirms an authorized doctor under its own identity, without clinical edits",
        async () => {
          await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/checkout-clearance",
            { doctor_id: "doctor", idempotency_key: key() },
            400,
          );
          await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/checkout-clearance",
            {
              doctor_id: "lab",
              confirmation_note: "تأكيد",
              idempotency_key: key(),
            },
            409,
          );
          await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/checkout-clearance",
            {
              doctor_id: "doctor",
              confirmation_note: "تأكيد",
              summary: "تعديل طبي غير مسموح",
              idempotency_key: key(),
            },
            400,
          );
          medical = await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/checkout-clearance",
            {
              doctor_id: "doctor",
              confirmation_note: "تم التأكيد هاتفيًا مع الطبيب المسؤول",
              idempotency_key: key(),
            },
            201,
          );
          assert.equal(medical.approved_by, "reception");
          assert.equal(medical.authority_doctor_id, "doctor");
          assert.equal(medical.approval_source, "reception_on_behalf");
          assert.equal(
            (await one(
              db,
              "SELECT summary FROM admissions WHERE id='admission-1'",
            ))!.summary,
            original.summary,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/checkout-clearance",
            {
              doctor_id: "doctor",
              confirmation_note: "غير مخول",
              idempotency_key: key(),
            },
            403,
          );
        },
      );
      await t.test(
        "legacy doctor discharge only clears medically, never bypasses accounting",
        async () => {
          const before = await one(
            db,
            "SELECT * FROM admissions WHERE id='admission-2'",
          );
          const cleared = await req(
            "doctor",
            "POST",
            "/api/admissions/admission-2/discharge",
            {
              summary: "ملخص الطبيب",
              discharge_type: "routine",
              version: before!.version,
              idempotency_key: key(),
            },
          );
          assert.equal(cleared.approved_by, "doctor");
          assert.equal(cleared.authority_doctor_id, "doctor");
          assert.equal(cleared.approval_source, "doctor");
          const after = await one(
            db,
            "SELECT * FROM admissions WHERE id='admission-2'",
          );
          assert.equal(after!.status, "active");
          assert.equal(after!.summary, "ملخص الطبيب");
          assert.equal(
            (await one(db, "SELECT status FROM beds WHERE id=$1", [
              before!.bed_id,
            ]))!.status,
            "occupied",
          );
        },
      );
      await t.test(
        "only accounting can finalize, and pending patient debt blocks it",
        async () => {
          const body = {
            version: request.version,
            patient_mrn: mrn,
            recipient: "ولي أمر موثق",
            idempotency_key: key(),
          };
          await req(
            "reception",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            body,
            403,
          );
          await db.query(
            "UPDATE roles SET permissions=permissions || '[\"billing.write\"]'::jsonb WHERE name='doctor'",
          );
          await req(
            "doctor",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            body,
            403,
          );
          await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            { ...body, summary: "تعديل الحسابات" },
            400,
          );
          const denied = await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            body,
            409,
          );
          assert.equal(denied.code, "CHECKOUT_PATIENT_BALANCE");
        },
      );
      await t.test(
        "insurance receivable may remain; final checkout atomically cleans bed and snapshots orders",
        async () => {
          const bill = await req(
            "accountant",
            "GET",
            "/api/billing/admissions/admission-1",
          );
          const company = await req(
            "admin",
            "POST",
            "/api/insurance-companies",
            { code: "EXIT-INS", name: "تأمين خروج", idempotency_key: key() },
            201,
          );
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/insurance-claims",
            {
              company_id: company.id,
              policy_number: "EXIT-1",
              amount: bill.totals.patient_due,
              idempotency_key: key(),
            },
            201,
          );
          const pendingLab = await one(
            db,
            "SELECT id,status FROM labs WHERE admission_id='admission-1' ORDER BY created_at LIMIT 1",
          );
          const order = await one(
            db,
            "SELECT id,status FROM orders WHERE admission_id='admission-1' AND status IN('draft','approved','suspended') LIMIT 1",
          );
          await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            {
              version: request.version,
              patient_mrn: "WRONG",
              recipient: "ولي الأمر",
              idempotency_key: key(),
            },
            409,
          );
          await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            {
              version: 999,
              patient_mrn: mrn,
              recipient: "ولي الأمر",
              idempotency_key: key(),
            },
            409,
          );
          const body = {
            version: request.version,
            patient_mrn: mrn,
            recipient: "ولي الأمر",
            idempotency_key: key(),
          };
          const final = await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            body,
          );
          const replay = await req(
            "accountant",
            "POST",
            `/api/checkout-requests/${request.id}/finalize`,
            body,
          );
          assert.equal(final.id, replay.id);
          assert.equal(final.status, "finalized");
          assert.equal(final.clearance_id, medical.id);
          assert.equal(final.finalized_by, "accountant");
          assert.ok(final.insurance_outstanding > 0);
          assert.equal(final.patient_due, 0);
          const after = await one(
            db,
            "SELECT * FROM admissions WHERE id='admission-1'",
          );
          assert.equal(after!.status, "discharged");
          assert.equal(after!.summary, original.summary);
          assert.equal(
            (await one(db, "SELECT status FROM beds WHERE id=$1", [
              original.bed_id,
            ]))!.status,
            "cleaning",
          );
          if (pendingLab)
            assert.equal(
              (await one(db, "SELECT status FROM labs WHERE id=$1", [
                pendingLab.id,
              ]))!.status,
              pendingLab.status,
            );
          if (order) {
            assert.equal(
              (await one(db, "SELECT status FROM orders WHERE id=$1", [
                order.id,
              ]))!.status,
              "stopped",
            );
            assert.ok(
              await one(
                db,
                "SELECT id FROM order_versions WHERE order_id=$1 AND data->>'status'=$2",
                [order.id, order.status],
              ),
            );
          }
          assert.equal(
            (await one(
              db,
                "SELECT count(*)::int n FROM bed_movements WHERE admission_id='admission-1' AND reason='إنهاء الخروج بواسطة الحسابات بعد طلب الاستقبال وتسوية الحساب'",
            ))!.n,
            1,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              consumable_id: "consumable-1",
              quantity: 1,
              patient_mrn: mrn,
              idempotency_key: key(),
            },
            409,
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
