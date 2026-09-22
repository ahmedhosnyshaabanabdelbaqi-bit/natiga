#!/usr/bin/env bash
#
# يبني حزمة نشر واحدة (zip) جاهزة للرفع على خادم.
#
# تحتوي: الكود المتتبع في git + الواجهة مبنية للإنتاج.
# لا تحتوي: vendor/ و node_modules/ و .env — تُبنى أو تُنشأ على الخادم.
#
#   ./scripts/package.sh            → dist/natiga-pos.zip
#   ./scripts/package.sh نسخة-2     → dist/نسخة-2.zip
#
set -euo pipefail

cd "$(dirname "$0")/.."

NAME="${1:-natiga-pos}"
DIST="dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

command -v git >/dev/null || { echo "✗ git غير متاح"; exit 1; }
command -v zip >/dev/null || { echo "✗ zip غير متاح"; exit 1; }

# نبني الواجهة أولًا حتى لا تُشحن أصول قديمة مع كود جديد.
echo "→ بناء الواجهة للإنتاج…"
npm run build

echo "→ تجميع الملفات المتتبعة في git…"
mkdir -p "$STAGE/$NAME"
git archive HEAD | tar -x -C "$STAGE/$NAME"

# public/build مستثنى من git عمدًا، لكنه ضروري لخادم بلا Node.
echo "→ إضافة الواجهة المبنية…"
mkdir -p "$STAGE/$NAME/public/build"
cp -r public/build/. "$STAGE/$NAME/public/build/"

# فحص أخير: لا يخرج سر ولا اعتمادية ثقيلة مع الحزمة.
for unwanted in .env vendor node_modules; do
    if [ -e "$STAGE/$NAME/$unwanted" ]; then
        echo "✗ توقف: $unwanted وجد داخل الحزمة"
        exit 1
    fi
done

mkdir -p "$DIST"
rm -f "$DIST/$NAME.zip"
( cd "$STAGE" && zip -qr9 "$NAME.zip" "$NAME" )
mv "$STAGE/$NAME.zip" "$DIST/$NAME.zip"

unzip -tq "$DIST/$NAME.zip" >/dev/null || { echo "✗ الأرشيف تالف"; exit 1; }

SIZE=$(du -h "$DIST/$NAME.zip" | cut -f1)
FILES=$(unzip -l "$DIST/$NAME.zip" | tail -1 | awk '{print $2}')

echo
echo "✓ $DIST/$NAME.zip — $SIZE، $FILES ملفًا"
echo
echo "  على الخادم:"
echo "    composer install --no-dev --optimize-autoloader"
echo "    cp .env.example .env && php artisan key:generate"
echo "    php artisan migrate --seed"
