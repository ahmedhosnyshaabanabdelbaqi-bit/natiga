# دليل التشغيل

---

## ١. التشغيل بـ Docker Compose (الموصى به)

```bash
cd erp
cp .env.example .env
```

عدّل `.env` وعرّف على الأقل:

```
DB_PASSWORD=<كلمة مرور قوية>
ERP_BACKUP_KEY=<مفتاح تشفير النسخ — احفظه خارج الخادم>
```

ولّد مفتاح التطبيق وضعه في `APP_KEY`:

```bash
docker compose run --rm api php artisan key:generate --show
```

ثم شغّل الحزمة:

```bash
docker compose up -d --build
docker compose exec api php artisan erp:install
```

الأمر يطبع كلمة مرور المدير **مرة واحدة فقط**. غيّرها فور الدخول — النظام يُلزم بذلك.

| الخدمة | العنوان |
|---|---|
| الواجهة | http://localhost:8080 |
| API | http://localhost:8000/api/v1 |
| فحص الصحة | http://localhost:8000/api/v1/health |

لتحميل بيانات تجريبية (**بيئة الاختبار فقط**):

```bash
docker compose exec api php artisan db:seed --class=DemoDataSeeder
```

---

## ٢. التشغيل بلا Docker

**المتطلبات:** PHP 8.3+ مع `pdo_pgsql` و`intl` و`mbstring`، Composer 2، PostgreSQL 15+، Node.js 20+.

### الخلفية

```bash
cd erp/backend
composer install
cp .env.example .env
php artisan key:generate
```

عدّل `.env` ببيانات قاعدة البيانات، ثم:

```bash
php artisan migrate
php artisan erp:install
php artisan serve --host=0.0.0.0 --port=8000
```

عامل الطوابير والمهام المجدولة في طرفيتين منفصلتين:

```bash
php artisan queue:work --tries=3
php artisan schedule:work
```

أو عبر cron على خادم الإنتاج:

```
* * * * * cd /path/to/erp/backend && php artisan schedule:run >> /dev/null 2>&1
```

### الواجهة

```bash
cd erp/frontend
npm ci
cp .env.example .env     # عدّل VITE_API_BASE إن لزم
npm run dev              # تطوير
npm run build            # إنتاج → dist/
```

للإنتاج، اخدم `dist/` من nginx مع توجيه كل المسارات إلى `index.html` (انظر `frontend/nginx.conf`).

---

## ٣. التشغيل على شبكة داخلية بلا إنترنت

النظام مصمم للعمل كاملًا داخل الشبكة المحلية:

- الخط العربي **مستضاف محليًا** في `frontend/public/fonts` — لا اعتماد على أي شبكة توصيل خارجية.
- قاعدة البيانات والطوابير والذاكرة المؤقتة كلها محلية — **لا خدمة سحابية مدفوعة مطلوبة** للبيع والمخازن والحسابات.
- التكاملات الخارجية (رسائل، خرائط، بوابات دفع، الفاتورة الإلكترونية) **اختيارية ومعطّلة افتراضيًا**، وتظهر بوضوح كـ«غير مهيأة» بدل عرض نجاح وهمي.

اضبط `VITE_API_BASE` على عنوان الخادم داخل الشبكة، مثل `http://192.168.1.10:8000/api/v1`.

---

## ٤. النسخ الاحتياطية والاستعادة

### إنشاء نسخة

```bash
php artisan erp:backup
```

ينتج ملفًا مضغوطًا مشفرًا بـ AES-256 (PBKDF2, 200000 تكرار) في `storage/app/backups`، ويسجل الحجم والبصمة في جدول `backup_runs`.

### اختبار الاستعادة — إلزامي

**وجود ملف النسخة ليس دليلًا على نجاح الاستعادة.** الأمر التالي هو الدليل الوحيد المقبول:

```bash
php artisan erp:restore-test
```

