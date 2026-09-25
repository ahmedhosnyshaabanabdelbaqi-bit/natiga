# Backend discovery: search, home, favorites, encyclopedia, services directory (backend-discovery) — decisions

Area: `backend/src/modules/{search,home,favorites,encyclopedia,services-directory}`,
tests `backend/test/discovery-*.e2e-spec.ts` (+ `test/discovery-helpers.ts`) and
unit specs next to the code. Requirements: REQUIREMENTS §4 (home, unified
search), §14 (favorites), §15 (encyclopedia, services directory), §16 (sponsored
labels), §19 (rate limits, privacy); contract ARCHITECTURE §3, §4.3, §4.7.

STATUS: contract written first (before the code) so the mobile teams can
start; the final sections (verification, limits) are completed at the end.

No dependency added. `package.json`, `app.module.ts`, Prisma schema and
migrations are unchanged (schema change requests: §9).

Conventions (all routes under `/api/v1`): `{data}` / `{data, meta}` envelopes,
errors `{error:{code,message,details?,requestId}}`, `?lang=ar|en` (else
`Accept-Language`, default `ar`), `?market=EG` (else `X-Market`, default
market). Missing values are `null` (show "غير متوفر / Not available"), never 0.
Offsets in `highlights` are UTF-16 code-unit offsets into the returned string
(`start` inclusive, `end` exclusive) — Dart `String` indexes the same way; render
them with `TextSpan`s, never as HTML.

## 1. Unified search (`search` module)

### `GET /search?q=&types=&limit=&page=&allMarkets=` (public, rate limit `search`)

- `q` 1..100 chars (after trimming); must contain a letter or digit → else 422.
- `types` comma list of `articles, brands, models, variants, stations,
  encyclopedia, services` (default: all). Unknown value → 422.
- `limit` items per group 1..20 (default 5). `page` (default 1) pages every
  requested group (use one type + `page` for "see all").
- `allMarkets=true` ignores the market (default: only content of the market).

```ts
SearchResponse = { data: {
  query: string,                 // as received (cleaned)
  normalizedQuery: string,       // Arabic-normalized (أ/إ/آ→ا, ى→ي, ة→ه, no diacritics/tatweel, lower-case)
  expansions: { term: string, canonical: string }[],   // aliases applied (e.g. "بي واي دي" → "BYD")
  totalHits: number,             // Σ group totals
  groups: SearchGroup[]          // requested types, fixed order above, empty groups included
}}
SearchGroup = { type: 'articles'|'brands'|'models'|'variants'|'stations'|'encyclopedia'|'services',
                total: number, page: number, pageSize: number, hasMore: boolean, items: SearchHit[] }
SearchHit = {
  type: 'article'|'brand'|'model'|'variant'|'station'|'encyclopedia'|'service',
  id: uuid, slug: string|null, title: string, subtitle: string|null,
  snippet: string|null,          // short plain-text excerpt around the match (≤ 200 chars)
  imageUrl: string|null,
  language: 'ar'|'en',           // language of title/snippet
  isFallback: boolean,           // true = not in the requested language
  highlights: { title: Range[], snippet: Range[] },    // Range = { start, end }
  matchedBy: 'exact'|'prefix'|'text'|'alias'|'fuzzy',
  score: number,                 // relevance 0..~1.5, only for ordering
  isDemo: boolean,               // show a visible "demo" label
  details: {                     // type-specific, all keys always present for the type
    // article:      { articleType, publishedAt }
    // brand:        {}
    // model:        { brandName|null }
    // variant:      { modelSlug|null, modelYear|null, powertrainType|null }
    // station:      { city|null, latitude, longitude, operationalStatus, countryCode }
    // encyclopedia: { categoryKey, categoryName, reviewedAt }
    // service:      { serviceType, serviceTypeLabel, city|null, isSponsored, sponsorLabel|null, contactVerified }
  }
}
```
App routes: article → `/news/:slug`, brand → `/brands/:slug`, model →
`/cars/:slug`, variant → `/variants/:slug`, station → `/charging/stations/:id`,
encyclopedia → `/encyclopedia/:slug`, service → `/services/:slug`.
Ranking is relevance only (sponsored directory entries get no boost; they
carry `details.isSponsored` + a label). Cache: `public, max-age=60`, ETag/304.

### `GET /search/suggest?q=&limit=` (public, rate limit `search`)
`q` 1..100, `limit` 1..15 (default 8). Prefix / word-prefix matches for the
search box: alias canonicals (typing "تسل" suggests "Tesla"), brands, models,
variants, encyclopedia titles, station and service names, article titles.
```ts
{ data: Suggestion[], meta: {page:1,pageSize,total,totalPages:1} }
Suggestion = { text: string, kind: 'query'|'entity',
               type: SearchHit['type']|null, id: uuid|null, slug: string|null,
               highlights: Range[] }        // matched prefix inside `text`
```
`kind='query'` = a spelling to search for (run `/search?q=<text>`);
`kind='entity'` = open the item directly.

