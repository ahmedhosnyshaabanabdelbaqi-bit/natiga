#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# محمد فياض — نظام إدارة التوزيع
# تثبيت مباشر على خادم Ubuntu/Debian (بدون Docker).
#
#   sudo bash deploy/install.sh
#
# السكربت لا يحذف شيئًا ولا يغيّر قاعدة بيانات موجودة دون سؤالك.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND_DIST="$ROOT/frontend/dist"
PHP_BIN="${PHP_BIN:-$(command -v php || true)}"
WEB_USER="${WEB_USER:-www-data}"

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
die()  { red "خطأ: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "شغّل السكربت بصلاحية الجذر:  sudo bash deploy/install.sh"

# ---------------------------------------------------------------------------
step "١/٩ فحص المتطلبات"
# ---------------------------------------------------------------------------
[ -n "$PHP_BIN" ] || die "PHP غير مثبت. ثبّته أولًا (راجع DEPLOY.md)."

PHP_VER="$("$PHP_BIN" -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
grn "PHP $PHP_VER موجود في $PHP_BIN"
"$PHP_BIN" -r 'exit(version_compare(PHP_VERSION, "8.3.0", ">=") ? 0 : 1);' \
  || die "يلزم PHP 8.3 أو أحدث (الموجود $PHP_VER)."

MISSING=""
for EXT in pdo_pgsql pgsql mbstring intl openssl ctype json; do
  "$PHP_BIN" -m | grep -qix "$EXT" || MISSING="$MISSING $EXT"
done
[ -z "$MISSING" ] || die "امتدادات PHP الناقصة:$MISSING — ثبّتها ثم أعد المحاولة."
grn "امتدادات PHP المطلوبة موجودة"

command -v psql >/dev/null || die "عميل PostgreSQL (psql) غير مثبت."
command -v nginx >/dev/null || ylw "تنبيه: Nginx غير مثبت — سيتخطى السكربت خطوة الويب."

[ -d "$BACKEND/vendor" ] || die "مجلد backend/vendor مفقود. استخدم الحزمة الجاهزة أو شغّل: composer install --no-dev"
[ -f "$FRONTEND_DIST/index.html" ] || die "ملفات الواجهة frontend/dist مفقودة."
grn "ملفات النظام مكتملة"

# ---------------------------------------------------------------------------
step "٢/٩ إعداد قاعدة البيانات"
# ---------------------------------------------------------------------------
DB_NAME="${DB_NAME:-eg_erp}"
DB_USER="${DB_USER:-erp}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

if [ -z "${DB_PASS:-}" ]; then
  DB_PASS="$("$PHP_BIN" -r 'echo bin2hex(random_bytes(16));')"
  GENERATED_DB_PASS=1
fi

if command -v sudo >/dev/null && id postgres >/dev/null 2>&1; then
  ROLE_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || true)"
  if [ "$ROLE_EXISTS" = "1" ]; then
    ylw "المستخدم '$DB_USER' موجود بالفعل — لن تُغيَّر كلمة مروره."
    if [ "${GENERATED_DB_PASS:-0}" = "1" ]; then
      die "المستخدم موجود وكلمة المرور غير معروفة. مرّرها هكذا:  DB_PASS='...' sudo -E bash deploy/install.sh"
    fi
  else
    sudo -u postgres psql -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASS';" >/dev/null
    grn "تم إنشاء مستخدم قاعدة البيانات: $DB_USER"
  fi

  DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" || true)"
  if [ "$DB_EXISTS" = "1" ]; then
    ylw "قاعدة البيانات '$DB_NAME' موجودة — سيُكمل السكربت عليها دون حذف أي بيانات."
  else
    sudo -u postgres createdb -O "$DB_USER" -E UTF8 "$DB_NAME"
    grn "تم إنشاء قاعدة البيانات: $DB_NAME"
  fi
else
  ylw "تعذّر الوصول لمستخدم postgres محليًا — أنشئ القاعدة يدويًا ومرّر DB_PASS."
