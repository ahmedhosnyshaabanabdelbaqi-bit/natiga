# الصلاحيات والأدوار

## المبدأ

**الرفض الافتراضي:** ما لا يُمنح صراحةً يُرفض. التحقق يتم **في السيرفر على كل طلب**
عبر وسيط `permission:` — إخفاء زر أو عمود في الواجهة لا يُعد حماية.

### أبعاد التقييد

| البعد | كيف يُطبَّق |
|---|---|
| العملية | كود صلاحية مستقل لكل عملية (عرض/إنشاء/تعديل/اعتماد/ترحيل/إلغاء/تصدير) |
| السجل | المندوب يرى عملاءه المسندين فقط — القيد داخل الاستعلام نفسه، فالوصول بمعرّف سجل آخر يعيد 404 |
| الفرع | `user_scopes` بنوع `branch` |
| المخزن | `user_scopes` بنوع `warehouse` |
| التكلفة والربح | `reports.cost.view` و`reports.profit.view` — القيم **لا تُرسل أصلًا** في الاستجابة لغير المخوّل |
| تجاوز الخصم | `price_list.override_discount` |
| تجاوز الائتمان | `customer.override_credit` مع تسجيل السبب |

### كلمة المرور المؤقتة

كلمة مرور المدير تُولَّد عند `php artisan erp:install` وتُعرض مرة واحدة على الشاشة،
فهي معروفة لكل من رأى شاشة التثبيت. لذلك يحمل المستخدم راية `must_change_password`
ويمنع وسيط `password.changed` كل المسارات عدا `auth/me` و`auth/logout`
و`auth/change-password` حتى تتغيّر فعليًا. المنع في السيرفر لا في الواجهة:
تحديث الصفحة أو استدعاء الـ API مباشرة لا يتجاوزه.

عند تغيير كلمة المرور تُبطَل كل الجلسات الأخرى للمستخدم نفسه.

### فصل المنشئ عن المعتمد

في العمليات الحساسة لا يجوز أن يعتمد المنشئ عمليته: اعتماد المصروف يرفض إن كان المعتمد هو المنشئ،
وقواعد الموافقة تحمل `require_different_approver`.

### المسؤولية التاريخية

تغيير صلاحية المستخدم أو سحب أدواره **لا يمحو** مسؤوليته عن العمليات السابقة:
سجل المراجعة يحتفظ بالاسم والوقت والتغيير، ولا توجد صلاحية لحذفه.

## الصلاحيات الحساسة

لا تُمنح افتراضيًا وتحتاج قرارًا صريحًا:

- `accounting.journal_reverse` — عكس قيد مرحل
- `accounting.period_reopen` — إعادة فتح فترة مالية
- `audit.export` — تصدير سجل المراجعة
- `backup.restore` — استعادة نسخة
- `customer.override_credit` — تجاوز الحد الائتماني
- `day_closure.reopen` — إعادة فتح يوم مقفل
- `day_closure.sync_exception` — منح استثناء من اكتمال المزامنة
- `device.grant_offline` — منح تفويض أوفلاين
- `price_list.override_discount` — تجاوز حد الخصم
- `reports.cost.view` — مشاهدة التكلفة
- `reports.profit.view` — مشاهدة الربح
- `sales_return.cash_refund` — اعتماد استرداد نقدي
- `sales_return.without_invoice` — اعتماد مرتجع بلا فاتورة
- `settings.posting_matrix` — إدارة مصفوفة الترحيل
- `stock.adjust_approve` — اعتماد تسوية مخزنية
- `variance.approve` — اعتماد المحضر

## مصفوفة الأدوار

عدد الصلاحيات الممنوحة لكل دور:

| الدور | الكود | عدد الصلاحيات |
|---|---|---|
| مالك النظام | `owner` | 263 |
| مدير شركة | `company_manager` | 261 |
| مدير فرع | `branch_manager` | 61 |
| مدير مبيعات | `sales_manager` | 51 |
| مشرف مناديب | `supervisor` | 35 |
| مندوب | `salesman` | 23 |
| محصل | `collector` | 10 |
| سائق | `driver` | 5 |
| أمين مخزن | `warehouse_keeper` | 21 |
| مشتريات | `purchasing` | 29 |
| محاسب | `accountant` | 86 |
| مدير مالي | `finance_manager` | 83 |
| مراجع (قراءة فقط) | `auditor` | 25 |

