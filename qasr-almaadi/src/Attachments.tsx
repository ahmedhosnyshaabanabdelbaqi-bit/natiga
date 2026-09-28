import { t, getLanguage, useLanguage } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Download, FileUp, LoaderCircle, RefreshCw } from "lucide-react";
import { api, date, fmt, Section } from "./shared";

type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  actor_id: string;
  created_at: string;
};
type Props = {
  admissionId: string;
  admissionNo: string;
  canUpload: boolean;
  users: { id: string; name: string }[];
  onDraftChange: (dirty: boolean) => void;
};
type Selection = { file: File; mime: string; key: string };
const supported = ["application/pdf", "image/png", "image/jpeg"];
const sizeLabel = (size: number) =>
  size >= 1024 * 1024
    ? `${fmt(size / (1024 * 1024))} ${t("ميجابايت")}`
    : `${fmt(size / 1024)} ${t("كيلوبايت")}`;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(
        new Error(t("تعذّر قراءة الملف من الجهاز. أعد اختياره وحاول مجددًا.")),
      );
    reader.readAsDataURL(file);
  });
}

export default function Attachments({
  admissionId,
  admissionNo,
  canUpload,
  users,
  onDraftChange,
}: Props) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    onDraftChange(!!selection);
  }, [selection, onDraftChange]);
  useEffect(() => () => onDraftChange(false), [onDraftChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    api(`/admissions/${encodeURIComponent(admissionId)}/attachments`)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch((reason) => {
        if (active)
          setLoadError(
            reason instanceof Error
              ? reason.message
              : t("تعذّر تحميل المرفقات"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admissionId, revision]);

  useEffect(() => {
    if (!selection) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [selection]);

  async function upload() {
    if (!selection || uploading) return;
    const chosen = selection;
    setUploading(true);
    setError("");
    setSaved("");
    try {
      const content = await readBase64(chosen.file);
      const result: Attachment = await api(
        `/admissions/${encodeURIComponent(admissionId)}/attachments`,
        {
          name: chosen.file.name,
          mime: chosen.mime,
          content,
          idempotency_key: chosen.key,
        },
      );
      if (!mounted.current) return;
      setRows((current) => [
        result,
        ...current.filter((row) => row.id !== result.id),
      ]);
      setSelection(null);
      if (input.current) input.current.value = "";
      setSaved(t("تم حفظ المرفق وربطه بالإقامة ") + admissionNo);
    } catch (reason) {
      if (mounted.current)
        setError(
          (reason instanceof Error ? reason.message : t("تعذّر رفع الملف")) +
            t(" — الملف المختار محفوظ لإعادة المحاولة."),
        );
    } finally {
      if (mounted.current) setUploading(false);
    }
  }

  async function download(row: Attachment) {
    setDownloading(row.id);
    setError("");
    try {
      const response = await fetch(
        `/api/attachments/${encodeURIComponent(row.id)}/download`,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.error || t("تعذّر تنزيل المرفق. راجع الصلاحيات والاتصال."),
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = row.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error ? reason.message : t("تعذّر تنزيل المرفق"),
        );
    } finally {
      if (mounted.current) setDownloading("");
    }
  }

  return (
    <Section
      title={t("مرفقات الإقامة")}
      sub={t(
        "المستندات مرتبطة بالإقامة {admission} ويُسجّل رفعها وتنزيلها باسم المستخدم.",
        { admission: admissionNo },
      )}
    >
      {canUpload && (
        <form
          className="panel-pad"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <p className="info-box">
            {t(
              "PDF أو PNG أو JPEG، بحد أقصى 5 ميجابايت. يمكن إرفاق مستند متأخر بالإقامة المغلقة.",
            )}
          </p>
          <label htmlFor="admission-attachment">
            {t("اختر مستندًا أو صورة")}
          </label>
          <input
            ref={input}
            id="admission-attachment"
            type="file"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setError("");
              setSaved("");
              if (!file) {
                setSelection(null);
                return;
              }
              const extension = file.name.split(".").pop()?.toLowerCase();
              const mime =
                file.type ||
                (
                  {
                    pdf: "application/pdf",
                    png: "image/png",
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                  } as Record<string, string>
                )[extension || ""];
              if (
                !supported.includes(mime) ||
                file.size === 0 ||
                file.size > 5 * 1024 * 1024
              ) {
                setSelection(null);
                event.target.value = "";
                setError(
                  t(
                    "اختر ملف PDF أو PNG أو JPEG غير فارغ، بحجم لا يتجاوز 5 ميجابايت.",
                  ),
                );
                return;
              }
              setSelection({ file, mime, key: crypto.randomUUID() });
            }}
          />
          {selection && (
            <p>
              {selection.file.name} · {sizeLabel(selection.file.size)}
              {t("· مسودة لم تُحفظ بعد")}
            </p>
          )}
          <div className="button-row">
            <button
              type="submit"
              className="button primary"
              disabled={!selection || uploading}
            >
              {uploading ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <FileUp size={17} />
              )}
              {uploading ? t("جارٍ حفظ المرفق…") : t("رفع وحفظ المرفق")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="info-box">
          {saved}
        </p>
      )}
      {loadError && (
        <div role="alert" className="error-box">
          {loadError}
          <button
            className="button small"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
            {t("إعادة تحميل القائمة")}
          </button>
        </div>
      )}
      {loading ? (
        <p role="status" className="panel-pad">
          {t("جارٍ تحميل المرفقات…")}
        </p>
      ) : rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("اسم المستند")}</th>
                <th>{t("النوع")}</th>
                <th>{t("الحجم")}</th>
                <th>{t("أرفقه")}</th>
                <th>{t("وقت التوثيق / القاهرة")}</th>
                <th>{t("تنزيل")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.mime}</td>
                  <td>{sizeLabel(Number(row.size))}</td>
                  <td>
                    {users.find((user) => user.id === row.actor_id)?.name ||
                      row.actor_id}
                  </td>
                  <td>{date(row.created_at, true)}</td>
                  <td>
                    <button
                      type="button"
                      className="button tiny"
                      onClick={() => void download(row)}
                      disabled={!!downloading}
                      aria-label={`${t("تنزيل")} ${row.name}`}
                    >
                      {downloading === row.id ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : (
                        <Download size={15} />
                      )}
                      {t("تنزيل")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loadError && (
          <p className="panel-pad">
            {t("لا توجد مرفقات محفوظة لهذه الإقامة.")}
          </p>
        )
      )}
    </Section>
  );
}
