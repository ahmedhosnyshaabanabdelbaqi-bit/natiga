# Decisions — prep-mobile (Flutter shared infrastructure for phase 2+)

Area: `mobile/pubspec.*`, `mobile/web/`, `mobile/lib/{app,core,shared}/**`,
placeholder screens in `mobile/lib/features/*/presentation/`, route-title
keys in `mobile/lib/l10n/parts/*`, this file. Date: 2026-09-25.
Flutter **3.47.5** / Dart **3.13.4**. Goal: let ~8 feature agents build the
remaining app screens in parallel without touching shared files.

## 1. Dependencies (pinned exactly; checked on pub.dev 2026-09-25)

| Package | Version | Why |
|---|---|---|
| `fl_chart` | 1.2.0 | charging curves, spend/consumption reports. Latest; deps only `equatable` + `vector_math`. |
| `flutter_local_notifications` | 22.3.1 | local reminders (maintenance, insurance, licence). Latest. Needs Android core-library desugaring (§3). |
| `timezone` | 0.11.1 | zoned scheduling + station "open now" in the **station's** time zone (`TimeZones.nowIn`). Required by FLN (^0.11.0). |
| `flutter_timezone` | 5.1.0 | device IANA zone name for `tz.local`. |
| `photo_view` | 0.15.0 | zoomable galleries (cars, station photos). Last release Apr 2024 but pure Dart, compiles cleanly on 3.47 (verified by `flutter build web`); `InteractiveViewer` is the fallback if it ever breaks. |
| `visibility_detector` | 0.4.0+2 | pause the 360° gyroscope / WebView work when the viewer is not visible (REQUIREMENTS §19). Google-maintained; SDK range `>=2.12 <3.0` is accepted by Dart 3. |
| `collection` | 1.19.1 | made direct (was transitive) so features may import it (`firstWhereOrNull`, equality). Same version the SDK pins. |

`pubspec.lock` still contains **no `material_ui`** (see `mobile.md` §1 for why).

Not added, on purpose:

| Package | Reason |
|---|---|
| `shimmer` 4.0.0 | depends on `material_ui` (breaks our framework-Material graph). Hand-made `Skeleton` (ShaderMask shimmer, stops when animations are disabled). |
| `app_links` | Flutter's built-in deep linking is already enabled (`flutter_deeplinking_enabled` on Android, `FlutterDeepLinkingEnabled` on iOS) and feeds go_router directly for cold and warm starts; adding `app_links` would double-handle links. Mapping lives in `lib/app/router/deep_links.dart`. |
| `permission_handler` | not needed: location permission → `geolocator` (`checkPermission/requestPermission/openAppSettings`); notification permission → `flutter_local_notifications` (`requestNotificationsPermission` / iOS `requestPermissions`); iOS motion permission is prompted by CoreMotion itself. Avoids the iOS Podfile macro setup. |
| `firebase_messaging` | push stays **config-gated on the server** (FCM/APNs adapters, `device_tokens` table). The app has no Firebase project/config files; adding it now would need `google-services.json` / `GoogleService-Info.plist` and would crash without them. The in-app notification center works without push. |
| `sqflite_common_ffi_web` | the web build is only a design preview; in-memory caches are enough (§2). |
| `image_picker` | nothing in phase 2 needs uploads from the phone (station reports are text; review photos are not in scope). Add with a decisions entry if a feature needs it. |

## 2. Web = design preview only

* `mobile/web/` created from the Flutter 3.47.5 template (generated in a
  scratch project and copied, so `flutter create .` could not add a stray
  `test/widget_test.dart`), `.metadata` lists the platform, and Flutter added
  `web/**` to the analyzer excludes. `index.html` is `lang="ar" dir="rtl"`,
  `noindex`, brand colours; icons are an original lightning-bolt mark on the
  blue→cyan gradient, generated with Pillow (script in §9).
* **Production targets are Android and iOS.** The web build shows a
  "معاينة ويب / Web preview" ribbon (`Banner` in `EvCarApp`).
* `PlatformCapabilities` (`lib/core/platform/`, provider
  `platformCapabilitiesProvider`, overridable in tests) decides fallbacks —
  features must use it, not `kIsWeb`:
  | Capability | Android/iOS | Web preview |
  |---|---|---|
  | `offlineDatabase` | SQLite cache | in-memory (`Bootstrap` skips sqflite) |
  | `secureTokenStorage` | Keystore/Keychain | **in memory only** (never browser storage; reload signs out) |
  | `localNotifications` | plugin | `UnsupportedLocalNotificationService` |
  | `panoramaWebView` / `motionSensors` | yes | no → `NotSupportedOnPlatformState` |
  | `externalNavigationApps` | yes | web maps |
