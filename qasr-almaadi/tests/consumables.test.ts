import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test(
  "consumable catalog, FEFO atomic stock and infant charge snapshots",
  { timeout: 90000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address() as any;
    const origin = `http://127.0.0.1:${addr.port}`;
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
      const res = await fetch(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: cookies[role],
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      assert.equal(res.status, status, JSON.stringify(data));
      return data;
    }
    const key = () => randomUUID();
    let item: any;
    let original: any;
    try {
      await t.test(
        "admin configures catalog while reception cannot consume; purchase costs remain hidden",
        async () => {
          const seeded = await req("nurse", "GET", "/api/consumables");
          assert.equal(seeded.catalog.length, 4);
          assert.ok(seeded.catalog.every((c: any) => c.price_id));
          assert.ok(
            seeded.catalog.every((c: any) =>
              c.batches.every((b: any) => !("cost" in b)),
            ),
          );
          await req("reception", "GET", "/api/consumables", undefined, 403);
          item = await req(
            "admin",
            "POST",
            "/api/consumables",
            {
              sku: "T-CONS",
              name: "مستهلك اختبار",
              unit: "قطعة",
              price: 7.25,
              idempotency_key: key(),
            },
            201,
          );
          await req(
            "reception",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              consumable_id: item.id,
              patient_mrn: "QM-2026-00101",
              quantity: 1,
              idempotency_key: key(),
            },
            403,
          );
          await req(
            "stock",
            "POST",
            `/api/consumables/${item.id}/prices`,
            { price: 1, version: item.version, idempotency_key: key() },
            403,
          );
          await req(
            "nurse",
            "POST",
            "/api/consumables",
            {
              sku: "DENY",
              name: "deny",
              unit: "piece",
              idempotency_key: key(),
            },
            403,
          );
        },
      );
      await t.test(
        "receipt and FEFO split generate one automatic bill; retries cannot duplicate it",
        async () => {
          for (const [batch, quantity, expires_at] of [
            ["later", 5, "2029-01-01"],
            ["earlier", 2, "2028-01-01"],
            ["expired", 50, "2020-01-01"],
          ] as const)
            await req(
              "stock",
              "POST",
              `/api/consumables/${item.id}/batches`,
              {
                batch,
                quantity,
                expires_at,
                cost: 3,
                location: "test",
                idempotency_key: key(),
              },
              201,
            );
          const mrn = (await one(
            db,
            "SELECT mrn FROM patients WHERE id='patient-1'",
          ))!.mrn;
          const body = {
            consumable_id: item.id,
            quantity: 3,
            patient_mrn: mrn,
            idempotency_key: key(),
          };
          original = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            body,
            201,
          );
          assert.equal(Number(original.amount), 21.75);
          assert.deepEqual(
            original.batches.map((b: any) => [b.batch, b.quantity]),
            [
              ["earlier", 2],
              ["later", 1],
            ],
          );
          const replay = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            body,
            201,
          );
          assert.equal(replay.id, original.id);
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            { ...body, quantity: 4 },
            409,
          );
          assert.equal(
            (await one(
              db,
              "SELECT count(*)::int n FROM consumptions WHERE consumable_id=$1",
              [item.id],
            ))!.n,
            1,
          );
          assert.equal(
            (await one(db, "SELECT count(*)::int n FROM charges WHERE id=$1", [
              original.charge_id,
            ]))!.n,
            1,
          );
          assert.equal(
            Number(
              (await one(
                db,
                "SELECT quantity FROM inventory WHERE consumable_id=$1 AND batch='expired'",
                [item.id],
              ))!.quantity,
            ),
            50,
          );
          await db.query(
            "UPDATE admissions SET nurse_id=NULL,doctor_id='manager' WHERE id='admission-1'",
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            body,
            404,
          );
          await req(
            "nurse",
            "GET",
            "/api/consumables?admission_id=admission-1",
            undefined,
            404,
          );
          const hidden = await req("nurse", "GET", "/api/consumables");
          assert.ok(!hidden.history.some((h: any) => h.id === original.id));
          await db.query(
            "UPDATE admissions SET nurse_id='nurse',doctor_id='doctor' WHERE id='admission-1'",
          );
        },
      );
      await t.test(
        "insufficient, tampered price, wrong identity and closed admission never change stock or bill",
        async () => {
          const mrn = (await one(
            db,
            "SELECT mrn FROM patients WHERE id='patient-1'",
          ))!.mrn;
          const base = {
            consumable_id: item.id,
            quantity: 5,
            patient_mrn: mrn,
          };
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            { ...base, idempotency_key: key() },
            409,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            { ...base, quantity: 1, amount: 0, idempotency_key: key() },
            400,
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              ...base,
              quantity: 1,
              patient_mrn: "WRONG",
              idempotency_key: key(),
            },
            409,
          );
          await db.query(
            "UPDATE admissions SET status='discharged' WHERE id='admission-1'",
          );
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            { ...base, quantity: 1, idempotency_key: key() },
            409,
          );
          await db.query(
            "UPDATE admissions SET status='active' WHERE id='admission-1'",
          );
          assert.equal(
            Number(
              (await one(
                db,
                "SELECT quantity FROM inventory WHERE consumable_id=$1 AND batch='later'",
                [item.id],
              ))!.quantity,
            ),
            4,
          );
          assert.equal(
            (await one(
              db,
              "SELECT count(*)::int n FROM consumptions WHERE consumable_id=$1",
              [item.id],
            ))!.n,
            1,
          );
        },
      );
      await t.test(
        "price changes require version, reject stale displayed prices and preserve historical snapshots",
        async () => {
          const before = (
            await req("admin", "GET", "/api/consumables")
          ).catalog.find((c: any) => c.id === item.id);
          item = await req(
            "admin",
            "POST",
            `/api/consumables/${item.id}/prices`,
            { price: 8.5, version: before.version, idempotency_key: key() },
            201,
          );
          await req(
            "admin",
            "POST",
            `/api/consumables/${item.id}/prices`,
            { price: 9, version: before.version, idempotency_key: key() },
            409,
          );
          const mrn = (await one(
            db,
            "SELECT mrn FROM patients WHERE id='patient-1'",
          ))!.mrn;
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              consumable_id: item.id,
              quantity: 1,
              patient_mrn: mrn,
              expected_price_id: before.price_id,
              idempotency_key: key(),
            },
            409,
          );
          const latest = await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              consumable_id: item.id,
              quantity: 1,
              patient_mrn: mrn,
              expected_price_id: item.price_id,
              idempotency_key: key(),
            },
            201,
          );
          assert.equal(Number(latest.amount), 8.5);
          assert.equal(
            Number(
              (await one(db, "SELECT amount FROM charges WHERE id=$1", [
                original.charge_id,
              ]))!.amount,
            ),
            21.75,
          );
        },
      );
      await t.test(
        "concurrent final stock requests permit exactly one issue",
        async () => {
          const mrn = (await one(
            db,
            "SELECT mrn FROM patients WHERE id='patient-1'",
          ))!.mrn;
          const results = await Promise.all(
            [1, 2].map(() =>
              fetch(origin + "/api/admissions/admission-1/consumables", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: origin,
                  Cookie: cookies.nurse,
                },
                body: JSON.stringify({
                  consumable_id: item.id,
                  quantity: 3,
                  patient_mrn: mrn,
                  idempotency_key: key(),
                }),
              }),
            ),
          );
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          assert.equal(
            Number(
              (await one(
                db,
                "SELECT quantity FROM inventory WHERE consumable_id=$1 AND batch='later'",
                [item.id],
              ))!.quantity,
            ),
            0,
          );
        },
      );
      await t.test(
        "unpriced items cannot issue and disabled item state is version controlled",
        async () => {
          const c = await req(
            "stock",
            "POST",
            "/api/consumables",
            {
              sku: "NO-PRICE",
              name: "غير مسعر",
              unit: "قطعة",
              idempotency_key: key(),
            },
            201,
          );
          await req(
            "stock",
            "POST",
            `/api/consumables/${c.id}/batches`,
            {
              batch: "a",
              quantity: 1,
              expires_at: "2029-01-01",
              cost: 1,
              location: "test",
              idempotency_key: key(),
            },
            201,
          );
          const mrn = (await one(
            db,
            "SELECT mrn FROM patients WHERE id='patient-1'",
          ))!.mrn;
          await req(
            "nurse",
            "POST",
            "/api/admissions/admission-1/consumables",
            {
              consumable_id: c.id,
              quantity: 1,
              patient_mrn: mrn,
              idempotency_key: key(),
            },
            409,
          );
          await req("admin", "PATCH", `/api/consumables/${c.id}`, {
            active: false,
            version: c.version,
          });
          await req(
            "admin",
            "PATCH",
            `/api/consumables/${c.id}`,
            { active: true, version: c.version },
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
