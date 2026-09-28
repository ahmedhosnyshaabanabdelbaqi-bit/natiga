import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import { defaultRoles } from "../server/security.js";

test(
  "all role sections load without rejected API requests and cross-section links keep the admission",
  { timeout: 240000 },
  async () => {
    delete process.env.DATABASE_URL;
    delete process.env.UPDATE_ROOT;
    delete process.env.TRAINING_PASSWORD;
    delete process.env.PUBLIC_DEMO_ACCOUNTS;
    const db = await initDb(":memory:");
    const app = await createApp(db, { seed: true });
    await db.query(
      "INSERT INTO admissions(id,admission_no,patient_id,admitted_at,discharged_at,status,doctor_id,nurse_id) VALUES('navigation-history','ADM-NAV-HISTORY','patient-1','2025-01-01','2025-01-02','discharged','doctor','nurse')",
    );
    await db.query(
      "INSERT INTO tasks(id,title,admission_id,due_at,status,assignee_id) VALUES('navigation-task','Historical admission follow-up','navigation-history','2025-01-03','pending','nurse')",
    );
    await db.query(
      "INSERT INTO tasks(id,title,admission_id,due_at,status,assignee_id) VALUES('navigation-regular','Independent care task','admission-1','2026-01-03','pending','nurse'),('navigation-cancelled','Cancelled care task','admission-1','2026-01-03','cancelled','nurse')",
    );
    const server = createHttpServer(app);
    const vite = await createServer({
      configFile: false,
      cacheDir: `.runtime/tests/vite-section-navigation-${process.pid}`,
      plugins: [react()],
      server: { middlewareMode: true, hmr: false, ws: { server } },
      logLevel: "error",
    });
    app.use(vite.middlewares);
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    const rejected: string[] = [],
      errors: string[] = [];
    const socketPorts: string[] = [];
    let visits = 0;
    try {
      for (const role of Object.keys(defaultRoles)) {
        const context = await browser.newContext();
        const page = await context.newPage();
        let section = "login";
        page.on("pageerror", (error) =>
          errors.push(`${role}/${section}: ${error.message}`),
        );
        page.on("websocket", socket => socketPorts.push(new URL(socket.url()).port));
        page.on("response", (response) => {
          if (response.url().includes("/api/") && response.status() >= 400)
            rejected.push(
              `${role}/${section}: ${response.status()} ${new URL(response.url()).pathname}`,
            );
        });
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.locator('[name="username"]').fill(role);
        await page.locator('[name="password"]').fill("Training@2026");
        await page
          .getByRole("button", { name: "تسجيل الدخول", exact: true })
          .click();
        await expect(page.locator(".sidebar nav")).toBeVisible();
        const sections = await page
          .locator(".sidebar nav button[data-page]")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-page")!),
          );
        for (const key of sections) {
          section = key;
          await page.locator(`.sidebar nav button[data-page="${key}"]`).click();
          await page.waitForLoadState("networkidle");
          assert.deepEqual(
            await page.locator(".error-box:visible").allTextContents(),
            [],
            `${role}/${key} shows an error`,
          );
          visits++;
        }
        if (role === "admin") {
          section = "task-link";
          await page.locator('[data-page="dashboard"]').click();
          await page
            .getByRole("button", { name: /Historical admission follow-up/ })
            .click();
          await expect(
            page.locator(".patient-view .identity-banner"),
          ).toBeVisible();
          assert.equal(
            new URLSearchParams(
              await page.evaluate(() => location.hash.slice(1)),
            ).get("admission"),
            "navigation-history",
          );
          await page.locator('[data-page="tasks"]').click();
          await expect(
            page
              .locator("tbody tr")
              .filter({ hasText: "Cancelled care task" })
              .getByRole("button", { name: "تحديث الحالة", exact: true }),
          ).toHaveCount(0);
          await page
            .locator("tbody tr")
            .filter({ hasText: "Independent care task" })
            .getByRole("button", { name: "تحديث الحالة", exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await expect(dialog.locator('[name="status"]')).toBeVisible();
          assert.deepEqual(
            await dialog
              .locator('[name="status"] option')
              .evaluateAll((options) =>
                options
                  .map((option) => (option as HTMLOptionElement).value)
                  .filter(Boolean),
              ),
            ["completed", "deferred", "cancelled"],
          );
          await dialog.locator('[name="status"]').selectOption("deferred");
          await dialog
            .locator('[name="reason"]')
            .fill("Follow-up scheduled for next shift");
          await dialog
            .getByRole("button", { name: "حفظ السجل", exact: true })
            .click();
          await expect(dialog).toHaveCount(0);
          assert.equal(
            (
              await db.query(
                "SELECT status FROM tasks WHERE id='navigation-regular'",
              )
            ).rows[0].status,
            "deferred",
          );
          await page
            .getByRole("button", { name: "توثيق تنفيذ الأمر", exact: true })
            .first()
            .click();
          await expect(page.locator(".tabs button.active")).toHaveText(
            "الأوامر والأدوية",
          );
          const orderAdmission = new URLSearchParams(
            await page.evaluate(() => location.hash.slice(1)),
          ).get("admission");
          await page
            .locator(".tabs")
            .getByRole("button", { name: "التمريض والمتابعة", exact: true })
            .click();
          await page
            .getByRole("button", { name: "توثيق تنفيذ الأمر", exact: true })
            .first()
            .click();
          await expect(page.locator(".tabs button.active")).toHaveText(
            "الأوامر والأدوية",
          );
          assert.equal(
            new URLSearchParams(
              await page.evaluate(() => location.hash.slice(1)),
            ).get("admission"),
            orderAdmission,
          );
          await page.reload();
          await expect(
            page.locator(".patient-view .identity-banner"),
          ).toBeVisible();
          await page.locator('[data-page="tasks"]').click();
          await page
            .locator("tbody tr")
            .filter({ hasText: "Historical admission follow-up" })
            .getByRole("button", { name: /طفل/ })
            .click();
          await expect(
            page.locator(".patient-view .identity-banner"),
          ).toBeVisible();
          assert.equal(
            new URLSearchParams(
              await page.evaluate(() => location.hash.slice(1)),
            ).get("admission"),
            "navigation-history",
          );
        }
        if (role === "admin") {
          section = "journal-treasury-link";
          const before = await (
            await page.request.get(origin + "/api/treasury")
          ).json();
          const chart = (
            await db.query(
              "SELECT id,system_key FROM chart_accounts WHERE system_key IN ('money','maintenance_expense')",
            )
          ).rows;
          await page.locator('[data-page="accounts"]').click();
          const accounting = page.locator(".accounting-workspace");
          await accounting
            .getByRole("button", { name: "قيد يدوي", exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await dialog
            .locator('[name="debit_account"]')
            .selectOption(
              chart.find((row) => row.system_key === "maintenance_expense")!.id,
            );
          await dialog
            .locator('[name="credit_account"]')
            .selectOption(chart.find((row) => row.system_key === "money")!.id);
          await dialog
            .locator('[name="credit_money_account_id"]')
            .selectOption("cash");
          await dialog.locator('[name="amount"]').fill("12.50");
          await dialog
            .locator('[name="description"]')
            .fill("Navigation journal links to treasury");
          const journalKeys: string[] = [];
          let dropJournalResponse = true;
          await page.route(
            "**/api/accounting/manual-journals",
            async (route) => {
              journalKeys.push(route.request().postDataJSON().idempotency_key);
              if (dropJournalResponse) {
                dropJournalResponse = false;
                const response = await route.fetch();
                assert.equal(response.status(), 201);
                await route.abort("failed");
              } else await route.continue();
            },
          );
          await dialog
            .getByRole("button", { name: "حفظ", exact: true })
            .click();
          await expect(accounting.locator(".error-box")).toBeVisible();
          await expect(dialog).toBeVisible();
          await dialog
            .getByRole("button", { name: "حفظ", exact: true })
            .click();
          await expect(dialog).toHaveCount(0);
          assert.equal(journalKeys.length, 2);
          assert.equal(
            journalKeys[0],
            journalKeys[1],
            "Retry after a committed but lost response must reuse its key",
          );
          assert.equal(
            (
              await db.query(
                "SELECT count(*)::int count FROM manual_journals WHERE description='Navigation journal links to treasury'",
              )
            ).rows[0].count,
            1,
          );
          await page.unroute("**/api/accounting/manual-journals");
          const row = accounting
            .locator("tbody tr")
            .filter({ hasText: "Navigation journal links to treasury" });
          await row
            .getByRole("button", { name: "اعتماد", exact: true })
            .click();
          await expect(
            row.getByRole("button", { name: "عكس القيد", exact: true }),
          ).toBeVisible();
          await page.locator('[data-page="treasury"]').click();
          await page.waitForLoadState("networkidle");
          const after = await (
            await page.request.get(origin + "/api/treasury")
          ).json();
          assert.equal(
            Number(after.cash_balance),
            Number(before.cash_balance) - 12.5,
          );
        }
        if (role === "accountant") {
          await page.locator('[data-page="accounts"]').click();
          await expect(
            page
              .locator(".accounting-workspace tbody tr")
              .filter({ hasText: "Navigation journal links to treasury" })
              .first(),
          ).toBeVisible();
          await expect(
            page
              .locator(".accounting-workspace")
              .getByRole("button", { name: "عكس القيد", exact: true }),
          ).toHaveCount(0);
        }
        if (role === "lab") {
          section = "lab-link";
          await page.locator('[data-page="labs"]').click();
          await page.locator(".patient-cell").first().click();
          await expect(page.locator(".tabs button.active")).toHaveText(
            "التحاليل والنتائج",
          );
          const params = new URLSearchParams(
            await page.evaluate(() => location.hash.slice(1)),
          );
          assert.ok(
            params.get("admission"),
            "laboratory link must preserve the selected row's admission",
          );
          await page.reload();
          await expect(page.locator(".tabs button.active")).toHaveText(
            "التحاليل والنتائج",
          );
        }
        await context.close();
      }
      assert.ok(socketPorts.length > 0, "Vite clients must open their test server WebSocket");
      assert.deepEqual([...new Set(socketPorts)], [new URL(origin).port], "Vite WebSockets must share this test's random HTTP port");
      assert.deepEqual(errors, [], "JavaScript errors");
      assert.deepEqual(
        rejected,
        [],
        "The permitted UI must not silently issue forbidden or failing API calls",
      );
      console.log(
        JSON.stringify({
          roles: Object.keys(defaultRoles).length,
          visits,
          rejectedApiRequests: rejected,
          jsErrors: errors,
          links: [
            "dashboard task → historical admission → reload",
            "task table → historical admission",
            "task deferral → saved server state",
            "order-linked task → administration workspace",
            "nursing task → administration workspace",
            "laboratory → admission results → reload",
            "manual cash journal → approval → treasury balance",
            "lost journal response → retry → one committed journal",
            "accountant capabilities hide manager-only journal actions",
          ],
        }),
      );
    } finally {
      await browser.close();
      await vite.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    }
  },
);
