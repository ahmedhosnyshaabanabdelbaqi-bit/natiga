# Administration backbone (System · Rbac · Audit · Operations)

Owner of the admin "system" area: runtime settings, module switches, staff users, roles & permissions, the audit
log and security events, status banners, failed jobs, the operations Exception Center and incidents, the installer
and health commands, the first-run setup checklist, personal session management and the maintenance (503) page.

Code lives in `app/Modules/System`, `app/Modules/Rbac`, `app/Modules/Audit` (HTTP + permissions),
`app/Modules/Auth/Http/Controllers/Settings/SessionsController.php` (+ `routes/shared.php`) and
`app/Modules/Reports/Operations` (booted by `SystemServiceProvider` until the Reports module ships its own provider).
Translations: `lang/{ar,en}/{system,users,roles,audit,operations}.php`. Pages: `resources/js/pages/admin/{settings,
modules,users,roles,audit-logs,security-events,banners,jobs,operations,incidents,setup}` and
`resources/js/pages/settings/sessions.tsx`; shared UI in `resources/js/features/{system,users,operations}`.

## Routes

All admin routes sit behind `auth`, `active`, `admin.portal` (MFA enforced for privileged roles) **and** a
`permission:` middleware; every controller action re-checks a policy or `Gate`. Mutating routes that grant access
are additionally wrapped by `RecordPrivilegeEscalationAttempt` (see *Security rules*).

| Method & path | Name | Permission |
|---|---|---|
| GET `/admin/settings` | `admin.settings.index` | `settings.view` or `settings.manage` |
| PUT `/admin/settings/{group}` | `admin.settings.update` | `settings.manage` |
| DELETE `/admin/settings/{key}` (reset to default) | `admin.settings.reset` | `settings.manage` |
| POST `/admin/settings/branding/{key}` (image upload) | `admin.settings.upload` | `settings.manage` (+ `throttle:uploads`) |
| GET `/admin/setup` | `admin.setup` | `settings.manage` |
| GET `/admin/modules` · PUT `/admin/modules/{module}` · POST `/admin/modules/review` | `admin.modules.index` · `.update` · `.review` | `modules.manage` |
| GET `/admin/users` | `admin.users.index` | `users.view` or `users.manage` |
| GET `/admin/users/create` · POST `/admin/users` | `admin.users.create` · `.store` | `users.manage` **and** `roles.manage` |
| POST `/admin/users/lookup` (find account by exact e-mail) | `admin.users.lookup` | `roles.manage` |
| GET `/admin/users/{user}` | `admin.users.show` | `users.view` or `users.manage` (+ scope, below) |
| GET `/admin/users/{user}/edit` · PUT `/admin/users/{user}` | `admin.users.edit` · `.update` | `users.manage` |
| POST `/admin/users/{user}/disable` · `/reactivate` · `/reset-access` | `admin.users.disable` · `.reactivate` · `.reset-access` | `users.manage` |
| DELETE `/admin/users/{user}/sessions` · `/sessions/{session}` | `admin.users.sessions.destroy-all` · `.destroy` | `users.manage` |
| PUT `/admin/users/{user}/access` (roles + direct permissions) | `admin.users.access` | `roles.manage` |
| GET `/admin/roles` · POST `/admin/roles` · PUT `/admin/roles/{role}/permissions` · DELETE `/admin/roles/{role}` | `admin.roles.index` · `.store` · `.permissions` · `.destroy` | `roles.manage` |
| GET `/admin/audit-logs` · `/admin/audit-logs/{id}` (JSON detail) · `/actions` (JSON) · `/export` (CSV) | `admin.audit-logs.index` · `.show` · `.actions` · `.export` | `audit.view` |
| GET `/admin/security-events` | `admin.security-events.index` | `security_events.view` |
| GET/POST `/admin/banners` · PUT/DELETE `/admin/banners/{banner}` | `admin.banners.*` | `banners.manage` |
| GET `/admin/jobs/failed` · POST `/admin/jobs/failed/{uuid}/retry` · DELETE `/admin/jobs/failed/{uuid}` | `admin.jobs.failed.*` | `jobs.manage` |
| GET `/admin/operations` | `admin.operations.index` | `operations.view` or `operations.manage` |
| POST `/admin/operations/{exception}/assign` · `/resolve` · `/ignore` | `admin.operations.*` | `operations.manage` |
| GET `/admin/incidents` · `/admin/incidents/{incident}` | `admin.incidents.index` · `.show` | `incidents.view` or `incidents.manage` |
| GET `/admin/incidents/create` · POST `/admin/incidents` · PUT `/{incident}` · POST `/{incident}/status` · POST `/{incident}/notes` · PUT `/{incident}/review` | `admin.incidents.*` | `incidents.manage` |
| GET `/settings/sessions` · POST `/settings/sessions/logout-others` · DELETE `/settings/sessions/{session}` | `shared.settings.sessions.index` · `.logout-others` · `.destroy` | any authenticated active user (own sessions only) |

