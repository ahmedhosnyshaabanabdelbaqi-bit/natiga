import { chromium, expect, type Page } from '@playwright/test';
import express from 'express';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { initDb, one } from '../server/db.js';
import { createApp } from '../server/app.js';

// Release UI acceptance always uses a fresh local database, isolated browser sessions,
// and the already-built dist bundle. No credentials or requests reach a hosted system.
for (const key of ['DATABASE_URL', 'UPDATE_ROOT', 'UPDATE_ENABLED', 'NODE_ENV', 'SESSION_SECURE']) delete process.env[key];
process.env.TRAINING_PASSWORD = 'Isolated-Release040-Check@2026';
process.env.PUBLIC_DEMO_ACCOUNTS = 'false';
const directory = mkdtempSync(join(tmpdir(), 'nicu-release040-browser-'));
const db = await initDb(join(directory, 'database'));
const app = await createApp(db, { seed: true });
app.use(express.static(resolve('dist')));
app.use((req, res, next) => req.method === 'GET' && !req.path.startsWith('/api/') ? res.sendFile(resolve('dist/index.html')) : next());
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(ready => server.once('listening', ready));
const address = server.address();
if (!address || typeof address === 'string') throw Error('Isolated release server did not start');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks: string[] = [], errors: string[] = [];
let lastPage: Page | undefined;
async function login(role: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'en-GB', serviceWorkers: 'block' });
  await context.addInitScript(() => localStorage.setItem('nicu-language', 'en'));
  const page = await context.newPage(); lastPage = page;
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base);
  await page.locator('input[name=username]').fill(role);
  await page.locator('input[name=password]').fill(process.env.TRAINING_PASSWORD!);
  await page.locator('.login-page form button[type=submit]').click();
  await expect(page.locator('.sidebar nav')).toBeVisible();
  return page;
}
async function nav(page: Page, name: string) { lastPage = page; await page.locator('.sidebar nav').getByRole('button', { name, exact: true }).click(); }
async function submit(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toHaveCount(0, { timeout: 15000 });
}
async function fill(page: Page, name: string, value: string) { await page.getByRole('dialog').locator(`[name="${name}"]`).fill(value); }
async function select(page: Page, name: string, value: string) { await page.getByRole('dialog').locator(`select[name="${name}"]`).selectOption(value); }
async function get(page: Page, path: string) {
  const response = await page.request.get(base + '/api' + path, { headers: { 'Accept-Language': 'en' } });
  expect(response.status(), await response.text()).toBe(200); return response.json();
}
const section = (page: Page, heading: string) => page.getByRole('heading', { name: heading, exact: true }).locator('xpath=ancestor::section[1]');
try {
  const accountant = await login('accountant'), reception = await login('reception');
  const admission = await one(db, "SELECT a.*,p.mrn,p.name AS patient_name FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE a.id='admission-1'");
  const invoice = 'INV-' + admission.admission_no;
  const beforeWallet = await get(accountant, '/treasury');
  expect(beforeWallet.accounts.filter((row: any) => row.kind === 'bank')).toHaveLength(0);
  await nav(accountant, 'Treasury');
  await accountant.locator('.section-search input').fill(invoice);
  await section(accountant, 'Receive a payment').getByRole('button', { name: 'Record payment', exact: true }).click();
  await fill(accountant, 'amount', '7.25');
  await select(accountant, 'method', 'wallet');
  await fill(accountant, 'reference', 'SYNTHETIC-WALLET-040');
  await submit(accountant);
  const walletPayment = await one(db, "SELECT * FROM payments WHERE reference='SYNTHETIC-WALLET-040'");
  expect(walletPayment.money_account_id).toBeNull();
  expect(Number(walletPayment.amount)).toBe(7.25);
  const initialMoney = await get(accountant, '/treasury');
  expect(Number(initialMoney.cash_balance)).toBe(Number(beforeWallet.cash_balance));
  expect(Number(initialMoney.unallocated.total)).toBe(Number(beforeWallet.unallocated.total) + 7.25);
  await expect(accountant.getByText('Electronic collections not assigned to a specific bank:', { exact: false })).toBeVisible();
  checks.push('Wallet receipt can be recorded without a bank; it reduces the patient balance and is tracked separately without inflating cash or bank balances.');
  await accountant.getByRole('button', { name: 'Add bank account', exact: true }).click();
  await fill(accountant, 'name', 'Synthetic release bank');
  await fill(accountant, 'bank_name', 'Synthetic Bank');
  await fill(accountant, 'account_number', 'TEST-RELEASE040');
  await fill(accountant, 'opening_balance', '50.25');
  await submit(accountant);
  const bank = (await get(accountant, '/treasury')).accounts.find((row: any) => row.name === 'Synthetic release bank');
  expect(bank).toBeTruthy(); expect(Number(bank.balance)).toBe(50.25);
  const revenueBefore = await one(db, 'SELECT count(*)::int AS count,sum(amount) AS amount FROM payments');
  await accountant.getByRole('button', { name: 'Deposit to bank', exact: true }).click();
  await select(accountant, 'to_account_id', bank.id);
  await fill(accountant, 'amount', '25.50');
  await fill(accountant, 'reference', 'SYNTHETIC-DEPOSIT-040');
  await submit(accountant);
  let balances = await get(accountant, '/treasury');
  expect(Number(balances.cash_balance)).toBe(Number(initialMoney.cash_balance) - 25.5);
  expect(Number(balances.accounts.find((row: any) => row.id === bank.id).balance)).toBe(75.75);
  expect(await one(db, 'SELECT count(*)::int AS count,sum(amount) AS amount FROM payments')).toEqual(revenueBefore);
  checks.push('UI bank creation and cash deposit update exact balances without adding payments or revenue.');

  await nav(accountant, 'Accounts');
  await accountant.getByRole('button', { name: 'Add company', exact: true }).click();
  await fill(accountant, 'code', 'TEST-040');
  await fill(accountant, 'name', 'Synthetic release insurer');
  await fill(accountant, 'contract_number', 'CONTRACT-040');
  await submit(accountant);
  const company = (await get(accountant, '/insurance-companies')).find((row: any) => row.code === 'TEST-040');
  expect(company).toBeTruthy();
  await nav(accountant, 'Invoices');
  await accountant.locator('.section-search input').fill(invoice);
  const matchingRow = accountant.locator('tr').filter({ hasText: invoice });
  await expect(matchingRow).toHaveCount(1);
  await expect(matchingRow).toContainText(admission.patient_name);
  await matchingRow.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(section(accountant, 'Invoice details')).toContainText(admission.admission_no);
  await accountant.getByRole('button', { name: 'Add claim', exact: true }).click();
  await select(accountant, 'company_id', company.id);
  await fill(accountant, 'policy_number', 'POLICY-040');
  await fill(accountant, 'amount', '120');
  const beforeClaim = await one(db, 'SELECT count(*)::int AS count,sum(amount) AS amount FROM payments');
  await submit(accountant);
  expect(await one(db, 'SELECT count(*)::int AS count,sum(amount) AS amount FROM payments')).toEqual(beforeClaim);
  await expect(accountant.locator('.section-search input')).toHaveValue(invoice);
  await expect(section(accountant, 'Invoice details')).toContainText(admission.admission_no);
  await expect(section(accountant, 'Admission insurance')).toContainText('Synthetic release insurer');
  await accountant.getByRole('button', { name: 'Record collection', exact: true }).click();
  await fill(accountant, 'amount', '40');
  await select(accountant, 'method', 'transfer');
  await select(accountant, 'money_account_id', bank.id);
  await fill(accountant, 'reference', 'SYNTHETIC-INSURER-040');
  await submit(accountant);
  await expect(accountant.locator('.section-search input')).toHaveValue(invoice);
  await expect(section(accountant, 'Admission insurance')).toContainText('Synthetic release insurer');
  const claims = await get(accountant, '/admissions/admission-1/insurance-claims');
  expect(Number(claims.insurance_outstanding)).toBe(80);
  const companyPayment = await one(db, "SELECT * FROM payments WHERE reference='SYNTHETIC-INSURER-040'");
  expect(companyPayment.money_account_id).toBe(bank.id); expect(Number(companyPayment.amount)).toBe(40);
  expect(companyPayment.actor_id).toBe('accountant');
  checks.push('Invoice search locates the correct admission and stays selected after claim save; UI creates insurer, allocates a claim without cash, and records an actual bank collection with remaining receivable.');

  await nav(accountant, 'Treasury');
  await accountant.locator('.section-search input').fill(invoice);
  const quick = section(accountant, 'Receive a payment');
  await expect(quick.locator('tbody tr')).toHaveCount(1);
  await expect(quick).toContainText(admission.patient_name);
  await quick.getByRole('button', { name: 'Record payment', exact: true }).click();
  const bill = await get(accountant, '/billing/admissions/admission-1');
  await expect(accountant.getByRole('dialog').locator('[name=amount]')).toHaveValue(String(bill.totals.patient_due));
  await select(accountant, 'method', 'cash');
  await submit(accountant);
  expect(Number((await get(accountant, '/billing/admissions/admission-1')).totals.patient_due)).toBe(0);
  expect(Number((await get(accountant, '/billing/admissions/admission-1')).totals.insurance_outstanding)).toBe(80);
  checks.push('Treasury quick collection searches by invoice, pre-fills current patient share and settles it without consuming the insurer receivable.');

  lastPage = reception;
  await reception.goto(`${base}/#page=patients&patient=${admission.patient_id}&admission=${admission.id}&tab=identity`);
  await reception.getByRole('button', { name: 'Send to Accounts for checkout', exact: true }).click();
  await fill(reception, 'notes', 'Synthetic release checkout referral'); await submit(reception);
  expect((await one(db, 'SELECT status FROM admissions WHERE id=$1', [admission.id])).status).toBe('active');
  await reception.getByRole('button', { name: 'Record medical clearance', exact: true }).click();
  await select(reception, 'doctor_id', 'doctor');
  await fill(reception, 'confirmation_note', 'Synthetic phone confirmation from assigned doctor');
  await submit(reception);
  const clearance = await one(db, 'SELECT * FROM checkout_clearances WHERE admission_id=$1', [admission.id]);
  expect(clearance.approved_by).toBe('reception'); expect(clearance.authority_doctor_id).toBe('doctor'); expect(clearance.approval_source).toBe('reception_on_behalf');
  const doctorName = (await one(db, "SELECT name FROM users WHERE id='doctor'")).name;
  const receptionName = (await one(db, "SELECT name FROM users WHERE id='reception'")).name;
  const checkoutStatus = section(reception, 'Checkout and Accounts handover');
  await expect(checkoutStatus).toContainText(doctorName); await expect(checkoutStatus).toContainText(receptionName);
  await expect(reception.getByRole('button', { name: 'Complete checkout', exact: true })).toHaveCount(0);
  checks.push('Reception refers checkout and records named doctor confirmation under reception identity; admission remains active until Accounts finalizes.');

  await nav(accountant, 'Accounts');
  const queue = section(accountant, 'Checkout requests sent to Accounts');
  await queue.getByRole('searchbox', { name: 'Search checkout requests' }).fill(invoice);
  await expect(queue.locator('tbody tr')).toHaveCount(1);
  await expect(queue).toContainText(doctorName); await expect(queue).toContainText(receptionName);
  await queue.getByRole('button', { name: 'Complete checkout', exact: true }).click();
  await fill(accountant, 'patient_mrn', admission.mrn);
  await fill(accountant, 'recipient', 'Synthetic guardian'); await submit(accountant);
  expect((await one(db, 'SELECT status FROM admissions WHERE id=$1', [admission.id])).status).toBe('discharged');
  expect((await one(db, 'SELECT status FROM beds WHERE id=$1', [admission.bed_id])).status).toBe('cleaning');
  expect((await one(db, 'SELECT finalized_by FROM checkout_requests WHERE admission_id=$1', [admission.id])).finalized_by).toBe('accountant');
  expect(Number((await get(accountant, '/billing/admissions/admission-1')).totals.insurance_outstanding)).toBe(80);
  checks.push('Accounts verifies MRN and completes discharge after patient settlement; the bed becomes cleaning and the insurer receivable remains tracked.');

  await accountant.setViewportSize({ width: 390, height: 844 });
  expect(await accountant.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await accountant.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(accountant.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(accountant.getByRole('heading', { name: 'طلبات الخروج المحولة للحسابات', exact: true })).toBeVisible();
  expect(await accountant.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  checks.push('Financial checkout renders at 390px in English and Arabic without page-level horizontal overflow.');
  expect(errors).toEqual([]);
  const evidence = { status: 'PASS', at: new Date().toISOString(), version: JSON.parse(readFileSync('package.json', 'utf8')).version, isolated_database: true, built_frontend: true, checks };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/release040-browser.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  mkdirSync('test-results', { recursive: true });
  if (lastPage) { await lastPage.screenshot({ path: 'test-results/release040-browser-failure.png', fullPage: true }); writeFileSync('test-results/release040-browser-failure.txt', await lastPage.locator('body').innerText()); }
  throw error;
} finally {
  await browser.close(); await new Promise<void>(closed => server.close(() => closed())); await db.close();
  const safe = resolve(directory), parent = resolve(tmpdir());
  if (safe.startsWith(parent + (process.platform === 'win32' ? '\\' : '/')) && safe.split(/[\\/]/).pop()!.startsWith('nicu-release040-browser-')) rmSync(safe, { recursive: true, force: true });
}
