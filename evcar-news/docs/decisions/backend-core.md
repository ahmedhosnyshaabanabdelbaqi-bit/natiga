# Backend foundation (backend-core) — decisions

Area: `backend/` foundation, `docker-compose.yml`, `.env.example`.
Scope: everything shared by the backend modules. Feature modules live in
`backend/src/modules/<name>/` and are registered already (skeletons).

## 1. Versions (checked on npm, 2026-09-25) and why

| Package | Pinned | Notes |
|---|---|---|
| Node.js | 22 LTS (22.22 local, `node:22.23.3-bookworm-slim` image) | Node 22 `require(esm)` is needed by NestJS 12 (see below). |
| @nestjs/* | 12.1.0 (cli 12.0.6, swagger 12.0.2, bullmq 12.0.0, schedule 12.0.2, jwt 12.0.2, passport 12.0.0, event-emitter 12.0.1), throttler 6.7.1 | Latest stable major. **Nest 12 ships ESM only**; the app stays a CommonJS project (Nest's own `ts` template does the same) and loads Nest through Node 22's native `require(esm)`. |
| typescript | 6.0.3 | TS **7.0.2 is `latest` but not used**: it is the native (Go) compiler without the JS API that `ts-jest` (`<7`), `typescript-eslint` (`<6.1`) and `@nestjs/cli` (`~6.0`) need. |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.0 | `prisma@latest` currently points to `8.0.0-rc.17` (a release candidate) while `@prisma/client@latest` is 7.10.0 → we pin the stable 7.10.0 pair. Prisma 7 = `prisma-client` generator (TS output in `src/generated/prisma`, CJS), driver adapter `pg`, `prisma.config.ts`. |
| jest / ts-jest | 30.5.2 / 29.4.13 | See §4 for the two Jest adaptations. |
| eslint / typescript-eslint | 10.11.0 / 8.70.1 | Flat config, type-aware rules, prettier plugin. (Nest 12's template uses oxlint; the contract asks for ESLint.) |
| bullmq / ioredis | 6.3.8 / 6.0.0 | |
| others | argon2 0.45.1, sharp 0.35.4, sanitize-html 2.17.7, fast-xml-parser 5.11.1, @aws-sdk/* 3.1140.0, nodemailer 10.0.10, pino 10.3.1 + nestjs-pino 5.2.0, undici 8.11.2, jose 6.2.12, google-auth-library 11.1.0, file-type 22.1.1, uuid 14.0.2, csv-parse 7.0.2, csv-stringify 6.8.3, luxon 3.7.2, ipaddr.js 2.5.0, helmet 8.3.0 | All pinned exactly; `package-lock.json` is committed. |

Deliberate choices:
- **No `@nestjs/config`**: a typed `AppConfig` class (validated per environment from a declarative schema) replaces it — one source of truth for `.env.example`, validation and typing.
- **`fast-xml-parser` instead of `rss-parser`**: rss-parser performs its own HTTP requests; feeds must be fetched through the SSRF-safe fetcher, then parsed.
- **Custom Redis throttler storage** instead of `@nest-lab/throttler-storage-redis` (its peer range stops at Nest 11).
- **npm `overrides`**: `deepmerge-ts@8.0.2`, `mysql2@3.24.4` fix 4 high advisories in transitive deps of the Prisma CLI (dev tooling). `npm audit` reports 0 vulnerabilities.
- `@nestjs/passport` + `passport-jwt` are installed so the auth team may choose them; a custom guard with `@nestjs/jwt` works as well.
- MinIO no longer publishes images on Docker Hub and quay.io was not reachable from this environment, so the compose file uses `${MINIO_IMAGE:-quay.io/minio/minio:latest}` — **pin a verified tag before relying on it**.

## 2. Request pipeline (all in `src/bootstrap/configure-app.ts` + `AppModule`)

1. `requestIdMiddleware` (express, before body parsing): reuses a sane `X-Request-Id` or generates a UUID; echoed in the response.
2. Helmet (strict CSP for the API, relaxed only for `/api/docs`; HSTS in production), cookie-parser, compression.
3. Body parsers registered by us (apps must be created with `NEST_APP_OPTIONS = { bodyParser: false }`): JSON 5 MB, urlencoded 1 MB, raw `application/octet-stream` / `application/offset+octet-stream` up to `UPLOAD_CHUNK_MAX_BYTES` (resumable upload chunks). Parse errors → envelope (`INVALID_JSON` 400, `PAYLOAD_TOO_LARGE` 413).
4. CORS allowlist (`CORS_ORIGINS`, credentials on, exposes `X-Request-Id`, `ETag`, rate-limit headers…).
5. Global prefix `/api/v1`, except the share routes in `src/modules/share/share.routes.ts` (`/n/:slug`, `/cars/:slug`, `/compare/:shareId`, `/.well-known/...`).
6. `RequestContextMiddleware` (Nest, all routes): resolves **language** (`?lang` → `Accept-Language` → `DEFAULT_LANGUAGE`, default `ar`) and **market** (`?market` → `X-Market` → `app_settings.defaults.defaultMarket` → `DEFAULT_MARKET`; only enabled markets, unknown → default), sets `req.locale`, `Content-Language`, `X-Market`, `Vary`, and runs the request inside `RequestContext` (AsyncLocalStorage: requestId, ip, userAgent, lang, market, userId).
7. Global guard `AppThrottlerGuard` (default budget per IP per minute + presets), global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform; **422 `VALIDATION_FAILED`**, `details: [{ field: "a.b", constraints: { rule: message } }]`), global `AllExceptionsFilter`.
8. Error envelope everywhere: `{ "error": { "code", "message" (localized ar/en), "details"?, "requestId" } }`. Prisma `P2002`→409 `CONFLICT`, `P2025`→404, `P2003`→409; unknown errors → 500 `INTERNAL_ERROR` without internals (logged with stack).
9. Local media: when `STORAGE_DRIVER=local` and `STORAGE_PUBLIC_BASE_URL` is empty, files under `${STORAGE_LOCAL_ROOT}/public` are served at `/media/*` (the storage adapter must write public objects there and keep private/temp files elsewhere).
10. Graceful shutdown: `enableShutdownHooks()` (Prisma, Redis, fetcher, BullMQ close), forced exit after 25 s.

Logging: pino via nestjs-pino, JSON in prod, pretty in dev; redacts `authorization`, cookies, `set-cookie`, and `password|token|refreshToken|accessToken|idToken|secret|apiKey…` at up to 3 levels; sensitive query params (`token`, `key`, `signature`, `code`…) are masked in logged URLs; request bodies are never logged.

## 3. Database schema (Prisma multi-file schema `backend/prisma/schema/*.prisma`)

99 tables, snake_case via `@@map/@map`, UUID v7 ids (`@default(uuid(7))`), `timestamptz(3)`, soft delete (`deleted_at`) on content/catalog tables, `is_demo` on every table that could hold sample data. Files: `identity`, `settings`, `vehicles`, `content`, `media`, `stations`, `community`, `personal`, `notifications`, `directory`, `system`.

Key modelling decisions:
- **Vehicle hierarchy** `brands → car_models → generations → model_years → vehicle_variants`. The **powertrain (`BEV|PHEV|EREV|HEV`) is a required column of the variant**, and `(model_year_id, powertrain_type, name_en)` is unique: a BEV and a same-named hybrid are always separate variants and never share specs. `variant_markets` = availability + local names + drive side per market (a variant is not assumed to exist in every market).
- **Specs**: `spec_definitions` (key, canonical unit, `better_direction` higher/lower/none, labels ar/en, key-spec flag) + `vehicle_specifications` (one row per variant × key × market scope — `market_code` NULL = all markets, added in review 2; `value_num|value_text|value_bool` matching the definition's type, canonical `unit` enforced by trigger, `original_value/original_unit`, `source_id`, `verified_at`, `reliability`). A row must hold a value (CHECK) — missing = no row / NULL, never 0. 47 spec keys are seeded (review 2 moved ports to `variant_market_inlets` and consumption to `consumption_measurements`; see `review-fixes-2.md` §3).
- **Provenance**: `specification_sources` is referenced by specs, ranges, curves, charging times, prices, variant markets, tariffs and energy prices.
- **Range** (`range_measurements`): always `cycle` (WLTP/EPA/CLTC/NEDC/OTHER + note) and `range_type` (electric/total); never converted between cycles.
- **Charging**: `charging_curves` + `charging_curve_points` (SoC 0–100 CHECK); `charging_time_measurements` with `from_soc < to_soc`, charger power condition, peak vs average power (average ≤ peak CHECK).
- **Prices**: `price_history` per variant × market with `price_type`, currency, effective dates, source. `exchange_rates` exist only for labelled estimates (`convertMoneyEstimate()` → "تقديري بعد التحويل").
- **Stations**: `charging_stations` (lat/lng + `location geography(Point,4326)` maintained by trigger, GIST index; timezone, opening hours JSON, access, payment/start methods, operational vs publication status, data source/licence/attribution) → `charging_points` (EVSE = one car at a time) → `connectors` (→ `connector_types` reference, AC/DC, power). `tariffs` + `tariff_elements` store each price with its unit (kWh / minute / hour / session; energy, time, flat, parking, idle; tax info; CHECK that the unit fits the component). `provider_records` unique `(provider, external_id)` (sub-entities use prefixed ids, e.g. `conn:123`). `availability_observations` have `expires_at > observed_at`; consumers must treat expired rows as `unknown`. Reports/check-ins are separate, dated community data.
- **Media & 360°**: `media_assets` (original kept, sniffed MIME, dimensions, checksum, projection, processing status/progress, licence, version chain), `asset_licenses`, `asset_variants` (previews, renditions, tiles, cubemap faces), `upload_sessions` (resumable offsets, CHECK received ≤ total). `interior_tours` are bound to **variant (→ model year) + market + drive side + interior colour**; `match_type=reference_similar_trim` requires a different reference variant and ar/en difference notes, and publishing it requires approval (CHECKs); at most one published tour per variant/market/drive side/colour (partial unique index). `tour_scenes` (one image per seat position, view limits CHECKed) → `scene_hotspots` (+ plain-text translations; type-consistency CHECKs). Exterior spins are an independent extension.
- **Content workflow** `draft → in_review → scheduled → published → archived` (`content_status`); articles have translations, markets, revisions (full snapshots), tags, vehicle links (exactly one target, CHECK), RSS origin; `event_date` is separate from `published_at`; sponsored content requires a sponsor name (CHECK). RSS items are de-duplicated by guid hash per feed and URL hash globally; the default feed usage policy is `headline_link_only`.
- **Community / personal / notifications / directory / ads / system** tables as in the contract; deleting a user cascades personal data and anonymizes public contributions (`user_id` → NULL). Encyclopedia entries can only be published after technical review (CHECK). Ad surfaces exclude map and panorama views by design.
- **Search**: `search_documents` (one row per entity × locale, maintained by owning modules) with `normalized_title`, `normalized_text` and a weighted `search_vector` computed by trigger using `app_normalize_text()`; trigram GIN on `normalized_title`, GIN on the tsvector. `search_aliases` (34 seeded spellings such as "بي واي دي" ↔ BYD). `app_normalize_text()` and `normalizeSearchText()` (TS) implement the same Arabic normalization (tested for equality).

Raw SQL in the initial migration (appended after the generated DDL): the normalization function, 4 triggers, 105 CHECK constraints, 4 partial unique indexes. **Prisma ignores functions, triggers, CHECKs and partial indexes when diffing**, so they survive future migrations. Verified: after `migrate deploy`, `prisma migrate diff` against the schema is empty.

Rules for everyone changing the schema:
- Edit only the relevant `prisma/schema/<domain>.prisma` file, then `npm run prisma:migrate -- --create-only --name <change>` (review the SQL) and `npm run prisma:check-drift` (must print "in sync").
- Never use `GENERATED` columns or `NULLS NOT DISTINCT` indexes (Prisma would try to alter/drop them) — use triggers and partial unique indexes instead.
- Geography columns are `Unsupported("geography(Point,4326)")`; query them with the helpers in `src/prisma/geo.ts` / `PrismaService.findNearby()` (parameterized, identifier allowlist).

## 4. Tests

- `npm test`: unit tests (`src/**/*.spec.ts`).
- `npm run test:e2e`: self-contained. Global setup creates `evcar_test_<runId>_tpl`, runs `prisma migrate deploy` + the reference seed, and forbids connections to it; each `createTestApp()` clones it (`CREATE DATABASE … TEMPLATE`, fast) and drops the clone on `close()`; teardown drops all `evcar_test_<runId>_*` databases and the run's Redis keys. Workers run in parallel with isolated DBs and Redis prefixes. Admin connection: `E2E_DATABASE_ADMIN_URL` (default `postgresql://evcar:evcar_dev_pw@localhost:5432/postgres`).
- Jest adaptations (Node 22): (1) `test/jest/esm-to-cjs.transformer.cjs` converts ESM-only packages (Nest 12, file-type, uuid…) to CommonJS with the TypeScript compiler and rewrites `import.meta` — Jest supports `require(esm)` only on Node ≥ 24.9; (2) tests compile with `tsconfig.jest.json` (`module: commonjs`) so the dynamic `import()` the Prisma 7 client uses to load its query compiler becomes `require()`. `src/common/dependencies.spec.ts` guards that every major dependency still loads under Jest.

