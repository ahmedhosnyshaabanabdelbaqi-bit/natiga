import { useEffect, useRef, useState } from "react";
import {
  Building2,
  CreditCard,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { getLanguage, useLanguage } from "./i18n";
import {
  api,
  date,
  field,
  FormSpec,
  money,
  Row,
  Section,
  Table,
} from "./shared";

type OpenForm = (spec: FormSpec) => void;
type Permission = (permission: string) => boolean;
type Accounts = { accounts: Row[] };
const en = () => getLanguage() === "en";
export function paymentMethodLabel(method: string) {
  const entries: Record<string, [string, string]> = {
    cash: ["نقدي", "Cash"],
    card: ["بطاقة بنكية / فيزا", "Bank card / Visa"],
    transfer: ["تحويل بنكي", "Bank transfer"],
    wallet: ["محفظة إلكترونية", "Electronic wallet"],
    instapay: ["إنستا باي", "InstaPay"],
  };
  return entries[method]?.[en() ? 1 : 0] || method;
}
function paymentFields(amount: number, accounts: Row[], note: string) {
  const banks = accounts.filter(
    (account) => account.kind === "bank" && account.active,
  );
  return [
    field(
      "amount",
      en() ? "Amount received (EGP)" : "المبلغ المستلم (ج.م)",
      "number",
      true,
      {
        min: 0.01,
        max: amount > 0 ? amount : undefined,
        step: "0.01",
        value: amount > 0 ? amount : "",
        help: note,
      },
    ),
    field("method", en() ? "Payment method" : "طريقة الدفع", "text", true, {
      options: ["cash", "card", "transfer", "wallet", "instapay"].map(
        (method) => ({ value: method, label: paymentMethodLabel(method) }),
      ),
      value: "cash",
    }),
    field(
      "money_account_id",
      en()
        ? "Receiving bank account (optional)"
        : "الحساب البنكي المستلم (اختياري)",
      "text",
      false,
      {
        options: banks.map((account) => ({
          value: account.id,
          label: [account.name, account.bank_name, account.account_number]
            .filter(Boolean)
            .join(" · "),
        })),
        help: en()
          ? "Cash goes to the main cash account. Select a bank only if the money was credited there. Otherwise leave blank; the electronic receipt is shown separately from bank balances."
          : "النقدي يُسجّل في الخزنة الرئيسية. اختر بنكًا فقط إذا وصل المبلغ إليه؛ وإلا اتركه فارغًا ليظهر التحصيل الإلكتروني منفصلًا عن أرصدة البنوك.",
      },
    ),
    field(
      "reference",
      en()
        ? "Transaction reference (required for non-cash)"
        : "مرجع العملية (مطلوب لغير النقدي)",
      "text",
      false,
      {
        help: en()
          ? "Enter the payment provider or bank transaction reference."
          : "أدخل مرجع العملية من البنك أو مقدم خدمة الدفع.",
      },
    ),
    field(
      "notes",
      en() ? "Collection notes" : "ملاحظات التحصيل",
      "textarea",
      false,
      { wide: true },
    ),
  ];
}
function paymentBody(values: Row, accounts: Row[]) {
  const method = String(values.method || "");
  if (!["cash", "card", "transfer", "wallet", "instapay"].includes(method))
    throw Error(
      en() ? "Choose a supported payment method." : "اختر طريقة دفع متاحة.",
    );
  if (method !== "cash" && !String(values.reference || "").trim())
    throw Error(
      en()
        ? "A transaction reference is required for this payment method."
        : "مرجع العملية مطلوب لطريقة الدفع المختارة.",
    );
  const account = accounts.find(
    (item) =>
      item.id === values.money_account_id &&
      item.kind === "bank" &&
      item.active,
  );
  if (method !== "cash" && values.money_account_id && !account)
    throw Error(
      en()
        ? "Choose an active receiving bank account."
        : "اختر حسابًا بنكيًا نشطًا لاستقبال المبلغ.",
    );
  return {
    ...values,
    method,
    money_account_id: method === "cash" ? "cash" : account?.id ?? null,
    reference: String(values.reference || "").trim(),
  };
}
/** Root callers await/catch this helper; guard prevents opening a form for a departed admission. */
export async function createPaymentForm(
  admission: Row,
  openForm: OpenForm,
  onSaved?: () => void,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const [bill, treasury] = (await Promise.all([
    api("/billing/admissions/" + encodeURIComponent(admission.id)),
    api("/treasury"),
  ])) as [Row, Accounts];
  if (!isCurrent()) return;
  const due = Math.max(
    0,
    Number(bill.totals.patient_due ?? bill.totals.balance),
  );
  const active = bill.admission || admission;
  const accounts = treasury.accounts || [];
  openForm({
    title: en() ? "Record patient payment" : "تسجيل دفعة المريض",
    subtitle: [active.patient_name || active.name, active.admission_no]
      .filter(Boolean)
      .join(" · "),
    sensitive: true,
    note: en()
      ? `Patient due: ${money(due)}. Outstanding insurer claims: ${money(bill.totals.insurance_outstanding || 0)}. Record only money actually received from the patient; insurer collections use the claim action.`
      : `المستحق على المريض: ${money(due)}. مطالبات التأمين المستحقة: ${money(bill.totals.insurance_outstanding || 0)}. سجّل الأموال المستلمة فعلًا من المريض؛ تحصيل التأمين يتم من إجراء المطالبة.`,
    fields: paymentFields(
      due,
      accounts,
      en()
        ? "Prefilled from the latest patient due. Adjust to the amount actually received."
        : "معبأ من آخر مستحق على المريض. عدّل إلى المبلغ المستلم فعلًا.",
    ),
    submit: async (values) => {
      const result = await api(
        "/admissions/" + encodeURIComponent(admission.id) + "/payments",
        paymentBody(values, accounts),
      );
      onSaved?.();
      return result;
    },
  });
}
async function createCollectionForm(
  claim: Row,
  admissionId: string,
  openForm: OpenForm,
  onSaved?: () => void,
  isCurrent: () => boolean = () => true,
) {
  const [claims, treasury] = (await Promise.all([
    api("/admissions/" + encodeURIComponent(admissionId) + "/insurance-claims"),
    api("/treasury"),
  ])) as [Row, Accounts];
  if (!isCurrent()) return;
  const latest = (claims.insurance_claims || []).find(
    (item: Row) => item.id === claim.id,
  );
  if (!latest)
    throw Error(
      en()
        ? "The insurance claim is no longer available."
        : "المطالبة التأمينية غير متاحة.",
    );
  const outstanding = Math.max(0, Number(latest.outstanding));
  if (outstanding <= 0)
    throw Error(
      en()
        ? "This claim has no outstanding amount."
        : "لا يوجد مبلغ مستحق لهذه المطالبة.",
    );
  const accounts = treasury.accounts || [];
  const company =
    latest.company_snapshot?.name || claim.company_snapshot?.name || "";
  openForm({
    title: en() ? "Record insurer collection" : "تسجيل تحصيل شركة التأمين",
    subtitle: company,
    sensitive: true,
    note: en()
      ? `Claim outstanding: ${money(outstanding)}. This records an actual received payment and reduces this claim’s balance. Approvals and claims alone do not count as collections.`
      : `المتبقي بالمطالبة: ${money(outstanding)}. يسجّل هذا الإجراء مبلغًا مستلمًا فعلًا ويخفض رصيد المطالبة. الموافقات والمطالبات وحدها لا تُعد تحصيلًا.`,
    fields: paymentFields(
      outstanding,
      accounts,
      en()
        ? "Amount actually received from the insurer, within this claim’s outstanding balance."
        : "المبلغ المستلم فعلًا من الشركة في حدود المتبقي بالمطالبة.",
    ),
    submit: async (values) => {
      const result = await api(
        "/insurance-claims/" + encodeURIComponent(claim.id) + "/collections",
        paymentBody(values, accounts),
      );
      onSaved?.();
      return result;
    },
  });
}
function companyFields(edit: boolean) {
  return [
    ...(!edit
      ? [field("code", en() ? "Company code" : "كود الشركة", "text", true)]
      : []),
    field(
      "name",
      en() ? "Insurance company name" : "اسم شركة التأمين",
      "text",
      true,
    ),
    field(
      "contract_number",
      en() ? "Contract number" : "رقم التعاقد",
      "text",
      false,
    ),
    field(
      "contact_name",
      en() ? "Contact person" : "مسؤول التواصل",
      "text",
      false,
    ),
    field("phone", en() ? "Phone" : "الهاتف", "tel", false),
    field("email", en() ? "Email" : "البريد الإلكتروني", "email", false),
    field("address", en() ? "Address" : "العنوان", "textarea", false, {
      wide: true,
    }),
    field(
      "terms",
      en() ? "Contract terms and notes" : "شروط التعاقد والملاحظات",
      "textarea",
      false,
      { wide: true },
    ),
    ...(edit
      ? [
          field(
            "active",
            en() ? "Available for new claims" : "متاحة لمطالبات جديدة",
            "checkbox",
            false,
          ),
        ]
      : []),
  ];
}
export function InsuranceCompanies({
  can,
  openForm,
  revision,
  userRole,
}: {
  can: Permission;
  openForm: OpenForm;
  revision: number;
  userRole?: string;
}) {
  const english = useLanguage() === "en";
  const [companies, setCompanies] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0);
  const read = can("billing.read"),
    write =
      can("billing.write") ||
      (userRole === "insurance" && can("operations.write"));
  useEffect(() => {
    if (!read) return;
    let active = true;
    setLoading(true);
    api("/insurance-companies")
      .then((result) => {
        if (active) {
          setCompanies(result);
          setError("");
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, refresh, read]);
  if (!read) return null;
  const edit = (company?: Row) =>
    openForm({
      title: company
        ? english
          ? "Edit insurance company"
          : "تعديل شركة التأمين"
        : english
          ? "Add insurance company"
          : "إضافة شركة تأمين",
      subtitle: company?.code,
      note: company
        ? english
          ? "Disabling a company stops new claims. Existing claims keep their recorded company details and can still be collected."
          : "إيقاف الشركة يمنع المطالبات الجديدة. تحتفظ المطالبات السابقة ببيانات الشركة المسجلة ويمكن تحصيلها."
        : undefined,
      fields: companyFields(!!company),
      initial: company
        ? Object.fromEntries(
            companyFields(true).map((item) => [item.name, company[item.name]]),
          )
        : undefined,
      submit: async (values) => {
        const body = company ? { ...values, version: company.version } : values;
        const result = await api(
          "/insurance-companies" +
            (company ? "/" + encodeURIComponent(company.id) : ""),
          body,
          company ? "PATCH" : "POST",
        );
        setRefresh((value) => value + 1);
        return result;
      },
    });
  const shown = companies.filter((company) =>
    [company.name, company.code, company.contract_number]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <Section
      title={english ? "Insurance companies" : "شركات التأمين"}
      sub={
        english
          ? "Contracts and company details for admission claims"
          : "التعاقدات وبيانات الشركات المرتبطة بمطالبات الإقامة"
      }
      action={
        <div className="inline-actions">
          <button
            className="icon-button"
            aria-label={
              english ? "Refresh insurance companies" : "تحديث شركات التأمين"
            }
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={17} />
          </button>
          {write && (
            <button className="button primary" onClick={() => edit()}>
              <Plus size={17} />
              {english ? "Add company" : "إضافة شركة"}
            </button>
          )}
        </div>
      }
    >
      {error && (
        <div
          className="error-box"
          role="alert"
          style={{ margin: "0 20px 17px" }}
        >
          {error}
          <button
            className="button small"
            onClick={() => setRefresh((value) => value + 1)}
          >
            {english ? "Retry" : "إعادة المحاولة"}
          </button>
        </div>
      )}
      <div className="table-toolbar">
        <label className="search-input">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              english
                ? "Company, code or contract…"
                : "الشركة أو الكود أو التعاقد…"
            }
            aria-label={
              english ? "Search insurance companies" : "بحث شركات التأمين"
            }
          />
        </label>
      </div>
      {loading ? (
        <div className="loading">
          <LoaderCircle className="spin" size={24} />
          {english ? "Loading…" : "جارٍ التحميل…"}
        </div>
      ) : (
        <Table
          headers={[
            english ? "Company" : "الشركة",
            english ? "Contract" : "التعاقد",
            english ? "Contact" : "التواصل",
            english ? "New claims" : "المطالبات الجديدة",
            english ? "Actions" : "الإجراءات",
          ]}
          rows={shown.map((company) => [
            <div>
              <strong>{company.name}</strong>
              <small>{company.code}</small>
            </div>,
            company.contract_number || "—",
            <div>
              {company.contact_name || "—"}
              <small>{company.phone || company.email || ""}</small>
            </div>,
            <span
              className={"badge " + (company.active ? "active" : "stopped")}
            >
              {company.active
                ? english
                  ? "Available"
                  : "متاحة"
                : english
                  ? "Disabled"
                  : "موقوفة"}
            </span>,
            write ? (
              <button className="button small" onClick={() => edit(company)}>
                <Edit3 size={15} />
                {english ? "Edit" : "تعديل"}
              </button>
            ) : (
              "—"
            ),
          ])}
        />
      )}
    </Section>
  );
}
export function AdmissionInsurance({
  admissionId,
  can,
  openForm,
  revision,
  onSaved,
  userRole,
}: {
  admissionId: string;
  can: Permission;
  openForm: OpenForm;
  revision: number;
  onSaved?: () => void;
  userRole?: string;
}) {
  const english = useLanguage() === "en";
  const [state, setState] = useState<{
      id: string;
      claims: Row[];
      outstanding: number;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(""),
    [refresh, setRefresh] = useState(0);
  const current = useRef(admissionId),
    mounted = useRef(true);
  current.current = admissionId;
  const read = can("billing.read"),
    allocate =
      can("billing.write") ||
      (userRole === "insurance" && can("operations.write"));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current = "";
    };
  }, []);
  useEffect(() => {
    if (!read) return;
    let active = true;
    setState(null);
    setLoading(true);
    setError("");
    setActionError("");
    setBusy("");
    api("/admissions/" + encodeURIComponent(admissionId) + "/insurance-claims")
      .then((result) => {
        if (active)
          setState({
            id: admissionId,
            claims: result.insurance_claims || [],
            outstanding: Number(result.insurance_outstanding || 0),
          });
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admissionId, revision, refresh, read]);
  const saved = () => {
    if (mounted.current) setRefresh((value) => value + 1);
    onSaved?.();
  };
  async function allocateClaim() {
    const requested = admissionId;
    setBusy("new");
    setActionError("");
    try {
      const [companies, bill] = await Promise.all([
        api("/insurance-companies"),
        api("/billing/admissions/" + encodeURIComponent(requested)),
      ]);
      if (current.current !== requested || !mounted.current) return;
      const activeCompanies: Row[] = companies.filter(
        (company: Row) => company.active,
      );
      if (!activeCompanies.length)
        throw Error(
          english
            ? "Add or enable an insurance company before creating a claim."
            : "أضف أو فعّل شركة تأمين قبل إنشاء مطالبة.",
        );
      const due = Math.max(
        0,
        Number(bill.totals.patient_due ?? bill.totals.balance),
      );
      if (due <= 0)
        throw Error(
          english
            ? "No unallocated patient due is available for a new insurance claim."
            : "لا يوجد مستحق غير مخصص على المريض لإنشاء مطالبة تأمين جديدة.",
        );
      openForm({
        title: english ? "Allocate an insurance claim" : "تسجيل مطالبة تأمين",
        subtitle: bill.admission?.admission_no,
        note: english
          ? `Available patient due: ${money(due)}. This allocates responsibility to the insurer; it does not record a payment or increase collections.`
          : `المتاح من مستحق المريض: ${money(due)}. ينقل هذا الإجراء المسؤولية إلى شركة التأمين، ولا يُسجّل دفعة أو يزيد التحصيل.`,
        fields: [
          field(
            "company_id",
            english ? "Insurance company" : "شركة التأمين",
            "text",
            true,
            {
              options: activeCompanies.map((company) => ({
                value: company.id,
                label: company.name + " · " + company.code,
              })),
            },
          ),
          field(
            "policy_number",
            english ? "Policy / membership number" : "رقم الوثيقة / العضوية",
            "text",
            true,
          ),
          field(
            "member_name",
            english ? "Insured member name" : "اسم المؤمن عليه",
            "text",
            false,
          ),
          field(
            "approval_number",
            english ? "Approval number" : "رقم الموافقة",
            "text",
            false,
          ),
          field(
            "amount",
            english ? "Claim amount (EGP)" : "مبلغ المطالبة (ج.م)",
            "number",
            true,
            { min: 0.01, max: due, step: "0.01" },
          ),
          field(
            "notes",
            english ? "Claim notes" : "ملاحظات المطالبة",
            "textarea",
            false,
            { wide: true },
          ),
        ],
        submit: async (values) => {
          const result = await api(
            "/admissions/" +
              encodeURIComponent(requested) +
              "/insurance-claims",
            values,
          );
          saved();
          return result;
        },
      });
    } catch (reason) {
      if (current.current === requested && mounted.current)
        setActionError(
          reason instanceof Error ? reason.message : String(reason),
        );
    } finally {
      if (current.current === requested && mounted.current) setBusy("");
    }
  }
  async function collect(claim: Row) {
    const requested = admissionId;
    setBusy(claim.id);
    setActionError("");
    try {
      await createCollectionForm(
        claim,
        requested,
        openForm,
        saved,
        () => mounted.current && current.current === requested,
      );
    } catch (reason) {
      if (mounted.current && current.current === requested)
        setActionError(
          reason instanceof Error ? reason.message : String(reason),
        );
    } finally {
      if (mounted.current && current.current === requested) setBusy("");
    }
  }
  if (!read) return null;
  const claims = state?.id === admissionId ? state.claims : [];
  return (
    <Section
      title={english ? "Admission insurance" : "تأمين الإقامة"}
      sub={
        english
          ? "Insurance responsibility and actual insurer receipts are tracked separately"
          : "تُعرض مسؤولية شركة التأمين والتحصيل الفعلي منها بصورة منفصلة"
      }
      action={
        <div className="inline-actions">
          <button
            className="icon-button"
            onClick={() => setRefresh((value) => value + 1)}
            aria-label={
              english ? "Refresh insurance claims" : "تحديث مطالبات التأمين"
            }
          >
            <RefreshCw size={17} />
          </button>
          {allocate && (
            <button
              className="button"
              onClick={() => void allocateClaim()}
              disabled={!!busy}
            >
              {busy === "new" ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Plus size={17} />
              )}{" "}
              {english ? "Add claim" : "إضافة مطالبة"}
            </button>
          )}
        </div>
      }
    >
      {(error || actionError) && (
        <div
          role="alert"
          className="error-box"
          style={{ margin: "0 20px 17px" }}
        >
          {error || actionError}
          {error && (
            <button
              className="button small"
              onClick={() => setRefresh((value) => value + 1)}
            >
              {english ? "Retry" : "إعادة المحاولة"}
            </button>
          )}
        </div>
      )}
      {loading ? (
        <div className="loading">
          <LoaderCircle className="spin" size={24} />
          {english ? "Loading claims…" : "تحميل المطالبات…"}
        </div>
      ) : (
        <>
          <div className="info-box" style={{ margin: "0 20px 17px" }}>
            <ShieldCheck size={20} />
            <span>
              {english
                ? "Outstanding with insurers: "
                : "المتبقي لدى شركات التأمين: "}
              <strong>{money(state?.outstanding || 0)}</strong>
              <small style={{ display: "block" }}>
                {english
                  ? "A registered claim is not a received payment."
                  : "المطالبة المسجلة ليست دفعة مستلمة."}
              </small>
            </span>
          </div>
          <Table
            headers={[
              english ? "Company / policy" : "الشركة / الوثيقة",
              english ? "Claim" : "المطالبة",
              english ? "Collected" : "المحصّل",
              english ? "Outstanding" : "المتبقي",
              english ? "Collection" : "التحصيل",
            ]}
            rows={claims.map((claim) => [
              <div>
                <strong>{claim.company_snapshot?.name || "—"}</strong>
                <small>
                  {claim.policy_number}{" "}
                  {claim.member_name ? "· " + claim.member_name : ""}
                </small>
                {claim.approval_number && (
                  <small>
                    {english ? "Approval: " : "الموافقة: "}
                    {claim.approval_number}
                  </small>
                )}
              </div>,
              money(claim.amount),
              money(claim.collected),
              money(claim.outstanding),
              can("billing.write") && Number(claim.outstanding) > 0 ? (
                <button
                  className="button small"
                  disabled={!!busy}
                  onClick={() => void collect(claim)}
                >
                  {busy === claim.id ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Wallet size={15} />
                  )}{" "}
                  {english ? "Record collection" : "تسجيل تحصيل"}
                </button>
              ) : (
                <span className="badge">
                  {Number(claim.outstanding) <= 0
                    ? english
                      ? "Settled"
                      : "محصّلة"
                    : english
                      ? "View only"
                      : "اطلاع فقط"}
                </span>
              ),
            ])}
          />
          {claims.some((claim) => claim.collections?.length > 0) && (
            <details style={{ padding: "15px 22px" }}>
              <summary
                style={{ cursor: "pointer", fontSize: 13, fontWeight: 750 }}
              >
                {english ? "Insurer receipts" : "إيصالات شركات التأمين"}
              </summary>
              <Table
                headers={[
                  english ? "Receipt" : "الإيصال",
                  english ? "Company" : "الشركة",
                  english ? "Received" : "المستلم",
                  english ? "Method / reference" : "الطريقة / المرجع",
                  english ? "Time" : "التوقيت",
                ]}
                rows={claims.flatMap((claim) =>
                  (claim.collections || []).map((payment: Row) => [
                    payment.receipt_no,
                    claim.company_snapshot?.name,
                    money(payment.amount),
                    <div>
                      {paymentMethodLabel(payment.method)}
                      <small>{payment.reference || "—"}</small>
                    </div>,
                    date(payment.created_at, true),
                  ]),
                )}
              />
            </details>
          )}
        </>
      )}
    </Section>
  );
}