## كتالوج الصلاحيات


### الحسابات (`accounting`)

| الكود | الوصف | حساسة |
|---|---|---|
| `accounting.chart_manage` | إدارة دليل الحسابات | — |
| `accounting.export` | تصدير التقارير المالية | — |
| `accounting.journal_create` | إنشاء قيد يدوي | — |
| `accounting.journal_post` | ترحيل القيود | — |
| `accounting.journal_reverse` | عكس قيد مرحل | نعم |
| `accounting.period_close` | إقفال الفترات المالية | — |
| `accounting.period_reopen` | إعادة فتح فترة مالية | نعم |
| `accounting.view` | عرض الحسابات والقيود | — |

### الموافقات (`approval`)

| الكود | الوصف | حساسة |
|---|---|---|
| `approval.act` | اتخاذ قرار في الموافقات | — |
| `approval.view` | عرض الموافقات | — |

### سجل المراجعة (`audit`)

| الكود | الوصف | حساسة |
|---|---|---|
| `audit.export` | تصدير سجل المراجعة | نعم |
| `audit.view` | عرض سجل المراجعة | — |

### النسخ الاحتياطية (`backup`)

| الكود | الوصف | حساسة |
|---|---|---|
| `backup.restore` | استعادة نسخة | نعم |
| `backup.run` | تشغيل نسخة احتياطية | — |
| `backup.view` | عرض النسخ الاحتياطية | — |

### البنوك (`bank`)

| الكود | الوصف | حساسة |
|---|---|---|
| `bank.create` | إنشاء الحسابات البنكية | — |
| `bank.delete` | حذف الحسابات البنكية | — |
| `bank.export` | تصدير الحسابات البنكية | — |
| `bank.reconcile` | المطابقة البنكية | — |
| `bank.update` | تعديل الحسابات البنكية | — |
| `bank.view` | عرض الحسابات البنكية | — |

### الخزن (`cash_box`)

| الكود | الوصف | حساسة |
|---|---|---|
| `cash_box.create` | إنشاء الخزن | — |
| `cash_box.delete` | حذف الخزن | — |
| `cash_box.export` | تصدير الخزن | — |
| `cash_box.update` | تعديل الخزن | — |
| `cash_box.view` | عرض الخزن | — |

### توريد العهد (`cash_deposit`)

| الكود | الوصف | حساسة |
|---|---|---|
| `cash_deposit.approve` | اعتماد توريد العهد النقدية | — |
| `cash_deposit.cancel` | إلغاء توريد العهد النقدية | — |
| `cash_deposit.create` | إنشاء توريد العهد النقدية | — |
| `cash_deposit.delete` | حذف توريد العهد النقدية | — |
| `cash_deposit.export` | تصدير توريد العهد النقدية | — |
| `cash_deposit.post` | ترحيل توريد العهد النقدية | — |
| `cash_deposit.update` | تعديل توريد العهد النقدية | — |
| `cash_deposit.view` | عرض توريد العهد النقدية | — |

### الشيكات (`cheque`)

| الكود | الوصف | حساسة |
|---|---|---|
| `cheque.clear` | تحصيل/رفض الشيك | — |
| `cheque.create` | إنشاء الشيكات | — |
| `cheque.delete` | حذف الشيكات | — |
| `cheque.export` | تصدير الشيكات | — |
| `cheque.update` | تعديل الشيكات | — |
| `cheque.view` | عرض الشيكات | — |

### العمولات (`commission`)

| الكود | الوصف | حساسة |
|---|---|---|
| `commission.configure` | إدارة قواعد العمولات | — |
| `commission.settle` | تسوية واعتماد العمولات | — |
| `commission.view` | عرض العمولات | — |

### الشركة والفروع (`company`)

| الكود | الوصف | حساسة |
|---|---|---|
| `company.create` | إنشاء بيانات الشركة والفروع | — |
| `company.delete` | حذف بيانات الشركة والفروع | — |
| `company.export` | تصدير بيانات الشركة والفروع | — |
| `company.update` | تعديل بيانات الشركة والفروع | — |
| `company.view` | عرض بيانات الشركة والفروع | — |

### العملاء (`customer`)

