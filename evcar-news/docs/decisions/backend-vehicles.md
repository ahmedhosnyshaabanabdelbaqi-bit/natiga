# Backend vehicle catalog (backend-vehicles) — decisions

Area: `backend/src/modules/vehicles/**`, tests `backend/test/vehicles-*.e2e-spec.ts`
(3 specs) and unit specs next to the code (5 specs). Date: 2026-09-25.
Requirements: REQUIREMENTS §6 (catalog), §7 (comparison-safe data), §17
(admin, CSV, reports), §18; contract ARCHITECTURE §3, §4.3.

No schema change, no dependency added (`csv-parse` / `csv-stringify`,
`luxon`, `@prisma/client-runtime-utils` were already installed),
`package.json`, `app.module.ts`, migrations untouched. The module is already
registered through `src/modules/feature-modules.ts`.

Layout: `common/` (units, verification rules, measurements, spec values,
slugs, visibility, views, media URLs, localized errors), `dto/`
(shared / admin / public / import DTOs with OpenAPI metadata), `admin/`
(controllers + services), `public/` (public controller, SQL catalog query,
car pages, pickers, related content), `import/` (CSV codec, templates, row
handlers, import / export services + controller), `search/` (search index
sync), `index.ts` (what other modules may import).

## 1. Public API (guests allowed) — used by the app

All under `/api/v1`, `?lang=ar|en` (or `Accept-Language`) and `?market=EG`
(or `X-Market`; unknown / disabled → default market). Envelopes `{data}` /
`{data, meta}`. `Cache-Control: public, max-age=60` + strong ETag (send
`If-None-Match` → 304). Missing values are `null` → show "غير متوفر / Not
available" (the response also carries `notAvailableLabel`); never 0.

| Method + path | Notes |
|---|---|
| GET `/brands` | `q, hasCars (bool), page, pageSize` → `BrandSummary[]` |
| GET `/brands/:slug` | slug or id → `BrandDetail` (cars listed in the market + `notInMarket`) |
| GET `/cars` | catalog list of MODELS (cards) filtered at trim level — see query below |
| GET `/cars/pickers` | cascade brand → model → year → variant → market for compare / garage pickers |
| GET `/cars/:slug` | model page (`CarDetail`), slug or id |
| GET `/cars/:slug/variants/:variant` | full spec sheet (`VariantSheet`); `:variant` = id or slug; must belong to the model |
| GET `/variants/:variant` | same `VariantSheet` by variant id or slug (app route `/variants/:slug`) |
| GET `/cars/:slug/competitors` | `CarCard[]` (curated, both directions, market-aware) |

Visibility: a trim is public when variant, model and brand are `published`
and nothing in the chain is soft-deleted. It is *listed* in a market when its
`variant_markets` row there is `available` or `coming_soon`
(`includeDiscontinued=true` adds `discontinued`). The model page also shows
`discontinued` trims of the market (labelled by `availability`). A model
with no trim in the request market still answers 200 with
`availableInMarket: false`, empty `generations` and `availableMarkets`; a
variant sheet for a market without a row answers 200 with
`market.offered: false, availability: 'not_listed'`, no price and no inlets.
Unknown / unpublished slugs → 404 `NOT_FOUND`.

**Route note (prefix exclusion).** The share module excludes GET
`cars/:slug` from the `/api/v1` prefix (web fallback pages
`https://evcar.news/cars/<slug>`, `src/modules/share/share.routes.ts`). Nest
applies such exclusions to *every* route whose literal path matches, which
would have moved `GET /api/v1/cars/:slug` and `/api/v1/cars/pickers` to
`/cars/...`. Both routes are therefore declared as `cars/:slug{/}` /
`cars/pickers{/}` (optional trailing slash, identical URLs), so they stay
under `/api/v1`. OpenAPI lists them as `/api/v1/cars/{slug}/` and
`/api/v1/cars/pickers/` — both forms work. Remove `UNDER_API_PREFIX` in
`public/public-catalog.controller.ts` if the share module ever narrows its
exclusions. (Same trap for any team: `n/:slug`, `compare/:shareId`.)