Public ids: users, exceptions and incidents are bound by ULID `public_id`. Status banners and audit rows are
admin-only records addressed by their numeric id; failed jobs by their queue UUID; roles by slug; settings by key.

## Permissions

| Key | Declared in | Default roles |
|---|---|---|
| `admin.access`, `partner.access` | System | staff roles / partner roles |
| `settings.view` | System | operations-manager |
| `settings.manage`, `modules.manage`, `users.manage`, `roles.manage`, `integrations.manage` | System | super roles only |
| `users.view`, `jobs.manage`, `integrations.view` | System | operations-manager |
| `banners.manage` | System | operations-manager, content-manager |
| `operations.view` | System | operations-manager, accountant, warehouse-officer, shipping-officer, support-agent |
| `operations.manage`, `incidents.manage` | Reports | operations-manager |
| `incidents.view` | Reports | operations-manager, accountant, support-agent |
| `audit.view` | Audit | operations-manager, accountant |
| `security_events.view` | Audit | operations-manager |

`owner` and `super-admin` pass every gate (`Gate::before`). `roles.manage` and `users.manage` are MFA-mandatory
(`config/ev.php`).

## Flows

**Settings.** `SettingsRegistry` aggregates every module's `Settings.php` (plus `SettingsRegistry::register()` for
definitions computed at boot). The page shows one tab per group; each control is chosen by type (`string`, `text`,
`int`, `decimal`, `bool`, `select`, `json`, `image`) or `input` (`color` for hex rules, `secret` for sensitive keys).
`SettingsForm::save()` validates a group's values with each definition's `rules` (+ a type rule) and saves changed
keys through `Settings::setMany()` — one `settings.updated` audit row per key, with the optional change note as
reason. Sensitive values are never sent to the browser (masked `••••••••`, never public), the mask coming back is
ignored, and audit rows store `[redacted]`. Image keys can only change through the upload endpoint: the real MIME
type is sniffed with `finfo` (PNG/JPEG/WEBP, ICO for the favicon), ≤ 2 MB, stored on the `public` disk under
`branding/` with a random name; the previous file is deleted. "Reset to default" deletes the override
(`settings.reset`). Option labels for `select` settings come from an optional `option_labels` map in the definition.

**Modules.** `Modules::setEnabled()` refuses to disable a `core` module; the page requires a reason (≥ 5 chars),
audited as `modules.enabled` / `modules.disabled`. "Confirm configuration" (`Modules::persistDefaults()`) stores every
module's current state so future changes of `default_enabled` never flip a live module (`modules.reviewed`).

**Users.** The list shows accounts holding a non-member role or `admin.access` / `partner.access`
(`StaffUsers::scope()`), with search, role/status/MFA filters, sorting and page size. A plain member account is only
reachable here by a `roles.manage` holder (the only way to turn a member into staff, via *Find existing account*) —
`users.view` cannot be used to browse member profiles by id. Creating a user never sets a password: the user receives
a password-setup link (`Password::broker()->sendResetLink`). Disable (reason) sets `status=disabled`, deletes all
sessions and API tokens and rotates the remember token (`users.disabled`, security event `account_disabled`).
Reactivate requires a reason. Reset access revokes sessions/tokens, rotates the remember token, e-mails a reset link
and optionally clears TOTP MFA (reason required → `mfa_reset_by_admin`). The detail page has profile, roles &
permissions, login history, security events and active sessions tabs (sessions are listed with opaque keys — HMAC of
the session id — never raw session ids).

