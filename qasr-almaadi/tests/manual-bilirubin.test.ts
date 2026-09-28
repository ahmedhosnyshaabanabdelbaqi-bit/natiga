import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initDb} from '../server/db.js';
import {seedDatabase} from '../server/seed.js';
import {createApp} from '../server/app.js';

test('nursing records monitor and bilirubin readings manually without a device link',async()=>{
 const db=await initDb(':memory:');await seedDatabase(db);const server=(await createApp(db)).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;let cookie='';
 async function request(body:any,status=201){if(!cookie){const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'nurse',password:'Training@2026'})});cookie=login.headers.get('set-cookie')!.split(';')[0]}const response=await fetch(base+'/api/admissions/admission-1/monitor-readings',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)}),result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result}
 try{
  const baseReading={confirm_mrn:'QM-2026-00101',measured_at:new Date(Date.now()-1000).toISOString(),idempotency_key:randomUUID()};
  const saved=await request({...baseReading,heart_rate:132,spo2:97,temperature:36.8,bilirubin_total:8.4,bilirubin_direct:.6,bilirubin_method:'transcutaneous'});assert.equal(saved.monitor_binding_id,null);assert.equal(Number(saved.bilirubin_total),8.4);assert.equal(saved.bilirubin_method,'transcutaneous');
  await request({...baseReading,idempotency_key:randomUUID(),bilirubin_total:3,bilirubin_direct:4,bilirubin_method:'serum'},400);
  const page=await fetch(base+'/api/patients/patient-1',{headers:{Origin:base,Cookie:cookie}}).then(r=>r.json());assert.equal(page.vitals.filter((x:any)=>x.id===saved.id).length,1);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close()}
});
