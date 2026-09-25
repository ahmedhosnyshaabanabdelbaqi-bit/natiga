# Requirements tracker — EV Car News

Source: `docs/REQUIREMENTS_AR.md` (sections 1–23). Contract: `docs/ARCHITECTURE.md`.
Last update: 2026-09-25 (Phase 1 integration + review-2 fixes, see `docs/decisions/integration.md`
and `docs/decisions/review-fixes-2.md`).

**Status values** (ARCHITECTURE §8):
`done & tested` · `done, untested (why)` · `partial (what is missing)` ·
`not started` · `blocked (input needed)`.
"Schema only" means tables/constraints exist in the migration but no service,
endpoint or screen uses them yet.

## Phase 1 at a glance

| Area | State | Evidence |
|---|---|---|
| Backend foundation, auth, users, RBAC, audit, settings, markets/currencies, i18n, health, system, provider adapters | done & tested | 404 unit + 196 e2e tests (also in random order), live smoke of the review-2 scenarios against the built server (2026-09-25) |
| Backend feature modules (articles, vehicles, comparisons, media, tours, stations, search, share, community, …) | not started | 24 of 34 modules are registered empty skeletons |
| Admin: auth, dashboard, users & roles, audit log, settings, markets & currencies, translations, system | done & tested | 148 tests + Playwright run against the real backend in ar/en (31/31, Phase 1), `docs/screenshots/phase1/` |
| Admin: 17 other sections | not started | honest "قيد التنفيذ / Not implemented yet" placeholders, no sample data |
| Mobile: shell, routing, networking/auth, offline cache, settings, app-config, account screens | done & tested | `flutter analyze` clean, 140 tests, live contract test against the backend (4/4) |
| Mobile: content screens (home, news, cars, compare, charging, tours, …) | not started | 20 placeholder screens, hidden (tabs, tiles, routes) while the server does not announce their feature |
| APK / AAB / IPA, Docker images | blocked | no Android SDK, Xcode or Docker daemon in this environment |

---

## 1. الهوية واللغات والنطاق — Identity, languages, scope

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 1.1 | Name "EV Car News"; name, logo and colours editable from admin | done & tested | `branding` setting (name, logo upload re-encoded by server, colours) → `/app-config` → admin theme + mobile theme; the logo is shown in the mobile Home app bar (`BrandTitle`, cached image, falls back to the name). Tests: `platform-settings` e2e, admin settings tests, Playwright save verified through `/app-config`, mobile `app_config_test` + `brand_title_test` |
| 1.2 | Link/share settings bound to evcar.news without assuming or changing the existing site | partial | `share` + `app_links` settings (admin tabs), Android App Links filter, iOS entitlements file. Missing: share module (web fallback pages, `/.well-known/*`) |
| 1.3 | Arabic RTL + English LTR in app and admin | done & tested (UI shell) | Admin: direction switch, Playwright ar/en. Mobile: gen-l10n, widget tests in both languages. Content translation not started (no content yet) |
| 1.4 | Localised messages / errors / notification texts | partial | Server error catalogs ar/en + admin overrides (e2e); per-field validation messages translated (no raw regex/English, `api-hygiene` e2e); notification templates exist in catalogs. Missing: notification delivery |
| 1.5 | Localised dates, currencies, units | partial | Admin `lib/format`, `MoneyInput`, `UnitInput`; mobile `AppFormatters` (unit tests). Not yet applied to real content |
| 1.6 | Language independent of market | done & tested | Request context (`?lang`/`Accept-Language` vs `?market`/`X-Market`, works on every route since the integration fix); the fallback language follows the admin setting (same as `/app-config`); Arabic and English cannot be removed; separate mobile settings |
| 1.7 | Egypt as default market, SA/AE supported, more addable from admin | done & tested | Seed EG/SA/AE; admin market + currency CRUD (default market protected); e2e + admin tests + live curl (created/deleted KW + KWD) |
| 1.8 | Proposed countries are not a guarantee of station data | done & tested | Coverage disclaimer on the Markets page (admin test); no station data is claimed anywhere |
| 1.9 | Guests browse everything; account only for sync/personal features | partial | Mobile guest browsing + `AuthGate` only on personal features (tests). Public content endpoints do not exist yet |