### `GET /cars` query
`brand` (slug/id, comma list), `powertrain` (BEV,PHEV,EREV,HEV), `body`
(sedan,suv,…), `drive` (fwd,rwd,awd), `seats` (exact), `minSeats`,
`minPrice` / `maxPrice` (decimal strings, market currency — compared with the
trim's *current local* price; foreign-currency estimates are ignored; trims
without a local price are excluded when a price filter is set), `minRange` +
`rangeCycle` (+ `rangeType` electric|total, default electric; `minRange`
without `rangeCycle` → 422, ranges are never compared across cycles), `year`,
`q`, `includeDiscontinued`, `sort` = `newest` (default) | `price_asc` |
`price_desc` | `range_desc` (uses `rangeCycle`, default WLTP) | `name`,
`page`, `pageSize`. `meta` = `{page,pageSize,total,totalPages}` + `marketCode`,
`currencyCode`.

### Shapes (TypeScript notation; `?` never used — nullable fields are `| null`)

```ts
Image = { id, url, width|null, height|null, alt|null, caption|null, credit|null,
          licenseType|null, sizes:[{label,width|null,height|null,url}], isDemo }
Source = { id, type, title, publisher|null, url|null, documentDate|null (YYYY-MM-DD),
           accessedAt|null, marketCode|null }
Meta = { reliability: 'verified'|'manufacturer_claim'|'estimated'|'unverified'|'disputed',
         verifiedAt: iso|null, source: Source|null }
DataPoint = Meta & { value: number|string|boolean, unit|null, originalValue|null,
                     originalUnit|null, marketCode|null, derived: boolean }
Money = { amount: "1850000.00", currency: "EGP" }
Price = Meta & { id, marketCode, amount: Money, priceType: 'official_msrp'|'dealer'|'market_estimate',
                 priceTypeLabel, effectiveFrom: 'YYYY-MM-DD', effectiveTo|null, isCurrent,
                 inMarketCurrency (false = foreign-currency estimate, never an official local price),
                 notes|null }
Range = Meta & { id, cycle: 'WLTP'|'EPA'|'CLTC'|'NEDC'|'OTHER', cycleNote|null,
                 rangeType: 'electric'|'total', valueKm, originalValue|null, originalUnit|null,
                 wheelSizeInch|null, conditions|null, marketCode|null }
Consumption = Meta & { id, cycle, cycleNote|null, kind: 'electricity'|'fuel',
                 mode|null, value, unit: 'Wh/km'|'L/100km', originalValue|null, originalUnit|null,
                 conditions|null, marketCode|null }
Inlet = Meta & { id, connectorType:{code,name}, currentType:'AC'|'DC', maxPowerKw|null, notes|null }
ChargingTime = Meta & { id, currentType, fromSoc, toSoc, socWindow:"10–80%", durationMinutes,
                 chargerPowerKw|null, peakPowerKw|null, averagePowerKw|null,
                 onboardChargerLimitKw|null, conditions|null }
ChargingCurve = Meta & { id, currentType, label|null, chargerMaxPowerKw|null, batteryTempC|null,
                 preconditioned|null, conditions|null, points:[{socPercent,powerKw}], peakPowerKw|null }

BrandRef = { id, slug, name, logo: Image|null }
BrandSummary = BrandRef & { nameAr, nameEn, countryCode|null, carCount, isDemo }
BrandDetail = BrandSummary & { description|null, websiteUrl|null, cars: CarCard[],
                 notInMarket: [{id, slug, name, image|null, marketCodes:[]}] }
PriceSummary = { amount: Money, priceType, priceTypeLabel, effectiveFrom, variantId }
RangeSpan = { cycle, rangeType, minKm, maxKm }
CarCard = { id (model), slug (model), title ("BYD Seal"), name, nameAr, nameEn, brand: BrandRef,
            bodyType|null, segment|null, image: Image|null, powertrainTypes[], modelYears[] (desc),
            variantCount, priceFrom: PriceSummary|null, priceTo: PriceSummary|null,
            ranges: RangeSpan[] (per cycle, never merged), usableBatteryKwh: {min,max}|null,
            maxDcPeakKw|null, hasTour, availability, isDemo }
ArticleCard = { id, slug, type, title, summary|null, language, coverImage: Image|null,
                publishedAt, isSponsored, sponsorName|null, isDemo }
TourCard = { id, slug, title|null, variantId, marketCode, driveSide, interiorColorName,
             interiorColorHex|null, seatScenes:[{id,key,position,title|null}],
             isReferenceForSimilarTrim, differenceNote|null, referenceVariantName|null,
             previewUrl|null, isDemo }
ToursSummary = { available, tours: TourCard[], unavailableLabel: "الجولة غير متاحة لهذه الفئة" }

VariantSummary = { id, slug, name, localName|null, trimCode|null, powertrainType, bodyType|null,
                   driveType|null, seats|null, modelYear, availability, currentPrice: Price|null,
                   keyFacts: { usableBatteryKwh|null, grossBatteryKwh|null, powerKw|null,
                               accel0100S|null, acMaxKw|null, dcPeakKw|null, ranges: RangeSpan[] },
                   hasTour, isDemo }
CarDetail = { id, slug, title, name, nameAr, nameEn, description|null, bodyType|null, segment|null,
              brand: BrandRef, heroImage|null, images: Image[], marketCode, availableInMarket,
              availableMarkets: [{code,name,availability}], powertrainTypes[],
              priceFrom|null, priceTo|null,
              generations: [{id, slug, name, code|null, startYear|null, endYear|null,
                             years:[{id, year, variants: VariantSummary[]}]}],
              defaultVariantId|null, tours: ToursSummary, competitors: CarCard[],
              relatedArticles: ArticleCard[], isDemo, notAvailableLabel }

VariantSheet = { id, slug, name, nameAr, nameEn, title, trimCode|null, powertrainType,
   bodyType|null, driveType|null, seats|null, doors|null, modelYear, publishedAt|null, isDemo,
   brand: BrandRef, model: {id,slug,name}, generation: {id,slug,name,code|null,startYear|null,endYear|null},
   market: { code, name, currencyCode, offered, availability (| 'not_listed'), localName|null,
             launchDate|null, discontinuedAt|null, driveSide|null, source|null, verifiedAt|null },
   availableMarkets: [{code,name,availability}],
   images: Image[],
   price: { current: Price|null, history: Price[] /* newest effectiveFrom first */ },
   keyFacts: { usableBatteryKwh, grossBatteryKwh, powerKw, powerHp, torqueNm, accel0100S,
               acMaxKw, dcPeakKw: DataPoint|null …, electricRanges: Range[] },
   specGroups: [{ key, label, items: [{ key, label, description|null, dataType, unit|null,
                  betterDirection, isKeySpec, point: DataPoint|null }] }],
   ranges: Range[], consumption: Consumption[],
   charging: { inlets: Inlet[] (of the request market), times: ChargingTime[], curves: ChargingCurve[] },
   tours: ToursSummary, relatedArticles: ArticleCard[], competitors: CarCard[],
   sources: Source[], notAvailableLabel }

Pickers = { level: 'brand'|'model'|'year'|'variant'|'market', marketCode, scope: 'market'|'all',
            items: [{ id, slug|null, label, sublabel|null, imageUrl|null, count|null,
                      // year:    year
                      // variant: powertrainType, modelYear, modelId, modelSlug, title,
                      //          markets:[{code, availability}]
                      // market:  availability, localName|null, currencyCode }] }
```
Picker levels: no params → brands; `brand` → models; `model` → years;
`model`+`year` → variants; `variant` → markets. `scope=market` (default,
compare) lists only trims listed in the request market; `scope=all` (garage)
any public trim. A comparison item must be a (variant, market) pair that has a
`variant_markets` row (DB FK), which is exactly what the market level returns.

