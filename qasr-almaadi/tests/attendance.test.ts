import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initDb} from '../server/db.js';
import {seedDatabase} from '../server/seed.js';
import {createApp} from '../server/app.js';
import {calculateEmployee} from '../server/payroll.js';

test('attendance pairing sorts arrivals, preserves overnight duration and flags incomplete pairs',()=>{
 const employee={id:'e',employee_no:'1',name:'test',monthly_salary:3000};const shifts=[{id:'s',shift_date:'2026-08-31',starts_at:'2026-08-31T17:00:00Z',ends_at:'2026-09-01T05:00:00Z'}];const policy={working_days_per_month:30,working_hours_per_day:8,grace_minutes:10,late_multiplier:1,absence_multiplier:1,overtime_multiplier:1.5};
 const out={id:'out',event:'out',occurred_at:'2026-09-01T05:30:00Z'},inside={id:'in',event:'in',occurred_at:'2026-08-31T17:20:00Z'};
 const result=calculateEmployee(employee,shifts,[out,inside],policy);
 assert.equal(result.issues.length,0);assert.equal(result.days[0].worked_minutes,730);assert.equal(result.days[0].late_minutes,10);assert.equal(result.days[0].overtime_minutes,30);assert.equal(result.net_salary,3007.3);
 assert.equal(calculateEmployee(employee,shifts,[inside],policy).issues[0].code,'MISSING_OR_CONFLICTING_PUNCH');
});

test('future shifts do not deduct absence and breaks are excluded from overtime work',()=>{
 const employee={id:'e',employee_no:'1',name:'test',monthly_salary:3000},policy={working_days_per_month:30,working_hours_per_day:8,grace_minutes:10,paid_break_minutes:0,late_multiplier:1,absence_multiplier:1,overtime_multiplier:1.5};
 const future=[{id:'future',shift_date:'future',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+86400000+8*3600000).toISOString()}];
 const upcoming=calculateEmployee(employee,future,[],policy);assert.equal(upcoming.days[0].status,'upcoming');assert.equal(upcoming.absence_deduction,0);assert.equal(upcoming.issues[0].code,'SHIFT_NOT_FINISHED');
 const shifts=[{id:'s',shift_date:'2026-08-20',starts_at:'2026-08-20T05:00:00Z',ends_at:'2026-08-20T13:00:00Z'}];
 const punches=[['a','in','05'],['b','out','09'],['c','in','10'],['d','out','13'],['e','in','14'],['f','out','15']].map(([id,event,hour])=>({id,event,occurred_at:`2026-08-20T${hour}:00:00Z`}));
 const result=calculateEmployee(employee,shifts,punches,policy);assert.equal(result.days[0].unpaid_break_minutes,60);assert.equal(result.days[0].overtime_minutes,60);assert.equal(result.late_deduction,12.5);assert.equal(result.overtime_pay,18.75);
});

