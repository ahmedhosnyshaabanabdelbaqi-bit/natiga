import { chromium, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results: any[] = [];
try {
  for (const role of [
    "admin",
    "manager",
    "doctor",
    "head_nurse",
    "nurse",
    "reception",
    "accountant",
    "insurance",
    "stock",
    "lab",
    "maintenance",
    "quality",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4310");
    await page.getByLabel("اسم المستخدم", { exact: true }).fill(role);
    await page.getByLabel("كلمة المرور", { exact: true }).fill("Training@2026");
    await page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await expect(page.locator(".sidebar nav")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const menu = page.locator(".sidebar nav button"),
      count = await menu.count();
    const pages: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = (await menu.nth(i).innerText()).trim();
      await menu.nth(i).click();
      await page.waitForLoadState("networkidle");
      const failures = await page
        .locator(".error-box:visible")
        .allTextContents();
      expect(failures, `${role} -> ${label}`).toEqual([]);
      pages.push(label);
    }
    expect(errors).toEqual([]);
    results.push({ role, pages, status: "PASS" });
    await context.close();
  }
} finally {
  writeFileSync(
    "docs/role-browser-results.json",
    JSON.stringify({ at: new Date().toISOString(), roles: results }, null, 2),
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    status: "PASS",
    roles: results.length,
    pages: results.reduce((n, r) => n + r.pages.length, 0),
  }),
);
