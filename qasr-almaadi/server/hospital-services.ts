import { all, one, type Database } from "./db.js";
import { insert } from "./seed.js";
import { ApiError, choice, date, number, required } from "./security.js";
import {
  admission, audit, matchesPatientIdentity, mutate, permit, requireKey,
  scopeSql, uid, versioned, wrap, type Req, type RouteContext,
} from "./context.js";

const identity = "a.patient_id,a.admission_no,a.status AS admission_status,p.name AS patient_name,p.mrn";
const joins = "JOIN admissions a ON a.id=x.admission_id JOIN patients p ON p.id=a.patient_id";
const text = (value: unknown, label: string, max = 2000) => {
  const result = required(value, label);
  if (result.length > max) throw new ApiError(400, `${label} أطول من الحد المسموح`);
  return result;
};

async function lockAdmission(db: Database, r: Req, id: string, active = true) {
  await db.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [id]);
  return admission(db, r, id, active);
}

async function openAccountingPeriod(db: Database) {
  const period = await one(db, "SELECT to_char(now() AT TIME ZONE 'Africa/Cairo','YYYY-MM') AS month");
  if (await one(db, "SELECT id FROM accounting_periods WHERE month=$1 AND status='closed'", [period.month]))
    throw new ApiError(409, "الفترة المحاسبية الحالية مقفلة؛ افتحها قبل تسجيل حركة مالية", "ACCOUNTING_PERIOD_CLOSED");
}

async function selectedPrice(db: Database, id: unknown, item?: any) {
  if (!id) return null;
  const price = await one(db, "SELECT * FROM prices WHERE id=$1", [text(id, "كود السعر", 160)]);
  if (!price) throw new ApiError(404, "بند قائمة الأسعار غير موجود");
  if (new Date(price.valid_from).getTime() > Date.now())
    throw new ApiError(409, "السعر لم يبدأ سريانه بعد");
  const linked = await one(db, "SELECT consumable_id FROM consumable_prices WHERE price_id=$1", [price.id]);
  if (item) {
    if ((linked && linked.consumable_id !== item.consumable_id) ||
        (!linked && price.name.trim().toLocaleLowerCase() !== item.name.trim().toLocaleLowerCase()))
      throw new ApiError(409, "سعر الدواء لا يطابق الصنف المصروف", "MEDICATION_PRICE_MISMATCH");
    if (price.unit !== item.unit) throw new ApiError(409, "وحدة سعر الدواء لا تطابق وحدة المخزون");
  } else if (linked) throw new ApiError(409, "اختر سعر الخدمة؛ سعر المستهلك مرتبط بالصرف من المخزون");
  return price;
}

async function charge(db: Database, r: Req, a: any, price: any, quantity: number, source: string) {
  if (!price) return null;
  await openAccountingPeriod(db);
  return insert(db, "charges", {
    id: uid(), admission_id: a.id, price_id: price.id, name: price.name,
    quantity, unit_price: price.price,
    amount: Math.round(quantity * Number(price.price) * 100) / 100,
    source, actor_id: r.user.id,
  });
}

async function event(db: Database, r: Req, type: string, current: any, previous?: any) {
  await insert(db, "hospital_service_events", {
    id: uid(), service_type: type, service_id: current.id,
    admission_id: current.admission_id, previous_status: previous?.status || null,
    status: current.status, previous_version: previous?.version || null,
    result: current.result || null, reason: current.reason || null, actor_id: r.user.id,
  });
}

// Called while checkout holds the admission lock, in the same transaction as discharge.
export async function closeHospitalServices(db: Database, r: Req, a: any) {
  if (await one(db, "SELECT id FROM hospital_surgeries WHERE admission_id=$1 AND status='in_progress'", [a.id]))
    throw new ApiError(409, "توجد عملية جراحية قيد التنفيذ؛ أكمل توثيقها قبل إنهاء الخروج", "CHECKOUT_SURGERY_IN_PROGRESS");
  for (const [table, type, statuses] of [
    ["hospital_radiology", "radiology", "'ordered','scheduled'"],
    ["hospital_surgeries", "surgery", "'scheduled'"],
  ]) {
    const rows = await all(db, `SELECT * FROM ${table} WHERE admission_id=$1 AND status IN (${statuses}) FOR UPDATE`, [a.id]);
    for (const previous of rows) {
      const current = await versioned(db, table, previous.id, previous.version, { status: "cancelled", reason: "انتهاء الزيارة قبل تنفيذ الخدمة؛ يتطلب التنفيذ زيارة وطلبًا جديدين" });
      await event(db, r, type, current, previous);
      await audit(db, r, "cancel_at_discharge", table, current.id, { previous_status: previous.status }, a.patient_id);
    }
  }
}

