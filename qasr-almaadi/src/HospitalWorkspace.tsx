import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  BedDouble,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
} from "lucide-react";
import {
  api,
  Badge,
  date,
  Empty,
  FormModal,
  type FormSpec,
  type Field,
  fmt,
  money,
  nowInput,
  type Row,
  searchText,
  Section,
  Table,
} from "./shared";
import { useLanguage } from "./i18n";
import "./hospital.css";

type Props = {
  page: string;
  user: Row;
  onPatient: (id: string, admissionId?: string, tab?: string) => void;
  notify: (message: string) => void;
};
const encounterTypes = ["outpatient", "emergency", "inpatient", "icu", "nicu"];
const departmentTypes = [
  ...encounterTypes,
  "radiology",
  "lab",
  "pharmacy",
  "surgery",
];
const triageTypes = [
  "immediate",
  "very_urgent",
  "urgent",
  "standard",
  "non_urgent",
];
const words: Record<string, [string, string]> = {
  hospital: ["مركز المستشفى", "Hospital overview"],
  appointments: ["المواعيد والاستقبال", "Appointments & reception"],
  outpatient: ["العيادات الخارجية", "Outpatient clinics"],
  emergency: ["الطوارئ والفرز", "Emergency & triage"],
  inpatient: ["الإقامة والأقسام الداخلية", "Inpatient care"],
  departments: ["أقسام المستشفى", "Hospital departments"],
  radiology: ["الأشعة والتقارير", "Radiology & reports"],
  pharmacy: ["الصيدلية وصرف الأدوية", "Pharmacy & dispensing"],
  surgery: ["العمليات الجراحية", "Surgery"],
  icu: ["العناية المركزة", "Intensive care"],
  nicu: ["حضّانات حديثي الولادة", "Neonatal care"],
  lab: ["المعمل", "Laboratory"],
  immediate: ["إنعاش فوري", "Immediate"],
  very_urgent: ["عاجل جدًا", "Very urgent"],
  urgent: ["عاجل", "Urgent"],
  standard: ["اعتيادي", "Standard"],
  non_urgent: ["غير عاجل", "Non-urgent"],
  active: ["زيارة مفتوحة", "Open encounter"],
  discharged: ["خرج", "Discharged"],
  scheduled: ["مجدول", "Scheduled"],
  arrived: ["حضر", "Arrived"],
  completed: ["مكتمل", "Completed"],
  cancelled: ["ملغي", "Cancelled"],
  ordered: ["طلب جديد", "Ordered"],
  performed: ["تم الفحص", "Performed"],
  reported: ["التقرير جاهز", "Reported"],
  reviewed: ["تمت المراجعة", "Reviewed"],
  in_progress: ["جارٍ التنفيذ", "In progress"],
  routine: ["عادي", "Routine"],
  approved: ["معتمد", "Approved"],
};

