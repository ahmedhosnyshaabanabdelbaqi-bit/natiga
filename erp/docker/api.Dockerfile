FROM php:8.3-cli-alpine

# pdo_pgsql is required — the schema depends on PostgreSQL features.
# bcmath is optional: brick/math falls back to pure PHP with identical results,
# but the extension makes the arithmetic faster.
RUN apk add --no-cache postgresql-dev git unzip icu-dev \
 && docker-php-ext-install pdo_pgsql bcmath intl opcache \
 && apk del postgresql-dev

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-scripts --prefer-dist

COPY . .

RUN composer dump-autoload --optimize \
 && cp -n .env.example .env || true

EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
