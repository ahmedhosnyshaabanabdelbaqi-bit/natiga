import { useEffect, useState } from "react";
import { Plus, PackagePlus, Tag, RefreshCw } from "lucide-react";
import {
  api,
  date,
  field,
  fmt,
  type FormSpec,
  type Row,
  Section,
  Table,
  uid,
} from "./shared";
import { useLanguage } from "./i18n";
import "./consumables.css";
type Props = {
  can: (p: string) => boolean;
  openForm: (s: FormSpec) => void;
  notify: (text: string, error?: boolean) => void;
  revision: number;
  refresh: () => void;
  admissionId?: string;
  patientMrn?: string;
  patientName?: string;
};
export default function Consumables({
  can,
  openForm,
  notify,
  revision,
  refresh,
  admissionId,
  patientMrn,
  patientName,
}: Props) {
  const language = useLanguage(),
    tr = (ar: string, en: string) => (language === "en" ? en : ar);
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [patients, setPatients] = useState<Row[]>([]);
  const cash = (v: any) =>
    v === null || v === undefined
      ? "—"
      : new Intl.NumberFormat(language === "en" ? "en-GB" : "ar-EG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Number(v)) + tr(" ج.م", " EGP");
  const qty = (value: any) => new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'ar-EG', { maximumFractionDigits: 3 }).format(Number(value));
  useEffect(() => {
    let alive = true;
    setData(null);
    api(
      "/consumables" +
        (admissionId ? "?admission_id=" + encodeURIComponent(admissionId) : ""),
    )
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message));
    if (!admissionId && can("consumables.use") && can("patients.read"))
      api("/patients")
        .then(
          (d) => alive && setPatients(Array.isArray(d) ? d : d.patients || []),
        )
        .catch(() => alive && setPatients([]));
    return () => {
      alive = false;
    };
  }, [revision, admissionId, language]);
  const done = () => {
    refresh();
    notify(
      tr(
        "تم حفظ العملية",
        "Operation saved",
      ),
    );
  };
  function create() {
    openForm({
      title: tr("إضافة مستهلك", "Add consumable"),
      fields: [
        field("sku", tr("كود المستهلك", "Item code"), "text", true),
        field("name", tr("الاسم", "Name"), "text", true),
        field("unit", tr("الوحدة", "Unit"), "text", true),
        ...(can("prices.write")
          ? [
              field(
                "price",
                tr(
                  "سعر البيع للوحدة (اختياري)",
                  "Unit selling price (optional)",
                ),
                "number",
                false,
                { min: 0, step: "0.01" },
              ),
            ]
          : []),
      ],
      submit: async (v) => {
        await api("/consumables", v);
        done();
      },
    });
  }
  function price(c: Row) {
    openForm({
      title: tr("تحديد سعر المستهلك", "Set consumable price"),
      subtitle: c.name,
      note: tr(
        "يسري السعر فور الحفظ. تبقى الرسوم السابقة بسعرها وقت الصرف.",
        "Effective immediately. Earlier charges keep their original price.",
      ),
      fields: [
        field(
          "price",
          tr("سعر البيع للوحدة", "Unit selling price"),
          "number",
          true,
          { min: 0, step: "0.01" },
        ),
      ],
      initial: { price: c.unit_price ?? "" },
      submit: async (v) => {
        await api(`/consumables/${c.id}/prices`, {
          price: v.price,
          version: c.version,
          idempotency_key: v.idempotency_key,
        });
        done();
      },
    });
  }
  function receive(c: Row) {
    openForm({
      title: tr("استلام تشغيلة", "Receive batch"),
      subtitle: c.name,
      fields: [
        field("batch", tr("رقم التشغيلة", "Batch number"), "text", true),
        field("quantity", tr("الكمية", "Quantity"), "number", true, {
          min: 0.001,
          step: "0.001",
        }),
        field(
          "cost",
          tr("تكلفة شراء الوحدة", "Unit purchase cost"),
          "number",
          true,
          { min: 0, step: "0.01" },
        ),
        field("expires_at", tr("انتهاء الصلاحية", "Expiry date"), "date", true),
        field("location", tr("موقع التخزين", "Storage location"), "text", true),
        field(
          "min_quantity",
          tr("حد إعادة الطلب", "Reorder threshold"),
          "number",
          false,
          { min: 0 },
        ),
      ],
      submit: async (v) => {
        await api(`/consumables/${c.id}/batches`, v);
        done();
      },
    });
  }
  function consume(c: Row) {
    const active = patients.filter(
      (p) => p.admission_id && p.admission_status === "active",
    );
    openForm({
      title: tr("صرف مستهلك للطفل", "Issue consumable to infant"),
      subtitle: `${c.name} · ${cash(c.unit_price)} / ${c.unit}`,
      note: tr(
        "تُختار التشغيلات الصالحة الأقرب انتهاءً تلقائيًا، ويضاف الإجمالي لحساب الطفل عند الحفظ.",
        "Valid batches with the earliest expiry are selected automatically. The total is added to the infant account when saved.",
      ),
      fields: [
        ...(!admissionId
          ? [
              field("admission_id", tr("الطفل", "Infant"), "select", true, {
                searchable:true,
                options: active.map((p) => ({
                  value: p.admission_id,
                  label: `${p.name} · ${p.mrn}`,
                })),
              }),
            ]
          : []),
        field(
          "patient_mrn",
          tr(
            "أعد إدخال رقم الملف للتحقق",
            "Re-enter medical record number to verify",
          ),
          "text",
          true,
          {
            help: admissionId
              ? `${patientName || ""} · ${patientMrn || ""}`
              : undefined,
          },
        ),
        field("quantity", tr("الكمية", "Quantity"), "number", true, {
          min: 0.001,
          max: Number(c.available_quantity),
          step: "0.001",
        }),
        field(
          "reason",
          tr("ملاحظة الصرف (اختياري)", "Issue note (optional)"),
          "textarea",
          false,
        ),
      ],
      initial: { quantity: 1 },
      submit: async (v) => {
        await api(`/admissions/${admissionId || v.admission_id}/consumables`, {
          consumable_id: c.id,
          quantity: v.quantity,
          patient_mrn: v.patient_mrn,
          expected_price_id: c.price_id,
          reason: v.reason,
          idempotency_key: v.idempotency_key,
        });
        done();
      },
    });
  }
  async function toggle(c: Row) {
    try {
      await api(
        `/consumables/${c.id}`,
        { active: !c.active, version: c.version, idempotency_key: uid() },
        "PATCH",
      );
      refresh();
      notify(tr("تم تحديث حالة المستهلك", "Consumable status updated"));
    } catch (e: any) {
      notify(e.message, true);
    }
  }
  if (!can("consumables.read")) return null;
  if (error)
    return (
      <div className="panel">
        {error}
        <button className="button small" onClick={refresh}>{tr("إعادة المحاولة", "Retry")}</button>
      </div>
    );
  if (!data)
    return (
      <div className="panel">
        {tr("جارٍ تحميل المستهلكات…", "Loading consumables…")}
      </div>
    );
  const catalog = data.catalog.filter((c: Row) =>
    `${c.name} ${c.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="consumables-module">
      <Section
        title={tr("المستهلكات الطبية", "Medical consumables")}
        sub={
          admissionId
            ? `${patientName || ""} · ${patientMrn || ""}`
            : tr(
                "أصناف وأسعار وتشغيلات وصرف مرتبط بحساب الطفل",
                "Catalog, prices, batches and infant account charges",
              )
        }
        action={
          <div className="consumable-actions">
            <button className="button small" onClick={refresh} aria-label={tr("تحديث", "Refresh")}>
              <RefreshCw size={16} />
            </button>
            {can("consumables.catalog") && (
              <button className="button primary small" onClick={create}>
                <Plus size={16} />
                {tr("إضافة مستهلك", "Add consumable")}
              </button>
            )}
          </div>
        }
      >
        <div className="consumable-summary">
          <span>
            {tr("الأصناف", "Items")}: {fmt(data.stats.catalog_count)}
          </span>
          <span>
            {tr("تحتاج تسعيرًا", "Need pricing")}:{" "}
            {fmt(data.stats.unpriced_count)}
          </span>
          <span>
            {tr("رصيد منخفض", "Low stock")}: {fmt(data.stats.low_stock_count)}
          </span>
        </div>
        <input
          className="consumable-search"
          aria-label={tr("بحث المستهلكات", "Search consumables")}
          placeholder={tr("ابحث بالاسم أو الكود…", "Search name or code…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Table
          headers={[
            tr("الصنف", "Item"),
            tr("سعر الوحدة", "Unit price"),
            tr("الرصيد الصالح", "Valid stock"),
            tr("التشغيلات", "Batches"),
            tr("الإجراءات", "Actions"),
          ]}
          rows={catalog.map((c: Row) => [
            <div>
              <strong>{c.name}</strong>
              <small>
                {c.sku} · {c.unit}
                {!c.active && " · " + tr("موقوف", "Inactive")}
              </small>
            </div>,
            c.price_id ? cash(c.unit_price) : tr("غير مسعّر", "Not priced"),
            qty(c.available_quantity),
            <details>
              <summary>
                {tr("عرض", "View")} ({c.batches.length})
              </summary>
              {c.batches.map((b: Row) => (
                <div key={b.id}>
                  {b.batch} · {qty(b.quantity)} · {date(b.expires_at)}
                  {b.expired ? " · " + tr("منتهي", "Expired") : ""}
                </div>
              ))}
            </details>,
            <div className="consumable-actions">
              {can("consumables.use") && (
                <button
                  className="button primary small"
                  disabled={
                    !c.active ||
                    !c.price_id ||
                    Number(c.available_quantity) <= 0
                  }
                  onClick={() => consume(c)}
                >
                  <PackagePlus size={15} />
                  {tr("صرف للطفل", "Issue to infant")}
                </button>
              )}
              {can("prices.write") && (
                <button className="button small" onClick={() => price(c)}>
                  <Tag size={15} />
                  {tr("السعر", "Price")}
                </button>
              )}
              {can("stock.write") && (
                <button className="button small" onClick={() => receive(c)}>
                  {tr("استلام", "Receive")}
                </button>
              )}
              {can("consumables.catalog") && (
                <button className="button small" onClick={() => toggle(c)}>
                  {c.active
                    ? tr("إيقاف", "Deactivate")
                    : tr("تفعيل", "Activate")}
                </button>
              )}
            </div>,
          ])}
        />
      </Section>
      <Section
        title={tr("سجل صرف المستهلكات", "Consumable issue history")}
        sub={tr(
          "آخر 500 عملية ضمن نطاق صلاحياتك؛ السعر محفوظ وقت الصرف",
          "Latest 500 issues within your access scope; price saved at issue time",
        )}
      >
        <Table
          headers={[
            tr("التوقيت", "Time"),
            ...(!admissionId ? [tr("الطفل", "Infant")] : []),
            tr("المستهلك", "Consumable"),
            tr("الكمية", "Quantity"),
            tr("سعر الوحدة", "Unit price"),
            tr("الإجمالي", "Total"),
            tr("المنفّذ", "Recorded by"),
          ]}
          rows={data.history.map((h: Row) => [
            date(h.created_at, true),
            ...(!admissionId ? [`${h.patient_name} · ${h.mrn}`] : []),
            <div>
              {h.name}
              <small>
                {h.batches
                  .map((b: Row) => `${b.batch} × ${qty(b.quantity)}`)
                  .join("، ")}
              </small>
            </div>,
            `${qty(h.quantity)} ${h.unit}`,
            cash(h.unit_price),
            cash(h.amount),
            h.actor_name,
          ])}
        />
      </Section>
    </div>
  );
}
