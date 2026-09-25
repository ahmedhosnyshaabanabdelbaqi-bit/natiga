# Decisions — mobile (Flutter)

Area: `mobile/`. Contract: ARCHITECTURE §6 + API §4.4.1. Checked against
pub.dev on 2026-09-25 with Flutter **3.47.5** / Dart **3.13.4** (stable).

## 1. Dependency versions (pinned exactly; `pubspec.lock` committed)

| Package | Version | Latest on pub.dev | Why this version |
|---|---|---|---|
| flutter_riverpod | 3.4.3 | 3.4.3 | Latest. Riverpod 3: no codegen used (plain `Provider`/`Notifier`/`AsyncNotifier`). Automatic provider retry is disabled in `ProviderScope(retry: …)` — screens offer an explicit retry. |
| go_router | **17.5.0** | 18.0.1 | **go_router 18 migrated to the decoupled `material_ui` package.** Flutter 3.47's template and `flutter_localizations`/gen-l10n still use `package:flutter/material.dart`; with 18.x, go_router cannot detect our `MaterialApp` (it looks for `material_ui`'s `MaterialApp` type) and falls back to transition-less pages, and theme/localizations do not cross between the two Material libraries. 17.5.0 is the newest release on framework Material. |
| cached_network_image | **3.4.1** | 4.0.2 | Same reason: 4.x depends on `material_ui`. 3.4.1 is the newest on framework Material. Keeping the dependency graph free of `material_ui` (verified in `pubspec.lock`). |
| dio | 5.11.1 | 5.11.1 | Latest. |
| flutter_secure_storage | 11.2.0 | 11.2.0 | Latest. iOS items use `first_unlock_this_device` (not synced to other devices). |
| sqflite / path | 2.4.4 / 1.9.1 | same | Latest. |
| shared_preferences | 2.5.5 | 2.5.5 | Latest; non-sensitive settings only. |
| connectivity_plus | 7.3.1 | 7.3.1 | Latest. Used as a hint only; transport errors still mark the UI offline. |
| intl | 0.20.3 | 0.20.3 | Required by `flutter_localizations` (^0.20.3). |
| share_plus / url_launcher | 13.3.0 / 6.3.2 | same | Latest. |
| geolocator | 14.0.3 | 14.0.3 | Latest (while-in-use location only). |
| flutter_map | 8.3.2 | 8.3.2 | Latest. |
| flutter_map_marker_cluster | 8.2.2 | 8.2.2 | Latest; maintained (Sep 2025, same major as flutter_map 8). |
| latlong2 | **0.9.1** | 0.10.1 | `flutter_map_marker_cluster 8.2.2` requires `latlong2 ^0.9.1`. |
| webview_flutter | 4.14.1 | 4.14.1 | Latest; only for the isolated 360° viewer. |
| sensors_plus | 7.1.0 | 7.1.0 | Latest (optional gyroscope). |
| package_info_plus | 10.2.1 | 10.2.1 | Latest. |
| flutter_widget_from_html_core | 0.17.4 | 0.17.4 | Chosen over `flutter_html` 3.0.0 (last release Mar 2025): actively maintained (Sep 2026), renders natively without WebView/JS, core package has no extra plugin deps. Input is additionally sanitized in-app (`HtmlSanitizer`). |
| html | 0.15.7 | 0.15.7 | Parser for the allow-list sanitizer. |
| flutter_lints (dev) | 6.0.0 | 6.0.0 | Latest. |
| sqflite_common_ffi (dev) | 2.4.3 | 2.4.3 | Runs the real SQLite cache code in unit tests (host `libsqlite3`). |

Not added (not needed yet / owned by later stages): `google_sign_in`,
`sign_in_with_apple`, push (FCM/APNs), `permission_handler`.

Font: **IBM Plex Sans Arabic** 1.101 (Regular/Medium/SemiBold/Bold) from
`github.com/google/fonts/ofl/ibmplexsansarabic`, SIL OFL 1.1 — `assets/fonts/OFL.txt`
is bundled and registered on the in-app licences page. It covers Arabic and Latin.

Pannellum **2.5.7** from the npm tarball (`npm pack pannellum`), MIT
(`assets/panorama/pannellum/COPYING`). SHA-256: `pannellum.js`
51b8df674333612adbd807b6f47940d4d7aa07317d949d3f1314f84de965fc3c,
`pannellum.css` da0906e704524cca414ce6160c7be218048dcdd0c13fafa84184f6ea0b084785.

## 2. Architecture choices

