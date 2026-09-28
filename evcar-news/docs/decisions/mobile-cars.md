# Decisions — mobile-cars (Flutter car catalog, car page, spec sheet)

Area: `mobile/lib/features/cars/**`, `mobile/lib/l10n/parts/cars_{ar,en}.arb`,
tests `mobile/test/features/cars/**`, this file. Date: 2026-09-25.
Backend contract used: `docs/decisions/backend-vehicles.md` §1 (checked
against a live backend running the demo seed, see §6).

No new dependency, no router change (class names / constructors kept), no
shared-kit change. Outside the area only two shared tests were touched,
following the pattern the news team already started (§7).

## 1. Structure

| Layer | Files |
|---|---|
| domain | `domain/catalog_models.dart` (CarSummary, BrandSummary/Detail, CarDetail with generations → years → trims, VariantSummary, CarPrice/Money/PriceSummary, RangeSpan, DataPoint + Provenance + CatalogSource, TourSummary/ToursInfo, RelatedArticle, CatalogImage), `domain/variant_sheet.dart` (VariantSheet, SheetMarket, SpecGroupData/SpecItem, RangeEntry, ConsumptionEntry, Inlet, ChargingTime, ChargingCurve, SheetKeyFacts, ReviewsSummary, ReviewPreview), `domain/cars_query.dart` (catalog filters) |
| data | `data/cars_repository.dart` — every public catalog endpoint; network-first with the JSON cache (`fetchWithCache`), then the user's saved offline copy |
| application | `application/cars_providers.dart` — `catalogProvider(query)` (paged AsyncNotifier), `brandsProvider`, `brandProvider(slug)`, `carDetailProvider(MarketKey)`, `variantSheetProvider(MarketKey)`, `savedSheetProvider(MarketKey(variantId, market))`, `ownerReviewsProvider(variantId)` |
| presentation | screens `cars_catalog_screen.dart`, `brands_screen.dart`, `brand_screen.dart`, `car_detail_screen.dart`, `variant_detail_screen.dart`, `car_gallery_screen.dart`; widgets in `presentation/widgets/` |

Parsing is hand-written and defensive: malformed list items are skipped; a
missing value stays `null` and is shown as "غير متوفر / Not available",
never 0. Calendar dates (`effectiveFrom`, `documentDate`) are parsed as local
calendar days (no time-zone shift).

## 2. Screens

* **Catalog `/cars`** — large title, search (debounced, `q`), market line
  ("Prices and availability for Egypt (EGP)" + "Change market" → settings),
  brands strip (brands with cars in the market, "See all" → `/brands`),
  `FilterBar` with quick powertrain chips + filter sheet (sort, powertrain,
  body, **local** price range with the market currency and a hint that only
  local prices are compared, minimum electric range **with its test cycle**
  (WLTP/EPA/CLTC/NEDC; `rangeCycle` is always sent with `minRange` and with
  `sort=range_desc`), minimum seats). Infinite scroll, result count,
  skeletons, pull-to-refresh, cached-copy notice, empty state that
  distinguishes "no match → clear filters" from "nothing listed in this
  market → change market", offline/error states. Cards: kit `CarCard` with
  range + cycle, usable battery span, DC peak, "From …" price with its type,
  360° badge, demo badge, favorite (type `model`). A powertrain pill is shown
  only when all trims share it (a model with PHEV trims never looks like a
  pure EV; the subtitle lists "BEV / PHEV"). 1 column on phones, 2–3
  equal-height columns on wide screens.
* **Brands `/brands`** — searchable list; brands without models in the
  market are listed in a separate "Not sold in your market" section (marked,
  not hidden). Logos only when the API returns a licensed logo; otherwise
  initials on the brand gradient.
* **Brand `/brands/:slug`** — header (logo/initials, model count, origin,
  description, official website https only), the models listed in the
  market, then `notInMarket` models with "Sold in: EG, SA" (reference only).
