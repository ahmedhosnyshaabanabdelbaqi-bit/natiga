# EV Car News — Architecture & Engineering Contract

This file is the **binding contract** between everyone building this project
(backend, admin, mobile). The full product requirements (Arabic) are in
`docs/REQUIREMENTS_AR.md` — read the sections relevant to your work; every
rule there is mandatory ("لا تختلق", "لا تحوّل", etc.). When this file and the
requirements disagree, the requirements win; record the deviation in
`docs/DECISIONS.md`.

Goal: a real, working product (not mockups). A feature is only "done" when it
flows DB → API → admin/app and has tests. Never fabricate news, prices,
specs, station locations, availability, reviews, or panoramas of real cars.
When an external key/content is missing: build the full plumbing, show a clear
"not configured" state, and never pretend it works.

## 1. Repository layout

```
evcar-news/
  README.md                  # quick start (ar + en)
  docker-compose.yml         # postgis, redis, minio, mailpit, backend, admin
  .env.example               # every variable, no secrets
  docs/                      # all documentation (see §9)
  backend/                   # NestJS + Prisma + PostgreSQL/PostGIS
  admin/                     # React + TypeScript + Vite admin panel
  mobile/                    # Flutter app (Android + iOS)
```
CI lives at the repo root: `.github/workflows/evcar-ci.yml`.

## 2. Local environment (already running in the dev container)

- PostgreSQL 16 + PostGIS 3 at `localhost:5432`, superuser role `evcar` /
  password `evcar_dev_pw`, dev DB `evcar_dev` (extensions postgis, pg_trgm,
  unaccent enabled). Tests MUST use their own database (see §4.9).
- Redis 7 at `localhost:6379`.
- Node 22 (`node`, `npm`). Flutter SDK at `/opt/flutter/bin` (add to PATH).
- No Docker daemon, no Android SDK (dl.google.com is blocked) → APK cannot be
  built here; everything else must be verified.
- Only edit files inside your assigned area. Do NOT run `git commit`,
  `git push`, `git stash`, `git checkout` or `git reset` — the orchestrator
  commits. Other agents work in parallel in the same working tree.

## 3. Cross-cutting product rules

- Languages: `ar` (RTL) and `en` (LTR) everywhere. Language is independent of
  market. Markets: `EG` (default launch market), `SA`, `AE`, more addable from
  admin. Currency per market (EGP, SAR, AED), units metric by default.
- Guests can browse everything public; accounts only for sync/personal/social.
- Missing value = `null` → shown as "غير متوفر / Not available". Never 0.
- Every important spec value carries `sourceId`, `verifiedAt`,
  `reliability` ∈ `verified | manufacturer_claim | estimated | unverified | disputed`.
- Range always carries its cycle: `WLTP | EPA | CLTC | NEDC | OTHER`, plus
  `rangeType` ∈ `electric | total`. Never convert between cycles.
- Charging time always carries `fromSoc`, `toSoc`, and the charger power
  condition. Peak DC power ≠ average power.
- Prices: amount + currency + priceType (`official_msrp | dealer | market_estimate`)
  + effective date + source. Converted prices are labelled
  "تقديري بعد التحويل" and never shown as an official local price.
- Station status is three separate things: operational status, open-now
  (from opening hours + timezone), live availability (only from a live
  provider observation that is not expired; otherwise `unknown`).
- Sample/test data lives only in the `test`/`demo` seed and is flagged
  `isDemo=true`; demo stations/panoramas are visibly labelled and are never
  seeded into production.
- Ads/sponsorship are always labelled and never change comparison results.

## 4. Backend (`backend/`)

