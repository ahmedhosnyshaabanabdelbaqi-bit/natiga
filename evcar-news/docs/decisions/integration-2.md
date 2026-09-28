# Integration pass 2 — "finish the mobile app first" (2026-09-28)

Area: everything under `evcar-news/` except `admin/` (admin content screens are
deferred by the product owner). Inputs: the feature records
`backend-{articles,vehicles,stations,tours,comparisons,discovery,personal,community}.md`
and `mobile-{news,cars,charging,tours,compare,home-search,personal,community}.md`.
No dependency was added or changed.

## 1. Schema change requests applied

| Request | Change |
|---|---|
| Per-language article slugs (`backend-articles.md` §12) | Migration `20260929000000_article_translation_slugs`: `article_translations.slug varchar(200)` nullable, unique index `article_translations_slug_key`, CHECK (lower-case, no spaces/URL delimiters, single inner hyphens; the service enforces the exact letters/digits rule). Service: `ArticlesAdminService.syncTranslationSlugs()` runs inside the create/update transaction — slug from each translation's title (Arabic titles give Arabic slugs), unique across other articles' slugs and all translation slugs, **locked after first publication** (a translation added later still gets one). Public lookup `/articles/:slug` (and the view counter) resolves id → article slug → translation slug. Summaries/details add `slugs: {ar?, en?}` (servable languages only); `shareUrl` uses the served language's slug. e2e: `articles-public` "per-language slugs…". The share module (`/n/:slug` web page) is still not built. |
| Encyclopedia review checklist columns (`backend-discovery.md` §9, optional) | Not applied: marked optional/non-blocking; the audit log already stores the checklist. |

Every other record lists "None". `prisma:check-drift` → in sync.

## 2. Cross-module wiring and fixes

