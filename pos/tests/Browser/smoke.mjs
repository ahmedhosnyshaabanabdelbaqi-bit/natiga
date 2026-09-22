/**
 * Manual browser smoke check.
 *
 * NOT part of `php artisan test` — it needs a running server and a seeded demo
 * catalogue. It drives the real UI through a real sale and fails loudly on any
 * 4xx/5xx response or uncaught page error.
 *
 * It has already earned its keep: it caught a quantity-scale bug (merged scans
 * produced 6 decimals, which the API correctly rejected) and a stale-header bug
 * after opening a shift.
 *
 * Usage:
 *   php artisan migrate:fresh --seed
 *   php artisan db:seed --class=DemoDataSeeder
 *   php artisan serve --port=8899 &
 *   node tests/Browser/smoke.mjs
 *
 * Screenshots land in storage/app/smoke/.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.POS_URL ?? 'http://127.0.0.1:8899';
const out = 'storage/app/smoke';
const chromePath = process.env.CHROME_PATH ?? undefined;

mkdirSync(out, { recursive: true });

const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const problems = [];
page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
});
page.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message));

function check(condition, message) {
    if (!condition) problems.push('ASSERTION: ' + message);
}

// ---- sign in ---------------------------------------------------------------
await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
const inputs = await page.$$('input');
await inputs[0].fill('owner');
await inputs[1].fill('ChangeMe!2026');
await inputs[2].fill('POS1');
await page.click('button[type="submit"]');
await page.waitForURL('**/pos', { timeout: 15000 });
await page.waitForTimeout(2500);

// ---- open a shift ----------------------------------------------------------
await page.click('text=الوردية');
await page.waitForTimeout(1200);
const floatInput = await page.$('input.num');
if (floatInput) await floatInput.fill('500');
const openBtn = await page.$('text=فتح الوردية');
if (openBtn) {
    await openBtn.click();
    await page.waitForTimeout(1500);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);

// The header must reflect the shift immediately after the panel closes.
check(!(await page.locator('text=لا توجد وردية').count()), 'الرأس ما زال يعرض "لا توجد وردية" بعد فتحها');
await page.screenshot({ path: `${out}/01-pos.png` });

// ---- scan, including a repeated scan that must merge ------------------------
for (const code of ['6221031492016', '6221031492030', '6221031492030', '6221031492085']) {
    await page.fill('input[placeholder*="امسح الباركود"]', code);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
}
check((await page.locator('text=سلة البيع (3)').count()) > 0, 'المسح المكرر لم يُدمج في سطر واحد');
await page.screenshot({ path: `${out}/02-cart.png` });

// ---- pay and complete ------------------------------------------------------
await page.keyboard.press('F9');
await page.waitForTimeout(1500);
const amountBox = await page.$('input.num[inputmode="decimal"]');
if (amountBox) {
    await amountBox.fill('400');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
}
await page.screenshot({ path: `${out}/03-payment.png` });

const payBtn = await page.$('button:has-text("اعتماد البيع")');
if (payBtn) {
    await payBtn.click();
    await page.waitForTimeout(3000);
}
check((await page.locator('text=تم اعتماد الفاتورة').count()) > 0, 'لم تظهر رسالة اعتماد الفاتورة');
check((await page.locator('text=الباقي للعميل').count()) > 0, 'لم يظهر الباقي للعميل');
await page.screenshot({ path: `${out}/04-completed.png` });

// ---- owner dashboard -------------------------------------------------------
await page.goto(`${base}/app/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/05-dashboard.png` });

await browser.close();

if (problems.length) {
    console.error('فشل الفحص:\n' + problems.join('\n'));
    process.exit(1);
}
console.log('الفحص نظيف: لا أخطاء شبكة ولا أخطاء صفحة، ودورة بيع كاملة نجحت.');
