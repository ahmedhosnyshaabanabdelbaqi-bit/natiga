import { t, getLanguage, useLanguage } from "./i18n";
import { useEffect, useState } from "react";
import { Plus, FileText, Search } from "lucide-react";
import {
  api,
  Badge,
  date,
  field,
  FormSpec,
  options,
  Row,
  Section,
  Table,
} from "./shared";
const configs: Row = {
  admission_requests: {
    name: "طلبات الدخول والحجز",
    fields: ["المصدر", "التجهيز المطلوب", "صاحب القرار", "انتهاء الحجز"],
    permission: "operations.write",
  },
  devices: {
    name: "سجل الأجهزة والأصول",
    fields: ["النوع", "الموديل", "الرقم التسلسلي", "الموقع", "موعد المعايرة"],
    permission: "operations.write",
  },
  maintenance: {
    name: "بلاغات الصيانة",
    fields: [
      "الجهاز",
      "وصف العطل",
      "المسؤول",
      "موعد الإصلاح",
      "نتيجة الاختبار",
    ],
    permission: "operations.write",
  },
  incidents: {
    name: "الجودة والحوادث",
    fields: ["الأولوية", "وصف الواقعة", "المسؤول", "خطة المعالجة", "المتابعة"],
    permission: "operations.write",
  },
  shifts: {
    name: "النوبات والتكليفات",
    fields: [
      "بداية النوبة",
      "نهاية النوبة",
      "الطبيب",
      "فريق التمريض",
      "البديل",
    ],
    permission: "operations.write",
  },
  claims: {
    name: "مطالبات التأمين",
    fields: [
      "جهة التأمين",
      "رقم الموافقة",
      "المبلغ",
      "نسبة التحمل",
      "سبب الرفض",
      "المرجع الخارجي",
    ],
    permission: "billing.write",
  },
  contracts: {
    name: "التعاقدات والتغطيات",
    fields: [
      "الجهة",
      "تاريخ السريان",
      "انتهاء التعاقد",
      "حد التغطية",
      "الاستثناءات",
    ],
    permission: "billing.write",
  },
  doctor_dues: {
    name: "مستحقات الأطباء",
    fields: [
      "الطبيب",
      "أساس الاستحقاق",
      "قيمة المستحق",
      "مرجع الاتفاق",
      "اعتماد الصرف",
    ],
    permission: "billing.write",
  },
  followups: {
    name: "المتابعة بعد الخروج",
    fields: ["موعد المتابعة", "المسؤول", "نتائج منتظرة", "التواصل الموثق"],
    permission: "operations.write",
  },
  alerts: {
    name: "مركز التنبيهات",
    fields: [
      "الأولوية",
      "المسؤول",
      "وقت الاستحقاق",
      "سبب التنبيه",
      "مسار التصعيد",
    ],
    permission: "operations.write",
  },
  cleaning: {
    name: "التنظيف ومكافحة العدوى",
    fields: [
      "السرير أو الجهاز",
      "قائمة التنظيف",
      "المنفذ",
      "المراجع",
      "اعتماد الجاهزية",
    ],
    permission: "operations.write",
  },
  integrations: {
    name: "سجل إعدادات التكاملات",
    fields: [
      "النظام الخارجي",
      "وصف الواجهة",
      "حالة الاتصال الفعلي",
      "نتيجة الاختبار",
      "المسؤول",
    ],
    permission: "settings.write",
  },
  templates: {
    name: "قوالب القسم المعتمدة",
    fields: [
      "نوع النموذج",
      "الإصدار",
      "نص النموذج",
      "المراجع",
      "تاريخ الاعتماد",
    ],
    permission: "settings.write",
  },
};
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
function recordPermission(
  kind: string,
  role: string,
  write: boolean,
  can: (p: string) => boolean,
) {
  if (kind === "integrations") return "settings.write";
  if (["claims", "contracts", "doctor_dues"].includes(kind))
    return write
      ? role === "insurance"
        ? "operations.write"
        : "billing.write"
      : "billing.read";
  if (kind === "followups")
    return write
      ? can("nursing.write")
        ? "nursing.write"
        : "clinical.write"
      : "clinical.read";
  if (kind === "alerts" && role === "stock")
    return write ? "stock.write" : "stock.read";
  if (kind === "alerts" && ["doctor", "nurse"].includes(role))
    return write
      ? role === "doctor"
        ? "clinical.write"
        : "nursing.write"
      : "clinical.read";
  return "operations.write";
}
export const hasRegisters = (role: string, can: (p: string) => boolean) =>
  Object.keys(kindRoles).some(
    (kind) =>
      kindRoles[kind].includes(role) &&
      can(recordPermission(kind, role, false, can)),
  );
