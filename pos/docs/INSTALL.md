# تعليمات التثبيت والتشغيل

نمطان مدعومان: **خادم داخل شبكة المحل** (الموصى به) و**خادم سحابي**.
في كل نشر توجد **قاعدة بيانات مرجعية واحدة** — لا قواعد مستقلة متعارضة.

---

## 1. المتطلبات

| المكوّن | الإصدار | ملاحظات |
|---|---|---|
| PHP | 8.3+ (مُختبر على 8.4) | الامتدادات: `pdo_pgsql`, `mbstring`, `intl`, `zip`, `gd`, `openssl`, `xml` |
| Composer | 2.x | |
| PostgreSQL | 16+ | مطلوب — راجع `docs/ARCHITECTURE.md §4` |
| Node.js | 20+ (مُختبر على 22) | لبناء الواجهة فقط |
| خادم ويب | Nginx أو Apache | أو `php artisan serve` للتجربة |

النظام **لا يعتمد على أي اشتراك خارجي مدفوع** في تشغيله الأساسي.

---

## 2. التثبيت خطوة بخطوة

```bash
# 1) الكود والاعتمادات
cd pos
composer install --no-dev --optimize-autoloader
npm ci

# 2) البيئة
cp .env.example .env
php artisan key:generate

# 3) قاعدة البيانات (كمستخدم postgres)
sudo -u postgres psql <<'SQL'
CREATE ROLE pos_app WITH LOGIN PASSWORD 'ضع-كلمة-سر-قوية';
CREATE DATABASE pos_prod OWNER pos_app;
SQL
```

عدّل `.env`:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=http://192.168.1.10          # عنوان الخادم داخل الشبكة
APP_TIMEZONE=UTC                     # التخزين بـ UTC دائمًا

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_DATABASE=pos_prod
DB_USERNAME=pos_app
DB_PASSWORD=كلمة-السر

POS_TIMEZONE=Africa/Cairo            # توقيت المحل للتقارير ويوم العمل
POS_CURRENCY=EGP
POS_CASH_STEP=0                      # 0.25 مثلًا لتقريب النقدية
POS_BACKUP_PASSPHRASE=سر-تشفير-النسخ  # لا يُخزَّن في الكود
```

```bash
# 4) المخطط والبيانات الأساسية
php artisan migrate --force
php artisan db:seed --force          # صلاحيات + دليل حسابات + فرع/مخزن/كاشير

# 5) بناء الواجهة
npm run build

# 6) الأداء
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

> **حساب البداية:** `owner` / `ChangeMe!2026` — **غيّره فورًا** من شاشة المستخدمين.

افتح `http://<الخادم>` وسيبدأ **معالج إعداد المحل**.

---

## 3. النمط الأول: خادم داخل شبكة المحل (موصى به)

**لماذا:** البيع لا يتوقف لانقطاع الإنترنت، لأن الكاشيرات تصل للخادم المحلي.

```
[كاشير 1] ─┐
[كاشير 2] ─┼─ سويتش ─ [خادم المحل: PHP + PostgreSQL]
[تابلت]   ─┘                    │
                          (الإنترنت اختياري للنسخ الخارجية فقط)
```

### Nginx

```nginx
server {
    listen 80;
    server_name pos.local 192.168.1.10;
    root /var/www/pos/public;

    index index.php;
    charset utf-8;

    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # الأصول المبنية
    location ~* \.(js|css|woff2|png|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    client_max_body_size 25M;   # لاستيراد ملفات Excel
}
```

### المجدول والعامل (systemd)

```ini
# /etc/systemd/system/pos-scheduler.service
[Unit]
Description=POS scheduler
[Service]
Type=oneshot
User=www-data
WorkingDirectory=/var/www/pos
ExecStart=/usr/bin/php artisan schedule:run
```
```ini
# /etc/systemd/system/pos-scheduler.timer
[Unit]
Description=Run POS scheduler every minute
[Timer]
OnCalendar=*:0/1
[Install]
WantedBy=timers.target
```
```bash
sudo systemctl enable --now pos-scheduler.timer
```

بديل بـ cron:
```cron
* * * * * cd /var/www/pos && php artisan schedule:run >> /dev/null 2>&1
```

المجدول يشغّل: `pos:outbox` كل دقيقة · `pos:backup` مرتين يوميًا ·
تنظيف مفاتيح منع التكرار · إنهاء الحجوزات المنتهية.

### ثبات العنوان
أعطِ الخادم **IP ثابتًا** أو حجزًا في DHCP، وأضف اسمًا محليًا (`pos.local`)
حتى لا تتأثر الكاشيرات بتغيّر العنوان.

---

## 4. النمط الثاني: خادم سحابي

```bash
# HTTPS إلزامي
sudo certbot --nginx -d pos.example.com
```

```dotenv
APP_URL=https://pos.example.com
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=pos.example.com
```

**احذر:** في النمط السحابي، انقطاع إنترنت المحل = فقد الخادم ⇒ الكاشيرات تدخل
الوضع المحدود. فعّل `offline_allowed` لكل جهاز بوعي، واضبط السقف والمدة.

تقوية إضافية:
- جدار ناري: افتح 80/443 فقط، وأغلق PostgreSQL على الشبكة العامة
- `pg_hba.conf`: `scram-sha-256` فقط، لا `trust`
- نسخة احتياطية خارج نفس الخادم (S3 أو جهاز آخر)

---

## 5. تقوية قاعدة البيانات (موصى به)

شغّل التطبيق بمستخدم **لا يملك** صلاحية تعديل سجل التدقيق:

```sql
-- بعد تشغيل الهجرات بمستخدم المالك
REVOKE UPDATE, DELETE ON audit_logs FROM pos_app;
GRANT SELECT, INSERT ON audit_logs TO pos_app;
```

المحفّز `audit_logs_no_update` يمنع التعديل على أي حال، وهذه طبقة ثانية.

---

## 6. النسخ الاحتياطي

```bash
# نسخة مشفرة يدوية
php artisan pos:backup --path=/var/backups/pos --keep=14

# استعادة مع إثبات التطابق
php artisan pos:restore /var/backups/pos/pos_20260922_020000.dump.enc --verify
```

- التشفير AES-256 بمفتاح من `POS_BACKUP_PASSPHRASE` (خارج الكود)
- بجانب كل نسخة ملف `.json` يحمل **بصمة** (عدد الفواتير، المبيعات، الأرصدة، القيود)
- `--verify` يعيد حساب البصمة على البيانات المستعادة ويقارنها حقلًا بحقل
- انسخ النسخ **خارج جهاز التشغيل** (قرص خارجي أو تخزين سحابي)

راجع `docs/BACKUP.md` للسياسة الكاملة.

---

## 7. التحقق من صحة التركيب

```bash
php artisan about                    # الإصدارات والاتصال
php artisan migrate:status           # كل الهجرات مطبّقة
curl -s http://localhost/up          # فحص الصحة
php artisan test                     # 78 اختبارًا
```

---

## 8. بيئة التطوير

```bash
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan db:seed --class=DemoDataSeeder   # بيانات تجريبية (اختياري)

# نافذتان
php artisan serve
npm run dev
```

قاعدة اختبار منفصلة:
```bash
sudo -u postgres createdb pos_test -O pos
php artisan test
```

بيانات ضخمة لقياس الأداء:
```bash
php artisan pos:seed-performance --products=10000 --sales=50000
php artisan pos:benchmark
```
