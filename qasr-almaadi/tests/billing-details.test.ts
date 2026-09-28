import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

test("accountant sees complete financial detail and invoice prints barcode and consumables", {timeout:60000}, async()=>{
  const db=await initDb(":memory:"); const app=await createApp(db,{seed:true});
  const item=(await db.query<any>("SELECT * FROM inventory WHERE consumable_id IS NOT NULL LIMIT 1")).rows[0];
  const catalog=(await db.query<any>("SELECT * FROM consumable_catalog WHERE id=$1",[item.consumable_id])).rows[0];
  await db.query("INSERT INTO charges(id,admission_id,name,quantity,unit_price,amount,source,actor_id) VALUES('detail-charge','admission-1',$1,2,12.5,25,'consumable','nurse')",[catalog.name]);
  await db.query("INSERT INTO consumptions(id,admission_id,consumable_id,name,unit,quantity,unit_price,amount,charge_id,actor_id) VALUES('detail-consumption','admission-1',$1,$2,$3,2,12.5,25,'detail-charge','nurse')",[catalog.id,catalog.name,catalog.unit]);
  await db.query("INSERT INTO stock_movements(id,item_id,type,quantity,admission_id,reason,cost_snapshot,actor_id) VALUES('detail-move',$1,'issue',2,'admission-1','test',1,'nurse')",[item.id]);
  await db.query("INSERT INTO consumption_movements(consumption_id,movement_id) VALUES('detail-consumption','detail-move')");
  const server=app.listen(0,"127.0.0.1"); await new Promise<void>(r=>server.once("listening",r)); const address=server.address() as any, base=`http://127.0.0.1:${address.port}`;
  try {
    const login=await fetch(base+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"accountant",password:"Training@2026"})});
    const cookie=login.headers.get("set-cookie")!.split(";")[0];
    const detailResponse=await fetch(base+"/api/billing/admissions/admission-1",{headers:{Cookie:cookie}}); assert.equal(detailResponse.status,200); const detail:any=await detailResponse.json();
    assert.equal(detail.invoice_no,`INV-${detail.admission.admission_no}`); assert.equal(detail.consumables[0].amount,"25"); assert.match(detail.consumables[0].batches,new RegExp(item.batch)); assert.ok(detail.charges.some((c:any)=>c.source==="consumable")); assert.equal(detail.admission.diagnosis,undefined);
    const invoice=await fetch(base+"/api/print/invoice?admission_id=admission-1",{headers:{Cookie:cookie,"Accept-Language":"en"}}); assert.equal(invoice.status,200); const html=await invoice.text(); assert.match(html,new RegExp(detail.invoice_no)); assert.match(html,/<svg/); assert.match(html,new RegExp(catalog.name)); assert.match(html,new RegExp(item.batch)); assert.match(html,/Consumable details/);
  } finally {await new Promise<void>(r=>server.close(()=>r())); await db.close();}
});
