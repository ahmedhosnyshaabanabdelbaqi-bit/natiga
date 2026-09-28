import { chromium, expect } from '@playwright/test';
const password = process.env.NICU_ACCOUNTS_PASSWORD;
if (!password) throw Error('Password missing');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [];
// Only the first diagnostic line is retained; never print snapshots, call logs or stacks.
const safeError = error => String(error?.message || error).split(/\r?\n/, 1)[0].split(password).join('[REDACTED]').slice(0, 300);
page.on('pageerror', error => errors.push(safeError(error)));
let stage = 'Load login';
try {
  await page.goto('https://child.egsystem.net', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('[name=username]').fill('accounts');
  await page.locator('[name=password]').fill(password);
  stage = 'Accounts login';
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/login' && response.request().method() === 'POST', { timeout: 20000 });
  const [response] = await Promise.all([loginResponse, page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()]);
  expect(response.status(), 'Accounts login HTTP status').toBe(200);
  await expect(page.locator('.sidebar nav')).toBeVisible({ timeout: 20000 });
  stage = 'Financial role navigation';
  for (const name of ['الحسابات', 'الفواتير', 'الخزنة']) await expect(page.locator('.sidebar').getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'المهام وتسليم النوبات', exact: true })).toHaveCount(0);
  stage = 'Invoice details';
  await page.locator('.sidebar').getByRole('button', { name: 'الفواتير', exact: true }).click();
  await page.getByRole('button', { name: 'كل التفاصيل', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'تفاصيل الفاتورة', exact: true })).toBeVisible();
  await expect(page.getByText('الخدمات والمستهلكات', { exact: true })).toBeVisible();
  await expect(page.getByText('تفاصيل المستهلكات والتشغيلات', { exact: true })).toBeVisible();
  stage = 'Printed invoice barcode and hospital logo';
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'طباعة بباركود', exact: true }).click();
  const popup = await popupPromise;
  popup.on('pageerror', error => errors.push(safeError(error)));
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('.barcode svg')).toBeVisible();
  await expect(popup.getByText(/INV-ADM-/).first()).toBeVisible();
  const printedLogo = popup.locator('header img.logo');
  await expect(printedLogo).toBeVisible();
  await expect.poll(() => printedLogo.evaluate(image => image.complete && image.naturalWidth > 0), { timeout: 20000 }).toBe(true);
  stage = 'Mobile layout';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ status: 'PASS', checks: ['accounts login HTTP 200', 'financial-only account', 'invoice full detail', 'consumables and batches section', 'print invoice barcode', 'printed hospital logo loaded', 'mobile layout'] }));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', stage, error: safeError(error), javascript_errors: errors }));
  process.exitCode = 1;
} finally { await browser.close(); }
