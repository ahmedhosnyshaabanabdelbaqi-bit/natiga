# تقرير الاختبارات

**تاريخ التنفيذ:** 2026-09-21
**البيئة:** PHP 8.4.19 · Laravel 13.32 · PostgreSQL 16.13 · Node 22 · حاوية تطوير بموارد مشتركة
**قاعدة الاختبار:** `eg_erp_test` على PostgreSQL نفسه — **وليس SQLite**، لأن قيود `CHECK` وأقفال الصفوف وأنواع `NUMERIC` جزء من الضمانات المختبَرة.

---

## ١. النتيجة الإجمالية

```
Tests:      56 passed
Assertions: 296
Duration:   54.3 ثانية
```

| الملف | اختبارات | تحققات | النتيجة |
|---|---|---|---|
| `ReferenceScenarioTest` | 1 | 41 | ✅ |
| `InventoryGuardsTest` | 8 | 22 | ✅ |
| `ConcurrencyTest` | 3 | 8 | ✅ |
| `SyncIdempotencyTest` | 7 | 32 | ✅ |
| `CreditAndClosureTest` | 11 | 42 | ✅ |
| `ApiSecurityTest` | 12 | 95 | ✅ |
| `ReportsSmokeTest` | 7 | 41 | ✅ |
| `ExceptionSignalsTest` | 5 | 13 | ✅ |
| `ExampleTest` | 2 | 2 | ✅ |

---

## ٢. السيناريو المرجعي الإلزامي (البند ٢٢)

`ReferenceScenarioTest::test_full_reference_scenario_matches_expected_figures` — **41 تحققًا**.

### الخطوات المنفذة

1. شراء آجل 10 كراتين × 12 قطعة بتكلفة 50 ج/قطعة ← استلام 120 قطعة بقيمة 6000، ثم فاتورة مورد.
2. تحويل 3 كراتين (36 قطعة) إلى سيارة المندوب عبر «بضاعة بالطريق».
3. بيع 20 قطعة من السيارة بسعر 80 آجلًا.
4. استلام واعتماد مرتجع قطعتين صالحتين بنفس السعر والتكلفة.
5. تحصيل 1000 نقدًا عبر المندوب ← إيداع 900 بخزنة الشركة ← اعتماد 100 مصروفًا من عهدته.

### النتائج — المطلوب مقابل الفعلي

| المؤشر | المطلوب | الفعلي | ✓ |
|---|---|---|---|
| رصيد السيارة | 18 قطعة | `18.000000` | ✅ |
| إجمالي الشركة | 102 قطعة | `102.000000` | ✅ |
| قيمة المخزون | 5100 | `5100.0000` | ✅ |
| صافي المبيعات | 1440 | `1440.0000` | ✅ |
| تكلفة المبيعات | 900 | `900.0000` | ✅ |
| مجمل الربح | 540 | `540.0000` | ✅ |
| مديونية العميل | 440 | `440.0000` | ✅ |
| عهدة المندوب النقدية | صفر | `0.0000` | ✅ |
| خزنة الشركة | 900 | `900.0000` | ✅ |
| المورد مستحق له | 6000 | `6000.0000` | ✅ |
| صافي نتيجة العمليات | 440 | `440.0000` | ✅ |

### تحققات إضافية في نفس السيناريو

- المخزن الرئيسي 120 قطعة بعد الاستلام، ومتوسط التكلفة 50.
- **فاتورة المورد لم تُضف المخزون مرة ثانية** (ظل 120 بعدها).
- بعد إرسال التحويل: الرئيسي 84 والسيارة **صفر** — الصنف لا يظهر في المخزنين معًا.
- بعد الاستلام: الرئيسي 84 والسيارة 36 والإجمالي 120 — **التحويل الداخلي لم يغيّر المتوسط ولا الإجمالي**.
- التحصيل دخل **عهدة المندوب** (1103) وخزنة الشركة (1101) بقيت صفرًا في تلك اللحظة.
- حساب المخزون في الأستاذ = 5100 = قيمة المخزون الفعلية.
- **كل القيود متوازنة** وميزان المراجعة متوازن.
- **أرصدة المخزون تطابق دفتر الحركات** حسابيًا.

---

## ٣. ضمانات المخزون

