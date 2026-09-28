import { useEffect, useState } from "react";
import {
  api,
  date,
  field,
  money,
  Section,
  Table,
  type FormSpec,
  type Row,
} from "./shared";
import { useLanguage } from "./i18n";
export default function TreasuryPanel({
  can,
  openForm,
  revision,
}: {
  can: (p: string) => boolean;
  openForm: (f: FormSpec) => void;
  revision: number;
}) {
  const en = useLanguage() === "en",
    tr = (ar: string, eng: string) => (en ? eng : ar);
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api("/treasury")
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [revision, en]);
  const add = () =>
    openForm({
      title: tr("إضافة حساب بنكي", "Add bank account"),
      note: tr(
        "الرصيد الافتتاحي هو رصيد هذا الحساب قبل الحركات المسجلة عليه هنا. هذا تسجيل محاسبي ولا ينفذ تحويلًا في البنك.",
        "Opening balance is the bank balance before transactions recorded here. This records accounting entries; it does not execute a bank transfer.",
      ),
      fields: [
        field("name", tr("اسم الحساب", "Account name")),
        field("bank_name", tr("اسم البنك", "Bank name")),
        field(
          "account_number",
          tr("رقم الحساب / IBAN", "Account number / IBAN"),
          "text",
          false,
        ),
        field(
          "opening_balance",
          tr("الرصيد الافتتاحي", "Opening balance"),
          "number",
          true,
          { min: 0, step: "0.01", value: 0 },
        ),
      ],
      submit: (v) => api("/treasury/accounts", v),
    });
  const deposit = () =>
    openForm({
      title: tr("إيداع نقدي في البنك", "Record cash deposit to bank"),
      note: tr(
        "يخصم المبلغ من الخزنة ويضاف إلى البنك، دون زيادة إيرادات النظام. سجّل الإيداع بعد تنفيذه فعليًا.",
        "Cash decreases and bank balance increases without new revenue. Record only a deposit actually completed.",
      ),
      fields: [
        field(
          "to_account_id",
          tr("حساب البنك المستلم", "Receiving bank account"),
          "text",
          true,
          {
            searchable: true,
            options: (data?.accounts || [])
              .filter((a: Row) => a.kind === "bank" && a.active)
              .map((a: Row) => ({
                value: a.id,
                label: a.name + " · " + a.bank_name,
              })),
          },
        ),
        field("amount", tr("المبلغ", "Amount"), "number", true, {
          min: 0.01,
          max: Number(data?.cash_balance || 0),
          step: "0.01",
        }),
        field("reference", tr("مرجع قسيمة الإيداع", "Deposit slip reference")),
        field("notes", tr("ملاحظات", "Notes"), "textarea", false),
      ],
      sensitive: true,
      submit: (v) =>
        api("/treasury/transfers", { ...v, from_account_id: "cash" }),
    });
  return (
    <Section
      title={tr("أرصدة الخزنة والبنوك", "Cash and bank balances")}
      sub={tr(
        "التحصيل والاسترداد والإيداع ومصروف الصيانة مرتبطون بالحساب المالي.",
        "Collections, refunds, deposits and maintenance expenses update the money account.",
      )}
      action={
        can("billing.write") ? (
          <div className="button-row">
            <button className="button small" onClick={add}>
              {tr("إضافة حساب بنك", "Add bank account")}
            </button>
            <button
              className="button primary small"
              disabled={
                !(data?.accounts || []).some(
                  (a: Row) => a.kind === "bank" && a.active,
                )
              }
              onClick={deposit}
            >
              {tr("إيداع بالبنك", "Deposit to bank")}
            </button>
          </div>
        ) : undefined
      }
    >
      {error && <div className="error-box">{error}</div>}
      <Table
        headers={[
          tr("الحساب", "Account"),
          tr("البنك / الرقم", "Bank / number"),
          tr("الرصيد الافتتاحي", "Opening balance"),
          tr("الرصيد الحالي", "Current balance"),
        ]}
        rows={(data?.accounts || []).map((a: Row) => [
          a.kind === "cash"
            ? tr("الخزنة النقدية الرئيسية", "Main cash account")
            : a.name,
          <div>
            {a.bank_name || "—"}
            <small dir="ltr">{a.account_number}</small>
          </div>,
          money(a.opening_balance),
          <strong>{money(a.balance)}</strong>,
        ])}
      />
      {Number(data?.unallocated?.payment_count) > 0 && (
        <div className="panel-pad info-box">
          {tr(
            "تحصيلات إلكترونية غير موزعة على بنك محدد: ",
            "Electronic collections not assigned to a specific bank: ",
          )}
          {money((data?.unallocated?.by_method || []).reduce((sum: number, item: Row) => sum + Number(item.amount), 0))}
          {tr(
            " — لا تدخل في رصيد أي بنك حتى تتم مراجعتها.",
            " — excluded from individual bank balances pending reconciliation.",
          )}
        </div>
      )}
      {Number(data?.unallocated?.manual_journals?.line_count) > 0 && (
        <div className="panel-pad info-box">
          {tr("قيود نقدية تاريخية بدون خزنة أو بنك محدد: ", "Historical cash journals without an assigned cash or bank account: ")}
          {data?.unallocated?.manual_journals?.line_count}
          {tr(" سطر؛ المدين ", " lines; debit ")}{money(data?.unallocated?.manual_journals?.debit)}
          {tr("، الدائن ", ", credit ")}{money(data?.unallocated?.manual_journals?.credit)}
          {tr("، الصافي ", ", net ")}{money(data?.unallocated?.manual_journals?.total)}
          {tr(". تحتاج مراجعة لتحديد حسابها المالي؛ لم تُضف إلى رصيد حساب بعينه.", ". Reconcile these lines to their money accounts; they are excluded from individual account balances.")}
        </div>
      )}
      <h4 className="panel-subtitle">
        {tr("سجل الإيداعات", "Bank deposit history")}
      </h4>
      <Table
        headers={[
          tr("التاريخ", "Date"),
          tr("من", "From"),
          tr("إلى", "To"),
          tr("المبلغ", "Amount"),
          tr("المرجع", "Reference"),
          tr("المسجل", "Recorded by"),
        ]}
        rows={(data?.transfers || []).map((a: Row) => [
          date(a.created_at, true),
          tr("الخزنة النقدية", "Cash"),
          a.to_account_name,
          money(a.amount),
          a.reference,
          a.actor_name,
        ])}
      />
    </Section>
  );
}
