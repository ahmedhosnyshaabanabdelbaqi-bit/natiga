# Backend platform (backend-platform) — decisions

Area: `backend/src/providers/**`, `backend/src/jobs/**`,
`backend/src/modules/{settings,markets,i18n,health,system}`, `backend/test/platform-*`.
Date: 2026-09-25.

## 1. Versions

No dependency was added and `package.json` was not changed. Everything uses
the versions pinned by the foundation (`docs/decisions/backend-core.md`):
bullmq 6.3.8 + @nestjs/bullmq 12.0.0, @aws-sdk/* 3.1140.0, nodemailer 10.0.10,
google-auth-library 11.1.0, jose 6.2.12, fast-xml-parser 5.11.1, sanitize-html
2.17.7, sharp 0.35.4, luxon 3.7.2, undici 8.11.2, ipaddr.js 2.5.0.

**Dependency request (not done):** `@anthropic-ai/sdk` (latest 0.128.0 on
2026-09-25) for the `ASSISTANT_PROVIDER=anthropic` adapter — the project rule
for Claude integrations is to use the official SDK, not raw HTTP. Until it is
added, that adapter reports "not implemented" (see §9).

## 2. Provider adapters (`src/providers/`, contract §4.6)

Every adapter implements `status()` → `{ type, name, configured, enabled,
reason?, notes?, attribution?, lastSuccessAt?, lastError?, lastErrorAt? }` and
most have a live `check()`. **Unconfigured adapters refuse to work (503
`INTEGRATION_NOT_CONFIGURED`, or `not_configured` outcomes for push) — they
never return fake successes.** Statuses name missing variables, never values
(unit-tested with secret env values).

Injection tokens are **strings** (`src/providers/provider-tokens.ts`) so they
can also be resolved lazily; the auth module resolves `'MAIL_SENDER'` with
`moduleRef.get(..., { strict: false })`. Public imports: `src/providers/index.ts`.

| Token | Interface | Implementations (selection) | Unconfigured behaviour |
|---|---|---|---|
| `STORAGE_PROVIDER` | `StorageProvider` | `LocalStorageProvider` (STORAGE_DRIVER=local), `S3StorageProvider` (s3) | S3 without bucket/keys → 503 |
| `MAIL_SENDER` | `MailSender.send({to,subject,text,html?,tag?/tags?})` → `{driver, messageId, delivered}` | `ConsoleMailSender`, `SmtpMailSender` | console: `delivered:false`; in production console is reported not configured and bodies are never logged |
| `STATION_SOURCES` | `StationSourceRegistry` of `StationSource` | `OcmStationSource` (needs `OCM_API_KEY`), `ManualStationSource` | OCM → 503; manual `fetchPage` → 400 `SOURCE_NOT_SYNCABLE` |
| `AVAILABILITY_PROVIDER` | `AvailabilityProvider` | `NoneAvailabilityProvider` (default) | everything `unknown`; helper `effectiveAvailability()` turns expired/missing observations into `unknown` |
| `ROUTING_PROVIDER` | `RoutingProvider.route({waypoints})` → road route | `OsrmRoutingProvider`, `OpenRouteServiceProvider`, `NoneRoutingProvider` (default) | 503; `/app-config` forces `features.tripPlanner=false` |
| `GEOCODING_PROVIDER` | `GeocodingProvider.search/reverse` | `NominatimGeocodingProvider`, `NoneGeocodingProvider` | 503 |
| `NEWS_FETCHER` | `NewsFetcher.validateFeedUrl/fetchFeed` | `RssNewsFetcher` (RSS 2.0, Atom, RDF) | always available |
| `PUSH_GATEWAY` | `PushGateway.send(targets, message)` | `FcmPushChannel` (HTTP v1), `ApnsPushChannel` (HTTP/2, .p8) + in-app status | `not_configured` outcomes (store deliveries as `skipped`) |
| `OAUTH_CONFIG` | `OAuthConfig` (client ids, issuers, JWKS) | from `GOOGLE_/APPLE_OAUTH_CLIENT_IDS` | `configured:false` |
| `ASSISTANT_PROVIDER` | `AssistantProvider.complete()` | `NoneAssistantProvider` (default), `UnimplementedAssistantProvider` | 503 / 501; `features.assistant` forced off |

### 2.1 Outbound HTTP and SSRF

`OutboundHttp` (`src/providers/http/outbound-http.ts`):
- `fetch()` always uses the foundation's `SafeFetchService` (https only, public
  unicast addresses after DNS resolution, redirects re-validated, size/time
  limits). Used by OCM, ORS, FCM, RSS.
- `fetchOperatorEndpoint(base, url)` is for URLs configured by the operator
  in env (`OSRM_BASE_URL`, `GEOCODING_BASE_URL`): https URLs still go through
  the SSRF-safe fetcher; a plain-http URL (self-hosted OSRM on a private
  network) is allowed **only for the exact configured origin**, never follows
  redirects, same size/time limits. Rationale: env config is trusted, but a
  response must not be able to redirect the server elsewhere.
- Upstream failures → 502 `UPSTREAM_ERROR` with `details {provider, reason}`
  only (no free text: it could leak internal host names).
- API keys go in headers (OCM `X-API-Key`, ORS `Authorization`), never in URLs.

### 2.2 Open Charge Map

Verified against the OCM source code (github.com/openchargemap/ocm-system;
openchargemap.org itself is blocked from this environment):
- Paging: `sortby=id_asc&greaterthanid=<cursor>&maxresults=N`; cursor = highest
  OCM id of the previous page. `modifiedsince`, `countrycode`, `boundingbox`
  supported. `compact=false&verbose=false&includecomments=false` (no user
  comments / identities are imported).
- **Licensing:** user contributions are CC BY 4.0; records from third-party
  data providers keep that provider's licence; the terms require the data
  provider attribution **including licence** to be visible to end users.
  Default `openDataOnly=true` sends `opendata=true` *and* re-checks
  `DataProvider.IsOpenDataLicensed` per record (others → `skipped`
  `licence_not_open_data`). Every record carries `licence {providerName,
  providerUrl, licence, isOpenData, attribution}`.
- Status mapping is **operational status only**: OCM "Currently Available /
  In Use" (10/20) map to `operational`, never to live availability.
  200/210 → `permanently_closed` + `removedAtSource`.
- Connector types are mapped through `connector_types.aliases` (DB, cached
  5 min; fallback to the seed aliases). Unknown types → `connectorTypeCode:
  null` + warning (no guessing). Missing power stays `null` (never 0).
- OCM has no EVSE grouping, no structured opening hours and no time zone:
  records expose `connectors[]` + `numberOfPoints`, `openingHours: null`,
  `timezone: null` — the stations importer must derive the time zone from the
  market and must not assume one car per connector. `UsageCost` is free text
  (`usageCostText`) and must never be parsed into tariffs.
- Unit tests use a hand-written **synthetic** fixture
  (`src/providers/stations/ocm/__fixtures__/ocm-poi.synthetic.json`, every
  record says so in `_comment`).

### 2.3 Routing / geocoding licensing

- `ROUTING_PROVIDER=google` is **deliberately not enabled**: Google Maps
  Platform terms allow Routes results only on a Google map, while the apps use
  OSM-based tiles. The admin sees this reason in the integrations list.
- OSRM: attribution "© OpenStreetMap contributors (ODbL)"; a warning is shown
  when the public demo server is configured.
- Nominatim: User-Agent `OUTBOUND_USER_AGENT`, `email=GEOCODING_EMAIL`,
  1 request/second per process (queue of 20, then 429) and a 24 h cache, per
  the Nominatim usage policy; warns about "no autocomplete" on the public
  instance. Multi-instance deployments should self-host or share a limiter.

### 2.4 Storage

Key rules (`storage-keys.ts`): relative, `[A-Za-z0-9._\-=+@/]`, no `.`/`..`/empty
segments, first segment `public/` | `private/` | `tmp/`. `safeFileName()`
slugifies user names.
- local: files under `STORAGE_LOCAL_ROOT/<key>`; metadata in `.meta/`
  (never served); atomic writes (temp + rename); symlink escapes refused.
  `public/...` is served by the foundation at `/media/...`, so
  `publicUrl('public/x')` = `STORAGE_PUBLIC_BASE_URL || APP_PUBLIC_BASE_URL + '/media'` + `/x`.
  Signed URLs for private keys: `GET|PUT /api/v1/storage/local/<key>?exp&sig[&ct|&dn]`,
  HMAC-SHA256 with a key derived by HKDF from `JWT_ACCESS_SECRET` (ephemeral in
  dev/test → URLs die on restart; fine for short-lived URLs).
- s3: public objects need a bucket policy allowing anonymous GET on `public/`
  only (compose's `minio-init` does this) or a CDN in `STORAGE_PUBLIC_BASE_URL`
  (which then maps to the **bucket root**; for local it maps to `root/public`).
  Presigned GET/PUT, multipart (`create/uploadPart/complete/abort`), streaming
  `put()` via `@aws-sdk/lib-storage`.
- `check()` (health): local write/read/delete probe under `tmp/health/`; S3
  `HeadBucket`.

### 2.5 Push

FCM HTTP v1 with a service account (`FCM_SERVICE_ACCOUNT_JSON` inline / base64 /
file path; OAuth scope `firebase.messaging`), one request per token, 8 in
parallel. APNs over HTTP/2 with an ES256 provider token (refreshed every
50 min). Outcomes: `sent | invalid_token | failed (retryable?) | not_configured`.
`check()` only obtains a token / signs the JWT (sends nothing).

## 3. Jobs (`src/jobs/`)

- All queues in `QUEUES` are registered globally (`media-processing`,
  `imports`, `notifications`, `sync`, plus `rss-import`, `stations-sync`,
  `search-index`, `content-scheduler`, `maintenance` kept from the
  foundation). Owners may still `registerQueue` locally.
- BullMQ connection built from `REDIS_URL` (`redisOptionsFromUrl`),
  `BULLMQ_PREFIX`, capped reconnect backoff (≤ 15 s) and one warning.
- `JobsService.enqueue(queue, name, data, opts)` checks Redis first (shared
  client, 1.5 s) and bounds the call (3 s) → **503 `JOBS_UNAVAILABLE`** with
  `Retry-After: 30` instead of hanging. Pass a deterministic `jobId` for
  idempotency (a second add with the same id is ignored by BullMQ). Every queue
  has an `error` listener (throttled log) so a Redis outage cannot crash the
  process. Verified by an e2e test with an app pointed at a dead Redis port.
- Job API never returns job `data` values (may contain personal data), only
  the top-level keys and the last stack trace (8 lines).

## 4. Import jobs helper (`ImportJobsService`, global)

`create({type, idempotencyKey?})` (advisory lock + JSON-path lookup: an open
job with the same type/key is returned), `start`, `setTotal`, `recordRow` /
`recordRows` (upsert by `(job,rowNumber)`), `logRowError`,
`handledRowNumbers` (resume after retry), `refreshCounters` (counters are
recomputed from rows → never double-counted), `complete` (dry run → `ready`,
errors → `completed_with_errors`), `fail` (secret-masked message), `cancel` /
`isCancelled`. BullMQ job ids can reuse the import job id.

## 5. Settings & `/app-config`

Typed keys (`settings.types.ts`): `branding`, `defaults`, `home.sections`,
`features`, `map`, `share`, `legal`, `app_links` (private). Defaults = the
foundation seed values. Validation per key (class-validator DTOs + rules:
unique section keys/orders, known flags, tile `{z}{x}{y}` + mandatory
attribution, share path placeholders, SHA-256 fingerprints, https required in
production). Invalid stored JSON falls back to the default and is flagged in
the admin list. Writes are audited with before/after (`AuditService.annotate`)
and invalidate caches (`platform.config.changed` event + `MarketResolverService`).

`GET /api/v1/app-config` (public) returns exactly the §4.4.1 shape; markets =
enabled markets only (`enabled` is therefore always true); cached 30 s per
instance (serves stale on DB errors if a copy exists), strong ETag, `304` on
`If-None-Match`, `Cache-Control: public, max-age=60, stale-while-revalidate=600`.
**Effective features:** `tripPlanner` is false unless a routing provider is
configured and `assistant` false unless an LLM is configured, whatever the
stored flag (admin sees a warning).

Logo upload: `POST /admin/settings/branding/logo` (multipart `file`, ≤ 1 MB):
decoded by sharp (PNG/JPEG/WebP only — SVG refused, ≥ 64 px), re-encoded to a
metadata-free PNG (≤ 1024 px), stored at `public/branding/logo-<hash>.png`
(immutable cache), previous uploaded logo deleted.

## 6. Markets

Public `GET /markets` (localized names, currency with localized symbol,
`isDefault`, ETag). Admin CRUD for markets and currencies: code formats
(market `^[A-Z]{2,8}$`, ISO-4217 `^[A-Z]{3}$`), IANA time zone (luxon), the
currency must exist, **new markets start disabled**, the default market cannot
be disabled/deleted (409 `MARKET_IS_DEFAULT`), and a market/currency
referenced by **any** relation cannot be deleted (409 `*_IN_USE` with counts) —
several relations are `SetNull`/`Cascade`, so deletion would silently change
data. Language stays independent of market (`defaultLanguage` is a hint).

## 7. i18n

- Catalogs `src/modules/i18n/catalogs/{ar,en}.ts`: `errors.*` (all generic
  codes, identical to the filter defaults — unit-tested — plus platform codes),
  `notifications.*` (title/body templates with `{placeholders}`), `labels.*`.
  Same keys and placeholders in both languages (unit-tested).
- Overrides live in `translations` (namespace/key/locale). Server namespaces
  (`errors`, `notifications`, `labels`) must name an existing entry and keep
  its placeholders exactly (422 otherwise). Other namespaces are free UI
  strings for admin/mobile, served publicly by `GET /api/v1/translations`.
- `I18nService`: `t()`, `text()`, `error(code, status, params, details)`,
  `notification(template, lang, params)`; overrides cached in memory,
  refreshed every 60 s and after each admin change on this instance.
- `serverMessage()` / `resolveErrorMessage(code, lang)`
  (`src/modules/i18n/server-messages.ts`) work without DI (providers use them).

## 8. Health

`GET /api/v1/health` = database + Redis + **storage**; storage or Redis down →
`degraded` (200), database down → `error` (503). `/health/live` unchanged.

## 9. Not done / not verified

- Live calls to Open Charge Map, OpenRouteService, OSRM, Nominatim, FCM, APNs,
  SMTP and S3/MinIO were **not** exercised (no keys, no MinIO, blocked hosts).
  They are covered by unit tests with mocked transports, synthetic fixtures,
  local HTTP servers and offline S3 presigning; SMTP delivery itself is untested.
- Assistant adapters (`anthropic`, `openai_compatible`) are not implemented
  (reported as such, 501). Needs `@anthropic-ai/sdk` (see §1).
- Google Routes intentionally disabled (licence, §2.3).
- A stations **CSV** source is not part of the adapters: CSV import belongs to
  the stations/imports module (use `ImportJobsService`).
- Provider `lastSuccessAt/lastError` are per API instance (memory). Persisting
  them in `integration_settings` would need a small follow-up (no schema change).
- Public caches (`/app-config`, `/markets`, `/translations`) are per instance
  with ≤ 60 s TTL; other instances converge within that window.

## 10. Requests to other areas

Status after the integration pass (`docs/decisions/integration.md`): requests
1–3 are done — the exception filter now resolves `errors.<CODE>` overrides,
`?lang`/`?market` are accepted on every query DTO by the global validation
pipe (`LocaleQueryDto` still works where declared), and the e2e teardown
removes `storage/test/<runId>/`. Items 4–9 are for later feature teams.


1. **Foundation — exception filter** (`src/common/filters/all-exceptions.filter.ts`,
   not my area): to apply admin overrides to errors thrown *without* an explicit
   message, use the catalog before the defaults in `writeErrorResponse`:
   ```ts
   import { resolveErrorMessage } from '../../modules/i18n/server-messages';
   const message =
     pickLocalized(normalized.message, lang) ??
     resolveErrorMessage(normalized.code, lang) ??
     pickLocalized(DEFAULT_ERROR_MESSAGES[...], lang) ?? ...
   ```
   Errors raised through `I18nService.error()` / `serverMessage()` already carry
   overridable texts (verified by e2e).
2. **Foundation — `PaginationQueryDto`**: `?lang=`/`?market=` are valid on every
   route (contract §4.3), but query DTOs reject them with 422 because of
   `forbidNonWhitelisted`. I added `LocaleQueryDto`
   (`src/modules/i18n/locale-query.dto.ts`) to all my query DTOs; adding
   optional `lang`/`market` to `PaginationQueryDto` would fix it for every module.
3. **Foundation — e2e harness**: `storage/test/<runId>/` directories are not
   removed by the global teardown.
4. Stations team: use `STATION_SOURCES` (`get('ocm').fetchPage`), upsert
   `provider_records` with `externalId` / `payloadHash`, show `licence.attribution`
   per station, derive the time zone from the market, flag rows with
   `connectorTypeCode:null`, never map `usageCostText` to tariffs, use
   `ImportJobsService` for sync runs and `QUEUES.SYNC` / `STATIONS_SYNC`.
5. RSS team: `NEWS_FETCHER.validateFeedUrl()` when saving a feed,
   `fetchFeed(url, {etag, lastModified})` (handles 304); only excerpts are returned.
6. Notifications team: `PUSH_GATEWAY.send()` outcomes → delivery statuses
   (`not_configured` → `skipped`, `invalid_token` → revoke the device token);
   texts via `I18nService.notification(template, locale, params)`.
7. Media/tours team: `STORAGE_PROVIDER` keys under `public/`, `private/`,
   `tmp/`; multipart API; `QUEUES.MEDIA_PROCESSING` via `JobsService.enqueue`.
8. Share team: `SettingsService.get('app_links')` / `get('share')` for
   assetlinks.json / AASA and canonical URLs.
9. Trips team: `ROUTING_PROVIDER.route()` (503 while unconfigured).
