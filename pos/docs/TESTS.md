# الاختبارات ونتائج تشغيلها الفعلية

> كل الأرقام أدناه **من تشغيل حقيقي** في البيئة الموصوفة، وليست تقديرات.
> أعد إنتاجها بـ `php artisan test`.

---

## 1. النتيجة الإجمالية

```
$ php artisan test

Tests:        78 passed (304 assertions)
Duration:     42.8s
```

| المجموعة | الملفات | الاختبارات | ما تغطيه |
|---|---|---|---|
| **Unit** | 2 | 17 | محرك المال ومنطق الحساب بمعزل عن قاعدة البيانات |
| **Feature** | 12 | 57 | سيناريوهات كاملة على PostgreSQL حقيقي |
| **Concurrency** | 2 | 4 | **عمليات نظام تشغيل متوازية فعلية** + نسخ واستعادة بـ pg_dump |

**الاختبارات تعمل على PostgreSQL 16 حقيقي**، لا على قاعدة ذاكرة —
لأن النظام يعتمد على أقفال الصفوف والفهارس الفريدة الجزئية والقيود ودقة `numeric`.

---

## 2. اختبارات القبول الإلزامية — الحالة

| # | السيناريو المطلوب | الاختبار | الحالة |
|---|---|---|---|
| 1 | بيع نقدي مع الباقي وأثر الخزنة الصحيح | `CashSaleTest::test_cash_sale_computes_change_and_moves_the_drawer_by_the_net_only` | ✅ |
| 2 | بيع مختلط لا يزيد النقدية بقيمة البطاقة | `CashSaleTest::test_mixed_payment_does_not_increase_cash_by_the_card_amount` | ✅ |
| 3 | بيع كرتونة وقطع مفردة بتحويل وحدات صحيح | `UnitConversionTest::test_selling_a_carton_and_two_pieces_deducts_fourteen_base_units` | ✅ |
| 4 | خصم فاتورة ثم مرتجع جزئي من القيم الأصلية | `DiscountAndReturnTest::test_invoice_discount_is_spread_over_lines_and_a_partial_return_uses_the_original_values` | ✅ |
| 5 | منع مرتجع يتجاوز الكمية المباعة | `DiscountAndReturnTest::test_returning_more_than_was_sold_is_refused` | ✅ |
| 6 | كاشيران يبيعان آخر قطعة في الوقت نفسه | `ConcurrentOperationsTest::test_two_cashiers_selling_the_last_unit_simultaneously_produce_exactly_one_sale` | ✅ **بعمليات متوازية حقيقية** |
| 7 | إرسال طلب البيع مرتين (ضغط مكرر / شبكة ضعيفة) | `IdempotencyTest::test_sending_the_same_sale_twice_creates_one_invoice_and_deducts_stock_once` | ✅ |
| 8 | انقطاع الرد بعد النجاح ثم استعادة نفس الفاتورة | `IdempotencyTest::test_a_lost_response_is_recovered_by_key_instead_of_reselling` | ✅ |
| 9 | فشل الطباعة بعد اعتماد البيع دون تكراره | `PrintFailureTest::test_a_failed_print_leaves_the_sale_intact_and_is_retried_on_its_own` | ✅ |
| 10 | بيع آجل ثم تحصيل جزئي ثم مرتجع | `CreditSaleTest::test_credit_sale_then_partial_collection_then_return` | ✅ |
| 11 | منع بيع نفس السيريال مرتين | `SerialTrackingTest::test_selling_a_serial_marks_it_sold_and_a_second_sale_of_it_is_refused` | ✅ |
| 12 | استعادة سلة محفوظة بعد إغلاق الصفحة | `HeldCartTest::test_a_parked_cart_is_restored_with_its_contents_after_the_page_closes` | ✅ |
| 13 | مزامنة نفس العملية المحلية أكثر من مرة دون تكرار أثرها | `OfflineSyncTest::test_pushing_the_same_local_operation_twice_applies_it_once` | ✅ |
| 14 | إظهار تعارض أوفلاين للمدير دون محو المبلغ المقبوض | `OfflineSyncTest::test_a_stock_conflict_is_parked_and_a_manager_can_resolve_it` | ✅ |
| 15 | منع غير المخوّل من تغيير السعر أو الوصول للتكلفة عبر API | `PermissionEnforcementTest::test_a_cashier_cannot_override_the_price` + `test_the_api_hides_cost_and_margin_from_a_cashier_but_shows_them_to_a_manager` | ✅ |
| 16 | إغلاق وردية بفرق خزنة وتوثيق الاعتماد | `ShiftCloseTest::test_closing_with_a_shortage_records_the_variance_and_the_report` | ✅ |
| 17 | استعادة نسخة احتياطية ومطابقة أرصدة ومستندات | `BackupRestoreTest::test_an_encrypted_backup_restores_with_matching_balances_and_documents` | ✅ **بـ pg_dump/pg_restore حقيقيين** |

