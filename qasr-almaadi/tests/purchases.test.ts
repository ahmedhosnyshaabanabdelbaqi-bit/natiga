import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDb, one } from '../server/db.js';
import { createApp } from '../server/app.js';

test('reception requests quantities without prices and Accounts approves, receives, expenses and stocks atomically',{timeout:90000},async()=>{
  delete process.env.DATABASE_URL;
  const db=await initDb(':memory:');const app=await createApp(db,{seed:true});const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`,cookies:Record<string,string>={};
  async function req(role:string,method:string,path:string,body?:any,status=200){
    if(!cookies[role]){const response=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:role,password:'Training@2026'})});assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie')!.split(';')[0]}
    const response=await fetch(base+'/api'+path,{method,headers:{Origin:base,Cookie:cookies[role],'Content-Type':'application/json','Accept-Language':'en'},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
  }
  const keyed=(body:any)=>({...body,idempotency_key:randomUUID()});
  try{
    const catalog=await req('reception','GET','/purchase-orders/catalog');assert.ok(catalog.length);assert.deepEqual(Object.keys(catalog[0]).sort(),['id','name','sku','unit']);
    await req('reception','POST','/purchase-orders',keyed({lines:[{consumable_id:catalog[0].id,quantity:3,unit_cost:1}]}),400);
    const request=await req('reception','POST','/purchase-orders',keyed({notes:'احتياج القسم',lines:[{consumable_id:catalog[0].id,quantity:3}]}),201);
    const receptionList=await req('reception','GET','/purchase-orders');assert.equal(receptionList[0].id,request.id);assert.equal('total_amount' in receptionList[0],false);assert.equal('unit_cost' in receptionList[0].lines[0],false);assert.equal('money_account_id' in receptionList[0],false);
    await req('reception','POST',`/purchase-orders/${request.id}/approve`,keyed({version:request.version,supplier:'مورد'}),403);
    const approved=await req('accountant','POST',`/purchase-orders/${request.id}/approve`,keyed({version:request.version,supplier:'مورد معتمد',approval_note:'مراجعة الكمية'}));
    assert.equal(approved.status,'approved');
    const cashBefore=Number((await req('accountant','GET','/treasury')).cash_balance),stockBefore=Number((await one(db,'SELECT COALESCE(sum(quantity),0) AS q FROM inventory WHERE consumable_id=$1',[catalog[0].id]))!.q);
    const accountOrder=(await req('accountant','GET','/purchase-orders')).find((o:any)=>o.id===request.id);
    const reviewed=await req('accountant','POST',`/purchase-orders/${request.id}/review-receipt`,keyed({version:approved.version,settlement:'paid',method:'cash',money_account_id:'cash',reference:'SUP-INV-1',invoice_date:'2026-09-10',review_note:'مطابق',lines:[{line_id:accountOrder.lines[0].id,quantity:3,unit_cost:4.25,batch:'PO-BATCH-1',expires_at:'2029-12-31',min_quantity:1,location:'Main store'}]}));
    assert.equal(reviewed.status,'reviewing');assert.equal(Number((await req('accountant','GET','/treasury')).cash_balance),cashBefore);assert.equal(Number((await one(db,'SELECT COALESCE(sum(quantity),0) AS q FROM inventory WHERE consumable_id=$1',[catalog[0].id]))!.q),stockBefore);
    const received=await req('accountant','POST',`/purchase-orders/${request.id}/receive`,keyed({version:reviewed.version}));
    assert.equal(received.status,'received');assert.equal(Number(received.total_amount),12.75);
    assert.equal(Number((await req('accountant','GET','/treasury')).cash_balance),cashBefore-12.75);
    assert.equal(Number((await one(db,'SELECT COALESCE(sum(quantity),0) AS q FROM inventory WHERE consumable_id=$1',[catalog[0].id]))!.q),stockBefore+3);
    assert.equal((await one(db,"SELECT count(*)::int AS n FROM stock_movements WHERE reason LIKE 'توريد أمر الشراء %'"))!.n,1);
    const report=await req('accountant','GET','/reports');assert.equal(Number(report.billing.purchase_expenses),12.75);assert.equal(Number(report.billing.net_revenue),Number(report.billing.paid)-12.75-Number(report.billing.maintenance_expenses));
    await req('accountant','POST',`/purchase-orders/${request.id}/receive`,keyed({version:reviewed.version}),409);
  }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await db.close()}
});
