# EV Community Egypt — Engineering Conventions (binding)

Every module in this repository follows these rules. They are the contract between
the foundation and the domain modules. Read this file completely before writing code.

## 1. Stack

- Laravel 13 (PHP 8.4), PostgreSQL 16, Redis (queues/cache/locks), Inertia 3 + React 19 + TypeScript, Tailwind 4, shadcn-style components (`resources/js/components/ui`).
- Modular monolith. Business logic lives in module services/actions — never in React components or controllers.
- PostgreSQL is the source of truth. LocalStorage / Redis / client state never hold authoritative data.

## 2. Module layout

```
app/Modules/<Module>/
  Models/            Eloquent models (+ Enums/ for PHP enums)
  Services/          Stateless services (orchestration, queries)
  Actions/           One transactional business operation per class: `__invoke()` / `execute()`
  Http/Controllers/{Admin,Member,Partner,Public,Api}/
  Http/Requests/     FormRequests (authorize() + rules())
  Policies/          Laravel policies (registered in the module's ServiceProvider or via model `#[UsePolicy]` / naming convention)
  Jobs/  Notifications/  Events/  Listeners/  Console/
  Permissions.php    returns array<string, array{label: array{ar:string,en:string}, roles: string[]}>  (see §7)
  routes/{public,member,admin,partner,api}.php   (any subset; auto-loaded by App\Providers\ModuleServiceProvider)
  <Module>ServiceProvider.php (optional; auto-registered when present)