* **Routing.** Five tab roots in a `StatefulShellRoute.indexedStack` (each tab
  keeps its stack, state and scroll position; tapping the active tab pops to
  its root). All other screens are top-level routes on the root navigator, so
  opening a car from Home does not switch tabs and back returns to the same
  place. Account sub-pages live inside the Account tab. Redirects: deep-link
  mapping, guests → sign-in only for `/account/profile|sessions|delete`,
  signed-in users skip the login page. `from=` return paths are validated
  (no open redirects).
* **Placeholders.** Each not-yet-built route has its own screen class in its
  feature folder rendering `UnderConstructionScreen` ("قيد التنفيذ", shows the
  requested path, no data). Personal features (garage, charging log,
  reminders) are already wrapped in `AuthGate` so guests see why an account
  is needed.
* **Feature flags (review 2).** `lib/core/app_config/features.dart` maps every
  route, tab, account tile, home action and home section to its `/app-config`
  flag. Anything whose flag is off (all of them today: the server only
  announces implemented modules) is hidden and links into it land on Home;
  unknown flags are off. Offline items, settings and account pages are
  always available.
* **Branding.** `BrandTitle` shows the admin-uploaded logo (disk-cached via
  `CachedNetworkImageProvider`, decorative for screen readers) next to the
  app name; no logo or a failing image → the name only.
* **Networking.** `ApiClient` unwraps the envelope and always throws a typed
  `ApiException` (kind + server code + localized message + field errors +
  requestId). Headers: `Accept-Language` (UI language), `X-Market`,
  `X-Client-Type: mobile`, `X-App-Version`. Values are read per request, so
  changing language/market needs no rebuild.
* **Session.** Tokens in secure storage; single-flight refresh
  (`TokenRefresher`) shared by all concurrent 401 `TOKEN_EXPIRED` responses;
  requests issued during a refresh wait for it; one retry only. Refresh
  rejected (400/401/403) → tokens cleared + one-time "session ended" notice;
  a network error / timeout during refresh is retried with the same token
  after 1 / 3 / 8 s (the server's 60 s grace window answers with the same new
  token, so a lost response does not sign the user out); still failing or
  5xx → user stays signed in. Sign-in sends `X-Device-Id` (random
  installation id in secure storage) so the server exempts this device from
  an account lock triggered by strangers. Other 401s on an
  authenticated request end the session. Logout waits for an in-flight
  refresh, calls `/auth/logout` best-effort (`skipAuth`), and always clears
  locally. Same policy as the admin client (`decisions/admin.md`).
* **Offline.** SQLite (`evcar_cache.db`): `json_cache` (key → JSON, `saved_at`,
  etag; keys include language + market) and `saved_items` (explicitly saved
  articles/spec sheets, never auto-purged). `fetchWithCache` is network-first
  and falls back to the cached copy only for connectivity/timeout/5xx errors;
  results carry `fromCache` + `savedAt` and UIs must show
  `CachedDataNotice`. If the DB cannot be opened the app uses in-memory
  caches instead of crashing. "Clear cached data" keeps saved items, the
  saved profile and the last server config.
* **App config.** `/app-config` is offline-first: cached copy immediately +
  background refresh; else network; else built-in fallback (brand colours,
  EG/SA/AE launch markets, **all feature flags off, map not configured**).
  Branding colours re-theme the app live. The settings page shows whether
  server settings are fresh, saved (with date) or defaults.
* **Settings.** Language (device/ar/en) is independent of market; theme
  light (default)/dark/system; text size is a **multiplier on top of the
  system font scale** (`MultipliedTextScaler`, keeps Android's non-linear
  scaling); optional Arabic-Indic digits.
* **Formatting.** `AppFormatters` is pure Dart: `null` in → `null` out
  (rendered as "غير متوفر"), grouped numbers, localized unit labels
  (Arabic: كم، كيلوواط ساعة، كيلوواط…), money from decimal strings with
  ج.م / ر.س / د.إ, durations, dates in local time. Arabic-Indic digits are
  produced by explicit digit/separator mapping (intl's plain `ar` locale
  prints Western digits; mapping keeps output deterministic and testable).
* **Localization.** Per-feature ARB parts merged by `tool/merge_arb.dart`
  (duplicate/missing/prefix checks, `--check` for CI). Merged ARB files and
  gen-l10n output are **committed** so `flutter analyze` works on a clean
  checkout; they are regenerated, never edited. Keys are prefixed by feature
  so parallel teams cannot collide.
