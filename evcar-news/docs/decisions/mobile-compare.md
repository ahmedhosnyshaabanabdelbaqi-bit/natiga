# Decisions — mobile-compare (Flutter Compare tab, picker, shared comparisons, recommendations)

Area: `mobile/lib/features/compare/**`, `mobile/lib/l10n/parts/compare_{ar,en}.arb`,
`mobile/test/features/compare/**`. Backend contract: `docs/decisions/backend-comparisons.md`
(compute / save / share / featured / me / recommendations) and `backend-vehicles.md` (`/cars/pickers`).

## 1. Structure

| Layer | Files |
| --- | --- |
| domain | `domain/comparison_models.dart` (ComparisonData, ComparisonCar, MetricGroup, Metric, MetricValue, enums with safe `unknown` fallbacks, SavedComparison, SharedComparison), `domain/picker_models.dart` (PickerQuery/PickerPage/PickerLevel), `domain/recommendation_models.dart` (RecommendationInput/Result, RecFactor, decision, ranked cars, contributions) |
| data | `data/compare_repository.dart` — every endpoint; reads are network-first with the shared `JsonCache` as offline fallback (`fetchWithCache`) |
| application | `application/compare_providers.dart` — repository, `comparisonProvider(CompareRequest)`, view options (summary / differences-only, remembered in SharedPreferences), shared / featured / mine, pickers, recommendations, injectable share sheet |
| presentation | `compare_screen.dart` (tab root `/compare`), `compare_picker_screen.dart` (`/compare/pick[?replace=<key>]`), `shared_comparison_screen.dart` (`/compare/s/:shareId`), `recommendations_screen.dart` (`/recommendations`), widgets: `comparison_view.dart`, `compare_labels.dart`, `compare_actions.dart` (save/share), `saved_comparisons.dart`, `tray_editor.dart`, `recommendation_results.dart` |

The tray itself is Prep's shared `lib/shared/compare_tray.dart` (max 4, min 2, persisted). Router
class names / routes are unchanged (Prep placeholders replaced in place); nothing outside the area
was edited.

## 2. Screens

- **Compare tab** — empty/one car: brand-gradient intro with the three rules (trim+year+market are
  mandatory, ranges only on the same cycle, missing = «غير متوفر»), tray editor (add / change /
  reorder / remove), recommendation CTA, «مقارنات مختارة» (featured, market from X-Market) and the
  user's saved comparisons (guest: sign-in hint). With 2–4 cars: controls (Summary / Detailed pills,
  differences-only switch, edit cars, save, share), then the result sliver.
- **Result sliver** (`ComparisonSliver`, shared with the deep-link screen): `PinnedHeaderSliver` car
  names (numbered badges, tap → open car / change / remove), warnings, summary card
  (`summary.winsByCar` + `summary.note`, never an overall verdict), metric groups in API (§7) order,
  footer with legend, `disclosure` and `generatedAt`.
- **Layouts** (`compareLayoutFor`): `table` in landscape / ≥720 dp when each column keeps ≥104 dp
  (scaled), `columns` when cars fit side by side, otherwise `stacked` (each car's value on its own
  line) — this is what 200 % text uses, so nothing is squeezed.
- **Value cell**: value + unit, condition chips (cycle, SoC window, charger), the published original
  when it differs from the converted unit, reliability/source, derived flag. `missing` →
  `result.notAvailableLabel` («غير متوفر» / "Not available") in italics, never 0; `not_applicable` →
  the row's `comparabilityNote`.
- **Winner marker**: icon (`emoji_events`) + text «الأفضل / Best», only through `Metric.markedWinners`,
  which requires `outcome == winner`, `comparability == comparable` and a present value — so even a
  leaked `winners[]` on a no-winner row is not shown. Never colour-only.
- **Picker** — cascade brand → model → year → trim → market over `GET /cars/pickers` (search field on
  brand/model levels, step progress, back steps up a level). Scope switch between the current market
  (`scope=market`, default) and all markets; each option shows its availability label, markets show
  currency; a car already in the tray is refused with a message; `?replace=<key>` swaps a car.
- **Save / share** — signed in: `POST /comparisons` saves to the account (title prompt), reused
  identical comparison says so; guest: sheet offering sign-in or an anonymous share link. Share uses
  `shareUrl` (`https://evcar.news/compare/<shareId>`). 409 `COMPARISON_LIMIT_REACHED` → localized
  message. Saved list supports rename (PATCH) and delete (DELETE, confirm sheet).
- **Shared comparison** — `GET /comparisons/s/:shareId`; same controls; "Edit in Compare" copies the
  cars into the tray; `result == null` → explains which `unavailableItems` are no longer published;
  unknown id → not-found state. Deep link `/compare/<shareId>` is mapped by `app/router/deep_links.dart`.
