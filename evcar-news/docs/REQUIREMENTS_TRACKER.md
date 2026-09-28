# Requirements tracker — EV Car News

Source: `docs/REQUIREMENTS_AR.md` (sections 1–23). Contract: `docs/ARCHITECTURE.md`.
Last update: 2026-09-28 — integration pass 2 ("finish the mobile app first"), see
`docs/decisions/integration-2.md`. Earlier: Phase 1 (`integration.md`), review 2
(`review-fixes-2.md`), feature records `docs/decisions/{backend,mobile}-*.md`.

**Status values** (ARCHITECTURE §8):
`done & tested` · `done, untested (why)` · `partial (what is missing)` ·
`not started` · `blocked (input needed)`.

**Scope decision of the product owner (2026-09):** finish the mobile app first; the
admin panel *screens* for content are **deferred**. Content is still created only
through the permission-checked admin **API** (proved live, see 22.1). Rows about admin
screens therefore say "API done, screens deferred".

**What "live" means below:** the 2026-09-28 end-to-end run — database
`evcar_e2e_app` (migrations + reference + demo seed), backend built from this tree,
content created through the admin API by staff accounts (`create-owner` + role
assignment), the Flutter **web build** driven by Playwright/Chromium in Arabic and
English. Screenshots: `docs/screenshots/app/` (`ar-*`, `en-*`).

## At a glance

| Area | State | Evidence |
|---|---|---|
| Backend: foundation, auth, RBAC, audit, settings, markets, system | done & tested | Phase 1 + review 2 |
| Backend: articles/categories/tags/RSS, vehicles catalog + CSV, comparisons + recommendations, media + tours, stations + OCM sync, search/home/favorites/encyclopedia/services, community, calculators/garage/charging logs/reminders/notifications/trips | done & tested | 65 unit suites / 755 tests; 46 e2e suites / 611 tests (own DB per run); OpenAPI 346 paths |
| Backend: share (web fallback pages, `.well-known`), ads, assistant | not started | modules are skeletons |
| Mobile app: all 5 tabs and every routed feature screen | done & tested | `flutter analyze` 0 issues; `flutter test` 622 passed / 9 live tests skipped; live Playwright run ar + en |
| Admin panel: Phase-1 sections | done & tested | Phase 1 |
| Admin panel: content screens (news, catalog, tours editor, stations, moderation…) | deferred (product owner) | the admin APIs exist and are tested |
| APK / AAB / IPA | blocked here | no Android SDK / Xcode in this environment; APK comes from `.github/workflows/evcar-android.yml` (see `docs/MOBILE_BUILD.md`) |

---

## 1. الهوية واللغات والنطاق — Identity, languages, scope

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 1.1 | Name "EV Car News"; name, logo and colours editable from admin | done & tested | `branding` setting → `/app-config` → app theme/title (tests); admin Phase-1 settings screen |
| 1.2 | Share settings bound to evcar.news without changing the existing site | partial | Share URLs built from `share` settings (`https://evcar.news/n/<slug>`, `/cars/<slug>`, `/compare/<id>`); app maps them back (deep-link tests + live cold start). Missing: share module web fallback pages and `/.well-known/*` |
| 1.3 | Arabic RTL + English LTR | done & tested | Every feature has widget tests in both languages; live run in ar (RTL) and en (LTR) incl. language switch in Settings (`en-31-settings-english-dark.png`) |
| 1.4 | Localised messages / errors | done & tested | Server error catalogs ar/en (field errors shown live: password rule on register, `ar-12-register-password-rule.png`); app error mapping tests |
| 1.5 | Localised dates, currencies, units | done & tested | App formatters (tests); live: `1,999,000 ج.م` / `EGP 1,999,000`, km/kWh/kW in both languages |
| 1.6 | Language independent of market | done & tested | Settings screen has separate language and market choices (live screenshots) |
| 1.7 | Egypt default; SA/AE; more addable | done & tested | Seed + admin market CRUD (Phase 1); app market picker lists `/app-config` markets |
| 1.8 | Proposed countries are no guarantee of station data | done & tested | No station coverage is claimed; station list says "1 station in total" for the area searched |
| 1.9 | Guests browse everything; account only for personal features | done & tested | Live: news, cars, compare, charging, calculators used as guest; save-to-account / garage ask for sign-in |

