import { randomUUID } from "node:crypto";
import { type Database, one } from "./db.js";
import { defaultRoles, hashPassword } from "./security.js";
export async function insert(
  db: Database,
  table: string,
  data: Record<string, any>,
) {
  const financial = ["charges", "payments", "insurance_claims", "stock_movements"].includes(table);
  const values = { ...data };
  // A caller cannot supply the snapshot. Read and lock the encounter inside the
  // INSERT statement so a concurrent transfer cannot race a separate lookup.
  if (financial) delete values.department_id_snapshot;
  const keys = Object.keys(values);
  const parameters = keys.map((_, i) => `$${i + 1}`);
  if (financial) {
    const admissionParameter = keys.indexOf("admission_id") + 1;
    keys.push("department_id_snapshot");
    parameters.push(admissionParameter && values.admission_id
      ? `(SELECT department_id FROM admissions WHERE id=$${admissionParameter} FOR UPDATE)`
      : "NULL");
  }
  return one(
    db,
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${parameters.join(",")}) RETURNING *`,
    Object.values(values),
  );
}
export async function seedDatabase(db: Database) {
  if (await one(db, "SELECT id FROM users LIMIT 1")) return;
  const trainingPassword = process.env.TRAINING_PASSWORD || "Training@2026";
  if (
    process.env.PUBLIC_DEMO_ACCOUNTS === "false" &&
    (trainingPassword === "Training@2026" || trainingPassword.length < 16)
  ) {
    throw new Error(
      "Fresh private training deployments require TRAINING_PASSWORD with at least 16 characters. Existing users are never reset by seeding.",
    );
  }
  await db.transaction(async (tx) => {
    for (const [name, permissions] of Object.entries(defaultRoles))
      await tx.query("INSERT INTO roles(name,permissions) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET permissions=excluded.permissions",[name,JSON.stringify(permissions)]);
    const names: Record<string, string> = {
      manager: "د. ليلى منصور",
      admin: "مسؤول النظام",
      doctor: "د. أحمد الشافعي",
      nurse: "م. سارة حسن",
      head_nurse: "م. هبة عادل",
      reception: "مريم فؤاد",
      accountant: "خالد إبراهيم",
      purchasing: "مسؤول المشتريات",
      lab: "د. منى عادل",
      radiologist: "طبيب الأشعة",
      pharmacist: "صيدلي المستشفى",
      stock: "مصطفى محمود",
      quality: "د. ندى سمير",
      maintenance: "م. عمر أمين",
      insurance: "دعاء يوسف",
    };
    const hash = hashPassword(trainingPassword);
    for (const role of Object.keys(defaultRoles))
      await insert(tx, "users", {
        id: role,
        name: names[role],
        username: role,
        password_hash: hash,
        role,
      });
    await insert(tx, "settings", {
      id: "hospital",
      data: JSON.stringify({
        name: "مستشفى قصر المعادي",
        address: "المعادي، القاهرة",
        phone: "02 2525 0000",
        logo: "",
        reservation_hours: 4,
        timezone: "Africa/Cairo",
        currency: "EGP",
        training: true,
      }),
    });
    const statuses = [
      "occupied",
      "occupied",
      "occupied",
      "occupied",
      "occupied",
      "occupied",
      "occupied",
      "occupied",
      "available",
      "available",
      "available",
      "available",
      "reserved",
      "cleaning",
      "maintenance",
      "out_of_service",
    ];
    for (let i = 1; i <= 16; i++)
      await insert(tx, "beds", {
        id: `bed-${i}`,
        name: `حضانة ${String(i).padStart(2, "0")}`,
        room:
          i <= 6
            ? "العناية المركزة أ"
            : i <= 12
              ? "الرعاية المتوسطة ب"
              : "العزل والرعاية ج",
        status: statuses[i - 1],
        care_level: i <= 6 ? "intensive" : "intermediate",
        reason:
          i === 15 ? "معايرة جهاز التحكم" : i === 16 ? "تجهيز الغرفة" : null,
      });
    const now = Date.now();
    const at = (hours: number) => new Date(now - hours * 3600000).toISOString();
    const babies = [
      "طفل / فاطمة أحمد",
      "طفلة / مريم علي",
      "آدم يوسف محمود",
      "طفل / نورا حسن",
      "ليان محمد عادل",
      "طفل / هبة إبراهيم",
      "طفل / فاطمة أحمد",
      "ياسين عمر خالد",
    ];
    for (let i = 0; i < babies.length; i++) {
      const id = `patient-${i + 1}`,
        adm = `admission-${i + 1}`;
      await insert(tx, "patients", {
        id,
        mrn: `QM-2026-${String(101 + i).padStart(5, "0")}`,
        name: babies[i],
        sex: [1, 4].includes(i) ? "female" : "male",
        birth_at: at(100 + i * 25),
        gestation_weeks: 32 + (i % 5),
        birth_weight: 1550 + i * 170,
        mother_name:
          i === 6
            ? "فاطمة أحمد"
            : [
                "فاطمة أحمد",
                "مريم علي",
                "دعاء يوسف",
                "نورا حسن",
                "آية محمد",
                "هبة إبراهيم",
                "فاطمة أحمد",
                "هالة خالد",
              ][i],
        guardian_name: [
          "أحمد مصطفى",
          "علي حسن",
          "يوسف محمود",
          "حسن إبراهيم",
          "محمد عادل",
          "إبراهيم سعد",
          "أحمد مصطفى",
          "عمر خالد",
        ][i],
        guardian_phone: `01000000${String(i + 1).padStart(3, "0")}`,
        twin_label: i === 0 ? "التوأم أ" : i === 6 ? "التوأم ب" : null,
        allergy_status: i === 2 ? "none_known" : "unknown",
      });
      await insert(tx, "admissions", {
        id: adm,
        admission_no: `ADM-2026-${1001 + i}`,
        patient_id: id,
        admitted_at: at(72 + i * 15),
        bed_id: `bed-${i + 1}`,
        care_level: i < 6 ? "intensive" : "intermediate",
        source: i % 2 ? "delivery" : "transfer",
        reason: "متابعة حديثي الولادة — بيانات تدريبية",
        diagnosis: [
          "متابعة تنفسية",
          "نقص وزن الولادة",
          "متابعة ما بعد الولادة",
          "متابعة تغذية",
        ][i % 4],
        doctor_id: "doctor",
        nurse_id: "nurse",
      });
      await insert(tx, "bed_movements", {
        id: randomUUID(),
        admission_id: adm,
        to_bed_id: `bed-${i + 1}`,
        reason: "دخول تجريبي",
        care_level: "intensive",
        actor_id: "reception",
        created_at: at(72 + i * 15),
      });
      for (let k = 4; k >= 0; k--)
        await insert(tx, "vitals", {
          id: randomUUID(),
          admission_id: adm,
          measured_at: at(k * 4 + 0.25),
          temperature: 36.7 + (k % 3) * 0.1,
          heart_rate: 132 + i * 2 + k,
          respiratory_rate: 42 + i,
          spo2: 96 + (i % 3),
          weight: 1650 + i * 175 + k * 4,
          glucose: 82 + i,
          intake: 20 + i * 2,
          output: 12 + i,
          actor_id: "nurse",
          created_at: at(k * 4 + 0.2),
        });
      await insert(tx, "notes", {
        id: randomUUID(),
        admission_id: adm,
        text: "سجل مصطنع للتدريب على التوثيق. خطة الرعاية والقرارات الطبية يحددها المختص.",
        kind: "round",
        status: "approved",
        actor_id: "doctor",
        created_at: at(2 + i),
      });
      const order = await insert(tx, "orders", {
        id: `order-${i + 1}`,
        admission_id: adm,
        type: "procedure",
        name: "متابعة العلامات الحيوية",
        frequency: "حسب خطة المختص",
        instructions: "أمر تدريب على سير العمل فقط",
        status: "approved",
        created_by: "doctor",
        approved_by: "doctor",
        approved_at: at(12),
        scheduled_at: at(-1),
      });
      await insert(tx, "tasks", {
        id: randomUUID(),
        admission_id: adm,
        order_id: order.id,
        title: i % 2 ? "توثيق شيت المتابعة" : "مراجعة خطة التغذية",
        due_at: at(i % 3 === 0 ? 1 : -2),
        assignee_id: "nurse",
      });
      await insert(tx, "labs", {
        id: `lab-${i + 1}`,
        admission_id: adm,
        name: i % 2 ? "صورة دم كاملة" : "بيليروبين كلي",
        priority: i === 1 ? "urgent" : "routine",
        status: i < 3 ? "resulted" : i < 5 ? "received" : "ordered",
        result: i < 3 ? "نتيجة تدريبية — راجع التقرير" : null,
        unit: i % 2 ? "report" : "mg/dL",
        created_by: "doctor",
        created_at: at(3 + i),
      });
      await insert(tx, "milk", {
        id: `milk-${i + 1}`,
        admission_id: adm,
        quantity: 100,
        remaining: 70,
        received_at: at(3),
        expires_at: at(-12),
        location: "ثلاجة اللبن / الرف أ",
        actor_id: "nurse",
      });
      await insert(tx, "feedings", {
        id: randomUUID(),
        admission_id: adm,
        type: "حليب أم",
        route: "حسب الخطة المعتمدة",
        quantity: 30,
        actual_at: at(1),
        milk_id: `milk-${i + 1}`,
        notes: "سجل تدريب مصطنع",
        actor_id: "nurse",
      });
      await insert(tx, "charges", {
        id: randomUUID(),
        admission_id: adm,
        name: "رعاية حضّانة — رسوم تدريبية مسجلة",
        quantity: 3 + i,
        unit_price: 1800,
        amount: (3 + i) * 1800,
        actor_id: "accountant",
      });
      await insert(tx, "payments", {
        id: randomUUID(),
        receipt_no: `REC-DEMO-${i + 1}`,
        admission_id: adm,
        amount: 3000 + i * 500,
        method: i % 2 ? "card" : "cash",
        reference: "دفعة تدريبية",
        actor_id: "accountant",
      });
    }
    for (const [i, p] of [
      { name: "إقامة رعاية مركزة", category: "stay", price: 1800, unit: "يوم" },
      {
        name: "إقامة رعاية متوسطة",
        category: "stay",
        price: 1200,
        unit: "يوم",
      },
      { name: "صورة دم كاملة", category: "lab", price: 250, unit: "تحليل" },
      { name: "مستلزمات متابعة", category: "supply", price: 80, unit: "خدمة" },
    ].entries())
      await insert(tx, "prices", {
        id: `price-${i + 1}`,
        ...p,
        valid_from: at(240),
        created_by: "accountant",
      });
    for (const [i, item] of [
      { name: "سرنجة معقمة 5 مل", quantity: 240, min_quantity: 100, cost: 3.5 },
      { name: "قفازات فحص", quantity: 45, min_quantity: 100, cost: 2 },
      { name: "أنبوب عينة", quantity: 180, min_quantity: 50, cost: 6 },
      { name: "شاش معقم", quantity: 80, min_quantity: 30, cost: 9 },
    ].entries()) {
      const consumableId = `consumable-${i + 1}`;
      await insert(tx,"consumable_catalog",{id:consumableId,sku:`DEMO-C${i+1}`,name:item.name,unit:"قطعة"});
      await insert(tx,"prices",{id:`consumable-price-${i+1}`,name:item.name,category:"consumable",price:[6,4,12,15][i],unit:"قطعة",valid_from:at(240),created_by:"manager"});
      await insert(tx,"consumable_prices",{consumable_id:consumableId,price_id:`consumable-price-${i+1}`});
      await insert(tx, "inventory", {
        id: `item-${i + 1}`,
        consumable_id: consumableId,
        ...item,
        unit: "قطعة",
        batch: `DEMO-B${i + 1}`,
        expires_at: "2027-12-31",
        location: "مخزن الحضّانات",
      });
    }
    const records = [
      [
        "admission_requests",
        "طلب تحويل — طفل / سلمى محمود",
        "waiting",
        {
          source: "مستشفى آخر",
          equipment: "يحددها الطبيب",
          requested_at: at(1),
        },
      ],
      [
        "devices",
        "حضانة تدفئة رقم 01",
        "active",
        {
          serial: "DEMO-INC-001",
          model: "تدريب",
          location: "العناية المركزة أ",
        },
      ],
      [
        "maintenance",
        "معايرة حضانة 15",
        "open",
        { device: "حضانة 15", priority: "متوسطة", assignee: "فريق الصيانة" },
      ],
      [
        "incidents",
        "مراجعة اكتمال أساور التعريف",
        "open",
        {
          priority: "منخفضة",
          owner: "مسؤول الجودة",
          action: "مراجعة خلال النوبة",
        },
      ],
      [
        "shifts",
        "النوبة المسائية",
        "active",
        {
          start: at(1),
          end: at(-7),
          doctor: "د. أحمد الشافعي",
          nurse: "م. سارة حسن",
        },
      ],
      [
        "claims",
        "مطالبة تدريبية / جهة تعاقد أ",
        "draft",
        {
          amount: 5400,
          insurer: "جهة تعاقد أ",
          submission: "سجل يدوي — لم ترسل خارجياً",
        },
      ],
      [
        "contracts",
        "تعاقد تدريبي أ",
        "active",
        { coverage: "حسب الموافقة", copay: 20, valid_until: "2027-01-01" },
      ],
      [
        "doctor_dues",
        "استحقاق زيارات تدريبية",
        "draft",
        {
          doctor: "د. أحمد الشافعي",
          amount: 1200,
          basis: "4 زيارات × 300 جنيه",
        },
      ],
      [
        "followups",
        "مراجعة نتيجة معلقة",
        "pending",
        { owner: "د. أحمد الشافعي", due_at: at(-24) },
      ],
      [
        "alerts",
        "تشغيلة قفازات أقل من الحد الأدنى",
        "open",
        { priority: "متوسطة", owner: "مسؤول المخزون", source: "تشغيلي" },
      ],
      [
        "cleaning",
        "قائمة تجهيز حضانة 14",
        "pending",
        {
          bed: "حضانة 14",
          checklist: "تنظيف الأسطح، مراجعة الملحقات، اعتماد الجاهزية",
        },
      ],
      [
        "integrations",
        "ربط المعمل الخارجي",
        "disabled",
        { connection: "غير موصل", last_test: "لم يختبر", mode: "يدوي" },
      ],
      [
        "templates",
        "قالب تسليم النوبة",
        "active",
        {
          body: "ملخص موثق / أوامر جديدة / مهام متبقية / نتائج منتظرة / أجهزة مرتبطة",
        },
      ],
    ];
    for (const [kind, title, status, data] of records)
      await insert(tx, "records", {
        id: randomUUID(),
        kind,
        title,
        status,
        data: JSON.stringify(data),
        actor_id: "manager",
      });
    await insert(tx, "audit", {
      id: randomUUID(),
      actor_id: "admin",
      action: "seed",
      entity: "system",
      details: JSON.stringify({
        message: "تهيئة بيئة تدريب ببيانات مصطنعة منفصلة",
      }),
    });
  });
}