ما يفعله:
1. يتحقق من بصمة SHA-256 ويرفض الملف إن تغيّر.
2. ينشئ قاعدة مؤقتة ويستعيد إليها.
3. يقارن عدد الصفوف في ١٣ جدولًا حرجًا مع القاعدة الحية.
4. يتحقق من أن **كل القيود ما زالت متوازنة** بعد الاستعادة.
5. يحذف القاعدة المؤقتة ويسجل النتيجة في `backup_runs.restore_test_result`.

### الجدولة التلقائية

| المهمة | التوقيت |
|---|---|
| `erp:backup` | يوميًا 02:00 — وفشلها يُنشئ تنبيهًا في `notifications_outbox` |
| `erp:restore-test` | أسبوعيًا الجمعة 03:00 |
| تنظيف الحجوزات المنتهية | كل ساعة |
| إنهاء تفويضات الأوفلاين المنتهية | كل ساعة |
| توليد إشارات الاستثناء | يوميًا 23:30 |

### الاستعادة الفعلية في حالة الكارثة

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in erp-YYYYMMDD-HHMMSS.sql.gz.enc -pass env:ERP_BACKUP_KEY \
  | gunzip | psql -h <host> -U <user> -d <new_database>
```

ثم وجّه `DB_DATABASE` إلى القاعدة الجديدة وأعد تشغيل الخدمات.

### سياسة الاحتفاظ

القرار التشغيلي المطلوب ضبطه عند النشر:
- نسخة يومية لمدة ١٤ يومًا، وأسبوعية لمدة ٣ أشهر.
- **نسخة خارج جهاز التشغيل** — وحدة تخزين منفصلة أو موقع آخر.
- مفتاح `ERP_BACKUP_KEY` محفوظ خارج الخادم؛ ضياعه يعني ضياع النسخ.

---

## ٥. قبل التشغيل الفعلي — قائمة تحقق إلزامية

- [ ] **مراجعة مصفوفة الترحيل** واعتمادها (`posting_rules.is_reviewed`). النظام يعمل بقواعد افتراضية غير مُراجَعة.
- [ ] ضبط **النسب الضريبية** المؤرخة في `tax_codes` — لا نسبة افتراضية عمدًا.
- [ ] تعريف **دليل الحسابات** بما يطابق دفاتر الشركة، أو قبول الدليل الافتراضي كتابةً.
- [ ] إدخال **الأرصدة الافتتاحية** للمخزون والعملاء والموردين والخزن، والتأكد من تطابقها مع الحسابات.
- [ ] إنشاء **المستخدمين والأدوار** ومراجعة الصلاحيات الحساسة.
- [ ] ضبط **`ERP_BACKUP_KEY`** وتشغيل نسخة واختبار استعادة واحد على الأقل.
- [ ] تشغيل **عامل الطوابير** والمهام المجدولة.
- [ ] تفعيل **HTTPS** أمام الواجهة وAPI.
- [ ] تغيير كلمة مرور المدير.

---

## ٦. المراقبة

| ما يُراقب | أين |
|---|---|
| فشل النسخ الاحتياطية | `backup_runs.status` + `notifications_outbox` |
| نتيجة اختبار الاستعادة | `backup_runs.restore_test_result` |
| عمليات مزامنة معلقة أو متعارضة | `GET /api/v1/sync/status` وشاشة «حالة المزامنة» |
| أخطاء الخادم | `storage/logs/laravel.log` |
| صحة الخدمة | `GET /api/v1/health` |
| إشارات الاستثناء | جدول `exception_signals` |
| سجل المراجعة | جدول `audit_logs` — لا صلاحية حذف له |

---

## ٧. الاختبارات

```bash
cd erp/backend
php artisan test                                  # كل الاختبارات
php artisan test --filter=ReferenceScenarioTest   # السيناريو المرجعي (البند ٢٢)
```

الاختبارات تعمل على **PostgreSQL** نفسه (قاعدة `eg_erp_test`) لأن قيود `CHECK` والأقفال وأنواع `NUMERIC` جزء من الضمانات المختبَرة ولا يصح استبدالها بـSQLite.

النتائج الفعلية في `07-TEST-REPORT.md`.