## 2. الهيكل التقني — Technical structure

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 2.1 | Flutter + Riverpod + go_router | done & tested | `mobile/` (Riverpod 3, go_router 17.5 — reason in `decisions/mobile.md`) |
| 2.2 | React + TypeScript admin | done & tested | `admin/` (React 19, Vite 8, Mantine 9) |
| 2.3 | NestJS + TypeScript, PostgreSQL + PostGIS | done & tested | `backend/` (Nest 12, Prisma 7.10, PostGIS geography + GIST) |
| 2.4 | S3-compatible storage for images/panoramas | partial | Local + S3 adapters (unit tests, offline presigning). Not exercised against real MinIO/S3 |
| 2.5 | Redis + background jobs (imports, image processing, notifications) | partial | BullMQ queues, `JobsService` (503 when Redis is down, e2e), admin job view. No feature processors yet |
| 2.6 | Local SQLite for saved content | partial | sqflite `json_cache` + `saved_items` (tests with real SQLite via ffi). Nothing to save yet |
| 2.7 | Modular monolith, no microservices | done | 34 modules in one app; 24 are still skeletons |
| 2.8 | Provider adapters (maps, routes, news, stations, notifications) | done & tested (offline) | `src/providers/*` with `status()`; unit tests with mocked transports/synthetic fixtures; API keys/tokens never follow redirects. Live providers not called (no keys) |
| 2.9 | Pinned versions, lockfiles, documented reasons | done | `package-lock.json` ×2, `pubspec.lock`, `docs/decisions/*.md` |
| 2.10 | REST API documented with OpenAPI | done & tested | `backend/openapi.json` (63 paths, exported without DB); admin types generated from it |
| 2.11 | Separate dev/test/prod configuration | done & tested | Per-environment env validation incl. production safety rules (unit tests); `.env.example` sync test |
| 2.12 | App not a WebView; isolated WebView only for the 360° viewer | partial | Native Flutter UI; isolated `assets/panorama/viewer.html` exists. Dart WebView side not implemented |

## 3. التصميم والتنقل — Design & navigation

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 3.1 | Native, clean, automotive-tech look; light background; electric blue/cyan; optional dark mode | done & tested (foundation) | Mobile theme + admin theme with dark mode; admin screenshots. Mobile not visually checked on a device |
| 3.2 | Clear Arabic font with a proper licence | done & tested | IBM Plex Sans Arabic (OFL) bundled in mobile (asset test) and admin (`@fontsource`) |
| 3.3 | Bottom bar: Home, Cars, Compare, Charging, Account | done & tested | `StatefulShellRoute`, `shell_navigation_test` |
| 3.4 | 360° tours prominent on home, catalog and car page | not started | Home section key `interior_tours` exists in settings only |
| 3.5 | Loading / empty / error / offline / permission-denied states for every screen | partial | `AsyncStateView` (mobile) and `StateViews` (admin), tested; applied to implemented screens only |
| 3.6 | Font scaling, screen reader, contrast, touch targets | partial | Text-scale multiplier, semantics, 48dp, WCAG contrast check for brand colours. No screen-reader audit on a device |
| 3.7 | Landscape for comparisons and panorama | not started | |
| 3.8 | Never colour alone for "best" or warnings | partial | Followed in implemented UI (badges carry text). Comparisons not built |

## 4. الرئيسية — Home

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.1 | Top story, latest news, reviews, new cars, featured comparisons, 360° tours, nearby stations (after permission), charging/maintenance guides | not started | Mobile home is a placeholder |
| 4.2 | Personalisation by language, country, interests without hiding other content | not started | |
| 4.3 | Unified search (news, cars, brands, stations) with suggestions, ar/en names, alternative spellings | partial | DB layer: `search_documents`, Arabic normalisation in SQL + TS (tested identical), 34 aliases (e.g. "بي واي دي" ↔ BYD). Missing: search/suggest endpoints and UI |
| 4.4 | Home section order/visibility controlled from admin | partial | Admin drag-and-drop → `home.sections` → `/app-config` (tested); mobile `visibleHomeSections()` (section → feature, tested). The app's home does not render sections yet |
| 4.5 | Keep scroll position when going back | partial | Each tab keeps its stack and scroll (test). Content lists do not exist yet |

