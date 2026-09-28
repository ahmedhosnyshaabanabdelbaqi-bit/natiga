# Review 3 — fixes and decisions

Scope: the 21 findings of the third review (backend, mobile, tests, CI, docs).
Date: 2026-09-28. No dependency added or upgraded. No Prisma schema or
migration change (requests below). Every finding was re-verified before the
fix; the table at the end gives the result per finding.

## 1. Trip planner: paid routing quota (finding 1, medium)

- `RoutingGuardService` (`backend/src/modules/trips/routing-guard.service.ts`)
  wraps every upstream routing call of the planner:
  - **cache**: the same waypoints (5 decimals ≈ 1 m, + provider + language)
    reuse the stored route for `ROUTING_CACHE_TTL_SECONDS` (default 21600 = 6 h);
  - **global budget**: at most `ROUTING_MINUTE_BUDGET` (default 30) upstream
    calls per minute and `ROUTING_DAILY_BUDGET` (default 1500) per UTC day for
    all users together; `0` = unlimited (self-hosted OSRM). Past the budget:
    **503 `INTEGRATION_QUOTA`**, header `Retry-After`,
    `details: {integration: "routing.<name>", window: "minute"|"day", retryAfterSeconds}`.
    Cache hits never use budget. Both windows are checked before counting.
  - Redis holds cache + counters (shared by instances); memory fallback per
    process when Redis is down (counters are never evicted by the cache pruning).
- Per-IP preset `tripPlan`: **6 plans / minute / IP** (was the 60/min search preset).
  Sign-in stays optional (§14.4 "browsing never needs sign-in").
- Mobile: `INTEGRATION_QUOTA` maps to `ApiErrorKind.rateLimited` (retryable,
  server message shown).
- Alternatives rejected: requiring sign-in (breaks §14.4), per-IP daily cap only
  (a botnet still drains the key).

## 2. Logs (findings 2 and 3, low)

`redactUrl()` (`backend/src/common/logging/logging.ts`), used by the pino
request serializer **and** the exception filter's `path`:
- position parameters (`lat`, `lng`, `lon`, `latitude`, `longitude`, `bbox`,
  `near`, `point`, `origin`, `destination`, `*Lat`, `*Lng`, `*Lon`, …) are
  rounded to 2 decimals (≈ 1 km) — REQUIREMENTS §19;
- `/articles/preview/<token>` → `/articles/preview/[REDACTED]`;
- parameter order is kept. Unit tests in `logging.spec.ts`.

## 3. Encyclopedia HTML (finding 4, low)

Encyclopedia entries now use the article policy: `prepareArticleHtml()` +
`ArticleMediaService.unlicensedImages()` (`EncyclopediaModule` imports
`ArticlesModule`). Inline images must be ready, licensed media-library
images; embeds only youtube-nocookie / Vimeo (YouTube rewritten to nocookie).
New 422 codes: `ENCYCLOPEDIA_IMAGE_NOT_LICENSED` (`details.images`),
`ENCYCLOPEDIA_EMBED_NOT_ALLOWED` (`details.embeds`). Existing stored entries
are not rewritten (they are re-checked on their next edit).

## 4. Comparison engine (findings 6, 7, 9)

- **Price types** (6, medium): official MSRP, dealer price and market estimate
  are never compared with each other. Different `priceType`s →
  `comparability: "not_comparable_conditions"`, `outcome: "no_winner"`, values
  and types still shown, note "Different price types (…); an official price is
  never compared with a dealer or estimated price". Same type + same currency →
  comparable, `basis: {currency, priceType}`. (Reuses the existing
  comparability value so clients need no new enum.)
- **Placeholder zeros** (7, medium): a numeric spec **with a unit** must be
  `> 0` (admin API and CSV import: 422 `constraints.positive`); exceptions where
  0 is real: `practicality.frunk_l`, `practicality.towing_braked_kg`; unit-less
  counts (airbags, NCAP stars, motors, phases) may be 0
  (`ZERO_ALLOWED_SPEC_KEYS`, `specAllowsZero()` in
  `vehicles/common/spec-values.ts`). The engine treats an already stored 0 on
  such a spec as **missing** (never a win), same rule as the calculators'
  vehicle data.
