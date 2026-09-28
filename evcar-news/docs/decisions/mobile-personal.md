# Decisions — mobile-personal (Account hub, garage, charging log, reminders, calculators, notifications, trips)

Area: `mobile/lib/features/{account,garage,charging_logs,reminders,calculators,notifications,trips}/**`,
ARB parts `mobile/lib/l10n/parts/{account,garage,charging_logs,reminders,calculators,notifications,trips}_{ar,en}.arb`,
tests `mobile/test/features/{calculators,personal}/**`.
API contract used: `docs/decisions/backend-personal.md` (§2–7) and `backend-vehicles.md` (`/cars/pickers`).
Requirements: REQUIREMENTS_AR §12, §13, §14, §16.

## 1. What was built

| Screen / route | File | Notes |
|---|---|---|
| Account hub `/account` | `account/presentation/account_screen.dart` | Guest card vs signed-in card; grouped tiles; garage car count; unread-notifications badge (icon **and** "N new" text); trip planner tile only when `features.tripPlanner` is on, otherwise a disabled tile that explains why (routing service not configured). Sign-out first cancels this phone's reminder notifications. |
| My garage `/garage` | `garage/presentation/garage_screen.dart` | Cards with brand gradient, primary badge, powertrain pill, market pill, "not sold in this market" warning (`listedInMarket=false`), odometer / sessions / open reminders tiles; 20-car limit. |
| Car `/garage/:id` | `garage_vehicle_screen.dart` | Details (missing → "Not available"), shortcuts (log for this car, new session, new reminder, calculators, spec sheet), make primary, delete (explains that logs + reminders go too). |
| Add/edit car `/garage/add`, `/garage/:id/edit` | `garage_vehicle_edit_screen.dart`, `widgets/variant_picker.dart` | Trim chosen only from the catalog cascade brand → model → year → trim (`GET /cars/pickers`, reusing `compare`'s `pickerProvider`), optional "all markets" for imports; market dropdown (enabled markets); nickname, purchase date, odometers, primary, notes. PATCH sends `variantId`/`marketCode` only when changed; cleared fields are sent as `null`. |
| Charging log `/charging-logs[?vehicle=]` | `charging_logs/presentation/charging_logs_screen.dart` | Month headers, per-car filter chips, load more, costless sessions say "No cost entered" (never 0). |
| New/edit session `/charging-logs/new[?vehicle=]`, `/:id/edit` | `charging_log_edit_screen.dart` | Only energy required; cost + currency (defaults to the car market currency), odometer, SoC start/end, duration, power, AC/DC/unknown, location; delete. Local validation mirrors the server; server 422 field errors are mapped onto the fields. |
| Reports `/charging-logs/reports` | `charging_log_reports_screen.dart`, `widgets/monthly_bar_chart.dart` | fl_chart bars for monthly spend (per currency — a selector when several; never converted) and monthly kWh; each chart has a data table + a semantics summary; per-car distance / consumption / cost per 100 km with "Insufficient data: <reason>" from the server reason codes and the consumption confidence; where-you-charge shares; method notes. Months without data are empty slots, not zero bars. Chart time runs right→left in RTL. |
| Reminders `/reminders`, `/reminders/new[?vehicle=]`, `/:id/edit` | `reminders/presentation/*` | Open/completed filter, status as icon + text pill, due date/odometer, relative "in N days / N km", repeat info, mark done (asks the odometer for car reminders; shows the next occurrence), CRUD. |
| Calculators `/calculators`, `/calculators/:kind` | `calculators/presentation/*` | 7 app calculators (home, public, charging time, per 100 km, monthly, vs petrol, TCO) → 6 engine kinds. See §2. |
| Notifications `/notifications` | `notifications/presentation/notifications_screen.dart` | All/unread, unread = bold + "New" pill + dot, tap = mark read + open the link, swipe/menu delete, mark all read, load more. |
| Preferences `/notifications/preferences` | `notification_preferences_screen.dart` | Types switches, followed topics (brand / model / news category / market; remove), channels (in-app always on; push switch disabled with the server's reason when not configured; email "not available yet"), quiet hours (time pickers, device IANA zone via flutter_timezone, fallback market zone), unsubscribe from all / resume. |
| Trip planner `/trips` | `trips/presentation/trip_planner_screen.dart`, `trip_plan_view.dart` | Reachable only when `tripPlanner` is announced (router already redirects otherwise). From/to via my location (asked only on tap), city presets of the market, or map point (when the map is configured); car from garage or catalog trim; SoC now / reserve; departure; editable assumptions (consumption, margin, charge-to, price); optional save. Result: summary tiles, confidence, warnings, stops (open at ETA, availability "now (not at arrival)" only when `freshness=live`, alternative, rough charge-time pill, directions via the charging feature's sheet), legs, assumptions with origin, disclaimer, routing attribution. 503 / 422 refusals shown as honest explanations (never a made-up plan). Saved trips list/open/delete. |

Shared helpers (my area): `garage/common/personal_forms.dart` (Arabic-digit number parsing, ISO dates,
server field errors, `NumberField`), `garage/common/personal_widgets.dart` (`PersonalPage` = sign-in
explanation for guests with an app bar, `SectionCard`, `InfoRow`, `InlineNotice`, `ForwardChevron`, `AddFab`).

## 2. Calculators: Dart engine = backend engine

- `calculators/domain/engine/*.dart` is a line-by-line port of `backend/src/modules/calculators/engine/*.ts`:
  same validation (field names, rule codes, bilingual messages), same formulas, same steps with the same
  expression strings, same assumptions/origins, warnings, confidence, units and disclaimer.
- Money uses `Dec` (`decimal.dart`), a BigInt decimal reproducing decimal.js as the backend configures it
  (20 significant digits, ROUND_HALF_UP on every operation, `toFixed` keeps `-0.00`, rates to 4 dp without
  trailing zeros). JS number printing (`jsStr`) and `Math.round` (`jsRound`) are reproduced for the
  expressions and rounded values.
- **Parity proof**: `test/features/calculators/fixtures/generate_engine_parity.ts` runs the *TypeScript*
  engine over 41 cases × 2 languages (results, errors, provenance) and writes `engine_parity.json`;
  `engine_parity_test.dart` requires identical JSON from the Dart engine (82/82 pass). Regenerate after any
  backend engine change (command in the script header).
- Required vector: 60 kWh usable, 20→80 % = 36 kWh; at 0.9 → 40 kWh grid (`calculators_engine_test.dart`),
  plus zero / negative / missing / NaN / ∞ inputs, efficiency range, no default prices, free price 0 allowed,
  zero-power curve and zero distance refused (no division by zero), DC without curve = range only.
- Where it runs: **on the phone by default** (instant, offline). When the user picks a car (garage car or
  catalog trim) the same request goes to `POST /calculators/<kind>` with `userVehicleId`/`variantId`, so the
  server fills missing catalog values with their source notes (the app never guesses catalog values).
  Reference prices (`GET /calculators/reference-prices?market=`) are applied on the device exactly like the
  server's `applyReferencePrices` (value, currency, provenance note "Reference price · source · effective from
  date [· DEMO]", default price date = oldest effective date, `REFERENCE_PRICE_OLD` warning, unit/currency
  refusals); for the server path they are sent as `referencePriceIds` without the value.
- No stale defaults: no price is ever pre-filled; currency defaults to the market currency; price date is
  optional and its absence is shown ("Price date not given" + the engine warning). Efficiency is entered as a
  fraction (the engine's unit) with the 0.9 default explained.
- DC charging curves are not typed by hand; they come from the catalog (server path). Without one the result
  is a labelled low-confidence range.

## 3. Reminders → local notifications

- `reminders/application/reminder_notifications.dart`: a per-device switch (off by default). Turning it on is
  the only moment the OS permission is requested; a denial turns it back off and shows an explanation (reminders
  still visible in the app). Web preview / unsupported → explanatory notice.
- Every time the open reminders load, `sync()` schedules one notification per open reminder whose `notifyOn`
  day at 09:00 (device time) is still in the future (id = `localNotificationIdFor('reminder:<id>')`, tap route
  `/reminders/<id>/edit`, validated by the app shell), and cancels the ids it scheduled earlier that are no
  longer needed. Past times are not re-fired. Deleting a reminder cancels its notification immediately.
  Sign-out (account hub) cancels all of them; a guest session syncs an empty list (also cancels).

## 4. Notification deep links

`resolveNotificationLink()` (`notifications/domain/notification_models.dart`): app paths must pass
`AppRoutes.safeReturnPath` and are mapped like web links (`/n/x` → `/news/x`); `https://evcar.news/...` opens the
in-app screen; other `https` URLs open in the browser; `http`, `javascript:`, `intent:`, custom schemes,
`//host`, back-slashes, `/auth/*` and URLs with user-info are ignored (the body is shown in a sheet instead).
Opening marks the notification read (optimistic, rolled back on failure).

## 5. Privacy / data

- Personal lists are **not** written to the offline JSON cache (they would outlive a sign-out on a shared
  phone); offline shows the offline state. Calculators work fully offline.
- Trip planner location is read once on tap and only sent as the plan origin; nothing is stored unless the
  user saves the plan (server-side, private).
- No push token registration: `firebase_messaging` is not a dependency (prep-mobile decision), so
  `POST /me/devices` is not called; the preferences screen shows the server's push status honestly.

## 6. Changes outside my folders (minimal, required)

- `mobile/test/app/routes_test.dart`: `/trips`, `/calculators`, `/calculators/home-charging` moved from the
  placeholder list to `_implemented`; `/notifications` moved to the personal (guest sees sign-in) list.
- `mobile/test/features/auth/auth_flow_test.dart`: after login the garage now shows a large collapsing title
  (two `AppBar` title widgets) → `findsWidgets` + "no SignInRequiredView".
- Reused (read-only) from other features: `compare` `pickerProvider`/`PickerQuery`, `news`
  `newsCategoriesProvider`, `charging` `locationServiceProvider`, `cityPresets`, `pickPointOnMap`,
  `showDirectionsSheet`. No router, pubspec or shared-kit edits. No new dependencies.

## 7. Not done / limits

- APK not built here (no Android SDK); widget tests run in the Flutter test environment only.
- No FCM token registration (no push SDK in the app).
- Calculators: no hand-entered DC curve; TCO has no financing/inflation (engine assumption, shown).
- Charging log: no offline queue for entries made without a connection (the form shows the error).
- `IMPLEMENTED_FEATURES` on the server still decides visibility: until the integrator adds calculators,
  garage, chargingLogs, reminders, notifications, tripPlanner there, `/app-config` hides these screens.

## 8. Verification (run in `mobile/`)

- `dart run tool/merge_arb.dart --check` + `flutter gen-l10n` — 44 parts, 2 locales OK.
- `flutter analyze` — no issues (whole app).
- `flutter test test/features/calculators test/features/personal test/app test/features/auth` — 174 passed:
  engine parity 83 (82 fixture cases + coverage check), engine unit 17, models/parsing 11, deep links +
  reminder scheduling 8, widget 8 (calculator on-device §23 vector, localized field errors, guest sign-in
  gates, garage + report insufficient-data, notification tap → read + route, trip planner validation,
  ar-dark / en-light at 200 % text across 12 personal screens without overflow).
- Full `flutter test` at the time of writing: 619 passed, 7 skipped, 2 failing — both in
  `test/features/community/community_screens_test.dart`, owned by the community agent and in progress.

## Review 3 (2026-09-28)

See `review-fixes-3.md`: calculator unit rates use `AppFormatters.rate()`; notification preferences show only the server-`supported` switches and follow chips; `INTEGRATION_QUOTA` is shown as "try again later".