## 2. الهيكل التقني — Technical structure

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 2.1 | Flutter + Riverpod + go_router | done & tested | `mobile/` |
| 2.2 | React + TypeScript admin | done & tested (Phase 1 scope) | content screens deferred |
| 2.3 | NestJS + PostgreSQL/PostGIS | done & tested | `backend/`, 7 migrations |
| 2.4 | S3-compatible storage | partial | Local + S3 drivers; media uploads/renditions/tiles verified with the local driver (live + e2e). Not run against real S3/MinIO |
| 2.5 | Redis + background jobs | done & tested | BullMQ media processing worker ran live (panorama → preview, 2048/4096 renditions, multires tiles); article scheduler / RSS / OCM jobs tested through their services |
| 2.6 | Local SQLite for saved content | done & tested (device), n/a on web | sqflite cache + saved items (tests with ffi); the web preview uses in-memory stores by design |
| 2.7 | Modular monolith | done | 34 modules in one app |
| 2.8 | Provider adapters | done & tested (offline) | Live providers not called (no keys, no network) |
| 2.9 | Pinned versions + lockfiles | done | |
| 2.10 | OpenAPI | done & tested | `backend/openapi.json` re-exported: 346 paths |
| 2.11 | dev/test/prod configuration | done & tested | |
| 2.12 | Native app; isolated WebView only for the 360° viewer | done & tested (widget/unit), device unverified | `TourViewerScreen` + `assets/panorama/viewer.html` (52 tour tests); WebView itself not run on a device |

## 3. التصميم والتنقل — Design & navigation

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 3.1 | Native automotive-tech look, brand blue/cyan, dark mode | done & tested | Live screenshots light + dark; widget tests in both themes |
| 3.2 | Licensed Arabic font | done & tested | IBM Plex Sans Arabic (OFL) |
| 3.3 | Bottom bar Home/Cars/Compare/Charging/Account | done & tested | live |
| 3.4 | 360° tours prominent on home, catalog, car page | done & tested | Home "جولات داخلية 360°" section, car page badge + tour tab (live `ar-01-home.png`, `ar-04-car-page.png`) |
| 3.5 | Loading/empty/error/offline/permission states | done & tested | `AsyncStateView` on every screen; per-feature widget tests; live offline state seen when CORS failed (before the fix) |
| 3.6 | Text scaling to 200 %, screen reader, contrast, 48 dp | partial | 200 % matrices in widget tests for every feature; Semantics labels drove the whole live run (Playwright used only the accessibility tree). No TalkBack/VoiceOver audit on a device |
| 3.7 | Landscape for comparisons and panorama | done, untested on device | Size-based widget tests only |
| 3.8 | Never colour alone for "best"/warnings | done & tested | Comparison rows carry text ("Different test cycles — no winner", trophy + text); live |

## 4. الرئيسية — Home

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.1 | Top story, news, reviews, new cars, featured comparisons, tours, nearby stations, guides | done & tested | `GET /home` (discovery e2e); live home shows top story, latest news, tours (`ar-01-home.png`, `en-01-home.png`) |
| 4.2 | Personalisation without hiding content | partial | Server personalisation (`for_you` from interests) tested; no interests editing screen in the app |
| 4.3 | Unified search with suggestions and ar/en aliases | done & tested | `/search`, `/search/suggest` (e2e); app search screen (tests). Tours not searchable |
| 4.4 | Home order/visibility from admin | done & tested | `home.sections` setting → `/home` + app (tests); admin Phase-1 settings tab |
| 4.5 | Keep scroll position on back | done & tested | Shell keeps tab stacks (tests) |

## 5. الأخبار والمراجعات والمحتوى — News, reviews, content

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 5.1 | Publishing system with all fields and linked cars | done & tested (API) · screens deferred | Articles admin API (e2e); live: editor created an ar/en article linked to a car, shown in the app with the linked car (`ar-02-article.png`) |
| 5.2 | Draft → review → schedule → publish → archive, revisions | done & tested (API) | Live: editor could not feature/publish (403 `ARTICLE_FEATURE_NEEDS_PUBLISH`), reviewer published |
| 5.3 | Rich editor | partial | Server sanitiser + embeds policy done; admin editor screen deferred |
| 5.4 | Reading comfort, text size, save, share, related, offline | done & tested | Reader settings, favourite, offline save, share, related (widget tests; live screen) |
| 5.5 | RSS import with dedupe and rights | done & tested (local fixture) | No real publisher feed fetched |
| 5.6 | No full copies without permission; machine output stays draft; no fabricated news | done & tested | Licence modes, unreviewed machine translations never served (e2e). No AI drafting |
| 5.7 | Event date separate from publication | done & tested | |
| 5.8 | Per-language slugs (schema request) | done & tested | Migration `20260929000000_article_translation_slugs`; live: the Arabic slug opens the article on a cold-start deep link |

