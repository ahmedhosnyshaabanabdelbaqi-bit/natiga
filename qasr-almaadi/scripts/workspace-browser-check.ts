import { chromium, expect } from "@playwright/test";
import express from "express";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

delete process.env.DATABASE_URL;
delete process.env.UPDATE_ROOT;
delete process.env.UPDATE_ENABLED;
delete process.env.TRAINING_PASSWORD;
delete process.env.PUBLIC_DEMO_ACCOUNTS;
const db=await initDb(":memory:");
const app=await createApp(db,{seed:true});
await db.query(`INSERT INTO admissions(id,admission_no,patient_id,admitted_at,discharged_at,status,doctor_id,nurse_id) VALUES('workspace-history','ADM-HISTORY-001','patient-1','2025-01-01','2025-01-02','discharged','doctor','nurse')`);
app.use(express.static(path.resolve("dist")));
const server=app.listen(0,"127.0.0.1");
await new Promise<void>(resolve=>server.once("listening",resolve));
const address=server.address() as any, origin=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({channel:"chrome",headless:true});
const results:any[]=[];
mkdirSync("docs/screenshots",{recursive:true});
try {
  for(const role of ['admin','manager','doctor','nurse','head_nurse','reception','accountant','purchasing','stock','lab','quality','maintenance','insurance']) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage(), errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin);await page.locator('[name=username]').fill(role);await page.locator('[name=password]').fill('Training@2026');
    await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();
    await expect(page.locator('.sidebar nav')).toBeVisible();
    const keys=await page.locator('.sidebar nav button[data-page]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-page')!));
    for(const key of keys) {
      await page.locator(`.sidebar nav button[data-page="${key}"]`).click();
      await page.waitForLoadState('networkidle');
      expect(await page.locator('.error-box:visible').allTextContents(),role+' '+key).toEqual([]);
      await expect(page.locator(`.sidebar nav button[data-page="${key}"]`)).toHaveAttribute('aria-current','page');
    }
    if(role==='admin'){
      await page.locator('[aria-label="بحث الأقسام"]').fill('فواتير');
      await expect(page.locator('.sidebar nav button[data-page]')).toHaveCount(1);
      await page.locator('[data-page="accounts"]').click();
      await expect(page.locator('.sidebar nav button[data-page]')).toHaveCount(keys.length);
      await page.reload();await expect(page.locator('[data-page="accounts"]')).toHaveAttribute('aria-current','page');
      await expect(page.locator('[data-page="invoices"]')).toHaveCount(0);
      await expect(page.locator('[data-page="consumables"]')).toHaveCount(0);
      await page.locator('[data-page="attendance"]').click();
      await page.getByRole('button',{name:'الموظفون',exact:true}).click();
      await page.getByRole('button',{name:'إضافة موظف',exact:true}).click();
      const employeeDialog=page.getByRole('dialog');
      await expect(employeeDialog.locator('[name="user_id"]')).toHaveCount(1);
      await expect(employeeDialog.locator('select[name="user_id"]')).toHaveCount(0);
      await employeeDialog.getByRole('button',{name:'إغلاق',exact:true}).click();
      await page.locator('.sidebar').getByRole('button',{name:'الإعدادات',exact:true}).click();
      await page.getByRole('button',{name:'المستخدمون والأدوار',exact:true}).click();
      await page.getByRole('button',{name:'مستخدم جديد',exact:true}).click();
      await expect(page.getByRole('dialog').locator('[name=password]')).toHaveAttribute('type','password');
      await expect(page.getByRole('dialog')).toContainText('8 خانات على الأقل');
      await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
      await page.locator('[data-page="dashboard"]').click();
      await page.screenshot({path:'docs/screenshots/workspace-ar-desktop.png',fullPage:true});
      await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('dir','ltr');
      await page.screenshot({path:'docs/screenshots/workspace-en-desktop.png',fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
      await expect.poll(()=>page.locator('.sidebar').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
      await page.screenshot({path:'docs/screenshots/workspace-en-mobile.png',fullPage:true});
      await page.locator('.mobile-toggle').click();
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect.poll(()=>page.locator('.sidebar').evaluate(element=>Math.round(element.getBoundingClientRect().x))).toBe(0);
      await page.screenshot({path:'docs/screenshots/workspace-en-mobile-menu.png',fullPage:true});
    }
    if(role==='reception'){
      await page.locator('[data-page="beds"]').click();
      const placeButton=page.getByRole('button',{name:/تسكين طفل في حضّانة متاحة/});
      await expect(placeButton).toBeVisible();
      await placeButton.click();
      await expect(page.getByRole('dialog').locator('[name="bed_id"]')).toBeVisible();
      await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
    }
    if(role==='manager'){
      await page.locator('[data-page="attendance"]').click();
      await page.getByRole('button',{name:'الموظفون',exact:true}).click();
      await page.getByRole('button',{name:'إضافة موظف',exact:true}).click();
      const names=await page.getByRole('dialog').locator('input,select,textarea').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('name')));
      for(const required of ['job_type','department','daily_work_hours','work_days_per_month','monthly_salary','absence_deduction','overtime_hour_rate']) expect(names).toContain(required);
      await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
      await page.getByRole('button',{name:'تسليم الشيفتات',exact:true}).click();
      await expect(page.getByRole('heading',{name:'سجل تسليم الشيفتات',exact:true})).toBeVisible();
    }
    if(role==='accountant'){
      await page.locator('[data-page="accounts"]').click();
      const row=page.locator('tbody tr').filter({hasText:'ADM-HISTORY-001'});
      await row.getByRole('button',{name:'فتح الحساب',exact:true}).click();
      await expect(page.locator('.tabs button.active')).toHaveText('الحسابات');
      await expect(page.locator('.patient-view .identity-banner')).toBeVisible();
      expect(new URLSearchParams(await page.evaluate(()=>location.hash.slice(1))).get('admission')).toBe('workspace-history');
      await page.reload();await expect(page.locator('.tabs button.active')).toHaveText('الحسابات');
      await page.locator('.tabs').getByRole('button',{name:'الولادة والدخول',exact:true}).click();
      await page.getByLabel('اختيار الإقامة',{exact:true}).selectOption('admission-1');
      await expect(page.getByLabel('اختيار الإقامة',{exact:true})).toHaveValue('admission-1');
      await page.reload();await expect(page.locator('.tabs button.active')).toHaveText('الولادة والدخول');
      await expect(page.getByLabel('اختيار الإقامة',{exact:true})).toHaveValue('admission-1');
      await page.goBack();await expect(page.locator('[data-page="accounts"]')).toHaveAttribute('aria-current','page');
    }
    expect(errors,role+' JS').toEqual([]);
    results.push({role,pages:keys,status:'PASS'});await context.close();
  }
  console.log(JSON.stringify({status:'PASS',roles:results.length,pages:results.reduce((sum,r)=>sum+r.pages.length,0),checks:['all permitted sections','available-incubator admission action','employee profile and individual payroll fields','shift handovers','user account and 8-character password UI','merged stock and accounts navigation','single searchable employee account field','menu search','hash reload and back','historical admission billing','AR/EN and mobile','zero JS errors']}));
} finally {
  writeFileSync('docs/workspace-browser-results.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
  await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();
}
