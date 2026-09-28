import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test("unified accounting links departments, supplier credit, treasury, journals and closing",{timeout:60000},async()=>{
 delete process.env.DATABASE_URL;const db=await initDb(':memory:');await seedDatabase(db);const server=(await createApp(db)).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`,cookies:Record<string,string>={};
 async function req(role:string,method:string,path:string,body?:any,status=200){if(!cookies[role]){const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:role,password:'Training@2026'})});assert.equal(login.status,200);cookies[role]=login.headers.get('set-cookie')!.split(';')[0]}const response=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookies[role]},body:body===undefined?undefined:JSON.stringify(body)}),value=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(value)}`);return value}
 const key=()=>randomUUID();
 try{
  const initial=await req('manager','GET','/accounting?from=2020-01-01&end=2030-12-31');assert.equal(initial.summary.debit,initial.summary.credit);assert.ok(initial.journals.some((x:any)=>x.source==='invoice'));assert.ok(initial.journals.some((x:any)=>x.source==='payment'));await req('reception','GET','/accounting',undefined,403);
  const debit=initial.accounts.find((x:any)=>x.system_key==='maintenance_expense'),credit=initial.accounts.find((x:any)=>x.system_key==='money');
  const draft=await req('manager','POST','/accounting/manual-journals',{journal_date:'2026-09-01',description:'قيد تسوية اختبار',reference:'JV-TEST',lines:[{account_id:debit.id,debit:10,credit:0},{account_id:credit.id,debit:0,credit:10,money_account_id:'cash'}],idempotency_key:key()},201);assert.equal(draft.status,'draft');
  await req('manager','POST',`/accounting/manual-journals/${draft.id}/approve`,{version:draft.version,idempotency_key:key()},409);
  const posted=await req('admin','POST',`/accounting/manual-journals/${draft.id}/approve`,{version:draft.version,idempotency_key:key()});assert.equal(posted.status,'posted');
  await req('manager','POST','/accounting/manual-journals',{journal_date:'2026-09-01',description:'غير متوازن',lines:[{account_id:debit.id,debit:10},{account_id:credit.id,credit:9,money_account_id:'cash'}],idempotency_key:key()},409);
  const supplier=await req('manager','POST','/accounting/suppliers',{code:'SUP-TEST',name:'مورد اختبار محاسبي',payment_terms_days:30,credit_limit:1000,idempotency_key:key()},201);
  const catalog=(await req('reception','GET','/purchase-orders/catalog'))[0];
  let order=await req('reception','POST','/purchase-orders',{lines:[{consumable_id:catalog.id,quantity:1}],notes:'ربط محاسبي',idempotency_key:key()},201);
  order=await req('manager','POST',`/purchase-orders/${order.id}/approve`,{version:order.version,supplier_id:supplier.id,approval_note:'معتمد للاختبار',idempotency_key:key()});
  order=(await req('manager','GET','/purchase-orders')).find((x:any)=>x.id===order.id);
  order=await req('manager','POST',`/purchase-orders/${order.id}/review-receipt`,{version:order.version,settlement:'credit',supplier_id:supplier.id,due_date:'2026-10-10',reference:'SUP-INV-1',invoice_date:'2026-09-10',review_note:'مطابقة',lines:order.lines.map((x:any)=>({line_id:x.id,quantity:1,unit_cost:1,batch:'ACC-BATCH-1',expires_at:'2030-01-01',min_quantity:0,location:'مخزن الاختبار'})),idempotency_key:key()});assert.equal(order.status,'reviewing');assert.equal(order.money_account_id,null);
  order=await req('manager','POST',`/purchase-orders/${order.id}/receive`,{version:order.version,idempotency_key:key()});assert.equal(order.status,'received');assert.equal(order.settlement,'credit');
  let accounting=await req('manager','GET','/accounting?from=2020-01-01&end=2030-12-31');const invoice=accounting.supplier_invoices.find((x:any)=>x.invoice_no==='SUP-INV-1');assert.equal(Number(invoice.outstanding),1);const purchase=accounting.journals.find((x:any)=>x.source_id===order.id);assert.equal(purchase.lines.find((x:any)=>x.account==='inventory').debit,1);assert.equal(purchase.lines.find((x:any)=>x.account==='supplier_payable').credit,1);
  await req('manager','POST','/accounting/supplier-payments',{supplier_invoice_id:invoice.id,amount:1,method:'cash',money_account_id:'cash',reference:'PAY-SUP-1',idempotency_key:key()},201);
  accounting=await req('manager','GET','/accounting?from=2020-01-01&end=2030-12-31');assert.equal(Number(accounting.supplier_invoices.find((x:any)=>x.id===invoice.id).outstanding),0);assert.equal(accounting.summary.debit,accounting.summary.credit);assert.ok(accounting.journals.some((x:any)=>x.source==='supplier_payment'));
  const month=new Date().toLocaleString('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).replace('/','-');await req('manager','POST','/accounting/periods/close',{month,note:'إقفال اختبار',idempotency_key:key()},201);await req('manager','POST','/treasury/transfers',{from_account_id:'cash',to_account_id:'none',amount:1,reference:'blocked',notes:'',idempotency_key:key()},409);
  assert.equal((await one(db,"SELECT count(*)::int n FROM stock_movements WHERE reason LIKE 'توريد أمر الشراء%'")).n>0,true);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close()}
});
