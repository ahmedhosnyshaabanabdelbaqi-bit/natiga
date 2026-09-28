import { chromium, expect } from "@playwright/test";
import fs from "node:fs";

const origin = "https://child.egsystem.net";
const password = fs.readFileSync("output/PRIVATE-HOST-ACCESS.txt", "utf8").match(/^Initial password: (.+)$/m)?.[1];
if (!password) throw Error("Access file missing");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function login(username) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/cdn-cgi/rum") return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("[name=username]").fill(username);
  await page.locator("[name=password]").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.locator(".sidebar nav")).toBeVisible();
  return { context, page };
}

try {
  const admin = await login("AdMiN");
  const session = await admin.context.request.get(origin + "/api/session").then(r => r.json());
  expect(session.user.role).toBe("admin");
  expect(session.user.permissions).toHaveLength(32);
  const roles = await admin.context.request.get(origin + "/api/roles").then(r => r.json());
  expect(roles.find(role => role.name === "admin").permissions).toHaveLength(32);
  expect(roles.find(role => role.name === "manager").permissions).toHaveLength(32);

  await admin.page.locator("[data-page=accounts]").click();
  await expect(admin.page.locator(".financial-center")).toBeVisible();
  for (const label of ["قائمة الدخل", "المركز المالي", "التدفقات النقدية", "ميزان المراجعة", "أعمار المديونيات"])
    await expect(admin.page.getByRole("button", { name: label, exact: true })).toBeVisible();
  const statement = await admin.context.request.get(origin + "/api/financial-statements?from=2026-01-01&end=2026-12-31");
  expect(statement.status()).toBe(200);
  const data = await statement.json();
  expect(data.trial.at(-1).debit).toBe(data.trial.at(-1).credit);
  const excel = await admin.context.request.get(origin + "/api/financial-statements?from=2026-01-01&end=2026-12-31&format=excel");
  expect(excel.status()).toBe(200);
  expect(excel.headers()["content-type"]).toContain("application/vnd.ms-excel");
  expect((await excel.text()).match(/<Worksheet/g)).toHaveLength(6);
  const pdf = await admin.context.request.get(origin + "/api/financial-statements?from=2026-01-01&end=2026-12-31&format=pdf&lang=en");
  expect(pdf.status()).toBe(200);
  expect(await pdf.text()).toContain("Print / Save PDF");
  await admin.page.screenshot({ path: "docs/screenshots/release-0.9.1-hosted-financial-center.png", fullPage: true });
  await admin.context.close();

  const manager = await login("manager");
  const managerSession = await manager.context.request.get(origin + "/api/session").then(r => r.json());
  expect(managerSession.user.permissions).toHaveLength(32);
  await manager.context.close();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ status: "PASS", release: "0.9.1", adminPermissions: 32, managerPermissions: 32, statements: 5, excelSheets: 6, pageErrors: 0 }));
} finally {
  await browser.close();
}