## 5. الأخبار والمراجعات والمحتوى — News, reviews, content

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 5.1 | Full publishing system (news, reviews, test drives, battery/charging/software/safety/buying guides) with title, summary, body, image, category, tags, author, language, market, dates, linked cars | not started | Schema only (articles, translations, markets, categories, tags, vehicle links) |
| 5.2 | Draft → review → schedule → publish → archive, revision history | not started | Schema only (`content_status`, `article_revisions`) |
| 5.3 | Rich editor for tables, images, video | partial | Admin `RichTextEditor` (tables, https images with alt, YouTube-nocookie allowlist) + backend `sanitize-html` (tests). Not wired to articles |
| 5.4 | Comfortable reading, text size, save, share, related, offline reading of saved items | partial | Mobile HTML sanitiser + native renderer, saved-items store, text scaling. No article screens |
| 5.5 | Server-side RSS/authorised content import with dedupe, source tracking, media rights | partial | SSRF-safe RSS/Atom fetcher (tests); schema dedupe by guid/URL hash; default policy `headline_link_only`. Missing: import jobs, admin UI |
| 5.6 | No full copies without permission; machine summaries/translations stay drafts; no fabricated news | partial | Enforced by default feed policy (excerpts only). Workflow not built |
| 5.7 | Event date separate from publication date | partial | Schema only (`event_date`) |

## 6. دليل السيارات والمواصفات — Car catalog & specs

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 6.1 | Brand → model → generation → model year → trim → market → powertrain/battery specs | partial | Schema only (full hierarchy, `variant_markets`, specs per market scope e.g. warranty EG ≠ SA — `data-integrity` e2e) |
| 6.2 | Specs never attached to a model name alone; BEV never mixed with a same-named hybrid | partial | Schema: powertrain required per variant, unique (model year, powertrain, name) |
| 6.3 | BEV / PHEV / EREV / HEV classification | partial | Schema enum |
| 6.4 | Brands (BYD, Tesla, Zeekr, Xiaomi, BMW, VW, Hyundai, Kia…) manageable; no assumed availability per market | not started | Admin section placeholder; per-market availability in schema |
| 6.5 | Car page: images, trims, local price (date/source/type), gross/usable battery, range + cycle, consumption, motors, power, torque, drive, acceleration, dimensions, seats, storage, ports, AC/DC, charging times with SoC window, warranty, safety, comfort, software | not started | 47 spec definitions seeded (canonical units enforced); structured `consumption_measurements` (with cycle) and `variant_market_inlets` (ports per market) |
| 6.6 | Tabs: reviews, car news, owner ratings, 360° tours, competitors | not started | |
| 6.7 | Source, verification date, reliability per important spec | partial | Schema columns + CHECKs; admin `SourceReliabilityBadge` component |
| 6.8 | Missing value shown as «غير متوفر», never 0 | partial | Schema forbids empty spec rows; admin `NotAvailable`, `UnitInput`/`MoneyInput` return null; mobile formatters null→«غير متوفر» (tests). No catalog data flow yet |
| 6.9 | Converted price never shown as official local price | partial | `convertMoneyEstimate()` labels "تقديري بعد التحويل" (unit test). No price UI |

## 7. المقارنات — Comparisons

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 7.1 | Compare 2–4 cars; year, trim and market mandatory | not started | Schema (`comparisons`, items, share slug) |
| 7.2 | Short and detailed views, differences only, sticky names, save and share link | not started | |
| 7.3 | Price, range, battery, consumption, charging, performance, space, safety, warranty, equipment; electric vs total range; cycle shown next to the value; no cycle conversion or winner across cycles | not started | Schema stores cycle + range type for ranges AND consumption; a BEV cannot hold a "total" range or fuel consumption (trigger) |
| 7.4 | Units normalised with originals kept; peak ≠ average power; 10–80% ≠ 30–80%; "better" direction per metric | partial | Units/money libs (tests); spec `better_direction` (battery capacity = none, never "bigger wins"); charging-time CHECKs (from<to SoC, avg ≤ peak, charger condition required). No comparison engine |
| 7.5 | Recommendations by usage, budget, home charging with reasons, weights, missing data; no verdict when not comparable | not started | |
| 7.6 | Paid ads never change comparison results undisclosed | not started | Ads module is a skeleton |

