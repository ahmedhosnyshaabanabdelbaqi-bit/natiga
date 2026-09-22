# Wave 2 — shared instructions for every module engineer

You are a senior Laravel 13 + React 19/TypeScript engineer on "EV Community Egypt" (`/home/user/natiga/ev-community`; PostgreSQL 16, Redis, Inertia 3, Tailwind 4, shadcn-style UI, Arabic RTL default + English). Other engineers work in parallel in the same working tree. **Own only the paths listed in your brief.** Never edit: `app/Models/User.php`, `bootstrap/app.php`, `config/ev.php` (you may only ADD a settings/permissions file in your module), `resources/js/app.tsx`, `resources/css/app.css`, `resources/js/types/global.d.ts`, `resources/js/layouts/**`, `resources/js/components/**`, `lang/*/core.php`, `docs/CONVENTIONS.md`, `docs/DOMAIN_CONTRACTS.md`, `tests/TestCase.php`, other modules' files. You may add entries for your own module to `resources/js/navigation/{admin,member,partner}.ts` (children only, keep existing entries) and register hooks from your own ServiceProvider.

Read first (completely): `docs/CONVENTIONS.md`, `docs/DOMAIN_CONTRACTS.md`, `docs/BUSINESS_RULES.md`, `docs/modules/*.md` (wave-1 module notes), `resources/js/components/shared/README.md`, your brief, and the wave-1 code you depend on (skim the public methods).

## Platform APIs you must reuse (do not re-implement)
| Need | API |
|---|---|
| Settings / module flags | `App\Modules\System\Services\Settings::get/set/bool/int`, declare defaults in `app/Modules/<M>/Settings.php`; `Modules::enabled('<key>')`; route middleware `module:<key>` |
| Permissions | `app/Modules/<M>/Permissions.php` (+ `php artisan ev:sync-permissions`), middleware `permission:<key>`, policies via `Gate::policy` in your ServiceProvider |
| Audit | `App\Modules\Audit\Services\AuditService::log(action, entity, old, new, reason, actor)` — every sensitive state change |
| Security events | `App\Modules\Audit\Services\SecurityEvents::record(user, type, meta)` |
| Money | `App\Support\Money\Money` (of/add/sub/mul/percent/allocate/convert/format) — never floats |
| Business numbers | `App\Support\Sequence\NumberSequence::next('order' \| 'payment' \| 'receipt' \| ...)` |
| Idempotency | `App\Support\Idempotency\Idempotency::run(scope, key, fn)` + `lockForUpdate()` inside `DB::transaction()` |
| Domain errors | `App\Support\Exceptions\DomainException::because('module.errors.key', params, field)` |
| Public ids / translations | `App\Support\Concerns\HasPublicId`, `HasTranslations` (`<table>_translations`) |
| Files | `App\Modules\Files\Services\AttachmentService::store(UploadedFile, ?Model $owner, string $collection, 'private'\|'public', 'image'\|'document'\|'spreadsheet')`; owners implement `App\Modules\Files\Contracts\HasAttachments` (`attachmentViewableBy(User, Attachment): bool`) + `HasAttachmentsTrait`; validation rule `App\Modules\Files\Rules\SafeUpload('image')`; download URL `route('shared.files.download', $attachment)` |
| PDF | `App\Support\Pdf\PdfService::render(view, data, locale)` / `store(...)` → Attachment; layout `resources/views/pdf/layout.blade.php` |
| QR / barcode | `App\Support\Qr\QrService::token(purpose, payload, ttlSeconds, singleUse)`, `verify(token, purpose)`, `svg(content)`; `App\Support\Barcode\BarcodeService::code128Svg(code)` |
| Membership QR | `App\Modules\Members\Services\MembershipQr::verify(token)` → membership (log with purpose) |
| Vehicles / garage | `App\Modules\Vehicles\Models\MemberVehicle` (`scopeForUser`, `displayName()`, `connectorTypeIds()`, `compatibleStationConnectorTypeIds()`), `App\Modules\Garage\Services\GarageSections::register(key, labelKey, resolver(MemberVehicle, User): array, module, order)` + a React section component in `resources/js/features/garage/sections/<key>.tsx` (you own that one file), `VehicleDeletionGuards::register(fn(MemberVehicle): ?string)`, shared prop `selectedVehicle` + `useSelectedVehicle()` + `VehicleSelector` component (`resources/js/features/vehicles`) |
| Notifications | `App\Modules\Notifications\Services\Notify::send(User $user, string $key, array $data = [], string $category = 'system', bool $transactional = true, ?string $dedupKey = null, ?string $url = null)`; text keys `<module>.notifications.<key>.title/body` passed via `$data['_title_key']`/`['_body_key']`; `AnnouncementAudiences::register(key, labelKey, fn(array $params): Builder)`; `TemplateRegistry` for admin-editable email templates |
| Integrations | `App\Modules\Integrations\Services\Integrations::map()/email()/sms()/whatsapp()/shipping()/charging()/payment()/exchangeRate()`, `isConfigured(key)`, `ExchangeRates::rate(base, quote, date)` / `convertToBase(amount, currency, date)` (returns amount, rate, source, rate_date, original_*), `WebhookHandlers::register('<provider>', fn(WebhookEvent) => ...)` |
| Imports / exports | `App\Modules\Imports\Contracts\Importer` / `Exporter` + `Importers::register(new XImporter)` / `Exporters::register(new XExporter)`; admin "Export" buttons post to `POST /admin/exports` with `{type, filters, format}` |
| Dashboards | `App\Modules\System\Services\DashboardKpis::register(key, permission, resolver, labelKey, href, source, format, tone, order, space)` |
| Operations | `App\Modules\Reports\Operations\Services\OperationsExceptions::raise(category, severity, title, details, dedupKey, source)`, `HealthChecks::register(key, fn): array issues` |
| UI | `@/components/shared`: PageHeader, DataTable, FiltersBar/useQueryState, Pagination, ConfirmDialog/useConfirm, FormField/FormActions, SectionCard/DescriptionList, Timeline, Skeleton*, FileUpload, QrScanner, MapView/AddressMapPicker, CommandPalette, StatusBadge, Money, DateTime, Code, StatCard/KpiGrid, EmptyState/ErrorState, InlineAlert, ProgressBar, StepIndicator, Rating, CopyButton, PhoneNumber; `@/lib/i18n` (`t`, `useLocale`, `localized`), `@/lib/format`, `@/lib/auth` (`can`) |

