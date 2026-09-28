import { useEffect, useRef, useState } from "react";
import {
  BedDouble,
  CalendarClock,
  CheckCircle2,
  CirclePlay,
  ClipboardCheck,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  Wallet,
  Wrench,
} from "lucide-react";
import { getLanguage, useLanguage } from "./i18n";
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
import { paymentMethodLabel } from "./FinancialTools";
import "./maintenance.css";
type Props = {
  can: (permission: string) => boolean;
  userRole: string;
  openForm: (spec: FormSpec) => void;
  notify: (text: string, error?: boolean) => void;
  revision: number;
  refresh: () => void;
};
type MaintenanceData = {
  jobs: Row[];
  assets: Row[];
  beds: Row[];
  assignees: Row[];
  can_manage: boolean;
  can_pay: boolean;
};
function timeInput(value: string) {
  const parsed = new Date(value);
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function Maintenance({
  can,
  userRole,
  openForm,
  notify,
  revision,
  refresh,
}: Props) {
  const english = useLanguage() === "en";
  const [data, setData] = useState<MaintenanceData | null>(null),
    [expenses, setExpenses] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [expenseError, setExpenseError] = useState(""),
    [actionError, setActionError] = useState(""),
    [localRevision, setLocalRevision] = useState(0),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [kind, setKind] = useState("all"),
    [expenseFilter, setExpenseFilter] = useState("all"),
    [busy, setBusy] = useState("");
  const alive = useRef(true),
    canFinance = can("billing.read") && !["doctor", "nurse"].includes(userRole);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setExpenseError("");
    api("/maintenance")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    if (canFinance)
      api("/maintenance/expenses")
        .then((result) => {
          if (active) setExpenses(result);
        })
        .catch((reason) => {
          if (active) setExpenseError(reason.message);
        });
    else setExpenses([]);
    return () => {
      active = false;
    };
  }, [revision, localRevision, canFinance]);
  function reload() {
    setLocalRevision((value) => value + 1);
    refresh();
  }
  function done() {
    if (alive.current) {
      reload();
      notify(
        getLanguage() === "en"
          ? "Maintenance operation saved."
          : "تم حفظ عملية الصيانة.",
      );
    }
  }
  const statusName = (value: string) =>
    ({
      planned: english ? "Planned" : "مخططة",
      in_progress: english ? "In progress" : "قيد التنفيذ",
      completed: english ? "Completed" : "مكتملة",
    })[value] || value;
  const assetName = (job: Row) =>
    job.equipment_id ? job.equipment_name || "—" : job.bed_name || "—";
  function jobFields() {
    return [
      field(
        "title",
        english ? "Maintenance task" : "مهمة الصيانة",
        "text",
        true,
      ),
      field(
        "due_at",
        english ? "Due date and time" : "الموعد المحدد",
        "datetime-local",
        true,
        { value: nowInput() },
      ),
      field(
        "assigned_to",
        english ? "Assigned technician / supervisor" : "المسؤول عن الصيانة",
        "text",
        false,
        {
          searchable: true,
          options: (data?.assignees || []).map((person) => ({
            value: person.id,
            label: person.name,
          })),
        },
      ),
      field(
        "notes",
        english
          ? "Fault description and work notes"
          : "وصف العطل وملاحظات العمل",
        "textarea",
        false,
        { wide: true },
      ),
    ];
  }
  function addJob(type: "equipment" | "bed") {
    if (!data?.can_manage) return;
    const candidates = type === "equipment" ? data.assets : data.beds;
    openForm({
      title:
        type === "equipment"
          ? english
            ? "Schedule equipment maintenance"
            : "جدولة صيانة جهاز"
          : english
            ? "Schedule incubator maintenance"
            : "جدولة صيانة حضّانة",
      note: english
        ? "Scheduling alone does not change availability. Starting the job marks the asset under maintenance. An occupied or reserved bed cannot start maintenance."
        : "الجدولة وحدها لا تغيّر الجاهزية. بدء المهمة يضع الأصل تحت الصيانة. لا يمكن بدء صيانة حضّانة مشغولة أو محجوزة.",
      fields: [
        field(
          type === "equipment" ? "equipment_id" : "bed_id",
          type === "equipment"
            ? english
              ? "Equipment"
              : "الجهاز"
            : english
              ? "Incubator / bed"
              : "الحضّانة / السرير",
          "text",
          true,
          {
            searchable: true,
            options: candidates.map((item) => ({
              value: item.id,
              label: [item.name, item.code || item.room]
                .filter(Boolean)
                .join(" · "),
            })),
          },
        ),
        ...jobFields(),
      ],
      submit: async (values) => {
        const result = await api("/maintenance", values);
        done();
        return result;
      },
    });
  }
  function editJob(job: Row) {
    openForm({
      title: english ? "Edit maintenance task" : "تعديل مهمة الصيانة",
      subtitle: assetName(job),
      fields: jobFields(),
      initial: {
        title: job.title,
        due_at: timeInput(job.due_at),
        assigned_to: job.assigned_to || "",
        notes: job.notes || "",
      },
      submit: async (values) => {
        const result = await api(
          "/maintenance/" + encodeURIComponent(job.id),
          { ...values, version: job.version },
          "PATCH",
        );
        done();
        return result;
      },
    });
  }
  function startJob(job: Row) {
    openForm({
      title: english ? "Start maintenance" : "بدء الصيانة",
      subtitle: job.title + " · " + assetName(job),
      sensitive: true,
      note: english
        ? "The device or bed becomes unavailable for use while this maintenance job is in progress. The server checks bed occupancy and other running jobs before starting."
        : "يصبح الجهاز أو السرير غير متاح للاستخدام أثناء تنفيذ الصيانة. يتحقق الخادم من إشغال السرير ومن عدم وجود مهمة أخرى قيد التنفيذ قبل البدء.",
      fields: [],
      submit: async (values) => {
        const result = await api(
          "/maintenance/" + encodeURIComponent(job.id),
          {
            version: job.version,
            status: "in_progress",
            idempotency_key: values.idempotency_key,
          },
          "PATCH",
        );
        done();
        return result;
      },
    });
  }
  function completeJob(job: Row) {
    openForm({
      title: english
        ? "Verify and complete maintenance"
        : "التحقق وإكمال الصيانة",
      subtitle: job.title + " · " + assetName(job),
      sensitive: true,
      note: english
        ? "Completion returns the verified device to Ready or the incubator to Available. Record the actual checks performed before confirming readiness."
        : "يعيد الإكمال الجهاز المتحقق منه إلى جاهز أو الحضّانة إلى متاحة. وثّق الفحوص المنفذة فعلًا قبل تأكيد الصلاحية.",
      fields: [
        field(
          "verified_note",
          english
            ? "Readiness checks and verification result"
            : "فحوص الصلاحية ونتيجة التحقق",
          "textarea",
          true,
          { wide: true },
        ),
        field(
          "restore_ready",
          english
            ? "I verified the asset is ready to return to service"
            : "تحققت من صلاحية الأصل للعودة إلى الخدمة",
          "checkbox",
          true,
          { wide: true },
        ),
      ],
      submit: async (values) => {
        const result = await api(
          "/maintenance/" + encodeURIComponent(job.id),
          { ...values, version: job.version, status: "completed" },
          "PATCH",
        );
        done();
        return result;
      },
    });
  }
  async function expense(job: Row) {
    setBusy(job.id);
    setActionError("");
    try {
      const treasury = await api("/treasury");
      if (!alive.current) return;
      const banks: Row[] = (treasury.accounts || []).filter(
        (account: Row) => account.active && account.kind === "bank",
      );
      openForm({
        title: english ? "Record maintenance expense" : "تسجيل مصروف صيانة",
        subtitle: job.title + " · " + assetName(job),
        sensitive: true,
        note: english
          ? "Record only an actual payment. The amount is deducted from the selected cash or bank account and linked to this task. It is not an infant charge."
          : "سجّل دفعة فعلية فقط. يُخصم المبلغ من الخزنة أو الحساب البنكي المحدد ويرتبط بهذه المهمة. لا يُضاف كرسوم على الطفل.",
        fields: [
          field(
            "amount",
            english ? "Amount paid (EGP)" : "المبلغ المدفوع (ج.م)",
            "number",
            true,
            { min: 0.01, max: 1000000000000, step: "0.01" },
          ),
          field(
            "vendor",
            english ? "Paid to / service vendor" : "المستفيد / مقدم الخدمة",
            "text",
            true,
          ),
          field(
            "method",
            english ? "Payment method" : "طريقة الدفع",
            "text",
            true,
            {
              value: "cash",
              options: ["cash", "card", "transfer", "wallet", "instapay"].map(
                (method) => ({
                  value: method,
                  label: paymentMethodLabel(method),
                }),
              ),
            },
          ),
          field(
            "money_account_id",
            english
              ? "Paying bank account (non-cash)"
              : "الحساب البنكي الدافع (لغير النقدي)",
            "text",
            false,
            {
              options: banks.map((account) => ({
                value: account.id,
                label: [account.name, account.bank_name, money(account.balance)]
                  .filter(Boolean)
                  .join(" · "),
              })),
              help: english
                ? "Cash uses the main cash account; choose an active bank account for electronic payments. Balances are checked on saving."
                : "النقدي من الخزنة الرئيسية؛ اختر حسابًا بنكيًا نشطًا للدفع الإلكتروني. يُفحص الرصيد عند الحفظ.",
            },
          ),
          field(
            "reference",
            english ? "Invoice / payment reference" : "مرجع الفاتورة / الدفع",
            "text",
            true,
          ),
          field(
            "notes",
            english ? "Expense notes" : "ملاحظات المصروف",
            "textarea",
            false,
            { wide: true },
          ),
        ],
        submit: async (values) => {
          const method = String(values.method || "");
          if (
            method !== "cash" &&
            !banks.some((account) => account.id === values.money_account_id)
          )
            throw Error(
              getLanguage() === "en"
                ? "Select the bank account that paid this expense."
                : "حدد الحساب البنكي الذي دفع المصروف.",
            );
          const result = await api(
            "/maintenance/" + encodeURIComponent(job.id) + "/expenses",
            {
              ...values,
              money_account_id:
                method === "cash" ? "cash" : values.money_account_id,
            },
          );
          done();
          return result;
        },
      });
    } catch (reason) {
      if (alive.current)
        setActionError(
          reason instanceof Error ? reason.message : String(reason),
        );
    } finally {
      if (alive.current) setBusy("");
    }
  }
  const jobs = data?.jobs || [];
  const shown = jobs.filter(
    (job) =>
      (status === "all" || job.status === status) &&
      (kind === "all" ||
        (kind === "equipment" ? !!job.equipment_id : !!job.bed_id)) &&
      [
        job.title,
        job.equipment_name,
        job.equipment_code,
        job.bed_name,
        job.assigned_name,
        job.notes,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const shownExpenses =
    expenseFilter === "all"
      ? expenses
      : expenses.filter((item) => item.maintenance_job_id === expenseFilter);
  const overdue = (job: Row) =>
    job.status !== "completed" && new Date(job.due_at).getTime() < Date.now();
  return (
    <div className="maintenance-module">
      {(error || actionError) && (
        <div className="error-box" role="alert">
          {error || actionError}
          <button className="button small" onClick={reload}>
            {english ? "Retry" : "إعادة المحاولة"}
          </button>
        </div>
      )}
      <Section
        title={english ? "Maintenance workspace" : "متابعة الصيانة"}
        sub={
          english
            ? "Plan work, verify readiness and record actual expenses for equipment and beds"
            : "جدولة الأعمال والتحقق من الجاهزية وتسجيل المصروفات الفعلية للأجهزة والأسرة"
        }
        action={
          <div className="maintenance-actions">
            <button
              className="button small"
              onClick={reload}
              aria-label={english ? "Refresh maintenance" : "تحديث الصيانة"}
            >
              <RefreshCw size={16} />
            </button>
            {data?.can_manage && (
              <>
                <button
                  className="button primary"
                  onClick={() => addJob("equipment")}
                  disabled={!data.assets.length}
                >
                  <Stethoscope size={17} />
                  {english ? "Equipment task" : "مهمة جهاز"}
                </button>
                <button
                  className="button"
                  onClick={() => addJob("bed")}
                  disabled={!data.beds.length}
                >
                  <BedDouble size={17} />
                  {english ? "Incubator task" : "مهمة حضّانة"}
                </button>
              </>
            )}
          </div>
        }
      >
        {loading ? (
          <div className="loading">
            <LoaderCircle size={25} className="spin" />
            {english ? "Loading maintenance…" : "تحميل الصيانة…"}
          </div>
        ) : (
          data && (
            <>
              <div className="maintenance-summary">
                {(
                  [
                    { key: "planned", icon: CalendarClock },
                    { key: "in_progress", icon: Wrench },
                    { key: "completed", icon: CheckCircle2 },
                  ] as const
                ).map(({ key, icon: Icon }) => (
                  <button
                    key={key}
                    className={status === key ? "selected" : ""}
                    onClick={() => setStatus(status === key ? "all" : key)}
                    aria-pressed={status === key}
                  >
                    <Icon size={22} />
                    <span>
                      {statusName(key)}
                      <strong>
                        {fmt(jobs.filter((job) => job.status === key).length)}
                      </strong>
                    </span>
                  </button>
                ))}
              </div>
              <div className="maintenance-flow">
                <span>
                  <CalendarClock size={16} />
                  {english ? "Plan" : "جدولة"}
                </span>
                <i>‹</i>
                <span>
                  <Wrench size={16} />
                  {english ? "Start and isolate" : "بدء وإيقاف الاستخدام"}
                </span>
                <i>‹</i>
                <span>
                  <ClipboardCheck size={16} />
                  {english ? "Verify and return" : "تحقق وإعادة للخدمة"}
                </span>
              </div>
              <div className="table-toolbar">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    aria-label={
                      english ? "Search maintenance tasks" : "بحث مهام الصيانة"
                    }
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      english
                        ? "Task, device, bed or assignee…"
                        : "المهمة أو الجهاز أو السرير أو المسؤول…"
                    }
                  />
                </label>
                <select
                  aria-label={english ? "Maintenance status" : "حالة الصيانة"}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">
                    {english ? "All statuses" : "جميع الحالات"}
                  </option>
                  {["planned", "in_progress", "completed"].map((value) => (
                    <option key={value} value={value}>
                      {statusName(value)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={english ? "Asset type" : "نوع الأصل"}
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="all">
                    {english ? "Devices and beds" : "الأجهزة والأسرة"}
                  </option>
                  <option value="equipment">
                    {english ? "Equipment" : "الأجهزة"}
                  </option>
                  <option value="bed">
                    {english ? "Incubators / beds" : "الحضّانات / الأسرة"}
                  </option>
                </select>
              </div>
              <Table
                headers={[
                  english ? "Task / asset" : "المهمة / الأصل",
                  english ? "Due / assigned to" : "الموعد / المسؤول",
                  english ? "Status" : "الحالة",
                  ...(canFinance
                    ? [english ? "Actual expenses" : "المصروفات الفعلية"]
                    : []),
                  english ? "Actions" : "الإجراءات",
                ]}
                rows={shown.map((job) => [
                  <div>
                    <strong>{job.title}</strong>
                    <small>
                      {assetName(job)}
                      {job.equipment_code ? " · " + job.equipment_code : ""}
                    </small>
                    {job.notes && (
                      <details>
                        <summary>
                          {english ? "Work notes" : "ملاحظات العمل"}
                        </summary>
                        <p className="maintenance-notes">{job.notes}</p>
                      </details>
                    )}
                    {job.verified_note && (
                      <details>
                        <summary>
                          {english
                            ? "Readiness verification"
                            : "التحقق من الصلاحية"}
                        </summary>
                        <p className="maintenance-notes">{job.verified_note}</p>
                        <small>{date(job.completed_at, true)}</small>
                      </details>
                    )}
                  </div>,
                  <div>
                    {date(job.due_at, true)}
                    <small>
                      {job.assigned_name ||
                        (english ? "Unassigned" : "غير مسندة")}
                    </small>
                    {overdue(job) && (
                      <span className="badge urgent">
                        {english ? "Overdue" : "متأخرة"}
                      </span>
                    )}
                  </div>,
                  <span
                    className={
                      "badge " +
                      (job.status === "completed"
                        ? "completed"
                        : job.status === "in_progress"
                          ? "cleaning"
                          : "pending")
                    }
                  >
                    {statusName(job.status)}
                  </span>,
                  ...(canFinance
                    ? [
                        <button
                          className="text-button"
                          onClick={() => setExpenseFilter(job.id)}
                        >
                          {money(job.expense_total || 0)}
                        </button>,
                      ]
                    : []),
                  <div className="maintenance-actions">
                    {data.can_manage && job.status !== "completed" && (
                      <button
                        className="button small"
                        onClick={() => editJob(job)}
                      >
                        <Edit3 size={15} />
                        {english ? "Edit" : "تعديل"}
                      </button>
                    )}
                    {data.can_manage && job.status === "planned" && (
                      <button
                        className="button small"
                        onClick={() => startJob(job)}
                      >
                        <CirclePlay size={15} />
                        {english ? "Start" : "بدء"}
                      </button>
                    )}
                    {data.can_manage && job.status === "in_progress" && (
                      <button
                        className="button primary small"
                        onClick={() => completeJob(job)}
                      >
                        <ClipboardCheck size={15} />
                        {english ? "Verify completion" : "تحقق وإكمال"}
                      </button>
                    )}
                    {data.can_pay && (
                      <button
                        className="button small"
                        disabled={!!busy}
                        onClick={() => void expense(job)}
                      >
                        {busy === job.id ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <Wallet size={15} />
                        )}{" "}
                        {english ? "Expense" : "مصروف"}
                      </button>
                    )}
                  </div>,
                ])}
              />
              <div className="maintenance-footnote">
                {english
                  ? "Latest 1,000 tasks. Availability changes on Start, and after verified completion; scheduling alone does not block the asset."
                  : "آخر ١٠٠٠ مهمة. تتغير الجاهزية عند البدء وعند الإكمال بعد التحقق؛ الجدولة وحدها لا توقف الأصل."}
              </div>
            </>
          )
        )}
      </Section>
      {canFinance && (
        <Section
          title={english ? "Maintenance expense ledger" : "سجل مصروفات الصيانة"}
          sub={
            english
              ? "Actual paid expenses linked to their maintenance task and money account · Latest 1,000 entries"
              : "المصروفات المدفوعة فعلًا وربطها بمهمة الصيانة والحساب المالي · آخر ١٠٠٠ حركة"
          }
          action={
            <select
              value={expenseFilter}
              onChange={(event) => setExpenseFilter(event.target.value)}
              aria-label={
                english ? "Expense task filter" : "تصفية المصروفات حسب المهمة"
              }
            >
              <option value="all">
                {english ? "All maintenance tasks" : "جميع مهام الصيانة"}
              </option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title + " · " + assetName(job)}
                </option>
              ))}
            </select>
          }
        >
          {expenseError && (
            <div
              className="error-box"
              role="alert"
              style={{ margin: "0 20px 17px" }}
            >
              {expenseError}
              <button className="button small" onClick={reload}>
                {english ? "Retry" : "إعادة المحاولة"}
              </button>
            </div>
          )}
          <Table
            headers={[
              english ? "Task / vendor" : "المهمة / المستفيد",
              english ? "Amount paid" : "المبلغ المدفوع",
              english ? "Account / method" : "الحساب / الطريقة",
              english ? "Reference" : "المرجع",
              english ? "Recorded by / time" : "المسجل / التوقيت",
            ]}
            rows={shownExpenses.map((item) => [
              <div>
                <strong>{item.job_title}</strong>
                <small>{item.vendor}</small>
                {item.notes && <small>{item.notes}</small>}
              </div>,
              money(item.amount),
              <div>
                {item.account_name}
                <small>{paymentMethodLabel(item.method)}</small>
              </div>,
              item.reference,
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
