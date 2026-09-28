import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test(
  "insurance receivables, actual collections, snapshots and wallet payments",
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
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    }
    let company: any, claim: any, collection: any;
    const invoice = () =>
      req("accountant", "GET", "/api/billing/admissions/admission-1");
    try {
      await t.test(
        "company setup and claim do not create cash payment; repeat is stable",
        async () => {
          await req("nurse", "GET", "/api/insurance-companies", undefined, 403);
          company = await req(
            "admin",
            "POST",
            "/api/insurance-companies",
            {
              code: "INS-TEST",
              name: "شركة التأمين الأصلية",
              contract_number: "CONTRACT-01",
              terms: "تغطية متفق عليها",
              idempotency_key: key(),
            },
            201,
          );
          const before = await invoice(),
            body = {
              company_id: company.id,
              policy_number: "POL-101",
              approval_number: "APP-2026",
              amount: 1000,
              idempotency_key: key(),
            };
          claim = await req(
            "insurance",
            "POST",
            "/api/admissions/admission-1/insurance-claims",
            body,
            201,
          );
          const replay = await req(
            "insurance",
            "POST",
            "/api/admissions/admission-1/insurance-claims",
            body,
            201,
          );
          assert.equal(replay.id, claim.id);
          const after = await invoice();
          assert.equal(after.payments.length, before.payments.length);
          assert.equal(after.totals.paid, before.totals.paid);
          assert.equal(after.totals.balance, before.totals.balance);
          assert.equal(after.totals.insurance_outstanding, 1000);
          assert.equal(after.totals.patient_due, before.totals.balance - 1000);
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/payments",
            { amount: 10, method: "insurance", idempotency_key: key() },
            409,
          );
        },
      );
      await t.test(
        "snapshots preserve original contract; inactive company blocks new claims only",
        async () => {
          company = await req(
            "admin",
            "PATCH",
            `/api/insurance-companies/${company.id}`,
            {
              name: "شركة باسم معدل",
              contract_number: "CONTRACT-02",
              active: false,
              version: company.version,
            },
          );
          const detail = await invoice();
          assert.equal(
            detail.insurance_claims[0].company_snapshot.name,
            "شركة التأمين الأصلية",
          );
          assert.equal(
            detail.insurance_claims[0].company_snapshot.contract_number,
            "CONTRACT-01",
          );
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/insurance-claims",
            {
              company_id: company.id,
              policy_number: "NEW",
              amount: 10,
              idempotency_key: key(),
            },
            404,
          );
          await req(
            "admin",
            "PATCH",
            `/api/insurance-companies/${company.id}`,
            { active: true, version: company.version - 1 },
            409,
          );
        },
      );
      await t.test(
        "collections require actual valid method/reference and reduce company due, not patient due",
        async () => {
          await req(
            "insurance",
            "POST",
            `/api/insurance-claims/${claim.id}/collections`,
            { amount: 100, method: "cash", idempotency_key: key() },
            403,
          );
          await req(
            "accountant",
            "POST",
            `/api/insurance-claims/${claim.id}/collections`,
            { amount: 300, method: "instapay", idempotency_key: key() },
            400,
          );
          const before = await invoice(),
            body = {
              amount: 300,
              method: "instapay",
              reference: "IP-REAL-001",
              idempotency_key: key(),
            };
          collection = await req(
            "accountant",
            "POST",
            `/api/insurance-claims/${claim.id}/collections`,
            body,
            201,
          );
          const replay = await req(
            "accountant",
            "POST",
            `/api/insurance-claims/${claim.id}/collections`,
            body,
            201,
          );
          assert.equal(replay.id, collection.id);
          assert.equal(
            collection.company_snapshot.name,
            "شركة التأمين الأصلية",
          );
          assert.equal(collection.insurance_claim_id, claim.id);
          const after = await invoice();
          assert.equal(after.totals.paid, before.totals.paid + 300);
          assert.equal(after.totals.insurance_outstanding, 700);
          assert.equal(after.totals.patient_due, before.totals.patient_due);
          await req(
            "accountant",
            "POST",
            `/api/insurance-claims/${claim.id}/collections`,
            { amount: 701, method: "cash", idempotency_key: key() },
            409,
          );
        },
      );
      await t.test(
        "refund of insurance collection reopens company receivable with unchanged patient share",
        async () => {
          const before = await invoice();
          const refunded = await req(
            "accountant",
            "POST",
            `/api/payments/${collection.id}/refund`,
            { amount: 100, reason: "رد تحصيل للشركة", idempotency_key: key() },
            201,
          );
          assert.equal(refunded.insurance_claim_id, claim.id);
          assert.equal(
            refunded.company_snapshot.contract_number,
            "CONTRACT-01",
          );
          const after = await invoice();
          assert.equal(after.totals.insurance_outstanding, 800);
          assert.equal(after.totals.patient_due, before.totals.patient_due);
          assert.equal(after.totals.balance, before.totals.balance + 100);
        },
      );
      await t.test(
        "patient wallet collection cannot consume insurer allocation; ordinary overpayments remain compatible without claims",
        async () => {
          const before = await invoice();
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/payments",
            {
              amount: before.totals.patient_due + 1,
              method: "cash",
              idempotency_key: key(),
            },
            409,
          );
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/payments",
            { amount: 100, method: "wallet", idempotency_key: key() },
            400,
          );
          const paid = await req(
            "accountant",
            "POST",
            "/api/admissions/admission-1/payments",
            {
              amount: 100,
              method: "wallet",
              reference: "WALLET-001",
              idempotency_key: key(),
            },
            201,
          );
          assert.equal(paid.method, "wallet");
          const after = await invoice();
          assert.equal(
            after.totals.patient_due,
            before.totals.patient_due - 100,
          );
          assert.equal(after.totals.insurance_outstanding, 800);
          await req(
            "accountant",
            "POST",
            "/api/admissions/admission-2/payments",
            { amount: 99999, method: "card", idempotency_key: key() },
            201,
          );
        },
      );
      await t.test(
        "simultaneous claims cannot overallocate the remaining patient balance",
        async () => {
          company = await req(
            "admin",
            "PATCH",
            `/api/insurance-companies/${company.id}`,
            { active: true, version: company.version },
          );
          const before = await invoice();
          const response = await Promise.all(
            [1, 2].map((i) =>
              fetch(origin + "/api/admissions/admission-1/insurance-claims", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: origin,
                  Cookie: cookies.accountant,
                },
                body: JSON.stringify({
                  company_id: company.id,
                  policy_number: `CONCURRENT-${i}`,
                  amount: before.totals.patient_due,
                  idempotency_key: key(),
                }),
              }),
            ),
          );
          assert.deepEqual(response.map((r) => r.status).sort(), [201, 409]);
          const after = await invoice();
          assert.equal(after.totals.patient_due, 0);
          assert.equal(
            after.totals.insurance_outstanding,
            after.totals.balance,
          );
        },
      );
      await t.test(
        "bank-linked insurance settlement and refund preserve account and printed insurer snapshot",
        async () => {
          await db.query("INSERT INTO money_accounts(id,name,kind,bank_name,opening_balance) VALUES('insurance-bank','Bank test','bank','Test Bank',0)");
          const payment=await req('accountant','POST',`/api/insurance-claims/${claim.id}/collections`,{amount:50,method:'transfer',money_account_id:'insurance-bank',reference:'BANK-INS-1',idempotency_key:key()},201);
          assert.equal(payment.money_account_id,'insurance-bank');
          const refund=await req('accountant','POST',`/api/payments/${payment.id}/refund`,{amount:20,reason:'رد بنكي جزئي',idempotency_key:key()},201);
          assert.equal(refund.money_account_id,'insurance-bank');assert.equal(refund.insurance_claim_id,claim.id);
          assert.equal(Number((await one(db,"SELECT sum(amount) AS amount FROM payments WHERE money_account_id='insurance-bank'"))!.amount),30);
          const response=await fetch(origin+'/api/print/invoice?admission_id=admission-1&lang=en',{headers:{Cookie:cookies.accountant}});assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('Insurance company claims'));assert.ok(html.includes('Patient share due'));assert.ok(html.includes('CONTRACT-01'));assert.ok(html.includes('InstaPay'));
          const receipt=await fetch(origin+`/api/print/receipt?admission_id=admission-1&id=${payment.id}&lang=en`,{headers:{Cookie:cookies.accountant}});assert.equal(receipt.status,200);assert.ok((await receipt.text()).includes('CONTRACT-01'));
        },
      );
      await t.test(
        "cashbook contains actual settlements only and closed collection cannot be refunded",
        async () => {
          const expected = await one(
            db,
            "SELECT sum(amount) AS amount FROM payments WHERE closure_id IS NULL",
          );
          const closed = await req(
            "accountant",
            "POST",
            "/api/billing/close",
            { reason: "إقفال التحصيل الحقيقي فقط", idempotency_key: key() },
            201,
          );
          assert.equal(Number(closed.total), Number(expected!.amount));
          await req(
            "accountant",
            "POST",
            `/api/payments/${collection.id}/refund`,
            { amount: 1, reason: "فترة مقفلة", idempotency_key: key() },
            409,
          );
          await db.query(
            "UPDATE roles SET permissions=permissions || '[\"billing.read\",\"billing.write\"]'::jsonb WHERE name='doctor'",
          );
          await db.query(
            "UPDATE admissions SET doctor_id='manager',nurse_id='manager' WHERE id='admission-1'",
          );
          await req(
            "doctor",
            "GET",
            "/api/admissions/admission-1/insurance-claims",
            undefined,
            404,
          );
          await req(
            "doctor",
            "POST",
            `/api/insurance-claims/${claim.id}/collections`,
            { amount: 1, method: "cash", idempotency_key: key() },
            404,
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
