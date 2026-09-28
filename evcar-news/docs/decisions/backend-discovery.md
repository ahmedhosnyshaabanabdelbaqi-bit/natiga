# Backend discovery: search, home, favorites, encyclopedia, services directory (backend-discovery) — decisions

Area: `backend/src/modules/{search,home,favorites,encyclopedia,services-directory}`,
tests `backend/test/discovery-*.e2e-spec.ts` (+ `test/discovery-helpers.ts`) and
unit specs next to the code. Requirements: REQUIREMENTS §4 (home, unified
search), §14 (favorites), §15 (encyclopedia, services directory), §16 (sponsored
labels), §19 (rate limits, privacy); contract ARCHITECTURE §3, §4.3, §4.7.

STATUS: implemented and tested (§8). The shapes below are the ones the code
returns.

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
- `limit` items per group 1..20 (default 5). `page` 1..50 (default 1) pages every
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
    // model:        { brandName|null }   (brand name in the request language)
    // variant:      { modelSlug|null, modelYear|null, powertrainType|null }
    // station:      { city|null, latitude, longitude, operationalStatus, countryCode }
    // encyclopedia: { categoryKey, categoryName, reviewedAt }
    // service:      { serviceType, serviceTypeLabel, city|null, isSponsored, sponsorLabel|null, contactVerified }
  }
}
```
`matchedBy`: `exact` / `prefix` = the (normalized) title equals / starts a word
with the query; `text` = every query token occurs somewhere (title, summary,
body, keywords); `alias` = matched through an alternative spelling or an alias
bound to the entity; `fuzzy` = typo tolerance only (pg_trgm, word similarity
≥ 0.45, queries ≥ 4 characters). Invalid input → 422 (`q` without a letter or
digit, unknown `types`, `q` > 100 chars).

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
| GET `/admin/search/status` | `[{entityType, indexed, visible, inSync, source:'index'\|'direct'}]`: documents in the index vs. publicly visible rows (stations / encyclopedia / services are `direct`, always in sync) |
| POST `/admin/search/reindex` | rebuilds the article + catalog documents through the owning modules' indexers (`ArticleSearchIndexService.reindexAll`, `VehicleSearchIndexer.rebuildAll`) → `{articles, models}` |
`AliasView = {id, term, canonical, termNormalized, canonicalNormalized, locale|null, entityType|null, entityId|null, isActive, isSystem, createdAt, updatedAt}`.
Every admin write is audited (`search_aliases.create|update|delete`, `search.reindex`).

## 2. Home (`home` module)

### `GET /home?lat=&lng=` (public; token optional)
Sections follow `app_settings.home.sections` (order + visibility, admin
`PUT /admin/settings/home-sections`) and the **effective** feature flags of
`/app-config` (`HomeFlagsService`). Hidden sections are omitted and listed in
`hiddenSections`. `lat` without `lng` (or the reverse) → 422.
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
Items are produced by the owning modules' public services, so they have
exactly the shape of their list endpoints:
- `article` = `/articles` list item (`PublicArticleSummaryDto`, backend-articles §1.1);
- `car` = `/cars` list item (`CarCardDto`, backend-vehicles);
- `comparison` = `/comparisons/featured` item (`ComparisonDto`, backend-comparisons;
  open it with its `shareId`);
- `tour` = `/tours` list item (`PublicTourCardDto`, backend-tours);
- `station` = `/stations` list item (`StationListItemDto`, backend-stations §1.1,
  with `distanceM` from the given point);
- `encyclopedia` = `EncyclopediaEntrySummary` (§4).

Rules:
- `top_story`: newest featured article (else newest article), 1 item. It is
  computed first and never repeated in `latest_news` / `for_you`.
- `for_you` (signed in AND following at least one brand / model / category;
  placed right after `top_story`; follows the visibility of `latest_news`):
  newest articles about followed brands / models / categories (≤ 10). Regular
  sections are never filtered by interests.
- `latest_news` (10), `reviews` (types `review` + `test_drive`, 6),
  `new_cars` (`/cars?sort=newest`, 10), `featured_comparisons` (6),
  `interior_tours` (10), `charging_guides` (published reviewed entries,
  categories `home_charging`, `fast_charging`, `connectors` first, 8),
  `nearby_stations` (only with `lat`+`lng`, 25 km, 10; without a point:
  `state: 'location_required'`, no items → ask for location or let the user
  pick a city/point; the point is used for this request only, never stored).
- A section whose source fails is returned with `state: 'unavailable'` (the
  others still render); `empty` = no content yet (show an empty state).
- Section → feature flag: news sections → `news`, `new_cars` → `cars`,
  `featured_comparisons` → `comparisons`, `interior_tours` → `interiorTours`,
  `nearby_stations` → `stations`, `charging_guides` → `encyclopedia`.
  **Important:** `/app-config` forces every flag off until the feature is listed
  in `IMPLEMENTED_FEATURES` (settings module, not my area). Until the
  integrator adds them, `/home` returns no sections (all `feature_off`).
- Cache: sections without user / location data are cached in memory per
  lang + market + section for 60 s (cleared on `CONFIG_CHANGED_EVENT`, i.e.
  settings / markets changes). Express adds a strong `ETag` (send
  `If-None-Match` → 304; `generatedAt` only changes when a cached section is
  rebuilt). Guests without location: `Cache-Control: public, max-age=60`;
  signed in or with a location: `private, no-cache`. `Vary: Accept-Language,
  X-Market, Authorization`.

### `GET /me/interests`, `PUT /me/interests` (signed in)
```ts
Interests = { brands: {id, slug, name}[], models: {id, slug, name, brandName}[],
              categories: {id, slug, name}[] }
