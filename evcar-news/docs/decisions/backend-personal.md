# Backend — personal features (garage, charging logs, reminders, calculators, notifications, trips)

Owner area: `backend/src/modules/{garage,charging-logs,reminders,calculators,notifications,trips}`,
e2e specs `backend/test/personal-*.e2e-spec.ts`. Requirements: REQUIREMENTS_AR §12, §13, §14, §16.

Sections 2–7 are the API contract (implemented and covered by e2e tests); sections 8–11 record
decisions, verification, what is not done and notes for other teams.

## 1. Conventions used everywhere below

- Envelopes, errors, `?lang` / `?market` exactly as ARCHITECTURE §4.3. All `/me/...` routes need
  `Authorization: Bearer`; another user's row is always **404 NOT_FOUND** (never 403 — existence is
  not revealed).
- Validation: 422 `VALIDATION_FAILED`, `details: [{ field, constraints: { <rule>: <localized message> } }]`
  (nested fields use dots, e.g. `tariff.energyPerKwh`, `curve.0.powerKw`).
- Missing value = `null` ("غير متوفر / Not available"), never 0. Money = `{ amount: "12.34", currency: "EGP" }`
  (rates such as price per kWh keep 4 decimals). Dates: `YYYY-MM-DD` for calendar dates, ISO-8601 UTC for instants.
- Units: km, kWh, kW, minutes, %, kWh/100 km, L/100 km.

## 2. Garage — `/api/v1/me/vehicles`

| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/me/vehicles` | – | list (complete, page 1 of 1) of `UserVehicle` (primary first) |
| POST | `/me/vehicles` | `CreateUserVehicle` | 201 `{data: UserVehicle}` |
| GET | `/me/vehicles/:id` | – | `{data: UserVehicle}` |
| PATCH | `/me/vehicles/:id` | any field of Create (nullable ones accept `null`) | `{data: UserVehicle}` |
| DELETE | `/me/vehicles/:id` | – | 204 (deletes that car's charging logs and reminders too) |

`CreateUserVehicle`: `{ variantId (uuid, published trim → fixes brand/model/model year), marketCode? (default: request market),
nickname? (≤100), purchaseDate? (YYYY-MM-DD, not in the future), initialOdometerKm? (≥0), currentOdometerKm? (≥0, ≥ initial),
isPrimary? (bool), notes? (≤2000) }`. Max 20 cars per user (409 `GARAGE_LIMIT_REACHED`). The first car is primary;
setting `isPrimary: true` clears it on the others.

`UserVehicle`:
```
{ id, nickname|null, displayName (nickname or "Brand Model Year Trim"),
  variant: { id, slug, name, trimName, modelYear, powertrainType,
             brand:{id,slug,name}, model:{id,slug,name}, isPublished },
  marketCode, listedInMarket (bool: the trim has a record in that market — compatibility / prices need it),
  purchaseDate|null, initialOdometerKm|null, currentOdometerKm|null, odometerUpdatedAt|null,
  isPrimary, notes|null, stats: { chargingLogs, openReminders }, createdAt, updatedAt }