## Working rules
- Migrations: day prefix from `CONVENTIONS.md §5`, atomic files, real FKs (`restrictOnDelete` for financial/history rows), CHECK constraints, indexes, `timestampsTz`, money `decimal(14,2)` + `currency`.
- Everything bilingual through `lang/{ar,en}/<module>.php` (identical key sets; enums implement `HasLabel`).
- Server-side authorization on every route (permission middleware + policy), ownership scopes, ULID public ids in URLs.
- Core transactions in Actions; side effects (Notify, PDFs, emails) after commit via queued jobs; idempotent and retry-safe.
- Register: KPIs, garage sections, announcement audiences, importers/exporters, health checks, webhook handlers as relevant, all from your ServiceProvider.
- Tests on your private database `DB_DATABASE=ev_test_<n> php artisan test tests/Feature/<Module> tests/Unit/<Module>` (feature + authorization/IDOR + concurrency/idempotency + unit math). After route changes `php artisan wayfinder:generate --with-form`; `npx tsc --noEmit` (fix only your files); `vendor/bin/pint <your paths>`. Don't run `npm run build`.
- If a migration you don't own is broken, wait 60 s and retry; never edit it. If a wave-1 API differs slightly from this table, adapt to the real code (read it) — never fork it.
- Finish with `docs/modules/<module>.md` (flows, rules, permissions, endpoints, registries used) and a concise final report: files, routes (path → name), permissions, registrations, tests, caveats for the integration pass.
