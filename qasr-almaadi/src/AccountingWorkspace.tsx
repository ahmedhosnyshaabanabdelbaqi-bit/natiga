import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  Building2,
  CalendarClock,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";
import { api, date, money, Row, Table } from "./shared";
import { useLanguage } from "./i18n";

const today = () => new Date().toISOString().slice(0, 10),
  yearStart = () => `${new Date().getFullYear()}-01-01`;
const sourceAr: Row = {
  invoice: "فاتورة وخدمة",
  payment: "تحصيل أو استرداد",
  insurance: "مطالبة تأمين",
  treasury: "خزنة وبنك",
  purchase: "شراء ومخزون",
  maintenance: "صيانة",
  payroll: "استحقاق رواتب",
  payroll_payment: "صرف رواتب",
  inventory: "حركة مخزون",
  opening: "رصيد افتتاحي",
  supplier_payment: "سداد مورد",
  manual: "قيد يدوي",
};
type ModalKind =
  | "supplier"
  | "account"
  | "center"
  | "journal"
  | "period"
  | "supplierPayment"
  | "payrollPayment"
  | null;
export default function AccountingWorkspace({
  can,
}: {
  can: (permission: string) => boolean;
}) {
  const en = useLanguage() === "en",
    tr = (ar: string, x: string) => (en ? x : ar);
  const [from, setFrom] = useState(yearStart()),
    [end, setEnd] = useState(today()),
    [data, setData] = useState<Row | null>(null),
    [accounts, setMoneyAccounts] = useState<Row[]>([]),
    [tab, setTab] = useState("journal"),
    [modal, setModal] = useState<ModalKind>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [debitAccount, setDebitAccount] = useState(""),
    [creditAccount, setCreditAccount] = useState("");
  const isMoneyAccount = (id: unknown) =>
    data?.accounts?.some(
      (account: Row) => account.id === id && account.system_key === "money",
    );
  const costCenterLabel = (code: string | undefined) => {
    const center = data?.cost_centers?.find((row: Row) => row.code === code);
    return (en ? center?.name_en : center?.name_ar) ||
      (en ? center?.name_ar : center?.name_en) || code || "—";
  };
  const draftKeys = useRef(new Map<string, string>());
  const saveDraft = (path: string, payload: Row) => {
    const fingerprint = JSON.stringify([path, payload]);
    let key = draftKeys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      draftKeys.current.set(fingerprint, key);
    }
    return api(path, { ...payload, idempotency_key: key });
  };
  useEffect(() => {
    let active = true;
    setBusy(true);
    Promise.all([
      api(`/accounting?from=${from}&end=${end}`),
      can("billing.write")
        ? api("/treasury")
        : Promise.resolve({ accounts: [] }),
    ])
      .then(([a, t]) => {
        if (active) {
          setData(a);
          setMoneyAccounts(t.accounts || []);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [from, end, revision, en]);
  const open = (kind: ModalKind, row?: Row) => {
    draftKeys.current.clear();
    if (kind === "journal") {
      setDebitAccount("");
      setCreditAccount("");
    }
    setSelected(row || null);
    setModal(kind);
    setError("");
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      v = Object.fromEntries(f.entries());
    try {
      if (modal === "supplier")
        await saveDraft("/accounting/suppliers", {
          ...v,
          payment_terms_days: Number(v.payment_terms_days || 0),
          credit_limit: Number(v.credit_limit || 0),
        });
      if (modal === "account")
        await saveDraft("/accounting/accounts", {
          ...v,
        });
      if (modal === "center")
        await saveDraft("/accounting/cost-centers", {
          ...v,
        });
      if (modal === "period")
        await saveDraft("/accounting/periods/close", {
          ...v,
        });
      if (modal === "supplierPayment")
        await saveDraft("/accounting/supplier-payments", {
          supplier_invoice_id: selected!.id,
          amount: Number(v.amount),
          method: v.method,
          money_account_id: v.money_account_id,
          reference: v.reference,
        });
      if (modal === "payrollPayment")
        await saveDraft("/accounting/payroll-payments", {
          payroll_period_id: selected!.id,
          amount: Number(v.amount),
          method: v.method,
          money_account_id: v.money_account_id,
          reference: v.reference,
        });
      if (modal === "journal")
        await saveDraft("/accounting/manual-journals", {
          journal_date: v.journal_date,
          description: v.description,
          reference: v.reference,
          lines: [
            {
              account_id: v.debit_account,
              ...(isMoneyAccount(v.debit_account)
                ? { money_account_id: v.debit_money_account_id }
                : {}),
              cost_center_id: v.cost_center_id || null,
              debit: Number(v.amount),
              credit: 0,
              description: v.description,
            },
            {
              account_id: v.credit_account,
              ...(isMoneyAccount(v.credit_account)
                ? { money_account_id: v.credit_money_account_id }
                : {}),
              cost_center_id: v.cost_center_id || null,
              debit: 0,
              credit: Number(v.amount),
              description: v.description,
            },
          ],
        });
      setModal(null);
      setSelected(null);
      setRevision((x) => x + 1);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approve(j: Row) {
    try {
      setBusy(true);
      await api(`/accounting/manual-journals/${j.id}/approve`, {
        version: j.version,
        idempotency_key: crypto.randomUUID(),
      });
      setRevision((x) => x + 1);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reverse(j: Row) {
    const reason = window.prompt(
      tr("اكتب سبب عكس القيد", "Enter reversal reason"),
    );
    if (!reason) return;
    try {
      setBusy(true);
      await api(`/accounting/manual-journals/${j.id}/reverse`, {
        version: j.version,
        reason,
        idempotency_key: crypto.randomUUID(),
      });
      setRevision((x) => x + 1);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reopen(p: Row) {
    try {
      setBusy(true);
      await api(`/accounting/periods/${p.id}/reopen`, {
        version: p.version,
        note: tr(
          "إعادة فتح بتفويض مدير النظام",
          "Reopened by system administrator",
        ),
        idempotency_key: crypto.randomUUID(),
      });
      setRevision((x) => x + 1);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    ["journal", tr("دفتر اليومية", "Journal")],
    ["trial", tr("ميزان المراجعة", "Trial balance")],
    ["suppliers", tr("الموردون", "Suppliers")],
    ["accounts", tr("دليل الحسابات", "Chart of accounts")],
    ["centers", tr("مراكز التكلفة", "Cost centers")],
    ["periods", tr("الفترات والإقفال", "Periods and closing")],
  ];
  const typeName = (x: string) =>
    (
      ({
        asset: tr("أصل", "Asset"),
        liability: tr("التزام", "Liability"),
        equity: tr("حقوق ملكية", "Equity"),
        revenue: tr("إيراد", "Revenue"),
        expense: tr("مصروف", "Expense"),
      }) as Row
    )[x] || x;
  return (
    <section className="accounting-workspace">
      <div className="accounting-title">
        <div>
          <span>{tr("المحاسبة العامة", "General accounting")}</span>
          <h2>
            {tr(
              "دفتر محاسبي موحّد لكل الأقسام",
              "Unified ledger across all departments",
            )}
          </h2>
          <p>
            {tr(
              "الفواتير والتأمين والخزنة والبنوك والمشتريات والمخزون والصيانة والرواتب تُرحّل تلقائيًا بقيود مزدوجة.",
              "Invoices, insurance, treasury, banks, purchasing, inventory, maintenance and payroll post automatically as double-entry journals.",
            )}
          </p>
        </div>
        <div className="accounting-period">
          <label>
            {tr("من", "From")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {tr("إلى", "To")}
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button
            className="button small"
            onClick={() => setRevision((x) => x + 1)}
          >
            <RefreshCw size={15} />
            {tr("تحديث", "Refresh")}
          </button>
        </div>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {data && (
        <>
          <div className="accounting-kpis">
            <article>
              <BookOpen />
              <span>{tr("القيود المرحلة", "Posted entries")}</span>
              <strong>{data.summary.entries}</strong>
            </article>
            <article>
              <Scale />
              <span>{tr("إجمالي المدين", "Total debit")}</span>
              <strong>{money(data.summary.debit)}</strong>
            </article>
            <article>
              <Scale />
              <span>{tr("إجمالي الدائن", "Total credit")}</span>
              <strong>{money(data.summary.credit)}</strong>
            </article>
            <article>
              <Users />
              <span>{tr("مستحقات الموردين", "Supplier payables")}</span>
              <strong>{money(data.summary.supplier_due)}</strong>
            </article>
          </div>
          <div className="accounting-actions">
            {can("billing.write") && (
              <>
                <button
                  className="button primary small"
                  onClick={() => open("journal")}
                >
                  <Plus size={15} />
                  {tr("قيد يدوي", "Manual journal")}
                </button>
                <button
                  className="button small"
                  onClick={() => open("supplier")}
                >
                  <Building2 size={15} />
                  {tr("مورد جديد", "New supplier")}
                </button>
              </>
            )}
            {can("settings.write") && (
              <>
                <button
                  className="button small"
                  onClick={() => open("account")}
                >
                  <Landmark size={15} />
                  {tr("حساب جديد", "New account")}
                </button>
                <button className="button small" onClick={() => open("center")}>
                  <Plus size={15} />
                  {tr("مركز تكلفة", "Cost center")}
                </button>
                <button className="button small" onClick={() => open("period")}>
                  <CalendarClock size={15} />
                  {tr("إقفال شهر", "Close month")}
                </button>
              </>
            )}
          </div>
          <div className="accounting-tabs">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "journal" && (
            <>
              <h3>
                {tr(
                  "القيود اليدوية والاعتمادات",
                  "Manual journals and approvals",
                )}
              </h3>
              <Table
                headers={[
                  tr("القيد", "Entry"),
                  tr("التاريخ", "Date"),
                  tr("البيان", "Description"),
                  tr("القيمة", "Amount"),
                  tr("المنشئ", "Created by"),
                  tr("المعتمد", "Approved by"),
                  tr("الحالة", "Status"),
                  tr("الإجراء", "Action"),
                ]}
                rows={(data.manual_journals || []).map((j: Row) => [
                  j.journal_no,
                  j.journal_date,
                  j.description,
                  money(j.amount),
                  j.created_by_name,
                  j.approved_by_name || "—",
                  j.status === "draft"
                    ? tr("مسودة", "Draft")
                    : j.status === "reversed"
                      ? tr("معكوس", "Reversed")
                      : tr("مرحل", "Posted"),
                  j.status === "draft" &&
                  data.capabilities?.approve_journals ? (
                    <button
                      className="button primary tiny"
                      onClick={() => approve(j)}
                    >
                      {tr("اعتماد", "Approve")}
                    </button>
                  ) : j.status === "posted" &&
                    data.capabilities?.reverse_journals ? (
                    <button
                      className="button danger tiny"
                      onClick={() => reverse(j)}
                    >
                      {tr("عكس القيد", "Reverse")}
                    </button>
                  ) : (
                    "—"
                  ),
                ])}
              />
              <h3>{tr("دفتر اليومية الموحّد", "Unified journal")}</h3>
              <Table
                headers={[
                  tr("القيد", "Entry"),
                  tr("التاريخ", "Date"),
                  tr("المصدر", "Source"),
                  tr("البيان", "Description"),
                  tr("مدين", "Debit"),
                  tr("دائن", "Credit"),
                  tr("مركز التكلفة", "Cost center"),
                ]}
                rows={(data.journals || []).flatMap((j: Row) =>
                  j.lines.map((l: Row, i: number) => [
                    i === 0 ? (
                      <div>
                        <strong>{j.no}</strong>
                        <small>
                          {j.status === "reversed"
                            ? tr("معكوس", "Reversed")
                            : tr("مرحل", "Posted")}
                        </small>
                      </div>
                    ) : (
                      ""
                    ),
                    i === 0 ? j.date : "",
                    i === 0
                      ? en
                        ? j.source
                        : sourceAr[j.source] || j.source
                      : "",
                    l.memo || j.description,
                    money(l.debit),
                    money(l.credit),
                    costCenterLabel(l.cost_center),
                  ]),
                )}
              />
            </>
          )}
          {tab === "trial" && (
            <Table
              headers={[
                tr("الكود", "Code"),
                tr("الحساب", "Account"),
                tr("النوع", "Type"),
                tr("مدين", "Debit"),
                tr("دائن", "Credit"),
                tr("الرصيد", "Balance"),
              ]}
              rows={(data.trial || []).map((x: Row) => [
                x.code,
                en ? x.name_en : x.name_ar,
                typeName(x.type),
                money(x.debit),
                money(x.credit),
                money(x.balance),
              ])}
            />
          )}
          {tab === "suppliers" && (
            <>
              <Table
                headers={[
                  tr("الكود", "Code"),
                  tr("المورد", "Supplier"),
                  tr("الهاتف", "Phone"),
                  tr("أجل السداد", "Terms"),
                  tr("حد الائتمان", "Credit limit"),
                  tr("الرصيد المستحق", "Outstanding"),
                ]}
                rows={(data.suppliers || []).map((x: Row) => [
                  x.code,
                  x.name,
                  x.phone || "—",
                  `${x.payment_terms_days} ${tr("يوم", "days")}`,
                  money(x.credit_limit),
                  money(x.balance),
                ])}
              />
              <h3>
                {tr(
                  "فواتير الموردين المستحقة",
                  "Outstanding supplier invoices",
                )}
              </h3>
              <Table
                headers={[
                  tr("المورد", "Supplier"),
                  tr("الفاتورة", "Invoice"),
                  tr("الاستحقاق", "Due"),
                  tr("القيمة", "Amount"),
                  tr("المسدد", "Paid"),
                  tr("المتبقي", "Outstanding"),
                  tr("الإجراء", "Action"),
                ]}
                rows={(data.supplier_invoices || []).map((x: Row) => [
                  x.supplier_name,
                  x.invoice_no,
                  x.due_date,
                  money(x.amount),
                  money(x.paid),
                  money(x.outstanding),
                  Number(x.outstanding) > 0 && can("billing.write") ? (
                    <button
                      className="button primary tiny"
                      onClick={() => open("supplierPayment", x)}
                    >
                      {tr("سداد", "Pay")}
                    </button>
                  ) : (
                    "—"
                  ),
                ])}
              />
            </>
          )}
          {tab === "accounts" && (
            <Table
              headers={[
                tr("الكود", "Code"),
                tr("اسم الحساب", "Account name"),
                tr("النوع", "Type"),
                tr("حساب النظام", "System account"),
                tr("الحالة", "Status"),
              ]}
              rows={(data.accounts || []).map((x: Row) => [
                x.code,
                en ? x.name_en : x.name_ar,
                typeName(x.type),
                x.system_key || tr("مخصص", "Custom"),
                x.active ? tr("نشط", "Active") : tr("موقوف", "Inactive"),
              ])}
            />
          )}
          {tab === "centers" && (
            <Table
              headers={[
                tr("الكود", "Code"),
                tr("مركز التكلفة", "Cost center"),
                tr("الحالة", "Status"),
              ]}
              rows={(data.cost_centers || []).map((x: Row) => [
                x.code,
                en ? x.name_en : x.name_ar,
                x.active ? tr("نشط", "Active") : tr("موقوف", "Inactive"),
              ])}
            />
          )}
          {tab === "periods" && (
            <>
              <h3>
                {tr(
                  "صرف مسيرات الرواتب المعتمدة",
                  "Approved payroll settlement",
                )}
              </h3>
              <Table
                headers={[
                  tr("الشهر", "Month"),
                  tr("صافي الرواتب", "Net payroll"),
                  tr("المصروف", "Paid"),
                  tr("المتبقي", "Outstanding"),
                  tr("الإجراء", "Action"),
                ]}
                rows={(data.payroll_due || []).map((x: Row) => [
                  x.month,
                  money(x.amount),
                  money(x.paid),
                  money(x.outstanding),
                  Number(x.outstanding) > 0 && can("payroll.approve") ? (
                    <button
                      className="button primary tiny"
                      onClick={() => open("payrollPayment", x)}
                    >
                      {tr("صرف", "Pay")}
                    </button>
                  ) : (
                    "—"
                  ),
                ])}
              />
              <h3>{tr("إقفال الفترات", "Period closing")}</h3>
              <Table
                headers={[
                  tr("الشهر", "Month"),
                  tr("الحالة", "Status"),
                  tr("أقفل بواسطة", "Closed by"),
                  tr("وقت الإقفال", "Closed at"),
                  tr("الملاحظة", "Note"),
                  tr("الإجراء", "Action"),
                ]}
                rows={(data.periods || []).map((x: Row) => [
                  x.month,
                  x.status === "closed"
                    ? tr("مقفل", "Closed")
                    : tr("مفتوح", "Open"),
                  x.closed_by_name || "—",
                  date(x.closed_at, true),
                  x.close_note || "—",
                  x.status === "closed" && data.capabilities?.reopen_periods ? (
                    <button className="button tiny" onClick={() => reopen(x)}>
                      {tr("إعادة فتح", "Reopen")}
                    </button>
                  ) : (
                    "—"
                  ),
                ])}
              />
            </>
          )}
        </>
      )}
      {busy && !data && (
        <div className="loading">
          <RefreshCw className="spin" />
          {tr("جارٍ بناء دفتر الأستاذ…", "Building the ledger…")}
        </div>
      )}
      {modal && (
        <div className="accounting-modal" role="dialog" aria-modal="true">
          <form onSubmit={submit}>
            <div className="modal-head">
              <h3>
                {
                  (
                    {
                      supplier: tr("إضافة مورد", "Add supplier"),
                      account: tr("إضافة حساب", "Add account"),
                      center: tr("إضافة مركز تكلفة", "Add cost center"),
                      journal: tr(
                        "إنشاء قيد متوازن",
                        "Create balanced journal",
                      ),
                      period: tr(
                        "إقفال فترة محاسبية",
                        "Close accounting period",
                      ),
                      supplierPayment: tr(
                        "سداد فاتورة مورد",
                        "Pay supplier invoice",
                      ),
                      payrollPayment: tr("صرف مسير الرواتب", "Pay payroll"),
                    } as Row
                  )[modal]
                }
              </h3>
              <button type="button" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            {modal === "supplier" && (
              <>
                <label>
                  {tr("كود المورد", "Supplier code")}
                  <input name="code" required />
                </label>
                <label>
                  {tr("اسم المورد", "Supplier name")}
                  <input name="name" required />
                </label>
                <label>
                  {tr("الرقم الضريبي", "Tax number")}
                  <input name="tax_no" />
                </label>
                <label>
                  {tr("مسؤول التواصل", "Contact person")}
                  <input name="contact_name" />
                </label>
                <label>
                  {tr("الهاتف", "Phone")}
                  <input name="phone" />
                </label>
                <label>
                  {tr("البريد", "Email")}
                  <input name="email" type="email" />
                </label>
                <label>
                  {tr("أيام السداد", "Payment terms days")}
                  <input
                    name="payment_terms_days"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                </label>
                <label>
                  {tr("حد الائتمان", "Credit limit")}
                  <input
                    name="credit_limit"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue="0"
                  />
                </label>
                <label className="wide">
                  {tr("العنوان", "Address")}
                  <textarea name="address" />
                </label>
              </>
            )}
            {modal === "account" && (
              <>
                <label>
                  {tr("كود الحساب", "Account code")}
                  <input name="code" required />
                </label>
                <label>
                  {tr("الاسم بالعربية", "Arabic name")}
                  <input name="name_ar" required />
                </label>
                <label>
                  {tr("الاسم بالإنجليزية", "English name")}
                  <input name="name_en" required />
                </label>
                <label>
                  {tr("النوع", "Type")}
                  <select name="type" required>
                    {["asset", "liability", "equity", "revenue", "expense"].map(
                      (x) => (
                        <option value={x} key={x}>
                          {typeName(x)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  {tr("الحساب الرئيسي", "Parent account")}
                  <input name="parent_code" />
                </label>
              </>
            )}
            {modal === "center" && (
              <>
                <label>
                  {tr("الكود", "Code")}
                  <input name="code" required />
                </label>
                <label>
                  {tr("الاسم بالعربية", "Arabic name")}
                  <input name="name_ar" required />
                </label>
                <label>
                  {tr("الاسم بالإنجليزية", "English name")}
                  <input name="name_en" required />
                </label>
              </>
            )}
            {modal === "journal" && (
              <>
                <label>
                  {tr("تاريخ القيد", "Journal date")}
                  <input
                    name="journal_date"
                    type="date"
                    defaultValue={today()}
                    required
                  />
                </label>
                <label>
                  {tr("المبلغ", "Amount")}
                  <input
                    name="amount"
                    type="number"
                    min=".01"
                    step=".01"
                    required
                  />
                </label>
                <label>
                  {tr("الحساب المدين", "Debit account")}
                  <select
                    name="debit_account"
                    value={debitAccount}
                    onChange={(event) => setDebitAccount(event.target.value)}
                    required
                  >
                    <option value="">
                      {tr("اختر الحساب", "Select account")}
                    </option>
                    {data?.accounts
                      .filter((x: Row) => x.active)
                      .map((x: Row) => (
                        <option value={x.id} key={x.id}>
                          {x.code} · {en ? x.name_en : x.name_ar}
                        </option>
                      ))}
                  </select>
                </label>
                {isMoneyAccount(debitAccount) && (
                  <label>
                    {tr("الخزنة / البنك المدين", "Debit cash or bank account")}
                    <select
                      name="debit_money_account_id"
                      required
                      defaultValue=""
                    >
                      <option value="">
                        {tr(
                          "اختر الخزنة أو البنك",
                          "Select cash or bank account",
                        )}
                      </option>
                      {accounts
                        .filter((account) => account.active)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {money(account.balance)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  {tr("الحساب الدائن", "Credit account")}
                  <select
                    name="credit_account"
                    value={creditAccount}
                    onChange={(event) => setCreditAccount(event.target.value)}
                    required
                  >
                    <option value="">
                      {tr("اختر الحساب", "Select account")}
                    </option>
                    {data?.accounts
                      .filter((x: Row) => x.active)
                      .map((x: Row) => (
                        <option value={x.id} key={x.id}>
                          {x.code} · {en ? x.name_en : x.name_ar}
                        </option>
                      ))}
                  </select>
                </label>
                {isMoneyAccount(creditAccount) && (
                  <label>
                    {tr("الخزنة / البنك الدائن", "Credit cash or bank account")}
                    <select
                      name="credit_money_account_id"
                      required
                      defaultValue=""
                    >
                      <option value="">
                        {tr(
                          "اختر الخزنة أو البنك",
                          "Select cash or bank account",
                        )}
                      </option>
                      {accounts
                        .filter((account) => account.active)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {money(account.balance)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  {tr("مركز التكلفة", "Cost center")}
                  <select name="cost_center_id">
                    <option value="">—</option>
                    {data?.cost_centers
                      .filter((x: Row) => x.active)
                      .map((x: Row) => (
                        <option value={x.id} key={x.id}>
                          {x.code} · {en ? x.name_en : x.name_ar}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {tr("المرجع", "Reference")}
                  <input name="reference" />
                </label>
                <label className="wide">
                  {tr("البيان", "Description")}
                  <textarea name="description" required />
                </label>
              </>
            )}
            {modal === "period" && (
              <>
                <label>
                  {tr("الشهر", "Month")}
                  <input name="month" type="month" required />
                </label>
                <label className="wide">
                  {tr("ملاحظة الإقفال", "Closing note")}
                  <textarea name="note" required />
                </label>
              </>
            )}
            {modal === "supplierPayment" && (
              <>
                <p className="wide">
                  {selected?.supplier_name} · {selected?.invoice_no} ·{" "}
                  {tr("المتبقي", "Outstanding")}:{" "}
                  <strong>{money(selected?.outstanding)}</strong>
                </p>
                <label>
                  {tr("المبلغ", "Amount")}
                  <input
                    name="amount"
                    type="number"
                    min=".01"
                    max={selected?.outstanding}
                    step=".01"
                    required
                  />
                </label>
                <label>
                  {tr("الطريقة", "Method")}
                  <select name="method">
                    <option value="cash">{tr("نقدي", "Cash")}</option>
                    <option value="transfer">
                      {tr("تحويل بنكي", "Bank transfer")}
                    </option>
                    <option value="card">{tr("بطاقة", "Card")}</option>
                    <option value="instapay">InstaPay</option>
                    <option value="wallet">{tr("محفظة", "Wallet")}</option>
                  </select>
                </label>
                <label>
                  {tr("حساب السداد", "Paying account")}
                  <select name="money_account_id" required>
                    {accounts
                      .filter((x) => x.active)
                      .map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name} · {money(x.balance)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {tr("المرجع", "Reference")}
                  <input name="reference" required />
                </label>
              </>
            )}
            {modal === "payrollPayment" && (
              <>
                <p className="wide">
                  {tr("مسير شهر", "Payroll month")} {selected?.month} ·{" "}
                  {tr("المتبقي", "Outstanding")}:{" "}
                  <strong>{money(selected?.outstanding)}</strong>
                </p>
                <label>
                  {tr("المبلغ", "Amount")}
                  <input
                    name="amount"
                    type="number"
                    min=".01"
                    max={selected?.outstanding}
                    step=".01"
                    required
                  />
                </label>
                <label>
                  {tr("الطريقة", "Method")}
                  <select name="method">
                    <option value="cash">{tr("نقدي", "Cash")}</option>
                    <option value="transfer">
                      {tr("تحويل بنكي", "Bank transfer")}
                    </option>
                    <option value="card">{tr("بطاقة", "Card")}</option>
                    <option value="instapay">InstaPay</option>
                    <option value="wallet">{tr("محفظة", "Wallet")}</option>
                  </select>
                </label>
                <label>
                  {tr("حساب الصرف", "Paying account")}
                  <select name="money_account_id" required>
                    {accounts
                      .filter((x) => x.active)
                      .map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name} · {money(x.balance)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {tr("المرجع", "Reference")}
                  <input name="reference" required />
                </label>
              </>
            )}
            <div className="modal-actions wide">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                {tr("إلغاء", "Cancel")}
              </button>
              <button disabled={busy} className="button primary" type="submit">
                {tr("حفظ", "Save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