### 4.1 Stack
NestJS (latest stable major that works end-to-end), TypeScript (strict; use
the newest TS version the Nest/Jest toolchain supports — do not use TS 7 if
tooling breaks), Prisma ORM on PostgreSQL 16 + PostGIS, Redis + BullMQ for
background jobs, S3-compatible storage (MinIO in compose; `local` disk driver
for dev/tests), `@nestjs/swagger` OpenAPI, `@nestjs/throttler`,
`class-validator`/`class-transformer`, argon2 for passwords, `sharp` for images,
`sanitize-html` for article HTML, `pino` logging (no secrets), Jest + supertest.
Pin exact versions and commit `package-lock.json`. Record choices in
`docs/DECISIONS.md`.

### 4.2 Modular monolith layout
```
backend/src/
  main.ts, app.module.ts
  config/            # typed env config, per-environment validation
  common/            # guards, decorators, filters, interceptors, pagination,
                     # i18n helpers, sanitization, units, money, errors
  prisma/            # PrismaService
  providers/         # adapters behind interfaces (see 4.6)
  jobs/              # BullMQ queues/processors registration
  modules/
    auth/ users/ rbac/ audit/ settings/ markets/ i18n/
    articles/ categories/ tags/ rss-import/
    vehicles/ (brands, models, generations, model years, variants, specs,
               sources, ranges, charging curves, prices)
    comparisons/ recommendations/ search/ home/
    media/ tours/
    stations/ (stations, points, connectors, tariffs, provider sync,
               availability, reports, check-ins)
    calculators/ garage/ charging-logs/ reminders/ favorites/
    notifications/ trips/ community/ (reviews, comments, Q&A, moderation)
    services-directory/ encyclopedia/ ads/ assistant/
    share/ (public web fallback pages, OG/JSON-LD, app links files)
    health/ system/ (integration status, import jobs, reports)
```
Each module owns its directory. Shared changes to `app.module.ts`,
`prisma/schema.prisma` and `package.json` are done by the foundation stage;
later stages must coordinate as instructed in their prompt.

### 4.3 API conventions
- Global prefix `/api/v1`. Public: `/api/v1/...`. Admin: `/api/v1/admin/...`
  (always permission-guarded server-side). Me: `/api/v1/me/...`.
- OpenAPI at `/api/docs` (UI) and `/api/docs-json`; exported to
  `backend/openapi.json` by `npm run openapi:export` (no running DB needed
  is preferred; otherwise document).
- Language: `?lang=ar|en` overrides `Accept-Language`; default `ar`.
  Market: `?market=EG` overrides header `X-Market`; default from settings.
- Single resource: `{ "data": {...} }`.
  List: `{ "data": [...], "meta": { "page", "pageSize", "total", "totalPages" } }`
  (`page` 1-based, `pageSize` default 20 max 100). Geo/infinite lists may use
  `meta.nextCursor`.
- Errors: `{ "error": { "code": "STRING_CODE", "message": "localized", "details"?: any, "requestId": "..." } }`
  with proper HTTP status. Validation → 422 `VALIDATION_FAILED` with field
  details. Unknown fields are rejected (whitelist + forbidNonWhitelisted).
- Dates ISO-8601 UTC. Money `{ amount: string(decimal), currency: "EGP" }`.
  Physical values in canonical units: km, kWh, kW, Wh/km, minutes, mm,
  liters, kg, seconds (0–100 km/h), Nm, hp and kW both stored for power.
- IDs: UUID v7 (or v4) strings; public content also has `slug`.
- Every mutating admin request is written to `audit_logs` (actor, action,
  entity, entityId, before/after diff, ip, userAgent, requestId).
- Rate limiting on auth, search, reports, uploads, comments.
- ETag / Cache-Control on public GETs.

### 4.4 Auth & RBAC
- Email + password (argon2id), email verification token (mail adapter:
  `console` in dev, SMTP when configured), password reset, JWT access token
  (15 min) + rotating refresh token stored hashed in `user_sessions`
  (device name, ip, last used, revoke), list/revoke sessions, delete account
  (hard-delete personal data, anonymize public contributions).
- Google / Apple sign-in: implemented as adapters verifying ID tokens; routes
  return `503 INTEGRATION_NOT_CONFIGURED` until env keys are set.
