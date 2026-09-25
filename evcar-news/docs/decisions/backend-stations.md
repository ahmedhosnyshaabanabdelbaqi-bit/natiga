# Backend charging stations (backend-stations) — decisions

Area: `backend/src/modules/stations/**`, tests `backend/test/stations-*.e2e-spec.ts`
and unit specs next to the code. Date: 2026-09-25. Requirements: REQUIREMENTS
§10 (stations), §11 (live status + compatibility), §18, §19, §22; contract
ARCHITECTURE §3 ("station status is three separate things"), §4.3, §4.6.

> STATUS: work in progress — the API contract (§1–§3) is written first so the
> mobile agent can align. Verification results are in the last section.

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
non-expired live `available` observation, `occupied` / `out_of_order` when
every live connector is so, else `unknown`. With no live provider (default)
everything is `unknown`.

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
  accessEntranceNote|null, accessType, accessRestrictions|null,
  hours: { timezone, isAlwaysOpen: boolean|null, openingHoursText|null,
           weekly: [{ day:'mon'..'sun', windows: [{start:'08:00', end:'22:00'}] | null /* null = unknown, [] = closed */ }] | null,
           openNow: { state:'open'|'closed'|'unknown', reason:'always_open'|'schedule'|'unknown_schedule'|'unknown_day',
                      closesAt: iso|null, opensAt: iso|null, localTime: 'HH:mm', evaluatedAt: iso } },
  contact: { phone|null, email|null, websiteUrl|null },
  photos: Image[],                     // same Image shape as the vehicles API (credit = licence attribution)
  amenities|paymentMethods|startMethods: [{ code, label }],
  operationalStatus,
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

### 1.5 `GET /stations/:id/availability` — live status refresh (no cache)
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
| `POST /admin/stations` (manual, verified by staff; draft unless `publish: true` + `stations.publish`) · `PATCH /admin/stations/:id` | `stations.write` |
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

(Sections 4+ — decisions, sync/dedupe, verification — are completed below as work finishes.)