PUT body = { brandIds: uuid[], modelIds: uuid[], categoryIds: uuid[] }   // each ≤ 50, replaces the set
```
Unknown / unpublished ids → 422 `VALIDATION_FAILED` (`details[].field` =
`brandIds[2]`…). Following ≠ notifications (separate table).

## 3. Favorites (`favorites` module, signed in; strict per-user isolation)

| Method + path | Notes |
|---|---|
| GET `/me/favorites?type=&page=&pageSize=` | newest first → paginated `FavoriteView` |
| GET `/me/favorites/keys` | every key `{type,id,savedAt}` of the user (≤ 1000) for heart states (list envelope, page 1 of 1) |
| PUT `/me/favorites/:type/:id` | idempotent add → **201** (created) / **200** (already there) + `FavoriteView`. 404 `FAVORITE_TARGET_NOT_FOUND` for unknown or non-public targets; 409 `FAVORITES_LIMIT_REACHED` (1000); unknown type → 422; malformed id → 404 (project `UuidParamPipe`) |
| DELETE `/me/favorites/:type/:id` | idempotent → 204 |
| POST `/me/favorites/merge` | guest → account: `{items:[{type,id,savedAt?}]}` (≤ 200; duplicates ignored; future `savedAt` → now) → `{added, alreadyPresent, skipped:[{type,id,reason:'not_found'\|'limit_reached'}], keys:[{type,id,savedAt}]}` (200) |

`type` ∈ `article | model | variant | station | comparison | tour`.
```ts
FavoriteView = { type, id /* target id */, savedAt: iso,
  available: boolean,            // false = unpublished / hidden since (keep it, show a note)
  title: string, subtitle: string|null, imageUrl: string|null,   // imageUrl null when unavailable
  slug: string|null, shareId: string|null /* comparisons, when available */, isDemo: boolean }
```
Every query is filtered by the caller's user id (another user's favorites are
never read, counted or deleted). Comparisons: only curated (published),
anonymous shared or the caller's own saved comparisons can be favorited — never
another user's private one (its label is never exposed). Writes are rate
limited (`write`). Mobile: on sign-in call `merge` with the device list, then
replace local state with `keys`.

## 4. Encyclopedia (`encyclopedia` module)

Public (guests):
| Method + path | Notes |
|---|---|
| GET `/encyclopedia/categories` | active categories + `entryCount` (list envelope) |
| GET `/encyclopedia?category=&q=&page=&pageSize=` | published, technically reviewed entries → paginated `EncyclopediaEntrySummary` (order: sortOrder, newest) |
| GET `/encyclopedia/:slug` | slug or id → `EncyclopediaEntryDetail`; 404 `ENCYCLOPEDIA_ENTRY_NOT_FOUND` |
```ts
EncyclopediaCategoryView = { key, name, nameAr, nameEn, description|null, iconKey|null, sortOrder, entryCount }
EncyclopediaEntrySummary = { id, slug, category: {key, name, iconKey|null},
  title, summary|null, language, isFallback, availableLanguages: string[],
  coverImage: Image|null, readingMinutes|null,
  review: { reviewed: true, reviewedAt: iso, label: string },   // "راجعه مختص تقني" / "Reviewed by a technical specialist"
  publishedAt: iso, contentUpdatedAt: iso|null, isDemo }
