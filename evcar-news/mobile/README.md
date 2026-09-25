# EV Car News — Flutter app (`mobile/`)

Android + iOS client for evcar.news: news, car catalog, comparisons, 360°
interior tours and charging stations. Contract: `docs/ARCHITECTURE.md` §6 and
the API contract §4.4.1; product rules: `docs/REQUIREMENTS_AR.md`.
Version choices and trade-offs: `docs/decisions/mobile.md`.

> **Status (foundation stage):** app shell, routing, core networking/auth,
> offline cache, settings, app-config, localization, design system and the
> account screens are implemented and tested. Every other screen is an honest
> "قيد التنفيذ / Under construction" placeholder in its own feature folder
> (no data, nothing pretends to work).

## Quick start

```sh
export PATH=/opt/flutter/bin:$PATH       # Flutter 3.47.x / Dart 3.13
cd mobile
flutter pub get
flutter analyze                          # must be "No issues found!"
flutter test                             # unit + widget tests
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1   # Android emulator
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1  # iOS simulator
```

Live contract check against a running API (skipped by default, so plain
`flutter test` stays hermetic):

```sh
EVCAR_LIVE_API=http://localhost:3000/api/v1 \
EVCAR_LIVE_EMAIL=owner@example.com EVCAR_LIVE_PASSWORD='…' \
flutter test test/live
```

| `--dart-define`        | Default                          | Meaning |
|------------------------|----------------------------------|---------|
| `API_BASE_URL`         | `http://10.0.2.2:3000/api/v1`    | API base incl. `/api/v1` |
| `SHARE_BASE_URL`       | `https://evcar.news`             | share links until `/app-config` loads |
| `API_TIMEOUT_SECONDS`  | `20`                             | connect/receive timeout |

Plain HTTP is only allowed to the local dev host: Android **debug** builds
(`src/debug/res/xml/network_security_config.xml`: 10.0.2.2/localhost) and iOS
`NSAllowsLocalNetworking`. Release/profile builds are HTTPS-only.
Nothing secret is compiled into the app.

### Building packages

There is no Android SDK in the dev container, so **no APK/AAB was built
here**. On a machine with the Android SDK / Xcode:

```sh
flutter build apk --release --dart-define=API_BASE_URL=https://<api-host>/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=https://<api-host>/api/v1
flutter build ipa --dart-define=API_BASE_URL=https://<api-host>/api/v1   # needs Apple team + signing
```

Release signing: create `android/key.properties` (git-ignored) with
`storeFile`, `storePassword`, `keyAlias`, `keyPassword`. Without it the
release build is signed with the **debug key** (Gradle prints a warning) and
must not be published. App Links need the release certificate's SHA-256 in
`https://evcar.news/.well-known/assetlinks.json` (backend `share` module).
iOS Universal Links: see `ios/Runner/Runner.entitlements` (placeholder, not
yet wired — requires the Associated Domains capability on the Apple team).

## Layout

