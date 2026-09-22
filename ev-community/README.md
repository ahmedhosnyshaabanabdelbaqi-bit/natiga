# EV Community Egypt — مجتمع السيارات الكهربائية في مصر

Production-grade community platform for electric-vehicle owners in Egypt: group buying and
imports, orders and payments with a real ledger, warehouse and pickup operations, service-center
maintenance workflows, charging-station directory, warranty, knowledge base, support and more.

- **Backend:** Laravel 13 (PHP 8.4), PostgreSQL 16, Redis (queues / cache / locks)
- **Frontend:** React 19 + TypeScript, Inertia 3, Tailwind 4, shadcn-style components
- **Languages:** Arabic (default, RTL) and English (LTR) everywhere — UI, emails, PDFs, validation
- **Spaces:** public website (`/ar`, `/en`), member portal (`/account`), admin panel (`/admin`), partner portal (`/partner`)
- **Architecture:** modular monolith (`app/Modules/*`), server-side authorization, append-only financial and inventory ledgers

Documentation index: [`docs/README.md`](docs/README.md).

## Requirements

| Component | Version |
|---|---|
| PHP | 8.4 (extensions: pdo_pgsql, pgsql, intl, gd, zip, mbstring, fileinfo, redis) |
| Composer | 2.x |
| PostgreSQL | 16 |
| Redis | 7 (optional in development, required in production for queues/cache) |
| Node.js / npm | 22 / 10 |

## Installation (local)

```bash
cd ev-community
composer install
cp .env.example .env
php artisan key:generate

# database (create the role/databases once)
psql -U postgres -c "CREATE ROLE ev LOGIN PASSWORD 'ev_secret';"
psql -U postgres -c "CREATE DATABASE ev_community OWNER ev;"
psql -U postgres -c "CREATE DATABASE ev_community_test OWNER ev;"
# then set DB_* in .env

php artisan migrate --seed          # schema + master data only (roles, permissions, currencies, governorates, vehicle master data, connector types…)
php artisan ev:install              # creates the first Owner account securely (interactive)
npm install
npm run build                       # or `npm run dev` while developing
php artisan serve                   # http://localhost:8000 → redirects to /ar
```

Run workers and the scheduler in separate processes:

```bash
php artisan queue:work redis --tries=3 --backoff=30 --max-time=3600
php artisan schedule:work            # or a cron entry: * * * * * php artisan schedule:run
```

Health check: `GET /up` (framework) and `php artisan ev:health` (database, cache, queue, storage, scheduler heartbeat).

## Environment

All configuration is in `.env` (see `.env.example`, which contains variable names only — never commit secrets).
Integrations (payment gateway, SMS, WhatsApp, maps keys, shipping/charging APIs, object storage) stay
**Not Configured** until real credentials are provided; the platform never fakes a working integration.

| Group | Variables |
|---|---|
| Core | `APP_*`, `APP_TIMEZONE=Africa/Cairo`, `APP_LOCALE=ar` |
| Database | `DB_*` (PostgreSQL only) |
| Queue / cache | `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`, `REDIS_*` |
| Email | `MAIL_*` (`MAIL_MAILER=log` keeps email Not Configured) |
| Storage | `AWS_*` for S3-compatible private storage (defaults to local private disk) |
| Maps | `MAP_PROVIDER=osm`, `MAP_PUBLIC_KEY`, `MAP_SERVER_KEY`, `MAP_DEFAULT_*` |
| Optional | `PAYMENT_*`, `SMS_*`, `WHATSAPP_*`, `SHIPPING_*`, `CHARGING_*`, `EXCHANGE_RATE_*` |

## Database

- PostgreSQL is the single source of truth. Every schema change is a migration in `database/migrations`
  (prefixed by domain day, see `docs/CONVENTIONS.md §5`).
- Money is `decimal(14,2)` + currency; quantities are integers; ledgers are append-only; audit log rows are immutable (PostgreSQL trigger).
- Master data seeders live in `database/seeders/**` and are idempotent. **No demo/fake financial data is ever seeded in production.**
- Demo data for development/staging: `php artisan demo:seed` and `php artisan demo:generate-large-dataset` (refuse to run in production unless `EV_ALLOW_DEMO_DATA_IN_PRODUCTION=true`).
- ERD and data dictionary: `docs/DATABASE.md`.

## Testing

Tests run against PostgreSQL (`ev_community_test`, configured in `phpunit.xml`).

```bash
php artisan test                    # full suite (feature, authorization/IDOR, concurrency, unit)
php artisan test --filter=Payments  # one module
vendor/bin/pint --test              # PHP code style
npm run check && npm run types:check
```

## Deployment

See `docs/DEPLOYMENT.md` (repeatable steps: install → configure → migrate → build → cache → restart queues → scheduler → health check → smoke tests → rollback), `docs/BACKUP_RESTORE.md` and `docs/GO_LIVE_CHECKLIST.md`.

## Common commands

| Command | Purpose |
|---|---|
| `php artisan ev:install` | Create the first Owner account (refuses if one exists) |
| `php artisan ev:health` | Runtime health checks (non-zero exit on failure) |
| `php artisan ev:sync-permissions` | Sync roles/permissions from `app/Modules/*/Permissions.php` |
| `php artisan ev:daily-checks` | Data-quality / operations checks → Exception Center |
| `php artisan finance:reconcile` / `inventory:reconcile` | Reconciliation reports (never auto-correct) |
| `php artisan integrations:check` | Refresh integration health statuses |
| `php artisan files:purge-orphans` | Remove orphan uploads (dry-run by default) |
| `php artisan down --render="errors::503"` | Bilingual maintenance mode |

## Repository layout

```
ev-community/
  app/Modules/<Module>/        domain modules (models, services, actions, controllers, policies, routes, permissions)
  app/Support/                 money, sequences, idempotency, PDF, QR, barcode helpers
  database/migrations          PostgreSQL schema (day-prefixed by domain)
  resources/js/                React + TypeScript (pages per space, shared components, features)
  lang/{ar,en}/                translations (identical key sets)
  docs/                        architecture, database, deployment, runbooks, guides
```

License: proprietary — © EV Community Egypt.
