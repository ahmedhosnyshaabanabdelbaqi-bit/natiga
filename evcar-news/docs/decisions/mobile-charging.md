# Decisions — mobile charging (Flutter)

Area: `mobile/lib/features/charging/**`, `mobile/lib/l10n/parts/charging_{ar,en}.arb`,
tests `mobile/test/features/charging/**`. Date: 2026-09-25.
API contract: `docs/decisions/backend-stations.md` §1–§5, plus `GET /me/vehicles`
(`backend-personal.md` §2). No dependency added, no router change (class
names and constructors kept). One shared test was edited (see §8).

## 1. Screens

| Route | Class | What it does |
|---|---|---|
| `/charging` (`?view=list`) | `ChargingScreen` | App bar (title, Map/List toggle, unified search), text search, filter button with a count badge, quick chips (Near me, place, Fast DC, Open now, Fits my car). Map and list show the **same** search (same area + filters), so they are always in sync; on wide screens (≥ 840 dp) list and map are side by side. |
| `/charging/stations/:id` (id or slug) | `StationDetailScreen` | Header (demo badge + "not a real place", operator, address, max power / distance / AC+DC tiles, Directions, Check in, Report), photos with credit, **Status now** (3 separate rows), compatibility with the chosen car, chargers & connectors, opening hours (week, today highlighted, station time zone), access, prices, payment/start/amenities, contact, community (dated, not live), data source & licence. |
| `/charging/filters` | `ChargingFiltersScreen` | Same form as the filter sheet, full page (deep-linkable). |
| `/charging/location` | `ChargingLocationScreen` | Use my location (asked only here, on tap), pick a point on the map (when the map is configured), or pick a city (market first, searchable). |
| `/charging/stations/:id/report` | `StationReportScreen` | Signed in (AuthGate). Reasons from `/stations/meta.reportTypes` (+ help, requiresDetails), optional connector, "connector found on site" for `different_connector`, "price you saw" for `price_changed`, details. |
| `/charging/stations/:id/check-in` | `StationCheckInScreen` | Signed in. Outcome (meta), connector, garage car (variantId), observed kW, wait minutes, comment. `pending` status (link in comment) is explained. |
| `/charging/suggest` | `StationSuggestScreen` | Signed in. Name, operator, location (I'm at the station / pick on map / type coordinates), country (enabled markets), city, address, access type, connectors (type from meta; AC/DC forced when the type supports only one), hours text, notes. After sending: "may already exist" list from `possibleDuplicates`. |

States everywhere: skeletons shaped like the content, empty (specific
message + Clear filters / Search within 100 km / Suggest a station), error
with retry, offline (saved copy with date, or offline state), permission
denied (settings + manual city/point), map not configured (list + notice),
compatibility unknown (explained + Remove car filter), merged station
(404 `STATION_MERGED` → "open the station" using `mergedIntoId`).

## 2. Map

* `flutter_map` 8 + `flutter_map_marker_cluster` 8. Tile URL, attribution
  and max zoom from `/app-config → map`; `MapConfig.isUsable == false` →
  list only with a notice (no map widget, no tile requests).
  Attribution is always visible (bottom-start chip). User agent
  `news.evcar.app`. Rotation disabled.
* Pins: shape + icon, not colour only — bolt = has DC, plug = AC only,
  power-off = not operational; demo stations use the demo tone. Selected pin
  is larger with a ring; tapping shows the station card at the bottom.
* **Search this area** appears after a user gesture; nothing is fetched per
  pan (API limit 60/min). The visible bbox is sent with the reference point
  (for distances). Zoom < 9 or `meta.truncated` → server clusters
  (`/stations/clusters`, tap = zoom in); otherwise client clustering of the
  loaded results (clusters split at zoom 15, spiderfy).
* Long-press → confirm sheet → search around that point.
* Offline tiles are not stored (provider terms; REQUIREMENTS §19).

## 3. Location & privacy

* The permission is **never** requested on open: the tab only calls
  `checkPermission` silently; if while-in-use access was already granted it
  centres on the user. The prompt appears only after "Near me" / "Use my
  location" / "I'm at the station".
* Denied → snackbar with "Choose a place"; permanently denied or services
  off → sheet with `PermissionDeniedState` (open settings) + "Choose a place".
* Until the user chooses, searches use the market's main city, labelled
  "Cairo (default)" with a hint and the two actions.
* The device position lives only in memory (`chargingPlaceProvider`). Only a
  **city id** the user picked is stored (`charging.city.v1`). Map points are
  not stored.
* Requests send the reference point rounded to 4 decimals (~11 m).
* Cached responses are stored **without** `distanceM` and `meta.center`
  (`stripLocation`); a saved copy's distances are recomputed on screen
  (haversine) from the in-memory point. Cache keys use the area rounded to
  ~1 km and never the reference point.
* City centres (`domain/city_presets.dart`, 15 cities EG/SA/AE) are reference
  geography used only as search centres, not station data.

## 4. Status rules (`domain/station_status.dart`, unit-tested)

Three separate answers, each an icon + text pill, never merged:

1. **Operational** — `operationalStatus(+Label)` from the data.
2. **Open now** — the server's `hours.openNow` while fresh (≤ 5 min since
   `evaluatedAt`); otherwise (saved copy / page left open) evaluated on the
   device from `weekly` in the station's IANA zone (tz database, DST aware):
   always-open → open; no schedule / unknown zone / missing day → unknown;
   `[]` → closed; windows past midnight and `24:00` honoured. Closes/opens
   times are shown in station time ("Closes at 22:00 (station time)").