## 8. الجولات الداخلية 360° — Interior 360° tours (core)

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 8.1 | Real panoramic viewer: drag, look up/down, zoom, fullscreen, landscape, reset view, optional gyroscope after permission | partial | Pannellum 2.5.7 vendored (mobile + admin); `viewer.html/js` bridge with CSP and schema-checked messages (7 headless checks). Missing: Dart `TourViewerScreen`/WebView, device test; WebGL rendering not verified |
| 8.2 | Full 2:1 equirectangular sources; device renditions or cubemap/multires; quick preview then suitable quality | not started | Schema (`asset_variants`); no processing jobs |
| 8.3 | Several scenes (driver, passenger, rear, 3rd row) as separate images | partial | Schema only (`tour_scenes` with seat position) |
| 8.4 | Hotspots (ar/en text, detail image, licensed video, linked spec, go to scene) | partial | Schema only (+ plain-text translations); viewer renders text with `textContent` |
| 8.5 | Tour bound to year, trim, market, interior colour, drive side; reference tour for a similar trim only with editor approval and visible difference | partial | Schema CHECKs + partial unique index; hotspots/initial scene cannot point into another tour (composite FKs + trigger); publishing refused unless the variant is offered in the tour's market (trigger, e2e) |
| 8.6 | No flat image/carousel as 360°; no fabricated interiors; «الجولة غير متاحة لهذه الفئة» + normal gallery; demo panorama clearly labelled | partial | DB refuses non-panorama scene assets (trigger, e2e). Viewer/gallery UI not built |
| 8.7 | Acceptance test with a licensed panorama | blocked | Needs a licensed equirectangular test panorama and a device/browser with WebGL |

## 9. إدارة الجولات والمحتوى البصري — Tour & visual content management

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 9.1 | Visual tour editor (upload, preview, first scene, yaw/pitch/FOV, hotspots by click/drag, link scenes, translations, ordering, draft → publish after review) | not started | Admin section placeholder; Pannellum vendored |
| 9.2 | Rights holder, licence, attribution per file | partial | Schema only (`asset_licenses`) |
| 9.3 | Validate format, size, dimensions, corrupt files; preview for orientation/distortion (2:1 is not proof) | partial | Pattern exists for the logo (decoded with sharp, SVG refused). Media uploads not built |
| 9.4 | Resumable large uploads, background processing, renditions, progress/errors; never publish before ready; keep original and versions | partial | `upload_sessions` schema, raw chunk body parser, S3 multipart API, `media-processing` queue; a tour cannot be published with non-ready or unlicensed panoramas (trigger, e2e). No upload endpoints/processors |
| 9.5 | Separate extensions for exterior spin and GLB/glTF; panorama is not "3D" | not started | |

## 10. محطات الشحن — Charging stations

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 10.1 | Synced map + list, clustering, search in view or around a point, distance, filters, save, external navigation | not started | `flutter_map` + clustering deps; PostGIS `findNearby` helper (tests) |
| 10.2 | Station fields (operator, coordinates, address, entrance, hours + time zone, access limits, contacts, photos, nearby services, start/payment method, last update); tariffs with unit (kWh/minute/session) incl. parking, idle, taxes | partial | Schema only with CHECKs (tariff unit fits component); source's free-text cost kept separately (`usage_cost_text`, never parsed) |
| 10.3 | Station / charge point / connector modelled separately; connector types (Type 2, CCS2, CCS1, CHAdeMO, NACS, GB/T AC/DC) with AC/DC and power | partial | Schema + 8 connector types seeded; published point count and connector quantity stored as given, connectors may exist without a known EVSE grouping (no invented EVSEs); AC/DC must match the plug type; children never reference another station (triggers/composite FK, e2e) |
| 10.4 | Switchable sources: Open Charge Map, official/contract sources, documented manual entry, reviewed user suggestions; import, sync, dedupe, source log | partial | OCM adapter (licence checks, operational status only; synthetic fixture tests), manual source, `provider_records` unique (provider, external_id), `ImportJobsService`. **Blocked for live OCM: needs `OCM_API_KEY`** |
| 10.5 | Respect provider licences/attribution; paid map keys, quotas, spend alerts; no automatic paid subscriptions | partial | OCM licence per record; tile attribution mandatory + OSM policy warning in admin. No paid map provider; spend alerts not started |

