import { t, getLocale } from "./i18n";
import { useId, useState, type ReactNode } from "react";
import "./dashboard-charts.css";
import {
  BedDouble,
  Wallet,
  Package,
  FlaskConical,
  ArrowUpRight,
  ShieldCheck,
  ClipboardList,
  BarChart3,
  CalendarDays,
  Layers3,
} from "lucide-react";
import { Section, fmt, money, date, type Row } from "./shared";
export default function RoleDashboard({
  dash,
  english,
  can,
  navigate,
  patientTable,
}: {
  dash: Row;
  english: boolean;
  can: (permission: string) => boolean;
  navigate: (page: string) => void;
  patientTable: (rows: Row[]) => ReactNode;
}) {
  const s = dash.stats || {};
  const bedAccess = can("patients.read") || can("beds.write");
  const finance = can("billing.read"),
    financeExpenses = can("purchase.approve"),
    stock = can("stock.read"),
    lab = can("lab.write");
  const cards = [
    {
      title: english ? "Occupied beds" : t("الحضّانات المشغولة"),
      value: `${fmt(s.occupied)} / ${fmt(s.operational)}`,
      note: t("من الطاقة التشغيلية الحالية"),
      icon: BedDouble,
      page: "beds",
    },
    {
      title: english ? "Available beds" : t("جاهز للاستقبال"),
      value: fmt(s.available),
      note: t("أسرة جاهزة فعليًا للتسكين"),
      icon: BedDouble,
      page: "beds",
    },
    ...(finance
      ? [
          {
            title: financeExpenses ? t("صافي الإيراد بعد المصروفات") : t("صافي التحصيل"),
            value: money(financeExpenses ? s.net_revenue : s.received),
            note: financeExpenses ? t("المحصّل بعد مشتريات المخزون والصيانة") : t("المدفوعات مطروحًا منها الاسترداد"),
            icon: Wallet,
            page: financeExpenses ? "reports" : "billing",
          },
          {
            title: t("الرصيد المستحق"),
            value: money(s.outstanding),
            note: t("الرسوم ناقص صافي المدفوعات"),
            icon: Wallet,
            page: "billing",
          },
        ]
      : lab
        ? [
            {
              title: t("نتائج قيد المتابعة"),
              value: fmt(s.pending_labs),
              note: t("عينات ونتائج تحتاج متابعة"),
              icon: FlaskConical,
              page: "labs",
            },
          ]
        : stock
          ? [
              {
                title: t("المخزون والمستلزمات"),
                value: bedAccess ? t("التشغيلات") : fmt(s.stock_items),
                note: t("مراجعة الصلاحية والرصيد وحد الطلب"),
                icon: Package,
                page: "inventory",
              },
            ]
          : [
              {
                title: t("الدخول اليوم"),
                value: fmt(s.admissions_today),
                note: t("من بداية اليوم بتوقيت القاهرة"),
                icon: ClipboardList,
                page: can("patients.read") ? "patients" : "beds",
              },
            ]),
    ...(!bedAccess && can("purchase.read") ? [{
      title: t("طلبات وأوامر الشراء"),
      value: fmt(s.pending_purchases),
      note: english ? "Requests awaiting approval or receiving" : "طلبات تنتظر الاعتماد أو الاستلام",
      icon: ClipboardList,
      page: "purchases",
    }] : []),
  ].filter(card => card.page !== "beds" || bedAccess);
  return (
    <>
      <div className="overview-heading">
        <h2>{english ? "Your workspace" : t("مساحة عملك اليوم")}</h2>
        <span>
          {t("آخر تحديث")} {date(dash.updated_at, true)}
        </span>
      </div>
      <div className="stats-grid">
        {cards.map(({ title, value, note, icon: Icon, page }, i) => (
          <button
            key={title}
            className={"stat-card " + (i === 0 ? "teal" : "")}
            onClick={() => navigate(page)}
          >
            <div>
              <span>{title}</span>
              <span className="stat-icon">
                <Icon size={22} />
              </span>
            </div>
            <strong>{value}</strong>
            <div className="stat-bottom">
              <span>{note}</span>
              <ArrowUpRight size={15} />
            </div>
          </button>
        ))}
      </div>
      <OverviewCharts dash={dash} english={english} can={can} />
      {bedAccess && <BedCapacityChart dash={dash} english={english} navigate={navigate} />}
      <Section
        title={t("إجراءات حسب صلاحياتك")}
        sub={t("تُعرض بيانات الدور المصرح بها فقط")}
      >
        <div
          className="inline-actions"
          style={{ padding: 24, flexWrap: "wrap" }}
        >
          {stock && (
            <button
              className="button primary"
              onClick={() => navigate("inventory")}
            >
              <Package size={18} /> {t("فتح المخزون")}{" "}
            </button>
          )}
          {finance && (
            <button
              className="button primary"
              onClick={() => navigate("billing")}
            >
              <Wallet size={18} /> {t("الحسابات والتحصيل")}{" "}
            </button>
          )}
          {lab && (
            <button className="button primary" onClick={() => navigate("labs")}>
              <FlaskConical size={18} /> {t("متابعة العينات والنتائج")}{" "}
            </button>
          )}
          {can("settings.write") && (
            <button className="button" onClick={() => navigate("users")}>
              <ShieldCheck size={18} /> {t("المستخدمون والصلاحيات")}{" "}
            </button>
          )}
          {can("operations.write") && (
            <button className="button" onClick={() => navigate("registers")}>
              <ClipboardList size={18} /> {t("سجلات القسم")}{" "}
            </button>
          )}
        </div>
      </Section>
      {can("patients.read") && (
        <Section
          title={t("سجل الأطفال")}
          sub={t("هوية وتسكين وحالة إقامة ضمن نطاق الاطلاع")}
        >
          {patientTable((dash.patients || []).slice(0, 5))}
        </Section>
      )}
    </>
  );
}