**17 / 17 مغطاة ومارّة.**

---

## 3. تفصيل الملفات

| الملف | الاختبارات | يغطي أيضًا |
|---|---|---|
| `Unit/MoneyTest` | 8 | `0.1+0.2=0.3` بالضبط، عدم الانحراف بعد 1000 جمع، التقريب لفئة نقدية |
| `Unit/SaleTotalsCalculatorTest` | 9 | ترتيب العمليات، توزيع الخصم، الكسر لأكبر بند، الضريبة المدمجة، رفض خصم يتجاوز القيمة |
| `Feature/CashSaleTest` | 3 | + رفض الدفع الناقص |
| `Feature/UnitConversionTest` | 3 | + رفض كسور على صنف بالقطعة، قبولها للموزون |
| `Feature/DiscountAndReturnTest` | 3 | + المرتجع التالف لا يعود لرصيد البيع |
| `Feature/IdempotencyTest` | 4 | + رفض نفس المفتاح بمحتوى مختلف، تحرير المفتاح بعد الفشل |
| `Feature/CreditSaleTest` | 4 | + رفض الآجل بلا عميل، الحد الائتماني، تحصيل يتجاوز المديونية |
| `Feature/SerialTrackingTest` | 5 | + سيريال لكل وحدة، سيريال مجهول، المعيب يُحجر، منع استلام مكرر |
| `Feature/HeldCartTest` | 6 | + التعليق لا يحجز مخزون، منع الاستخدام من جهازين، عرض فروق السعر |
| `Feature/OfflineSyncTest` | 7 | + منع الآجل والسيريال وتجاوز السقف، رفض جهاز غير معتمد، قرار المدير |
| `Feature/PermissionEnforcementTest` | 6 | + رفض المسار على الخادم، الموافقة أحادية الاستخدام، منع الاعتماد الذاتي |
| `Feature/ShiftCloseTest` | 6 | + معادلة النقد المتوقع، **رفض قاعدة البيانات لتعديل سجل التدقيق**، منع وردية مزدوجة |
| `Feature/PrintFailureTest` | 5 | + وسم «نسخة»، الإيصال غير المتزامن، تباعد إعادة المحاولة |
| `Feature/ImportTest` | 5 | + الأخطاء بأرقام الصفوف، رفض ملف به أخطاء، الرصيد الافتتاحي كحركة موثقة |
| `Concurrency/ConcurrentOperationsTest` | 3 | + مرتجعات متزامنة، نفس المفتاح من ثلاث عمليات |
| `Concurrency/BackupRestoreTest` | 1 | التشفير الفعلي والاستعادة والمطابقة حقلًا بحقل |

---

## 4. كيف تُختبر التزامنية فعليًا

اختبارات `tests/Concurrency/` **لا تستخدم** `RefreshDatabase`، لأن العمل يجب أن
يكون **مثبتًا (committed)** حتى تراه عمليات أخرى.

الآلية:
1. تُبنى قاعدة بيانات حقيقية وتُملأ
2. تُطلق **3 عمليات PHP منفصلة** عبر `symfony/process`
3. كلها تنتظر **طابع زمني مشترك بالميكروثانية** ثم تنطلق معًا
4. تُفحص النتائج ويُتحقق من الحالة النهائية في قاعدة البيانات

النتيجة المرصودة: **فاتورة واحدة تنجح، واثنتان تُرفضان بـ `insufficient_stock`**،
والرصيد النهائي صفر بالضبط — لا `-1` ولا `1`.