| الكود | الوصف | حساسة |
|---|---|---|
| `customer.create` | إنشاء العملاء | — |
| `customer.delete` | حذف العملاء | — |
| `customer.export` | تصدير العملاء | — |
| `customer.override_credit` | تجاوز الحد الائتماني | نعم |
| `customer.unblock` | رفع الإيقاف عن عميل | — |
| `customer.update` | تعديل العملاء | — |
| `customer.view` | عرض العملاء | — |
| `customer.view_all` | عرض كل العملاء وليس المسندين فقط | — |

### سندات القبض (`customer_receipt`)

| الكود | الوصف | حساسة |
|---|---|---|
| `customer_receipt.approve` | اعتماد سندات القبض | — |
| `customer_receipt.cancel` | إلغاء سندات القبض | — |
| `customer_receipt.create` | إنشاء سندات القبض | — |
| `customer_receipt.delete` | حذف سندات القبض | — |
| `customer_receipt.export` | تصدير سندات القبض | — |
| `customer_receipt.post` | ترحيل سندات القبض | — |
| `customer_receipt.update` | تعديل سندات القبض | — |
| `customer_receipt.view` | عرض سندات القبض | — |

### إقفال اليوم (`day_closure`)

| الكود | الوصف | حساسة |
|---|---|---|
| `day_closure.approve` | اعتماد الإقفال | — |
| `day_closure.close` | إقفال اليوم | — |
| `day_closure.reopen` | إعادة فتح يوم مقفل | نعم |
| `day_closure.sync_exception` | منح استثناء من اكتمال المزامنة | نعم |
| `day_closure.view` | عرض إقفال اليوم | — |

### أذون التسليم (`delivery_note`)

| الكود | الوصف | حساسة |
|---|---|---|
| `delivery_note.approve` | اعتماد أذون التسليم | — |
| `delivery_note.cancel` | إلغاء أذون التسليم | — |
| `delivery_note.create` | إنشاء أذون التسليم | — |
| `delivery_note.delete` | حذف أذون التسليم | — |
| `delivery_note.export` | تصدير أذون التسليم | — |
| `delivery_note.post` | ترحيل أذون التسليم | — |
| `delivery_note.update` | تعديل أذون التسليم | — |
| `delivery_note.view` | عرض أذون التسليم | — |

### الأجهزة (`device`)

| الكود | الوصف | حساسة |
|---|---|---|
| `device.deactivate` | إيقاف جهاز | — |
| `device.grant_offline` | منح تفويض أوفلاين | نعم |
| `device.register` | تسجيل جهاز | — |
| `device.view` | عرض الأجهزة | — |

### مركز الاستثناءات (`exception`)

| الكود | الوصف | حساسة |
|---|---|---|
| `exception.review` | مراجعة إشارات الاستثناء | — |
| `exception.view` | عرض مركز الاستثناءات | — |

### المصروفات (`expense`)

| الكود | الوصف | حساسة |
|---|---|---|
| `expense.approve` | اعتماد المصروفات | — |
| `expense.cancel` | إلغاء المصروفات | — |
| `expense.create` | إنشاء المصروفات | — |
| `expense.delete` | حذف المصروفات | — |
| `expense.export` | تصدير المصروفات | — |
| `expense.post` | ترحيل المصروفات | — |
| `expense.update` | تعديل المصروفات | — |
| `expense.view` | عرض المصروفات | — |

### استلام البضاعة (`goods_receipt`)

| الكود | الوصف | حساسة |
|---|---|---|
| `goods_receipt.approve` | اعتماد استلام البضاعة | — |
| `goods_receipt.cancel` | إلغاء استلام البضاعة | — |
| `goods_receipt.create` | إنشاء استلام البضاعة | — |
| `goods_receipt.delete` | حذف استلام البضاعة | — |
| `goods_receipt.export` | تصدير استلام البضاعة | — |
| `goods_receipt.post` | ترحيل استلام البضاعة | — |
| `goods_receipt.update` | تعديل استلام البضاعة | — |
| `goods_receipt.view` | عرض استلام البضاعة | — |

### الاستيراد (`import`)

| الكود | الوصف | حساسة |
|---|---|---|
| `import.apply` | اعتماد الاستيراد | — |
| `import.upload` | رفع ملف | — |
| `import.view` | عرض الاستيراد | — |

### التكاملات (`integration`)

| الكود | الوصف | حساسة |
|---|---|---|
| `integration.configure` | تهيئة التكاملات | — |
| `integration.view` | عرض التكاملات | — |

### الأصناف (`item`)

