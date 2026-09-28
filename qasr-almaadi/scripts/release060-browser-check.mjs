import { chromium, expect } from "@playwright/test";
import fs from "node:fs";

const origin = "https://child.egsystem.net";
const password = fs.readFileSync("output/PRIVATE-HOST-ACCESS.txt", "utf8").match(/^Initial password: (.+)$/m)?.[1];
if (!password) throw Error("Access file missing");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [], errors = [], blockedWrites = [];
async function open(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/cdn-cgi/rum") return route.abort();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !(url.origin === origin && url.pathname === "/api/login")) {
      blockedWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[name=username]").fill(role);
  await page.locator("[name=password]").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.locator(".sidebar nav")).toBeVisible();
  return { context, page };
}
try {
  const admin = await open("admin");
  await admin.page.locator(".sidebar").getByRole("button", { name: "الإعدادات", exact: true }).click();
  await admin.page.getByRole("button", { name: "المستخدمون والأدوار", exact: true }).click();
  await expect(admin.page.getByRole("heading", { name: "حسابات المستخدمين", exact: true })).toBeVisible();
  await expect(admin.page.getByRole("button", { name: "تعديل الحساب", exact: true }).first()).toBeVisible();
  await expect(admin.page.getByRole("button", { name: "حذف", exact: true }).first()).toBeVisible();
  await admin.page.getByRole("button", { name: "مستخدم جديد", exact: true }).click();
  await expect(admin.page.getByRole("dialog")).toContainText("8 خانات على الأقل");
  await admin.context.close();
  checks.push("User create/edit/delete controls and 8-character password rule");

  const manager = await open("manager");
  await manager.page.locator("[data-page=attendance]").click();
  await manager.page.getByRole("button", { name: "الموظفون", exact: true }).click();
  await manager.page.getByRole("button", { name: "إضافة موظف", exact: true }).click();
  for (const name of ["job_type", "department", "daily_work_hours", "work_days_per_month", "monthly_salary", "absence_deduction", "overtime_hour_rate"])
    await expect(manager.page.getByRole("dialog").locator(`[name="${name}"]`)).toBeVisible();
  await manager.page.getByRole("dialog").getByRole("button", { name: "إغلاق", exact: true }).click();
  await manager.page.getByRole("button", { name: "تسليم الشيفتات", exact: true }).click();
  await expect(manager.page.getByRole("heading", { name: "سجل تسليم الشيفتات", exact: true })).toBeVisible();
  await manager.context.close();
  checks.push("Employee profile, individual payroll rules and shift handovers");

  const reception = await open("reception");
  await reception.page.locator("[data-page=beds]").click();
  await expect(reception.page.getByRole("button", { name: /تسكين طفل في حضّانة متاحة/ })).toBeVisible();
  await reception.context.close();
  checks.push("Reception sees available-incubator admission action");

  expect(blockedWrites).toEqual([]);
  expect(errors).toEqual([]);
  const health = await fetch(origin + "/api/health").then((response) => response.json());
  const result = { status: "PASS", release: health.release, roles: ["admin", "manager", "reception"], checks, blockedWrites, pageErrors: errors.length };
  fs.writeFileSync("docs/release-0.6.0-browser-results.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