## 6. دليل السيارات والمواصفات — Car catalog & specs

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 6.1 | Brand → model → generation → year → trim → market specs | done & tested | Admin API; live test catalog created entirely through it |
| 6.2 | Specs never on a model name alone; BEV never mixed with a same-named hybrid | done & tested | Live: "Long Range" (BEV) and "Long Range PHEV" are separate trims with separate data |
| 6.3 | BEV/PHEV/EREV/HEV | done & tested | |
| 6.4 | Brands manageable; no assumed availability | done & tested (API) · screens deferred | Market chips show "(غير مطروحة)" where not offered (live) |
| 6.5 | Car page with all spec groups, ranges + cycle, charging times with SoC window | done & tested | Live `ar-06/07`, `en-06/07` |
| 6.6 | Tabs: reviews, news, owners, tours, competitors | done & tested | Owners tab has owner reviews + model comments (CommentsSection embedded in this pass) |
| 6.7 | Source, date, reliability per spec | done & tested | Live: "بيان الشركة المصنّعة" badge + source per value |
| 6.8 | Missing → «غير متوفر», never 0 | done & tested | Live: PHEV "0–100 km/h: Not available", "AC charging: Not available", price "Price not available" |
| 6.9 | Converted price never shown as official | done & tested | Server refuses foreign-currency official prices; PHEV shows no price instead of a conversion |
| 6.10 | Car/station photos from the media library | done & tested | Fixed in this pass: vehicles/stations fall back to the public renditions when the original is private (unit test) |

## 7. المقارنات — Comparisons

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 7.1 | 2–4 cars; year, trim, market mandatory | done & tested | Live: two trims added from the car page to the tray |
| 7.2 | Short/detailed, differences only, sticky names, save, share | done & tested | Live: saved to account → reload → still in "Saved comparisons" (`ar-17-…`, `en-17-…`); guest share link created |
| 7.3 | Electric vs total range, cycle next to value, no cross-cycle winner | done & tested | Live: "480 km WLTP vs 120 km CLTC — Different test cycles — no winner"; BEV total range "not applicable" |
| 7.4 | Units normalised; peak ≠ average; SoC windows | done & tested | Live: DC time 10–80 % vs 30–80 % → not comparable |
| 7.5 | Recommendations with weights, reasons, missing data | done & tested | e2e + app wizard tests (not part of the live run) |
| 7.6 | Ads never change results | done & tested | `sponsored:false` + disclosure in every result; ads module not built |

## 8. الجولات الداخلية 360° — Interior 360° tours

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 8.1 | Drag, zoom, fullscreen, landscape, reset, optional gyro | done, untested on device | WebView + Pannellum bridge; widget/unit tests (52) and a Chromium run of `viewer.html` by the tours team. The web preview shows an honest "not available in the web preview" fallback (`ar-32-…`, `en-32-…`) |
| 8.2 | 2:1 sources, renditions, multires, quick preview | done & tested | Live: synthetic 4096×2048 test grid processed by the worker into preview, 2048/4096 renditions and multires tiles; live contract test `test/live/live_tours_test.dart` parses them |
| 8.3 | Several scenes | done & tested | e2e + app tests |
| 8.4 | Hotspots | done & tested | Live tour has one info hotspot (ar/en) |
| 8.5 | Tour bound to trim/market/colour/drive side; reference tours need approval + visible note | done & tested | e2e |
| 8.6 | No fake 360°; «الجولة غير متاحة»; demo labelled | done & tested | Only synthetic grids labelled "DEMO 360° — TEST ONLY — NOT A CAR INTERIOR" exist |
| 8.7 | Acceptance with a licensed panorama on a device | blocked | Needs a licensed interior panorama and a phone |

## 9. إدارة الجولات والمحتوى البصري — Tour & media management

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 9.1 | Visual tour editor | API done & tested · screen deferred | |
| 9.2 | Rights holder, licence, attribution | done & tested | Live: licence created via API before upload |
| 9.3 | Validate files; 2:1 is not proof (visual check) | done & tested | Live: visual check with acknowledged warnings before publish |
| 9.4 | Resumable uploads, background processing, never publish before ready | done & tested | Live chunked upload (512 KiB chunks) + worker |
| 9.5 | Exterior spin / GLB | not started | flag `exteriorSpin` stays off |