| الاختبار | ما يثبته |
|---|---|
| `test_negative_stock_is_blocked_by_the_database_not_the_ui` | المنع من القاعدة لا من الواجهة |
| `test_return_exceeding_sold_quantity_is_rejected` | رفض مرتجع أكبر من المباع |
| `test_cumulative_returns_cannot_exceed_sold_quantity` | 3 + 2 مقبولان ثم 1 مرفوض على مباع 5 |
| `test_partial_transfer_leaves_remainder_in_transit_and_not_in_both_warehouses` | استلام جزئي: المصدر صفر، الهدف 12، بالطريق 12 |
| `test_stock_under_inspection_cannot_be_sold` | تحت الفحص لا يُحتسب في المتاح ولا يُباع |
| `test_expired_batch_cannot_be_sold` | دفعة منتهية تُرفض بسبب صريح |
| `test_historical_cost_is_frozen_and_not_recomputed_by_later_purchases` | فاتورة قديمة بتكلفة 200 لم تتغيّر رغم صعود المتوسط إلى 68 |
| `test_reservation_reduces_available_but_not_on_hand` | فعلي 12، محجوز 10، متاح 2؛ وحجز 3 مرفوض |

### التزامن الحقيقي

`ConcurrencyTest` يعمل ببيانات **مثبتة (committed)** بلا معاملة خارجية، ويستخدم **اتصالين منفصلين**:

| الاختبار | النتيجة |
|---|---|
| `test_row_lock_blocks_a_second_transaction_reading_the_same_balance` | المعاملة الثانية حُجبت بمهلة القفل ولم تقرأ رصيدًا قديمًا |
| `test_only_one_of_two_sellers_gets_the_last_unit` | البائع الأول نجح، والثاني رُفض بـ`stock.insufficient` |
| `test_database_check_constraint_rejects_negative_balance_even_via_raw_sql` | محاولة `UPDATE ... qty_base = -1` تجاوزًا للتطبيق **رُفضت من القاعدة** |

---

## ٤. المزامنة وعدم التكرار

| الاختبار | ما يثبته |
|---|---|
| `test_resending_the_same_invoice_does_not_create_a_second_document` | إعادة الإرسال أعادت نفس `doc_id` بعلامة `replayed`؛ فاتورة واحدة، مخزون 95 لا 90، وقيد إيراد واحد بسطرين |
| `test_resending_the_same_receipt_does_not_double_credit_the_customer` | ثلاث إرسالات ← سند واحد ومسدد 200 لا 600 |
| `test_field_number_is_kept_separate_from_the_central_number` | الميداني `FIELD-0001` محفوظ والمركزي `INV-…` من الخادم، والحالة الضريبية `not_submitted` |
| `test_offline_stock_quota_limits_what_a_device_can_sell` | حصة 10: بيع 8 نجح، ثم 5 رُفض كـ`conflict` **والعملية الأصلية محفوظة** |
| `test_offline_credit_quota_is_counted_in_central_exposure_and_limits_credit_sales` | حصة 400 ظهرت في التعرض المركزي وقللت المتاح إلى 600 |
| `test_deactivated_device_cannot_sync` | الجهاز الموقوف يُرفض عند الاتصال |
| `test_sync_status_reports_pending_and_conflicts` | عدّادات المعلق والمتعارض صحيحة |

---

## ٥. الائتمان والإقفال والعمولات

| الاختبار | ما يثبته |
|---|---|
| `test_credit_limit_blocks_a_credit_sale_beyond_the_limit` | 800 مقبولة ثم 800 مرفوضة على حد 1000 |
| `test_cash_sale_is_not_blocked_by_credit_limit` | النقدي لا يخضع للحد |
| `test_blocked_customer_cannot_be_sold_to_without_override` | رفض البيع لعميل موقوف |
| `test_exposure_excludes_invoiced_portion_of_orders_to_avoid_double_counting` | لا عدّ مزدوج؛ التحصيل خفّض التعرض من 800 إلى 500 |
| `test_day_closure_equations_and_sync_gate` | نقدية: 0 + 500 − 400 − 60 = **40**؛ والتحويل البنكي 100 **خارجها**. بضاعة: 10000 − 500 = **9500** |
| `test_closing_with_pending_sync_requires_a_documented_exception` | رُفض بـ`closure.sync_incomplete` ثم نجح باستثناء موثق مُسجَّل |
| `test_cash_variance_creates_a_pending_report_and_is_not_auto_deducted` | محضر عجز 50 بحالة `pending` و`resolution = null` |
| `test_reopening_a_closed_day_requires_a_reason_and_is_audited` | رفض بلا سبب، ثم قيد في `audit_logs` |
| `test_posting_into_a_closed_fiscal_period_is_rejected` | الفترة المقفلة ترفض الترحيل |
| `test_commission_is_reversed_proportionally_after_a_return` | عمولة 80 على 1600، ومرتجع ربع الكمية عكس **−20**، والصافي 60 بسطرين قابلين للتتبع |
| `test_commission_recalculation_in_a_settled_period_is_blocked` | رفض إعادة الحساب في فترة مُسوّاة |

---

## ٦. الصلاحيات ونطاق الوصول

