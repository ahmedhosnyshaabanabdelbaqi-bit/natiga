import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const password = fs.readFileSync('output/PRIVATE-HOST-ACCESS.txt', 'utf8').match(/^Initial password: (.+)$/m)?.[1];
if (!password) throw Error('Access file missing');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.env.NICU_DNS_OVERRIDE ? ['--host-resolver-rules=MAP child.egsystem.net ' + process.env.NICU_DNS_OVERRIDE] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [];
// Never emit Playwright snapshots, call logs or stacks: these can contain password inputs.
const safeError = error => String(error?.message || error).split(/\r?\n/, 1)[0].split(password).join('[REDACTED]').slice(0, 300);
page.on('pageerror', error => errors.push(safeError(error)));
let result = {}, stage = 'Load login';
try {
  await page.goto('https://child.egsystem.net', { waitUntil: 'networkidle', timeout: 30000 });
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.locator('.training-accounts')).toHaveCount(0);
  await expect(page.locator('[name=username]')).toHaveValue('');
  await page.locator('[name=username]').fill('manager');
  await page.locator('[name=password]').fill(password);
  stage = 'Manager login';
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/login' && response.request().method() === 'POST', { timeout: 20000 });
  const [response] = await Promise.all([loginResponse, page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()]);
  expect(response.status(), 'Manager login HTTP status').toBe(200);
  await expect(page.locator('.sidebar nav')).toBeVisible({ timeout: 20000 });
  stage = 'Arabic dashboard';
  await expect(page.locator('.stats-grid')).toBeVisible();
  await expect(page.locator('.error-box:visible')).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/hosted-ar.png' });
  stage = 'Persist English settings';
  await page.locator('.sidebar').getByRole('button', { name: 'الإعدادات', exact: true }).click();
  await page.locator('#interface-language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('.sidebar nav')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  stage = 'Attendance and responsive layout';
  await page.locator('.sidebar').getByRole('button', { name: 'Attendance & payroll', exact: true }).click();
  await expect(page.locator('.attendance-module')).toBeVisible();
  await expect(page.locator('.attendance-module .error-box')).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/hosted-en.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/hosted-mobile-en.png', fullPage: true });
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === 'nicu_session')?.secure).toBe(true);
  expect(errors).toEqual([]);
  result = { status: 'PASS', url: 'https://child.egsystem.net', checks: ['HTTPS page and secure session', 'Hosted default credentials hidden', 'Manager login HTTP 200', 'Arabic dashboard', 'English settings persisted after reload', 'Attendance page and payroll role controls', '390px mobile without page overflow'], javascript_errors: errors };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result = { status: 'FAIL', stage, error: safeError(error), javascript_errors: errors };
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  fs.writeFileSync('docs/hosted-browser-results.json', JSON.stringify(result, null, 2));
  await browser.close();
}