## 10. محطات الشحن — Charging stations

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 10.1 | Map + list, clustering, search in view/around point, filters, save, navigation | done & tested | Live list + map (`ar-19/20-…`). Map tiles did not load here (no internet); production needs a tile provider |
| 10.2 | Station fields, tariffs with units | done & tested | e2e; live detail shows hours in the station time zone |
| 10.3 | Station / point / connector separate; connector types | done & tested | Live: CCS2 DC 120 kW + Type 2 AC 22 kW on one point |
| 10.4 | OCM, manual, user suggestions; sync, dedupe | partial | Manual (live via admin API) and suggestions done; OCM import tested with a synthetic fixture only. **Blocked for live OCM: `OCM_API_KEY`** |
| 10.5 | Licences/attribution; no paid map | partial | Attribution shown; no spend alerts |

## 11. حالة الشحن اللحظية والتوافق — Live status & compatibility

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 11.1 | Works / open now / available now separate | done & tested | Live detail: "Operation: Unknown", "Open now (24 h, Africa/Cairo)", "Availability unknown" |
| 11.2 | Live availability only from a real provider; else unknown | done & tested · provider blocked | Live: "Availability unknown — no live source connected". **Blocked: OCPI/operator feed** |
| 11.3 | Check-ins/reports separate and dated, moderated | done & tested | e2e + app screens; "my reports/suggestions" lists not in the app |
| 11.4 | Compatible ports by the user's car; no adapters | done & tested | e2e + app filter "يناسب سيارتي" (garage cars) |
| 11.5 | No start/reserve/pay without integration | done | no such button exists |

## 12. تخطيط الرحلات — Trip planning

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 12.1–12.3 | Planner with real routing, stops, assumptions | done & tested (mocked routing) · blocked live | e2e with mocked OSRM; app screen tests. **Blocked: routing provider** |
| 12.4 | Hidden while routing is unconfigured, explained | done & tested | Live account hub: "مخطط الرحلات غير متاح بعد" with explanation |

## 13. حاسبات الشحن والتشغيل — Calculators

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 13.1 | Home/public cost, time, per 100 km, monthly, vs petrol, TCO | done & tested | 7 calculators (app engine = server engine, 82 parity fixtures) |
| 13.2 | Energy = capacity × ΔSoC; grid = ÷ efficiency | done & tested | Live: 60 kWh, 20→80 % → **36 kWh added, 40 kWh from grid**, 3 h 38 min at 11 kW (ar + en, `ar-25`, `en-25`) |
| 13.3 | User tariffs with currency; energy vs TCO separate | done & tested | No built-in prices |
| 13.4 | AC from power limit; DC from a documented curve else low confidence | done & tested | Live shows "limited by: car", confidence label |
| 13.5 | Unit tests incl. 60 kWh example, zero/negative | done & tested | backend engine spec + app engine tests; live field validation ("Must be between 0 and 1") |

## 14. حساب المستخدم وسيارتي — Account & my car

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 14.1 | E-mail registration and verification | done & tested | Live: register in app → e-mail link `/verify-email?token=` opened in the app → verified → sign in |
| 14.2 | Google / Apple sign-in | blocked | Backend ready; no client IDs / Apple account; no buttons in the app |
| 14.3 | Sessions; delete account | done & tested | |
| 14.4 | Browsing never needs sign-in | done & tested | live |
| 14.5 | Garage: several cars with trim and market | done & tested | Live: picker brand → model → year → trim (BEV), added as primary car (`ar-26…30`, `en-30`) |
| 14.6 | Favourites (news, cars, stations, comparisons) | done & tested | e2e + app tests (merge on sign-in) |
| 14.7 | Charging log with reports | done & tested | e2e + app tests |
| 14.8 | Reminders; price/news alerts | partial | Reminders + local notifications done; server-side reminder/price alerts not emitted (only article publish notifications) |
| 14.9 | No fake battery reading / car control | done | none exists |

