import { all, one } from "./db.js";
import { insert } from "./seed.js";
import {
  ApiError,
  required,
  number,
  hashPassword,
  permissionList,
  defaultRoles,
} from "./security.js";
import {
  wrap,
  permit,
  mutate,
  admission,
  audit,
  uid,
  versioned,
  scopeSql,
  patientSelect,
  billingFor,
  type Req,
  type RouteContext,
} from "./context.js";
const kindRoles: Record<string, string[]> = {
  admission_requests: ["manager", "reception", "head_nurse"],
  devices: ["manager", "maintenance", "head_nurse"],
  maintenance: ["manager", "maintenance", "head_nurse"],
  incidents: ["manager", "quality", "head_nurse"],
  shifts: ["manager", "head_nurse"],
  claims: ["manager", "insurance", "accountant"],
  contracts: ["manager", "insurance", "accountant"],
  doctor_dues: ["manager", "accountant"],
  followups: ["manager", "doctor", "head_nurse", "nurse"],
  alerts: ["manager", "doctor", "head_nurse", "nurse", "stock", "quality"],
  cleaning: ["manager", "head_nurse", "maintenance"],
  integrations: ["admin"],
  templates: ["manager", "admin", "quality"],
};
function kindAccess(r: Req, kind: string) {
  if (!kindRoles[kind]) throw new ApiError(404, "نوع السجل غير معروف");
  if (!kindRoles[kind].includes(r.user.role))
    throw new ApiError(403, "ليس لديك صلاحية لهذا السجل");
  const read = r.method === "GET";
  const permission =
    kind === "integrations"
      ? "settings.write"
      : kind === "doctor_dues"
        ? read
          ? "billing.read"
          : "billing.write"
        : ["claims", "contracts"].includes(kind)
          ? read
            ? "billing.read"
            : r.user.role === "insurance"
              ? "operations.write"
              : "billing.write"
          : kind === "followups"
            ? read
              ? "clinical.read"
              : r.user.permissions.includes("nursing.write")
                ? "nursing.write"
                : "clinical.write"
            : kind === "alerts" && r.user.role === "stock"
              ? read
                ? "stock.read"
                : "stock.write"
              : kind === "alerts" && ["doctor", "nurse"].includes(r.user.role)
                ? read
                  ? "clinical.read"
                  : r.user.role === "doctor"
                    ? "clinical.write"
                    : "nursing.write"
                : "operations.write";
  permit(r, permission);
}
export function registerRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/records/:kind",
    wrap(async (r, s) => {
      const kind = String(r.params.kind);
      kindAccess(r, kind);
      const rows = await all(
        db,
        `SELECT rec.*,u.name AS actor_name FROM records rec LEFT JOIN users u ON u.id=rec.actor_id LEFT JOIN admissions a ON a.id=rec.admission_id WHERE rec.kind=$1${kind === "alerts" && !r.user.permissions.includes("clinical.read") ? " AND rec.admission_id IS NULL AND NOT (rec.data ? 'lab_id')" : ""}${["doctor", "nurse"].includes(r.user.role) ? ` AND (rec.admission_id IS NULL OR (a.doctor_id=$2 OR a.nurse_id=$2))` : ""} ORDER BY rec.updated_at DESC`,
        [
          kind,
          ...(["doctor", "nurse"].includes(r.user.role) ? [r.user.id] : []),
        ],
      );
      await audit(db, r, "read", "records", kind);
      s.json(rows);
    }),
  );
  app.post(
    "/api/records/:kind",
    wrap(async (r, s) => {
      const kind = String(r.params.kind);
      kindAccess(r, kind);
      s.status(201).json(
        await mutate(db, r, "records", async (tx) => {
          if (kind === "alerts" && (r.body.admission_id || r.body.data?.lab_id))
            permit(r, "clinical.read");
          if (r.body.admission_id)
            await admission(tx, r, r.body.admission_id, false);
          return insert(tx, "records", {
            id: uid(),
            kind,
            title: required(r.body.title, "عنوان السجل"),
            status: required(r.body.status, "الحالة"),
            admission_id: r.body.admission_id || null,
            data: JSON.stringify(validData(r.body.data)),
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.patch(
    "/api/records/:kind/:id",
    wrap(async (r, s) => {
      const kind = String(r.params.kind);
      kindAccess(r, kind);
      s.json(
        await mutate(db, r, "records", async (tx) => {
          const rec = await one(
            tx,
            "SELECT * FROM records WHERE id=$1 AND kind=$2",
            [r.params.id, kind],
          );
          if (!rec) throw new ApiError(404, "السجل غير موجود");
          if (
            kind === "alerts" &&
            (rec.admission_id || rec.data?.lab_id || r.body.data?.lab_id)
          )
            permit(r, "clinical.read");
          if (rec.admission_id) await admission(tx, r, rec.admission_id, false);
          const fields: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          if (r.body.title !== undefined)
            fields.title = required(r.body.title, "عنوان السجل");
          if (r.body.status !== undefined)
            fields.status = required(r.body.status, "الحالة");
          if (r.body.data !== undefined)
            fields.data = JSON.stringify(validData(r.body.data));
          return versioned(tx, "records", rec.id, r.body.version, fields);
        }),
      );
    }),
  );
  app.get(
    "/api/settings",
    wrap(async (r, s) => {
      s.json(
        (await one(db, "SELECT data FROM settings WHERE id='hospital'")).data,
      );
    }),
  );
  app.patch(
    "/api/settings",
    wrap(async (r, s) => {
      permit(r, "settings.write");
      s.json(
        await mutate(db, r, "settings", async (tx) => {
          const current = (
            await one(tx, "SELECT data FROM settings WHERE id='hospital'")
          ).data;
          const b = r.body;
          if (
            b.logo !== undefined &&
            b.logo !== "" &&
            (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
              b.logo,
            ) ||
              b.logo.length > 2e6)
          )
            throw new ApiError(
              400,
              "الشعار يجب أن يكون صورة PNG أو JPEG أو WebP صغيرة",
            );
          for (const field of ["name", "address", "phone", "logo"])
            if (b[field] !== undefined)
              current[field] =
                field === "name"
                  ? required(b[field], "اسم المستشفى")
                  : String(b[field]);
          if (b.reservation_hours !== undefined)
            current.reservation_hours = number(
              b.reservation_hours,
              "مدة الحجز",
              1,
              72,
            );
          await tx.query("UPDATE settings SET data=$1 WHERE id='hospital'", [
            JSON.stringify(current),
          ]);
          return current;
        }),
      );
    }),
  );
  app.get(
    "/api/roles",
    wrap(async (r, s) => {
      permit(r, "settings.write");
      s.json(await all(db, "SELECT * FROM roles ORDER BY name"));
    }),
  );
  app.patch(
    "/api/roles/:role",
    wrap(async (r, s) => {
      permit(r, "settings.write");
      const role = String(r.params.role);
      const permissions = r.body.permissions;
      if (
        !Array.isArray(permissions) ||
        permissions.some((p) => !permissionList.includes(p))
      )
        throw new ApiError(400, "قائمة الصلاحيات غير صالحة");
      if (role === "admin" && !permissions.includes("settings.write"))
        throw new ApiError(400, "يجب الحفاظ على إمكانية إدارة النظام");
      s.json(
        await mutate(db, r, "roles", async (tx) => {
          const result = await one(
            tx,
            "UPDATE roles SET permissions=$1 WHERE name=$2 RETURNING *",
            [JSON.stringify([...new Set(permissions)]), role],
          );
          if (!result) throw new ApiError(404, "الدور غير موجود");
          return result;
        }),
      );
    }),
  );
  app.post(
    "/api/users",
    wrap(async (r, s) => {
      permit(r, "settings.write");
      const password = required(r.body.password, "كلمة المرور");
      if (password.length < 8)
        throw new ApiError(400, "كلمة المرور يجب ألا تقل عن 8 خانات");
      const role = required(r.body.role, "الدور");
      if (!Object.hasOwn(defaultRoles, role))
        throw new ApiError(400, "الدور غير صالح");
      s.status(201).json(
        await mutate(db, r, "users", async (tx) => {
          const u = await insert(tx, "users", {
            id: uid(),
            name: required(r.body.name, "الاسم"),
            username: required(r.body.username, "اسم المستخدم").trim().toLowerCase(),
            password_hash: hashPassword(password),
            role,
          });
          return {
            id: u.id,
            name: u.name,
            username: u.username,
            role: u.role,
            active: u.active,
            version: u.version,
          };
        }),
      );
    }),
  );
  app.patch(
    "/api/users/:id",
    wrap(async (r, s) => {
      permit(r, "settings.write");
      if (
        r.params.id === r.user.id &&
        (r.body.active === false ||
          (r.body.role && r.body.role !== r.user.role))
      )
        throw new ApiError(
          400,
          "لا يمكن تعطيل حسابك أو تغيير دورك من الجلسة الحالية",
        );
      s.json(
        await mutate(db, r, "users", async (tx) => {
          const u = await one(
            tx,
            "SELECT id,name,username,role,active,version FROM users WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!u) throw new ApiError(404, "المستخدم غير موجود");
          const role = r.body.role || u.role;
          if (!Object.hasOwn(defaultRoles, role))
            throw new ApiError(400, "الدور غير صالح");
          const password = r.body.password === undefined || r.body.password === ""
            ? null
            : required(r.body.password, "كلمة المرور");
          if (password && password.length < 8)
            throw new ApiError(400, "كلمة المرور يجب ألا تقل عن 8 خانات");
          const active =
            r.body.active === undefined ? u.active : Boolean(r.body.active);
          if (u.role === "admin" && (role !== "admin" || !active) &&
              Number((await one(tx, "SELECT count(*)::int AS count FROM users WHERE role='admin' AND active=true"))!.count) <= 1)
            throw new ApiError(409, "لا يمكن تعطيل آخر حساب إدارة نشط أو تغيير دوره");
          const name = r.body.name === undefined ? u.name : required(r.body.name, "الاسم");
          const username = r.body.username === undefined
            ? u.username
            : required(r.body.username, "اسم المستخدم").trim().toLowerCase();
          const result = await one(
            tx,
            "UPDATE users SET role=$1,active=$2,name=$3,username=$4,password_hash=COALESCE($5,password_hash),version=version+1 WHERE id=$6 AND version=$7 RETURNING id,name,username,role,active,version",
            [role, active, name, username, password ? hashPassword(password) : null, u.id, r.body.version ?? u.version],
          );
          if (!result) throw new ApiError(409, "تم تعديل حساب المستخدم؛ حدّث الصفحة وحاول مرة أخرى");
          await tx.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
          return result;
        }),
      );
    }),
  );
  app.delete(
    "/api/users/:id",
    wrap(async (r, s) => {
      permit(r, "settings.write");
      if (r.params.id === r.user.id)
        throw new ApiError(400, "لا يمكنك حذف الحساب المستخدم في الجلسة الحالية");
      s.json(await mutate(db, r, "users", async (tx) => {
        const user = await one(tx, "SELECT id,name,role,version FROM users WHERE id=$1 FOR UPDATE", [r.params.id]);
        if (!user) throw new ApiError(404, "المستخدم غير موجود");
        if (Number(user.version) !== Number(r.body.version))
          throw new ApiError(409, "تم تعديل حساب المستخدم؛ حدّث الصفحة وحاول مرة أخرى");
        if (user.role === "admin" && Number((await one(tx, "SELECT count(*)::int AS count FROM users WHERE role='admin' AND active=true"))!.count) <= 1)
          throw new ApiError(409, "لا يمكن حذف آخر حساب إدارة نشط");
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
        const references = await all(tx, `SELECT DISTINCT tc.table_name,kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema
          WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='users' AND tc.table_schema='public' AND tc.table_name<>'sessions'`);
        for (const reference of references) {
          if (!/^[a-z_]+$/.test(reference.table_name) || !/^[a-z_]+$/.test(reference.column_name)) continue;
          if (await one(tx, `SELECT 1 AS found FROM "${reference.table_name}" WHERE "${reference.column_name}"=$1 LIMIT 1`, [user.id]))
            throw new ApiError(409, "الحساب مرتبط بسجلات تشغيل ولا يمكن حذفه؛ أوقف الحساب للحفاظ على سجل التدقيق");
        }
        await tx.query("DELETE FROM users WHERE id=$1", [user.id]);
        return { id: user.id, name: user.name, deleted: true };
      }));
    }),
  );
  app.get(
    "/api/audit",
    wrap(async (r, s) => {
      permit(r, "audit.read");
      const scoped = ["doctor", "nurse"].includes(r.user.role);
      const rows = await all(
        db,
        "SELECT a.*,u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id" + (scoped ? " WHERE a.actor_id=$1" : "") + " ORDER BY a.created_at DESC LIMIT 300",
        scoped ? [r.user.id] : [],
      );
      const clinical = r.user.permissions.includes("clinical.read") && !scoped;
      s.json(
        rows.map((row) =>
          clinical
            ? row
            : {
                ...row,
                details:
                  row.entity === "system"
                    ? row.details
                    : { route: row.details?.route },
              },
        ),
      );
    }),
  );
  app.post(
    "/api/print-log",
    wrap(async (r, s) => {
      permit(r, "print");
      if (r.body.patient_id) {
        const p = await one(
          db,
          "SELECT a.id FROM admissions a WHERE a.patient_id=$1" +
            scopeSql(r) +
            " LIMIT 1",
          [r.body.patient_id],
        );
        if (!p) throw new ApiError(404, "الطفل غير موجود أو خارج نطاق التكليف");
      }
      await audit(
        db,
        r,
        "print",
        required(r.body.kind, "نوع المستند"),
        r.body.patient_id,
        {},
        r.body.patient_id,
      );
      s.status(201).json({ ok: true, printed_at: new Date().toISOString() });
    }),
  );
  app.get(
    "/api/dashboard",
    wrap(async (r, s) => {
      const bedAccess = r.user.permissions.includes("patients.read") || r.user.permissions.includes("beds.write");
      const stockAccess = r.user.permissions.includes("stock.read");
      const purchaseAccess = r.user.permissions.includes("purchase.read");
      if (
        !bedAccess && !stockAccess && !purchaseAccess
      )
        throw new ApiError(403, "ليس لديك صلاحية عرض لوحة القسم");
      if (!bedAccess) {
        const inventory = stockAccess
          ? await one(db, "SELECT count(*)::int AS stock_items FROM inventory")
          : { stock_items: 0 };
        const purchases = purchaseAccess
          ? await one(db, "SELECT count(*)::int AS pending_purchases FROM purchase_orders WHERE status IN ('pending','approved','reviewing')")
          : { pending_purchases: 0 };
        return s.json({
          stats: { ...inventory, ...purchases },
          patients: [], tasks: [], occupancy: [], trends: null,
          activity: await all(db, "SELECT id,action,entity,created_at FROM audit WHERE actor_id=$1 ORDER BY created_at DESC LIMIT 8", [r.user.id]),
          updated_at: new Date().toISOString(),
        });
      }
      const beds = await all(
        db,
        "SELECT status,count(*)::int AS count FROM beds GROUP BY status",
      );
      const count = (status: string) =>
        beds.find((b) => b.status === status)?.count || 0;
      const scoped = scopeSql(r);
      const counts = await one(
        db,
        `SELECT count(*) FILTER (WHERE (admitted_at AT TIME ZONE 'Africa/Cairo')::date=(now() AT TIME ZONE 'Africa/Cairo')::date)::int AS admissions_today,count(*) FILTER (WHERE (discharged_at AT TIME ZONE 'Africa/Cairo')::date=(now() AT TIME ZONE 'Africa/Cairo')::date)::int AS discharges_today FROM admissions a WHERE 1=1${scoped}`,
      );
      const clinical = r.user.permissions.includes("clinical.read"),
        finance = r.user.permissions.includes("billing.read"),
        patientRead = r.user.permissions.includes("patients.read");
      const patients = patientRead
        ? await all(
            db,
            patientSelect +
              ` WHERE a.status='active'${scoped} ORDER BY a.admitted_at DESC`,
          )
        : [];
      const safePatients = patients.map((p) => {
        if (clinical) return p;
        const {
          diagnosis,
          latest_weight,
          allergy_status,
          birth_weight,
          gestation_weeks,
          ...rest
        } = p;
        return rest;
      });
      const trendDays = patientRead
        ? await all(db, `
          WITH days AS (
            SELECT ((now() AT TIME ZONE 'Africa/Cairo')::date - n)::date AS day
            FROM generate_series(0,29) AS n
          ), events AS (
            SELECT (admitted_at AT TIME ZONE 'Africa/Cairo')::date AS day,
              1 AS admissions, 0 AS discharges FROM admissions a
              WHERE admitted_at >= (((now() AT TIME ZONE 'Africa/Cairo')::date - 29)::timestamp AT TIME ZONE 'Africa/Cairo')${scoped}
            UNION ALL
            SELECT (discharged_at AT TIME ZONE 'Africa/Cairo')::date AS day,
              0 AS admissions, 1 AS discharges FROM admissions a
              WHERE discharged_at >= (((now() AT TIME ZONE 'Africa/Cairo')::date - 29)::timestamp AT TIME ZONE 'Africa/Cairo')${scoped}
          )
          SELECT to_char(d.day,'YYYY-MM-DD') AS date,
            COALESCE(sum(e.admissions),0)::int AS admissions,
            COALESCE(sum(e.discharges),0)::int AS discharges
          FROM days d LEFT JOIN events e ON e.day=d.day
          GROUP BY d.day ORDER BY d.day`)
        : null;
      const tasks = clinical
        ? await all(
            db,
            `SELECT t.*,a.patient_id,p.name AS patient_name,p.mrn,b.name AS bed_name,u.name AS assignee_name FROM tasks t JOIN admissions a ON a.id=t.admission_id JOIN patients p ON p.id=a.patient_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.status IN ('pending','deferred')${scoped} ORDER BY due_at LIMIT 30`,
          )
        : [];
      const pending =
        clinical || r.user.permissions.includes("lab.write")
          ? await one(
              db,
              `SELECT count(*)::int AS count FROM labs l JOIN admissions a ON a.id=l.admission_id WHERE l.status NOT IN ('reviewed','rejected')${scoped}`,
            )
          : { count: 0 };
      const totals = finance
        ? (await billingFor(db, undefined, r)).totals
        : { charged: 0, paid: 0, balance: 0 };
      const expenses = r.user.permissions.includes("purchase.approve")
        ? await one(db,"SELECT COALESCE((SELECT sum(total_amount) FROM purchase_orders WHERE status='received'),0) AS purchase_expenses,COALESCE((SELECT sum(amount) FROM maintenance_expenses),0) AS maintenance_expenses")
        : {purchase_expenses:0,maintenance_expenses:0};
      const activity = await all(
        db,
        `SELECT au.id,au.action,au.entity,au.created_at,u.name AS actor_name FROM audit au LEFT JOIN users u ON u.id=au.actor_id WHERE au.actor_id=$1 ORDER BY au.created_at DESC LIMIT 8`,
        [r.user.id],
      );
      s.json({
        stats: {
          occupied: count("occupied"),
          available: count("available"),
          total: beds.reduce((sum, b) => sum + b.count, 0),
          operational:
            count("occupied") + count("available") + count("reserved"),
          ...counts,
          pending_labs: pending.count,
          overdue_tasks: tasks.filter(
            (t) => new Date(t.due_at).getTime() < Date.now(),
          ).length,
          revenue: totals.charged,
          received: totals.paid,
          outstanding: totals.balance,
          ...(r.user.permissions.includes("purchase.approve") ? {
            purchase_expenses: Number(expenses.purchase_expenses),
            maintenance_expenses: Number(expenses.maintenance_expenses),
            net_revenue: Number(totals.paid)-Number(expenses.purchase_expenses)-Number(expenses.maintenance_expenses),
          } : {}),
        },
        patients: safePatients,
        trends: trendDays ? { timezone: "Africa/Cairo", days: trendDays } : null,
        tasks,
        activity,
        occupancy: beds,
        updated_at: new Date().toISOString(),
      });
    }),
  );
  app.get(
    "/api/reports",
    wrap(async (r, s) => {
      permit(r, "reports.read");
      const occupancy = await all(
        db,
        "SELECT room,status,count(*)::int AS count FROM beds GROUP BY room,status ORDER BY room,status",
      );
      const admissions = await one(
        db,
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active,count(*) FILTER(WHERE status='discharged')::int AS discharged,COALESCE(avg(extract(epoch FROM (COALESCE(discharged_at,now())-admitted_at))/86400),0) AS avg_stay_days FROM admissions a WHERE 1=1" +
          scopeSql(r),
      );
      const clinical = r.user.permissions.includes("clinical.read");
      const tasks = clinical
        ? await all(
            db,
            "SELECT t.status,count(*)::int AS count FROM tasks t LEFT JOIN admissions a ON a.id=t.admission_id WHERE 1=1" +
              scopeSql(r) +
              " GROUP BY t.status",
          )
        : [];
      let billing: any = r.user.permissions.includes("billing.read")
        ? (await billingFor(db, undefined, r)).totals
        : null;
      if (billing && r.user.permissions.includes("purchase.approve")) {
        const expenses=await one(db,"SELECT COALESCE((SELECT sum(total_amount) FROM purchase_orders WHERE status='received'),0) AS purchase_expenses,COALESCE((SELECT sum(amount) FROM maintenance_expenses),0) AS maintenance_expenses");
        billing={...billing,purchase_expenses:Number(expenses.purchase_expenses),maintenance_expenses:Number(expenses.maintenance_expenses),net_revenue:Number(billing.paid)-Number(expenses.purchase_expenses)-Number(expenses.maintenance_expenses)};
      }
      const stock = r.user.permissions.includes("stock.read")
        ? await all(
            db,
            "SELECT name,quantity,min_quantity,unit FROM inventory WHERE quantity<min_quantity",
          )
        : [];
      await audit(db, r, "read", "reports");
      s.json({
        occupancy,
        admissions,
        tasks,
        billing,
        low_stock: stock,
        period: { from: "بداية السجلات", to: new Date().toISOString() },
        definitions: {
          occupancy:
            "لقطة حالية: المشغول ÷ (المشغول + المتاح + المحجوز). يستبعد التنظيف والصيانة وخارج الخدمة. لا يمثل إشغال فترة تاريخية.",
          avg_stay:
            "متوسط فرق وقت الخروج الفعلي أو الآن ووقت الدخول مقاسًا بالساعات ÷ 24",
          billing:
            "المفوتر من بنود الخدمة؛ المحصل من المدفوعات ناقص الاستردادات؛ صافي الإيراد هو المحصل ناقص مشتريات المخزون ومصروفات الصيانة",
        },
        updated_at: new Date().toISOString(),
      });
    }),
  );
  app.get(
    "/api/export/:kind",
    wrap(async (r, s) => {
      permit(r, "export");
      const kind = String(r.params.kind);
      let rows: any[] = [];
      if (kind === "patients") {
        permit(r, "patients.read");
        rows = await all(
          db,
          `SELECT p.mrn,p.name,a.admission_no,a.status,a.admitted_at FROM patients p JOIN admissions a ON a.patient_id=p.id WHERE 1=1${scopeSql(r)}`,
        );
      } else if (kind === "billing") {
        permit(r, "billing.read");
        rows = await all(
          db,
          `SELECT p.receipt_no,p.amount,p.method,p.created_at FROM payments p JOIN admissions a ON a.id=p.admission_id WHERE 1=1${scopeSql(r)} ORDER BY p.created_at DESC`,
        );
      } else if (kind === "inventory") {
        permit(r, "stock.read");
        rows = await all(
          db,
          "SELECT name,unit,batch,expires_at,quantity,location FROM inventory",
        );
      } else throw new ApiError(404, "نوع التصدير غير متاح");
      await audit(db, r, "export", kind, undefined, { count: rows.length });
      const keys = rows.length ? Object.keys(rows[0]) : ["لا توجد سجلات"];
      const cell = (x: any) => {
        let str = x instanceof Date ? x.toISOString() : String(x ?? "");
        if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
        return '"' + str.replace(/"/g, '""') + '"';
      };
      s.setHeader("Content-Type", "text/csv; charset=utf-8");
      s.setHeader("Content-Disposition", `attachment; filename="${kind}.csv"`);
      s.send(
        "\uFEFF" +
          [
            keys.map(cell).join(","),
            ...rows.map((row) => keys.map((k) => cell(row[k])).join(",")),
          ].join("\r\n"),
      );
    }),
  );
}
function validData(value: any) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "تفاصيل السجل يجب أن تكون حقولًا منظمة");
  if (JSON.stringify(value).length > 100000)
    throw new ApiError(400, "تفاصيل السجل أكبر من الحد المسموح");
  return value;
}
