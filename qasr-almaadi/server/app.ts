import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { updateRoutes, updateMaintenanceMiddleware } from "./updates.js";
import { localeMiddleware,getLocale } from "./i18n.js";
import { attachmentRoutes } from "./attachments.js";
import { all, one, type Database } from "./db.js";
import { seedDatabase, insert } from "./seed.js";
import {
  ApiError,
  date,
  number,
  choice,
  required,
  verifyPassword,
  sessionToken,
  digest,
  hashPassword,
  permissionList,
} from "./security.js";
import {
  wrap,
  permit,
  audit,
  mutate,
  uid,
  scopeSql,
  admission,
  versioned,
  patientSelect,
  billingFor,
  type Req,
} from "./context.js";
import { clinicalRoutes } from "./clinical.js";
import { financeRoutes } from "./finance.js";
import { registerRoutes } from "./registers.js";
import { securityRoutes } from "./mfa.js";
import { printingRoutes } from "./printing.js";
import { attendanceRoutes, attendanceDeviceRoutes } from "./attendance.js";
import { consumablesRoutes } from "./consumables.js";
import { equipmentRoutes } from "./equipment.js";
import { treasuryRoutes } from "./treasury.js";
import { maintenanceRoutes } from "./maintenance.js";
import { chatRoutes } from "./chat.js";
import { insuranceRoutes } from "./insurance.js";
import { checkoutRoutes } from "./checkout.js";
import { monitoringRoutes } from "./monitoring.js";
import { purchaseRoutes } from "./purchases.js";
import { financialStatementRoutes } from "./financial-statements.js";
import { accountingPeriodGuard, accountingRoutes } from "./accounting.js";
import { defaultHospital } from "./setup.js";
import { hospitalRoutes } from "./hospital.js";
import { hospitalServiceRoutes, hospitalServicesFor } from "./hospital-services.js";

// Non-clinical roles need operational identity, not medical observations or summaries.
function patientProjection(r: Req, row: any) {
  if (r.user.permissions.includes("clinical.read")) return row;
  const {
    allergy_status,
    gestation_weeks,
    birth_weight,
    latest_weight,
    diagnosis,
    ...safe
  } = row;
  return safe;
}
function admissionProjection(r: Req, row: any) {
  if (r.user.permissions.includes("clinical.read")) return row;
  const { reason, diagnosis, summary, followup_at, triage_level, ...safe } = row;
  return safe;
}

export async function createApp(
  db: Database,
  { seed = false }: { seed?: boolean } = {},
) {
  if (seed) await seedDatabase(db);
  const app = express();
  app.disable("x-powered-by");
  // Only opt in when a local, controlled reverse proxy supplies forwarded headers.
  if (process.env.TRUST_PROXY === "loopback") app.set("trust proxy", "loopback");
  app.use(localeMiddleware);
  app.use(updateMaintenanceMiddleware);
  app.use(express.json({ limit: "8mb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin && origin !== `${req.protocol}://${req.get("host")}`)
        return res.status(403).json({ error: "طلب من مصدر غير مصرح به" });
      if (req.get("sec-fetch-site") === "cross-site")
        return res.status(403).json({ error: "طلب من مصدر غير مصرح به" });
    }
    next();
  });
  attendanceDeviceRoutes({ app, db });
  return finishApp(app, db);
}

