import { t, getLanguage, getLocale, useLanguage } from "./i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  LoaderCircle,
  AlertCircle,
  Check,
  ChevronLeft,
  Inbox,
} from "lucide-react";
export type Row = Record<string, any>;
export const searchText = (value: any) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[أإآ]/g, "ا")
    .replace(/[\u064b-\u065f\u0640]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
export const uid = () => crypto.randomUUID();
export async function api(
  path: string,
  body?: Row,
  method?: string,
): Promise<any> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: {
      "Accept-Language": getLanguage(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    method: method || (body ? "POST" : "GET"),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response
    .json()
    .catch(() => ({ error: t("تعذّر قراءة استجابة الخادم") }));
  if (!response.ok)
    throw new Error(
      data.error || t("تعذّر إتمام العملية. راجع الاتصال وحاول مجددًا."),
    );
  return data;
}
export const fmt = (value: any) =>
  value === null ||
  value === undefined ||
  value === "" ||
  !Number.isFinite(Number(value))
    ? "—"
    : new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(
        Number(value),
      );
export const money = (value: any) =>
  (value === null ||
  value === undefined ||
  value === "" ||
  !Number.isFinite(Number(value))
    ? "—"
    : new Intl.NumberFormat(getLocale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value))) + (getLanguage() === "en" ? " EGP" : t(" ج.م"));
export function date(value: any, full = false) {
  if (!value) return t("غير مسجل");
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat(getLocale(), {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    ...(full ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
export const nowInput = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const sourceLabels: Row = {
  outpatient: "عيادات خارجية",
  inpatient: "تنويم",
  emergency: "طوارئ",
  icu: "عناية مركزة",
  nicu: "حضّانات",
  general: "رعاية عامة",
  radiologist: "طبيب الأشعة",
  pharmacist: "صيدلي",
  registered: "ملف مسجل",
  active: "مقيم",
  admitted: "مقيم",
  discharged: "خارج",
  available: "متاح",
  occupied: "مشغول",
  reserved: "محجوز",
  cleaning: "تحت التنظيف",
  maintenance: "صيانة",
  out_of_service: "خارج الخدمة",
  draft: "مسودة",
  approved: "معتمد",
  pending: "قيد الانتظار",
  waiting: "قيد الانتظار",
  completed: "مكتمل",
  cancelled: "ملغي",
  stopped: "متوقف",
  suspended: "معلّق",
  collected: "جُمعت العينة",
  received: "تم الاستلام",
  reviewing: "مطابقة الفاتورة",
  fulfilled: "تم الصرف",
  converted_to_purchase: "تحوّل إلى شراء",
  rejected: "مرفوض",
  resulted: "ظهرت النتيجة",
  reviewed: "تمت المراجعة",
  open: "مفتوح",
  closed: "مغلق",
  male: "ذكر",
  female: "أنثى",
  blood_unknown: "غير معروف",
  delivery_unknown: "غير معروف",
  delivery_normal: "ولادة طبيعية",
  delivery_cesarean: "ولادة قيصرية",
  delivery_assisted: "ولادة بمساعدة",
  urgent: "عاجل",
  routine: "عادي",
  high: "عالية",
  critical: "حرجة",
  normal: "اعتيادية",
  none_known: "لا توجد حساسية معروفة",
  none: "لا توجد حساسية معروفة",
  unknown: "الحساسية غير موثقة",
  known: "حساسية مسجلة",
  medication: "دواء",
  feeding: "تغذية",
  procedure: "إجراء",
  acknowledged: "مستلم",
  admin: "مدير النظام",
  manager: "مدير القسم",
  doctor: "طبيب",
  nurse: "ممرض",
  head_nurse: "رئيس التمريض",
  reception: "الاستقبال",
  accountant: "المحاسب",
  purchasing: "مسؤول المشتريات",
  lab: "المعمل",
  stock: "المخزون",
  quality: "الجودة",
  maintenance_role: "الصيانة",
  insurance: "التأمين",
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل",
  receive: "استلام",
  issue: "صرف",
  waste: "إتلاف",
  return: "مرتجع",
  breast_milk: "لبن الأم",
  formula: "لبن صناعي",
  oral: "فموي",
  tube: "أنبوب",
  IV: "وريدي",
  intensive: "عناية مركزة",
  NICU: "عناية مركزة",
  intermediate: "رعاية متوسطة",
};
export const labels: Row = new Proxy(sourceLabels, {
  get: (target, key) =>
    typeof target[String(key)] === "string"
      ? t(target[String(key)])
      : target[String(key)],
});
export function Badge({
  value,
  children,
}: {
  value?: string;
  children?: ReactNode;
}) {
  return (
    <span className={"badge " + (value || "")}>
      {typeof children === "string"
        ? t(children)
        : children || labels[value || ""] || t(value || "غير محدد")}
    </span>
  );
}
export function Empty({
  text = t("لا توجد سجلات حتى الآن"),
  children,
}: {
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <p>{t(text)}</p>
      {children}
    </div>
  );
}
export function Section({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <div>
          <h3>{t(title)}</h3>
          {sub && <p>{t(sub)}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Table({
  headers,
  rows,
  empty = t("لا توجد سجلات"),
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: any; label: string }[];
  searchable?: boolean;
  value?: any;
  min?: number;
  max?: number;
  step?: string;
  wide?: boolean;
  help?: string;
};
export type FormSpec = {
  title: string;
  subtitle?: string;
  fields: Field[];
  submit: (values: Row) => Promise<any>;
  initial?: Row;
  button?: string;
  sensitive?: boolean;
  note?: string;
  preview?: (values: Row) => ReactNode;
};
function SearchableSelect({
  field: f,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (value: string) => void;
}) {
  const selected=(f.options||[]).find(o=>String(o.value)===String(value));
  const [query, setQuery] = useState(selected?t(selected.label):"");
  const searchable = f.searchable || (f.options?.length || 0) > 10;
  useEffect(()=>{const match=(f.options||[]).find(o=>String(o.value)===String(value));if(match)setQuery(t(match.label))},[value,f.options]);
  const listId=`options-${f.name.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  if(searchable)return <>
    <input type="text" name={f.name} list={listId} value={query} required={f.required}
      autoComplete="off" placeholder={getLanguage()==="en"?"Type a name to choose…":"اكتب الاسم للاختيار…"}
      onChange={e=>{const next=e.target.value;setQuery(next);const match=(f.options||[]).find(o=>searchText(t(o.label))===searchText(next)||String(o.value)===next);onChange(match?String(match.value):"")}}/>
    <datalist id={listId}>{(f.options||[]).map(o=><option key={o.value} value={t(o.label)}/>)}</datalist>
  </>;
  return (
    <>
      <select
        name={f.name}
        value={value}
        required={f.required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("اختر…")}</option>
        {(f.options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ))}
      </select>
    </>
  );
}
export function FormModal({
  spec,
  onClose,
  onSaved,
}: {
  spec: FormSpec;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();
  const [values, setValues] = useState<Row>(() => ({
    ...Object.fromEntries(
      spec.fields.map((f) => [
        f.name,
        f.value ?? (f.type === "checkbox" ? false : ""),
      ]),
    ),
    ...spec.initial,
  }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(uid());
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    dialog.current
      ?.querySelector<HTMLInputElement>("input,select,textarea")
      ?.focus();
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  const close = () => {
    if (saving) return;
    if (
      !dirty ||
      confirm(t("توجد تغييرات غير محفوظة. هل تريد مغادرة المسودة؟"))
    )
      onClose();
  };
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && dialog.current) {
        const list = Array.from(
          dialog.current.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea",
          ),
        );
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [dirty, saving]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">
              {error
                ? t("تعذّر الحفظ — المدخلات محفوظة في المسودة")
                : dirty
                  ? t("مسودة غير محفوظة")
                  : t("إدخال جديد")}
            </span>
            <h2 id="form-title">{t(spec.title)}</h2>
            {spec.subtitle && <p>{t(spec.subtitle)}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label={t("إغلاق")}
          >
            <X />
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              spec.sensitive &&
              !confirm(
                t(
                  "تأكيد الإجراء: {title}؟ سيُحفظ الإجراء باسم حسابك في سجل التدقيق.",
                  { title: t(spec.title) },
                ),
              )
            )
              return;
            setSaving(true);
            setError("");
            try {
              const normalized: Row = {
                ...values,
                idempotency_key: key.current,
              };
              for (const f of spec.fields) {
                if (f.type === "number" && normalized[f.name] !== "")
                  normalized[f.name] = Number(normalized[f.name]);
                if (f.type === "datetime-local" && normalized[f.name])
                  normalized[f.name] = new Date(
                    normalized[f.name],
                  ).toISOString();
              }
              await spec.submit(normalized);
              setDirty(false);
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : t("تعذّر الحفظ"));
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="form-body">
            {spec.fields.some((f) => f.type === "datetime-local") && (
              <p className="time-entry-note">
                {t(
                  "إدخال المواعيد بتوقيت جهازك ({zone})؛ تُحفظ كتوقيت عالمي وتُعرض في السجلات بتوقيت القاهرة.",
                  { zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                )}
              </p>
            )}
            {spec.note && (
              <div className="info-box">
                <AlertCircle size={18} />
                {t(spec.note)}
              </div>
            )}
            {error && (
              <div role="alert" className="error-box">
                <AlertCircle size={18} />
                {t(error)}
              </div>
            )}
            <div className="form-grid">
              {spec.fields.map((f) => (
                <label
                  key={f.name}
                  className={
                    (f.wide ? "wide " : "") +
                    (f.type === "checkbox" ? "check-label" : "")
                  }
                >
                  {f.type !== "checkbox" && (
                    <span>
                      {t(f.label)}
                      {f.required && <b className="required"> *</b>}
                    </span>
                  )}
                  {f.options ? (
                    <SearchableSelect
                      field={f}
                      value={values[f.name]}
                      onChange={(value) => {
                        setValues((v) => ({ ...v, [f.name]: value }));
                        setDirty(true);
                      }}
                    />
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={f.name}
                      rows={3}
                      value={values[f.name]}
                      required={f.required}
                      onChange={(e) => {
                        setValues((v) => ({ ...v, [f.name]: e.target.value }));
                        setDirty(true);
                      }}
                    />
                  ) : (
                    <input
                      name={f.name}
                      type={f.type || "text"}
                      value={f.type === "checkbox" ? undefined : values[f.name]}
                      checked={
                        f.type === "checkbox" ? !!values[f.name] : undefined
                      }
                      min={f.min}
                      max={f.max}
                      step={f.step || "any"}
                      required={f.required}
                      onChange={(e) => {
                        setValues((v) => ({
                          ...v,
                          [f.name]:
                            f.type === "checkbox"
                              ? e.target.checked
                              : e.target.value,
                        }));
                        setDirty(true);
                      }}
                    />
                  )}
                  {f.type === "checkbox" && <span>{t(f.label)}</span>}
                  {f.help && <small>{t(f.help)}</small>}
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            {spec.preview && (
              <div className="form-preview">{spec.preview(values)}</div>
            )}
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Check size={18} />
              )}{" "}
              {saving ? t("جارٍ الحفظ…") : t(spec.button || "حفظ السجل")}
            </button>
            <button
              type="button"
              className="button"
              onClick={close}
              disabled={saving}
            >
              {t("إلغاء")}
            </button>
            <small>{t("يُحفظ الإجراء مع هوية المستخدم والتوقيت")}</small>
          </div>
        </form>
      </div>
    </div>
  );
}
export const field = (
  name: string,
  label: string,
  type = "text",
  required = true,
  extra: Partial<Field> = {},
): Field => ({ name, label, type, required, ...extra });
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: labels[value] || value }));
export function ActionLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ChevronLeft size={15} />
    </button>
  );
}