```
lib/
  main.dart                 bootstrap → ProviderScope → EvCarApp
  app/
    app.dart                MaterialApp.router (locale, theme, text scale, formatters)
    bootstrap.dart          prefs, SQLite cache, version, licences (before runApp)
    di/providers.dart       infrastructure providers (Dio, ApiClient, caches, tokens, locale/market)
    router/                 app_routes.dart (all paths), app_router.dart, deep_links.dart, nav shell
    theme/                  colours, light/dark theme, MultipliedTextScaler
  core/
    api/                    ApiClient, ApiException, Paged, Dio factory, interceptors
    auth/                   AuthTokens, TokenStorage (secure), TokenRefresher (single-flight), SessionEvents
    cache/                  CacheDatabase (sqflite), JsonCache, SavedItemsStore, fetchWithCache
    app_config/             AppConfig model + controller (/app-config, offline-first)
    settings/               AppSettings + SettingsController (SharedPreferences)
    connectivity/           ConnectivityService + isOnlineProvider
    formatting/             AppFormatters (numbers, units, money, dates, Arabic digits)
    errors/                 PermissionDeniedException, error → UI presentation
    html/                   HtmlSanitizer (allow-list) for article HTML
    l10n/                   context.l10n, relativeTime
    links/                  openExternalUrl (url_launcher, scheme allow-list)
  features/<feature>/{data,domain,presentation}/
  shared/widgets/           AsyncStateView, StateMessageView, NotAvailableValue, SourceBadge,
                            ReliabilityBadge, SectionHeader, AppCard, chips, CachedDataNotice,
                            OfflineBanner, SafeHtml, UnderConstructionView, SignInRequiredView
  l10n/parts/               per-feature ARB sources (edit these)
  l10n/app_{ar,en}.arb      merged (generated — do not edit)
  l10n/generated/           gen-l10n output (generated — do not edit, committed)
assets/
  fonts/                    IBM Plex Sans Arabic (OFL, OFL.txt included)
  panorama/                 viewer.html/js/css + vendored Pannellum 2.5.7 (MIT)
tool/
  merge_arb.dart            ARB parts → app_{ar,en}.arb
  viewer_bridge_check.cjs   headless check of the 360° bridge (jsdom)
```

### Rules for feature teams

* **Work only in your feature folder** (`lib/features/<feature>/`,
  `lib/l10n/parts/<feature>_{ar,en}.arb`, `test/features/<feature>/`).
  Placeholder screens keep their class name + constructor so the router does
  not change; if you must change a constructor, update
  `lib/app/router/app_router.dart` in the same change.
* **No code generation** (no build_runner/freezed/json_serializable/
  riverpod_generator). Models are hand-written with `fromJson`/`toJson`
  using `core/json/json_readers.dart`. Missing values stay `null` and are
  rendered with `NotAvailableValue` — **never 0**.
* Talk to the API only through `ApiClient` (`ref.watch(apiClientProvider)`):
  it unwraps `{data}`/`{data,meta}` and always throws `ApiException`.
  Public endpoints that must not carry the user's token (e.g. auth) pass
  `skipAuth: true`.
* Every screen handles loading / empty / error / offline /
  permission-denied — use `AsyncStateView`. Cached data must show
  `CachedDataNotice` (with its saved time); cached charger status is never
  shown as live.
* Personal features wrap their body in `AuthGate(returnTo: <route>)`;
  guests see an explanation and sign-in/register buttons. Public content is
  never behind sign-in.
* Feature flags come from `/app-config`: `ref.watch(featureFlagProvider('x'))`
  (unknown flags are **off**). Hide features whose integration is not
  configured (e.g. trip planner → flag `tripPlanner`).
* Format numbers/units/money/dates with `AppFormatters.of(context)`
  (respects language and the Arabic-digits setting).
* Accessibility: 48dp targets (theme defaults), `Semantics` labels on icons
  and custom controls, never colour-only signalling (icons + text).

## Localization

Each feature owns `lib/l10n/parts/<feature>_ar.arb` and `<feature>_en.arb`.
Keys must start with the camelCase feature name (`charging_logs` →
`chargingLogs…`). Put `@key` metadata (description, placeholders) in the
`_en` file (the template locale).

```sh
dart run tool/merge_arb.dart     # merge parts → lib/l10n/app_{ar,en}.arb
flutter gen-l10n                 # regenerate lib/l10n/generated/*
dart run tool/merge_arb.dart --check   # CI: fails if the merged files are stale
```

`merge_arb` fails (exit 1, nothing written) on: duplicate keys (inside a file
or across parts), keys missing in one locale, wrong prefix, bad file names,
`@@locale` mismatch, orphan metadata. Use strings with
`context.l10n.<key>` (`import 'core/l10n/l10n.dart'`). The UI language
(`ar`/`en`, RTL/LTR) is independent from the market (EG/SA/AE) and is sent as
`Accept-Language`; the market as `X-Market`.

