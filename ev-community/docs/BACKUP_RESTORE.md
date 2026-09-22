# Backup & restore runbook

## What is backed up

| Asset | Method | Frequency | Retention |
|---|---|---|---|
| PostgreSQL database | `pg_dump -Fc` (custom format, compressed) or provider snapshots | daily (04:00 Africa/Cairo) + before every deployment; WAL archiving/PITR recommended for the financial environment | 30 daily, 12 monthly |
| Private documents (`storage/app/private` or the S3 bucket) | bucket versioning + cross-region replication, or `rclone sync` to a second location | continuous (S3) / daily (local) | 90 days versions |
| Configuration | `.env` stored in the secret manager (never in git) | on change | last 10 versions |
| Application code | git tags per release | per release | forever |

Targets (initial, to be ratified before production): **RPO ≤ 4 hours** for the financial environment (PITR/WAL), **RPO ≤ 24 hours** minimum; **RTO ≤ 4 hours** (target), **≤ 8 hours** maximum.

Backups are encrypted at rest (provider encryption or `age`/GPG for file dumps), stored with credentials separate from the application server, and at least one copy is off-site.

## Backup script (reference)

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M)
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" > /backups/db-$STAMP.dump
age -r "$BACKUP_PUBLIC_KEY" -o /backups/db-$STAMP.dump.age /backups/db-$STAMP.dump && rm /backups/db-$STAMP.dump
rclone copy /backups/db-$STAMP.dump.age remote:ev-backups/db/
php artisan backup:record --size="$(stat -c%s /backups/db-$STAMP.dump.age)" --status=success   # writes last-backup metadata read by ev:health
```

Monitoring: `ev:health` reports the age of the last successful backup; the daily checks raise a P1 exception when it exceeds 26 hours, P0 after 3 consecutive failures.

## Restore runbook (disaster: database loss)

1. Provision a clean environment (same PHP/PostgreSQL versions).
2. Restore the database: `age -d -i key.txt db.dump.age > db.dump && pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" db.dump`.
3. Restore private files (bucket restore / `rclone sync remote:ev-backups/files storage/app/private`).
4. Configure secrets (`.env` from the secret manager), `php artisan config:cache`.
5. Start the application, workers (`queue:restart`) and scheduler.
6. Run integrity checks: `php artisan ev:health`, `php artisan finance:reconcile`, `php artisan inventory:reconcile`, `php artisan orders:validate`, `php artisan deliveries:validate`.
7. Smoke tests: login (member, admin, partner), one order page, one receipt download, one station page.
8. Record the incident (`/admin/incidents`), the data-loss window (what happened between the backup time and the failure) and communicate through the status banner.

A restore is successful only when: database restored, private files accessible, application boots, critical relationships valid (0 broken foreign keys), financial reconciliation passed, inventory reconciliation passed, login passed, critical smoke flows passed.

## Restore testing

Quarterly (minimum): restore the latest backup into an isolated environment and execute steps 2–7 above. Record duration (measured RTO), issues and fixes in `docs/restore-tests/<date>.md`. A backup that has never been restored is not considered valid.

## Storage loss

Restore files from bucket versioning/replica, then run `php artisan files:verify` (reports attachments whose file is missing) and treat the report as an exception list; receipts and statements can be regenerated from the database (`receipts:regenerate`) because the database — not the PDF — is the source of truth.