## 15. الموسوعة والمجتمع ودليل الخدمات — Encyclopedia, community, services

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 15.1 | Reviewed encyclopedia | done & tested (API + app) · admin screen deferred | publish requires technical review |
| 15.2 | Q&A, comments, reviews with moderation and anti-spam | done & tested | e2e; app screens; comments now embedded in article and car pages (live `ar-02-article.png`); Q&A reachable from Account → Explore; blocked-users screen routed at `/account/blocked-users` (this pass) |
| 15.3 | No demo reviews as real; verified owner only after verification | partial | Rules enforced; the app cannot upload owner evidence yet (no user upload route) |
| 15.4 | Services directory with verified contacts; sponsorship labelled | done & tested | e2e + app |

## 16. الإشعارات والإضافات الذكية والربح — Notifications, add-ons, monetisation

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 16.1 | Notification centre, preferences, quiet hours, deep links | done & tested | In-app centre + preferences (e2e + app) |
| 16.2 | Push | blocked | No FCM/APNs credentials; the app has no push SDK |
| 16.3 | Assistant | not started | **Blocked: LLM provider decision + key** |
| 16.4 | Ads / sponsorship | partial | Sponsored articles labelled; ads module not built |
| 16.5 | Payments only after real integration | not started | nothing fake exists |

## 17. لوحة الإدارة — Admin panel

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 17.1 | Accounts and roles | done & tested | Phase 1; live: owner assigned editor / content_reviewer / vehicle_data_manager / station_manager via the API |
| 17.2–17.9 | News, catalog, specs/prices, media/tours, stations, moderation, notifications, ads | API done & tested (except ads/notification campaigns) · **screens deferred** | Product-owner decision |
| 17.10 | Translations and settings | done & tested | |
| 17.11 | Roles enforced on the server | done & tested | 71 permissions × 8 roles |
| 17.12 | Audit log | done & tested | every admin mutation |
| 17.13 | Preview before publish; restore version | done & tested (API) | preview tokens, revisions + restore |
| 17.14 | CSV import/export | done & tested (vehicles API) | stations CSV not built |
| 17.15 | Reports | partial | data-quality, most-compared, system overview APIs; no usage analytics dashboard |

## 18. قاعدة البيانات والـAPI — Database & API

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 18.1 | Data model | done & tested | 7 migrations, drift check in sync |
| 18.2 | Separations and constraints | done & tested | |
| 18.3 | Documented routes | done | OpenAPI 346 paths + per-module contracts in `docs/decisions/backend-*.md` |
| 18.4 | Retryable syncs without duplicates | done & tested | OCM/RSS idempotency e2e |
| 18.5 | No publishing before review | done & tested | articles, tours, encyclopedia, reviews |
| 18.6 | Test data isolated and labelled | done & tested | Live test content is named "E2E Test…/[TEST]/(DEMO)" and lives only in `evcar_e2e_app` |

## 19. الأمان والخصوصية والأداء — Security, privacy, performance

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 19.1 | Auth + authorisation everywhere | done & tested | |
| 19.2 | TLS; secrets outside code | partial | Release app refuses http media; hosting/TLS not set up |
| 19.3 | Restricted public SDK keys | not started | none used |
| 19.4 | Rate limits, validation, file checks, sanitising, SSRF | done & tested | incl. media magic-byte/decoding checks |
| 19.5 | Isolated 360° viewer | done & tested (unit) | CSP, allowed origins, text-only hotspots; public media now sends `Access-Control-Allow-Origin: *` without credentials so tiles load (this pass, e2e + live) |
| 19.6 | Location only when needed | done & tested | Live: charging list uses the market's default city until "use my location" is tapped |
| 19.7 | Backups + restore test | done & tested (deploy kit) | `deploy/` backup/restore tested on local PG (`deploy-followups.md`) |
| 19.8 | Monitoring, logs without secrets | partial | pino redaction, `/health`, monitor script; no external alerting |
| 19.9 | Images, pagination, caching, geo | done & tested | ETag/304 on public content; renditions per device width |
| 19.10 | Offline saved items with date; cached status never live | done & tested | |
| 19.11 | No unmeasured performance claims | done | |

## 20. الربط بالموقع والمشاركة — Website integration & sharing

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 20.1 | One API for web and app | done | |
| 20.2 | Inspect the current site | blocked | site code not provided |
| 20.3 | Share links + App/Universal Links with web fallback | partial | Links + app mapping done (cold-start deep link fixed in this pass); **blocked**: release SHA-256, Apple Team ID, `.well-known` hosting; share module pages not built |
| 20.4 | Configurable share titles/images/language | partial | settings only |
| 20.5 | SEO on public web pages | not started | |