fi

# ---------------------------------------------------------------------------
step "٣/٩ كتابة ملف الإعدادات backend/.env"
# ---------------------------------------------------------------------------
ENV_FILE="$BACKEND/.env"
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  ylw "وُجد ملف .env — أُخذت نسخة احتياطية منه ولن يُستبدل."
else
  APP_URL="${APP_URL:-http://$(hostname -I 2>/dev/null | awk '{print $1}')}"
  BACKUP_KEY="$("$PHP_BIN" -r 'echo bin2hex(random_bytes(32));')"
  cat > "$ENV_FILE" <<ENV
APP_NAME="محمد فياض"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_TIMEZONE=Africa/Cairo
APP_URL=$APP_URL
APP_LOCALE=ar
APP_FALLBACK_LOCALE=ar

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=pgsql
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_DATABASE=$DB_NAME
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS

SESSION_DRIVER=database
QUEUE_CONNECTION=database
CACHE_STORE=database

ERP_SYSTEM_NAME="محمد فياض"
ERP_COMPANY_NAME="محمد فياض للتوزيع"
ERP_CURRENCY=EGP
ERP_COST_METHOD=moving_average

# مفتاح تشفير النسخ الاحتياطية — احتفظ بنسخة منه خارج الخادم.
# بدونه لا يمكن فك تشفير أي نسخة احتياطية.
ERP_BACKUP_KEY=$BACKUP_KEY
ENV
  chmod 640 "$ENV_FILE"
  grn "تم إنشاء backend/.env"
fi

cd "$BACKEND"
grep -q '^APP_KEY=base64:' .env || "$PHP_BIN" artisan key:generate --force --no-interaction >/dev/null
grn "مفتاح التطبيق جاهز"

# ---------------------------------------------------------------------------
step "٤/٩ ضبط الأذونات"
# ---------------------------------------------------------------------------
mkdir -p storage/app/backups storage/framework/cache/data storage/framework/sessions \
         storage/framework/views storage/logs bootstrap/cache /var/log/erp
chown -R "$WEB_USER:$WEB_USER" storage bootstrap/cache /var/log/erp
chmod -R 775 storage bootstrap/cache
chown "$WEB_USER:$WEB_USER" .env
grn "تم ضبط أذونات المجلدات القابلة للكتابة"

# ---------------------------------------------------------------------------
step "٥/٩ ترحيل قاعدة البيانات"
# ---------------------------------------------------------------------------
sudo -u "$WEB_USER" "$PHP_BIN" artisan migrate --force --no-interaction
grn "تم إنشاء/تحديث جداول قاعدة البيانات"

# ---------------------------------------------------------------------------
step "٦/٩ تهيئة النظام وحساب الإدارة"
# ---------------------------------------------------------------------------
# erp:install يرفض العمل إن كان النظام مثبتًا بالفعل، فلا خطر من تشغيله مرتين.
if sudo -u "$WEB_USER" "$PHP_BIN" artisan erp:install --no-interaction; then
  :
else
  ylw "النظام مثبت بالفعل — تم تخطي إنشاء حساب الإدارة."
  ylw "لإعادة التهيئة من الصفر:  php artisan erp:install --force"
fi

# ---------------------------------------------------------------------------
step "٧/٩ تحسين الأداء"
# ---------------------------------------------------------------------------
sudo -u "$WEB_USER" "$PHP_BIN" artisan config:cache >/dev/null
sudo -u "$WEB_USER" "$PHP_BIN" artisan route:cache >/dev/null
sudo -u "$WEB_USER" "$PHP_BIN" artisan event:cache >/dev/null
grn "تم تخزين الإعدادات والمسارات مؤقتًا"

