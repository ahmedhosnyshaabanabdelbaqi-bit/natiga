# Decisions — mobile home, search, favorites, encyclopedia, services directory (Flutter)

Area: `mobile/lib/features/{home,search,favorites,encyclopedia,services_directory}/**`,
`mobile/lib/l10n/parts/{home,search,favorites,encyclopedia,services_directory}_{ar,en}.arb`,
tests in `mobile/test/features/discovery/**`.
Date: 2026-09-28. API contract: `docs/decisions/backend-discovery.md` §1–5.
No dependency added. No router change (route paths and screen class names kept).
The work was started by an interrupted earlier attempt; this pass reviewed all
of it against the backend contract and the live backend, fixed the defects
listed in §8, added the widget tests and wrote this file.

## 1. Screens

| Route | Class | What it does |
|---|---|---|
| `/` (Home tab) | `HomeScreen` | `GET /home` sections in the server's `order` (admin-controlled). Search field + search / notifications actions (only when their features are on). Pull-to-refresh, skeleton, offline copy with "saved copy from …" notice, "couldn't refresh" banner when a refresh fails over visible content, "Explore" grid of every enabled area (personalisation never hides browsing), "last updated" line. Scroll position kept (`PageStorageKey`; the tab branch stays alive). |
| `/search?q=` | `SearchScreen` | Unified search: recent searches (device only, remove one / clear all with confirm), debounced suggestions (250 ms, previous request cancelled, last list kept visible while the next loads), grouped results in the server's fixed order with counts, "see all" per group (paged, infinite scroll), "also matched" line for alias expansions, highlights rendered as `TextSpan`s (UTF-16 offsets, clamped and merged, never HTML). Queries without a letter/digit are never sent (server would answer 422). |
| `/favorites` | `FavoritesScreen` | Tabs Articles / Cars (models, trims, 360° tours) / Comparisons / Stations with counts; guest banner ("saved on this device, sign in to keep them") with sign-in; syncing / sync-failed banners; each item shows its snapshot, saved date, "no longer available", demo and "on this device only" labels; remove with undo; per-tab empty state with a browse action. |
| `/saved` | `SavedOfflineScreen` | Articles and spec sheets saved for offline reading (device only). |
| `/encyclopedia` | `EncyclopediaScreen` | Intro, search field, category chips with entry counts, paged list of reviewed entries (reviewed badge, reading time only when > 0, demo badge, "shown in English/Arabic" when the entry is a fallback), review policy note, offline copy of page 1. |
| `/encyclopedia/:slug` | `EncyclopediaEntryScreen` | Category, title, summary, reviewed badge + date, reading time, last updated, **electrical safety notice** (server text, amber card, icon + title) for electrical categories, sanitised body (`SafeHtml`), "reviewed by a specialist" explanation, related guides. Cached for offline reading. |
| `/services` | `ServicesDirectoryScreen` | Intro, name search, type chips with counts (`/services/types`), **Near me** (permission asked only on tap; denied → snackbar offering a city; denied forever / service off → sheet with settings + city), **City** picker (market presets or free text), **Open now**, clear filters; ordering explanation ("verified contacts first" or "nearest first — sponsorship never changes this order"); separate labelled **Sponsored listings** slot (`meta.sponsored`); entries keep their editorial place. |
| `/services/:slug` | `ServiceProviderScreen` | Header (type, name, sponsored label + note, open-now pill, demo note), contact card with verification pill ("verified on {date}" / "over a year ago" / "not verified" + "call ahead"), phone / WhatsApp / email / website rows ("Not available" when missing), action buttons **Call / WhatsApp / Email / Website / Directions** (directions sheet shared with charging), location, opening hours per day (`null` = "Not available", `[]` = "Closed", time zone shown), services and brands. Demo entries never get working contact actions. |

States: every screen has skeleton loading, empty (specific message + action),
error with retry, offline (cached copy with its date where one exists, else
the offline state), and 404 where relevant. Permission-denied applies to
location only (home nearby, services near me) and is handled in place with a
city alternative. Missing values show "غير متوفر / Not available", never 0.

## 2. Home sections

Rendered from `HomeSection.itemType` (unknown types are dropped; items that
fail to parse are skipped):

- `top_story` → hero `ArticleCard` (no header).
- `for_you`, `reviews` → horizontal article cards; `latest_news` → up to 5 compact cards.
- `new_cars` → `CarSummaryCard` strip; `featured_comparisons` → `SavedComparisonTile` (≤ 4).
- `interior_tours` → **prominent 360° band** (brand gradient rule, tinted
  background, gradient icon tile, intro line, large `TourListCard`s, "All 360° tours").