EncyclopediaEntryDetail = EncyclopediaEntrySummary & { bodyHtml /* sanitized */,
  safetyNotice: string|null,     // categories home_charging, fast_charging, connectors, batteries
  related: EncyclopediaEntrySummary[] }   // same category, ≤ 4
```
`Image` = vehicles `ImageDto` (licensed, ready images only).

Admin (`/admin/encyclopedia`):
| Method + path | Permission | Notes |
|---|---|---|
| GET `review-checklist` | write or review | `{items: string[], attestationText}` |
| GET/POST `categories`, PATCH/DELETE `categories/:key` | publish (GET: write or review) | system categories cannot be deleted (409 `ENCYCLOPEDIA_CATEGORY_IS_SYSTEM`), in use → 409 `ENCYCLOPEDIA_CATEGORY_IN_USE` |
| GET `entries?status=&category=&q=`, GET `entries/:id` | write / review / publish | `AdminEntryView` |
| POST `entries` | `encyclopedia.write` | `{slug?, categoryKey, sortOrder?, coverAssetId?, translations:{ar?:{title,summary?,bodyHtml}, en?:{…}}}` → 201 draft; HTML sanitized |
| PATCH `entries/:id` | write | content (translations / category / slug) only in `draft` → else 409 `ENCYCLOPEDIA_ENTRY_LOCKED`; per language object = replace, null = remove |
| DELETE `entries/:id` | write | soft delete; not while published |
| POST `entries/:id/submit` | write | draft → in_review; needs title + body; blocks unsafe phrases (422 `details[].constraints.unsafeElectricalInstructions`) |
| POST `entries/:id/review` | `encyclopedia.review` | `{checklist:{facts_verified, no_safety_bypass, no_unsafe_electrical_instructions, qualified_electrician_referral, units_and_standards_correct, translations_consistent}, attestation: true, note?}` — every item must be `true` (422 per item), `attestation` must be `true`; the author cannot review (409 `ENCYCLOPEDIA_SELF_REVIEW`); sets `technical_reviewed_at/_by` |
| POST `entries/:id/reject` | review | `{note}` → draft, review cleared |
| POST `entries/:id/publish` | `encyclopedia.publish` | in_review + approved → published (409 `ENCYCLOPEDIA_REVIEW_REQUIRED` otherwise); re-publishing sets `contentUpdatedAt` |
| POST `entries/:id/unpublish` | publish | published/archived → draft, review cleared (a new review is required) |
| POST `entries/:id/archive` | publish | → archived |
`AdminEntryView = {id, slug, categoryKey, status, sortOrder, coverAssetId, translations:[{locale,title,summary,bodyHtml}], review:{reviewedAt, reviewedById, checklist|null, note}, publishedAt, contentUpdatedAt, isDemo, createdById, createdAt, updatedAt, allowedActions: string[]}`.
Safety (REQUIREMENTS §15): the reviewer checklist + attestation is the real
control; a short blocklist (`UNSAFE_PHRASES`, e.g. "bypass the RCD",
"تجاوز القاطع") catches obvious cases on submit / review / publish; electrical
categories always show the fixed safety notice. Invalid workflow step → 409
`ENCYCLOPEDIA_INVALID_TRANSITION` (`details: {action, status}`).

## 5. Services directory (`services-directory` module)

Public (guests):
| Method + path | Notes |
|---|---|
| GET `/services?type=&city=&brand=&q=&lat=&lng=&radiusKm=&openNow=&page=&pageSize=` | published providers of the market → paginated `ServiceProviderView`; `meta.sponsored` = labelled sponsored slot (≤ 3), `meta.truncated` (> 2000 matches) |
| GET `/services/types` | `[{type, label, count}]` in the market (all 6 types, count may be 0) |
| GET `/services/:slug?lat=&lng=` | slug or id → `ServiceProviderDetail`; 404 `SERVICE_PROVIDER_NOT_FOUND` |
Filters: `city` = exact match after Arabic normalization; `brand` = slug or
id; `q` = text contains (normalized); `lat`+`lng` → within `radiusKm`
(default 50, max 500) of the point; `openNow=true` keeps only providers open
now (unknown hours are excluded). Types: `service_center, dealer,
charger_installer, emergency, battery_service, other`.
```ts
ServiceProviderView = { id, slug, type, typeLabel, name, description|null, marketCode,
  city|null, address|null, latitude|null, longitude|null, distanceM|null,
  contact: { phone|null, whatsapp|null, email|null, websiteUrl|null,
             verified: boolean, verifiedAt: iso|null, stale: boolean /* > 12 months */,
             label: string /* "تم التحقق في 3 مارس 2026" / "لم يتم التحقق من بيانات التواصل" */ },
  openNow: 'open'|'closed'|'unknown', isAlwaysOpen: boolean|null,
  services: string[], brands: {id, slug, name}[], logo: Image|null,
  isSponsored: boolean, sponsorLabel: string|null /* always set when sponsored */,
  isDemo: boolean }
