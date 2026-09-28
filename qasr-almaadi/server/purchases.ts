import { all, one, type Database } from './db.js';
import { insert } from './seed.js';
import { ApiError, choice, date, number, required } from './security.js';
import { lockCashLedger, resolveMoneyAccount, assertMoneyAvailable } from './treasury.js';
import { mutate, permit, requireKey, uid, versioned, wrap, type Req, type RouteContext } from './context.js';

function allowed(r: Req) {
  permit(r,'purchase.read');
}
function approver(r: Req) {
  permit(r, 'purchase.approve');
  if (!['accountant','admin','manager','purchasing'].includes(r.user.role)) throw new ApiError(403,'اعتماد أمر الشراء من اختصاص الحسابات أو مسؤول المشتريات');
}
function exact(r: Req, fields: string[]) {
  if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body) || Object.keys(r.body).some(k=>!fields.includes(k)))
    throw new ApiError(400,'بيانات طلب الشراء تتضمن حقولًا غير مسموحة');
  requireKey(r);
}
function qty(value: unknown, allowZero=false) {
  const result=number(value,'الكمية',allowZero?0:0.001,1000000000);
  if(Math.abs(result*1000-Math.round(result*1000))>.00001)throw new ApiError(400,'الكمية تقبل ثلاث منازل عشرية فقط');
  return Math.round(result*1000)/1000;
}
function currency(value: unknown) {
  const result=number(value,'تكلفة الوحدة',0,1000000000);
  if(Math.abs(result*100-Math.round(result*100))>.00001)throw new ApiError(400,'تكلفة الوحدة تقبل منزلتين عشريتين فقط');
  return Math.round(result*100)/100;
}
function short(value: unknown,label:string,max=200,optional=false){
  if(optional&&(value===undefined||value===null||value===''))return '';
  const result=required(value,label);
  if(result.length>max)throw new ApiError(400,`${label} طويل جدًا`);
  return result;
}
async function details(db:Database,r:Req,id?:string){
  const financial=r.user.permissions.includes('purchase.approve');
  const where=id?' WHERE o.id=$1':'';
  const orders=await all(db,`SELECT o.id,o.order_no,o.status,o.notes,o.approval_note,o.supplier,o.supplier_id,o.settlement,o.due_date,o.requested_by,o.requested_at,o.approved_by,o.approved_at,o.reviewed_by,o.reviewed_at,o.received_by,o.received_at,o.version,
    rq.name AS requested_by_name,ap.name AS approved_by_name,rv.name AS reviewed_by_name,rc.name AS received_by_name
    ${financial?',o.money_account_id,o.payment_method,o.reference,o.invoice_date,o.review_note,o.total_amount,m.name AS account_name':''}
    FROM purchase_orders o JOIN users rq ON rq.id=o.requested_by LEFT JOIN users ap ON ap.id=o.approved_by LEFT JOIN users rc ON rc.id=o.received_by
    LEFT JOIN users rv ON rv.id=o.reviewed_by ${financial?'LEFT JOIN money_accounts m ON m.id=o.money_account_id':''}${where} ORDER BY o.requested_at DESC`,id?[id]:[]);
  for(const order of orders){
    order.lines=await all(db,`SELECT id,consumable_id,name_snapshot,unit_snapshot,requested_quantity,stock_section${financial?',delivered_quantity,delivered_unit_cost,delivered_batch,delivered_expires_at,delivered_location,delivered_min_quantity,received_quantity,unit_cost,batch,expires_at,location,inventory_id':''} FROM purchase_order_lines WHERE purchase_order_id=$1 ORDER BY id`,[order.id]);
  }
  return id?orders[0]||null:orders;
}
export function purchaseRoutes({app,db}:RouteContext){
  app.get('/api/purchase-orders/catalog',wrap(async(r,s)=>{allowed(r);s.json(await all(db,'SELECT id,sku,name,unit FROM consumable_catalog WHERE active=true ORDER BY name,sku'));}));
  app.get('/api/purchase-orders',wrap(async(r,s)=>{allowed(r);s.json(await details(db,r));}));
  app.post('/api/purchase-orders',wrap(async(r,s)=>{
    permit(r,'purchase.request');
    exact(r,['lines','notes','idempotency_key']);
    if(!Array.isArray(r.body.lines)||r.body.lines.length<1||r.body.lines.length>20)throw new ApiError(400,'اختر من صنف واحد إلى 20 صنفًا');
    s.status(201).json(await mutate(db,r,'purchase_orders',async tx=>{
      const ids=new Set<string>();
      const parsed=[] as any[];
      for(const raw of r.body.lines){
        if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['consumable_id','quantity','stock_section'].includes(k)))throw new ApiError(400,'طلب الشراء يسجل الصنف والكمية وجهة التخزين فقط دون أسعار');
        const id=short(raw.consumable_id,'الصنف',100);
        if(ids.has(id))throw new ApiError(409,'الصنف مكرر في طلب الشراء');
        ids.add(id);
        const item=await one(tx,'SELECT id,name,unit FROM consumable_catalog WHERE id=$1 AND active=true',[id]);
        if(!item)throw new ApiError(404,'الصنف غير موجود أو موقوف');
        parsed.push({...item,quantity:qty(raw.quantity),stock_section:choice(raw.stock_section||'medical_consumables',['general_stock','medical_consumables','supplies'],'قسم التخزين')});
      }
      const seq=await one(tx,"SELECT nextval('purchase_order_number') AS value");
      const order=await insert(tx,'purchase_orders',{id:uid(),order_no:`PO-${new Date().getFullYear()}-${String(seq.value).padStart(6,'0')}`,notes:short(r.body.notes,'ملاحظات الطلب',2000,true),requested_by:r.user.id});
      for(const item of parsed)await insert(tx,'purchase_order_lines',{id:uid(),purchase_order_id:order.id,consumable_id:item.id,name_snapshot:item.name,unit_snapshot:item.unit,requested_quantity:item.quantity,stock_section:item.stock_section});
      return {...order,lines:parsed.map(x=>({consumable_id:x.id,name_snapshot:x.name,unit_snapshot:x.unit,requested_quantity:x.quantity,stock_section:x.stock_section}))};
    }));
  }));
  app.post('/api/purchase-orders/:id/approve',wrap(async(r,s)=>{
    approver(r);exact(r,['version','supplier','supplier_id','approval_note','idempotency_key']);
    s.json(await mutate(db,r,'purchase_orders',async tx=>{
      const order=await one(tx,'SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE',[r.params.id]);
      if(!order)throw new ApiError(404,'طلب الشراء غير موجود');
      if(order.status!=='pending')throw new ApiError(409,'يمكن اعتماد طلب الشراء المعلق فقط');
      const supplier=r.body.supplier_id?await one(tx,'SELECT id,name FROM suppliers WHERE id=$1 AND active=true',[r.body.supplier_id]):null;
      if(r.body.supplier_id&&!supplier)throw new ApiError(404,'المورد غير موجود أو موقوف');
      return versioned(tx,'purchase_orders',order.id,r.body.version,{status:'approved',supplier:supplier?.name||short(r.body.supplier,'المورد',200,true)||null,supplier_id:supplier?.id||null,approval_note:short(r.body.approval_note,'ملاحظة الاعتماد',2000,true),approved_by:r.user.id,approved_at:new Date().toISOString()});
    }));
  }));
  app.post('/api/purchase-orders/:id/reject',wrap(async(r,s)=>{
    approver(r);exact(r,['version','reason','idempotency_key']);
    s.json(await mutate(db,r,'purchase_orders',async tx=>{
      const order=await one(tx,'SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE',[r.params.id]);
      if(!order)throw new ApiError(404,'طلب الشراء غير موجود');
      if(order.status!=='pending')throw new ApiError(409,'يمكن رفض طلب الشراء المعلق فقط');
      return versioned(tx,'purchase_orders',order.id,r.body.version,{status:'rejected',approval_note:short(r.body.reason,'سبب الرفض',2000),approved_by:r.user.id,approved_at:new Date().toISOString()});
    }));
  }));
  app.post('/api/purchase-orders/:id/review-receipt',wrap(async(r,s)=>{
    approver(r);permit(r,'billing.write');
    exact(r,['version','method','money_account_id','reference','invoice_date','review_note','lines','settlement','supplier_id','supplier','due_date','idempotency_key']);
    if(!Array.isArray(r.body.lines)||!r.body.lines.length)throw new ApiError(400,'بيانات مطابقة الفاتورة غير مكتملة');
    s.json(await mutate(db,r,'purchase_orders',async tx=>{
      const order=await one(tx,'SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE',[r.params.id]);
      if(!order)throw new ApiError(404,'طلب الشراء غير موجود');
      if(!['approved','reviewing'].includes(order.status))throw new ApiError(409,'اعتمد طلب الشراء قبل مطابقة فاتورة التوريد');
      if(Number(order.version)!==Number(r.body.version))throw new ApiError(409,'تم تعديل طلب الشراء؛ حدّث الشاشة');
      const saved=await all(tx,'SELECT * FROM purchase_order_lines WHERE purchase_order_id=$1 ORDER BY id FOR UPDATE',[order.id]);
      if(r.body.lines.length!==saved.length)throw new ApiError(400,'يجب مراجعة جميع أصناف أمر الشراء');
      const incoming=new Map(r.body.lines.map((line:any)=>[line?.line_id,line]));
      const reference=short(r.body.reference,'رقم فاتورة أو إيصال الشراء',160),invoiceDate=date(r.body.invoice_date,'تاريخ الفاتورة').slice(0,10);
      const parsed=[] as any[];let totalCents=0;
      for(const line of saved){
        const raw:any=incoming.get(line.id);
        if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['line_id','quantity','unit_cost','batch','expires_at','min_quantity','location'].includes(k)))throw new ApiError(400,'بيانات صنف الفاتورة غير مكتملة أو غير مسموحة');
        const quantity=qty(raw.quantity),cost=currency(raw.unit_cost),batch=short(raw.batch,'رقم التشغيلة',120,true)||reference,expires=raw.expires_at?date(raw.expires_at,'انتهاء الصلاحية').slice(0,10):null,minQuantity=qty(raw.min_quantity??0,true),location=short(raw.location,'مكان التخزين',160,true)||({general_stock:'المخزن العام',medical_consumables:'المستهلكات الطبية',supplies:'المستلزمات'} as Record<string,string>)[line.stock_section];
        totalCents+=Math.round(quantity*cost*100);
        parsed.push({line,quantity,cost,batch,expires,minQuantity,location});
      }
      const settlement=choice(r.body.settlement||'paid',['paid','credit'],'طريقة تسوية المورد');
      const supplierId=r.body.supplier_id||order.supplier_id||null;
      const supplier=supplierId?await one(tx,'SELECT * FROM suppliers WHERE id=$1 AND active=true',[supplierId]):null;
      if(supplierId&&!supplier)throw new ApiError(404,'المورد غير موجود أو موقوف');
      if(settlement==='credit'&&!supplier)throw new ApiError(400,'اختر المورد عند التوريد الآجل');
      const method=settlement==='paid'?choice(r.body.method,['cash','card','transfer','instapay','wallet'],'طريقة الدفع'):null;
      const account=settlement==='paid'?await resolveMoneyAccount(tx,method!,short(r.body.money_account_id,'الحساب المالي',100)):{money_account_id:null};
      if(settlement==='paid'&&!account.money_account_id)throw new ApiError(400,'اختر حساب الخزنة أو البنك الذي سدد قيمة الشراء');
      for(const row of parsed){
        await tx.query('UPDATE purchase_order_lines SET delivered_quantity=$1,delivered_unit_cost=$2,delivered_batch=$3,delivered_expires_at=$4,delivered_location=$5,delivered_min_quantity=$6 WHERE id=$7',[row.quantity,row.cost,row.batch,row.expires,row.location,row.minQuantity,row.line.id]);
      }
      const dueDate=settlement==='credit'?date(r.body.due_date||new Date(Date.now()+Number(supplier.payment_terms_days||0)*86400000).toISOString(),'استحقاق المورد').slice(0,10):null;
      return versioned(tx,'purchase_orders',order.id,r.body.version,{status:'reviewing',reviewed_by:r.user.id,reviewed_at:new Date().toISOString(),review_note:short(r.body.review_note,'ملاحظة مطابقة الفاتورة',2000,true),money_account_id:account.money_account_id,payment_method:method,reference,invoice_date:invoiceDate,total_amount:totalCents/100,settlement,supplier:supplier?.name||short(r.body.supplier,'المورد أو المحل',200,true)||order.supplier||null,supplier_id:supplier?.id||order.supplier_id||null,due_date:dueDate});
    }));
  }));
  app.post('/api/purchase-orders/:id/receive',wrap(async(r,s)=>{
    approver(r);permit(r,'billing.write');exact(r,['version','idempotency_key']);
    s.json(await mutate(db,r,'purchase_orders',async tx=>{
      await lockCashLedger(tx);
      const order=await one(tx,'SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE',[r.params.id]);
      if(!order)throw new ApiError(404,'طلب الشراء غير موجود');
      if(order.status!=='reviewing')throw new ApiError(409,'راجع فاتورة وأصناف أمر الشراء قبل الاستلام النهائي');
      if(Number(order.version)!==Number(r.body.version))throw new ApiError(409,'تم تعديل أمر الشراء؛ حدّث الشاشة');
      const saved=await all(tx,'SELECT * FROM purchase_order_lines WHERE purchase_order_id=$1 ORDER BY id FOR UPDATE',[order.id]);
      if(saved.some(line=>line.delivered_quantity===null||Number(line.delivered_quantity)!==Number(line.requested_quantity)))throw new ApiError(409,'توجد فروق بين كميات أمر الشراء والفاتورة؛ صحح المراجعة قبل الاستلام');
      if(order.settlement==='paid'){
        if(!order.money_account_id)throw new ApiError(400,'اختر حساب الخزنة أو البنك الذي سدد قيمة الشراء');
        await assertMoneyAvailable(tx,order.money_account_id,Number(order.total_amount));
      }
      for(const line of saved){
        let inventory=await one(tx,'SELECT * FROM inventory WHERE name=$1 AND batch=$2 AND location=$3 AND stock_section=$4 FOR UPDATE',[line.name_snapshot,line.delivered_batch,line.delivered_location,line.stock_section]);
        if(inventory){
          const storedExpiry=inventory.expires_at?String(inventory.expires_at).slice(0,10):null;
          if(inventory.consumable_id!==line.consumable_id||inventory.unit!==line.unit_snapshot||storedExpiry!==(line.delivered_expires_at?String(line.delivered_expires_at).slice(0,10):null)||Number(inventory.cost)!==Number(line.delivered_unit_cost))throw new ApiError(409,'التشغيلة موجودة ببيانات مختلفة؛ راجع الصنف والتكلفة والصلاحية');
          inventory=await one(tx,'UPDATE inventory SET quantity=quantity+$1,min_quantity=$2,version=version+1 WHERE id=$3 RETURNING *',[line.delivered_quantity,line.delivered_min_quantity,inventory.id]);
        }else inventory=await insert(tx,'inventory',{id:uid(),consumable_id:line.consumable_id,name:line.name_snapshot,unit:line.unit_snapshot,batch:line.delivered_batch,expires_at:line.delivered_expires_at,quantity:line.delivered_quantity,min_quantity:line.delivered_min_quantity,cost:line.delivered_unit_cost,location:line.delivered_location,stock_section:line.stock_section});
        await insert(tx,'stock_movements',{id:uid(),item_id:inventory.id,purchase_order_line_id:line.id,type:'receive',quantity:line.delivered_quantity,reason:`توريد أمر الشراء ${order.order_no} · ${order.reference}`,cost_snapshot:line.delivered_unit_cost,actor_id:r.user.id});
        await tx.query('UPDATE purchase_order_lines SET received_quantity=delivered_quantity,unit_cost=delivered_unit_cost,batch=delivered_batch,expires_at=delivered_expires_at,location=delivered_location,inventory_id=$1 WHERE id=$2',[inventory.id,line.id]);
      }
      const updated=await versioned(tx,'purchase_orders',order.id,r.body.version,{status:'received',received_by:r.user.id,received_at:new Date().toISOString()});
      if(order.settlement==='credit')await insert(tx,'supplier_invoices',{id:uid(),invoice_no:order.reference,supplier_id:order.supplier_id,purchase_order_id:order.id,invoice_date:order.invoice_date,due_date:order.due_date,amount:order.total_amount,notes:`توريد ${order.order_no}`,actor_id:r.user.id});
      return {...updated,lines:(await details(tx,r,order.id))?.lines};
    }));
  }));
  app.get('/api/stock-requests',wrap(async(r,s)=>{
    permit(r,'purchase.read');
    const broad=r.user.permissions.includes('stock.write')||['admin','manager','purchasing'].includes(r.user.role);
    const requests=await all(db,`SELECT q.*,u.name requested_by_name,f.name fulfilled_by_name,o.order_no FROM stock_requests q JOIN users u ON u.id=q.requested_by LEFT JOIN users f ON f.id=q.fulfilled_by LEFT JOIN purchase_orders o ON o.id=q.purchase_order_id${broad?'':' WHERE q.requested_by=$1'} ORDER BY q.requested_at DESC`,broad?[]:[r.user.id]);
    for(const request of requests)request.lines=await all(db,`SELECT l.*,COALESCE((SELECT sum(i.quantity) FROM inventory i WHERE i.consumable_id=l.consumable_id AND i.stock_section=l.stock_section),0) available_quantity FROM stock_request_lines l WHERE l.stock_request_id=$1 ORDER BY l.id`,[request.id]);
    s.json(requests);
  }));
  app.post('/api/stock-requests',wrap(async(r,s)=>{
    permit(r,'purchase.request');exact(r,['department','notes','lines','idempotency_key']);
    if(!Array.isArray(r.body.lines)||r.body.lines.length<1||r.body.lines.length>20)throw new ApiError(400,'اختر من صنف واحد إلى 20 صنفًا');
    s.status(201).json(await mutate(db,r,'stock_requests',async tx=>{
      const parsed=[] as any[],ids=new Set<string>();
      for(const raw of r.body.lines){
        if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['consumable_id','quantity','stock_section'].includes(k)))throw new ApiError(400,'طلب الصرف الداخلي يتضمن الصنف والكمية والقسم فقط');
        const id=short(raw.consumable_id,'الصنف',100);if(ids.has(id))throw new ApiError(409,'الصنف مكرر في طلب الصرف');ids.add(id);
        const item=await one(tx,'SELECT id,name,unit FROM consumable_catalog WHERE id=$1 AND active=true',[id]);if(!item)throw new ApiError(404,'الصنف غير موجود أو موقوف');
        parsed.push({...item,quantity:qty(raw.quantity),stock_section:choice(raw.stock_section||'medical_consumables',['general_stock','medical_consumables','supplies'],'قسم التخزين')});
      }
      const seq=await one(tx,"SELECT nextval('stock_request_number') value"),request=await insert(tx,'stock_requests',{id:uid(),request_no:`SR-${new Date().getFullYear()}-${String(seq.value).padStart(6,'0')}`,department:short(r.body.department,'القسم الطالب',160,true)||r.user.role,notes:short(r.body.notes,'ملاحظات الطلب',2000,true),requested_by:r.user.id});
      for(const item of parsed)await insert(tx,'stock_request_lines',{id:uid(),stock_request_id:request.id,consumable_id:item.id,name_snapshot:item.name,unit_snapshot:item.unit,requested_quantity:item.quantity,stock_section:item.stock_section});
      return request;
    }));
  }));
  app.post('/api/stock-requests/:id/fulfill',wrap(async(r,s)=>{
    permit(r,'stock.write');exact(r,['version','idempotency_key']);
    s.json(await mutate(db,r,'stock_requests',async tx=>{
      const request=await one(tx,'SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[r.params.id]);if(!request)throw new ApiError(404,'طلب الصرف غير موجود');if(request.status!=='pending')throw new ApiError(409,'يمكن تنفيذ طلب الصرف المعلق فقط');if(Number(request.version)!==Number(r.body.version))throw new ApiError(409,'تم تعديل الطلب؛ حدّث الشاشة');
      const lines=await all(tx,'SELECT * FROM stock_request_lines WHERE stock_request_id=$1 ORDER BY id FOR UPDATE',[request.id]);
      for(const line of lines){
        let remaining=Number(line.requested_quantity);const batches=await all(tx,`SELECT * FROM inventory WHERE consumable_id=$1 AND stock_section=$2 AND quantity>0 AND (expires_at IS NULL OR expires_at>=(now() AT TIME ZONE 'Africa/Cairo')::date) ORDER BY expires_at NULLS LAST,id FOR UPDATE`,[line.consumable_id,line.stock_section]);
        if(batches.reduce((sum,x)=>sum+Number(x.quantity),0)+1e-9<remaining)throw new ApiError(409,`رصيد ${line.name_snapshot} غير كافٍ؛ حوّل العجز إلى طلب شراء`);
        for(const batch of batches){if(remaining<=0)break;const take=Math.min(remaining,Number(batch.quantity));await tx.query('UPDATE inventory SET quantity=quantity-$1,version=version+1 WHERE id=$2',[take,batch.id]);const movement=await insert(tx,'stock_movements',{id:uid(),item_id:batch.id,type:'issue',quantity:take,reason:`صرف داخلي ${request.request_no} · ${request.department}`,cost_snapshot:batch.cost,actor_id:r.user.id});await insert(tx,'stock_request_issues',{stock_request_line_id:line.id,movement_id:movement.id});remaining=Math.round((remaining-take)*1000)/1000;}
        await tx.query('UPDATE stock_request_lines SET issued_quantity=requested_quantity WHERE id=$1',[line.id]);
      }
      return versioned(tx,'stock_requests',request.id,r.body.version,{status:'fulfilled',fulfilled_by:r.user.id,fulfilled_at:new Date().toISOString()});
    }));
  }));
  app.post('/api/stock-requests/:id/convert-to-purchase',wrap(async(r,s)=>{
    permit(r,'stock.write');permit(r,'purchase.request');exact(r,['version','lines','notes','idempotency_key']);
    if(!Array.isArray(r.body.lines)||!r.body.lines.length)throw new ApiError(400,'حدد كميات الأصناف المطلوب شراؤها');
    s.status(201).json(await mutate(db,r,'stock_requests',async tx=>{
      const request=await one(tx,'SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[r.params.id]);if(!request)throw new ApiError(404,'طلب الصرف غير موجود');if(request.status!=='pending')throw new ApiError(409,'يمكن تحويل طلب الصرف المعلق فقط');if(Number(request.version)!==Number(r.body.version))throw new ApiError(409,'تم تعديل الطلب؛ حدّث الشاشة');
      const lines=await all(tx,'SELECT * FROM stock_request_lines WHERE stock_request_id=$1 ORDER BY id',[request.id]),incoming=new Map(r.body.lines.map((x:any)=>[x.line_id,x]));const parsed=[] as any[];
      for(const line of lines){const raw:any=incoming.get(line.id);if(!raw)continue;if(Object.keys(raw).some(k=>!['line_id','quantity'].includes(k)))throw new ApiError(400,'بيانات تحويل طلب الشراء غير مسموحة');parsed.push({...line,quantity:qty(raw.quantity)});}
      if(!parsed.length)throw new ApiError(400,'لم يتم اختيار أصناف للشراء');const seq=await one(tx,"SELECT nextval('purchase_order_number') value"),order=await insert(tx,'purchase_orders',{id:uid(),order_no:`PO-${new Date().getFullYear()}-${String(seq.value).padStart(6,'0')}`,notes:`من طلب صرف ${request.request_no} · ${short(r.body.notes,'ملاحظات التحويل',1000,true)}`,requested_by:r.user.id});
      for(const item of parsed)await insert(tx,'purchase_order_lines',{id:uid(),purchase_order_id:order.id,consumable_id:item.consumable_id,name_snapshot:item.name_snapshot,unit_snapshot:item.unit_snapshot,requested_quantity:item.quantity,stock_section:item.stock_section});
      await versioned(tx,'stock_requests',request.id,r.body.version,{status:'converted_to_purchase',purchase_order_id:order.id});return order;
    }));
  }));
  app.post('/api/stock-requests/:id/reject',wrap(async(r,s)=>{
    permit(r,'stock.write');exact(r,['version','reason','idempotency_key']);s.json(await mutate(db,r,'stock_requests',async tx=>{const request=await one(tx,'SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[r.params.id]);if(!request)throw new ApiError(404,'طلب الصرف غير موجود');if(request.status!=='pending')throw new ApiError(409,'يمكن رفض طلب الصرف المعلق فقط');return versioned(tx,'stock_requests',request.id,r.body.version,{status:'rejected',rejection_reason:short(r.body.reason,'سبب الرفض',1000),fulfilled_by:r.user.id,fulfilled_at:new Date().toISOString()})}));
  }));
}
