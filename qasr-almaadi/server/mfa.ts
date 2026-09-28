import { all } from './db.js';
import { audit, wrap, type RouteContext } from './context.js';

// Additional verification was retired by the hospital. Account security now
// exposes only active-session review and explicit session revocation.
export function securityRoutes({app,db}:RouteContext){
  app.get('/api/security',wrap(async(r,s)=>{
    const sessions=await all(db,'SELECT created_at,expires_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC',[r.user.id]);
    s.json({additional_verification:false,sessions});
  }));
  app.post('/api/security/revoke-sessions',wrap(async(r,s)=>{
    await db.transaction(async tx=>{
      await tx.query('DELETE FROM sessions WHERE user_id=$1',[r.user.id]);
      await audit(tx,r,'sessions_revoked','security',r.user.id);
    });
    s.json({ok:true,relogin:true});
  }));
}
