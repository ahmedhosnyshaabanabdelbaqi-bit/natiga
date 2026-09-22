# Operations handbook

## Daily routine (operations manager / accountant)
1. Open `/admin/operations` (Exception Center): work P0/P1 first. Categories: finance, inventory, orders, shipping, maintenance, integrations, notifications, security, data quality.
2. Review `/admin/payments?status=pending_review` (approve/reject with reason), `/admin/orders?status=awaiting_compatibility`, delayed shipments, today's pickups and bookings, open P0/P1 tickets, failed jobs (`/admin/jobs/failed`), integration statuses (`/admin/integrations`).
3. `ev:daily-checks` runs at 06:00 (Africa/Cairo) and raises exceptions for: failed payments, unallocated approved payments, negative inventory, duplicate receipts, failed jobs, stuck orders, overdue shipments, unprocessed webhooks, expired pickup reservations, overdue tickets, stale scheduler, stale backups, integration outages.

## Severity & response
| Severity | Examples | Response |
|---|---|---|
| P0 | financial data corruption, unauthorized data access, duplicate delivery, duplicate payment effect, platform down | immediate alert to owners (notification + security event), block the affected operation, open an incident (`/admin/incidents`), post a status banner |
| P1 | payment approval failures, inventory mismatch, integration down affecting members, backup failure | same day, incident recommended |
| P2 | delayed shipment data, stale station data, failed marketing sends | within 3 days |
| P3 | cosmetic / data quality | backlog |

P0/P1 incidents get a post-incident review (what happened, impact, timeline, root cause, detection, resolution, prevention) recorded on the incident.

## Failure playbooks
| Failure | Behaviour | Action |
|---|---|---|
| Email provider down | orders/payments continue; emails retry (3 attempts, backoff) then fail with an exception entry | fix credentials → `integrations:check email` → retry failed deliveries from `/admin/notifications` |
| SMS / WhatsApp down or not configured | in-app notification is always delivered; SMS/WhatsApp marked skipped/failed | nothing blocks; enable later |
| Map provider down | stations/centers list, filters and directions links keep working; map shows "temporarily unavailable" | check `/admin/integrations` |
| Charging API down | last known status with timestamp, never "live" | none |
| Shipping API down | history kept; staff add manual tracking events | none |
| Redis down | queues/cache unavailable; database remains source of truth; app degrades (no cached settings, rate limits fall back) | restore Redis; workers reconnect |
| Database down | 503 page, no partial writes (transactions) | restore DB; run reconciliation after recovery |
| Queue worker stopped | jobs wait in Redis; backlog visible in `/admin/jobs/failed` summary | restart Supervisor program |
| Scheduler missed | heartbeat older than 5 min → warning; daily checks raise an exception | check cron; run missed commands manually (`payments:reconcile`, `warranty:send-reminders`, `group-buys:process-deadlines`) |
| Deployment failed | stop rollout, rollback per `DEPLOYMENT.md` | validate with `ev:health` and smoke tests |

## Maintenance mode
`php artisan down --render="errors::503" --retry=60 --secret=<random>` shows the bilingual maintenance page (messages editable in Settings → System). Staff can bypass using `/<secret>`. After `php artisan up`: run `ev:health`, check queue and scheduler, run smoke tests.

## Status banner
Settings → Banners (`/admin/banners`): information / warning / major, targeted at public, member and/or partner spaces, with a schedule. Use it for degraded integrations ("بعض خدمات الدفع غير متاحة مؤقتًا").

## Locks & idempotency
Temporary locks (`Cache::lock`) always carry an expiry (max 30s for request-scoped locks, 10 min for jobs). Idempotency keys expire after 24h (`idempotency_keys.expires_at`) and are purged daily. A dead lock never blocks stock, bookings or deliveries indefinitely.

## Audit maintenance
`audit_logs` are immutable through a PostgreSQL trigger. Retention purges (policy-approved only) run with `SET ev.allow_audit_maintenance = 'on'` in a dedicated maintenance session and are themselves logged and exported before deletion.
