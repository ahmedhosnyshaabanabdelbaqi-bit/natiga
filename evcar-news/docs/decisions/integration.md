# Integration pass (Phase 1) — decisions and findings

Area: everything under `evcar-news/` after the backend-core, backend-auth,
backend-platform, admin and mobile foundation agents finished.
Date: 2026-09-25. No dependency versions were changed.

## 1. Schema change requests

None were pending (`backend-auth.md` §7: "None required"; the other records
list none). No migration was added; `npm run prisma:check-drift` → in sync.

## 2. Bugs found by running the real system, and fixes

| # | Where | Problem (how it was found) | Fix |
|---|---|---|---|
| 1 | backend `src/common/pipes/validation.pipe.ts` | `GET /admin/users?lang=en` / `/admin/audit-logs?market=EG` → **422** (`property lang should not exist`), although contract §4.3 makes `?lang`/`?market` valid on every route (curl smoke test). Only the platform DTOs had a workaround. | `AppValidationPipe` removes `lang`/`market` from whole-object `@Query()` payloads **only when the DTO does not declare them** (DTOs that declare them, e.g. `LocaleQueryDto`, still validate them). Every other unknown query param is still rejected. Unit tests in `validation.pipe.spec.ts`. |
| 2 | backend `all-exceptions.filter.ts` | Admin overrides of `errors.<CODE>` did not apply to errors thrown without an explicit message (e.g. `NOT_FOUND`) — platform request §10.1. | Filter resolves `resolveErrorMessage(code, lang)` (overrides → catalogs) before the built-in defaults. e2e test proves it (fails without the change). |
| 3 | backend translations list | The admin table offered sorting, the API had no `sort` param → 422 on click. | `sort` = `namespace|key|locale|updatedAt` (± prefix), stable tie-breakers; e2e test. |
| 4 | backend e2e teardown | `storage/test/<runId>/` directories were never removed (platform request §10.3); 36 leftovers found. | Teardown deletes the run's storage root; leftovers removed. |
| 5 | backend create-owner | Link pointed to `/reset-password` (admin has a dedicated `/setup-password`); a suspended account stayed suspended; no audit trail of the CLI action (auth follow-ups). | Link → `ADMIN_BASE_URL/setup-password?token=…`, suspended account re-activated, `auth.owner_setup_issued` audit row (`cli:create-owner`, no token stored). e2e test. |
| 6 | backend settings default `app_links.paths` | Account e-mails link to `SHARE_BASE_URL/verify-email` and `/reset-password`, but App/Universal Links only covered `/n/`, `/cars/`, `/compare/`. | Defaults include `/verify-email` and `/reset-password`; Android manifest intent filter gained the same two paths. |
| 7 | admin settings | Admin sent `PUT /admin/settings/:key {value}` and a separate `theme.colors` key; the API has one route per key with the raw value as body and colours inside `branding`. Every settings save would have failed. | `settingsApi.save()` maps key → route/method/body; branding saves name + logo + colours in one PUT; new: logo upload/remove, restore-default, server warnings, App links tab. |
| 8 | admin translations | Admin used a non-existent `PUT /admin/translations` upsert. | `POST` create; on 409 the existing row is looked up and `PATCH`ed; edits use `PATCH /:id`. |
| 9 | admin system/dashboard | Integrations response is `{items, capabilities, note}`; the admin's normaliser would have produced a bogus "capabilities" row and keyed providers by `type` (duplicates). Overview has no `version/uptime/services` and nested per-status counts → the dashboard showed almost nothing. Jobs use `counts{}`/`isPaused`. | System API rewritten on the generated DTO types; dashboard reads the real `SystemOverviewDto` (totals with status breakdown, data freshness, warnings, demo rows, imports) + public `/health` (version, uptime, DB/Redis/storage). Malformed responses raise an error state instead of crashing the page. Live "Run check" button for checkable providers. |
| 10 | admin permissions | Used `markets.read` / `translations.read` (do not exist) and gated suspend with `users.manage` (API requires `users.block`); markets/translations write buttons accepted `settings.write` (API requires `markets.write` / `translations.write`). | `permissions.ts` lists only real strings; gates mirror the API checks. Owner/admin role changes are locked in the UI for actors who lack owner / `users.manage_admins`. |
| 11 | admin markets | The currency picker listed every ISO currency from the browser, but the API only accepts currencies registered in `/admin/currencies`, and the admin had no way to register one → adding a market with a new currency was impossible. | Currency CRUD section on the Markets page; the market form lists registered currencies; default market badge and protected toggle. |
| 12 | admin sorting | Users table allowed sorting by `status`, audit table by `action`/`entityType` — not supported by the API (422). | Those headers are no longer sortable. |
| 13 | admin role editing | "Roles tab is read-only" although the API supports `PUT /admin/roles/:key/permissions` (owner). | Owner-only permission editor (grouped checkboxes from `GET /admin/permissions`). A bug in the first version (reading `e.currentTarget` inside a deferred state updater) was caught by its test and fixed. |
| 14 | admin UI (screenshots) | Server role descriptions are English only (misplaced punctuation in RTL); latency "31 ms" rendered as "ms 31" in RTL badges. | Localized descriptions for the 8 built-in roles (fallback: server text with `dir="auto"`); LRI/PDI isolation around number + unit. |
| 15 | mobile login | `403 EMAIL_NOT_VERIFIED` (after a correct password) only showed the message — no way forward. | "Verify my email" action → verification screen pre-filled with the address (widget test). |
| 16 | `docker-compose.yml` admin service | Set `API_PROXY_TARGET`, but `admin/vite.config.ts` reads `EVCAR_API_PROXY_TARGET` → inside compose the admin would proxy `/api` to its own container (found by reading both files; compose itself cannot run here). | Variable renamed; YAML re-parsed. |

