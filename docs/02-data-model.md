# نموذج البيانات

97 جدولًا. ما يلي هو خريطة العلاقات والقرارات المهمة، لا تعدادًا لكل عمود —
التعريف الكامل في `erp/api/database/migrations/`، وكل ملف مشروح بالتعليقات.

## 1. خريطة الوحدات

```
companies ──┬── branches ──── warehouses ──── bins
            ├── regions ───── routes
            ├── vehicles ──── warehouses (kind='van')
            ├── cost_centers
            └── number_series / settings

users ──┬── roles ──── permissions
        ├── user_scopes          (فروع/مخازن/مناطق)
        ├── devices              (أجهزة المناديب)
        └── custody_accounts     (عهدة نقدية/شيكات لكل محصّل)

items ──┬── item_units ──── barcodes
        ├── batches ──── serials
        ├── item_costs           (المتوسط المرجح المتحرك)
        └── item_suppliers

customers ──┬── customer_addresses / contacts / documents
            ├── customer_assignments   (تاريخ إسناد المندوب)
            └── customer_price_agreements

stock_balances   (الوضع الحالي)
stock_movements  (الدفتر — لا يُعدَّل)
stock_reservations

accounts ──┬── account_mappings   (مفاتيح الترحيل)
           └── journal_entries ──── journal_lines
fiscal_years ──── fiscal_periods
```

## 2. قرارات النمذجة المهمة

### 2.1 المخزن يعرّف قابلية البيع

`warehouses.kind` ∈ {main, sub, van, transit, quarantine, inspection, damaged, returns}

المخازن الأربعة الأخيرة تحمل بضاعة حقيقية **لا تدخل في المتاح للبيع أبدًا**. هذا
يجعل «بضاعة بالطريق» و«تحت الفحص» أرصدة حقيقية قابلة للجرد والمطابقة، بدل أن
تكون حقول حالة على سطر.

### 2.2 كل سيارة لها مخزنها

مخزون السيارة رصيد حقيقي يُجرد ويُحجز عليه ويُطابق. هذا ما يجعل معادلة البضاعة
في إقفال اليوم قابلة للحساب، وما يجعل البيع الأوفلاين آمنًا: الرصيد مخصص حصريًا
لمندوب واحد.

### 2.3 لقطة القيم على المستندات

سطور المستندات تحفظ `unit_factor` و`unit_price` و`discount_pct` و`tax_rate`
كما كانت لحظة الاعتماد. إعادة تعريف الكرتونة من 12 إلى 24 لاحقًا **لا تغير
مستندًا قائمًا** — مُثبت باختبار.

### 2.4 ثلاثة محاور للحالة

`sales_orders` تحمل `status` و`delivery_status` و`invoice_status` و`payment_status`
كحقول مستقلة، لأن الأمر الواقعي يكون مسلّمًا جزئيًا ومفوترًا جزئيًا ومدفوعًا
جزئيًا في آن واحد. حقل حالة واحد يخفي ثلاث حقائق.

### 2.5 حدث خروج البضاعة واحد

`sales_invoices.moves_stock` تكون `true` **فقط** للبيع المباشر/من السيارة حيث لا
يوجد إذن تسليم. عند وجود إذن تسليم، البضاعة خرجت هناك والفاتورة لا تلمس المخزون.
هذا ما يجعل الخصم المزدوج **مستحيلًا هيكليًا** لا «مستبعدًا».

### 2.6 فصل الاستلام عن الفوترة

`goods_receipt_lines.qty_invoiced_base` تتبع ما فُوتر من كل سطر مستلم. الفرق هو
رصيد «بضاعة مستلمة غير مفوترة»، ويجب أن يطابق حساب `grni`.

### 2.7 العهدة حساب حقيقي

`custody_accounts` تربط كل محصّل بحساب في دليل الحسابات. «ما مع المناديب الآن»
رصيد دفتري، لا رقم مستخرج من جدول مساعد قد يختلف مع الدفاتر.

### 2.8 تاريخ إسناد العميل

`customer_assignments` بتاريخي `from_date` و`to_date`. التقارير تستخدم المندوب
الذي كان مسؤولًا **في تاريخ المستند**، فإعادة إسناد عميل لا تنقل مبيعات الربع
الماضي إلى المندوب الجديد.

### 2.9 مراجع الأجهزة منفصلة

`field_no` مرجع الجهاز، `code` الرقم المركزي، `e_invoice_uuid` المرجع الضريبي.
ثلاثة حقول لأنها ثلاثة أشياء مختلفة، ولا يُملأ الأخير إلا بعد قبول فعلي.

## 3. الأنواع

| المحتوى | النوع | الدقة |
|---|---|---|
| الكميات | `NUMERIC(18,4)` | 4 |
| أسعار الوحدة | `NUMERIC(18,4)` | 4 |
| التكلفة | `NUMERIC(20,8)` | 8 |
| المبالغ المُرحّلة | `NUMERIC(18,2)` | 2 |
| معامل التحويل | `NUMERIC(18,6)` | 6 |
| النسب | `NUMERIC(9,4)` | 4 |

**لا يوجد `FLOAT` أو `DOUBLE` في أي حقل مالي أو كمي.**

## 4. القيود في قاعدة البيانات

```sql
-- المخزون السالب مستحيل
CHECK (qty_on_hand >= 0)
CHECK (qty_reserved >= 0)
CHECK (qty_reserved <= qty_on_hand)

-- سطر قيد على جانب واحد فقط
CHECK (NOT (debit > 0 AND credit > 0))

-- الحركة موجبة واتجاهها معروف
CHECK (qty_base > 0)
CHECK (direction IN ('in','out'))

-- مستند واحد = قيد واحد لكل غرض
CREATE UNIQUE INDEX journal_entries_source_uniq
  ON journal_entries (company_id, source_type, source_id, purpose)
  WHERE source_type IS NOT NULL AND reversed_by_id IS NULL;

-- عملية ميدانية واحدة = مستند واحد
UNIQUE (company_id, idempotency_key)      -- sync_operations
CREATE UNIQUE INDEX ... ON sales_invoices (company_id, client_uuid)
  WHERE client_uuid IS NOT NULL;
```

### Triggers

| الاسم | الغرض |
|---|---|
| `journal_lines_balanced` | constraint trigger مؤجل: يرفض قيدًا مرحّلًا غير متوازن عند COMMIT |
| `journal_lines_immutable` | يمنع `UPDATE`/`DELETE` على سطور قيد مرحّل |

القيد المؤجل ضروري ليتمكن الترحيل من إدخال السطور واحدًا تلو الآخر، ثم يُفحص
المجموع مرة واحدة في النهاية.

## 5. العكس يبقي الأصل

`journal_entries.reversed_by_id` يشير من القيد الأصلي إلى مرآته. الأصل **يبقى
بحالة `posted` وداخل كل استعلام أرصدة** — العكس يعمل بأن القيدين يتعادلان إلى
صفر، لا بإخفاء الأول. إخفاؤه يترك المرآة وحدها ويشوّه الحساب.

هذا المؤشر أيضًا يحرر خانة التفرد، فيمكن ترحيل مستند مصحّح للمصدر نفسه دون
إخراج التاريخ من الدفاتر.
