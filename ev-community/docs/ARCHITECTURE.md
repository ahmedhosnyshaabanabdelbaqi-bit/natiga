# Architecture

## Overview

EV Community Egypt is a **modular monolith**: one Laravel application, one PostgreSQL database, one deployable unit, with strictly separated domain modules under `app/Modules/<Module>`. Modules communicate through explicit service calls, registries (dashboard KPIs, garage sections, announcement audiences, importers/exporters, webhook handlers, health checks) and domain events — never through each other's tables directly except via documented contracts (`docs/DOMAIN_CONTRACTS.md`).

```
Browser (React + Inertia)  ──HTTP──▶  Laravel (routes per space)  ──▶  Module services/actions  ──▶  PostgreSQL
                                          │                                   │
                                          ├── Policies/Gates (RBAC)           ├── Redis: cache, queues, locks, rate limits
                                          ├── Middleware: locale, portal,      ├── Queue workers: emails, notifications, PDFs, imports/exports, sync jobs
                                          │   module flags, request id        └── Scheduler: reminders, deadlines, checks, backups metadata
                                          └── Integration layer (providers)  ──▶ external APIs (maps, email, SMS, WhatsApp, payment, shipping, charging, FX)
```

## Spaces

| Space | URL | Who | Layout |
|---|---|---|---|
| Public website | `/{ar|en}/…` | visitors | `PublicLayout` (SEO, hreflang, sitemap) |
| Member portal | `/account/…` | members (active membership) | `MemberLayout` |
| Admin panel | `/admin/…` | staff with `admin.access` (MFA mandatory for privileged roles) | `AdminLayout` (sidebar on the right in Arabic) |
| Partner portal | `/partner/…` | service center / partner users (`partner.access`) | `PartnerLayout` |
| API | `/api/v1/…` | future mobile apps / partner integrations (Sanctum) | JSON `{data, message, errors, meta}` |

One `users` table and one session guard serve all spaces. Portal access is enforced by middleware (`member.portal`, `admin.portal`, `partner.portal`) and every record access by policies with ownership scopes; the frontend hides UI only as a convenience.

## Module map

Core (cannot be disabled): auth, members, vehicles, garage, payments, accounting, support, notifications, reports, cms, audit, system, integrations, files, imports.
Optional (toggle from `/admin/modules` without data loss): catalog, demand, cart, orders, group_buying, suppliers, procurement, shipping, warehouses, inventory, events, deliveries, service_centers, maintenance, partners, home_charging, charging_stations, route_planner (experimental, off by default), warranty, knowledge_base, campaigns, reviews, surveys, referrals.

Each module owns: models + enums, migrations (day-prefixed), services/actions, controllers per space, form requests, policies, jobs, notifications, permissions (`Permissions.php`), settings defaults (`Settings.php`), translations (`lang/{ar,en}/<module>.php`), Inertia pages and feature components, tests.

## Request lifecycle

1. `AssignRequestId` assigns a correlation id (propagated to logs, audit rows, error pages, queued jobs).
2. `SetLocale` resolves the locale (URL prefix → user preference → session/cookie → Accept-Language → default `ar`).
3. Portal middleware checks authentication, account status, membership status / staff access / partner access, and MFA enforcement.
4. `module:<key>` middleware blocks routes of disabled modules.
5. Controllers validate (Form Requests), authorize (policies + `permission:` middleware), and call **actions/services**; controllers never contain business rules.
6. Actions run inside `DB::transaction()` with row locks for contended resources (stock, capacity, payment approval, delivery) and are idempotent (`Idempotency::run`, unique constraints).
7. Side effects (notifications, emails, PDFs, analytics) are dispatched **after commit** to queues; failures there never roll back the core transaction.
8. `HandleInertiaRequests` shares auth (roles/permissions as UI hints), branding, module flags, banners, flash messages.

## Authentication & authorization

- Fortify: email/password login, registration (members only), password reset, email verification (optional by setting), TOTP MFA with recovery codes (encrypted), passkeys.
- Separate login screens `/login`, `/admin/login`, `/partner/login`; the portal is remembered in session and `LoginResponse` routes the user to the right home (never to a portal they cannot access).
- Privileged roles (owner, super-admin, accountant, users with refund/role/user/payment approval permissions) must enable MFA before using the admin panel.
- RBAC: Spatie permission tables (`roles`, `permissions`, `role_permissions`, `user_roles`, `user_permissions`); permission keys are declared per module and synchronised with `ev:sync-permissions`. Owner/super-admin pass every gate. Default access is denied.
- Data ownership: query scopes (`forUser`, `forCenter`) + policies; IDOR tests for every externally visible entity (ULID `public_id` in URLs, never sequential ids).
- Sessions: database driver so users can list and revoke sessions; sessions are invalidated on password reset, account disable and critical role changes.

## Financial flow (summary — details in BUSINESS_RULES.md)

Order (snapshot of items/prices/terms) → charge entry in the **member ledger** → member submits a payment (proof upload ≠ approval) → accountant approves inside one transaction: payment status, ledger credit, allocations to orders, receipt number + PDF job → balance is always recomputed from the ledger. Refunds: requested → approved (maker/checker above threshold) → paid only when the actual payout is recorded. Closed financial periods reject direct edits; corrections are reversal + new entry. Multi-currency purchases store FX snapshots (rate, source, date) and are never revalued.

## Order → procurement → shipment → inventory → delivery flow

Cart (server-side) → checkout (compatibility check, price/stock revalidation, snapshot) → order (`awaiting_payment` / `confirmed`) → group buy or purchase order to a supplier (FX snapshot, landed cost estimate) → shipment (manual or integrated tracking events, documents, expenses, cost allocation rule) → warehouse receiving (inventory movements, packages/barcodes, storage locations) → reservation for orders → pickup event slot booking → delivery by QR scan (row-locked, idempotent, partial deliveries, authorized pickup) → order completion when everything is delivered.

Inventory is a ledger (`inventory_movements`); stock read-model columns are reconciled from it and never allowed to go negative.

## Maintenance flow

RFQ to centers → quotes (structured, comparable per service scope) → member booking (resource-aware capacity, waiting list, expiring reservations) → check-in (QR) → work order → additional-work requests approved by the member → completion → verified service record in My Garage → reviews (verified only) → settlement per center (platform-collected payments only).

## Integration layer

Adapter pattern per category (`App\Modules\Integrations\Contracts\*Provider`): payment, map, email, SMS, WhatsApp, shipping, charging, exchange rates. Drivers are selected by env; without credentials the `NotConfigured` driver is active and the UI says so. Every provider exposes a health check; statuses are visible in `/admin/integrations`. Webhooks are signature-verified, idempotent (`webhook_events` fingerprint), processed by retried jobs, and can never mutate financial data outside the provider's scope.

## Frontend

Inertia pages per space; layouts resolved from the page path; translations for the current locale are injected once per full page load (`window.__EV__`) and consumed by `t()`; language switching is a server round-trip that preserves the current path/query and the server-side cart. Design tokens live in `resources/css/app.css` (brand colors overridable from admin branding settings). Components: shadcn-style primitives + shared building blocks (`DataTable`, `FiltersBar`, `ConfirmDialog`, `QrScanner`, `MapView`…). Code splitting per page; admin code never ships to public pages.

## Observability

Structured logs with request id, audit trail (immutable), security events, integration events, failed-job viewer, scheduler heartbeat, exception center, incidents, `ev:health`, `/up`.