function finishApp(app: express.Express, db: Database) {
  const release = (() => {
    try {
      const value = JSON.parse(readFileSync(join(process.cwd(), "release.json"), "utf8"));
      return { version: String(value.version), sequence: Number(value.sequence), digest: String(value.digest) };
    } catch {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
      return { version: String(pkg.version), sequence: 0, digest: null };
    }
  })();
  app.use("/api", async (req, res, next) => {
    try {
      const token = req.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("nicu_session="))
        ?.slice(13);
      if (token) {
        const user = await one(
          db,
          "SELECT u.id,u.name,u.username,u.role,ro.permissions FROM sessions se JOIN users u ON u.id=se.user_id JOIN roles ro ON ro.name=u.role WHERE se.token_hash=$1 AND se.expires_at>now() AND u.active=true",
          [digest(token)],
        );
        if (user) (req as Req).user = user;
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/health",
    wrap(async (_r, s) => {
      await one(db, "SELECT 1 AS ok");
      s.json({ ok: true, mode: "live", release });
    }),
  );
  app.get(
    "/api/session",
    wrap(async (r, s) => {
      const hospital = await one(db, "SELECT data FROM settings WHERE id='hospital'");
      const setupRequired = !hospital || !(await one(db, "SELECT id FROM users LIMIT 1"));
      s.json({
        user: r.user || null,
        mode: "live",
        training_accounts_visible: false,
        setup_required: setupRequired,
        hospital: hospital?.data || defaultHospital,
      });
    }),
  );
  const attempts = new Map<string, { count: number; until: number }>();
  app.post(
    "/api/login",
    wrap(async (r, s) => {
      const username = required(r.body.username, "اسم المستخدم").trim().toLowerCase(),
        password = required(r.body.password, "كلمة المرور");
      const k = r.ip + ":" + username;
      const previous = attempts.get(k);
      if (previous && previous.until > Date.now() && previous.count >= 10)
        throw new ApiError(429, "محاولات كثيرة. حاول بعد 15 دقيقة");
      const u = await one(
        db,
        "SELECT u.*,ro.permissions FROM users u JOIN roles ro ON ro.name=u.role WHERE lower(username)=lower($1)",
        [username],
      );
      if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
        attempts.set(k, {
          count:
            (previous && previous.until > Date.now() ? previous.count : 0) + 1,
          until: Date.now() + 900000,
        });
        throw new ApiError(401, "اسم المستخدم أو كلمة المرور غير صحيح");
      }
      attempts.delete(k);
      const token = sessionToken();
      await insert(db, "sessions", {
        token_hash: digest(token),
        user_id: u.id,
        expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
      });
      s.cookie("nicu_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure:
          process.env.SESSION_SECURE === "true" ||
          process.env.NODE_ENV === "production",
        maxAge: 8 * 3600000,
        path: "/",
      });
      r.user = {
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        permissions: u.permissions,
      };
      await audit(db, r, "login", "session");
      s.json({ user: r.user });
    }),
  );
  app.use("/api", (req, res, next) => {
    if (!(req as Req).user)
      return res.status(401).json({ error: "يرجى تسجيل الدخول" });
    next();
  });
  app.use("/api", accountingPeriodGuard(db));
  app.use("/api", async (req, res, next) => {
    if (req.method !== "GET" || (process.env.UPDATE_ROOT && existsSync(join(process.env.UPDATE_ROOT, "maintenance.json")))) return next();
    try {
      await audit(db, req as Req, "read_request", "api", undefined, {
        route: req.path,
      });
      next();
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/api/logout",
    wrap(async (r, s) => {
      const token = r.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("nicu_session="))
        ?.slice(13);
      if (token)
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          digest(token),
        ]);
      await audit(db, r, "logout", "session");
      s.clearCookie("nicu_session", { path: "/" }).json({ ok: true });
    }),
  );
  app.get(
    "/api/users",
    wrap(async (r, s) => s.json(await all(
      db,
      r.user?.permissions?.includes("settings.write")
        ? "SELECT id,name,username,role,active,version FROM users ORDER BY name"
        : "SELECT id,name,role,active FROM users ORDER BY name",
    ))),
  );
  app.get(
    "/api/patients",
    wrap(async (r, s) => {
      permit(r, "patients.read");
      const q = String(r.query.search || "");
      const status = String(r.query.status || "");
      const rows = await all(
        db,
        patientSelect +
          ` WHERE (p.name ILIKE $1 OR p.mrn ILIKE $1 OR p.mother_name ILIKE $1 OR p.national_id ILIKE $1 OR p.phone ILIKE $1) ${status ? " AND a.status=$2" : ""}` +
          scopeSql(r) +
          " ORDER BY a.admitted_at DESC",
        [`%${q}%`, ...(status ? [status] : [])],
      );
      await audit(db, r, "read", "patients");
      s.json(rows.map((row) => patientProjection(r, row)));
    }),
  );
  app.post(
    "/api/patients",
    wrap(async (r, s) => {
      permit(r, "patients.write");
      const b = r.body;
      s.status(201).json(
        await mutate(db, r, "patients", async (tx) => {
          const name = required(b.name, "اسم المريض"),
            birth = date(b.birth_at, "الميلاد");
          if (new Date(birth).getTime() > Date.now())
            throw new ApiError(
              400,
              "تاريخ الميلاد لا يمكن أن يكون في المستقبل",
            );
          const mother =
            typeof b.mother_name === "string" && b.mother_name.trim()
              ? b.mother_name.trim()
              : null;
          const duplicate = mother
            ? await one(
                tx,
                "SELECT id,mrn,name FROM patients WHERE mother_name=$1 AND birth_at::date=$2::date AND COALESCE(twin_label,'')=COALESCE($3,'')",
                [mother, birth, b.twin_label || null],
              )
            : null;
          if (duplicate && !b.allow_duplicate)
            throw new ApiError(
              409,
              `يوجد ملف محتمل مكرر: ${duplicate.mrn}. راجع الهوية ثم أكد إضافة ملف مستقل`,
              "POSSIBLE_DUPLICATE",
            );
          const p = await insert(tx, "patients", {
            id: uid(),
            mrn: `QM-${new Date().getFullYear()}-${sessionToken().slice(0, 8).toUpperCase()}`,
            name,
            phone: b.phone ? required(b.phone, "الهاتف") : null,
            national_id: b.national_id ? required(b.national_id, "الرقم القومي") : null,
            sex: choice(b.sex, ["male", "female", "unknown"], "الجنس"),
            birth_at: birth,
            gestation_weeks: b.gestation_weeks
              ? number(b.gestation_weeks, "العمر الحملي", 15, 45)
              : null,
            birth_weight: b.birth_weight
              ? number(b.birth_weight, "وزن الميلاد", 100, 10000)
              : null,
            mother_name: mother,
            guardian_name: b.guardian_name || null,
            guardian_phone: b.guardian_phone || null,
            twin_label: b.twin_label || null,
            birth_certificate_no: b.birth_certificate_no || null,
            blood_group: b.blood_group
              ? choice(b.blood_group, ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "blood_unknown"], "فصيلة الدم")
              : "blood_unknown",
            delivery_type: b.delivery_type
              ? choice(b.delivery_type, ["delivery_normal", "delivery_cesarean", "delivery_assisted", "delivery_unknown"], "نوع الولادة")
              : "delivery_unknown",
            birth_place: b.birth_place || null,
            mother_national_id: b.mother_national_id || null,
            guardian_relation: b.guardian_relation || null,
            guardian_national_id: b.guardian_national_id || null,
            emergency_phone: b.emergency_phone || null,
            address: b.address || null,
          });
          const a = b.registration_only === true ? null : await createAdmission(tx, r, p.id, b);
          return patientProjection(r, {
            ...p,
            admission_id: a?.id || null,
            admission_no: a?.admission_no || null,
            admission_status: a?.status || null,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/patients/:id/admissions",
    wrap(async (r, s) => {
      permit(r, "patients.write");
      s.status(201).json(
        await mutate(db, r, "admissions", async (tx) => {
          if (
            !(await one(tx, "SELECT id FROM patients WHERE id=$1", [
              r.params.id,
            ]))
          )
            throw new ApiError(404, "الطفل غير موجود");
          return createAdmission(tx, r, String(r.params.id), r.body);
        }),
      );
    }),
  );
  app.patch(
    "/api/patients/:id",
    wrap(async (r, s) => {
      permit(r, "patients.write");
      if (r.body.allergy_status !== undefined) permit(r, "clinical.write");
      s.json(
        await mutate(db, r, "patients", async (tx) => {
          if (scopeSql(r) && !await one(tx, patientSelect + " WHERE p.id=$1" + scopeSql(r), [r.params.id])) {
            throw new ApiError(404, "ملف الطفل غير موجود أو خارج نطاق التكليف");
          }
          const fields: Record<string, any> = {};
          for (const key of [
            "name",
            "phone",
            "national_id",
            "mother_name",
            "guardian_name",
            "guardian_phone",
            "twin_label",
            "birth_certificate_no",
            "blood_group",
            "delivery_type",
            "birth_place",
            "mother_national_id",
            "guardian_relation",
            "guardian_national_id",
            "emergency_phone",
            "address",
            "allergy_status",
          ])
            if (r.body[key] !== undefined) fields[key] = r.body[key];
          if (fields.name !== undefined) fields.name = required(fields.name, "اسم المريض");
          for (const key of ["phone", "national_id"])
            if (fields[key] !== undefined) fields[key] = fields[key] ? required(fields[key], key === "phone" ? "الهاتف" : "الرقم القومي") : null;
          if (fields.allergy_status)
            choice(
              fields.allergy_status,
              ["unknown", "none_known", "known"],
              "حالة الحساسية",
            );
          if (!Object.keys(fields).length)
            throw new ApiError(400, "لا توجد بيانات للتعديل");
          return patientProjection(
            r,
            await versioned(
              tx,
              "patients",
              String(r.params.id),
              r.body.version,
              fields,
            ),
          );
        }),
      );
    }),
  );
  app.get(
    "/api/patients/:id",
    wrap(async (r, s) => {
      permit(r, "patients.read");
      const selectedId = r.query.admission_id
        ? String(r.query.admission_id)
        : null;
      const selectedJoin = selectedId
        ? patientSelect.replace(
            "WHERE aa.patient_id=p.id ORDER BY admitted_at DESC LIMIT 1",
            "WHERE aa.patient_id=p.id AND aa.id=$2 ORDER BY admitted_at DESC LIMIT 1",
          )
        : patientSelect;
      const p = await one(db, selectedJoin + " WHERE p.id=$1" + scopeSql(r), [
        r.params.id,
        ...(selectedId ? [selectedId] : []),
      ]);
      if (!p)
        throw new ApiError(404, "ملف الطفل غير موجود أو خارج نطاق التكليف");
      const admissions = await all(
        db,
        "SELECT * FROM admissions a WHERE patient_id=$1" +
          scopeSql(r) +
          " ORDER BY admitted_at DESC",
        [p.id],
      );
      const a = selectedId
        ? admissions.find((row) => row.id === selectedId)
        : admissions[0];
      if (selectedId && !a)
        throw new ApiError(
          404,
          "الإقامة المختارة غير موجودة أو خارج نطاق التكليف",
        );
      const clinical = r.user.permissions.includes("clinical.read"),
        laboratory = clinical || r.user.permissions.includes("lab.write");
      const result: any = {
        patient: patientProjection(r, p),
        admissions: admissions.map((row) => admissionProjection(r, row)),
        admission: a ? admissionProjection(r, a) : null,
        orders: [],
        vitals: [],
        labs: [],
        notes: [],
        feedings: [],
        milk: [],
        billing: {
          charges: [],
          payments: [],
          totals: { charged: 0, paid: 0, balance: 0 },
        },
        movements: [],
        tasks: [],
        handovers: [],
        events: [],
        records: [],
      };
      if (a) {
        Object.assign(result, await hospitalServicesFor(db, r, a.id));
        for (const t of [
          "orders",
          "vitals",
          "labs",
          "notes",
          "feedings",
          "milk",
          "tasks",
          "handovers",
        ])
          if (clinical || (t === "labs" && laboratory)) {
            result[t] = await all(
              db,
              `SELECT * FROM ${t} WHERE admission_id=$1 ORDER BY created_at DESC`,
              [a.id],
            );
            if (t === "orders")
              for (const o of result.orders)
                o.administrations = await all(
                  db,
                  "SELECT * FROM administrations WHERE order_id=$1 ORDER BY actual_at DESC",
                  [o.id],
                );
          }
        result.movements = await all(
          db,
          "SELECT m.*,f.name AS from_bed_name,t.name AS to_bed_name,u.name AS actor_name FROM bed_movements m LEFT JOIN beds f ON f.id=m.from_bed_id LEFT JOIN beds t ON t.id=m.to_bed_id LEFT JOIN users u ON u.id=m.actor_id WHERE admission_id=$1 ORDER BY created_at DESC",
          [a.id],
        );
        if (r.user.permissions.includes("billing.read"))
          result.billing = await billingFor(db, a.id);
        if (clinical)
          result.events = await all(
            db,
            `SELECT e.*,u.name AS actor_name FROM audit e LEFT JOIN users u ON u.id=e.actor_id WHERE e.patient_id=$1 AND (
              e.entity='patients'
              OR (e.entity='admissions' AND e.entity_id=$2)
              OR (e.entity='orders' AND e.entity_id IN (SELECT id FROM orders WHERE admission_id=$2))
              OR (e.entity='labs' AND e.entity_id IN (SELECT id FROM labs WHERE admission_id=$2))
              OR (e.entity='vitals' AND e.entity_id IN (SELECT id FROM vitals WHERE admission_id=$2))
              OR (e.entity='notes' AND e.entity_id IN (SELECT id FROM notes WHERE admission_id=$2))
              OR (e.entity='attachments' AND e.entity_id IN (SELECT id FROM attachments WHERE admission_id=$2))
            ) ORDER BY e.created_at DESC LIMIT 80`,
            [p.id, a.id],
          );
      }
      if (!clinical)
        result.movements = result.movements.map(
          ({ reason, ...safe }: any) => safe,
        );
      await audit(db, r, "read", "patients", p.id, {}, p.id);
      s.json(result);
    }),
  );
  app.get(
    "/api/beds",
    wrap(async (r, s) => {
      if (!r.user.permissions.includes("patients.read"))
        permit(r, "beds.write");
      const rows = await all(
        db,
        `SELECT b.*,a.id AS admission_id,a.patient_id,p.name AS patient_name,p.mrn,p.barcode_no AS patient_barcode_no,a.admitted_at,a.doctor_id,a.nurse_id FROM beds b LEFT JOIN admissions a ON a.bed_id=b.id AND a.status='active' LEFT JOIN patients p ON p.id=a.patient_id ORDER BY b.name`,
      );
      const scoped = ["doctor", "nurse"].includes(r.user.role);
      await audit(db, r, "read", "beds");
      s.json(
        rows.map(({ doctor_id, nurse_id, ...bed }: any) => {
          const allowed =
            r.user.permissions.includes("patients.read") &&
            (!scoped || doctor_id === r.user.id || nurse_id === r.user.id);
          if (!allowed) {
            bed.admission_id = null;
            bed.patient_id = null;
            bed.patient_name = null;
            bed.patient_barcode_no = null;
            bed.mrn = null;
            bed.admitted_at = null;
          }
          return bed;
        }),
      );
    }),
  );
  app.patch(
    "/api/beds/:id",
    wrap(async (r, s) => {
      permit(r, "beds.write");
      s.json(
        await mutate(db, r, "beds", async (tx) => {
          const b = await one(tx, "SELECT * FROM beds WHERE id=$1 FOR UPDATE", [
            r.params.id,
          ]);
          if (!b) throw new ApiError(404, "السرير غير موجود");
          if(await one(tx,"SELECT id FROM maintenance_jobs WHERE bed_id=$1 AND status='in_progress'",[b.id]))throw new ApiError(409,getLocale(r)==='en'?'Complete and verify the active maintenance job before changing bed status':'أكمل أمر الصيانة والتحقق قبل تغيير حالة الحضّانة','ACTIVE_MAINTENANCE');
          if (b.status === "occupied")
            throw new ApiError(
              409,
              "لا يمكن تغيير حالة سرير مشغول؛ استخدم النقل أو الخروج",
            );
          const status = choice(
            r.body.status,
            [
              "available",
              "reserved",
              "cleaning",
              "maintenance",
              "out_of_service",
            ],
            "حالة السرير",
          );
          return versioned(tx, "beds", b.id, r.body.version, {
            status,
            reason: required(r.body.reason, "سبب تغيير الحالة"),
          });
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/transfer",
    wrap(async (r, s) => {
      permit(r, "beds.write");
      s.json(
        await mutate(db, r, "admissions", async (tx) => {
          await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [r.params.id]);
          const a = await admission(tx, r, String(r.params.id));
          const to = required(r.body.bed_id, "السرير الجديد");
          if (a.bed_id === to)
            throw new ApiError(409, "الطفل موجود بالفعل على هذا السرير");
          const targetBed = await occupy(tx, to);
          if (targetBed.department_id !== a.department_id || a.encounter_type === "outpatient")
            throw new ApiError(409, "استخدم التحويل بين الأقسام لتغيير قسم الزيارة والتسكين");
          if (a.bed_id)
            await tx.query(
              "UPDATE beds SET status='cleaning',version=version+1 WHERE id=$1",
              [a.bed_id],
            );
          const reason = required(r.body.reason, "سبب النقل");
          const updated = await versioned(
            tx,
            "admissions",
            a.id,
            r.body.version ?? a.version,
            { bed_id: to },
          );
          await insert(tx, "bed_movements", {
            id: uid(),
            admission_id: a.id,
            from_bed_id: a.bed_id,
            to_bed_id: to,
            care_level: a.care_level,
            reason,
            actor_id: r.user.id,
          });
          await audit(
            tx,
            r,
            "transfer",
            "admissions",
            a.id,
            { from: a.bed_id, to, reason },
            a.patient_id,
          );
          return admissionProjection(r, updated);
        }),
      );
    }),
  );
  clinicalRoutes({ app, db });
  financeRoutes({ app, db });
  registerRoutes({ app, db });
  securityRoutes({ app, db });
  printingRoutes({ app, db });
  attachmentRoutes({ app, db });
  attendanceRoutes({ app, db });
  consumablesRoutes({ app, db });
  equipmentRoutes({ app, db });
  treasuryRoutes({ app, db });
  financialStatementRoutes({ app, db });
  accountingRoutes({ app, db });
  maintenanceRoutes({ app, db });
  chatRoutes({ app, db });
  insuranceRoutes({ app, db });
  checkoutRoutes({ app, db });
  monitoringRoutes({ app, db });
  purchaseRoutes({ app, db });
  updateRoutes({ app, db });
  hospitalRoutes({ app, db });
  hospitalServiceRoutes({ app, db });
  app.use("/api", (_r, s) =>
    s.status(404).json({ error: "المسار المطلوب غير موجود" }),
  );
  app.use(
    (
      e: any,
      _r: express.Request,
      s: express.Response,
      _n: express.NextFunction,
    ) => {
      if (e instanceof ApiError)
        return s.status(e.status).json({ error: e.message, code: e.code });
      if (e.code === "23505")
        return s.status(409).json({
          error: "تعارض أو عملية مكررة؛ حدّث البيانات وتحقق من السجل",
          code: "CONFLICT",
        });
      if (["23503", "23514", "22P02", "22007", "22008"].includes(e.code))
        return s
          .status(400)
          .json({ error: "بيانات غير صالحة أو سجل مرتبط غير موجود" });
      if (e.type === "entity.parse.failed")
        return s.status(400).json({ error: "صيغة البيانات غير صالحة" });
      if (e.type === "entity.too.large")
        return s.status(413).json({ error: "الطلب أكبر من الحد المسموح" });
      console.error(e);
      s.status(500).json({
        error: "تعذّر الحفظ بسبب خطأ داخلي. المدخلات لم تعتمد؛ حاول مجددًا",
      });
    },
  );
  return app;
}
async function occupy(db: Database, id: string) {
  const row = await one(
    db,
    "UPDATE beds SET status='occupied',version=version+1 WHERE id=$1 AND status IN ('available','reserved') RETURNING *",
    [id],
  );
  if (!row)
    throw new ApiError(
      409,
      "السرير غير متاح الآن. اختر سريرًا جاهزًا آخر",
      "BED_CONFLICT",
    );
  return row;
}
async function createAdmission(
  db: Database,
  r: Req,
  patientId: string,
  b: any,
) {
  const encounterType = choice(b.encounter_type || "nicu", ["nicu", "outpatient", "emergency", "inpatient", "icu"], "نوع الزيارة");
  const departmentId = b.department_id || `dept-${encounterType}`;
  const department = await one(db, "SELECT * FROM hospital_departments WHERE id=$1 AND active=true FOR UPDATE", [departmentId]);
  if (!department || (department.type !== encounterType && !(department.type === "surgery" && encounterType === "inpatient")))
    throw new ApiError(400, "القسم لا يتوافق مع نوع الزيارة");
  await db.query("SELECT id FROM patients WHERE id=$1 FOR UPDATE", [patientId]);
  if (
    await one(
      db,
      "SELECT id FROM admissions WHERE patient_id=$1 AND status='active'",
      [patientId],
    )
  )
    throw new ApiError(409, "للمريض زيارة نشطة بالفعل؛ استخدم التحويل بين الأقسام");
  if (encounterType === "outpatient" && b.bed_id) throw new ApiError(400, "زيارة العيادة لا تحتاج إلى سرير؛ اختر التنويم للتسكين");
  const bed = b.bed_id ? await occupy(db, b.bed_id) : null;
  if (bed && bed.department_id !== departmentId) throw new ApiError(409, "السرير المختار تابع لقسم آخر");
  const doctor = b.doctor_id || null,
    nurse = b.nurse_id || null;
  for (const [id, roles] of [
    [doctor, ["doctor", "manager"]],
    [nurse, ["nurse", "head_nurse"]],
  ] as [string, string[]][]) {
    if (!id) continue;
    const u = await one(
      db,
      "SELECT role FROM users WHERE id=$1 AND active=true",
      [id],
    );
    if (!u || !roles.includes(u.role))
      throw new ApiError(400, "التكليف المختار غير صالح");
  }
  const a = await insert(db, "admissions", {
    id: uid(),
    admission_no: `ADM-${new Date().getFullYear()}-${sessionToken().slice(0, 8).toUpperCase()}`,
    patient_id: patientId,
    department_id: departmentId,
    encounter_type: encounterType,
    bed_id: bed?.id || null,
    care_level: b.care_level || bed?.care_level || "intermediate",
    source: b.source || "direct",
    reason: required(b.reason, "سبب الدخول"),
    doctor_id: doctor,
    nurse_id: nurse,
  });
  if (bed)
    await insert(db, "bed_movements", {
      id: uid(),
      admission_id: a.id,
      to_bed_id: bed.id,
      care_level: a.care_level,
      reason: "دخول",
      actor_id: r.user.id,
    });
  await audit(db, r, "admit", "admissions", a.id, {}, patientId);
  return a;
}
