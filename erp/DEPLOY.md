# رفع النظام على خادمك

هذا الدليل للحزمة الجاهزة: مكتبات PHP مثبتة داخل `backend/vendor` وواجهة مبنية داخل
`frontend/dist`، فلا تحتاج إنترنت على الخادم ولا Composer ولا Node.

> النظام يعمل بالكامل على خادمك — لا خدمة سحابية مدفوعة مطلوبة للبيع أو المخازن أو الحسابات.

---

## اختر طريقة واحدة

| | **Docker** | **تثبيت مباشر** |
|---|---|---|
| الأنسب لـ | خادم فيه Docker | خادم Ubuntu/Debian عادي |
| ما تثبّته | Docker فقط | PHP 8.3+، PostgreSQL، Nginx |
| الوقت | ~١٠ دقائق | ~٢٠ دقيقة |

---

# الطريقة الأولى: Docker

## ١. ارفع الملفات

```bash
scp mohamed-fayad-erp.tar.gz root@عنوان-الخادم:/opt/
ssh root@عنوان-الخادم
cd /opt && tar -xzf mohamed-fayad-erp.tar.gz && cd mohamed-fayad-erp
```

## ٢. جهّز ملف الإعدادات

```bash
cp .env.example .env
nano .env
```

عرّف القيمتين التاليتين على الأقل:

```
DB_PASSWORD=<كلمة مرور قوية>
ERP_BACKUP_KEY=<مفتاح عشوائي طويل — احفظ نسخة منه خارج الخادم>
```

لتوليد مفتاح عشوائي:

```bash
openssl rand -hex 32
```

ثم مفتاح التطبيق:

```bash
docker compose run --rm api php artisan key:generate --show
```

انسخ الناتج (يبدأ بـ `base64:`) إلى `APP_KEY=` داخل `.env`.

## ٣. شغّل

```bash
docker compose up -d --build
docker compose exec api php artisan erp:install
```

الأمر الأخير يطبع كلمة مرور المدير **مرة واحدة**. احفظها.

افتح: `http://عنوان-الخادم:8080`

---

# الطريقة الثانية: تثبيت مباشر على Ubuntu/Debian

## ١. ثبّت المتطلبات

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-client \
  php-fpm php-cli php-pgsql php-mbstring php-intl php-xml php-zip php-curl
```

تأكد أن نسخة PHP ٨٫٣ أو أحدث:

```bash
php -v
```

إن كانت أقدم، أضف مستودع `ondrej/php`:

```bash
sudo add-apt-repository ppa:ondrej/php && sudo apt update
sudo apt install -y php8.4-fpm php8.4-cli php8.4-pgsql php8.4-mbstring php8.4-intl php8.4-xml php8.4-zip php8.4-curl
```

## ٢. ارفع الملفات

```bash
scp mohamed-fayad-erp.tar.gz root@عنوان-الخادم:/opt/
ssh root@عنوان-الخادم
cd /opt && tar -xzf mohamed-fayad-erp.tar.gz
```

المسار الناتج `/opt/mohamed-fayad-erp` هو المسار الافتراضي في كل ملفات الإعداد.
لو وضعته في مكان آخر فلا مشكلة — سكربت التثبيت يكتشف مساره ويضبط الملفات تلقائيًا.

## ٣. شغّل سكربت التثبيت

```bash
cd /opt/mohamed-fayad-erp
sudo bash deploy/install.sh
```

السكربت يقوم بـ:

1. فحص PHP وامتداداته وقاعدة البيانات.
2. إنشاء مستخدم وقاعدة بيانات PostgreSQL بكلمة مرور عشوائية.
3. كتابة `backend/.env` وتوليد `APP_KEY` و`ERP_BACKUP_KEY`.
4. ضبط أذونات مجلدات الكتابة.
5. إنشاء جداول قاعدة البيانات.
6. إنشاء حساب الإدارة وطباعة كلمة مروره **مرة واحدة**.
7. تخزين الإعدادات والمسارات مؤقتًا لرفع الأداء.
8. تشغيل خدمتي `erp-worker` و`erp-scheduler`.
9. تفعيل موقع Nginx.

السكربت **لا يحذف** قاعدة بيانات موجودة ولا يستبدل `.env` موجودًا.

## ٤. افتح النظام

```
http://عنوان-الخادم/
```

---

# بعد التثبيت — خطوات إلزامية

## ١. كلمة مرور المدير

اسم المستخدم `admin`، وكلمة المرور تُطبع مرة واحدة في نهاية التثبيت.
لا توجد كلمة مرور ثابتة داخل الملفات.

عند أول دخول يفرض النظام تغييرها: الخادم يرفض كل المسارات عدا تغيير كلمة المرور
حتى تتغيّر فعليًا — تحديث الصفحة أو استدعاء الـAPI مباشرة لا يتجاوز ذلك.

## ٢. مفتاح النسخ الاحتياطية

```bash
grep ERP_BACKUP_KEY /opt/mohamed-fayad-erp/backend/.env
```

انسخ القيمة واحفظها **خارج الخادم**. بدونها لا يمكن فك تشفير أي نسخة احتياطية،
ولو ضاع الخادم ضاعت النسخ معه.

## ٣. اعتماد مصفوفة الترحيل المحاسبية

القواعد تُنشأ افتراضية وتحتاج مراجعة المحاسب المسؤول قبل التشغيل الفعلي.
راجع `docs/03-POSTING-MATRIX.md`.

## ٤. فعّل HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.example.com
```

