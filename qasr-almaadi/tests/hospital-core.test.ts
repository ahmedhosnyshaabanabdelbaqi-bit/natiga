import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initDb, one, all } from "../server/db.js";
import { createApp } from "../server/app.js";
import { insert } from "../server/seed.js";

test("the hospital migration upgrades existing patient and NICU data without replacing records", async () => {
  const old = new PGlite();
  await old.waitReady;
  try {
    await old.exec(await readFile(new URL("../server/migrations/001_initial.sql", import.meta.url), "utf8"));
    await old.exec("ALTER TABLE patients ADD COLUMN address text");
    await old.query("INSERT INTO patients(id,mrn,name,sex,birth_at,address) VALUES('existing-patient','KEEP-MRN','Existing patient','female','2026-01-01','Existing address')");
    await old.query("INSERT INTO beds(id,name,room,status,care_level) VALUES('existing-bed','Existing bed','NICU','occupied','intensive')");
    await old.query("INSERT INTO admissions(id,admission_no,patient_id,bed_id,diagnosis) VALUES('existing-admission','KEEP-ADM','existing-patient','existing-bed','Existing clinical history')");
    await old.exec(await readFile(new URL("../server/migrations/024_hospital_core.sql", import.meta.url), "utf8"));
    const patient = (await old.query<any>("SELECT * FROM patients WHERE id='existing-patient'")).rows[0];
    const admission = (await old.query<any>("SELECT * FROM admissions WHERE id='existing-admission'")).rows[0];
    assert.equal(patient.mrn, "KEEP-MRN");
    assert.equal(patient.address, "Existing address");
    assert.equal(admission.bed_id, "existing-bed");
    assert.equal(admission.diagnosis, "Existing clinical history");
    assert.equal(admission.department_id, "dept-nicu");
    assert.equal(admission.encounter_type, "nicu");
    assert.equal((await old.query<any>("SELECT department_id FROM beds WHERE id='existing-bed'")).rows[0].department_id, "dept-nicu");
  } finally { await old.close(); }
});