Admin feature types (`users`, `markets`, `translations`, `settings`, `system`)
now use `components['schemas'][...]` from the generated `schema.d.ts`; the
type change immediately exposed test fixtures that did not match real
responses, which were rewritten from captured live responses.

## 3. Local dev environment changes (not committed)

- `backend/.env` (gitignored) got random `JWT_ACCESS_SECRET` / `IP_HASH_SALT`
  so dev tokens survive a server restart (empty values → ephemeral secrets).
- `evcar_dev`: migrated, reference-seeded; contains the integration owner
  `owner@evcar.local` (password set through the real setup link during the
  smoke test; not written anywhere in the repo) and audit rows of the smoke
  test. A test reader account was created and then deleted through
  `DELETE /me` (verifying anonymisation). No demo data was seeded.
- Dropped the leftover database `evcar_scratch_ptest` (unreferenced prototype
  with one `stations` table).

## 4. Verification (all on 2026-09-25)

- backend: `npm ci`, `build`, `typecheck`, `lint`, `format:check`, `test`
  (34 suites / 361 tests), `test:e2e` (13 suites / 133 tests, 0 leftover DBs
  or storage dirs), `openapi:export` without DB (63 paths),
  `prisma:check-drift` (in sync), `npm audit` (0 vulnerabilities).
- live curl smoke test of every Phase-1 endpoint against `evcar_dev`
  (auth incl. web cookie mode + reuse detection, `/me`, sessions, password
  change, account deletion, admin users/roles/permissions/audit/settings/
  app-config ETag+304/markets/currencies/translations/system).
- admin: `npm ci`, `api:types`, `typecheck`, `lint`, `format:check`, `test`
  (18 files / 145 tests), `build`; Playwright/Chromium against Vite + real
  backend in ar (RTL) and en (LTR): 31/31 checks, screenshots in
  `docs/screenshots/phase1/`.
- mobile: `flutter analyze` (no issues), `flutter test` (129 passed, 4 live
  tests skipped by default), `dart run tool/merge_arb.dart --check`, and the
  live contract suite `EVCAR_LIVE_API=… flutter test test/live` (4/4).

## 5. Still open (not done here)

- CI workflow `.github/workflows/evcar-ci.yml`: created in review 2 (see
  `review-fixes-2.md` §7); not executed here (no runner).
- No Docker image built / compose run (no Docker daemon); no APK/AAB/IPA (no
  Android SDK / Xcode).
- Share module (web fallback pages, assetlinks.json, AASA) is a skeleton: the
  e-mail links `https://evcar.news/verify-email|reset-password` only open the
  app once App/Universal Links are verified; without the app the user must
  paste the code from the e-mail into the app.
- All feature modules beyond Phase 1 (news, catalog, comparisons, tours,
  stations, …) are not started — see `docs/REQUIREMENTS_TRACKER.md`.
