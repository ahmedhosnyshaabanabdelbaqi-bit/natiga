import { all, one } from "./db.js";
import { insert } from "./seed.js";
import { paymentFields } from "./insurance.js";
import {
  lockCashLedger,
  resolveMoneyAccount,
  assertMoneyAvailable,
} from "./treasury.js";
import {
  ApiError,
  required,
  choice,
  number,
  date,
  sessionToken,
} from "./security.js";
import {
  wrap,
  permit,
  mutate,
  admission,
  uid,
  requireKey,
  billingFor,
  scopeSql,
  type RouteContext,
} from "./context.js";
function currency(value: unknown, label: string, min = 0) {
  const amount = number(value, label, min);
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
    throw new ApiError(400, "السعر يقبل منزلتين عشريتين فقط");
  return Math.round(amount * 100) / 100;
}
export function financeRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/inventory",
    wrap(async (r, s) => {
      permit(r, "stock.read");
      s.json(await all(db, "SELECT * FROM inventory ORDER BY name,batch"));
    }),
  );
  app.post(
    "/api/inventory",
    wrap(async (r, s) => {
      permit(r, "stock.write");
      s.status(201).json(
        await mutate(db, r, "inventory", async (tx) => {
          const name = required(r.body.name, "اسم الصنف");
          const unit = required(r.body.unit, "الوحدة");
          // Reuse an existing catalog identity without inventing a selling price.
          const matches = await all(
            tx,
            "SELECT id,name,unit FROM consumable_catalog WHERE name=$1 AND unit=$2 ORDER BY id",
            [name, unit],
          );
          let catalog = r.body.consumable_id
            ? await one(
                tx,
                "SELECT id,name,unit FROM consumable_catalog WHERE id=$1",
                [r.body.consumable_id],
              )
            : matches.length === 1
              ? matches[0]
              : null;
          if (
            r.body.consumable_id &&
            (!catalog || catalog.name !== name || catalog.unit !== unit)
          )
            throw new ApiError(
              409,
              "بيانات الصنف لا تطابق دليل المستهلكات",
              "CONSUMABLE_MISMATCH",
            );
          if (!catalog && matches.length > 1)
            throw new ApiError(
              409,
              "يوجد أكثر من مستهلك بنفس الاسم والوحدة؛ اختر الكود من قسم المستهلكات",
              "CONSUMABLE_AMBIGUOUS",
            );
          if (!catalog)
            catalog = await insert(tx, "consumable_catalog", {
              id: uid(),
              sku: `INV-${uid()}`,
              name,
              unit,
            });
          const item = await insert(tx, "inventory", {
            id: uid(),
            consumable_id: catalog?.id || null,
            name,
            unit,
            batch: required(r.body.batch, "التشغيلة"),
            expires_at: date(r.body.expires_at, "انتهاء الصلاحية"),
            quantity: number(r.body.quantity, "الكمية", 0),
            min_quantity: number(r.body.min_quantity ?? 0, "الحد الأدنى", 0),
            cost: number(r.body.cost, "تكلفة الوحدة", 0),
            location: required(r.body.location, "الموقع"),
          });
          if (Number(item.quantity) > 0)
            await insert(tx, "stock_movements", {
              id: uid(),
              item_id: item.id,
              type: "receive",
              quantity: item.quantity,
              reason: "رصيد استلام الصنف",
              cost_snapshot: item.cost,
              actor_id: r.user.id,
            });
          return item;
        }),
      );
    }),
  );
  app.post(
    "/api/inventory/:id/move",
    wrap(async (r, s) => {
      permit(r, "stock.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "stock_movements", async (tx) => {
          if (r.body.admission_id) {
            await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [r.body.admission_id]);
            await admission(tx, r, r.body.admission_id);
          }
          const item = await one(
            tx,
            "SELECT *,expires_at<(now() AT TIME ZONE 'Africa/Cairo')::date AS expired FROM inventory WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!item) throw new ApiError(404, "الصنف غير موجود");
          const type = choice(
              r.body.type,
              ["receive", "issue", "waste", "return"],
              "نوع الحركة",
            ),
            quantity = number(r.body.quantity, "الكمية", 0.0001),
            reason = required(r.body.reason, "سبب الحركة");
          const outgoing = ["issue", "waste"].includes(type);
          if (type === "issue" && item.expired)
            throw new ApiError(409, "لا يمكن صرف تشغيلة منتهية الصلاحية");
          if (outgoing && Number(item.quantity) < quantity)
            throw new ApiError(409, "رصيد التشغيلة غير كافٍ");
          if (r.body.admission_id) {
            await admission(tx, r, r.body.admission_id);
            if (["issue", "return"].includes(type))
              throw new ApiError(
                409,
                "صرف أو إرجاع مستهلك للطفل يتطلب مسار المستهلكات والتسوية المالية",
                "USE_CONSUMABLE_WORKFLOW",
              );
          }
          await tx.query(
            "UPDATE inventory SET quantity=quantity+$1,version=version+1 WHERE id=$2",
            [outgoing ? -quantity : quantity, item.id],
          );
          return insert(tx, "stock_movements", {
            id: uid(),
            item_id: item.id,
            type,
            quantity,
            admission_id: r.body.admission_id || null,
            reason,
            cost_snapshot: item.cost,
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.get(
    "/api/prices",
    wrap(async (r, s) => {
      if (!r.user.permissions.includes("prices.write"))
        permit(r, "billing.read");
      s.json(
        await all(
          db,
          "SELECT p.*,cp.consumable_id FROM prices p LEFT JOIN consumable_prices cp ON cp.price_id=p.id ORDER BY p.valid_from DESC,p.name",
        ),
      );
    }),
  );
  app.post(
    "/api/prices",
    wrap(async (r, s) => {
      permit(r, "prices.write");
      s.status(201).json(
        await mutate(db, r, "prices", async (tx) =>
          insert(tx, "prices", {
            id: uid(),
            name: required(r.body.name, "اسم الخدمة"),
            category: required(r.body.category, "نوع الخدمة"),
            price: currency(r.body.price, "السعر", 0),
            unit: required(r.body.unit, "وحدة الخدمة"),
            valid_from: date(r.body.valid_from, "سريان السعر"),
            created_by: r.user.id,
          }),
        ),
      );
    }),
  );
  app.get(
    "/api/billing",
    wrap(async (r, s) => {
      permit(r, "billing.read");
      const billing = await billingFor(db, undefined, r);
      const rows = await all(
        db,
        `SELECT a.id,a.admission_no,a.patient_id,a.status,a.admitted_at,a.discharged_at,p.name,p.name AS patient_name,p.mrn,COALESCE((SELECT sum(amount) FROM charges c WHERE c.admission_id=a.id),0) AS charged,COALESCE((SELECT sum(amount) FROM payments pp WHERE pp.admission_id=a.id),0) AS paid FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE 1=1${scopeSql(r)} ORDER BY a.admitted_at DESC`,
      );
      for (const row of rows) {
        const outstandingCents = billing.insurance_claims
          .filter((c) => c.admission_id === row.id)
          .reduce((n, c) => n + Math.round(Number(c.outstanding) * 100), 0);
        row.balance =
          (Math.round(Number(row.charged) * 100) -
            Math.round(Number(row.paid) * 100)) /
          100;
        row.insurance_outstanding = outstandingCents / 100;
        row.patient_due =
          (Math.round(row.balance * 100) - outstandingCents) / 100;
      }
      s.json({
        ...billing,
        admissions: rows,
      });
    }),
  );
  app.get(
    "/api/billing/admissions/:id",
    wrap(async (r, s) => {
      permit(r, "billing.read");
      const row = await one(
        db,
        `SELECT a.id,a.admission_no,a.status,a.admitted_at,a.discharged_at,p.id AS patient_id,p.mrn,p.name AS patient_name,p.mother_name,p.guardian_name,p.guardian_phone FROM admissions a JOIN patients p ON p.id=a.patient_id WHERE a.id=$1${scopeSql(r)}`,
        [r.params.id],
      );
      if (!row)
        throw new ApiError(404, "الحساب غير موجود أو خارج نطاق الصلاحية");
      const bill = await billingFor(db, row.id, r);
      const consumables = await all(
        db,
        `SELECT c.id,c.name,c.unit,c.quantity,c.unit_price,c.amount,c.created_at,u.name AS actor_name,COALESCE(string_agg(i.batch || ' × ' || sm.quantity::text, '، ' ORDER BY i.expires_at,i.batch),'') AS batches FROM consumptions c JOIN admissions a ON a.id=c.admission_id LEFT JOIN users u ON u.id=c.actor_id LEFT JOIN consumption_movements cm ON cm.consumption_id=c.id LEFT JOIN stock_movements sm ON sm.id=cm.movement_id LEFT JOIN inventory i ON i.id=sm.item_id WHERE c.admission_id=$1${scopeSql(r)} GROUP BY c.id,u.name ORDER BY c.created_at DESC`,
        [row.id],
      );
      s.json({
        invoice_no: `INV-${row.admission_no}`,
        admission: row,
        ...bill,
        consumables,
      });
    }),
  );
  app.post(
    "/api/admissions/:id/charges",
    wrap(async (r, s) => {
      permit(r, "billing.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "charges", async (tx) => {
          await tx.query('SELECT id FROM admissions WHERE id=$1 FOR UPDATE',[r.params.id]);
          const a = await admission(tx, r, String(r.params.id));
          const price = await one(tx, "SELECT * FROM prices WHERE id=$1", [
            r.body.price_id,
          ]);
          if (!price) throw new ApiError(404, "بند قائمة الأسعار غير موجود");
          if (
            await one(
              tx,
              "SELECT price_id FROM consumable_prices WHERE price_id=$1",
              [price.id],
            )
          )
            throw new ApiError(
              409,
              "سعر المستهلك لا يضاف كبند يدوي؛ استخدم صرف المستهلكات للطفل",
              "USE_CONSUMABLE_WORKFLOW",
            );
          if (new Date(price.valid_from).getTime() > Date.now())
            throw new ApiError(409, "السعر لم يبدأ سريانه بعد");
          const quantity = number(
              r.body.quantity,
              "كمية الخدمة المنفذة",
              0.0001,
            ),
            amount = Math.round(quantity * Number(price.price) * 100) / 100;
          return insert(tx, "charges", {
            id: uid(),
            admission_id: a.id,
            price_id: price.id,
            name: price.name,
            quantity,
            unit_price: price.price,
            amount,
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/payments",
    wrap(async (r, s) => {
      permit(r, "billing.write");
      requireKey(r);
      const fields = paymentFields(r.body);
      if (
        r.body.insurance_claim_id ||
        r.body.company_id ||
        r.body.company_snapshot
      )
        throw new ApiError(
          400,
          "تحصيل التأمين يتطلب مسار المطالبة",
          "INSURANCE_CLAIM_REQUIRED",
        );
      s.status(201).json(
        await mutate(db, r, "payments", async (tx) => {
          await lockCashLedger(tx);
          await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [
            r.params.id,
          ]);
          const a = await admission(tx, r, String(r.params.id), false);
          const amount = currency(r.body.amount, "المبلغ", 0.01),
            bill = await billingFor(tx, a.id, r);
          if (
            bill.totals.insurance_outstanding > 0 &&
            Math.round(amount * 100) > Math.round(bill.totals.patient_due * 100)
          )
            throw new ApiError(
              409,
              "المبلغ يتجاوز المستحق على المريض؛ استخدم تحصيل مطالبة التأمين",
              "INSURANCE_OVERALLOCATION",
            );
          return insert(tx, "payments", {
            id: uid(),
            receipt_no: `REC-${Date.now()}-${sessionToken().slice(0, 5)}`,
            admission_id: a.id,
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
  app.post(
    "/api/payments/:id/refund",
    wrap(async (r, s) => {
      permit(r, "billing.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "payments", async (tx) => {
          await lockCashLedger(tx);
          const p = await one(
            tx,
            "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!p || Number(p.amount) <= 0)
            throw new ApiError(404, "الدفعة الأصلية غير موجودة");
          await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [
            p.admission_id,
          ]);
          await admission(tx, r, p.admission_id, false);
          if (p.closure_id)
            throw new ApiError(
              409,
              "الدفعة ضمن فترة مالية مقفلة؛ يلزم إجراء تسوية مخول خارج الفترة المقفلة",
              "PERIOD_CLOSED",
            );
          const refunds = await one(
            tx,
            "SELECT COALESCE(-sum(amount),0) AS amount FROM payments WHERE original_payment_id=$1",
            [p.id],
          );
          const amount = currency(r.body.amount, "مبلغ الاسترداد", 0.01);
          const moneyAccountId =
            p.money_account_id || (p.method === "cash" ? "cash" : null);
          if (
            Math.round(amount * 100) +
              Math.round(Number(refunds.amount) * 100) >
            Math.round(Number(p.amount) * 100)
          )
            throw new ApiError(
              409,
              "الاسترداد يتجاوز المبلغ المتبقي من الدفعة",
            );
          await assertMoneyAvailable(tx, moneyAccountId, amount);
          return insert(tx, "payments", {
            id: uid(),
            receipt_no: `REF-${Date.now()}-${sessionToken().slice(0, 5)}`,
            admission_id: p.admission_id,
            amount: -amount,
            method: p.method,
            reference: required(r.body.reason, "سبب الاسترداد"),
            original_payment_id: p.id,
            insurance_claim_id: p.insurance_claim_id || null,
            company_id: p.company_id || null,
            company_snapshot: p.company_snapshot
              ? JSON.stringify(p.company_snapshot)
              : null,
            money_account_id: moneyAccountId,
            actor_id: r.user.id,
          });
        }),
      );
    }),
  );
  app.post(
    "/api/billing/close",
    wrap(async (r, s) => {
      permit(r, "billing.write");
      // Case-scoped clinicians may record case charges, not close the department cash book.
      if (scopeSql(r))
        throw new ApiError(
          403,
          "ليس لديك صلاحية لتنفيذ هذا الإجراء",
          "FORBIDDEN",
        );
      s.status(201).json(
        await mutate(db, r, "cash_closures", async (tx) => {
          const payments = await all(
            tx,
            "SELECT * FROM payments WHERE closure_id IS NULL FOR UPDATE",
          );
          if (!payments.length)
            throw new ApiError(409, "لا توجد حركات غير مقفلة");
          const closure = await insert(tx, "cash_closures", {
            id: uid(),
            actor_id: r.user.id,
            reason: required(r.body.reason, "سبب أو بيان الإقفال"),
            total: (
              await one(
                tx,
                "SELECT COALESCE(sum(amount),0) AS total FROM payments WHERE id=ANY($1::text[])",
                [payments.map((p) => p.id)],
              )
            ).total,
          });
          await tx.query(
            "UPDATE payments SET closure_id=$1 WHERE id=ANY($2::text[])",
            [closure.id, payments.map((p) => p.id)],
          );
          return closure;
        }),
      );
    }),
  );
}
