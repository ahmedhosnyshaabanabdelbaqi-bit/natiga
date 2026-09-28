import { all, type Database } from "./db.js";

// The optional scope comes only from the application's scopeSql helper, never request input.
export async function insuranceFor(db: Database, id?: string, scope = "") {
  const claims = await all(
    db,
    `SELECT c.*,u.name AS actor_name,COALESCE(sum(p.amount),0) AS collected,c.amount-COALESCE(sum(p.amount),0) AS outstanding FROM insurance_claims c JOIN admissions a ON a.id=c.admission_id LEFT JOIN users u ON u.id=c.actor_id LEFT JOIN payments p ON p.insurance_claim_id=c.id WHERE 1=1 ${id ? "AND c.admission_id=$1" : ""}${scope} GROUP BY c.id,u.name ORDER BY c.created_at DESC`,
    id ? [id] : [],
  );
  const collections = claims.length
    ? await all(
        db,
        "SELECT * FROM payments WHERE insurance_claim_id=ANY($1::text[]) ORDER BY created_at DESC",
        [claims.map((c) => c.id)],
      )
    : [];
  for (const c of claims)
    c.collections = collections.filter((p) => p.insurance_claim_id === c.id);
  const outstanding =
    claims.reduce((n, c) => n + Math.round(Number(c.outstanding) * 100), 0) /
    100;
  return { insurance_claims: claims, insurance_outstanding: outstanding };
}
