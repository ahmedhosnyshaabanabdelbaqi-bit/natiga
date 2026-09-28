import { all, one, type Database } from "./db.js";
import {
  admission,
  audit,
  mutate,
  permit,
  requireKey,
  scopeSql,
  matchesPatientIdentity,
  uid,
  wrap,
  type Req,
  type RouteContext,
} from "./context.js";
import { ApiError, date, number, required } from "./security.js";
import { insert } from "./seed.js";
const limits: Record<string, [number, number]> = {
  temperature: [20, 50],
  heart_rate: [0, 350],
  respiratory_rate: [0, 200],
  spo2: [0, 100],
  weight: [100, 15000],
  glucose: [0, 1500],
  intake: [0, 10000],
  output: [0, 10000],
  bilirubin_total: [0, 50],
  bilirubin_direct: [0, 30],
};
function bindingAccess(r: Req) {
  permit(r, "patients.read");
  if (!r.user.permissions.includes("nursing.write"))
    permit(r, "clinical.write");
}
function body(r: Req, allowed: string[]) {
  if (!r.body || Object.keys(r.body).some((k) => !allowed.includes(k)))
    throw new ApiError(
      400,
      "حقول المتابعة غير مسموحة؛ القراءات تسجل يدويًا باسم المستخدم الحالي",
    );
  requireKey(r);
}
async function identified(db: Database, r: Req, id: string, active = true) {
  await db.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [id]);
  const a = await admission(db, r, id, active);
  if (!matchesPatientIdentity(a, required(r.body.confirm_mrn, "رقم ملف الطفل")))
    throw new ApiError(409, "رقم ملف الطفل غير مطابق");
  return a;
}
const bindingSelect =
  "SELECT b.*,e.name AS equipment_name,e.code AS equipment_code,e.status AS equipment_status,u.name AS actor_name FROM monitor_bindings b JOIN equipment e ON e.id=b.equipment_id JOIN users u ON u.id=b.actor_id";
