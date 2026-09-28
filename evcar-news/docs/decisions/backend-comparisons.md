# Backend comparisons + recommendations (backend-comparisons) — decisions

Area: `backend/src/modules/comparisons/**`, `backend/src/modules/recommendations/**`,
tests `backend/test/comparisons-*.e2e-spec.ts` + unit specs next to the code.
Requirements: REQUIREMENTS §7 (word by word), §4 (curated comparisons on home),
§16 (ads never change results), §17 (most-compared report), §20 (share links),
§22 (acceptance: mixed cycles / missing values never become 0 or a win).

STATUS: implemented and verified (2026-09-25). Final shapes and the
verification table are below.

## 1. Endpoints (all under `/api/v1`)

| Method + path | Auth | Notes |
|---|---|---|
| POST `/comparisons/compute` | public | body `ComputeComparisonRequest` → `{data: ComparisonResult}` |
| POST `/comparisons` | public (guest) or user | guest → anonymous share link; signed in → saved in the account (+ share link) |
| GET `/comparisons/s/:shareId` | public | shared / curated / saved comparison by share id + computed result |
| GET `/comparisons/featured` | public | published curated comparisons of the request market (home "مقارنات مختارة") |
| GET `/me/comparisons` | user | own saved comparisons (paginated) |
| GET `/me/comparisons/:id` | user | own saved comparison + computed result (404 for others') |
| PATCH `/me/comparisons/:id` | user | `{title}` |
| DELETE `/me/comparisons/:id` | user | 204 (404 for others') |
| POST `/recommendations` | public | explainable ranking (see §4) |
| GET/POST `/admin/comparisons`, GET/PATCH/DELETE `/admin/comparisons/:id` | `comparisons.curate` | curated (featured) comparisons |
| GET `/admin/comparisons/stats/most-compared` | `analytics.read` | per-variant counters |

Items everywhere: `{ variantId: uuid, modelYearId?: uuid, modelYear?: int, market: "EG" }`
— 2 to 4 items, **year + trim + market are mandatory** (§7): send `modelYearId`
(from the picker's year level) or `modelYear` (the year number, as stored in
the app's compare tray); it must match the variant (422 otherwise). The
(variant, market) pair must have a catalog record in that market (the picker's
market level).

See the final sections below for exact response shapes.

## 2. Comparison rules (engine: `comparisons/engine/`, pure, no DB/ads)

- Groups, in §7 order: price, range, battery, consumption, charging,
  performance, space, safety, warranty, features. Rows = spec definitions
  (`is_comparable`) of each group + computed rows: `price.current`,
  `range.electric`, `range.total`, `consumption.electricity`,
  `consumption.fuel`, `charging.dc_peak_kw`, `charging.dc_average_kw`,
  `charging.dc_time`, `charging.ac_time`, `charging.inlets`,
  `performance.drive_type`, `space.seats`, `space.doors`.
- Every value: canonical `value` + `unit`, `originalValue` + `originalUnit`
  as published, `condition` (cycle / mode / SoC window / charger kW / wheel
  size / price type / currency), `reliability`, `verifiedAt`, `source`,
  `derived`, `note`, `alternatives` (other cycles / windows / wheel sizes).
- `comparability`: `comparable | not_comparable_cycles |
  not_comparable_soc_window | not_comparable_conditions | missing_data |
  different_currency | not_applicable`. Precedence: not_applicable >
  missing_data > cycles / soc window / currency > conditions.
- `outcome`: `winner | tie | no_winner`; `winners` (car keys) only when
  comparability = comparable, direction ≠ none and every value is present and
  not disputed. Equal values → `tie` (no winner). Shared best → several winners.
- Range: compared on a cycle shared by all cars (WLTP preferred, then EPA,
  CLTC, NEDC; `OTHER` only with the same name); never converted; other cycles
  are listed as alternatives. Several values in one cycle (wheel sizes) → the
  highest, with a note. Electric range and total range are separate rows;
  total range of a BEV and electric range of an HEV are `not_applicable`
  (never filled from the other row).
- Consumption: same cycle AND same mode, lower is better; fuel consumption is
  not applicable to a BEV.
- Charging: DC peak kW and DC average kW are separate rows; average is never
  derived from the peak. Charging time only for the same SoC window
  (10–80 ≠ 30–80 → `not_comparable_soc_window`); a limiting charger →
  `not_comparable_conditions`. A PHEV without a DC inlet → not_applicable.
- Direction: from the spec definition; battery capacity rows are always
  `none` (a bigger battery never wins); battery warranty lives in the
  warranty group (higher wins). Booleans follow their definition.
- Price: current local price, lower wins only in the same currency; never
  converted (`different_currency`); foreign-currency estimates flagged.
- Missing value → `status: missing`, `value: null` (shown as
  `notAvailableLabel` = «غير متوفر» / "Not available"), never 0, never a win.
- `view=summary` keeps `isKey` rows; `differencesOnly=true` hides rows whose
  `isDifferent` is false. `summary.winsByCar` counts decided rows only and is
  explicitly NOT an overall verdict (`summary.note`).
- Every result: `sponsored: false` + `disclosure`; ads are never read.

## 3. Save / share

- `comparisons` rows; `kind`: `saved` (user_id set), `shared` (anonymous
  guest link), `curated` (featured, no owner). `shareId` = 12-char base64url
  (72 random bits). `shareUrl` = share base URL from settings +
  `/compare/{shareId}` → `https://evcar.news/compare/<shareId>`.
- Identical items (signature of variant+year+market in order) → the earlier
  row is reused (200, `reused: true`); new → 201. Max 200 saved per user →
  409 `COMPARISON_LIMIT_REACHED`. A bearer token that fails on POST → 401
  `TOKEN_EXPIRED` (never silently a guest share).
- `/me/comparisons/:id` of another user → 404 (no existence leak).
  `/comparisons/s/:shareId` never shows the owner; the owner's `title` only to
  the owner. Trims unpublished later → `unavailableItems`; `result = null`
  when fewer than 2 remain.
- Counters (anonymous, `content_daily_stats`): `variant.comparisons` per trim
  on compute / open, `comparison.views` + `comparisons.view_count` on open,
  `comparison.shares` on guest share; same client (HMAC ip+UA in Redis, 30
  min TTL) counted once per comparison; counting never fails a request.

## 4. Recommendations (`recommendations/engine/recommend.ts`, pure)

- Request `POST /api/v1/recommendations`:
  `{market?, budget, dailyKm, longTripsPerMonth, homeCharging, seatsNeeded,
  bodyTypes?, powertrains? (default BEV/PHEV/EREV), weights?: {price, range,
  dcCharging, acCharging, efficiency, space, performance} (0–10, 0 = ignore;
  all 0 → 422 rule allZero), limit? (1–20, default 10)}`. Nothing is stored.
- Hard filters: current local price ≤ budget, seats ≥ seatsNeeded, body type,
  powertrain; counts in `excluded`. Unknown price/seats → `notRanked`
  (`price_not_available` / `seats_not_available`), never guessed.
- Default raw weights: price 3; range 3 (+1 long trips ≥2/month, +1 daily ≥100
  km); dcCharging 1 (+1 long trips, +1 no home charging); acCharging 1 with home
  charging else 0.5; efficiency 1 (+1 daily ≥60 km); space 1; performance 0.5.
  Normalized to sum 1 and returned in `weights[]` with `source`
  (default|usage|user) + `weightNotes`.
- Range / consumption use one basis cycle (the one most candidates share,
  WLTP first) — never converted; a car with another cycle → `notRanked`
  `not_comparable` with `missingData[].reason = cycle_mismatch`. A missing
  weighted factor → `notRanked` `missing_data` (never scored 0). A recorded
  absence of a DC inlet is a real 0 with a negative reason.
- Score = Σ weight × position score (0..1 min–max among ranked) × 100;
  `contributions[]` add up to `score`. `reasons[]` localized (ar/en) with
  `code`, `sentiment`, `params` (e.g. RANGE_COVERS_DAYS, range below daily
  distance → negative).
- `decision.decisive = false` with `reason`: `no_candidates`,
  `no_comparable_candidates`, `fewer_than_two_comparable`, or
  `scores_too_close` (top two within 3 points). `topPickKey` only when
  decisive.
- `sponsored: false` on the result and every ranked car + `disclosure`;
  the service never queries ads (e2e: active campaigns do not change output).

## 5. Response shapes (exact)

```
ComparisonResult = { view: 'summary'|'detailed', differencesOnly, marketCode,
  cars: [{ key:"<variantId>@<MARKET>", position, variantId, variantSlug,
    modelYearId, modelYear, title, name, brand, model, powertrainType,
    bodyType|null, driveType|null, seats|null,
    market:{code,name,currencyCode,availability,offered,localName|null},
    image|null, price: PriceDto|null, hasTour, isDemo }],
  groups: [{ key, label, metrics: [{ key, group, label, description|null,
    kind:'number'|'text'|'boolean'|'money', unit|null,
    betterDirection:'higher'|'lower'|'none', comparability, comparabilityNote|null,
    basis: MetricCondition|null, outcome:'winner'|'tie'|'no_winner',
    winners:[carKey], isDifferent, isKey,
    values:[{ carKey, status:'present'|'missing'|'not_applicable',
      value|null, valueLabel|null, unit|null, originalValue|null,
      originalUnit|null, condition|null, reliability|null, verifiedAt|null,
      source|null, derived, note|null, alternatives:[...] }] }] }],
  summary: { metricsTotal, comparableMetrics, decidedMetrics,
    notComparableMetrics, missingDataMetrics, notApplicableMetrics,
    winsByCar:[{carKey,wins}], note },
  warnings:[{code,message}], legend:[{status,label}],
  sponsored:false, disclosure, notAvailableLabel, generatedAt }

ComparisonDto = { id, shareId, shareUrl, kind:'saved'|'shared'|'curated',
  isMine, title|null, displayTitle, marketCode,
  items:[{ position, variantId, marketCode, available, variantSlug|null,
    modelYearId|null, modelYear|null, modelId|null, modelSlug|null,
    title|null, powertrainType|null, availability|null, image|null, isDemo }],
  createdAt, updatedAt, isDemo }
CreatedComparisonDto = ComparisonDto + { saved, reused }
SharedComparisonDto = { comparison: ComparisonDto,
  result: ComparisonResult|null, unavailableItems: [item] }
AdminComparisonDto = ComparisonDto + { titleAr, titleEn,
  status:'draft'|'published'|'archived', order|null, viewCount, lastViewedAt }
MostComparedItem = { variantId, title, powertrainType, modelYear, published,
  comparisons }   (query ?days=&limit=)

RecommendationResult = { market:{code,name,currencyCode},
  input:{budget:Money, dailyKm, longTripsPerMonth, homeCharging, seatsNeeded,
    bodyTypes|null, powertrains},
  weights:[{factor,label,weight,raw,source,betterDirection,description}],
  weightNotes:[string], basis:{rangeCycle|null, consumptionCycle|null,
    consumptionMode|null, currency},
  decision:{decisive, reason|null, message, topPickKey|null},
  ranked:[{rank,key,car,score,contributions:[{factor,label,weight,score,
    points,value|null,unit|null,basis|null}],
    reasons:[{factor,code,sentiment,text,params}], sponsored:false}],
  notRanked:[{key,car,reason,missingData:[{factor,label,reason,detail}],
    explanation}],
  excluded:{total,overBudget,seatsTooFew,bodyType,powertrain},
  factorAvailability:[{factor,label,available,missing,notComparable,
    suggestion|null}],
  candidatesConsidered, notes:[string], sponsored:false, disclosure,
  notAvailableLabel, generatedAt }
```

All wrapped as `{data: ...}` (lists: `{data: [...], meta}`); Accept-Language
selects ar/en, `X-Market` the display market.

## 6. Notes for other teams

- Home (discovery): inject `ComparisonsService` from
  `src/modules/comparisons` (import `ComparisonsModule`) and call
  `featured(market, lang, limit)` → `ComparisonDto[]` for «مقارنات مختارة».
- Mobile: send items from the compare tray as `{variantId, modelYear,
  market}`; render `notAvailableLabel` for `status: missing`, show
  `condition.cycle` / `condition.socWindow` next to values, use `winners` +
  a text/icon marker (never colour only), and `comparabilityNote` when
  `outcome = no_winner`. Deep link `/compare/<shareId>` →
  `GET /comparisons/s/<shareId>`.
- Admin (deferred): `/admin/comparisons` CRUD (`comparisons.curate`);
  published needs `titleAr` + `titleEn`; `/admin/comparisons/stats/most-compared`
  (`analytics.read`). Writes are audited (entityType `comparison`).

## 7. Schema change requests

None.

## 8. Verification (2026-09-25)

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npx eslint src/modules/comparisons src/modules/recommendations test/comparisons-*` | clean |
| `npx prettier --check` (same paths) | clean |
| `npx jest` (all unit) | 55 suites / 647 tests passed (comparisons 59 of them) |
| `npm run test:e2e -- test/comparisons-api… comparisons-recommendations… comparisons-demo…` | 3 suites / 24 tests passed |

Not done: openapi.json not re-exported (integrator); no load testing of the
compute endpoint; the shared-link web fallback page belongs to the web/share
team.

## Review 3 (2026-09-28)

See `review-fixes-3.md`: different price types never decide a winner (`not_comparable_conditions`); a charger-limited time vs an unknown charger is not comparable; a stored 0 on a measured spec is treated as missing.