- `nearby_stations` → if the server says `location_required` or no point is
  known: `NearbyPromptCard` ("Use my location" / "Choose a city"). With a
  point: "Around: {place}" + change, up to 3 compact `StationCard`s (open-now
  and availability kept separate), or an explicit empty card.
- `charging_guides` → encyclopedia cards (reviewed badge).
- `state: unavailable` → per-section retry card (other sections still render);
  `empty` sections are hidden (never shown as zero).
- "See all" goes to `browse.resource` (+ `type` / `category` params for articles).

Location: the point comes from the shared charging place provider
(`chargingPlaceProvider`), never the market's default city. On start the app
checks permission silently and locates only when access was **already**
granted; it never prompts by itself. Coordinates are rounded to 3 decimals
(~100 m) before leaving the device. The offline copy is written with station
sections emptied and set to `location_required`, so neither the point nor
what it reveals is stored (REQUIREMENTS §19). Copies are keyed per language +
market + guest/user; the user copy is deleted on sign-out.

## 3. Favorites

- `ApiFavoritesRemote` (features/favorites/data) implements the shared
  `FavoritesRemote` (lib/shared/favorites, provided only while the
  `favorites` flag is on). `fetchAll` pages `/me/favorites` (100 × ≤ 10 pages
  = the server's 1000 cap); `add` = `PUT /me/favorites/:type/:id`; `remove` =
  `DELETE`; `merge` = `POST /me/favorites/merge` in batches of 200.
- On sign-in the controller merges device-only items, then replaces local
  state with the account list; items refused with `limit_reached` stay on
  the device, `not_found` ones are dropped. Tours: the server view has no car
  slug, so the device snapshot's route is kept (fallback `/tours`).

## 4. Sponsored labels

`sponsorLabel` from the backend is a complete label chosen by the admin
(fallback "مُموَّل / Sponsored"), not a sponsor's name. It is shown as-is by
`DirectorySponsoredLabel` (services_directory/presentation/widgets), with an
icon, the sponsored tone, a tooltip and a screen-reader description — never
as "Sponsored by {label}". Search hits of type `service` use the same widget.
Sponsorship never reorders anything in the app either.

## 5. Language / market reloads

`RequestLocale` (core) has no value equality, so watching
`requestLocaleProvider` directly refetched every discovery screen whenever the
market provider recomputed (e.g. when `/app-config` arrived with the same
market) — `/home` was requested twice on every cold start. All providers in
my area now watch `requestLocaleProvider.select(localeKey)`
(`search/application/locale_key.dart`, a `(language, market)` record), so
only a real change reloads. The core class itself is untouched (not my area).

## 6. Tests

- `test/features/discovery/discovery_models_test.dart` (16): parsing of the
  captured responses (home, search, suggest, encyclopedia, services,
  favorites), highlight run clamping, offline copy stripping, sponsored slot,
  contact links (tel keeps `+`, Arabic digits, https-only website, wa.me),
  near-me rounding, favorites storage round trip.
- `test/features/discovery/discovery_screens_test.dart` (21 widget tests on
  the full app with a fake HTTP backend serving the captured fixtures):
  home in en + ar (server order, tours band, location prompt, no zeros),
  section order while scrolling, granted location (rounded point, nearby
  stations), offline refresh (saved-copy notice), ar + dark + 200% text
  without overflow; search (debounce sends only the last text, suggestions,
  grouped results + count, no duplicated detail lines, recent searches +
  clear all, initial `q`, invalid query never sent, offline ≠ "no results");
  favorites (guest tabs + counts + demo label + remove, signed-in account
  list); encyclopedia en + ar (reviewed label, entry safety notice), 200%
  text; services (demo entry without contact actions, server verification
  label, open-now filter sent, sponsored slot + label without "Sponsored by
  Sponsored", detail actions Call / Website / Directions, unknown hours shown
  as not available, location denied → city alternative); 404 entry / provider
  → own "not available" state whose action returns to the list.
- Fixtures (`test/features/discovery/fixtures/*.json`) are responses of the
  real backend with the demo seed (fictional rows only). On 2026-09-28 every
  public one was re-captured from the current backend and compared key by key:
  all 17 have an identical structure.

## 7. Verification (2026-09-28)

| Command | Result |
|---|---|
| `dart run tool/merge_arb.dart --check` / `flutter gen-l10n` | 44 parts, 2 locales OK |
| `flutter analyze` | No issues found |
| `flutter test test/features/discovery` | 37 passed |
| `flutter test` (whole app, before other agents' latest edits) | 451 passed, 7 skipped (live-API tests), 0 failed |
| `flutter test` (whole app, final run) | 513 passed, 7 skipped, 4 failed — all outside this area: 3 files failed to compile while another agent's notifications ARB was mid-edit (they pass once it compiles), then 2 real failures remain from the mobile-personal work: `test/app/routes_test.dart` expects `/notifications` to still be a placeholder, and `test/features/auth/auth_flow_test.dart` finds two `AppBar`s on the new `/garage` screen |
| Live backend (own DB `evcar_mhs_live`, reference + demo seed, compiled to the scratchpad, `IMPLEMENTED_FEATURES` patched in the compiled copy only, flags switched on in that DB) | `/home` returns all 8 sections; shapes of 17 public responses identical to the fixtures; DB dropped afterwards |
| `flutter build web` (to the scratchpad, API through a same-origin proxy) + headless Chromium screenshots | Home, search, services list + detail, encyclopedia list + entry, favorites checked in Arabic RTL and English LTR; found and fixed the three issues in §8 |

## 8. Fixes made in this pass

1. Sponsored entries read "Sponsored by Sponsored" (label passed as a name) → `DirectorySponsoredLabel` (§4).
2. `/home` (and the other discovery lists) fetched twice on cold start → `localeKey` select (§5).
3. Suggestions flickered empty on every keystroke although the code claimed otherwise → last list kept in widget state.
4. Search hits repeated the address (subtitle = snippet) and service hits read "Service · Service centre · Service centre" → detail line de-duplicated.
5. Demo directory entries showed the demo badge twice (card + contact row) → contact row shows an explanatory line only.
6. A removed / unpublished encyclopedia entry or service provider (404) showed a generic non-retryable error with no way forward → dedicated "not available" state with "Browse the encyclopedia" / "Browse the directory" (new ARB keys `encyclopediaNotFound*`, `encyclopediaBrowseAll`, `servicesDirectoryNotFound*`, `servicesDirectoryBrowseAll`).

## 9. Not done / limits

- No APK built here (no Android SDK in this environment); the APK must come
  from the `evcar-android.yml` CI workflow.
- `/home` depends on `IMPLEMENTED_FEATURES` (backend settings module): while
  it is empty the server returns no sections and the app shows the "nothing
  published yet" state + Explore grid (only enabled areas).
- Interests ("for you" following brands/models/categories, `GET|PUT
  /me/interests`) have no editing screen yet; the `for_you` section renders
  when the server sends it.
- Favorites signed-in flow is tested with fixtures only (not against the
  live server: it needs a verified account).
- Search does not cover tours (backend limit).
- Dark mode was verified by widget tests, not visually in the browser.

## 10. Notes for other teams

- **Integrator / router (`lib/app/router/deep_links.dart`, not my area):**
  `appRedirect` sends any route whose feature flag is off to Home. On a cold
  start `/app-config` is not loaded yet (every flag reads as off), so a
  cold-start deep link to `/search`, `/services/…`, `/encyclopedia/…`,
  `/favorites` … is replaced by Home. It shows on the web preview every time
  and on Android for app links opened before a cached config exists (first
  launch). Suggested fix: skip the feature check (or defer it) until the
  config has loaded once (a "loaded at least once" flag on the config state), and let
  `refreshListenable` re-run the redirect after it loads.
- **Core (`RequestLocale`):** add `==`/`hashCode` (or make it a record) so
  every feature stops refetching on market recomputation (§5).
- **Backend:** add the 8 shipped features to `IMPLEMENTED_FEATURES`.
- **Web preview (prep):** the "Web preview" corner ribbon covers the leading
  app-bar action in RTL (Home's search icon); web only.
- **Everyone using `sponsorLabel`:** it is a label, not a sponsor name (§4).
- **mobile-personal:** your new `/notifications` and `/garage` screens break
  `test/app/routes_test.dart` (placeholder list) and
  `test/features/auth/auth_flow_test.dart` (`find.widgetWithText(AppBar, 'My garage')`
  now matches two AppBars); please update those tests with your screens.
- **Shared scratchpad:** my live check used generic names in the shared
  scratchpad (`proxy.py`, `proxy.log`, `server.log`, `chrome.log`, `dist/`,
  `web/`, `storage/`, `node_modules` link, `shots/*` top-level files). If
  another agent kept files under those names, they were overwritten or removed.
