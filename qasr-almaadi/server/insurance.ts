import { all, one, type Database } from "./db.js";
import {
  admission,
  billingFor,
  mutate,
  permit,
  requireKey,
  scopeSql,
  uid,
  versioned,
  wrap,
  type Req,
  type RouteContext,
} from "./context.js";
import {
  ApiError,
  choice,
  number,
  required,
  sessionToken,
} from "./security.js";
import { insert } from "./seed.js";
import { insuranceFor } from "./insurance-data.js";
import { lockCashLedger, resolveMoneyAccount } from "./treasury.js";

export function currencyAmount(value: unknown, label = "المبلغ", min = 0.01) {
  const amount = number(value, label, min);
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
    throw new ApiError(400, "المبلغ يقبل منزلتين عشريتين فقط");
  return Math.round(amount * 100) / 100;
}
export function paymentFields(body: any) {
  if (body.method === "insurance")
    throw new ApiError(
      409,
      "التأمين مديونية على الشركة؛ سجل مطالبة ثم التحصيل الفعلي",
      "INSURANCE_CLAIM_REQUIRED",
    );
  const method = choice(
    body.method,
    ["cash", "card", "transfer", "wallet", "instapay"],
    "طريقة الدفع",
  );
  const reference = ["wallet", "instapay"].includes(method)
    ? required(body.reference, "مرجع العملية")
    : optional(body.reference);
  return { method, reference, notes: optional(body.notes) };
}
function optional(value: any) {
  return value === null || value === undefined || value === ""
    ? null
    : required(value, "البيان");
}
function writeInsurance(r: Req) {
  if (
    r.user.role === "insurance" &&
    r.user.permissions.includes("operations.write")
  )
    return;
  permit(r, "billing.write");
}
async function lockAdmission(db: Database, r: Req, id: string) {
  await db.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [id]);
  return admission(db, r, id, false);
}
export function insuranceRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/insurance-companies",
    wrap(async (r, s) => {
      permit(r, "billing.read");
      s.json(
        await all(db, "SELECT * FROM insurance_companies ORDER BY name,id"),
      );
    }),
  );
  app.post(
    "/api/insurance-companies",
    wrap(async (r, s) => {
      writeInsurance(r);
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "insurance_companies", async (tx) => {
          const code = required(r.body.code, "كود شركة التأمين").toUpperCase();
          if (
            await one(tx, "SELECT id FROM insurance_companies WHERE code=$1", [
              code,
            ])
          )
            throw new ApiError(409, "كود شركة التأمين مستخدم بالفعل");
          return insert(tx, "insurance_companies", {
            id: uid(),
            code,
            name: required(r.body.name, "اسم شركة التأمين"),
            contract_number: optional(r.body.contract_number),
            contact_name: optional(r.body.contact_name),
            phone: optional(r.body.phone),
            email: optional(r.body.email),
            address: optional(r.body.address),
            terms: optional(r.body.terms),
            created_by: r.user.id,
          });
        }),
      );
    }),
  );
  app.patch(
    "/api/insurance-companies/:id",
    wrap(async (r, s) => {
      writeInsurance(r);
      const fields: Record<string, any> = {};
      for (const key of [
        "name",
        "contract_number",
        "contact_name",
        "phone",
        "email",
        "address",
        "terms",
      ])
        if (r.body[key] !== undefined)
          fields[key] =
            key === "name"
              ? required(r.body[key], "اسم شركة التأمين")
              : optional(r.body[key]);
      if (r.body.active !== undefined) {
        if (typeof r.body.active !== "boolean")
          throw new ApiError(400, "حالة شركة التأمين غير صالحة");
        fields.active = r.body.active;
      }
      if (!Object.keys(fields).length)
        throw new ApiError(400, "أدخل إعدادًا واحدًا على الأقل");
      s.json(
        await mutate(db, r, "insurance_companies", (tx) =>
          versioned(
            tx,
            "insurance_companies",
            String(r.params.id),
            r.body.version,
            fields,
          ),
        ),
      );
    }),
  );
  app.get(
    "/api/admissions/:id/insurance-claims",
    wrap(async (r, s) => {
      permit(r, "billing.read");
      const a = await admission(db, r, String(r.params.id), false);
      const insurance = await insuranceFor(db, a.id, scopeSql(r));
      s.json(insurance);
    }),
  );
  app.post(
    "/api/admissions/:id/insurance-claims",
    wrap(async (r, s) => {
      writeInsurance(r);
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "insurance_claims", async (tx) => {
          const a = await lockAdmission(tx, r, String(r.params.id));
          const company = await one(
            tx,
            "SELECT * FROM insurance_companies WHERE id=$1 AND active=true FOR SHARE",
            [required(r.body.company_id, "شركة التأمين")],
          );
          if (!company)
            throw new ApiError(404, "شركة التأمين غير موجودة أو موقوفة");
          const amount = currencyAmount(r.body.amount);
          const bill = await billingFor(tx, a.id, r);
          if (
            Math.round(amount * 100) > Math.round(bill.totals.patient_due * 100)
          )
            throw new ApiError(
              409,
              "قيمة التغطية تتجاوز المبلغ غير الموزع على المريض",
              "INSURANCE_OVERALLOCATION",
            );
          const result = await insert(tx, "insurance_claims", {
            id: uid(),
            admission_id: a.id,
            company_id: company.id,
            company_snapshot: JSON.stringify(company),
            policy_number: required(r.body.policy_number, "رقم وثيقة التأمين"),
            member_name: optional(r.body.member_name),
            approval_number: optional(r.body.approval_number),
            amount,
            notes: optional(r.body.notes),
            actor_id: r.user.id,
          });
          return {
            ...result,
            collected: 0,
            outstanding: amount,
            collections: [],
          };
        }),
      );
    }),
  );
  app.post(
    "/api/insurance-claims/:id/collections",
    wrap(async (r, s) => {
      permit(r, "billing.write");
      requireKey(r);
      const fields = paymentFields(r.body);
      s.status(201).json(
        await mutate(db, r, "payments", async (tx) => {
          await lockCashLedger(tx);
          const preliminary = await one(
            tx,
            "SELECT admission_id FROM insurance_claims WHERE id=$1",
            [r.params.id],
          );
          if (!preliminary)
            throw new ApiError(404, "مطالبة التأمين غير موجودة");
          const a = await lockAdmission(tx, r, preliminary.admission_id);
          const claim = await one(
            tx,
            "SELECT * FROM insurance_claims WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          const collected = await one(
            tx,
            "SELECT COALESCE(sum(amount),0) AS amount FROM payments WHERE insurance_claim_id=$1",
            [claim.id],
          );
          const amount = currencyAmount(r.body.amount);
          if (
            Math.round(amount * 100) >
            Math.round(Number(claim.amount) * 100) -
              Math.round(Number(collected.amount) * 100)
          )
            throw new ApiError(
              409,
              "التحصيل يتجاوز المتبقي على شركة التأمين",
              "INSURANCE_OVERCOLLECTION",
            );
          return insert(tx, "payments", {
            id: uid(),
            receipt_no: `REC-${Date.now()}-${sessionToken().slice(0, 5)}`,
            admission_id: a.id,
            insurance_claim_id: claim.id,
            company_id: claim.company_id,
            company_snapshot: JSON.stringify(claim.company_snapshot),
            amount,
            ...fields,
            ...(await resolveMoneyAccount(
              tx,
              fields.method,
              r.body.money_account_id,
            )),
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
}
