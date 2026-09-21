# مرجع واجهة API — الإصدار الأول

**الأساس:** `/api/v1`

## المصادقة

Bearer token عبر Laravel Sanctum.

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username": "admin", "password": "..."}
```

الاستجابة تتضمن `token` و`must_change_password` و**قائمة صلاحيات المستخدم** التي تبني منها الواجهة قوائمها.
كل طلب تالٍ يحمل:

```http
Authorization: Bearer <token>
Accept: application/json
```

طلبات المزامنة تحمل إضافيًا `X-Device-Uid`.

## قواعد عامة

| القاعدة | التفصيل |
|---|---|
| الشركة | تُؤخذ من المستخدم لا من مدخلات العميل — لا يمكن تجاوزها بتغيير معرّف |
| الصلاحيات | تُفحص في السيرفر على كل طلب برفض افتراضي |
| نطاق السجل | المندوب يرى عملاءه فقط؛ الوصول لسجل خارج نطاقه يعيد **404** لا 403 |
| التكلفة والربح | **لا تُرسل أصلًا** في الاستجابة لغير المخوّل |
| المبالغ | نصوص عشرية بأربع خانات — لا تُحوَّل إلى float |
| التقسيم | `page`, `per_page` (حد أقصى 200)، مع `meta.totals_all_results` لمجاميع كل النتائج |
| الترتيب | `sort`, `direction` — أعمدة مسموحة فقط |
| البحث | `search` — بحث غير حساس لحالة الأحرف |

## شكل الأخطاء

```json
{
  "error_code": "credit.limit_exceeded",
  "message": "تجاوز الحد الائتماني: الحد 1000.0000، التعرض الحالي 800.0000…",
  "context": { "credit_limit": "1000.0000", "total_exposure": "800.0000" }
}
```

| الرمز | المعنى |
|---|---|
| 401 `auth.unauthenticated` | يلزم تسجيل الدخول |
| 403 `auth.forbidden` | لا تملك الصلاحية |
| 404 `resource.not_found` | السجل غير موجود **أو خارج نطاق صلاحيتك** |
| 422 `validation.failed` | بيانات غير صالحة مع `errors` لكل حقل |
| 422 `<domain>.<rule>` | خرق قاعدة عمل — انظر الجدول أدناه |
| 429 `auth.throttled` | تجاوز حد المحاولات |

### أهم رموز قواعد العمل

| الرمز | متى |
|---|---|
| `stock.insufficient` | الرصيد غير كافٍ (يشمل استبعاد الدفعات المنتهية) |
| `stock.not_sellable` | محاولة بيع من رصيد تحت الفحص أو حجر أو تالف |
| `stock.expired` | الدفعة منتهية أو ضمن مهلة المنع |
| `credit.limit_exceeded` | تجاوز الحد الائتماني بلا موافقة |
| `credit.customer_blocked` | العميل موقوف |
| `return.exceeds_sold` | المرتجع يتجاوز المباع بعد المرتجعات السابقة |
| `return.not_received` | محاولة اعتماد مالي قبل الاستلام الفعلي |
| `ledger.unbalanced` | قيد غير متوازن — مرفوض |
| `ledger.already_posted` | محاولة ترحيل مستند مُرحَّل |
| `period.closed` | الفترة المالية مقفلة |
| `closure.sync_incomplete` | الإقفال قبل اكتمال المزامنة بلا استثناء موثق |
| `quota.exceeded` | تجاوز حصة الجهاز الأوفلاين (مخزون أو ائتمان) |
| `posting.rule_missing` | مصفوفة الترحيل غير مكتملة |

## المسارات

| الطريقة | المسار | الصلاحية المطلوبة |
|---|---|---|
| `POST` | `/api/v1/auth/change-password` | — |
| `POST` | `/api/v1/auth/login` | — |
| `POST` | `/api/v1/auth/logout` | — |
| `GET` | `/api/v1/auth/me` | — |
| `POST` | `/api/v1/cash-deposits` | cash_deposit.create |
| `GET` | `/api/v1/commissions/statement` | commission.view |
| `GET` | `/api/v1/customer-receipts` | customer_receipt.view |
| `POST` | `/api/v1/customer-receipts` | customer_receipt.create |
| `GET` | `/api/v1/customers` | customer.view |
| `POST` | `/api/v1/customers` | customer.create |
| `GET` | `/api/v1/customers/aging` | customer.view |
| `GET` | `/api/v1/customers/{id}` | customer.view |
| `PATCH` | `/api/v1/customers/{id}` | customer.update |
| `POST` | `/api/v1/customers/{id}/reassign` | salesman.assign_customers |
| `GET` | `/api/v1/customers/{id}/statement` | customer.view |
| `GET` | `/api/v1/dashboard` | — |
| `GET` | `/api/v1/dashboard/dictionary` | — |
| `GET` | `/api/v1/day-closures` | day_closure.view |
| `POST` | `/api/v1/day-closures/{id}/close` | day_closure.close |
| `POST` | `/api/v1/day-closures/{id}/reopen` | day_closure.reopen |
| `POST` | `/api/v1/expenses` | expense.create |
| `POST` | `/api/v1/expenses/{id}/approve` | expense.approve |
| `GET` | `/api/v1/goods-receipts` | goods_receipt.view |
| `POST` | `/api/v1/goods-receipts` | goods_receipt.create,goods_receipt.post |
| `GET` | `/api/v1/health` | — |
| `GET` | `/api/v1/items` | item.view |
| `POST` | `/api/v1/items` | item.create |
| `GET` | `/api/v1/items/barcode` | item.view |
| `GET` | `/api/v1/items/price` | item.view |
| `GET` | `/api/v1/items/{id}` | item.view |
| `PATCH` | `/api/v1/items/{id}` | item.update |
| `GET` | `/api/v1/reports/aging` | reports.accounting |
| `GET` | `/api/v1/reports/income-statement` | reports.accounting |
| `GET` | `/api/v1/reports/inventory-valuation` | reports.inventory |
| `GET` | `/api/v1/reports/item-performance` | reports.sales |
| `GET` | `/api/v1/reports/sales` | reports.sales |
| `GET` | `/api/v1/reports/salesmen` | reports.salesmen |
| `GET` | `/api/v1/reports/trial-balance` | reports.accounting |
| `GET` | `/api/v1/sales-invoices` | sales_invoice.view |
| `POST` | `/api/v1/sales-invoices` | sales_invoice.create |
| `GET` | `/api/v1/sales-invoices/{id}` | sales_invoice.view |
| `POST` | `/api/v1/sales-invoices/{id}/cancel` | sales_invoice.cancel |
| `POST` | `/api/v1/sales-invoices/{id}/post` | sales_invoice.post |
| `POST` | `/api/v1/sales-invoices/{id}/reprint` | sales_invoice.reprint |
| `POST` | `/api/v1/sales-returns` | sales_return.create |
| `POST` | `/api/v1/sales-returns/{id}/post` | sales_return.post |
| `POST` | `/api/v1/sales-returns/{id}/receive` | sales_return.receive |
| `GET` | `/api/v1/salesmen` | — |
| `GET` | `/api/v1/stock/availability` | stock.view |
| `GET` | `/api/v1/stock/balances` | stock.view |
| `GET` | `/api/v1/stock/buckets` | stock.view |
| `GET` | `/api/v1/stock/item-card` | stock.view |
| `GET` | `/api/v1/stock/transfers` | stock.view |
| `POST` | `/api/v1/stock/transfers` | stock.transfer |
| `POST` | `/api/v1/stock/transfers/{id}/receive` | stock.transfer_receive |
| `POST` | `/api/v1/stock/transfers/{id}/send` | stock.transfer |
| `GET` | `/api/v1/supplier-invoices` | supplier_invoice.view |
| `POST` | `/api/v1/supplier-invoices` | supplier_invoice.create,supplier_invoice.post |
| `GET` | `/api/v1/suppliers` | supplier.view |
| `GET` | `/api/v1/suppliers/{id}/statement` | supplier.view |
| `GET` | `/api/v1/sync/operations` | — |
| `GET` | `/api/v1/sync/pull` | — |
| `POST` | `/api/v1/sync/push` | — |
| `POST` | `/api/v1/sync/register` | device.register |
| `GET` | `/api/v1/sync/status` | — |

## المزامنة — التفصيل

### `POST /api/v1/sync/push`

```json
{
  "operations": [{
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "idempotency_key": "INV-550e8400-…",
    "device_seq": 1,
    "op_type": "sales_invoice",
    "payload": { "customer_id": 1, "warehouse_id": 5, "invoice_date": "2026-09-21",
                  "payment_type": "credit", "field_no": "FIELD-0001",
                  "lines": [{ "item_id": 1, "uom_id": 1, "qty_uom": "5", "unit_price": "80" }] }
  }]
}
```

**الأنواع المدعومة:** `sales_invoice`, `sales_return`, `customer_receipt`, `visit`.

**الإيصال:**

```json
{
  "data": { "receipts": [{
    "uuid": "550e8400-…", "status": "applied", "replayed": false,
    "doc_type": "sales_invoice", "doc_id": 42, "doc_no": "INV-2026-000042",
    "error_code": null, "conflict": null
  }], "server_time": "2026-09-21T05:30:00+00:00" }
}
```

| الحالة | المعنى | ما يفعله الجهاز |
|---|---|---|
| `applied` | طُبّقت وأُنشئ المستند المركزي | يحفظ `doc_no` ويحذف العملية من الطابور |
| `applied` + `replayed: true` | مُطبّقة سابقًا — نفس المستند | **لا يعيد الإرسال**؛ العملية لم تتكرر |
| `conflict` | خرق قاعدة عمل (رصيد/ائتمان/حصة) | يعرضها للمراجعة **ولا يحذفها** |
| `rejected` | بيانات غير صالحة أو خطأ خادم | يعرض السبب ويتيح التصحيح |

**ضمان عدم التكرار:** `idempotency_key` فريد لكل شركة. إعادة الإرسال بعد انقطاع الرد تُرجع
الإيصال المحفوظ ولا تنشئ فاتورة أو تحصيلًا أو حركة مخزون ثانية. (اختبارات: `SyncIdempotencyTest`)

### `GET /api/v1/sync/pull?since=<ISO8601>`

سحب تزايدي للعملاء والأصناف والوحدات والأسعار ومخزون السيارة وحصص الأوفلاين،
مع `price_version` و`price_expires_at` لسياسة انتهاء صلاحية الأسعار على الجهاز.