test('authenticated ZK ingestion, role visibility, payroll recalculation and approved snapshot locks',{timeout:60000},async t=>{
 delete process.env.DATABASE_URL;const db=await initDb(':memory:');await seedDatabase(db);const server=(await createApp(db)).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();const origin=`http://127.0.0.1:${typeof address==='object'&&address?address.port:0}`;const cookies:Record<string,string>={};
 async function req(role:string,method:string,path:string,body?:any,status=200){const response=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookies[role]?{Cookie:cookies[role]}:{})},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookies[role]=response.headers.get('set-cookie')!.split(';')[0];const value=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(value)}`);return value}
 try{
  for(const role of ['manager','admin','accountant','head_nurse','nurse'])await req(role,'POST','/api/login',{username:role,password:'Training@2026'});
  let employee:any,device:any,period:any;
  await t.test('salary permissions and personal attendance scope are enforced on server',async()=>{
   await req('head_nurse','POST','/api/attendance/employees',{name:'منع راتب',employee_no:'deny',device_pin:'deny',monthly_salary:3000},403);
   employee=await req('manager','POST','/api/attendance/employees',{name:'موظف اختبار البصمة',employee_no:'E100',device_pin:'100',user_id:'nurse',monthly_salary:3000},201);
   const mine=await req('nurse','GET','/api/attendance');assert.equal(mine.employees.length,1);assert.equal(mine.employees[0].id,employee.id);assert.ok(!('monthly_salary' in mine.employees[0]));assert.equal(mine.periods.length,0);
   const administrative=await req('admin','GET','/api/attendance');assert.equal(Number(administrative.employees[0].monthly_salary),3000);
   await req('nurse','PATCH',`/api/attendance/employees/${employee.id}`,{version:employee.version,monthly_salary:1},403);
  });
  await t.test('device secret authentication, duplicate transport and out-of-order overnight punches',async()=>{
   device=await req('admin','POST','/api/attendance/devices',{name:'جهاز ZK اختبار',serial:'ZK-TEST-01'},201);assert.ok(device.secret);assert.ok(!('secret_hash' in device.device));
   await req('manager','POST','/api/attendance/shifts',{employee_id:employee.id,shift_date:'2026-08-31',start_time:'20:00',end_time:'08:00'},201);
   await req('manager','POST','/api/attendance/shifts',{employee_id:employee.id,shift_date:'2026-08-30',start_time:'08:00',end_time:'16:00'},201);
   await req('manager','POST','/api/attendance/shifts',{employee_id:employee.id,shift_date:'2026-08-28',start_time:'08:00',end_time:'16:00'},201);
   const path='/iclock/cdata?SN=ZK-TEST-01&table=ATTLOG',body='100\t2026-09-01 08:30:00\t1\t1\t0\n100\t2026-08-31 20:20:00\t0\t1\t0';
   const invalid=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'text/plain'},body});assert.equal(invalid.status,401);
   for(let attempt=0;attempt<2;attempt++){const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'text/plain','X-Device-Secret':device.secret},body});assert.equal(response.status,200,await response.clone().text());assert.equal(await response.text(),'OK: 2')}
   assert.equal((await db.query('SELECT count(*)::int AS n FROM attendance_punches')).rows[0].n,2);
   await req('manager','POST','/api/attendance/punches',{employee_id:employee.id,occurred_at:'2026-08-30T05:00:00Z',event:'in',reason:'إكمال اختبار الإدخال اليدوي'},201);
   const info=await req('manager','GET','/api/attendance');assert.ok(info.devices[0].last_seen_at);assert.ok(!('secret_hash' in info.devices[0]));
  });
  await t.test('missing punch blocks approval; new logs stale the draft until explicit recalculation',async()=>{
   period=await req('accountant','POST','/api/payroll/preview',{month:'2026-08'},201);assert.ok(period.issues.some((i:any)=>i.code==='MISSING_OR_CONFLICTING_PUNCH'));
   await req('accountant','POST',`/api/payroll/${period.id}/approve`,{version:period.version},403);
   await req('manager','POST',`/api/payroll/${period.id}/approve`,{version:period.version},409);
   await req('manager','POST','/api/attendance/import',{csv:'device_pin,occurred_at,event\n100,2026-08-30T13:00:00Z,out'},201);
   period=await req('accountant','GET',`/api/payroll/${period.id}`);assert.equal(period.stale,true);
   await req('manager','POST',`/api/payroll/${period.id}/approve`,{version:period.version},409);
   period=await req('accountant','POST',`/api/payroll/${period.id}/recalculate`,{version:period.version});assert.equal(period.stale,false);assert.equal(period.issues.length,0);assert.equal(period.employees[0].absent_shifts,1);assert.equal(period.totals.net_salary,2907.3);
   const second=await req('manager','POST','/api/attendance/import',{csv:'device_pin,occurred_at,event\n100,2026-08-30T13:00:00Z,out'},201);assert.equal(second.inserted_count,0);
   const clean=await req('accountant','GET',`/api/payroll/${period.id}`);assert.equal(clean.stale,false);
  });
  await t.test('approved payroll is immutable; later device logs flag reconciliation without changing salary',async()=>{
   period=await req('manager','POST',`/api/payroll/${period.id}/approve`,{version:period.version});assert.equal(period.status,'approved');
   await req('manager','POST',`/api/payroll/${period.id}/recalculate`,{version:period.version},409);
   await req('manager','POST','/api/attendance/punches',{employee_id:employee.id,occurred_at:'2026-08-28T05:00:00Z',event:'in',reason:'تعديل فترة مقفلة'},409);
   await req('manager','POST','/api/attendance/shifts',{employee_id:employee.id,shift_date:'2026-08-29',start_time:'08:00',end_time:'16:00'},409);
   const late=await fetch(origin+'/iclock/cdata?SN=ZK-TEST-01&table=ATTLOG',{method:'POST',headers:{'Content-Type':'text/plain','X-Device-Secret':device.secret},body:'100\t2026-08-28 08:00:00\t0\t1\t0'});assert.equal(late.status,200);
   const frozen=await req('accountant','GET',`/api/payroll/${period.id}`);assert.equal(frozen.has_late_changes,true);assert.equal(frozen.totals.net_salary,period.totals.net_salary);assert.equal(frozen.version,period.version);
   await req('nurse','GET',`/api/payroll/${period.id}`,undefined,403);
  });
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db.close()}
});
