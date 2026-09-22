# إرشادات العمل على هذا المستودع

نظام نقاط بيع وإدارة محلات. **الأولوية الأولى سلامة الأموال والبيانات**، ثم سرعة
شاشة البيع. اقرأ `docs/ARCHITECTURE.md` قبل أي تعديل في منطق المال أو المخزون.

## أوامر أساسية

```bash
php artisan test                    # 78 اختبارًا (يحتاج PostgreSQL: pos_test, pos_restore_test)
php artisan test --testsuite=Unit   # محرك المال فقط، سريع
npm run typecheck                   # vue-tsc --noEmit
npm run build                       # typecheck + vite build
npm run smoke                       # فحص متصفح يدوي (يحتاج خادمًا يعمل وبيانات تجريبية)
./vendor/bin/pint                   # تنسيق PHP
```

قاعدة الاختبار **PostgreSQL وليست SQLite** — النظام يعتمد على أقفال الصفوف
والفهارس الفريدة الجزئية والقيود ودقة `numeric`.

## قواعد لا يجوز كسرها

1. **لا `float` في أي حساب مالي.** استخدم `App\Support\Money` و`Quantity`
   (وفي الواجهة `resources/js/lib/money.ts`). المبالغ تُنقل كنصوص في الـAPI.
2. **لا تغيّر رصيد مخزون مباشرة.** كل تغيّر يمر عبر `InventoryService::record()`
   ويكتب صفًا في `stock_movements`.
3. **لا تعدّل رصيد خزنة مباشرة.** استخدم `CashService::record()`.
4. **كل عملية مالية داخل `DB::transaction` واحدة**، والآثار الجانبية (طباعة،
   تكاملات) تذهب إلى `OutboxService` وتُنفَّذ بعد الـcommit.
5. **الصلاحيات على الخادم.** كل مسار حساس يحمل `permission:`، والاستجابات
   تُفلتَر (الكاشير لا يرى التكلفة حتى من الـAPI).
6. **لا تلتقط انتهاك فرادة داخل معاملة.** في PostgreSQL العبارة الفاشلة تُجهض
   المعاملة كلها — استخدم `ON CONFLICT DO NOTHING/UPDATE` أو تحقّق قبل الإدراج.
   (هذا الخطأ وقع مرتين أثناء التطوير وأصلحته الاختبارات.)
7. **لا تخزّن نماذج Eloquent في الكاش المشترك.** خزّن المعرّف وأعد الجلب.
8. **لا تدّعي ما لم يُنفَّذ.** حدّث `docs/STATUS.md` مع أي وحدة جديدة، ولا تعرض
   أزرارًا لا تعمل.

## أين يوجد ماذا

| المنطق | الملف |
|---|---|
| حساب الإجماليات والخصومات والضريبة | `app/Modules/Sales/Services/SaleTotalsCalculator.php` |
| اعتماد البيع (المعاملة الكاملة) | `app/Modules/Sales/Services/SaleService.php` |
| المرتجعات | `app/Modules/Sales/Services/ReturnService.php` |
| المخزون والتكلفة | `app/Modules/Inventory/Services/InventoryService.php` |
| الخزنة والورديات | `app/Modules/Cash/Services/` |
| منع التكرار | `app/Modules/Sync/Services/IdempotencyService.php` |
| المزامنة دون خادم | `app/Modules/Sync/Services/OfflineSyncService.php` |
| شاشة البيع | `resources/js/views/PosView.vue` + `stores/cart.ts` |

## عند إضافة ميزة

1. هل تمس المال أو المخزون؟ اكتب الاختبار أولًا في `tests/Feature/`.
2. هل فيها تزامن؟ أضف اختبارًا في `tests/Concurrency/` بعمليات متوازية حقيقية.
3. هل هي خاصة بنشاط معيّن؟ ضعها خلف مفتاح في `config/pos.php → features`.
4. حدّث `docs/STATUS.md` و`docs/API.md`.