export async function hospitalServicesFor(db: Database, r: Req, admissionId: string) {
  await admission(db, r, admissionId, false);
  const canRead = (permission: string) => r.user.permissions.includes(permission) || r.user.permissions.includes("clinical.read");
  return {
    radiology: canRead("radiology.read") ? await all(db,
      `SELECT x.*,${identity} FROM hospital_radiology x ${joins} WHERE x.admission_id=$1${scopeSql(r)} ORDER BY x.created_at DESC`, [admissionId]) : [],
    surgeries: canRead("surgery.read") ? await all(db,
      `SELECT x.*,u.name AS surgeon_name,${identity} FROM hospital_surgeries x ${joins} JOIN users u ON u.id=x.surgeon_id WHERE x.admission_id=$1${scopeSql(r)} ORDER BY x.scheduled_at DESC`, [admissionId]) : [],
    dispensations: canRead("pharmacy.read") ? await all(db,
      `SELECT x.*,${identity},u.name AS actor_name FROM pharmacy_dispenses x ${joins} JOIN users u ON u.id=x.actor_id WHERE x.admission_id=$1${scopeSql(r)} ORDER BY x.created_at DESC`, [admissionId]) : [],
  };
}

export function hospitalServiceRoutes({ app, db }: RouteContext) {
  app.get("/api/hospital/service-prices", wrap(async (r, s) => {
    permit(r, "clinical.write");
    s.json(await all(db, "SELECT p.id,p.name,p.price,p.unit,p.valid_from FROM prices p WHERE p.valid_from<=now() AND NOT EXISTS (SELECT 1 FROM consumable_prices cp WHERE cp.price_id=p.id) ORDER BY p.name,p.valid_from DESC"));
  }));
  app.get("/api/hospital/radiology", wrap(async (r, s) => {
    permit(r, "radiology.read");
    s.json(await all(db, `SELECT x.*,${identity} FROM hospital_radiology x ${joins} WHERE 1=1${scopeSql(r)} ORDER BY CASE x.priority WHEN 'urgent' THEN 0 ELSE 1 END,x.created_at DESC LIMIT 1000`));
  }));
  app.post("/api/admissions/:id/radiology", wrap(async (r, s) => {
    permit(r, "clinical.write"); requireKey(r);
    s.status(201).json(await mutate(db, r, "hospital_radiology", async tx => {
      const a = await lockAdmission(tx, r, String(r.params.id));
      const price = await selectedPrice(tx, r.body.price_id);
      const row = await insert(tx, "hospital_radiology", {
        id: uid(), admission_id: a.id, name: text(r.body.name, "اسم فحص الأشعة", 300),
        priority: choice(r.body.priority || "routine", ["routine", "urgent"], "الأولوية"),
        price_id: price?.id || null, created_by: r.user.id,
      });
      await event(tx, r, "radiology", row);
      await audit(tx, r, "ordered", "hospital_radiology", row.id, {}, a.patient_id);
      return row;
    }));
  }));
  app.post("/api/hospital/radiology/:id/transition", wrap(async (r, s) => {
    const status = choice(r.body.status, ["scheduled", "performed", "reported", "reviewed", "cancelled"], "الحالة");
    permit(r, status === "reviewed" ? "clinical.approve" : "radiology.write"); requireKey(r);
    s.json(await mutate(db, r, "hospital_radiology", async tx => {
      const preliminary = await one(tx, "SELECT admission_id FROM hospital_radiology WHERE id=$1", [r.params.id]);
      if (!preliminary) throw new ApiError(404, "طلب الأشعة غير موجود");
      const a = await lockAdmission(tx, r, preliminary.admission_id, !["reported", "reviewed", "cancelled"].includes(status));
      const row = await one(tx, "SELECT * FROM hospital_radiology WHERE id=$1 FOR UPDATE", [r.params.id]);
      const transitions: Record<string, string[]> = { ordered: ["scheduled", "cancelled"], scheduled: ["performed", "cancelled"], performed: ["reported"], reported: ["reviewed"] };
      if (!transitions[row.status]?.includes(status)) throw new ApiError(409, "انتقال حالة الأشعة غير مسموح");
      const fields: Record<string, any> = { status };
      if (status === "cancelled") fields.reason = text(r.body.reason, "سبب الإلغاء");
      if (status === "scheduled") fields.scheduled_at = date(r.body.scheduled_at || new Date().toISOString(), "موعد الأشعة");
      if (status === "performed") {
        const billed = row.charge_id ? null : await charge(tx, r, a, await selectedPrice(tx, row.price_id), 1, "radiology");
        fields.performed_at = new Date().toISOString(); fields.performed_by = r.user.id;
        if (billed) fields.charge_id = billed.id;
      }
      if (status === "reported") {
        fields.result = text(r.body.result, "تقرير الأشعة", 20000);
        fields.reported_at = new Date().toISOString(); fields.reported_by = r.user.id;
      }
      if (status === "reviewed") { fields.reviewed_at = new Date().toISOString(); fields.reviewed_by = r.user.id; }
      const updated = await versioned(tx, "hospital_radiology", row.id, r.body.version, fields);
      await event(tx, r, "radiology", updated, row);
      await audit(tx, r, status, "hospital_radiology", row.id, { previous_status: row.status }, a.patient_id);
      return updated;
    }));
  }));

  app.get("/api/hospital/surgeries", wrap(async (r, s) => {
    permit(r, "surgery.read");
    s.json(await all(db, `SELECT x.*,u.name AS surgeon_name,${identity} FROM hospital_surgeries x ${joins} JOIN users u ON u.id=x.surgeon_id WHERE 1=1${scopeSql(r)} ORDER BY x.scheduled_at DESC LIMIT 1000`));
  }));
  app.post("/api/admissions/:id/surgeries", wrap(async (r, s) => {
    permit(r, "clinical.write"); requireKey(r);
    s.status(201).json(await mutate(db, r, "hospital_surgeries", async tx => {
      const a = await lockAdmission(tx, r, String(r.params.id));
      const start = date(r.body.scheduled_at, "موعد العملية");
      const end = date(r.body.scheduled_end_at || new Date(new Date(start).getTime() + 3600000).toISOString(), "موعد انتهاء العملية");
      const duration = new Date(end).getTime() - new Date(start).getTime();
      if (duration <= 0 || duration > 86400000) throw new ApiError(400, "حدد مدة عملية أكبر من صفر ولا تتجاوز 24 ساعة");
      const theatre = text(r.body.theatre, "غرفة العمليات", 160).trim();
      await tx.query("INSERT INTO hospital_theatres(name) VALUES($1) ON CONFLICT DO NOTHING", [theatre]);
      await tx.query("SELECT name FROM hospital_theatres WHERE name=$1 FOR UPDATE", [theatre]);
      const surgeon = await one(tx, "SELECT u.id,u.active,r.permissions FROM users u JOIN roles r ON r.name=u.role WHERE u.id=$1 FOR UPDATE OF u", [r.body.surgeon_id]);
      if (!surgeon?.active || !surgeon.permissions.includes("clinical.approve")) throw new ApiError(400, "اختر طبيبًا نشطًا له صلاحية الاعتماد السريري");
      if (await one(tx, "SELECT id FROM hospital_surgeries WHERE status IN ('scheduled','in_progress') AND (theatre=$1 OR surgeon_id=$2) AND scheduled_at<$4::timestamptz AND scheduled_end_at>$3::timestamptz", [theatre, surgeon.id, start, end]))
        throw new ApiError(409, "موعد العملية يتعارض مع حجز الغرفة أو الطبيب", "SURGERY_SCHEDULE_CONFLICT");
      const price = await selectedPrice(tx, r.body.price_id);
      const row = await insert(tx, "hospital_surgeries", {
        id: uid(), admission_id: a.id, name: text(r.body.name, "اسم العملية", 300),
        scheduled_at: start, scheduled_end_at: end, theatre, surgeon_id: surgeon.id,
        price_id: price?.id || null, created_by: r.user.id,
      });
      await event(tx, r, "surgery", row);
      await audit(tx, r, "scheduled", "hospital_surgeries", row.id, {}, a.patient_id);
      return row;
    }));
  }));
  app.post("/api/hospital/surgeries/:id/transition", wrap(async (r, s) => {
    const status = choice(r.body.status, ["in_progress", "completed", "reviewed", "cancelled"], "الحالة");
    permit(r, status === "reviewed" ? "clinical.approve" : "surgery.write"); requireKey(r);
    s.json(await mutate(db, r, "hospital_surgeries", async tx => {
      const preliminary = await one(tx, "SELECT admission_id FROM hospital_surgeries WHERE id=$1", [r.params.id]);
      if (!preliminary) throw new ApiError(404, "العملية غير موجودة");
      const a = await lockAdmission(tx, r, preliminary.admission_id, !["reviewed", "cancelled"].includes(status));
      const row = await one(tx, "SELECT * FROM hospital_surgeries WHERE id=$1 FOR UPDATE", [r.params.id]);
      const transitions: Record<string, string[]> = { scheduled: ["in_progress", "cancelled"], in_progress: ["completed"], completed: ["reviewed"] };
      if (!transitions[row.status]?.includes(status)) throw new ApiError(409, "انتقال حالة العملية غير مسموح");
      const fields: Record<string, any> = { status };
      if (status === "cancelled") fields.reason = text(r.body.reason, "سبب الإلغاء");
      if (status === "in_progress") {
        await tx.query("SELECT name FROM hospital_theatres WHERE name=$1 FOR UPDATE", [row.theatre]);
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [row.surgeon_id]);
        if (await one(tx, "SELECT id FROM hospital_surgeries WHERE id<>$1 AND status='in_progress' AND (theatre=$2 OR surgeon_id=$3)", [row.id, row.theatre, row.surgeon_id]))
          throw new ApiError(409, "غرفة العمليات أو الطبيب مشغول بعملية قيد التنفيذ", "SURGERY_RESOURCE_BUSY");
        fields.started_at = new Date().toISOString();
      }
      if (status === "completed") {
        fields.result = text(r.body.result, "تقرير العملية", 20000);
        const billed = row.charge_id ? null : await charge(tx, r, a, await selectedPrice(tx, row.price_id), 1, "surgery");
        fields.completed_at = new Date().toISOString(); fields.completed_by = r.user.id;
        if (billed) fields.charge_id = billed.id;
      }
      if (status === "reviewed") { fields.reviewed_at = new Date().toISOString(); fields.reviewed_by = r.user.id; }
      const updated = await versioned(tx, "hospital_surgeries", row.id, r.body.version, fields);
      await event(tx, r, "surgery", updated, row);
      await audit(tx, r, status, "hospital_surgeries", row.id, { previous_status: row.status }, a.patient_id);
      return updated;
    }));
  }));

  app.get("/api/hospital/pharmacy", wrap(async (r, s) => {
    permit(r, "pharmacy.read");
    const orders = await all(db, `SELECT x.*,${identity},COALESCE((SELECT sum(d.quantity) FROM pharmacy_dispenses d WHERE d.order_id=x.id),0) AS quantity_dispensed FROM orders x ${joins} WHERE x.type='medication' AND x.status='approved' AND a.status='active'${scopeSql(r)} ORDER BY x.created_at DESC LIMIT 1000`);
    const inventory = await all(db, "SELECT id,name,unit,batch,expires_at,quantity,version,location,consumable_id FROM inventory WHERE quantity>0 AND expires_at>=(now() AT TIME ZONE 'Africa/Cairo')::date ORDER BY name,expires_at,batch");
    const dispensations = await all(db, `SELECT x.*,${identity},u.name AS actor_name FROM pharmacy_dispenses x ${joins} JOIN users u ON u.id=x.actor_id WHERE 1=1${scopeSql(r)} ORDER BY x.created_at DESC LIMIT 1000`);
    const prices = await all(db, "SELECT p.*,cp.consumable_id FROM prices p LEFT JOIN consumable_prices cp ON cp.price_id=p.id WHERE valid_from<=now() ORDER BY p.name,p.valid_from DESC");
    s.json({ orders, inventory, dispensations, prices });
  }));
  app.post("/api/hospital/pharmacy/dispense", wrap(async (r, s) => {
    permit(r, "pharmacy.write"); requireKey(r);
    s.status(201).json(await mutate(db, r, "pharmacy_dispenses", async tx => {
      const preliminary = await one(tx, "SELECT admission_id FROM orders WHERE id=$1", [r.body.order_id]);
      if (!preliminary) throw new ApiError(404, "أمر الدواء غير موجود");
      const a = await lockAdmission(tx, r, preliminary.admission_id);
      const order = await one(tx, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [r.body.order_id]);
      if (order.type !== "medication" || order.status !== "approved") throw new ApiError(409, "الصرف متاح لأوامر الأدوية المعتمدة فقط");
      if (!Number.isInteger(r.body.order_version) || r.body.order_version !== order.version) throw new ApiError(409, "تغير أمر الدواء؛ حدّث البيانات قبل الصرف", "VERSION_CONFLICT");
      if (!matchesPatientIdentity(a, r.body.patient_mrn)) throw new ApiError(409, "هوية المريض لا تطابق أمر الدواء", "IDENTITY_MISMATCH");
      const item = await one(tx, "SELECT *,expires_at<(now() AT TIME ZONE 'Africa/Cairo')::date AS expired FROM inventory WHERE id=$1 FOR UPDATE", [r.body.item_id]);
      if (!item) throw new ApiError(404, "تشغيلة الدواء غير موجودة");
      if (!Number.isInteger(r.body.item_version) || r.body.item_version !== item.version) throw new ApiError(409, "تغير رصيد التشغيلة؛ حدّث البيانات قبل الصرف", "VERSION_CONFLICT");
      if (item.expired) throw new ApiError(409, "لا يمكن صرف دواء منتهي الصلاحية");
      if (item.name.trim().toLocaleLowerCase() !== order.name.trim().toLocaleLowerCase()) throw new ApiError(409, "الصنف لا يطابق اسم الدواء الموصوف؛ يلزم أمر طبي مطابق دون استبدال تلقائي", "MEDICATION_MISMATCH");
      const quantity = number(r.body.quantity, "الكمية بوحدة المخزون", 0.0001);
      if (Number(item.quantity) < quantity) throw new ApiError(409, "رصيد التشغيلة غير كافٍ");
      await openAccountingPeriod(tx);
      const price = await selectedPrice(tx, r.body.price_id, item);
      const billed = await charge(tx, r, a, price, quantity, "pharmacy");
      await versioned(tx, "inventory", item.id, r.body.item_version, { quantity: Number(item.quantity) - quantity });
      const movement = await insert(tx, "stock_movements", {
        id: uid(), item_id: item.id, type: "issue", quantity,
        admission_id: a.id, reason: `صرف صيدلية لأمر ${order.id}`,
        cost_snapshot: item.cost, actor_id: r.user.id,
      });
      const row = await insert(tx, "pharmacy_dispenses", {
        id: uid(), admission_id: a.id, order_id: order.id, order_version: order.version,
        order_snapshot: JSON.stringify({ name: order.name, dose: order.dose, unit: order.unit, route: order.route, frequency: order.frequency, instructions: order.instructions, approved_by: order.approved_by, approved_at: order.approved_at }),
        item_id: item.id, item_name: item.name, batch: item.batch, unit: item.unit, quantity,
        movement_id: movement.id, charge_id: billed?.id || null, actor_id: r.user.id,
      });
      await audit(tx, r, "dispense", "pharmacy_dispenses", row.id, { order_id: order.id, item_id: item.id, quantity }, a.patient_id);
      return row;
    }));
  }));
}
