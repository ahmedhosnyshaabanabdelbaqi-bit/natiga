import { useEffect, useRef, useState } from "react";
import { t, getLanguage, getLocale, setLanguage, useLanguage } from "./i18n";
import {
  Activity,
  ArrowLeft,
  Baby,
  BedDouble,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Download,
  FileText,
  FlaskConical,
  HeartPulse,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import {
  api,
  Badge,
  date,
  field,
  fmt,
  FormModal,
  FormSpec,
  labels,
  nowInput,
  options,
  Row,
  Section,
  searchText,
  Table,
} from "./shared";
import Patient from "./Patient";
import HospitalWorkspace from "./HospitalWorkspace";
import { hospitalRegistration } from "./HospitalRegistration";
import Attendance from "./Attendance";
import Consumables from "./Consumables";
import Updates from "./Updates";
import DepartmentChat from "./DepartmentChat";
import Equipment from "./Equipment";
import Maintenance from "./Maintenance";
import Monitoring from './Monitoring';
import PurchaseOrders from './PurchaseOrders';
import appPackage from "../package.json";
import Dashboard from "./Dashboard";
import Registers, { hasRegisters } from "./Registers";
import {
  Operations,
  SettingsPage,
  UsersPage,
  Help,
  PrintSheet,
  Security,
} from "./Pages";
const nav = [
  ["hospital", "إدارة المستشفى", "Hospital", HeartPulse, "patients.read"],
  ["appointments", "الحجز والاستقبال", "Appointments", CalendarDays, "patients.read"],
  ["outpatient", "العيادات الخارجية", "Outpatient clinics", Users, "patients.read"],
  ["emergency", "الطوارئ والفرز", "Emergency & triage", Activity, "patients.read"],
  ["inpatient", "التنويم والعناية والحضّانات", "Wards, ICU & NICU", BedDouble, "patients.read"],
  ["surgery", "العمليات", "Surgery", HeartPulse, "surgery.read"],
  ["radiology", "الأشعة", "Radiology", Activity, "radiology.read"],
  ["pharmacy", "الصيدلية", "Pharmacy", Package, "pharmacy.read"],
  ["departments", "الأقسام والتخصصات", "Departments", Settings, "settings.write"],
  ["dashboard", "نظرة عامة", "Overview", LayoutDashboard, ""],
  ["patients", "ملفات المرضى", "Patients", Users, "patients.read"],
  [
    "beds",
    "الأسرة والحضّانات",
    "Beds & incubators",
    BedDouble,
    "patients.read",
  ],
  [
    "tasks",
    "المهام وتسليم النوبات",
    "Tasks & handover",
    ClipboardList,
    "clinical.read",
  ],
  ["labs", "التحاليل والنتائج", "Laboratory", FlaskConical, "clinical.read"],
  ["inventory", "المخزون والمستلزمات", "Inventory", Package, "stock.read"],
  ["purchases", "طلبات وأوامر الشراء", "Purchase orders", ClipboardList, "purchase.read"],
  [
    "equipment",
    "الأجهزة وأسعار الاستخدام",
    "Equipment & usage",
    HeartPulse,
    "consumables.read",
  ],
  [
    "maintenance",
    "الصيانة والمصروفات",
    "Maintenance & expenses",
    Settings,
    "operations.write",
  ],
  [
    "monitoring",
    "المونيتور وقراءات التمريض",
    "Monitors & nursing readings",
    Activity,
    "clinical.read",
  ],
  ["accounts", "الحسابات والفواتير", "Accounts & invoices", Wallet, "billing.read"],
  ["treasury", "الخزنة", "Treasury", Wallet, "billing.read"],
  [
    "registers",
    "سجلات القسم",
    "Department registers",
    FileText,
    "operations.write",
  ],
  ["reports", "التقارير والإحصائيات", "Reports", Activity, "reports.read"],
  [
    "attendance",
    "الحضور والرواتب",
    "Attendance & payroll",
    CalendarDays,
    "attendance.read",
  ],
] as const;
const navGroups = [
  { id: "hospital-care", ar: "المستشفى وأقسامه", en: "Hospital departments", pages: ["hospital", "appointments", "outpatient", "emergency", "inpatient", "surgery", "radiology", "pharmacy", "departments"] },
  { id: "overview", ar: "مساحة العمل", en: "Workspace", pages: ["dashboard"] },
  {
    id: "care",
    ar: "المريض والرعاية",
    en: "Patient & care",
    pages: ["patients", "beds", "monitoring", "tasks", "labs"],
  },
  {
    id: "finance",
    ar: "الحسابات والتحصيل",
    en: "Finance & collections",
    pages: ["accounts", "treasury"],
  },
  {
    id: "operations",
    ar: "المخزون والتشغيل",
    en: "Stock & operations",
    pages: [
      "equipment",
      "inventory",
      "purchases",
      "maintenance",
      "registers",
      "attendance",
      "reports",
    ],
  },
];
const pageNotes: Record<string, [string, string]> = {
  hospital: ["رحلة موحّدة من الاستقبال إلى الرعاية والخروج، مرتبطة بالخدمات والحسابات.", "One journey from reception through care and discharge, linked to services and billing."],
  appointments: ["حجز العيادات وتسجيل الحضور وفتح الزيارة على ملف المريض نفسه.", "Book appointments, check in and open a visit on the same patient record."],
  emergency: ["قائمة الطوارئ ودرجة الفرز الموثقة والتحويل للقسم المناسب.", "Emergency queue, documented triage and transfers to the receiving department."],
  outpatient: ["زيارات العيادات والتكليف الطبي والطلبات المرتبطة بالملف.", "Clinic visits, care assignments and requests linked to the patient chart."],
  inpatient: ["التنويم والعناية والحضّانات وحركة الأسرّة والتحويل بين الأقسام.", "Wards, ICU, NICU, bed movements and department transfers."],
  radiology: ["الطلبات والمواعيد والتنفيذ والتقارير ومراجعة الطبيب.", "Requests, scheduling, performance, reporting and clinical review."],
  surgery: ["جدولة العمليات وغرف العمليات والتنفيذ والتوثيق.", "Schedule procedures and theatres, record performance and completion."],
  pharmacy: ["صرف الأوامر المعتمدة مع التحقق من الهوية وربط التشغيلة والمخزون والفاتورة.", "Dispense approved orders with identity verification, stock batch and billing links."],
  departments: ["إدارة الأقسام والتخصصات المتاحة بالمستشفى.", "Manage hospital departments and specialties."],
  equipment: [
    "سجل الأجهزة وحالتها وسعر الاستخدام؛ استخدام المريض يضاف تلقائيًا لفاتورته.",
    "Equipment, status and usage prices; recorded patient usage is charged automatically.",
  ],
  maintenance: [
    "مواعيد الصيانة والتحقق من الجاهزية والمصروفات المرتبطة بالخزنة والبنك.",
    "Maintenance schedules, verified readiness and expenses linked to cash or bank accounts.",
  ],
  monitoring: [
    "الأجهزة غير متصلة بالشبكة؛ هذه قراءات يدخلها التمريض يدويًا وتُحدّث للفريق.",
    "Devices are not network-connected; nurses enter readings manually for the team.",
  ],
  dashboard: [
    "تابع حركة القسم والأسرة والمهام حسب صلاحياتك.",
    "Monitor the unit, beds and tasks within your access.",
  ],
  patients: [
    "هوية المريض، الزيارات، الرعاية والحساب المرتبط بكل إقامة.",
    "Patient identity, visits, care and each admission’s account.",
  ],
  beds: [
    "التسكين ونقل المريض وجاهزية الأسرّة للاستقبال.",
    "Admission placement, transfers and bed readiness.",
  ],
  tasks: [
    "متابعة المهام وتسليم النوبات على الإقامات المكلّف بها الفريق.",
    "Track tasks and handover for assigned admissions.",
  ],
  labs: [
    "افتح زيارة المريض لمتابعة الطلبات والعينات والنتائج.",
    "Open a patient visit to follow orders, samples and results.",
  ],
  inventory: [
    "الأصناف والمستهلكات والتشغيلات والجرد والهالك وصرف المريض في قسم واحد.",
    "Items, supplies, batches, stocktake, waste and patient usage in one section.",
  ],
  purchases: [
    "الاستقبال يطلب الأصناف والكميات دون أسعار؛ الحسابات تعتمد وتورد وتخصم التكلفة من الرصيد.",
    "Reception requests items and quantities without prices; Accounts approves, receives and debits the cost.",
  ],
  consumables: [
    "صرف من الرصيد الصالح بسعر محفوظ يُضاف تلقائيًا لحساب المريض.",
    "Issue valid stock at a saved price charged automatically to the patient account.",
  ],
  accounts: [
    "الحسابات والفواتير والمشتريات والموردون والمستهلكات والمدفوعات والطباعة في قسم واحد.",
    "Accounts, invoices, purchasing, suppliers, consumables, payments and printing in one section.",
  ],
  invoices: [
    "تفاصيل الفاتورة والمستهلكات والإيصالات مع الطباعة.",
    "Invoice details, consumables, receipts and printing.",
  ],
  treasury: [
    "حركات التحصيل والاسترداد وإقفال الوردية المالية.",
    "Collections, refunds and cashbook shift closure.",
  ],
  attendance: [
    "حركات الحضور وربط الموظفين وحساب الرواتب حسب صلاحياتك.",
    "Attendance events, employee links and payroll within your permissions.",
  ],
  reports: [
    "مؤشرات مستخرجة من السجلات المحفوظة مع الطباعة والتصدير المصرح به.",
    "Metrics from saved records with permitted printing and export.",
  ],
  registers: [
    "سجلات التشغيل والمتابعة المرتبطة بالقسم.",
    "Operational and follow-up records for the unit.",
  ],
  settings: [
    "لغة الواجهة وبيانات المستشفى وإدارة الوصول وتحديثات النظام.",
    "Interface language, hospital identity, access management and system updates.",
  ],
};
function routeFromLocation() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const requested = params.get("page") || "hospital";
  const page = requested === "billing" || requested === "invoices" ? "accounts" : requested === "consumables" ? "inventory" : requested;
  const valid =
    nav.some((item) => item[0] === page) ||
    ["settings", "users", "audit", "help", "security"].includes(page);
  return {
    page: valid ? page : "dashboard",
    patient: valid && page === "patients" ? params.get("patient") : null,
    admission: params.get("admission") || undefined,
    tab: params.get("tab") || undefined,
  };
}
export default function App() {
  const english = useLanguage() === "en";
  const [session, setSession] = useState<Row | null>(null),
    [checking, setChecking] = useState(true),
    [sessionAttempt, setSessionAttempt] = useState(0),
    [startupError, setStartupError] = useState(false),
    [browserOffline, setBrowserOffline] = useState(!navigator.onLine),
    [healthAttempt, setHealthAttempt] = useState(0),
    [connectionStatus, setConnectionStatus] = useState<
      "unknown" | "online" | "offline"
    >("unknown"),
    [connectionRecovered, setConnectionRecovered] = useState(false),
    [page, setPage] = useState(() => routeFromLocation().page),
    [patientId, setPatientId] = useState<string | null>(
      () => routeFromLocation().patient,
    ),
    [patientContext, setPatientContext] = useState(() => ({
      admission: routeFromLocation().admission,
      tab: routeFromLocation().tab,
    })),
    [menuSearch, setMenuSearch] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(
      () => localStorage.getItem("nicu-status-filter") || "",
    ),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<Row>({}),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [form, setForm] = useState<FormSpec | null>(null),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [dark, setDark] = useState(
      () => localStorage.getItem("nicu-theme") === "dark",
    ),
    [mobile, setMobile] = useState(false),
    [users, setUsers] = useState<Row[]>([]),
    [beds, setBeds] = useState<Row[]>([]),
    [printData, setPrintData] = useState<Row | null>(null);
  const can = (permission: string) =>
    !!session?.user?.permissions?.includes(permission);
  const notify = (text: string, isError = false) =>
    setToast({ text, error: isError });
  const refresh = () => setRevision((v) => v + 1);
  const healthWasDown = useRef(false);
  const returnPage = useRef("patients");
  const loadedPage = useRef("");
  const allowedPage = (key: string) => {
    if (key === "inventory") return can("stock.read") || can("consumables.read");
    if (key === "equipment")
      return can("consumables.read") || can("beds.write");
    if (key === "maintenance")
      return (
        can("billing.read") ||
        (["admin", "manager", "head_nurse", "maintenance"].includes(
          session?.user?.role,
        ) &&
          (can("beds.write") || can("operations.write")))
      );
    if (key === "registers")
      return hasRegisters(session?.user?.role || "", can);
    if (key === "users") return can("settings.write");
    if (key === "audit") return can("audit.read");
    const item = nav.find((n) => n[0] === key);
    return (
      !item ||
      !item[4] ||
      can(item[4]) ||
      (key === "attendance" && can("attendance.self")) ||
      (key === "labs" && can("lab.write")) ||
      (key === "beds" && can("beds.write"))
    );
  };
  useEffect(() => {
    const follow = () => {
      const route = routeFromLocation();
      setPage(route.page);
      setPatientId(route.patient);
      setPatientContext({ admission: route.admission, tab: route.tab });
      setSearch("");
      setMenuSearch("");
      setMobile(false);
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  useEffect(() => {
    if (session?.user && !allowedPage(page)) navigate("dashboard", true);
  }, [session, page]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    setChecking(true);
    setStartupError(false);
    fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Accept-Language": getLanguage() },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session server unavailable");
        const result = await response.json();
        if (!result || typeof result !== "object" || !("user" in result))
          throw new Error("Invalid session response");
        if (active) {
          setSession(result);
          setError("");
        }
      })
      .catch(() => {
        if (active) setStartupError(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [sessionAttempt]);
  useEffect(() => {
    const offline = () => {
      setBrowserOffline(true);
      setHealthAttempt((value) => value + 1);
    };
    const online = () => {
      setBrowserOffline(false);
      setHealthAttempt((value) => value + 1);
      if (startupError) setSessionAttempt((value) => value + 1);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [startupError]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    let pending = false;
    let controller: AbortController | undefined;
    const probe = async () => {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 4000);
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok || (await response.json()).ok !== true)
          throw new Error("Server unavailable");
        if (active) {
          setConnectionStatus("online");
          if (healthWasDown.current) {
            setConnectionRecovered(true);
            healthWasDown.current = false;
          }
        }
      } catch {
        if (active) {
          setConnectionStatus("offline");
          setConnectionRecovered(false);
          healthWasDown.current = true;
        }
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    };
    void probe();
    const interval = setInterval(() => void probe(), 15000);
    return () => {
      active = false;
      clearInterval(interval);
      controller?.abort();
    };
  }, [session?.user?.id, healthAttempt]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("nicu-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    Promise.allSettled([
      api("/users"),
      can("patients.read") ? api("/beds") : Promise.resolve([]),
    ]).then(([u, b]) => {
      if (active) {
        if (u.status === "fulfilled") setUsers(u.value);
        if (b.status === "fulfilled") setBeds(b.value);
      }
    });
    return () => {
      active = false;
    };
  }, [session, revision]);
  useEffect(() => {
    if (!session?.user || !allowedPage(page)) return;
    let active = true;
    const loadKey = session.user.id + ":" + page;
    const reuse = loadedPage.current === loadKey && data[page] !== undefined;
    if (!reuse) {
      setLoading(true);
      setData({});
    }
    setError("");
    const endpoint: Row = {
      dashboard: "/dashboard",
      patients: "/patients",
      beds: "/beds",
      tasks: "/tasks",
      inventory: can("stock.read") ? "/inventory" : null,
      billing: "/billing",
      accounts: "/billing",
      treasury: "/billing",
      reports: "/reports",
      audit: "/audit",
      settings: can("settings.write") ? "/settings" : null,
      users: "/users",
      labs: "/patients",
    };
    if (!endpoint[page]) {
      setLoading(false);
      return;
    }
    api(endpoint[page])
      .then((d) => {
        if (active) {
          loadedPage.current = loadKey;
          setData({ [page]: d });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, revision, session, english]);
  function updateLocation(
    next: string,
    patient?: string,
    admissionId?: string,
    tab?: string,
    replace = false,
  ) {
    const params = new URLSearchParams({ page: next });
    if (patient) params.set("patient", patient);
    if (admissionId) params.set("admission", admissionId);
    if (tab) params.set("tab", tab);
    history[replace ? "replaceState" : "pushState"](
      null,
      "",
      `${location.pathname}${location.search}#${params}`,
    );
  }
  function navigate(next: string, replace = false) {
    next = next === "billing" || next === "invoices" ? "accounts" : next === "consumables" ? "inventory" : next;
    if (session?.user && !allowedPage(next)) {
      notify(
        english
          ? "This section is outside your access."
          : "هذا القسم خارج صلاحياتك.",
        true,
      );
      return;
    }
    setPage(next);
    setPatientId(null);
    setPatientContext({ admission: undefined, tab: undefined });
    setSearch("");
    setMobile(false);
    setMenuSearch("");
    updateLocation(next, undefined, undefined, undefined, replace);
  }
  function openPatient(id: string, admissionId?: string, tab?: string) {
    if (!can("patients.read")) {
      notify(
        english
          ? "Patient records are outside your access."
          : "ملفات المرضى خارج صلاحياتك.",
        true,
      );
      return;
    }
    if (!patientId) returnPage.current = page;
    setPatientId(id);
    setPatientContext({ admission: admissionId, tab });
    setPage("patients");
    setMobile(false);
    updateLocation("patients", id, admissionId, tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function print(kind: string, id?: string, recordId?: string) {
    if (id && kind !== "reports") {
      window.open(
        "/api/print/" +
          encodeURIComponent(kind) +
          "?admission_id=" +
          encodeURIComponent(id) +
          (recordId ? "&id=" + encodeURIComponent(recordId) : "") +
          "&lang=" +
          getLanguage(),
        "_blank",
        "noopener",
      );
      return;
    }
    try {
      await api("/print-log", { kind, patient_id: id });
      const payload = id ? await api("/patients/" + id) : null;
      setPrintData({
        kind,
        patient: payload,
        report: kind === "reports" ? data.reports : null,
        hospital: session?.hospital,
        at: new Date().toISOString(),
        user: session?.user?.name,
      });
      setTimeout(() => window.print(), 150);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function exportData(kind: string) {
    try {
      const response = await fetch(
        "/api/export/" + kind + "?lang=" + getLanguage(),
        { headers: { "Accept-Language": getLanguage() } },
      );
      if (!response.ok) {
        const d = await response.json();
        throw new Error(d.error);
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `qasr-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notify("تم تصدير السجلات المصرح بها");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const admission = async () => {
    try { setForm(await hospitalRegistration(users, beds, openPatient)); }
    catch (e) { notify((e as Error).message, true); }
  };
  if (checking)
    return (
      <div className="boot">
        <HeartPulse className="pulse" />
        <h2>{t("قصر المعادي")}</h2>
        <p>{t("جارٍ الاتصال بالنظام…")}</p>
      </div>
    );
  if (startupError)
    return (
      <StartupUnavailable
        english={english}
        offline={browserOffline}
        retry={() => setSessionAttempt((value) => value + 1)}
      />
    );
  if (!session?.user)
    return (
      <Login onLogin={setSession} error={error} setupRequired={session?.setup_required === true} />
    );
  const dash = data.dashboard || {},
    stats = dash.stats || {},
    patients: Row[] = data.patients || data.labs || dash.patients || [],
    filtered = patients.filter(
      (p) =>
        (!search ||
          searchText(
            [
              p.name,
              p.mrn,
              p.mother_name,
              p.bed_name,
              p.admission_no,
              `INV-${p.admission_no}`,
            ].join(" "),
          ).includes(searchText(search))) &&
        (!status || p.admission_status === status),
    );
  const currentNav = nav.find((n) => n[0] === page);
  const currentGroup = navGroups.find((group) => group.pages.includes(page));
  const matchingMenu = nav.filter(
    (item) =>
      allowedPage(item[0]) &&
      !(item[0] === "purchases" && can("billing.read")) &&
      `${item[1]} ${item[2]}`
        .toLowerCase()
        .includes(menuSearch.trim().toLowerCase()),
  );
  const title = patientId
    ? english
      ? "Patient record"
      : t("الملف الطبي")
    : currentNav
      ? english
        ? currentNav[2]
        : currentNav[1]
      : {
          settings: t("إعدادات المستشفى"),
          users: t("المستخدمون والصلاحيات"),
          audit: t("سجل التدقيق"),
          help: t("مركز المساعدة"),
          security: t("أمان الحساب"),
        }[page] || t("سجلات القسم");
  const patientTable = (rows: Row[]) => (
    <Table
      headers={
        english
          ? [
              "Patient / Medical record",
              "Bed / Care level",
              can("clinical.read") ? "Clinical record" : "Admission status",
              "Care team",
              "Admission",
              "",
            ]
          : [
              t("المريض / رقم الملف"),
              t("السرير / الرعاية"),
              can("clinical.read") ? t("التشخيص المسجل") : t("حالة الإقامة"),
              t("الفريق المسؤول"),
              t("الدخول"),
              "",
            ]
      }
      rows={rows.map((p) => [
        <button className="patient-cell" onClick={() => openPatient(p.id, p.admission_id, page === "labs" ? "labs" : undefined)}>
          <span className={"baby-avatar " + (p.sex === "female" ? "pink" : "")}>
            <Baby size={22} />
          </span>
          <span>
            <strong>
              {p.name}
              {p.twin_label && (
                <em>
                  {t("توأم")} {p.twin_label}
                </em>
              )}
            </strong>
            <small className="latin">{p.mrn}</small>
          </span>
        </button>,
        <div>
          <strong>{p.bed_name || t("بانتظار التسكين")}</strong>
          <small>{labels[p.care_level] || p.care_level || t("غير محدد")}</small>
        </div>,
        <div>
          {can("clinical.read") && (p.diagnosis || t("غير مسجل"))}
          <small>
            <Badge value={p.admission_status || "registered"} />
          </small>
        </div>,
        <div>
          {p.doctor_name || t("غير محدد")}
          <small>{p.nurse_name || t("التمريض غير محدد")}</small>
        </div>,
        <div>
          {date(p.admitted_at)}
          {can("clinical.read") && (
            <small>
              {p.latest_weight || p.birth_weight
                ? fmt(p.latest_weight || p.birth_weight) + (" " + t("جم"))
                : t("الوزن غير مسجل")}
            </small>
          )}
        </div>,
        <button
          className="icon-button small"
          aria-label={t("فتح ملف") + " " + p.name}
          onClick={() => openPatient(p.id, p.admission_id, page === "labs" ? "labs" : undefined)}
        >
          <ChevronLeft size={18} />
        </button>,
      ])}
    />
  );
  return (
    <>
      <div className="app-shell">
        <aside className={"sidebar " + (mobile ? "show" : "")}>
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              navigate("dashboard");
            }}
          >
            <span className="brand-symbol">
              <img
                className="hospital-logo"
                src="/hospital-logo.png"
                alt={
                  english ? "Qasr El Maadi Hospital" : "شعار مستشفى قصر المعادي"
                }
              />
            </span>
            <span>
              <strong>{english ? "Qasr Al Maadi" : t("قصر المعادي")}</strong>
              <small>
                {english ? "HOSPITAL" : t("مستشفى قصر المعادي")}
              </small>
            </span>
          </a>
          <div className="department">
            <span className="department-icon">
              <Baby size={21} />
            </span>
            <div>
              <strong>
                {english ? "All hospital departments" : t("جميع أقسام المستشفى")}
              </strong>
              <small>
                {english ? "Hospital management" : t("نظام إدارة المستشفى")}
              </small>
            </div>
            <ChevronDown size={14} />
          </div>
          <label className="sidebar-search">
            <Search size={17} />
            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder={english ? "Find a section…" : "ابحث عن قسم…"}
              aria-label={english ? "Search sections" : "بحث الأقسام"}
            />
          </label>
          <nav aria-label={english ? "Main navigation" : "القائمة الرئيسية"}>
            {navGroups.map((group) => {
              const items = matchingMenu.filter((item) =>
                group.pages.includes(item[0]),
              );
              return items.length ? (
                <section className="nav-group" key={group.id}>
                  <h2 className="nav-group-title">
                    {english ? group.en : group.ar}
                  </h2>
                  {items.map(([key, ar, en, Icon]) => (
                    <button
                      key={key}
                      className={page === key ? "active" : ""}
                      aria-current={page === key ? "page" : undefined}
                      data-page={key}
                      onClick={() => navigate(key)}
                    >
                      <Icon size={19} />
                      <span>{english ? en : ar}</span>
                      {key === "patients" &&
                        beds.some((b) => b.status === "occupied") && (
                          <b>
                            {fmt(
                              beds.filter((b) => b.status === "occupied")
                                .length,
                            )}
                          </b>
                        )}
                      {key === "dashboard" && <span className="active-dot" />}
                    </button>
                  ))}
                </section>
              ) : null;
            })}
            {!matchingMenu.length && (
              <p className="nav-empty">
                {english ? "No matching sections" : "لا توجد أقسام مطابقة"}
              </p>
            )}
            <div className="sidebar-bottom">
              <div className="nav-label">
                {english ? "Administration & support" : t("الإدارة والدعم")}
              </div>
              {can("audit.read") && (
                <button
                  className={page === "audit" ? "active" : ""}
                  onClick={() => navigate("audit")}
                >
                  <ShieldCheck size={18} />{" "}
                  {english ? "Audit trail" : t("سجل التدقيق")}
                </button>
              )}
              <button
                className={page === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <Settings size={18} /> {english ? "Settings" : t("الإعدادات")}
              </button>
              <button
                className={page === "help" ? "active" : ""}
                onClick={() => navigate("help")}
              >
                <HelpCircle size={18} />{" "}
                {english ? "Help center" : t("المساعدة ودليل التشغيل")}
              </button>
              <div className="sidebar-note">
                {connectionStatus === "online" ? (
                  <span className="online-dot" />
                ) : (
                  <WifiOff size={14} />
                )}
                <span>
                  {connectionStatus === "online"
                    ? english
                      ? "Connected to server"
                      : "متصل بالخادم"
                    : english
                      ? "Checking connection"
                      : "فحص الاتصال"}
                </span>
                <ShieldCheck size={14} />
              </div>
            </div>
          </nav>
          <div className="user-box">
            <button
              className="user-avatar"
              aria-label={t("أمان حسابي")}
              onClick={() => navigate("security")}
            >
              {session.user.name?.slice(0, 1)}
            </button>
            <div>
              <strong>{session.user.name}</strong>
              <small>{labels[session.user.role] || session.user.role}</small>
            </div>
            <button
              className="icon-button small"
              aria-label={t("تسجيل الخروج")}
              onClick={async () => {
                await api("/logout", {});
                setSession((previous) =>
                  previous ? { ...previous, user: null } : null,
                );
                setData({});
                setPatientId(null);
                setPage("dashboard");
                updateLocation(
                  "dashboard",
                  undefined,
                  undefined,
                  undefined,
                  true,
                );
                setPatientContext({ admission: undefined, tab: undefined });
                setForm(null);
                setPrintData(null);
                setUsers([]);
                setBeds([]);
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        {mobile && (
          <div className="sidebar-scrim" onClick={() => setMobile(false)} />
        )}
        <main className="main">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-toggle"
                aria-label={t("القائمة")}
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={21} />
              </button>
              <span>{english ? "Hospital management" : t("إدارة المستشفى")}</span>
              <ChevronLeft size={14} />
              <strong>{title}</strong>
            </div>
            <div className="top-actions">
              <button
                className="language"
                onClick={() => setLanguage(english ? "ar" : "en")}
              >
                {english ? t("العربية") : "EN"}
              </button>
              <span className="divider" />
              <button
                className="icon-button"
                aria-label={dark ? t("الوضع النهاري") : t("الوضع الليلي")}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                className="icon-button"
                aria-label={t("التنبيهات والمهام")}
                onClick={() =>
                  navigate(can("clinical.read") ? "tasks" : "help")
                }
              >
                <Bell size={20} />
                {Number(stats.overdue_tasks) > 0 && (
                  <i className="notification-dot" />
                )}
              </button>
              <button
                className="top-avatar"
                aria-label={t("أمان الحساب")}
                onClick={() => navigate("security")}
              >
                {session.user.name?.slice(0, 1)}
              </button>
            </div>
          </header>
          {connectionStatus === "offline" && (
            <div
              role="status"
              className="error-box"
              style={{ margin: "14px 24px 0", flexWrap: "wrap" }}
            >
              <WifiOff size={19} />
              <div style={{ flex: "1 1 240px" }}>
                <strong>
                  {english
                    ? "Server unavailable — new changes are not saved"
                    : "الخادم غير متاح — لم تُحفظ العمليات الجديدة"}
                </strong>
                <p style={{ fontSize: 11 }}>
                  {english
                    ? "Displayed records may be outdated. A change is saved only after the server confirms it."
                    : "قد تكون السجلات الظاهرة قديمة. لا يُعتبر أي تغيير محفوظًا إلا بعد تأكيد الخادم."}
                </p>
              </div>
              <button
                className="button small"
                onClick={() => setHealthAttempt((value) => value + 1)}
              >
                <RefreshCw size={15} />
                {english ? "Retry connection" : "إعادة فحص الاتصال"}
              </button>
            </div>
          )}
          {connectionStatus === "online" && connectionRecovered && (
            <div
              role="status"
              className="info-box"
              style={{ margin: "14px 24px 0", flexWrap: "wrap" }}
            >
              <CheckCircle2 size={19} />
              <span style={{ flex: "1 1 240px" }}>
                {english
                  ? "The server is reachable again. Reload to get current records; unsaved drafts have not been submitted automatically."
                  : "عاد الاتصال بالخادم. أعد التحميل لاسترجاع السجلات الحالية؛ لم تُرسل المسودات غير المحفوظة تلقائيًا."}
              </span>
              <button
                className="button small"
                onClick={() => window.location.reload()}
              >
                {english ? "Reload from server" : "إعادة التحميل من الخادم"}
              </button>
            </div>
          )}
          <div className="content">
            {patientId ? (
              <Patient
                key={patientId}
                id={patientId}
                initialAdmissionId={patientContext.admission}
                initialTab={patientContext.tab}
                userRole={session.user.role}
                onContextChange={(admissionId, tab) =>
                  updateLocation("patients", patientId, admissionId, tab, true)
                }
                revision={revision}
                openForm={setForm}
                back={() => {
                  navigate(returnPage.current);
                  refresh();
                }}
                can={can}
                print={print}
                users={users}
                beds={beds}
                notify={notify}
                refresh={refresh}
              />
            ) : (
              <>
                <div className="page-heading contextual-section-heading">
                  <div>
                    <div className="eyebrow">
                      {currentGroup
                        ? english
                          ? currentGroup.en
                          : currentGroup.ar
                        : english
                          ? "Administration & support"
                          : "الإدارة والدعم"}
                    </div>
                    <h1>{title}</h1>
                    <p>
                      {pageNotes[page]?.[english ? 1 : 0] ||
                        (english
                          ? "Records and actions available for your role."
                          : "السجلات والإجراءات المتاحة لدورك.")}
                    </p>
                  </div>
                  <div className="heading-actions">
                    {page !== "dashboard" && (
                      <button
                        className="button small"
                        onClick={refresh}
                        aria-label={english ? "Refresh section" : "تحديث القسم"}
                      >
                        <RefreshCw size={16} />
                        {english ? "Refresh" : "تحديث"}
                      </button>
                    )}
                    {page === "dashboard" && (
                      <div className="date-chip">
                        <CalendarDays size={17} />
                        <span>
                          {new Intl.DateTimeFormat(
                            english ? "en-GB" : "ar-EG",
                            {
                              timeZone: "Africa/Cairo",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            },
                          ).format(new Date())}
                          <small>
                            {english
                              ? "Cairo local time"
                              : t("التوقيت المحلي · القاهرة")}
                          </small>
                        </span>
                      </div>
                    )}
                    {["hospital", "appointments", "outpatient", "emergency", "inpatient", "dashboard", "patients", "beds"].includes(page) &&
                      can("patients.write") && (
                        <button className="button primary" onClick={admission}>
                          <Plus size={18} />
                          {page === "beds"
                            ? english
                              ? `Place patient in available bed (${beds.filter((bed) => bed.status === "available").length})`
                              : `${t("تسكين مريض في سرير متاح")} (${fmt(beds.filter((bed) => bed.status === "available").length)})`
                            : english
                              ? "Add patient"
                              : t("إضافة مريض جديد")}
                        </button>
                      )}
                  </div>
                </div>
                {error && (
                  <div className="error-box" role="alert">
                    {error}
                    <button className="button small" onClick={refresh}>
                      {" "}
                      {t("إعادة المحاولة")}{" "}
                    </button>
                  </div>
                )}
                {loading ? (
                  <div className="loading">
                    <RefreshCw className="spin" size={22} />{" "}
                    {t("جارٍ استرجاع السجلات…")}{" "}
                  </div>
                ) : (
                  <>
                    {["hospital", "appointments", "outpatient", "emergency", "inpatient", "radiology", "pharmacy", "surgery", "departments"].includes(page) && (
                      <HospitalWorkspace key={`${page}:${revision}`} page={page} user={session.user} onPatient={openPatient} notify={notify} />
                    )}
                    {page === "dashboard" && (
                      <Dashboard
                        can={can}
                        dash={dash}
                        english={english}
                        navigate={navigate}
                        refresh={refresh}
                        setStatus={setStatus}
                        openPatient={openPatient}
                        patients={patients}
                        filtered={filtered}
                        search={search}
                        setSearch={setSearch}
                        patientTable={patientTable}
                      />
                    )}
                    {page === "patients" && (
                      <Section
                        title={t("سجل المرضى والزيارات")}
                        action={
                          <div className="button-row compact">
                            {can("patients.write") && (
                              <button className="button primary small" onClick={admission}>
                                <Plus size={16} /> {t("إضافة مريض جديد")}
                              </button>
                            )}
                            {can("export") && (
                              <button
                                className="button small"
                                onClick={() => exportData("patients")}
                              >
                                <Download size={16} /> {t("تصدير")}{" "}
                              </button>
                            )}
                          </div>
                        }
                      >
                        <div className="table-toolbar">
                          <div className="search-input">
                            <Search size={17} />
                            <input
                              aria-label={t("بحث المرضى")}
                              placeholder={t(
                                "الاسم، رقم الملف، الأم أو السرير",
                              )}
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          <select
                            aria-label={t("تصفية حالة الإقامة")}
                            value={status}
                            onChange={(e) => {
                              setStatus(e.target.value);
                              localStorage.setItem(
                                "nicu-status-filter",
                                e.target.value,
                              );
                            }}
                          >
                            <option value="">{t("كل الإقامات")}</option>
                            <option value="active">
                              {t("الزيارات النشطة")}
                            </option>
                            <option value="discharged">
                              {t("الخروج السابق")}
                            </option>
                          </select>
                        </div>
                        {filtered.length === 0 && can("patients.write") && (
                          <div className="empty-patient-action">
                            <Baby size={34} />
                            <strong>{t("لا توجد ملفات مرضى مسجلة")}</strong>
                            <button className="button primary" onClick={admission}>
                              <Plus size={18} /> {t("إضافة أول مريض")}
                            </button>
                          </div>
                        )}
                        {patientTable(filtered)}
                      </Section>
                    )}
                    {page === "labs" && (
                      <Section
                        title={t("متابعة التحاليل حسب ملف المريض")}
                        sub={t(
                          "افتح الملف ثم تبويب التحاليل لاستلام العينات وتوثيق النتائج ومراجعتها",
                        )}
                      >
                        {patientTable(filtered)}
                      </Section>
                    )}
                    {[
                      "beds",
                      "tasks",
                      "inventory",
                      "billing",
                      "accounts",
                      "invoices",
                      "treasury",
                      "reports",
                      "audit",
                    ].includes(page) && (page !== "inventory" || can("stock.read")) && (
                      <Operations
                        revision={revision}
                        userRole={session.user.role}
                        page={page}
                        data={
                          ["accounts", "invoices", "treasury"].includes(page)
                            ? { ...data, billing: data[page] }
                            : data
                        }
                        can={can}
                        setForm={setForm}
                        users={users}
                        openPatient={openPatient}
                        navigate={navigate}
                        print={print}
                        exportData={exportData}
                      />
                    )}
                    {page === "registers" && (
                      <Registers
                        userRole={session.user.role}
                        revision={revision}
                        openForm={setForm}
                        can={can}
                        notify={notify}
                      />
                    )}
                    {page === "consumables" && can("consumables.read") && (
                      <Consumables
                        can={can}
                        openForm={setForm}
                        notify={notify}
                        revision={revision}
                        refresh={refresh}
                      />
                    )}
                    {page === "inventory" && can("consumables.read") && (
                      <Consumables can={can} openForm={setForm} notify={notify} revision={revision} refresh={refresh}/>
                    )}
                    {page === "settings" && (
                      <>
                        <SettingsPage
                          canManage={can("settings.write")}
                          data={data.settings || {}}
                          setForm={setForm}
                          navigate={navigate}
                          notify={notify}
                          refresh={refresh}
                        />
                        {session.user.role === "admin" &&
                          can("settings.write") && <Updates />}
                      </>
                    )}
                    {page === "users" && (
                      <UsersPage
                        users={data.users || users}
                        setForm={setForm}
                      />
                    )}
                    {page==='monitoring'&&<Monitoring can={can} openForm={setForm} revision={revision} openPatient={openPatient}/>}
                    {page==='accounts'&&can('purchase.read')&&<PurchaseOrders can={can} openForm={setForm} revision={revision}/>}
                    {page==='purchases'&&<PurchaseOrders can={can} openForm={setForm} revision={revision}/>}
                    {page === "help" && (
                      <>
                        <DepartmentChat user={session.user} />
                        <details className="help-guide">
                          <summary>
                            {english
                              ? "Operating guide"
                              : "دليل التشغيل والمساعدة"}
                          </summary>
                          <Help />
                        </details>
                      </>
                    )}
                    {page === "equipment" && (
                      <Equipment
                        can={can}
                        openForm={setForm}
                        notify={notify}
                        revision={revision}
                        refresh={refresh}
                      />
                    )}
                    {page === "maintenance" && (
                      <Maintenance
                        can={can}
                        userRole={session.user.role}
                        openForm={setForm}
                        notify={notify}
                        revision={revision}
                        refresh={refresh}
                      />
                    )}
                    {page === "attendance" && (
                      <Attendance
                        can={can}
                        openForm={setForm}
                        notify={notify}
                        revision={revision}
                        refresh={refresh}
                      />
                    )}
                    {page === "security" && (
                      <Security
                        setForm={setForm}
                        notify={notify}
                        revision={revision}
                        logout={() =>
                          setSession((previous) =>
                            previous ? { ...previous, user: null } : null,
                          )
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <footer className="app-footer">
            <span>
              {english
                ? "Qasr Al Maadi Hospital · Hospital Management"
                : t("مستشفى قصر المعادي · نظام إدارة المستشفى")}
            </span>
            <span>
              {english ? "Training release" : "إصدار التدريب"}{" "}
              <bdi>{appPackage.version}</bdi> <i /> Africa/Cairo
            </span>
            <div className="creator-credit">
              {english ? "Created and designed by " : "إنشاء وتصميم "}
              <a
                href="https://wa.me/201112081120"
                target="_blank"
                rel="noopener noreferrer"
              >
                {english ? "Ahmed Hosny" : "أحمد حسني"}
              </a>
            </div>
          </footer>
        </main>
      </div>
      {form && (
        <FormModal
          key={form.title}
          spec={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            notify("تم الحفظ بنجاح — الإجراء موثق باسمك");
            refresh();
          }}
        />
      )}
      {toast && (
        <div className={"toast " + (toast.error ? "error" : "")} role="status">
          <CheckCircle2 size={20} />
          {t(toast.text)}
          <button
            aria-label={t("إغلاق الإشعار")}
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {printData && <PrintSheet data={printData} />}
    </>
  );
}
function StartupUnavailable({
  english,
  offline,
  retry,
}: {
  english: boolean;
  offline: boolean;
  retry: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "clamp(20px,5vw,64px)",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="panel" style={{ padding: "clamp(20px,4vw,40px)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div className="brand" style={{ padding: 0 }}>
              <span className="brand-symbol">
                <HeartPulse size={28} />
              </span>
              <span>
                <strong>{english ? "Qasr Al Maadi" : "قصر المعادي"}</strong>
                <small>
                  {english ? "HOSPITAL MANAGEMENT" : "نظام إدارة المستشفى"}
                </small>
              </span>
            </div>
            <button
              className="button small"
              onClick={() => setLanguage(english ? "ar" : "en")}
            >
              {english ? "العربية" : "English"}
            </button>
          </div>
          <WifiOff
            size={38}
            style={{ color: "var(--teal)", marginBottom: 12 }}
          />
          <h1 style={{ fontSize: "clamp(23px,4vw,32px)" }}>
            {english
              ? "The server is currently unreachable"
              : "تعذّر الاتصال بالخادم حاليًا"}
          </h1>
          <p style={{ margin: "12px 0", color: "var(--muted)" }}>
            {english
              ? "The app interface is available, but login, patient records, and saving care or financial actions require a working connection to the hospital server."
              : "واجهة النظام متاحة، لكن تسجيل الدخول وملفات المرضى وحفظ إجراءات الرعاية والحسابات تحتاج اتصالًا فعليًا بخادم المستشفى."}
          </p>
          <div role="status" className="info-box" style={{ marginTop: 20 }}>
            <ShieldCheck size={21} />
            <span>
              {english
                ? "Patient records and login responses are not stored in the offline cache. No action has been saved offline or queued for automatic submission."
                : "لا تُخزّن ملفات المرضى أو استجابات تسجيل الدخول في ذاكرة العمل دون اتصال. لم يُحفظ أي إجراء دون اتصال ولم يُجهّز للإرسال التلقائي."}
            </span>
          </div>
          <div className="button-row">
            <button className="button primary" onClick={retry}>
              <RefreshCw size={17} />
              {english ? "Retry server connection" : "إعادة الاتصال بالخادم"}
            </button>
            <button
              className="button"
              onClick={() => setShowHelp((value) => !value)}
            >
              <HelpCircle size={17} />
              {showHelp
                ? english
                  ? "Hide operating guide"
                  : "إخفاء دليل التشغيل"
                : english
                  ? "Open offline help"
                  : "فتح المساعدة دون اتصال"}
            </button>
          </div>
          <section
            aria-label={
              english
                ? "Connection and downtime guidance"
                : "إرشادات الاتصال والانقطاع"
            }
          >
            <h3>{english ? "What to do now" : "ماذا تفعل الآن؟"}</h3>
            <ol
              style={{
                paddingInlineStart: 24,
                lineHeight: 2.2,
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <li>
                {english
                  ? "Check access to the hospital network or contact your administrator. A local hospital server can remain available even when the public internet is down."
                  : "تحقق من الاتصال بشبكة المستشفى أو تواصل مع المسؤول. يمكن للخادم المحلي أن يظل متاحًا عند انقطاع الإنترنت العام."}
              </li>
              <li>
                {english
                  ? "During downtime, follow the hospital-approved alternative documentation procedure. Record the original event time and responsible staff for later authorized entry."
                  : "أثناء الانقطاع، اتبع إجراء التوثيق البديل المعتمد بالمستشفى، مع تسجيل وقت الحدث الأصلي والمسؤول تمهيدًا للإدخال اللاحق بواسطة المخولين."}
              </li>
              <li>
                {english
                  ? "Retry when the server is reachable. Only a live server response can confirm your identity and restore access to current records."
                  : "أعد المحاولة عندما يعود الخادم. استجابة الخادم الفعلية وحدها تؤكد هويتك وتعيد الوصول إلى السجلات الحالية."}
              </li>
            </ol>
            <small>
              {offline
                ? english
                  ? "Your browser reports a network interruption; connection checks still attempt to reach the server."
                  : "يشير المتصفح إلى انقطاع الشبكة؛ تظل محاولة الاتصال بالخادم متاحة."
                : english
                  ? "A network, DNS, certificate, or server issue may be preventing access."
                  : "قد توجد مشكلة بالشبكة أو اسم النطاق أو الشهادة أو الخادم تمنع الوصول."}
            </small>
          </section>
        </div>
        {showHelp && <Help />}
      </div>
    </main>
  );
}

function Login({ onLogin, error: initialError, setupRequired = false }: {
  onLogin: (s: Row) => void;
  error: string;
  setupRequired?: boolean;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="brand light">
          <span className="brand-symbol">
            <img
              className="hospital-logo"
              src="/hospital-logo.png"
              alt={t("شعار المستشفى")}
            />
          </span>
          <span>
            <strong>{t("قصر المعادي")}</strong>
            <small>{t("مستشفى قصر المعادي")}</small>
          </span>
        </div>
        <div className="login-story">
          <span className="eyebrow">{t("نظام إدارة المستشفى")}</span>
          <h1>
            {" "}
            {t("مستشفى مترابط.")} <br /> {t("رعاية تصنع الفرق.")}{" "}
          </h1>
          <p>
            {t("ملف واحد للمريض، وأقسام متصلة في كل خطوة من رحلة الرعاية.")}
          </p>
          <div className="care-illustration">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="care-center">
              <HeartPulse size={76} strokeWidth={1.3} />
              <span>HOSPITAL</span>
            </div>
            <span className="float-icon one">
              <HeartPulse />
            </span>
            <span className="float-icon two">
              <ShieldCheck />
            </span>
            <span className="float-icon three">
              <Baby />
            </span>
          </div>
        </div>
        <p className="login-art-foot">
          <ShieldCheck size={16} />{" "}
          {t("هوية واضحة. توثيق دقيق. رعاية مترابطة.")}{" "}
        </p>
      </section>
      <section className="login-form-wrap">
        <div className="login-card">
          <span className="login-tag">
            <span className="online-dot" /> {t("نظام التشغيل")}{" "}
          </span>
          <h2>{t("أهلًا بك في مستشفى قصر المعادي")}</h2>
          <p>{t("سجّل الدخول إلى نظام إدارة المستشفى")}</p>
          {setupRequired ? (
            <div className="error-box" role="status">
              {t("لم يكتمل إعداد النظام. تواصل مع مسؤول النظام لإنشاء حساب الإدارة، ثم أعد تحميل الصفحة.")}
            </div>
          ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/login", {
                  username,
                  password,
                });
                onLogin(await api("/session"));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <label>
              <span>{t("اسم المستخدم")}</span>
              <input
                autoComplete="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                dir="ltr"
              />
            </label>
            <label>
              <span>{t("كلمة المرور")}</span>
              <input
                autoComplete="current-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
              />
            </label>
            <button type="submit" disabled={busy} className="button primary">
              {busy ? (
                <RefreshCw size={18} className="spin" />
              ) : (
                <ArrowLeft size={18} />
              )}{" "}
              {busy ? t("جارٍ التحقق…") : t("تسجيل الدخول")}
            </button>
          </form>
          )}
          <div className="login-disclaimer">
            <ShieldCheck size={19} />
            <span>
              {" "}
              {t(
                "استخدم حسابك المصرح به؛ تُسجّل العمليات باسم المستخدم في سجل التدقيق.",
              )}{" "}
            </span>
          </div>
        </div>
        <p className="login-footer">
          QASR AL MAADI HOSPITAL <i /> NEONATAL CARE
        </p>
      </section>
    </div>
  );
}