export default function Registers({
  revision,
  openForm,
  can,
  notify,
  userRole,
}: {
  revision: number;
  openForm: (s: FormSpec) => void;
  can: (s: string) => boolean;
  notify: (m: string, e?: boolean) => void;
  userRole: string;
}) {
  const allowed = Object.entries(configs).filter(
    ([key]) =>
      kindRoles[key].includes(userRole) &&
      can(recordPermission(key, userRole, false, can)),
  );
  const [kind, setKind] = useState(allowed[0]?.[0] || "admission_requests"),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    if (!allowed.length) return;
    setRows([]);
    api("/records/" + kind)
      .then((r) => {
        if (active) {
          setRows(r);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, revision]);
  const config = configs[kind];
  function edit(record?: Row) {
    openForm({
      title: (record ? t("تعديل سجل: ") : t("إضافة: ")) + t(config.name),
      initial: record
        ? { title: record.title, status: record.status, ...record.data }
        : undefined,
      fields: [
        field("title", t("عنوان السجل")),
        field("status", t("الحالة"), "text", true, {
          value: "open",
          options: options([
            "open",
            "pending",
            "approved",
            "completed",
            "closed",
            "cancelled",
          ]),
        }),
        ...config.fields.map((label: string, i: number) =>
          field("f" + i, label, "textarea", false, { wide: true }),
        ),
      ],
      note: t(
        "سجل إداري يدوي موثق. لا يرسل تلقائيًا إلى جهة خارجية ولا يستبدل دورة الرعاية أو الحركة المالية المتخصصة.",
      ),
      submit: (v) => {
        const body = {
          title: v.title,
          status: v.status,
          data: Object.fromEntries(
            config.fields.map((_: string, i: number) => ["f" + i, v["f" + i]]),
          ),
          ...(record ? { version: record.version } : {}),
        };
        return api(
          "/records/" + kind + (record ? "/" + record.id : ""),
          body,
          record ? "PATCH" : "POST",
        );
      },
    });
  }
  return (
    <>
      <div className="register-tabs">
        {allowed.map(([key, c]) => (
          <button
            key={key}
            className={kind === key ? "selected" : ""}
            onClick={() => {
              setKind(key);
              setSearch("");
            }}
          >
            <FileText size={16} />
            {t(c.name)}
          </button>
        ))}
      </div>
      <Section
        title={config.name}
        sub={t("سجل إداري قابل للمتابعة — جميع التعديلات موثقة")}
        action={
          can(recordPermission(kind, userRole, true, can)) && (
            <button className="button primary small" onClick={() => edit()}>
              <Plus size={16} />
              {t("إضافة سجل")}
            </button>
          )
        }
      >
        {error && <div className="error-box">{error}</div>}
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label={t("بحث السجلات")}
              placeholder={t("ابحث في هذا السجل…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Table
          headers={[
            t("عنوان السجل"),
            t("الحالة"),
            t("تفاصيل السجل"),
            t("آخر تحديث"),
            t("الإجراء"),
          ]}
          rows={rows
            .filter((r) => JSON.stringify(r).includes(search))
            .map((r) => [
              r.title,
              <Badge value={r.status} />,
              <div className="register-details">
                {config.fields.map((label: string, i: number) =>
                  r.data?.["f" + i] ? (
                    <small key={i}>
                      <b>{t(label)}: </b>
                      {r.data["f" + i]}
                    </small>
                  ) : null,
                )}
              </div>,
              date(r.updated_at || r.created_at, true),
              can(recordPermission(kind, userRole, true, can)) ? (
                <button className="button tiny" onClick={() => edit(r)}>
                  {t("تعديل ومتابعة")}
                </button>
              ) : (
                "—"
              ),
            ])}
        />
      </Section>
    </>
  );
}
