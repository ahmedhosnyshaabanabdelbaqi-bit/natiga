/**
 * فحص شامل لكل الشاشات، في الوضعين النهاري والليلي.
 *
 * ليس جزءًا من `php artisan test` — يحتاج خادمًا يعمل وبيانات تجريبية.
 * يرصد: استجابات 4xx/5xx، أخطاء الصفحة، شاشة فارغة، وتمرير أفقي (يكسر اللمس
 * على شاشة كاشير).
 *
 * الاستخدام:
 *   php artisan migrate:fresh --seed && php artisan db:seed --class=DemoDataSeeder
 *   php artisan serve --port=8899 &
 *   node tests/Browser/sweep.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.POS_URL ?? 'http://127.0.0.1:8899';
const out = 'storage/app/smoke';
const chromePath = process.env.CHROME_PATH ?? undefined;

mkdirSync(out, { recursive: true });

const ROUTES = [
    ['/app/dashboard', 'dashboard'], ['/app/sales', 'sales'], ['/app/products', 'products'],
    ['/app/inventory', 'inventory'], ['/app/purchasing', 'purchasing'], ['/app/customers', 'customers'],
    ['/app/shifts', 'shifts'], ['/app/reports', 'reports'], ['/app/sync', 'sync'],
    ['/app/settings', 'settings'], ['/setup', 'setup'],
];

const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
const problems = [];

for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });

    page.on('response', (r) => {
        if (r.status() >= 400) problems.push(`[${scheme}] ${r.status()} ${new URL(r.url()).pathname}`);
    });
    page.on('pageerror', (e) => problems.push(`[${scheme}] PAGEERROR: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`[${scheme}] CONSOLE: ${m.text().slice(0, 140)}`);
    });

    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    const inputs = await page.$$('input');
    await inputs[0].fill('owner');
    await inputs[1].fill('ChangeMe!2026');
    await inputs[2].fill('POS1');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/pos', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${scheme}-pos.png` });

    for (const [route, name] of ROUTES) {
        const before = problems.length;
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1300);

        // شاشة لا تعرض شيئًا شاشةٌ معطوبة، حتى بلا استثناء.
        const text = (await page.locator('main, body').first().innerText()).trim();
        if (text.length < 20) problems.push(`[${scheme}] EMPTY PAGE: ${route}`);

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 2) problems.push(`[${scheme}] H-OVERFLOW ${overflow}px: ${route}`);

        if (scheme === 'light') await page.screenshot({ path: `${out}/sweep-${name}.png` });
        console.log(`${problems.length === before ? '✓' : '✗'} [${scheme}] ${route}`);
    }

    // شاشة كاشير صغيرة: يجب ألا يظهر تمرير أفقي.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${base}/pos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const posOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (posOverflow > 2) problems.push(`[${scheme}] H-OVERFLOW ${posOverflow}px: /pos @1024`);
    console.log(`${posOverflow > 2 ? '✗' : '✓'} [${scheme}] /pos @1024`);

    await page.close();
}

await browser.close();

if (problems.length) {
    console.error('\nمشاكل:\n' + problems.join('\n'));
    process.exit(1);
}
console.log('\nكل الشاشات نظيفة في الوضعين النهاري والليلي.');