## Routes

All paths are in `lib/app/router/app_routes.dart`. Tabs (`/`, `/cars`,
`/compare`, `/charging`, `/account`) keep their own stack and scroll position
(`StatefulShellRoute.indexedStack`). Detail screens are pushed full-screen on
the root navigator (so opening a car from Home keeps Home underneath).

| Route | Screen (owner) |
|---|---|
| `/news`, `/news/:slug` | news list / article (news) |
| `/cars/:slug`, `/cars/:slug/tour/:tourId`, `/brands/:slug` | car / 360° tour / brand (cars, tours) |
| `/compare/s/:shareId`, `/recommendations` | shared comparison / recommendation (compare) |
| `/charging/stations/:id`, `/trips` | station (charging) / trip planner (trips) |
| `/search?q=`, `/calculators`, `/encyclopedia[/:slug]`, `/services` | search, calculators, encyclopedia, services directory |
| `/garage`, `/charging-logs`, `/reminders`, `/notifications`, `/favorites`, `/saved` | personal features |
| `/settings`, `/account/profile`, `/account/sessions`, `/account/delete` | settings / account (done) |
| `/auth/login|register|verify-email|forgot-password|reset-password` | auth (done) |

Deep links (`deep_links.dart`): `https://evcar.news/n/<slug>` → `/news/<slug>`,
`/cars/<slug>` → same, `/compare/<id>` → `/compare/s/<id>`,
`/verify-email?token=` and `/reset-password?token=` → `/auth/...`.
Android App Links are declared for `/n/`, `/cars/`, `/compare/`.

## Auth & session

* `POST /auth/login` → tokens in secure storage (Keychain/Keystore),
  refresh token in the body (`X-Client-Type: mobile`).
* `401 TOKEN_EXPIRED` → exactly one `POST /auth/refresh` shared by all
  concurrent requests (`TokenRefresher`), then one retry. Refresh rejected →
  local sign-out + "session ended" notice; network error → user stays signed
  in. Any other 401 on an authenticated request ends the session.
* Startup restores the session with `GET /me`; offline it shows the saved
  profile (marked offline).
* Google/Apple sign-in are **not implemented** in the app (no native SDK
  plugins yet; backend returns 503 until configured) — no buttons are shown.

## 360° viewer (skeleton)

`assets/panorama/viewer.html` loads only bundled files (Pannellum in
`assets/panorama/pannellum/`, CSP meta, no remote scripts). `viewer.js`
defines the message protocol (documented at the top of the file): the app
sends `init / setScene / resetView / setOrientation / destroy` through
`window.evcarViewer.receive(json)`; the page answers on the
`EvcarBridge` JavaScript channel (`ready / sceneLoaded / sceneChanged /
hotspotClicked / orientation / error`). All URLs must be https on the
configured media origin (the CSP is tightened to it at init); hotspot text is
set with `textContent`. The Flutter side (`TourViewerScreen` with
`webview_flutter`, navigation delegate allowing only the bundled page, sensor
stop on dispose) is **not implemented yet** (tours feature). Media must be
served with CORS (`Access-Control-Allow-Origin`) for WebGL textures.

Headless check of the bridge (no WebGL):

```sh
npm i --prefix /tmp/viewer-check jsdom@30.1.1
NODE_PATH=/tmp/viewer-check/node_modules node tool/viewer_bridge_check.cjs
```

## Tests

`test/helpers/` has `FakeHttpAdapter` (route table for Dio, records requests)
and `pumpTestApp()` (whole app with in-memory caches/tokens and fake
connectivity). Inside `testWidgets` do not `await` a Dio call directly —
trigger it and `await tester.pumpAndSettle()` (the fake clock must advance).
Run `flutter test --timeout 60s` to fail fast on hangs.