- **Charger conditions** (9, low): a charger-limited DC/AC time against a time
  with an unknown charger power (or a different one) → `not_comparable_conditions`.

## 5. Tours (finding 10, low)

A reference tour's photographed trim must be of the **same model generation**
as the tour trim: create, update and approve refuse otherwise with 422
`referenceVariantId.sameModel`.

## 6. Notifications (finding 11, medium)

- Only **news** notifications (followed brand / model / trim / category, via
  the article-published listener) have a producer. `GET/PATCH
  /me/notification-preferences` now also returns
  `supported: {types: ["news"], topicTypes: ["brand","model","variant","category"]}`
  (`PRODUCED_PREFERENCE_TYPES` / `PRODUCED_TOPIC_TYPES` in
  `notifications/notification-rules.ts`; add a key when its producer ships).
- The app shows only the supported switches and follow chips (market / price
  alert chips disappear); already existing follows stay listed and can be
  removed. Without the field (older server) the app shows everything as before.
- Tracker 16.1 → partial.

## 7. Fresh install shows only Home + Account (finding 13, medium)

- `npm run db:seed -- --enable-implemented-features` (and
  `sudo evcar seed --enable-features` in the deploy kit) switches on every flag
  of `IMPLEMENTED_FEATURES`, keeps the others, audits
  `settings.features.seed_enable`, idempotent. Default seed still leaves them
  off and prints how to switch them on.
- README (ar + en), DEPLOYMENT.md, DEPLOYMENT_AR.md and the install.sh final
  instructions mention the step.

## 8. APK workflow (finding 14, low)

`EVCAR_API_BASE_URL` is now required: the first step fails (with an
explanation) when it is empty or not `https://…/api/v1`; no fallback to the
non-existent `api.evcar.news`. Docs updated. (File is at the repository root,
`.github/workflows/evcar-android.yml`.)

## 9. Test independence (findings 12, 15, 20)

- Backend e2e: blocks that are workflows by nature (create → list → report →
  delete, draft → review → publish) now register their steps with
  `orderedSteps()` (`backend/test/utils/ordered-steps.ts`) and run them in one
  `it('workflow: the steps above, in order')`; a failure names the step
  (`[step: …]`). Other fixes: own users per block (notifications), relative
  counts (system overview failed imports, demo-seed idempotency), trips test no
  longer assumes which routing call was last (route cache).
  Converted blocks: personal-garage (whole file), personal-notifications
  (devices, subscriptions), personal-calculators (reference prices),
  tours-workflow (scenes and hotspots), community-content (comments, Q&A,
  reviews), community-moderation (permissions, reports, blocks, verified
  owner), comparisons-api (save/share), articles-rss, stations-sync,
  vehicles-import, vehicles-public, discovery-favorites (whole files),
  vehicles-catalog (whole file), schema-remaining (seeds), stations-admin
  (stations…), stations-community (check-ins, reports, suggestions),
  stations-public (live availability), discovery-directory (encyclopedia,
  services directory), discovery-search (aliases).
- CI (`.github/workflows/evcar-ci.yml`): a second e2e run with
  `--randomize --seed=<run number>` and `flutter test
  --test-randomize-ordering-seed=random`.
- Panorama processing e2e: explicit 180 s timeout.
- Flutter `app_config_test`: waits for the state change (listener + timeout)
  instead of sleeping 20 ms.

## 10. Mobile

- **Rates** (finding 5, medium): `AppFormatters.rate()` keeps up to 4 decimals
  (trailing zeros dropped, ≥ 2 when there is a fraction; `< EGP 0.0001` for
  smaller non-zero values): `0.0040` → `EGP 0.004`, never `0.00`. Used for
  tariff element prices, reference prices per kWh/L, calculator cost per kWh
  added / price per kWh / cost per km / TCO per km, charging-log cost per kWh.
  `money()` stays for totals.