## 11. حالة الشحن اللحظية والتوافق — Live status & compatibility

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 11.1 | Separate "station works", "open now", "port available now" | partial | Separate schema fields; availability helper turns missing/expired into `unknown` (tests) |
| 11.2 | Live availability only from a real provider with source, time and expiry; expired → «غير معروفة» | blocked | Default provider `none` (everything unknown). Needs an OCPI/operator feed agreement |
| 11.3 | Owner ratings, check-ins, reports kept separate and dated; report types (not working, wrong location, different connector, price changed, restricted access) with review and abuse protection | partial | Schema only |
| 11.4 | Filter compatible ports by the user's car; plug shape ≠ compatibility; no unverified adapters | not started | Data model ready: `variant_market_inlets` (structured inlets per variant × market with source/reliability). Filter not built |
| 11.5 | No start/reserve/pay button without a supported, tested operator integration | done, untested (nothing to test: no such button exists) | |

## 12. تخطيط الرحلات — Trip planning

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 12.1 | Planner: start, end, car, current SoC, minimum arrival SoC; real routing provider and road distances | partial | OSRM / OpenRouteService adapters (tests). **Blocked: needs a routing provider (OSRM URL or ORS key)** |
| 12.2 | Consumption estimate with editable assumptions; reachable stations with reserve and an alternative; checks compatibility, access, opening hours at ETA; confidence level | not started | |
| 12.3 | Legs, distance, stops, energy, time, approximate cost, assumptions; no guaranteed arrival; no invented plan | not started | |
| 12.4 | Hide advanced planning when no routing provider, explain in admin, keep external directions | done & tested | `/app-config` forces `tripPlanner=false` while unconfigured (e2e); admin System page shows the reason and capability "not available" |

## 13. حاسبات الشحن والتشغيل — Calculators

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 13.1 | Home/public charging cost, duration, cost per 100 km, monthly cost, vs petrol, TCO | not started | Mobile placeholder |
| 13.2 | Energy added = usable capacity × ΔSoC; grid energy = added ÷ efficiency (editable, bounded, no double loss) | not started | |
| 13.3 | Local tariffs and session/time/parking fees with currency and price date; no stale prices shown as current; energy cost separate from TCO | not started | |
| 13.4 | AC time from the effective power limit; DC from a documented curve, otherwise a low-confidence estimate | not started | Schema for charging curves exists |
| 13.5 | Unit tests incl. missing/zero/negative values and the 60 kWh 20→80% = 36 kWh → 40 kWh at 90% example | not started | |

## 14. حساب المستخدم وسيارتي — Account & my car

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 14.1 | E-mail registration and verification | done & tested | Backend e2e; mobile screens (incl. "Verify my email" after `EMAIL_NOT_VERIFIED`); live curl + mobile live test |
| 14.2 | Google / Apple sign-in once keys are configured | partial | Backend ID-token verification (e2e with local JWKS), 503 until configured. No sign-in buttons/SDK plugins in the app. **Blocked: Google client IDs, Apple Developer account/Service ID** |
| 14.3 | Session management; delete account and data | done & tested | `/me/sessions`, `DELETE /me` (personal data removed, public contributions anonymised — verified live); mobile + admin session screens |
| 14.4 | Reading/browsing never requires sign-in | done & tested (shell) | Guest navigation tests; content itself not built |
| 14.5 | "جراجي": several cars with trim and market | not started | Schema only (`user_vehicles`) |
| 14.6 | Favourites for news, cars, stations, comparisons | not started | Schema only |
| 14.7 | Optional charging log (date, energy, cost, odometer) with spend/consumption reports | not started | Schema only |
| 14.8 | Maintenance/insurance/licence reminders; price and news alerts for the car | not started | Schema only |
| 14.9 | Never claim battery reading or car control without an official API | done, untested (no such feature exists) | |

## 15. الموسوعة والمجتمع ودليل الخدمات — Encyclopedia, community, services directory

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 15.1 | Beginner encyclopedia (car types, connectors, batteries, range cycles, home/fast charging, warranty, used-car checks), technically reviewed, no unsafe instructions | not started | Schema (publish requires technical review, CHECK) |
| 15.2 | Q&A, owner experiences, comments, ratings with reporting, blocking, moderation, anti-spam | not started | Schema only |
| 15.3 | No demo reviews shown as real; "verified owner" only after real verification | not started | |
| 15.4 | Services directory (service centres, dealers, charger installers, emergency) with verified contacts and date; sponsorship clearly marked | not started | Schema only |