**Roles.** The matrix shows every role × permission grouped by module with AR/EN labels. Saving a role's column
requires a reason and is audited as `roles.permissions_changed` (added/removed lists). Super roles are read-only.
Custom roles (slug + AR/EN names in `role_meta`) can be created, and deleted only when no user holds them.
`RbacSync` (`php artisan ev:sync-permissions`) creates missing permissions/roles, seeds `role_meta` names for built-in
roles, grants **newly created** permissions to their default roles and never re-adds a default permission an admin
removed (`--reset` restores registry defaults and names).

**Audit log.** Filters: actor (name/e-mail/id), action (exact or `prefix.*`), entity type/id, request id, date range.
Row click opens a drawer (JSON detail) with the old/new diff (`[redacted]` values shown as hidden), reason, IP,
device and links to "all entries of this request / entity". CSV export streams up to 10 000 rows (newest first) of the
current filter with a UTF-8 BOM, neutralises spreadsheet formulas (`=`, `+`, `-`, `@` prefixed with `'`) and is itself
audited (`audit.exported`). Audit rows are immutable (model guard + PostgreSQL trigger).

**Security events.** Filters: user, event type, severity, date range and a "critical only" quick filter (critical
severity or a type in `SecurityEvents::CRITICAL`); the page highlights the last 7 days' critical count.

**Status banners.** Level (information/warning/major), AR/EN messages, targets (public/member/partner), active flag
and an optional Cairo-time window. Current banners are shared by `HandleInertiaRequests` with the matching portal.
Create/update/delete are audited (`banners.*`).

**Failed jobs & queue health.** Lists job display name, queue, connection, attempts, failed time and only the first
300 characters of the exception's first line (payloads are never shown). Retry (`queue:retry`, errors reported without
losing the job) and delete are audited (`jobs.retried` / `jobs.deleted`). The health card shows the queue connection,
pending jobs per queue, running and failed counts and the scheduler heartbeat (`ev.scheduler.heartbeat`, written every
minute by a scheduled closure; older than 5 minutes = warning).

**Exception Center.** Modules report problems instead of silently logging:

```php
app(\App\Modules\Reports\Operations\Services\OperationsExceptions::class)
    ->raise('finance', 'p1', 'Unallocated payment PAY-2026-000012', ['payment_id' => 12], dedupKey: 'finance:unallocated:12', source: 'finance:reconcile');
```

Categories: finance, inventory, orders, shipping, maintenance, integrations, notifications, security, data_quality.
Severities p0–p3. While an exception with the same `dedupKey` is open/assigned (one live row per key, enforced by a
partial unique index), raising again increments `occurrences`, refreshes `detected_at`, merges details and only ever
escalates severity. A **P0** records a critical `operations_p0_exception` security event and notifies every active
`operations.manage` holder and super user through `Notify::send` (key `operations.p0_exception`). Assign (to an
eligible user, optional note), resolve (resolution ≥ 5 chars) and ignore (reason ≥ 5 chars) are audited.
`resolveByKey($key)` auto-resolves when a condition recovers.

**Daily checks.** `HealthChecks::register(key, fn (OperationsExceptions $ops): array|string|null)` — return `null` when
healthy, an array `{category, severity, title, details?}` to raise (deduplicated per check, auto-resolved when it passes
again) or a string for an informational message. `php artisan ev:daily-checks [--only=key] [--list]` runs daily at
06:00 Africa/Cairo. Built-in checks: `system.failed_jobs`, `system.scheduler_heartbeat`,
`security.disabled_users_with_sessions` (revokes them), `integrations.unavailable` (when the Integrations module is
present), `system.idempotency_purge`. A crashing check raises a `data_quality` exception and makes the command fail.

**Incidents.** Declared with title, severity, affected module, impact, start/detection time and owner (defaults to the
declarer; owners must hold `incidents.manage`/`operations.manage`). Numbers `INC-YYYY-NNNN`. Lifecycle open →
investigating → mitigated → resolved → closed (reopen paths allowed); closing requires the post-incident review's root
cause and resolution. Every transition, note, detail and review change is written to the incident timeline and the
audit log.

