# توثيق واجهة البرمجة (API v1)

- **الجذر:** `/api/v1`
- **المصادقة:** Laravel Sanctum — `Authorization: Bearer <token>`
- **سياق الكاشير:** `X-POS-Terminal: <terminal_code>` (يحدد الفرع والمخزن والوردية)
- **منع التكرار:** `Idempotency-Key: <uuid>` على كل عملية مالية
- **الترميز:** JSON، UTF-8. **كل المبالغ والكميات نصوص** (`"70.0000"`) وليست أرقامًا عائمة.

## شكل الخطأ الموحّد

```json
{
  "message": "الرصيد المتاح لا يكفي لإتمام العملية.",
  "error_code": "insufficient_stock",
  "context": { "variant_id": 12, "available": "1.0000", "requested": "3.0000" }
}
```

العميل يتصرف حسب `error_code`، لا حسب نص الرسالة.

### أكواد الأخطاء المهمة

| الكود | HTTP | المعنى |
|---|---|---|
| `insufficient_stock` | 422 | الرصيد لا يكفي |
| `return_exceeds_sold` | 422 | المرتجع يتجاوز المباع |
| `underpayment` / `overpayment` | 422 | المدفوع لا يطابق الفاتورة |
| `credit_requires_customer` | 422 | بيع آجل بلا عميل |
| `credit_limit_exceeded` | 422 | تجاوز الحد الائتماني |
| `approval_required` | 422 | يحتاج موافقة مدير |
| `total_mismatch` | 422 | إجمالي الشاشة يخالف إجمالي الخادم |
| `fractional_qty_not_allowed` | 422 | كسور على صنف يُباع بالقطعة |
| `serial_not_available` | 422 | السيريال مباع أو غير متاح |
| `permission_denied` | 403 | الصلاحية مرفوضة على الخادم |
| `idempotency_key_reused` | 409 | نفس المفتاح بمحتوى مختلف |
| `idempotency_in_progress` | 409 | العملية قيد التنفيذ |
| `shift_required` | 409 | لا توجد وردية مفتوحة |
| `held_cart_already_claimed` | 409 | الفاتورة المعلقة مستخدمة على جهاز آخر |
| `unsynced_operations_pending` | 409 | إغلاق وردية مع عمليات غير متزامنة |
| `period_closed` | 422 | فترة محاسبية مقفلة |

---

## المصادقة

| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/auth/login` | دخول بكلمة مرور (محدود المعدل 20/دقيقة، وقفل بعد 5 محاولات) |
| POST | `/auth/unlock` | عودة سريعة برمز PIN على نفس الجهاز |
| GET | `/auth/me` | المستخدم وصلاحياته وحدوده والمزايا المفعّلة |
| POST | `/auth/logout` | إبطال الرمز الحالي |

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"...","terminal_code":"POS1"}'
```

---

## نقطة البيع

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/pos/bootstrap` | `pos.use` | كل ما تحتاجه الشاشة عند الإقلاع |
| POST | `/pos/scan` | `pos.use` | حل باركود إلى سطر سلة جاهز |
| GET | `/pos/search` | `pos.use` | بحث بالاسم/الكود/الباركود/السيريال |

**`POST /pos/scan`** يفهم الباركود العادي والموزون والمسعّر (حسب إعدادات المحل):

```json
{ "code": "2101234005000" }
→ { "variant_id": 12, "name": "لحم مفروم", "qty": "0.5000",
    "unit_price": "400.00", "mergeable": false }
