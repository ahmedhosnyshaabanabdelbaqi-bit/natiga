# Requirements traceability matrix

Status legend: ✅ implemented & tested · 🟡 implemented, tests partial · 🔧 in development · ⏸ deferred (reason given) · 🔌 architecture ready, integration Not Configured (needs credentials/contract) · ❌ blocked.
Section numbers refer to the master development brief. Update this file with every release.

| § | Requirement | Module(s) | Implementation | Tests | Status |
|---|---|---|---|---|---|
| 01–02 | Web-only responsive platform; mobile-ready backend | all | Inertia pages per space, `/api/v1` reserved (Sanctum) | smoke | 🔧 |
| 03 | Modular monolith; enable/disable modules without data loss | system | `config/ev.php` modules, `module_settings`, `module:` middleware, `/admin/modules` | Feature/System | 🔧 |
| 04 | Four spaces (public, member, admin `/admin/login`, partner `/partner/login`) | auth | portal middleware, `PortalLoginController`, `LoginResponse` | Feature/Auth | ✅ |
| 05 | Arabic default RTL, `/ar` `/en` public URLs, locale everywhere, no loss on switch, technical codes untranslated | auth, all | `SetLocale`, `LocaleController`, `TranslationExporter`, `t()`, `<Code>` | Feature/Localization | 🟡 |
| 06 | EGP base, supplier currencies, FX snapshots, Africa/Cairo | accounting, integrations | `currencies`, `exchange_rates`, `ExchangeRates::convertToBase`, `Money::convert` | Unit/Integrations | 🔧 |
| 07 | Laravel + React/TS/Inertia + PostgreSQL + Redis; policies, requests, services, jobs, transactions, constraints, rate limits, audit | all | foundation | all | ✅ |
| 08–09 | Premium bilingual UI, states, accessibility; homepage sections configurable | cms, ui | design tokens, shared components, `general.homepage_sections` | manual + Localization | 🔧 |
| 10–11 | Membership fields/statuses/registration modes; digital card with server-verified QR | members | `memberships`, `ChangeMembershipStatus`, `MembershipQr`, verify endpoints | Feature/Members | 🔧 |
| 12–13 | Multiple vehicles per member; My Garage aggregation | vehicles, garage | `member_vehicles`, `GarageSections` registry | Feature/Vehicles, Garage | 🔧 |
| 14–16 | Products, variants, compatibility engine with statuses & warnings | catalog | `products*`, `product_vehicle_compatibilities`, `CompatibilityEngine` | Feature/Catalog | 🔧 |
| 17 | Global search with filters (AR/EN, SKU/OEM/part number normalisation) | catalog | `SearchService` (PostgreSQL, swappable) | Feature/Catalog/Search | 🔧 |
| 18–20 | Wishlist, alerts, collective demand, part requests + quotations → order | demand | `wishlists`, `product_interests`, `part_requests`, `part_request_quotes` | Feature/Demand | 🔧 |
| 21 | Price history with sources/dates | catalog | `product_prices`, `product_price_history` | Feature/Catalog | 🔧 |
| 22–24 | Server cart, fulfillment groups, checkout snapshot, separated statuses, history | cart, orders | `carts`, `orders`, `order_items`, `order_status_history` | Feature/Orders | 🔧 |
| 25–26 | Group buying (interested vs confirmed, progress) and demand-based opportunities (no auto-buy) | group_buying | `group_buys*`, opportunities report | Feature/GroupBuying | 🔧 |
| 27–32 | Payments review, member financial account, allocations, receipts PDF, ledger, money rules | payments, accounting | `ApprovePayment`, `payment_allocations`, `receipts`, `member_ledger_entries`, `Money` | Feature/Payments, Unit/Money | 🔧 |
| 33–35 | Maker/checker thresholds, financial closing, bank reconciliation (CSV/XLSX) | accounting | `refund_approvals`, `financial_periods`, `bank_*` | Feature/Accounting | 🔧 |
| 36–40 | Suppliers, RFQ, purchase orders, landed cost, allocation rules | suppliers, procurement | `suppliers*`, `purchase_orders*`, `expenses`, `cost_allocations` | Feature/Procurement | 🔧 |
| 41–43 | Shipments statuses, manual vs live tracking, document center | shipping | `shipments*`, `shipment_events.source` | Feature/Shipping | 🔧 |
| 44–47 | Warehouses, inventory ledger (no negative stock), barcodes/QR, mobile warehouse screens | warehouses, inventory | `inventory_movements`, `InventoryService`, `barcode_identifiers`, mobile pages | Feature/Inventory (+concurrency) | 🔧 |
| 48–54 | Events, slots with capacity, ops dashboard, delivery by QR, partial delivery, authorized pickup, duplicate protection | events, deliveries | `event_slots`, `deliveries*`, `pickup_authorizations`, idempotency + locks | Feature/Events, Deliveries | 🔧 |
| 55–58 | Service centers, maintenance RFQ, quotes, comparison | service_centers, maintenance | `service_centers*`, `maintenance_rfqs`, `center_quotes` | Feature/Maintenance | 🔧 |
| 59–73 | Partner portal, branches, services, resources/capacity, booking, waiting list, check-in, work orders, additional work approval, completion, history, reminders, payment modes, settlements, performance | service_centers, maintenance | partner routes, `maintenance_bookings`, `work_orders`, `additional_work_requests`, `service_records`, `center_settlements` | Feature/Maintenance, Partner | 🔧 |
| 74–76 | Verified reviews with moderation; complaints with escalation & full history | reviews, support | `reviews`, `support_tickets` (category complaint) | Feature/Reviews, Support | 🔧 |
| 77–79 | Partner offers, member discount verification via QR, redemption limits | partners | `partner_offers`, `offer_redemptions`, `MembershipQr` | Feature/Partners | 🔧 |
| 80–83 | Home charging requests, quotations comparison, workflow | home_charging | `home_charging_requests`, `home_charging_quotes`, `installation_*` | Feature/HomeCharging | 🔧 |
| 84–96 | Charging stations map/list, units, connector master data, compatibility, search/filters, optional location, directions, tariffs with sources, status provenance, community reports, verification dashboard, member-suggested stations | charging_stations, vehicles | `charging_stations*`, `connector_types`, `connector_compatibility_rules`, `MapView` | Feature/ChargingStations | 🔧 |
| 97 | Route charging planner (future) | route_planner | module flag off by default; architecture only | — | ⏸ needs reliable range/consumption data |
| 98–100 | Warranty records, alerts, claims | warranty | `warranties`, `warranty_claims`, reminders job | Feature/Warranty | 🔧 |
| 101–104 | Knowledge base, vehicle-specific content, community issues & analytics (privacy) | knowledge_base | `articles*`, `community_vehicle_issues` | Feature/KnowledgeBase | 🔧 |
| 105–107 | Campaigns & recalls with sources; "may apply" matching | campaigns | `vehicle_campaigns`, `member_campaign_matches` | Feature/Campaigns | 🔧 |
| 108–110 | Event types, registration, waiting list, QR attendance | events | `event_registrations`, `event_checkins` | Feature/Events | 🔧 |
| 111–112 | Surveys & polls with targeting | surveys | `surveys*` | Feature/Surveys | 🔧 |
| 113 | Referral system (no automatic rewards) | referrals | `member_referrals`, `referrals.enabled` | Feature/Referrals | 🔧 |
| 114–117 | Notification center, channels (only when configured), preferences, announcements | notifications | `Notify`, `notification_preferences`, `announcement_campaigns` | Feature/Notifications | 🔧 |
| 118–120 | Support center, SLA, attachments with validation | support, files | `support_tickets`, `sla_policies`, `AttachmentService` | Feature/Support, Files | 🔧 |
| 121–123 | Admin panel menu, real KPIs with sources, charts with date filters | system, reports | `DashboardKpis`, reports charts | Feature/Reports | 🔧 |
| 124–128 | RBAC roles, granular permissions, server enforcement, ownership scoping, admin user management | rbac, system | Spatie + `PermissionRegistry`, policies, `/admin/users`, `/admin/roles` | Feature/Rbac, System | 🔧 |
| 129–130 | Session management, MFA (TOTP + recovery codes) mandatory for privileged roles | auth | `SessionManager`, Fortify 2FA, `EnsureAdminPortal` | Feature/Auth, Settings | 🟡 |
| 131–133 | Immutable audit trail with reason for sensitive ops | audit | `AuditService`, PostgreSQL trigger, `/admin/audit-logs` | Feature/Audit | 🟡 |
| 134–180 | Database architecture, identifiers, tables per domain, constraints, indexes | all | migrations (day-prefixed), `docs/DATABASE.md` | migrations on CI | 🔧 |
| 181–183 | Transactions, concurrency control, idempotency | support | `DB::transaction`, `lockForUpdate`, `Idempotency`, unique constraints | concurrency tests | 🔧 |
| 184–187 | Controller/service separation, future `/api/v1`, standard responses, Sanctum | all | `routes/api.php`, module `routes/api.php` | Feature/Api | 🟡 |
| 188–210 | Integration layer: payment, maps, email, SMS, WhatsApp, shipping, charging, FX; webhooks; not-configured states | integrations | contracts + drivers + `webhook_events` + `/admin/integrations` | Feature/Integrations | 🔌 |
| 211–216 | Storage abstraction, private downloads, image processing, PDF (AR/EN), QR, barcode | files, support | `AttachmentService`, `FileDownloadController`, `PdfService`, `QrService`, `BarcodeService` | Feature/Files, Unit/Support | 🔧 |
| 217–218 | PostgreSQL search with swappable engine; AR/EN normalisation without touching codes | catalog | `SearchService` | Feature/Catalog/Search | 🔧 |
| 219–223 | Cache, Redis, queues, failed jobs, scheduler | system | Redis config, `/admin/jobs/failed`, scheduler heartbeat | Feature/System | 🔧 |
| 224–229 | Import/export framework with preview/validation/report, async, permissions | imports | `Importer`/`Exporter`, wizard pages | Feature/Imports | 🔧 |
| 230–232 | Webhook framework (idempotent), outbound webhooks (future) | integrations | `WebhookController`, `WebhookHandlers` | Feature/Integrations | 🔌 |
| 233–252 | Security baseline (passwords, login protection, CSRF, XSS, SQLi, uploads, sensitive data, logging privacy, rate limits, security events, retention, deactivation, privacy, consent, terms versioning, SEO/robots) | auth, system, members, cms | see `docs/SECURITY.md` | Feature/Security | 🔧 |
| 253–261 | Performance & mobile UX (pagination, tables, images, code splitting, accessibility, RTL) | all | server pagination, `DataTable`, lazy pages | manual + perf | 🔧 |
| 262–336 | QA strategy, test suites, scenarios, environments, monitoring, backups, restore tests | all | `docs/TESTING.md`, `docs/BACKUP_RESTORE.md`, CI | CI | 🔧 |
| 337–393 | Numerical acceptance criteria, readiness gates, deployment/migration/rollback | all | `docs/GO_LIVE_CHECKLIST.md`, `docs/DEPLOYMENT.md` | — | 🔧 |
| 394–503 | Zero data loss, consistency checks, exception center, incidents, business continuity, recovery | reports, accounting, inventory | reconciliation commands, `operations_exceptions`, `incidents` | Feature/Operations | 🔧 |
| 504–528 | Versioning, release notes, change management, DoR/DoD, readiness report, integration/module matrices, traceability, admin search, command palette, operational dashboard, personalised dashboards | system, reports | `CHANGELOG.md`, this file, `/admin/integrations`, `/admin/modules`, `CommandPalette`, `/admin/operations` | — | 🔧 |
| DB spec | Full PostgreSQL implementation, seeders/factories, ERD, data dictionary, reconciliation, backup/restore | all | migrations, `ev:schema-docs`, `finance:reconcile`, `inventory:reconcile` | CI | 🔧 |
