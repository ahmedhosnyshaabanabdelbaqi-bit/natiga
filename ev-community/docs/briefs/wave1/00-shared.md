# Wave 1 — completion pass (shared instructions)

Wave 1 was started by engineers who were interrupted several times. **A substantial part of each module already exists in the working tree** (committed as work-in-progress). Your job is to *audit what exists against your brief, finish everything missing, fix what is broken, and prove it with tests* — not to start over. Keep existing public APIs (class names, method signatures, table names, route names) unless they are wrong; if you must change one, grep for callers and update them.

Read first: `docs/CONVENTIONS.md`, `docs/DOMAIN_CONTRACTS.md`, `docs/BUSINESS_RULES.md`, your brief, and `docs/modules/*.md` if present.

Environment facts:
- PostgreSQL 16 + Redis run locally. Each engineer has a private test DB named in the brief: `DB_DATABASE=ev_test_<n> php artisan test <paths>`; manual checks `DB_DATABASE=ev_test_<n> php artisan migrate:fresh --seed`.
- `tests/TestCase.php` provides `actingAsMember()`, `makeMember()`, `actingAsStaff([...perms])`, `makeStaff()`, `actingAsRole('accountant')`, `syncRbac()`; it calls `withoutVite()` so feature tests don't need a Vite build. Inertia assertions: `->assertInertia(fn ($page) => $page->component('admin/x/index')->has('items'))` — the page file must exist at `resources/js/pages/<component>.tsx` (Inertia checks it).
- Money helper `App\Support\Money\Money` is backed by brick/money 0.15 / brick/math 0.19: rounding enum is `Brick\Math\RoundingMode::HalfUp` (NOT `HALF_UP`), `BigDecimal::strippedOfTrailingZeros()`, allocation enums `Brick\Money\AllocationMode`, `SplitMode`. Prefer the `Money` helper over raw brick calls.
- Laravel `Mailable` already declares `$mailer`, `$locale`, `$subject`, `$to`… — never redeclare those as constructor-promoted properties.
- PHP 8.4: nested ternaries need parentheses.
- After adding routes: `php artisan wayfinder:generate --with-form`. Typecheck: `npx tsc --noEmit` (fix errors in YOUR files; other engineers are editing in parallel). Format: `vendor/bin/pint <your paths>` and `npx vp check --fix <your paths>` for TS. Never run `npm run build`.
- If a migration you don't own is broken, wait 60 s and retry; never edit it.
- Shared UI: `@/components/shared` (page-header, data-table, filters-bar + use-query-state, pagination, confirm-dialog, form-field, section-card, timeline, skeletons, status-badge, money, date-time, stat-card, kpi-grid, empty-state, error-state, inline-alert, progress-bar, step-indicator, rating, copy-button, phone-number, language-switcher, status-banners) and `@/components/ui/*` (shadcn primitives incl. tabs, table, textarea, switch, popover, command, drawer, alert-dialog…). Read `resources/js/components/shared/README.md` if it exists; otherwise read the component source for props. If something you need (FileUpload, QrScanner, MapView, CommandPalette) is missing, build a minimal version under `resources/js/features/<your-module>/` marked `// integration: replace with @/components/shared/<name>`.
- Every visible string goes through `t()` / `__()` with keys in `lang/{ar,en}/<file>.php` (identical key sets — verify with a quick PHP script that flattens and diffs both files).

Definition of done for your module:
1. Every deliverable in the brief exists and works (backend + Inertia pages + translations + permissions + registrations).
2. Tests in `tests/Feature/<Module>/` and `tests/Unit/<Module>/` cover the brief's test list (feature, authorization/IDOR, concurrency/idempotency where relevant) and pass on your private DB.
3. `npx tsc --noEmit` shows no errors in your files; pint clean on your paths.
4. `docs/modules/<module>.md` describes flows, permissions, routes and the registries other modules use.
5. Final report (your last message): files created/changed, routes (path → name), permissions, registrations, test results (counts), anything left undone with the reason.
