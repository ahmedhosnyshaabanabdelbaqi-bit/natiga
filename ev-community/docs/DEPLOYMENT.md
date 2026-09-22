# Deployment guide

## Environments

| Environment | Database | Cache/Queue | Storage | Notes |
|---|---|---|---|---|
| Local | PostgreSQL `ev_community` | Redis (or database driver) | local private disk | demo data allowed |
| Testing / CI | PostgreSQL `ev_community_test` | array/sync | local | `phpunit.xml` |
| Staging | separate PostgreSQL instance | separate Redis DB index | separate bucket/prefix | anonymised data only; outbound email/SMS to sandbox providers |
| Production | managed PostgreSQL 16 with daily backups | Redis 7 | S3-compatible private bucket | HTTPS only |

Each environment has its own database, cache prefix, storage prefix, API credentials and payment credentials. Production secrets never exist in development.

## Server requirements

Ubuntu 22.04+/Debian 12, Nginx, PHP-FPM 8.4 (extensions: pdo_pgsql, pgsql, intl, gd, zip, mbstring, fileinfo, redis, opcache), PostgreSQL 16 client, Redis 7, Node 22 (build only), Supervisor (queue workers), cron (scheduler).

Recommended baseline for ~4,000 members: 4 vCPU / 8 GB RAM application server, PostgreSQL with 4 GB RAM and SSD storage, Redis 1 GB. Document the actual specification in the performance test report (see `TESTING.md`).

## First deployment

```bash
git clone <repo> && cd ev-community
composer install --no-dev --optimize-autoloader --no-interaction
cp .env.example .env            # then fill in real values (see README → Environment)
php artisan key:generate --force
php artisan migrate --force
php artisan db:seed --force     # master data only (idempotent)
php artisan ev:install          # first Owner (interactive; or EV_OWNER_* env in CI)
npm ci && npm run build
php artisan storage:link
php artisan config:cache && php artisan route:cache && php artisan view:cache && php artisan event:cache
php artisan ev:health
```

Nginx: root `public/`, `try_files $uri /index.php?$query_string`, `client_max_body_size 25m`, HTTP → HTTPS redirect, HSTS.
Cookies: `SESSION_SECURE_COOKIE=true`, `SESSION_DRIVER=database` (required for the active-sessions feature), `SESSION_SAME_SITE=lax`.

Supervisor program for workers:

```
[program:ev-worker]
command=php /var/www/ev-community/artisan queue:work redis --queue=critical,default,notifications,reports --sleep=1 --tries=3 --backoff=30 --max-time=3600 --memory=256
numprocs=2
autostart=true
autorestart=true
stopwaitsecs=3600
```

Cron: `* * * * * cd /var/www/ev-community && php artisan schedule:run >> /dev/null 2>&1`

## Release pipeline (every deployment)

1. **Build** — CI runs `composer install`, `npm ci && npm run build`, Pint, ESLint/oxlint, `tsc`, migrations on a clean database, the full test suite (`.github/workflows/tests.yml`).
2. **Security checks** — `composer audit`, `npm audit --omit=dev`; no secrets in the repository (grep for `APP_KEY=base64`, tokens).
3. **Database migration review** — every migration in the release is read; destructive migrations follow the expand/contract rule (`DEPLOYMENT.md` → Destructive migrations).
4. **Backup** — take a PostgreSQL backup and verify it exists (`BACKUP_RESTORE.md`) before touching production.
5. **Deploy** — `php artisan down --render="errors::503" --retry=60 --secret=<token>` (bilingual maintenance page; admins can bypass with the secret URL), pull the release, `composer install --no-dev`, `npm run build` (or upload prebuilt assets), `php artisan migrate --force`.
6. **Cache warm-up** — `config:cache`, `route:cache`, `view:cache`, `event:cache`, `php artisan ev:sync-permissions`.
7. **Queue restart** — `php artisan queue:restart` (workers finish the current job and reload code).
8. **Scheduler** — verify `php artisan schedule:list` and the heartbeat in `/admin/jobs/failed` after two minutes.
9. **Health check** — `php artisan ev:health` and `GET /up` must pass.
10. **Smoke tests** — homepage AR/EN, `/login`, `/admin/login`, `/partner/login`, one authenticated page per portal, a queued test email (only if email is configured). Never create financial transactions in smoke tests.
11. `php artisan up`, then **monitoring**: error tracker, queue backlog, failed jobs, integration statuses for 30 minutes.

## Rollback

- Application: keep the previous release directory (symlink-based releases) and switch the symlink back; `php artisan config:cache && php artisan queue:restart`.
- Database: migrations in a release must be backward compatible with the previous application version (expand/contract). If a migration must be reverted, restore from the pre-deployment backup or run the documented `down()` only when it is non-destructive.
- Assets: previous `public/build` is part of the previous release directory.
- Validate after rollback: `ev:health`, login, one page per portal, queue processing, `finance:reconcile --dry-run`.

## Destructive migrations

Never drop or alter data-bearing columns in the same release that stops using them. Sequence: (1) add new column/table, (2) dual-write and backfill, (3) switch reads, (4) remove writes, (5) drop in a later release after backup. Requires: backup, review, staging test, rollback plan.

## Secret rotation

`APP_KEY`: add the old key to `APP_PREVIOUS_KEYS` before setting a new one (encrypted VINs/MFA secrets stay decryptable), then re-encrypt with a maintenance command when convenient. API keys (maps, email, SMS, payment): update `.env`, `php artisan config:cache`, `php artisan integrations:check`, `php artisan queue:restart`. Storage credentials: rotate in the provider, update `.env`, run a signed-URL test from `/admin/integrations`.

## Email domain readiness

Before enabling production email: configure SPF, DKIM and DMARC for the sending domain with your provider; send test emails from `/admin/integrations`; monitor bounce/complaint reports. SMTP success does not guarantee deliverability.
