import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test(
  "finance and consumables interconnection preserves inventory and exact currency",
  { timeout: 90000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const cookies: Record<string, string> = {};
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
    const key = () => randomUUID();
    let item: any;
    try {
      await t.test(
        "legacy inventory is linked to catalog, receives a movement and never invents selling price",
        async () => {
          const body = {
            name: "ربط مخزون جديد",
            unit: "قطعة",
            batch: "INTEROP-1",
            quantity: 10,
            cost: 3.25,
            expires_at: "2030-01-01",
            location: "اختبار",
            idempotency_key: key(),
          };
          item = await req("stock", "POST", "/api/inventory", body, 201);
          assert.ok(item.consumable_id);
          const replay = await req(
            "stock",
            "POST",
            "/api/inventory",
            body,
            201,
          );
          assert.equal(replay.id, item.id);
          const catalog = (
            await req("stock", "GET", "/api/consumables")
          ).catalog.find((c: any) => c.id === item.consumable_id);
          assert.equal(catalog.price_id, null);
          assert.equal(Number(catalog.available_quantity), 10);
          assert.equal(
            (await one(
              db,
              "SELECT count(*)::int n FROM stock_movements WHERE item_id=$1",
              [item.id],
            ))!.n,
            1,
          );
          const second = await req(
            "stock",
            "POST",
            "/api/inventory",
            { ...body, batch: "INTEROP-2", idempotency_key: key() },
            201,
          );
          assert.equal(second.consumable_id, item.consumable_id);
          await req(
            "stock",
            "POST",
            "/api/inventory",
            {
              ...body,
              batch: "WRONG",
              consumable_id: "consumable-1",
              idempotency_key: key(),
            },
            409,
          );
        },
      );
      await t.test(
        "patient stock issues and returns cannot bypass consumption or financial reconciliation",
        async () => {
          for (const type of ["issue", "return"]) {
            const rejected = await req(
              "stock",
              "POST",
              `/api/inventory/${item.id}/move`,
              {
                type,
                quantity: 1,
                admission_id: "admission-1",
                reason: "اختبار",
                idempotency_key: key(),
              },
              409,
            );
            assert.equal(rejected.code, "USE_CONSUMABLE_WORKFLOW");
            assert.ok(!/[\u0600-\u06ff]/.test(rejected.error));
          }
          assert.equal(
            Number(
              (await one(db, "SELECT quantity FROM inventory WHERE id=$1", [
                item.id,
              ]))!.quantity,
            ),
            10,
          );
          await req(
            "stock",
            "POST",
            `/api/inventory/${item.id}/move`,
            {
              type: "issue",
              quantity: 1,
              reason: "صرف عام للقسم",
              idempotency_key: key(),
            },
            201,
          );
          assert.equal(
            Number(
              (await one(db, "SELECT quantity FROM inventory WHERE id=$1", [
                item.id,
              ]))!.quantity,
            ),
            9,
          );
        },
      );
      await t.test(
        "expiry is valid through the Cairo expiry date",
        async () => {
          const today = (await one(
            db,
            "SELECT to_char(now() AT TIME ZONE 'Africa/Cairo','YYYY-MM-DD') AS today",
          ))!.today;
          const exp = await req(
            "stock",
            "POST",
            "/api/inventory",
            {
              name: "انتهاء اليوم",
              unit: "قطعة",
              batch: "TODAY",
              quantity: 2,
              cost: 1,
              expires_at: today,
              location: "اختبار",
              idempotency_key: key(),
            },
            201,
          );
          await req(
            "stock",
            "POST",
            `/api/inventory/${exp.id}/move`,
            {
              type: "issue",
              quantity: 1,
              reason: "داخل يوم الصلاحية",
              idempotency_key: key(),
            },
            201,
          );
          await db.query(
            "UPDATE inventory SET expires_at=(now() AT TIME ZONE 'Africa/Cairo')::date-1 WHERE id=$1",
            [exp.id],
          );
          await req(
            "stock",
            "POST",
            `/api/inventory/${exp.id}/move`,
            {
              type: "issue",
              quantity: 1,
              reason: "منتهي",
              idempotency_key: key(),
            },
            409,
          );
        },
      );
      await t.test(
        "manual invoice cannot use consumable prices; service prices identify their source",
        async () => {
          const prices = await req("accountant", "GET", "/api/prices");
          assert.equal(
            prices.find((p: any) => p.id === "consumable-price-1")
              .consumable_id,
            "consumable-1",
          );
          await req("admin", "GET", "/api/prices");
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/charges",
            {
              price_id: "consumable-price-1",
              quantity: 2,
              idempotency_key: key(),
            },
            409,
          );
          const mrn = (await one(
            db,
            "SELECT mrn FROM patients WHERE id='patient-1'",
          ))!.mrn;
          const used = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              consumable_id: "consumable-1",
              quantity: 2,
              patient_mrn: mrn,
              idempotency_key: key(),
            },
            201,
          );
          const invoice = await req(
            "accountant",
            "GET",
            "/api/billing/admissions/admission-1",
          );
          assert.ok(invoice.consumables.some((c: any) => c.id === used.id));
          assert.equal(
            invoice.charges.filter((c: any) => c.id === used.charge_id).length,
            1,
          );
          assert.equal(
            invoice.totals.charged,
            invoice.charges.reduce(
              (n: number, c: any) => n + Number(c.amount),
              0,
            ),
          );
          await req(
            "nurse",
            "GET",
            "/api/billing/admissions/admission-1",
            undefined,
            403,
          );
          await db.query(
            "UPDATE roles SET permissions=permissions || '[\"billing.read\"]'::jsonb WHERE name='doctor'",
          );
          await db.query(
            "UPDATE admissions SET doctor_id='manager',nurse_id='manager' WHERE id='admission-1'",
          );
          await req(
            "doctor",
            "GET",
            "/api/billing/admissions/admission-1",
            undefined,
            404,
          );
          await db.query(
            "UPDATE admissions SET doctor_id='doctor',nurse_id='nurse' WHERE id='admission-1'",
          );
        },
      );
      await t.test(
        "currency rejects subcents, accepts complete fractional refunds and closes exact net total",
        async () => {
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/payments",
            { amount: 0.001, method: "cash", idempotency_key: key() },
            400,
          );
          const payment = await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/payments",
            { amount: 0.3, method: "cash", idempotency_key: key() },
            201,
          );
          await req(
            "accountant",
            "POST",
            `/api/payments/${payment.id}/refund`,
            { amount: 0.101, reason: "جزء سنت", idempotency_key: key() },
            400,
          );
          for (const amount of [0.1, 0.2])
            await req(
              "accountant",
              "POST",
              `/api/payments/${payment.id}/refund`,
              { amount, reason: "استرداد كسري", idempotency_key: key() },
              201,
            );
          await req(
            "accountant",
            "POST",
            `/api/payments/${payment.id}/refund`,
            { amount: 0.01, reason: "أكثر من المدفوع", idempotency_key: key() },
            409,
          );
          const close = await req(
            "accountant",
            "POST",
            "/api/billing/close",
            { reason: "إقفال دقيق", idempotency_key: key() },
            201,
          );
          const ledger = await one(
            db,
            "SELECT sum(amount) AS total FROM payments WHERE closure_id=$1",
            [close.id],
          );
          assert.equal(Number(close.total), Number(ledger!.total));
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