| الكود | الوصف | حساسة |
|---|---|---|
| `item.create` | إنشاء الأصناف | — |
| `item.delete` | حذف الأصناف | — |
| `item.export` | تصدير الأصناف | — |
| `item.update` | تعديل الأصناف | — |
| `item.view` | عرض الأصناف | — |

### التكاليف الإضافية (`landed_cost`)

| الكود | الوصف | حساسة |
|---|---|---|
| `landed_cost.approve` | اعتماد التكاليف الإضافية | — |
| `landed_cost.cancel` | إلغاء التكاليف الإضافية | — |
| `landed_cost.create` | إنشاء التكاليف الإضافية | — |
| `landed_cost.delete` | حذف التكاليف الإضافية | — |
| `landed_cost.export` | تصدير التكاليف الإضافية | — |
| `landed_cost.post` | ترحيل التكاليف الإضافية | — |
| `landed_cost.update` | تعديل التكاليف الإضافية | — |
| `landed_cost.view` | عرض التكاليف الإضافية | — |

### أوامر التحميل (`load_order`)

| الكود | الوصف | حساسة |
|---|---|---|
| `load_order.approve` | اعتماد أوامر تحميل السيارات | — |
| `load_order.cancel` | إلغاء أوامر تحميل السيارات | — |
| `load_order.create` | إنشاء أوامر تحميل السيارات | — |
| `load_order.delete` | حذف أوامر تحميل السيارات | — |
| `load_order.export` | تصدير أوامر تحميل السيارات | — |
| `load_order.post` | ترحيل أوامر تحميل السيارات | — |
| `load_order.update` | تعديل أوامر تحميل السيارات | — |
| `load_order.view` | عرض أوامر تحميل السيارات | — |

### قوائم الأسعار (`price_list`)

| الكود | الوصف | حساسة |
|---|---|---|
| `price_list.create` | إنشاء قوائم الأسعار | — |
| `price_list.delete` | حذف قوائم الأسعار | — |
| `price_list.export` | تصدير قوائم الأسعار | — |
| `price_list.override_discount` | تجاوز حد الخصم | نعم |
| `price_list.update` | تعديل قوائم الأسعار | — |
| `price_list.view` | عرض قوائم الأسعار | — |

### العروض (`promotion`)

| الكود | الوصف | حساسة |
|---|---|---|
| `promotion.create` | إنشاء العروض | — |
| `promotion.delete` | حذف العروض | — |
| `promotion.export` | تصدير العروض | — |
| `promotion.update` | تعديل العروض | — |
| `promotion.view` | عرض العروض | — |

### أوامر الشراء (`purchase_order`)

| الكود | الوصف | حساسة |
|---|---|---|
| `purchase_order.approve` | اعتماد أوامر الشراء | — |
| `purchase_order.cancel` | إلغاء أوامر الشراء | — |
| `purchase_order.create` | إنشاء أوامر الشراء | — |
| `purchase_order.delete` | حذف أوامر الشراء | — |
| `purchase_order.export` | تصدير أوامر الشراء | — |
| `purchase_order.post` | ترحيل أوامر الشراء | — |
| `purchase_order.update` | تعديل أوامر الشراء | — |
| `purchase_order.view` | عرض أوامر الشراء | — |

### مرتجع مشتريات (`purchase_return`)

| الكود | الوصف | حساسة |
|---|---|---|
| `purchase_return.approve` | اعتماد مرتجعات المشتريات | — |
| `purchase_return.cancel` | إلغاء مرتجعات المشتريات | — |
| `purchase_return.create` | إنشاء مرتجعات المشتريات | — |
| `purchase_return.delete` | حذف مرتجعات المشتريات | — |
| `purchase_return.export` | تصدير مرتجعات المشتريات | — |
| `purchase_return.post` | ترحيل مرتجعات المشتريات | — |
| `purchase_return.update` | تعديل مرتجعات المشتريات | — |
| `purchase_return.view` | عرض مرتجعات المشتريات | — |

### عروض الأسعار (`quotation`)

| الكود | الوصف | حساسة |
|---|---|---|
| `quotation.create` | إنشاء عروض الأسعار | — |
| `quotation.delete` | حذف عروض الأسعار | — |
| `quotation.export` | تصدير عروض الأسعار | — |
| `quotation.update` | تعديل عروض الأسعار | — |
| `quotation.view` | عرض عروض الأسعار | — |

### التقارير (`reports`)

