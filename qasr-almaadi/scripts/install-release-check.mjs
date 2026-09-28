import fs from 'node:fs';
import crypto from 'node:crypto';
const base='https://child.egsystem.net';
const password=fs.readFileSync('output/PRIVATE-HOST-ACCESS.txt','utf8').match(/^Initial password: (.+)$/m)?.[1];
const version=process.argv[2]||'0.2.1', packagePath=process.argv[3]||`output/qasr-nicu-${version}.nicu-update`;
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(20000)});
const login=await request(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})});
if(!login.ok) throw Error('Login failed '+login.status);
const cookie=login.headers.get('set-cookie').split(';')[0], headers={Origin:base,'Content-Type':'application/json',Cookie:cookie};
const upload=await request(base+'/api/software-updates/upload',{method:'POST',headers,body:JSON.stringify({package:pkg,idempotency_key:crypto.randomUUID()})});
const job=await upload.json(); if(!upload.ok) throw Error('Upload failed '+JSON.stringify(job));
const install=await request(base+`/api/software-updates/${job.id}/install`,{method:'POST',headers,body:JSON.stringify({confirm_version:version,idempotency_key:crypto.randomUUID()})});
const queued=await install.json(); if(install.status!==202) throw Error('Install failed '+JSON.stringify(queued));
let final, terminal, lastStatus;
const deadline=Date.now()+240000;
while(Date.now()<deadline){
  await new Promise(r=>setTimeout(r,2000));
  let health, updates;
  try {
    health=await request(base+'/api/health').then(r=>r.json());
    updates=await request(base+'/api/software-updates',{headers}).then(r=>r.json());
  } catch {continue;}
  terminal=updates.jobs?.find(item=>item.id===job.id);
  if(terminal?.status!==lastStatus){lastStatus=terminal?.status;console.log(JSON.stringify({job:job.id,status:lastStatus||'restarting'}));}
  if(['failed','rolled_back','rollback_failed'].includes(terminal?.status)) throw Error('Update ended with '+terminal.status);
  if(health.ok && health.release?.version===version && terminal?.status==='installed' && updates.maintenance===false){final=health;break;}
}
if(!final) throw Error('Release did not finish installation and clear maintenance before deadline');
console.log(JSON.stringify({status:'PASS',job:job.id,jobStatus:terminal.status,maintenance:false,release:final.release}));
