import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test("financial center reconciles statements and exports Excel and printable PDF", {timeout:60000}, async()=>{
  const db=await initDb(":memory:");await seedDatabase(db);const server=(await createApp(db)).listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const address=server.address() as {port:number},origin=`http://127.0.0.1:${address.port}`;let cookie="";
  const call=async(path:string,username?:string)=>{if(username){const login=await fetch(origin+"/api/login",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({username,password:"Training@2026"})});cookie=login.headers.get("set-cookie")!.split(";")[0]}return fetch(origin+"/api"+path,{headers:{Origin:origin,Cookie:cookie}})};
  try{
    await call("/session","accountant");const response=await call("/financial-statements?from=2026-01-01&end=2026-12-31");assert.equal(response.status,200);const data=await response.json();assert.ok(data.income.length>=3);assert.ok(data.position.length>=4);assert.equal(data.trial.at(-1).debit,data.trial.at(-1).credit);assert.ok(data.summary.assets>=0);
    const excel=await call("/financial-statements?from=2026-01-01&end=2026-12-31&format=excel");assert.match(excel.headers.get("content-type")||"",/excel/);const xml=await excel.text();assert.match(xml,/<Workbook/);assert.equal((xml.match(/<Worksheet /g)||[]).length,6);
    const pdf=await call("/financial-statements?from=2026-01-01&end=2026-12-31&format=pdf");assert.match(pdf.headers.get("content-type")||"",/html/);assert.match(await pdf.text(),/طباعة \/ حفظ PDF/);
    await call("/session","reception");assert.equal((await call("/financial-statements")).status,403);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await db.close()}
});