## 16. الإشعارات والإضافات الذكية والربح — Notifications, smart add-ons, monetisation

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 16.1 | Notification centre, preferences by brand/model/country/category, quiet hours, unsubscribe, deep links, no duplicates | not started | Schema + ar/en templates |
| 16.2 | Push integration testable once configured | partial | FCM/APNs adapters (unit tests); in-app centre always "configured". **Blocked: FCM service account, APNs key** |
| 16.3 | Optional assistant answering only from DB/verified content with references and dates | not started | Adapter reports not implemented. **Blocked: LLM provider decision + key; `@anthropic-ai/sdk` dependency requested** |
| 16.4 | Ad placements/sponsorship, clearly labelled; no forced ads on map or panorama | not started | Schema only |
| 16.5 | Paid subscriptions/commissions/payments only after a real integration | not started | Nothing fake exists |

## 17. لوحة الإدارة — Admin panel

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 17.1 | Accounts and roles | done & tested | Users list/filters, drawer (roles, suspend, sessions), owner-only role permission editor; community moderators only suspend plain users and never see owner/admin sessions (server + UI, tests); the deploy-time seed never re-grants permissions an owner removed; admin tests + Playwright |
| 17.2 | News and categories | not started | Placeholders |
| 17.3 | Brands, models, trims, markets | partial | Markets + currencies done & tested; catalog not started |
| 17.4 | Specs and sources; prices and history | not started | |
| 17.5 | Images, tours, hotspot editor | not started | |
| 17.6 | Stations, connectors, tariffs, reports | not started | |
| 17.7 | Reviews and comments moderation | not started | |
| 17.8 | Notifications | not started | |
| 17.9 | Ads | not started | |
| 17.10 | Translations and settings | done & tested | Translations (overrides incl. server error texts, sort, 409→update); settings (8 tabs incl. app links, logo upload, restore default, server warnings) |
| 17.11 | Roles owner, admin, editor, content reviewer, vehicle data manager, station manager, community moderator — enforced on the server | done & tested | 69 permissions × 8 roles; `rbac-admin` e2e (401/403 on every admin route, fail-closed guard); UI hiding is cosmetic only |
| 17.12 | Audit log of changes | done & tested | Automatic for every admin mutation + security events; admin viewer with diff; Playwright saw its own settings change |
| 17.13 | Preview before publish; restore a previous version | not started | Schema (`article_revisions`) |
| 17.14 | CSV import (templates, column definitions, preview, row errors, dedupe); permission-limited export | partial | `ImportJobsService` + admin import-jobs API (tests). Missing: CSV templates/parsers/UI, export |
| 17.15 | Reports: usage, most read, most compared; import status, stale data, processing failures, unconfigured services | partial | Dashboard shows stale data, failed jobs/imports, unconfigured services, per-status counts (real overview). Usage/most-read/most-compared analytics not started |

## 18. قاعدة البيانات والـAPI — Database & API

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 18.1 | Data model with all listed tables | done & tested | 103 tables, 4 migrations, 114 CHECKs, 21 triggers, 6 partial unique indexes, 1 exclusion constraint; drift check; `database` + `data-integrity` e2e; upgrade path tested on a copy of the dev DB |
| 18.2 | Separate trims/markets, fact/source, station/connector, operational/live, tour/scenes/rights; FKs, indexes, unique external ids | done & tested (schema) | Review 2 added cross-row rules: official prices need a source + local currency and never overlap; tour/station children stay within their parent; see `decisions/review-fixes-2.md` §3 |
| 18.3 | Document public and admin routes, search, pagination, filters, errors | partial | OpenAPI for all existing routes. `docs/API.md` not written; public content routes do not exist |
| 18.4 | Syncs retryable without duplicate records | partial | Unique provider ids; import-job idempotency keys and row upserts (tests). No sync jobs yet |
| 18.5 | No publishing before review is complete | partial | Schema CHECKs (encyclopedia review, reference tour approval). Workflows not built |
| 18.6 | Test data isolated; no fake seed in public map/news | done & tested | `is_demo` on every sample row; demo seed refuses production; the demo station sits in open water (no real place); e2e uses its own databases; dashboard warns about demo rows in production |