- **Open now** (finding 8, low): the Dart evaluation returns `unknown` when the
  previous day is unknown (it may run past midnight), like the backend. Parity
  fixture: 1500 random schedules × 8 zones around the 2026 DST changes
  (`test/features/charging/fixtures/generate_open_now_parity.ts` →
  `open_now_parity.json`, test `open_now_parity_test.dart`): 0 mismatches.
- **App Links** (finding 19, low): manifest lists `www.evcar.news` too; a test
  keeps manifest hosts == `deepLinkHosts`.

## 11. Not fixed (with reason)

- **Finding 16** (fallback city for markets added later): needs a default
  centre per market in the database and `/app-config` (schema change request
  below). Today the app labels the fallback city as a default and the user can
  pick a point on the map or use the location.
- **Finding 18** (share module / web fallback pages): not built (web fallback
  pages + `/.well-known/assetlinks.json` need the web/share module, release
  signing SHA-256). Tracker 14.1 and 20.3 now say that on an installed APK the
  e-mail link opens the browser and the user pastes the code.
- **Finding 17**: tracker rows corrected (14.2, 16.2 → partial, app side not
  started); the Google/Apple buttons and the push SDK are not built in this pass.
- **Finding 21** (untracked mobile files): the integrator commit `32cb432`
  tracked them; the only untracked files now are the three new parity files of
  this pass (must be committed with it).

## 12. Schema change requests (for the integrator)

1. `spec_definitions.allow_zero BOOLEAN NOT NULL DEFAULT false` (true for
   `practicality.frunk_l`, `practicality.towing_braked_kg` and unit-less
   specs), then replace `ZERO_ALLOWED_SPEC_KEYS` by the column; optional CHECK
   trigger `vehicle_specifications.value_num > 0` for unit specs without
   `allow_zero`.
2. `markets.default_latitude NUMERIC(9,6)`, `markets.default_longitude
   NUMERIC(9,6)`, `markets.default_zoom SMALLINT` (+ admin API, `/app-config`
   `markets[].defaultCenter`) for finding 16.
3. Optional: trigger on `interior_tours` that the reference variant shares the
   generation of `variant_id` (the service already enforces it).

## 13. Per finding

| # | Finding | Result |
|---|---|---|
| 1 | Guest trip plans burn routing quota | fixed (cache + global budgets + 6/min/IP), unit tests |
| 2 | GPS in access logs | fixed (2-decimal rounding), unit tests |
| 3 | Preview tokens in logs | fixed (path redaction, also in the exception filter), unit tests |
| 4 | Encyclopedia images / iframes | fixed (article policy), e2e |
| 5 | Rates shown as 0.00 | fixed (`rate()`), unit tests |
| 6 | MSRP vs estimate winner | fixed (no winner across price types), unit tests |
| 7 | Spec 0 wins | fixed (validation + engine), unit tests |
| 8 | openNow parity | fixed + 1500-case parity fixture |
| 9 | Charger-limited vs unknown charger | fixed, unit tests |
| 10 | Reference tour of any trim | fixed (same generation), e2e |
| 11 | Notification switches without producer | fixed (`supported` + app filtering), e2e + app tests; tracker partial |
| 12 | e2e order dependence | fixed; 47/47 suites pass in default order and with seeds 12345, 987, 4242, 31337 |
| 13 | Features off after install | fixed (seed flag + docs), e2e |
| 14 | APK default URL | fixed (required variable) |
| 15 | Flaky app_config test | fixed (state wait); seed 523268451 passes |
| 16 | Fallback city | not fixed (schema request 2) |
| 17 | Tracker 14.2 / 16.2 | fixed (docs) |
| 18 | E-mail/share links on device | documented (tracker 14.1, 20.3); pages not built |
| 19 | www host in manifest | fixed + test |
| 20 | Processing e2e timeout | fixed (180 s) |
| 21 | Untracked mobile files | resolved by the integrator commit; 3 new files to commit |