> **هذا الاختبار كشف خطأً حقيقيًا أثناء التطوير:** تسابق عند توليد **أول** رقم
> مستند لتسلسل جديد. أُصلح باستخدام `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
> في عبارة ذرية واحدة (`app/Modules/Core/Services/SequenceService.php`).

---

## 5. قياس الأداء — أرقام فعلية

### بيئة القياس

| البند | القيمة |
|---|---|
| المعالج | Intel Xeon @ 2.80GHz — **4 أنوية** |
| الذاكرة | 15.7 جيجابايت |
| PHP | 8.4.19 (CLI، بلا OPcache preload) |
| PostgreSQL | 16.13، إعدادات افتراضية، نفس الجهاز |
| الأصناف | **10,000** |
| الفواتير | **50,000** (150,000 بند) |

> بيئة اختبار حاويّة مشتركة، لا خادم مخصص. خادم محل حقيقي بقرص SSD مخصص
> يُتوقع أن يكون **أسرع**، لكن هذه الأرقام هي ما قيس فعلًا.

### النتائج (مللي ثانية)

| العملية | عدد | p50 | p95 | p99 | أبطأ | الهدف | الحالة |
|---|---|---|---|---|---|---|---|
| **مسح باركود وإضافة صنف** | 200 | 6.5 | **9.0** | 10.3 | 12.1 | 150 (p95) | ✅ أسرع من الهدف بـ 16× |
| بحث نصي (50 نتيجة) | 100 | 88.0 | 108.6 | 121.4 | 124.8 | — | مقبول |
| لوحة المالك (30 يومًا) | 10 | 32.3 | 36.1 | 36.1 | 36.1 | — | جيد |
| **اعتماد بيع كامل (3 بنود)** | 30 | 64.7 | **89.7** | 161.6 | 161.6 | 2000 (p95) | ✅ أسرع من الهدف بـ 22× |

أعد الإنتاج:
```bash
php artisan pos:seed-performance --products=10000 --sales=50000
php artisan pos:benchmark --scans=300 --searches=100 --checkouts=50
```

### مواطن البطء المرصودة

| الموضع | الملاحظة |
|---|---|
| **البحث النصي (109 مللي)** | الأبطأ. السبب: `ILIKE '%...%'` على فهرس trigram + استعلام `COUNT` للترقيم. **مقبول لأن مسار الكاشير الساخن هو الباركود (9 مللي)**. لكتالوجات أكبر بكثير يُنصح بـ `tsvector` مخصص. |
| **الذيل في اعتماد البيع (p99 = 162 مللي)** | ناتج عن انتظار قفل صف الترقيم عند تزامن كاشيرات على **نفس** الجهاز. مقصود: يضمن ترقيمًا متصلًا. كاشيرات مختلفة لها نطاقات مختلفة فلا تتنافس. |
| **التزامن على نفس الصنف** | كاشيران على نفس الصنف يتسلسلان على قفل صف الرصيد. هذا هو المطلوب — البديل بيع مخزون غير موجود. |

### ما لم يُقس (بصراحة)

- زمن الطابعة الحرارية والأجهزة الطرفية — **خارج نطاق القياس عمدًا**
- زمن خدمات الدفع الخارجية — غير مُنفَّذة
- أكثر من 3 كاشيرات متزامنة تحت حمل مستمر لساعات
- الأداء عبر شبكة Wi-Fi ضعيفة

> **هذه أهداف قياس وليست ادعاء نجاح مسبق.** الأرقام أعلاه هي ما رُصد على هذه
> البيئة تحديدًا. قِس على أجهزتك قبل التشغيل الحقيقي.

---

## 6. تشغيل الاختبارات

```bash
# تهيئة قاعدة الاختبار (مرة واحدة)
sudo -u postgres psql -c "CREATE DATABASE pos_test OWNER pos;"
sudo -u postgres psql -c "CREATE DATABASE pos_restore_test OWNER pos;"  # لاختبار الاستعادة

php artisan test                            # الكل
php artisan test --testsuite=Unit           # محرك المال فقط (سريع)
php artisan test --testsuite=Feature        # السيناريوهات
php artisan test --testsuite=Concurrency    # التزامن والاستعادة
php artisan test --filter=CashSaleTest      # ملف واحد
```

فحص أنواع الواجهة:
```bash
npm run typecheck    # vue-tsc --noEmit  → نظيف
```