- Roles: `owner, admin, editor, content_reviewer, vehicle_data_manager,
  station_manager, community_moderator, user`. Permissions are strings like
  `articles.create`, `articles.publish`, `vehicles.write`, `stations.write`,
  `reports.moderate`, `users.manage`, `settings.write`, `audit.read`, ...
  stored in `permissions`/`role_permissions`; enforced by a guard
  `@RequirePermissions(...)`. Hiding buttons in UIs is only cosmetic.
- First owner: CLI `npm run create-owner -- --email x` prints a one-time
  password-setup link/token; no hard-coded password anywhere.

### 4.4.1 Shared contract used by admin & mobile (fixed — do not change shapes)
```
POST /api/v1/auth/register        {email,password,displayName,locale}      → 201 {data:{user}}
POST /api/v1/auth/verify-email    {token}                                  → {data:{verified:true}}
POST /api/v1/auth/resend-verification {email}                              → 202
POST /api/v1/auth/login           {email,password,deviceName?}             → {data:{accessToken,accessTokenExpiresIn,refreshToken?,user}}
POST /api/v1/auth/refresh         {refreshToken?}                          → same as login (rotated)
POST /api/v1/auth/logout          {refreshToken?}                          → 204
POST /api/v1/auth/forgot-password {email}                                  → 202 (never reveals existence)
POST /api/v1/auth/reset-password  {token,password}                         → 204   (also used by create-owner setup link)
POST /api/v1/auth/oauth/google    {idToken} | /oauth/apple {identityToken} → login shape, or 503 INTEGRATION_NOT_CONFIGURED
GET  /api/v1/me                   → {data:user}
PATCH /api/v1/me                  {displayName?,locale?}
GET  /api/v1/me/sessions          DELETE /api/v1/me/sessions/:id
DELETE /api/v1/me                 {password}                               → 204 (account + personal data deletion)
GET  /api/v1/app-config           → {data:{branding:{appName,logoUrl,primaryColor,accentColor},
                                      languages:["ar","en"], defaultLanguage, defaultMarket,
                                      markets:[{code,nameAr,nameEn,currency,timezone,enabled}],
                                      homeSections:[{key,enabled,order}], features:{<flag>:bool},
                                      map:{tileUrlTemplate,attribution,maxZoom,configured},
                                      share:{baseUrl}, legal:{privacyUrl,termsUrl}}}
```
`user` = `{id,email,displayName,emailVerified,locale,roles:string[],permissions:string[],createdAt}`.
Web clients send header `X-Client-Type: web`: the refresh token is then set as
an httpOnly, Secure (in prod), SameSite=Strict cookie `evcar_rt`
(Path=/api/v1/auth) and omitted from the JSON body; mobile gets it in the
body and stores it in secure storage. Access token is sent as
`Authorization: Bearer <token>`. 401 `TOKEN_EXPIRED` → client refreshes once
then retries.

### 4.5 Data model (Prisma, snake_case tables via @@map)
Must include at least (improve names/relations where useful):
users, roles, permissions, role_permissions, user_roles, user_sessions,
user_preferences, email_tokens;
markets, currencies, app_settings (branding, colors, home section order,
feature flags, share settings), translations (UI strings override);
brands, car_models, generations, model_years, vehicle_variants,
variant_markets (availability + local name per market), vehicle_specifications
(one row per variant×spec key, value_num/value_text/unit/original_value/
original_unit/source_id/verified_at/reliability), specification_sources,
range_measurements, charging_curves (+ points), charging_time_measurements,
price_history;
articles, article_translations, article_revisions, categories (+translations),
tags (+translations), article_tags, article_vehicle_links, rss_feeds,
rss_items (dedupe by guid/url hash);
media_assets, asset_licenses, asset_variants (renditions/tiles), upload_sessions
(resumable), interior_tours, tour_scenes, scene_hotspots (+translations);
charging_stations (geography(Point,4326) + GIST index), charging_points,
connectors, connector_types (reference data), tariffs, provider_records
(unique (provider, external_id)), availability_observations,
station_reports, station_checkins;
reviews, comments, questions, answers, moderation_actions, user_blocks;
favorites, comparisons (+ items, share slug), user_vehicles, charging_logs,
reminders;
notification_preferences, notifications, device_tokens, notification_deliveries;
service_providers (directory), encyclopedia_entries (+translations),
ad_placements, ad_campaigns;
audit_logs, import_jobs, import_job_rows, integration_settings.
Content workflow status: `draft → in_review → scheduled → published → archived`.
Use FKs, indexes, unique constraints, check constraints (e.g. soc 0–100).
Raw SQL migrations are fine for PostGIS/trigram/GIN/tsvector parts.