```
`currentOdometerKm` is also raised automatically when a charging log / completed reminder carries a higher reading.

## 3. Charging logs — `/api/v1/me/charging-logs`

| Method | Path | Notes |
|---|---|---|
| GET | `/me/charging-logs?vehicleId&from&to&page&pageSize` | newest first, paginated |
| POST | `/me/charging-logs` | 201 |
| GET / PATCH / DELETE | `/me/charging-logs/:id` | |
| GET | `/me/charging-logs/report?from&to&vehicleId` | computed only from the user's logs |

Body: `{ userVehicleId (own car), chargedAt (ISO instant, not in the future), energyKwh (>0, ≤1000),
cost? (≥0), currency? (ISO-4217; defaults to the car's market currency when cost is given), odometerKm? (≥0),
socStart?, socEnd? (0..100, end > start), durationMinutes? (>0), chargerPowerKw? (>0), currentType? ('AC'|'DC'),
locationType? ('home'|'public'|'work'|'other', default other), stationId? (published station), notes? }`.
Odometer readings must be consistent in time for a car: not lower than an earlier log, not higher than a
later one (422 field `odometerKm`, rule `order`).

`ChargingLog` = the body fields + `{ id, vehicle: {id, displayName}, station: {id, name}|null, costPerKwh: Money|null, createdAt, updatedAt }`.

Report (`from`/`to` = `YYYY-MM-DD` inclusive or ISO instants; default = all time):
```
{ period: {from|null, to|null} (ISO instants actually used), vehicleId|null,
  totals: { sessions, energyKwh, sessionsWithCost, sessionsWithoutCost,
            spend: [Money] (one per currency, never converted),
            averageCostPerKwh: [Money] },
  byLocationType: [{ locationType, sessions, energyKwh }],
  months: [{ month: "2026-08", sessions, energyKwh, spend: [Money] }],
  vehicles: [{ vehicleId, displayName, sessions, energyKwh, spend: [Money],
               distance:    { km|null, status: 'ok'|'insufficient_data', reason|null },
               consumption: { kwhPer100km|null, status, reason|null, method: 'odometer_delta', confidence|null,
                              basis: 'energy_logged', intervals },
               costPer100km:{ value: Money|null, status, reason|null } }],
  notes: [localized strings explaining the method] }
```
`reason` codes: `no_sessions`, `fewer_than_two_odometer_readings`, `no_distance`, `missing_costs`,
`mixed_currencies`. Consumption = energy of the logs after the first odometer reading up to the last one ÷
(last − first odometer) × 100. Confidence `low` below 3 intervals or 300 km, else `medium`. Nothing is estimated
from the catalog.

## 4. Reminders — `/api/v1/me/reminders`

| Method | Path | Notes |
|---|---|---|
| GET | `/me/reminders?status=open|completed|all&vehicleId` | open: soonest first |
| POST | `/me/reminders` | 201 |
| GET / PATCH / DELETE | `/me/reminders/:id` | |
| POST | `/me/reminders/:id/complete` | `{ completedAt?, odometerKm? }` → `{ data: { completed: Reminder, next: Reminder|null } }` (next is created when it repeats) |

Body: `{ type: 'maintenance'|'insurance'|'licence'|'tyres'|'custom', title? (required for custom; default = type label in
the request language), userVehicleId? (own car; required for odometer reminders), notes?, dueDate? (YYYY-MM-DD),
dueOdometerKm?, repeatIntervalMonths? (1..120), repeatIntervalKm?, notifyDaysBefore? (0..365, default 7),
notifyKmBefore? }` — at least one of `dueDate` / `dueOdometerKm`.

`Reminder` = body fields + `{ id, typeLabel, vehicle: {id, displayName, currentOdometerKm}|null, completedAt|null,
status: 'upcoming'|'due_soon'|'overdue'|'completed', dueInDays|null, dueInKm|null,
notifyOn: 'YYYY-MM-DD'|null (dueDate − notifyDaysBefore: the app schedules its LOCAL notification for this day),
createdAt, updatedAt }`. The server stores; the app schedules local notifications (it re-syncs on every list load).

## 5. Calculators (public) — `POST /api/v1/calculators/<kind>`

Kinds: `charge-cost`, `charge-time`, `cost-per-100km`, `monthly-cost`, `vs-fuel`, `tco`. Guests allowed.
Every response: `{ data: { calculator, result, formula, steps: [{key,label,expression,value,unit}],
assumptions: [{key,label,value,unit,origin:'user'|'default'|'catalog'|'reference_price',note}],
warnings: [{code,message}], confidence: 'high'|'medium'|'low', units, disclaimer, vehicle: {variantId,marketCode,name}|null } }`.

Common optional inputs: `variantId` (published trim) or `userVehicleId` (own car, needs token) fill MISSING car values
from the catalog (usable battery, AC limit, DC peak, DC curve, consumption with its cycle — never converted); user values
always win. Prices: `currency`, `priceDate` (YYYY-MM-DD) and either typed amounts or `referencePriceIds: {
electricityPricePerKwh?, publicPricePerKwh?, fuelPricePerLiter?, energyPerKwh? }` (ids from `GET /calculators/reference-prices`).
**There are no default prices**; a missing price is a 422. An undated price gives warning `PRICE_DATE_MISSING`; a
reference price older than 365 days gives `REFERENCE_PRICE_OLD`.

- `charge-cost`: `batteryUsableKwh, fromSocPercent, toSocPercent` (or `energyKwh` + `energyBasis: battery|grid`),
  `efficiency` ((0,1], default 0.9 shown as assumption; not applied to grid-side energy), `tariff: { energyPerKwh,
  timePerMinute|timePerHour, sessionFee, parkingPerMinute|parkingPerHour|parkingFlat, idlePerMinute|idlePerHour,
  idleGraceMinutes }`, `chargingMinutes, parkingMinutes, idleMinutes` → `result: { energyAddedKwh|null, gridEnergyKwh,
  lossesKwh|null, efficiencyApplied|null, energyBasis, cost: { energy, time, sessionFee, parking, idle (Money|null =
  not included), total }, costPerKwhAdded|null, priceDate|null }`.
  Test vector: 60 kWh, 20→80 % = 36 kWh; at 0.9 → 40 kWh grid.
- `charge-time`: `currentType AC|DC, batteryUsableKwh, fromSocPercent, toSocPercent, efficiency, stationPowerKw,
  vehicleAcMaxKw, supplyPhases (1|3) + supplyAmps (+ supplyVoltsPerPhase, default 230), vehicleDcPeakKw,
  curve: [{socPercent, powerKw}]` → `result: { currentType, energyAddedKwh, gridEnergyKwh, minutes|null,
  minutesRange: {low,high}|null, powerKw|null, limitingFactor: vehicle|station|supply|curve, method:
  ac_power_limit|dc_curve|dc_rough_estimate, isRoughEstimate }`. DC without a usable curve → `minutes: null`,
  a range and confidence `low`.
- `cost-per-100km`: `consumptionKwhPer100km | consumptionWhPerKm, consumptionBasis grid|battery (default grid),
  efficiency, electricityPricePerKwh, publicPricePerKwh + publicSharePercent` → `{ gridKwhPer100km, pricePerKwh,
  costPer100km, costPerKm, priceDate }`.
- `monthly-cost`: + `kmPerMonth | kmPerDay, fixedMonthlyFees` → `{ kmPerMonth, gridKwhPerMonth, energyCostPerMonth,
  fixedMonthlyFees|null, totalPerMonth, totalPerYear, costPer100km, priceDate }`.
- `vs-fuel`: + `fuelConsumptionLPer100km, fuelPricePerLiter, kmPerMonth|kmPerDay` → `{ evCostPer100km,
  fuelCostPer100km, differencePer100km, savingPercent|null, monthly: {km, ev, fuel, difference}|null,
  yearlyDifference|null, priceDate }` (energy only; warning `ENERGY_ONLY`).
- `tco`: + `years, kmPerYear, ev: { purchasePrice, incentives, residualValue, insurancePerYear, maintenancePerYear,
  feesPerYear, oneOffCosts }, fuelCar?: { same + fuelConsumptionLPer100km, fuelPricePerLiter }` → `{ years, kmPerYear,
  totalKm, ev: Breakdown, fuelCar: Breakdown|null, difference|null, priceDate }`; `Breakdown = { purchase, incentives,
  residualValue, energy, insurance, maintenance, fees, oneOff (Money|null), nonEnergy, total, perKm, perMonth,
  excluded: [field names not entered] }`.

Reference prices: `GET /api/v1/calculators/reference-prices?market=EG` → list of `{ id, marketCode, energyType, label,
price: Money, unit: per_kwh|per_liter, effectiveFrom, effectiveTo|null, source: {id,title,publisher,url}|null,
verifiedAt|null, notes|null, ageDays, possiblyOutdated, isDemo }` — empty until an admin enters prices.
Admin: `GET|POST /api/v1/admin/energy-prices`, `PATCH|DELETE /api/v1/admin/energy-prices/:id` (`prices.write`;
list also `settings.read`).

## 6. Notifications — in-app center, preferences, subscriptions, devices

| Method | Path | Notes |
|---|---|---|
| GET | `/me/notifications?unread=true&page&pageSize` | newest first |
| GET | `/me/notifications/unread-count` | `{data:{count}}` |
| POST | `/me/notifications/:id/read` · `/me/notifications/:id/unread` | `{data: Notification}` |
| POST | `/me/notifications/read-all` | `{data:{updated}}` |
| DELETE | `/me/notifications/:id` | 204 |
| GET / PATCH | `/me/notification-preferences` | see below |
| GET / POST | `/me/notification-subscriptions` | POST is idempotent (200 existing / 201 new) |
| DELETE | `/me/notification-subscriptions/:id` | 204 |
| GET | `/me/devices` | the caller's push tokens (masked) |
| POST | `/me/devices` | `{ token, platform: android|ios|web, provider?: fcm|apns (default fcm), installationId?, appVersion?, locale? }` → register / refresh |
| POST | `/me/devices/unregister` | `{ token }` → 204 (idempotent) |
| DELETE | `/me/devices/:id` | 204 |

`Notification = { id, type, title, body|null, deepLink|null (app path like "/news/<slug>" or https URL), data, isRead,
readAt|null, createdAt }`.

Preferences:
```
{ types: { news, priceAlerts, reminders, community, stationAlerts, campaigns },
  channels: { inApp: true (always on), push, email: false (not implemented) },
  quietHours: { start: "22:00", end: "07:00", timezone: "Africa/Cairo" } | null,
  unsubscribedAll: bool, unsubscribedAt|null,
  push: { configured: bool (server has FCM/APNs keys), registeredDevices: n,
          status: 'active'|'disabled_by_user'|'no_device'|'not_configured' } }
```
PATCH accepts `{ types?: {...partial}, channels?: { push? }, quietHours?: {start,end,timezone}|null, unsubscribeAll?: bool }`.
Turning any switch on clears `unsubscribedAll`.

Subscriptions (what triggers notifications): `{ topicType: brand|model|variant|category|market|station|price_alert,
brandId|modelId|variantId|categoryId|stationId, marketCode? }` → `{ id, topicType, target: {id|code, name}, marketCode|null, createdAt }`.

Server side (`NotificationService`, exported by NotificationsModule): `notify({ userIds, type, category, dedupeKey,
title/body (bilingual or catalog key + params), deepLink, data })` — one row per user in the user's locale, deduped by
`(user, dedupeKey)`, skipped when the category is switched off or the user unsubscribed; push only when configured,
enabled and the user has devices; quiet hours postpone push (`scheduled_for`), the in-app entry is immediate.
Trigger: article published → followers (subscriptions) of its linked brands / models / variants / category, filtered by
the article markets; `dedupeKey = article.published:<id>`, deep link `/news/<slug>`. Demo articles notify nobody.

## 7. Trips — `POST /api/v1/trips/plan` (+ `/api/v1/me/trips`)

Guests may plan (with `variantId`); `userVehicleId` and `save` need a token. Rate limit: `search` preset.
Only when a routing provider is configured; otherwise **503 INTEGRATION_NOT_CONFIGURED** (app-config
`features.tripPlanner` is then false — the settings module already forces that).

Request:
```
{ origin: {lat, lng, label?}, destination: {lat, lng, label?},
  userVehicleId | variantId (exactly one), currentSocPercent (1..100), minArrivalSocPercent (0..60, < current),
  departureAt? (ISO, default now), save?: bool, title?,
  assumptions?: { consumptionKwhPer100km?, batteryUsableKwh? (override the catalog),
                  consumptionMarginPercent? (default 10), chargeToSocPercent? (default 80),
                  corridorKm? (default 10), efficiency? (default 0.9),
                  electricityPricePerKwh? + currency (+ priceDate) — cost only when given } }
```
Response `data`:
```
{ feasible: true, routing: {provider, attribution}, vehicle: {variantId, marketCode, name, userVehicleId|null},
  origin, destination, departureAt,
  summary: { distanceKm, driveMinutes, chargingMinutes: {low, high}, totalMinutes: {low, high}, stops,
             energyUsedKwh, energyChargedKwh, gridEnergyKwh, arrivalSocPercent,
             cost: {amount, currency, priceDate|null, note} | null },
  legs: [{ index, distanceKm, durationMinutes, energyKwh, departureSocPercent, arrivalSocPercent }],   // road legs via the stops
  stops: [{ index, station: {id, name, lat, lng, address|null, city|null}, positionKm, detourKm,
            connector: {type: {code, name}, currentType, maxUsablePowerKw|null},
            operationalStatus, accessType, accessRestrictions|null,
            openAtEta: 'open'|'closed'|'unknown', openingHoursText|null,
            availabilityNow: {status: available|occupied|out_of_order|unknown, freshness: live|expired|none,
                              source|null, observedAt|null, expiresAt|null, providerStatus|null},
            statusConfidence: 'medium'|'low', etaAt: {earliest, latest},
            arrivalSocPercent, departureSocPercent, chargeKwh, gridEnergyKwh,
            chargeMinutes|null, chargeMinutesRange: {low, high}|null, chargeMethod,
            alternative: { same station fields as above } | null, notes: [string] }],
  assumptions: [{ key, label, value, unit, origin: user|catalog|default, note }],
  warnings: [{code, message}]  // RESERVE_TIGHT, CHARGE_TIME_ROUGH, OPENING_HOURS_UNKNOWN, COST_NOT_CALCULATED
  confidence: 'medium'|'low', geometry: GeoJSON LineString ([lng, lat], ≤ 1000 points),
  disclaimer, savedPlanId|null }
```
Refusals (422, never an invented plan): `TRIP_VEHICLE_DATA_MISSING` (`details.missing`: batteryUsableKwh /
consumptionKwhPer100km / inlets), `TRIP_NO_REACHABLE_STATION` (`details: {reason: no_reachable_station |
too_many_stops | charge_time_unknown | road_distance_longer, atKm, rangeKm, stationsConsidered}`), plus field errors.
Routing provider failures keep the provider's own errors (e.g. 422 `ROUTE_NOT_FOUND`, 502 upstream).

Saved plans: `GET /me/trips` (paginated `{id, title, originLabel, destinationLabel, plannedDepartureAt,
routingProvider, summary, createdAt}`), `GET /me/trips/:id` → `{id, title, createdAt, plan, staleNotice}`,
`DELETE /me/trips/:id` → 204. Plans are stored only on `save: true` (no location history).

## 8. Decisions

1. **Calculators are a pure engine** (`calculators/engine/*`, no I/O, no clock) returning result + formula + steps +
   assumptions (with origin) + warnings + confidence + units. The HTTP DTOs only check types; ranges / required /
   cross-field rules live in the engine (single source of truth) and are mapped to 422 `VALIDATION_FAILED`.
2. **Efficiency** is a fraction in (0, 1], default 0.9 shown as an editable `default` assumption (confidence drops to
   medium). It is never applied to energy / consumption the user marked as grid-side (`energyBasis: grid`,
   `consumptionBasis: grid` — catalog WLTP/EPA values are grid-side), so losses are never counted twice.
3. **No built-in prices.** Missing price = 422. Admin reference prices live in `energy_prices` (existing table) with
   effective date + source; the client lists them (`/calculators/reference-prices`) and passes `referencePriceIds`;
   results show origin `reference_price`, the source and date; > 365 days old → `REFERENCE_PRICE_OLD` warning.
   Unit follows the energy type (electricity → per_kwh, fuels → per_liter). Admin CRUD needs `prices.write`.
4. **AC time** = grid energy ÷ min(car on-board limit, station, phases × volts × amps). Car limit unknown → confidence
   low + warning. **DC time** integrates a documented curve (0.5 % steps, linear interpolation, capped at station
   power); without a covering curve only a range (average power 50–90 % of the limiting peak), `minutes: null`,
   confidence low. A curve with zero power in the window or no data at all → 422, never a division by zero.
5. **Catalog fill**: `VehicleDataService` picks market-specific over global values, best reliability first, never
   `disputed`; consumption prefers WLTP → EPA → CLTC → NEDC → OTHER and is never converted (cycle in the note).
   AC/DC limits fall back to verified inlet max power. User-entered values always win.
6. **Charging-log report** uses only the user's rows; odometer-delta consumption (see §3); spend grouped per currency
   (never converted); odometer readings must be monotonic per car (422 otherwise) so the method stays valid.
   Cost currency defaults to the car market currency when a cost is entered.
7. **Garage**: a car = published trim (→ model year) + market; `listedInMarket` flags trims without a record in that
   market (allowed: grey imports) because compatibility / prices need it. Max 20 cars; one primary.
8. **Reminders**: status and `notifyOn` computed at read time (UTC calendar days); completing a repeating reminder
   creates the next one (date + months, end-of-month safe; km from the reading at completion). Local notifications
   are scheduled by the app (no server push for reminders yet).
9. **Notifications**: the in-app center always records what the type switches allow (`channels.inApp` is always
   true); push only when the provider is configured, the user enabled push and has devices; deliveries rows record
   `sent` / `skipped` (`channel_not_configured`, `token_revoked`) / `failed`; quiet hours postpone push to the window
   end (`scheduled_for`); retries with back-off (max 5), invalid tokens revoked; dispatch runs right after notify()
   and every minute on JOBS_ENABLED instances. Email channel is not implemented (`channels.email: false`).
   Device tokens are per signed-in user (guests get no personal push); re-registering an installation replaces its
   old token; a token seen on another account moves to the caller.
10. **Article trigger** uses notification SUBSCRIPTIONS (not home interests): followers of linked variants → models →
    brands (derived from linked models/variants too) → category, filtered by article markets (a subscription with a
    market must match one; no article markets = all). Most specific subject wins; demo articles notify nobody;
    re-publishing never repeats (dedupe key).
11. **Trips**: greedy "farthest reachable compatible station, DC preferred when the car has DC", reserve kept at every
    arrival, detour = 2 × offset from the route, closed-at-ETA / private / planned / closed / temporarily unavailable /
    demo / merged stations excluded, unknown hours allowed but flagged; only what is needed is charged (capped at
    `chargeToSocPercent`); then a second routing call through the stops gives the real road legs and the SoC is
    re-checked. Consumption (+ margin) is applied to the battery (conservative). Cost only from a user price.
    Compatibility = verified / manufacturer-claim inlets only (same rule as the stations module; helpers reused
    from `stations/common`).

### Schema change requests

None. Existing tables were enough (`user_vehicles`, `charging_logs`, `reminders`, `trip_plans`,
`notification_*`, `device_tokens`, `energy_prices`).

## 9. Verification (commands run in `backend/`)

- `npx tsc -p tsconfig.json --noEmit` — clean (whole project, including other teams' in-progress files at the time).
- `npx eslint` + `npx prettier --write` on my directories and `test/personal-*.ts` — clean.
- `npx jest` — 63 suites / 741 tests passed (mine: calculators engine 45, charging report 8, reminder rules 5,
  notification rules 5, trip planner 12).
- `npm run test:e2e -- test/personal- test/api-hygiene.e2e-spec.ts test/foundation.e2e-spec.ts test/platform-settings.e2e-spec.ts`
  — 7 suites / 126 tests passed (personal-garage 17, personal-calculators 13, personal-notifications 16, personal-trips 9).
- `npm run openapi:export -- <scratchpad>/openapi.json` — builds (309 paths incl. all routes above); the shared
  `backend/openapi.json` was NOT rewritten.

## 10. Not done / not verified

- No real FCM/APNs delivery was tested (fake gateway in e2e); no real routing provider was called (mocked in e2e).
- Server-side "reminder due" / price-alert / new-tour notifications are not emitted yet (only article publish);
  `NotificationService.notify()` is ready for them. No admin notification campaigns API.
- Trips: station tariffs are not used for cost (only a user price); no per-stop live availability at ETA (only
  "now", clearly labelled); no elevation / temperature model (covered by the visible margin assumption).
- Calculators: no CO2 comparison; TCO has no financing / inflation / discounting (stated assumptions).
- `backend/openapi.json` not regenerated; `npm run build` not run (shared `dist/`).

## 11. Notes for other teams

- **Integrator / settings owner**: `IMPLEMENTED_FEATURES` in `src/modules/settings/settings.types.ts` is still empty,
  so `/app-config` reports these features as false. Add `calculators`, `garage`, `chargingLogs`, `reminders`,
  `notifications`, `tripPlanner` (trip planner stays false automatically while routing is unconfigured).
- **Mobile**: use `notifyOn` for local reminder notifications; register the FCM token with `POST /me/devices`
  (`installationId` = X-Device-Id) after sign-in and call `POST /me/devices/unregister` before sign-out; open
  `deepLink` only after the app's safe-path check. Show `assumptions[].origin` / `note`, `warnings` and
  `confidence` on every calculator and trip result; `minutes: null` + `minutesRange` means "rough range".
- **Other modules**: inject `NotificationService` (export of `NotificationsModule`) and call
  `notify({ userIds, type, category, dedupeKey, content: {ar:{title,body}, en:{title,body}}, deepLink, data })`.
  `VehicleDataService` (export of `CalculatorsModule`) resolves catalog battery / charging / consumption values.