database/migrations/2026_01_<DD>_<HHMMSS>_<module>_<what>.php     (DD = module day, see §5)
database/factories/<Module>/<Model>Factory.php   (namespace Database\Factories\<Module>; model must set `protected static string $factory` or use `newFactory()`)
database/seeders/<Module>/<X>Seeder.php          (master data only, idempotent: use updateOrCreate)
lang/ar/<module>.php  lang/en/<module>.php       (identical key sets; see §8)
resources/js/pages/{public,member,admin,partner}/<module>/*.tsx
resources/js/features/<module>/                  (module-specific components/hooks/types)
tests/Feature/<Module>/*Test.php  tests/Unit/<Module>/*Test.php
```

Module keys (snake_case) used in `config/ev.php` `modules`, in `lang` filenames, in permissions and in `module:` middleware:
`auth members vehicles garage catalog demand cart orders group_buying payments accounting suppliers procurement shipping warehouses inventory events deliveries service_centers maintenance partners home_charging charging_stations warranty knowledge_base campaigns support reviews notifications surveys referrals reports cms audit system integrations files imports`.

## 3. Routing & portals

Four spaces, one `users` table, one `web` guard. Access is enforced server-side by middleware + policies.

| Space | Prefix | Middleware alias | Route name prefix | Layout |
|---|---|---|---|---|
| Public website | `/{locale}` (`ar`,`en`) | `locale.public` | `public.` | `PublicLayout` |
| Member portal | `/account` | `auth`, `member.portal` | `member.` | `MemberLayout` |
| Admin panel | `/admin` | `auth`, `admin.portal` | `admin.` | `AdminLayout` |
| Partner portal | `/partner` | `auth`, `partner.portal` | `partner.` | `PartnerLayout` |
| API | `/api/v1` | `auth:sanctum` | `api.v1.` | JSON `{data,message,errors,meta}` |

Module route files are loaded already inside the right group. Write only the inner routes, e.g. in
`app/Modules/Orders/routes/admin.php`:
```php
Route::middleware('module:orders')->prefix('orders')->name('orders.')->group(function () {
    Route::get('/', [OrderController::class, 'index'])->name('index');       // admin.orders.index → /admin/orders
    Route::get('{order}', [OrderController::class, 'show'])->name('show');
});
```
- Public route files receive `{locale}` automatically. Generate public URLs with `route('public.x', ['locale' => app()->getLocale()])` or the helper `lroute('public.x', [...])`.
- Never use GET for state changes. Use POST/PUT/PATCH/DELETE (CSRF protected by the `web` group).
- Route model binding for externally visible entities binds by `public_id` (ULID): use `HasPublicId` trait and `{order:public_id}` or set `getRouteKeyName()` (the trait does it).
- Sensitive operations require `permission:<key>` middleware AND a policy check (`$this->authorize()`); defense in depth.

## 4. Authorization

- Spatie permissions. Permission keys are `<module>.<action>` (`orders.view`, `payments.approve`). Declare every permission in the module `Permissions.php`; never hardcode names only in the frontend.
- Roles (slugs): `owner super-admin operations-manager accountant procurement-officer shipping-officer warehouse-officer delivery-officer maintenance-manager charging-content-manager content-manager support-agent service-center-admin service-center-employee member`.
- `owner` and `super-admin` pass every gate (Gate::before) except explicitly immutable things (audit deletion is impossible for everyone).
- Data ownership: every query that returns member/center-scoped data goes through a scope: `Order::forMember($member)`, `Booking::forCenter($center)`. Controllers never load by id without a policy check. IDOR tests are mandatory (§10).
- Partner scoping: `center_users` (user_id, service_center_id, role, branch_id nullable). Use `$request->user()->currentCenter()` (from `App\Modules\ServiceCenters`), never a center id from the request.
- Frontend: `usePage().props.auth.permissions` (string[]) and `can('orders.view')` from `@/lib/auth` only for hiding UI.

## 5. Database rules

- Migration day per domain (file prefix `2026_01_<DD>_`): 01 core(foundation) · 02 members · 03 vehicles · 04 catalog · 05 demand · 06 cart+orders · 07 group_buying · 08 payments+accounting · 09 suppliers+procurement+costs · 10 shipping · 11 warehouses+inventory+packages · 12 events · 13 deliveries · 14 service_centers · 15 maintenance+settlements · 16 partners+offers · 17 home_charging · 18 charging_stations · 19 warranty · 20 knowledge+community_issues+campaigns · 21 support+reviews+complaints · 22 notifications+announcements+surveys+referrals · 23 cms · 24 reports+imports+exports+operations. A module may reference tables from lower days only.
- IDs: `$table->id()` bigint PK. Externally visible entities also get `$table->ulid('public_id')->unique()`.
- Money: `decimal('amount', 14, 2)` (never float) + `string('currency', 3)`. Use `App\Support\Money\Money` (brick/money wrapper) for arithmetic and allocation. Store FX snapshots (`fx_rate`, `fx_source`, `fx_rate_date`, `original_amount`, `original_currency`) on any converted amount.
- Quantities: `integer`/`decimal(12,3)` with `CHECK (quantity > 0)` where required.
- Timestamps: `timestampsTz()`; app timezone Africa/Cairo, DB stores UTC.
- Foreign keys are real (`->constrained()`), and **never cascade-delete financial, inventory, audit or order history**. Use `restrictOnDelete()` for those and `nullOnDelete()` only for optional references.
- Check constraints: `DB::statement('ALTER TABLE x ADD CONSTRAINT x_qty_positive CHECK (quantity > 0)')` in the same migration (guard with `if (DB::getDriverName() === 'pgsql')` — tests run on PostgreSQL too).
- Unique constraints on business identifiers (order_number, receipt_number, member_number, sku, barcode, (provider, external_event_id)).
- Status columns are `string` backed by a PHP enum (`enum` cast). Keep a `*_status_history` table for orders/payments/bookings/shipments/tickets.
- Ledgers are append-only (member_ledger_entries, inventory_movements, audit_logs). Corrections are reversal + new entry.
- JSONB (`->jsonb()`) only for genuinely flexible data (specifications, snapshot copies, provider payloads).
- Soft deletes only for master data that can be archived (products, articles, stations). Never on financial or history tables.
- Indexes on FKs used in filters, `status`, `created_at`, business numbers, and composite indexes for the lists you actually query (`(member_id, status)`, `(warehouse_id, product_variant_id)`).
- Concurrency: `lockForUpdate()` inside `DB::transaction()` for stock, capacity, payment approval, deliveries. Use `App\Support\Idempotency\Idempotency::run($scope, $key, fn)` for idempotent operations and `Cache::lock()` for cross-request coordination when needed (with expiry).
- Sequence numbers: `App\Support\Sequence\NumberSequence::next('order')` → `ORD-2026-000001` (keys: order, receipt, payment, ticket, shipment, po, rfq, booking, work_order, delivery, refund, settlement, claim, member, invoice, package, incident).

## 6. Service/Action patterns

```php
final class ApprovePayment
{
    public function __construct(private AuditService $audit, private LedgerService $ledger) {}

    public function execute(Payment $payment, User $actor, ?string $reason = null): Payment
    {
        return DB::transaction(function () use ($payment, $actor, $reason) {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($payment->status === PaymentStatus::Approved) { return $payment; } // idempotent
            ... // state change, ledger entry, receipt, allocations
            $this->audit->log('payments.approved', $payment, old: [...], new: [...], reason: $reason, actor: $actor);
            DB::afterCommit(fn () => PaymentApproved::dispatch($payment)); // side effects (notifications/PDF) run after commit via queued listeners
            return $payment;
        });
    }
}
```
- Core transaction = DB state. Side effects (emails, notifications, PDFs, analytics) go to queued jobs/listeners after commit and must be retry-safe.
- Throw `App\Support\Exceptions\DomainException` (translatable `__('key')`) for business rule violations; the handler renders it as a validation error / flash for Inertia and JSON for API.
- Sensitive operations require a `reason` (validated `required|string|min:5`) which is stored in the audit trail and in the record.

## 7. Permissions.php format

```php
return [
    'orders.view'   => ['label' => ['ar' => 'عرض الطلبات', 'en' => 'View orders'], 'roles' => ['operations-manager', 'support-agent', 'accountant']],
    'orders.edit'   => ['label' => ['ar' => 'تعديل الطلبات', 'en' => 'Edit orders'], 'roles' => ['operations-manager']],
];
```
`owner`/`super-admin` are implicit. Run `php artisan ev:sync-permissions` (idempotent) after adding permissions; the RBAC seeder calls it.

## 8. Localization

- Arabic default, English secondary. Everything user-facing goes through translation keys: backend `__('orders.status.confirmed')`, frontend `t('orders.status.confirmed')` from `@/lib/i18n` (same keys, same files: `lang/{ar,en}/<module>.php`). Keys are dotted, lowercase snake_case. Parameters: `:name` style on both sides.
- Never translate technical codes (VIN, SKU, part numbers, tracking numbers, model codes). Render them in `<Code>` (`@/components/ui/code`) with `dir="ltr"`.
- Translatable DB content uses a `<table>_translations` table with `locale` + text columns, via `App\Support\Concerns\HasTranslations` (`$model->tr('name')` returns the current locale value with fallback).
- Enums implement `App\Support\Contracts\HasLabel` (`label(): string` via `__()`), and expose `options()` for selects.
- Dates: format on the frontend with `formatDate/formatDateTime` from `@/lib/format` (Africa/Cairo). Money: `formatMoney(amount, currency)`.

## 9. Frontend

- Page components live under `resources/js/pages/<space>/<module>/...` and are wrapped automatically by the space layout (resolved from the path prefix in `app.tsx`). Export default the page; optionally `Page.layout = { breadcrumbs: [...], title }`.
- Use the shared components in `@/components/shared`: `PageHeader`, `DataTable` (server-driven: search/filters/sort/pagination with URL state), `StatusBadge`, `EmptyState`, `ErrorState`, `StatCard`, `ConfirmDialog`, `FormField`, `Money`, `DateTime`, `Code`, `FiltersBar`, `SectionCard`, `Timeline`, `SkeletonTable`, `Pagination`, `LanguageSwitcher`, `QrScanner`, `FileUpload`, `AddressMapPicker`.
- Forms: Inertia `useForm`/`<Form>`; errors come from server validation. Never trust client-side prices/quantities.
- Data tables are server-side paginated: controllers return `Paginator` JSON via `Inertia::render('admin/orders/index', ['orders' => OrderResource::collection($paginator), 'filters' => $request->only(...)])`. Sorting/filtering whitelists live in the service (`allowedSorts`, `allowedFilters`).
- Design tokens: primary `#0B1220`, accent `#0F766E`, background `#F8FAFC`, success/warning/danger semantic colors (see `resources/css/app.css`). Fonts: Cairo (ar) / Inter (en). RTL: use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`) never `ml-/mr-/left-/right-`. Icons that indicate direction use `rtl:rotate-180`.
- States: every list/detail page handles loading (skeleton), empty, error, no-results and permission-denied states.
- Accessibility: labels on all inputs (`FormField`), focus-visible rings, keyboard-operable dialogs (Radix), `aria-*` on custom controls.
- Don't load admin code in public pages (pages are code-split automatically by Inertia's resolver).

## 10. Tests (PostgreSQL, `DB_DATABASE=ev_community_test`, run `php artisan test --filter=<Module>`)

Each module ships at minimum:
- Feature tests for the core flows (happy path + validation).
- Authorization tests: member A cannot see B's records (IDOR by public_id), staff without permission gets 403, partner A cannot see center B.
- Unit tests for money/quantity/capacity calculations.
- Concurrency tests where applicable (last unit / last slot / duplicate delivery) using two sequential transactions with `lockForUpdate` semantics or `Idempotency`.
Use `Tests\TestCase` helpers: `$this->actingAsMember()`, `$this->actingAsStaff(['orders.view'])`, `$this->actingAsRole('accountant')`, `$this->actingAsCenterUser($center)`. Parallel agents must use their own database: `DB_DATABASE=ev_test_<n> php artisan test ...` (databases `ev_test_1`..`ev_test_16` exist locally).

## 11. Audit, security, files

- `App\Modules\Audit\Services\AuditService::log(string $action, ?Model $entity, array $old = [], array $new = [], ?string $reason = null, ?User $actor = null)`; call it for every state change listed in the spec (§131/§384). Audit rows are immutable (DB trigger + model guard).
- Security events: `SecurityEvents::record($user, 'password_changed', meta)`.
- File uploads only through `App\Modules\Files\Services\AttachmentService` (MIME sniffing, size limits from settings, random storage names, private disk). Downloads only via `route('files.download', $attachment)` which authorizes through the owner's `attachmentViewableBy()`.
- Never log secrets/PII. Never expose stack traces (handled centrally). Rate limits: define a named limiter per exposed endpoint class (`RateLimiter::for('support-tickets', ...)`) in your ServiceProvider and apply `throttle:support-tickets`.
- Settings: `Settings::get('orders.deposit_percentage', 30)`; declare defaults in the module's `Settings.php` (same shape as Permissions.php: key ⇒ [group, type, default, public, label]). Module on/off: `Modules::enabled('group_buying')`, middleware `module:group_buying`.

## 12. Code style

- `vendor/bin/pint` (Laravel preset) for PHP; `npm run check:fix` (vite-plus lint/format) for TS. `npm run types:check` must pass.
- Strict types in TS; no `any` (use `unknown` + narrowing). PHP: typed properties, return types, readonly where sensible, enums for statuses.
- No dead code, no console.log, no placeholder buttons: every button either works or is not rendered (or rendered disabled with a tooltip explaining why, e.g. integration not configured).
- Commit messages: `<module>: <what>` in English.

## 13. Cross-module integration rules (parallel development)

- Never edit files you do not own: `app/Models/User.php`, `bootstrap/app.php`, `config/ev.php`, `database/seeders/DatabaseSeeder.php`, `tests/TestCase.php`, `resources/js/app.tsx`, `resources/js/types/global.d.ts`, `resources/css/app.css`, `lang/*/core.php`, `docs/CONVENTIONS.md`. If you need something there, add it in your module instead:
  - Relations on User: `User::resolveRelationUsing('vehicles', fn (User $u) => $u->hasMany(MemberVehicle::class, 'user_id'))` in your module ServiceProvider `boot()`.
  - Policies: `Gate::policy(Model::class, Policy::class)` in your module ServiceProvider.
  - Scheduled tasks: in your module ServiceProvider `boot()`: `$this->callAfterResolving(\Illuminate\Console\Scheduling\Schedule::class, fn (Schedule $s) => $s->command('warranty:send-reminders')->dailyAt('08:00'));`
  - Event listeners: `Event::listen(...)` in your module ServiceProvider.
  - Dashboard KPIs: `DashboardKpis::register(...)` in your module ServiceProvider (see `App\Modules\System\Services\DashboardKpis`).
  - Navigation entries already exist in `resources/js/navigation/{admin,member,partner}.ts` for every module; only edit those files to add child entries of your own module.
  - Translations: only your own `lang/{ar,en}/<module>.php` files. Use `core.*` keys for generic labels/actions/states.
- Shared UI components live in `resources/js/components/shared` and `resources/js/components/ui`; only the UI-kit owner edits them. If a component you need is missing, build it inside `resources/js/features/<module>/`.
- After adding routes run `php artisan wayfinder:generate --with-form` so `npm run types:check` sees them. Typecheck errors in files you don't own are not yours to fix.
- Tests: run only your own suites with your own database: `DB_DATABASE=ev_test_<n> php artisan test tests/Feature/<Module> tests/Unit/<Module>`. If `migrate` fails inside a migration file you do not own, wait a minute and retry (another agent may be mid-write); never edit that file.
- Migration files must be written atomically (one Write call, syntactically valid) so parallel test runs never see a half-written file.
- When your module needs another module's model that does not exist yet, code against the contract in `docs/DOMAIN_CONTRACTS.md` (table + column names + model class names) and keep the coupling behind an interface or a service method so it can be finished in the integration pass.
