import fs from 'node:fs';
import crypto from 'node:crypto';
const base='https://child.egsystem.net', targetPassword=process.env.NICU_ACCOUNTS_PASSWORD;
const adminPassword=fs.readFileSync('output/PRIVATE-HOST-ACCESS.txt','utf8').match(/^Initial password: (.+)$/m)?.[1];
if(!adminPassword||!targetPassword) throw Error('Protected credentials unavailable');
const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:adminPassword})});
if(!login.ok) throw Error('Admin login failed'); const cookie=login.headers.get('set-cookie').split(';')[0];
const headers={Origin:base,'Content-Type':'application/json',Cookie:cookie};
const users=await fetch(base+'/api/users',{headers}).then(r=>r.json());
if(users.some(user=>user.username==='accounts')) console.log(JSON.stringify({status:'EXISTS',username:'accounts'}));
else {const response=await fetch(base+'/api/users',{method:'POST',headers,body:JSON.stringify({name:'مسؤول الحسابات والفواتير',username:'accounts',password:targetPassword,role:'accountant',idempotency_key:crypto.randomUUID()})}); const result=await response.json(); if(!response.ok)throw Error(JSON.stringify(result)); console.log(JSON.stringify({status:'CREATED',username:result.username,role:result.role}));}
