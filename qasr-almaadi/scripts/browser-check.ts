import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import express from "express";
import path from "node:path";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

// This write-heavy acceptance journey always owns an isolated test database.
delete process.env.DATABASE_URL;
delete process.env.UPDATE_ROOT;
delete process.env.UPDATE_ENABLED;
delete process.env.TRAINING_PASSWORD;
delete process.env.PUBLIC_DEMO_ACCOUNTS;
const db = await initDb(":memory:");
const app = await createApp(db, { seed: true });
app.use(express.static(path.resolve("dist")));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
mkdirSync("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "ar-EG",
  timezoneId: "Africa/Cairo",
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const result: Record<string, unknown> = {
  at: new Date().toISOString(),
  url: base,
  checks: [],
};
const checks = result.checks as string[];
try {
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "أهلًا بك في مستشفى قصر المعادي" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("اسم المستخدم", { exact: true }).fill("manager");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("Training@2026");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "نظرة عامة", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "القسم في لمحة", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard-desktop.png",
    fullPage: true,
  });
  checks.push("Desktop login and dashboard load with real database values");
  await page.getByRole("button", { name: "الوضع الليلي", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "docs/screenshots/dashboard-dark.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "الوضع النهاري", exact: true })
    .click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  checks.push("Dark mode and Arabic/English direction toggles work");
  const infantName = `طفل اختبار واجهة ${Date.now()} — مصطنع`;
  await page
    .getByRole("button", { name: "إضافة مريض جديد", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("[name=name]").fill(infantName);
  await dialog.locator("[name=sex]").selectOption("male");
  await dialog.locator("[name=source]").selectOption({ label: "دخول مباشر" });
  await dialog
    .locator("[name=reason]")
    .fill("اختبار قبول واجهة ببيانات مصطنعة");
  const available = await dialog
    .locator("[name=bed_id] option")
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    );
  if (available.length)
    await dialog.locator("[name=bed_id]").selectOption(available[0]);
  await dialog.getByRole("button", { name: "إنشاء الملف وقبول الطفل" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".identity-banner h2")).toHaveText(infantName);
  const child = await page.evaluate(async (name) => {
    const rows = await (await fetch("/api/patients")).json();
    return rows.find((p: any) => p.name === name);
  }, infantName);
  expect(child?.id).toBeTruthy();
  result.synthetic_test_patient = { id: child.id, mrn: child.mrn };
  checks.push(
    "Urgent admission form saves child, admission and bed; persistent identity updates",
  );
  await page
    .getByRole("button", { name: "التمريض والمتابعة", exact: true })
    .click();
  await page.getByRole("button", { name: "تسجيل قياسات", exact: true }).click();
  await dialog.locator("[name=temperature]").fill("36.8");
  await dialog.locator("[name=weight]").fill("2100");
  await dialog
    .locator("[name=notes]")
    .fill("اختبار فقد الاستجابة بعد نجاح الحفظ");
  let intercepted = false;
  await page.route("**/api/admissions/*/vitals", async (route) => {
    if (!intercepted && route.request().method() === "POST") {
      intercepted = true;
      await route.fetch();
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "حفظ السجل", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.locator("[name=weight]")).toHaveValue("2100");
  await dialog.getByRole("button", { name: "حفظ السجل", exact: true }).click();
  await expect(dialog).toBeHidden();
  const detail = await page.evaluate(
    async (id) => await (await fetch("/api/patients/" + id)).json(),
    child.id,
  );
  expect(
    detail.vitals.filter(
      (v: any) => v.notes === "اختبار فقد الاستجابة بعد نجاح الحفظ",
    ),
  ).toHaveLength(1);
  checks.push(
    "Lost response after server commit retains inputs; same-key retry yields exactly one vital record",
  );
  await page.unroute("**/api/admissions/*/vitals");
  await page.screenshot({
    path: "docs/screenshots/patient-nursing.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "المرفقات", exact: true }).click();
  await expect(
    page.getByText("مرفقات الإقامة", { exact: false }).first(),
  ).toBeVisible();
  checks.push("Attachments tab loads scoped server records");
  const printPage = await context.newPage();
  await printPage.goto(
    base +
      "/api/print/wristband?admission_id=" +
      encodeURIComponent(detail.admission.id),
  );
  await expect(printPage.locator("svg")).toBeVisible();
  await printPage.screenshot({
    path: "docs/screenshots/wristband-print.png",
    fullPage: true,
  });
  await printPage.pdf({
    path: "docs/sample-wristband.pdf",
    format: "A4",
    printBackground: true,
  });
  await printPage.close();
  checks.push("Arabic wristband print renders a real barcode and exports PDF");
  await page
    .getByRole("button", { name: "العودة إلى الأطفال", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "الأسرة والحضّانات", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "العناية المركزة أ", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/bed-map.png",
    fullPage: true,
  });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "الحسابات والفواتير", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "دفتر محاسبي موحّد لكل الأقسام", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".accounting-workspace"),
  ).toBeVisible();
  checks.push("Bed map and billing navigate to connected data");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "القائمة", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "نظرة عامة", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "القسم في لمحة" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
  checks.push("390px mobile layout has navigation and no page overflow");
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return !!registration?.active && !!navigator.serviceWorker.controller;
  })).toBe(true);
  const cachedPaths = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith("qasr-nicu-shell-"));
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat();
  });
  expect(cachedPaths).toContain("/index.html");
  expect(cachedPaths.some(path => /^\/(api|auth|attachments|print|uploads)(\/|$)/.test(path))).toBe(false);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "تعذّر الاتصال بالخادم حاليًا", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { try { await fetch("/api/patients"); return true; } catch { return false; } })).toBe(false);
  await context.setOffline(false);
  // The online event retries the session automatically; the retry button disappears.
  await expect(page.locator(".sidebar nav")).toBeVisible();
  checks.push("Offline reload shows help, never cached patient/API data; reconnect restores the server session");
  expect(errors).toEqual([]);
  result.status = "PASS";
  result.javascript_errors = errors;
} catch (error) {
  result.status = "FAIL";
  result.error = String(error);
  await page.screenshot({
    path: "docs/screenshots/failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  writeFileSync("docs/browser-results.json", JSON.stringify(result, null, 2));
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.close();
}
console.log(JSON.stringify(result, null, 2));
