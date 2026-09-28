import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

test(
  "manual journal UI links each cash line to its selected money account and honors server capabilities",
  { timeout: 90000 },
  async () => {
    const html = `<!doctype html><html><body><div id="root"></div><script type="module">
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import AccountingWorkspace from '/src/AccountingWorkspace.tsx'; import TreasuryPanel from '/src/TreasuryPanel.tsx';
    import {setLanguage} from '/src/i18n.ts'; setLanguage('en');
    const root = createRoot(document.getElementById('root'));
    window.renderTest = (name) => root.render(React.createElement({AccountingWorkspace,TreasuryPanel}[name],{can:()=>true,revision:0,openForm:()=>{}}));
    window.renderTest('AccountingWorkspace');
  </script></body></html>`;
    const vite = await createServer({
      configFile: false,
      cacheDir: `.runtime/tests/vite-accounting-navigation-${process.pid}`,
      plugins: [
        react(),
        {
          name: "accounting-navigation-test",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/__accounting-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml("/__accounting-test", html),
              );
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    await vite.listen();
    const address = vite.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    const page = await browser.newPage();
    const posted: any[] = [],
      errors: string[] = [];
    let approveCapability = false;
    let dropNextWrite = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (request.method() === "POST") {
        posted.push({ path: url.pathname, body: request.postDataJSON() });
        if (dropNextWrite) {
          dropNextWrite = false;
          return route.abort("failed");
        }
        return route.fulfill({ json: { id: "saved" } });
      }
      if (url.pathname === "/api/accounting")
        return route.fulfill({
          json: {
            capabilities: {
              approve_journals: approveCapability,
              reverse_journals: approveCapability,
              reopen_periods: approveCapability,
            },
            summary: { entries: 0, debit: 0, credit: 0, supplier_due: 0 },
            accounts: [
              {
                id: "ledger-money",
                code: "1000",
                name_en: "Money",
                active: true,
                system_key: "money",
              },
              {
                id: "expense",
                code: "6000",
                name_en: "Expense",
                active: true,
                system_key: "maintenance_expense",
              },
            ],
            cost_centers: [],
            supplier_invoices: [
              {
                id: "supplier-invoice",
                supplier_name: "Supplier",
                invoice_no: "SI-1",
                amount: 100,
                paid: 0,
                outstanding: 100,
              },
            ],
            payroll_due: [
              {
                id: "payroll",
                month: "2026-08",
                amount: 100,
                paid: 0,
                outstanding: 100,
              },
            ],
            journals: [],
            manual_journals: [
              { id: "draft", journal_no: "DRAFT", status: "draft", amount: 25 },
              {
                id: "posted",
                journal_no: "POSTED",
                status: "posted",
                amount: 25,
              },
            ],
            periods: [{ id: "closed", month: "2026-08", status: "closed" }],
          },
        });
      if (url.pathname === "/api/treasury")
        return route.fulfill({
          json: {
            accounts: [
              {
                id: "cash",
                name: "Main cash",
                active: true,
                kind: "cash",
                balance: 100,
              },
              {
                id: "bank",
                name: "Operating bank",
                active: true,
                kind: "bank",
                balance: 200,
              },
              {
                id: "closed-bank",
                name: "Closed bank",
                active: false,
                kind: "bank",
                balance: 0,
              },
            ],
            unallocated: {
              payment_count: 1,
              total: 115,
              by_method: [{ method: "card", amount: 100 }],
              manual_journals: {
                line_count: 2,
                debit: 20,
                credit: 5,
                total: 15,
              },
            },
            transfers: [],
          },
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected test request" },
      });
    });
    try {
      await page.goto(`http://127.0.0.1:${address.port}/__accounting-test`);
      await expect(
        page.getByRole("button", { name: "Manual journal", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("button", { name: "Approve", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Reverse", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Periods and closing", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Reopen", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Manual journal", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Amount", { exact: true }).fill("25");
      await dialog
        .getByLabel("Description", { exact: true })
        .fill("Journal for an identified bank account");
      await dialog.locator('[name="debit_account"]').selectOption("expense");
      await dialog
        .locator('[name="credit_account"]')
        .selectOption("ledger-money");
      await expect(
        dialog.locator('[name="credit_money_account_id"]'),
      ).toBeVisible();
      await expect(
        dialog.locator('[name="credit_money_account_id"]'),
      ).toHaveAttribute("required", "");
      await expect(dialog.locator('option[value="closed-bank"]')).toHaveCount(
        0,
      );
      await expect(
        dialog.locator('[name="debit_money_account_id"]'),
      ).toHaveCount(0);
      await dialog
        .locator('[name="credit_money_account_id"]')
        .selectOption("bank");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      assert.equal(posted[0].path, "/api/accounting/manual-journals");
      assert.equal(posted[0].body.lines[1].money_account_id, "bank");
      assert.ok(!("money_account_id" in posted[0].body.lines[0]));
      await page
        .getByRole("button", { name: "Manual journal", exact: true })
        .click();
      await dialog
        .locator('[name="debit_account"]')
        .selectOption("ledger-money");
      await dialog
        .locator('[name="debit_money_account_id"]')
        .selectOption("cash");
      await dialog.locator('[name="debit_account"]').selectOption("expense");
      await expect(
        dialog.locator('[name="debit_money_account_id"]'),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      for (const [tab, endpoint] of [
        ["Suppliers", "/api/accounting/supplier-payments"],
        ["Periods and closing", "/api/accounting/payroll-payments"],
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        await page.getByRole("button", { name: "Pay", exact: true }).click();
        await dialog.locator('[name="amount"]').fill("10");
        await dialog.locator('[name="reference"]').fill("Receipt retry check");
        dropNextWrite = true;
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await expect(page.locator(".error-box")).toBeVisible();
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        const calls = posted.filter((request) => request.path === endpoint);
        assert.equal(calls.length, 2);
        assert.equal(
          calls[0].body.idempotency_key,
          calls[1].body.idempotency_key,
          `${endpoint}: repeat saves must share one key`,
        );
        assert.equal(calls[1].body.money_account_id, "cash");
      }
      approveCapability = true;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByRole("button", { name: "Journal", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Approve", exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Reverse", exact: true }),
      ).toHaveCount(1);
      await page.evaluate(() => (window as any).renderTest("TreasuryPanel"));
      await expect(
        page.locator(".info-box").filter({ hasText: "Electronic collections" }),
      ).toContainText("100.00 EGP");
      await expect(
        page
          .locator(".info-box")
          .filter({ hasText: "Historical cash journals" }),
      ).toContainText(
        "2 lines; debit 20.00 EGP, credit 5.00 EGP, net 15.00 EGP",
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await vite.close();
    }
  },
);
