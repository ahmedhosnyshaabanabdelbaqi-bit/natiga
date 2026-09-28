import { useEffect, useRef, useState } from "react";
import { t, getLanguage, getLocale, setLanguage, useLanguage } from "./i18n";
import {
  AdmissionInsurance,
  InsuranceCompanies,
  createPaymentForm,
  paymentMethodLabel,
} from "./FinancialTools";
import TreasuryPanel from "./TreasuryPanel";
import FinancialStatements from "./FinancialStatements";
import { CheckoutQueue } from "./Checkout";
import {
  BedDouble,
  Download,
  Plus,
  Printer,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  api,
  Badge,
  date,
  field,
  fmt,
  FormSpec,
  labels,
  money,
  nowInput,
  options,
  Row,
  Section,
  searchText,
  Table,
} from "./shared";
type OperationsProps = {
  revision?: number;
  userRole?: string;
  page: string;
  data: Row;
  can: (p: string) => boolean;
  setForm: (f: FormSpec) => void;
  users: Row[];
  openPatient: (id: string, admissionId?: string, tab?: string) => void;
  navigate?: (page: string) => void;
  print: (kind: string, id?: string, recordId?: string) => void;
  exportData: (kind: string) => void;
};
export function Operations(props: OperationsProps) {
  return <OperationsWorkspace key={props.page} {...props} />;
}
function OperationsWorkspace({
  revision = 0,
  userRole,
  page,
  data,
  can,
  setForm,
  users,
  openPatient,
  print,
  exportData,
  navigate,
}: OperationsProps) {
  const english = useLanguage() === "en";
  const [query, setQuery] = useState(""),
    [paymentError, setPaymentError] = useState("");
  const [bedStatus, setBedStatus] = useState("all");
  const [bedDepartment, setBedDepartment] = useState("all");
  const [bedDepartments, setBedDepartments] = useState<Row[]>([]);
  const [bedDepartmentsError, setBedDepartmentsError] = useState("");
  useEffect(() => {
    if (page !== "beds") return;
    let active = true;
    setBedDepartmentsError("");
    api("/hospital/departments").then(rows => { if (active) setBedDepartments(rows); }).catch(error => { if (active) setBedDepartmentsError(error.message); });
    return () => { active = false; };
  }, [page, revision]);
  const bedDepartmentChoices = bedDepartments.filter(d => d.active && ["nicu", "inpatient", "icu", "emergency", "surgery"].includes(d.type));
  const departmentBeds: Row[] = (data.beds || []).filter((bed: Row) => bedDepartment === "all" || bed.department_id === bedDepartment);
  const paymentTarget = useRef("");
  useEffect(
    () => () => {
      paymentTarget.current = "";
    },
    [],
  );
  const admissions: Row[] = data.billing?.admissions || [];
  const matches = (a: Row) =>
    searchText(
      [
        a.patient_name,
        a.name,
        a.mrn,
        a.admission_no,
        `INV-${a.admission_no}`,
      ].join(" "),
    ).includes(searchText(query));
  const pay = async (a: Row) => {
    paymentTarget.current = a.id;
    setPaymentError("");
    try {
      await createPaymentForm(
        a,
        setForm,
        undefined,
        () => paymentTarget.current === a.id,
      );
    } catch (e) {
      if (paymentTarget.current === a.id) setPaymentError((e as Error).message);
    }
  };
  const [invoiceDetail, setInvoiceDetail] = useState<Row | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceRevision, setInvoiceRevision] = useState(0);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  useEffect(() => {
    setInvoiceDetail(null);
    setInvoiceError("");
    if (!invoiceId || !["invoices", "accounts", "billing"].includes(page)) {
      setInvoiceLoading(false);
      return;
    }
    let active = true;
    setInvoiceLoading(true);
    api(`/billing/admissions/${encodeURIComponent(invoiceId)}`)
      .then((detail) => {
        if (active) setInvoiceDetail(detail);
      })
      .catch((error) => {
        if (active) setInvoiceError(error.message);
      })
      .finally(() => {
        if (active) setInvoiceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, invoiceId, invoiceRevision, data.billing]);
  const shownInvoice =
    invoiceDetail?.admission?.id === invoiceId ? invoiceDetail : null;
  return (
    <>
      {page === "beds" && (
        <>
          {can("beds.write") && (
            <div className="button-row">
              <button
                className="button primary"
                disabled={!bedDepartmentChoices.length}
                onClick={() =>
                  setForm({
                    title: english
                      ? "Add hospital bed"
                      : "إضافة سرير للمستشفى",
                    fields: [
                      field(
                        "name",
                        english
                          ? "Bed name / number"
                          : "اسم / رقم السرير",
                      ),
                      field("department_id", english ? "Hospital department" : "قسم المستشفى", "text", true, {
                        value: bedDepartmentChoices.some(d => d.id === bedDepartment) ? bedDepartment : bedDepartmentChoices.find(d => d.id === "dept-nicu")?.id || bedDepartmentChoices[0]?.id,
                        options: bedDepartmentChoices.map(d => ({ value: d.id, label: d.name })),
                      }),
                      field("room", english ? "Room" : "الغرفة"),
                      field(
                        "care_level",
                        english ? "Care level" : "مستوى الرعاية",
                        "text",
                        true,
                        {
                          value: "intensive",
                          options: options(["general", "intensive", "intermediate"]),
                        },
                      ),
                      field(
                        "status",
                        english ? "Initial status" : "الحالة الأولية",
                        "text",
                        true,
                        {
                          value: "available",
                          options: options([
                            "available",
                            "maintenance",
                            "cleaning",
                            "out_of_service",
                          ]),
                        },
                      ),
                      field(
                        "reason",
                        english
                          ? "Status note / reason"
                          : "ملاحظة / سبب الحالة",
                        "textarea",
                        false,
                      ),
                    ],
                    submit: (v) => api("/beds", v),
                  })
                }
              >
                {english ? "Add bed" : "إضافة سرير"}
              </button>
            </div>
          )}
          {bedDepartmentsError && <div className="error-box" role="alert">{bedDepartmentsError}</div>}
          <label className="filter-field">
            <span>{english ? "Hospital department" : "قسم المستشفى"}</span>
            <select aria-label={english ? "Filter beds by department" : "تصفية الأسرة حسب القسم"} value={bedDepartment} onChange={event => setBedDepartment(event.target.value)}>
              <option value="all">{english ? "All departments" : "كل الأقسام"}</option>
              {bedDepartments.filter(d => ["nicu", "inpatient", "icu", "emergency", "surgery"].includes(d.type)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="bed-legend" role="group" aria-label={english ? "Filter beds by status" : "تصفية الأسرة حسب الحالة"}>
            {[
              "all",
              "available",
              "occupied",
              "reserved",
              "cleaning",
              "maintenance",
              "out_of_service",
            ].map((s) => (
              <button
                type="button"
                key={s}
                className={"bed-filter " + (bedStatus === s ? "active" : "")}
                aria-pressed={bedStatus === s}
                onClick={() => setBedStatus(s)}
              >
                {s === "all" ? (english ? "All" : "الكل") : <Badge value={s} />}
                <span>{fmt(s === "all" ? departmentBeds.length : departmentBeds.filter((b: Row) => b.status === s).length)}</span>
              </button>
            ))}
          </div>
          {[...new Set(departmentBeds.filter((b: Row) => bedStatus === "all" || b.status === bedStatus).map((b: Row) => b.room))].map(
            (room: any) => (
              <Section
                key={room}
                title={room || (english ? "Hospital room" : "غرفة المستشفى")}
                sub={t("اختر سريرًا لفتح الحالة أو تحديث الجاهزية")}
              >
                <div className="bed-grid">
                  {departmentBeds
                    .filter((b: Row) => b.room === room && (bedStatus === "all" || b.status === bedStatus))
                    .map((b: Row) => (
                      <div className="bed-card-wrap" key={b.id}>
                      <button
                        className={"bed-card " + b.status}
                        onClick={() => {
                          if (b.patient_id) {
                            openPatient(b.patient_id, b.admission_id);
                            return;
                          }
                          if (!can("beds.write")) return;
                          setForm({
                            title: t("تحديث جاهزية") + " " + b.name,
                            fields: [
                              field("status", t("حالة السرير"), "text", true, {
                                value: b.status,
                                options: options([
                                  "available",
                                  "reserved",
                                  "cleaning",
                                  "maintenance",
                                  "out_of_service",
                                ]),
                              }),
                              field(
                                "reason",
                                t("سبب التحديث / اعتماد التنظيف"),
                                "textarea",
                              ),
                            ],
                            submit: (v) =>
                              api(
                                "/beds/" + b.id,
                                { ...v, version: b.version },
                                "PATCH",
                              ),
                            sensitive: true,
                          });
                        }}
                      >
                        <div>
                          <strong>{b.name}</strong>
                          <Badge value={b.status} />
                        </div>
                        <BedDouble size={38} />
                        <h4>{b.patient_name || (english ? "No patient assigned" : "لا يوجد مريض مسكّن")}</h4>
                        <small>{bedDepartments.find(d => d.id === b.department_id)?.name || b.department_name || ""}</small>
                        <p>
                          {b.mrn ||
                            labels[b.care_level] ||
                            b.care_level ||
                            (english ? "Hospital bed" : "سرير مستشفى")}
                        </p>
                      </button>
                      {can("print") && (
                        <button
                          className="button small bed-label-button"
                          onClick={() => window.open(`/api/print/bed-label?bed_id=${encodeURIComponent(b.id)}&lang=${getLanguage()}`, "_blank", "noopener")}
                        >
                          <Printer size={15} />
                          {english ? "Barcode 50×30" : "باركود 50×30"}
                        </button>
                      )}
                      </div>
                    ))}
                </div>
              </Section>
            ),
          )}
        </>
      )}
      {page === "tasks" && (
        <Section
          title={t("قائمة مهام الفريق")}
          sub={t("الفريق المكلّف مسؤول عن توثيق التنفيذ والسبب")}
          action={
            (can("nursing.write") || can("operations.write")) && (
              <button
                className="button primary small"
                onClick={() =>
                  setForm({
                    title: t("إضافة مهمة للقسم"),
                    fields: [
                      field("title", t("عنوان المهمة")),
                      field("due_at", t("الموعد"), "datetime-local", true, {
                        value: nowInput(),
                      }),
                      field("assignee_id", t("المكلّف"), "text", false, {
                        options: users.map((u) => ({
                          value: u.id,
                          label: u.name,
                        })),
                      }),
                    ],
                    submit: (v) => api("/tasks", v),
                  })
                }
              >
                <Plus size={16} /> {t("مهمة جديدة")}{" "}
              </button>
            )
          }
        >
          <Table
            headers={[
              t("المهمة"),
              t("الطفل / المسؤول"),
              t("الموعد"),
              t("الحالة"),
              t("الإجراء"),
            ]}
            rows={(data.tasks || []).map((taskRow: Row) => [
              taskRow.title,
              <div>
                {taskRow.patient_id && can("patients.read") ? (
                  <button className="button tiny" onClick={() => openPatient(taskRow.patient_id, taskRow.admission_id, taskRow.order_id ? "orders" : "nursing")}>
                    {taskRow.patient_name}
                  </button>
                ) : taskRow.patient_name || t("مهمة عامة")}
                <small>{taskRow.assignee_name}</small>
              </div>,
              date(taskRow.due_at, true),
              <Badge value={taskRow.status} />,
              ["pending", "deferred"].includes(taskRow.status) && taskRow.order_id && can("patients.read") ? (
                <button className="button tiny" onClick={() => openPatient(taskRow.patient_id, taskRow.admission_id, "orders")}>
                  {english ? "Document administration" : "توثيق تنفيذ الأمر"}
                </button>
              ) : ["pending", "deferred"].includes(taskRow.status) && !taskRow.order_id &&
              (can("nursing.write") || can("operations.write")) ? (
                <button
                  className="button tiny"
                  onClick={() =>
                    setForm({
                      title: t("تحديث المهمة"),
                      fields: [
                        field("status", t("الحالة"), "text", true, {
                          options: options([
                            "completed",
                            "deferred",
                            "cancelled",
                          ]),
                        }),
                        field("reason", t("ملاحظة / سبب"), "textarea"),
                      ],
                      submit: (v) =>
                        api(
                          "/tasks/" + taskRow.id,
                          { ...v, version: taskRow.version },
                          "PATCH",
                        ),
                    })
                  }
                >
                  {" "}
                  {t("تحديث الحالة")}{" "}
                </button>
              ) : (
                "—"
              ),
            ])}
          />
        </Section>
      )}
      {page === "inventory" && (
        <Section
          title={t("الجرد والهالك والمرتجعات")}
          sub={t("عرض التشغيلات الحالية وتسجيل الهالك أو المرتجع؛ الأصناف والاستلام والصرف للطفل موحدة في نفس القسم")}
        >
          <Table
            headers={[
              t("الصنف"),
              t("التشغيلة"),
              t("الصلاحية"),
              t("الرصيد"),
              t("التكلفة"),
              t("القسم المخزني"),
              t("الموقع"),
              t("الحركة"),
            ]}
            rows={(data.inventory || []).map((i: Row) => [
              <div>
                <strong>{i.name}</strong>
                <small>{i.unit}</small>
              </div>,
              i.batch,
              date(i.expires_at),
              <Badge
                value={
                  Number(i.quantity) <= Number(i.min_quantity)
                    ? "urgent"
                    : "available"
                }
              >
                {fmt(i.quantity)} {i.unit}
              </Badge>,
              money(i.cost),
              ({general_stock: english ? "General stock" : "المخزن العام",medical_consumables: english ? "Medical consumables" : "المستهلكات الطبية",supplies: english ? "Supplies" : "المستلزمات"} as Row)[i.stock_section] || i.stock_section,
              i.location,
              can("stock.write") ? (
                <button
                  className="button tiny"
                  onClick={() =>
                    setForm({
                      title: t("حركة مخزون:") + " " + i.name,
                      fields: [
                        field("type", t("نوع الحركة"), "text", true, {
                          options: options(["return", "waste"]),
                        }),
                        field(
                          "quantity",
                          t("الكمية (") + i.unit + ")",
                          "number",
                          true,
                          { min: 0.001 },
                        ),
                        field("reason", t("السبب / مرجع المستند"), "textarea"),
                      ],
                      submit: (v) => api("/inventory/" + i.id + "/move", v),
                      sensitive: true,
                    })
                  }
                >
                  {" "}
                  {t("تسجيل حركة")}{" "}
                </button>
              ) : (
                "—"
              ),
            ])}
          />
        </Section>
      )}
      {["billing", "accounts", "invoices", "treasury"].includes(page) && (
        <>
          <div className="section-search">
            <label>
              {english
                ? "Find an infant, file or invoice"
                : "بحث باسم الطفل أو رقم الملف أو الفاتورة"}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  english
                    ? "Infant name / MRN / INV-…"
                    : "اسم الطفل / رقم الملف / INV-…"
                }
              />
            </label>
            <small>
              {english
                ? "Financial totals include all authorized accounts. Search filters the lists below."
                : "الإجماليات لجميع الحسابات المصرح بها؛ البحث يرشح القوائم التالية."}
            </small>
          </div>
          {paymentError && <div className="error-box">{paymentError}</div>}
          {page === "accounts" && (
            <>
              {can("reports.read") && <FinancialStatements can={can} />}
              <CheckoutQueue
                can={can}
                openForm={setForm}
                revision={revision}
                openPatient={openPatient}
              />
            </>
          )}
          {page === "treasury" && (
            <TreasuryPanel can={can} openForm={setForm} revision={revision} />
          )}
          {page === "treasury" && can("billing.write") && (
            <Section
              title={english ? "Receive a payment" : "تسجيل تحصيل سريع"}
              sub={
                english
                  ? "Search above, then select the infant account."
                  : "ابحث أعلاه ثم اختر حساب الطفل."
              }
            >
              <Table
                headers={[
                  english ? "Infant" : "الطفل",
                  english ? "Invoice" : "الفاتورة",
                  english ? "Patient due" : "حصة المريض",
                  english ? "Payment" : "الدفع",
                ]}
                rows={admissions.filter(matches).map((a) => [
                  a.patient_name || a.name,
                  `INV-${a.admission_no}`,
                  money(a.patient_due ?? a.balance),
                  <button
                    className="button small primary"
                    onClick={() => void pay(a)}
                  >
                    {english ? "Record payment" : "تسجيل دفعة"}
                  </button>,
                ])}
              />
            </Section>
          )}
          <div className="patient-metrics three">
            {[
              ["charged", t("قيمة الخدمات")],
              ["paid", t("إجمالي المحصّل")],
              ["balance", t("الرصيد المستحق")],
            ].map(([k, l]) => (
              <div className="mini-metric" key={k}>
                <span>{l}</span>
                <strong>{money(data.billing?.totals?.[k])}</strong>
              </div>
            ))}
          </div>
          {page !== "treasury" && (
            <Section
              title={t("الحسابات والفواتير")}
              sub={t(
                "اختر الإقامة لعرض بنودها ومدفوعاتها أو فتح حسابها مباشرة.",
              )}
              action={
                page !== "invoices" &&
                can("billing.write") && (
                  <button
                    className="button small"
                    onClick={() =>
                      setForm({
                        title: t("إقفال الوردية المالية"),
                        fields: [
                          field(
                            "reason",
                            t("مرجع الجرد والتسليم / السبب"),
                            "textarea",
                          ),
                        ],
                        sensitive: true,
                        submit: (v) => api("/billing/close", v),
                      })
                    }
                  >
                    {" "}
                    {t("إقفال الخزينة")}{" "}
                  </button>
                )
              }
            >
              <Table
                headers={[
                  t("الطفل"),
                  t("رقم الفاتورة / الإقامة"),
                  t("الخدمات"),
                  t("المحصّل"),
                  t("المستحق"),
                  t("الملف"),
                ]}
                rows={admissions.filter(matches).map((a: Row) => [
                  a.patient_name || a.name,
                  `INV-${a.admission_no}`,
                  money(a.charged),
                  money(a.paid),
                  money(Number(a.charged) - Number(a.paid)),
                  <div className="row-actions">
                    {can("billing.write") && (
                      <button
                        className="button tiny"
                        onClick={() => void pay(a)}
                      >
                        {english ? "Payment" : "دفع"}
                      </button>
                    )}
                    <button
                      className="button tiny"
                      onClick={() => {
                        setInvoiceId(a.id);
                        setInvoiceRevision((value) => value + 1);
                      }}
                    >
                      {t("كل التفاصيل")}
                    </button>
                    {can("patients.read") && (
                      <button
                        className="button tiny"
                        onClick={() =>
                          openPatient(a.patient_id, a.id, "billing")
                        }
                      >
                        {t("فتح الحساب")}
                      </button>
                    )}
                    <button
                      className="button tiny primary"
                      disabled={!can("print")}
                      onClick={() => print("invoice", a.id)}
                    >
                      <Printer size={14} />
                      {t("طباعة الفاتورة")}
                    </button>
                  </div>,
                ])}
              />
            </Section>
          )}
          {invoiceLoading && (
            <div className="loading" role="status">
              {t("جارٍ تحميل تفاصيل الإقامة المالية…")}
            </div>
          )}
          {invoiceError && (
            <div className="error-box" role="alert">
              {invoiceError}
              <button
                className="button small"
                onClick={() => setInvoiceRevision((value) => value + 1)}
              >
                {t("إعادة المحاولة")}
              </button>
            </div>
          )}
          {shownInvoice && !invoiceLoading && (
            <InvoiceDetails
              key={shownInvoice.admission.id}
              detail={shownInvoice}
              userRole={userRole}
              can={can}
              print={print}
              openPatient={openPatient}
              close={() => setInvoiceId("")}
              setForm={setForm}
              refreshed={() => setInvoiceRevision((value) => value + 1)}
            />
          )}
          {page !== "invoices" && (
            <Section
              title={t("الخزنة وسجل المدفوعات")}
              action={
                page === "treasury" && can("billing.write") ? (
                  <button
                    className="button small"
                    onClick={() =>
                      setForm({
                        title: t("إقفال الوردية المالية"),
                        fields: [
                          field(
                            "reason",
                            t("مرجع الجرد والتسليم / السبب"),
                            "textarea",
                          ),
                        ],
                        sensitive: true,
                        submit: (v) => api("/billing/close", v),
                      })
                    }
                  >
                    {t("إقفال الخزينة")}
                  </button>
                ) : undefined
              }
            >
              <Table
                headers={[t("المرجع"), t("المبلغ"), t("الطريقة"), t("التاريخ")]}
                rows={(data.billing?.payments || [])
                  .filter((p: Row) => {
                    const a =
                      admissions.find((a) => a.id === p.admission_id) || {};
                    return (
                      matches(a) ||
                      searchText(
                        [p.receipt_no, p.reference].join(" "),
                      ).includes(searchText(query))
                    );
                  })
                  .map((p: Row) => [
                    p.receipt_no || p.reference,
                    money(p.amount),
                    paymentMethodLabel(p.method),
                    date(p.created_at, true),
                  ])}
              />
            </Section>
          )}
          {page === "accounts" || page === "billing" ? (
            <>
              <InsuranceCompanies
                can={can}
                openForm={setForm}
                revision={revision}
                userRole={userRole}
              />
              <Prices setForm={setForm} canWrite={can("prices.write")} />
            </>
          ) : null}
        </>
      )}
      {page === "reports" && (
        <>
          <div className="button-row">
            {can("print") && (
              <button className="button" onClick={() => print("reports")}>
                <Printer size={16} /> {t("طباعة التقرير")}{" "}
              </button>
            )}
            {can("export") && (
              <button className="button" onClick={() => exportData("patients")}>
                <Download size={16} /> {t("تصدير الإقامات CSV")}{" "}
              </button>
            )}
          </div>
          <Section
            title={t("المؤشرات التشغيلية والمالية")}
            sub={t(
              "مؤشرات محسوبة من السجلات الحالية؛ القيم غير المتاحة لا تُفترض صفرًا",
            )}
          >
            {data.reports?.billing && (
              <div className="patient-metrics three">
                {[
                  ["charged", data.reports.billing.charged],
                  ["paid", data.reports.billing.paid],
                  ["balance", data.reports.billing.balance],
                  ["purchase_expenses", data.reports.billing.purchase_expenses],
                  ["maintenance_expenses", data.reports.billing.maintenance_expenses],
                  ["net_revenue", data.reports.billing.net_revenue],
                ].map(([key, value]) => (
                  <div className="mini-metric" key={String(key)}>
                    <span>{t(reportLabels[String(key)] || String(key))}</span>
                    <strong>{money(value)}</strong>
                  </div>
                ))}
              </div>
            )}
            <ReportValues
              data={Object.fromEntries(
                Object.entries(data.reports || {}).filter(([key]) => key !== "billing"),
              )}
            />
          </Section>
        </>
      )}
      {page === "audit" && (
        <Section
          title={t("سجل التدقيق المحمي")}
          sub={t("سجل الاطلاع والتعديل والاعتماد والطباعة والتصدير")}
        >
          <Table
            headers={[
              t("التوقيت"),
              t("المستخدم"),
              t("الإجراء"),
              t("نوع السجل"),
              t("المعرف"),
            ]}
            rows={(data.audit || []).map((a: Row) => [
              date(a.created_at, true),
              a.user_name || a.actor_name || a.username,
              t(auditLabels[a.action] || a.action),
              t(
                auditLabels[a.entity_type || a.entity] ||
                  a.entity_type ||
                  a.entity,
              ),
              a.entity_id || a.target_id || "—",
            ])}
          />
        </Section>
      )}
    </>
  );
}
function InvoiceDetails({
  userRole,
  detail,
  can,
  print,
  openPatient,
  close,
  setForm,
  refreshed,
}: {
  userRole?: string;
  detail: Row;
  can: OperationsProps["can"];
  print: OperationsProps["print"];
  openPatient: OperationsProps["openPatient"];
  close: () => void;
  setForm: OperationsProps["setForm"];
  refreshed: () => void;
}) {
  const admission = detail.admission;
  const [actionError, setActionError] = useState("");
  const [loadingPrices, setLoadingPrices] = useState(false);
  const currentAdmission = useRef(admission.id);
  useEffect(() => {
    currentAdmission.current = admission.id;
    return () => {
      currentAdmission.current = "";
    };
  }, [admission.id]);
  const addPayment = async () => {
    setActionError("");
    try {
      await createPaymentForm(
        admission,
        setForm,
        refreshed,
        () => currentAdmission.current === admission.id,
      );
    } catch (e) {
      if (currentAdmission.current === admission.id)
        setActionError((e as Error).message);
    }
  };
  async function addService() {
    const requestedAdmission = admission.id;
    setLoadingPrices(true);
    setActionError("");
    try {
      const prices: Row[] = await api("/prices");
      if (currentAdmission.current !== requestedAdmission) return;
      setForm({
        title: t("تسجيل خدمة للإقامة {admission}", {
          admission: admission.admission_no,
        }),
        fields: [
          field("price_id", t("الخدمة والسعر"), "text", true, {
            options: prices
              .filter((price) => !price.consumable_id)
              .map((price) => ({
                value: price.id,
                label: price.name + " — " + money(price.price),
              })),
          }),
          field("quantity", t("الكمية"), "number", true, {
            min: 0.01,
            value: 1,
          }),
        ],
        submit: async (value) => {
          const result = await api(
            `/admissions/${admission.id}/charges`,
            value,
          );
          refreshed();
          return result;
        },
      });
    } catch (error) {
      if (currentAdmission.current === requestedAdmission)
        setActionError((error as Error).message);
    } finally {
      if (currentAdmission.current === requestedAdmission)
        setLoadingPrices(false);
    }
  }
  return (
    <Section
      title={t("تفاصيل الفاتورة")}
      sub={`${detail.invoice_no} · ${admission.patient_name} · ${admission.admission_no}`}
      action={
        <div className="row-actions">
          <button
            className="button primary small"
            disabled={!can("print")}
            onClick={() => print("invoice", admission.id)}
          >
            <Printer size={15} />
            {t("طباعة بباركود")}
          </button>
          <button className="button small" onClick={close}>
            {t("إغلاق التفاصيل")}
          </button>
        </div>
      }
    >
      <div className="detail-grid">
        {[
          [t("الطفل"), admission.patient_name],
          [t("رقم الملف"), admission.mrn],
          [t("رقم الإقامة"), admission.admission_no],
          [t("ولي الأمر"), admission.guardian_name],
          [t("الهاتف"), admission.guardian_phone],
          [t("تاريخ الدخول"), date(admission.admitted_at, true)],
          [t("حالة الإقامة"), t(labels[admission.status] || admission.status)],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>{value || "—"}</strong>
          </div>
        ))}
      </div>
      <div className="button-row">
        {can("billing.write") && (
          <button className="button primary small" onClick={addPayment}>
            {t("تسجيل دفعة")}
          </button>
        )}
        {can("billing.write") && admission.status === "active" && (
          <button
            className="button small"
            onClick={() => void addService()}
            disabled={loadingPrices}
          >
            {t("تسجيل خدمة")}
          </button>
        )}
        {can("patients.read") && (
          <button
            className="button small"
            onClick={() =>
              openPatient(admission.patient_id, admission.id, "billing")
            }
          >
            {t("فتح حساب هذه الإقامة")}
          </button>
        )}
        {can("patients.read") && can("consumables.read") && (
          <button
            className="button small"
            onClick={() =>
              openPatient(admission.patient_id, admission.id, "consumables")
            }
          >
            {t("مستهلكات هذه الإقامة")}
          </button>
        )}
      </div>
      {actionError && (
        <div className="error-box" role="alert">
          {actionError}
        </div>
      )}
      <h4 className="panel-subtitle">{t("الخدمات والمستهلكات")}</h4>
      <Table
        headers={[
          t("البند"),
          t("المصدر"),
          t("الكمية"),
          t("سعر الوحدة"),
          t("الإجمالي"),
          t("التاريخ"),
        ]}
        rows={(detail.charges || []).map((charge: Row) => [
          charge.name,
          charge.source === "consumable"
            ? t("مستهلك")
            : charge.source === "equipment"
              ? getLanguage() === "en"
                ? "Equipment usage"
                : "استخدام جهاز"
              : t("خدمة"),
          fmt(charge.quantity),
          money(charge.unit_price),
          money(charge.amount),
          date(charge.created_at, true),
        ])}
      />
      <h4 className="panel-subtitle">{t("تفاصيل المستهلكات والتشغيلات")}</h4>
      <Table
        headers={[
          t("المستهلك"),
          t("الكمية"),
          t("سعر الوحدة"),
          t("الإجمالي"),
          t("التشغيلات"),
          t("المنفذ"),
        ]}
        rows={(detail.consumables || []).map((item: Row) => [
          item.name,
          `${fmt(item.quantity)} ${item.unit}`,
          money(item.unit_price),
          money(item.amount),
          item.batches || "—",
          item.actor_name,
        ])}
      />
      <h4 className="panel-subtitle">{t("المدفوعات")}</h4>
      <Table
        headers={[
          t("رقم الإيصال"),
          t("المبلغ"),
          t("الطريقة"),
          t("التاريخ"),
          t("الإجراءات"),
        ]}
        rows={(detail.payments || []).map((payment: Row) => [
          payment.receipt_no,
          money(payment.amount),
          <Badge value={payment.method} />,
          date(payment.created_at, true),
          <button
            className="button tiny"
            disabled={!can("print")}
            onClick={() => print("receipt", admission.id, payment.id)}
          >
            <Printer size={14} />
            {t("إيصال")}
          </button>,
        ])}
      />
      <div className="patient-metrics three">
        {[
          ["charged", "إجمالي الفاتورة"],
          ["paid", "المحصّل"],
          ["balance", "المتبقي"],
        ].map(([key, label]) => (
          <div className="mini-metric" key={key}>
            <span>{t(label)}</span>
            <strong>{money(detail.totals?.[key])}</strong>
          </div>
        ))}
      </div>
      <AdmissionInsurance
        admissionId={admission.id}
        can={can}
        openForm={setForm}
        revision={0}
        onSaved={refreshed}
        userRole={userRole}
      />
    </Section>
  );
}
const auditLabels: Row = {
  read_request: "طلب اطلاع",
  api: "واجهة النظام",
  POST: "تسجيل إجراء",
  PATCH: "تعديل سجل",
  PUT: "تحديث سجل",
  DELETE: "حذف مخول",
  session: "الجلسة",
  security: "أمان الحساب",
  admit: "قبول طفل",
  transfer: "نقل سرير",
  discharge: "خروج طبي",
  mfa_setup: "إعداد مصادقة إضافية",
  mfa_enabled: "تفعيل المصادقة الإضافية",
  mfa_disabled: "إيقاف المصادقة الإضافية",
  sessions_revoked: "إنهاء الجلسات",
  rotate_secret: "تدوير مفتاح الجهاز",
  device_import: "استيراد من جهاز الحضور",
  seed: "تهيئة بيانات التدريب",
  stock_movements: "حركات المخزون",
  cash_closures: "إقفالات الخزينة",
  bed_movements: "حركات الأسرة",
  prices: "أسعار الخدمات",
  read: "اطلاع",
  create: "إنشاء",
  update: "تعديل",
  approve: "اعتماد",
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  print: "طباعة",
  export: "تصدير",
  patients: "الأطفال",
  admissions: "الإقامات",
  beds: "الأسرة",
  orders: "الأوامر الطبية",
  administrations: "تنفيذ الأدوية",
  vitals: "القياسات",
  labs: "التحاليل",
  notes: "الملاحظات",
  feedings: "التغذية",
  milk: "عبوات اللبن",
  handovers: "تسليم النوبات",
  tasks: "المهام",
  charges: "الخدمات المالية",
  payments: "المدفوعات",
  inventory: "المخزون",
  records: "السجلات الإدارية",
  users: "المستخدمون",
  roles: "الأدوار",
  settings: "الإعدادات",
  reports: "التقارير",
  dashboard: "لوحة التحكم",
  attachments: "المرفقات",
  attendance: "الحضور",
  hr_employees: "الموظفون",
  attendance_devices: "أجهزة الحضور",
  attendance_shifts: "نوبات الحضور",
  attendance_punches: "بصمات الحضور",
  payroll_periods: "فترات الرواتب",
};
const reportLabels: Row = {
  active: "الإقامات الحالية",
  discharged: "الإقامات المنتهية",
  avg_stay_days: "متوسط مدة الإقامة (أيام)",
  avg_stay: "متوسط مدة الإقامة (أيام)",
  tasks: "المهام",
  status: "الحالة",
  count: "العدد",
  room: "الغرفة",
  low_stock: "الأصناف تحت الحد الأدنى",
  name: "الصنف",
  quantity: "الرصيد",
  min_quantity: "الحد الأدنى",
  unit: "الوحدة",
  from: "بداية الفترة",
  to: "نهاية الفترة",
  occupied: "الأسرة المشغولة",
  available: "الأسرة المتاحة",
  total: "الأسرة المادية",
  operational: "الأسرة التشغيلية",
  revenue: "قيمة الخدمات",
  received: "المحصّل",
  outstanding: "المستحق",
  average_stay_days: "متوسط الإقامة بالأيام",
  admissions: "الإقامات",
  period: "الفترة",
  updated_at: "آخر تحديث",
  occupancy_rate: "نسبة الإشغال",
  admissions_today: "دخول اليوم",
  discharges_today: "خروج اليوم",
  pending_labs: "تحاليل معلقة",
  overdue_tasks: "مهام متأخرة",
  average_los_days: "متوسط مدة الإقامة (أيام)",
  definitions: "تعريفات المؤشرات",
  stats: "المؤشرات",
  billing: "الحسابات",
  by_status: "حسب الحالة",
  occupancy: "الإشغال",
  inventory: "المخزون",
  financial: "مالي",
  quality: "جودة",
  charged: "قيمة الخدمات",
  paid: "المحصّل",
  balance: "المستحق",
  purchase_expenses: "مصروفات شراء المخزون",
  maintenance_expenses: "مصروفات الصيانة",
  net_revenue: "صافي الإيراد بعد المصروفات",
};
function ReportValues({ data, context = "" }: { data: Row; context?: string }) {
  return (
    <>
      {Object.entries(data).map(([k, v]) =>
        typeof v !== "object" || v === null ? (
          <div className="report-value" key={k}>
            <span>
              {t(
                k === "total" && context === "admissions"
                  ? "إجمالي الإقامات"
                  : reportLabels[k] || k,
              )}
            </span>
            <strong>
              {typeof v === "number" ||
              (typeof v === "string" &&
                ["avg_stay_days", "charged", "paid", "balance", "purchase_expenses", "maintenance_expenses", "net_revenue"].includes(k) &&
                Number.isFinite(Number(v)))
                ? fmt(v)
                : v === null
                  ? t("غير متاح")
                  : ["updated_at", "to"].includes(k) ||
                      (k === "from" && /^\d{4}-/.test(String(v)))
                    ? date(v, true)
                    : context === "definitions" || k === "from"
                      ? t(String(v))
                      : String(v)}
            </strong>
          </div>
        ) : (
          <div className="panel-pad" key={k}>
            <h4>{t(reportLabels[k] || k)}</h4>
            {Array.isArray(v) ? (
              <Table
                headers={
                  v.length
                    ? Object.keys(v[0]).map((x) =>
                        t(reportLabels[x] || labels[x] || x),
                      )
                    : []
                }
                rows={v.map((r: Row) =>
                  Object.entries(r).map(([column, x]) =>
                    column === "status" ? (
                      <Badge value={x} />
                    ) : typeof x === "number" ? (
                      fmt(x)
                    ) : typeof x === "object" ? (
                      JSON.stringify(x)
                    ) : (
                      String(x ?? "—")
                    ),
                  ),
                )}
              />
            ) : (
              <ReportValues data={v} context={k} />
            )}
          </div>
        ),
      )}
    </>
  );
}
export function SettingsPage({
  canManage,
  data,
  setForm,
  navigate,
  notify,
  refresh,
}: {
  canManage: boolean;
  data: Row;
  setForm: (f: FormSpec) => void;
  navigate: (p: string) => void;
  notify: (m: string, e?: boolean) => void;
  refresh: () => void;
}) {
  const language = useLanguage();
  return (
    <>
      <Section
        title={t("لغة الواجهة")}
        sub={t(
          "تُطبّق اللغة فورًا على الشاشات والنماذج والمطبوعات، ويُحفظ اختيارك على هذا الجهاز.",
        )}
      >
        <div className="panel-pad">
          <label htmlFor="interface-language">{t("اللغة")}</label>
          <select
            id="interface-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as "ar" | "en")}
            style={{ maxWidth: 360, display: "block", marginTop: 9 }}
          >
            <option value="ar">{t("العربية — Arabic")}</option>
            <option value="en">{t("English — الإنجليزية")}</option>
          </select>
          <p style={{ marginTop: 14, color: "var(--muted)", fontSize: 11 }}>
            {t("أسماء الأطفال والملاحظات والبيانات المدخلة تبقى كما سُجلت.")}
          </p>
        </div>
      </Section>
      {canManage && (
        <>
          <Section
            title={t("هوية المستشفى والمطبوعات")}
            action={
              <button
                className="button primary small"
                onClick={() =>
                  setForm({
                    title: t("تعديل إعدادات المستشفى"),
                    initial: data,
                    fields: [
                      field("name", t("اسم المستشفى")),
                      field("address", t("العنوان"), "text", false),
                      field("phone", t("الهاتف"), "tel", false),
                      field(
                        "reservation_hours",
                        t("انتهاء الحجز المسبق (ساعة)"),
                        "number",
                        true,
                        { min: 1, max: 168 },
                      ),
                    ],
                    submit: (v) => api("/settings", v, "PATCH"),
                  })
                }
              >
                {" "}
                {t("تعديل البيانات")}{" "}
              </button>
            }
          >
            <div className="detail-grid">
              {[
                ["name", t("اسم المستشفى")],
                ["address", t("العنوان")],
                ["phone", t("الهاتف")],
                ["reservation_hours", t("مدة الحجز (ساعة)")],
              ].map(([k, l]) => (
                <div key={k}>
                  <span>{l}</span>
                  <strong>{data[k] || t("غير مسجل")}</strong>
                </div>
              ))}
            </div>
            <div className="panel-pad">
              {data.logo && (
                <img
                  className="hospital-logo"
                  src={data.logo}
                  alt={t("شعار المستشفى")}
                />
              )}
              <label className="button file-label">
                {" "}
                {t("رفع شعار المستشفى")}{" "}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 500000) {
                      notify("الحد الأقصى للشعار 500 كيلوبايت", true);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        await api(
                          "/settings",
                          { logo: reader.result },
                          "PATCH",
                        );
                        notify("تم حفظ الشعار");
                        refresh();
                      } catch (err) {
                        notify((err as Error).message, true);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          </Section>
          <Section
            title={t("إدارة الوصول")}
            sub={t("الصلاحيات تُطبّق على الخادم، وإيقاف المستخدم ينهي جلساته")}
          >
            <div className="panel-pad button-row">
              <button className="button" onClick={() => navigate("users")}>
                <Users size={17} /> {t("المستخدمون والأدوار")}{" "}
              </button>
              <button className="button" onClick={() => navigate("security")}>
                <ShieldCheck size={17} /> {t("أمان الحساب")}{" "}
              </button>
            </div>
          </Section>
        </>
      )}
      {!canManage && (
        <Section title={t("أمان الحساب")}>
          <div className="panel-pad">
            <button className="button" onClick={() => navigate("security")}>
              <ShieldCheck size={17} />
              {t("أمان حسابي")}
            </button>
          </div>
        </Section>
      )}
    </>
  );
}
function Prices({
  setForm,
  canWrite,
}: {
  setForm: (f: FormSpec) => void;
  canWrite: boolean;
}) {
  const [prices, setPrices] = useState<Row[]>([]);
  useEffect(() => {
    api("/prices")
      .then(setPrices)
      .catch(() => {});
  }, []);
  return (
    <Section
      title={t("قوائم أسعار الخدمات")}
      sub={t(
        "السعر الجديد يسري على الخدمات التالية ويحافظ على الأسعار السابقة",
      )}
      action={
        canWrite && (
          <button
            className="button small"
            onClick={() =>
              setForm({
                title: t("إضافة سعر خدمة"),
                fields: [
                  field("name", t("اسم الخدمة")),
                  field("category", t("الفئة")),
                  field("price", t("السعر (ج.م)"), "number", true, { min: 0 }),
                  field("unit", t("الوحدة")),
                  field(
                    "valid_from",
                    t("بداية السريان"),
                    "datetime-local",
                    true,
                    {
                      value: nowInput(),
                    },
                  ),
                ],
                submit: async (v) => {
                  await api("/prices", v);
                  setPrices(await api("/prices"));
                },
              })
            }
          >
            <Plus size={16} /> {t("إضافة سعر")}{" "}
          </button>
        )
      }
    >
      <Table
        headers={[
          t("الخدمة"),
          t("الفئة"),
          t("السعر"),
          t("الوحدة"),
          t("بداية السريان"),
        ]}
        rows={prices.map((p) => [
          p.name,
          p.category,
          money(p.price),
          p.unit,
          date(p.valid_from, true),
        ])}
      />
    </Section>
  );
}
const permissionNames: Record<string, string> = {
  "patients.read": "الاطلاع على ملفات المرضى",
  "patients.write": "تسجيل وتعديل المرضى",
  "beds.write": "إدارة جاهزية الأسرة",
  "clinical.read": "الاطلاع على الرعاية الطبية",
  "clinical.write": "توثيق الرعاية الطبية",
  "clinical.approve": "اعتماد الأوامر الطبية",
  "nursing.write": "توثيق التمريض والتنفيذ",
  "lab.write": "إدارة العينات والنتائج",
  "radiology.read": "الاطلاع على طلبات وتقارير الأشعة",
  "radiology.write": "إدارة تنفيذ الأشعة وتقاريرها",
  "pharmacy.read": "الاطلاع على الوصفات والصرف",
  "pharmacy.write": "صرف الأدوية وربطها بالمخزون والحساب",
  "surgery.read": "الاطلاع على العمليات الجراحية",
  "surgery.write": "إدارة العمليات وتقاريرها",
  "stock.read": "الاطلاع على المخزون",
  "stock.write": "تسجيل حركات المخزون",
  "billing.read": "الاطلاع على الحسابات",
  "billing.write": "تسجيل المعاملات المالية",
  "prices.write": "إدارة أسعار الخدمات",
  "reports.read": "الاطلاع على التقارير",
  print: "الطباعة",
  export: "التصدير",
  "settings.write": "إدارة إعدادات المستشفى",
  "audit.read": "الاطلاع على سجل التدقيق",
  "operations.write": "إدارة سجلات التشغيل",
  "attendance.read": "الاطلاع على حضور الفريق",
  "attendance.self": "الاطلاع على حضوري",
  "attendance.write": "إدارة الحضور والنوبات",
  "attendance.devices": "إدارة أجهزة الحضور",
  "payroll.read": "الاطلاع على الرواتب",
  "payroll.write": "إعداد الرواتب",
  "payroll.approve": "اعتماد وإقفال الرواتب",
};
export function UsersPage({
  users,
  setForm,
}: {
  users: Row[];
  setForm: (f: FormSpec) => void;
}) {
  const [roles, setRoles] = useState<Row[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/roles")
      .then((d) =>
        setRoles(
          Array.isArray(d)
            ? d.map((r: Row) => ({ ...r, role: r.name || r.role }))
            : Object.entries(d).map(([role, permissions]) => ({
                role,
                permissions,
              })),
        ),
      )
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Section
        title={t("حسابات المستخدمين")}
        action={
          <button
            className="button primary small"
            onClick={() =>
              setForm({
                title: t("إضافة مستخدم"),
                fields: [
                  field("name", t("الاسم")),
                  field("username", t("اسم المستخدم")),
                  field("password", t("كلمة المرور"), "password", true, {
                    help: t("8 خانات على الأقل؛ تقبل أرقامًا فقط أو حروفًا أو علامات أو خليطًا منها."),
                  }),
                  field("role", t("الدور"), "text", true, {
                    options: options([
                      "admin",
                      "manager",
                      "doctor",
                      "nurse",
                      "head_nurse",
                      "reception",
                      "accountant",
                      "purchasing",
                      "insurance",
                      "lab",
                      "radiologist",
                      "pharmacist",
                      "stock",
                      "maintenance",
                      "quality",
                    ]),
                  }),
                ],
                submit: (v) => api("/users", v),
              })
            }
          >
            <Plus size={16} /> {t("مستخدم جديد")}{" "}
          </button>
        }
      >
        <Table
          headers={[t("المستخدم"), t("اسم الدخول"), t("الدور"), t("الحالة"), t("الإجراء")]}
          rows={users.map((u) => [
            u.name,
            u.username,
            labels[u.role] || u.role,
            u.active === false ? t("موقوف") : t("نشط"),
            <div className="row-actions">
              <button className="button tiny" onClick={() =>
                setForm({
                  title: t("تعديل حساب") + " " + u.name,
                  note: t("اترك كلمة المرور فارغة للاحتفاظ بها. تغيير كلمة المرور أو الوصول ينهي جلسات هذا الحساب."),
                  initial: u,
                  fields: [
                    field("name", t("الاسم")),
                    field("username", t("اسم المستخدم")),
                    field("role", t("الدور"), "text", true, {
                      value: u.role,
                      options: options([
                        "admin",
                        "manager",
                        "doctor",
                        "nurse",
                        "head_nurse",
                        "reception",
                        "accountant",
                        "purchasing",
                        "insurance",
                        "lab",
                        "radiologist",
                        "pharmacist",
                        "stock",
                        "maintenance",
                        "quality",
                      ]),
                    }),
                    field("active", t("الحساب نشط"), "checkbox", false, {
                      value: u.active !== false,
                    }),
                    field("password", t("كلمة مرور جديدة (اختياري)"), "password", false, {
                      help: t("8 خانات على الأقل؛ تقبل أرقامًا فقط أو حروفًا أو علامات أو خليطًا منها."),
                    }),
                  ],
                  submit: (v) => api("/users/" + u.id, { ...v, version: u.version }, "PATCH"),
                  sensitive: true,
                })
              }>
                {t("تعديل الحساب")}
              </button>
              <button className="button danger tiny" onClick={() =>
                setForm({
                  title: t("حذف حساب المستخدم") + " " + u.name,
                  note: t("إذا كان الحساب مرتبطًا بسجلات تشغيل سيطلب النظام إيقافه بدل حذفه للحفاظ على سجل التدقيق."),
                  fields: [],
                  submit: (v) => api("/users/" + u.id, { ...v, version: u.version }, "DELETE"),
                  sensitive: true,
                  button: t("حذف الحساب"),
                })
              }>
                {t("حذف")}
              </button>
            </div>,
          ])}
        />
      </Section>
      <Section
        title={t("مصفوفة الصلاحيات")}
        sub={t(
          "تعديل صلاحيات الدور يؤثر على مستخدميه؛ الاعتماد الطبي لا يُمنح تلقائيًا لمدير النظام",
        )}
      >
        {error && <div className="error-box">{error}</div>}
        <Table
          headers={[t("الدور"), t("الصلاحيات"), t("الإجراء")]}
          rows={roles.map((r) => [
            labels[r.role || r.name] || r.role || r.name,
            <span
              className="permissions-list"
              style={{
                direction: getLanguage() === "en" ? "ltr" : "rtl",
                fontFamily: "inherit",
              }}
            >
              {(r.permissions || []).map((permission: string) => (
                <span
                  key={permission}
                  title={permission}
                  style={{ display: "inline-block", marginInlineEnd: 10 }}
                >
                  {t(permissionNames[permission] || permission)}
                </span>
              ))}
            </span>,
            <button
              className="button tiny"
              onClick={() =>
                setForm({
                  title: t("صلاحيات الدور:") + " " + (labels[r.role] || r.role),
                  fields: [
                    field(
                      "permissions",
                      t("صلاحيات مفصولة بفاصلة"),
                      "textarea",
                      true,
                      { value: (r.permissions || []).join(", "), wide: true },
                    ),
                  ],
                  submit: (v) =>
                    api(
                      "/roles/" + r.role,
                      {
                        permissions: String(v.permissions)
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                      "PATCH",
                    ),
                  sensitive: true,
                })
              }
            >
              {" "}
              {t("تخصيص")}{" "}
            </button>,
          ])}
        />
      </Section>
    </>
  );
}
export function Security({
  setForm,
  notify,
  revision,
  logout,
}: {
  setForm: (f: FormSpec) => void;
  notify: (m: string, e?: boolean) => void;
  revision: number;
  logout: () => void;
}) {
  const [data, setData] = useState<Row>({}),
    [error, setError] = useState("");
  useEffect(() => {
    api("/security")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [revision]);
  return (
    <Section
      title={t("أمان حسابي")}
      sub={t("مراجعة جلسات المستخدم الحالي وإنهاؤها عند الحاجة")}
    >
      {error && <div className="error-box">{error}</div>}
      <div className="panel-pad">
        <div className="info-box">
          {t("تم إلغاء رمز التحقق الإضافي؛ الدخول باسم المستخدم وكلمة المرور فقط.")}
        </div>
        <div className="button-row">
          <button
            className="button"
            onClick={() =>
              setForm({
                title: t("إنهاء جميع جلساتي"),
                fields: [],
                note: t("ستحتاج إلى تسجيل الدخول من جديد على جميع أجهزتك."),
                submit: async () => {
                  await api("/security/revoke-sessions", {});
                  logout();
                },
                sensitive: true,
              })
            }
          >
            {" "}
            {t("إنهاء الجلسات")}{" "}
          </button>
        </div>
      </div>
      <Table
        headers={[t("بداية الجلسة"), t("انتهاء الصلاحية")]}
        rows={(data.sessions || []).map((s: Row) => [
          date(s.created_at, true),
          date(s.expires_at, true),
        ])}
      />
    </Section>
  );
}
export function Help() {
  return (
    <Section
      title={t("دليل التشغيل السريع")}
      sub={t("دليل إجراءات التشغيل والصلاحيات")}
    >
      <div className="help-grid">
        {[
          [
            t("١"),
            t("الاستقبال والتسكين"),
            t(
              "اختر استقبال طفل جديد، سجّل الهوية وبيانات الولادة ثم سريرًا جاهزًا. يُمنع تعارض السرير والتكرار المحتمل على الخادم.",
            ),
          ],
          [
            t("٢"),
            t("توثيق الرعاية"),
            t(
              "افتح ملف الطفل وتحقق من الهوية الثابتة. يكتب الطبيب أمرًا كمسودة ثم يعتمده المخوّل. التمريض يؤكد رقم السوار قبل توثيق الإعطاء.",
            ),
          ],
          [
            t("٣"),
            t("المعمل والمتابعة"),
            t(
              "دورة الفحص تبدأ بطلب ثم جمع واستلام العينة، فالنتيجة ومراجعتها. النتائج المعلقة لا تختفي بعد الخروج.",
            ),
          ],
          [
            t("٤"),
            t("الحسابات والخروج"),
            t(
              "يرسل الاستقبال طلب الخروج مباشرة دون الرجوع للطبيب. المحاسب يسوي حصة المريض وينهي الإقامة، ثم تنتقل الحضّانة للتنظيف وتبقى مستحقات التأمين على الشركة.",
            ),
          ],
          [
            t("٥"),
            t("المسودات والانقطاع"),
            t(
              "عند تعذر الحفظ تبقى المدخلات في النافذة. أعد المحاولة بنفس المسودة. المسودة ليست تنفيذًا سريريًا مؤكدًا. إغلاق المتصفح يفقد المسودة المحلية.",
            ),
          ],
          [
            t("٦"),
            t("الحساب والصلاحيات"),
            t(
              "استخدم حساب الدور المناسب. مدير النظام لا يعتمد أوامر طبية. يمكن متابعة الإجراءات من سجل التدقيق.",
            ),
          ],
          [
            t("٧"),
            t("القائمة وروابط الإقامة"),
            t(
              "ابحث عن القسم بالعربية أو الإنجليزية من القائمة. فتح الحساب أو المهمة ينقلك إلى إقامة الطفل المختارة؛ زر الرجوع يعيدك للشاشة السابقة، وتحديث الصفحة يحافظ على الرابط.",
            ),
          ],
          [
            t("٨"),
            t("المستهلكات والمخزون والفواتير"),
            t(
              "استلم التشغيلات في المخزون وحدد سعر البيع من المستهلكات. صرف المستهلك للطفل يخصم الرصيد ويضيف قيمته لحساب إقامته تلقائيًا. راجع التفاصيل من الفواتير، والتحصيل والاسترداد من الخزنة.",
            ),
          ],
        ].map(([n, t, p]) => (
          <article key={n}>
            <span>{n}</span>
            <h3>{t}</h3>
            <p>{p}</p>
          </article>
        ))}
      </div>
      <div className="panel-pad info-box">
        {" "}
        {t(
          "التكاملات الخارجية وبوابة ولي الأمر غير متصلة في هذا الإصدار. سجلات التأمين والصيانة والجودة إدارية موثقة، ولا ترسل إلى جهات خارجية.",
        )}{" "}
      </div>
    </Section>
  );
}
export function PrintSheet({ data }: { data: Row }) {
  return (
    <div
      className="print-sheet"
      dir={getLanguage() === "en" ? "ltr" : "rtl"}
      lang={getLanguage()}
    >
      <header>
        {data.hospital?.logo && <img src={data.hospital.logo} />}
        <h1>{data.hospital?.name || t("مستشفى قصر المعادي")}</h1>
        <p>{t("نظام إدارة الحضّانات")}</p>
        <small>
          {data.hospital?.address} · {data.hospital?.phone}
        </small>
      </header>
      <h2>{t("التقرير التشغيلي")}</h2>
      <ReportValues data={data.report || {}} />
      <footer>
        {" "}
        {t("طُبع بواسطة")} {data.user} · {date(data.at, true)}{" "}
        {t("· توقيت القاهرة")}{" "}
      </footer>
    </div>
  );
}
