import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeDollarSign,
  ClipboardList,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Tag,
  Wrench,
} from "lucide-react";
import { getLanguage, getLocale, useLanguage } from "./i18n";
import {
  api,
  date,
  field,
  fmt,
  FormSpec,
  money,
  nowInput,
  Row,
  Section,
  Table,
} from "./shared";
import "./equipment.css";
type Props = {
  can: (permission: string) => boolean;
  openForm: (spec: FormSpec) => void;
  notify: (text: string, error?: boolean) => void;
  revision: number;
  refresh: () => void;
  admissionId?: string;
  patientMrn?: string;
  patientName?: string;
  admissionActive?: boolean;
};
type EquipmentState = { scope: string; catalog: Row[]; history: Row[] };
const quantity = (value: unknown) =>
  new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(
    Number(value),
  );
const unitLabel = (unit: string) =>
  ({
    use: getLanguage() === "en" ? "use" : "استخدام",
    hour: getLanguage() === "en" ? "hour" : "ساعة",
    day: getLanguage() === "en" ? "day" : "يوم",
  })[unit] || unit;
export default function Equipment({
  can,
  openForm,
  notify,
  revision,
  refresh,
  admissionId,
  patientMrn,
  patientName,
  admissionActive,
}: Props) {
  const english = useLanguage() === "en";
  const [state, setState] = useState<EquipmentState | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [patients, setPatients] = useState<Row[]>([]),
    [patientsError, setPatientsError] = useState(""),
    [localRevision, setLocalRevision] = useState(0);
  const scope = admissionId || "department";
  const read = can("consumables.read") || can("beds.write"),
    manage = can("consumables.catalog") || can("beds.write"),
    canUse =
      can("consumables.use") &&
      can("patients.read") &&
      admissionActive !== false;
  const requestedScope = useRef(scope);
  requestedScope.current = scope;
  useEffect(() => {
    if (!read) return;
    let active = true;
    setState(null);
    setError("");
    setPatientsError("");
    setPatients([]);
    api(
      "/equipment" +
        (admissionId ? "?admission_id=" + encodeURIComponent(admissionId) : ""),
    )
      .then((result) => {
        if (active)
          setState({
            scope,
            catalog: result.catalog || [],
            history: result.history || [],
          });
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    if (!admissionId && canUse)
      api("/patients")
        .then((result) => {
          if (active)
            setPatients(
              (Array.isArray(result) ? result : result.patients || []).filter(
                (patient: Row) =>
                  patient.admission_id && patient.admission_status === "active",
              ),
            );
        })
        .catch((reason) => {
          if (active) setPatientsError(reason.message);
        });
    return () => {
      active = false;
    };
  }, [revision, localRevision, admissionId, scope, read, canUse]);
  function reload() {
    setLocalRevision((value) => value + 1);
    refresh();
  }
  function done() {
    reload();
    notify(
      getLanguage() === "en"
        ? "Equipment operation saved."
        : "تم حفظ عملية الجهاز.",
    );
  }
  function create() {
    openForm({
      title: english ? "Add medical equipment" : "إضافة جهاز طبي",
      note: english
        ? "New equipment is marked ready. Set a unit price before recording chargeable use."
        : "يُضاف الجهاز بحالة جاهز. حدّد سعر الوحدة قبل تسجيل الاستخدام على الحساب.",
      fields: [
        field("code", english ? "Equipment code" : "كود الجهاز", "text", true),
        field("name", english ? "Equipment name" : "اسم الجهاز", "text", true),
        field(
          "serial_number",
          english ? "Serial number" : "الرقم التسلسلي",
          "text",
          false,
        ),
        field("location", english ? "Location" : "الموقع", "text", false),
        field("unit", english ? "Pricing unit" : "وحدة التسعير", "text", true, {
          options: ["use", "hour", "day"].map((unit) => ({
            value: unit,
            label: unitLabel(unit),
          })),
          value: "use",
        }),
        ...(can("prices.write")
          ? [
              field(
                "unit_price",
                english
                  ? "Unit price (EGP, optional)"
                  : "سعر الوحدة (ج.م، اختياري)",
                "number",
                false,
                {
                  min: 0,
                  max: 1000000,
                  step: "0.01",
                  help: english
                    ? "A missing price blocks use. An explicit zero price is accepted."
                    : "ترك السعر فارغًا يمنع الاستخدام. السعر صفر مقبول إذا أُدخل صراحةً.",
                },
              ),
            ]
          : []),
      ],
      submit: async (values) => {
        const result = await api("/equipment", values);
        done();
        return result;
      },
    });
  }
  function changeStatus(item: Row) {
    openForm({
      title: english ? "Update equipment availability" : "تحديث جاهزية الجهاز",
      subtitle: item.name + " · " + item.code,
      fields: [
        field(
          "status",
          english ? "Equipment status" : "حالة الجهاز",
          "text",
          true,
          {
            options: [
              { value: "ready", label: english ? "Ready" : "جاهز" },
              {
                value: "maintenance",
                label: english ? "Under maintenance" : "تحت الصيانة",
              },
              {
                value: "out_of_service",
                label: english ? "Out of service" : "خارج الخدمة",
              },
            ],
            value: item.status,
          },
        ),
        field(
          "reason",
          english ? "Reason for status change" : "سبب تغيير الحالة",
          "textarea",
          true,
          { wide: true },
        ),
      ],
      note: english
        ? "Equipment under maintenance or out of service cannot be used. Historical charges are preserved."
        : "لا يمكن استخدام الأجهزة تحت الصيانة أو خارج الخدمة. تبقى الرسوم السابقة محفوظة.",
      submit: async (values) => {
        const result = await api(
          "/equipment/" + encodeURIComponent(item.id),
          { ...values, version: item.version },
          "PATCH",
        );
        done();
        return result;
      },
    });
  }
  function setPrice(item: Row) {
    openForm({
      title: english ? "Set equipment price" : "تحديد سعر الجهاز",
      subtitle: item.name + " · " + item.code,
      note: english
        ? "The new price applies to future use. Earlier usage keeps its saved price and charge."
        : "يسري السعر الجديد على الاستخدامات التالية. يحتفظ الاستخدام السابق بسعره ورسمه المسجلين.",
      fields: [
        field(
          "unit_price",
          english
            ? "Price per " + unitLabel(item.unit) + " (EGP)"
            : "سعر " + unitLabel(item.unit) + " (ج.م)",
          "number",
          true,
          { min: 0, max: 1000000, step: "0.01", value: item.unit_price ?? "" },
        ),
      ],
      submit: async (values) => {
        const result = await api(
          "/equipment/" + encodeURIComponent(item.id),
          { ...values, version: item.version },
          "PATCH",
        );
        done();
        return result;
      },
    });
  }
  function recordUse(item: Row) {
    if (
      item.status !== "ready" ||
      item.unit_price === null ||
      item.unit_price === undefined
    )
      return;
    const selectedScope = scope;
    const spec: FormSpec & { preview?: (values: Row) => ReactNode } = {
      title: english ? "Record equipment use" : "تسجيل استخدام جهاز",
      subtitle:
        item.name +
        " · " +
        item.code +
        " · " +
        money(item.unit_price) +
        " / " +
        unitLabel(item.unit),
      sensitive: true,
      note: english
        ? "Confirm the infant’s medical record number. Saving records the use and its charge together on this admission."
        : "أكد رقم ملف الطفل. يحفظ النظام الاستخدام ويضيف رسمه إلى حساب الإقامة في العملية نفسها.",
      fields: [
        ...(!admissionId
          ? [
              Object.assign(
                field(
                  "admission_id",
                  english ? "Infant / admission" : "الطفل / الإقامة",
                  "text",
                  true,
                  {
                    options: patients.map((patient) => ({
                      value: patient.admission_id,
                      label: [
                        patient.name,
                        patient.mrn,
                        patient.admission_no,
                        patient.bed_name,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    })),
                  },
                ),
                { searchable: true },
              ),
            ]
          : []),
        field(
          "confirm_mrn",
          english ? "Re-enter medical record number" : "أعد إدخال رقم الملف",
          "text",
          true,
          {
            help: admissionId
              ? [patientName, patientMrn].filter(Boolean).join(" · ")
              : english
                ? "Enter the medical record number of the selected infant."
                : "أدخل رقم الملف المطابق للطفل المختار.",
          },
        ),
        field(
          "quantity",
          english
            ? "Quantity (" + unitLabel(item.unit) + ")"
            : "الكمية (" + unitLabel(item.unit) + ")",
          "number",
          true,
          { min: 0.001, max: 100000, step: "0.001", value: 1 },
        ),
        field(
          "used_at",
          english ? "Actual use time" : "وقت الاستخدام الفعلي",
          "datetime-local",
          true,
          { value: nowInput() },
        ),
        field(
          "notes",
          english ? "Use notes" : "ملاحظات الاستخدام",
          "textarea",
          false,
          { wide: true },
        ),
      ],
      preview: (values) => {
        const amount = Number(values.quantity);
        const valid = Number.isFinite(amount) && amount > 0 && amount <= 100000;
        return (
          <div className="equipment-price-preview">
            <BadgeDollarSign size={22} />
            <div>
              <strong>
                {getLanguage() === "en" ? "Expected charge" : "الرسم المتوقع"}:{" "}
                {valid
                  ? money(
                      Math.round(amount * Number(item.unit_price) * 100) / 100,
                    )
                  : "—"}
              </strong>
              <small>
                {valid ? quantity(amount) : "—"} × {money(item.unit_price)} /{" "}
                {unitLabel(item.unit)} ·{" "}
                {getLanguage() === "en"
                  ? "Price is checked again when saving."
                  : "يُراجع السعر مجددًا عند الحفظ."}
              </small>
            </div>
          </div>
        );
      },
      submit: async (values) => {
        if (requestedScope.current !== selectedScope)
          throw Error(
            getLanguage() === "en"
              ? "The displayed admission changed. Close this draft and select the correct admission."
              : "تغيرت الإقامة المعروضة. أغلق المسودة واختر الإقامة الصحيحة.",
          );
        const aid = admissionId || values.admission_id;
        if (!aid)
          throw Error(
            getLanguage() === "en"
              ? "Choose an infant admission."
              : "اختر إقامة الطفل.",
          );
        const result = await api(
          "/admissions/" + encodeURIComponent(aid) + "/equipment",
          {
            equipment_id: item.id,
            equipment_version: item.version,
            quantity: values.quantity,
            used_at: values.used_at,
            confirm_mrn: values.confirm_mrn,
            notes: values.notes,
            idempotency_key: values.idempotency_key,
          },
        );
        done();
        return result;
      },
    };
    openForm(spec);
  }
  if (!read) return null;
  const data = state?.scope === scope ? state : null;
  const statusLabel = (status: string) =>
    ({
      ready: english ? "Ready" : "جاهز",
      maintenance: english ? "Under maintenance" : "تحت الصيانة",
      out_of_service: english ? "Out of service" : "خارج الخدمة",
    })[status] || status;
  const catalog = (data?.catalog || []).filter(
    (item) =>
      [item.name, item.code, item.serial_number, item.location]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (statusFilter === "all" || item.status === statusFilter),
  );
  const ready = (data?.catalog || []).filter(
      (item) => item.status === "ready",
    ).length,
    unpriced = (data?.catalog || []).filter(
      (item) => item.unit_price === null || item.unit_price === undefined,
    ).length;
  return (
    <div className="equipment-module">
      {error && (
        <div className="error-box" role="alert">
          {error}
          <button className="button small" onClick={reload}>
            {english ? "Retry" : "إعادة المحاولة"}
          </button>
        </div>
      )}
      <Section
        title={english ? "Medical equipment" : "الأجهزة الطبية"}
        sub={
          admissionId
            ? [patientName, patientMrn].filter(Boolean).join(" · ")
            : english
              ? "Readiness, pricing and equipment use linked to admission charges"
              : "الجاهزية والأسعار والاستخدام المرتبط برسوم إقامة الطفل"
        }
        action={
          <div className="inline-actions">
            <button
              className="button small"
              aria-label={english ? "Refresh equipment" : "تحديث الأجهزة"}
              onClick={reload}
            >
              <RefreshCw size={16} />
            </button>
            {can("consumables.catalog") && (
              <button className="button primary" onClick={create}>
                <Plus size={17} />
                {english ? "Add equipment" : "إضافة جهاز"}
              </button>
            )}
          </div>
        }
      >
        {!data && !error ? (
          <div className="loading">
            <LoaderCircle size={25} className="spin" />
            {english ? "Loading equipment…" : "تحميل الأجهزة…"}
          </div>
        ) : (
          data && (
            <>
              <div className="equipment-summary">
                <div>
                  <Stethoscope size={20} />
                  <span>
                    {english ? "Registered devices" : "الأجهزة المسجلة"}
                    <strong>{fmt(data.catalog.length)}</strong>
                  </span>
                </div>
                <div>
                  <Activity size={20} />
                  <span>
                    {english ? "Ready devices" : "الأجهزة الجاهزة"}
                    <strong>{fmt(ready)}</strong>
                  </span>
                </div>
                <div>
                  <Tag size={20} />
                  <span>
                    {english ? "Awaiting a price" : "بانتظار التسعير"}
                    <strong>{fmt(unpriced)}</strong>
                  </span>
                </div>
              </div>
              <div className="table-toolbar">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      english
                        ? "Name, code, serial or location…"
                        : "الاسم أو الكود أو الرقم التسلسلي أو الموقع…"
                    }
                    aria-label={english ? "Search equipment" : "بحث الأجهزة"}
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label={
                    english ? "Equipment status filter" : "تصفية حالة الأجهزة"
                  }
                >
                  <option value="all">
                    {english ? "All statuses" : "جميع الحالات"}
                  </option>
                  {["ready", "maintenance", "out_of_service"].map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              {patientsError && (
                <div
                  className="error-box"
                  role="alert"
                  style={{ margin: "15px 20px" }}
                >
                  {english
                    ? "The infant list could not be loaded: "
                    : "تعذّر تحميل قائمة الأطفال: "}
                  {patientsError}
                  <button className="button small" onClick={reload}>
                    {english ? "Retry" : "إعادة المحاولة"}
                  </button>
                </div>
              )}
              <Table
                headers={[
                  english ? "Device" : "الجهاز",
                  english ? "Location / serial" : "الموقع / الرقم التسلسلي",
                  english ? "Status" : "الحالة",
                  english ? "Unit price" : "سعر الوحدة",
                  english ? "Actions" : "الإجراءات",
                ]}
                rows={catalog.map((item) => {
                  const priced =
                    item.unit_price !== null && item.unit_price !== undefined;
                  const usable =
                    item.status === "ready" &&
                    priced &&
                    (!!admissionId || patients.length > 0);
                  return [
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.code}</small>
                    </div>,
                    <div>
                      {item.location || "—"}
                      <small>{item.serial_number || "—"}</small>
                    </div>,
                    <div>
                      <span
                        className={
                          "badge " +
                          (item.status === "ready" ? "available" : item.status)
                        }
                      >
                        {statusLabel(item.status)}
                      </span>
                      {item.reason && <small>{item.reason}</small>}
                    </div>,
                    <div>
                      <strong>
                        {priced
                          ? money(item.unit_price)
                          : english
                            ? "Not priced"
                            : "غير مسعّر"}
                      </strong>
                      <small>
                        {english ? "per " : "لكل "}
                        {unitLabel(item.unit)}
                      </small>
                    </div>,
                    <div className="equipment-actions">
                      {canUse && (
                        <button
                          className="button primary small"
                          onClick={() => recordUse(item)}
                          disabled={!usable}
                          title={
                            !priced
                              ? english
                                ? "Set a price first"
                                : "حدد السعر أولًا"
                              : item.status !== "ready"
                                ? english
                                  ? "Device is unavailable for use"
                                  : "الجهاز غير متاح للاستخدام"
                                : !admissionId && !patients.length
                                  ? english
                                    ? "No active admissions available"
                                    : "لا توجد إقامات نشطة متاحة"
                                  : undefined
                          }
                        >
                          <Activity size={15} />
                          {english ? "Record use" : "تسجيل استخدام"}
                        </button>
                      )}
                      {manage && (
                        <button
                          className="button small"
                          onClick={() => changeStatus(item)}
                        >
                          <Wrench size={15} />
                          {english ? "Status" : "الحالة"}
                        </button>
                      )}
                      {manage && can("prices.write") && (
                        <button
                          className="button small"
                          onClick={() => setPrice(item)}
                        >
                          <Tag size={15} />
                          {english ? "Price" : "السعر"}
                        </button>
                      )}
                    </div>,
                  ];
                })}
              />
              <div className="equipment-explanation">
                <ShieldCheck size={17} />
                <span>
                  {english
                    ? "Use is blocked for unpriced, maintenance and out-of-service devices. A ready device still needs a documented price."
                    : "يُمنع استخدام الجهاز غير المسعّر أو تحت الصيانة أو خارج الخدمة. الجاهزية وحدها لا تُغني عن تحديد السعر."}
                </span>
              </div>
            </>
          )
        )}
      </Section>
      {data && can("patients.read") && (
        <Section
          title={english ? "Recorded equipment use" : "سجل استخدام الأجهزة"}
          sub={
            english
              ? "Latest 500 uses in your access scope; prices remain as recorded at use time"
              : "آخر ٥٠٠ استخدام ضمن نطاق اطلاعك؛ تبقى الأسعار كما سُجلت وقت الاستخدام"
          }
        >
          <Table
            headers={[
              english ? "Device / infant" : "الجهاز / الطفل",
              english ? "Quantity" : "الكمية",
              english ? "Saved unit price" : "سعر الوحدة المحفوظ",
              english ? "Charge" : "الرسم",
              english ? "Use time" : "وقت الاستخدام",
              english ? "Recorded by" : "مسجل الاستخدام",
            ]}
            rows={data.history.map((item) => [
              <div>
                <strong>{item.name_snapshot}</strong>
                <small>{item.code_snapshot}</small>
                <small>
                  {item.patient_name} · {item.mrn}
                </small>
                <small>{item.admission_no}</small>
              </div>,
              quantity(item.quantity) + " " + unitLabel(item.unit_snapshot),
              money(item.unit_price),
              money(item.amount),
              <div>
                {date(item.used_at, true)}
                {item.notes && <small>{item.notes}</small>}
              </div>,
              <div>
                {item.actor_name}
                <small>{date(item.created_at, true)}</small>
              </div>,
            ])}
          />
        </Section>
      )}
    </div>
  );
}