* **Car page `/cars/:slug`** — collapsing hero (licensed image or brand
  gradient, powertrain pills, 360° + demo badges), favorite (model), tabs:
  1. *Overview*: **explicit version selector** — market (all enabled app
     markets; markets without the car are marked "(not sold)"), model year
     (generation added when two generations share a year), trim (name ·
     powertrain). Then the selection summary (year, powertrain, market,
     availability, drive, seats, demo), key figures (electric range + cycle,
     usable battery, DC peak, AC max, power (+hp), 0–100), price card,
     prominent 360° card (or "الجولة غير متاحة لهذه الفئة" + link to the
     gallery), actions (compare / favorite trim / share / save offline),
     description.
  2. *Specifications*: ranges + consumption (each with its cycle and mode,
     never converted, explainer text), charging (inlets of the chosen market
     with max power; charging times labelled with AC/DC **and the SoC window**
     plus charger / peak / average / on-board limit / conditions; charging
     curves drawn with fl_chart with a text summary and a data table toggle),
     all spec groups (collapsible `SpecGroup`s; "Hide unavailable values"
     switch), button to the full sheet.
  3. *News & reviews*: related articles (reviews / test drives first).
  4. *Owner reviews*: community API summary + 3 most helpful reviews, "All
     reviews" → `/cars/:slug/reviews`, "Write a review" →
     `/cars/:slug/reviews/new` (community feature's screens). Community flag
     off → honest "not available yet"; zero reviews → honest empty state.
     Averages are shown only when the server returns one.
  5. *360° tour*: big "جولة داخلية 360°" cards for the trim (exact tours first,
     then reference tours with "Photographed in a similar trim: …" and the
     difference note), seat views, interior colour swatch **with its name**,
     "Start the tour" → `/cars/:slug/tour/:tourId`; no tour → the unavailable
     message + licensed gallery strip; `interiorTours` flag off → "Interior
     tours are not available right now".
  6. *Competitors*: curated competitor cards (market-aware) or empty state.
  A market without trims → "Not sold in this market" + where it is sold.
* **Spec sheet `/variants/:slug`** — the same sections in one page for one
  trim, with its own market selector, sources list, "All versions of …" →
  model page. Works fully offline from a saved copy.
* **Gallery `/cars/:slug/gallery`** — licensed images grid → full-screen
  `photo_view` pager with caption, credit and demo badge.

## 3. Rules applied

* **No silent mixing**: every figure on the car page comes from the
  `(trim, market)` sheet the user selected (`GET /variants/:slug?market=`);
  the model page's cross-trim data is used only for the selector and for
  model-level lists. The chosen market is sent as an explicit `market` query
  parameter (it wins over the `X-Market` header), so the app-wide market is
  not changed by browsing another market.
* **Compare** (`CompareToggleButton` of the shared tray) uses exactly
  `(variantId, modelYear, marketCode)`; it is disabled with an explanation
  when the trim is not sold in the selected market (the backend requires a
  `variant_markets` row).
* **Prices**: `PriceTag` with type, "as of" date and a tappable source;
  `inMarketCurrency: false` → "Estimate after conversion" pill and never the
  official label; no price → "Price not available" + why (not sold / no local
  price yet). Price history (newest first) in an expansion tile with type,
  period ("Since …" / "from – to"), "Current" marker and source.
* **Provenance**: every `SpecRow` shows reliability + source; tapping a
  source opens a sheet with publisher, verified date, document date, accessed
  date and an "Open source" button (https only). Key-figure tiles open the
  same sheet. Derived values say "Calculated from another published value";
  market-specific rows say so.
* **Units**: canonical units mapped to the app formatters (localized unit
  names, Arabic-Indic digits when chosen); `year` → "5 years", `in` → بوصة,
  booleans → "Yes"/"No" in words. Model years never get grouping separators.
* **Charts**: fl_chart axes stay left→right (0 → 100 % SoC) in both
  languages; label density adapts to the width; labels ignore text scaling
  (the summary text and the data table carry the information at any size).
  The line gradient is a plain LTR `LinearGradient` because fl_chart builds
  shaders without a `TextDirection` (the kit's brand gradient is
  directional and crashed the painter — found by the tests).
* **Landscape**: spec groups become compact tables (spec · value ·
  reliability · source) when the device is landscape or ≥ 720 dp wide.
* **Share**: `SharePlus` with `"<title>\n<share.baseUrl>/cars/<model slug>"`
  (`ShareConfig.carUrl`, i.e. `https://evcar.news/cars/<slug>`); injectable
  via `carShareProvider` for tests.
* **Save offline**: `SavedItemsStore` type `car_specs` (existing constant),
  id = variant id, keyed by language + market, `data` = the raw `VariantSheet`
  JSON (`data` member of the response), title = sheet title. The page shows
  "Saved on …"; an offline copy (cache or saved) always shows the kit's
  `CachedDataNotice` with its date. Save is disabled while showing an
  automatic cache copy (it may be stale).
* **Favorites**: model cards / car page → `FavoriteType.model`
  (route `/cars/<slug>`); trim actions → `FavoriteType.variant`
  (route `/variants/<slug>`).
* **Demo data**: `isDemo` anywhere (card, brand, tour, image, sheet) →
  `DemoBadge`. No real-world data is bundled; test fixtures are demo-seed
  responses.
* **Accessibility**: kit components (48 dp, Semantics labels, never
  colour-only: availability pills have icon + text, booleans are words,
  star distribution rows have text counts, chart has a text summary + table);
  tested at 200 % text (system 125 % × in-app 160 %) in ar-dark and en-light.

## 4. API shapes used (exact)

`GET /cars` (`q, brand, powertrain, body, minPrice, maxPrice, minRange,
rangeCycle, minSeats, sort, page, pageSize`; `meta.currencyCode`),
`GET /brands?pageSize=100`, `GET /brands/:slug`, `GET /cars/:slug?market=`,
`GET /variants/:slug?market=`, `GET /community/reviews/summary?variantId=`,
`GET /community/reviews?variantId=&sort=helpful&pageSize=3`. All shapes as in
`backend-vehicles.md` §1 / `backend-community.md` (reviews). Not used yet:
`/cars/pickers` (compare/garage pickers belong to those features),
`/cars/:slug/competitors` (the model page already embeds `competitors`),
`/cars/:slug/variants/:variant` (equivalent to `/variants/:variant`).

## 5. Tests

* `test/features/cars/cars_models_test.dart` (13): parsing of real responses
  (catalog, model page EG/SA, BEV/PHEV/SA sheets), nulls stay null, derived
  hp, SoC windows, malformed items skipped, calendar dates, reference-tour
  order; `CarsQuery` (range needs cycle, sort, equality/cache key);
  repository (explicit market param, offline: cache → saved copy with date →
  error for another market; remove).
* `test/features/cars/cars_widgets_test.dart` (14): converted estimate
  label, no local price, HEV note, reference tour note, no-tour fallback,
  OTHER cycle note, spec sections across the 7-config kit matrix (ar/en ×
  light/dark × 100/200 %), landscape table, "hide unavailable values".
* `test/features/cars/cars_screens_test.dart` (19, full app + fake server
  from fixtures): catalog (labels, quick chip, min range + cycle, empty,
  offline), brands → brand page, car page selection (BEV→PHEV sheet, no
  tour, price not available), market without the car, compare/share/save
  offline → offline saved copy, specs tab (cycle, SoC window, chart, table,
  source sheet), owner reviews (empty / feature off), 360° tab, competitors,
  404, 200 % text for every tab (ar dark, en light), catalog + sheet at
  200 %, landscape table.
* Fixtures `test/features/cars/fixtures/*.json`: captured with curl from a
  local backend (own DB `evcar_mcars`, reference + demo seed); all records
  are the fictional demo data (`isDemo: true`).

## 6. Verification (2026-09-25)

| Command | Result |
|---|---|
| backend on own DB: `prisma migrate deploy`, `db:seed`, `db:seed:demo`, `ts-node src/main.ts` (port 3107) | OK; fixtures captured; response shapes match the contract |
| `dart run tool/merge_arb.dart && flutter gen-l10n` | 44 parts, 2 locales OK (211 cars keys) |
| `flutter analyze` | cars feature + tests: no issues (the whole project showed 2 infos in `features/charging`, another team's work in progress) |
| `flutter test` (whole app, before the charging team's in-progress edits) | 275 passed, 7 skipped |
| `flutter test test/features/cars` (last run in the real tree) | blocked at compile time by another team's in-progress edit (`features/charging/presentation/charging_location_screen.dart` uses `charging*` keys not yet in its ARB); every test that loads the full app is affected, not only cars |
| Same tree copied to the scratchpad with only `lib/features/charging` restored to `HEAD`: `flutter test test/features/cars test/app` | 80 passed (46 cars + 34 app) |
| Same copy: `flutter test` (whole app) / `flutter analyze` | 275 passed, 7 skipped / No issues found |
| `flutter build web --release --no-web-resources-cdn` into the scratchpad + Playwright/Chromium screenshots (390×844 @2x, ar + en) through a local proxy that turned the `cars`/`news`/`community`/`interiorTours` flags on | catalog, car page, variant sheet, brands render correctly in RTL/LTR; found and fixed: "2,025" year grouping, cramped 3-per-row key figures (now 2 per row on phones), long two-line collapsed titles, a BEV pill on a mixed BEV/PHEV model |

Bugs found by the tests and fixed: 4 overflows at 200 % text (selector
labels, tour card header, curve card header, catalog market line), the
fl_chart directional-gradient crash, tabs of a scrollable TabBar.

## 7. Changes outside the area

* `mobile/test/app/routes_test.dart`: the five cars routes moved from
  `_public` (placeholder expected) to `_implemented` (still checked for the
  feature flag) — the pattern the news team introduced.
* `mobile/test/app/shell_navigation_test.dart`: the tab-title assertion uses
  `findsWidgets` because the catalog's large collapsing title renders the
  title twice (expanded + collapsed).

## 8. Not done / notes for others

* **Backend `IMPLEMENTED_FEATURES` is empty** (`backend/src/modules/settings/
  settings.types.ts`), so `/app-config` never announces `cars` and the app
  hides the Cars tab and routes. The integrator must add `cars` (and the
  other shipped features) there and enable them in settings.
* Deep links opened before `/app-config` loads are redirected to Home by the
  router's flag guard (seen in the web preview); a cold start with a cached
  config is fine. Router owners may want to wait for the config before
  redirecting.
* The demo tour `previewUrl` is `http://localhost:3000/...`: the kit only
  loads https images, so the tour card uses the brand gradient there.
* `/saved` (offline items screen, owned elsewhere) can list car sheets from
  `SavedItemsStore.list(type: SavedItemType.carSpecs)`: `item.id` = variant
  id, `item.market`, `item.data['slug']` → open `AppRoutes.variant(slug)`.
* Compare picker / garage should use `GET /cars/pickers` (not implemented
  here). The compare tray entries created here carry `variantSlug`,
  `modelSlug`, `subtitle` ("trim · year · market") and the image URL.
* No APK built here (no Android SDK in this environment).
* Not verified on a real device: `share_plus` sheet, `photo_view` gestures,
  landscape rotation (tested by size only).