export default function HospitalWorkspace({
  page,
  user,
  onPatient,
  notify,
}: Props) {
  const en = useLanguage() === "en",
    tr = (ar: string, eng: string) => (en ? eng : ar);
  const label = (value: string) => words[value]?.[en ? 1 : 0] || value || "—";
  const can = (permission: string) => !!user?.permissions?.includes(permission);
  const [data, setData] = useState<Row>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  const [form, setForm] = useState<FormSpec | null>(null),
    [details, setDetails] = useState<Row | null>(null);
  const [admissionFilter, setAdmissionFilter] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("admission") || "",
  );
  const reload = () => setRevision((value) => value + 1);
  useEffect(() => {
    setSearch("");
    setFilter("");
    setForm(null);
    setDetails(null);
  }, [page]);
  useEffect(() => {
    const changed = () =>
      setAdmissionFilter(
        new URLSearchParams(window.location.hash.slice(1)).get("admission") ||
          "",
      );
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (!details) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetails(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [details]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    const paths: Record<string, string> = {};
    if (can("patients.read") && page !== "departments")
      paths.overview = "/hospital/overview";
    if (page === "departments") paths.departments = "/hospital/departments";
    if (page === "appointments") paths.appointments = "/hospital/appointments";
    if (["radiology", "surgery", "pharmacy"].includes(page))
      paths[page] = `/hospital/${page === "surgery" ? "surgeries" : page}`;
    if (
      can("patients.read") &&
      [
        "appointments",
        "emergency",
        "outpatient",
        "inpatient",
        "surgery",
      ].includes(page)
    )
      paths.users = "/users";
    if (can("patients.read") && ["appointments"].includes(page))
      paths.patients = "/patients";
    if (
      (can("patients.read") || can("beds.write")) &&
      ["emergency", "outpatient", "inpatient"].includes(page)
    )
      paths.beds = "/beds";
    if (can("clinical.write") && ["radiology", "surgery"].includes(page))
      paths.prices = "/hospital/service-prices";
    Promise.all(
      Object.entries(paths).map(
        async ([key, path]) => [key, await api(path)] as const,
      ),
    )
      .then((results) => {
        if (current) setData(Object.fromEntries(results));
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, revision, user.id, JSON.stringify(user.permissions)]);

  const departments: Row[] =
    data.departments || data.overview?.departments || [];
  const encounters: Row[] = data.overview?.encounters || [];
  const active = encounters.filter((row) => row.status === "active");
  const staff: Row[] = data.users || [],
    doctors = staff.filter(
      (row) => row.active !== false && ["doctor", "manager"].includes(row.role),
    );
  const findRows = (rows: Row[]) =>
    rows.filter(
      (row) =>
        (!admissionFilter ||
          (row.admission_id || (row.encounter_type ? row.id : "")) ===
            admissionFilter) &&
        (!search ||
          searchText(
            [
              row.patient_name,
              row.name,
              row.mrn,
              row.department_name,
              row.doctor_name,
              row.theatre,
              row.item_name,
            ].join(" "),
          ).includes(searchText(search))),
    );
  const status = (value: string) => <Badge value={value}>{label(value)}</Badge>;
  const doctorOptions = doctors.map((row) => ({
    value: row.id,
    label: row.name,
  }));
  const encounterOptions = active.map((row) => ({
    value: row.id,
    label: `${row.patient_name} · ${row.mrn} · ${row.department_name || label(row.encounter_type)}`,
  }));
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: label(value) }));
  const go = (target: string) => {
    window.location.hash = new URLSearchParams({ page: target }).toString();
  };
  const patientCell = (row: Row) => (
    <div className="hospital-patient-cell">
      {can("patients.read") ? (
        <button
          className="hospital-text-link"
          onClick={() =>
            onPatient(
              row.patient_id || row.id,
              row.admission_id || (row.encounter_type ? row.id : undefined),
            )
          }
        >
          {row.patient_name || row.name}
        </button>
      ) : (
        <strong>{row.patient_name || row.name}</strong>
      )}
      <small>{row.mrn || "—"}</small>
    </div>
  );
  const chartButton = (row: Row) =>
    can("patients.read") && (
      <button
        className="button tiny"
        onClick={() => onPatient(row.patient_id, row.admission_id || row.id)}
      >
        <FileText size={13} />
        {tr("الملف", "Chart")}
      </button>
    );
  const accountButton = (row: Row) =>
    can("billing.read") &&
    can("patients.read") && (
      <button
        className="button tiny"
        onClick={() =>
          onPatient(row.patient_id, row.admission_id || row.id, "billing")
        }
      >
        {tr("الحساب", "Account")}
      </button>
    );
  function openForm(spec: FormSpec) {
    setForm({
      ...spec,
      submit: async (values) => {
        await spec.submit(values);
        notify(
          tr(
            "تم حفظ الإجراء وتحديث السجل المرتبط",
            "Action saved and linked record updated",
          ),
        );
      },
    });
  }
  const activePrices = (data.prices || []).filter(
    (p: Row) =>
      p.active !== false &&
      !p.consumable_id &&
      (!p.valid_to || new Date(p.valid_to) >= new Date()) &&
      (!p.valid_from || new Date(p.valid_from) <= new Date()),
  );
  const priceField: Field[] = activePrices.length
    ? [
        {
          name: "price_id",
          label: tr(
            "الخدمة المحاسبية (اختياري)",
            "Billable service (optional)",
          ),
          options: activePrices.map((p: Row) => ({
            value: p.id,
            label: `${p.name} · ${money(p.price)}`,
          })),
          help: tr(
            "تُضاف الخدمة إلى حساب نفس الزيارة حسب دورة تنفيذ الطلب.",
            "The service is charged to this encounter according to the order workflow.",
          ),
        },
      ]
    : [];

  function appointmentForm() {
    const patients = Array.from(
      new Map<string, Row>(
        (data.patients || []).map((p: Row) => [p.id, p]),
      ).values(),
    );
    openForm({
      title: tr("حجز موعد", "Book appointment"),
      subtitle: tr(
        "اختر ملف المريض والقسم لربط الموعد بزيارته عند الحضور.",
        "Choose the patient and department. Check-in links the appointment to an encounter.",
      ),
      fields: [
        {
          name: "patient_id",
          label: tr("المريض", "Patient"),
          required: true,
          searchable: true,
          options: patients.map((p) => ({
            value: p.id,
            label: `${p.name} · ${p.mrn}`,
          })),
        },
        {
          name: "department_id",
          label: tr("العيادة", "Clinic"),
          required: true,
          options: departments
            .filter((d) => d.active && d.type === "outpatient")
            .map((d) => ({ value: d.id, label: d.name })),
        },
        {
          name: "doctor_id",
          label: tr("الطبيب", "Doctor"),
          options: doctorOptions,
          required: true,
        },
        {
          name: "scheduled_at",
          label: tr("موعد الزيارة", "Appointment time"),
          type: "datetime-local",
          value: nowInput(),
          required: true,
        },
        {
          name: "duration_minutes",
          label: tr("مدة الموعد بالدقائق", "Appointment duration (minutes)"),
          type: "number",
          min: 5,
          max: 240,
          step: "1",
          value: 30,
          required: true,
        },
        {
          name: "notes",
          label: tr("ملاحظات الحجز", "Booking notes"),
          type: "textarea",
          wide: true,
        },
      ],
      submit: (values) => api("/hospital/appointments", values),
    });
  }
  function appointmentAction(row: Row, next: string) {
    const checkIn = next === "check-in";
    openForm({
      title: checkIn
        ? tr("تسجيل الحضور وفتح الزيارة", "Check in & open encounter")
        : tr("تحديث الموعد", "Update appointment"),
      subtitle: `${row.patient_name} · ${date(row.scheduled_at, true)}`,
      note: checkIn
        ? tr(
            "سيُربط الموعد بزيارة المريض في القسم، ويظل الملف والحساب متصلين بنفس الزيارة.",
            "The appointment will link to the patient's department encounter, retaining the connected chart and account.",
          )
        : `${tr("الحالة الجديدة", "New status")}: ${label(next)}`,
      fields:
        next === "cancelled"
          ? [
              {
                name: "reason",
                label: tr("سبب الإلغاء", "Cancellation reason"),
                type: "textarea",
                required: true,
                wide: true,
              },
            ]
          : [],
      button: checkIn
        ? tr("تسجيل الحضور", "Check in")
        : tr("حفظ الحالة", "Save status"),
      submit: async (values) => {
        await api(
          `/hospital/appointments/${row.id}/${checkIn ? "check-in" : "transition"}`,
          {
            ...values,
            version: row.version,
            ...(checkIn ? {} : { status: next }),
          },
        );
      },
    });
  }
  function transferForm(row: Row) {
    const availableBeds = (data.beds || []).filter(
      (bed: Row) =>
        ["available", "reserved"].includes(bed.status) || bed.id === row.bed_id,
    );
    openForm({
      title: tr(
        "نقل المريض بين الأقسام",
        "Transfer patient between departments",
      ),
      subtitle: `${row.patient_name} · ${row.mrn}`,
      initial: {
        department_id: row.department_id,
        encounter_type: row.encounter_type,
        bed_id: row.bed_id || "",
        doctor_id: row.doctor_id || "",
        nurse_id: row.nurse_id || "",
      },
      note: tr(
        "يستمر ملف المريض وطلباته وحسابه على نفس الزيارة، مع تسجيل القسم السابق والجديد.",
        "The chart, orders and account stay on the same encounter, with the department transfer recorded.",
      ),
      fields: [
        {
          name: "department_id",
          label: tr("القسم الجديد", "Destination department"),
          required: true,
          options: departments
            .filter(
              (d) =>
                d.active && [...encounterTypes, "surgery"].includes(d.type),
            )
            .map((d) => ({
              value: d.id,
              label: `${d.name} · ${label(d.type)}`,
            })),
        },
        {
          name: "bed_id",
          label: tr("السرير في القسم الجديد", "Destination bed"),
          options: availableBeds.map((bed: Row) => ({
            value: bed.id,
            label: `${bed.name} · ${bed.department_name || departments.find((d) => d.id === bed.department_id)?.name || "—"}`,
          })),
          help: tr(
            "اختر سريرًا تابعًا للقسم الجديد. عند النقل للعيادة الخارجية ألغِ اختيار السرير.",
            "Choose a bed belonging to the destination department. Clear the bed when transferring to outpatient care.",
          ),
        },
        {
          name: "doctor_id",
          label: tr("الطبيب المسؤول", "Responsible doctor"),
          options: doctorOptions,
        },
        {
          name: "nurse_id",
          label: tr("الممرض المسؤول", "Responsible nurse"),
          options: staff
            .filter(
              (s) =>
                s.active !== false && ["nurse", "head_nurse"].includes(s.role),
            )
            .map((s) => ({ value: s.id, label: s.name })),
        },
        {
          name: "reason",
          label: tr("سبب النقل", "Transfer reason"),
          required: true,
          type: "textarea",
          wide: true,
        },
      ],
      submit: (values) => {
        const department = departments.find(
          (d) => d.id === values.department_id,
        );
        const selectedBed = availableBeds.find(
          (bed: Row) => bed.id === values.bed_id,
        );
        if (values.bed_id && selectedBed?.department_id !== department?.id)
          throw new Error(
            tr(
              "السرير المختار لا يتبع القسم الجديد؛ اختر سريرًا من نفس القسم أو ألغِ اختياره.",
              "The selected bed does not belong to the destination department. Choose a matching bed or clear the selection.",
            ),
          );
        if (department?.type === "outpatient" && values.bed_id)
          throw new Error(
            tr(
              "ألغِ اختيار السرير عند النقل إلى العيادة الخارجية.",
              "Clear the bed when transferring to an outpatient clinic.",
            ),
          );
        return api(`/hospital/encounters/${row.id}/transfer`, {
          ...values,
          doctor_id: values.doctor_id || undefined,
          encounter_type:
            department?.type === "surgery" ? "inpatient" : department?.type,
          version: row.version,
        });
      },
    });
  }
  function triageForm(row: Row) {
    openForm({
      title: tr("تسجيل فرز الطوارئ", "Record emergency triage"),
      subtitle: `${row.patient_name} · ${row.mrn}`,
      initial: { triage_level: row.triage_level || "" },
      fields: [
        {
          name: "triage_level",
          label: tr("درجة الفرز", "Triage level"),
          required: true,
          options: options(triageTypes),
        },
        {
          name: "notes",
          label: tr("ملاحظات التقييم", "Assessment notes"),
          required: true,
          type: "textarea",
          wide: true,
        },
      ],
      submit: (values) =>
        api(`/hospital/encounters/${row.id}/triage`, {
          ...values,
          version: row.version,
        }),
    });
  }
  function departmentForm(row?: Row) {
    openForm({
      title: row
        ? tr("تعديل القسم", "Edit department")
        : tr("إضافة قسم", "Add department"),
      initial: row || { active: true },
      fields: [
        {
          name: "name",
          label: tr("اسم القسم", "Department name"),
          required: true,
        },
        {
          name: "type",
          label: tr("نوع القسم", "Department type"),
          required: true,
          options: options(departmentTypes),
        },
        ...(row
          ? [
              {
                name: "active",
                label: tr(
                  "القسم نشط ويستقبل المرضى",
                  "Department active for patient care",
                ),
                type: "checkbox",
              },
            ]
          : []),
      ],
      submit: (values) =>
        api(
          `/hospital/departments${row ? `/${row.id}` : ""}`,
          { ...values, ...(row ? { version: row.version } : {}) },
          row ? "PATCH" : "POST",
        ),
    });
  }
  function serviceForm(kind: "radiology" | "surgery") {
    openForm({
      title:
        kind === "radiology"
          ? tr("طلب أشعة مرتبط بزيارة", "Request radiology for an encounter")
          : tr("حجز عملية مرتبطة بزيارة", "Schedule encounter surgery"),
      initial: admissionFilter ? { admission_id: admissionFilter } : undefined,
      fields: [
        {
          name: "admission_id",
          label: tr("المريض والزيارة", "Patient & encounter"),
          required: true,
          options: encounterOptions,
          searchable: true,
        },
        {
          name: "name",
          label:
            kind === "radiology"
              ? tr("الفحص المطلوب", "Requested examination")
              : tr("اسم العملية", "Procedure name"),
          required: true,
        },
        ...(kind === "radiology"
          ? [
              {
                name: "priority",
                label: tr("الأولوية", "Priority"),
                required: true,
                value: "routine",
                options: options(["routine", "urgent"]),
              },
            ]
          : [
              {
                name: "scheduled_at",
                label: tr("موعد العملية", "Scheduled start"),
                type: "datetime-local",
                value: nowInput(),
                required: true,
              },
              {
                name: "scheduled_end_at",
                label: tr("النهاية المتوقعة", "Expected end"),
                type: "datetime-local",
                required: true,
              },
              {
                name: "theatre",
                label: tr("غرفة العمليات", "Operating theatre"),
                required: true,
              },
              {
                name: "surgeon_id",
                label: tr("الجراح المسؤول", "Operating surgeon"),
                options: doctorOptions,
                required: true,
              },
            ]),
        ...priceField,
      ],
      submit: ({ admission_id, ...values }) =>
        api(
          `/admissions/${admission_id}/${kind === "surgery" ? "surgeries" : "radiology"}`,
          values,
        ),
    });
  }
  function serviceTransition(
    kind: "radiology" | "surgery",
    row: Row,
    next: string,
  ) {
    const fields: Field[] = [];
    if (next === "scheduled")
      fields.push({
        name: "scheduled_at",
        label: tr("موعد الفحص", "Examination time"),
        type: "datetime-local",
        value: nowInput(),
        required: true,
      });
    if (["reported", "completed"].includes(next))
      fields.push({
        name: "result",
        label:
          kind === "radiology"
            ? tr("تقرير الأشعة", "Radiology report")
            : tr("تقرير العملية", "Operative report"),
        type: "textarea",
        required: true,
        wide: true,
      });
    if (next === "cancelled")
      fields.push({
        name: "reason",
        label: tr("سبب الإلغاء", "Cancellation reason"),
        type: "textarea",
        required: true,
        wide: true,
      });
    openForm({
      title: `${label(next)} · ${row.name}`,
      subtitle: `${row.patient_name} · ${row.mrn}`,
      note:
        next === "reviewed"
          ? row.result ||
            tr(
              "تأكيد مراجعة التقرير في ملف المريض.",
              "Confirm review of this patient's report.",
            )
          : undefined,
      fields,
      button: tr("حفظ الإجراء", "Save action"),
      submit: (values) =>
        api(
          `/hospital/${kind === "surgery" ? "surgeries" : "radiology"}/${row.id}/transition`,
          { ...values, version: row.version, status: next },
        ),
    });
  }
  function dispenseForm(order: Row) {
    const inventory: Row[] = (data.pharmacy?.inventory || []).filter(
      (item: Row) =>
        String(item.name).trim().toLocaleLowerCase() ===
        String(order.name).trim().toLocaleLowerCase(),
    );
    const prices: Row[] = (data.pharmacy?.prices || []).filter(
      (p: Row) =>
        String(p.name).trim().toLocaleLowerCase() ===
        String(order.name).trim().toLocaleLowerCase(),
    );
    openForm({
      title: tr("صرف دواء للمريض", "Dispense medication"),
      subtitle: `${order.patient_name} · ${order.name}`,
      note: tr(
        "طابق رقم الملف مع هوية المريض، وحدد كمية وحدات المخزون المصروفة فعليًا. تسجيل الصرف لا يسجل إعطاء الجرعة؛ الإعطاء يُوثق من التمريض في ملف المريض.",
        "Match the medical record number to the patient's identity and enter the stock units actually dispensed. Dispensing does not record administration; nursing documents each dose in the patient chart.",
      ),
      fields: [
        {
          name: "patient_mrn",
          label: tr(
            "رقم الملف من هوية المريض",
            "MRN from patient identification",
          ),
          required: true,
        },
        {
          name: "item_id",
          label: tr("التشغيلة من المخزون", "Stock batch"),
          required: true,
          options: inventory.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.batch || "—"} · ${fmt(item.quantity)} ${item.unit} · ${date(item.expires_at)}`,
          })),
        },
        {
          name: "quantity",
          label: tr("الكمية بوحدة المخزون", "Quantity in stock units"),
          type: "number",
          min: 0.001,
          step: "any",
          required: true,
        },
        ...(prices.length
          ? [
              {
                name: "price_id",
                label: tr("سعر الخدمة (اختياري)", "Billable price (optional)"),
                options: prices.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${money(p.price)}`,
                })),
              },
            ]
          : []),
      ],
      submit: (values) => {
        const item = inventory.find((item) => item.id === values.item_id);
        return api("/hospital/pharmacy/dispense", {
          ...values,
          order_id: order.id,
          order_version: order.version,
          item_version: item?.version,
        });
      },
    });
  }

  const sectionToolbar = (action?: React.ReactNode, statuses?: string[]) => (
    <div className="hospital-toolbar">
      <label className="hospital-search">
        <Search size={17} />
        <input
          aria-label={tr("بحث في القسم", "Search this section")}
          placeholder={tr("ابحث بالاسم أو رقم الملف…", "Search name or MRN…")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {statuses && (
        <select
          aria-label={tr("تصفية الحالة", "Filter status")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">{tr("كل الحالات", "All statuses")}</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      )}
      {action}
    </div>
  );
  function encounterTable(rows: Row[]) {
    return (
      <Table
        headers={[
          tr("المريض", "Patient"),
          tr("القسم والرعاية", "Department & care"),
          tr("الطبيب والسرير", "Doctor & bed"),
          ...(page === "emergency" ? [tr("الفرز", "Triage")] : []),
          tr("الدخول", "Admission"),
          tr("الملف والإجراءات", "Chart & actions"),
        ]}
        rows={findRows(rows).map((row) => [
          patientCell(row),
          <div className="hospital-cell">
            <strong>{row.department_name || "—"}</strong>
            <small>{label(row.encounter_type)}</small>
          </div>,
          <div className="hospital-cell">
            <span>
              {row.doctor_name || tr("طبيب غير محدد", "Unassigned doctor")}
            </span>
            <small>{row.bed_name || tr("دون سرير", "No bed")}</small>
          </div>,
          ...(page === "emergency"
            ? [
                <span
                  className={`hospital-triage ${row.triage_level || "unassessed"}`}
                >
                  {row.triage_level
                    ? label(row.triage_level)
                    : tr("لم يُفرز", "Not triaged")}
                </span>,
              ]
            : []),
          date(row.admitted_at, true),
          <div className="hospital-actions">
            {chartButton(row)}
            {accountButton(row)}
            {page === "emergency" &&
              (can("nursing.write") || can("clinical.write")) && (
                <button className="button tiny" onClick={() => triageForm(row)}>
                  {tr("تقييم الفرز", "Triage")}
                </button>
              )}
            {can("beds.write") && (
              <button className="button tiny" onClick={() => transferForm(row)}>
                <ArrowLeftRight size={13} />
                {tr("نقل", "Transfer")}
              </button>
            )}
          </div>,
        ])}
        empty={tr(
          "لا توجد زيارات مطابقة في هذا القسم",
          "No matching encounters in this department",
        )}
      />
    );
  }

  const renderOverview = () => {
    const appointments: Row[] = data.overview?.appointments || [];
    const cards = [
      {
        key: "emergency",
        title: tr("في الطوارئ", "Emergency"),
        count: active.filter((r) => r.encounter_type === "emergency").length,
        icon: Activity,
        tint: "coral",
      },
      {
        key: "outpatient",
        title: tr("زيارات العيادات", "Clinic encounters"),
        count: active.filter((r) => r.encounter_type === "outpatient").length,
        icon: Stethoscope,
        tint: "blue",
      },
      {
        key: "inpatient",
        title: tr("مرضى الإقامة والعناية", "Inpatient & intensive care"),
        count: active.filter((r) =>
          ["inpatient", "icu", "nicu"].includes(r.encounter_type),
        ).length,
        icon: BedDouble,
        tint: "teal",
      },
      {
        key: "appointments",
        title: tr("مواعيد لم تكتمل", "Pending appointments"),
        count: appointments.filter((r) =>
          ["scheduled", "arrived"].includes(r.status),
        ).length,
        icon: CalendarClock,
        tint: "purple",
      },
    ];
    return (
      <>
        <div className="hospital-stats">
          {cards.map((card) => (
            <button
              className={`hospital-stat ${card.tint}`}
              key={card.key}
              onClick={() => go(card.key)}
            >
              <card.icon size={24} />
              <div>
                <strong>{fmt(card.count)}</strong>
                <span>{card.title}</span>
              </div>
            </button>
          ))}
        </div>
        <div
          className="hospital-flow"
          aria-label={tr("ترابط أقسام المستشفى", "Connected hospital workflow")}
        >
          <div>
            <Users size={21} />
            <strong>{tr("استقبال وملف موحد", "Reception & one record")}</strong>
            <small>
              {tr("هوية واحدة لكل الزيارات", "One identity across encounters")}
            </small>
          </div>
          <div>
            <Stethoscope size={21} />
            <strong>
              {tr("عيادات وطوارئ وإقامة", "Clinics, emergency & wards")}
            </strong>
            <small>
              {tr("نقل موثق بين الأقسام", "Documented department transfers")}
            </small>
          </div>
          <div>
            <ClipboardList size={21} />
            <strong>
              {tr("طلبات ونتائج وعلاج", "Orders, results & treatment")}
            </strong>
            <small>
              {tr(
                "الأشعة والمعمل والصيدلية والعمليات",
                "Radiology, lab, pharmacy & surgery",
              )}
            </small>
          </div>
          <div>
            <CheckCircle2 size={21} />
            <strong>{tr("حساب وخروج", "Billing & discharge")}</strong>
            <small>
              {tr(
                "الخدمات مرتبطة بنفس الزيارة",
                "Services linked to the same encounter",
              )}
            </small>
          </div>
        </div>
        <Section
          title={tr("حركة الأقسام", "Department census")}
          sub={tr(
            "اضغط على القسم لعرض مسار الرعاية الخاص به.",
            "Open a department to view its care queue.",
          )}
        >
          <div className="hospital-department-grid">
            {departments
              .filter((row) => row.active !== false)
              .map((department) => {
                const rows = active.filter(
                  (row) => row.department_id === department.id,
                );
                const target = ["icu", "nicu"].includes(department.type)
                  ? "inpatient"
                  : ["outpatient", "inpatient", "emergency"].includes(
                        department.type,
                      )
                    ? department.type
                    : department.type === "lab"
                      ? "labs"
                      : department.type;
                const permitted = [
                  "inpatient",
                  "outpatient",
                  "emergency",
                ].includes(target)
                  ? can("patients.read")
                  : target === "labs"
                    ? can("clinical.read") || can("lab.write")
                    : can(`${target}.read`);
                return (
                  <button
                    key={department.id}
                    className="hospital-department"
                    disabled={!permitted}
                    onClick={() => go(target)}
                  >
                    <Building2 size={20} />
                    <strong>{department.name}</strong>
                    <small>{label(department.type)}</small>
                    <span>
                      {fmt(rows.length)} {tr("زيارة مفتوحة", "open encounters")}
                    </span>
                  </button>
                );
              })}
          </div>
          {!departments.length && (
            <Empty
              text={tr(
                "أضف أقسام المستشفى لبدء تنظيم الرعاية",
                "Add departments to organize hospital care",
              )}
            />
          )}
        </Section>
        <Section
          title={tr("الزيارات المفتوحة", "Open encounters")}
          action={
            <button className="button small" onClick={() => go("patients")}>
              {tr("سجل المرضى", "Patient register")}
            </button>
          }
        >
          {sectionToolbar()}
          {encounterTable(active)}
        </Section>
      </>
    );
  };
  const renderAppointments = () => {
    const rows: Row[] = findRows(data.appointments || []).filter(
      (row) => !filter || row.status === filter,
    );
    return (
      <Section
        title={tr("سجل المواعيد", "Appointment register")}
        sub={tr(
          "للمريض الجديد: أنشئ ملفه أولًا من سجل المرضى، ثم احجز موعده هنا.",
          "For a new patient, first create their record in the patient register, then book here.",
        )}
      >
        {sectionToolbar(
          <div className="hospital-actions">
            {can("patients.write") && (
              <button
                className="button primary small"
                onClick={appointmentForm}
              >
                <Plus size={16} />
                {tr("حجز موعد", "Book appointment")}
              </button>
            )}
            <button className="button small" onClick={() => go("patients")}>
              {tr("سجل المرضى", "Patient register")}
            </button>
          </div>,
          ["scheduled", "arrived", "completed", "cancelled"],
        )}
        <Table
          headers={[
            tr("المريض", "Patient"),
            tr("الموعد", "Appointment"),
            tr("القسم والطبيب", "Department & doctor"),
            tr("الحالة", "Status"),
            tr("الإجراءات", "Actions"),
          ]}
          rows={rows.map((row) => {
            const linkedActive = active.some((a) => a.id === row.admission_id);
            return [
              patientCell(row),
              <div className="hospital-cell">
                <strong>{date(row.scheduled_at, true)}</strong>
                {row.notes && <small>{row.notes}</small>}
              </div>,
              <div className="hospital-cell">
                <strong>{row.department_name}</strong>
                <small>{row.doctor_name || "—"}</small>
              </div>,
              status(row.status),
              <div className="hospital-actions">
                {row.admission_id && chartButton(row)}
                {can("patients.write") &&
                  ["scheduled", "arrived"].includes(row.status) && (
                    <>
                      {!row.admission_id && (
                        <button
                          className="button primary tiny"
                          onClick={() => appointmentAction(row, "check-in")}
                        >
                          {tr("حضور وفتح زيارة", "Check in")}
                        </button>
                      )}
                      {row.status === "arrived" &&
                        row.admission_id &&
                        !linkedActive && (
                          <button
                            className="button tiny"
                            onClick={() => appointmentAction(row, "completed")}
                          >
                            {tr("إكمال الموعد", "Complete")}
                          </button>
                        )}
                      {!linkedActive && (
                        <button
                          className="button tiny"
                          onClick={() => appointmentAction(row, "cancelled")}
                        >
                          {tr("إلغاء", "Cancel")}
                        </button>
                      )}
                    </>
                  )}
              </div>,
            ];
          })}
        />
      </Section>
    );
  };
  const renderEncounters = () => {
    let rows = active.filter((row) =>
      page === "inpatient"
        ? ["inpatient", "icu", "nicu"].includes(row.encounter_type)
        : row.encounter_type === page,
    );
    if (page === "emergency")
      rows = [...rows].sort(
        (a, b) =>
          (triageTypes.indexOf(a.triage_level) < 0
            ? 5
            : triageTypes.indexOf(a.triage_level)) -
          (triageTypes.indexOf(b.triage_level) < 0
            ? 5
            : triageTypes.indexOf(b.triage_level)),
      );
    if (filter)
      rows = rows.filter((row) =>
        page === "emergency"
          ? row.triage_level === filter
          : row.encounter_type === filter,
      );
    return (
      <Section
        title={label(page)}
        sub={tr(
          "افتح الملف لتوثيق التشخيص والعلاج والطلبات والخروج.",
          "Open the chart to document diagnoses, care, orders and discharge.",
        )}
      >
        {sectionToolbar(
          can("patients.write") ? (
            <button
              className="button primary small"
              onClick={() => go("patients")}
            >
              <Plus size={16} />
              {tr("استقبال مريض أو فتح زيارة", "Register patient or encounter")}
            </button>
          ) : undefined,
          page === "emergency"
            ? triageTypes
            : page === "inpatient"
              ? ["inpatient", "icu", "nicu"]
              : undefined,
        )}
        {encounterTable(rows)}
      </Section>
    );
  };
  const renderDepartments = () => (
    <Section
      title={label("departments")}
      sub={tr(
        "تعطيل القسم يمنع اختياره للرعاية الجديدة مع الحفاظ على السجلات السابقة.",
        "Inactive departments cannot receive new care; previous records remain available.",
      )}
    >
      {sectionToolbar(
        can("settings.write") && (
          <button
            className="button primary small"
            onClick={() => departmentForm()}
          >
            <Plus size={16} />
            {tr("إضافة قسم", "Add department")}
          </button>
        ),
      )}
      <Table
        headers={[
          tr("القسم", "Department"),
          tr("النوع", "Type"),
          tr("الحالة", "Status"),
          tr("الإجراءات", "Actions"),
        ]}
        rows={findRows(departments).map((row) => [
          <strong>{row.name}</strong>,
          label(row.type),
          <Badge value={row.active ? "active" : "suspended"}>
            {row.active ? tr("نشط", "Active") : tr("غير نشط", "Inactive")}
          </Badge>,
          can("settings.write") ? (
            <button className="button tiny" onClick={() => departmentForm(row)}>
              {tr("تعديل", "Edit")}
            </button>
          ) : (
            "—"
          ),
        ])}
      />
    </Section>
  );
  const renderService = (kind: "radiology" | "surgery") => {
    const rows: Row[] = findRows(data[kind] || []).filter(
      (row) => !filter || row.status === filter,
    );
    const steps =
      kind === "radiology"
        ? ["ordered", "scheduled", "performed", "reported", "reviewed"]
        : ["scheduled", "in_progress", "completed", "reviewed"];
    return (
      <Section title={label(kind)}>
        {sectionToolbar(
          can("clinical.write") && can("patients.read") && (
            <button
              className="button primary small"
              onClick={() => serviceForm(kind)}
            >
              <Plus size={16} />
              {kind === "radiology"
                ? tr("طلب أشعة", "Request radiology")
                : tr("حجز عملية", "Schedule surgery")}
            </button>
          ),
          [...steps, "cancelled"],
        )}
        <div className="hospital-service-steps">
          {steps.map((step, index) => (
            <span key={step}>
              <b>{index + 1}</b>
              {label(step)}
            </span>
          ))}
        </div>
        <Table
          headers={[
            tr("المريض", "Patient"),
            kind === "radiology"
              ? tr("الفحص", "Examination")
              : tr("العملية", "Procedure"),
            tr("الموعد", "Scheduled time"),
            tr("الحالة", "Status"),
            tr("الإجراءات", "Actions"),
          ]}
          rows={rows.map((row) => {
            const next = steps[steps.indexOf(row.status) + 1];
            const allowedAfterDischarge =
              next === "reviewed" ||
              (kind === "radiology" && next === "reported");
            const mayAdvance =
              next &&
              row.status !== "cancelled" &&
              can(next === "reviewed" ? "clinical.approve" : `${kind}.write`) &&
              (row.admission_status !== "discharged" || allowedAfterDischarge);
            return [
              patientCell(row),
              <div className="hospital-cell">
                <strong>{row.name}</strong>
                <small>
                  {kind === "radiology"
                    ? label(row.priority)
                    : `${row.theatre} · ${row.surgeon_name || "—"}`}
                </small>
              </div>,
              date(row.scheduled_at || row.created_at, true),
              status(row.status),
              <div className="hospital-actions">
                {chartButton(row)}
                {accountButton(row)}
                {row.result && (
                  <button
                    className="button tiny"
                    onClick={() => setDetails({ ...row, kind })}
                  >
                    {tr("عرض التقرير", "View report")}
                  </button>
                )}
                {mayAdvance && (
                  <button
                    className="button primary tiny"
                    onClick={() => serviceTransition(kind, row, next)}
                  >
                    {label(next)}
                  </button>
                )}
                {can(`${kind}.write`) &&
                  (kind === "radiology"
                    ? ["ordered", "scheduled"]
                    : ["scheduled"]
                  ).includes(row.status) && (
                    <button
                      className="button tiny"
                      onClick={() => serviceTransition(kind, row, "cancelled")}
                    >
                      {tr("إلغاء", "Cancel")}
                    </button>
                  )}
              </div>,
            ];
          })}
        />
      </Section>
    );
  };
  const renderPharmacy = () => {
    const orders: Row[] = findRows(data.pharmacy?.orders || []),
      inventory: Row[] = data.pharmacy?.inventory || [],
      dispensations: Row[] = findRows(data.pharmacy?.dispensations || []);
    return (
      <>
        <div className="hospital-stats compact">
          <div className="hospital-stat teal">
            <Pill size={24} />
            <div>
              <strong>{fmt(orders.length)}</strong>
              <span>
                {tr(
                  "وصفة معتمدة في الزيارات المفتوحة",
                  "Approved orders in open encounters",
                )}
              </span>
            </div>
          </div>
          <div className="hospital-stat blue">
            <ClipboardList size={24} />
            <div>
              <strong>{fmt(inventory.length)}</strong>
              <span>{tr("تشغيلة متاحة للصرف", "Available stock batches")}</span>
            </div>
          </div>
        </div>
        <Section
          title={tr("الوصفات المعتمدة", "Approved medication orders")}
          sub={tr(
            "يخص الصرف الوصفة المرتبطة بالمريض، ويخصم المخزون ويضيف الخدمة للحساب عند اختيار سعر.",
            "Dispensing is linked to the patient order, deducts stock and charges the encounter when a price is selected.",
          )}
        >
          {sectionToolbar()}
          <Table
            headers={[
              tr("المريض", "Patient"),
              tr("الدواء والجرعة الموصوفة", "Medication & prescribed dose"),
              tr("المصروف سابقًا", "Previously dispensed"),
              tr("الصرف والملف", "Dispensing & chart"),
            ]}
            rows={orders.map((order) => {
              const available = inventory.some(
                (item) =>
                  String(item.name).trim().toLocaleLowerCase() ===
                  String(order.name).trim().toLocaleLowerCase(),
              );
              return [
                patientCell(order),
                <div className="hospital-cell">
                  <strong>{order.name}</strong>
                  <small>
                    {[order.dose, order.unit, order.route, order.frequency]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {order.instructions && <small>{order.instructions}</small>}
                </div>,
                fmt(order.quantity_dispensed || 0),
                <div className="hospital-actions">
                  {chartButton(order)}
                  {can("pharmacy.write") && (
                    <button
                      className="button primary tiny"
                      disabled={!available}
                      title={
                        !available
                          ? tr(
                              "لا توجد تشغيلة صالحة بنفس اسم الدواء الموصوف",
                              "No eligible stock batch matches the prescribed medication",
                            )
                          : undefined
                      }
                      onClick={() => dispenseForm(order)}
                    >
                      <Pill size={13} />
                      {available
                        ? tr("صرف", "Dispense")
                        : tr("المخزون غير متاح", "No stock")}
                    </button>
                  )}
                </div>,
              ];
            })}
          />
        </Section>
        <Section
          title={tr(
            "سجل الصرف المرتبط بالمرضى",
            "Patient-linked dispensing history",
          )}
        >
          <Table
            headers={[
              tr("المريض", "Patient"),
              tr("الصنف", "Item"),
              tr("الكمية", "Quantity"),
              tr("وقت الصرف", "Dispensed at"),
              tr("الملف والحساب", "Chart & account"),
            ]}
            rows={dispensations.map((row) => [
              patientCell(row),
              row.item_name || row.name,
              `${fmt(row.quantity)} ${row.unit || ""}`,
              date(row.created_at, true),
              <div className="hospital-actions">
                {chartButton(row)}
                {accountButton(row)}
              </div>,
            ])}
          />
        </Section>
      </>
    );
  };
  return (
    <div className="hospital-workspace">
      {admissionFilter && (
        <div className="hospital-context-filter">
          <span>
            {tr(
              "السجلات المعروضة مرتبطة بالزيارة المفتوحة من ملف المريض.",
              "Showing records for the encounter opened from the patient chart.",
            )}
          </span>
          <button
            className="button small"
            onClick={() => {
              setAdmissionFilter("");
              go(page);
            }}
          >
            {tr("عرض كل الزيارات", "Show all encounters")}
          </button>
        </div>
      )}
      {error ? (
        <div className="error-box" role="alert">
          <span>{error}</span>
          <button className="button small" onClick={reload}>
            {tr("إعادة المحاولة", "Retry")}
          </button>
        </div>
      ) : loading ? (
        <div className="hospital-loading" role="status">
          <RefreshCw className="spin" size={25} />
          {tr("جارٍ تحميل سجلات القسم…", "Loading department records…")}
        </div>
      ) : page === "hospital" ? (
        renderOverview()
      ) : page === "appointments" ? (
        renderAppointments()
      ) : ["emergency", "outpatient", "inpatient"].includes(page) ? (
        renderEncounters()
      ) : page === "departments" ? (
        renderDepartments()
      ) : page === "pharmacy" ? (
        renderPharmacy()
      ) : ["radiology", "surgery"].includes(page) ? (
        renderService(page as "radiology" | "surgery")
      ) : null}
      {form && (
        <FormModal
          spec={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      )}
      {details && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetails(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hospital-report-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {details.patient_name} · {details.mrn}
                </span>
                <h2 id="hospital-report-title">{details.name}</h2>
              </div>
              <button
                autoFocus
                className="button small"
                onClick={() => setDetails(null)}
              >
                {tr("إغلاق", "Close")}
              </button>
            </div>
            <div className="hospital-report">
              <div className="hospital-actions">
                {status(details.status)}
                {chartButton(details)}
              </div>
              <p>{details.result}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