### 4.6 Provider adapters (`backend/src/providers/`)
Each provider type = interface + implementations + `status()` returning
`{configured: boolean, name, lastSuccessAt?, lastError?}` surfaced at
`GET /api/v1/admin/system/integrations`:
- `storage`: local disk, S3-compatible.
- `mail`: console, SMTP.
- `stations`: Open Charge Map (needs `OCM_API_KEY`), manual/admin, CSV.
- `availability`: none by default (→ `unknown`), interface for OCPI/partners.
- `routing`: OSRM / OpenRouteService / Google Routes (all optional; when none
  configured the trip planner is hidden and admin shows why).
- `geocoding`: Nominatim-compatible (optional).
- `news`: RSS/Atom (server-side fetch with SSRF protection: https only,
  block private/loopback/link-local IPs after DNS resolution, size+time limits).
- `push`: FCM / APNs (optional) + in-app notification center always works.
- `oauth`: Google, Apple.
- `assistant`: optional LLM, answers only from retrieved DB content with
  citations; disabled when unconfigured.

### 4.7 Search
PostgreSQL full-text + pg_trgm across articles, brands, models, variants,
stations, encyclopedia. Arabic normalization (أ/إ/آ→ا, ى→ي, ة→ه, remove
tatweel & diacritics) applied to both indexed text and query; alias table
for alternative spellings/transliterations (e.g. "بي واي دي" ↔ BYD,
"تسلا" ↔ Tesla, "زيكر" ↔ Zeekr, "شاومي" ↔ Xiaomi). Suggest endpoint.

### 4.8 Media & 360°
Resumable uploads (tus protocol or chunked upload sessions with offsets),
validation (mime sniffing, dimensions, corrupt files, max size), original
kept, background job (BullMQ) generates: preview (e.g. 1024×512 low-q),
device renditions (2048, 4096, 8192 widths when source allows), and
Pannellum multires tiles or cubemap. Tour is publishable only when every
scene's assets are `ready` and licences recorded. Tours bound to
variant + model year + market + interior colour + drive side; "reference
tour for similar trim" requires editor approval and a visible difference note.

### 4.9 Testing
- Unit tests for services/calculators; e2e tests (supertest) against a real
  Postgres DB. Each test run uses its own DB named via env
  `DATABASE_URL=postgresql://evcar:evcar_dev_pw@localhost:5432/evcar_test_<suffix>`
  and applies migrations (`prisma migrate deploy`) before tests. Provide
  `npm run test:e2e` that creates/drops its DB.
- `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` must pass.

## 5. Admin (`admin/`)
React + TypeScript + Vite, React Router, TanStack Query, Mantine UI (RTL
support via `DirectionProvider`), react-i18next with **one namespace file per
feature** (`src/locales/{ar,en}/<feature>.json`) to avoid edit conflicts,
Mantine TipTap rich editor (tables, images, video embeds from an allowlist),
self-hosted Pannellum (`public/vendor/pannellum/`) for the tour editor,
typed API client generated from `backend/openapi.json` with
`openapi-typescript` (+ thin fetch wrapper with auth refresh).
Layout: `src/app/` (providers, router, layout, auth), `src/api/`,
`src/features/<feature>/` (pages, components, hooks), `src/components/`.
Permission-aware navigation; server still enforces. Vitest + Testing Library.
Dev server proxies `/api` to `http://localhost:3000`.

