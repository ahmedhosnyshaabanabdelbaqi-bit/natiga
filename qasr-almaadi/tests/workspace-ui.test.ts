import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

test(
  "workspace links preserve admission context, cancel stale invoices and respect tab permissions",
  { timeout: 120000 },
  async () => {
    const html = `<!doctype html><html><body><div id="test-root"></div><script type="module">
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {Operations} from '/src/Pages.tsx'; import Patient from '/src/Patient.tsx'; import Updates from '/src/Updates.tsx';
    import {setLanguage} from '/src/i18n.ts';
    setLanguage('en'); const root=createRoot(document.getElementById('test-root'));
    window.testRender=(name,props)=>{ const Component={Operations,Patient,Updates}[name]; root.render(React.createElement(Component,{...props,can:p=>(props.permissions||[]).includes(p),setForm:f=>window.testForm=f,openForm:f=>window.testForm=f,openPatient:(...a)=>window.testOpened=a,print:(...a)=>window.testPrinted=a,navigate:p=>window.testNavigated=p,exportData:()=>{},refresh:()=>{},notify:()=>{},back:()=>{}})); }; window.testReady=true;
  </script></body></html>`;
    const vite = await createServer({
      configFile: false,
      plugins: [
        react(),
        {
          name: "workspace-test-harness",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/__workspace-test") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml("/__workspace-test", html),
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
    const errors: string[] = [],
      calls: { method: string; path: string; body: any }[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let releaseOld: (() => void) | undefined;
    let delayOld = true;
    const admissions = [
      {
        id: "old-admission",
        patient_id: "infant",
        patient_name: "Historical Infant",
        admission_no: "ADM-OLD",
        status: "discharged",
        charged: 25.75,
        paid: 10,
      },
      {
        id: "new-admission",
        patient_id: "infant",
        patient_name: "Current Infant",
        admission_no: "ADM-NEW",
        status: "active",
        charged: 38,
        paid: 20,
      },
    ];
    const permissions = [
      "patients.read",
      "billing.read",
      "billing.write",
      "consumables.read",
      "print",
    ];
    const financial = {
      page: "invoices",
      users: [],
      permissions,
      data: {
        billing: {
          admissions,
          totals: { charged: 63.75, paid: 30, balance: 33.75 },
          payments: [],
        },
      },
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      calls.push({
        method: request.method(),
        path: url.pathname + url.search,
        body: request.postDataJSON(),
      });
      const invoiceId = /^\/api\/billing\/admissions\/(.*)$/.exec(
        url.pathname,
      )?.[1];
      if (invoiceId) {
        if (invoiceId === "old-admission" && delayOld)
          await new Promise<void>((resolve) => {
            releaseOld = resolve;
          });
        const admission = admissions.find((item) => item.id === invoiceId)!;
        return route.fulfill({
          json: {
            invoice_no: "INV-" + admission.admission_no,
            admission: {
              ...admission,
              mrn: "MRN-ONLY",
              guardian_name: "Guardian",
              admitted_at: "2026-09-01T09:00:00Z",
            },
            charges: [],
            consumables: [],
            payments: [
              {
                id: "receipt-id",
                receipt_no: "REC-1",
                amount: 10.25,
                method: "cash",
              },
            ],
            totals: {
              charged: admission.charged,
              paid: admission.paid,
              balance: admission.charged - admission.paid,
            },
          },
        });
      }
      if (url.pathname === "/api/prices")
        return route.fulfill({
          json: [
            { id: "service", name: "Independent service", price: 12.75 },
            {
              id: "consumable",
              name: "Stock-linked item",
              price: 5,
              consumable_id: "catalog",
            },
          ],
        });
      if (url.pathname === "/api/patients/infant") {
        const admission =
          admissions.find(
            (item) => item.id === url.searchParams.get("admission_id"),
          ) || admissions[1];
        return route.fulfill({
          json: {
            patient: {
              id: "infant",
              name: "Infant record",
              mrn: "MRN-ONLY",
              birth_at: "2026-09-01",
              sex: "female",
            },
            admission,
            admissions,
            billing: {
              charges: [],
              payments: [],
              totals: {
                charged: admission.charged,
                paid: admission.paid,
                balance: admission.charged - admission.paid,
              },
            },
            labs: [],
            orders: [],
            notes: [],
            vitals: [],
          },
        });
      }
      if (url.pathname === "/api/software-updates")
        return route.fulfill({
          json: {
            enabled: true,
            ready: true,
            current: { version: "0.2.3", sequence: 3, schema: 6 },
            limits: { package_bytes: 6e6 },
            jobs: [
              {
                id: "release",
                version: "0.2.4",
                sequence: 4,
                schema: 6,
                status: "staged",
                files: 12,
                bytes: 600,
                digest: "abc",
                actor_name: "Admin",
                created_at: "2026-09-01",
                logs: [{ at: "2026-09-01", code: "PACKAGE_VERIFIED" }],
              },
            ],
          },
        });
      return route.fulfill({
        json: request.method() === "GET" ? [] : { id: "recorded" },
      });
    });
    const render = (name: string, props: unknown) =>
      page.evaluate(
        ([component, value]) => (window as any).testRender(component, value),
        [name, props],
      );
    try {
      await page.goto(`http://127.0.0.1:${address.port}/__workspace-test`);
      await page.waitForFunction(() => (window as any).testReady);
      await render("Operations", financial);
      await page
        .getByRole("button", { name: "Open account", exact: true })
        .first()
        .click();
      assert.deepEqual(await page.evaluate(() => (window as any).testOpened), [
        "infant",
        "old-admission",
        "billing",
      ]);
      await page
        .getByRole("button", { name: "View details", exact: true })
        .first()
        .click();
      await expect.poll(() => !!releaseOld).toBe(true);
      await page
        .getByRole("button", { name: "View details", exact: true })
        .nth(1)
        .click();
      await expect(
        page.getByRole("heading", { name: "Invoice details", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".panel-heading").filter({ hasText: "Invoice details" }),
      ).toContainText("ADM-NEW");
      releaseOld!();
      delayOld = false;
      await page
        .getByRole("button", {
          name: "Open this admission account",
          exact: true,
        })
        .click();
      assert.deepEqual(await page.evaluate(() => (window as any).testOpened), [
        "infant",
        "new-admission",
        "billing",
      ]);
      await page
        .getByRole("button", { name: "Record service", exact: true })
        .click();
      await page.waitForFunction(() => !!(window as any).testForm);
      const serviceOptions = await page.evaluate(
        () => (window as any).testForm.fields[0].options,
      );
      assert.equal(serviceOptions.length, 1);
      assert.equal(serviceOptions[0].value, "service");
      await page
        .getByRole("button", { name: "Record payment", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          String((window as any).testForm?.title || "").includes(
            "Record patient payment",
          ),
      );
      await page.evaluate(() =>
        (window as any).testForm.submit({
          amount: 10.25,
          method: "cash",
          idempotency_key: "one-payment",
        }),
      );
      assert.equal(
        calls.filter(
          (call) =>
            call.method === "POST" &&
            call.path === "/api/admissions/new-admission/payments",
        ).length,
        1,
      );
      assert.equal(
        calls.filter((call) => call.path.startsWith("/api/patients")).length,
        0,
        "Invoice details/actions must not load clinical records",
      );
      await render("Operations", { ...financial, page: "accounts" });
      await expect(
        page.getByRole("heading", { name: "Invoice details", exact: true }),
      ).toHaveCount(0);
      await render("Operations", financial);
      await expect(
        page.getByRole("heading", { name: "Invoice details", exact: true }),
      ).toHaveCount(0);
      await render("Patient", {
        id: "infant",
        initialAdmissionId: "old-admission",
        initialTab: "billing",
        revision: 1,
        permissions,
        users: [],
        beds: [],
      });
      await expect(
        page.getByRole("button", {
          name: "Print this admission account",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Print this admission account",
          exact: true,
        })
        .click();
      assert.deepEqual(await page.evaluate(() => (window as any).testPrinted), [
        "invoice",
        "old-admission",
      ]);
      await expect(
        page.getByLabel("Select admission", { exact: true }),
      ).toHaveValue("old-admission");
      assert.ok(
        calls.some(
          (call) =>
            call.path === "/api/patients/infant?admission_id=old-admission",
        ),
      );
      await page
        .getByLabel("Select admission", { exact: true })
        .selectOption("new-admission");
      await expect(
        page.getByRole("button", {
          name: "Print this admission account",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Print this admission account",
          exact: true,
        })
        .click();
      assert.deepEqual(await page.evaluate(() => (window as any).testPrinted), [
        "invoice",
        "new-admission",
      ]);
      await render("Patient", {
        id: "infant",
        initialAdmissionId: "new-admission",
        initialTab: "nursing",
        revision: 1,
        permissions: ["patients.read", "billing.read"],
        users: [],
        beds: [],
      });
      await expect(
        page.getByRole("heading", { name: "Admission details", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".tabs button.active")).toHaveText(/Summary/);
      await expect(page.locator(".tabs")).not.toContainText("Nursing");
      await render("Patient", {
        id: "infant",
        initialAdmissionId: "old-admission",
        initialTab: "labs",
        revision: 1,
        permissions: ["patients.read", "lab.write"],
        users: [],
        beds: [],
      });
      await expect(page.locator(".tabs button.active")).toHaveText("Tests and results");
      await expect(
        page.getByLabel("Select admission", { exact: true }),
      ).toHaveValue("old-admission");
      await expect(
        page.getByRole("button", { name: "Admission account", exact: true }),
      ).toHaveCount(0);
      await render("Patient", {
        id: "infant",
        initialAdmissionId: "new-admission",
        initialTab: "nursing",
        revision: 1,
        permissions: ["patients.read", "clinical.read", "nursing.write"],
        users: [],
        beds: [],
      });
      await expect(page.locator(".tabs button.active")).toHaveText(/Nursing/);
      await render("Operations", {
        ...financial,
        page: "inventory",
        permissions: ["stock.write", "consumables.read"],
        data: {
          inventory: [
            { id: "stock", name: "Supply", unit: "unit", quantity: 5, cost: 1 },
          ],
        },
      });
      await page
        .getByRole("button", { name: "Record movement", exact: true })
        .click();
      assert.ok(
        !(
          await page.evaluate(() =>
            (window as any).testForm.fields.map((field: any) => field.name),
          )
        ).includes("admission_id"),
      );
      await expect(
        page.getByRole("button", { name: "Open infant consumables", exact: true }),
      ).toHaveCount(0);
      const movementOptions = await page.evaluate(() =>
        (window as any).testForm.fields.find((item: any) => item.name === "type").options.map((item: any) => item.value),
      );
      assert.deepEqual(movementOptions, ["return", "waste"]);
      await render("Updates", {});
      await expect(
        page.getByRole("heading", { name: "Software updates", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Upload and install automatically",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Install release now", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Signature and file hashes verified", { exact: true }),
      ).toBeVisible();
      assert.ok(
        !/[\u0600-\u06ff]/.test(await page.locator("body").innerText()),
        "Update UI must translate statuses, event labels and controls",
      );
      assert.deepEqual(errors, []);
    } finally {
      releaseOld?.();
      await browser.close();
      await vite.close();
    }
  },
);
