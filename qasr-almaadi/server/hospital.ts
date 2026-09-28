import { all, one, type Database } from "./db.js";
import { insert } from "./seed.js";
import { ApiError, choice, date, number, required } from "./security.js";
import { admission, audit, mutate, permit, requireKey, scopeSql, uid, versioned, wrap, type Req, type RouteContext } from "./context.js";

const departmentTypes = ["nicu", "outpatient", "emergency", "inpatient", "icu", "surgery", "lab", "radiology", "pharmacy"];
const encounterTypes = ["nicu", "outpatient", "emergency", "inpatient", "icu"];
const triageLevels = ["immediate", "very_urgent", "urgent", "standard", "non_urgent"];
const appointmentSelect = `SELECT ap.*,p.name AS patient_name,p.mrn,p.phone,p.guardian_phone,d.name AS department_name,u.name AS doctor_name FROM hospital_appointments ap JOIN patients p ON p.id=ap.patient_id JOIN hospital_departments d ON d.id=ap.department_id JOIN users u ON u.id=ap.doctor_id`;

function clinicalProjection(r: Req, row: any) {
  if (r.user.permissions.includes("clinical.read")) return row;
  const { notes, diagnosis, reason, summary, followup_at, triage_level, cancellation_reason, ...safe } = row;
  return safe;
}
function appointmentScope(r: Req) {
  if (!["doctor", "nurse"].includes(r.user.role)) return "";
  const user = r.user.id.replace(/'/g, "''");
  return ` AND (ap.doctor_id='${user}' OR EXISTS (SELECT 1 FROM admissions a WHERE a.id=ap.admission_id${scopeSql(r)}))`;
}
async function activeDepartment(db: Database, id: unknown) {
  const row = await one(db, "SELECT * FROM hospital_departments WHERE id=$1 FOR UPDATE", [required(id, "القسم")]);
  if (!row || !row.active) throw new ApiError(400, "القسم غير موجود أو غير نشط");
  return row;
}
async function assignment(db: Database, id: unknown, roles: string[], label: string, lock = false) {
  const row = await one(db, `SELECT id,role FROM users WHERE id=$1 AND active=true${lock ? " FOR UPDATE" : ""}`, [required(id, label)]);
  if (!row || !roles.includes(row.role)) throw new ApiError(400, `${label} غير صالح أو غير نشط`);
  return row.id;
}
async function scopedAppointment(db: Database, r: Req, id: string) {
  const row = await one(db, `SELECT ap.* FROM hospital_appointments ap WHERE ap.id=$1${appointmentScope(r)} FOR UPDATE`, [id]);
  if (!row) throw new ApiError(404, "الموعد غير موجود أو خارج نطاق التكليف");
  return row;
}
function expectVersion(row: any, version: unknown) {
  if (!Number.isInteger(version)) throw new ApiError(400, "رقم إصدار السجل مطلوب؛ أعد تحميل السجل");
  if (row.version !== version) throw new ApiError(409, "عُدّل السجل بواسطة مستخدم آخر. حدّث البيانات ثم أعد المحاولة", "VERSION_CONFLICT");
}

export function hospitalRoutes({ app, db }: RouteContext) {
  app.get("/api/hospital/departments", wrap(async (r, s) => {
    if (!r.user.permissions.includes("patients.read") && !r.user.permissions.includes("beds.write")) permit(r, "settings.write");
    s.json(await all(db, "SELECT * FROM hospital_departments ORDER BY name,id"));
  }));
  app.post("/api/hospital/departments", wrap(async (r, s) => {
    permit(r, "settings.write");
    requireKey(r);
    s.status(201).json(await mutate(db, r, "hospital_departments", async tx => {
      const id = uid(), name = required(r.body.name, "اسم القسم"), type = choice(r.body.type, departmentTypes, "نوع القسم");
      const center = await one(tx, "INSERT INTO cost_centers(id,code,name_ar,name_en) VALUES($1,'HOSP-' || upper(substr(md5($2),1,15)),$3,$3) RETURNING id", [`cc-hospital-${id}`, id, name]);
      return insert(tx, "hospital_departments", { id, name, type, cost_center_id: center.id });
    }));
  }));
  app.patch("/api/hospital/departments/:id", wrap(async (r, s) => {
    permit(r, "settings.write");
    s.json(await mutate(db, r, "hospital_departments", async tx => {
      const row = await one(tx, "SELECT * FROM hospital_departments WHERE id=$1 FOR UPDATE", [r.params.id]);
      if (!row) throw new ApiError(404, "القسم غير موجود");
      const fields: Record<string, any> = {};
      if (r.body.name !== undefined) fields.name = required(r.body.name, "اسم القسم");
      if (r.body.active !== undefined) {
        if (typeof r.body.active !== "boolean") throw new ApiError(400, "حالة القسم غير صالحة");
        if (!r.body.active && (await one(tx, "SELECT id FROM admissions WHERE department_id=$1 AND status='active' LIMIT 1", [row.id]) ||
          await one(tx, "SELECT id FROM hospital_appointments WHERE department_id=$1 AND status IN ('scheduled','arrived') LIMIT 1", [row.id])))
          throw new ApiError(409, "لا يمكن إيقاف قسم به زيارات نشطة أو مواعيد مفتوحة");
        fields.active = r.body.active;
      }
      if (r.body.type !== undefined && r.body.type !== row.type) {
        if (await one(tx, "SELECT id FROM admissions WHERE department_id=$1 LIMIT 1", [row.id]) ||
          await one(tx, "SELECT id FROM beds WHERE department_id=$1 LIMIT 1", [row.id]) ||
          await one(tx, "SELECT id FROM hospital_appointments WHERE department_id=$1 LIMIT 1", [row.id]))
          throw new ApiError(409, "نوع القسم مرتبط بسجلات قائمة؛ أنشئ قسمًا جديدًا");
        fields.type = choice(r.body.type, departmentTypes, "نوع القسم");
      }
      if (!Object.keys(fields).length) throw new ApiError(400, "أدخل تعديلًا واحدًا على الأقل");
      return versioned(tx, "hospital_departments", row.id, r.body.version, fields);
    }));
  }));

  app.get("/api/hospital/overview", wrap(async (r, s) => {
    permit(r, "patients.read");
    const encounters = (await all(db, `SELECT a.*,p.name AS patient_name,p.mrn,p.barcode_no,d.name AS department_name,b.name AS bed_name,u.name AS doctor_name,n.name AS nurse_name FROM admissions a JOIN patients p ON p.id=a.patient_id JOIN hospital_departments d ON d.id=a.department_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN users u ON u.id=a.doctor_id LEFT JOIN users n ON n.id=a.nurse_id WHERE a.status='active'${scopeSql(r)} ORDER BY a.admitted_at DESC`)).map(row => clinicalProjection(r, row));
    const appointments = (await all(db, `${appointmentSelect} WHERE ap.status IN ('scheduled','arrived')${appointmentScope(r)} ORDER BY ap.scheduled_at LIMIT 500`)).map(row => clinicalProjection(r, row));
    const departments = await all(db, `SELECT d.*,(SELECT count(*)::int FROM beds b WHERE b.department_id=d.id) AS bed_count,(SELECT count(*)::int FROM beds b WHERE b.department_id=d.id AND b.status='available') AS available_beds,(SELECT count(*)::int FROM admissions a WHERE a.department_id=d.id AND a.status='active'${scopeSql(r)}) AS active_encounters FROM hospital_departments d ORDER BY d.name,d.id`);
    const counts = { active_encounters: encounters.length, appointments: appointments.length, emergency: encounters.filter(a => a.encounter_type === "emergency").length, outpatient: encounters.filter(a => a.encounter_type === "outpatient").length, inpatient: encounters.filter(a => ["inpatient", "icu", "nicu"].includes(a.encounter_type)).length, available_beds: departments.reduce((n, d) => n + d.available_beds, 0) };
    s.json({ departments, encounters, appointments, counts });
  }));

  app.get("/api/hospital/appointments", wrap(async (r, s) => {
    permit(r, "patients.read");
    const args: any[] = [];
    let where = " WHERE 1=1" + appointmentScope(r);
    for (const field of ["patient_id", "department_id", "doctor_id", "status"])
      if (r.query[field]) { args.push(String(r.query[field])); where += ` AND ap.${field}=$${args.length}`; }
    for (const [field, op] of [["from", ">="], ["to", "<="]])
      if (r.query[field]) { args.push(date(r.query[field], "تاريخ الموعد")); where += ` AND ap.scheduled_at${op}$${args.length}`; }
    s.json((await all(db, `${appointmentSelect}${where} ORDER BY ap.scheduled_at DESC LIMIT 1000`, args)).map(row => clinicalProjection(r, row)));
  }));
  app.post("/api/hospital/appointments", wrap(async (r, s) => {
    permit(r, "patients.write");
    requireKey(r);
    s.status(201).json(await mutate(db, r, "hospital_appointments", async tx => {
      const d = await activeDepartment(tx, r.body.department_id);
      if (d.type !== "outpatient") throw new ApiError(400, "المواعيد متاحة لأقسام العيادات الخارجية فقط");
      const doctor = await assignment(tx, r.body.doctor_id, ["doctor", "manager"], "الطبيب", true);
      const patient = await one(tx, "SELECT id FROM patients WHERE id=$1 FOR UPDATE", [required(r.body.patient_id, "المريض")]);
      if (!patient) throw new ApiError(404, "المريض غير موجود");
      const scheduled = date(r.body.scheduled_at, "موعد الزيارة");
      const duration = number(r.body.duration_minutes ?? 30, "مدة الموعد بالدقائق", 5, 240);
      if (!Number.isInteger(duration)) throw new ApiError(400, "مدة الموعد يجب أن تكون عددًا صحيحًا");
      const conflict = await one(tx, `SELECT id FROM hospital_appointments WHERE status IN ('scheduled','arrived') AND (doctor_id=$1 OR patient_id=$2) AND scheduled_at < $3::timestamptz + $4::integer * interval '1 minute' AND scheduled_at + duration_minutes * interval '1 minute' > $3::timestamptz LIMIT 1`, [doctor, patient.id, scheduled, duration]);
      if (conflict) throw new ApiError(409, "الموعد يتعارض مع موعد آخر للطبيب أو للمريض", "APPOINTMENT_CONFLICT");
      const row = await insert(tx, "hospital_appointments", { id: uid(), patient_id: patient.id, department_id: d.id, doctor_id: doctor, scheduled_at: scheduled, duration_minutes: duration, notes: r.body.notes || null, created_by: r.user.id });
      await audit(tx, r, "schedule", "hospital_appointments", row.id, { department_id: d.id }, patient.id);
      return clinicalProjection(r, row);
    }));
  }));
  app.post("/api/hospital/appointments/:id/transition", wrap(async (r, s) => {
    permit(r, "patients.write");
    requireKey(r);
    s.json(await mutate(db, r, "hospital_appointments", async tx => {
      const row = await scopedAppointment(tx, r, String(r.params.id));
      const status = choice(r.body.status, ["arrived", "cancelled", "completed"], "حالة الموعد");
      expectVersion(row, r.body.version);
      const transitions: Record<string, string[]> = { scheduled: ["arrived", "cancelled"], arrived: ["cancelled", "completed"], cancelled: [], completed: [] };
      if (!transitions[row.status].includes(status)) throw new ApiError(409, "انتقال حالة الموعد غير مسموح");
      const linked = row.admission_id ? await one(tx, "SELECT status FROM admissions WHERE id=$1 FOR UPDATE", [row.admission_id]) : null;
      if (status === "completed" && (!linked || linked.status !== "discharged")) throw new ApiError(409, "أكمل إجراءات خروج الزيارة المرتبطة قبل إغلاق الموعد");
      if (status === "cancelled" && linked?.status === "active") throw new ApiError(409, "الموعد مرتبط بزيارة نشطة؛ أكمل إجراءات الزيارة أولًا");
      const fields: Record<string, any> = { status, [`${status === "arrived" ? "arrived" : status === "completed" ? "completed" : "cancelled"}_at`]: new Date().toISOString() };
      if (status === "cancelled") fields.cancellation_reason = required(r.body.reason, "سبب الإلغاء");
      const updated = await versioned(tx, "hospital_appointments", row.id, r.body.version, fields);
      await audit(tx, r, status, "hospital_appointments", row.id, {}, row.patient_id);
      return clinicalProjection(r, updated);
    }));
  }));
  app.post("/api/hospital/appointments/:id/check-in", wrap(async (r, s) => {
    permit(r, "patients.write");
    requireKey(r);
    s.json(await mutate(db, r, "hospital_appointments", async tx => {
      const row = await scopedAppointment(tx, r, String(r.params.id));
      expectVersion(row, r.body.version);
      if (!["scheduled", "arrived"].includes(row.status)) throw new ApiError(409, "الموعد مغلق ولا يمكن تسجيل الحضور");
      const d = await activeDepartment(tx, row.department_id);
      if (d.type !== "outpatient") throw new ApiError(409, "الموعد لم يعد مرتبطًا بعيادة صالحة");
      await assignment(tx, row.doctor_id, ["doctor", "manager"], "الطبيب");
      await tx.query("SELECT id FROM patients WHERE id=$1 FOR UPDATE", [row.patient_id]);
      let encounter = await one(tx, "SELECT * FROM admissions WHERE patient_id=$1 AND status='active' FOR UPDATE", [row.patient_id]);
      if (row.admission_id && (!encounter || row.admission_id !== encounter.id)) throw new ApiError(409, "الزيارة المرتبطة بالموعد أغلقت بالفعل");
      if (encounter && (encounter.encounter_type !== "outpatient" || encounter.department_id !== d.id || encounter.doctor_id !== row.doctor_id)) throw new ApiError(409, "للمريض زيارة نشطة أخرى؛ استخدم نقل الزيارة بين الأقسام");
      if (!encounter) encounter = await insert(tx, "admissions", { id: uid(), admission_no: `VIS-${new Date().getFullYear()}-${uid().slice(0, 8).toUpperCase()}`, patient_id: row.patient_id, department_id: d.id, encounter_type: "outpatient", source: "appointment", reason: "زيارة عيادة خارجية", doctor_id: row.doctor_id, care_level: "outpatient" });
      const updated = await versioned(tx, "hospital_appointments", row.id, r.body.version, { status: "arrived", admission_id: encounter.id, arrived_at: row.arrived_at || new Date().toISOString() });
      await audit(tx, r, "check_in", "hospital_appointments", row.id, { admission_id: encounter.id }, row.patient_id);
      return { ...clinicalProjection(r, updated), encounter: clinicalProjection(r, encounter) };
    }));
  }));

  app.post("/api/hospital/encounters/:id/transfer", wrap(async (r, s) => {
    permit(r, "beds.write");
    requireKey(r);
    s.json(await mutate(db, r, "admissions", async tx => {
      const department = await activeDepartment(tx, r.body.department_id);
      // Check-in also locks the department before the encounter. Staff lookup is
      // read-only here because other care workflows lock the encounter first.
      const assignedDoctor = r.body.doctor_id === undefined ? undefined : await assignment(tx, r.body.doctor_id, ["doctor", "manager"], "الطبيب");
      const assignedNurse = r.body.nurse_id === undefined ? undefined : r.body.nurse_id ? await assignment(tx, r.body.nurse_id, ["nurse", "head_nurse"], "الممرض") : null;
      await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [r.params.id]);
      const a = await admission(tx, r, String(r.params.id));
      expectVersion(a, r.body.version);
      const type = choice(r.body.encounter_type, encounterTypes, "نوع الزيارة");
      if ((department.type === "surgery" ? "inpatient" : department.type) !== type) throw new ApiError(400, "نوع الزيارة لا يطابق القسم المختار");
      const reason = required(r.body.reason, "سبب النقل");
      const bedId = r.body.bed_id === undefined && a.department_id === department.id ? a.bed_id : r.body.bed_id || null;
      if (type === "outpatient" && bedId) throw new ApiError(400, "زيارة العيادة لا تحتاج إلى حجز سرير");
      let bed: any = null;
      if (bedId) {
        bed = await one(tx, "SELECT * FROM beds WHERE id=$1 FOR UPDATE", [bedId]);
        if (!bed || bed.department_id !== department.id) throw new ApiError(400, "السرير لا يتبع القسم المختار");
        if (bed.id !== a.bed_id) {
          if (!["available", "reserved"].includes(bed.status) || await one(tx, "SELECT id FROM admissions WHERE bed_id=$1 AND status='active' AND id<>$2", [bed.id, a.id])) throw new ApiError(409, "السرير غير متاح الآن", "BED_CONFLICT");
          await tx.query("UPDATE beds SET status='occupied',version=version+1 WHERE id=$1", [bed.id]);
        }
      }
      const doctor = assignedDoctor === undefined ? a.doctor_id : assignedDoctor;
      const nurse = assignedNurse === undefined ? a.nurse_id : assignedNurse;
      if (a.department_id === department.id && a.encounter_type === type && a.bed_id === bedId && doctor === a.doctor_id && nurse === a.nurse_id) throw new ApiError(409, "الزيارة موجودة بالفعل بنفس القسم والتكليف");
      if (a.bed_id && a.bed_id !== bedId) await tx.query("UPDATE beds SET status='cleaning',version=version+1 WHERE id=$1", [a.bed_id]);
      const updated = await versioned(tx, "admissions", a.id, r.body.version, { department_id: department.id, encounter_type: type, bed_id: bedId, doctor_id: doctor, nurse_id: nurse, care_level: bed?.care_level || type });
      if (nurse !== a.nurse_id) await tx.query("UPDATE tasks SET assignee_id=$1,version=version+1 WHERE admission_id=$2 AND status IN ('pending','deferred') AND assignee_id IS NOT DISTINCT FROM $3", [nurse, a.id, a.nurse_id]);
      if (a.bed_id !== bedId) await insert(tx, "bed_movements", { id: uid(), admission_id: a.id, from_bed_id: a.bed_id, to_bed_id: bedId, reason, care_level: updated.care_level, actor_id: r.user.id });
      await insert(tx, "hospital_department_movements", { id: uid(), admission_id: a.id, from_department_id: a.department_id, to_department_id: department.id, from_encounter_type: a.encounter_type, to_encounter_type: type, from_bed_id: a.bed_id, to_bed_id: bedId, reason, actor_id: r.user.id });
      await audit(tx, r, "department_transfer", "admissions", a.id, { from_department_id: a.department_id, to_department_id: department.id, reason }, a.patient_id);
      return clinicalProjection(r, updated);
    }));
  }));
  app.post("/api/hospital/encounters/:id/triage", wrap(async (r, s) => {
    if (!r.user.permissions.includes("nursing.write")) permit(r, "clinical.write");
    requireKey(r);
    s.json(await mutate(db, r, "admissions", async tx => {
      await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [r.params.id]);
      const a = await admission(tx, r, String(r.params.id));
      if (a.encounter_type !== "emergency") throw new ApiError(409, "الفرز متاح لزيارات الطوارئ فقط");
      const triage = choice(r.body.triage_level, triageLevels, "درجة الفرز");
      const updated = await versioned(tx, "admissions", a.id, r.body.version, { triage_level: triage });
      await insert(tx, "hospital_triage_events", { id: uid(), admission_id: a.id, triage_level: triage, notes: r.body.notes || null, actor_id: r.user.id });
      await audit(tx, r, "triage", "admissions", a.id, { triage_level: triage }, a.patient_id);
      return clinicalProjection(r, updated);
    }));
  }));
  app.get("/api/hospital/patients/:id/timeline", wrap(async (r, s) => {
    permit(r, "patients.read");
    const patient = await one(db, "SELECT id FROM patients WHERE id=$1", [r.params.id]);
    if (!patient) throw new ApiError(404, "المريض غير موجود");
    const admissions = await all(db, `SELECT a.id,a.admission_no,a.patient_id,a.department_id,d.name AS department_name,a.encounter_type,a.status,a.admitted_at,a.discharged_at FROM admissions a JOIN hospital_departments d ON d.id=a.department_id WHERE a.patient_id=$1${scopeSql(r)} ORDER BY a.admitted_at`, [patient.id]);
    const appointments = await all(db, `${appointmentSelect} WHERE ap.patient_id=$1${appointmentScope(r)} ORDER BY ap.scheduled_at`, [patient.id]);
    if (["doctor", "nurse"].includes(r.user.role) && !admissions.length && !appointments.length) throw new ApiError(404, "المريض خارج نطاق التكليف");
    const movements = await all(db, `SELECT m.*,d.name AS from_department_name,t.name AS to_department_name FROM hospital_department_movements m JOIN admissions a ON a.id=m.admission_id JOIN hospital_departments d ON d.id=m.from_department_id JOIN hospital_departments t ON t.id=m.to_department_id WHERE a.patient_id=$1${scopeSql(r)} ORDER BY m.created_at`, [patient.id]);
    const events = [
      ...admissions.flatMap(a => {
        const firstMove = movements.find(m => m.admission_id === a.id);
        return [{ ...a, department_id: firstMove?.from_department_id || a.department_id, department_name: firstMove?.from_department_name || a.department_name, encounter_type: firstMove?.from_encounter_type || a.encounter_type, kind: "admission", at: a.admitted_at }, ...(a.discharged_at ? [{ ...a, kind: "discharge", at: a.discharged_at }] : [])];
      }),
      ...appointments.map(a => ({ ...clinicalProjection(r, a), kind: "appointment", at: a.scheduled_at })),
      ...movements.map(m => ({ ...clinicalProjection(r, m), kind: "department_transfer", at: m.created_at })),
    ];
    if (r.user.permissions.includes("clinical.read")) events.push(...(await all(db, `SELECT t.* FROM hospital_triage_events t JOIN admissions a ON a.id=t.admission_id WHERE a.patient_id=$1${scopeSql(r)} ORDER BY t.created_at`, [patient.id])).map(row => ({ ...row, kind: "triage", at: row.created_at })));
    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    await audit(db, r, "read", "hospital_timeline", patient.id, {}, patient.id);
    s.json({ patient_id: patient.id, events });
  }));
}