### Admin (`search.manage`)
| Method + path | Notes |
|---|---|
| GET `/admin/search-aliases?q=&active=&system=&entityType=&page=&pageSize=` | paginated `AliasView` |
| GET `/admin/search-aliases/:id` | |
| POST `/admin/search-aliases` | `{term, canonical, locale?: 'ar'\|'en'\|null, entityType?, entityId?, isActive?}` → 201. 409 `SEARCH_ALIAS_EXISTS` (same pair after normalization); 422 when term ≡ canonical after normalization or the bound entity does not exist |
| PATCH `/admin/search-aliases/:id` | partial; system aliases: only `isActive` may change (409 `SEARCH_ALIAS_IS_SYSTEM`) |
| DELETE `/admin/search-aliases/:id` | 204; system → 409 `SEARCH_ALIAS_IS_SYSTEM` (deactivate instead) |
| GET `/admin/search/status` | per entity type: documents in the index vs. publicly visible rows (drift check) |
| POST `/admin/search/reindex` | rebuilds the article + catalog documents through the owning modules' indexers → `{articles, models}` |
`AliasView = {id, term, canonical, termNormalized, canonicalNormalized, locale|null, entityType|null, entityId|null, isActive, isSystem, createdAt, updatedAt}`.
Every admin write is audited (`search_aliases.create|update|delete`, `search.reindex`).

## 2. Home (`home` module)

### `GET /home?lat=&lng=` (public; token optional)
Sections follow `app_settings.home.sections` (order + visibility, admin
`PUT /admin/settings/home-sections`) and the effective feature flags of
`/app-config`. Hidden sections are omitted (listed in `hiddenSections`).
```ts
{ data: {
  market: string, language: 'ar'|'en', personalized: boolean, generatedAt: iso,
  sections: HomeSection[],
  hiddenSections: { key: string, reason: 'disabled_by_admin'|'feature_off' }[]
}}
HomeSection = {
  key: 'top_story'|'for_you'|'latest_news'|'reviews'|'new_cars'|'featured_comparisons'
     |'interior_tours'|'nearby_stations'|'charging_guides',
  order: number,                 // 1..n = render order
  title: string,                 // localized section title
  itemType: 'article'|'car'|'comparison'|'tour'|'station'|'encyclopedia',
  state: 'ok'|'empty'|'location_required'|'unavailable',
  items: [...],                  // shapes below
  browse: { resource: 'articles'|'cars'|'comparisons'|'tours'|'stations'|'encyclopedia',
            params: Record<string,string> }   // "see all" (never hidden by personalization)
}
```
Items: `article` = the `/articles` list item (`PublicArticleSummaryDto`,
backend-articles §1.1); `car` = `CarCard` (backend-vehicles §1); `tour` =
`TourCard` (backend-tours §1); `station` = `/stations` list item
(backend-stations §1.1, `distanceM` from the given point); `encyclopedia` =
`EncyclopediaEntrySummary` (§4); `comparison` =
```ts
HomeComparisonCard = { id, shareId, title, marketCode, itemCount, isDemo,
  items: [{ variantId, variantSlug, title /* "Brand Model Trim" */, modelSlug, modelYear,
            marketCode, image: Image|null }] }   // open with GET /comparisons/s/:shareId
```
- `top_story`: newest featured article (else newest article), 1 item.
- `for_you` (signed in with interests only, placed right after `top_story`,
  follows the visibility of `latest_news`): newest articles about followed
  brands / models / categories. Regular sections are never filtered.
- `latest_news` (10, excludes the top story), `reviews` (types `review` +
  `test_drive`, 6), `new_cars` (`/cars?sort=newest`, 10), `featured_comparisons`
  (published curated comparisons of the market, 6), `interior_tours` (10),
  `charging_guides` (published encyclopedia entries, charging categories
  first, 8), `nearby_stations` (only with `lat`+`lng`, 25 km, 10; without a
  point: `state: 'location_required'`, no items — ask for location or a city).
- A section that fails is returned with `state: 'unavailable'` (others still render).
- Cache: sections without user/location data are cached per lang + market
  (60 s, invalidated by settings changes); strong `ETag` (send `If-None-Match` →
  304). Guests without location: `Cache-Control: public, max-age=60`; signed-in
  or with a location: `private, no-cache`.

### `GET /me/interests`, `PUT /me/interests` (signed in)
```ts
Interests = { brands: {id, slug, name}[], models: {id, slug, name, brandName}[],
              categories: {id, slug, name}[] }
PUT body = { brandIds: uuid[], modelIds: uuid[], categoryIds: uuid[] }   // each ≤ 50, replaces the set
```
Unknown / unpublished ids → 422 `VALIDATION_FAILED` (`details[].field` = `brandIds[2]`…).

