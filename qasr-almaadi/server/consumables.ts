import { all, one, type Database } from "./db.js";
import {
  admission,
  audit,
  mutate,
  permit,
  requireKey,
  scopeSql,
  matchesPatientIdentity,
  uid,
  versioned,
  wrap,
  type RouteContext,
} from "./context.js";
import { ApiError, date, number, required } from "./security.js";
import { insert } from "./seed.js";

const today = `(now() AT TIME ZONE 'Africa/Cairo')::date`;
async function currentPrice(db: Database, id: string) {
  return one(
    db,
    `SELECT p.* FROM consumable_prices cp JOIN prices p ON p.id=cp.price_id WHERE cp.consumable_id=$1 AND p.valid_from<=now() ORDER BY p.valid_from DESC,p.created_at DESC,p.id DESC LIMIT 1`,
    [id],
  );
}
async function addPrice(db: Database, item: any, body: any, actor: string) {
  const price = number(body.price, "سعر المستهلك", 0, 1000000);
  if (Math.abs(price * 100 - Math.round(price * 100)) > 0.00001)
    throw new ApiError(400, "السعر يقبل منزلتين عشريتين فقط");
  const p = await insert(db, "prices", {
    id: uid(),
    name: item.name,
    category: "consumable",
    price,
    unit: item.unit,
    valid_from: body.valid_from
      ? date(body.valid_from, "بدء السعر")
      : new Date().toISOString(),
    created_by: actor,
  });
  await insert(db, "consumable_prices", {
    consumable_id: item.id,
    price_id: p.id,
  });
  return p;
}
export function consumablesRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/consumables",
    wrap(async (r, s) => {
      permit(r, "consumables.read");
      const admissionId =
        typeof r.query.admission_id === "string"
          ? r.query.admission_id
          : undefined;
      if (admissionId) {
        permit(r, "patients.read");
        await admission(db, r, admissionId, false);
      }
      const catalog = await all(
        db,
        `SELECT c.*,p.id AS price_id,p.price AS unit_price,p.valid_from FROM consumable_catalog c LEFT JOIN LATERAL (SELECT p.* FROM consumable_prices cp JOIN prices p ON p.id=cp.price_id WHERE cp.consumable_id=c.id AND p.valid_from<=now() ORDER BY p.valid_from DESC,p.created_at DESC,p.id DESC LIMIT 1) p ON true ORDER BY c.name`,
      );
      const batches = await all(
        db,
        `SELECT id,consumable_id,batch,quantity,expires_at,location,min_quantity,(expires_at<${today}) AS expired FROM inventory WHERE consumable_id IS NOT NULL ORDER BY expires_at,id`,
      );
      for (const c of catalog) {
        c.batches = batches.filter((b) => b.consumable_id === c.id);
        c.available_quantity = c.batches
          .filter((b: any) => !b.expired)
          .reduce((n: number, b: any) => n + Number(b.quantity), 0);
      }
      const history = r.user.permissions.includes("patients.read")
        ? await all(
            db,
            `SELECT c.*,p.id AS patient_id,p.name AS patient_name,p.mrn,u.name AS actor_name FROM consumptions c JOIN admissions a ON a.id=c.admission_id JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=c.actor_id WHERE 1=1 ${scopeSql(r)} ${admissionId ? "AND c.admission_id=$1" : ""} ORDER BY c.created_at DESC LIMIT 500`,
            admissionId ? [admissionId] : [],
          )
        : [];
      if (history.length) {
        const moves = await all(
          db,
          `SELECT cm.consumption_id,i.batch,i.expires_at,m.quantity FROM consumption_movements cm JOIN stock_movements m ON m.id=cm.movement_id JOIN inventory i ON i.id=m.item_id WHERE cm.consumption_id=ANY($1::text[])`,
          [history.map((h) => h.id)],
        );
        for (const h of history)
          h.batches = moves.filter((m) => m.consumption_id === h.id);
      }
      await audit(db, r, "read", "consumables", admissionId);
      s.json({
        catalog,
        history,
        stats: {
          catalog_count: catalog.length,
          unpriced_count: catalog.filter((c) => !c.price_id).length,
          low_stock_count: catalog.filter(
            (c) =>
              c.available_quantity <=
              c.batches.reduce(
                (n: number, b: any) => n + Number(b.min_quantity),
                0,
              ),
          ).length,
        },
        history_limit: 500,
      });
    }),
  );
  app.post(
    "/api/consumables",
    wrap(async (r, s) => {
      permit(r, "consumables.catalog");
      requireKey(r);
      if (r.body.price !== undefined && r.body.price !== "")
        permit(r, "prices.write");
      s.status(201).json(
        await mutate(db, r, "consumable_catalog", async (tx) => {
          const sku = required(r.body.sku, "كود المستهلك").toUpperCase();
          if (
            await one(tx, "SELECT id FROM consumable_catalog WHERE sku=$1", [
              sku,
            ])
          )
            throw new ApiError(409, "كود المستهلك مستخدم بالفعل");
          const c = await insert(tx, "consumable_catalog", {
            id: uid(),
            sku,
            name: required(r.body.name, "اسم المستهلك"),
            unit: required(r.body.unit, "وحدة المستهلك"),
          });
          if (r.body.price !== undefined && r.body.price !== "")
            await addPrice(tx, c, r.body, r.user.id);
          return c;
        }),
      );
    }),
  );
  app.patch(
    "/api/consumables/:id",
    wrap(async (r, s) => {
      permit(r, "consumables.catalog");
      if (typeof r.body.active !== "boolean")
        throw new ApiError(400, "حالة المستهلك غير صالحة");
      s.json(
        await mutate(db, r, "consumable_catalog", (tx) =>
          versioned(
            tx,
            "consumable_catalog",
            String(r.params.id),
            r.body.version,
            { active: r.body.active },
          ),
        ),
      );
    }),
  );
  app.post(
    "/api/consumables/:id/prices",
    wrap(async (r, s) => {
      permit(r, "prices.write");
      permit(r, "consumables.read");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "consumable_prices", async (tx) => {
          if (!Number.isInteger(r.body.version))
            throw new ApiError(400, "رقم إصدار السجل مطلوب؛ أعد تحميل السجل");
          const c = await one(
            tx,
            "UPDATE consumable_catalog SET version=version+1 WHERE id=$1 AND version=$2 RETURNING *",
            [r.params.id, r.body.version],
          );
          if (!c)
            throw new ApiError(
              409,
              "عُدّل السجل بواسطة مستخدم آخر. حدّث البيانات ثم أعد المحاولة",
            );
          const p = await addPrice(tx, c, r.body, r.user.id);
          return {
            ...c,
            price_id: p.id,
            unit_price: p.price,
            valid_from: p.valid_from,
          };
        }),
      );
    }),
  );
  app.post(
    "/api/consumables/:id/batches",
    wrap(async (r, s) => {
      permit(r, "stock.write");
      permit(r, "consumables.read");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "inventory", async (tx) => {
          const c = await one(
            tx,
            "SELECT * FROM consumable_catalog WHERE id=$1 FOR UPDATE",
            [r.params.id],
          );
          if (!c) throw new ApiError(404, "المستهلك غير موجود");
          const expiry = required(r.body.expires_at, "انتهاء الصلاحية");
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
            !Number.isFinite(new Date(expiry).getTime()) ||
            new Date(expiry).toISOString().slice(0, 10) !== expiry
          )
            throw new ApiError(400, "تاريخ انتهاء الصلاحية غير صالح");
          const b = await insert(tx, "inventory", {
            id: uid(),
            consumable_id: c.id,
            name: c.name,
            unit: c.unit,
            batch: required(r.body.batch, "رقم التشغيلة"),
            expires_at: expiry,
            quantity: number(r.body.quantity, "الكمية", 0.001),
            min_quantity: number(r.body.min_quantity === '' ? 0 : r.body.min_quantity ?? 0, "حد إعادة الطلب"),
            cost: number(r.body.cost ?? 0, "التكلفة"),
            location: required(r.body.location, "الموقع"),
          });
          await insert(tx, "stock_movements", {
            id: uid(),
            item_id: b.id,
            type: "receive",
            quantity: b.quantity,
            reason: "استلام تشغيلة مستهلكات",
            cost_snapshot: b.cost,
            actor_id: r.user.id,
          });
          return b;
        }),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/consumables",
    wrap(async (r, s) => {
      permit(r, "consumables.use");
      permit(r, "patients.read");
      requireKey(r);
      if (
        ["amount", "unit_price", "price"].some((k) => r.body[k] !== undefined)
      )
        throw new ApiError(400, "سعر الصرف يحسب تلقائيًا من قائمة الأسعار");
      s.status(201).json(
        await mutate(db, r, "consumptions", async (tx) => {
          await tx.query("SELECT id FROM admissions WHERE id=$1 FOR UPDATE", [
            r.params.id,
          ]);
          const a = await admission(tx, r, String(r.params.id));
          if (!matchesPatientIdentity(a, required(r.body.patient_mrn, "رقم ملف الطفل")))
            throw new ApiError(409, "رقم ملف الطفل غير مطابق");
          const c = await one(
            tx,
            "SELECT * FROM consumable_catalog WHERE id=$1 FOR UPDATE",
            [required(r.body.consumable_id, "المستهلك")],
          );
          if (!c || !c.active)
            throw new ApiError(409, "المستهلك غير موجود أو موقوف");
          const p = await currentPrice(tx, c.id);
          if (!p)
            throw new ApiError(
              409,
              "لا يوجد سعر سارٍ للمستهلك؛ راجع مسؤول الأسعار",
            );
          if (r.body.expected_price_id && r.body.expected_price_id !== p.id)
            throw new ApiError(
              409,
              "تغير سعر المستهلك؛ حدّث القائمة وراجع السعر",
            );
          const quantity = number(
            r.body.quantity,
            "كمية المستهلك",
            0.001,
            1000000,
          );
          if (Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.00001)
            throw new ApiError(400, "الكمية تقبل ثلاث منازل عشرية فقط");
          const batches = await all(
            tx,
            `SELECT * FROM inventory WHERE consumable_id=$1 AND quantity>0 AND (expires_at IS NULL OR expires_at>=${today}) ${r.body.inventory_id ? "AND id=$2" : ""} ORDER BY expires_at NULLS LAST,id FOR UPDATE`,
            r.body.inventory_id ? [c.id, r.body.inventory_id] : [c.id],
          );
          if (
            batches.reduce((n, b) => n + Number(b.quantity), 0) + 0.0000001 <
            quantity
          )
            throw new ApiError(409, "رصيد المستهلك الصالح غير كافٍ");
          const amount = Math.round(quantity * Number(p.price) * 100) / 100;
          const charge = await insert(tx, "charges", {
            id: uid(),
            admission_id: a.id,
            price_id: p.id,
            name: c.name,
            quantity,
            unit_price: p.price,
            amount,
            source: "consumable",
            actor_id: r.user.id,
          });
          const result = await insert(tx, "consumptions", {
            id: uid(),
            admission_id: a.id,
            consumable_id: c.id,
            name: c.name,
            unit: c.unit,
            quantity,
            unit_price: p.price,
            amount,
            charge_id: charge.id,
            actor_id: r.user.id,
          });
          const used = [];
          let left = quantity;
          for (const b of batches) {
            if (left <= 0) break;
            const q = Math.min(left, Number(b.quantity));
            left = Math.round((left - q) * 1000) / 1000;
            await tx.query(
              "UPDATE inventory SET quantity=quantity-$1,version=version+1 WHERE id=$2",
              [q, b.id],
            );
            const m = await insert(tx, "stock_movements", {
              id: uid(),
              item_id: b.id,
              type: "issue",
              quantity: q,
              admission_id: a.id,
              reason: r.body.reason
                ? required(r.body.reason, "سبب الصرف")
                : "صرف مستهلك للطفل",
              cost_snapshot: b.cost,
              actor_id: r.user.id,
            });
            await insert(tx, "consumption_movements", {
              consumption_id: result.id,
              movement_id: m.id,
            });
            used.push({
              batch: b.batch,
              quantity: q,
              expires_at: b.expires_at,
            });
          }
          return { ...result, batches: used };
        }),
      );
    }),
  );
}
