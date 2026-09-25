# Backend charging stations (backend-stations) — decisions

Area: `backend/src/modules/stations/**`, tests `backend/test/stations-*.e2e-spec.ts`
and unit specs next to the code. Date: 2026-09-25. Requirements: REQUIREMENTS
§10 (stations), §11 (live status + compatibility), §18, §19, §22; contract
ARCHITECTURE §3 ("station status is three separate things"), §4.3, §4.6.

> STATUS: implemented and tested (see §7). The API contract (§1–§3) is what
> the code serves; the mobile app should follow it exactly.

## 1. Public API (guests allowed unless noted) — used by the app

All under `/api/v1`, `?lang=ar|en` (or `Accept-Language`), `?market=EG` (or
`X-Market`). Envelopes `{data}` / `{data, meta}`. Missing values are `null`
(show "غير متوفر / Not available"), never 0. Numbers in canonical units (kW,
metres, minutes). Money = `{ amount: "5.0000", currency: "EGP" }`. Dates ISO
UTC. Only stations with `publicationStatus=published`, not deleted and not
merged into another station are public. Demo stations carry `isDemo: true`
and a `[DEMO]`/"(Demo)" name — show a visible demo badge.

### 1.1 `GET /stations` — map + list search (same call for both views)

Query (all optional except the geo part):