## 3. Favorites (`favorites` module, signed in; strict per-user isolation)

| Method + path | Notes |
|---|---|
| GET `/me/favorites?type=&page=&pageSize=` | newest first → paginated `FavoriteView` |
| GET `/me/favorites/keys` | every key `{type,id,savedAt}` of the user (≤ 1000) for heart states |
| PUT `/me/favorites/:type/:id` | idempotent add → 201 (created) / 200 (already there) + `FavoriteView`. 404 `FAVORITE_TARGET_NOT_FOUND` for unknown or non-public targets; 409 `FAVORITES_LIMIT_REACHED` (1000) |
| DELETE `/me/favorites/:type/:id` | idempotent → 204 |
| POST `/me/favorites/merge` | guest → account: `{items:[{type,id,savedAt?}]}` (≤ 200) → `{added, alreadyPresent, skipped:[{type,id,reason:'not_found'\|'limit_reached'}], keys:[{type,id,savedAt}]}` |
`type` ∈ `article | model | variant | station | comparison | tour`.
```ts
FavoriteView = { type, id /* target id */, savedAt: iso,
  available: boolean,            // false = unpublished / removed since (keep it, show a note)
  title: string, subtitle: string|null, imageUrl: string|null,
  slug: string|null, shareId: string|null /* comparisons */, isDemo: boolean }
```
Comparisons: only curated (published), anonymous shared or the user's own
saved comparisons can be favorited (never another user's private label).

## 4. Encyclopedia (`encyclopedia` module)

Public (guests):
| Method + path | Notes |
|---|---|
| GET `/encyclopedia/categories` | active categories + `entryCount` |
| GET `/encyclopedia?category=&q=&page=&pageSize=` | published entries → paginated `EncyclopediaEntrySummary` |
| GET `/encyclopedia/:slug` | slug or id → `EncyclopediaEntryDetail`; 404 `ENCYCLOPEDIA_ENTRY_NOT_FOUND` |
```ts
EncyclopediaCategoryView = { key, name, nameAr, nameEn, description|null, iconKey|null, sortOrder, entryCount }
EncyclopediaEntrySummary = { id, slug, category: {key, name, iconKey|null},
  title, summary|null, language, isFallback, availableLanguages: string[],
  coverImage: Image|null, readingMinutes|null,
  review: { reviewed: true, reviewedAt: iso, label: string },   // "راجعه مختص تقني" badge
  publishedAt: iso, contentUpdatedAt: iso|null, isDemo }
EncyclopediaEntryDetail = EncyclopediaEntrySummary & { bodyHtml /* sanitized */,
  safetyNotice: string|null,     // shown on electrical topics: work by a qualified electrician only
  related: EncyclopediaEntrySummary[] }   // same category, ≤ 4
```
Admin (`/admin/encyclopedia/...`): entries CRUD + workflow
`draft → submit → in_review → technical-review (checklist + attestation) → publish`,
`reject → draft (note)`, `unpublish → draft`, `archive`, categories CRUD. See §6.

## 5. Services directory (`services-directory` module)

Public (guests):
| Method + path | Notes |
|---|---|
| GET `/services?type=&city=&brand=&q=&lat=&lng=&radiusKm=&openNow=&page=&pageSize=` | published providers of the market → paginated `ServiceProviderView`; `meta.sponsored` = labelled sponsored slot (≤ 3) |
| GET `/services/types` | `[{type, label, count}]` in the market |
| GET `/services/:slug` | slug or id → `ServiceProviderDetail`; 404 `SERVICE_PROVIDER_NOT_FOUND` |
```ts
ServiceProviderView = { id, slug, type, typeLabel, name, description|null, marketCode,
  city|null, address|null, latitude|null, longitude|null, distanceM|null,
  contact: { phone|null, whatsapp|null, email|null, websiteUrl|null,
             verified: boolean, verifiedAt: iso|null, stale: boolean /* > 12 months */,
             label: string /* "تم التحقق في …" / "لم يتم التحقق من بيانات التواصل" */ },
  openNow: 'open'|'closed'|'unknown', isAlwaysOpen: boolean|null,
  services: string[], brands: {id, slug, name}[], logo: Image|null,
  isSponsored: boolean, sponsorLabel: string|null /* always set when sponsored */,
  isDemo: boolean }
ServiceProviderDetail = ServiceProviderView & { openingHours: {day, windows:[[from,to]]|null}[]|null }
```
Editorial order (`data`) = distance (with `lat`/`lng`) else verified first then
name — sponsorship never changes it. Sponsored entries are only promoted in
`meta.sponsored` (each with `isSponsored: true` + `sponsorLabel`).
Admin (`/admin/services`): CRUD, publish/unpublish/archive (`directory.write`),
verify/unverify contacts (`directory.verify`), sponsorship fields (`ads.manage`).