export function monitoringRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/monitoring",
    wrap(async (r, s) => {
      permit(r, "clinical.read");
      permit(r, "patients.read");
      const admissions = await all(
        db,
        `SELECT a.id,a.id AS admission_id,a.patient_id,a.bed_id,a.admitted_at,p.name AS patient_name,p.mrn,b.name AS bed_name FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds b ON b.id=a.bed_id WHERE a.status='active'${scopeSql(r)} ORDER BY b.name,p.name`,
      );
      const ids = admissions.map((a) => a.id);
      const bindings = ids.length
        ? await all(
            db,
            bindingSelect +
              " WHERE b.admission_id=ANY($1::text[]) AND b.ended_at IS NULL",
            [ids],
          )
        : [];
      const vitals = ids.length
        ? await all(
            db,
            `SELECT DISTINCT ON(v.admission_id) v.*,u.name AS actor_name FROM vitals v LEFT JOIN users u ON u.id=v.actor_id WHERE v.admission_id=ANY($1::text[]) ORDER BY v.admission_id,v.measured_at DESC,v.created_at DESC,v.id DESC`,
            [ids],
          )
        : [];
      for (const a of admissions) {
        a.binding = bindings.find((b) => b.admission_id === a.id) || null;
        if (a.binding)
          a.binding.is_current =
            a.binding.bed_id === a.bed_id &&
            a.binding.equipment_status === "ready";
        a.latest_vitals = vitals.find((v) => v.admission_id === a.id) || null;
      }
      const equipment = await all(
        db,
        "SELECT id,code,name,serial_number,location,status FROM equipment WHERE status='ready' ORDER BY name,code",
      );
      s.json({ source: "manual", admissions, equipment, bindings });
    }),
  );
  app.post(
    "/api/admissions/:id/monitor-binding",
    wrap(async (r, s) => {
      bindingAccess(r);
      body(r, ["equipment_id", "confirm_mrn", "idempotency_key"]);
      s.status(201).json(
        await db.transaction(async (tx) => {
          const a = await identified(tx, r, String(r.params.id));
          if (!a.bed_id)
            throw new ApiError(
              409,
              "يلزم تسكين الطفل على سرير قبل ربط جهاز المتابعة",
            );
          const device = await one(
            tx,
            "SELECT id,status FROM equipment WHERE id=$1 FOR UPDATE",
            [required(r.body.equipment_id, "الجهاز")],
          );
          if (!device || device.status !== "ready")
            throw new ApiError(409, "جهاز المتابعة غير موجود أو غير جاهز");
          const busy = await one(
            tx,
            "SELECT admission_id FROM monitor_bindings WHERE equipment_id=$1 AND ended_at IS NULL",
            [device.id],
          );
          if (busy && busy.admission_id !== a.id)
            throw new ApiError(
              409,
              "الجهاز مرتبط بطفل آخر؛ لا يمكن نقل الربط من هذه الشاشة",
            );
          const result = await mutate(
            tx,
            r,
            "monitor_bindings",
            async (inner) => {
              await inner.query(
                "UPDATE monitor_bindings SET ended_at=now(),ended_by=$1 WHERE admission_id=$2 AND ended_at IS NULL",
                [r.user.id, a.id],
              );
              return insert(inner, "monitor_bindings", {
                id: uid(),
                admission_id: a.id,
                equipment_id: device.id,
                bed_id: a.bed_id,
                actor_id: r.user.id,
              });
            },
          );
          const current = await one(
            tx,
            "SELECT id FROM monitor_bindings WHERE id=$1 AND bed_id=$2 AND ended_at IS NULL",
            [result.id, a.bed_id],
          );
          if (!current)
            throw new ApiError(
              409,
              "تغير ربط الجهاز أو السرير؛ حدّث الشاشة وأعد الربط",
            );
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/monitor-unbind",
    wrap(async (r, s) => {
      bindingAccess(r);
      body(r, ["binding_id", "confirm_mrn", "idempotency_key"]);
      s.json(
        await db.transaction(async (tx) => {
          const a = await identified(tx, r, String(r.params.id), false);
          const binding = await one(
            tx,
            "SELECT * FROM monitor_bindings WHERE id=$1 AND admission_id=$2 FOR UPDATE",
            [required(r.body.binding_id, "ربط الجهاز"), a.id],
          );
          if (!binding)
            throw new ApiError(404, "ربط الجهاز غير موجود لهذه الإقامة");
          return mutate(tx, r, "monitor_bindings", async (inner) =>
            one(
              inner,
              "UPDATE monitor_bindings SET ended_at=COALESCE(ended_at,now()),ended_by=COALESCE(ended_by,$1) WHERE id=$2 RETURNING *",
              [r.user.id, binding.id],
            ),
          );
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/monitor-readings",
    wrap(async (r, s) => {
      permit(r, "nursing.write");
      permit(r, "patients.read");
      body(r, [
        "binding_id",
        "confirm_mrn",
        "measured_at",
        "notes",
        "bilirubin_method",
        "idempotency_key",
        ...Object.keys(limits),
      ]);
      s.status(201).json(
        await db.transaction(async (tx) => {
          const a = await identified(tx, r, String(r.params.id));
          const binding = r.body.binding_id ? await one(
            tx,
            "SELECT * FROM monitor_bindings WHERE id=$1 AND admission_id=$2 AND ended_at IS NULL FOR UPDATE",
            [r.body.binding_id, a.id],
          ) : null;
          if (r.body.binding_id && (!binding || binding.bed_id !== a.bed_id))
            throw new ApiError(409, "تغير ربط الجهاز أو السرير؛ حدّث الشاشة وأعد الربط");
          if (binding) {
            const equipment = await one(tx,"SELECT id FROM equipment WHERE id=$1 AND status='ready' FOR SHARE",[binding.equipment_id]);
            if (!equipment) throw new ApiError(409, "جهاز المتابعة غير موجود أو غير جاهز");
          }
          const measured = date(r.body.measured_at, "القياس");
          if (
            Date.parse(measured) > Date.now() ||
            Date.parse(measured) < Date.parse(a.admitted_at)
          )
            throw new ApiError(
              400,
              "وقت القراءة يجب أن يكون داخل الإقامة وليس في المستقبل",
            );
          const fields: Record<string, number> = {};
          for (const [key, [min, max]] of Object.entries(limits))
            if (r.body[key] !== undefined && r.body[key] !== "")
              fields[key] = number(r.body[key], key, min, max);
          if (!Object.keys(fields).length)
            throw new ApiError(400, "أدخل قراءة واحدة على الأقل");
          if (fields.bilirubin_total !== undefined && fields.bilirubin_direct !== undefined && fields.bilirubin_direct > fields.bilirubin_total)
            throw new ApiError(400, "قراءة الصفراء المباشرة لا يمكن أن تتجاوز الصفراء الكلية");
          const bilirubinMethod = fields.bilirubin_total !== undefined || fields.bilirubin_direct !== undefined
            ? ["transcutaneous", "serum", "other"].includes(r.body.bilirubin_method) ? r.body.bilirubin_method : "transcutaneous"
            : null;
          return mutate(tx, r, "vitals", async (inner) => {
            const row = await insert(inner, "vitals", {
              id: uid(),
              admission_id: a.id,
              monitor_binding_id: binding?.id || null,
              measured_at: measured,
              ...fields,
              bilirubin_method: bilirubinMethod,
              notes: r.body.notes
                ? required(r.body.notes, "ملاحظات القراءة")
                : null,
              actor_id: r.user.id,
              source: "manual",
            });
            await audit(
              inner,
              r,
              "record",
              "vitals",
              row.id,
              { source: "manual", monitor_binding_id: binding?.id || null },
              a.patient_id,
            );
            return { ...row, actor_name: r.user.name };
          });
        }),
      );
    }),
  );
}