| # | Where | Problem (how found) | Fix |
|---|---|---|---|
| 1 | `settings.types.ts` `IMPLEMENTED_FEATURES` | Empty → `/app-config` announced nothing, the app hid every feature (all mobile/backend records) | Lists the 15 shipped modules (not `assistant`, `ads`, `exteriorSpin`). Flags stay **seeded off**; an owner switches them on (admin settings or `PATCH /admin/settings/features`). Tests updated to use an unbuilt flag for the "hidden" case. |
| 2 | backend CORS | **Found in the live run:** the app sends `X-App-Version` on every request; the preflight refused it, so the web build showed "no connection" (earlier agents hid it behind a same-origin proxy) | Added to `CORS_ALLOWED_HEADERS`; new `test/cors.e2e-spec.ts` checks every header the app sends. Native apps are not affected by CORS. |
| 3 | backend local `/media` | 360° multires tiles need CORS for WebGL (`mobile-tours.md` §9) | Public media sends `Access-Control-Allow-Origin: *` and no credentials header (e2e assertion + live check). S3/CDN buckets need the same rule. |
| 4 | vehicles + stations images | Media-library images keep a private original, so car/station photos were never shown (`backend-tours.md` notes) | `MediaUrlService.image()` / `StationMediaService.image()` fall back to the largest public `rendition` (`largestRendition()`, unit test). |
| 5 | vehicles car pages | Tour list used a weaker filter than the tours API → could list a tour whose detail is 404 | `publicTourWhere()` moved to `tours/domain/public-tour-where.ts` (no Nest classes, so no circular module import) and used by `RelatedContentService.tourRows()/variantsWithTours()`. |
| 6 | mobile router | Cold-start deep links were replaced by Home because flags read "off" before `/app-config` loaded (`mobile-home-search.md`, `mobile-cars.md`) | The feature-flag redirect is skipped until the config controller has a value (network, cache or fallback); a listener re-runs the redirect when it resolves. Verified live: a fresh browser opened `/#/news/<arabic slug>` directly. |
| 7 | mobile news/cars | Community `CommentsSection` was only on a separate page | Article reader shows the latest 3 comments inline (+ "view all" → comments page); car page "Owners" tab shows model comments under owner reviews. Both render nothing while `community` is off. |
| 8 | mobile reachability | Q&A (`/questions`) had no entry point; `MutedUsersScreen` had no route | Account → Explore → "أسئلة وأجوبة / Questions & answers"; `/account/blocked-users` (sign-in required, `community` flag) linked from Account → Settings & privacy. Route test added. |
| 9 | mobile l10n | Live screenshot: SUV body type was "دفع رباعي (SUV)" (= four-wheel drive) next to "دفع أمامي" (front-wheel drive) | `carsBodySuv` → "SUV رياضية متعددة الاستخدامات" (same as the compare feature's label). |
| 10 | docs | Mobile README still called the app a foundation with placeholders | Updated; `docs/MOBILE_BUILD.md` written. |

Checked and already correct: Home uses `ComparisonsService.featured()`; no
`UnderConstructionView` is used by any route; no screen class is unreachable
except as listed above.

## 3. Live end-to-end run (REQUIREMENTS §22, app side)

Environment (not committed; scripts in the session scratchpad `integ2/`):
database **`evcar_e2e_app`** (migrate deploy + `db:seed` + `db:seed:demo`),
backend `node dist/main.js` on :3100 with `JOBS_ENABLED=true`, own storage root
and Redis prefix, `CORS_ORIGINS=http://localhost:8088`; Flutter web build
(`--no-web-resources-cdn`, `API_BASE_URL=http://localhost:3100/api/v1`) served on
:8088; Playwright + Chromium (`/opt/pw-browsers`) driving the app **only through
the accessibility tree** (Flutter semantics), 412×900 @2×.

Content — all through the **admin API** (`seed-via-admin-api.cjs`), no DB writes:

1. `npm run create-owner` → `POST /auth/reset-password` with the one-time token.
2. Four staff accounts registered + verified (token from the console mail log), roles
   assigned by the owner with `PUT /admin/users/:id/roles`: editor,
   content_reviewer, vehicle_data_manager, station_manager.
3. Features switched on with `PATCH /admin/settings/features`.
4. Catalog (vehicle data manager): source "E2E TEST fixture sheet (fictional…)",
   brand "E2E Test Motors / موتورز الاختبار", model "Volt X (TEST)", generation,
   year 2026, trims **Long Range (BEV)** and **Long Range PHEV**, both listed in EG;
   specs with source/reliability (PHEV deliberately without 0–100 and AC power);
   ranges BEV WLTP 480 km + EPA 290 mi, PHEV CLTC 120 km electric + WLTP 950 km
   total; DC charging times 10→80 % vs 30→80 %; official EGP price for the BEV only;
   search index rebuild.
5. Article ar+en "[اختبار] / [TEST] …" linked to the model: editor draft → submit;
   the editor's attempt to feature it was refused (`403 ARTICLE_FEATURE_NEEDS_PUBLISH`);
   reviewer published and featured it.
6. Station (station manager) "E2E Test Station (DEMO)" with one point, CCS2 DC
   120 kW + Type 2 AC 22 kW, published; no availability provider.
7. Tour (vehicle data manager + reviewer): licence → chunked upload of a
   synthetic 4096×2048 grid "DEMO 360° — TEST ONLY — NOT A CAR INTERIOR" → the
   **real BullMQ worker** made preview, 2048/4096 renditions and multires tiles →
   visual check → tour with a driver scene + info hotspot → submit → publish.

App flow (screenshots `docs/screenshots/app/`, ar = Arabic light, en = English dark):

| Step | Result |
|---|---|
| Cold start straight to `/#/news/<Arabic slug>` | article opens (router fix + per-language slug) |
| Home → top story → article | article with linked car card and inline comments (`ar-01…03`, `en-01/02`) |
| Car page → spec sheet | BEV/PHEV chips, market chips "(غير مطروحة)", sources + reliability badges, cycles next to every range, «غير متوفر / Not available» for missing values, PHEV "Price not available" (`ar-04…07`, `en-04/06/07`) |
| Add both trims to compare → Compare tab | electric range "Different test cycles — no winner" (WLTP vs CLTC), price "Missing data — no winner" (never 0), DC time not comparable (10–80 vs 30–80), BEV total range not applicable, summary is not a verdict (`ar-08/09/09b`, `en-08/09`) |
| Save as guest | asks to sign in or create a share link; share link created (`ar-10/11`) |
| Register in the app | password containing the e-mail name refused with the server's localized message; valid password → "account created"; e-mail link `/verify-email?token=` opened in the app → verified; sign in (`ar-12…15`) |
| Save to account → full reload → sign in → Saved comparisons | saved comparison listed (`ar-16`, `ar-17-saved-comparisons-after-reload`, `en-17`) |
| Charging tab | default city (Cairo) without asking for location; demo station 1.3 km, "Availability unknown", explanation that no live source exists; map view with the station pin (tiles cannot load without internet) (`ar-19/20`, `en-19`) |
| Station detail | Operation unknown · Open now (24 h, Africa/Cairo) · Availability unknown, per-connector unknown (`ar-21/22`, `en-21`) |
| Calculators → charging time, 60 kWh, 20→80 %, AC 11 kW | **36 kWh added**, 40 kWh from the grid, 3 h 38 min, limited by the car; entering 11 as efficiency shows "Must be between 0 and 1" (`ar-23…25`, `en-23/25`) |
| Garage (signed in) → add first car | picker brand → model → year → trim (BEV), saved as primary car; missing odometer shown as «غير متوفر» (`ar-26…30`, `en-30`) |
| Settings → English + Dark | whole app switches to LTR English dark (`en-31`) |
| 360° tour page on web | honest "not available in the web preview" notice with a still preview (`ar-32`, `en-32`). The viewer is covered by 52 widget/unit tests; the live tour JSON (scenes, preview, renditions ≤ maxWidth, multires) is checked by the new `test/live/live_tours_test.dart` against the running backend |

Page errors during the run: none (after fix #2). The only failed requests were
Google-hosted fallback fonts (no internet in the sandbox).

Web-preview limits seen (by design, documented in `MOBILE_BUILD.md`): sign-in is
not kept across reloads (memory-only tokens on web), the 360° WebView and GPS are
unavailable, tour preview images on `http://localhost` are not loaded by the image
kit (https only).

## 4. Verification (all 2026-09-28)

| Command | Result |
|---|---|
| backend `npm ci` | ok |
| `npm run prisma:check-drift` | Schema and migrations are in sync (7 migrations) |
| `npm run typecheck` / `lint` / `format:check` | clean |
| `npm test` | 65 suites / 755 tests passed |
| `npm run test:e2e` (all, own DB per run) | 46 suites / 611 tests passed |
| `npm run build` | ok |
| `npm run openapi:export` | `backend/openapi.json` rewritten, 346 paths |
| mobile `dart run tool/merge_arb.dart --check` + `flutter gen-l10n` | 44 parts, 2 locales OK |
| `flutter analyze` | No issues found |
| `flutter test` | 622 passed, 9 skipped (live tests) |
| `EVCAR_LIVE_API=http://localhost:3100/api/v1 flutter test test/live` | backend + news: 6 passed, 1 skipped; `test/live/live_tours_test.dart`: 2 passed |
| `flutter build web --release --no-web-resources-cdn` | built |
| Playwright live run | see §3 |

## 5. Not done / not verified

- **No APK/AAB/IPA** built here (no Android SDK / Xcode). The APK comes from
  `.github/workflows/evcar-android.yml` (debug-signed test pre-release); release
  signing in CI is documented in `MOBILE_BUILD.md` but not wired (the workflow
  file is outside this pass's area).
- Admin content screens (deferred). `admin/` was not touched; its generated API
  types were not regenerated from the new `openapi.json`.
- Share module (web fallback pages, `assetlinks.json`, AASA), ads, assistant: not built.
- Not exercised live: RSS import from a real feed, OCM import, live availability,
  routing (trip planner stays hidden), push, S3 storage, e-mail delivery.
- Text scaling 200 % and landscape were not part of the live run (widget tests only);
  no device / screen-reader test.
- The app does not list "my station reports / suggestions" or edit interests
  (APIs exist).
- `data.export` is still granted only to owner/admin (vehicles note); not changed.
- Leftover database `evcar_mhome` (from the mobile-home agent) was left in place;
  `evcar_e2e_app` is kept for inspection (drop with `DROP DATABASE evcar_e2e_app`).