| param | meaning |
|---|---|
| `bbox` | `minLng,minLat,maxLng,maxLat` (map viewport). No antimeridian crossing. |
| `lat`, `lng` | point (user location or a manually chosen place). Alone = radius search; with `bbox` = only used for distance/sort. |
| `radiusKm` | radius around `lat,lng` when no `bbox` (default 25, max 300) |
| `q` | text (Arabic-normalized: أ/إ/آ→ا, ى→ي, ة→ه…) on name/address/city |
| `connectorTypes` | comma list of connector type codes (`type2,ccs2,…`; see `/stations/meta`) |
| `current` | `AC` or `DC` |
| `minPowerKw` | connectors with a KNOWN max power ≥ value (unknown power never matches) |
| `operatorId` | comma list of operator ids |
| `openNow` | `true` → only stations whose opening hours say open now (unknown hours are excluded) |
| `access` | comma list of `public, customers_only, restricted, private, unknown` (the app's "public only" = `access=public`) |
| `amenities` | comma list; station must have all (`restroom, cafe, …`) |
| `vehicleVariantId` | compatible with this catalog trim in the request market (§3) |
| `userVehicleId` | compatible with this car of the signed-in user's garage (needs `Authorization`; its own market is used) |
| `compatibleOnly` | default `true` when a vehicle is given; `false` = only annotate |
| `includeClosed` | default `false` = hides `planned` and `permanently_closed` |
| `sort` | `distance` (default; needs `lat,lng` or uses the bbox centre) or `name` |
| `limit`, `cursor` | page size (default 100, max 500) + opaque cursor from `meta.nextCursor` |

A connector filter (`connectorTypes`, `current`, `minPowerKw`, vehicle) must be
met by ONE connector (not type from one plug and power from another).

Response `{ data: StationListItem[], meta }`:
```ts
StationListItem = {
  id, slug|null, name, operatorName|null, latitude, longitude,
  distanceM: number|null,            // from lat,lng (or bbox centre)
  city|null, countryCode, accessType,
  operationalStatus: 'operational'|'planned'|'temporarily_unavailable'|'permanently_closed'|'unknown',
  openNow: 'open'|'closed'|'unknown', // from opening hours + station time zone
  isAlwaysOpen: boolean|null,
  maxPowerKw: number|null, currentTypes: ('AC'|'DC')[], connectorTypes: string[],
  connectorCount: number,            // Σ quantity — NOT "cars at once"
  pointCount: number|null,           // modelled charge points, else the source's published count, else null
  availability: { status: 'available'|'occupied'|'out_of_order'|'unknown',
                  availableConnectors: number|null, liveConnectors: number },
  compatibility: { compatibleConnectors: number, maxUsablePowerKw: number|null } | null,
  isDemo, dataSource: 'manual'|'ocm'|'csv'|'partner'|'user_suggestion'
}
meta = { nextCursor: string|null, pageSize, total, truncated: boolean /* > 2000 matches: zoom in */,
         center: {lat,lng}|null, compatibility: VehicleCompatibility|null,
         liveAvailability: { configured: boolean, provider: string|null } }
```
`availability.status` of a station = `available` when ≥1 connector has a
non-expired live `available` observation; `occupied` / `out_of_order` only
when EVERY connector has a live status and none is available; otherwise
`unknown`. With no live provider (the default) everything is `unknown`.
`availableConnectors` is `null` when no connector has live data (never 0).

### 1.2 `GET /stations/clusters` — low-zoom map aggregation
Same filters as 1.1 except `openNow`/`sort`/`cursor` (+ `zoom` 0..22, required
with `bbox`). `{ data: [{ latitude, longitude, count, stationId|null }], meta: { cellSizeDeg, total } }`
(`stationId` set when `count = 1`). Use it when `meta.truncated` or zoom < 9.

### 1.3 `GET /stations/meta` — filter UI reference data
```ts
{ connectorTypes: [{ code, name, nameAr, nameEn, supportsAc, supportsDc, iconKey|null, standard|null }],
  amenities|paymentMethods|startMethods|accessTypes|operationalStatuses|checkinOutcomes: [{ code, label }],
  reportTypes: [{ code, label, help|null, requiresDetails }],   // from report_reasons (scope station)
  liveAvailability: { configured, provider|null }, notAvailableLabel }
```

### 1.4 `GET /stations/:idOrSlug` — detail
Optional `lat,lng` (distance), `vehicleVariantId` / `userVehicleId` (per-connector compatibility).
```ts
StationDetail = {
  id, slug|null, name, nameAr|null, nameEn|null, isDemo,
  operator: { id, name, websiteUrl|null, phone|null, email|null } | null,
  latitude, longitude, distanceM|null,
  address: { line|null, city|null, region|null, postalCode|null, countryCode, marketCode|null },
  accessEntranceNote|null, accessType, accessTypeLabel, accessRestrictions|null,
  hours: { timezone, isAlwaysOpen: boolean|null, openingHoursText|null,
           weekly: [{ day:'mon'..'sun', windows: [{start:'08:00', end:'22:00'}] | null /* null = unknown, [] = closed */ }] | null,
           openNow: { state:'open'|'closed'|'unknown', reason:'always_open'|'schedule'|'unknown_schedule'|'unknown_day',
                      closesAt: iso|null, opensAt: iso|null, localTime: 'HH:mm', evaluatedAt: iso } },
  contact: { phone|null, email|null, websiteUrl|null },
  photos: Image[],                     // same Image shape as the vehicles API (credit = licence attribution)
  amenities|paymentMethods|startMethods: [{ code, label }],
  operationalStatus, operationalStatusLabel,
  points: [{ id, label|null, evseId|null, floorLevel|null, parkingRestrictions|null, operationalStatus, connectors: Connector[] }],
  unassignedConnectors: Connector[],   // source does not group plugs into charge points (e.g. Open Charge Map)
  pointCount|null, connectorCount,
  tariffs: Tariff[], usageCostText|null /* free text as published by the source, never parsed */,
  availability: StationAvailability,
  source: { dataSource, license|null, attribution|null, lastVerifiedAt|null, sourceUpdatedAt|null, lastUpdated,
            providers: [{ provider, displayName, sourceUrl|null, license|null, licenseUrl|null, attribution|null, lastSyncedAt|null }] },
  community: Community,
  compatibility: VehicleCompatibility|null,
  updatedAt }
Connector = { id, chargingPointId|null, connectorType: { code, name }, currentType:'AC'|'DC',
  maxPowerKw|null, maxVoltage|null, maxAmperage|null, phases|null, format:'socket'|'cable'|null,
  quantity, operationalStatus, availability: ConnectorAvailability,
  compatibility: { compatible: boolean, maxUsablePowerKw: number|null } | null }
ConnectorAvailability = { status:'available'|'occupied'|'out_of_order'|'unknown',
  providerStatus: 'available'|'charging'|'reserved'|'blocked'|'out_of_order'|'inoperative'|'unknown'|null,
  freshness: 'live'|'expired'|'none', source|null, observedAt|null, expiresAt|null }
StationAvailability = { liveProviderConfigured, provider|null, isLive: boolean /* ≥1 non-expired observation */,
  status: 'available'|'occupied'|'out_of_order'|'unknown' /* same rule as the list */,
  counts: { available, occupied, outOfOrder, unknown }, lastObservedAt|null, disclaimer }
Tariff = { id, name|null, chargingPointId|null, connectorId|null, currency, validFrom|null, validTo|null,
  isCurrent: boolean, taxIncluded: boolean|null, taxPercent: number|null, notes|null,
  reliability, verifiedAt|null, source: { id, title, publisher|null, url|null }|null, isDemo,
  elements: [{ componentType:'energy'|'time'|'flat'|'parking_time'|'idle', componentLabel,
               price: Money, priceUnit:'per_kwh'|'per_minute'|'per_hour'|'per_session', unitLabel,
               stepSize|null, graceMinutes|null, minPowerKw|null, maxPowerKw|null, currentType|null,
               startTime|null, endTime|null, daysOfWeek: number[] }] }
Community = { isLive: false, disclaimer,              // dated community data, never live evidence
  checkins: { total, last30Days, lastAt|null, successRate30d: number|null /* 0..1, ≥3 check-ins */,
              recent: [{ id, outcome, outcomeLabel, connectorType: {code,name}|null, currentType|null,
                         observedPowerKw|null, waitMinutes|null, comment|null,
                         vehicle: { id, slug, name }|null, createdAt }] },
  reports: { openCount, recent: [{ id, type, typeLabel, status, createdAt }] } }   // last 90 days, no text/user
```

### 1.5 `GET /stations/:id/availability` — live status refresh (`Cache-Control: max-age=15`)
`{ data: { stationId, availability: StationAvailability, connectors: [{ connectorId, ...ConnectorAvailability }] } }`

### 1.6 Community writes (auth required: `Authorization: Bearer`)
| call | body | notes |
|---|---|---|
| `POST /stations/:id/reports` | `{ type:'not_working'|'wrong_location'|'different_connector'|'price_changed'|'access_restricted'|'other', connectorId?, description? (≤2000; required for types whose reason has requiresDetails, e.g. other), suggestedData? {latitude?, longitude?, connectorTypeCode?, currentType?, maxPowerKw?, priceText?} }` | 201 `{data: MyReport}`; 409 `STATION_REPORT_DUPLICATE` when the user already has an open report of this type for the station; 429 `STATION_REPORT_LIMIT` after 20 reports / 24 h per user; IP rate limit 10/h |
| `POST /stations/:id/checkins` | `{ outcome:'charged_successfully'|'waited_then_charged'|'could_not_charge'|'other', connectorId?, variantId?, observedPowerKw?, waitMinutes? (0..1440), comment? (≤2000) }` | 201 `{data: MyCheckin}`; 429 `STATION_CHECKIN_TOO_SOON` (1 per station per 10 min per user) |
| `POST /stations/suggestions` | `{ name, operatorName?, latitude, longitude, addressText?, city?, countryCode, accessType?, connectors?: [{connectorTypeCode, currentType, maxPowerKw?, quantity?}] (≤20), openingHoursText?, notes? }` | 201 `{data: { suggestion: MySuggestion, possibleDuplicates: [{id, name, distanceM}] }}`; never shown on the map until reviewed; 429 `STATION_SUGGESTION_LIMIT` (≥10 pending) |
| `GET /me/station-suggestions` | – | paginated `MySuggestion[]` |
| `POST /me/station-suggestions/:id/withdraw` | – | pending → withdrawn |
| `GET /me/station-reports` | – | paginated `MyReport[]` |

`MyReport = { id, stationId, stationName, type, typeLabel, status, description|null, createdAt, resolvedAt|null, resolutionNote|null }`,
`MyCheckin = { id, stationId, outcome, connectorId|null, variantId|null, observedPowerKw|null, waitMinutes|null, comment|null, status, createdAt }`,
`MySuggestion = { id, status, name, latitude, longitude, countryCode, createdAt, reviewedAt|null, reviewNote|null, createdStationId|null, duplicateOfStationId|null }`.

## 2. Admin API (`/api/v1/admin/...`, permission-guarded, audited)

| routes | permission |
|---|---|
| `GET /admin/stations` (q, publicationStatus, operationalStatus, dataSource, countryCode, marketCode, operatorId, isDemo, hasOpenReports, page, pageSize) · `GET /admin/stations/:id` | `stations.read` |
| `POST /admin/stations` (manual, verified by staff; optional `connectors[]`; draft unless `publish: true` + `stations.publish` + ≥1 connector + no possible duplicate) · `PATCH /admin/stations/:id` | `stations.write` |
| `POST /admin/stations/:id/publication` `{status}` | `stations.publish` |
| `DELETE /admin/stations/:id` (soft delete) | `stations.delete` |
| `POST /admin/stations/:id/points` · `PATCH|DELETE /admin/stations/:id/points/:pointId` | `stations.write` |
| `POST /admin/stations/:id/connectors` · `PATCH|DELETE /admin/stations/:id/connectors/:connectorId` | `stations.write` |
| `GET|POST /admin/stations/:id/tariffs` · `PATCH|DELETE /admin/stations/:id/tariffs/:tariffId` | `tariffs.write` (GET: `stations.read`) |
| `POST /admin/stations/:id/photos` `{assetId, caption?, sortOrder?}` · `DELETE /admin/stations/:id/photos/:assetId` | `stations.write` |
| `GET|POST /admin/charging-operators` · `PATCH|DELETE /admin/charging-operators/:id` | `stations.read` / `stations.write` |
| `GET /admin/station-reports` · `GET|PATCH /admin/station-reports/:id` `{status, resolutionNote?}` | `reports.read` / `reports.moderate` |
| `GET /admin/station-checkins` · `PATCH /admin/station-checkins/:id` `{status}` | `reports.read` / `reports.moderate` |
| `GET /admin/station-suggestions` · `GET /:id` (+ nearby stations) · `POST /:id/approve` · `POST /:id/reject` · `POST /:id/duplicate` | `stations.write` |
| `GET|POST /admin/station-duplicates` · `POST /admin/station-duplicates/scan` · `POST /:id/merge` `{keepStationId}` · `POST /:id/dismiss` | `stations.write` |
| `GET /admin/station-sync/sources` · `POST /admin/station-sync/ocm` · `GET /admin/station-sync/jobs[/:id]` · `GET|PUT /admin/station-sync/schedule` | `stations.import` |
| `POST /admin/station-availability/observations` · `POST /admin/station-availability/refresh` | `stations.import` |

## 3. Compatibility with the user's car (§11)

- Vehicle = `vehicleVariantId` (catalog trim, public) in the request market, or
  `userVehicleId` (the caller's garage car → its variant + its own market).
- Only **structured inlet data** of that trim in that market
  (`variant_market_inlets`) with reliability `verified` or `manufacturer_claim`
  is used. `estimated` / `unverified` / `disputed` inlets are ignored.
- A station connector is compatible only when an inlet has the SAME connector
  type code AND the same current (AC/DC). No "looks like the same plug"
  inference, no adapters (none are ever recommended).
- `maxUsablePowerKw = min(connector max, inlet max)`; `null` when either is unknown.
- No usable inlet data → 422 `VEHICLE_COMPATIBILITY_UNKNOWN` (details
  `{reason: 'variant_not_in_market'|'no_verified_inlets', variantId, marketCode}`),
  never an empty "nothing is compatible" result.
- `VehicleCompatibility = { variantId, marketCode, vehicleName, inlets: [{connectorType:{code,name}, currentType, maxPowerKw|null, reliability}], ignoredInlets: number, note }`.

## 4. Decisions

**Search (§10).** One raw SQL query (Prisma.sql, all values parameterized):
bbox = `location && ST_MakeEnvelope(...)::geography` (GIST) **plus** an exact
`latitude/longitude BETWEEN` test (a geography box can bulge past the
rectangle's edges); radius = `ST_DWithin(location, point, m)` (geodesic
metres); distance = `ST_Distance` (WGS84 spheroid). Connector filters live in
ONE `EXISTS (… connectors c …)` so type/current/power/compatibility are met by
the same plug. Up to 2000 matches are evaluated per request (`meta.truncated`),
"open now" is computed in JS (luxon) on them, then an offset cursor
(`o<n>`) pages the result. Low zoom levels use `GET /stations/clusters`
(`ST_SnapToGrid`, cell = 360 / (2^zoom · 4)°). Planned and permanently closed
stations are hidden unless `includeClosed=true`. Text search uses the SQL
`app_normalize_text()` on both sides (same Arabic normalization as the index).

**Three separate statuses (contract §3).** `operationalStatus` (data),
`hours.openNow` (schedule + IANA time zone at request time, DST-aware),
`availability` (live provider only). They are never combined: an operational
station can be closed now, an open station can be `unknown` for availability.

**Open now.** Schedule JSON as defined in prep-remaining-schema §4.
`isAlwaysOpen=true` → open; no schedule → `unknown` (text hours are shown
as published and never parsed); a missing day → `unknown`; an empty day →
closed; a past-midnight window of the previous day is honoured; adjacent
windows (…–24:00 + 00:00–…) are merged for `closesAt`; `opensAt` is `null`
when an unknown day comes before the next known opening. Evaluated with an
injectable clock (`STATIONS_CLOCK`) so tests pin an instant.

**Live availability (§11).** Newest observation per connector (or per charge
point for its connectors, the newer wins) → `effectiveAvailability()` of the
providers layer: expired or future-dated → `unknown` with `freshness:
'expired'` (the app shows "غير مؤكدة / uncertain"), none → `freshness: 'none'`.
Provider vocabulary is mapped: charging/reserved/blocked → occupied,
out_of_order/inoperative → out_of_order. Station-level observations (no
connector / point) are refused on ingestion — they cannot say which plug is
free. Ingestion: TTL default 10 min, max 24 h; already-expired readings are
counted and dropped. `POST …/refresh` pulls from the configured
AvailabilityProvider only when it is a live one (default `none` → stores
nothing). Old observations are purged after 7 days (JOBS_ENABLED instances).

**Compatibility (§11).** See §3. Only `verified` / `manufacturer_claim`
inlet rows of the trim IN the market are used; exact (code, AC/DC) match;
no adapter logic exists anywhere. Missing data → 422 (never an empty list).
A garage car (`userVehicleId`) uses its own market; guests get 401.

**Community (§11).** Reports, check-ins and suggestions need a signed-in
user (login already requires a verified e-mail). Abuse limits: IP rate limits
(`reports` preset 10/h for reports and suggestions, `write` 60/min for
check-ins, `search` 60/min for list/clusters) + per-user limits in the
service (one open report per user × station × type → 409; 20 reports / 24 h
per user and 40 per IP hash → 429; one check-in per station per 10 min and
50 / 24 h → 429 with Retry-After; 10 pending suggestions → 429). The
reporter IP is stored only as HMAC-SHA256 with `IP_HASH_SALT`. Check-in
comments containing links start `pending` (moderated). Reason labels and
"requires details" come from `report_reasons` (scope station). The community
section of a station shows approved check-ins (anonymous, with the car name
only when the trim is public) and reports of the last 90 days (type, status,
date — no text, no author), always with `isLive: false` + disclaimer.

**Suggestions.** Stored in `station_suggestions` only (never on the map).
The response lists published stations within 150 m so the app can say "this
may already exist". Approval creates a normal station (`data_source =
user_suggestion`, connectors ungrouped, `lastVerifiedAt = null` unless the
reviewer sets it), runs dedupe, and publishes only with `publish: true` +
`stations.publish`.

**Admin rules.** Manual stations are `data_source = manual`, attribution
"EV Car News editorial data (verified by staff)", `lastVerifiedAt = now`
unless given. Time zone defaults to the market's; a country without a
market must send `timezone`. Publishing needs `stations.publish`, ≥ 1
connector and a non-merged station; the last connector of a published
station cannot be deleted; a charge point with connectors cannot be deleted
(409 IN_USE); deleting a station is a soft delete (`stations.delete`, owner /
admin) and hides it; tariff elements are validated against their unit
(energy → per_kWh, flat → per_session, time/parking/idle → per_minute|hour)
before the DB CHECK; PATCH of a tariff with `elements` replaces them all.
Every admin mutation is audited (automatic interceptor + before/after
annotations; publication changes as `stations.publication.<status>`,
suggestion approval as `station-suggestions.approve`).

**OCM sync (§10, §18).** `POST /admin/station-sync/ocm` creates an
`import_jobs` row (type `stations.ocm_sync`, idempotency key
`ocm:<country>:<bbox>:<modifiedSince>` → a second identical run while one is
open → 409 STATION_SYNC_RUNNING; a job without progress for 2 h is failed).
Pages come from `providers/stations` (OCM adapter: key in a header, SSRF-safe
client, open-data records only, per-record licence). Per record, in one
transaction with an advisory lock on `(provider, external_id)`:
- unchanged `payload_hash` → row `skipped` (reason `unchanged`), only
  `last_seen_at` / `last_import_job_id` are touched; a locally deleted station
  is never recreated (`deleted_locally`);
- operator: provider record `operator:<id>` → operator (else reuse by exact
  name, else create);
- station: source-owned fields are overwritten (name, position, address,
  access, contact, operational status, published point count, usage-cost
  text, dates, licence, attribution); admin-owned fields are kept (Arabic /
  English names and addresses, hours, amenities, payment / start methods,
  photos, tariffs, publication status). New stations: market + time zone from
  the country (market row, else a small built-in list, else UTC with a row
  warning), `accessRestrictions` from the OCM usage flags,
  `publication_status = pending_review`;
- connectors: `conn:<id>` records → connectors with `charging_point_id NULL`
  (no invented EVSEs), `quantity` = source quantity (1 + warning when
  unknown), unknown plug types / currents are skipped with a warning (never
  guessed), connectors that disappeared from the source are deleted,
  connectors added by hand are kept;
- provenance: station record keeps the raw payload (CC BY / open data), hash,
  licence text + URL, OCM page URL, attribution, last job; `removed_at_source_at`
  for decommissioned / duplicate records (duplicates are hidden);
- dedupe for new stations; `autoPublish: true` publishes only stations with
  ≥ 1 connector, not removed, and without a possible duplicate.
Rows land in `import_job_rows` (imported / updated / skipped / invalid /
failed + warnings). `wait: true` runs inside the request; otherwise the job
runs in the background of the instance and is polled via
`GET /admin/station-sync/jobs/:id`. Scheduled incremental syncs per country:
`PUT /admin/station-sync/schedule` stores `{enabled, intervalHours,
countryCodes, autoPublish}` in `integration_settings` (provider
`stations.ocm`); a 15-minute `@Interval` on JOBS_ENABLED instances claims a
due country with an optimistic update and syncs with `modifiedSince` = its
last run. Sync success / failure is written to that row too.

**Dedupe.** `ST_DWithin(150 m)` + `pg_trgm similarity()` of the normalized
names (max over name / name_en / name_ar) + operator (same id or operator
name similarity ≥ 0.6). Candidate when ≤ 50 m, or ≤ 150 m and (similarity ≥
0.4 or same operator). Pairs are stored ordered (`station_id <
other_station_id`); reviewed pairs are never reopened by a scan. Merge (manual
only) sets the loser's `duplicate_of_id` and hides it (the DB CHECK forbids
publishing it), re-points earlier merges; the loser keeps its provider
records so later syncs update it instead of recreating it. Public GET of a
merged station → 404 `STATION_MERGED` with `details.mergedIntoId` (old links
and favourites can redirect).

**Errors.** Module-local bilingual errors (`common/station-errors.ts`),
same pattern as the vehicles / articles modules (shared catalogs untouched).
Codes: `STATION_MERGED`, `VEHICLE_COMPATIBILITY_UNKNOWN`,
`STATION_REPORT_DUPLICATE`, `STATION_REPORT_LIMIT`, `STATION_CHECKIN_TOO_SOON`,
`STATION_CHECKIN_LIMIT`, `STATION_SUGGESTION_LIMIT`,
`STATION_SUGGESTION_NOT_PENDING`, `STATION_MERGED_NOT_PUBLISHABLE`,
`STATION_DUPLICATE_NOT_PENDING`, `STATION_ALREADY_MERGED`, `STATION_SYNC_RUNNING`,
`SOURCE_NOT_SYNCABLE`, `SLUG_TAKEN`, `IN_USE`, plus the generic
`VALIDATION_FAILED` (field paths such as `openingHours.mon[0]`,
`elements[1].priceUnit`, `connectors[0].currentType`),
`INTEGRATION_NOT_CONFIGURED` (503, no OCM key), `RATE_LIMITED`.

## 5. Notes for the mobile app (charging tab)

- One call serves map and list: `GET /stations?bbox=…` for the viewport
  (debounce map moves ≥ 400 ms; the `search` limit is 60/min per IP), or
  `lat,lng[,radiusKm]` around the user / a manually chosen place (location
  permission denied → `/charging/location`). Keep `sort=distance`, pass the
  user's `lat,lng` together with `bbox` to get `distanceM`.
- `meta.truncated = true` or zoom < 9 → use `GET /stations/clusters` and show
  counts; tap a cluster → zoom in. `stationId` is set for single-station cells.
- Filters sheet: build chips from `GET /stations/meta` (connector types with
  AC/DC support, amenities, access types, labels in the request language).
  "Public only" = `access=public`; "open now" = `openNow=true`.
- Show the three statuses separately and never colour-only: operational
  (`operationalStatusLabel`), open now (`hours.openNow.state` + `localTime`,
  `closesAt` / `opensAt` in the station time zone), live availability
  (`availability.status`; `unknown` → "غير معروفة", `freshness: 'expired'` →
  "غير مؤكدة" with `observedAt`; show `source` and time when live). Default
  deployments have no live provider: expect `unknown` everywhere.
- Missing numbers are `null` (power, point count, distance, tax…): show
  "غير متوفر / Not available". `connectorCount` counts plugs, NOT cars at
  once; show `pointCount` (may be null) for "chargers".
- Tariffs: show every element with `componentLabel`, `price.amount` +
  currency, `unitLabel`, grace minutes / time window when set, taxes
  (`taxIncluded` null = unknown), validity dates and reliability; if there is
  no tariff but `usageCostText`, show it as source text (not a price).
- Provenance: always show `source.attribution` / provider attribution and
  licence (OCM CC BY requires it) and `source.lastUpdated`.
- Compatibility: pass `vehicleVariantId` (catalog car) or `userVehicleId`
  (garage, signed in). On 422 `VEHICLE_COMPATIBILITY_UNKNOWN` show the
  message and offer to clear the filter — never an empty "nothing is
  compatible" state. Per-connector `compatibility.compatible` + `maxUsablePowerKw`.
- Demo rows (`isDemo: true`, demo station "محطة تجريبية (Demo)") must carry a
  visible demo badge; never present them as real places.
- Directions: open an external navigation app with `latitude,longitude`.
- Reports / check-ins / suggestions need sign-in (401 → sign-in screen).
  Report types + "requires details" from `/stations/meta.reportTypes`.
  Handle 409 (already reported), 429 (limits, `Retry-After`), 422 (fields).
  After a suggestion, show `possibleDuplicates` ("may already exist").
  My lists: `/me/station-reports`, `/me/station-suggestions` (+ withdraw).
- Offline: cached station data must be labelled with its fetch time and never
  shown as live availability (REQUIREMENTS §19).

## 6. Files

- `backend/src/modules/stations/stations.module.ts`
- `common/`: `opening-hours.ts` (+spec), `availability.ts`, `compatibility.ts`,
  `dedupe.ts`, `labels.ts`, `station-errors.ts`, `station-media.ts`, `clock.ts`,
  `values.ts`, `station-rules.spec.ts`
- `dto/`: `public.dto.ts`, `community.dto.ts`, `admin.dto.ts`, `validators.ts`
- `services/`: `station-search`, `station-detail`, `station-meta`,
  `station-availability`, `vehicle-compat`, `station-community`,
  `station-admin`, `station-tariffs`, `station-moderation`,
  `station-duplicates`, `station-sync` (+ `station-sync.trigger.ts`)
- `controllers/`: `public-stations.controller.ts` (public + me),
  `admin-stations.controller.ts` (8 admin controllers)
- Tests: `backend/test/stations-{public,community,admin,sync}.e2e-spec.ts`,
  `backend/test/stations-helpers.ts`

No change to `prisma/schema`, migrations, `package.json`, `app.module.ts`,
shared i18n catalogs or other modules. No new dependency.

## 7. Verification (2026-09-25)

| command | result |
|---|---|
| `npm run typecheck` | clean |
| `npx eslint src/modules/stations test/stations-*` / `prettier --check` | clean |
| `npx jest src/modules/stations` | 2 suites / 39 tests (opening hours incl. Cairo DST, Riyadh, Dubai; availability; compatibility; dedupe; tariff units; provenance helpers) |
| `npm test` (all unit) | 51 suites / 532 tests passed |
| `npm run test:e2e -- test/stations-public.e2e-spec.ts` | 37 passed (geo accuracy on known coordinates: 0.009° N ≈ 998 m, 0.104° E ≈ 10.03 km, exact bbox edges; filters; one-connector rule; cursor; clusters; open now Cairo/Riyadh/Dubai summer + winter; detail; availability expiry; compatibility; meta) |
| `… stations-community.e2e-spec.ts` | 17 passed (auth 401, duplicate 409, details 422, per-user 429, IP rate limit 429 with RATE_LIMIT_MULTIPLIER=1, check-in 10-min rule, link comments pending, suggestions + nearby, withdraw, limits) |
| `… stations-admin.e2e-spec.ts` | 16 passed (RBAC, create/validate/publish rules, points/connectors, tariffs, soft delete, operators, photos with credit, report + check-in moderation, suggestion approve/reject/duplicate, audit rows) |
| `… stations-sync.e2e-spec.ts` | 11 passed (mocked transport + synthetic fixture: import, licence/attribution, skipped records, idempotent re-run, changed record update + removed connector, dedupe → review + manual merge, merged never republished, ingest by `conn:` reference, 409 running, background job polling, schedule, permissions; 503 without OCM_API_KEY) |
| `npm run test:e2e` (all) | 28 suites / 404 tests passed |
| `npm run openapi:export -- <scratchpad>/openapi.json` | 214 paths, 45 station paths; the shared `backend/openapi.json` was NOT overwritten |

## 8. Not done / limits

- No live availability provider is integrated (none exists for EG/SA/AE in
  this environment): the ingestion endpoint + provider pull are built and
  tested with synthetic observations; production shows `unknown`.
- OCM import was tested only with the synthetic fixture through a mocked
  transport — no real OCM call was made (no key, no network). Coverage of
  any country is not claimed.
- Background (`wait: false`) syncs run in-process on the instance that got
  the request (not a BullMQ worker); a crash leaves the job `running` until
  the 2-hour stale rule fails it. Scheduled syncs run only on JOBS_ENABLED
  instances (`@Interval`, 15 min).
- CSV station import (`stations.csv`) is not implemented (manual + OCM +
  suggestions are). The `csv` / `partner` data sources exist in the schema.
- User-uploaded station photos / report photos (`station_media.status =
  pending`, `photo_asset_id`) are not accepted from the app yet — admins
  attach media assets uploaded through the media module.
- Merging does not move favourites / check-ins of the merged station; the
  app follows `STATION_MERGED.mergedIntoId`.
- No notification is sent to the reporter when a report changes status
  (template `notifications.station_report_update` exists; the notifications
  module owns delivery).
- Search index (`search_documents`) for stations is the search module's job.
- `openapi.json` was not re-exported (shared file; the integrator exports it).
- `REQUIREMENTS_TRACKER.md` not edited (outside this area).

## 9. Schema change requests

None.