| الاختبار | ما يثبته |
|---|---|
| `test_unauthenticated_requests_are_rejected` | 401 بلا رمز |
| `test_user_without_permission_is_denied_by_default` | **الرفض الافتراضي**: 403 على القائمة والتقرير والإنشاء |
| `test_salesman_cannot_list_customers_of_another_salesman` | قائمته تحوي `CUS-001` ولا تحوي `CUS-002` |
| `test_salesman_cannot_open_another_salesmans_customer_by_changing_the_id` | **404** عند تغيير المعرّف يدويًا، و200 لعميله |
| `test_salesman_cannot_invoice_a_customer_not_assigned_to_him` | 403 ولم تُنشأ أي فاتورة |
| `test_cost_and_profit_are_not_sent_in_the_api_to_unauthorised_users` | `total_cost` و`unit_cost` و`avg_cost` **غائبة من الاستجابة** لا مخفية؛ وتقييم المخزون 403؛ والمخوّل يراها `250.0000` |
| `test_dashboard_hides_profit_cards_from_users_without_permission` | بطاقات الربح والتكلفة غائبة عن لوحة المندوب |
| `test_every_dashboard_card_has_a_formula_in_the_kpi_dictionary` | كل بطاقة لها تعريف حسابي وقيمة ووقت تحديث |
| `test_revoking_a_permission_does_not_erase_past_audit_records` | السجل والفاتورة باقيان بعد سحب كل الأدوار |
| `test_login_returns_permission_list_and_enforces_password_change` | `must_change_password` وقائمة صلاحيات بلا `reports.cost.view` |
| `test_login_with_wrong_password_is_rejected_and_throttled` | 401 خمس مرات ثم **429** |

---

## ٧. التقارير والمطابقة

| الاختبار | ما يثبته |
|---|---|
| `test_all_report_endpoints_return_data` | 13 نقطة نهاية تعيد 200 |
| `test_aging_buckets_split_by_due_date_not_invoice_date` | استحقاق قبل 45 يومًا → شريحة 31–60 بمبلغ 600؛ والجارية 400 |
| `test_inventory_valuation_reconciles_with_the_general_ledger` | `reconciled = true` والقيمة تساوي رصيد الأستاذ |
| `test_trial_balance_is_balanced` | المدين = الدائن |
| `test_income_statement_separates_gross_from_net_profit` | إيراد 1200، تكلفة 750، مجمل 450، صافي 450، مع تنبيه صريح |
| `test_sales_report_totals_cover_all_results_not_just_the_page` | مجاميع كل النتائج منفصلة |
| `test_list_endpoints_report_totals_across_all_results` | صفحة بسجل واحد ومجموع كل النتائج 1200 |

---

## ٨. مركز الاستثناءات

| الاختبار | ما يثبته |
|---|---|
| `test_low_margin_sale_raises_a_signal_for_review_only` | إشارة `open` بلا مراجع وبلا أي إجراء على الفاتورة |
| `test_healthy_margin_does_not_raise_a_signal` | لا إشارات كاذبة |
| `test_undeposited_custody_older_than_two_days_raises_a_signal` | عهدة قديمة تُرفع للمراجعة |
| `test_signals_are_not_duplicated_on_repeated_runs` | ثلاث تشغيلات ← إشارة واحدة |
| `test_expired_offline_quotas_are_deactivated_by_the_scheduler` | الحصة المنتهية خرجت من التعرض ثم وُسمت `expired` |

---

## ٩. فحص الواجهة بالمتصفح

**الأداة:** Playwright + Chromium · **الحساب:** `admin` · **البيانات:** يوم توزيع كامل مُولَّد.

**النتيجة: 25 من 25 شاشة تعمل بلا أخطاء متصفح.**

| ما فُحص | النتيجة |
|---|---|
| تسجيل الدخول والانتقال للوحة | ✅ |
| 23 شاشة تشغيلية وتقريرية | ✅ كلها تعرض محتواها المتوقع |
| أخطاء JavaScript في الطرفية | **صفر** |
| استجابات 5xx أثناء التصفح | **صفر** |
| `html[dir]` | `rtl` ✅ |
| تمرير أفقي عند 390 بكسل | **لا يوجد** ✅ |
| عرض التابلت 820 بكسل | ✅ |
| اعتماد على شبكة خارجية | **لا يوجد** — الخط مستضاف محليًا |

### عيوب اكتُشفت بالفحص وأُصلحت