* **Article HTML.** Rendered natively by `flutter_widget_from_html_core`
  after an allow-list sanitizer: scripts/styles/forms/SVG dropped, only
  https (and http/mailto for links) URLs, relative URLs resolved against the
  share base, iframes/videos become plain "watch at source" links, event
  handlers/inline styles removed. Links open in the external browser.
* **Google/Apple sign-in:** not implemented in the app (no SDK plugins yet,
  backend answers 503 until configured). No buttons are shown.
* **Client-side password rule:** 8–128 characters for fast feedback only;
  the server's 422 field errors are authoritative and shown under the field.

## 3. Platform configuration

**Android** (`news.evcar.app`, label "EV Car News"): permissions INTERNET,
ACCESS_NETWORK_STATE, ACCESS_COARSE/FINE_LOCATION (no background location);
gyroscope/GPS declared optional. App Links (`autoVerify`) for
`https://evcar.news` paths `/n/`, `/cars/`, `/compare/` (needs
`assetlinks.json` with the release certificate SHA-256 from the backend
`share` module). `allowBackup=false` (secure-storage keys do not survive
restore). Network security config: HTTPS only; the **debug** variant allows
cleartext to 10.0.2.2/localhost for the dev API. `<queries>` for https, geo,
google.navigation, mailto, tel (url_launcher, external navigation).
Release signing from `android/key.properties` (git-ignored); without it the
release build uses the debug key and Gradle warns — not publishable.

**iOS** (`news.evcar.app`, display name "EV Car News"): `CFBundleLocalizations`
ar/en; `NSLocationWhenInUseUsageDescription` and `NSMotionUsageDescription`
localized in `ar.lproj`/`en.lproj/InfoPlist.strings` (added to the Xcode
project as a variant group); `LSApplicationQueriesSchemes` comgooglemaps,
waze; `FlutterDeepLinkingEnabled`; ATS `NSAllowsLocalNetworking` (local dev
API over HTTP only). `Runner/Runner.entitlements` contains
`applinks:evcar.news` but is **intentionally not wired** to
`CODE_SIGN_ENTITLEMENTS`: signing would fail until the Apple team enables
Associated Domains. Steps are in the file header. `ITSAppUsesNonExemptEncryption`
is left for the release owner to declare.

## 4. 360° viewer skeleton

`assets/panorama/viewer.html` + `viewer.js` + `viewer.css`, only local
scripts. Baseline CSP meta (`script-src 'self'`, `style-src 'self'`, no
frames/objects/forms/base); on `init` the page appends a second CSP meta
restricting `img-src`/`connect-src` to the configured media origin (policies
intersect, so it can only tighten). Messages are schema-validated; hotspot
tooltips are built with `textContent` and Pannellum runs with
`escapeHTML: true`; the bridge object is frozen/non-writable; orientation is
stopped when the page is hidden or destroyed. Pannellum's fullscreen button
and external "About" link are hidden (fullscreen is native). Media servers
must send CORS headers for WebGL. Checked headlessly with jsdom and a
Pannellum stub (`tool/viewer_bridge_check.cjs`, 7 checks); **WebGL rendering
is not verified** (no browser/device available). The Dart side
(`TourViewerScreen`, `WebViewController`, `NavigationDelegate`, JS channel) is
left to the tours feature.

## 5. Not verified in this environment

* No APK/AAB/IPA built: no Android SDK (dl.google.com blocked) and no Xcode.
  `flutter build bundle` also needs the Android SDK here. Asset/font
  bundling is verified by `test/app/bundled_assets_test.dart` instead.
* Android manifest/Gradle and the edited `project.pbxproj` were validated
  syntactically only (xmllint, plist parsing, brace balance), not by a build.
* Live API run (integration pass, 2026-09-25): `test/live/live_backend_test.dart`
  (skipped unless `EVCAR_LIVE_API` is set) ran the real Dio stack against the
  running backend: `/app-config` → `AppConfig`, localized error envelopes
  (ar/en), 422 field errors, login → `/me` → sessions (current device) →
  rotated refresh → `PATCH /me` → logout → rejected refresh clears tokens.
  4/4 passed. Unit/widget tests still use the fake HTTP adapter.
* Login answers `403 EMAIL_NOT_VERIFIED` after a correct password on an
  unverified account; the login screen now offers "Verify my email"
  (pre-filled). Android App Links also cover `/verify-email` and
  `/reset-password` (the links in account e-mails). Session list fields are
  parsed defensively (`id` required; `deviceName`, `userAgent`, `ip`,
  `clientType`, `createdAt`, `lastUsedAt`, `expiresAt`, `current|isCurrent`
  optional).
* Launcher icons are still the Flutter defaults (no brand icon asset yet).
