import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

test("dashboard trends zero-fill Cairo days and enforce assignment and patient permission", {timeout:120000}, async () => {
  const db = await initDb(":memory:");
  const app = await createApp(db, {seed:true});
  await db.query("UPDATE admissions SET admitted_at = '2020-01-01T00:00:00Z', discharged_at=NULL, doctor_id='manager', nurse_id='head_nurse'");
  await db.query("UPDATE admissions SET admitted_at=((now() AT TIME ZONE 'Africa/Cairo')::date - 1 + time '23:59') AT TIME ZONE 'Africa/Cairo', discharged_at=((now() AT TIME ZONE 'Africa/Cairo')::date + time '00:01') AT TIME ZONE 'Africa/Cairo', doctor_id='doctor' WHERE id='admission-1'");
  await db.query("UPDATE admissions SET admitted_at=((now() AT TIME ZONE 'Africa/Cairo')::date + time '00:01') AT TIME ZONE 'Africa/Cairo' WHERE id='admission-2'");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  const address=server.address(); assert.ok(address && typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  async function dashboard(role:string) {
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:role,password:'Training@2026'})});
    assert.equal(login.status,200);
    const response=await fetch(base+'/api/dashboard',{headers:{Cookie:login.headers.get('set-cookie')!.split(';')[0]}});
    assert.equal(response.status,200);return response.json();
  }
  try {
    const manager=await dashboard('manager');
    assert.equal(manager.trends.timezone,'Africa/Cairo');
    assert.equal(manager.trends.days.length,30);
    assert.deepEqual(manager.trends.days.slice(0,28).map((d:any)=>[d.admissions,d.discharges]),Array.from({length:28},()=>[0,0]));
    assert.equal(manager.trends.days[28].admissions,1);
    assert.equal(manager.trends.days[29].admissions,1);
    assert.equal(manager.trends.days[29].discharges,1);
    const doctor=await dashboard('doctor');
    assert.equal(doctor.trends.days[28].admissions,1);
    assert.equal(doctor.trends.days[29].admissions,0);
    assert.equal(doctor.trends.days[29].discharges,1);
    const nurse=await dashboard('nurse');
    assert.ok(nurse.trends.days.every((d:any)=>d.admissions===0&&d.discharges===0));
    await db.query("UPDATE roles SET permissions=$1 WHERE name='admin'",[JSON.stringify(['beds.write'])]);
    const limited=await dashboard('admin');assert.equal(limited.trends,null);assert.deepEqual(limited.patients,[]);
  } finally { await new Promise<void>(r=>server.close(()=>r()));await db.close(); }
});