**Installer & health.** `php artisan ev:install` syncs roles/permissions and creates the first owner (interactive, or
`--name/--email/--password`, or `EV_OWNER_NAME/EV_OWNER_EMAIL/EV_OWNER_PASSWORD` read from the process environment so
it works with a cached config). It refuses when an owner exists and requires a strong password (≥ 12, mixed case,
numbers, symbols). `php artisan ev:health [--strict] [--json]` checks the database, cache, Redis (when used), queue
tables, storage and the scheduler heartbeat; failures exit 1 (warnings too with `--strict`). `/admin/setup` shows a
live checklist (owner, owner MFA, branding, contact, base currency, e-mail, maps, registration mode, roles synced,
modules reviewed, final policies) linking to the page that fixes each item when that page exists.

**Maintenance page.** `resources/views/errors/503.blade.php` is self-contained (no scripts, no technical details),
bilingual, and uses `system.maintenance_message_ar/en` and the branding colours/logo. Put the site in maintenance with
`php artisan down --render="errors::503" --retry=60` (the view is pre-rendered, so it works while the database is
down).

**Personal sessions.** `/settings/sessions` lists the user's sessions (database session driver). Logging out other
devices requires the current password, deletes the other session rows and rehashes the password so "remember me"
cookies elsewhere stop working (`sessions.logged_out_others` + security event `sessions_revoked`). A single session is
revoked by its opaque key and only if it belongs to the user; the current session cannot be revoked from the list.

## Security rules (server-side)

- Nobody changes their own roles or permissions (`self_privilege_change_blocked`).
- Only owner/super-admin may grant or remove `owner`/`super-admin` or act on a super account.
- A non-super actor may only grant permissions they hold — directly, through a granted role, or in the role matrix.
- The last active owner can neither be disabled nor lose the owner role.
- The `member` role is never assigned from the admin panel; it is preserved when a member is promoted to staff.
- Every blocked attempt is recorded as a critical `permission_escalation_blocked` security event. For actors lacking
  `roles.manage` entirely, `RecordPrivilegeEscalationAttempt` records the attempt before the permission middleware
  answers 403. Rule checks run before the transaction so the event is committed although the change is refused.
- Successful changes: audit `users.roles_changed` (old/new roles and permissions, reason) and security events
  `role_changed`, `permissions_changed` and `permission_escalation` (when a super role is granted).

## Registries other modules use

| Registry | Where | Use |
|---|---|---|
| `Settings.php` per module / `SettingsRegistry::register()` | System | declare settings (`group`, `type`, `default`, `public`, `sensitive`, `label`, `rules`, `options`, `option_labels`, `help`) |
| `Settings::get/bool/int/decimal/localized/set/setMany` | System | read/write settings (writes are audited) |
| `Modules::enabled($key)` + `module:` middleware | System | module switches |
| `DashboardKpis::register()` | System | real, query-backed dashboard KPIs |
| `Permissions.php` per module | Rbac | permission keys, AR/EN labels, default roles |
| `AuditService::log()` / `SecurityEvents::record()` | Audit | audit trail / security events |
| `OperationsExceptions::raise()` / `resolveByKey()` | Reports/Operations | Exception Center |
| `HealthChecks::register()` | Reports/Operations | daily data-quality checks |
| `SchedulerHeartbeat::status()` | System | scheduler liveness |

## Tests

`tests/Feature/{System,Rbac,Audit,Operations}`: settings (permissions, audit, validation, masking, reset, uploads),
modules (reason, core lock, review), user access rules (support agent 403, accountant self super-admin 403 + security
event, operations manager cannot grant unheld permissions, owner can, self-change, last owner, member promotion),
staff users (list scope, IDOR on member accounts, create + reset link, disable deletes sessions/tokens, reactivate,
reset access + MFA, session keys, profile update, lookup), personal sessions (logout-others deletes only other
sessions), banners and failed jobs, installer/health/scheduler/setup/503, roles matrix + RbacSync, audit log (filters,
redacted detail, CSV export + formula neutralisation, immutability via model guard and DB trigger), security events,
Exception Center (dedup, recurrence, unique live key, P0 alert, assign/resolve/ignore), daily checks and incidents.
Run: `DB_DATABASE=ev_test_4 php artisan test tests/Feature/System tests/Feature/Rbac tests/Feature/Audit tests/Feature/Operations`.