## 6. Mobile (`mobile/`)
Flutter stable (3.47.x / Dart 3.13), Android + iOS projects,
package id `news.evcar.app`. Riverpod (flutter_riverpod, no code generation),
go_router with a `StatefulShellRoute` bottom bar: Home, Cars, Compare,
Charging, Account. **No build_runner codegen** (hand-written models with
fromJson/toJson) so parallel work never conflicts.
- Layout: `lib/app/` (app, router, theme, di), `lib/core/` (api client via
  dio, auth/token storage via flutter_secure_storage, offline cache via
  sqflite, connectivity, errors, formatting of units/money/dates per locale),
  `lib/features/<feature>/{data,domain,presentation}`, `lib/shared/widgets/`
  (AsyncStateView with loading/empty/error/offline/permission-denied states,
  NotAvailableValue, SourceBadge, ReliabilityBadge, etc.).
- Localization: `flutter_localizations` + gen-l10n. Each feature owns
  `lib/l10n/parts/<feature>_{ar,en}.arb`; `dart run tool/merge_arb.dart`
  merges them into `lib/l10n/app_{ar,en}.arb` then `flutter gen-l10n`.
- Theme: light default with electric blue `#0A5CFF` / cyan `#00C2E0` accents
  (overridable from backend branding settings), optional dark mode, Arabic
  font with an OFL licence bundled (e.g. IBM Plex Sans Arabic or Noto Kufi
  Arabic, licence file included), text scaling respected, 48dp touch targets,
  semantics labels, never colour-only signalling.
- Maps: flutter_map + marker clustering with configurable tile provider
  (OSM tiles by default with attribution; URL/attribution from backend
  settings). Directions open external navigation apps via url_launcher.
- 360°: isolated `webview_flutter` view loading bundled
  `assets/panorama/viewer.html` + self-hosted Pannellum; strict JS channel
  message schema; navigation delegate blocks everything except the allowed
  media origin; hotspot text is set via textContent (never HTML); optional
  gyroscope via Pannellum orientation after permission; stop sensors on
  dispose.
- Base API URL via `--dart-define=API_BASE_URL=...` with dev default
  `http://10.0.2.2:3000/api/v1`.
- `flutter analyze` must be clean and `flutter test` must pass.

## 7. Web integration & sharing
Backend `share` module serves lightweight public fallback pages (server
rendered HTML, Arabic/English, OG tags, JSON-LD NewsArticle/Car/Product,
canonical `https://evcar.news/...`) at `/n/:slug`, `/cars/:slug`,
`/compare/:shareId`, plus `/.well-known/assetlinks.json` and
`/.well-known/apple-app-site-association` generated from settings. The
existing evcar.news site is NOT modified; `docs/WEBSITE_INTEGRATION.md`
documents how it can consume the same API.

## 8. Definition of done (per feature)
Schema + migration → service with validation & permissions → REST endpoints
documented in OpenAPI → unit + e2e tests → admin screens (CRUD, workflow,
states) → mobile screens (loading/empty/error/offline states, ar/en) →
tracker row updated in `docs/REQUIREMENTS_TRACKER.md` with honest status:
`done & tested`, `done, untested (why)`, `partial (what's missing)`,
`blocked (what input is needed)`.

## 9. Documentation deliverables (`docs/`)
REQUIREMENTS_AR.md (source), ARCHITECTURE.md (this), decisions/<area>.md (one file per area/agent to avoid conflicts; later consolidated into DECISIONS.md),
REQUIREMENTS_TRACKER.md, API.md (+ openapi.json), ADMIN_GUIDE_AR.md,
PANORAMA_GUIDE_AR.md, EXTERNAL_SERVICES.md, DEPLOYMENT.md, MOBILE_BUILD.md,
WEBSITE_INTEGRATION.md, TEST_REPORT.md, SECURITY.md.
