import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';

// Hosted acceptance is read-only. Only normal login may send a mutating request.
// Never create fixtures, send messages, record payments/readings, or install updates.
const expectedVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const password = fs.readFileSync('output/PRIVATE-HOST-ACCESS.txt', 'utf8').match(/^Initial password: (.+)$/m)?.[1];
if (!password) throw Error('Access file missing');
const origin = 'https://child.egsystem.net';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage(), errors = [], blockedWrites = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const protectWrites = async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'POST' && url.pathname === '/cdn-cgi/rum') return route.abort('blockedbyclient');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
      !(url.origin === origin && url.pathname === '/api/login' && request.method() === 'POST')) {
    blockedWrites.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  }
  return route.continue();
};
await context.route('**/*', protectWrites);
const sidebar = page.locator('.sidebar');
const nav = name => sidebar.getByRole('button', { name, exact: true }).click();
const heading = name => page.getByRole('heading', { name, exact: true });
const screenshot = name => page.screenshot({ path: `docs/screenshots/release-${expectedVersion}-${name}.png` });
async function apiGet(path, targetPage = page) {
  return targetPage.evaluate(async path => {
    const response = await fetch('/api' + path, { cache: 'no-store' });
    if (!response.ok) throw Error(`Read-only GET ${path}: HTTP ${response.status}`);
    return response.json();
  }, path);
}
async function noOverflow() { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }
async function logo(locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(locator).toHaveAttribute('src', '/hospital-logo.png');
}
try {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30000 });
  await logo(page.locator('.login-page .hospital-logo'));
  await page.locator('[name=username]').fill('admin');
  await page.locator('[name=password]').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(sidebar.locator('nav')).toBeVisible();
  await logo(sidebar.locator('.hospital-logo'));
  await expect(page.locator('.creator-credit a')).toHaveAttribute('href', 'https://wa.me/201112081120');
  await expect(page.locator('.dc-movement')).toBeVisible();
  await expect(page.locator('.dc-stay')).toBeVisible();
  checks.push('Login/sidebar hospital logo loaded; creator credit; overview charts');

  await expect(sidebar.locator('nav .sidebar-bottom')).toHaveCount(1);
  await expect(sidebar.locator(':scope > .sidebar-bottom')).toHaveCount(0);
  await nav('المساعدة ودليل التشغيل');
  await expect(page.locator('.department-chat')).toBeVisible();
  await expect(page.locator('.chat-oversight')).toContainText('للآخرين تكون للقراءة فقط');
  await expect(page.locator('.chat-conversation-list button').first()).toBeVisible();
  await expect(page.locator('.help-guide summary')).toBeVisible();
  const chat = await apiGet('/chat');
  expect(chat.can_review).toBe(true);
  expect(chat.conversations.some(conversation => conversation.id === 'department')).toBe(true);
  await screenshot('help-chat');
  checks.push('Support inside scrolling navigation; staff chat, oversight notice and department room');

  await nav('المخزون والمستلزمات');
  await expect(page.locator('.consumables-module')).toBeVisible();
  await expect(heading('المستهلكات الطبية')).toBeVisible();
  await expect(sidebar.locator('[data-page=invoices]')).toHaveCount(0);
  await expect(sidebar.locator('[data-page=consumables]')).toHaveCount(0);
  await nav('طلبات وأوامر الشراء');
  await expect(page.getByRole('heading', { name: 'طلبات وأوامر الشراء', exact: true, level: 1 })).toBeVisible();
  expect(Array.isArray(await apiGet('/purchase-orders'))).toBe(true);
  await page.locator('[data-page=equipment]').click();
  await expect(heading('الأجهزة الطبية')).toBeVisible();
  await expect(page.locator('.equipment-module')).toBeVisible();
  const equipment = await apiGet('/equipment');
  expect(Array.isArray(equipment.catalog)).toBe(true);
  await page.locator('[data-page=maintenance]').click();
  await expect(heading('متابعة الصيانة')).toBeVisible();
  await expect(page.locator('.maintenance-module')).toBeVisible();
  const maintenance = await apiGet('/maintenance');
  expect(Array.isArray(maintenance.jobs)).toBe(true);
  await expect(page.locator('[data-page=monitoring]')).toHaveCount(0);
  const managerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await managerContext.route('**/*', protectWrites);
  const managerPage = await managerContext.newPage();
  managerPage.on('pageerror', error => errors.push(error.message));
  try {
    await managerPage.goto(origin, { waitUntil: 'networkidle', timeout: 30000 });
    await managerPage.locator('[name=username]').fill('manager');
    await managerPage.locator('[name=password]').fill(password);
    await managerPage.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(managerPage.locator('.sidebar nav')).toBeVisible();
    await managerPage.locator('[data-page=monitoring]').click();
    await expect(managerPage.getByRole('heading', { name: 'سجل المتابعة والقياسات', exact: true })).toBeVisible();
    await expect(managerPage.getByText('الأجهزة غير متصلة بالشبكة — الإدخال يدوي', { exact: true })).toBeVisible();
    await apiGet('/monitoring', managerPage);
    await managerPage.screenshot({ path: `docs/screenshots/release-${expectedVersion}-manager-monitoring.png` });
  } finally { await managerContext.close(); }
  checks.push('Merged inventory and consumables; purchase orders; equipment/maintenance; restricted monitoring');

  await nav('الحسابات والفواتير');
  await expect(page.getByRole('heading', { name: 'الحسابات والفواتير', exact: true, level: 1 })).toBeVisible();
  await expect(heading('شركات التأمين')).toBeVisible();
  expect(Array.isArray(await apiGet('/insurance-companies'))).toBe(true);
  await expect(sidebar.locator('[data-page=invoices]')).toHaveCount(0);
  await nav('الخزنة');
  await expect(heading('أرصدة الخزنة والبنوك')).toBeVisible();
  await expect(heading('الخزنة وسجل المدفوعات')).toBeVisible();
  await expect(page.getByRole('button', { name: 'إضافة حساب بنك', exact: true })).toBeVisible();
  const treasury = await apiGet('/treasury');
  expect(Array.isArray(treasury.accounts)).toBe(true);
  expect(treasury.accounts.some(account => account.kind === 'cash')).toBe(true);
  await screenshot('treasury-banks');
  checks.push('Merged accounts and invoices; insurance companies and cash/bank account UI');

  await nav('الإعدادات');
  await expect(page.locator('.updates-page')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'تحديثات النظام', exact: true })).toHaveCount(0);
  const update = await apiGet('/software-updates');
  expect(update.enabled).toBe(true);
  expect(update.ready).toBe(true);
  expect(update.current.version).toBe(expectedVersion);
  expect(update.maintenance).toBe(false);
  expect(update.jobs.some(job => job.status === 'installed' && job.version === expectedVersion)).toBe(true);
  const security = await apiGet('/security');
  expect(security.additional_verification).toBe(false);
  checks.push('Signed update installed; additional verification disabled; session management available');

  await page.locator('.language').click();
  await nav('Help center');
  await expect(page.locator('.department-chat')).toHaveAttribute('aria-label', 'Internal staff chat');
  await expect(page.locator('.chat-oversight')).toContainText('read-only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await noOverflow();
  await screenshot('help-en-mobile');
  await page.locator('.mobile-toggle').click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).x)).toBe(0);
  await sidebar.getByRole('button', { name: 'Help center', exact: true }).scrollIntoViewIfNeeded();
  await expect(sidebar.getByRole('button', { name: 'Help center', exact: true })).toBeInViewport();
  await expect(sidebar.locator('.brand')).toBeInViewport();
  await screenshot('support-menu-en-mobile');
  await nav('Settings');
  await page.locator('.language').click();
  await noOverflow();
  await screenshot('admin-mobile');
  checks.push('AR/EN 390px layout; stable mobile drawer; scrolling support with brand visible');
  expect(blockedWrites).toEqual([]);
  expect(errors).toEqual([]);
  const result = { status: 'PASS', checkedAt: new Date().toISOString(), origin, release: update.current, roles: ['admin', 'manager'], checks, blockedWrites, pageErrors: errors.length };
  fs.writeFileSync(`docs/release-${expectedVersion}-hosted-results.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
