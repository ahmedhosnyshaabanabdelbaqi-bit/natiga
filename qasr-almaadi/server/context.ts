import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction, Express } from "express";
import { type Database, one, all } from "./db.js";
import { insert } from "./seed.js";
import { ApiError, digest, required } from "./security.js";
import { insuranceFor } from "./insurance-data.js";
export type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
};
export type Req = Request & { user: User };
export type Handler = (r: Req, s: Response) => Promise<any>;
export const wrap =
  (fn: Handler) => (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r as Req, s)).catch(n);
export const uid = () => randomUUID();
export function permit(r: Req, permission: string) {
  if (!r.user) throw new ApiError(401, "يرجى تسجيل الدخول");
  if (!r.user.permissions.includes(permission))
    throw new ApiError(403, "ليس لديك صلاحية لتنفيذ هذا الإجراء", "FORBIDDEN");
}
export function scopeSql(r: Req, alias = "a") {
  const user = r.user.id.replace(/'/g, "''");
  if (r.user.role === "doctor")
    return ` AND (${alias}.doctor_id='${user}' OR ${alias}.nurse_id='${user}' OR EXISTS (SELECT 1 FROM hospital_surgeries hsc WHERE hsc.admission_id=${alias}.id AND hsc.surgeon_id='${user}' AND hsc.status<>'cancelled'))`;
  return ["doctor", "nurse"].includes(r.user.role)
    ? ` AND (${alias}.doctor_id='${user}' OR ${alias}.nurse_id='${user}')`
    : "";
}
export async function admission(
  db: Database,
  r: Req,
  id: string,
  active = true,
) {
  const a = await one(
    db,
    "SELECT a.*,p.mrn,p.barcode_no,p.name AS patient_name FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE a.id=$1" +
      scopeSql(r),
    [id],
  );
  if (!a) throw new ApiError(404, "الإقامة غير موجودة أو خارج نطاق التكليف");
  if (active && a.status !== "active")
    throw new ApiError(409, "الإقامة مغلقة؛ يسمح بمتابعة النتائج المعلقة فقط");
  return a;
}
export function matchesPatientIdentity(a: any, value: unknown) {
  const identity = String(value ?? "").trim();
  return identity === a.mrn || identity === String(a.barcode_no).padStart(5, "0");
}
export async function audit(
  db: Database,
  r: Req,
  action: string,
  entity: string,
  id?: string,
  details: any = {},
  patientId?: string,
) {
  await insert(db, "audit", {
    id: uid(),
    actor_id: r.user?.id || null,
    action,
    entity,
    entity_id: id || null,
    patient_id: patientId || null,
    details: JSON.stringify(details),
  });
}
export async function mutate(
  db: Database,
  r: Req,
  entity: string,
  fn: (tx: Database) => Promise<any>,
) {
  return db.transaction(async (tx) => {
    const key = r.body?.idempotency_key;
    // Replayed responses may contain fields permitted only to the original role.
    // A change of authority must invalidate the cache, even after a new login.
    const hash = digest(JSON.stringify({
      body: r.body,
      method: r.method,
      role: r.user.role,
      permissions: [...new Set(r.user.permissions)].sort(),
    }));
    if (key) {
      required(key, "مفتاح العملية");
      if (key.length > 160) throw new ApiError(400, "مفتاح العملية طويل جدًا");
      const previous = await one(
        tx,
        "SELECT * FROM idempotency WHERE key=$1 FOR UPDATE",
        [key],
      );
      if (previous) {
        if (
          previous.user_id !== r.user.id ||
          previous.route !== r.originalUrl ||
          previous.request_hash !== hash
        )
          throw new ApiError(409, "مفتاح إعادة المحاولة مستخدم لعملية مختلفة");
        // A cached response must not bypass a later change to a clinician's assignment.
        if (["doctor", "nurse"].includes(r.user.role)) {
          if (entity === "patients" && previous.response?.id && !await one(
            tx, patientSelect + " WHERE p.id=$1" + scopeSql(r), [previous.response.id],
          )) throw new ApiError(404, "ملف الطفل غير موجود أو خارج نطاق التكليف");
          let admissionId = previous.response?.admission_id;
          if (!admissionId && entity === "admissions") admissionId = previous.response?.id;
          if (!admissionId && previous.response?.order_id) {
            admissionId = (await one(tx, "SELECT admission_id FROM orders WHERE id=$1", [previous.response.order_id]))?.admission_id;
          }
          if (admissionId) await admission(tx, r, admissionId, false);
        }
        return previous.response;
      }
    }
    const result = await fn(tx);
    await audit(tx, r, r.method, entity, result?.id, { route: r.path });
    if (key)
      await insert(tx, "idempotency", {
        key,
        user_id: r.user.id,
        route: r.originalUrl,
        request_hash: hash,
        response: JSON.stringify(result),
      });
    return result;
  });
}
export function requireKey(r: Req) {
  required(r.body.idempotency_key, "مفتاح منع تكرار العملية");
}
export async function versioned(
  db: Database,
  table: string,
  id: string,
  version: any,
  fields: Record<string, any>,
) {
  if (!Number.isInteger(version))
    throw new ApiError(400, "رقم إصدار السجل مطلوب؛ أعد تحميل السجل");
  const keys = Object.keys(fields);
  const row = await one(
    db,
    `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")},version=version+1 WHERE id=$${keys.length + 1} AND version=$${keys.length + 2} RETURNING *`,
    [...Object.values(fields), id, version],
  );
  if (!row)
    throw new ApiError(
      409,
      "عُدّل السجل بواسطة مستخدم آخر. حدّث البيانات ثم أعد المحاولة",
      "VERSION_CONFLICT",
    );
  return row;
}
export const patientSelect = `SELECT p.*,a.department_id,a.encounter_type,hd.name AS department_name,a.id AS admission_id,a.admission_no,a.admitted_at,a.status AS admission_status,a.bed_id,b.name AS bed_name,a.care_level,a.diagnosis,d.name AS doctor_name,n.name AS nurse_name,(SELECT weight FROM vitals v WHERE v.admission_id=a.id AND weight IS NOT NULL ORDER BY measured_at DESC LIMIT 1) AS latest_weight FROM patients p LEFT JOIN LATERAL (SELECT * FROM admissions aa WHERE aa.patient_id=p.id ORDER BY admitted_at DESC LIMIT 1) a ON true LEFT JOIN hospital_departments hd ON hd.id=a.department_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN users d ON d.id=a.doctor_id LEFT JOIN users n ON n.id=a.nurse_id`;
export async function billingFor(db: Database, id?: string, request?: Req) {
  const where = (id ? " WHERE x.admission_id=$1" : " WHERE 1=1") + (request ? scopeSql(request) : "");
  const args = id ? [id] : [];
  const charges = await all(
      db,
      "SELECT x.* FROM charges x JOIN admissions a ON a.id=x.admission_id" + where + " ORDER BY x.created_at DESC",
      args,
    ),
    payments = await all(
      db,
      "SELECT x.* FROM payments x JOIN admissions a ON a.id=x.admission_id" + where + " ORDER BY x.created_at DESC",
      args,
    );
  const chargedCents = charges.reduce((n, v) => n + Math.round(Number(v.amount) * 100), 0),
    paidCents = payments.reduce((n, v) => n + Math.round(Number(v.amount) * 100), 0);
  const insurance = await insuranceFor(db,id,request ? scopeSql(request) : '');
  return {
    charges,
    payments,
    insurance_claims: insurance.insurance_claims,
    totals: { charged: chargedCents / 100, paid: paidCents / 100, balance: (chargedCents - paidCents) / 100,insurance_outstanding:insurance.insurance_outstanding,patient_due:(chargedCents-paidCents-Math.round(insurance.insurance_outstanding*100))/100 },
  };
}
export type RouteContext = { app: Express; db: Database };