* `Env.apiBaseUrl` default: `http://10.0.2.2:3000/api/v1` (emulator) or
  `http://localhost:3000/api/v1` on web; `--dart-define=API_BASE_URL` wins.
  **Backend:** add the preview origin (e.g. `http://localhost:8080`) to
  `CORS_ORIGINS` to use the preview against a local API.
* Build: `flutter build web --release --no-web-resources-cdn` (bundles
  CanvasKit so the preview works behind firewalls; ~43 MB). Serve
  `build/web` with any static server; the design kit is at `/#/dev/kit`.

## 3. Android changes (outside the listed area — required by §1)

`flutter_local_notifications` ≥ 10 makes the **Android build fail** unless
the app enables core-library desugaring, and scheduled notifications need
receivers. Since `.github/workflows/evcar-android.yml` builds the test APK
from this tree, I applied the minimum:

* `android/app/build.gradle.kts`: `isCoreLibraryDesugaringEnabled = true`
  and `coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")`
  (version from the plugin's setup guide).
* `AndroidManifest.xml`: `RECEIVE_BOOT_COMPLETED`; receivers
  `ScheduledNotificationReceiver` and `ScheduledNotificationBootReceiver`
  (boot / package-replaced). `POST_NOTIFICATIONS` + `VIBRATE` come from the
  plugin's manifest. **No exact-alarm permission**: reminders are scheduled
  `inexactAllowWhileIdle`.
* Validated with `xmllint`; **not built** here (no Android SDK:
  `dl.google.com` → 403 through the proxy; `maven.google.com` is reachable).
  The first CI APK run is the real check.
* iOS: nothing required for scheduling; to show reminders while the app is
  in the foreground the reminders feature may set the
  `UNUserNotificationCenter` delegate in `AppDelegate` (not done).

## 4. Design system (`lib/app/theme` + `lib/shared/widgets`)

Usage guide: `mobile/lib/shared/widgets/README.md` (one import:
`shared/widgets/kit.dart`). Highlights:

* Tokens: `AppSpacing`, `AppRadii`, `AppMotion` (0 ms when the OS disables
  animations), `WindowSize`/`context.pageGutter`/`context.textScale`.
* `AppPalette` theme extension: brand gradient, image scrim, skeleton
  colours, card shadow (light only), 8 `AppTone`s (neutral, brand, info,
  success, warning, danger, **demo**, **sponsored**) with light/dark values.
* Theme rework: consistent navy tonal ramp in dark mode (seeded ramp drifted
  purple), white cards with soft shadow in light mode, stadium chips, 28 dp
  sheets with drag handle, pill search bar, M3 dialogs, **no letter spacing**
  anywhere (positive tracking breaks Arabic joining), taller body line height.
  `appBarTheme.titleTextStyle` removed so `SliverAppBar.large` keeps its big
  title (the default `titleLarge` is already bold here).
* Components: `AppScaffold` (+ `.slivers`, large title, adaptive
  pull-to-refresh, offline banner once), `SectionHeader`, `AppCard`
  (`ContentCard`), `NewsCard` (hero/standard/compact), `CarCard`
  (vertical/horizontal), `SpecRow`/`SpecGroup`/`SpecSource`/`RangeCycle`,
  `StatTile`/`StatTileRow`, `PriceTag`/`PriceType`, `Pill`, `DemoBadge`,
  `SponsoredLabel`, `Tour360Badge`, `PowertrainPill`, `AppFilterChip`,
  `ChoicePills`, `FilterBar`, `AppSearchField`, `Skeleton` + presets,
  `EmptyState`/`ErrorState`/`OfflineState`/`PermissionDeniedState`/
  `NotSupportedOnPlatformState`, `AsyncStateView` + `SliverAsyncStateView`,
  `AppIllustration`, `PrimaryButton`/`SecondaryButton`,
  `showAppBottomSheet`/`AppSheet`/`showConfirmSheet`, `showAppSnackBar`,
  `ImageWithFallback` (+ `networkImageProviderFactory`, `isLoadableImageUrl`),
  `LastUpdatedText`, `HorizontalCardList`, `AdaptiveGrid`,
  `ResponsiveCenter`, `SliverResponsivePadding`, `CompareToggleButton`,
  `CompareTrayBar`, `FavoriteButton`.
* Intrinsic-size safety: cards in `HorizontalCardList` are measured with
  `IntrinsicHeight` so a row shares the tallest height at 200 % text;
  therefore `ImageWithFallback`, `CarCard` and `NewsCard` standard/compact
  contain **no `LayoutBuilder`** (image decode width = explicit width or the
  screen width). `NewsCard.hero` uses one (not for carousels).
* Honesty built in: `null` → "غير متوفر" in every value widget; qualifiers
  and reliability/source are hidden when there is no value; converted price
  label is automatic; demo/sponsored labels are part of the cards; the hero
  uses a brand background (not a fake photo) when there is no licensed image.
* `/dev/kit` (`DesignKitGalleryScreen`) — living reference, registered only
  in debug builds and the web preview; every value is marked as a design
  sample with `DemoBadge`.
* Visual check: web preview rendered with Playwright/Chromium (ar RTL, en,
  dark mode, 160 % text) — layout and RTL mirroring looked right; screenshots
  were not committed.

## 5. Routes (all planned screens exist; feature teams replace placeholders)

New placeholders (honest `UnderConstructionScreen`, class names = contract):

| Route | Class (file in `lib/features/…/presentation/`) | Flag |
|---|---|---|
| `/news/category/:slug`, `/news/tag/:slug` | `NewsCategoryScreen`, `NewsTagScreen` (news) | news |
| `/news/:slug/comments` | `ArticleCommentsScreen` (community) | community |
| `/brands`, `/variants/:slug`, `/cars/:slug/gallery` | `BrandsScreen`, `VariantDetailScreen`, `CarGalleryScreen` (cars) | cars |
| `/cars/:slug/reviews`, `/cars/:slug/reviews/new` | `CarReviewsScreen`, `WriteReviewScreen` (community) | community |
| `/tours` | `ToursScreen` (tours) | interiorTours |
| `/compare/pick` | `ComparePickerScreen` (compare) | comparisons |
| `/charging/stations/:id/report`, `…/check-in` | `StationReportScreen`, `StationCheckInScreen` (charging) | stations |
| `/charging/filters`, `/charging/location`, `/charging/suggest` | `ChargingFiltersScreen`, `ChargingLocationScreen` (manual place when location is denied), `StationSuggestScreen` | stations |
| `/calculators/:kind` | `CalculatorScreen` (`CalculatorKinds.*`) | calculators |
| `/services/:id` | `ServiceProviderScreen` | servicesDirectory |
| `/questions`, `/questions/ask`, `/questions/:id` | `QuestionsScreen`, `AskQuestionScreen`, `QuestionDetailScreen` (community) | community |
| `/garage/add`, `/garage/:id`, `/garage/:id/edit` | `GarageVehicleEditScreen`, `GarageVehicleScreen` (AuthGate) | garage |
| `/charging-logs/new`, `/charging-logs/reports`, `/charging-logs/:id/edit` | `ChargingLogEditScreen`, `ChargingLogReportsScreen` (AuthGate) | chargingLogs |
| `/reminders/new`, `/reminders/:id/edit` | `ReminderEditScreen` (AuthGate) | reminders |
| `/notifications/preferences` | `NotificationPreferencesScreen` (AuthGate) | notifications |

Existing routes kept (tabs `/`, `/cars`, `/compare`, `/charging`, `/account`;
`/news`, `/news/:slug`, `/cars/:slug`, `/cars/:slug/tour/:tourId`,
`/brands/:slug`, `/compare/s/:shareId`, `/recommendations`,
`/charging/stations/:id`, `/trips`, `/search`, `/calculators`,
`/encyclopedia(/:slug)`, `/services`, `/garage`, `/charging-logs`,
`/reminders`, `/notifications`, `/favorites`, `/saved`, `/settings`, auth).
Map + list are one screen: `/charging?view=list` (`AppRoutes.chargingView`).
`AppRoutes` has a builder for every route; `featureForLocation` maps each to
its flag (community paths nested under `/cars` and `/news` are checked
first). `deepLinkRedirect` no longer treats `/compare/pick` as a share id
(share ids are 6–24 chars). Route titles were added to the owning feature's
ARB part (`community_{ar,en}.arb` is new).

## 6. Shared state for cars/compare/favorites

**Compare tray** — `lib/shared/compare_tray.dart`:
`CompareSelection{variantId, modelYear, marketCode, title, variantSlug?, modelSlug?, subtitle?, imageUrl?, addedAt?}`,
key `variantId@MARKET` (the same trim may be compared across markets,
matching `comparison_items (comparison, variant, market)`).
`compareTrayProvider` (`NotifierProvider<CompareTrayController, List<CompareSelection>>`):
`add → added | alreadyInTray | full`, `toggle`, `remove(key)`,
`replace(oldKey, next)`, `reorder`, `setAll`, `clear`, `canCompare` (≥ 2),
`maxItems = 4`. Persisted as JSON in SharedPreferences `compare.tray.v1`;
malformed entries are dropped.

**Favorites** — `lib/shared/favorites/` (handed over to the favorites agent,
who may edit these files): `FavoriteType{article, model, variant, station,
comparison, tour}` (= backend `favorite_target_type`), `FavoriteKey(type,id)`,
`FavoriteItem{key, title, subtitle?, imageUrl?, route?, savedAt?, localOnly}`.
`favoritesProvider` / `isFavoriteProvider(key)` / `FavoriteButton`.
Guests: device only (`favorites.v1`). Signed in **and** a `FavoritesRemote`
provided (`favoritesRemoteProvider`, `null` today): sign-in pushes guest
items then mirrors the account; toggles are optimistic and reverted +
rethrown on failure; sign-out removes the account's items from the device;
items of another account (owner key `favorites.owner.v1`) are dropped at
start-up. **To do (favorites feature):** implement `FavoritesRemote` against
the real `/me/favorites` API and return it from `favoritesRemoteProvider`.

## 7. Other core additions

* `lib/core/notifications/local_notifications.dart`: `LocalNotificationService`
  (`initialize` never prompts, `requestPermission`, `schedule`, `cancel`,
  `pendingIds`, `taps`, `launchRoute`), plugin / unsupported / fake
  implementations, `localNotificationIdFor(String)` (stable FNV-1a 31-bit).
  `EvCarApp` opens the (validated) route of a tapped notification.
* `lib/core/time/time_zones.dart`: lazy tz database, `location`, `nowIn`
  (null for unknown zones → show "open-now unknown", never guess),
  `setLocal`.
* `friendlyTime(context, date)` in `core/l10n/l10n.dart` ("3 hours ago" for
  7 days, then a date).
* `UnderConstructionScreen` now uses `AppScaffold` (offline banner on
  full-screen placeholders); placeholders and `SignInRequiredView` use
  `AppIllustration`.

## 8. Tests & verification (2026-09-25)

* `flutter pub get` ✔ · `dart run tool/merge_arb.dart --check` ✔ (44 parts)
  · `flutter gen-l10n` ✔ · `flutter analyze` → **No issues found**.
* `flutter test` → **188 passed, 4 skipped** (live-API tests; were 129).
  New: `test/shared/widgets/kit_test.dart` (gallery in ar/en × light/dark ×
  100/200 % on a 360 dp phone, no overflow; semantics; N/A never 0; demo/
  sponsored/converted labels; image fallback + credit; skeleton without
  animations; states; sheets; snackbar), `app_scaffold_test.dart`, `sliver_async_state_view_test.dart`,
  `test/shared/compare_tray_test.dart`, `test/shared/favorites/favorites_test.dart`,
  `test/core/notifications/local_notifications_test.dart` (incl. time zones),
  `test/core/platform/platform_capabilities_test.dart`,
  `test/app/routes_test.dart` (every planned route → its placeholder; guests
  get `SignInRequiredView` on personal routes; disabled flags → Home).
  Harness: `test/helpers/kit_harness.dart`.
* Existing test touched: `auth_flow_test.dart` "logout" now pumps after
  `scrollUntilVisible` (it tapped a stale position once list heights changed
  with the new theme — a test bug, not an app bug). `deep_links_test.dart`
  gained the `/compare/pick` case.
* `flutter build web --release --no-web-resources-cdn` ✔ (≈ 55 s).

## 9. Not done / not verified here

* **No APK built here** (no Android SDK; `dl.google.com` blocked). The
  desugaring/manifest change is validated syntactically only; the CI
  workflow (`evcar-android.yml`, `[apk]` in the commit message or manual
  run) is the first real build.
* Launcher icons on Android/iOS are still the Flutter defaults (the web
  icons are branded). The same generator can produce them.
* `FavoritesRemote` implementation (needs the backend favorites API).
* Push notifications (see §1).
* Photo zoom (`photo_view`) and charts (`fl_chart`) are only compiled, not
  exercised — their features are not built yet.
* Web icon generator (Pillow): gradient `#0A5CFF → #00C2E0` (diagonal), white
  bolt polygon `(0.58,0.08) (0.24,0.56) (0.47,0.56) (0.40,0.92) (0.76,0.42)
  (0.53,0.42) (0.60,0.08)` scaled 0.78 (0.62 for maskable, full-bleed),
  22 % rounded corners, 4× supersampling; sizes 32/192/512.