1. `/day-closure` كانت تفشل لمستخدم غير مرتبط بمندوب → أُضيف منتقي المندوب ونقطة `/salesmen`.
2. تمرير أفقي على الموبايل بسبب القائمة المغلقة خارج الشاشة → `overflow-x` على الجذر.
3. زر التعريف ⓘ كان يتداخل مع نص العنوان في RTL → نُقل إلى `inline-end`.
4. قيم اللوحة كانت تُعرض بأربع خانات بلا عملة → أُضيف `format` لكل مؤشر.
5. `/reports/aging` كانت تعيد 500 على PostgreSQL (تواريخ بلا تحويل نوع) → أُصلح وأُضيف اختبار.
6. `/items` كانت تعيد 500 بسبب اسم مستعار ناقص لدالة تجميع → أُصلح.

---

## ١٠. اختبار النسخ الاحتياطي والاستعادة

**نُفِّذ فعليًا** بأمري `erp:backup` و`erp:restore-test`:

```
التحقق من بصمة الملف…  البصمة مطابقة.
إنشاء قاعدة مؤقتة erp_restore_test_20260921053822…
جارٍ الاستعادة…
```

| الجدول | الحي | المستعاد | مطابق |
|---|---|---|---|
| companies | 1 | 1 | ✅ |
| accounts | 44 | 44 | ✅ |
| journal_entries | 32 | 32 | ✅ |
| journal_lines | 64 | 64 | ✅ |
| items | 11 | 11 | ✅ |
| customers | 10 | 10 | ✅ |
| suppliers | 3 | 3 | ✅ |
| stock_movements | 111 | 111 | ✅ |
| stock_balances | 35 | 35 | ✅ |
| sales_invoices | 9 | 9 | ✅ |
| sales_invoice_lines | 27 | 27 | ✅ |
| customer_receipts | 4 | 4 | ✅ |
| audit_logs | 39 | 39 | ✅ |

**النتيجة:** نجح — كل الجداول الحرجة مطابقة و**كل القيود ما زالت متوازنة بعد الاستعادة**.

---

## ١١. المطابقة على بيانات التشغيل التجريبية

بعد تنفيذ يوم توزيع كامل (استلام + 3 تحميلات + 9 فواتير + 4 تحصيلات + مرتجع + مصروفات + إيداعات):

| الفحص | النتيجة |
|---|---|
| ميزان المراجعة | مدين `679,116.32` = دائن `679,116.32` ✅ |
| قيمة المخزون مقابل حساب المخزون بالأستاذ | `293,870.00` = `293,870.00` ✅ |
| دفتر الحركات مقابل الأرصدة المجمعة | `6,752.000` = `6,752.000` ✅ |
| مديونيات العملاء مقابل حساب العملاء | `18,853.84` = `18,853.84` ✅ |
| مستحقات الموردين مقابل حساب الموردين | `310,960.00` = `310,960.00` ✅ |
| عهد المناديب بعد الإيداعات | `0.00` ✅ |
| خزنة الشركة | `6,590.14` |

---

## ١٢. قياس الأداء

> **تحذير:** هذه الأرقام من **حاوية تطوير بموارد مشتركة** وببيانات صغيرة
> (11 صنفًا، 10 عملاء، 9 فواتير، 111 حركة مخزنية). **لا تصلح كوعد أداء إنتاجي**،
> ولم يُجرَ قياس على بيانات واقعية الحجم أو مواصفات خادم معلنة.

متوسط 8 طلبات لكل نقطة نهاية، زمن كامل من العميل:

| نقطة النهاية | المتوسط |
|---|---|
| `GET /dashboard` | 31.0 ms |
| `GET /customers?per_page=25` | 24.5 ms |
| `GET /items?per_page=25` | 30.2 ms |
| `GET /sales-invoices?per_page=25` | 24.4 ms |
| `GET /stock/balances?per_page=50` | 22.1 ms |
| `GET /reports/sales` | 24.2 ms |
| `GET /reports/trial-balance` | 19.7 ms |
| `GET /reports/aging` | 19.4 ms |
| `GET /reports/inventory-valuation` | 20.1 ms |
| `GET /reports/salesmen` | 39.7 ms |

**الهدف المعلن** في `config/erp.php`: p95 ≤ 500 ms للـAPI و≤ 3000 ms للتقارير.
تحققه على بيانات واقعية **يحتاج قياسًا فعليًا على الخادم المستهدف** قبل الاعتماد.

---

## ١٣. ما لم يُختبَر

- **تطبيق Flutter** — لم يُبنَ ولم يُشغَّل (لا SDK). لا توجد حزمة APK.
- **اختبار اختراق** — لم يُجرَ.
- **الأداء على حجم بيانات إنتاجي** — لم يُقَس.
- **الطباعة على طابعة حرارية أو محمولة** — لم تُختبَر على جهاز.
- **التكاملات الخارجية** (رسائل، خرائط، دفع، الفاتورة الإلكترونية) — لا يوجد اتصال فعلي بأي مزود.
- **استعادة كاملة على بيئة منفصلة** — الاختبار تم محليًا على نفس الخادم.
