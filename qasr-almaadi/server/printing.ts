import bwipjs from "bwip-js/node";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {existsSync,readFileSync} from 'node:fs';
import { all, one } from "./db.js";
import {
  audit,
  wrap,
  permit,
  admission,
  billingFor,
  type RouteContext,
} from "./context.js";
import { ApiError } from "./security.js";
import { getLocale, systemText, statusText, type Locale } from "./i18n.js";

const escape = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const logoFile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/hospital-logo.png');
const defaultLogo=existsSync(logoFile)?'data:image/png;base64,'+readFileSync(logoFile).toString('base64'):'';
const printDate = (value: unknown, locale: Locale) =>
  value
    ? new Date(String(value)).toLocaleString(locale === 'en' ? 'en-EG' : 'ar-EG', {
        timeZone: "Africa/Cairo",
      })
    : "—";
const printMoney = (value: unknown, locale: Locale) =>
  Number(value || 0).toLocaleString(locale === 'en' ? 'en-EG' : 'ar-EG', {
    style: "currency",
    currency: "EGP",
  });
const barcode = (value: string) =>
  bwipjs.toSVG({
    bcid: "code128",
    text: value,
    scale: 2,
    height: 9,
    includetext: true,
    textxalign: "center",
  });
function stickerPage(locale: Locale, title: string, name: string, sub: string, code: string, note: string) {
  const t = (arabic: string) => systemText(locale, arabic);
  return `<!doctype html><html lang="${locale}" dir="${locale === "en" ? "ltr" : "rtl"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(t(title))}</title><style>@font-face{font-family:Cairo;src:url('/api/print-font') format('woff2');font-weight:200 1000}*{box-sizing:border-box}body{margin:0;background:#edf3f2;font-family:Cairo,Arial,sans-serif;color:#102f35}.toolbar{display:flex;justify-content:center;padding:16px}.toolbar button{border:0;border-radius:8px;background:#087f75;color:#fff;padding:10px 20px;font:700 14px Cairo;cursor:pointer}.sticker{width:50mm;height:30mm;margin:8px auto;background:#fff;border:1px dashed #78918e;padding:1.3mm 1.8mm;text-align:center;overflow:hidden}.sticker strong{display:block;font-size:10pt;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sticker p{margin:.4mm 0;font-size:7pt;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.barcode{direction:ltr;height:12mm;margin:0}.barcode svg{display:block;width:100%;height:12mm}.sticker small{display:block;font-size:6.4pt;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media print{@page{size:50mm 30mm;margin:0}html,body{width:50mm;height:30mm;background:#fff}.toolbar{display:none}.sticker{margin:0;border:0;width:50mm;height:30mm}}</style></head><body><div class="toolbar"><button onclick="window.print()">${escape(t("طباعة الملصق 50×30 مم"))}</button></div><main class="sticker" data-code="${escape(code)}"><strong dir="auto">${escape(name)}</strong><p>${escape(sub)}</p><div class="barcode">${barcode(code)}</div><small>${escape(note)}</small></main></body></html>`;
}
function renderTable(headers: string[], rows: unknown[][], locale: Locale) {
  return `<table><thead><tr>${headers.map((h) => `<th>${escape(systemText(locale, h))}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">${escape(systemText(locale, 'لا توجد بيانات موثقة'))}</td></tr>`}</tbody></table>`;
}
const titles: Record<string, string> = {
  wristband: "سوار تعريف الطفل",
  sample: "ملصق عينة معمل",
  milk: "ملصق لبن الأم",
  nursing: "شيت المتابعة التمريضية",
  orders: "الأوامر الطبية",
  handover: "تسليم النوبة",
  discharge: "ملخص الخروج",
  invoice: "كشف حساب الإقامة",
  receipt: "إيصال تحصيل",
};
export function printingRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/print-font",
    wrap(async (r, s) => {
      permit(r, "print");
      s.sendFile(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          `../node_modules/@fontsource-variable/cairo/files/cairo-${r.query.subset === 'latin' ? 'latin' : 'arabic'}-wght-normal.woff2`,
        ),
      );
    }),
  );
  app.get(
    "/api/print/bed-label",
    wrap(async (r, s) => {
      permit(r, "print");
      const locale = getLocale(r);
      const bedId = String(r.query.bed_id || "");
      if (!bedId) throw new ApiError(400, "رقم الحضّانة مطلوب للطباعة");
      const bed = await one(db, "SELECT * FROM beds WHERE id=$1", [bedId]);
      if (!bed) throw new ApiError(404, "الحضّانة غير موجودة");
      await audit(db, r, "print", "bed-label", bed.id, { template: "bed-label", size_mm: "50x30" });
      s.type("html").send(stickerPage(locale, "ملصق باركود الحضّانة", bed.name, `${bed.room} · ${statusText(locale, bed.status)}`, String(bed.barcode_no).padStart(5, "0"), systemText(locale, bed.care_level === "intensive" ? "عناية مركزة" : "رعاية متوسطة")));
    }),
  );
  app.get(
    "/api/print/:kind",
    wrap(async (r, s) => {
      permit(r, "print");
      const locale = getLocale(r);
      const t = (arabic: string) => systemText(locale, arabic);
      const state = (code: string) => statusText(locale, code);
      const date = (value: unknown) => printDate(value, locale);
      const money = (value: unknown) => printMoney(value, locale);
      const table = (headers: string[], rows: unknown[][]) => renderTable(headers, rows, locale);
      const kind = String(r.params.kind);
      if (!titles[kind]) throw new ApiError(404, "قالب الطباعة غير موجود");
      const admissionId = String(r.query.admission_id || "");
      if (!admissionId) throw new ApiError(400, "رقم الإقامة مطلوب للطباعة");
      const a = await admission(db, r, admissionId, false);
      if (["invoice", "receipt"].includes(kind)) permit(r, "billing.read");
      else if (kind === "sample") {
        if (!r.user.permissions.includes("clinical.read"))
          permit(r, "lab.write");
      } else if (kind === "wristband") permit(r, "patients.read");
      else permit(r, "clinical.read");
      const patient = await one(db, "SELECT * FROM patients WHERE id=$1", [
        a.patient_id,
      ]);
      const hospital = (
        await one(db, "SELECT data FROM settings WHERE id='hospital'")
      ).data;
      if(!hospital.logo)hospital.logo=defaultLogo;
      if (kind === "wristband") {
        await audit(db, r, "print", kind, a.id, { template: kind, size_mm: "50x30", locale }, patient.id);
        return s.type("html").send(stickerPage(locale, titles[kind], patient.name, `${patient.mrn} · ${date(patient.birth_at)}`, String(patient.barcode_no).padStart(5, "0"), `${t("الإقامة")}: ${a.admission_no}`));
      }
      let content = "";
      if (kind === "sample") {
        const lab = await one(
          db,
          "SELECT * FROM labs WHERE id=$1 AND admission_id=$2",
          [r.query.id || "", a.id],
        );
        if (!lab)
          throw new ApiError(404, "اختر طلب التحليل الصحيح لهذه الإقامة");
        content = `<section class="label"><strong dir="auto">${escape(patient.name)} · ${escape(patient.mrn)}</strong><p>${escape(lab.name)} · ${escape(state(lab.priority))}</p><p>${escape(t('وقت الطلب'))} ${escape(date(lab.created_at))}</p><div class="barcode">${barcode(lab.id)}</div><small>${escape(t('تحقق من هوية الطفل قبل جمع العينة'))}</small></section>`;
      }
      if (kind === "milk") {
        const milk = await one(
          db,
          "SELECT * FROM milk WHERE id=$1 AND admission_id=$2",
          [r.query.id || "", a.id],
        );
        if (!milk)
          throw new ApiError(404, "اختر عبوة اللبن الصحيحة لهذه الإقامة");
        content = `<section class="label"><strong dir="auto">${escape(patient.name)} · ${escape(patient.mrn)}</strong><p>${escape(t('الكمية'))} ${escape(milk.quantity)} ${escape(t('مل'))} · ${escape(t('المتبقي'))} ${escape(milk.remaining)} ${escape(t('مل'))}</p><p>${escape(t('الاستلام'))} ${escape(date(milk.received_at))}</p><p>${escape(t('الصلاحية'))} ${escape(date(milk.expires_at))}</p><p>${escape(t('المكان'))} ${escape(milk.location)}</p><div class="barcode">${barcode(milk.id)}</div></section>`;
      }
      if (kind === "nursing") {
        const rows = await all(
          db,
          "SELECT v.*,u.name AS actor_name FROM vitals v LEFT JOIN users u ON u.id=v.actor_id WHERE admission_id=$1 ORDER BY measured_at",
          [a.id],
        );
        content = table(
          [
            "وقت القياس / القاهرة",
            "حرارة °C",
            "نبض / دقيقة",
            "تنفس / دقيقة",
            "SpO₂ %",
            "وزن جم",
            "سكر mg/dL",
            "الصفراء الكلية mg/dL",
            "الصفراء المباشرة mg/dL",
            "طريقة قياس الصفراء",
            "مدخلات مل",
            "مخرجات مل",
            "المنفذ",
          ],
          rows.map((v) => [
            date(v.measured_at),
            v.temperature,
            v.heart_rate,
            v.respiratory_rate,
            v.spo2,
            v.weight,
            v.glucose,
            v.bilirubin_total,
            v.bilirubin_direct,
            v.bilirubin_method ? t(v.bilirubin_method) : "—",
            v.intake,
            v.output,
            v.actor_name,
          ]),
        );
      }
      if (kind === "orders") {
        const rows = await all(
          db,
          "SELECT o.*,u.name AS author,n.name AS approver FROM orders o LEFT JOIN users u ON u.id=o.created_by LEFT JOIN users n ON n.id=o.approved_by WHERE admission_id=$1 ORDER BY created_at",
          [a.id],
        );
        content = table(
          [
            "الأمر",
            "الجرعة / الوحدة",
            "الطريقة والتكرار",
            "التعليمات",
            "الحالة",
            "الكاتب",
            "المعتمد",
            "وقت الاعتماد",
          ],
          rows.map((o) => [
            o.name,
            `${o.dose ?? "—"} ${o.unit || ""}`,
            `${o.route || "—"} / ${o.frequency || "—"}`,
            o.instructions,
            state(o.status),
            o.author,
            o.approver,
            date(o.approved_at),
          ]),
        );
      }
      if (kind === "handover") {
        const rows = await all(
          db,
          "SELECT h.*,u.name AS sender,n.name AS receiver FROM handovers h LEFT JOIN users u ON u.id=h.sender_id LEFT JOIN users n ON n.id=h.receiver_id WHERE admission_id=$1 ORDER BY created_at DESC",
          [a.id],
        );
        content = table(
          [
            "وقت التسليم",
            "الملخص",
            "المتبقي",
            "المسلّم",
            "المستلم",
            "تأكيد الاستلام",
          ],
          rows.map((h) => [
            date(h.created_at),
            h.summary,
            h.pending,
            h.sender,
            h.receiver,
            date(h.acknowledged_at),
          ]),
        );
      }
      if (kind === "discharge") {
        if (a.status !== "discharged")
          throw new ApiError(409, "لم يعتمد خروج الطفل بعد");
        const labs = await all(
          db,
          "SELECT name,status FROM labs WHERE admission_id=$1 AND status NOT IN ('reviewed','rejected')",
          [a.id],
        );
        content = `<h2>${escape(t('ملخص الإقامة وتعليمات المختص'))}</h2><p class="prose" dir="auto">${escape(a.summary)}</p><p>${escape(t('وقت الخروج'))}: ${escape(date(a.discharged_at))}</p><p>${escape(t('الشخص المستلم'))}: ${escape(a.recipient)}</p><p>${escape(t('موعد المتابعة'))}: ${escape(date(a.followup_at))}</p><h2>${escape(t('نتائج تحتاج متابعة'))}</h2>${table(
          ["التحليل", "الحالة"],
          labs.map((l) => [l.name, state(l.status)]),
        )}<p>${escape(t('المسؤول عن المتابعة'))}: ${escape((await one(db, "SELECT name FROM users WHERE id=$1", [a.doctor_id]))?.name)}</p>`;
      }
      if (kind === "invoice") {
        const bill = await billingFor(db, a.id);
        const consumables = await all(db, `SELECT c.*,COALESCE(string_agg(i.batch || ' × ' || sm.quantity::text, '، ' ORDER BY i.expires_at,i.batch),'') AS batches FROM consumptions c LEFT JOIN consumption_movements cm ON cm.consumption_id=c.id LEFT JOIN stock_movements sm ON sm.id=cm.movement_id LEFT JOIN inventory i ON i.id=sm.item_id WHERE c.admission_id=$1 GROUP BY c.id ORDER BY c.created_at`, [a.id]);
        const invoiceNo = `INV-${a.admission_no}`;
        content =
          `<div class="invoice-code"><strong>${escape(t('رقم الفاتورة'))}: ${escape(invoiceNo)}</strong><div class="barcode">${barcode(invoiceNo)}</div></div>` +
          table(
            [
              "البند",
              "الكمية",
              "سعر الوحدة المحفوظ",
              "الإجمالي",
              "تاريخ التوثيق",
              "المصدر",
            ],
            bill.charges.map((c) => [
              c.name,
              c.quantity,
              money(c.unit_price),
              money(c.amount),
              date(c.created_at),
              c.source === 'consumable' ? t('مستهلك') : c.source === 'equipment' ? t('استخدام جهاز') : t('خدمة'),
            ]),
          ) +
          `<h2>${escape(t('تفاصيل المستهلكات'))}</h2>` +
          table(["المستهلك","الكمية","سعر الوحدة المحفوظ","الإجمالي","التشغيلات"], consumables.map(c => [c.name,`${c.quantity} ${c.unit}`,money(c.unit_price),money(c.amount),c.batches])) +
          `<h2>${escape(t('مطالبات شركات التأمين'))}</h2>` +
          table(['شركة التأمين','رقم العقد','رقم الوثيقة','رقم الموافقة','التغطية','المحصل','المتبقي على الشركة'],bill.insurance_claims.map(c=>[c.company_snapshot.name,c.company_snapshot.contract_number,c.policy_number,c.approval_number,money(c.amount),money(c.collected),money(c.outstanding)])) +
          `<div class="totals"><p>${escape(t('الرسوم'))}: ${escape(money(bill.totals.charged))}</p><p>${escape(t('المدفوعات وصافي الاسترداد'))}: ${escape(money(bill.totals.paid))}</p><strong>${escape(t('الرصيد'))}: ${escape(money(bill.totals.balance))}</strong><p>${escape(t('المتبقي على شركات التأمين'))}: ${escape(money(bill.totals.insurance_outstanding))}</p><p>${escape(t('المستحق على المريض'))}: ${escape(money(bill.totals.patient_due))}</p></div><h2>${escape(t('حركات التحصيل'))}</h2>` +
          table(
            ["رقم الإيصال", "التاريخ", "الطريقة", "المبلغ", "شركة التأمين", "المرجع"],
            bill.payments.map((p) => [
              p.receipt_no,
              date(p.created_at),
              state(p.method),
              money(p.amount),
              p.company_snapshot?.name || '',
              p.reference,
            ]),
          );
      }
      if (kind === "receipt") {
        const p = await one(
          db,
          "SELECT p.*,u.name AS actor_name FROM payments p LEFT JOIN users u ON u.id=p.actor_id WHERE p.id=$1 AND p.admission_id=$2",
          [r.query.id || "", a.id],
        );
        if (!p) throw new ApiError(404, "اختر إيصالًا لهذه الإقامة");
        content = `<h2>${escape(p.receipt_no)}</h2>${table(
          ["البيان", "القيمة"],
          [
            [t("المبلغ"), money(p.amount)],
            [t("طريقة الدفع"), state(p.method)],
            [t("المرجع"), p.reference],
            [t("التاريخ"), date(p.created_at)],
            [t("المحاسب"), p.actor_name],
            [t("شركة التأمين"), p.company_snapshot?.name || ''],
            [t("رقم العقد"), p.company_snapshot?.contract_number || ''],
            [t("مطالبة التأمين"), p.insurance_claim_id || ''],
          ],
        )}`;
      }
      await audit(
        db,
        r,
        "print",
        kind,
        a.id,
        { template: kind, item_id: r.query.id || null, locale },
        patient.id,
      );
      s.type("html").send(
        `<!doctype html><html lang="${locale}" dir="${locale === 'en' ? 'ltr' : 'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(t(titles[kind]))} — ${escape(patient.mrn)}</title><style>@font-face{font-family:Cairo;src:url('/api/print-font') format('woff2');font-weight:200 1000}@font-face{font-family:Cairo;src:url('/api/print-font?subset=latin') format('woff2');font-weight:200 1000;unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2191,U+2193}*{box-sizing:border-box}body{font-family:Cairo,Arial,sans-serif;margin:0;color:#143e3e;background:#edf3f2}.page{max-width:1100px;background:white;margin:30px auto;padding:35px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0b7a75;padding-bottom:14px}h1{font-size:21px}h2{font-size:17px}.identity{background:#eff7f6;padding:15px;margin:20px 0;display:flex;gap:25px;flex-wrap:wrap}table{width:100%;border-collapse:collapse;margin:15px 0;font-size:12px}th,td{padding:10px;border:1px solid #d7e4e1;text-align:start}th{background:#edf7f5}td{white-space:pre-wrap}tr{break-inside:avoid}.barcode{direction:ltr;margin:12px 0}.barcode svg{max-width:100%;height:65px}.label{border:1px dashed #557b77;padding:18px;width:420px;max-width:100%;margin:25px auto;text-align:center;break-inside:avoid}.label strong{font-size:20px}.label p{margin:5px 0}.prose{white-space:pre-wrap;line-height:2}.totals{margin:20px 0;background:#f0f8f6;padding:15px}footer{margin-top:30px;border-top:1px solid #ddd;padding-top:15px;font-size:11px;color:#536b68}.toolbar{display:flex;justify-content:center;padding:20px;gap:20px}.toolbar button{background:#087f75;color:white;border:0;border-radius:8px;padding:12px 25px;font-family:inherit;cursor:pointer}.logo{max-width:80px;max-height:70px}@media print{@page{size:A4;margin:12mm}body{background:white}.page{margin:0;padding:0;max-width:none}.toolbar{display:none}thead{display:table-header-group}.identity,header,footer{break-inside:avoid}}</style></head><body><div class="toolbar"><button onclick="window.print()">${escape(t('طباعة / حفظ PDF'))}</button></div><main class="page"><header><div><h1>${escape(hospital.name)} — ${escape(t('نظام إدارة الحضّانات'))}</h1><p>${escape(hospital.address)} · ${escape(hospital.phone)}</p></div>${typeof hospital.logo === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(hospital.logo) ? `<img class="logo" alt="${escape(t('شعار المستشفى'))}" src="${escape(hospital.logo)}">` : ""}</header><h2>${escape(t(titles[kind]))}</h2><div class="identity"><strong>${escape(patient.name)}</strong><span>${escape(t('الملف'))}: ${escape(patient.mrn)}</span><span>${escape(t('الإقامة'))}: ${escape(a.admission_no)}</span>${patient.twin_label ? `<span>${escape(patient.twin_label)}</span>` : ""}</div>${content}<footer>${escape(t('طُبع بواسطة'))} ${escape(r.user.name)} · ${escape(date(new Date().toISOString()))} ${escape(t('بتوقيت القاهرة'))} · ${escape(t('المصدر: السجلات المحفوظة للإقامة'))} · ${escape(t(a.status === "discharged" ? "إقامة مغلقة" : "إقامة نشطة"))}</footer></main></body></html>`,
      );
    }),
  );
}



