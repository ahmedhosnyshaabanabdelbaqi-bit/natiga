# مخطط قاعدة البيانات

قاعدة البيانات المرجعية: **PostgreSQL 16+**.
كل الجداول في `database/migrations/` ويمكن إعادة بنائها بـ `php artisan migrate:fresh`.

---

## 1. مخطط العلاقات (ERD)

```
┌──────────────────────── الأساس ────────────────────────┐
  stores ──< branches ──< warehouses ──< terminals
                 │             │             │
                 └─────────────┴─────────────┴──> shifts ──< cash_movements
                                                    │
  settings   document_sequences   print_templates    └──> cash_accounts

┌──────────────────── المستخدمون والصلاحيات ────────────────────┐
  users ──< role_user >── roles ──< permission_role >── permissions
    │  └──< permission_user >── permissions
    │  └──< user_limits
    └──< approvals ──> audit_logs (append-only, DB trigger)

┌──────────────────────── الأصناف ────────────────────────┐
  categories ─┐
  brands ─────┤
  tax_groups ─┼─> products ──< product_variants ──< barcodes
  units ──────┘       │              │        └──< prices >── price_lists
                      └──< product_units       ├──< serials
                                               ├──< batches
                                               └──< bundle_components

┌──────────────────────── المخزون ────────────────────────┐
  stock_movements   (سجل مرجعي غير قابل للتعديل)
        ▲
        │ (إسقاط مشتق، قابل لإعادة البناء)
  stock_balances (warehouse × variant)
  stock_reservations
  stock_transfers ──< stock_transfer_lines
  stocktakes      ──< stocktake_lines

┌──────────────────────── المبيعات ────────────────────────┐
  sales ──< sale_lines ──< sale_line_serials ──> serials
    │  └──< sale_payments ──> payment_methods
    │  └──< sale_returns ──< sale_return_lines ──< sale_return_line_serials
    │  └──< customer_payment_allocations ──> customer_payments
    └──> customers ──< customer_ledger_entries
  held_carts    quotes

┌──────────────────────── المشتريات ────────────────────────┐
  suppliers ──< purchase_orders ──< purchase_order_lines
      │   └──< goods_receipts ──< goods_receipt_lines
      │   └──< supplier_invoices ──< supplier_payment_allocations >── supplier_payments
      │   └──< supplier_returns ──< supplier_return_lines
      └──< supplier_ledger_entries

┌──────────────────────── الحسابات ────────────────────────┐
  accounts ──< journal_lines >── journal_entries ──> accounting_periods
  account_mappings ──> accounts          (مفاتيح بدل أكواد مباشرة)
  expense_categories ──< expenses

┌──────────────────── المزامنة والآثار الجانبية ────────────────────┐
  idempotency_keys   offline_operations   outbox_messages
  print_jobs         device_sync_states
```

---

## 2. القيود التي تحمي الأموال

هذه ليست تعليقات — هي قيود فعلية في قاعدة البيانات:

| القيد | الجدول | ما يمنعه |
|---|---|---|
| `sale_lines_returned_within_sold` | `sale_lines` | إرجاع أكثر مما بيع، حتى لو أخطأ الكود |
| `sales_credit_needs_customer` | `sales` | مديونية باسم عميل مجهول |
| `sales_totals_non_negative` | `sales` | إجمالي أو مدفوع أو باقٍ سالب |
| `sale_payments_change_within_tender` | `sale_payments` | باقٍ أكبر من المُسلَّم |
| `journal_entries_balanced` | `journal_entries` | ترحيل قيد غير متوازن |
| `journal_lines_one_side` | `journal_lines` | سطر مدين ودائن في آن واحد |
| `customer_ledger_sides` | `customer_ledger_entries` | صف بمدين ودائن معًا |
| `stock_movements_qty_not_zero` | `stock_movements` | حركة مخزون بكمية صفر |
| `stock_balances_reserved_non_negative` | `stock_balances` | حجز سالب |
| `products_serial_not_fractional` | `products` | صنف متتبع بالسيريال يقبل كسورًا |
| `product_units_factor_positive` | `product_units` | معامل تحويل صفر أو سالب |
| `transfer_lines_received_not_over_sent` | `stock_transfer_lines` | استلام أكثر مما أُرسل |
| `po_lines_received_within_ordered` | `purchase_order_lines` | استلام أكثر مما طُلب |
| `expenses_amount_positive` | `expenses` | مصروف بقيمة صفر أو سالبة |

### فهارس فريدة جزئية (سلوك لا يمكن تمثيله بقيد عادي)