- **Recommendations wizard** — 4 steps (budget → usage: daily km, long trips/month, home charging →
  needs: seats, body types, powertrains → priorities: "suggested weights" switch, or 7 factors 0–10
  with −/+ 48 dp buttons where 0 is labelled "ignored"; all-zero is rejected). Weights are sent only
  when customised. Results: visible weights, basis (range/consumption cycle, currency), ranked cars with
  per-factor contribution bars (value + text), reasons, missing data per car, "compare these" (fills
  the tray), `sponsored:false` disclosure. `decision.decisive == false` → «لا يمكن الحسم» card with the
  reason (`no_candidates`, `no_comparable_candidates`, `fewer_than_two_comparable`,
  `scores_too_close`), missing data and suggestions; no "top pick" badge in that state.

Every screen has loading (skeleton shaped like the content), empty, error (retry), offline (cached
copy labelled with its date, or `OfflineState`) states; no screen needs a device permission. Pull to
refresh everywhere.

## 3. Rules applied

- Request items are always `{variantId, modelYear, market}` (upper-case market); car key
  `"<variantId>@<MARKET>"` matches `metric.winners`.
- `compute` always asks for `view: detailed, differencesOnly: false`; the app filters locally from
  `isKey` (summary) and `isDifferent` (differences only), so toggling needs no round trip and works
  offline from the cache. Empty filtered result → empty state with "Show all rows".
- The app never computes winners, never converts ranges between cycles, never derives averages, never
  fills a missing value; it renders exactly what the API decided.
- Unknown enum values (future statuses/outcomes) parse to `unknown` and render neutrally.
- A `present` value with `value == null` is treated as missing.
- Demo cars keep the kit `DemoBadge`; nothing real is fabricated (tests use demo-seed captures only).

## 4. API shapes used (exact, re-verified live on 2026-09-28)

`POST /comparisons/compute`, `POST /comparisons`, `GET /comparisons/s/:shareId`,
`GET /comparisons/featured?limit=`, `GET|PATCH|DELETE /me/comparisons[/:id]`,
`GET /cars/pickers?brand&model&year&variant&scope=market`, `POST /recommendations`. Shapes are those
in `backend-comparisons.md` §5 (ComparisonResult, ComparisonDto, CreatedComparisonDto,
RecommendationResult). The fixtures in `test/features/compare/fixtures/*.json` are real responses from
a backend running the demo seed; on 2026-09-28 I re-captured compute (ar/en), recommendations,
pickers, featured, guest create and shared from a fresh demo-seeded DB and the JSON key structure
was identical to the fixtures.

## 5. Tests (`test/features/compare/`, 36 tests)

- `compare_models_test.dart` — parsing of real ar/en responses; missing stays null; winners only on
  comparable decided rows; unknown enums; summary/differences filtering; saved/shared/featured;
  `result: null`; pickers per level + query; recommendations decisive / not decisive; input JSON;
  repository request bodies and offline cache fallback.
- `compare_screens_test.dart` — empty tray + cascade picker adds a car; pinned names while
  scrolling; cycle + SoC window beside values; winner icon + text; **no winner for mixed cycles /
  missing / equal values even if `winners[]` leaks**; summary + **differences-only** (and empty
  result); **landscape table**; 200 % text in **ar dark / en light** without overflow; guest share,
  guest save sheet, signed-in save + saved list; offline; replace car; deep link + "Edit in Compare";
  curated comparison in Arabic; unknown / unpublished links; recommendations «لا يمكن الحسم» (en and ar
  at 200 %) and a ranked result after ignoring a factor.

## 6. Verification (2026-09-28)

- `dart run tool/merge_arb.dart && flutter gen-l10n` — OK (compare ARB: 271 keys, ar/en parity).
- `flutter analyze` — no issues.
- `flutter test test/features/compare` — 36 passed.
- Full `flutter analyze` — no issues. Full `flutter test` — 442 passed, 7 skipped, 9 failed; all 9
  failures are in `test/features/discovery/discovery_screens_test.dart` (mobile-home team, work in
  progress in parallel), none in compare.
- Live backend (own DB `evcar_mcompare`, demo seed, compiled into the scratchpad, port 3917) — shape
  diff against fixtures: no differences; DB dropped afterwards.

## 7. Not done / notes

- No APK here (no Android SDK); not checked on a physical device or in the web preview (no
  screenshots this run — widget tests cover RTL/LTR, dark mode, 200 % text and landscape).
- The picker lists only what `/cars/pickers` returns; there is no free-text car search inside the
  picker beyond brand/model filtering.
- Comparison results are cached per exact car list; a comparison opened offline that was never
  computed online shows the offline state.
- Home team: the featured list here uses `GET /comparisons/featured`; Home can link to
  `AppRoutes.sharedComparison(shareId)` for any `ComparisonDto`.
- Cars team: "Add to compare" should add a `CompareSelection(variantId, modelYear, marketCode)` to
  `compareTrayProvider`; the Compare tab recomputes automatically.
