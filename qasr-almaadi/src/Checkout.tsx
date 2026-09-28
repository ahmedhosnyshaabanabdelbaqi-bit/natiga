import { useEffect, useState } from "react";
import {
  api,
  date,
  field,
  money,
  searchText,
  Section,
  Table,
  type Row,
  type FormSpec,
} from "./shared";
import { useLanguage } from "./i18n";
type Base = {
  can: (p: string) => boolean;
  openForm: (f: FormSpec) => void;
  revision: number;
  userRole?: string;
};
export function CheckoutStatus({
  admissionId,
  can,
  openForm,
  revision,
  userRole,
  users = [],
}: { admissionId: string; users?: Row[] } & Base) {
  const en = useLanguage() === "en",
    tr = (a: string, b: string) => (en ? b : a);
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    api(`/admissions/${admissionId}/checkout-status`)
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [admissionId, revision, en]);
  const request = () =>
    openForm({
      title: tr(
        "تحويل للحسابات لإنهاء الخروج",
        "Send checkout request to Accounts",
      ),
      subtitle: tr(
        "لا يحتاج الطلب لاعتماد طبي. تظل الإقامة نشطة حتى تسوية الحساب وإنهائها من الحسابات.",
        "No medical clearance is required. The admission remains active until Accounts settles and completes checkout.",
      ),
      fields: [
        field(
          "notes",
          tr("بيان طلب الخروج", "Checkout request notes"),
          "textarea",
          false,
        ),
      ],
      submit: (v) => api(`/admissions/${admissionId}/checkout-request`, v),
    });
  const approve = () =>
    openForm(
      can("clinical.approve")
        ? {
            title: tr("اعتماد الخروج الطبي", "Approve medical clearance"),
            fields: [
              field(
                "summary",
                tr("ملخص الخروج الطبي", "Medical discharge summary"),
                "textarea",
                true,
              ),
              field(
                "discharge_type",
                tr("نوع الخروج", "Discharge type"),
                "text",
                true,
                {
                  value: "routine",
                  options: [
                    {
                      value: "routine",
                      label: tr("خروج عادي", "Routine discharge"),
                    },
                    { value: "transfer", label: tr("تحويل", "Transfer") },
                    {
                      value: "against_advice",
                      label: tr(
                        "بالمخالفة للنصيحة الطبية",
                        "Against medical advice",
                      ),
                    },
                    { value: "death", label: tr("وفاة", "Death") },
                  ],
                },
              ),
              field(
                "followup_at",
                tr("موعد المتابعة", "Follow-up time"),
                "datetime-local",
                false,
              ),
            ],
            sensitive: true,
            submit: (v) =>
              api(`/admissions/${admissionId}/checkout-clearance`, v),
          }
        : {
            title: tr(
              "تسجيل تأكيد الطبيب على الخروج",
              "Record doctor-confirmed clearance",
            ),
            note: tr(
              "يسجل هذا الإجراء باسم موظف الاستقبال مع اسم الطبيب الذي أكد الخروج، ولا يسجل كتوقيع من حساب الطبيب.",
              "This is recorded under the reception user with the confirming doctor identified. It is not submitted as a doctor-signed action.",
            ),
            fields: [
              field(
                "doctor_id",
                tr("الطبيب الذي أكد الخروج", "Doctor who confirmed clearance"),
                "text",
                true,
                {
                  searchable: true,
                  options: users
                    .filter((u) => ["doctor", "manager"].includes(u.role))
                    .map((u) => ({ value: u.id, label: u.name })),
                },
              ),
              field(
                "confirmation_note",
                tr(
                  "بيان التواصل وتأكيد الطبيب",
                  "Communication and doctor confirmation details",
                ),
                "textarea",
                true,
              ),
            ],
            sensitive: true,
            submit: (v) =>
              api(`/admissions/${admissionId}/checkout-clearance`, v),
          },
    );
  const c = data?.clearance;
  return (
    <Section
      title={tr(
        "مسار الخروج والتسليم للحسابات",
        "Checkout and Accounts handover",
      )}
    >
      {error && <div className="error-box">{error}</div>}
      <div className="panel-pad">
        <p>
          {data?.status === "discharged"
            ? tr("تم إنهاء الإقامة.", "Admission completed.")
            : data?.request
              ? tr(
                  "طلب الخروج مسجل لدى الحسابات.",
                  "Checkout request is with Accounts.",
                )
              : tr(
                  "لم يرسل طلب خروج للحسابات بعد.",
                  "No checkout request has been sent to Accounts.",
                )}
        </p>
        {c ? (
          <div className="info-box">
            {tr("اعتماد الطبيب: ", "Medical clearance: ")}
            {c.authority_doctor_name} · {tr("سجله: ", "Recorded by: ")}
            {c.approved_by_name} ·{" "}
            {c.approval_source === "reception_on_behalf"
              ? tr(
                  "الاستقبال بعلم الطبيب",
                  "Reception with doctor confirmation",
                )
              : tr("اعتماد الطبيب نفسه", "Doctor’s own approval")}{" "}
            · {date(c.created_at, true)}
            {c.confirmation_note && <p>{c.confirmation_note}</p>}
          </div>
        ) : (
          <p>
            {tr(
              "لا يوجد اعتماد طبي مسجل، وهو اختياري في مسار الخروج الحالي.",
              "No medical clearance is recorded; it is optional in the current checkout workflow.",
            )}
          </p>
        )}
        {data?.status === "active" && (
          <div className="button-row">
            {can("patients.write") && !data.request && (
              <button className="button primary" onClick={request}>
                {tr("تحويل للحسابات للخروج", "Send to Accounts for checkout")}
              </button>
            )}
            {can("clinical.approve") && (
              <button className="button" onClick={approve}>
                {tr("اعتماد الخروج الطبي", "Record medical clearance")}
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
export function CheckoutQueue({
  can,
  openForm,
  revision,
  openPatient,
}: {
  openPatient: (id: string, admissionId?: string, tab?: string) => void;
} & Base) {
  const en = useLanguage() === "en",
    tr = (a: string, b: string) => (en ? b : a);
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    api("/checkout-requests")
      .then((d) => {
        if (active) {
          setRows(d);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [revision, en]);
  const finalize = (r: Row) =>
    openForm({
      title: tr("إنهاء الإقامة من الحسابات", "Complete admission checkout"),
      subtitle: `${r.patient_name} · ${r.admission_no}`,
      note: tr(
        "حصة المريض مسددة؛ تبقى مستحقات شركة التأمين في حسابها. ستتحول الحضّانة للتنظيف.",
        "Patient share is settled; insurer receivables remain outstanding. The bed will move to cleaning.",
      ),
      fields: [
        field(
          "patient_mrn",
          tr("أعد كتابة رقم ملف الطفل للتحقق", "Re-enter infant MRN to verify"),
          "text",
          true,
          { help: r.mrn },
        ),
        field(
          "recipient",
          tr(
            "اسم مستلم الطفل / جهة التحويل",
            "Receiving guardian / transfer destination",
          ),
        ),
      ],
      sensitive: true,
      submit: (v) =>
        api(`/checkout-requests/${r.id}/finalize`, {
          ...v,
          version: r.version,
        }),
    });
  return (
    <Section
      title={tr(
        "طلبات الخروج المحولة للحسابات",
        "Checkout requests sent to Accounts",
      )}
      sub={tr(
        "طلب الاستقبال وتسوية حصة المريض يسبقان إنهاء الإقامة؛ اعتماد الطبيب اختياري.",
        "Reception request and patient settlement are required; medical clearance is optional.",
      )}
    >
      <div className="panel-pad">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={tr("بحث طلبات الخروج", "Search checkout requests")}
          placeholder={tr(
            "اسم الطفل / رقم الفاتورة / الملف",
            "Infant / invoice / MRN",
          )}
        />
      </div>
      {error && <div className="error-box">{error}</div>}
      <Table
        headers={[
          tr("الطفل / الإقامة", "Infant / admission"),
          tr("الاعتماد", "Clearance"),
          tr("حصة المريض", "Patient due"),
          tr("مستحق التأمين", "Insurer due"),
          tr("الحالة والإجراء", "Status / action"),
        ]}
        rows={rows
          .filter((r) =>
            searchText(
              [
                r.patient_name,
                r.mrn,
                r.admission_no,
                `INV-${r.admission_no}`,
              ].join(" "),
            ).includes(searchText(query)),
          )
          .map((r) => [
            <div>
              <strong>{r.patient_name}</strong>
              <small>
                {r.mrn} · {r.admission_no}
              </small>
            </div>,
            r.clearance ? (
              <div>
                {r.clearance.authority_doctor_name}
                <small>
                  {tr("مسجل بواسطة ", "Recorded by ")}
                  {r.clearance.approved_by_name}
                </small>
              </div>
            ) : (
              tr("ينتظر الاعتماد", "Awaiting clearance")
            ),
            money(r.patient_due),
            money(r.insurance_outstanding),
            <div className="row-actions">
              {can("patients.read") && (
                <button
                  className="button tiny"
                  onClick={() =>
                    openPatient(r.patient_id, r.admission_id, "billing")
                  }
                >
                  {tr("فتح الحساب", "Open account")}
                </button>
              )}
              {r.status === "pending"
                ? can("billing.write") && (
                    <button
                      className="button primary tiny"
                      disabled={Number(r.patient_due) > 0}
                      onClick={() => finalize(r)}
                    >
                      {tr("إنهاء الخروج", "Complete checkout")}
                    </button>
                  )
                : tr("خرج", "Completed")}
            </div>,
          ])}
      />
    </Section>
  );
}