## 19. الأمان والخصوصية والأداء — Security, privacy, performance

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 19.1 | Secure auth and authorisation on every operation | done & tested | argon2id, HS256 JWT with iss/aud/typ checks, session re-check per request, rotating refresh with whole-family reuse detection + 60 s grace window + 90-day max session age, lockout that strangers cannot use against known devices, uniform timing on register/forgot, fail-closed admin guard |
| 19.2 | Transport encryption; secrets outside code; no server secrets in the APK | partial | Env-only secrets, production validation, HSTS/secure cookies in production, mobile HTTPS-only release config. TLS/hosting not set up |
| 19.3 | Public SDK keys restricted per app | not started | No SDK keys yet |
| 19.4 | Rate limits, input validation, file checks, sanitising articles/links, SSRF protection for imports | partial | Throttling (auth/search/write presets; `TRUST_PROXY` documented for proxies), whitelist validation (422, also for explicit nulls, NUL bytes, huge pages), `sanitize-html`, SSRF-safe fetcher (tests incl. redirects without credentials, IPv6 2000::/3 only, size/timeout), logo decode check. Media upload checks not built |
| 19.5 | Isolated 360° viewer, allowed origins, restricted navigation/messages, no untrusted HTML/JS from hotspots | partial | `viewer.html` CSP, frozen bridge, schema-checked messages, `textContent`. Dart navigation delegate not built |
| 19.6 | Location "while in use" only when needed; manual city/point on denial; no stored history/precise location without consent | partial | Platform permission config + permission-denied state. Location features not built |
| 19.7 | Scheduled backups and a restore test | not started | Needs the hosting decision |
| 19.8 | Error monitoring and logs without secrets; alerts for outages/cost | partial | pino with redaction (tests), `/health`. No monitoring/alerting service |
| 19.9 | Optimised images, pagination, caching, geo queries; phone storage limit for panoramas; stop motion when leaving | partial | Pagination, ETag/304 on public config, GIST index, viewer stops orientation when hidden |
| 19.10 | Offline saved news/specs with save date; cached charger status never shown as live; respect provider storage terms | partial | Cache with `savedAt` + `CachedDataNotice`. No content yet |
| 19.11 | No unmeasured performance claims | done | None are made |

## 20. الربط بالموقع والمشاركة — Website integration & sharing

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 20.1 | API usable by the website and the app for the same content | partial | One REST API; `docs/WEBSITE_INTEGRATION.md` not written |
| 20.2 | Inspect the current site code before linking; otherwise document the integration without claiming sync | not started | **Needs the site code** (not provided) |
| 20.3 | Stable share links for news, cars, comparisons; App Links / Universal Links with web fallback | partial | Settings (`share`, `app_links`), admin tab, Android filters (incl. e-mail links), iOS entitlements (not wired). **Blocked: release signing SHA-256, Apple Team ID, `.well-known` hosting on evcar.news**; share module not built |
| 20.4 | Configurable share titles, images, language | partial | `share` setting (default image, language, path templates) |
| 20.5 | SEO / structured data on public web pages | not started | |

## 21. خطة التنفيذ — Implementation plan

| ID | Phase | Status | Notes |
|---|---|---|---|
| 21.1 | Phase 1: analysis, decisions, structure, database, design system, auth, RBAC, settings, screen map | done & tested | Screen map = mobile route table (`mobile/README.md`) + admin feature registry |
| 21.2 | Phase 2: news, catalog, comparisons end-to-end with search, saving, translation | not started | |
| 21.3 | Phase 3: 360° viewer, tour editor, uploads and processing | not started | Foundations only (viewer bridge, schema, storage) |
| 21.4 | Phase 4: stations map, import, manual entry, filters, compatibility, reports, source freshness | not started | Adapters only |
| 21.5 | Phase 5: account, calculators, notifications, trips, community, directory, assistant, ads | partial | Account done. Unfinished features stay hidden: `/app-config` only announces implemented modules, the app hides their tabs/tiles/routes (tests) |
| 21.6 | Phase 6: integration/security/performance/navigation tests, packaging, deployment docs | not started | |
| 21.7 | Run and record tests after each phase | partial | Phase 1 recorded in `docs/decisions/integration.md`, review 2 in `review-fixes-2.md`; CI workflow `.github/workflows/evcar-ci.yml` (backend incl. e2e with PostGIS/Redis, admin, mobile; not executed here — no runner); `docs/TEST_REPORT.md` not written |

## 22. معايير القبول — Acceptance criteria