## 21. خطة التنفيذ — Implementation plan

| ID | Phase | Status | Notes |
|---|---|---|---|
| 21.1 | Phase 1 | done & tested | |
| 21.2 | Phase 2: news, catalog, comparisons | done & tested (API + app) · admin screens deferred | |
| 21.3 | Phase 3: 360° viewer, tour editor, uploads | done & tested except the editor screen (deferred) and device run | |
| 21.4 | Phase 4: stations | done & tested except live OCM/availability (blocked) | |
| 21.5 | Phase 5: account, calculators, notifications, trips, community, directory, assistant, ads | partial | assistant, ads, push not built/blocked |
| 21.6 | Phase 6: integration tests, packaging, deployment | partial | Integration + live e2e done; deployment kit done; packaging via CI only |
| 21.7 | Tests recorded per phase | done | decision records + this file |

## 22. معايير القبول — Acceptance criteria (app side)

| ID | Criterion | Status | Notes |
|---|---|---|---|
| 22.1 | Item added in admin appears in the app from the DB; saves and comparisons survive restart | done & tested (API + web build) | Live: article, brand/model/2 trims with specs/sources/ranges/prices, station, tour — all created through the admin API — shown in the app; saved comparison still listed after a full reload (server-side); compare tray kept across browser relaunches. On web the sign-in itself is not kept across reloads (tokens are memory-only in the web preview by design; secure storage on devices) |
| 22.2 | Navigation, back, filters, ar/en, text scaling, landscape | partial | Live ar/en + dark; text scaling and landscape by widget tests only |
| 22.3 | Comparisons with missing values and mismatched cycles | done & tested | Live (see 7.3/7.4); missing price → "no winner", never 0 |
| 22.4 | Licensed panorama on a device | blocked | Viewer covered by 52 widget/unit tests + live data contract test; WebView cannot run in the web preview |
| 22.5 | Location denied, no map keys, duplicates, stale availability, incompatible ports, demo station labelled | done & tested | e2e + app tests; live: default city without location, "availability unknown" |
| 22.6 | Calculator unit tests (60 kWh example) | done & tested | + live |
| 22.7 | Normal user blocked from admin; isolation; invalid uploads; expiry; backup/restore | done & tested | |

## 23. التسليم النهائي — Final delivery

| ID | Deliverable | Status | Notes |
|---|---|---|---|
| 23.1 | Code, schema, migrations, test data isolated, `.env.example`, OpenAPI | done & tested | |
| 23.2 | Local run + deployment instructions | done | `README.md`, `docs/DEPLOYMENT*.md`, `docs/MOBILE_BUILD.md` |
| 23.3 | Docker settings | done, untested (no Docker daemon) | |
| 23.4 | Safe first admin | done & tested | used live |
| 23.5 | Admin guide / panorama guide | not started | |
| 23.6 | External services list, test report | partial | this file + decision records |
| 23.7 | Test APK; AAB with signing status; iOS instructions | partial | CI workflow builds and publishes a **debug-signed** test APK on `[apk]` commits; AAB/iOS steps in `docs/MOBILE_BUILD.md`; nothing built here (no SDK) |
| 23.8 | Requirements tracking file | done | this file |

---

## Inputs needed from the project owner

| Input | Unblocks |
|---|---|
| Open Charge Map API key (`OCM_API_KEY`) | live station import (10.4) |
| OCPI / operator live-availability agreement | live availability (11.2) |
| Routing provider (OSRM URL or OpenRouteService key) | trip planner (12.x) |
| Firebase service account + APNs key | push (16.2) |
| Google OAuth client IDs; Apple Developer account | social sign-in (14.2), Universal Links (20.3) |
| Android upload keystore (and Play App Signing SHA-256) | signed release APK/AAB (23.7), App Links (20.3) |
| Production API URL (https) as repository variable `EVCAR_API_BASE_URL` | APKs that talk to the real server |
| SMTP credentials | real account e-mails |
| S3/MinIO + CDN (with CORS `*` for public media) | production media |
| Production map tile provider | map tiles (10.1) |
| Licensed content: interior panoramas, car images, news permissions | tours, catalog, news |
| Privacy policy / terms URLs | legal links |
| Current website code + `.well-known` hosting | 20.2, 20.3 |
| LLM provider + key (optional) | assistant (16.3) |
