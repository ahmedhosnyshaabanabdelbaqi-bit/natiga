import express from 'express';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import {initDb} from '../server/db.js';
import {seedDatabase} from '../server/seed.js';
import {createApp} from '../server/app.js';

delete process.env.DATABASE_URL;
const db=await initDb(':memory:');await seedDatabase(db);const app=await createApp(db);app.use(express.static(resolve('dist')));app.use((_r,s)=>s.sendFile(resolve('dist/index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));const origin=`http://127.0.0.1:${(server.address() as any).port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ar-EG',timezoneId:'Africa/Cairo',serviceWorkers:'block'});const page=await context.newPage();const errors:string[]=[],checks:string[]=[];page.on('pageerror',e=>errors.push(e.message));mkdirSync('docs/screenshots',{recursive:true});
try{
 await page.goto(origin);await page.locator('[name=username]').fill('AdMiN');await page.locator('[name=password]').fill('Training@2026');await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await expect(page.locator('.sidebar nav')).toBeVisible();
 await page.locator('[data-page=accounts]').click();const module=page.locator('.accounting-workspace');await expect(module).toBeVisible();await expect(module.getByText('دفتر محاسبي موحّد لكل الأقسام',{exact:true})).toBeVisible();
 for(const name of ['دفتر اليومية','ميزان المراجعة','الموردون','دليل الحسابات','مراكز التكلفة','الفترات والإقفال'])await expect(module.getByRole('button',{name,exact:true})).toBeVisible();checks.push('Unified accounting workspace exposes journal, trial balance, suppliers, chart, cost centers and closing');
 const ledger=await context.request.get(origin+'/api/accounting?from=2026-01-01&end=2026-12-31');expect(ledger.status()).toBe(200);const data=await ledger.json();expect(data.summary.debit).toBe(data.summary.credit);expect(data.accounts.length).toBeGreaterThanOrEqual(12);expect(data.cost_centers.length).toBeGreaterThanOrEqual(5);checks.push('Unified ledger balances and seeded chart/cost centers are available');
 await module.getByRole('button',{name:'قيد يدوي',exact:true}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByText('إنشاء قيد متوازن',{exact:true})).toBeVisible();await expect(dialog.locator('[name=debit_account]')).toBeVisible();await expect(dialog.locator('[name=credit_account]')).toBeVisible();await dialog.getByRole('button',{name:'إلغاء',exact:true}).click();checks.push('Balanced manual journal form requires debit and credit accounts');
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(module.getByText('Unified ledger across all departments',{exact:true})).toBeVisible();await expect(module.getByRole('button',{name:'Trial balance',exact:true})).toBeVisible();checks.push('Accounting workspace switches fully to English');
 await page.screenshot({path:'docs/screenshots/accounting-workspace-desktop-en.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);await expect(module).toBeVisible();checks.push('390px accounting view fits without horizontal page overflow');
 expect(errors).toEqual([]);writeFileSync('docs/accounting-browser-results.json',JSON.stringify({status:'PASS',checks,javascript_errors:errors},null,2));console.log(JSON.stringify({status:'PASS',checks,javascript_errors:errors},null,2));
}finally{await browser.close();await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await db.close()}
