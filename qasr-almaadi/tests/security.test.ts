import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

test(
  "clinical confidentiality and assignment scope apply to API projections",
  { timeout: 120000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    const app = await createApp(db, { seed: true });
    await db.query(
      "UPDATE admissions SET doctor_id='manager',nurse_id='head_nurse',summary='CONFIDENTIAL SUMMARY' WHERE id='admission-8'",
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const cookies: Record<string, string> = {};
    async function request(
      role: string,
      method: string,
      path: string,
      body?: unknown,
      status = 200,
    ): Promise<any> {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) cookies[role] = cookie.split(";")[0];
      const result = await response.json();
      assert.equal(
        response.status,
        status,
        `${role} ${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result;
    }
    const absent = (row: any, keys: string[]) =>
      keys.forEach((key) =>
        assert.equal(key in row, false, `unexpected clinical field ${key}`),
      );
    try {
      for (const role of [
        "manager",
        "doctor",
        "nurse",
        "reception",
        "accountant",
        "maintenance",
        "lab",
        "stock",
        "quality",
      ])
        await request(role, "POST", "/api/login", {
          username: role,
          password: "Training@2026",
        });

      await t.test(
        "nonclinical users cannot read clinical data through list, detail or demographic edit",
        async () => {
          for (const role of ["reception", "accountant", "lab"]) {
            const rows = await request(role, "GET", "/api/patients");
            assert.ok(rows.length > 0);
            rows.forEach((row: any) =>
              absent(row, [
                "allergy_status",
                "gestation_weeks",
                "birth_weight",
                "latest_weight",
                "diagnosis",
              ]),
            );
            const detail = await request(
              role,
              "GET",
              "/api/patients/patient-8",
            );
            absent(detail.patient, [
              "allergy_status",
              "latest_weight",
              "diagnosis",
            ]);
            detail.admissions.forEach((row: any) =>
              absent(row, ["reason", "diagnosis", "summary", "followup_at"]),
            );
            assert.deepEqual(detail.notes, []);
            assert.deepEqual(detail.orders, []);
            assert.deepEqual(detail.vitals, []);
            assert.deepEqual(detail.events, []);
            detail.movements.forEach((row: any) => absent(row, ["reason"]));
            if (role === "lab")
              assert.ok(detail.labs.length > 0, "lab role still needs results");
          }
          const p = await request(
            "reception",
            "GET",
            "/api/patients/patient-1",
          );
          const edited = await request(
            "reception",
            "PATCH",
            "/api/patients/patient-1",
            { name: "Demographic edit only", version: p.patient.version },
          );
          absent(edited, ["allergy_status", "birth_weight", "gestation_weeks"]);
          await request(
            "reception",
            "PATCH",
            "/api/patients/patient-1",
            { allergy_status: "none_known", version: edited.version },
            403,
          );
          const manager = await request(
            "manager",
            "GET",
            "/api/patients/patient-8",
          );
          assert.equal(manager.admission.summary, "CONFIDENTIAL SUMMARY");
          assert.ok(manager.patient.latest_weight);
        },
      );

      await t.test(
        "assigned staff cannot discover a different case through beds or direct lookup",
        async () => {
          for (const role of ["doctor", "nurse"]) {
            const rows = await request(role, "GET", "/api/patients");
            assert.ok(!rows.some((p: any) => p.id === "patient-8"));
            await request(
              role,
              "GET",
              "/api/patients/patient-8",
              undefined,
              404,
            );
            const beds = await request(role, "GET", "/api/beds");
            const hidden = beds.find((b: any) => b.id === "bed-8");
            assert.equal(hidden.status, "occupied");
            for (const field of [
              "patient_id",
              "patient_name",
              "mrn",
              "admitted_at",
            ])
              assert.equal(hidden[field], null);
            assert.equal(
              beds.find((b: any) => b.id === "bed-1").patient_id,
              "patient-1",
            );
          }
        },
      );

      await t.test(
        "maintenance sees bed readiness without patient identities",
        async () => {
          const beds = await request("maintenance", "GET", "/api/beds");
          assert.ok(beds.some((b: any) => b.status === "occupied"));
          beds.forEach((bed: any) => {
            for (const field of [
              "patient_id",
              "patient_name",
              "mrn",
              "admitted_at",
            ])
              assert.equal(bed[field], null);
          });
          await request("maintenance", "GET", "/api/patients", undefined, 403);
        },
      );

      await t.test(
        "reception cannot inspect or complete clinical tasks",
        async () => {
          const clinicalTasks = await request("nurse", "GET", "/api/tasks");
          const task = clinicalTasks.find(
            (row: any) => row.order_id && row.status === "pending",
          );
          assert.ok(task);
          const operationalTasks = await request(
            "reception",
            "GET",
            "/api/tasks",
          );
          assert.ok(
            operationalTasks.every(
              (row: any) => !row.admission_id && !row.order_id,
            ),
          );
          await request(
            "reception",
            "PATCH",
            "/api/tasks/" + task.id,
            { status: "completed", version: task.version },
            403,
          );
          await request(
            "reception",
            "POST",
            "/api/tasks",
            {
              admission_id: "admission-1",
              title: "Unauthorized clinical task",
              due_at: new Date().toISOString(),
            },
            403,
          );
        },
      );

      await t.test(
        "clinical alerts remain private from stock and quality roles",
        async () => {
          await db.query(
            "INSERT INTO records(id,kind,title,status,admission_id,data,actor_id) VALUES('sensitive-alert','alerts','CONFIDENTIAL LAB RESULT','open','admission-1',$1,'lab')",
            [JSON.stringify({ lab_id: "lab-1", owner: "doctor" })],
          );
          const medicalAlerts = await request(
            "doctor",
            "GET",
            "/api/records/alerts",
          );
          assert.ok(
            medicalAlerts.some((row: any) => row.id === "sensitive-alert"),
          );
          for (const role of ["stock", "quality"]) {
            const alerts = await request(role, "GET", "/api/records/alerts");
            assert.ok(!alerts.some((row: any) => row.id === "sensitive-alert"));
            assert.ok(
              alerts.some((row: any) => !row.admission_id),
              "operational alerts remain available",
            );
            await request(
              role,
              "PATCH",
              "/api/records/alerts/sensitive-alert",
              { status: "closed", version: 1 },
              403,
            );
          }
        },
      );
      await t.test('transfer does not disclose clinical admission fields to reception', async () => {
        const detail = await request('reception', 'GET', '/api/patients/patient-1');
        const transferred = await request('reception', 'POST', '/api/admissions/admission-1/transfer', { bed_id: 'bed-9', reason: 'Operational move only', version: detail.admission.version });
        assert.equal(transferred.bed_id, 'bed-9');
        absent(transferred, ['reason', 'diagnosis', 'summary', 'followup_at']);
      });

      await t.test('an earlier admission timeline cannot bypass case assignment', async () => {
        await db.query("INSERT INTO admissions(id,admission_no,patient_id,status,admitted_at,discharged_at,doctor_id,nurse_id) VALUES('previous-unassigned','PREVIOUS-UNASSIGNED','patient-1','discharged',now()-interval '100 days',now()-interval '90 days','manager','head_nurse')");
        await db.query("INSERT INTO audit(id,actor_id,action,entity,entity_id,patient_id,details) VALUES('private-prior-event','manager','discharge','admissions','previous-unassigned','patient-1',$1)", [JSON.stringify({ summary: 'PRIVATE PRIOR ADMISSION' })]);
        await db.query("INSERT INTO audit(id,actor_id,action,entity,entity_id,patient_id,details) VALUES('assigned-event','manager','admit','admissions','admission-1','patient-1',$1)", [JSON.stringify({ summary: 'CURRENT ADMISSION EVENT' })]);
        const detail = await request('doctor', 'GET', '/api/patients/patient-1');
        assert.ok(!detail.events.some((event: any) => event.id === 'private-prior-event'));
        assert.ok(detail.events.some((event: any) => event.id === 'assigned-event'));
        await request('doctor', 'GET', '/api/patients/patient-1?admission_id=previous-unassigned', undefined, 404);
      });

      await t.test('custom financial permissions still respect the clinical case scope', async () => {
        await db.query("UPDATE roles SET permissions=permissions || $1::jsonb WHERE name='doctor'", [JSON.stringify(['billing.read', 'billing.write', 'export', 'audit.read', 'patients.write'])]);
        await request('doctor', 'PATCH', '/api/patients/patient-8', { name: 'Unauthorized demographic edit', version: 1 }, 404);
        await request('doctor', 'POST', '/api/billing/close', { reason: 'Unauthorized department closure' }, 403);
        const billing = await request('doctor', 'GET', '/api/billing');
        assert.ok(!billing.admissions.some((row: any) => row.id === 'admission-8'));
        assert.ok(!billing.charges.some((row: any) => row.admission_id === 'admission-8'));
        assert.ok(!billing.payments.some((row: any) => row.admission_id === 'admission-8'));
        const dashboard = await request('doctor', 'GET', '/api/dashboard');
        assert.equal(dashboard.stats.revenue, billing.totals.charged);
        const reports = await request('doctor', 'GET', '/api/reports');
        assert.deepEqual(reports.billing, billing.totals);
        const foreignPayment = (await db.query("SELECT id,receipt_no FROM payments WHERE admission_id='admission-8' LIMIT 1")).rows[0];
        await request('doctor', 'POST', '/api/payments/' + foreignPayment.id + '/refund', { amount: 1, reason: 'Unauthorized refund', idempotency_key: 'outside-case-refund' }, 404);
        const exported = await fetch(base + '/api/export/billing', { headers: { Cookie: cookies.doctor } });
        assert.equal(exported.status, 200);
        assert.ok(!(await exported.text()).includes(foreignPayment.receipt_no));
        const audit = await request('doctor', 'GET', '/api/audit');
        assert.ok(audit.every((row: any) => row.actor_id === 'doctor'));
        assert.ok(!JSON.stringify(audit).includes('PRIVATE PRIOR ADMISSION'));
      });

      await t.test('idempotent retries recheck assignments before returning cached clinical data', async () => {
        const body = { type: 'procedure', name: 'Private cached order', status: 'draft', idempotency_key: 'cached-order-assignment' };
        const order = await request('doctor', 'POST', '/api/admissions/admission-1/orders', body, 201);
        assert.equal(order.admission_id, 'admission-1');
        await db.query("UPDATE admissions SET doctor_id='manager',nurse_id='head_nurse' WHERE id='admission-1'");
        await request('doctor', 'POST', '/api/admissions/admission-1/orders', body, 404);
        await db.query("UPDATE admissions SET doctor_id='doctor',nurse_id='nurse' WHERE id='admission-1'");
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await db.close();
    }
  },
);