ServiceProviderDetail = ServiceProviderView & {
  openingHours: { day: 'mon'..'sun', windows: {start:'HH:MM', end:'HH:MM'}[] | null /* null = unknown, [] = closed */ }[] | null,
  timezone: string }   // market time zone used for openNow
```
Editorial order (`data`) = distance (with `lat`/`lng`) else verified contacts
first then name — sponsorship never changes it. Sponsored entries stay in
their editorial position (labelled) and are additionally offered in
`meta.sponsored`. `isSponsored` is false once `sponsoredUntil` has passed;
`sponsorLabel` falls back to "مُموَّل / Sponsored" when the stored label is blank.

Admin (`/admin/services`):
| Method + path | Permission | Notes |
|---|---|---|
| GET `?status=&type=&market=&q=&sponsored=&verified=`, GET `:id` | directory.write / directory.verify / ads.manage | `AdminProviderView` (all columns + `brandIds`) |
| POST `/` | directory.write | draft; fields as the view (`openingHours` validated like stations; `isAlwaysOpen=true` needs `openingHours=null`; `websiteUrl` https only) |
| PATCH `:id` | directory.write or ads.manage | changing phone / whatsapp / email / website **clears the verification** |
| sponsorship fields `isSponsored`, `sponsorLabel`, `sponsoredUntil` | + `ads.manage` | else 403 `SPONSORSHIP_PERMISSION_REQUIRED`; sponsored needs a label (422) |
| DELETE `:id` | directory.write | soft delete |
| POST `:id/publish` \| `unpublish` \| `archive` | directory.write | publish needs a city or coordinates; same status → 409 |
| POST `:id/verify-contact` `{note}` / DELETE `:id/verify-contact` | directory.verify | records `contactVerifiedAt/ById/Note` (how it was verified) |
Every admin write is audited (`services.*`).

## 6. Search internals

- Query plan (`search/domain/query-plan.ts`): normalized query + one variant
  per alias spelling found as whole tokens (alias groups = canonical + every
  term, both directions, weight 0.95); if nothing matches exactly, a 1–3 word
  query close to an alias spelling (JS trigram similarity ≥ 0.5, e.g. "زيكرر")
  adds that group with weight 0.8. ≤ 8 variants. Aliases bound to an entity
  (`entityType`+`entityId`) pin it into its group.
- One SQL statement per source, all in one transaction that sets
  `pg_trgm.word_similarity_threshold = 0.45` locally (`<%` uses the trigram
  GIN indexes). Articles / brands / models / variants: `search_documents`
  (maintained by the articles / vehicles modules; visibility re-checked
  against the source tables). Stations: `charging_stations.search_text`
  (trigram index). Encyclopedia / services: `app_normalize_text()` on the
  fly (small tables).
- Scores: exact 1 > prefix 0.85 > word prefix 0.75 > contains 0.65 > pinned
  0.95 > all tokens 0.45 (+ ts_rank for documents) > fuzzy 0.6×similarity; ×
  variant weight × document boost. No sponsorship or popularity boost.
- Highlights are computed on the original text with an offset map of the
  normalization (removed marks belong to the preceding letter, so
  "المنزليّ" is highlighted whole).
- Aliases are cached in memory for 60 s and invalidated by admin writes on
  the same instance (other instances pick changes up within 60 s).

## 7. Files

- `backend/src/modules/search/` — `common/` (types, text-match, SQL scoring,
  hit builder, `discovery-http.ts` = shared error/cache helpers of the 5
  modules), `domain/query-plan.ts`, `services/` (alias index, search, admin,
  `sources/{documents,stations,encyclopedia,services}.source.ts`),
  `controllers/search.controller.ts`, `dto/search.dto.ts`.
- `backend/src/modules/home/` — `domain/sections.ts` (plan), `services/`
  (`home.service.ts`, `home-flags.service.ts`, `interests.service.ts`),
  controller, DTOs.
- `backend/src/modules/favorites/` — `favorite-targets.service.ts`
  (visibility + display per type), `favorites.service.ts`, controller, DTOs.
- `backend/src/modules/encyclopedia/` — `common/encyclopedia-rules.ts`
  (visibility, checklist, safety), public + admin services, controller, DTOs.
- `backend/src/modules/services-directory/` — `common/labels.ts`, public +
  admin services, controller, DTOs.
- Tests: unit `search/domain/query-plan.spec.ts`, `home/domain/sections.spec.ts`,
  `services-directory/common/labels.spec.ts`; e2e `test/discovery-{search,home,favorites,directory}.e2e-spec.ts`
  + `test/discovery-helpers.ts`.

Reused from other modules (read-only, through their exports): articles
(`ArticlesPublicService`, `ArticleSearchIndexService`, visibility, slug
helpers), vehicles (`CarPagesService`, `MediaUrlService`,
`VehicleSearchIndexer`, visibility), comparisons (`ComparisonsService.featured`),
tours (`ToursPublicService.featured`, `publicTourWhere`), stations
(`StationSearchService`, opening-hours helpers, query validators), settings
(`AppConfigService`, `SettingsService`).

## 8. Verification

- `npm run typecheck`, `npx eslint` on my files, `prettier --check`: clean.
- `npm test`: 62 suites / 729 tests passed (incl. 19 new discovery unit tests).
- `npm run test:e2e -- test/discovery-*.e2e-spec.ts`: 4 suites / 48 tests
  passed (search 18, home 6, favorites 9, directory 15).
- Full `npm run test:e2e`: 41 suites / 542 tests passed (no regressions).
- Covered: Arabic variants (أ/ا, ة/ه, ى/ي, diacritics in query and title),
  highlights on the original text, alias hits (+ pinned entity, deactivation,
  deletion), typo tolerance, unpublished / hidden content never returned,
  sponsored directory hits labelled and not boosted, 422 input rules, ETag/304;
  home order + disabled sections + feature-off, location-only nearby
  stations, `for_you` without hiding anything, cache headers; favorites
  isolation, visibility, private comparisons, merge; encyclopedia workflow
  (sanitizing, unsafe phrase block, review required, checklist + attestation,
  self-review ban, locked content, safety notice, audit); directory order,
  sponsored slot, expired sponsorship, distance, openNow, verification
  cleared on contact change, sponsorship permission.

## 9. Schema change requests

None blocking. Optional improvement for the integrator:
- `encyclopedia_entries.review_checklist jsonb NULL` + `review_attested_at
  timestamptz NULL` (CHECK: published ⇒ both set). Today the checklist and
  attestation of each approval are stored in the audit record
  (`audit_logs.action = 'encyclopedia.technical_review'`, `after.checklist`,
  `after.attestation`) and read back for the admin view; the DB still
  enforces "published ⇒ technical_reviewed_at".

## 10. Not done / limits

- `IMPLEMENTED_FEATURES` (settings module) must list news, cars, comparisons,
  interiorTours, stations, encyclopedia, servicesDirectory, favorites… or
  `/home` stays empty and the app hides those features.
- `favorites` / `servicesDirectory` / `encyclopedia` endpoints are not gated by
  their feature flags (the app gates the UI).
- Search does not cover tours or articles' body in other markets beyond
  `allMarkets=true`; `search_documents` for tours / encyclopedia / services
  are not written (those groups query tables directly).
- Home caches are per instance (in memory), not in Redis.
- openapi.json was not re-exported (other agents are adding endpoints).
- No real data was added; tests use fictional rows only.

## Review 3 (2026-09-28)

See `review-fixes-3.md`: encyclopedia bodies use the article HTML policy (422 `ENCYCLOPEDIA_IMAGE_NOT_LICENSED` / `ENCYCLOPEDIA_EMBED_NOT_ALLOWED`).
