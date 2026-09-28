import { all, one, type Database } from "./db.js";
import {
  admission,
  audit,
  billingFor,
  mutate,
  permit,
  requireKey,
  scopeSql,
  matchesPatientIdentity,
  uid,
  versioned,
  wrap,
  type Req,
  type RouteContext,
} from "./context.js";
import { ApiError, choice, date, required } from "./security.js";
import { insert } from "./seed.js";
import { closeHospitalServices } from "./hospital-services.js";

async function lockedAdmission(db: Database, r: Req, id: string) {
  await db.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [id]);
  return admission(db, r, id);
}
async function clearance(db: Database, id: string) {
  return (await one(
    db,
    "SELECT c.*,u.name AS approved_by_name,d.name AS authority_doctor_name FROM checkout_clearances c JOIN users u ON u.id=c.approved_by JOIN users d ON d.id=c.authority_doctor_id WHERE c.admission_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT 1",
    [id],
  )) || null;
}
async function approve(db: Database, r: Req, id: string) {
  const own = r.user.permissions.includes("clinical.approve");
  if (
    !own &&
    !(
      r.user.role === "reception" &&
      r.user.permissions.includes("patients.write")
    )
  )
    throw new ApiError(403, "ليس لديك صلاحية لتسجيل اعتماد الخروج");
  requireKey(r);
  if (
    !own &&
    Object.keys(r.body).some(
      (k) => !["doctor_id", "confirmation_note", "idempotency_key"].includes(k),
    )
  )
    throw new ApiError(
      400,
      "الاستقبال يسجل تأكيد الطبيب فقط ولا يعدل بيانات الخروج الطبية",
    );
  return mutate(db, r, "checkout_clearances", async (tx) => {
    const a = await lockedAdmission(tx, r, id);
    let doctor = r.user.id;
    let confirmation: string | null = null;
    if (!own) {
      doctor = required(r.body.doctor_id, "الطبيب الذي أكد الخروج");
      confirmation = required(r.body.confirmation_note, "بيان تأكيد الطبيب");
      const authority = await one(
        tx,
        "SELECT u.id FROM users u JOIN roles r ON r.name=u.role WHERE u.id=$1 AND u.active=true AND r.permissions @> '[\"clinical.approve\"]'::jsonb",
        [doctor],
      );
      if (!authority)
        throw new ApiError(409, "الطبيب المختار غير نشط أو غير مخول بالاعتماد");
    } else {
      if (r.body.doctor_id && r.body.doctor_id !== r.user.id)
        throw new ApiError(400, "الاعتماد الطبي يسجل باسم الطبيب الحالي فقط");
      const clinical: Record<string, any> = {};
      if (r.body.summary !== undefined)
        clinical.summary = required(r.body.summary, "ملخص الخروج");
      if (r.body.discharge_type !== undefined)
        clinical.discharge_type = choice(
          r.body.discharge_type,
          ["routine", "transfer", "against_advice", "death"],
          "نوع الخروج",
        );
      if (r.body.followup_at !== undefined)
        clinical.followup_at = r.body.followup_at
          ? date(r.body.followup_at, "المتابعة")
          : null;
      if (Object.keys(clinical).length)
        await versioned(
          tx,
          "admissions",
          a.id,
          r.body.version ?? a.version,
          clinical,
        );
    }
    return insert(tx, "checkout_clearances", {
      id: uid(),
      admission_id: a.id,
      approved_by: r.user.id,
      authority_doctor_id: doctor,
      approval_source: own ? "doctor" : "reception_on_behalf",
      confirmation_note: confirmation,
    });
  });
}
export function checkoutRoutes({ app, db }: RouteContext) {
  app.post(
    "/api/admissions/:id/discharge",
    wrap(async (r, s) => {
      permit(r, "clinical.approve");
      s.json(await approve(db, r, String(r.params.id)));
    }),
  );
  app.post(
    "/api/admissions/:id/checkout-clearance",
    wrap(async (r, s) => {
      s.status(201).json(await approve(db, r, String(r.params.id)));
    }),
  );
  app.post(
    "/api/admissions/:id/checkout-request",
    wrap(async (r, s) => {
      permit(r, "patients.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "checkout_requests", async (tx) => {
          const a = await lockedAdmission(tx, r, String(r.params.id));
          const existing = await one(
            tx,
            "SELECT * FROM checkout_requests WHERE admission_id=$1",
            [a.id],
          );
          if (existing) return existing;
          return insert(tx, "checkout_requests", {
            id: uid(),
            admission_id: a.id,
            notes: r.body.notes
              ? required(r.body.notes, "بيان طلب الخروج")
              : null,
            requested_by: r.user.id,
          });
        }),
      );
    }),
  );
  app.get(
    "/api/admissions/:id/checkout-status",
    wrap(async (r, s) => {
      permit(r, "patients.read");
      const a = await admission(db, r, String(r.params.id), false);
      s.json({
        admission_id: a.id,
        status: a.status,
        request: await one(
          db,
          "SELECT * FROM checkout_requests WHERE admission_id=$1",
          [a.id],
        ),
        clearance: await clearance(db, a.id),
      });
    }),
  );
  app.get(
    "/api/checkout-requests",
    wrap(async (r, s) => {
      permit(r, "billing.read");
      const rows = await all(
        db,
        `SELECT q.*,a.patient_id,a.admission_no,a.status AS admission_status,p.name AS patient_name,p.mrn,u.name AS requested_by_name FROM checkout_requests q JOIN admissions a ON a.id=q.admission_id JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=q.requested_by WHERE 1=1${scopeSql(r)} ORDER BY (q.status='pending') DESC,q.requested_at DESC LIMIT 500`,
      );
      for (const row of rows) {
        const bill = await billingFor(db, row.admission_id, r);
        row.patient_due = bill.totals.patient_due;
        row.insurance_outstanding = bill.totals.insurance_outstanding;
        row.balance = bill.totals.balance;
        row.clearance = await clearance(db, row.admission_id);
      }
      s.json(rows);
    }),
  );
  app.post(
    "/api/checkout-requests/:id/finalize",
    wrap(async (r, s) => {
      permit(r, "billing.write");
      if (!["accountant", "admin", "manager"].includes(r.user.role))
        throw new ApiError(403, "إنهاء الخروج من اختصاص الحسابات فقط");
      requireKey(r);
      if (
        Object.keys(r.body).some(
          (k) =>
            ![
              "version",
              "patient_mrn",
              "recipient",
              "idempotency_key",
            ].includes(k),
        )
      )
        throw new ApiError(
          400,
          "الحسابات تنهي الخروج دون تعديل البيانات الطبية",
        );
      s.json(
        await mutate(db, r, "checkout_requests", async (tx) => {
          const preliminary = await one(
            tx,
            "SELECT admission_id FROM checkout_requests WHERE id=$1",
            [r.params.id],
          );
          if (!preliminary) throw new ApiError(404, "طلب الخروج غير موجود");
          const a = await lockedAdmission(tx, r, preliminary.admission_id);
          const request = await one(
            tx,
            "SELECT * FROM checkout_requests WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (request.status !== "pending")
            throw new ApiError(409, "طلب الخروج منتهٍ بالفعل");
          if (!matchesPatientIdentity(a, required(r.body.patient_mrn, "رقم ملف الطفل")))
            throw new ApiError(409, "رقم ملف الطفل غير مطابق");
          const medical = await clearance(tx, a.id);
          const bill = await billingFor(tx, a.id, r);
          if (Math.round(bill.totals.patient_due * 100) > 0)
            throw new ApiError(
              409,
              "يلزم تسوية المستحق على المريض قبل إنهاء الخروج",
              "CHECKOUT_PATIENT_BALANCE",
            );
          const recipient = required(
            r.body.recipient,
            "اسم المستلم المتحقق منه",
          );
          await closeHospitalServices(tx, r, a);
          const when = new Date().toISOString();
          const updated = await versioned(
            tx,
            "checkout_requests",
            request.id,
            r.body.version,
            {
              status: "finalized",
              clearance_id: medical?.id || null,
              finalized_by: r.user.id,
              finalized_at: when,
            },
          );
          await tx.query(
            "UPDATE admissions SET status='discharged',discharged_at=$1,recipient=$2,version=version+1 WHERE id=$3",
            [when, recipient, a.id],
          );
          await tx.query('UPDATE monitor_bindings SET ended_at=now(),ended_by=$1 WHERE admission_id=$2 AND ended_at IS NULL',[r.user.id,a.id]);
          if (a.bed_id)
            await tx.query(
              "UPDATE beds SET status='cleaning',version=version+1 WHERE id=$1",
              [a.bed_id],
            );
          for (const previous of await all(
            tx,
            "SELECT * FROM orders WHERE admission_id=$1 AND status IN('draft','approved','suspended') FOR UPDATE",
            [a.id],
          ))
            await insert(tx, "order_versions", {
              id: uid(),
              order_id: previous.id,
              data: JSON.stringify(previous),
              actor_id: r.user.id,
            });
          await tx.query(
            "UPDATE orders SET status='stopped',reason='تنفيذ الخروج بعد الاعتماد وتسوية الحساب',version=version+1 WHERE admission_id=$1 AND status IN('draft','approved','suspended')",
            [a.id],
          );
          await tx.query(
            "UPDATE tasks SET status='cancelled',reason='انتهاء الإقامة؛ النتائج المعلقة تبقى في سجل المعمل',version=version+1 WHERE admission_id=$1 AND status IN('pending','deferred')",
            [a.id],
          );
          await insert(tx, "bed_movements", {
            id: uid(),
            admission_id: a.id,
            from_bed_id: a.bed_id,
            reason: "إنهاء الخروج بواسطة الحسابات بعد طلب الاستقبال وتسوية الحساب",
            actor_id: r.user.id,
          });
          await audit(
            tx,
            r,
            "discharge",
            "admissions",
            a.id,
            { clearance_id: medical?.id || null, request_id: request.id, recipient },
            a.patient_id,
          );
          return {
            ...updated,
            patient_due: bill.totals.patient_due,
            insurance_outstanding: bill.totals.insurance_outstanding,
          };
        }),
      );
    }),
  );
}
