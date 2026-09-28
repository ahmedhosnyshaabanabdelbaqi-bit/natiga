import { all, one } from "./db.js";
import { insert } from "./seed.js";
import { ApiError, required, choice, number, date } from "./security.js";
import {
  wrap,
  permit,
  mutate,
  admission,
  audit,
  uid,
  versioned,
  requireKey,
  scopeSql,
  matchesPatientIdentity,
  type RouteContext,
} from "./context.js";
export function clinicalRoutes({ app, db }: RouteContext) {
  app.patch(
    "/api/orders/:id",
    wrap(async (r, s) => {
      permit(r, "clinical.write");
      s.json(
        await mutate(db, r, "orders", async (tx) => {
          const previous = await one(
            tx,
            "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!previous) throw new ApiError(404, "الأمر غير موجود");
          const a = await admission(tx, r, previous.admission_id);
          if (["stopped", "cancelled"].includes(previous.status))
            throw new ApiError(
              409,
              "الأمر منتهٍ؛ أنشئ أمرًا جديدًا مرتبطًا بالإقامة",
            );
          const reason = required(r.body.reason, "سبب تعديل الأمر");
          const fields: Record<string, any> = {
            status: "draft",
            approved_by: null,
            approved_at: null,
            reason,
          };
          for (const field of [
            "name",
            "unit",
            "route",
            "frequency",
            "instructions",
          ])
            if (r.body[field] !== undefined)
              fields[field] = required(
                r.body[field],
                field === "name" ? "اسم الأمر" : "تفاصيل الأمر",
              );
          if (r.body.dose !== undefined)
            fields.dose = number(r.body.dose, "الجرعة", 0.0001);
          if (r.body.reference_weight !== undefined)
            fields.reference_weight = number(
              r.body.reference_weight,
              "الوزن المرجعي",
              100,
              a.encounter_type === "nicu" ? 10000 : 500000,
            );
          if (r.body.scheduled_at !== undefined)
            fields.scheduled_at = date(r.body.scheduled_at, "موعد التنفيذ");
          if (Object.keys(fields).length === 4)
            throw new ApiError(400, "أدخل تعديلًا واحدًا على الأقل");
          await insert(tx, "order_versions", {
            id: uid(),
            order_id: previous.id,
            data: JSON.stringify(previous),
            actor_id: r.user.id,
          });
          const updated = await versioned(
            tx,
            "orders",
            previous.id,
            r.body.version,
            fields,
          );
          await tx.query(
            "UPDATE tasks SET status='cancelled',reason='تعديل الأمر؛ ينتظر إعادة الاعتماد',version=version+1 WHERE order_id=$1 AND status IN ('pending','deferred')",
            [previous.id],
          );
          await audit(
            tx,
            r,
            "amend",
            "orders",
            previous.id,
            { reason, previous_version: previous.version },
            a.patient_id,
          );
          return updated;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/orders",
    wrap(async (r, s) => {
      permit(r, "clinical.write");
      s.status(201).json(
        await mutate(db, r, "orders", async (tx) => {
          const a = await admission(tx, r, String(r.params.id)),
            b = r.body;
          if (b.status && b.status !== "draft")
            throw new ApiError(400, "الأوامر الجديدة تحفظ كمسودة أولًا");
          const result = await insert(tx, "orders", {
            id: uid(),
            admission_id: a.id,
            type: choice(
              b.type,
              ["medication", "feeding", "procedure"],
              "نوع الأمر",
            ),
            name: required(b.name, "اسم الأمر"),
            dose:
              b.dose !== undefined && b.dose !== ""
                ? number(b.dose, "الجرعة", 0.0001)
                : null,
            unit: b.unit || null,
            route: b.route || null,
            frequency: b.frequency || null,
            instructions: b.instructions || null,
            reference_weight: b.reference_weight
              ? number(b.reference_weight, "الوزن المرجعي", 100, a.encounter_type === "nicu" ? 10000 : 500000)
              : null,
            scheduled_at: b.scheduled_at
              ? date(b.scheduled_at, "موعد التنفيذ")
              : null,
            status: "draft",
            created_by: r.user.id,
          });
          await audit(
            tx,
            r,
            "create",
            "orders",
            result.id,
            { name: result.name },
            a.patient_id,
          );
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/orders/:id/transition",
    wrap(async (r, s) => {
      permit(r, "clinical.approve");
      s.json(
        await mutate(db, r, "orders", async (tx) => {
          const o = await one(
            tx,
            "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!o) throw new ApiError(404, "الأمر غير موجود");
          const a = await admission(tx, r, o.admission_id);
          const status = choice(
            r.body.status,
            ["approved", "suspended", "stopped", "cancelled"],
            "حالة الأمر",
          );
          const transitions: Record<string, string[]> = {
            draft: ["approved", "cancelled"],
            approved: ["suspended", "stopped", "cancelled"],
            suspended: ["approved", "stopped", "cancelled"],
            stopped: [],
            cancelled: [],
          };
          if (!transitions[o.status]?.includes(status))
            throw new ApiError(409, "انتقال حالة الأمر غير مسموح");
          if (status !== "approved") required(r.body.reason, "سبب تغيير الأمر");
          if (
            status === "approved" &&
            o.type === "medication" &&
            (!o.dose || !o.unit || !o.route || !o.frequency)
          )
            throw new ApiError(
              400,
              "يلزم توثيق الجرعة ووحدتها وطريقة الإعطاء والتكرار قبل الاعتماد",
            );
          await insert(tx, "order_versions", {
            id: uid(),
            order_id: o.id,
            data: JSON.stringify(o),
            actor_id: r.user.id,
          });
          const updated = await versioned(tx, "orders", o.id, r.body.version, {
            status,
            approved_by: status === "approved" ? r.user.id : o.approved_by,
            approved_at:
              status === "approved" ? new Date().toISOString() : o.approved_at,
            reason: r.body.reason || null,
          });
          if (status === "approved" && o.scheduled_at) {
            const existing = await one(
              tx,
              "SELECT id FROM tasks WHERE order_id=$1 AND status IN ('pending','deferred')",
              [o.id],
            );
            const administered = await one(
              tx,
              "SELECT id FROM administrations WHERE order_id=$1 AND scheduled_at=$2",
              [o.id, o.scheduled_at],
            );
            if (!existing && !administered)
              await insert(tx, "tasks", {
                id: uid(),
                admission_id: a.id,
                order_id: o.id,
                title: o.name,
                due_at: o.scheduled_at,
                assignee_id: a.nurse_id,
              });
          } else if (status !== "approved")
            await tx.query(
              "UPDATE tasks SET status='cancelled',reason=$1,version=version+1 WHERE order_id=$2 AND status IN ('pending','deferred')",
              [r.body.reason, o.id],
            );
          await audit(
            tx,
            r,
            status,
            "orders",
            o.id,
            { before: o.status, reason: r.body.reason },
            a.patient_id,
          );
          return updated;
        }),
      );
    }),
  );
  app.post(
    "/api/orders/:id/administer",
    wrap(async (r, s) => {
      permit(r, "nursing.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "administrations", async (tx) => {
          const o = await one(
            tx,
            "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!o) throw new ApiError(404, "الأمر غير موجود");
          const a = await admission(tx, r, o.admission_id);
          if (o.status !== "approved")
            throw new ApiError(409, "لا يمكن تنفيذ أمر غير معتمد أو موقوف");
          if (!matchesPatientIdentity(a, r.body.patient_mrn))
            throw new ApiError(
              409,
              "هوية الطفل غير مطابقة للأمر. تحقق من سوار الطفل",
              "IDENTITY_MISMATCH",
            );
          const scheduled = date(r.body.scheduled_at, "موعد الجرعة"),
            actual = date(r.body.actual_at, "التنفيذ");
          if (new Date(actual).getTime() > Date.now() + 60000)
            throw new ApiError(400, "لا يمكن تسجيل تنفيذ في المستقبل");
          const quantity = number(r.body.quantity, "الكمية المنفذة", 0);
          if (quantity === 0) required(r.body.reason, "سبب عدم التنفيذ");
          const unit = required(r.body.unit, "وحدة الكمية");
          if (o.unit && unit !== o.unit)
            throw new ApiError(400, "وحدة التنفيذ يجب أن تطابق وحدة الأمر");
          if (
            await one(
              tx,
              "SELECT id FROM administrations WHERE order_id=$1 AND scheduled_at=$2",
              [o.id, scheduled],
            )
          )
            throw new ApiError(
              409,
              "تم توثيق هذا الموعد بالفعل",
              "DUPLICATE_DOSE",
            );
          const result = await insert(tx, "administrations", {
            id: uid(),
            order_id: o.id,
            scheduled_at: scheduled,
            actual_at: actual,
            quantity,
            unit,
            reason: r.body.reason || null,
            actor_id: r.user.id,
          });
          await tx.query(
            "UPDATE tasks SET status='completed',version=version+1 WHERE order_id=$1 AND due_at=$2 AND status IN ('pending','deferred')",
            [o.id, scheduled],
          );
          await audit(
            tx,
            r,
            "administer",
            "orders",
            o.id,
            { administration_id: result.id, actual_at: actual, quantity },
            a.patient_id,
          );
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/vitals",
    wrap(async (r, s) => {
      permit(r, "nursing.write");
      s.status(201).json(
        await mutate(db, r, "vitals", async (tx) => {
          await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [r.params.id]);
          const a = await admission(tx, r, String(r.params.id));
          const measured = date(r.body.measured_at, "القياس");
          if (new Date(measured).getTime() > Date.now() + 60000)
            throw new ApiError(400, "وقت القياس لا يمكن أن يكون في المستقبل");
          const fields: Record<string, any> = {};
          const limits: Record<string, [number, number]> = {
            temperature: [20, 50],
            heart_rate: [0, 350],
            respiratory_rate: [0, 200],
            spo2: [0, 100],
            weight: [100, a.encounter_type === "nicu" ? 15000 : 500000],
            systolic: [0, 350],
            diastolic: [0, 250],
            height_cm: [10, 300],
            pain_score: [0, 10],
            glucose: [0, 1500],
            intake: [0, 10000],
            output: [0, 10000],
            bilirubin_total: [0, 50],
            bilirubin_direct: [0, 30],
          };
          for (const [key, [min, max]] of Object.entries(limits))
            if (r.body[key] !== undefined && r.body[key] !== "")
              fields[key] = number(r.body[key], key, min, max);
          if (!Object.keys(fields).length)
            throw new ApiError(400, "أدخل قراءة واحدة على الأقل");
          if (fields.systolic !== undefined && fields.diastolic !== undefined && fields.diastolic > fields.systolic)
            throw new ApiError(400, "الضغط الانبساطي لا يمكن أن يتجاوز الضغط الانقباضي");
          if (fields.bilirubin_total !== undefined && fields.bilirubin_direct !== undefined && fields.bilirubin_direct > fields.bilirubin_total)
            throw new ApiError(400, "قراءة الصفراء المباشرة لا يمكن أن تتجاوز الصفراء الكلية");
          const bilirubinMethod = fields.bilirubin_total !== undefined || fields.bilirubin_direct !== undefined
            ? choice(r.body.bilirubin_method || "transcutaneous", ["transcutaneous", "serum", "other"], "طريقة قياس الصفراء")
            : null;
          const result = await insert(tx, "vitals", {
            id: uid(),
            admission_id: a.id,
            measured_at: measured,
            ...fields,
            bilirubin_method: bilirubinMethod,
            notes: r.body.notes || null,
            actor_id: r.user.id,
          });
          await audit(
            tx,
            r,
            "record",
            "vitals",
            result.id,
            { measured_at: measured },
            a.patient_id,
          );
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/notes",
    wrap(async (r, s) => {
      permit(r, "clinical.write");
      const status = choice(
        r.body.status || "draft",
        ["draft", "approved"],
        "حالة الملاحظة",
      );
      if (status === "approved") permit(r, "clinical.approve");
      s.status(201).json(
        await mutate(db, r, "notes", async (tx) => {
          const a = await admission(tx, r, String(r.params.id));
          const result = await insert(tx, "notes", {
            id: uid(),
            admission_id: a.id,
            text: required(r.body.text, "الملاحظة"),
            kind: r.body.kind || "round",
            status,
            actor_id: r.user.id,
          });
          await audit(tx, r, status, "notes", result.id, {}, a.patient_id);
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/labs",
    wrap(async (r, s) => {
      permit(r, "clinical.write");
      s.status(201).json(
        await mutate(db, r, "labs", async (tx) => {
          const a = await admission(tx, r, String(r.params.id));
          return insert(tx, "labs", {
            id: uid(),
            admission_id: a.id,
            name: required(r.body.name, "اسم التحليل"),
            priority: choice(
              r.body.priority || "routine",
              ["routine", "urgent", "critical"],
              "الأولوية",
            ),
            created_by: r.user.id,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/labs/:id/transition",
    wrap(async (r, s) => {
      const status = choice(
        r.body.status,
        ["collected", "received", "rejected", "resulted", "reviewed"],
        "حالة التحليل",
      );
      permit(r, status === "reviewed" ? "clinical.approve" : "lab.write");
      s.json(
        await mutate(db, r, "labs", async (tx) => {
          const lab = await one(
            tx,
            "SELECT * FROM labs WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!lab) throw new ApiError(404, "التحليل غير موجود");
          const a = await admission(tx, r, lab.admission_id, false);
          const transitions: Record<string, string[]> = {
            ordered: ["collected", "rejected"],
            collected: ["received", "rejected"],
            received: ["resulted", "rejected"],
            rejected: ["collected"],
            resulted: ["reviewed", "resulted"],
            reviewed: ["resulted"],
          };
          if (!transitions[lab.status]?.includes(status))
            throw new ApiError(409, "انتقال حالة التحليل غير مسموح");
          if (
            status === "rejected" ||
            (status === "resulted" &&
              ["resulted", "reviewed"].includes(lab.status))
          )
            required(r.body.reason, "سبب الرفض أو التصحيح");
          const fields: Record<string, any> = {
            status,
            reason: r.body.reason || null,
          };
          if (status === "resulted") {
            fields.result = required(r.body.result, "نتيجة التحليل");
            fields.unit = r.body.unit || null;
            fields.reference_range = r.body.reference_range || null;
            fields.critical = Boolean(r.body.critical);
            fields.reviewed_by = null;
            fields.reviewed_at = null;
          }
          if (status === "reviewed") {
            fields.reviewed_by = r.user.id;
            fields.reviewed_at = new Date().toISOString();
          }
          await insert(tx, "lab_versions", {
            id: uid(),
            lab_id: lab.id,
            data: JSON.stringify(lab),
            actor_id: r.user.id,
          });
          const result = await versioned(
            tx,
            "labs",
            lab.id,
            r.body.version,
            fields,
          );
          if (status === "resulted" && result.critical)
            await insert(tx, "records", {
              id: uid(),
              kind: "alerts",
              title: `نتيجة مصنفة حرجة: ${lab.name}`,
              status: "open",
              admission_id: a.id,
              data: JSON.stringify({
                lab_id: lab.id,
                owner: a.doctor_id,
                priority: "critical",
                source: "تصنيف المعمل",
                due_at: new Date().toISOString(),
              }),
              actor_id: r.user.id,
            });
          if (status === "reviewed")
            await tx.query(
              "UPDATE records SET status='closed',version=version+1,updated_at=now() WHERE kind='alerts' AND data->>'lab_id'=$1",
              [lab.id],
            );
          await audit(
            tx,
            r,
            status,
            "labs",
            lab.id,
            { critical: result.critical, reason: r.body.reason },
            a.patient_id,
          );
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/milk",
    wrap(async (r, s) => {
      permit(r, "nursing.write");
      s.status(201).json(
        await mutate(db, r, "milk", async (tx) => {
          const a = await admission(tx, r, String(r.params.id));
          const quantity = number(r.body.quantity, "الكمية بالمل", 0.1, 10000),
            received = date(r.body.received_at, "الاستلام"),
            expires = date(r.body.expires_at, "الصلاحية");
          if (new Date(expires) <= new Date(received))
            throw new ApiError(400, "انتهاء الصلاحية يجب أن يكون بعد الاستلام");
          return insert(tx, "milk", {
            id: uid(),
            admission_id: a.id,
            quantity,
            remaining: quantity,
            received_at: received,
            expires_at: expires,
            location: required(r.body.location, "مكان التخزين"),
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/feedings",
    wrap(async (r, s) => {
      permit(r, "nursing.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "feedings", async (tx) => {
          const a = await admission(tx, r, String(r.params.id));
          if (!matchesPatientIdentity(a, r.body.patient_mrn))
            throw new ApiError(
              409,
              "هوية الطفل لا تطابق ملف التغذية",
              "IDENTITY_MISMATCH",
            );
          const quantity = number(
              r.body.quantity,
              "كمية التغذية بالمل",
              0.1,
              10000,
            ),
            actual = date(r.body.actual_at, "الإعطاء");
          if (new Date(actual).getTime() > Date.now() + 60000)
            throw new ApiError(400, "لا يمكن تسجيل إعطاء في المستقبل");
          if (r.body.milk_id) {
            const milk = await one(
              tx,
              "SELECT * FROM milk WHERE id=$1 FOR UPDATE",
              [r.body.milk_id],
            );
            if (!milk || milk.admission_id !== a.id)
              throw new ApiError(409, "عبوة اللبن تخص طفلًا آخر أو غير موجودة");
            if (new Date(milk.expires_at) <= new Date(actual))
              throw new ApiError(409, "عبوة اللبن منتهية الصلاحية");
            if (new Date(milk.received_at) > new Date(actual))
              throw new ApiError(409, "وقت الإعطاء يسبق الاستلام");
            if (Number(milk.remaining) < quantity)
              throw new ApiError(409, "الكمية المتبقية في العبوة غير كافية");
            await tx.query(
              "UPDATE milk SET remaining=remaining-$1 WHERE id=$2",
              [quantity, milk.id],
            );
          }
          return insert(tx, "feedings", {
            id: uid(),
            admission_id: a.id,
            type: required(r.body.type, "نوع التغذية"),
            route: required(r.body.route, "طريقة التغذية"),
            quantity,
            actual_at: actual,
            milk_id: r.body.milk_id || null,
            notes: r.body.notes || null,
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.get(
    "/api/tasks",
    wrap(async (r, s) => {
      permit(r, "patients.read");
      if (
        !r.user.permissions.includes("clinical.read") &&
        !r.user.permissions.includes("operations.write")
      )
        throw new ApiError(403, "لا تملك صلاحية الاطلاع على المهام");
      s.json(
        await all(
          db,
          `SELECT t.*,a.patient_id,p.name AS patient_name,p.mrn,b.name AS bed_name,u.name AS assignee_name FROM tasks t LEFT JOIN admissions a ON a.id=t.admission_id LEFT JOIN patients p ON p.id=a.patient_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN users u ON u.id=t.assignee_id WHERE 1=1${scopeSql(r)}${r.user.permissions.includes("clinical.read") ? "" : " AND t.admission_id IS NULL AND t.order_id IS NULL"} ORDER BY t.due_at`,
        ),
      );
    }),
  );
  app.post(
    "/api/tasks",
    wrap(async (r, s) => {
      if (
        !r.user.permissions.includes("nursing.write") &&
        !r.user.permissions.includes("clinical.write")
      )
        permit(r, "operations.write");
      s.status(201).json(
        await mutate(db, r, "tasks", async (tx) => {
          if (r.body.admission_id) {
            permit(r, "clinical.read");
            await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [r.body.admission_id]);
            await admission(tx, r, r.body.admission_id);
          }
          return insert(tx, "tasks", {
            id: uid(),
            admission_id: r.body.admission_id || null,
            title: required(r.body.title, "عنوان المهمة"),
            due_at: date(r.body.due_at, "استحقاق المهمة"),
            assignee_id: r.body.assignee_id || r.user.id,
          });
        }),
      );
    }),
  );
  app.patch(
    "/api/tasks/:id",
    wrap(async (r, s) => {
      if (
        !r.user.permissions.includes("nursing.write") &&
        !r.user.permissions.includes("clinical.write")
      )
        permit(r, "operations.write");
      s.json(
        await mutate(db, r, "tasks", async (tx) => {
          const t = await one(tx, "SELECT * FROM tasks WHERE id=$1", [
            r.params.id,
          ]);
          if (!t) throw new ApiError(404, "المهمة غير موجودة");
          if (t.admission_id) {
            permit(r, "clinical.read");
            if (!r.user.permissions.includes("nursing.write"))
              permit(r, "clinical.write");
            await admission(tx, r, t.admission_id);
          }
          if (
            ["doctor", "nurse"].includes(r.user.role) &&
            t.assignee_id &&
            t.assignee_id !== r.user.id
          )
            throw new ApiError(403, "هذه المهمة مكلف بها مستخدم آخر");
          if (["completed", "cancelled"].includes(t.status))
            throw new ApiError(409, "المهمة مغلقة بالفعل");
          const status = choice(
            r.body.status,
            ["completed", "deferred", "cancelled"],
            "حالة المهمة",
          );
          if (status === "completed" && t.order_id)
            throw new ApiError(
              409,
              "يلزم توثيق تنفيذ الأمر والتحقق من هوية الطفل من صفحة الأوامر لإتمام هذه المهمة",
              "ORDER_ADMINISTRATION_REQUIRED",
            );
          if (status !== "completed")
            required(r.body.reason, "سبب التأجيل أو الإلغاء");
          return versioned(tx, "tasks", t.id, r.body.version, {
            status,
            reason: r.body.reason || null,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/handovers",
    wrap(async (r, s) => {
      if (!r.user.permissions.includes("clinical.write"))
        permit(r, "nursing.write");
      s.status(201).json(
        await mutate(db, r, "handovers", async (tx) => {
          const a = await admission(tx, r, String(r.params.id));
          const receiver = required(r.body.receiver_id, "مستلم النوبة");
          const u = await one(
            tx,
            "SELECT id FROM users WHERE id=$1 AND active=true AND role IN ('nurse','head_nurse','manager')",
            [receiver],
          );
          if (!u) throw new ApiError(400, "مستلم النوبة غير صالح");
          return insert(tx, "handovers", {
            id: uid(),
            admission_id: a.id,
            summary: required(r.body.summary, "ملخص تسليم النوبة"),
            pending: r.body.pending || null,
            receiver_id: receiver,
            sender_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/handovers/:id/acknowledge",
    wrap(async (r, s) => {
      permit(r, "nursing.write");
      s.json(
        await mutate(db, r, "handovers", async (tx) => {
          const h = await one(
            tx,
            "SELECT * FROM handovers WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!h) throw new ApiError(404, "سجل التسليم غير موجود");
          if (h.receiver_id !== r.user.id)
            throw new ApiError(403, "تأكيد الاستلام متاح للمستلم المحدد فقط");
          if (h.acknowledged_at)
            throw new ApiError(409, "تم تأكيد الاستلام مسبقًا");
          await admission(tx, r, h.admission_id);
          return one(
            tx,
            "UPDATE handovers SET acknowledged_at=now() WHERE id=$1 RETURNING *",
            [h.id],
          );
        }),
      );
    }),
  );
}