3. **Live availability** — per connector: counts only when `freshness=live`
   **and** `expiresAt` is still in the future on the device; a reading that
   expires while the page is open becomes **"غير مؤكدة / Uncertain"** (the
   page re-evaluates every minute); `expired` → uncertain with the last
   reading time; `none` → **"غير معروفة / Unknown"**; future-dated → unknown.
   Station level = server rule (available if ≥ 1 live-available; occupied /
   out of order only if every connector is live). List rows: no timestamps in
   the list API, so a row's status is trusted for 5 min after the fetch, then
   shown as uncertain until refresh. A saved copy never shows live status
   ("No live status (saved data)"). Source, observed time and validity are
   shown with every live reading; the server disclaimer is shown.

Other honesty rules: missing numbers → "غير متوفر / Not available" (power,
distance, chargers, tax); connectors ≠ cars at once (said explicitly);
`usageCostText` shown as "price as published by the source", never parsed;
tariffs per element with unit label, grace minutes, time/power/day
conditions, tax (included / excluded / "not stated" when null), validity,
reliability badge, source + verified date; community data always dated and
labelled "not an official live status"; demo stations: demo badge on card,
pin tone, header, "not a real place — do not drive here" and in the
directions sheet.

## 5. Filters & compatibility

* Server filters: `q`, `connectorTypes` (chips from meta, narrowed by the
  chosen AC/DC), `current`, `minPowerKw` (7/22/50/100/150), `openNow`,
  `access=public`, `amenities`, `userVehicleId`. The API requires one
  connector to meet type + current + power; the sheet says so.
* **Operator** filter is applied on the device by operator **name** over the
  loaded results — the list API returns `operatorName` but no `operatorId`
  and `/stations/meta` has no operator list (request below).
* "Compatible with my car": the signed-in user's garage cars
  (`GET /me/vehicles`); guests get "Sign in", users without cars "Add a car".
  422 `VEHICLE_COMPATIBILITY_UNKNOWN` → a dedicated state with the server
  message and "Remove car filter" (never an empty "nothing compatible" list).
  On the station page the station is then shown without compatibility and
  the message is displayed. Per-connector compatible / "up to N kW"; "no
  adapter is recommended" is stated.

## 6. Offline & caching

`fetchWithCache` (network first; cached copy on connectivity/timeout/5xx)
for the first search page, meta and station detail, keyed by language +
market (+ area/filters or vehicle). Saved copies show `CachedDataNotice`
(time) + "live status is never shown from saved data"; further pages need
the network.

## 7. Directions & favourites

* Directions sheet (`data/directions.dart`): Android — `geo:` (system chooser
  of every navigation app), Google Maps (`google.navigation:` → web
  fallback), Waze (https universal link); iOS — Apple Maps, Google Maps
  (`comgooglemaps://` → web fallback), Waze; web preview — web map. Both
  manifests already declare the needed queries/schemes. The app never draws
  a route and has no start/reserve/pay button.
* Save station: `FavoriteButton` with `FavoriteType.station`, route
  `/charging/stations/<id>` (`stationFavoriteItem`).