| الفهرس | ما يضمنه |
|---|---|
| `shifts_one_open_per_drawer` | وردية مفتوحة واحدة لكل درج نقدية |
| `shifts_one_open_per_terminal` | وردية مفتوحة واحدة لكل جهاز كاشير |
| `sales_idempotency_key_unique` | فاتورة واحدة لكل مفتاح منع تكرار |
| `quotes_one_sale` | عرض سعر يتحول لفاتورة واحدة فقط |
| `price_lists_single_default` | قائمة أسعار افتراضية واحدة |
| `product_units_one_base` | وحدة أساسية واحدة لكل صنف |

### فرادة على مستوى المنشأة

| الحقل | النطاق | السبب |
|---|---|---|
| `barcodes.code` | المنشأة كلها | مسحة واحدة = معنى واحد |
| `serials (variant, serial)` | لكل صنف | الجهاز الفيزيائي واحد |
| `sale_line_serials.serial_id` | مطلق | نفس الجهاز لا يكون على فاتورتين |
| أرقام المستندات | لكل نوع + نطاق (فرع/كاشير) | ترقيم متصل دون تنافس بين الكاشيرات |

---

## 3. الفصل بين السجل والأرصدة

| السجل المرجعي (لا يُعدَّل) | الإسقاط المشتق (قابل لإعادة البناء) |
|---|---|
| `stock_movements` | `stock_balances.qty_on_hand`, `avg_cost` |
| `customer_ledger_entries` | `customers.balance` |
| `supplier_ledger_entries` | `suppliers.balance` |
| `cash_movements` | `cash_accounts.balance` |
| `journal_lines` | أرصدة الحسابات (تُحسب عند الطلب) |

أدوات الإثبات:
- `GET /api/v1/inventory/reconcile` — يقارن الأرصدة بمجموع الحركات ويُرجع الفروق
- `POST /api/v1/inventory/rebuild` — يعيد بناء رصدٍ من السجل
- `CustomerLedgerService::rebuildBalance()` — يعيد بناء مديونية عميل

---

## 4. الفهارس المهيأة للأداء

| الفهرس | يخدم |
|---|---|
| `barcodes.code` (UNIQUE) + `text_pattern_ops` | مسح الباركود وبحث البادئة |
| `products_name_trgm`, `products_name_en_trgm` (GIN) | البحث العربي والإنجليزي `ILIKE '%...%'` |
| `customers_name_trgm` (GIN) | بحث العملاء |
| `stock_movements_wh_variant_time` | كشف حركة صنف في مخزن |
| `sales (business_date, branch_id)` | كل تقارير الفترة |
| `sales (shift_id)` | تقرير إغلاق الوردية |
| `sales (customer_id, sold_at)` | كشف حساب العميل |
| `serials (variant_id, serial)` UNIQUE | التحقق من السيريال عند البيع |

كل قوائم API تستخدم **Pagination** (افتراضي 25–50، أقصى 200) — لا تحميل كامل للجداول.

---

## 5. حفظ التاريخ

`sale_lines` تحمل **لقطة** من بيانات البيع وقت حدوثه:

```
product_name, variant_name, sku, barcode, unit_name, unit_factor,
tax_group_code, unit_price, tax_rate, unit_cost
```

تعديل اسم صنف أو سعره **لا يغيّر فاتورة قديمة**.

كذلك:
- لا يُحذف منتج أو مورد أو عميل له معاملات — `SoftDeletes` + تعطيل
- `RESTRICT` على المفاتيح الأجنبية التي تحمل تاريخًا ماليًا
- `audit_logs` يرفض `UPDATE` و`DELETE` عبر محفّز في قاعدة البيانات

---

## 6. ملخص الجداول

| المجموعة | الجداول |
|---|---|
| الأساس (7) | stores, branches, warehouses, terminals, settings, document_sequences, print_templates |
| الصلاحيات (8) | users*, roles, permissions, permission_role, role_user, permission_user, user_limits, approvals, audit_logs |
| الأصناف (13) | categories, brands, units, tax_groups, products, product_variants, product_units, barcodes, price_lists, prices, batches, serials, bundle_components |
| المخزون (7) | stock_movements, stock_balances, stock_reservations, stock_transfers, stock_transfer_lines, stocktakes, stocktake_lines |
| الأطراف (4) | customers, suppliers, customer_ledger_entries, supplier_ledger_entries |
| الخزنة (7) | payment_methods, cash_accounts, shifts, cash_movements, drawer_openings, expense_categories, expenses |
| المبيعات (9) | sales, sale_lines, sale_line_serials, sale_payments, held_carts, quotes, sale_returns, sale_return_lines, sale_return_line_serials |
| المشتريات (11) | purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines, supplier_invoices, supplier_payments, supplier_payment_allocations, supplier_returns, supplier_return_lines, customer_payments, customer_payment_allocations |
| الحسابات (5) | accounts, account_mappings, accounting_periods, journal_entries, journal_lines |
| المزامنة (5) | idempotency_keys, offline_operations, outbox_messages, print_jobs, device_sync_states |

**الإجمالي: 76 جدولًا** (بخلاف جداول Laravel القياسية).
