import { all, one } from "./db.js";
import {
  admission,
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
import { ApiError, choice, date, number, required } from "./security.js";
import { getLocale } from "./i18n.js";
import { insert } from "./seed.js";
function reject(r: Req, status: number, ar: string, en: string): never {
  throw new ApiError(
    status,
    getLocale(r) === "en" ? en : ar,
    "EQUIPMENT_ERROR",
  );
}
function readAccess(r: Req) {
  if (!r.user.permissions.includes("consumables.read")) permit(r, "beds.write");
}
function cost(r: Req, value: any) {
  const amount = number(value, "السعر", 0, 1000000);
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
    reject(
      r,
      400,
      "السعر يقبل منزلتين عشريتين فقط",
      "Price must have at most two decimal places",
    );
  return amount;
}
export function equipmentRoutes({ app, db }: RouteContext) {
  app.post(
    "/api/beds",
    wrap(async (r, s) => {
      permit(r, "beds.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "beds", async (tx) => {
          const department = await one(tx, "SELECT id,type,active FROM hospital_departments WHERE id=$1 FOR UPDATE", [r.body.department_id || "dept-nicu"]);
          if (!department?.active || !["nicu", "inpatient", "icu", "emergency", "surgery"].includes(department.type))
            reject(r, 400, "اختر قسمًا نشطًا صالحًا لتسكين الأسرة", "Choose an active department that supports beds");
          const status = choice(
            r.body.status || "available",
            ["available", "maintenance", "out_of_service", "cleaning"],
            "حالة السرير",
          );
          return insert(tx, "beds", {
            id: uid(),
            name: required(r.body.name, "اسم السرير"),
            department_id: department.id,
            room: required(r.body.room, "الغرفة"),
            care_level: choice(
              r.body.care_level,
              ["intensive", "intermediate", "general", "inpatient", "icu", "emergency", "nicu"],
              "مستوى الرعاية",
            ),
            status,
            reason:
              status === "available"
                ? String(r.body.reason || "")
                : required(r.body.reason, "سبب الحالة"),
          });
        }),
      );
    }),
  );
  app.get(
    "/api/equipment",
    wrap(async (r, s) => {
      readAccess(r);
      const aid =
        typeof r.query.admission_id === "string"
          ? r.query.admission_id
          : undefined;
      if (aid) {
        permit(r, "patients.read");
        await admission(db, r, aid, false);
      }
      const catalog = await all(
        db,
        "SELECT * FROM equipment ORDER BY name,code",
      );
      const history = r.user.permissions.includes("patients.read")
        ? await all(
            db,
            `SELECT x.*,p.name AS patient_name,p.mrn,a.admission_no,p.id AS patient_id,u.name AS actor_name FROM equipment_usage x JOIN admissions a ON a.id=x.admission_id JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=x.actor_id WHERE 1=1 ${scopeSql(r)} ${aid ? "AND a.id=$1" : ""} ORDER BY x.created_at DESC LIMIT 500`,
            aid ? [aid] : [],
          )
        : [];
      s.json({ catalog, history });
    }),
  );
  app.post(
    "/api/equipment",
    wrap(async (r, s) => {
      permit(r, "consumables.catalog");
      requireKey(r);
      if (r.body.unit_price !== undefined && r.body.unit_price !== "")
        permit(r, "prices.write");
      s.status(201).json(
        await mutate(db, r, "equipment", async (tx) =>
          insert(tx, "equipment", {
            id: uid(),
            code: required(r.body.code, "كود الجهاز"),
            name: required(r.body.name, "اسم الجهاز"),
            serial_number: String(r.body.serial_number || ""),
            location: String(r.body.location || ""),
            unit: choice(r.body.unit, ["use", "hour", "day"], "وحدة التسعير"),
            unit_price:
              r.body.unit_price === undefined || r.body.unit_price === ""
                ? null
                : cost(r, r.body.unit_price),
            status: "ready",
            created_by: r.user.id,
          }),
        ),
      );
    }),
  );
  app.patch(
    "/api/equipment/:id",
    wrap(async (r, s) => {
      if (!r.user.permissions.includes("consumables.catalog"))
        permit(r, "beds.write");
      requireKey(r);
      s.json(
        await mutate(db, r, "equipment", async (tx) => {
          const item = await one(
            tx,
            "SELECT * FROM equipment WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!item) reject(r, 404, "الجهاز غير موجود", "Equipment not found");
          const fields: Record<string, any> = {};
          if (r.body.status !== undefined) {
            if (
              await one(
                tx,
                "SELECT id FROM maintenance_jobs WHERE equipment_id=$1 AND status='in_progress'",
                [item.id],
              )
            )
              reject(
                r,
                409,
                "أكمل أمر الصيانة والتحقق قبل تغيير حالة الجهاز",
                "Complete and verify the active maintenance job before changing equipment status",
              );
            fields.status = choice(
              r.body.status,
              ["ready", "maintenance", "out_of_service"],
              "حالة الجهاز",
            );
            fields.reason = required(r.body.reason, "سبب تغيير الحالة");
          }
          if (r.body.unit_price !== undefined) {
            permit(r, "prices.write");
            fields.unit_price = cost(r, r.body.unit_price);
          }
          if (!Object.keys(fields).length)
            reject(
              r,
              400,
              "اختر الحالة أو السعر للتعديل",
              "Choose a status or price to update",
            );
          return versioned(tx, "equipment", item.id, r.body.version, fields);
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/equipment",
    wrap(async (r, s) => {
      permit(r, "consumables.use");
      permit(r, "patients.read");
      requireKey(r);
      await admission(db, r, String(r.params.id), false);
      s.status(201).json(
        await mutate(db, r, "equipment_usage", async (tx) => {
          await one(tx, "SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [
            r.params.id,
          ]);
          const a = await admission(tx, r, String(r.params.id));
          if (!matchesPatientIdentity(a, required(r.body.confirm_mrn, "رقم ملف الطفل")))
            reject(
              r,
              409,
              "رقم الملف لا يطابق الطفل المختار",
              "Medical record number does not match the selected infant",
            );
          const device = await one(
            tx,
            "SELECT * FROM equipment WHERE id=$1 FOR UPDATE",
            [required(r.body.equipment_id, "الجهاز")],
          );
          if (!device)
            reject(r, 404, "الجهاز غير موجود", "Equipment not found");
          if (device.status !== "ready")
            reject(
              r,
              409,
              "الجهاز تحت الصيانة أو خارج الخدمة ولا يمكن تسجيل استخدامه",
              "Equipment is under maintenance or out of service",
            );
          if (device.unit_price === null)
            reject(
              r,
              409,
              "يجب تحديد سعر الجهاز قبل الاستخدام",
              "Set an equipment price before recording use",
            );
          if (r.body.equipment_version !== device.version)
            reject(
              r,
              409,
              "تغيرت بيانات الجهاز أو سعره؛ حدّث الشاشة",
              "Equipment or price changed; refresh the screen",
            );
          if (
            ["amount", "unit_price", "actor_id", "sender_id"].some(
              (k) => k in r.body,
            )
          )
            reject(
              r,
              400,
              "السعر والمنفذ يحددهما الخادم",
              "The server determines the price and actor",
            );
          const quantity = number(r.body.quantity, "الكمية", 0.001, 100000);
          if (Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.00001)
            reject(
              r,
              400,
              "الكمية تقبل ثلاث منازل عشرية فقط",
              "Quantity supports at most three decimal places",
            );
          const usedAt = r.body.used_at
            ? date(r.body.used_at, "وقت الاستخدام")
            : new Date().toISOString();
          if (
            Date.parse(usedAt) > Date.now() + 300000 ||
            Date.parse(usedAt) < Date.parse(a.admitted_at)
          )
            reject(
              r,
              400,
              "وقت الاستخدام يجب أن يكون داخل الإقامة وحتى الوقت الحالي",
              "Use time must be within the admission and no later than now",
            );
          const amount =
            Math.round(Number(device.unit_price) * quantity * 100) / 100;
          const charge = await insert(tx, "charges", {
            id: uid(),
            admission_id: a.id,
            name: device.name + " [" + device.code + "]",
            quantity,
            unit_price: device.unit_price,
            amount,
            source: "equipment",
            actor_id: r.user.id,
          });
          return insert(tx, "equipment_usage", {
            id: uid(),
            equipment_id: device.id,
            admission_id: a.id,
            charge_id: charge.id,
            name_snapshot: device.name,
            code_snapshot: device.code,
            unit_snapshot: device.unit,
            quantity,
            unit_price: device.unit_price,
            amount,
            used_at: usedAt,
            notes: String(r.body.notes || "").slice(0, 4000),
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
}
