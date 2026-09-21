# التشغيل

## 1. المتطلبات

| المكوّن | الإصدار |
|---|---|
| PHP | 8.3 أو أحدث، مع `pdo_pgsql` |
| PostgreSQL | 15 أو أحدث (مُختبر على 16) |
| Node.js | 20 أو أحدث |
| Flutter | 3.24 أو أحدث (لتطبيق المندوب فقط) |

**امتدادات PHP اختيارية للأداء:** `bcmath` أو `gmp`. النظام يعمل بدونهما —
`brick/math` يتراجع إلى حساب بنقاء PHP والنتائج **مطابقة تمامًا** — لكن تثبيت
أحدهما يجعل الحساب أسرع.

> النظام مبني على PostgreSQL ويعتمد على خصائص فيه: triggers مؤجلة، فهارس فريدة
> جزئية، `FILTER`, ودقة `NUMERIC`. **لا يعمل على MySQL أو SQLite.**

## 2. قاعدة البيانات

```bash
sudo -u postgres createuser --pwprompt erp
sudo -u postgres createdb -O erp erp
sudo -u postgres createdb -O erp erp_test   # للاختبارات
```

## 3. الخادم وواجهة API

```bash
cd erp/api
composer install
cp .env.example .env
php artisan key:generate
```

اضبط في `.env`:

```ini
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=erp
DB_USERNAME=erp
DB_PASSWORD=********

APP_TIMEZONE=Africa/Cairo
APP_LOCALE=ar
ERP_DEFAULT_CURRENCY=EGP

# حساب المالك الأول. غيّر كلمة المرور بعد أول دخول.
ERP_OWNER_EMAIL=owner@yourcompany.example
ERP_OWNER_PASSWORD=<كلمة مرور قوية>
```

ثم:

```bash
php artisan migrate --force
php artisan db:seed --force      # الصلاحيات، الشركة، دليل الحسابات، الأدوار
php artisan serve --host=0.0.0.0 --port=8000
```

> `db:seed` **لا يُدخل بيانات تجريبية**. لا فواتير ولا عملاء وهميين في دفاتر
> التشغيل.

## 4. واجهة الويب

```bash
cd erp/web
npm install
cp .env.example .env.local        # اضبط VITE_API_URL
npm run dev                       # تطوير
npm run build                     # إنتاج → dist/
```

## 5. تطبيق المندوب

```bash
cd erp/mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://erp.yourcompany.example/api/v1
```

> **لم يُجمَّع هذا التطبيق ولم يُشغَّل** في بيئة إنشاء المشروع. راجع
> `docs/09-status.md` و`erp/mobile/README.md`.

## 6. خطوات ما قبل التشغيل الفعلي

بالترتيب:

1. **اعتمد مصفوفة الترحيل** من الإعدادات ← مصفوفة الترحيل. النظام يرفض ترحيل أي
   مستند يحتاج حسابًا غير مربوط، فالشاشة شرط تشغيل.
2. **راجع نسب الضريبة** وتواريخ سريانها — الإعداد الافتراضي للاختبار.
3. **أنشئ المخازن غير البيعية**: بالطريق، تحت الفحص، الحجر، التالف، مرتجعات
   للمورد. عدة خدمات ترفض العمل بدونها، لأن بضاعة بلا مكان شرعي يجب أن تفشل
   بوضوح لا أن تعود للرف.
4. **أنشئ حسابات العهدة** لكل محصّل من شاشة العهد.
5. **اضبط النطاقات** لكل مستخدم (فروع/مخازن).
6. **اضبط النسخ الاحتياطية** واختبر الاسترجاع فعليًا.
7. **غيّر كلمة مرور المالك** بعد أول دخول.

## 7. التشغيل المحلي داخل الشركة

الخادم وقاعدة البيانات على جهاز داخل الشبكة، والأجهزة تتصل به عبر الشبكة
المحلية. **لا حاجة لإنترنت خارجي** للبيع والمخازن والحسابات.

الإنترنت الخارجي يلزم فقط لما هو خارجي بطبيعته: الفاتورة الإلكترونية، الرسائل،
الخرائط — وكلها اختيارية ومعطلة افتراضيًا، وتظهر بحالة «غير مهيأة» بوضوح بدل
ادعاء نجاح وهمي.

## 8. الاختبارات

```bash
cd erp/api
php artisan migrate:fresh --env=testing --force
vendor/bin/phpunit
```

98 اختبارًا يجب أن تنجح جميعها. فشل أي منها يعني أن ثابتًا أساسيًا انكسر — راجع
`docs/09-status.md` لمعرفة ما يغطيه كل ملف.

## 9. الطوابير

الإعداد الافتراضي `QUEUE_CONNECTION=database`. لتشغيل العامل:

```bash
php artisan queue:work --tries=3
```

> لا توجد مهام خلفية فعلية بعد. راجع `docs/09-status.md`.