test("hospital patient journeys preserve the medical record, billing, bed integrity and scoped access", { timeout: 90000 }, async t => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const cookies: Record<string, string> = {};
  const keyed = (body: any) => ({ ...body, idempotency_key: randomUUID() });
  async function request(role: string, method: string, route: string, body?: any, expected = 200) {
    if (!cookies[role]) {
      const login = await fetch(origin + "/api/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: role, password: "Training@2026" }) });
      assert.equal(login.status, 200);
      cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
    }
    const response = await fetch(origin + "/api" + route, { method, headers: { Origin: origin, Cookie: cookies[role], "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
    return result;
  }
  async function newPatient(name: string) {
    return request("reception", "POST", "/patients", keyed({ name, sex: "male", birth_at: "1980-01-01T00:00:00.000Z", encounter_type: "outpatient", department_id: "dept-outpatient", registration_only: true, phone: "01000000000", national_id: "TEST-" + randomUUID() }), 201);
  }
  const scheduled = new Date(Date.now() + 86400000).toISOString();
  let patient: any, appointment: any, encounter: any;
  try {
    await t.test("existing NICU rows remain linked and default to their original department", async () => {
      assert.equal((await one(db, "SELECT count(*)::int n FROM admissions WHERE department_id='dept-nicu' AND encounter_type='nicu'")).n, 8);
      assert.equal((await one(db, "SELECT count(*)::int n FROM beds WHERE department_id='dept-nicu'")).n, 16);
      assert.equal((await request("reception", "GET", "/hospital/departments")).length, 9);
      await request("reception", "POST", "/hospital/departments", keyed({ name: "Unauthorized", type: "inpatient" }), 403);
    });

    await t.test("beds belong only to active accommodation departments and legacy bed creation stays in NICU", async () => {
      assert.equal((await request("maintenance", "GET", "/hospital/departments")).length, 9);
      const bed = { name: "New hospital ward bed", room: "Ward A", care_level: "general", status: "available", department_id: "dept-inpatient" };
      const created = await request("reception", "POST", "/beds", keyed(bed), 201);
      assert.equal(created.department_id, "dept-inpatient");
      await request("reception", "POST", "/beds", keyed({ ...bed, name: "Invalid clinic bed", department_id: "dept-outpatient" }), 400);
      await request("reception", "POST", "/beds", keyed({ ...bed, name: "Invalid lab bed", department_id: "dept-lab" }), 400);
      const legacy = await request("reception", "POST", "/beds", keyed({ name: "Legacy NICU bed", room: "NICU", care_level: "intensive" }), 201);
      assert.equal(legacy.department_id, "dept-nicu");
      const department = await request("admin", "POST", "/hospital/departments", keyed({ name: "Closed ward", type: "inpatient" }), 201);
      await request("admin", "PATCH", `/hospital/departments/${department.id}`, { version: department.version, active: false });
      await request("reception", "POST", "/beds", keyed({ ...bed, name: "Closed department bed", department_id: department.id }), 400);
    });

    await t.test("registration, conflicting appointments and repeated check-in create one linked outpatient encounter", async () => {
      patient = await newPatient("Adult hospital journey");
      assert.equal(patient.admission_id, null);
      const body = keyed({ patient_id: patient.id, department_id: "dept-outpatient", doctor_id: "doctor", scheduled_at: scheduled, notes: "Private appointment note" });
      appointment = await request("reception", "POST", "/hospital/appointments", body, 201);
      assert.equal(appointment.notes, undefined);
      assert.equal((await request("reception", "POST", "/hospital/appointments", body, 201)).id, appointment.id);
      const second = await newPatient("Appointment conflict patient");
      await request("reception", "POST", "/hospital/appointments", keyed({ ...body, patient_id: second.id, scheduled_at: new Date(Date.parse(scheduled) + 15 * 60000).toISOString() }), 409);
      await request("reception", "POST", "/hospital/appointments", keyed({ ...body, department_id: "dept-emergency" }), 400);
      await request("reception", "POST", "/hospital/appointments", keyed({ ...body, doctor_id: "nurse" }), 400);
      const checkIn = keyed({ version: appointment.version });
      appointment = await request("reception", "POST", `/hospital/appointments/${appointment.id}/check-in`, checkIn);
      encounter = appointment.encounter;
      assert.equal(encounter.encounter_type, "outpatient");
      assert.equal(encounter.patient_id, patient.id);
      assert.equal(encounter.reason, undefined);
      assert.equal((await request("reception", "POST", `/hospital/appointments/${appointment.id}/check-in`, checkIn)).admission_id, encounter.id);
      assert.equal((await one(db, "SELECT count(*)::int n FROM admissions WHERE patient_id=$1", [patient.id])).n, 1);
      assert.equal((await one(db, "SELECT count(*)::int n FROM charges WHERE admission_id=$1", [encounter.id])).n, 0);
      await request("reception", "POST", `/hospital/appointments/${appointment.id}/transition`, keyed({ version: appointment.version, status: "completed" }), 409);
      await request("reception", "POST", `/hospital/appointments/${appointment.id}/transition`, keyed({ version: appointment.version, status: "cancelled", reason: "Attempt while encounter active" }), 409);
    });

    await t.test("clinic to emergency to ward retains the same orders, charges and patient identity", async () => {
      const order = await request("doctor", "POST", `/admissions/${encounter.id}/orders`, keyed({ type: "procedure", name: "Hospital integration procedure" }), 201);
      const price = await one(db, "SELECT id FROM prices ORDER BY created_at LIMIT 1");
      const charge = await request("accountant", "POST", `/admissions/${encounter.id}/charges`, keyed({ price_id: price.id, quantity: 1 }), 201);
      const emergencyBody = keyed({ version: encounter.version, department_id: "dept-emergency", encounter_type: "emergency", nurse_id: "nurse", reason: "Emergency assessment" });
      encounter = await request("reception", "POST", `/hospital/encounters/${encounter.id}/transfer`, emergencyBody);
      assert.equal((await request("reception", "POST", `/hospital/encounters/${encounter.id}/transfer`, emergencyBody)).version, encounter.version);
      await request("reception", "POST", `/hospital/encounters/${encounter.id}/triage`, keyed({ version: encounter.version, triage_level: "urgent" }), 403);
      encounter = await request("nurse", "POST", `/hospital/encounters/${encounter.id}/triage`, keyed({ version: encounter.version, triage_level: "urgent", notes: "Private triage assessment" }));
      assert.equal(encounter.triage_level, "urgent");
      await insert(db, "beds", { id: "ward-bed", name: "Hospital ward bed", room: "Ward", status: "available", care_level: "inpatient", department_id: "dept-inpatient" });
      await request("reception", "POST", `/hospital/encounters/${encounter.id}/transfer`, keyed({ version: encounter.version, department_id: "dept-inpatient", encounter_type: "inpatient", bed_id: "bed-9", reason: "Incorrect department" }), 400);
      const ward = keyed({ version: encounter.version, department_id: "dept-inpatient", encounter_type: "inpatient", bed_id: "ward-bed", reason: "Admit to ward" });
      encounter = await request("reception", "POST", `/hospital/encounters/${encounter.id}/transfer`, ward);
      await request("reception", "POST", `/hospital/encounters/${encounter.id}/transfer`, keyed({ ...ward, bed_id: null }), 409);
      const chart = await request("doctor", "GET", `/patients/${patient.id}`);
      assert.equal(chart.admission.id, encounter.id);
      assert.equal(chart.orders.find((o: any) => o.id === order.id).admission_id, encounter.id);
      const bill = await request("accountant", "GET", `/billing/admissions/${encounter.id}`);
      assert.equal(bill.charges.find((c: any) => c.id === charge.id).admission_id, encounter.id);
      assert.equal((await one(db, "SELECT status FROM beds WHERE id='ward-bed'")).status, "occupied");
      assert.equal((await one(db, "SELECT count(*)::int n FROM admissions WHERE patient_id=$1", [patient.id])).n, 1);
      assert.equal((await one(db, "SELECT count(*)::int n FROM hospital_department_movements WHERE admission_id=$1", [encounter.id])).n, 2);
      const timeline = await request("doctor", "GET", `/hospital/patients/${patient.id}/timeline`);
      assert.equal(timeline.events.filter((e: any) => e.kind === "department_transfer").length, 2);
      assert.equal(timeline.events.filter((e: any) => e.kind === "triage").length, 1);
      assert.equal(timeline.events.find((e: any) => e.kind === "admission").department_id, "dept-outpatient");
      const dept = (await request("admin", "GET", "/hospital/departments")).find((d: any) => d.id === "dept-inpatient");
      await request("admin", "PATCH", `/hospital/departments/${dept.id}`, { version: dept.version, active: false }, 409);
    });

    await t.test("occupied beds reject a second admission and moving out marks the old bed for cleaning", async () => {
      const before = await one(db, "SELECT * FROM admissions WHERE id='admission-1'");
      await request("reception", "POST", "/hospital/encounters/admission-1/transfer", keyed({ version: before.version, department_id: "dept-inpatient", encounter_type: "inpatient", bed_id: "ward-bed", reason: "Occupied bed must reject" }), 409);
      assert.equal((await one(db, "SELECT bed_id FROM admissions WHERE id='admission-1'")).bed_id, before.bed_id);
      const moved = await request("reception", "POST", `/hospital/encounters/${encounter.id}/transfer`, keyed({ version: encounter.version, department_id: "dept-icu", encounter_type: "icu", reason: "Transfer awaiting assigned ICU bed" }));
      assert.equal(moved.id, encounter.id);
      assert.equal((await one(db, "SELECT status FROM beds WHERE id='ward-bed'")).status, "cleaning");
      assert.equal((await one(db, "SELECT count(*)::int n FROM admissions WHERE bed_id='ward-bed' AND status='active'")).n, 0);
      encounter = moved;
      const sameDepartment = await one(db, "SELECT * FROM admissions WHERE id='admission-2'");
      const reassigned = await request("reception", "POST", "/hospital/encounters/admission-2/transfer", keyed({ version: sameDepartment.version, department_id: "dept-nicu", encounter_type: "nicu", nurse_id: "head_nurse", reason: "Change nurse within the same department" }));
      assert.equal(reassigned.bed_id, sameDepartment.bed_id);
      assert.equal((await one(db, "SELECT status FROM beds WHERE id=$1", [sameDepartment.bed_id])).status, "occupied");
    });

    await t.test("hospital views obey clinical assignment and redact clinical content for reception", async () => {
      const doctor = await one(db, "SELECT * FROM users WHERE id='doctor'");
      await insert(db, "users", { id: "doctor-other", name: "Unassigned doctor", username: "doctor-other", role: "doctor", password_hash: doctor.password_hash });
      const scoped = await request("doctor-other", "GET", "/hospital/overview");
      assert.equal(scoped.encounters.length, 0);
      assert.equal(scoped.appointments.length, 0);
      assert.equal(scoped.departments.reduce((n: number, d: any) => n + d.active_encounters, 0), 0);
      await request("doctor-other", "GET", `/hospital/patients/${patient.id}/timeline`, undefined, 404);
      await request("doctor-other", "POST", `/hospital/encounters/${encounter.id}/triage`, keyed({ version: encounter.version, triage_level: "urgent" }), 404);
      const reception = await request("reception", "GET", "/hospital/overview");
      for (const a of reception.encounters) for (const key of ["reason", "diagnosis", "summary", "triage_level"]) assert.equal(a[key], undefined);
      for (const ap of reception.appointments) assert.equal(ap.notes, undefined);
      const timeline = await request("reception", "GET", `/hospital/patients/${patient.id}/timeline`);
      assert.equal(timeline.events.some((e: any) => e.kind === "triage"), false);
      assert.equal(timeline.events.some((e: any) => "reason" in e || "notes" in e), false);
      assert.equal((await all(db, "SELECT admission_id FROM hospital_department_movements WHERE admission_id=$1", [encounter.id])).length, 3);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
