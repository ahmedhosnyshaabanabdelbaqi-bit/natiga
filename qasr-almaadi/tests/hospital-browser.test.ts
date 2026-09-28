import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { initDb, one } from "../server/db.js";
import { createApp } from "../server/app.js";
import { insert } from "../server/seed.js";

test("hospital Arabic browser journey connects adult registration, appointments, care, services and billing", { timeout: 180000 }, async () => {
  delete process.env.DATABASE_URL;
  delete process.env.UPDATE_ROOT;
  delete process.env.TRAINING_PASSWORD;
  delete process.env.PUBLIC_DEMO_ACCOUNTS;
  const db = await initDb(":memory:");
  const app = await createApp(db, { seed: true });
  const server = createHttpServer(app);
  const vite = await createServer({ configFile: false, cacheDir: `.runtime/tests/vite-hospital-browser-${process.pid}`, plugins: [react()], server: { middlewareMode: true, hmr: false, ws: { server } }, logLevel: "error" });
  app.use(vite.middlewares);
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [], rejected: string[] = [];
  const socketPorts: string[] = [];
  const pages: Page[] = [];
  async function login(role: string) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage(); pages.push(page);
    page.on("pageerror", error => errors.push(`${role}: ${error.message}`));
    page.on("websocket", socket => socketPorts.push(new URL(socket.url()).port));
    page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 400) rejected.push(`${role}: ${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator('[name="username"]').fill(role);
    await page.locator('[name="password"]').fill("Training@2026");
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(page.locator(".sidebar nav")).toBeVisible();
    await expect(page.locator(".hospital-workspace .hospital-loading")).toHaveCount(0);
    return page;
  }
  async function choose(dialog: Locator, name: string, id: string) {
    const control = dialog.locator(`[name="${name}"]`);
    if (await control.evaluate(element => element.tagName === "SELECT")) await control.selectOption(id);
    else await control.fill(id);
  }
  async function save(page: Page, button = "حفظ السجل") {
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: button, exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  async function section(page: Page, key: string) {
    await page.locator(`.sidebar nav [data-page="${key}"]`).click();
    await expect(page.locator(".hospital-workspace")).toBeVisible();
    await expect(page.locator(".hospital-loading")).toHaveCount(0);
    await expect(page.locator(".error-box:visible")).toHaveCount(0);
  }
  try {
    const admin = await login("admin");
    for (const key of ["hospital", "appointments", "outpatient", "emergency", "inpatient", "radiology", "pharmacy", "surgery", "departments"]) {
      await expect(admin.locator(`.sidebar nav [data-page="${key}"]`)).toHaveCount(1);
      await section(admin, key);
    }
    await section(admin, "hospital");
    await admin.getByRole("button", { name: "إضافة مريض جديد", exact: true }).click();
    let dialog = admin.getByRole("dialog");
    await dialog.locator('[name="name"]').fill("مريض بالغ لاختبار ترابط المستشفى");
    await choose(dialog, "sex", "male");
    await dialog.locator('[name="birth_at"]').fill("1985-06-15");
    await dialog.locator('[name="phone"]').fill("01012345678");
    await dialog.locator('[name="registration_only"]').check();
    await save(admin, "حفظ ملف المريض");
    await expect(admin.locator(".patient-view .identity-banner")).toBeVisible();
    const patient = await one(db, "SELECT * FROM patients WHERE name=$1", ["مريض بالغ لاختبار ترابط المستشفى"]);
    assert.ok(patient); assert.equal(new Date(patient.birth_at).getFullYear(), 1985);
    assert.equal((await one(db, "SELECT count(*)::int n FROM admissions WHERE patient_id=$1", [patient.id])).n, 0);

    await section(admin, "appointments");
    await admin.getByRole("button", { name: "حجز موعد", exact: true }).click();
    dialog = admin.getByRole("dialog");
    await choose(dialog, "patient_id", patient.id);
    await choose(dialog, "department_id", "dept-outpatient");
    await choose(dialog, "doctor_id", "doctor");
    const scheduled = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16);
    await dialog.locator('[name="scheduled_at"]').fill(scheduled);
    await dialog.locator('[name="notes"]').fill("موعد اختبار الربط بالعيادة");
    await save(admin);
    let appointmentRow = admin.locator("tbody tr").filter({ hasText: patient.name });
    await appointmentRow.getByRole("button", { name: "حضور وفتح زيارة", exact: true }).click();
    await save(admin, "تسجيل الحضور");
    const appointment = await one(db, "SELECT * FROM hospital_appointments WHERE patient_id=$1", [patient.id]);
    assert.equal(appointment.status, "arrived"); assert.ok(appointment.admission_id);
    const admission = await one(db, "SELECT * FROM admissions WHERE id=$1", [appointment.admission_id]);
    assert.equal(admission.encounter_type, "outpatient"); assert.equal(admission.doctor_id, "doctor"); assert.equal(admission.bed_id, null);
    appointmentRow = admin.locator("tbody tr").filter({ hasText: patient.name });
    await appointmentRow.getByRole("button", { name: "الملف", exact: true }).click();
    await expect(admin.locator(".patient-view .identity-banner")).toBeVisible();
    assert.equal(new URLSearchParams(await admin.evaluate(() => location.hash.slice(1))).get("admission"), admission.id);
    await admin.locator(".tabs").getByRole("button", { name: "الأقسام والخدمات", exact: true }).click();
    await expect(admin.locator(".hospital-patient")).toBeVisible();
    await admin.getByRole("link", { name: "طلبات الأشعة", exact: true }).click();
    await expect(admin.locator(".hospital-workspace")).toBeVisible();
    await expect(admin.locator(".hospital-loading")).toHaveCount(0);
    assert.equal(new URLSearchParams(await admin.evaluate(() => location.hash.slice(1))).get("admission"), admission.id);
    await admin.getByRole("button", { name: "طلب أشعة", exact: true }).click();
    dialog = admin.getByRole("dialog");
    await expect(dialog.locator('[name="admission_id"]')).not.toHaveValue("");
    await dialog.locator('[name="name"]').fill("أشعة اختبار الترابط");
    await choose(dialog, "priority", "urgent");
    await save(admin);
    let radioRow = admin.locator("tbody tr").filter({ hasText: "أشعة اختبار الترابط" });
    for (const label of ["مجدول", "تم الفحص", "التقرير جاهز"]) {
      await radioRow.getByRole("button", { name: label, exact: true }).click();
      if (label === "التقرير جاهز") await admin.getByRole("dialog").locator('[name="result"]').fill("تقرير أدخله المختص لاختبار الربط بالملف.");
      await save(admin, "حفظ الإجراء");
      radioRow = admin.locator("tbody tr").filter({ hasText: "أشعة اختبار الترابط" });
    }
    const radiology = await one(db, "SELECT * FROM hospital_radiology WHERE admission_id=$1", [admission.id]);
    assert.equal(radiology.status, "reported");

    const radiologist = await login("radiologist");
    await section(radiologist, "radiology");
    await expect(radiologist.getByRole("button", { name: "طلب أشعة", exact: true })).toHaveCount(0);
    await expect(radiologist.locator("tbody tr").filter({ hasText: "أشعة اختبار الترابط" }).getByRole("button", { name: "تمت المراجعة", exact: true })).toHaveCount(0);
    const doctor = await login("doctor");
    await section(doctor, "radiology");
    await expect(doctor.getByRole("button", { name: "طلب أشعة", exact: true })).toBeVisible();
    await doctor.locator("tbody tr").filter({ hasText: "أشعة اختبار الترابط" }).getByRole("button", { name: "تمت المراجعة", exact: true }).click();
    await save(doctor, "حفظ الإجراء");
    assert.equal((await one(db, "SELECT status FROM hospital_radiology WHERE id=$1", [radiology.id])).status, "reviewed");

    const name = "دواء اختبار الصيدلية";
    const order = await insert(db, "orders", { id: randomUUID(), admission_id: admission.id, type: "medication", name, dose: 1, unit: "mL", route: "oral", frequency: "once", status: "approved", created_by: "doctor", approved_by: "doctor", approved_at: new Date().toISOString() });
    const item = await insert(db, "inventory", { id: randomUUID(), name, unit: "عبوة", batch: "BROWSER-001", expires_at: "2099-01-01", quantity: 5, cost: 4, location: "الصيدلية" });
    const medPrice = await insert(db, "prices", { id: randomUUID(), name, unit: "عبوة", category: "pharmacy", price: 9, valid_from: new Date(Date.now() - 86400000).toISOString() });
    const pharmacist = await login("pharmacist");
    await section(pharmacist, "pharmacy");
    const medicationRow = pharmacist.locator("tbody tr").filter({ hasText: name });
    await medicationRow.getByRole("button", { name: "صرف", exact: true }).click();
    dialog = pharmacist.getByRole("dialog");
    await dialog.locator('[name="patient_mrn"]').fill(patient.mrn);
    await choose(dialog, "item_id", item.id);
    await choose(dialog, "price_id", medPrice.id);
    await dialog.locator('[name="quantity"]').fill("2");
    await save(pharmacist);
    const dispense = await one(db, "SELECT * FROM pharmacy_dispenses WHERE order_id=$1", [order.id]);
    assert.ok(dispense); assert.equal(Number((await one(db, "SELECT quantity FROM inventory WHERE id=$1", [item.id])).quantity), 3);
    assert.equal(Number((await one(db, "SELECT amount FROM charges WHERE id=$1", [dispense.charge_id])).amount), 18);
    await pharmacist.locator("tbody tr").filter({ hasText: name }).last().getByRole("button", { name: "الملف", exact: true }).click();
    await expect(pharmacist.locator(".patient-view .identity-banner")).toBeVisible();
    assert.equal(new URLSearchParams(await pharmacist.evaluate(() => location.hash.slice(1))).get("admission"), admission.id);
    await pharmacist.locator(".tabs").getByRole("button", { name: "الأقسام والخدمات", exact: true }).click();
    await expect(pharmacist.locator(".hospital-patient")).toContainText(name);

    await section(admin, "surgery");
    await admin.getByRole("button", { name: "حجز عملية", exact: true }).click();
    dialog = admin.getByRole("dialog");
    await choose(dialog, "admission_id", admission.id);
    await dialog.locator('[name="name"]').fill("إجراء اختبار العمليات");
    await dialog.locator('[name="scheduled_at"]').fill(scheduled);
    await dialog.locator('[name="scheduled_end_at"]').fill(new Date(Date.now() + 2 * 86400000 + 3600000).toISOString().slice(0, 16));
    await dialog.locator('[name="theatre"]').fill("غرفة اختبار 1");
    await choose(dialog, "surgeon_id", "doctor");
    await save(admin);
    for (const label of ["جارٍ التنفيذ", "مكتمل", "تمت المراجعة"]) {
      await admin.locator("tbody tr").filter({ hasText: "إجراء اختبار العمليات" }).getByRole("button", { name: label, exact: true }).click();
      if (label === "مكتمل") await admin.getByRole("dialog").locator('[name="result"]').fill("توثيق اختبار العملية والنتيجة.");
      await save(admin, "حفظ الإجراء");
    }
    assert.equal((await one(db, "SELECT status FROM hospital_surgeries WHERE admission_id=$1", [admission.id])).status, "reviewed");

    await mkdir(".runtime/audit", { recursive: true });
    for (const key of ["hospital", "appointments", "outpatient", "emergency", "inpatient", "radiology", "pharmacy", "surgery", "departments"]) {
      await admin.setViewportSize({ width: 1440, height: 960 });
      await section(admin, key);
      if (key === "hospital") await admin.screenshot({ path: ".runtime/audit/hospital-desktop.png", fullPage: true });
      await admin.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => admin.locator(".sidebar").evaluate(element => element.getBoundingClientRect().left >= window.innerWidth - 1), { message: `${key} sidebar must finish hiding on mobile` }).toBe(true);
      await expect.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), { message: `${key} must fit a mobile viewport` }).toBe(true);
      if (["appointments", "surgery"].includes(key)) await admin.screenshot({ path: `.runtime/audit/hospital-mobile-${key}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(rejected, []);
    assert.ok(socketPorts.length > 0, "Vite clients must open their test server WebSocket");
    assert.deepEqual([...new Set(socketPorts)], [new URL(origin).port], "Vite WebSockets must share this test's random HTTP port");
    console.log(JSON.stringify({ roles: ["admin", "doctor", "radiologist", "pharmacist"], hospitalSections: 9, mobileWidth: 390, journey: ["adult registration", "appointment", "check-in", "encounter chart", "radiology acquisition/report/review", "pharmacy stock and invoice", "surgical documentation"], jsErrors: errors, rejectedApiRequests: rejected }));
  } finally {
    await browser.close(); await vite.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
