import { t, getLocale } from "./i18n";
import RoleDashboard, {
  OverviewCharts,
  BedCapacityChart,
} from "./RoleDashboard";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BedDouble,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock3,
  FlaskConical,
  Heart,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ActionLink, date, fmt, Row, Section } from "./shared";
type Props = {
  can: (p: string) => boolean;
  dash: Row;
  english: boolean;
  navigate: (s: string) => void;
  refresh: () => void;
  setStatus: (s: string) => void;
  openPatient: (id: string, admissionId?: string, tab?: string) => void;
  patients: Row[];
  filtered: Row[];
  search: string;
  setSearch: (s: string) => void;
  patientTable: (rows: Row[]) => ReactNode;
};
export default function Dashboard({
  can,
  dash,
  english,
  navigate,
  refresh,
  setStatus,
  openPatient,
  patients,
  filtered,
  search,
  setSearch,
  patientTable,
}: Props) {
  if (!can("clinical.read"))
    return (
      <RoleDashboard
        dash={dash}
        english={english}
        can={can}
        navigate={navigate}
        patientTable={patientTable}
      />
    );
  const stats = dash.stats || {},
    occupancy = stats.operational
      ? (stats.occupied / stats.operational) * 100
      : 0;
  return (
    <>
      <div className="overview-heading">
        <h2>{english ? "The unit at a glance" : t("القسم في لمحة")}</h2>
        <span>
          <i className="online-dot" />
          {english ? "Updated" : t("آخر تحديث")}{" "}
          {new Intl.DateTimeFormat(getLocale(), {
            timeZone: "Africa/Cairo",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(dash.updated_at || Date.now()))}
          <button
            className="icon-button small"
            aria-label={t("تحديث المؤشرات")}
            onClick={refresh}
          >
            <RefreshCw size={13} />
          </button>
        </span>
      </div>
      <div className="stats-grid">
        <button className="stat-card teal" onClick={() => navigate("beds")}>
          <div>
            <span>{english ? "Bed occupancy" : t("إشغال الحضّانات")}</span>
            <span className="stat-icon">
              <BedDouble size={22} />
            </span>
          </div>
          <strong>
            {fmt(stats.occupied)}
            <small>
              {" "}
              / {fmt(stats.operational)} {english ? "beds" : t("سرير")}
            </small>
          </strong>
          <div className="stat-bottom">
            <span className="stat-pill">{fmt(occupancy)}%</span>
            <span>
              {english ? "of operational capacity" : t("من الطاقة التشغيلية")}
            </span>
          </div>
          <div className="stat-progress">
            <i style={{ width: Math.min(100, occupancy) + "%" }} />
          </div>
        </button>
        <button
          className="stat-card"
          onClick={() => {
            navigate("patients");
            setStatus("active");
          }}
        >
          <div>
            <span>{english ? "Admissions today" : t("دخول اليوم")}</span>
            <span className="stat-icon blue">
              <ArrowDownLeft size={23} />
            </span>
          </div>
          <strong>
            {fmt(stats.admissions_today)}
            <small>{english ? "infants" : t("أطفال")}</small>
          </strong>
          <div className="stat-bottom">
            <span className="round-icon blue">
              <ArrowDownLeft size={14} />
            </span>
            <span>
              {english
                ? "Since midnight in Cairo"
                : t("من بداية اليوم بتوقيت القاهرة")}
            </span>
          </div>
        </button>
        <button
          className="stat-card"
          onClick={() => {
            navigate("patients");
            setStatus("discharged");
          }}
        >
          <div>
            <span>{english ? "Discharges today" : t("خروج اليوم")}</span>
            <span className="stat-icon purple">
              <ArrowUpRight size={23} />
            </span>
          </div>
          <strong>
            {fmt(stats.discharges_today)}
            <small>{english ? "infants" : t("أطفال")}</small>
          </strong>
          <div className="stat-bottom">
            <span className="round-icon purple">
              <Check size={14} />
            </span>
            <span>
              {english
                ? "Documented medical discharges"
                : t("حالات خروج طبي موثقة")}
            </span>
          </div>
        </button>
        <button className="stat-card" onClick={() => navigate("labs")}>
          <div>
            <span>{english ? "Pending results" : t("نتائج قيد المتابعة")}</span>
            <span className="stat-icon amber">
              <FlaskConical size={22} />
            </span>
          </div>
          <strong>
            {fmt(stats.pending_labs)}
            <small>{english ? "tests" : t("فحص")}</small>
          </strong>
          <div className="stat-bottom">
            <span className="round-icon amber">
              <Clock3 size={14} />
            </span>
            <span>
              {english
                ? "Awaiting results or review"
                : t("تنتظر النتيجة أو المراجعة")}
            </span>
          </div>
        </button>
      </div>
      <OverviewCharts dash={dash} english={english} can={can} />
      <div className="dashboard-middle">
        <BedCapacityChart dash={dash} english={english} navigate={navigate} />
        <Section
          title={english ? "Your attention, please" : t("تحتاج إلى انتباهك")}
          sub={
            english
              ? "Tasks to keep the shift moving"
              : t("مهام ومتابعات لاستمرار الرعاية")
          }
          action={
            <span className="count-badge">
              {fmt((dash.tasks || []).length)}
            </span>
          }
        >
          <div className="attention-list">
            {(dash.tasks || []).slice(0, 3).map((taskRow: Row, i: number) => (
              <button
                key={taskRow.id}
                className="attention-item"
                onClick={() =>
                  taskRow.patient_id
                    ? openPatient(taskRow.patient_id, taskRow.admission_id, taskRow.order_id ? "orders" : "nursing")
                    : navigate("tasks")
                }
              >
                <span
                  className={"attention-icon " + (i === 0 ? "amber" : "blue")}
                >
                  {i === 0 ? <Clock3 size={19} /> : <ClipboardList size={19} />}
                </span>
                <div>
                  <strong>{taskRow.title}</strong>
                  <small>
                    {taskRow.patient_name ||
                      taskRow.assignee_name ||
                      t("مهمة بالقسم")}{" "}
                    · {date(taskRow.due_at, true)}
                  </small>
                </div>
                <ChevronLeft size={17} />
              </button>
            ))}
            {!(dash.tasks || []).length && (
              <div className="calm-state">
                <CheckCircle2 size={29} />
                <strong>
                  {english ? "No open tasks" : t("لا توجد مهام معلّقة")}
                </strong>
                <span>
                  {english
                    ? "New follow-ups appear here."
                    : t("تظهر هنا المتابعات المسجلة على القسم")}
                </span>
              </div>
            )}
          </div>
          <div className="panel-foot">
            <ActionLink onClick={() => navigate("tasks")}>
              {english
                ? "All tasks and follow-ups"
                : t("عرض المهام والمتابعات")}
            </ActionLink>
          </div>
        </Section>
      </div>
      <Section
        title={english ? "Infants in our care" : t("الأطفال تحت رعايتنا")}
        sub={
          english
            ? "Current admissions and assigned care teams"
            : t("الإقامات الحالية وفرق الرعاية المسؤولة")
        }
        action={
          <div className="inline-actions">
            <span className="count-badge">
              {fmt(patients.length)} {english ? "infants" : t("طفل")}
            </span>
            <ActionLink onClick={() => navigate("patients")}>
              {english ? "View all" : t("عرض الكل")}
            </ActionLink>
          </div>
        }
      >
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label={t("البحث في الأطفال")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                english
                  ? "Search name, record number, or bed…"
                  : t("ابحث باسم الطفل، رقم الملف، أو السرير…")
              }
            />
          </div>
          <button className="button small" onClick={() => navigate("patients")}>
            <SlidersHorizontal size={16} />
            {english ? "Filters" : t("تصفية")}
          </button>
        </div>
        {patientTable(filtered.slice(0, 5))}
        <div className="table-footer">
          <span>
            {english ? "Showing" : t("عرض")} {fmt(Math.min(filtered.length, 5))}{" "}
            {english ? "of" : t("من")} {fmt(filtered.length)}{" "}
            {english ? "records" : t("سجل")}
          </span>
          <ActionLink onClick={() => navigate("patients")}>
            {english ? "All patient records" : t("جميع ملفات الأطفال")}
          </ActionLink>
        </div>
      </Section>
      <div className="dashboard-note">
        <Heart size={15} />
        {english
          ? "Behind every record, a little life worth caring for."
          : t("وراء كل ملف، حياة صغيرة تستحق كل الرعاية.")}
        <span>QASR AL MAADI · NICU</span>
      </div>
    </>
  );
}
