import { useEffect, useState } from "react";
import {
  Clock3,
  Users,
  Wallet,
  Plus,
  RefreshCw,
  Fingerprint,
  FileUp,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import {
  api,
  Badge,
  date,
  field,
  fmt,
  FormSpec,
  nowInput,
  Row,
  Section,
  Table,
  uid,
} from "./shared";
import { useLanguage, t } from "./i18n";
import "./attendance.css";
type Props = {
  can: (p: string) => boolean;
  openForm: (s: FormSpec) => void;
  notify: (text: string, error?: boolean) => void;
  revision: number;
  refresh: () => void;
};
export default function Attendance({
  can,
  openForm,
  notify,
  revision,
  refresh,
}: Props) {
  const language = useLanguage(),
    tr = (ar: string, en: string) => (language === "en" ? en : ar);
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("logs"),
    [period, setPeriod] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState(""),
    [secretDevice, setSecretDevice] = useState(""),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [users, setUsers] = useState<Row[]>([]),
    [employeeFilter, setEmployeeFilter] = useState("");
  const whole = can("attendance.read"),
    write = can("attendance.write"),
    payroll = can("payroll.read"),
    manageDevices = can("attendance.devices");
  const salaryMoney = (value: any) =>
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? "—"
      : new Intl.NumberFormat(language === "en" ? "en-GB" : "ar-EG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Number(value)) + (language === "en" ? " EGP" : " ج.م");
  const whatsappUrl=(value:any)=>{let digits=String(value||'').replace(/\D/g,'');if(digits.startsWith('0'))digits='20'+digits.slice(1);const message=tr('مرحبًا، بخصوص مراجعة تفاصيل راتبك وطريقة التحويل.','Hello, regarding confirmation of your salary details and transfer method.');return digits?`https://wa.me/${digits}?text=${encodeURIComponent(message)}`:''};
  useEffect(() => {
    let active = true;
    api("/attendance")
      .then((r) => {
        if (active) {
          setData(r);
          setPeriod((current) =>
            current
              ? (r.periods || []).find((p: Row) => p.id === current.id) || null
              : null,
          );
          setError("");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [revision, language, whole, payroll, write]);
  useEffect(() => {
    if (!payroll) {
      setPeriod(null);
      setTab((current) => (current === "payroll" ? "logs" : current));
    }
    if (!manageDevices) {
      setSecret("");
      setSecretDevice("");
      setTab((current) => (current === "devices" ? "logs" : current));
    }
  }, [payroll, manageDevices]);
  useEffect(() => {
    if (tab !== "devices") {
      setSecret("");
      setSecretDevice("");
    }
  }, [tab]);
  useEffect(() => {
    if (write)
      api("/users")
        .then(setUsers)
        .catch(() => {});
  }, [write]);
  const action = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <div className={error ? "error-box" : "loading"}>
        {error || tr("جارٍ تحميل الحضور…", "Loading attendance…")}{" "}
        {error && (
          <button className="button" onClick={refresh}>
            {tr("إعادة المحاولة", "Retry")}
          </button>
        )}
      </div>
    );
  const employees: Row[] = data.employees || [],
    devices: Row[] = data.devices || [],
    shifts: Row[] = data.shifts || [],
    punches: Row[] = data.punches || [],
    handovers: Row[] = data.handovers || [];
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.name + " · " + e.employee_no,
  }));
  const editEmployee = (e?: Row) =>
    openForm({
      title: e
        ? tr("تعديل موظف", "Edit employee")
        : tr("إضافة موظف", "Add employee"),
      initial: e,
      fields: [
        ...(write
          ? [
              field("name", tr("اسم الموظف", "Employee name")),
              field("employee_no", tr("الرقم الوظيفي", "Employee number")),
              field(
                "device_pin",
                tr("رقم المستخدم على جهاز ZK", "ZK user PIN"),
              ),
              field("job_type", tr("نوع الموظف", "Employee type"), "text", true, {
                value: e?.job_type || "other",
                options: [
                  ["doctor", tr("طبيب", "Doctor")],
                  ["nurse", tr("تمريض", "Nurse")],
                  ["reception", tr("استقبال", "Reception")],
                  ["accountant", tr("حسابات", "Accounts")],
                  ["purchasing", tr("مشتريات", "Purchasing")],
                  ["technician", tr("فني", "Technician")],
                  ["worker", tr("عامل", "Worker")],
                  ["administration", tr("إداري", "Administration")],
                  ["other", tr("أخرى", "Other")],
                ].map(([value, label]) => ({ value, label })),
              }),
              field("job_title", tr("المسمى الوظيفي", "Job title")),
              field("department", tr("القسم", "Department"), "text", true, {
                value: e?.department || tr("حضّانات حديثي الولادة", "Neonatal intensive care"),
              }),
              field("phone", tr("رقم الهاتف", "Phone"), "tel"),
              field("whatsapp_phone", tr("رقم واتساب الموظف", "Employee WhatsApp number"), "tel", false, {help:tr("بالضغط عليه من ملف الموظف يفتح محادثة واتساب مباشرة.","Clicking it in the employee profile opens WhatsApp directly.")}),
              field("hire_date", tr("تاريخ التعيين", "Hire date"), "date"),
              field(
                "user_id",
                tr(
                  "حساب المستخدم لعرض حضوره الشخصي",
                  "User account for personal attendance",
                ),
                "text",
                false,
                { searchable: true, options: users.map((u) => ({ value: u.id, label: `${u.name}${u.username ? " · " + u.username : ""}` })) },
              ),
              ...(e
                ? [
                    field(
                      "active",
                      tr("موظف نشط", "Active employee"),
                      "checkbox",
                      false,
                    ),
                  ]
                : []),
              field("notes", tr("ملاحظات الموظف", "Employee notes"), "textarea", false, { wide: true }),
            ]
          : []),
        ...(can("payroll.write")
          ? [
              field(
                "monthly_salary",
                tr("الراتب الأساسي الشهري (ج.م)", "Monthly base salary (EGP)"),
                "number",
                !!e,
                { min: 0 },
              ),
              field("daily_work_hours", tr("ساعات العمل اليومية", "Daily working hours"), "number", true, {
                value: e?.daily_work_hours || 8, min: 1, max: 16, step: ".25",
              }),
              field("work_days_per_month", tr("أيام العمل الشهرية", "Working days per month"), "number", true, {
                value: e?.work_days_per_month || 30, min: 1, max: 31,
              }),
              field("absence_deduction", tr("خصم يوم الغياب (ج.م)", "Absence deduction per day (EGP)"), "number", false, {
                min: 0, help: tr("اتركه فارغًا ليُحسب من الراتب والقواعد العامة.", "Leave blank to calculate it from salary and general rules."),
              }),
              field("overtime_hour_rate", tr("سعر ساعة الإضافي (ج.م)", "Overtime hourly rate (EGP)"), "number", false, {
                min: 0, help: tr("اتركه فارغًا لاستخدام معامل الإضافي العام.", "Leave blank to use the general overtime multiplier."),
              }),
              field("fixed_allowance",tr("بدل ثابت شهري","Monthly fixed allowance"),"number",true,{value:e?.fixed_allowance||0,min:0,step:'.01'}),
              field("transport_allowance",tr("بدل انتقال","Transport allowance"),"number",true,{value:e?.transport_allowance||0,min:0,step:'.01'}),
              field("meal_allowance",tr("بدل وجبات","Meal allowance"),"number",true,{value:e?.meal_allowance||0,min:0,step:'.01'}),
              field("fixed_incentive",tr("حافز ثابت شهري","Monthly fixed incentive"),"number",true,{value:e?.fixed_incentive||0,min:0,step:'.01'}),
              field("night_shift_rate",tr("بدل السهرة لكل نوبة ليلية","Night shift allowance per shift"),"number",true,{value:e?.night_shift_rate||0,min:0,step:'.01'}),
              field("fixed_deduction",tr("خصم ثابت شهري","Monthly fixed deduction"),"number",true,{value:e?.fixed_deduction||0,min:0,step:'.01'}),
              field("salary_transfer_method",tr("طريقة استلام الراتب","Salary transfer method"),"text",false,{value:e?.salary_transfer_method||'cash',options:[{value:'cash',label:tr('نقدي','Cash')},{value:'bank',label:tr('حساب بنكي','Bank account')},{value:'wallet',label:tr('محفظة إلكترونية','Electronic wallet')},{value:'instapay',label:'InstaPay'}]}),
              field("salary_transfer_number",tr("رقم الحساب أو المحفظة للتحويل","Account or wallet number"),"text",false),
            ]
          : []),
      ],
      submit: (v) => {
        const allowed = [
          ...(write
            ? [
                "name",
                "employee_no",
                "device_pin",
                "job_type",
                "job_title",
                "department",
                "phone",
                "whatsapp_phone",
                "hire_date",
                "user_id",
                "notes",
                ...(e ? ["active"] : []),
              ]
            : []),
          ...(can("payroll.write") ? ["monthly_salary", "daily_work_hours", "work_days_per_month", "absence_deduction", "overtime_hour_rate", "fixed_allowance", "transport_allowance", "meal_allowance", "fixed_incentive", "night_shift_rate", "fixed_deduction", "salary_transfer_method", "salary_transfer_number"] : []),
          "idempotency_key",
        ];
        const payload = Object.fromEntries(
          allowed.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]),
        );
        return api(
          "/attendance/employees" + (e ? "/" + e.id : ""),
          { ...payload, ...(e ? { version: e.version } : {}) },
          e ? "PATCH" : "POST",
        );
      },
    });
  const addShift = () =>
    openForm({
      title: tr("جدولة نوبة", "Schedule shift"),
      note: tr(
        "التوقيت بتوقيت القاهرة. إذا كانت النهاية قبل البداية تُحسب في اليوم التالي. الغياب يُحسب للنوبات المجدولة فقط.",
        "Times use Cairo timezone. An end earlier than start is on the following day. Absence is calculated only for scheduled shifts.",
      ),
      fields: [
        field("employee_id", tr("الموظف", "Employee"), "text", true, {
          options: employeeOptions,
        }),
        field("shift_date", tr("تاريخ النوبة", "Shift date"), "date"),
        field("start_time", tr("البداية", "Start"), "time"),
        field("end_time", tr("النهاية", "End"), "time"),
      ],
      submit: (v) => api("/attendance/shifts", v),
    });
  const addHandover = () =>
    openForm({
      title: tr("تسليم شيفت", "Shift handover"),
      note: tr("اختر النوبة المسلّمة والموظف المستلم. يؤكد المستلم الاستلام من حسابه الشخصي.", "Select the outgoing shift and receiving employee. The receiver confirms from their own account."),
      fields: [
        field("shift_id", tr("النوبة المسلّمة", "Outgoing shift"), "text", true, {
          searchable: true,
          options: shifts.filter((shift) => !handovers.some((handover) => handover.shift_id === shift.id)).map((shift) => ({
            value: shift.id,
            label: `${shift.employee_name} · ${String(shift.shift_date).slice(0, 10)} · ${date(shift.starts_at, true)}`,
          })),
        }),
        field("to_employee_id", tr("الموظف المستلم", "Receiving employee"), "text", true, {
          searchable: true,
          options: employeeOptions,
        }),
        field("summary", tr("ملخص تسليم الشيفت", "Handover summary"), "textarea", true, { wide: true }),
      ],
      submit: (v) => api("/attendance/handovers", v),
    });
  const addPunch = () =>
    openForm({
      title: tr("تصحيح حضور يدوي موثق", "Documented manual attendance"),
      note: tr(
        "استخدم الإدخال اليدوي لتصحيح البصمات الناقصة مع تسجيل السبب. لا يتم تعديل البصمة الأصلية.",
        "Use manual entry to correct missing punches with a recorded reason. Original punches are retained.",
      ),
      fields: [
        field("employee_id", tr("الموظف", "Employee"), "text", true, {
          options: employeeOptions,
        }),
        field(
          "occurred_at",
          tr("وقت البصمة", "Punch time"),
          "datetime-local",
          true,
          { value: nowInput() },
        ),
        field("event", tr("الحركة", "Event"), "text", true, {
          options: [
            { value: "in", label: tr("حضور", "Clock in") },
            { value: "out", label: tr("انصراف", "Clock out") },
          ],
        }),
        field(
          "reason",
          tr("سبب الإدخال اليدوي", "Reason for manual entry"),
          "textarea",
        ),
      ],
      submit: (v) => api("/attendance/punches", v),
    });
  const importCsv = () =>
    openForm({
      title: tr("استيراد سجل البصمات CSV", "Import attendance CSV"),
      note: tr(
        "الأعمدة: device_pin,occurred_at,event. الحركة in أو out؛ مثال الوقت 2026-09-01T08:00:00+03:00. التكرارات لا تُضاف مرة ثانية.",
        "Columns: device_pin,occurred_at,event. Event is in or out; example time 2026-09-01T08:00:00+03:00. Duplicate punches are not added again.",
      ),
      fields: [
        field(
          "device_id",
          tr("الجهاز (اختياري)", "Device (optional)"),
          "text",
          false,
          { options: devices.map((d) => ({ value: d.id, label: d.name })) },
        ),
        field(
          "csv",
          tr("الصق محتوى ملف CSV", "Paste CSV file contents"),
          "textarea",
          true,
          { wide: true },
        ),
      ],
      submit: async (v) => {
        const r = await api("/attendance/import", v);
        notify(
          tr("تم استيراد بصمات جديدة: ", "New punches imported: ") +
            r.inserted_count,
        );
        return r;
      },
    });
  const editPolicy = () =>
    openForm({
      title: tr("قواعد حساب الرواتب", "Payroll calculation rules"),
      initial: data.policy,
      fields: [
        field(
          "working_days_per_month",
          tr("أيام الشهر المحاسبية", "Salary divisor: days per month"),
          "number",
          true,
          { min: 1, max: 31 },
        ),
        field(
          "working_hours_per_day",
          tr("ساعات يوم العمل", "Salary divisor: hours per day"),
          "number",
          true,
          { min: 1, max: 24 },
        ),
        field(
          "grace_minutes",
          tr("فترة السماح بالدقائق", "Grace period (minutes)"),
          "number",
          true,
          { min: 0, max: 120 },
        ),
        field(
          "paid_break_minutes",
          tr("الراحة المدفوعة بالدقائق", "Paid break (minutes)"),
          "number",
          true,
          { min: 0, max: 240 },
        ),
        field(
          "late_multiplier",
          tr(
            "معامل خصم التأخير والانصراف المبكر",
            "Late / early departure deduction multiplier",
          ),
          "number",
          true,
          { min: 0, max: 10 },
        ),
        field(
          "absence_multiplier",
          tr("معامل خصم يوم الغياب", "Absent day deduction multiplier"),
          "number",
          true,
          { min: 0, max: 10 },
        ),
        field(
          "overtime_multiplier",
          tr("معامل أجر ساعة الإضافي", "Overtime hourly pay multiplier"),
          "number",
          true,
          { min: 0, max: 10 },
        ),
      ],
      note: tr(
        "هذه قواعد تشغيل قابلة للتعديل وفق اتفاقات المستشفى. راجعها قبل أول كشف؛ الراتب الأساسي ÷ أيام الشهر ÷ ساعات اليوم = أجر الساعة.",
        "Configure these operational rules according to hospital agreements before the first payroll. Base salary ÷ days per month ÷ hours per day = hourly rate.",
      ),
      submit: (v) =>
        api(
          "/attendance/policy",
          { ...v, version: data.policy.version },
          "PATCH",
        ),
    });
  const eventLabel = (event: string) =>
    event === "in"
      ? tr("حضور", "Clock in")
      : event === "out"
        ? tr("انصراف", "Clock out")
        : tr("غير محدد — يحتاج مراجعة", "Unknown — review required");
  const addPayrollAdjustment=(employeeId?:string)=>openForm({title:tr('إضافة بدل أو حافز أو خصم للشهر','Add monthly allowance, incentive or deduction'),note:tr('تُضاف التسوية إلى حساب الموظف عند إعادة حساب الكشف، وتظل مرتبطة بالشهر والموظف وهوية من سجلها.','The adjustment enters the employee calculation after payroll recalculation and retains month, employee and actor.'),initial:{employee_id:employeeId||'',month:period?.month||month,type:'incentive'},fields:[field('employee_id',tr('الموظف','Employee'),'text',true,{searchable:true,options:employeeOptions}),field('month',tr('شهر الاستحقاق','Payroll month'),'month'),field('type',tr('نوع البند','Adjustment type'),'text',true,{options:[{value:'allowance',label:tr('بدل','Allowance')},{value:'incentive',label:tr('حافز','Incentive')},{value:'bonus',label:tr('مكافأة','Bonus')},{value:'night_shift',label:tr('سهرة إضافية','Extra night shift')},{value:'deduction',label:tr('خصم','Deduction')},{value:'advance',label:tr('سلفة','Advance deduction')},{value:'other_addition',label:tr('إضافة أخرى','Other addition')},{value:'other_deduction',label:tr('خصم آخر','Other deduction')}]}),field('amount',tr('القيمة (ج.م)','Amount (EGP)'),'number',true,{min:.01,step:'.01'}),field('notes',tr('السبب / البيان','Reason / description'),'textarea',true,{wide:true})],submit:v=>api('/payroll/adjustments',v)});
  const voidPayrollAdjustment=(adjustment:Row)=>openForm({title:tr('إلغاء تسوية الراتب','Void payroll adjustment'),note:adjustment.notes,fields:[field('reason',tr('سبب الإلغاء','Void reason'),'textarea',true)],sensitive:true,submit:v=>api(`/payroll/adjustments/${adjustment.id}/void`,{reason:v.reason})});
  const visible = (rows: Row[]) =>
    rows.filter((r) => !employeeFilter || r.employee_id === employeeFilter);
  const issueLabel = (i: Row) =>
    (
      ({
        MISSING_SALARY: tr("الراتب الأساسي غير محدد", "Base salary missing"),
        MISSING_SCHEDULE: tr("لا توجد نوبات مجدولة", "No scheduled shifts"),
        MISSING_OR_CONFLICTING_PUNCH: tr(
          "بصمات ناقصة أو متعارضة",
          "Missing or conflicting punches",
        ),
        NO_EMPLOYEES: tr("لا يوجد موظفون نشطون", "No active employees"),
        UNMAPPED_PUNCHES: tr(
          "بصمات غير مربوطة بموظف",
          "Unmapped employee punches",
        ),
        SHIFT_NOT_FINISHED: tr("نوبة لم تنتهِ بعد", "Shift has not ended"),
        UNFINISHED_SHIFT: tr("نوبة لم تنتهِ بعد", "Shift has not ended"),
        PERIOD_NOT_FINISHED: tr(
          "الشهر لم ينتهِ بعد؛ الكشف مبدئي",
          "Month has not ended; payroll is provisional",
        ),
      }) as Row
    )[i.code] || t(i.message);
  return (
    <div className="attendance-module">
      <div className="info-box">
        <Fingerprint size={23} />
        <div>
          <strong>
            {tr(
              "الحضور والانصراف مرتبط بحساب الرواتب",
              "Attendance linked to payroll calculations",
            )}
          </strong>
          <p>
            {tr(
              "استقبل حركات ZK أو استوردها، ثم راجع كشف الرواتب واعتمده. الربط الفعلي بالجهاز يحتاج إعداد الاتصال واختبار الموديل.",
              "Receive ZK punches or import them, then review and approve payroll. Live hardware connection requires configuration and a model-specific test.",
            )}
          </p>
        </div>
      </div>
      <div className="register-tabs">
        {[
          ["logs", tr("سجل البصمات", "Punch log"), Clock3],
          ["shifts", tr("جدول النوبات", "Shift schedule"), Clock3],
          ["handovers", tr("تسليم الشيفتات", "Shift handovers"), ShieldCheck],
          ["employees", tr("الموظفون", "Employees"), Users],
          ...(can("attendance.devices")
            ? [["devices", tr("أجهزة ZK", "ZK devices"), Fingerprint]]
            : []),
          ...(payroll ? [["payroll", tr("الرواتب", "Payroll"), Wallet]] : []),
        ].map(([id, label, Icon]: any) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      {error && <div className="error-box">{error}</div>}
      {tab === "logs" && (
        <Section
          title={
            whole
              ? tr("حركات الحضور والانصراف", "Attendance punches")
              : tr("حضوري وانصرافي", "My attendance")
          }
          sub={tr(
            "توقيت العرض: القاهرة. البصمات غير المعروفة تمنع اعتماد الرواتب حتى تصحيحها.",
            "Display timezone: Cairo. Unknown punches block payroll approval until resolved.",
          )}
          action={
            write && (
              <div className="button-row">
                <button className="button small" onClick={importCsv}>
                  <FileUp size={16} />
                  {tr("استيراد CSV", "Import CSV")}
                </button>
                <button className="button primary small" onClick={addPunch}>
                  <Plus size={16} />
                  {tr("إدخال يدوي", "Manual entry")}
                </button>
              </div>
            )
          }
        >
          {whole && (
            <div className="table-toolbar">
              <select
                aria-label={tr("تصفية الموظف", "Filter employee")}
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
              >
                <option value="">{tr("كل الموظفين", "All employees")}</option>
                {employeeOptions.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Table
            headers={[
              tr("الموظف / PIN", "Employee / PIN"),
              tr("التوقيت", "Time"),
              tr("الحركة", "Event"),
              tr("المصدر", "Source"),
              tr("السبب", "Reason"),
              tr("الإجراء", "Action"),
            ]}
            rows={visible(punches).map((p) => [
              <span>
                {p.employee_name ||
                  employees.find((e) => e.id === p.employee_id)?.name ||
                  tr("غير مربوط", "Unmapped")}
                <small className="block">{p.device_pin}</small>
              </span>,
              date(p.occurred_at, true),
              p.voided
                ? tr("ملغاة مع الاحتفاظ بالسجل", "Voided; original retained")
                : eventLabel(p.event),
              p.source === "zk_push"
                ? "ZK"
                : p.source === "csv"
                  ? "CSV"
                  : tr("يدوي", "Manual"),
              p.reason || "—",
              write && !p.voided ? (
                <button
                  className="button tiny"
                  onClick={() =>
                    openForm({
                      title: tr("إلغاء بصمة خاطئة", "Void incorrect punch"),
                      sensitive: true,
                      fields: [
                        field(
                          "reason",
                          tr("سبب الإلغاء", "Reason"),
                          "textarea",
                        ),
                      ],
                      submit: (v) =>
                        api("/attendance/punches/" + p.id + "/void", {
                          ...v,
                          version: p.version,
                        }),
                    })
                  }
                >
                  {tr("إلغاء موثق", "Void with reason")}
                </button>
              ) : (
                "—"
              ),
            ])}
          />
        </Section>
      )}
      {tab === "shifts" && (
        <Section
          title={tr("النوبات المجدولة", "Scheduled shifts")}
          sub={tr(
            "يُحتسب الغياب من الجدول المعتمد، وتدعم النوبات عبور منتصف الليل.",
            "Absence follows scheduled shifts. Overnight shifts are supported.",
          )}
          action={
            write && (
              <button className="button primary small" onClick={addShift}>
                <Plus size={16} />
                {tr("جدولة نوبة", "Schedule shift")}
              </button>
            )
          }
        >
          <Table
            headers={[
              tr("الموظف", "Employee"),
              tr("اليوم", "Date"),
              tr("البداية", "Start"),
              tr("النهاية", "End"),
            ]}
            rows={shifts.map((s) => [
              s.employee_name,
              s.shift_date?.slice(0, 10),
              date(s.starts_at, true),
              date(s.ends_at, true),
            ])}
          />
        </Section>
      )}
      {tab === "handovers" && (
        <Section
          title={tr("سجل تسليم الشيفتات", "Shift handover log")}
          sub={tr("يسجل النظام هوية المسلّم والمستلم، ويؤكد المستلم الاستلام من حسابه.", "The system records both employees; the receiver acknowledges from their own account.")}
          action={(write || can("attendance.self")) && <button className="button primary small" onClick={addHandover}><Plus size={16}/>{tr("تسليم شيفت", "New handover")}</button>}
        >
          <Table
            headers={[tr("الشيفت", "Shift"), tr("من", "From"), tr("إلى", "To"), tr("ملخص التسليم", "Summary"), tr("الحالة", "Status"), tr("الإجراء", "Action")]}
            rows={handovers.map((handover) => [
              <div>{String(handover.shift_date).slice(0, 10)}<small>{date(handover.starts_at, true)} — {date(handover.ends_at, true)}</small></div>,
              <div>{handover.from_employee_name}<small>{handover.handed_over_by_name} · {date(handover.handed_over_at, true)}</small></div>,
              <div>{handover.to_employee_name}<small>{handover.acknowledged_by_name ? `${handover.acknowledged_by_name} · ${date(handover.acknowledged_at, true)}` : "—"}</small></div>,
              handover.summary,
              <Badge value={handover.status}/>,
              handover.can_acknowledge ? <button className="button primary tiny" onClick={() => action(async () => {
                await api(`/attendance/handovers/${handover.id}/acknowledge`, { version: handover.version });
              })}>{tr("تأكيد الاستلام", "Acknowledge")}</button> : "—",
            ])}
          />
        </Section>
      )}
      {tab === "employees" && (
        <Section
          title={tr(
            "ملفات الموظفين وربط البصمة",
            "Employees and device mapping",
          )}
          sub={tr(
            "رقم PIN هو رقم المستخدم في جهاز ZK. ربط حساب النظام يسمح للموظف بعرض حضوره فقط.",
            "PIN is the user number on the ZK device. Linking an account lets the employee view their own attendance.",
          )}
          action={
            write && (
              <button
                className="button primary small"
                onClick={() => editEmployee()}
              >
                <Plus size={16} />
                {tr("إضافة موظف", "Add employee")}
              </button>
            )
          }
        >
          <div className="patient-metrics three">
            <div className="mini-metric"><span>{tr("إجمالي الموظفين", "Total employees")}</span><strong>{fmt(employees.length)}</strong></div>
            <div className="mini-metric"><span>{tr("الموظفون النشطون", "Active employees")}</span><strong>{fmt(employees.filter((employee) => employee.active).length)}</strong></div>
            <div className="mini-metric"><span>{payroll ? tr("إجمالي الرواتب الأساسية", "Total base salaries") : tr("الأقسام المسجلة", "Recorded departments")}</span><strong>{payroll ? salaryMoney(employees.reduce((sum, employee) => sum + Number(employee.monthly_salary || 0), 0)) : fmt(new Set(employees.map((employee) => employee.department).filter(Boolean)).size)}</strong></div>
          </div>
          <Table
            headers={[
              tr("الموظف", "Employee"),
              tr("الوظيفة والقسم", "Role & department"),
              tr("ساعات العمل", "Working hours"),
              tr("الحالة", "Status"),
              ...(payroll ? [tr("الراتب وقواعد الخصم", "Salary & deductions")] : []),
              tr("الإجراء", "Action"),
            ]}
            rows={employees.map((e) => [
              <div><strong>{e.name}</strong><small>{e.employee_no} · ZK {e.device_pin}{e.phone ? ` · ${e.phone}` : ""}</small>{e.whatsapp_phone&&<a className="whatsapp-link" href={whatsappUrl(e.whatsapp_phone)} target="_blank" rel="noreferrer">{tr('محادثة واتساب','WhatsApp chat')} · {e.whatsapp_phone}</a>}{e.hire_date && <small>{tr("تعيين:", "Hired:")} {String(e.hire_date).slice(0, 10)}</small>}{e.notes && <small>{e.notes}</small>}</div>,
              <div>{e.job_title || ({
                doctor: tr("طبيب", "Doctor"), nurse: tr("تمريض", "Nurse"), reception: tr("استقبال", "Reception"),
                accountant: tr("حسابات", "Accounts"), purchasing: tr("مشتريات", "Purchasing"), technician: tr("فني", "Technician"), worker: tr("عامل", "Worker"),
                administration: tr("إداري", "Administration"), other: tr("أخرى", "Other"),
              } as Row)[e.job_type] || e.job_type}<small>{e.department}</small></div>,
              <div>{fmt(e.daily_work_hours)} {tr("ساعة يوميًا", "hours/day")}<small>{fmt(e.work_days_per_month)} {tr("يومًا شهريًا", "days/month")}</small></div>,
              e.active ? tr("نشط", "Active") : tr("موقوف", "Inactive"),
              ...(payroll
                ? [
                    <div>{e.monthly_salary === null ? tr("غير محدد", "Not set") : salaryMoney(e.monthly_salary)}
                      <small>{tr("غياب:", "Absence:")} {e.absence_deduction == null ? tr("تلقائي", "Auto") : salaryMoney(e.absence_deduction)} · {tr("إضافي:", "Overtime:")} {e.overtime_hour_rate == null ? tr("تلقائي", "Auto") : salaryMoney(e.overtime_hour_rate)}</small>
                      <small>{tr('بدلات وحوافز:','Allowances & incentives:')} {salaryMoney(Number(e.fixed_allowance||0)+Number(e.transport_allowance||0)+Number(e.meal_allowance||0)+Number(e.fixed_incentive||0))} · {tr('السهرة:','Night shift:')} {salaryMoney(e.night_shift_rate)}</small>
                      {e.salary_transfer_number&&<small>{tr('التحويل:','Transfer:')} {e.salary_transfer_method||'—'} · {e.salary_transfer_number}</small>}
                    </div>,
                  ]
                : []),
              write || can("payroll.write") ? (
                <button className="button tiny" onClick={() => editEmployee(e)}>
                  {tr("تعديل", "Edit")}
                </button>
              ) : (
                "—"
              ),
            ])}
          />
        </Section>
      )}
      {tab === "devices" && manageDevices && (
        <Section
          title={tr("أجهزة البصمة ZK", "ZK attendance devices")}
          sub={tr(
            "يدعم موصل ADMS / PUSH عبر بوابة موثقة. لا تُحفظ صور أو قوالب بصمات.",
            "ADMS / PUSH connector through an authenticated gateway. Fingerprint images and templates are not stored.",
          )}
          action={
            <button
              className="button primary small"
              onClick={() =>
                openForm({
                  title: tr("إضافة جهاز ZK", "Add ZK device"),
                  fields: [
                    field("name", tr("اسم الجهاز", "Device name")),
                    field(
                      "serial",
                      tr("الرقم التسلسلي SN", "Serial number (SN)"),
                    ),
                  ],
                  submit: async (v) => {
                    const r = await api("/attendance/devices", v);
                    setSecret(r.secret);
                    setSecretDevice(String(v.name));
                    return r;
                  },
                })
              }
            >
              <Plus size={16} />
              {tr("إضافة جهاز", "Add device")}
            </button>
          }
        >
          {secret && (
            <div className="info-box attendance-secret">
              <div>
                <p>
                  <strong>{secretDevice}</strong>
                </p>
                <strong>
                  {tr(
                    "مفتاح الجهاز — يظهر الآن فقط؛ احفظه في إعدادات البوابة",
                    "Device secret — shown only now; save it in your gateway settings",
                  )}
                </strong>
                <input
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={tr("مفتاح الجهاز", "Device secret")}
                  readOnly
                  value={secret}
                  dir="ltr"
                />
                <button className="button small" onClick={() => setSecret("")}>
                  {tr("إخفاء المفتاح", "Hide secret")}
                </button>
              </div>
            </div>
          )}
          <Table
            headers={[
              tr("الجهاز", "Device"),
              "SN",
              tr("الحالة", "Status"),
              tr("آخر اتصال", "Last contact"),
              tr("الإجراء", "Action"),
            ]}
            rows={devices.map((d) => [
              d.name,
              d.serial,
              d.active ? tr("مفعل", "Enabled") : tr("موقوف", "Disabled"),
              date(d.last_seen_at, true),
              <div className="button-row">
                <button
                  disabled={busy}
                  className="button tiny"
                  onClick={() =>
                    action(() =>
                      api(
                        "/attendance/devices/" + d.id,
                        {
                          version: d.version,
                          active: !d.active,
                          idempotency_key: uid(),
                        },
                        "PATCH",
                      ),
                    )
                  }
                >
                  {d.active ? tr("تعطيل", "Disable") : tr("تفعيل", "Enable")}
                </button>
                <button
                  disabled={busy}
                  className="button tiny"
                  onClick={() =>
                    openForm({
                      title: tr("تجديد مفتاح الجهاز", "Rotate device secret"),
                      subtitle: d.name,
                      sensitive: true,
                      note: tr(
                        "سيتوقف المفتاح السابق. احفظ المفتاح الجديد في إعدادات بوابة الجهاز لاستمرار وصول البصمات.",
                        "The previous secret will stop working. Update the device gateway with the new secret to continue receiving punches.",
                      ),
                      fields: [],
                      submit: async () => {
                        const result = await api(
                          "/attendance/devices/" + d.id + "/rotate-secret",
                          {},
                        );
                        setSecret(result.secret);
                        setSecretDevice(d.name);
                        return result;
                      },
                    })
                  }
                >
                  <KeyRound size={15} />
                  {tr("تجديد المفتاح", "Rotate secret")}
                </button>
              </div>,
            ])}
          />
          <div className="panel-pad">
            <p>
              {tr(
                "مسار الاتصال على نفس الخادم:",
                "Endpoint on the same server:",
              )}{" "}
              <code dir="ltr">
                /iclock/cdata?SN=DEVICE_SERIAL&amp;table=ATTLOG
              </code>
            </p>
            <p>
              {tr(
                "يلزم أن تضيف البوابة ترويسة X-Device-Secret. الأجهزة التي لا تدعم ذلك تحتاج بوابة محلية؛ يمكن استخدام استيراد CSV الآن.",
                "The gateway must add an X-Device-Secret header. Devices unable to send this require a local gateway; CSV import is available now.",
              )}
            </p>
          </div>
        </Section>
      )}
      {tab === "payroll" && payroll && (
        <>
          <Section
            title={tr("كشف الرواتب الشهري", "Monthly payroll")}
            sub={tr(
              "الحساب تلقائي من البصمات والقواعد. الاعتماد يحفظ نسخة مقفلة، ولا يصرف أموالًا.",
              "Calculated automatically from punches and rules. Approval locks a snapshot; it does not transfer funds.",
            )}
            action={
              can("payroll.write") && (<div className="button-row"><button className="button small" onClick={editPolicy}>{tr("قواعد الحساب", "Calculation rules")}</button><button className="button primary small" onClick={()=>addPayrollAdjustment()}><Plus size={16}/>{tr('بدل / حافز / خصم','Allowance / incentive / deduction')}</button></div>)
            }
          >
            <div className="table-toolbar">
              <input
                type="month"
                aria-label={tr("شهر الرواتب", "Payroll month")}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
              {can("payroll.write") && (
                <button
                  disabled={busy || !month}
                  className="button primary"
                  onClick={() =>
                    action(async () =>
                      setPeriod(
                        await api("/payroll/preview", {
                          month,
                          idempotency_key: uid(),
                        }),
                      ),
                    )
                  }
                >
                  <Wallet size={18} />
                  {tr("حساب وعرض الكشف", "Calculate and view")}
                </button>
              )}
            </div>
            <Table
              headers={[
                tr("الفترة", "Period"),
                tr("الحالة", "Status"),
                tr("صافي الرواتب", "Net payroll"),
                tr("عرض", "View"),
              ]}
              rows={(data.periods || []).map((p: Row) => [
                p.month,
                <Badge value={p.status} />,
                salaryMoney(
                  p.totals?.net_salary ?? p.calculation?.totals?.net_salary,
                ),
                <button
                  className="button tiny"
                  disabled={busy}
                  onClick={() =>
                    action(async () => setPeriod(await api("/payroll/" + p.id)))
                  }
                >
                  {tr("فتح الكشف", "Open payroll")}
                </button>,
              ])}
            />
          </Section>
          {period && (
            <Section
              title={tr("تفاصيل كشف ", "Payroll details ") + period.month}
              sub={
                tr("آخر حساب: ", "Calculated: ") +
                date(period.calculated_at, true)
              }
              action={
                <div className="button-row">
                  <Badge value={period.status} />
                  {period.status === "draft" && can("payroll.write") && (
                    <button
                      disabled={busy}
                      className="button small"
                      onClick={() =>
                        action(async () =>
                          setPeriod(
                            await api(
                              "/payroll/" + period.id + "/recalculate",
                              {
                                version: period.version,
                                idempotency_key: uid(),
                              },
                            ),
                          ),
                        )
                      }
                    >
                      <RefreshCw size={16} />
                      {tr("إعادة الحساب", "Recalculate")}
                    </button>
                  )}
                  {period.status === "draft" && can("payroll.approve") && (
                    <button
                      disabled={busy || period.stale || !!period.issues?.length}
                      className="button primary small"
                      onClick={() =>
                        openForm({
                          title: tr(
                            "اعتماد وقفل كشف الرواتب",
                            "Approve and lock payroll",
                          ),
                          sensitive: true,
                          note: tr(
                            "راجع كل الموظفين والخصومات. بعد الاعتماد لن تتغير هذه النسخة تلقائيًا.",
                            "Review all employees and deductions. This snapshot will not change automatically after approval.",
                          ),
                          fields: [],
                          submit: async (v) => {
                            const result = await api(
                              "/payroll/" + period.id + "/approve",
                              { ...v, version: period.version },
                            );
                            setPeriod(result);
                            return result;
                          },
                        })
                      }
                    >
                      <ShieldCheck size={16} />
                      {tr("اعتماد وقفل", "Approve and lock")}
                    </button>
                  )}
                </div>
              }
            >
              {period.stale && (
                <div className="error-box">
                  {tr(
                    "تغيرت بيانات المصدر؛ أعد الحساب قبل الاعتماد.",
                    "Source data changed; recalculate before approval.",
                  )}
                </div>
              )}
              {period.has_late_changes && (
                <div className="info-box">
                  {tr(
                    "وصلت بصمات بعد الاعتماد؛ تحتاج مراجعة وتسوية مستقلة.",
                    "Punches arrived after approval; review and a separate adjustment are required.",
                  )}
                </div>
              )}
              {!!period.issues?.length && (
                <div className="error-box">
                  <div>
                    <strong>
                      {tr("مشكلات تحتاج مراجعة", "Issues requiring review")}
                    </strong>
                    <ul>
                      {period.issues.map((i: Row, k: number) => (
                        <li key={k}>
                          {i.name ? i.name + " — " : ""}
                          {issueLabel(i)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className="patient-metrics four payroll-summary">
                {[
                  [tr("إجمالي الأساسي", "Total base"), period.totals?.base_salary],
                  [tr("البدلات والحوافز والسهر", "Allowances, incentives & nights"), Number(period.totals?.fixed_additions||0)+Number(period.totals?.night_shift_pay||0)+Number(period.totals?.monthly_additions||0)],
                  [tr("إجمالي الخصومات", "Total deductions"), Number(period.totals?.absence_deduction||0)+Number(period.totals?.late_deduction||0)+Number(period.totals?.fixed_deduction||0)+Number(period.totals?.monthly_deductions||0)],
                  [tr("صافي الرواتب", "Net payroll"), period.totals?.net_salary],
                ].map(([label,value])=><div className="mini-metric" key={String(label)}><span>{label}</span><strong>{salaryMoney(value)}</strong></div>)}
              </div>
              <Table
                headers={[
                  tr("الموظف", "Employee"),
                  tr("الأساسي", "Base"),
                  tr("البدلات والحوافز", "Allowances & incentives"),
                  tr("السهر", "Night shifts"),
                  tr("نوبات حضور / غياب", "Present / absent shifts"),
                  tr("خصم غياب", "Absence deduction"),
                  tr("خصم وقت", "Time deduction"),
                  tr("الإضافي", "Overtime"),
                  tr("الصافي", "Net pay"),
                ]}
                rows={(period.employees || []).map((e: Row) => [
                  e.name,
                  salaryMoney(e.base_salary),
                  salaryMoney(Number(e.fixed_additions||0)+Number(e.monthly_additions||0)),
                  <div>{salaryMoney(e.night_shift_pay)}<small>{fmt(e.night_shifts)} {tr('نوبة','shifts')}</small></div>,
                  fmt(e.present_shifts) + " / " + fmt(e.absent_shifts),
                  salaryMoney(e.absence_deduction),
                  salaryMoney(e.late_deduction),
                  salaryMoney(e.overtime_pay),
                  <strong>{salaryMoney(e.net_salary)}</strong>,
                ])}
              />
              <div className="panel-pad">
                <strong>
                  {tr("إجمالي الصافي: ", "Total net pay: ")}
                  {salaryMoney(period.totals?.net_salary)}
                </strong>
                <p>{t(period.basis || "")}</p>
              </div>
              {(period.employees || []).map((e: Row) => (
                <details className="panel-pad" key={e.employee_id}>
                  <summary>
                    {e.name} —{" "}
                    {tr("تفاصيل النوبات والحساب", "Shift calculation details")}
                  </summary>
                  <div className="payroll-employee-actions"><div><strong>{tr('طريقة استلام الراتب:','Salary transfer:')}</strong> {e.salary_transfer_method||tr('غير محددة','Not specified')} {e.salary_transfer_number&&` · ${e.salary_transfer_number}`}{e.whatsapp_phone&&<a className="whatsapp-link" href={whatsappUrl(e.whatsapp_phone)} target="_blank" rel="noreferrer">{tr('فتح واتساب الموظف','Open employee WhatsApp')}</a>}</div>{period.status==='draft'&&can('payroll.write')&&<button className="button tiny" onClick={()=>addPayrollAdjustment(e.employee_id)}><Plus size={14}/>{tr('إضافة تسوية','Add adjustment')}</button>}</div>
                  {!!e.adjustments?.length&&<Table headers={[tr('نوع التسوية','Type'),tr('القيمة','Amount'),tr('البيان','Description'),tr('الإجراء','Action')]} rows={e.adjustments.map((x:Row)=>[({allowance:tr('بدل','Allowance'),incentive:tr('حافز','Incentive'),bonus:tr('مكافأة','Bonus'),night_shift:tr('سهرة إضافية','Extra night shift'),deduction:tr('خصم','Deduction'),advance:tr('سلفة','Advance'),other_addition:tr('إضافة أخرى','Other addition'),other_deduction:tr('خصم آخر','Other deduction')} as Row)[x.type]||x.type,salaryMoney(x.amount),x.notes,period.status==='draft'&&can('payroll.write')?<button className="button danger tiny" onClick={()=>voidPayrollAdjustment(x)}>{tr('إلغاء','Void')}</button>:'—'])}/>} 
                  <Table
                    headers={[
                      tr("اليوم", "Date"),
                      tr("الحالة", "Status"),
                      tr("حضور", "In"),
                      tr("انصراف", "Out"),
                      tr("عمل (دقيقة)", "Worked (min)"),
                      tr("تأخير (دقيقة)", "Late (min)"),
                      tr("خروج مبكر (دقيقة)", "Early leave (min)"),
                      tr("راحة غير مدفوعة (دقيقة)", "Unpaid break (min)"),
                      tr("إضافي (دقيقة)", "Overtime (min)"),
                    ]}
                    rows={(e.days || []).map((d: Row) => [
                      d.shift_date?.slice(0, 10),
                      (
                        {
                          present: tr("حاضر", "Present"),
                          absent: tr("غائب", "Absent"),
                          incomplete: tr("ناقص", "Incomplete"),
                          pending: tr("لم تنتهِ", "Pending"),
                          upcoming: tr("قادمة", "Upcoming"),
                          in_progress: tr("جارية", "In progress"),
                        } as Row
                      )[d.status] || d.status,
                      date(d.first_in, true),
                      date(d.last_out, true),
                      fmt(d.worked_minutes),
                      fmt(d.late_minutes),
                      fmt(d.early_minutes),
                      fmt(d.unpaid_break_minutes),
                      fmt(d.overtime_minutes),
                    ])}
                  />
                </details>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