| الكود | الوصف | حساسة |
|---|---|---|
| `reports.accounting` | تقارير الحسابات | — |
| `reports.cost.view` | مشاهدة التكلفة | نعم |
| `reports.export` | تصدير التقارير | — |
| `reports.inventory` | تقارير المخازن | — |
| `reports.management` | تقارير الإدارة | — |
| `reports.profit.view` | مشاهدة الربح | نعم |
| `reports.sales` | تقارير المبيعات | — |
| `reports.salesmen` | تقارير المناديب | — |

### الأدوار (`role`)

| الكود | الوصف | حساسة |
|---|---|---|
| `role.create` | إنشاء الأدوار والصلاحيات | — |
| `role.delete` | حذف الأدوار والصلاحيات | — |
| `role.export` | تصدير الأدوار والصلاحيات | — |
| `role.update` | تعديل الأدوار والصلاحيات | — |
| `role.view` | عرض الأدوار والصلاحيات | — |

### فواتير البيع (`sales_invoice`)

| الكود | الوصف | حساسة |
|---|---|---|
| `sales_invoice.approve` | اعتماد فواتير البيع | — |
| `sales_invoice.cancel` | إلغاء فواتير البيع | — |
| `sales_invoice.create` | إنشاء فواتير البيع | — |
| `sales_invoice.delete` | حذف فواتير البيع | — |
| `sales_invoice.export` | تصدير فواتير البيع | — |
| `sales_invoice.post` | ترحيل فواتير البيع | — |
| `sales_invoice.reprint` | إعادة طباعة الفاتورة | — |
| `sales_invoice.update` | تعديل فواتير البيع | — |
| `sales_invoice.view` | عرض فواتير البيع | — |

### أوامر البيع (`sales_order`)

| الكود | الوصف | حساسة |
|---|---|---|
| `sales_order.approve` | اعتماد أوامر البيع | — |
| `sales_order.cancel` | إلغاء أوامر البيع | — |
| `sales_order.create` | إنشاء أوامر البيع | — |
| `sales_order.delete` | حذف أوامر البيع | — |
| `sales_order.export` | تصدير أوامر البيع | — |
| `sales_order.post` | ترحيل أوامر البيع | — |
| `sales_order.update` | تعديل أوامر البيع | — |
| `sales_order.view` | عرض أوامر البيع | — |

### مرتجعات المبيعات (`sales_return`)

| الكود | الوصف | حساسة |
|---|---|---|
| `sales_return.approve` | اعتماد مرتجعات المبيعات | — |
| `sales_return.cancel` | إلغاء مرتجعات المبيعات | — |
| `sales_return.cash_refund` | اعتماد استرداد نقدي | نعم |
| `sales_return.create` | إنشاء مرتجعات المبيعات | — |
| `sales_return.delete` | حذف مرتجعات المبيعات | — |
| `sales_return.export` | تصدير مرتجعات المبيعات | — |
| `sales_return.post` | ترحيل مرتجعات المبيعات | — |
| `sales_return.receive` | استلام المرتجع فعليًا | — |
| `sales_return.update` | تعديل مرتجعات المبيعات | — |
| `sales_return.view` | عرض مرتجعات المبيعات | — |
| `sales_return.without_invoice` | اعتماد مرتجع بلا فاتورة | نعم |

### المناديب (`salesman`)

| الكود | الوصف | حساسة |
|---|---|---|
| `salesman.assign_customers` | إسناد العملاء | — |
| `salesman.create` | إنشاء المناديب | — |
| `salesman.delete` | حذف المناديب | — |
| `salesman.export` | تصدير المناديب | — |
| `salesman.update` | تعديل المناديب | — |
| `salesman.view` | عرض المناديب | — |
| `salesman.view_location` | مشاهدة آخر موقع | — |

### الإعدادات (`settings`)

| الكود | الوصف | حساسة |
|---|---|---|
| `settings.posting_matrix` | إدارة مصفوفة الترحيل | نعم |
| `settings.update` | تعديل الإعدادات | — |
| `settings.view` | عرض الإعدادات | — |

### المخزون (`stock`)