| ID | Criterion | Status | Notes |
|---|---|---|---|
| 22.1 | A news item / car / station added in admin appears in the app from the DB; saves and comparisons survive restart | not started | The same path is proven for settings (admin save → `/app-config` → mobile parser) |
| 22.2 | Navigation, back, filters, ar/en, text scaling, landscape tested | partial | Navigation/back, ar/en, text scale covered in tests; filters/landscape not |
| 22.3 | Comparisons across trims/markets with missing values and mismatched cycles; gaps never become zeros or wins | not started | |
| 22.4 | Licensed panorama: drag, zoom, fullscreen, two scenes, info hotspot, image failure, tour unavailable | blocked | Licensed panorama + WebGL device needed |
| 22.5 | Location denied, no map keys, duplicate stations, stale availability, incompatible ports; no demo station as real, unknown never "available" | partial | "Map not configured" and "availability unknown" behaviours exist and are tested; demo station is not on a real place (e2e); rest not started |
| 22.6 | Calculator unit tests (60 kWh example, units, division by zero) | not started | |
| 22.7 | Normal user blocked from admin; user data isolation; invalid uploads; session expiry; backup/restore | partial | Admin 403 for normal users, data isolation (API, and in the DB: logs/reminders/trips cannot reference another user's car), session expiry/revocation, invalid logo uploads: tested. Backup/restore not started |

## 23. التسليم النهائي — Final delivery

| ID | Deliverable | Status | Notes |
|---|---|---|---|
| 23.1 | Organised code, DB schema + migrations, isolated test data, `.env.example` without secrets, OpenAPI | done & tested (Phase 1 scope) | |
| 23.2 | Local run instructions and server deployment instructions | partial | `README.md` (ar/en) + per-app READMEs. `docs/DEPLOYMENT.md` not written |
| 23.3 | Docker settings for the services | done, untested (no Docker daemon) | `docker-compose.yml` (backend receives the whole root `.env`, `TRUST_PROXY` for the admin proxy), backend + admin Dockerfiles; backend image steps simulated by hand. MinIO tag unpinned (registry unreachable) |
| 23.4 | Safe first-admin creation without a hard-coded password | done & tested | `npm run create-owner` → one-time `/setup-password` link (e2e + live) |
| 23.5 | Admin guide (news, cars, tours, stations); 360° preparation/upload/rights guide | not started | `ADMIN_GUIDE_AR.md`, `PANORAMA_GUIDE_AR.md` |
| 23.6 | External services, keys and possible costs (no invented prices); test report; exact list of what needs an account/content/activation | partial | Provider status in admin + decision records; see "Inputs needed" below. `EXTERNAL_SERVICES.md`, `TEST_REPORT.md` not written |
| 23.7 | Test APK when possible; AAB with signing status; iOS project + build instructions and account requirements | blocked | No Android SDK/Xcode here. iOS/Android projects exist; build steps in `mobile/README.md`; no APK/AAB/IPA produced |
| 23.8 | Requirements tracking file | done | This file |

---

## Inputs needed from the project owner

| Input | Unblocks |
|---|---|
| Open Charge Map API key (`OCM_API_KEY`) | station import/sync (10.4) |
| OCPI / operator live-availability agreement | live availability (11.2) |
| Routing provider (self-hosted OSRM URL or OpenRouteService key) | trip planner (12.x) |
| Geocoding (Nominatim-compatible URL + contact e-mail) | address search |
| Firebase service account + APNs key (.p8, key id, team id) | push notifications (16.2) |
| Google OAuth client IDs; Apple Developer account (team id, Service ID) | social sign-in (14.2), Universal Links (20.3) |
| Android release keystore / Play App Signing SHA-256 | App Links verification (20.3), AAB signing (23.7) |
| SMTP credentials | real account e-mails (dev prints them to the log) |
| S3 bucket (or MinIO) credentials + CDN URL | production media storage (2.4) |
| Production map tile provider (the public OSM server is not for production) | map (10.1) |
| Licensed content: 360° interior panoramas per trim, car images, news re-publication permissions | tours (8.x), catalog, news |
| Privacy policy and terms URLs | legal links in the apps |
| Hosting for evcar.news `/.well-known/*` and the current website code (if integration is wanted) | 20.2, 20.3 |
| LLM provider choice + key (optional) | assistant (16.3) |
