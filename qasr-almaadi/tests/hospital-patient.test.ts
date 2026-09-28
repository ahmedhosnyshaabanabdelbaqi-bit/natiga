import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDb, one } from '../server/db.js';
import { createApp } from '../server/app.js';

test('unified patient identity, adult observations and department admission remain connected', {timeout:60000}, async()=>{
  delete process.env.DATABASE_URL;
  const db=await initDb(':memory:');
  const server=(await createApp(db,{seed:true})).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Training@2026'})});
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  async function call(path:string,body?:any,expected=200,method='POST'){
    const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,'Content-Type':'application/json',Origin:origin},body:body===undefined?undefined:JSON.stringify({idempotency_key:randomUUID(),...body})});
    const result=await response.json(); assert.equal(response.status,expected,JSON.stringify(result));return result;
  }
  try{
    const p=await call('/patients',{name:'Adult hospital patient',birth_at:'1980-01-01',sex:'female',national_id:'HOSPITAL-UNIQUE-1',phone:'01000000000',registration_only:true},201);
    assert.equal(p.admission_id,null);
    assert.equal((await one(db,'SELECT count(*)::int n FROM admissions WHERE patient_id=$1',[p.id])).n,0);
    await call('/patients',{name:'Duplicate identity',birth_at:'1980-01-01',sex:'female',national_id:'HOSPITAL-UNIQUE-1',registration_only:true},409);
    const visit=await call(`/patients/${p.id}/admissions`,{department_id:'dept-emergency',encounter_type:'emergency',reason:'Assessment',doctor_id:'doctor',nurse_id:'nurse'},201);
    const reading=await call(`/admissions/${visit.id}/vitals`,{measured_at:new Date().toISOString(),weight:75000,systolic:120,diastolic:80,height_cm:170,pain_score:3},201);
    assert.equal(Number(reading.weight),75000); assert.equal(Number(reading.systolic),120);
    await call(`/admissions/${visit.id}/vitals`,{measured_at:new Date().toISOString(),systolic:80,diastolic:120},400);
    await call(`/patients/${p.id}/admissions`,{department_id:'dept-outpatient',encounter_type:'outpatient',reason:'Duplicate visit'},409);
    const history=await call(`/patients/${p.id}`);
    assert.equal(history.patient.department_id,'dept-emergency');
    assert.equal(history.patient.national_id,'HOSPITAL-UNIQUE-1');
    assert.equal(history.vitals.length,1);
    assert.equal(history.vitals[0].id,reading.id);
    assert.deepEqual(history.radiology,[]);
    await call(`/admissions/${visit.id}/transfer`,{bed_id:'bed-9',reason:'Wrong department'},409);
    assert.equal((await one(db,"SELECT status FROM beds WHERE id='bed-9'")).status,'available');
    await call('/patients',{name:'Mismatch',sex:'male',birth_at:'1990-01-01',department_id:'dept-emergency',encounter_type:'outpatient',reason:'Bad department'},400);
    await call('/admissions/admission-1/vitals',{measured_at:new Date().toISOString(),weight:75000},400);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await db.close();}
});