بدون HTTPS تمر كلمات المرور ورموز الدخول كنص مقروء على الشبكة.
إن كان الخادم داخل الشركة بلا نطاق خارجي، اقصر الوصول على الشبكة الداخلية بجدار ناري.

## ٥. جرّب الاستعادة قبل أن تحتاجها

```bash
cd /opt/mohamed-fayad-erp/backend
sudo -u www-data php artisan erp:backup
sudo -u www-data php artisan erp:restore-test
```

`erp:restore-test` يتحقق من بصمة الملف، يستعيده في قاعدة مؤقتة، ويطابق الجداول الحرجة
ويتأكد أن القيود ما زالت متوازنة. نسخة لم تُختبَر استعادتها ليست نسخة.

---

# التحقق من أن كل شيء يعمل

```bash
# صحة الخادم
curl http://localhost/api/v1/health

# حالة الخدمات
systemctl status erp-worker erp-scheduler nginx

# سجلات الأخطاء
tail -f /opt/mohamed-fayad-erp/backend/storage/logs/laravel.log
tail -f /var/log/erp/worker.log
```

الرد المتوقع من `health`:

```json
{"status":"ok","system":"محمد فياض","time":"..."}
```

---

# مشاكل شائعة

| العَرَض | السبب والحل |
|---|---|
| صفحة بيضاء | `frontend/dist` غير موجود أو `root` في إعداد Nginx يشير لمسار خاطئ |
| `502 Bad Gateway` | PHP-FPM متوقف أو مسار المقبس مختلف. راجع `ls /run/php/` وعدّل `fastcgi_pass` |
| `500` على مسارات `/api` | راجع `storage/logs/laravel.log`. غالبًا أذونات `storage` أو بيانات قاعدة بيانات خاطئة |
| تسجيل الدخول يفشل بلا رسالة | الواجهة لا تصل للـAPI. تأكد أن `/api/v1/health` يعمل من المتصفح على نفس النطاق |
| `permission denied` في السجلات | `sudo chown -R www-data:www-data backend/storage backend/bootstrap/cache` |
| تعديل على `.env` لا يظهر أثره | الإعدادات مخزّنة مؤقتًا: `php artisan config:cache` بعد كل تعديل |
| الخطوط العربية لا تظهر | تأكد أن مجلد `frontend/dist/fonts` مرفوع كاملًا |

---

# التحديث لاحقًا

```bash
cd /opt/mohamed-fayad-erp
sudo -u www-data php artisan down                       # وضع الصيانة
sudo -u www-data php artisan erp:backup                 # نسخة قبل أي تحديث
# ... استبدل ملفات backend/app و backend/routes و frontend/dist بالجديدة ...
sudo -u www-data php artisan migrate --force
sudo -u www-data php artisan config:cache
sudo -u www-data php artisan route:cache
sudo systemctl restart erp-worker erp-scheduler
sudo -u www-data php artisan up
```

---

# ملفات هذه الحزمة

```
mohamed-fayad-erp/
  backend/          الخادم — Laravel + مكتباته مثبتة في vendor/ (لا يحتاج إنترنت)
    app/            منطق النطاق: المخزون، المحاسبة، المبيعات، الميدان، المزامنة
    database/       الترحيلات والبذور (دليل الحسابات، الصلاحيات، الأدوار)
    routes/api.php  80 مسار API بصلاحياتها
    tests/          68 اختبارًا آليًا
    vendor/         مكتبات PHP جاهزة — لا تحتاج Composer على الخادم
  frontend/
    dist/           الواجهة مبنية وجاهزة — لا تحتاج Node على الخادم
    src/            مصدر الواجهة (لمن يريد التعديل وإعادة البناء)
  mobile/           مصدر تطبيق المندوب — Flutter (غير مبني، لا توجد APK)
  docs/             الوثائق الكاملة (المتطلبات، القاموس، الترحيل، الصلاحيات، API، الاختبارات)
  deploy/
    install.sh                        سكربت التثبيت المباشر
    nginx/mohamed-fayad-erp.conf      إعداد Nginx
    systemd/erp-worker.service        خدمة الطوابير
    systemd/erp-scheduler.service     خدمة المهام المجدولة
  git/
    erp-history.bundle    نسخة Git كاملة بكل التاريخ — للرفع على مستودعك
    README.md             كيفية استنساخها ورفعها
  docker-compose.yml
  .env.example
  DEPLOY.md         هذا الملف
  README.md
```

**ما ليس داخل الأرشيف عمدًا:**

| | لماذا |
|---|---|
| `frontend/node_modules` | 151 ميجا تُولَّد بـ`npm install`، والواجهة **مبنية سلفًا** في `dist/` فلا حاجة إليها للتشغيل |
| ملف `.env` | يُولَّد عند التثبيت بمفاتيح خاصة بخادمك — لا توجد أسرار داخل الأرشيف |
| حزمة Android | تطبيق المندوب لم يُبنَ (لا Flutter SDK) — المصدر فقط |

للتفاصيل التشغيلية اليومية (النسخ، الإقفال، المزامنة): `docs/06-OPERATIONS.md`.