# ---------------------------------------------------------------------------
step "٨/٩ خدمات الطوابير والمهام المجدولة"
# ---------------------------------------------------------------------------
# systemd قد يكون مثبتًا لكن غير عامل (حاويات، LXC، WSL) — لا يوقف التثبيت
SKIPPED_SERVICES=0
if command -v systemctl >/dev/null && systemctl list-units >/dev/null 2>&1; then
  for UNIT in erp-worker erp-scheduler; do
    sed -e "s#/opt/mohamed-fayad-erp#$ROOT#g" \
        -e "s#^ExecStart=/usr/bin/php#ExecStart=$PHP_BIN#" \
        -e "s#^User=www-data#User=$WEB_USER#" \
        -e "s#^Group=www-data#Group=$WEB_USER#" \
        "$ROOT/deploy/systemd/$UNIT.service" > "/etc/systemd/system/$UNIT.service"
  done
  if systemctl daemon-reload && systemctl enable --now erp-worker erp-scheduler; then
    grn "تم تشغيل erp-worker و erp-scheduler"
  else
    SKIPPED_SERVICES=1
    ylw "تعذّر تشغيل الخدمتين — راجع: systemctl status erp-worker"
  fi
else
  SKIPPED_SERVICES=1
  ylw "systemd غير عامل هنا — شغّل العامل والمجدول يدويًا:"
  echo "    cd $BACKEND && php artisan queue:work --tries=3 &"
  echo "    cd $BACKEND && php artisan schedule:work &"
fi

# ---------------------------------------------------------------------------
step "٩/٩ إعداد Nginx"
# ---------------------------------------------------------------------------
if command -v nginx >/dev/null; then
  PHP_SOCK="$(ls /run/php/php*-fpm.sock 2>/dev/null | head -1 || true)"
  if [ -z "$PHP_SOCK" ]; then
    ylw "لم يُعثر على مقبس PHP-FPM. ثبّت php-fpm ثم عدّل fastcgi_pass يدويًا."
    PHP_SOCK="/run/php/php${PHP_VER}-fpm.sock"
  fi
  SITE=/etc/nginx/sites-available/mohamed-fayad-erp.conf
  [ -d /etc/nginx/sites-available ] || { mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled; }
  sed -e "s#/opt/mohamed-fayad-erp#$ROOT#g" \
      -e "s#unix:/run/php/php8.4-fpm.sock#unix:$PHP_SOCK#" \
      "$ROOT/deploy/nginx/mohamed-fayad-erp.conf" > "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/mohamed-fayad-erp.conf
  rm -f /etc/nginx/sites-enabled/default
  # يحتاج Nginx صلاحية المرور على مجلدات المسار للوصول لملفات الواجهة
  chmod o+x "$ROOT" "$ROOT/frontend" "$ROOT/backend" 2>/dev/null || true
  if nginx -t; then
    if systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null; then
      grn "تم تفعيل موقع Nginx"
    else
      ylw "الإعداد صحيح لكن تعذّر إعادة تشغيل Nginx — أعد تشغيله بنفسك."
    fi
  else
    red "إعداد Nginx به خطأ — راجع المخرجات أعلاه."
  fi
else
  ylw "Nginx غير مثبت — تم تخطي هذه الخطوة."
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
printf '\n%s\n' "$(printf '=%.0s' {1..64})"
grn "اكتمل التثبيت."
echo "افتح المتصفح على:  http://${IP:-عنوان-الخادم}/"
echo
ylw "خطوات لازمة بعدك:"
if [ "${SKIPPED_SERVICES:-0}" = "1" ]; then
  echo "  ٠) شغّل عامل الطوابير والمجدول (لم يعملا تلقائيًا — انظر أعلاه)."
fi
echo "  ١) احفظ كلمة مرور المدير المعروضة أعلاه — لن تُعرض مرة أخرى."
echo "  ٢) انسخ قيمة ERP_BACKUP_KEY من backend/.env واحفظها خارج الخادم."
echo "  ٣) راجع مصفوفة الترحيل المحاسبية واعتمدها قبل التشغيل الفعلي (docs/03-POSTING-MATRIX.md)."
echo "  ٤) فعّل HTTPS:  certbot --nginx -d نطاقك"
printf '%s\n' "$(printf '=%.0s' {1..64})"