Spec groups (order): battery, charging, performance, dimensions,
practicality, safety, comfort, tech, warranty — every definition of the group
is listed, missing ones with `point: null`. `seats/doors/driveType/bodyType`
are variant attributes at the top level. `performance.power_hp` is derived
from `performance.power_kw` when not stored (`derived: true`, same source;
and kW from hp the other way round).

Images: only media assets that are `kind=image`, `status=ready`, not
deleted, stored under a public key AND licensed are ever returned (credit =
`credit_text` or the licence attribution). Model card image = hero asset,
else the first model / generation gallery image (covers first). Variant sheet
images = trim gallery, then generation, hero, model gallery.

Tours (integration point with backend-tours, read-only): `tours` lists
`interior_tours` with `status=published`, `deleted_at IS NULL`, of the trim
(model page: of the market's trims) **in the request market**; exact tours
first, then editor-approved reference tours (`isReferenceForSimilarTrim`
with the localized `differenceNote` + `referenceVariantName` — show them
prominently). `previewUrl` = public URL of the initial scene's `preview`
rendition. The viewer / scene configs are served by the tours module
(`/cars/:slug/tour/:tourId` in the app).

Related articles: published (`published_at <= now`, not deleted) articles
linked (`article_vehicle_links`) to the trim or its model, visible in the
market (no market rows = all markets), newest first, max 10; served in the
request language when a publishable translation exists, else the original
language (`language` says which); unreviewed machine translations are
never used.

Competitors: `model_competitors` rows in both directions (curated order of
the model first), only models with trims listed in the request market.

Other modules: `import { VehiclesModule }` in your module and inject
`CarPagesService` (`variantSheet(id|slug, market, lang, undefined,
{ related: false })` for comparisons), or use the pure helpers exported by
`src/modules/vehicles/index.ts` (`pointsByKey`, `pickCurrentPrice`,
`PUBLIC_VARIANT_WHERE`, `toCanonical`, …).

Example (demo seed, trimmed) `GET /api/v1/cars?lang=en`:
```json
{"data":[{"id":"d000…0011","slug":"demo-motors-ev-one","title":"Demo Motors Demo EV One",
 "name":"Demo EV One","brand":{"id":"d000…0010","slug":"demo-motors","name":"Demo Motors","logo":null},
 "bodyType":"crossover","segment":null,"image":null,"powertrainTypes":["BEV","PHEV"],
 "modelYears":[2025],"variantCount":2,
 "priceFrom":{"amount":{"amount":"1500000.00","currency":"EGP"},"priceType":"official_msrp",
   "priceTypeLabel":"Official price (MSRP)","effectiveFrom":"2025-01-01","variantId":"d000…0014"},
 "ranges":[{"cycle":"WLTP","rangeType":"electric","minKm":90,"maxKm":420},
           {"cycle":"WLTP","rangeType":"total","minKm":900,"maxKm":900}],
 "usableBatteryKwh":{"min":18,"max":60},"maxDcPeakKw":150,"hasTour":true,
 "availability":"available","isDemo":true}],
 "meta":{"page":1,"pageSize":20,"total":1,"totalPages":1,"marketCode":"EG","currencyCode":"EGP"}}
```

## 2. Admin API (`/api/v1/admin/...`, always permission-guarded, audited)

Every mutating request writes one `audit_logs` row (interceptor) that the
services annotate with `entityType` / `entityId` / `before` / `after`
(`brand`, `model`, `generation`, `model_year`, `variant`, `range`,
`consumption`, `charging_curve`, `charging_time`, `price`, `source`,
`vehicle_media`, `import_job`); denied requests are audited as
`security.permission_denied`. Reads send `Cache-Control: no-store`.
Errors are localized (ar/en) with stable codes.

| Method + path | Permission | Notes |
|---|---|---|
| GET `/admin/brands` · `/admin/brands/:id` | vehicles.read \| vehicles.write | `q, status, includeDeleted, page, pageSize` |
| POST `/admin/brands` · PATCH `/:id` | vehicles.write | slug from `nameEn` when omitted (409 `SLUG_TAKEN`); logo = ready licensed image |
| DELETE `/admin/brands/:id` · POST `/:id/restore` | vehicles.delete | soft delete; 409 `IN_USE` while live models exist |
| GET `/admin/models` (`brandId`) · GET `/:id` | read | detail = generation → year → variant tree + `competitorModelIds` + `visibilityBlockers` |
| POST `/admin/models` · PATCH · DELETE · POST `/:id/restore` | write / delete | slug `<brand>-<name>`; 409 `IN_USE` while live variants exist |
| PUT `/admin/models/:id/competitors` | vehicles.write | `{competitorModelIds: uuid[]}` ordered, max 20, not itself |
| GET `/admin/generations/:id` · POST · PATCH · DELETE · restore | read / write / delete | slug unique per model; start ≤ end year |
| POST `/admin/model-years` · DELETE `/:id` | write / delete | unique (generation, year); delete only without variants |
| GET `/admin/variants` · GET `/:id` | read | filters `brandId, modelId, generationId, modelYearId, year, powertrainType, marketCode, q, status`; detail = markets + inlets, specs, ranges, consumption, curves, times, prices (all markets), gallery, `tourCount`, `visibilityBlockers` |
| POST `/admin/variants` · PATCH · DELETE · restore | write / delete | ONE powertrain per variant; unique (model year, powertrain, `nameEn`) → 409 `ALREADY_EXISTS` |
| GET `/admin/spec-definitions` | read | keys, group, data type, canonical unit, better direction |
| GET · PUT `/admin/variants/:id/specs` · DELETE `/specs/:specKey?marketCode=` | read / write | PUT upserts `{items:[{specKey, marketCode?, value, unit?, originalValue?, originalUnit?, sourceId?, reliability?, verifiedAt?, notes?}]}` (1–200, one transaction) |
| POST `/admin/variants/:id/ranges` · PATCH/DELETE `/admin/ranges/:id` | write | `cycle` (+`cycleNote` for OTHER), `rangeType`, `value` + `unit` (km/mi), wheel size, conditions; 409 on an identical key |
| POST `/admin/variants/:id/consumption` · PATCH/DELETE `/admin/consumption/:id` | write | `kind` electricity (Wh/km) / fuel (L/100km), `mode`, any known unit |
| POST `/admin/variants/:id/charging-curves` · PATCH/DELETE `/admin/charging-curves/:id` | write | 2–101 points, unique SoC 0–100, sorted |
| POST `/admin/variants/:id/charging-times` · PATCH/DELETE `/admin/charging-times/:id` | write | `fromSoc < toSoc` (0–100), `duration` + `durationUnit`, charger power or conditions required, average ≤ peak |
| GET `/admin/variants/:id/markets` · PUT/DELETE `/markets/:code` | read / write | availability, local names, drive side, launch / discontinued dates, source, verifiedAt; DELETE → 409 while comparisons or published tours use it |
| PUT `/admin/variants/:id/markets/:code/inlets` | write | replaces `{inlets:[{connectorTypeCode, currentType, maxPowerKw?, source…}]}`; connector must support AC/DC |
| GET `/admin/variants/:id/prices?marketCode=` | vehicles.read \| prices.write | newest effective date first |
| POST `/admin/variants/:id/prices` · PATCH/DELETE `/admin/prices/:id` | prices.write | see §3 |
| GET/POST `/admin/vehicle-media` · PATCH/DELETE `/:id` | read / write | exactly one of modelId / generationId / variantId; asset must be a ready, licensed IMAGE (never a panorama); one cover per target |
| GET `/admin/spec-sources` (`q, type`) · GET `/:id` (+usage) | vehicles.read \| sources.write \| stations.read | shared with stations (tariffs, energy prices) |
| POST · PATCH · DELETE `/admin/spec-sources` | sources.write | DELETE → 409 `IN_USE` with counts |
| GET `/admin/vehicles/data-quality?marketCode&issue` | vehicles.read \| analytics.read | per listed trim: `missing_key_specs, key_specs_without_source, unverified_key_specs, no_electric_range, no_local_price, stale_price (>365 d), no_images, no_inlets`; `meta.summary` |
| POST `/admin/vehicles/search-index/rebuild` | search.manage \| vehicles.publish | rebuilds brand/model/variant search documents |
| CSV — see §4 | | |

Publishing: `status` ∈ `draft | published | archived` on brands, models and
variants. Creating as draft needs `vehicles.write`; any other status change
(publish, unpublish, archive) needs `vehicles.publish` → 403
`PUBLISH_PERMISSION_REQUIRED`. A variant gets `publishedAt` the first time it
is published. `visibilityBlockers` explains why something is not public
(`brand_not_published`, `model_deleted`, `no_market_listing`, …).

## 3. Data rules (validated in the service first; the DB re-checks the critical ones)

- **Units**: numeric specs / ranges / consumption are stored in the canonical
  unit of the definition (km, kWh, kW, Wh/km, L/100km, min, mm, l, kg, s, Nm,
  hp, V, in, year); `unit` may be any known unit of the same dimension
  (spellings like `KWH`, `miles`, `kWh/100 km`, `PS`, `years` are normalized).
  The published form is kept in `originalValue/originalUnit` (explicit values
  win). Unknown unit, other dimension, a unit on text/boolean or unitless
  specs → 422 with the field name. Never any conversion between test cycles.
- **Spec values**: number / text / boolean per definition; numbers ≥ 0 (0 is
  a real value only when sent), unitless counts are integers; text ≤ 500.
  `marketCode` null = all markets, a market row overrides it there.
- **Powertrain separation**: BEV → electric range only, electricity
  consumption only (DB triggers too); HEV (no plug) → no electric range, no
  electricity consumption, no inlets / charging times / curves / `charging.*`
  specs; PHEV / EREV → both, never merged. Changing a variant to BEV with
  total range / fuel data, or to HEV with charging data → 422
  `NOT_APPLICABLE_TO_POWERTRAIN`.
- **Verification** (`common/data-point.ts`): `reliability=verified` or a
  `verifiedAt` needs `specs.verify` (403 `VERIFY_PERMISSION_REQUIRED`) and a
  source (422), verifiedAt defaults to now and cannot be in the future.
  Leaving a verified value unchanged needs no permission; changing its value
  (or source) without re-verifying resets it to `unverified`, `verifiedAt
  null`. `manufacturer_claim / estimated / disputed` need only write rights.
  Same rules for inlets, ranges, consumption, curves, times, prices;
  `variant_markets.verifiedAt` is reset when the availability changes.
- **Prices**: official MSRP and dealer prices must be in the market's
  currency AND cite a source (422, field `currencyCode` / `sourceId`); a
  foreign-currency figure can only be a `market_estimate`
  (`inMarketCurrency:false`). Never converted. The trim needs a
  `variant_markets` row in that market. `effectiveTo ≥ effectiveFrom`.
  Official MSRP periods never overlap (409 `PRICE_PERIOD_OVERLAP`, DB
  exclusion too); a new official price closes the previous open-ended one the
  day before (`closePrevious`, default true). Identical entries → 409.
  Current price = valid today in the market time zone, local currency first,
  official > dealer > estimate, newest effective date. History order: newest
  `effectiveFrom`, then newest entry.
- **Charging**: SoC 0–100 with from < to, duration > 0, charger power or a
  written condition, average ≤ peak; curve points unique per SoC.
- **Deletion**: soft for brand / model / generation / variant (children
  guard 409 `IN_USE`, restore refuses a deleted parent 409 `ENTITY_DELETED`),
  data rows (specs, ranges, …, prices) are hard-deleted and audited.
- **Search index** (`search/vehicle-search-indexer.ts`): after every catalog
  change the brand / model / variant rows of `search_documents` (ar + en) are
  upserted when public AND listed in ≥ 1 market (`market_codes` = those
  markets), otherwise deleted. Best effort (logged, never blocks the edit).
  The demo seed writes directly: run `POST
  /admin/vehicles/search-index/rebuild` after seeding.

## 4. CSV import / export (`/api/v1/admin/vehicles/...`)

| Method + path | Permission | Notes |
|---|---|---|
| GET `import/templates` | imports.run \| vehicles.write \| data.export | 7 templates with columns (required, ar/en description, allowed values, format example), natural key, needed permissions, header line |
| GET `import/templates/:type` | same | empty template (header) as `text/csv` |
| POST `import/:type?dryRun=true\|false` | imports.run + vehicles.write (+ prices.write for prices) | multipart `file` (UTF-8, BOM ok, ≤ 5 MB, ≤ 5000 rows). **Dry run is the default.** |
| POST `import/jobs/:jobId/commit` | imports.run + vehicles.write | applies a dry-run preview; repeating returns the first commit |
| GET `import/jobs/:jobId` | imports.read \| imports.run | result (summary + rows) |
| GET `export/:type?brand&model&marketCode&includeDemo` | data.export + vehicles.read | same columns as the template, drafts included, demo rows only on request, audited (`vehicles.export`) |

Templates (`import/templates.ts`): `variants` (brand → model → generation →
year → variant; missing parents are created as drafts when their names are
given; imports never publish), `variant_markets`, `specs`, `ranges`,
`consumption`, `charging_times`, `prices`. Provenance columns: `source_id`,
or `source_url` (reuses a source with that URL), or `source_title` +
`source_type` (creates one; needs `sources.write`), `reliability`,
`verified_at`.

Semantics: header must match (unknown / missing required / duplicated
columns → 422 `CSV_INVALID` with lists). **Empty cell = not given** (keeps
the stored value on update). Row statuses in `import_job_rows` (job type
`vehicles.<template>`): dry run → `valid` (would create / update), `skipped`
(unchanged), `duplicate` (same natural key as an earlier row: first
occurrence wins), `invalid` (errors `{field (CSV column), code, message}`
in the request language). Commit → `imported`, `updated`, `skipped`,
`duplicate`, `invalid`, `failed` (DB refused). The whole run is ONE
transaction with a SAVEPOINT per row; a dry run is rolled back at the end, so
the preview is exactly what a commit does (incl. rows depending on earlier
rows). Commit re-validates against current data. Idempotency: natural keys →
re-importing the same file changes nothing (all `unchanged`); a preview is
committed at most once. Export → re-import of the same data is `unchanged`
for every template (tested). Formula-injection guard: exported cells starting
with `= + - @ TAB CR` get a leading `'`, removed again on import. Response
`ImportResult = {job: ImportJob, summary: {total, create, update, unchanged,
duplicate, invalid, failed}, rows: [...] (problems first, max 500),
committedJobId}`; all rows via `/admin/system/import-jobs/:id/rows`.

Imports run synchronously in the request (≤ 5000 rows; transaction timeout
30 s + 60 ms/row, max 10 min) — no BullMQ job needed at that size.

## 5. Verification (2026-09-25)

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (whole backend) | clean |
| `npx eslint "src/modules/vehicles/**/*.ts" "test/vehicles-*.ts"` | clean (full `npm run lint` only reports files of the stations agent, work in progress) |
| `npx prettier --check` on the same files | clean |
| `npx jest src/modules/vehicles` | 5 suites / 41 tests passed (units, verification rules, powertrain / SoC / curve rules, spec values, spec sheet grouping, derived hp, market scoping, price selection + history order, CSV codec, formula guard, slugs, visibility) |
| `npm test` (all unit tests) | 49 suites / 493 tests passed |
| `npm run test:e2e -- test/vehicles-catalog.e2e-spec.ts test/vehicles-import.e2e-spec.ts test/vehicles-public.e2e-spec.ts` | 3 suites / 33 tests passed |
| `npm run test:e2e` (all, own template DB per run) | 24 suites / 324 tests passed (incl. the 3 vehicles suites) |

e2e coverage: permissions (401 guest, 403 user / editor / writer without
publish, verify, prices, delete, export), publish flow, slug conflicts, BEV
vs PHEV same trim name, powertrain changes, unit conversion + original
value, verification reset, SoC / charger rules, curves, per-market
availability + inlets + AC/DC, prices (source, local currency, estimate in
USD, closing, overlap 409, history order), public list filters (powertrain,
local price range, range needs its cycle, drive/seats/body/brand, text
search ar), market separation (EG vs SA vs AE), null never 0, model page,
spec sheet provenance + market-specific rows, pickers cascade + scopes,
unpublish / soft delete / restore, 304 with ETag, demo tour summary (seat
scenes, preview URL), related demo article, gallery licence rules, deletion
guards, data quality, search index; CSV templates, CSV_INVALID, dry run
(nothing written), duplicates, commit once, re-import unchanged, per-row
rules for every template, export restricted + audited + round trip incl.
formula guard.

## 6. Not done / limits

- `backend/openapi.json` not re-exported (shared file; other agents add
  endpoints in parallel) — the integrator should run `npm run
  openapi:export`. Swagger at `/api/docs` shows all vehicles routes.
- Admin UI screens are deferred (API only). `REQUIREMENTS_TRACKER.md` not
  edited (outside this area).
- No view counter / "popular" sort for cars (content_daily_stats) and no
  "most compared" report — the comparisons module owns comparison stats.
- `data.export` is granted only to owner / admin by the seed matrix
  (vehicle_data_manager cannot export); grant it in the roles screen if
  wanted.
- The public list computes cards on request (SQL for filtering/paging +
  one query batch per page); no extra cache beyond HTTP caching.
- The spec sheet inlines the source object in every data point (simple for
  clients, bigger payload — responses are gzip-compressed).
- Brand/model `description*` are plain text (no rich text).
- Search documents of the demo seed are only created by the rebuild
  endpoint (the seed writes the tables directly).

## 7. Schema change requests

None.