```

`mergeable: false` يعني **لا تُدمج** مع مسحة سابقة — كل عبوة موزونة سطر مستقل.

---

## المبيعات

| الطريقة | المسار | الصلاحية |
|---|---|---|
| POST | `/sales` | `sales.create` |
| POST | `/sales/quote` | `sales.create` — حساب الإجماليات دون إنشاء شيء |
| GET | `/sales/by-key/{key}` | — **استرجاع نتيجة عملية انقطع ردها** |
| GET | `/sales` | مفلتر بـ `sales.view_all` |
| GET | `/sales/{sale}` | التكلفة والربح يظهران فقط مع `sales.view_cost` |
| GET | `/sales/{sale}/returnable` | `sales.return` |
| POST | `/sales/{sale}/reprint` | `pos.reprint` |

### إنشاء فاتورة

```http
POST /api/v1/sales
Idempotency-Key: 5c1a...-uuid
X-POS-Terminal: POS1
```

```json
{
  "lines": [
    { "variant_id": 12, "product_unit_id": 3, "qty": "2",
      "discount_percent": "5", "serials": ["IMEI-001"] }
  ],
  "payments": [
    { "payment_method_id": 1, "amount": "400.00", "tendered_amount": "500.00" },
    { "payment_method_id": 2, "amount": "600.00", "reference": "APPR-9912" }
  ],
  "customer_id": 8,
  "is_credit": false,
  "invoice_discount_type": "percent",
  "invoice_discount_value": "10",
  "expected_grand_total": "1000.00",
  "approval_uuid": null
}
```

- `tendered_amount` = ما سلّمه العميل فعلًا؛ `amount` = ما يُحتسب على الفاتورة.
  الفرق باقٍ يُصرف، والخزنة تعرف الاثنين.
- `expected_grand_total` **تحقّق فقط**: اختلافه عن حساب الخادم يُرجع `total_mismatch`.
- إعادة الإرسال بنفس المفتاح تُرجع `200` مع `"replayed": true` ونفس الفاتورة.

### استرجاع نتيجة ضائعة

```bash
GET /api/v1/sales/by-key/5c1a...-uuid
→ { "status": "completed", "resource_id": 42, "response": { "number": "INV-POS1-000042", ... } }
```

---

## المرتجعات

| الطريقة | المسار | الصلاحية |
|---|---|---|
| POST | `/returns` | `sales.return` |
| GET | `/returns` · `/returns/{id}` | `sales.return` |

```json
{
  "sale_id": 42,
  "lines": [{ "sale_line_id": 91, "qty": "1", "disposition": "damaged", "serials": ["IMEI-001"] }],
  "reason": "عيب صناعة",
  "refund_method_id": null
}
```

`disposition`: `resalable` · `damaged` · `inspection` · `returns_warehouse`.
غير الصالح للبيع يذهب لمخزن الحجر ولا يعود لرصيد البيع.

الرد يوضّح كيف سُوِّي المرتجع:
```json
{ "grand_total": "1000.00", "credit_applied": "500.00", "refund_cash": "500.00" }
```

---

## الفواتير المعلقة

| الطريقة | المسار |
|---|---|
| GET / POST | `/held-carts` |
| PUT | `/held-carts/{id}` (يتطلب `version`) |
| POST | `/held-carts/{id}/recall` (يتطلب `version` — قفل تفاؤلي) |
| POST | `/held-carts/{id}/release` |
| DELETE | `/held-carts/{id}` |

`recall` يُرجع `differences`: تغيّر السعر، نقص الرصيد، انتهاء الصلاحية — **قبل** اعتماد البيع.

---

## الموافقات

| الطريقة | المسار |
|---|---|
| POST | `/approvals` — طلب موافقة (إجراء + مبلغ) |
| POST | `/approvals/{uuid}/approve` — المدير يعتمد **ببياناته هو** |

الرمز أحادي الاستخدام، مرتبط بالإجراء والمبلغ، وينتهي بعد 15 دقيقة.

---

## الورديات والخزنة

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET | `/shifts/current` | — (المتوقع مخفي في العد الأعمى) |
| POST | `/shifts` | `cash.shift.open` |
| POST | `/shifts/{id}/close` | `cash.shift.close` |
| POST | `/shifts/{id}/reconcile` | `cash.shift.reconcile` |
| GET | `/shifts/{id}/report` | — |
| POST | `/cash/movements` · `/cash/expenses` | `cash.movement` |
| POST | `/cash/open-drawer` | `cash.drawer.open` |

---

## العملاء

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET/POST | `/customers` | `customers.view` / `customers.manage` |
| GET | `/customers/{id}/statement` | `customers.view` |
| POST | `/customers/{id}/collect` | `customers.collect` (يقبل `Idempotency-Key`) |

---

## الأصناف والاستيراد

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET/POST/PUT/DELETE | `/products` | `catalog.view` / `catalog.manage` |
| POST | `/products/{id}/barcodes` | `catalog.manage` |
| GET | `/products/lookups` | `catalog.view` |
| GET | `/import/template` | `catalog.manage` — قالب CSV عربي بـ BOM |
| POST | `/import/preview` | **يتحقق ويُرجع الأخطاء بأرقام الصفوف، دون كتابة** |
| POST | `/import/commit` | يكتب فقط بعد الموافقة |

---

## المخزون

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET | `/inventory/balances` · `/inventory/movements` | `inventory.view` |
| GET | `/inventory/reconcile` | `inventory.view` — يثبت تطابق الأرصدة مع السجل |
| POST | `/inventory/adjust` · `/inventory/rebuild` | `inventory.adjust` |
| POST | `/inventory/transfers` (+`/send`, `/receive`) | `inventory.transfer` |
| POST | `/inventory/stocktakes` (+`/count`, `/post`) | `inventory.stocktake` |

---

## المشتريات

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET/POST | `/suppliers` | `purchasing.view` / `purchasing.manage` |
| GET/POST | `/purchase-orders` | **لا يحرّك المخزون** |
| POST | `/goods-receipts` | `purchasing.manage` — **هنا فقط يزيد المخزون** |

---

## المزامنة (الوضع المحدود)

| الطريقة | المسار |
|---|---|
| GET | `/sync/status` — الحالة وعدد المعلق والتعارضات |
| GET | `/sync/pull` — نسخة أصناف للتخزين المحلي (بلا أصناف سيريال) |
| POST | `/sync/push` — رفع العمليات المحلية |
| GET | `/sync/conflicts` — ما يحتاج مراجعة مدير |
| POST | `/sync/conflicts/{id}/resolve` — `accept` أو `reject` بملاحظة |

`push` يُرجع لكل عملية: `applied` · `duplicate` · `conflict` · `rejected`،
ومع التعارض يعيد `collected_amount` كما هو — لا يُمسح ولا يُعدَّل.

---

## الطباعة

| الطريقة | المسار |
|---|---|
| GET | `/print-jobs/pending` · `/print-jobs/failed` |
| POST | `/print-jobs/{id}/printed` · `/failed` · `/retry` |

فشل الطباعة **لا يلغي بيعًا ولا يعيده**؛ يُعالَج من هذا الطابور وحده.

---

## التقارير

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET | `/reports/dashboard` | `reports.view` (+`reports.profit` للأرباح) |
| GET | `/reports/sales` · `/products` · `/inventory` · `/alerts` | `reports.view` |
| GET | `/reports/drill-down?metric=...` | `reports.view` |

كل استجابة تحمل `definition` تشرح ما يشمله الرقم وما يستبعده.

---

## معالج الإعداد

| الطريقة | المسار | الصلاحية |
|---|---|---|
| GET | `/setup/status` | عام |
| POST | `/setup/store` · `/features` · `/branch` · `/warehouse` · `/terminal` · `/tax` · `/complete` | `settings.manage` |
| POST | `/setup/user` | `users.manage` |

---

## إجمالي المسارات: 96
