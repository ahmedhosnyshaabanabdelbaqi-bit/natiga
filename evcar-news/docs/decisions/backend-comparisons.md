# Backend comparisons + recommendations (backend-comparisons) — decisions

Area: `backend/src/modules/comparisons/**`, `backend/src/modules/recommendations/**`,
tests `backend/test/comparisons-*.e2e-spec.ts` + unit specs next to the code.
Requirements: REQUIREMENTS §7 (word by word), §4 (curated comparisons on home),
§16 (ads never change results), §17 (most-compared report), §20 (share links),
§22 (acceptance: mixed cycles / missing values never become 0 or a win).

STATUS: early contract (written before the code). Final shapes and the
verification table are at the end of this file once done.

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