## 5. Seeds and CLIs

- `npm run db:seed` (idempotent, also run by the Docker entrypoint): currencies EGP/SAR/AED (+USD/EUR/CNY as source currencies), markets EG (default) / SA / AE with time zones, 8 connector types (Type 1, Type 2, CCS1, CCS2, CHAdeMO, NACS, GB/T AC, GB/T DC; AC/DC flags; typical power is informational and nullable), 69 permissions + 8 roles matrix (`src/cli/seed-data/rbac.ts`), default `app_settings` (branding "EV Car News", #0A5CFF/#00C2E0, home sections, feature flags — all off until their module ships, share `https://evcar.news`, legal URLs null, map tiles, app links), 47 spec definitions, 34 search aliases. Code-owned reference tables (connector types, permissions, spec definitions) are upserted; admin-managed rows (currencies, markets, settings, aliases) are only created when missing; role permission sets only receive permissions that are NEW in code (`seeded_role_permissions`, audited) — an owner's removal is never undone (review 2).
- `npm run db:seed:demo`: fictional "Demo Motors" BEV + PHEV variants, a "[DEMO]" article and a "[DEMO]" station without an address — all `is_demo = true`; refuses `NODE_ENV=production`.
- `npm run create-owner -- --email x [--name y]`: creates/reuses the user, grants `owner` (+`user`), re-activates a suspended account (recovery path), stores a SHA-256-hashed `setup_password` token (24 h), writes an `auth.owner_setup_issued` audit row (actor `cli:create-owner`) and prints `${ADMIN_BASE_URL}/setup-password?token=…` (the admin's set-password page; `/reset-password` works too). No password anywhere. (Updated by the integration pass.)
- `npm run openapi:export`: writes `backend/openapi.json` with **no database/Redis** (Nest preview mode).
- `npm run prisma:check-drift`: migrations vs schema consistency check (exit 2 on drift).
