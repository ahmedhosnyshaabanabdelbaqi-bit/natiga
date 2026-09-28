import { useEffect, useState } from "react";
import {
  Activity,
  Link2,
  Unlink,
  Plus,
  RefreshCw,
  FileText,
} from "lucide-react";
import {
  api,
  date,
  field,
  nowInput,
  searchText,
  Section,
  type FormSpec,
  type Row,
} from "./shared";
import { useLanguage } from "./i18n";

type Props = {
  can: (permission: string) => boolean;
  openForm: (spec: FormSpec) => void;
  revision: number;
  openPatient: (id: string, admissionId?: string, tab?: string) => void;
};
export default function Monitoring({
  can,
  openForm,
  revision,
  openPatient,
}: Props) {
  const language = useLanguage(),
    tr = (ar: string, en: string) => (language === "en" ? en : ar);
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(false),
    [loadedAt, setLoadedAt] = useState("");
  const mayRead = can("clinical.read") && can("patients.read"),
    mayBind =
      can("patients.read") && (can("clinical.write") || can("nursing.write")),
    mayRecord = can("nursing.write") && can("patients.read");
  useEffect(() => {
    if (!mayRead) {
      setData(null);
      return;
    }
    let alive = true,
      pending = false;
    let controller: AbortController | undefined;
    async function load() {
      if (!alive || pending || document.visibilityState === "hidden") return;
      pending = true;
      setLoading(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch("/api/monitoring", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Accept-Language": language },
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ||
              tr(
                "تعذر تحميل سجل المتابعة",
                "Could not load monitoring records",
              ),
          );
        if (alive) {
          setData(result);
          setError("");
          setLoadedAt(new Date().toISOString());
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error && e.name !== "AbortError"
              ? e.message
              : tr("تعذر الاتصال بالخادم", "Could not reach the server"),
          );
      } finally {
        clearTimeout(timeout);
        pending = false;
        if (alive) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 5000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      controller?.abort();
    };
  }, [revision, reload, language, mayRead]);
  const identity = (a: Row) =>
    `${a.patient_name} · ${a.mrn} · ${a.bed_name || tr("دون سرير", "No bed")}`;
  const confirmField = (a: Row) =>
    field(
      "confirm_mrn",
      tr(
        "أعد إدخال رقم ملف الطفل",
        "Re-enter the infant medical record number",
      ),
      "text",
      true,
      { help: identity(a) },
    );
  function bind(a: Row) {
    openForm({
      title: tr("ربط جهاز المتابعة", "Link monitoring equipment"),
      subtitle: identity(a),
      note: tr(
        "أكد الجهاز الموجود بجوار هذا الطفل. الربط لا يجلب قراءات من الجهاز ولا يضيف رسوم استخدام.",
        "Verify the equipment beside this infant. Linking does not import device readings or add usage charges.",
      ),
      fields: [
        field(
          "equipment_id",
          tr("الجهاز الجاهز", "Ready equipment"),
          "select",
          true,
          {
            searchable: true,
            options: (data?.equipment || []).map((e: Row) => ({
              value: e.id,
              label: `${e.name} · ${e.code}${e.serial_number ? " · " + e.serial_number : ""}`,
            })),
          },
        ),
        confirmField(a),
      ],
      submit: async (values) => {
        await api(`/admissions/${a.id}/monitor-binding`, values);
        setReload((v) => v + 1);
      },
    });
  }
  function unbind(a: Row) {
    openForm({
      title: tr("فك ربط جهاز المتابعة", "Unlink monitoring equipment"),
      subtitle: identity(a),
      note: tr(
        "يفك هذا الإجراء ربط الجهاز بهذه الإقامة فقط، ويحتفظ بسجل القراءات السابق.",
        "This unlinks equipment from this admission and preserves earlier readings.",
      ),
      fields: [confirmField(a)],
      submit: async (values) => {
        await api(`/admissions/${a.id}/monitor-unbind`, {
          ...values,
          binding_id: a.binding.id,
        });
        setReload((v) => v + 1);
      },
    });
  }
  function record(a: Row) {
    openForm({
      title: tr("تسجيل قراءة يدويًا", "Record a manual reading"),
      subtitle: identity(a),
      note: tr(
        "أدخل ما قرأته فعليًا على الجهاز. يلزم إدخال قراءة واحدة على الأقل. يسجل الخادم اسم المستخدم الحالي ووقت التسجيل.",
        "Enter the values you actually read on the device. Enter at least one reading. The server records the signed-in user and recording time.",
      ),
      fields: [
        confirmField(a),
        field(
          "measured_at",
          tr("وقت القياس", "Measured at"),
          "datetime-local",
          true,
          { value: nowInput() },
        ),
        field(
          "heart_rate",
          tr("النبض / دقيقة", "Heart rate / min"),
          "number",
          false,
          { min: 0, max: 350, step: "1" },
        ),
        field(
          "respiratory_rate",
          tr("التنفس / دقيقة", "Respiratory rate / min"),
          "number",
          false,
          { min: 0, max: 200, step: "1" },
        ),
        field(
          "spo2",
          tr("تشبع الأكسجين SpO₂ %", "Oxygen saturation SpO₂ %"),
          "number",
          false,
          { min: 0, max: 100, step: "1" },
        ),
        field(
          "temperature",
          tr("الحرارة °م", "Temperature °C"),
          "number",
          false,
          { min: 20, max: 50, step: "0.1" },
        ),
        field(
          "bilirubin_total",
          tr("الصفراء الكلية mg/dL", "Total bilirubin mg/dL"),
          "number",
          false,
          { min: 0, max: 50, step: "0.1" },
        ),
        field(
          "bilirubin_direct",
          tr("الصفراء المباشرة mg/dL", "Direct bilirubin mg/dL"),
          "number",
          false,
          { min: 0, max: 30, step: "0.1" },
        ),
        field("bilirubin_method",tr("طريقة قياس الصفراء", "Bilirubin measurement method"),"text",false,{value:"transcutaneous",options:[{value:"transcutaneous",label:tr("جهاز قياس عبر الجلد", "Transcutaneous meter")},{value:"serum",label:tr("تحليل عينة دم", "Serum test")},{value:"other",label:tr("طريقة أخرى", "Other method")}]}),
        field(
          "notes",
          tr("ملاحظات القراءة", "Reading notes"),
          "textarea",
          false,
          { wide: true },
        ),
      ],
      submit: async (values) => {
        await api(`/admissions/${a.id}/monitor-readings`, {
          ...values,
          binding_id: a.binding?.id || undefined,
        });
        setReload((v) => v + 1);
      },
    });
  }
  const value = (v: any) =>
    v === null || v === undefined || v === ""
      ? "—"
      : new Intl.NumberFormat(language === "en" ? "en-GB" : "ar-EG", {
          maximumFractionDigits: 1,
        }).format(Number(v));
  if (!mayRead)
    return (
      <div className="info-box">
        {tr(
          "سجل المتابعة متاح للفريق السريري المصرح له.",
          "Monitoring records are available to authorized clinical staff.",
        )}
      </div>
    );
  const rows = (data?.admissions || []).filter((a: Row) =>
    searchText(`${a.patient_name} ${a.mrn} ${a.bed_name || ""}`).includes(
      searchText(query),
    ),
  );
  return (
    <div className="monitoring-module">
      <Section
        title={tr(
          "سجل المتابعة والقياسات",
          "Monitoring and observation records",
        )}
        sub={tr(
          "قراءات أدخلها الفريق يدويًا داخل الإقامة",
          "Readings manually entered by staff during the admission",
        )}
        action={
          <button
            className="button small"
            onClick={() => setReload((v) => v + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            {tr("تحديث السجل", "Refresh records")}
          </button>
        }
      >
        <div className="info-box" role="note">
          <Activity size={20} />
          <div>
            <strong>
              {tr(
                "الأجهزة غير متصلة بالشبكة — الإدخال يدوي",
                "Devices are not network-connected — manual entry",
              )}
            </strong>
            <p>
              {tr(
                "تعرض هذه الشاشة آخر قراءة محفوظة، وليست بثًا مباشرًا من الجهاز. لا تحل محل شاشة الجهاز أو إنذاراته. يتحدث السجل كل 5 ثوانٍ أثناء ظهور الصفحة.",
                "This screen shows the last saved reading, not a live device feed. It does not replace the device display or its alarms. Records refresh every 5 seconds while this page is visible.",
              )}
            </p>
          </div>
        </div>
        {error && (
          <div className="error-box" role="alert">
            <div>
              <strong>{error}</strong>
              <p>
                {tr(
                  "البيانات الظاهرة من آخر تحميل ناجح وقد تكون قديمة. حدّث الاتصال قبل تسجيل قراءة أو تغيير الربط.",
                  "Displayed data comes from the last successful load and may be outdated. Restore the connection before recording or changing a link.",
                )}
              </p>
            </div>
          </div>
        )}
        <div className="table-toolbar">
          <input
            type="search"
            aria-label={tr(
              "بحث المتابعة بالاسم أو الملف أو السرير",
              "Search monitoring by name, record number or bed",
            )}
            placeholder={tr(
              "ابحث باسم الطفل أو رقم الملف أو السرير…",
              "Search infant name, record number or bed…",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <small>
            {loadedAt
              ? `${tr("آخر تحميل للسجل", "Records last loaded")}: ${date(loadedAt, true)}`
              : tr("جارٍ تحميل السجل…", "Loading records…")}
          </small>
        </div>
      </Section>
      {!data && !error && (
        <div className="loading">
          {tr(
            "جارٍ تحميل قراءات المتابعة…",
            "Loading monitoring observations…",
          )}
        </div>
      )}
      {data && rows.length === 0 && (
        <div className="info-box">
          {tr(
            "لا توجد إقامات مطابقة ضمن نطاق صلاحياتك.",
            "No matching admissions within your access scope.",
          )}
        </div>
      )}
      <div className="monitoring-grid">
        {rows.map((a: Row) => {
          const reading = a.latest_vitals,
            binding = a.binding;
          const values = [
            ["heart_rate", tr("النبض", "Heart rate"), tr("/ دقيقة", "/ min")],
            [
              "respiratory_rate",
              tr("التنفس", "Respiration"),
              tr("/ دقيقة", "/ min"),
            ],
            ["spo2", "SpO₂", "%"],
            ["temperature", tr("الحرارة", "Temperature"), "°C"],
            ["bilirubin_total", tr("الصفراء الكلية", "Total bilirubin"), "mg/dL"],
            ["bilirubin_direct", tr("الصفراء المباشرة", "Direct bilirubin"), "mg/dL"],
          ];
          return (
            <Section
              key={a.id}
              title={a.patient_name}
              sub={`${a.mrn} · ${a.bed_name || tr("دون سرير", "No bed")}`}
              action={
                <button
                  className="button small"
                  onClick={() => openPatient(a.patient_id, a.id, "nursing")}
                >
                  <FileText size={15} />
                  {tr("ملف التمريض", "Nursing chart")}
                </button>
              }
            >
              <p>
                <strong>{tr("الجهاز المرتبط", "Linked equipment")}: </strong>
                {binding
                  ? `${binding.equipment_name} · ${binding.equipment_code}`
                  : tr("غير مربوط", "Not linked")}
              </p>
              {binding && !binding.is_current && (
                <div className="error-box">
                  {tr(
                    "الربط غير صالح للسرير الحالي أو الجهاز غير جاهز. أعد الربط بعد التحقق قبل تسجيل قراءة.",
                    "The link is stale for the current bed or equipment is not ready. Verify and relink before recording.",
                  )}
                </div>
              )}
              <div className="monitor-values">
                {values.map(([key, label, unit]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>{value(reading?.[key])}</strong>
                    <small>{unit}</small>
                  </div>
                ))}
              </div>
              {reading ? (
                <div className="monitor-record-meta">
                  <p>
                    <strong>
                      {tr("قراءة يدوية محفوظة", "Saved manual reading")}
                    </strong>{" "}
                    · {tr("وقت القياس", "Measured at")}:{" "}
                    {date(reading.measured_at, true)}
                  </p>
                  <p>
                    {tr("سجلها", "Recorded by")}:{" "}
                    {reading.actor_name || tr("غير مسجل", "Not recorded")} ·{" "}
                    {tr("وقت التسجيل", "Recorded at")}:{" "}
                    {date(reading.created_at, true)}
                  </p>
                </div>
              ) : (
                <p>
                  {tr(
                    "لم تسجل قياسات لهذه الإقامة بعد.",
                    "No observations have been recorded for this admission.",
                  )}
                </p>
              )}
              <div className="button-row">
                {mayBind && (
                  <button
                    className="button small"
                    onClick={() => bind(a)}
                    disabled={!!error || !a.bed_id || !data?.equipment?.length}
                  >
                    <Link2 size={15} />
                    {binding
                      ? tr("إعادة الربط", "Relink")
                      : tr("ربط جهاز", "Link equipment")}
                  </button>
                )}
                {mayBind && binding && (
                  <button
                    className="button small"
                    onClick={() => unbind(a)}
                    disabled={!!error}
                  >
                    <Unlink size={15} />
                    {tr("فك الربط", "Unlink")}
                  </button>
                )}
                {mayRecord && (
                  <button
                    className="button primary small"
                    onClick={() => record(a)}
                    disabled={!!error}
                  >
                    <Plus size={15} />
                    {tr("إضافة قراءة يدوية", "Add manual reading")}
                  </button>
                )}
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