type ChartProps = { dash: Row; english: boolean };
type MovementDay = { date: string; admissions: number; discharges: number };
const BED_COLORS: Record<string, string> = {
  occupied: "#198c82",
  available: "#9bcab4",
  reserved: "#6f91c3",
  cleaning: "#e9bb66",
  maintenance: "#a796bd",
  out_of_service: "#99a5a4",
};
const BED_ORDER = [
  "occupied",
  "available",
  "reserved",
  "cleaning",
  "maintenance",
  "out_of_service",
];
function dayLabel(value: string, long = false) {
  return new Intl.DateTimeFormat(getLocale(), {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { year: "numeric" as const } : {}),
  }).format(new Date(value + "T12:00:00Z"));
}
function EmptyChart({
  english,
  message,
}: {
  english: boolean;
  message?: string;
}) {
  return (
    <div className="dc-empty">
      <BarChart3 size={30} />
      <strong>
        {message ||
          (english
            ? "No recorded activity in this period"
            : "لا توجد حركة مسجلة خلال هذه الفترة")}
      </strong>
      <span>
        {english
          ? "Charts reflect saved records only."
          : "تعكس الرسوم السجلات المحفوظة فقط."}
      </span>
    </div>
  );
}
export function OverviewCharts({
  dash,
  english,
  can,
}: ChartProps & { can: (p: string) => boolean }) {
  if (!can("patients.read")) return null;
  return (
    <div className="dc-overview-grid">
      <MovementChart dash={dash} english={english} />
      <StayProfile dash={dash} english={english} />
    </div>
  );
}
function MovementChart({ dash, english }: ChartProps) {
  const [range, setRange] = useState(14);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const chartId = useId();
  const available: MovementDay[] = Array.isArray(dash.trends?.days)
    ? dash.trends.days
    : [];
  const days = available.slice(-range);
  const sum = days.reduce(
    (acc, day) => ({
      admissions: acc.admissions + Number(day.admissions),
      discharges: acc.discharges + Number(day.discharges),
    }),
    { admissions: 0, discharges: 0 },
  );
  const selected = days.find((day) => day.date === selectedDate) || days.at(-1);
  const peak = Math.max(
    1,
    ...days.flatMap((day) => [Number(day.admissions), Number(day.discharges)]),
  );
  const tick = Math.max(1, Math.ceil(peak / 4));
  const ceiling = tick * 4;
  const width = 700,
    left = 40,
    right = 15,
    top = 20,
    baseline = 185;
  const step = (width - left - right) / Math.max(days.length, 1);
  const barWidth = Math.min(14, step * 0.29);
  const height = (value: number) => (value / ceiling) * (baseline - top);
  const subtitle = english
    ? "Recorded admission and discharge events · Cairo time"
    : "أحداث الدخول والخروج المسجلة · بتوقيت القاهرة";
  return (
    <section className="panel dc-movement" aria-labelledby={chartId}>
      <div className="dc-heading">
        <div>
          <div className="dc-eyebrow">
            <BarChart3 size={15} />
            {english ? "PATIENT FLOW" : "حركة القسم"}
          </div>
          <h3 id={chartId}>
            {english
              ? "Admissions and discharges"
              : "حركة الدخول والخروج"}
          </h3>
          <p>{subtitle}</p>
        </div>
        <div
          className="dc-ranges"
          role="group"
          aria-label={english ? "Chart period" : "فترة الرسم"}
        >
          {[7, 14, 30].map((value) => (
            <button
              key={value}
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                setSelectedDate(null);
              }}
            >
              {fmt(value)} {english ? "days" : "يومًا"}
            </button>
          ))}
        </div>
      </div>
      {days.length ? (
        <>
          <div className="dc-totals">
            <div>
              <span>
                <i style={{ background: BED_COLORS.occupied }} />
                {english ? "Admissions" : "الدخول"}
              </span>
              <strong>{fmt(sum.admissions)}</strong>
            </div>
            <div>
              <span>
                <i style={{ background: BED_COLORS.reserved }} />
                {english ? "Discharges" : "الخروج"}
              </span>
              <strong>{fmt(sum.discharges)}</strong>
            </div>
            <div>
              <span>{english ? "Net movement" : "صافي الحركة"}</span>
              <strong>
                {sum.admissions - sum.discharges > 0 ? "+" : ""}
                {fmt(sum.admissions - sum.discharges)}
              </strong>
            </div>
            <span className="dc-period">
              <CalendarDays size={15} />
              {dayLabel(days[0].date)} — {dayLabel(days.at(-1)!.date)}
            </span>
          </div>
          {sum.admissions + sum.discharges === 0 ? (
            <EmptyChart english={english} />
          ) : (
            <div className="dc-plot">
              <svg
                viewBox={`0 0 ${width} 227`}
                role="img"
                aria-labelledby={`${chartId}-title ${chartId}-description`}
              >
                <title id={`${chartId}-title`}>
                  {english
                    ? "Daily admissions and discharges"
                    : "الدخول والخروج يوميًا"}
                </title>
                <desc id={`${chartId}-description`}>
                  {english
                    ? "Grouped bars show saved events for each Cairo calendar day. Exact values are available in the data table below."
                    : "أعمدة متجاورة لأحداث كل يوم بتوقيت القاهرة. تتوفر القيم الدقيقة في جدول البيانات أدناه."}
                </desc>
                {[0, 1, 2, 3, 4].map((index) => (
                  <g key={index}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={baseline - (index * (baseline - top)) / 4}
                      y2={baseline - (index * (baseline - top)) / 4}
                      className="dc-gridline"
                    />
                    <text
                      x={left - 12}
                      y={baseline - (index * (baseline - top)) / 4 + 4}
                      textAnchor="end"
                      className="dc-axis"
                    >
                      {fmt(index * tick)}
                    </text>
                  </g>
                ))}
                {days.map((day, index) => {
                  const x = left + step * (index + 0.5);
                  return (
                    <g key={day.date}>
                      <rect
                        x={x - step * 0.45}
                        y={top - 5}
                        width={step * 0.9}
                        height={baseline - top + 9}
                        rx="5"
                        fill={
                          selected?.date === day.date
                            ? "var(--teal-soft)"
                            : "transparent"
                        }
                      />
                      <rect
                        x={x - barWidth - 1}
                        y={baseline - height(Number(day.admissions))}
                        width={barWidth}
                        height={height(Number(day.admissions))}
                        rx="3"
                        fill={BED_COLORS.occupied}
                      />
                      <rect
                        x={x + 1}
                        y={baseline - height(Number(day.discharges))}
                        width={barWidth}
                        height={height(Number(day.discharges))}
                        rx="3"
                        fill={BED_COLORS.reserved}
                      />
                      {(days.length <= 7 ||
                        (index < days.length - 2 &&
                          index % Math.ceil(days.length / 7) === 0) ||
                        index === days.length - 1) && (
                        <text
                          x={x}
                          y={baseline + 27}
                          textAnchor="middle"
                          className="dc-axis dc-date-tick"
                        >
                          {dayLabel(day.date)}
                        </text>
                      )}
                      <title>{`${dayLabel(day.date, true)} · ${english ? "Admissions" : "الدخول"}: ${fmt(day.admissions)} · ${english ? "Discharges" : "الخروج"}: ${fmt(day.discharges)}`}</title>
                    </g>
                  );
                })}
              </svg>
              <div
                className="dc-day-targets"
                style={{
                  insetInlineStart: `${(left / width) * 100}%`,
                  insetInlineEnd: `${(right / width) * 100}%`,
                }}
              >
                {days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onMouseEnter={() => setSelectedDate(day.date)}
                    onFocus={() => setSelectedDate(day.date)}
                    onClick={() => setSelectedDate(day.date)}
                    aria-pressed={selected?.date === day.date}
                    aria-label={`${dayLabel(day.date, true)} · ${english ? "Admissions" : "الدخول"} ${fmt(day.admissions)} · ${english ? "Discharges" : "الخروج"} ${fmt(day.discharges)}`}
                    title={`${dayLabel(day.date, true)} · ${english ? "Admissions" : "الدخول"}: ${fmt(day.admissions)} · ${english ? "Discharges" : "الخروج"}: ${fmt(day.discharges)}`}
                  />
                ))}
              </div>
            </div>
          )}
          {selected && (
            <div className="dc-reading" aria-live="polite">
              <span>{dayLabel(selected.date, true)}</span>
              <b>
                <i style={{ background: BED_COLORS.occupied }} />
                {english ? "Admissions" : "الدخول"} {fmt(selected.admissions)}
              </b>
              <b>
                <i style={{ background: BED_COLORS.reserved }} />
                {english ? "Discharges" : "الخروج"} {fmt(selected.discharges)}
              </b>
            </div>
          )}
          <details className="dc-data">
            <summary>
              {english ? "View daily values" : "عرض القيم اليومية"}
            </summary>
            <div className="table-scroll">
              <table>
                <caption>{subtitle}</caption>
                <thead>
                  <tr>
                    <th>{english ? "Date" : "التاريخ"}</th>
                    <th>{english ? "Admissions" : "الدخول"}</th>
                    <th>{english ? "Discharges" : "الخروج"}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{dayLabel(day.date, true)}</th>
                      <td>{fmt(day.admissions)}</td>
                      <td>{fmt(day.discharges)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="dc-footnote">
            {english
              ? "Today is a partial day. Net movement is admissions minus discharges, not an occupancy measure."
              : "اليوم الحالي لم يكتمل. صافي الحركة هو الدخول ناقص الخروج، ولا يمثل نسبة الإشغال."}
          </div>
        </>
      ) : (
        <EmptyChart
          english={english}
          message={
            english
              ? "Daily movement data is not available yet"
              : "بيانات الحركة اليومية غير متاحة بعد"
          }
        />
      )}
    </section>
  );
}
function StayProfile({ dash, english }: ChartProps) {
  const stamp = new Date(dash.updated_at).getTime();
  const patients: Row[] = Array.isArray(dash.patients) ? dash.patients : [];
  const buckets = [0, 0, 0, 0];
  let unknown = 0;
  patients.forEach((patient) => {
    const duration =
      (stamp - new Date(patient.admitted_at).getTime()) / 86400000;
    if (!Number.isFinite(duration) || duration < 0) {
      unknown++;
      return;
    }
    buckets[duration < 3 ? 0 : duration < 7 ? 1 : duration < 14 ? 2 : 3]++;
  });
  const groups = english
    ? ["0–2 days", "3–6 days", "7–13 days", "14+ days"]
    : ["٠–٢ يوم", "٣–٦ أيام", "٧–١٣ يومًا", "١٤ يومًا فأكثر"];
  const colors = ["#198c82", "#5ba69b", "#6f91c3", "#a796bd"];
  const id = useId();
  return (
    <section className="panel dc-stay" aria-labelledby={id}>
      <div className="dc-heading">
        <div>
          <div className="dc-eyebrow">
            <Layers3 size={15} />
            {english ? "CURRENT CENSUS" : "الإقامات الحالية"}
          </div>
          <h3 id={id}>{english ? "Time in our care" : "الوقت تحت رعايتنا"}</h3>
          <p>
            {english
              ? "Elapsed stay for current admissions"
              : "مدة الإقامة المنقضية للحالات الحالية"}
          </p>
        </div>
      </div>
      <div className="dc-stay-total">
        <strong>{fmt(patients.length)}</strong>
        <span>
          {english
            ? "active admissions in your scope"
            : "إقامة حالية ضمن نطاق اطلاعك"}
        </span>
      </div>
      {patients.length ? (
        <>
          <div
            className="dc-stacked"
            role="img"
            aria-label={groups
              .map((label, i) => `${label}: ${fmt(buckets[i])}`)
              .join(" · ")}
          >
            {buckets.map((count, i) => (
              <span
                key={groups[i]}
                style={{
                  width: `${(count / patients.length) * 100}%`,
                  background: colors[i],
                }}
              />
            ))}
            {unknown > 0 && (
              <span
                style={{
                  width: `${(unknown / patients.length) * 100}%`,
                  background: "#99a5a4",
                }}
              />
            )}
          </div>
          <div className="dc-stay-groups">
            {groups.map((label, i) => (
              <div key={label}>
                <span>
                  <i style={{ background: colors[i] }} />
                  {label}
                </span>
                <b>{fmt(buckets[i])}</b>
                <small>{fmt((buckets[i] / patients.length) * 100)}%</small>
              </div>
            ))}
            {unknown > 0 && (
              <div>
                <span>{english ? "Date unavailable" : "التاريخ غير متاح"}</span>
                <b>{fmt(unknown)}</b>
                <small>{fmt((unknown / patients.length) * 100)}%</small>
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyChart
          english={english}
          message={english ? "No current admissions" : "لا توجد إقامات حالية"}
        />
      )}
      <div className="dc-footnote">
        {english
          ? "Current snapshot, independent of the movement period. One day = 24 elapsed hours since admission."
          : "لقطة حالية لا تتغير باختيار فترة الحركة. اليوم = ٢٤ ساعة منقضية منذ الدخول."}
      </div>
    </section>
  );
}
export function BedCapacityChart({
  dash,
  english,
  navigate,
}: ChartProps & { navigate: (page: string) => void }) {
  const id = useId();
  const rows: Row[] = Array.isArray(dash.occupancy) ? dash.occupancy : [];
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  const labels: Record<string, string> = english
    ? {
        occupied: "Occupied",
        available: "Available",
        reserved: "Reserved",
        cleaning: "Cleaning",
        maintenance: "Maintenance",
        out_of_service: "Out of service",
      }
    : {
        occupied: "مشغول",
        available: "متاح",
        reserved: "محجوز",
        cleaning: "تنظيف",
        maintenance: "صيانة",
        out_of_service: "خارج الخدمة",
      };
  const sorted = [...rows].sort(
    (a, b) => BED_ORDER.indexOf(a.status) - BED_ORDER.indexOf(b.status),
  );
  const segments: string[] = [];
  let cursor = 0;
  sorted.forEach((row) => {
    const end = cursor + (Number(row.count) / Math.max(total, 1)) * 100;
    segments.push(`${BED_COLORS[row.status] || "#99a5a4"} ${cursor}% ${end}%`);
    cursor = end;
  });
  const occupied = Number(dash.stats?.occupied || 0),
    operational = Number(dash.stats?.operational || 0);
  return (
    <section className="panel dc-capacity" aria-labelledby={id}>
      <div className="dc-heading">
        <div>
          <div className="dc-eyebrow">
            <BedDouble size={15} />
            {english ? "LIVE CAPACITY" : "الطاقة الحالية"}
          </div>
          <h3 id={id}>
            {english
              ? "A place for every next arrival"
              : "جاهزية لاستقبال كل بداية"}
          </h3>
          <p>
            {english
              ? "Physical bed status across the department"
              : "حالة الأسرة المادية داخل القسم"}
          </p>
        </div>
        <button className="button small" onClick={() => navigate("beds")}>
          {english ? "Bed map" : "خريطة الأسرة"}
          <ArrowUpRight size={15} />
        </button>
      </div>
      {total ? (
        <div className="dc-capacity-body">
          <div
            className="dc-donut"
            role="img"
            aria-label={sorted
              .map(
                (row) =>
                  `${labels[row.status] || row.status}: ${fmt(row.count)}`,
              )
              .join(" · ")}
            style={{ background: `conic-gradient(${segments.join(",")})` }}
          >
            <div>
              <strong>{fmt(total)}</strong>
              <span>{english ? "physical beds" : "سريرًا ماديًا"}</span>
            </div>
          </div>
          <div className="dc-bed-legend">
            {BED_ORDER.map((status) => {
              const count = Number(
                rows.find((row) => row.status === status)?.count || 0,
              );
              return (
                <div key={status}>
                  <span>
                    <i style={{ background: BED_COLORS[status] }} />
                    {labels[status]}
                  </span>
                  <b>{fmt(count)}</b>
                  <small>{fmt((count / total) * 100)}%</small>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyChart
          english={english}
          message={english ? "No beds registered" : "لم تُسجّل أسرة بعد"}
        />
      )}
      <div className="dc-capacity-footer">
        <span>{english ? "Operational occupancy" : "الإشغال التشغيلي"}</span>
        <strong>
          {operational ? `${fmt((occupied / operational) * 100)}%` : "—"}
        </strong>
        <span>
          {fmt(occupied)} / {fmt(operational)}
        </span>
        <div className="dc-capacity-meter">
          <i
            style={{
              width: `${operational ? Math.min(100, (occupied / operational) * 100) : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="dc-footnote">
        {english
          ? "Ring shares use all physical beds. Operational occupancy excludes cleaning, maintenance and out-of-service beds; reservations remain unoccupied."
          : "نسب الدائرة من جميع الأسرة المادية. الإشغال التشغيلي يستبعد التنظيف والصيانة وخارج الخدمة؛ الحجوزات ليست إشغالًا فعليًا."}
      </div>
    </section>
  );
}
