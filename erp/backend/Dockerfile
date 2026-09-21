FROM php:8.4-cli-alpine

# الامتدادات المطلوبة: pdo_pgsql للقاعدة، intl للعربية، وأدوات النسخ الاحتياطي
RUN apk add --no-cache \
        postgresql-client postgresql-dev libzip-dev icu-dev oniguruma-dev \
        openssl bash gzip \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql pgsql zip intl opcache \
    && apk del postgresql-dev

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# طبقة الاعتماديات منفصلة ليُعاد استخدامها في البناءات التالية
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --optimize --no-dev \
    && mkdir -p storage/app/backups storage/framework/{cache/data,sessions,views} storage/logs \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 8000

# تشغيل الترحيلات ثم الخادم
CMD ["sh", "-c", "php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=8000"]