| الكود | الوصف | حساسة |
|---|---|---|
| `stock.adjust` | إنشاء تسوية مخزنية | — |
| `stock.adjust_approve` | اعتماد تسوية مخزنية | نعم |
| `stock.count` | إجراء الجرد | — |
| `stock.count_approve` | اعتماد فروق الجرد | — |
| `stock.export` | تصدير تقارير المخزون | — |
| `stock.reclassify` | إعادة تصنيف حالة الرصيد | — |
| `stock.transfer` | إنشاء تحويل مخزني | — |
| `stock.transfer_receive` | استلام تحويل مخزني | — |
| `stock.view` | عرض الأرصدة والحركات | — |

### الموردون (`supplier`)

| الكود | الوصف | حساسة |
|---|---|---|
| `supplier.create` | إنشاء الموردين | — |
| `supplier.delete` | حذف الموردين | — |
| `supplier.export` | تصدير الموردين | — |
| `supplier.update` | تعديل الموردين | — |
| `supplier.view` | عرض الموردين | — |

### فواتير الموردين (`supplier_invoice`)

| الكود | الوصف | حساسة |
|---|---|---|
| `supplier_invoice.approve` | اعتماد فواتير الموردين | — |
| `supplier_invoice.cancel` | إلغاء فواتير الموردين | — |
| `supplier_invoice.create` | إنشاء فواتير الموردين | — |
| `supplier_invoice.delete` | حذف فواتير الموردين | — |
| `supplier_invoice.export` | تصدير فواتير الموردين | — |
| `supplier_invoice.post` | ترحيل فواتير الموردين | — |
| `supplier_invoice.update` | تعديل فواتير الموردين | — |
| `supplier_invoice.view` | عرض فواتير الموردين | — |

### مدفوعات الموردين (`supplier_payment`)

| الكود | الوصف | حساسة |
|---|---|---|
| `supplier_payment.approve` | اعتماد مدفوعات الموردين | — |
| `supplier_payment.cancel` | إلغاء مدفوعات الموردين | — |
| `supplier_payment.create` | إنشاء مدفوعات الموردين | — |
| `supplier_payment.delete` | حذف مدفوعات الموردين | — |
| `supplier_payment.export` | تصدير مدفوعات الموردين | — |
| `supplier_payment.post` | ترحيل مدفوعات الموردين | — |
| `supplier_payment.update` | تعديل مدفوعات الموردين | — |
| `supplier_payment.view` | عرض مدفوعات الموردين | — |

### المزامنة (`sync`)

| الكود | الوصف | حساسة |
|---|---|---|
| `sync.resolve_conflict` | حل تعارضات المزامنة | — |
| `sync.view` | عرض حالة المزامنة | — |

### المستهدفات (`target`)

| الكود | الوصف | حساسة |
|---|---|---|
| `target.create` | إنشاء المستهدفات | — |
| `target.delete` | حذف المستهدفات | — |
| `target.export` | تصدير المستهدفات | — |
| `target.update` | تعديل المستهدفات | — |
| `target.view` | عرض المستهدفات | — |

### المستخدمون (`user`)

| الكود | الوصف | حساسة |
|---|---|---|
| `user.assign_roles` | إسناد الأدوار | — |
| `user.create` | إنشاء المستخدمين | — |
| `user.delete` | حذف المستخدمين | — |
| `user.export` | تصدير المستخدمين | — |
| `user.reset_password` | إعادة تعيين كلمة المرور | — |
| `user.update` | تعديل المستخدمين | — |
| `user.view` | عرض المستخدمين | — |

### محاضر الفروق (`variance`)

| الكود | الوصف | حساسة |
|---|---|---|
| `variance.approve` | اعتماد المحضر | نعم |
| `variance.create` | إنشاء محضر | — |
| `variance.view` | عرض محاضر العجز والزيادة | — |

### الزيارات (`visit`)

| الكود | الوصف | حساسة |
|---|---|---|
| `visit.execute` | تنفيذ الزيارات | — |
| `visit.plan` | تخطيط الزيارات | — |
| `visit.view` | عرض الزيارات | — |

### المخازن (`warehouse`)

| الكود | الوصف | حساسة |
|---|---|---|
| `warehouse.create` | إنشاء المخازن | — |
| `warehouse.delete` | حذف المخازن | — |
| `warehouse.export` | تصدير المخازن | — |
| `warehouse.update` | تعديل المخازن | — |
| `warehouse.view` | عرض المخازن | — |

---

**إجمالي الصلاحيات: 263** موزعة على 45 وحدة، و**13 أدوار** أساسية.

يمكن إنشاء أدوار إضافية من لوحة التحكم بأي تركيبة صلاحيات.