## 8. Tests & verification (2026-09-25)

Fixtures in `test/features/charging/fixtures/` were **captured from the real
backend** (own DB `evcar_chgmob`: migrate + reference + demo seed, run with
`ts-node --transpile-only src/main.ts` on port 3197, dropped afterwards). The
same session exercised the signed-in writes with curl: report 201 / 409
`STATION_REPORT_DUPLICATE` / 422 description required, check-in 201 / 429
`STATION_CHECKIN_TOO_SOON` (Retry-After 600), suggestion 201 with
`possibleDuplicates`, `/me/vehicles` — all matched the models.

* `charging_rules_test.dart` (33): availability (live, expired on screen,
  exactly at expiry, no expiry, server-expired, none, future, offline),
  station/list aggregation + TTL, open now (Cairo summer/winter DST, Riyadh,
  closed day, unknown day, past midnight, 24:00, stale server value), parsing
  of every captured response + junk rows, filter → query, rounding, cached
  payload stripping, cache key without the point, haversine, cities,
  directions per platform + fallback.
* `charging_screens_test.dart` (19, full app + fake API + fake location):
  list in ar/en (map-not-configured notice, demo label, statuses, default
  city, **no prompt on open**); filter sheet → query + badge; denied →
  snackbar; permanently denied → settings + choose city → search around it;
  already granted → device point (rounded); 422 compatibility state + remove;
  offline saved list; ar + dark + 200 % no overflow; map with tiles,
  attribution, pin tap → card, list toggle; station page in ar/en (3 statuses,
  expired → uncertain, connectors ≠ cars, tax not stated, source/licence);
  community dated; weekly hours; offline station copy; merged redirect;
  ar 200 % whole page; guest → sign in; report flow (details required, 409,
  success).
* `flutter analyze` — no issues in my area (the 5 remaining infos are in
  `lib/features/tours`, another agent's work in progress).
* `flutter test` — 327 passed, 7 skipped (live API tests), 0 failed.
* Visual check: widget-test screenshots with the bundled fonts (list en,
  list ar dark, map, detail ar/en dark, location, filters, ar 200 %).

Shared file touched (minimal, same as the news feature did):
`test/app/routes_test.dart` — the 6 charging routes moved from the
placeholder list to `_implemented` (detail, filters, location) and
`_personal` (report, check-in, suggest: guests see the sign-in view). Their
feature-flag checks are unchanged.

## 9. Not done / not verified

* No APK and no device run (no Android SDK here). Real GPS, permission
  dialogs, `geo:`/app launching, map gestures and tile loading on a device are
  unverified; tiles in tests come from an in-memory provider.
* No real tile server is configured by default (`/app-config` map is "not
  configured") → the list is what users see until an admin sets a tile URL
  and attribution.
* No live availability provider exists → everything shows "Unknown" (by
  design, from the backend).
* No photo upload with reports / check-ins / suggestions (backend does not
  accept them from the app).
* "My reports" / "My suggestions" lists (`/me/station-reports`,
  `/me/station-suggestions` + withdraw) are not surfaced in the app yet.
* Catalog-car compatibility (`vehicleVariantId`) is supported by the model
  but the UI only offers garage cars.
* Search is per area; there is no geocoding endpoint, so "search around a
  city" uses the built-in city list, not free-text places.
* Operator filter is device-side by name (see §5).

## 10. Requests for other teams

* **Backend (stations):** add `operatorId` to `StationListItem` and an
  `operators` list to `/stations/meta` (or a `GET /charging-operators`
  public endpoint) so the operator filter can run server-side with ids.
  Optional: a per-row `availability.observedAt/expiresAt` in the list so
  the app does not need its 5-minute trust window.
* **Home team:** nearby stations can reuse `stationSearchProvider` after
  setting `chargingAreaProvider` (or `StationsRepository.search(area,
  filters)`) and `StationCard(station:, fetchedAt:, now:)`.
* **Favorites team:** stations are saved as `FavoriteItem(key:
  FavoriteKey(FavoriteType.station, id), title: name, subtitle: operator,
  route: /charging/stations/<id>)`; a merged station's page redirects via
  `STATION_MERGED.mergedIntoId`.
* **Trips team:** `evaluateOpenNow(StationHours, instant)` evaluates opening
  hours at any instant (e.g. ETA) in the station time zone.
