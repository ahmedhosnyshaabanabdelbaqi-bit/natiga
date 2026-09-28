import { t, getLanguage, useLanguage } from "./i18n";
import { useEffect, useState } from "react";
import Attachments from "./Attachments";
import HospitalPatient from "./HospitalPatient";
import Consumables from "./Consumables";
import {
  AdmissionInsurance,
  createPaymentForm,
  paymentMethodLabel,
} from "./FinancialTools";
import Equipment from "./Equipment";
import { CheckoutStatus } from "./Checkout";
import {
  ArrowRight,
  Baby,
  BedDouble,
  CalendarDays,
  Droplets,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Plus,
  Printer,
  ShieldCheck,
  Stethoscope,
  UserRound,
  ArrowLeftRight,
  LogOut,
  Clock3,
  ClipboardList,
  Milk,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import {
  api,
  Badge,
  date,
  Empty,
  field,
  fmt,
  labels,
  FormSpec,
  money,
  nowInput,
  options,
  Row,
  Section,
  Table,
} from "./shared";
type Props = {
  userRole?: string;
  id: string;
  initialAdmissionId?: string;
  initialTab?: string;
  onContextChange?: (admissionId: string, tab: string) => void;
  revision: number;
  openForm: (s: FormSpec) => void;
  back: () => void;
  can: (p: string) => boolean;
  print: (kind: string, id?: string, recordId?: string) => void;
  users: Row[];
  beds: Row[];
  notify: (message: string, error?: boolean) => void;
  refresh: () => void;
};
const sourceLabels: Row = {
  transfer: "تحويل من جهة أخرى",
  direct: "دخول مباشر",
  birth: "الولادة",
  emergency: "الطوارئ",
};
const displayReading = (value: any) =>
  value === null || value === undefined || value === ""
    ? "—"
    : new Intl.NumberFormat(getLanguage() === "en" ? "en-GB" : "ar-EG", {
        maximumFractionDigits: 6,
      }).format(Number(value));
const tabs = [
  ["summary", "الملخص", HeartPulse],
  ["identity", "الهوية والزيارات", UserRound],
  ["hospital", "الأقسام والخدمات", HeartPulse],
  ["orders", "الأوامر والأدوية", Pill],
  ["nursing", "التمريض والمتابعة", Stethoscope],
  ["feeding", "التغذية واللبن", Milk],
  ["labs", "التحاليل والنتائج", FlaskConical],
  ["notes", "الملاحظات الطبية", FileText],
  ["attachments", "المرفقات", FileText],
  ["handover", "تسليم النوبة", ClipboardList],
  ["billing", "الحسابات", Wallet],
  ["consumables", "مستهلكات الأطفال", Pill],
  ["equipment", "استخدام الأجهزة", HeartPulse],
  ["discharge", "الخروج والمتابعة", LogOut],
] as const;
export default function Patient(props: Props) {
  return (
    <PatientWorkspace
      key={`${props.id}:${props.initialAdmissionId || ""}:${props.initialTab || "summary"}`}
      {...props}
    />
  );
}
function PatientWorkspace({
  userRole,
  id,
  initialAdmissionId,
  initialTab,
  onContextChange,
  revision,
  openForm,
  back,
  can,
  print,
  users,
  beds,
  notify,
  refresh,
}: Props) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [requestedTab, setTab] = useState(initialTab || "summary");
  const [selectedAdmission, setSelectedAdmission] = useState(
    initialAdmissionId || "",
  );
  const allowedTab = (key: string) => {
    if (key === "consumables" || key === "equipment")
      return can("consumables.read");
    if (key === "billing") return can("billing.read");
    if (key === "labs") return can("clinical.read") || can("lab.write");
    if (["summary", "identity", "hospital"].includes(key)) return true;
    if (key === "feeding" && data?.admission?.encounter_type !== "nicu") return false;
    if (key === "discharge") return can("clinical.read") || can("beds.write");
    return tabs.some(([name]) => name === key) && can("clinical.read");
  };
  const tab = allowedTab(requestedTab) ? requestedTab : "summary";
  const [printKind, setPrintKind] = useState(
    initialTab === "billing" && can("billing.read") ? "invoice" : "wristband",
  );
  const [attachmentDraft, setAttachmentDraft] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(
      "/patients/" +
        id +
        (selectedAdmission
          ? "?admission_id=" + encodeURIComponent(selectedAdmission)
          : ""),
    )
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision, selectedAdmission]);
  if (error)
    return (
      <div className="error-box">
        {error}
        <button className="button" onClick={refresh}>
          {t("إعادة المحاولة")}
        </button>
      </div>
    );
  if (
    !data ||
    data.patient?.id !== id ||
    (selectedAdmission && data.admission?.id !== selectedAdmission)
  )
    return <div className="loading">{t("جارٍ فتح الملف الطبي…")}</div>;
  const p = data.patient || {},
    a = data.admission || {},
    aid = a.id;
  const neonatal = a.encounter_type === "nicu";
  const birthDate = p.birth_at ? new Intl.DateTimeFormat(getLanguage()==='en'?'en-GB':'ar-EG',{year:'numeric',month:'short',day:'numeric',timeZone:'Africa/Cairo'}).format(new Date(p.birth_at)) : '—';
  const list = (key: string): Row[] =>
    key === "administrations"
      ? (data.orders || []).flatMap((o: Row) =>
          (o.administrations || []).map((v: Row) => ({
            ...v,
            order_name: o.name,
            actor_name: users.find((u) => u.id === v.actor_id)?.name,
          })),
        )
      : data[key] || [];
  const activeAdmission = a.status === "active",
    readClinical = can("clinical.read"),
    clinical = can("clinical.write") && activeAdmission,
    nursing = can("nursing.write") && activeAdmission,
    approve = can("clinical.approve");
  const allowLeaveAttachment = () =>
    !attachmentDraft ||
    confirm(t("يوجد ملف مرفق لم يُحفظ بعد. هل تريد مغادرة المسودة؟"));
  const form = (
    title: string,
    fields: any[],
    path: string,
    extra: Row = {},
    sensitive = false,
  ) =>
    openForm({
      title,
      subtitle: p.name + " · " + p.mrn,
      fields,
      submit: (v) => api(path, { ...v, ...extra }),
      sensitive,
    });
  const newVisit = async () => {
    try {
      const departments: Row[] = (await api('/hospital/departments')).filter((d: Row) => d.active && ['nicu','outpatient','emergency','inpatient','icu','surgery'].includes(d.type));
      openForm({title:t('فتح زيارة جديدة'),subtitle:p.name+' · '+p.mrn,fields:[
        field('department_id',t('القسم'),'text',true,{options:departments.map(d=>({value:d.id,label:d.name}))}),
        field('reason',t('سبب الزيارة'),'textarea'),
        field('doctor_id',t('الطبيب المسؤول'),'text',false,{options:users.filter(u=>u.active&&['doctor','manager'].includes(u.role)).map(u=>({value:u.id,label:u.name}))}),
        field('nurse_id',t('الممرض المسؤول'),'text',false,{options:users.filter(u=>u.active&&['nurse','head_nurse'].includes(u.role)).map(u=>({value:u.id,label:u.name}))}),
        field('bed_id',t('السرير'),'text',false,{options:beds.filter(b=>b.status==='available').map(b=>({value:b.id,label:b.name+' · '+b.room})),help:t('اختر سريرًا من نفس القسم أو اتركه فارغًا للعيادات.')})
      ],submit:async v=>{const d=departments.find(d=>d.id===v.department_id);const result=await api('/patients/'+id+'/admissions',{...v,encounter_type:d?.type==='surgery'?'inpatient':d?.type});setSelectedAdmission(result.id);setTab('summary');onContextChange?.(result.id,'summary');return result;}});
    } catch(e) { notify((e as Error).message,true); }
  };
  const addOrder = () =>
    form(
      t("إنشاء أمر طبي"),
      [
        field("type", t("نوع الأمر"), "text", true, {
          options: options(["medication", "feeding", "procedure"]),
          value: "medication",
        }),
        field("name", t("اسم الدواء / الإجراء")),
        field("dose", t("الجرعة"), "number", false, { min: 0 }),
        field("unit", t("وحدة الجرعة"), "text", false),
        field("route", t("طريقة الإعطاء"), "text", false),
        field("frequency", t("التكرار"), "text", false),
        field("reference_weight", t("الوزن المرجعي (جم)"), "number", false, {
          min: 1,
        }),
        field("scheduled_at", t("وقت الجرعة المخطط"), "datetime-local", false, {
          value: nowInput(),
        }),
        field("instructions", t("تعليمات المختص"), "textarea", false, {
          wide: true,
        }),
      ],
      "/admissions/" + aid + "/orders",
      { status: "draft" },
    );
  const amendOrder = (o: Row) =>
    openForm({
      title: t("تعديل أمر محفوظ"),
      subtitle: p.name + " · " + p.mrn + " · " + a.admission_no,
      note: t(
        "يحفظ التعديل نسخة الأمر السابقة والتنفيذ المسجل، ويعيد الأمر إلى مسودة تحتاج اعتمادًا جديدًا.",
      ),
      sensitive: true,
      fields: [
        field("name", t("اسم الأمر"), "text", true, { value: o.name }),
        field("dose", t("الجرعة"), "number", false, {
          value: o.dose ?? "",
          min: 0.0001,
        }),
        field("unit", t("الوحدة"), "text", false, { value: o.unit || "" }),
        field("route", t("الطريقة"), "text", false, { value: o.route || "" }),
        field("frequency", t("التكرار"), "text", false, {
          value: o.frequency || "",
        }),
        field("reference_weight", t("الوزن المرجعي (جم)"), "number", false, {
          value: o.reference_weight ?? "",
          min: 100,
          max: neonatal ? 10000 : 500000,
        }),
        field("scheduled_at", t("الموعد القادم"), "datetime-local", false),
        field("instructions", t("التعليمات"), "textarea", false, {
          value: o.instructions || "",
          wide: true,
        }),
        field("reason", t("سبب تعديل الأمر"), "textarea", true, { wide: true }),
      ],
      submit: (v) =>
        api(
          "/orders/" + o.id,
          {
            ...Object.fromEntries(
              Object.entries(v).filter(
                ([, value]) => value !== "" && value !== null,
              ),
            ),
            version: o.version,
          },
          "PATCH",
        ),
    });
  const transition = (o: Row, status: string) =>
    form(
      t(labelsOrder[status] || status) + t(" الأمر: ") + o.name,
      [
        field(
          "reason",
          t("السبب / الملاحظة"),
          "textarea",
          status !== "approved",
          {
            wide: true,
          },
        ),
      ],
      "/orders/" + o.id + "/transition",
      { status, version: o.version },
      true,
    );
  const administer = (o: Row) =>
    form(
      t("توثيق إعطاء الدواء"),
      [
        field(
          "patient_mrn",
          t("امسح السوار أو اكتب رقم ملف الطفل"),
          "text",
          true,
          { help: t("يجب التحقق من هوية الطفل بالسوار قبل التنفيذ.") },
        ),
        field("scheduled_at", t("وقت الجرعة المخطط"), "datetime-local", true, {
          value: o.scheduled_at
            ? new Date(
                new Date(o.scheduled_at).getTime() -
                  new Date().getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)
            : nowInput(),
        }),
        field("actual_at", t("وقت الإعطاء الفعلي"), "datetime-local", true, {
          value: nowInput(),
        }),
        field(
          "quantity",
          t("الكمية المعطاة فعليًا (صفر عند عدم الإعطاء مع السبب)"),
          "number",
          true,
          { min: 0 },
        ),
        field("unit", t("الوحدة"), "text", true, { value: o.unit }),
        field("reason", t("ملاحظات / سبب التأخير"), "textarea", false, {
          wide: true,
        }),
      ],
      "/orders/" + o.id + "/administer",
      {},
      true,
    );
  const vitals = () =>
    form(
      t("تسجيل قياسات التمريض"),
      [
        field("measured_at", t("وقت القياس الفعلي"), "datetime-local", true, {
          value: nowInput(),
        }),
        field("temperature", t("الحرارة (°C)"), "number", false, {
          min: 20,
          max: 50,
        }),
        field("heart_rate", t("النبض (نبضة / دقيقة)"), "number", false, {
          min: 1,
          max: 350,
        }),
        field("respiratory_rate", t("التنفس (نفس / دقيقة)"), "number", false, {
          min: 0,
          max: 200,
        }),
        field("spo2", t("تشبع الأكسجين (%)"), "number", false, {
          min: 0,
          max: 100,
        }),
        field("weight", t("الوزن (جم)"), "number", false, {
          min: 100,
          max: neonatal ? 15000 : 500000,
        }),
        field("systolic", t("الضغط الانقباضي (mmHg)"), "number", false, {min:0,max:350}),
        field("diastolic", t("الضغط الانبساطي (mmHg)"), "number", false, {min:0,max:250}),
        field("height_cm", t("الطول (سم)"), "number", false, {min:10,max:300}),
        field("pain_score", t("درجة الألم (0–10)"), "number", false, {min:0,max:10}),
        field("glucose", t("السكر (mg/dL)"), "number", false, { min: 0 }),
        field("bilirubin_total", t("الصفراء الكلية (mg/dL)"), "number", false, { min: 0, max: 50, step: "0.1" }),
        field("bilirubin_direct", t("الصفراء المباشرة (mg/dL)"), "number", false, { min: 0, max: 30, step: "0.1" }),
        field("bilirubin_method", t("طريقة قياس الصفراء"), "text", false, { value: "transcutaneous", options: [{ value: "transcutaneous", label: t("جهاز قياس عبر الجلد") }, { value: "serum", label: t("تحليل عينة دم") }, { value: "other", label: t("طريقة أخرى") }] }),
        field("intake", t("المدخلات (مل)"), "number", false, { min: 0 }),
        field("output", t("المخرجات (مل)"), "number", false, { min: 0 }),
        field("notes", t("ملاحظات القياس"), "textarea", false, { wide: true }),
      ],
      "/admissions/" + aid + "/vitals",
    );
  const labTransition = (l: Row, status: string) =>
    form(
      t("تحديث التحليل: ") + l.name,
      status === "resulted"
        ? [
            field("result", t("النتيجة"), "textarea", true, { wide: true }),
            field("unit", t("الوحدة"), "text", false),
            field(
              "reference_range",
              t("المجال المرجعي المعتمد"),
              "text",
              false,
            ),
            field(
              "critical",
              t("مصنفة حرجة وفق سياسة المعمل"),
              "checkbox",
              false,
            ),
          ]
        : [
            field(
              "reason",
              t("ملاحظة / سبب"),
              "textarea",
              status === "rejected",
              {
                wide: true,
              },
            ),
          ],
      "/labs/" + l.id + "/transition",
      { status, version: l.version },
      true,
    );
  const latest = list("vitals")
    .filter((v) => v.weight !== null && v.weight !== undefined)
    .sort(
      (x, y) =>
        new Date(y.measured_at).getTime() - new Date(x.measured_at).getTime(),
    )[0];
  return (
    <div className="patient-view">
      <button
        className="text-button back"
        onClick={() => {
          if (allowLeaveAttachment()) back();
        }}
      >
        <ArrowRight size={17} />
        {t("العودة إلى المرضى")}
      </button>
      <section className="identity-banner">
        <div className="baby-avatar large">
          <Baby size={35} />
        </div>
        <div className="identity-main">
          <div className="identity-title">
            <h2>{p.name}</h2>
            <Badge value={a.status || p.admission_status || "registered"} />
            {p.twin_label && (
              <Badge>
                {t("توأم")} {p.twin_label}
              </Badge>
            )}
          </div>
          <p>
            <span className="latin">{p.mrn}</span>
            <i />{" "}
            {p.sex === "female"
              ? t("أنثى")
              : p.sex === "male"
                ? t("ذكر")
                : t("غير محدد")}{" "}
            <i />
            {t("ميلاد")} {birthDate} <i />{" "}
            {readClinical && neonatal && (
              <>
                {fmt(p.gestation_weeks)} {t("أسبوع حملي")}
              </>
            )}
          </p>
          <div className="identity-tags">
            <span>
              <BedDouble size={14} />
              {a.bed_name || p.bed_name || t("لم يُسكّن")}
            </span>
            <span>
              <UserRound size={14} />
              {a.doctor_name || p.doctor_name || t("الطبيب غير محدد")}
            </span>
            {readClinical && (
              <span className="allergy">
                <ShieldCheck size={14} />
                {p.allergy_status === "none_known"
                  ? t("تم تأكيد عدم وجود حساسية معروفة")
                  : p.allergy_status === "known"
                    ? t("توجد حساسية مسجلة — راجع الملاحظات")
                    : t("الحساسية غير موثقة")}
              </span>
            )}
          </div>
        </div>
        <div className="identity-actions">
          <select
            aria-label={t("نوع المستند للطباعة")}
            value={printKind}
            onChange={(e) => setPrintKind(e.target.value)}
          >
            <option value="wristband">{t("ملصق باركود الطفل 50×30")}</option>
            {readClinical && (
              <>
                <option value="nursing">{t("شيت التمريض")}</option>
                <option value="orders">{t("الأوامر الطبية")}</option>
                <option value="handover">{t("تسليم النوبة")}</option>
                {!activeAdmission && (
                  <option value="discharge">{t("ملخص الخروج")}</option>
                )}
              </>
            )}
            {can("billing.read") && (
              <option value="invoice">{t("كشف الحساب")}</option>
            )}
          </select>
          <button
            className="button"
            onClick={() => print(printKind, aid)}
            disabled={!can("print")}
          >
            <Printer size={16} />
            {t("طباعة المستند")}
          </button>
          <small>
            {t("هوية ثابتة • إقامة")}{" "}
            {a.admission_no || a.id?.slice(0, 8) || "—"}
          </small>
        </div>
      </section>
      {!list('admissions').some(x=>x.status==='active') && can('patients.write') && <div className="button-row"><button className="button primary" onClick={newVisit}><Plus size={16}/>{t('فتح زيارة جديدة')}</button><a className="button" href="#page=appointments">{t('حجز موعد عيادة')}</a></div>}
      <div className="panel-pad">
        <label>
          {t("الإقامة المعروضة")}{" "}
          <select
            aria-label={t("اختيار الإقامة")}
            value={aid || ""}
            onChange={(e) => {
              if (!allowLeaveAttachment()) return;
              setSelectedAdmission(e.target.value);
              setPrintKind(tab === "billing" ? "invoice" : "wristband");
              onContextChange?.(e.target.value, tab);
            }}
          >
            {list("admissions").map((x) => (
              <option key={x.id} value={x.id}>
                {x.admission_no} · {date(x.admitted_at, true)} ·{" "}
                {x.status === "active" ? t("إقامة نشطة") : t("إقامة مغلقة")}
              </option>
            ))}
          </select>
        </label>
        {!activeAdmission && aid && (
          <span className="badge">
            {readClinical || can("lab.write")
              ? t("أرشيف إقامة مغلقة — النتائج المعلقة قابلة للمتابعة")
              : t("أرشيف إقامة مغلقة")}
          </span>
        )}
      </div>
      {aid && (
        <div className="button-row" aria-label={t("روابط الإقامة الحالية")}>
          {(
            [
              ["billing", "حساب الإقامة"],
              ["consumables", "مستهلكات الإقامة"],
              ["labs", "تحاليل الإقامة"],
            ] as const
          )
            .filter(([key]) => key !== tab && allowedTab(key))
            .map(([key, label]) => (
              <button
                key={key}
                className="button small"
                onClick={() => {
                  if (allowLeaveAttachment()) {
                    setTab(key);
                    onContextChange?.(aid, key);
                  }
                }}
              >
                {t(label)}
              </button>
            ))}
        </div>
      )}
      <div className="tabs">
        {tabs
          .filter(([key]) => allowedTab(key))
          .map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                if (key === tab || allowLeaveAttachment()) {
                  setTab(key);
                  onContextChange?.(aid, key);
                }
              }}
            >
              <Icon size={16} />
              {t(label)}
            </button>
          ))}
      </div>
      {tab === "hospital" && <HospitalPatient patientId={id} admissionId={aid} data={data} can={can}/>}
      {tab === "equipment" && (
        <Equipment
          can={can}
          openForm={openForm}
          notify={notify}
          revision={revision}
          refresh={refresh}
          admissionId={aid}
          patientMrn={p.mrn}
          patientName={p.name}
          admissionActive={a.status === "active"}
        />
      )}
      {tab === "identity" && aid && (
        <CheckoutStatus
          admissionId={aid}
          can={can}
          openForm={openForm}
          revision={revision}
          userRole={userRole}
          users={users}
        />
      )}
      {tab === "billing" && aid && (
        <>
          <AdmissionInsurance
            admissionId={aid}
            can={can}
            openForm={openForm}
            revision={revision}
            onSaved={refresh}
            userRole={userRole}
          />
          <CheckoutStatus
            admissionId={aid}
            can={can}
            openForm={openForm}
            revision={revision}
            userRole={userRole}
            users={users}
          />
        </>
      )}
      {tab === "summary" && readClinical && (
        <>
          <div className="patient-metrics">
            <div className="mini-metric">
              <span>{t("آخر وزن مسجّل")}</span>
              <strong>
                {latest?.weight
                  ? fmt(latest.weight)
                  : p.latest_weight
                    ? fmt(p.latest_weight)
                    : "—"}{" "}
                <small>{t("جم")}</small>
              </strong>
              <small>
                {latest
                  ? date(latest.measured_at, true)
                  : t("لا توجد قراءة متابعة مسجلة")}
              </small>
            </div>
            <div className="mini-metric">
              <span>{neonatal ? t("العمر الحملي عند الولادة") : t("نوع الزيارة")}</span>
              <strong>
                {neonatal ? <>{fmt(p.gestation_weeks)} <small>{t("أسبوع")}</small></> : labels[a.encounter_type] || "—"}
              </strong>
              <small>
                {neonatal ? <>{t("وزن الولادة")} {fmt(p.birth_weight)} {t("جم")}</> : p.department_name || a.department_name || ""}
              </small>
            </div>
            <div className="mini-metric">
              <span>{t("تاريخ الدخول")}</span>
              <strong className="small-value">
                {date(a.admitted_at, true)}
              </strong>
              <small>
                {labels[a.care_level] ||
                  a.care_level ||
                  t("مستوى الرعاية غير محدد")}
              </small>
            </div>
            <div className="mini-metric">
              <span>{t("النتائج المعلّقة")}</span>
              <strong>
                {fmt(
                  list("labs").filter(
                    (l) => !["reviewed", "rejected"].includes(l.status),
                  ).length,
                )}
              </strong>
              <small>{t("تتطلب متابعة الفريق المسؤول")}</small>
            </div>
          </div>
          <div className="two-columns">
            <Section
              title={t("ملخص الحالة")}
              sub={t("البيانات الموثقة خلال الإقامة الحالية")}
            >
              <div className="detail-list">
                <div>
                  <span>{t("سبب الدخول")}</span>
                  <strong>
                    {a.reason || p.reason || a.diagnosis || t("غير مسجل")}
                  </strong>
                </div>
                <div>
                  <span>{t("التشخيص المسجل")}</span>
                  <strong>
                    {a.diagnosis || p.diagnosis || t("لم يُسجّل تشخيص بعد")}
                  </strong>
                </div>
                <div>
                  <span>{t("مصدر التحويل")}</span>
                  <strong>
                    {t(
                      sourceLabels[a.source || p.source] ||
                        a.source ||
                        p.source ||
                        "غير مسجل",
                    )}
                  </strong>
                </div>
                <div>
                  <span>{t("التمريض المسؤول")}</span>
                  <strong>
                    {a.nurse_name || p.nurse_name || t("لم يُحدّد")}
                  </strong>
                </div>
                <div>
                  <span>{t("ولي الأمر")}</span>
                  <strong>
                    {p.guardian_name || t("غير مسجل")}{" "}
                    <small>{p.guardian_phone}</small>
                  </strong>
                </div>
              </div>
            </Section>
            <Section
              title={t("مسار الرعاية")}
              sub={t("أحدث الإجراءات والمسؤول عن كل إجراء")}
            >
              <div className="timeline">
                {list("events").length ? (
                  list("events")
                    .slice(0, 6)
                    .map((e, i) => (
                      <div key={e.id || i}>
                        <span className="timeline-dot" />
                        <strong>{e.title || e.action || e.kind}</strong>
                        <p>
                          {e.actor_name ||
                            e.created_by_name ||
                            t("مستخدم النظام")}{" "}
                          · {date(e.created_at || e.at, true)}
                        </p>
                      </div>
                    ))
                ) : (
                  <Empty text={t("لا توجد أحداث إضافية مسجلة")} />
                )}
              </div>
            </Section>
          </div>
          <Section
            title={t("الأوامر الحالية")}
            action={
              clinical && (
                <button className="button primary small" onClick={addOrder}>
                  <Plus size={16} />
                  {t("أمر جديد")}
                </button>
              )
            }
          >
            <Table
              headers={[
                t("الأمر"),
                t("التعليمات"),
                t("الحالة"),
                t("تاريخ التسجيل"),
              ]}
              rows={list("orders")
                .slice(0, 5)
                .map((o) => [
                  o.name,
                  o.instructions || "—",
                  <Badge value={o.status} />,
                  date(o.created_at, true),
                ])}
            />
          </Section>
        </>
      )}
      {tab === "summary" && !readClinical && (
        <Section
          title={t("بيانات الإقامة")}
          sub={t("تُعرض البيانات المناسبة لصلاحيات حسابك")}
        >
          <div className="detail-grid">
            {[
              [t("رقم الملف"), p.mrn],
              [t("رقم الإقامة"), a.admission_no],
              [t("تاريخ الدخول"), date(a.admitted_at, true)],
              [t("السرير"), p.bed_name],
              [t("ولي الأمر"), p.guardian_name],
              [t("هاتف التواصل"), p.guardian_phone],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v || t("غير مسجل")}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}
      {tab === "identity" && (
        <Section
          title={neonatal ? t("الهوية وبيانات الولادة") : t("الهوية وبيانات المريض")}
          sub={t("تعديل الاسم يحافظ على رقم الملف الثابت")}
          action={
            can("patients.write") && (
              <button
                className="button"
                onClick={() =>
                  openForm({
                    title: t("تعديل بيانات الطفل"),
                    subtitle: p.mrn,
                    initial: p,
                    fields: [
                      field("name", t("اسم الطفل")),
                      field("mother_name", t("اسم الأم"), "text", false),
                      field("national_id", t("الرقم القومي / الهوية"), "text", false),
                      field("phone", t("هاتف المريض"), "tel", false),
                      field("mother_national_id", t("الرقم القومي للأم"), "text", false),
                      field("birth_certificate_no", t("رقم شهادة الميلاد"), "text", false),
                      field("blood_group", t("فصيلة الدم"), "text", false, {
                        options: options(["blood_unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
                      }),
                      field("delivery_type", t("نوع الولادة"), "text", false, {
                        options: options(["delivery_unknown", "delivery_normal", "delivery_cesarean", "delivery_assisted"]),
                      }),
                      field("birth_place", t("مكان الولادة"), "text", false),
                      field("guardian_name", t("اسم ولي الأمر"), "text", false),
                      field("guardian_relation", t("صلة ولي الأمر"), "text", false),
                      field("guardian_national_id", t("الرقم القومي لولي الأمر"), "text", false),
                      field(
                        "guardian_phone",
                        t("هاتف ولي الأمر"),
                        "tel",
                        false,
                      ),
                      field("emergency_phone", t("هاتف بديل للطوارئ"), "tel", false),
                      field("address", t("العنوان"), "textarea", false, { wide: true }),
                      ...(can("clinical.write")
                        ? [
                            field(
                              "allergy_status",
                              t("حالة توثيق الحساسية"),
                              "text",
                              true,
                              {
                                options: options([
                                  "unknown",
                                  "none_known",
                                  "known",
                                ]),
                              },
                            ),
                          ]
                        : []),
                    ],
                    submit: (v) =>
                      api(
                        "/patients/" + id,
                        { ...v, version: p.version },
                        "PATCH",
                      ),
                  })
                }
              >
                {t("تعديل البيانات")}
              </button>
            )
          }
        >
          <div className="detail-grid">
            {[
              [t("رقم الملف"), p.mrn],
              [t("الاسم"), p.name],
              [t("الرقم القومي / الهوية"), p.national_id],
              [t("هاتف المريض"), p.phone],
              [t("اسم الأم"), p.mother_name],
              [t("الرقم القومي للأم"), p.mother_national_id],
              [t("رقم شهادة الميلاد"), p.birth_certificate_no],
              [t("فصيلة الدم"), labels[p.blood_group] || p.blood_group],
              [t("نوع الولادة"), labels[p.delivery_type] || p.delivery_type],
              [t("مكان الولادة"), p.birth_place],
              [t("ولي الأمر"), p.guardian_name],
              [t("صلة ولي الأمر"), p.guardian_relation],
              [t("الرقم القومي لولي الأمر"), p.guardian_national_id],
              [t("الهاتف"), p.guardian_phone],
              [t("هاتف بديل للطوارئ"), p.emergency_phone],
              [t("العنوان"), p.address],
              [t("تمييز التوائم"), p.twin_label],
              [t("تاريخ الميلاد"), birthDate],
              ...(readClinical
                ? [[t("وزن الولادة"), fmt(p.birth_weight) + t(" جم")]]
                : []),
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v || t("غير مسجل")}</strong>
              </div>
            ))}
          </div>
          <h4 className="inset-title">{t("الإقامات السابقة والحالية")}</h4>
          <Table
            headers={[t("الإقامة"), t("الدخول"), t("الخروج"), t("الحالة")]}
            rows={list("admissions").map((x) => [
              x.admission_no,
              date(x.admitted_at, true),
              date(x.discharged_at, true),
              <Badge value={x.status} />,
            ])}
          />
        </Section>
      )}
      {tab === "orders" && (
        <Section
          title={t("الأوامر الطبية وتنفيذ الأدوية")}
          sub={t("الوصف والاعتماد والتنفيذ إجراءات مستقلة موثقة")}
          action={
            clinical && (
              <button className="button primary small" onClick={addOrder}>
                <Plus size={16} />
                {t("أمر طبي")}
              </button>
            )
          }
        >
          <Table
            headers={[
              t("الأمر والجرعة"),
              t("الطريقة والتكرار"),
              t("الحالة"),
              t("الإجراءات"),
            ]}
            rows={list("orders").map((o) => [
              <div>
                <strong>{o.name}</strong>
                <small>
                  {o.dose || "—"} {o.unit} {t("· الوزن المرجعي")}{" "}
                  {o.reference_weight || "—"} {t("جم")}
                </small>
              </div>,
              <div>
                {o.route || "—"}
                <small>{o.frequency || "—"}</small>
              </div>,
              <Badge value={o.status} />,
              <div className="row-actions">
                {clinical &&
                  ["draft", "approved", "suspended"].includes(o.status) && (
                    <button
                      className="button tiny"
                      onClick={() => amendOrder(o)}
                    >
                      {t("تعديل موثق")}
                    </button>
                  )}
                {activeAdmission && o.status === "draft" && approve && (
                  <button
                    className="button tiny primary"
                    onClick={() => transition(o, "approved")}
                  >
                    {t("اعتماد")}
                  </button>
                )}
                {o.status === "approved" && nursing && (
                  <button
                    className="button tiny primary"
                    onClick={() => administer(o)}
                  >
                    {t("توثيق الإعطاء")}
                  </button>
                )}
                {activeAdmission && o.status === "approved" && approve && (
                  <>
                    <button
                      className="button tiny"
                      onClick={() => transition(o, "suspended")}
                    >
                      {t("تعليق")}
                    </button>
                    <button
                      className="button tiny danger"
                      onClick={() => transition(o, "stopped")}
                    >
                      {t("إيقاف")}
                    </button>
                  </>
                )}
                {activeAdmission && o.status === "suspended" && approve && (
                  <button
                    className="button tiny"
                    onClick={() => transition(o, "approved")}
                  >
                    {t("استئناف")}
                  </button>
                )}
                {o.status === "draft" && clinical && (
                  <button
                    className="button tiny danger"
                    onClick={() => transition(o, "cancelled")}
                  >
                    {t("إلغاء")}
                  </button>
                )}
              </div>,
            ])}
          />
          {list("administrations").length > 0 && (
            <>
              <h4 className="inset-title">{t("سجل الجرعات المعطاة")}</h4>
              <Table
                headers={[
                  t("الأمر"),
                  t("الكمية"),
                  t("الموعد"),
                  t("وقت التنفيذ"),
                  t("المنفذ"),
                ]}
                rows={list("administrations").map((x) => [
                  x.order_name || x.name,
                  x.quantity + " " + x.unit,
                  date(x.scheduled_at, true),
                  date(x.actual_at, true),
                  x.actor_name ||
                    x.created_by_name ||
                    users.find((user) => user.id === x.actor_id)?.name ||
                    x.actor_id ||
                    "—",
                ])}
              />
            </>
          )}
        </Section>
      )}
      {tab === "nursing" && (
        <>
          <Section
            title={t("شيت المتابعة والقياسات")}
            sub={t("القياسات بوحداتها • وقت القياس مستقل عن وقت التسجيل")}
            action={
              nursing && (
                <button className="button primary small" onClick={vitals}>
                  <Plus size={16} />
                  {t("تسجيل قياسات")}
                </button>
              )
            }
          >
            <Table
              headers={[
                t("وقت القياس"),
                t("الحرارة °C"),
                t("النبض /د"),
                t("التنفس /د"),
                "SpO₂ %",
                t("الوزن جم"),
                t("السكر mg/dL"),
                t("ضغط الدم"),
                t("الطول / الألم"),
                t("الصفراء كلي / مباشر"),
                t("طريقة القياس"),
                t("مدخلات / مخرجات مل"),
              ]}
              rows={list("vitals").map((v) => [
                date(v.measured_at, true),
                displayReading(v.temperature),
                displayReading(v.heart_rate),
                displayReading(v.respiratory_rate),
                displayReading(v.spo2),
                displayReading(v.weight),
                displayReading(v.glucose),
                displayReading(v.systolic) + " / " + displayReading(v.diastolic),
                displayReading(v.height_cm) + " / " + displayReading(v.pain_score),
                displayReading(v.bilirubin_total) + " / " + displayReading(v.bilirubin_direct),
                t(v.bilirubin_method || "غير مسجل"),
                displayReading(v.intake) + " / " + displayReading(v.output),
              ])}
            />
          </Section>
          <Section
            title={t("مهام الرعاية")}
            action={
              nursing && (
                <button
                  className="button small"
                  onClick={() =>
                    form(
                      t("إضافة مهمة"),
                      [
                        field("title", t("المهمة")),
                        field(
                          "due_at",
                          t("موعد الاستحقاق"),
                          "datetime-local",
                          true,
                          { value: nowInput() },
                        ),
                        field("assignee_id", t("المسؤول"), "text", false, {
                          options: users.map((u) => ({
                            value: u.id,
                            label: u.name,
                          })),
                        }),
                      ],
                      "/tasks",
                      { admission_id: aid },
                    )
                  }
                >
                  <Plus size={16} />
                  {t("مهمة")}
                </button>
              )
            }
          >
            <Table
              headers={[t("المهمة"), t("الموعد"), t("الحالة"), t("الإجراء")]}
              rows={list("tasks").map((task) => [
                task.title,
                date(task.due_at, true),
                <Badge value={task.status} />,
                ["pending", "deferred"].includes(task.status) && task.order_id ? (
                  <button className="button tiny" onClick={() => {
                    setTab("orders");
                    onContextChange?.(aid, "orders");
                  }}>
                    {getLanguage() === "en" ? "Document administration" : "توثيق تنفيذ الأمر"}
                  </button>
                ) : ["pending", "deferred"].includes(task.status) && nursing ? (
                  <button
                    className="button tiny"
                    onClick={() =>
                      openForm({
                        title: t("إتمام المهمة"),
                        fields: [
                          field(
                            "reason",
                            t("ملاحظة التنفيذ"),
                            "textarea",
                            false,
                          ),
                        ],
                        submit: (v) =>
                          api(
                            "/tasks/" + task.id,
                            {
                              ...v,
                              status: "completed",
                              version: task.version,
                            },
                            "PATCH",
                          ),
                      })
                    }
                  >
                    {t("تم التنفيذ")}
                  </button>
                ) : (
                  "—"
                ),
              ])}
            />
          </Section>
        </>
      )}
      {tab === "feeding" && (
        <>
          <Section
            title={t("التغذية الفعلية")}
            sub={t("هوية الطفل مطلوبة عند توثيق كل تغذية")}
            action={
              nursing && (
                <button
                  className="button primary small"
                  onClick={() =>
                    form(
                      t("توثيق التغذية"),
                      [
                        field("patient_mrn", t("رقم الملف من السوار")),
                        field("type", t("نوع التغذية"), "text", true, {
                          options: options(["breast_milk", "formula"]),
                          value: "breast_milk",
                        }),
                        field("route", t("الطريقة"), "text", true, {
                          options: options(["oral", "tube"]),
                          value: "oral",
                        }),
                        field(
                          "quantity",
                          t("الكمية المعطاة (مل)"),
                          "number",
                          true,
                          { min: 0.1 },
                        ),
                        field(
                          "actual_at",
                          t("وقت الإعطاء"),
                          "datetime-local",
                          true,
                          { value: nowInput() },
                        ),
                        field("milk_id", t("عبوة لبن الأم"), "text", false, {
                          options: list("milk").map((m) => ({
                            value: m.id,
                            label:
                              (m.code || m.id.slice(0, 8)) +
                              " · " +
                              (m.remaining ?? m.quantity) +
                              t(" مل"),
                          })),
                        }),
                        field("notes", t("الملاحظات"), "textarea", false, {
                          wide: true,
                        }),
                      ],
                      "/admissions/" + aid + "/feedings",
                      {},
                      true,
                    )
                  }
                >
                  <Plus size={16} />
                  {t("توثيق تغذية")}
                </button>
              )
            }
          >
            <Table
              headers={[
                t("الوقت"),
                t("النوع"),
                t("الطريقة"),
                t("الكمية (مل)"),
                t("الملاحظات"),
              ]}
              rows={list("feedings").map((f) => [
                date(f.actual_at, true),
                <Badge value={f.type} />,
                labels[f.route] || f.route,
                fmt(f.quantity),
                f.notes || "—",
              ])}
            />
            <div className="panel-foot">
              {t("إجمالي التغذية الموثقة في هذه الإقامة:")}{" "}
              <strong>
                {fmt(
                  list("feedings").reduce((s, f) => s + Number(f.quantity), 0),
                )}{" "}
                {t("مل")}
              </strong>
            </div>
          </Section>
          <Section
            title={t("عبوات لبن الأم")}
            sub={t("لكل عبوة هوية مستقلة وصلاحية ومكان تخزين")}
            action={
              nursing && (
                <button
                  className="button small"
                  onClick={() =>
                    form(
                      t("استلام عبوة لبن الأم"),
                      [
                        field("quantity", t("الكمية (مل)"), "number", true, {
                          min: 0.1,
                        }),
                        field(
                          "received_at",
                          t("وقت الاستلام / التحضير"),
                          "datetime-local",
                          true,
                          { value: nowInput() },
                        ),
                        field(
                          "expires_at",
                          t("الصلاحية وفق سياسة القسم"),
                          "datetime-local",
                        ),
                        field("location", t("مكان التخزين")),
                      ],
                      "/admissions/" + aid + "/milk",
                    )
                  }
                >
                  <Plus size={16} />
                  {t("استلام عبوة")}
                </button>
              )
            }
          >
            <Table
              headers={[
                t("معرف العبوة"),
                t("المتبقي مل"),
                t("الاستلام"),
                t("الصلاحية"),
                t("التخزين"),
                t("طباعة"),
              ]}
              rows={list("milk").map((m) => [
                m.code || m.id,
                fmt(m.remaining ?? m.quantity),
                date(m.received_at, true),
                date(m.expires_at, true),
                m.location,
                <button
                  className="button tiny"
                  disabled={!can("print")}
                  onClick={() => print("milk", aid, m.id)}
                >
                  <Printer size={14} />
                  {t("ملصق")}
                </button>,
              ])}
            />
          </Section>
        </>
      )}
      {tab === "labs" && (
        <Section
          title={t("طلبات التحاليل والنتائج")}
          sub={t("تظل النتائج المعلقة قابلة للمتابعة بعد الخروج")}
          action={
            clinical && (
              <button
                className="button primary small"
                onClick={() =>
                  form(
                    t("طلب تحليل / أشعة"),
                    [
                      field("name", t("اسم الفحص")),
                      field("priority", t("الأولوية"), "text", true, {
                        options: options(["routine", "urgent"]),
                        value: "routine",
                      }),
                    ],
                    "/admissions/" + aid + "/labs",
                  )
                }
              >
                <Plus size={16} />
                {t("طلب فحص")}
              </button>
            )
          }
        >
          <Table
            headers={[
              t("الفحص"),
              t("الأولوية"),
              t("الحالة"),
              t("النتيجة"),
              t("الإجراءات"),
            ]}
            rows={list("labs").map((l) => [
              <div>
                <strong>{l.name}</strong>
                <small>{date(l.created_at, true)}</small>
              </div>,
              <Badge value={l.priority} />,
              <Badge value={l.status} />,
              <div>
                {l.result || t("لم تصدر")} {l.unit}
                <small>
                  {l.reference_range}
                  {l.critical ? t(" · نتيجة حرجة") : ""}
                </small>
              </div>,
              <div className="row-actions">
                {can("lab.write") &&
                  ["pending", "ordered", "requested"].includes(l.status) && (
                    <button
                      className="button tiny"
                      onClick={() => labTransition(l, "collected")}
                    >
                      {t("جمع العينة")}
                    </button>
                  )}
                {can("lab.write") && l.status === "collected" && (
                  <button
                    className="button tiny"
                    onClick={() => labTransition(l, "received")}
                  >
                    {t("استلام العينة")}
                  </button>
                )}
                {can("lab.write") && l.status === "received" && (
                  <>
                    <button
                      className="button tiny primary"
                      onClick={() => labTransition(l, "resulted")}
                    >
                      {t("إدخال نتيجة")}
                    </button>
                    <button
                      className="button tiny danger"
                      onClick={() => labTransition(l, "rejected")}
                    >
                      {t("رفض")}
                    </button>
                  </>
                )}
                {approve && l.status === "resulted" && (
                  <button
                    className="button tiny primary"
                    onClick={() => labTransition(l, "reviewed")}
                  >
                    {t("تأكيد المراجعة")}
                  </button>
                )}
                {can("print") && (
                  <button
                    className="icon-button small"
                    aria-label={t("طباعة ملصق العينة")}
                    onClick={() => print("sample", aid, l.id)}
                  >
                    <Printer size={15} />
                  </button>
                )}
              </div>,
            ])}
          />
        </Section>
      )}
      {tab === "attachments" && readClinical && (
        <Attachments
          key={aid}
          admissionId={aid}
          admissionNo={a.admission_no}
          canUpload={can("clinical.write")}
          onDraftChange={setAttachmentDraft}
          users={users as { id: string; name: string }[]}
        />
      )}
      {tab === "notes" && (
        <Section
          title={t("الملاحظات والجولات الطبية")}
          sub={t("الملاحظات المعتمدة لا تُستبدل؛ التصحيح بإضافة موثقة")}
          action={
            clinical && (
              <button
                className="button primary small"
                onClick={() =>
                  form(
                    t("إضافة ملاحظة موثقة"),
                    [
                      field("kind", t("نوع الملاحظة"), "text", true, {
                        options: options([
                          "جولة طبية",
                          "تاريخ مرضي",
                          "تشخيص",
                          "حساسية",
                          "إجراء",
                          "تصحيح موثق",
                          "مرفقات — مرجع مستند",
                        ]),
                        value: "جولة طبية",
                      }),
                      field("status", t("الحالة"), "text", true, {
                        options: options(
                          approve ? ["draft", "approved"] : ["draft"],
                        ),
                        value: "draft",
                      }),
                      field("text", t("النص"), "textarea", true, {
                        wide: true,
                      }),
                    ],
                    "/admissions/" + aid + "/notes",
                  )
                }
              >
                <Plus size={16} />
                {t("ملاحظة")}
              </button>
            )
          }
        >
          <div className="note-list">
            {list("notes").length ? (
              list("notes").map((n) => (
                <article key={n.id}>
                  <div>
                    <strong>
                      {t(n.kind === "round" ? "جولة طبية" : n.kind)}
                    </strong>
                    <Badge value={n.status} />
                  </div>
                  <p>{n.text}</p>
                  <small>
                    {n.author_name ||
                      n.created_by_name ||
                      users.find((user) => user.id === n.actor_id)?.name ||
                      t("مستخدم النظام")}{" "}
                    · {date(n.created_at, true)}
                  </small>
                </article>
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Section>
      )}
      {tab === "handover" && (
        <Section
          title={t("تسليم واستلام النوبات")}
          sub={t("تسجيل المسلم والمستلم وتأكيد الاستلام بشكل مستقل")}
          action={
            nursing && (
              <button
                className="button primary small"
                onClick={() =>
                  form(
                    t("تسليم نوبة"),
                    [
                      field(
                        "summary",
                        t("ملخص الحالة والأجهزة والملاحظات"),
                        "textarea",
                        true,
                        { wide: true },
                      ),
                      field(
                        "pending",
                        t("المهام والنتائج المنتظرة"),
                        "textarea",
                        true,
                        { wide: true },
                      ),
                      field("receiver_id", t("المستلم"), "text", true, {
                        options: users.map((u) => ({
                          value: u.id,
                          label: u.name,
                        })),
                      }),
                    ],
                    "/admissions/" + aid + "/handovers",
                  )
                }
              >
                <Plus size={16} />
                {t("تسليم نوبة")}
              </button>
            )
          }
        >
          <div className="note-list">
            {list("handovers").length ? (
              list("handovers").map((h) => (
                <article key={h.id}>
                  <div>
                    <strong>
                      {h.sender_name ||
                        h.created_by_name ||
                        users.find((user) => user.id === h.sender_id)?.name ||
                        t("تسليم موثق")}{" "}
                      ←{" "}
                      {h.receiver_name ||
                        users.find((user) => user.id === h.receiver_id)?.name ||
                        t("المستلم المعين")}
                    </strong>
                    <Badge
                      value={h.acknowledged_at ? "acknowledged" : "pending"}
                    />
                  </div>
                  <p>{h.summary}</p>
                  <p>
                    <b>{t("المتبقي:")}</b>
                    {h.pending}
                  </p>
                  <small>{date(h.created_at, true)}</small>
                  {!h.acknowledged_at && nursing && (
                    <button
                      className="button small"
                      onClick={async () => {
                        if (!confirm(t("تأكيد استلام مسؤولية هذه النوبة؟")))
                          return;
                        try {
                          await api("/handovers/" + h.id + "/acknowledge", {});
                          notify(t("تم تأكيد استلام النوبة"));
                          refresh();
                        } catch (e) {
                          notify((e as Error).message, true);
                        }
                      }}
                    >
                      {t("تأكيد الاستلام")}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Section>
      )}
      {tab === "consumables" && can("consumables.read") && (
        <Consumables
          can={can}
          openForm={openForm}
          notify={notify}
          revision={revision}
          refresh={refresh}
          admissionId={aid}
          patientMrn={p.mrn}
          patientName={p.name}
        />
      )}
      {tab === "billing" && can("billing.read") && (
        <>
          <div className="button-row">
            <button
              className="button small"
              disabled={!aid || !can("print")}
              onClick={() => print("invoice", aid)}
            >
              <Printer size={16} />
              {t("طباعة حساب هذه الإقامة")}
            </button>
          </div>
          <div className="patient-metrics three">
            <div className="mini-metric">
              <span>{t("قيمة الخدمات")}</span>
              <strong>{money(data.billing?.totals?.charged)}</strong>
            </div>
            <div className="mini-metric">
              <span>{t("المحصّل")}</span>
              <strong>{money(data.billing?.totals?.paid)}</strong>
            </div>
            <div className="mini-metric">
              <span>{t("الرصيد المستحق")}</span>
              <strong>{money(data.billing?.totals?.balance)}</strong>
            </div>
          </div>
          <Section
            title={t("بنود الخدمات")}
            action={
              can("billing.write") && (
                <button
                  className="button small"
                  onClick={async () => {
                    try {
                      const prices = await api("/prices");
                      form(
                        t("إضافة خدمة مقدّمة فعليًا"),
                        [
                          field("price_id", t("الخدمة والسعر"), "text", true, {
                            options: prices
                              .filter((x: Row) => !x.consumable_id)
                              .map((x: Row) => ({
                                value: x.id,
                                label: x.name + " — " + money(x.price),
                              })),
                          }),
                          field("quantity", t("الكمية"), "number", true, {
                            value: 1,
                            min: 0.01,
                          }),
                        ],
                        "/admissions/" + aid + "/charges",
                      );
                    } catch (e) {
                      notify((e as Error).message, true);
                    }
                  }}
                >
                  <Plus size={16} />
                  {t("تسجيل خدمة")}
                </button>
              )
            }
          >
            <Table
              headers={[
                t("الخدمة"),
                t("الكمية"),
                t("السعر المحفوظ"),
                t("الإجمالي"),
                t("التاريخ"),
              ]}
              rows={(data.billing?.charges || []).map((c: Row) => [
                c.name || c.description || c.service_name,
                c.quantity,
                money(c.unit_price),
                money(c.total || c.amount),
                date(c.created_at, true),
              ])}
            />
          </Section>
          <Section
            title={t("المدفوعات والإيصالات")}
            action={
              can("billing.write") && (
                <button
                  className="button primary small"
                  onClick={() =>
                    void createPaymentForm(
                      { ...a, id: aid, patient_name: p.name },
                      openForm,
                      refresh,
                    ).catch((e) => notify(e.message, true))
                  }
                >
                  <Plus size={16} />
                  {t("تسجيل دفعة")}
                </button>
              )
            }
          >
            <Table
              headers={[
                t("رقم الإيصال"),
                t("المبلغ"),
                t("الطريقة"),
                t("التاريخ"),
                t("الإجراءات"),
              ]}
              rows={(data.billing?.payments || []).map((pmt: Row) => [
                pmt.receipt_no || pmt.reference || pmt.id.slice(0, 8),
                money(pmt.amount),
                paymentMethodLabel(pmt.method),
                date(pmt.created_at, true),
                <div className="row-actions">
                  <button
                    className="button tiny"
                    disabled={!can("print")}
                    onClick={() => print("receipt", aid, pmt.id)}
                  >
                    <Printer size={14} />
                    {t("إيصال")}
                  </button>
                  {can("billing.write") && Number(pmt.amount) > 0 && (
                    <button
                      className="button tiny danger"
                      onClick={() =>
                        form(
                          t("استرداد موثق"),
                          [
                            field(
                              "amount",
                              t("المبلغ المسترد (ج.م)"),
                              "number",
                              true,
                              { min: 0.01, max: Number(pmt.amount) },
                            ),
                            field("reason", t("سبب الاسترداد"), "textarea"),
                          ],
                          "/payments/" + pmt.id + "/refund",
                          {},
                          true,
                        )
                      }
                    >
                      {t("استرداد")}
                    </button>
                  )}
                </div>,
              ])}
            />
          </Section>
        </>
      )}
      {tab === "discharge" && (
        <>
          <CheckoutStatus
            admissionId={aid}
            can={can}
            openForm={openForm}
            revision={revision}
            userRole={userRole}
            users={users}
          />
          <Section
            title={t("الخروج والتحويل")}
            sub={
              getLanguage() === "en"
                ? "Reception request, then financial checkout by Accounts"
                : "طلب خروج من الاستقبال ثم إنهاء الإقامة من الحسابات"
            }
          >
            <div className="panel-pad">
              <div className="info-box">
                <ShieldCheck size={20} />
                {getLanguage() === "en"
                  ? "Reception can request checkout without medical clearance. Accounts completes it after settlement; the bed then moves to cleaning."
                  : "الاستقبال يستطيع طلب الخروج دون اعتماد الطبيب. الحسابات تنهي الإقامة بعد التسوية، ثم تنتقل الحضّانة للتنظيف."}
              </div>
              <div className="button-row">
                {can("beds.write") && a.status !== "discharged" && (
                  <button
                    className="button"
                    onClick={() =>
                      form(
                        t("نقل الطفل إلى سرير آخر"),
                        [
                          field("bed_id", t("السرير المتاح"), "text", true, {
                            options: beds
                              .filter((b) => b.status === "available")
                              .map((b) => ({
                                value: b.id,
                                label: b.name + " · " + b.room,
                              })),
                          }),
                          field("reason", t("سبب النقل"), "textarea"),
                        ],
                        "/admissions/" + aid + "/transfer",
                        { version: a.version },
                        true,
                      )
                    }
                  >
                    <ArrowLeftRight size={17} />
                    {t("نقل السرير")}
                  </button>
                )}
                {approve && a.status !== "discharged" && (
                  <button
                    className="button primary"
                    onClick={() =>
                      form(
                        t("اعتماد الخروج الطبي"),
                        [
                          field(
                            "discharge_type",
                            t("نوع الخروج"),
                            "text",
                            true,
                            {
                              options: options([
                                "routine",
                                "transfer",
                                "against_advice",
                                "death",
                              ]),
                              value: "routine",
                            },
                          ),
                          field(
                            "summary",
                            t(
                              "ملخص الإقامة وتعليمات الطبيب وخطة متابعة النتائج",
                            ),
                            "textarea",
                            true,
                            { wide: true },
                          ),
                          field(
                            "recipient",
                            t("اسم مستلم الطفل بعد التحقق من الهوية"),
                          ),
                          field(
                            "followup_at",
                            t("موعد المتابعة"),
                            "datetime-local",
                            false,
                          ),
                          field(
                            "verified",
                            t(
                              "تم التحقق من المستلم وتسليم التعليمات والمتعلقات",
                            ),
                            "checkbox",
                            true,
                          ),
                        ],
                        "/admissions/" + aid + "/discharge",
                        { version: a.version },
                        true,
                      )
                    }
                  >
                    <CheckCircle2 size={17} />
                    {t("اعتماد الخروج")}
                  </button>
                )}
                <button
                  className="button"
                  disabled={!can("print") || !readClinical || activeAdmission}
                  onClick={() => print("discharge", aid)}
                >
                  <Printer size={17} />
                  {t("ملخص الخروج")}
                </button>
              </div>
              {a.summary && (
                <article className="discharge-summary">
                  <h4>{t("ملخص الخروج المعتمد")}</h4>
                  <p>{a.summary}</p>
                  <small>{date(a.discharged_at, true)}</small>
                </article>
              )}
            </div>
          </Section>
          <Section
            title={t("حركة الأسرة")}
            sub={t("تاريخ النقل محفوظ مع السبب والمنفذ")}
          >
            <Table
              headers={[t("من"), t("إلى"), t("السبب"), t("التوقيت")]}
              rows={list("movements").map((m) => [
                m.from_bed_name || m.from_bed_id || t("دخول"),
                m.to_bed_name || m.to_bed_id || t("خروج"),
                m.reason,
                date(m.created_at || m.moved_at, true),
              ])}
            />
          </Section>
        </>
      )}
    </div>
  );
}
const labelsOrder: Row = {
  approved: "اعتماد",
  suspended: "تعليق",
  stopped: "إيقاف",
  cancelled: "إلغاء",
};
