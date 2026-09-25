# Backend news: articles, categories, tags, RSS import (backend-articles) — decisions

Area: `backend/src/modules/{articles,categories,tags,rss-import}`, tests
`backend/test/articles-*.e2e-spec.ts` (+ helper `test/articles-helpers.ts`), unit
specs next to the code. Date: 2026-09-25. Requirements: REQUIREMENTS §5, §17,
§18, §19, §20; contract ARCHITECTURE §3, §4.3–4.6.

No dependency added; `package.json`, `app.module.ts`, Prisma schema and
migrations are unchanged (one schema change request in §12).

## 1. API contract (all under `/api/v1`)

Conventions: `{data}` / `{data, meta}` envelopes, `{error:{code,message,details?,requestId}}`,
`?lang=ar|en` (else `Accept-Language`, default `ar`) and `?market=EG` (else
`X-Market`, default market) on every route. Every mutating admin route is
audited automatically (entity types `article`, `category`, `tag`, `rss_feed`,
`rss_item`, `media_asset`), with before/after summaries added by the services.
Error codes of this area are listed in `src/modules/articles/common/content-errors.ts`
(each with ar + en message).

### 1.1 Public (guests allowed, used by the app)

| Method + path | Notes |
|---|---|
| GET `/articles` | Paginated (`page`, `pageSize` ≤ 100). Filters: `category` (slug or id, includes sub-categories), `tag` (slug or id), `type` (`news, review, test_drive, buying_guide, explainer, opinion`), `q` (title / summary / body, Arabic-normalized), `brand` / `model` / `variant` / `vehicle` (slug or id; `brandId`/`modelId`/`variantId` kept as aliases), `featured=true|false`, `languageMode=fallback\|strict`, `allMarkets=true`, `sort=latest\|oldest\|popular`. Unknown filter values → empty page (not 404). `Cache-Control: public, max-age=60, stale-while-revalidate=300`, `Vary: Accept-Language, X-Market`, strong ETag → 304. |
| GET `/articles/:slug` | Slug **or id**. Published + publication time reached only (404 `ARTICLE_NOT_FOUND` otherwise). Served in every market (`marketMatch` tells whether it targets the request market) so shared links always open. Same caching as the list. |
| GET `/articles/preview/:token` | Signed preview of an unpublished article (any status except deleted). `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`. 401 `PREVIEW_TOKEN_INVALID` / `PREVIEW_TOKEN_EXPIRED`. Adds `preview: true, status`. |
| POST `/articles/:slug/view` | 204. Anonymous read counter (`content_daily_stats.views`), counted once per reader per 30 min; the dedupe key is an HMAC of IP + User-Agent kept only in Redis with a TTL. No reading history in the database. Rate limited (`write` preset). Call it once when the article screen opens (online only). |
| GET `/categories` | Active categories, flat list (build the tree with `parentId`), `articleCount` = visible articles in the request market. Cached 5 min. |
| GET `/categories/:slug` | Slug or id; 404 `CATEGORY_NOT_FOUND` when inactive/unknown. |
| GET `/tags` | Tags used by visible articles in the market, most used first; `q`, paginated. |
| GET `/tags/:slug` | Slug or id (any tag, even unused). |

**List item** (`PublicArticleSummaryDto`):
```
{ id, slug, type, title, summary|null,
  language,            // language actually served ("ar"|"en")
  requestedLanguage,   // what the client asked for
  isFallback,          // language !== requestedLanguage
  availableLanguages,  // e.g. ["ar","en"] — only servable texts
  category: {id,slug,name}|null, tags: [{id,slug,name}],
  coverImage: {id,url,width,height,variants:[{width,height,url}],alt,caption,credit,licenseType,licenseUrl,sourceUrl}|null,
  author: {name}|null,
  publishedAt, contentUpdatedAt|null,   // "updated" date shown to readers
  eventDate|null ("YYYY-MM-DD", when the event happened ≠ publishedAt),
  readingMinutes|null, isFeatured, isSponsored, sponsorName|null,
  isDemo,              // show a visible "demo" label
  marketCodes: [],     // [] = every market
  shareUrl }           // https://evcar.news/n/<slug> (base + template from settings.share)
```
**Detail** (`PublicArticleDetailDto`) = summary +
```
{ bodyHtml (sanitized), seoTitle|null, seoDescription|null,
  machineTranslated,   // true = human-reviewed machine translation (show a small note)
  source: {name|null, url|null, attribution|null}|null,
  corrections: [{id, kind: correction|clarification|update, note, noteLanguage, correctedAt}],
  relatedArticles: [summary × ≤6],   // same cars > shared tags > same category, visible in the market
  relatedVehicles: [{type: brand|model|variant, id, slug, name, brandName|null, modelSlug|null, modelYear|null}],  // published cars only
  marketMatch, allowComments, updatedAt }
```

### 1.2 Admin (permission-guarded server-side)

Articles (`/admin/articles`):

| Method + path | Permission | Notes |
|---|---|---|
| GET `/admin/articles` | articles.read | `q, status, type, categoryId, tagId, authorId, targetMarket, language, approved, deleted=exclude\|include\|only, sort=-updatedAt\|updatedAt\|-createdAt\|-publishedAt\|scheduledAt`, paginated |
| GET `/admin/articles/authors` | articles.read | active staff whose role grants articles.create (or owner) |
| GET `/admin/articles/images` | articles.read or media.read | latest licensed images (cover picker) |
| POST `/admin/articles/images` | media.upload + licenses.write | multipart `file` + `licenseType, rightsHolder, attributionText?, attributionRequired?, licenseUrl?, sourceUrl?, creditText?, altTextAr/En?, captionAr/En?` → 201 image view + ready `<figure>` HTML snippet |
| POST `/admin/articles` | articles.create | 201, DRAFT, version 1. Body: `originalLanguage`, `translations:{ar?,en?:{title,summary?,bodyHtml?,seoTitle?,seoDescription?,isMachineTranslated?}}` (must contain the original language), `type?, slug?, categoryId?, tagIds?, marketCodes?, vehicleLinks?:[{type,id}], coverAssetId?, authorId?, authorName?, eventDate?, sourceName?, sourceUrl?, isFeatured?, isSponsored?, sponsorName?, allowComments?, revisionNote?` |
| GET `/admin/articles/:id` | articles.read | editor view: all texts (`servable` flag per language), tags, cars (`isPublic`), review info, `allowedActions` for the caller, `canEdit`, `publishIssues`, `shareUrl` (deleted ones too) |
| PATCH `/admin/articles/:id` | articles.update (own) or articles.update_any | partial; **`expectedVersion` required** → 409 `ARTICLE_VERSION_CONFLICT`. `translations.<locale> = null` removes a language (not the original). Scheduled/published need articles.publish (403 `ARTICLE_EDIT_NEEDS_PUBLISH`); archived → 409 `ARTICLE_ARCHIVED`; slug locked after first publication (409 `ARTICLE_SLUG_LOCKED`); `isFeatured` needs articles.publish; changing `authorId` needs articles.update_any. A save without changes creates no version. |
| DELETE `/admin/articles/:id` | articles.delete | soft delete; 409 `ARTICLE_IS_LIVE` for scheduled/published |
| POST `/admin/articles/:id/undelete` | articles.delete | 200 |
| POST `/admin/articles/:id/{submit,withdraw,approve,reject,schedule,unschedule,publish,unpublish,archive,unarchive}` | see §3 | 200 + editor view. Body `{note?, expectedVersion?}`; `reject` needs `note`; `schedule` needs `scheduledAt` (≥ 30 s ahead, ≤ 1 year). 403 `FORBIDDEN` (`details.missingPermissions`), 409 `ARTICLE_INVALID_TRANSITION` / `ARTICLE_NOT_APPROVED`, 422 `ARTICLE_NOT_PUBLISHABLE` (`details.issues`) |
| POST `/admin/articles/:id/translations/:locale/mark-reviewed` | articles.review | `{expectedVersion}`; a person reviewed a machine translation → it may be served (new version) |
| POST `/admin/articles/:id/preview-token` | articles.read | `{ttlMinutes? 5..10080, default 1440}` → `{token, expiresAt, url}` |
| GET `/admin/articles/:id/revisions` | articles.read | newest first, paginated |
| GET `/admin/articles/:id/revisions/:version` | articles.read | full snapshot |
| GET `/admin/articles/:id/revisions/:version/diff?against=` | articles.read | `{from,to,changes:[{field,before,after}],bodyDiff:{<locale>:[{op:equal\|insert\|delete,text}]\|null}}` |
| POST `/admin/articles/:id/revisions/:version/restore` | articles.restore_revision | `{expectedVersion}` → NEW version with `restoredFromVersion` |
| GET `/admin/articles/:id/corrections` | articles.read | |
| POST / PATCH / DELETE `/admin/articles/:id/corrections[/:correctionId]` | articles.publish | `{kind?, noteAr?, noteEn? (≥1), correctedAt?, revisionVersion?, isPublic?}` |

Categories (`/admin/categories`; read: categories.write or articles.read; write:
categories.write): GET list (`q`, `active`, with `usage` counts), GET `/:id`,
POST (201; `nameAr` + `nameEn` required, `slug?` generated from nameEn,
`parentId?` two levels max, `defaultArticleType?`, `sortOrder?`, `isActive?`),
PATCH `/:id`, DELETE `/:id` (409 `CATEGORY_IS_SYSTEM` for seeded ones,
409 `CATEGORY_IN_USE` with counts → deactivate instead).

Tags (`/admin/tags`; read: tags.write or articles.read; write: tags.write):
GET list (`q`, `sort=name|usage|created`, paginated), GET `/:id`, POST (201; at
least one of `nameAr`/`nameEn`), PATCH `/:id`, DELETE `/:id` (409 `TAG_IN_USE`
unless `?force=true`), POST `/:id/merge {targetId}` (200).

RSS (`/admin/rss-feeds`, `/admin/rss-items`; read: rss.read; write: rss.manage):

| Method + path | Notes |
|---|---|
| GET/POST `/admin/rss-feeds`, GET/PATCH/DELETE `/admin/rss-feeds/:id` | Feed: `name, url (https, public host after DNS), siteUrl?, language?, marketCode?, defaultCategoryId?, isActive?, fetchIntervalMinutes? 15..1440, licenseMode? link_only\|summary_only\|full_permitted, licenseNotes?, licenseUrl?, permissionReference?, allowImages?, attributionText?`. View adds `permissionConfirmedAt/ById`, `lastFetchedAt, lastSuccessAt, lastError, consecutiveFailures, nextFetchAt, itemCounts{new,drafted,ignored,duplicate,failed}`. 422 `FEED_URL_NOT_ALLOWED` (`details.reason` e.g. BLOCKED_ADDRESS), 422 `RSS_PERMISSION_REQUIRED`, 409 `RSS_FEED_EXISTS`, delete 409 `RSS_FEED_IN_USE` when drafts exist. |
| POST `/admin/rss-feeds/:id/fetch` | Fetch now (200): `{jobId, feedId, outcome: completed\|completed_with_errors\|not_modified\|failed\|skipped, received, created, duplicates, alreadyKnown, invalid, error, nextFetchAt}`; 409 `RSS_FETCH_IN_PROGRESS`; fetch errors are returned (422 `FEED_URL_NOT_ALLOWED` / `FEED_INVALID`, 502 `UPSTREAM_ERROR`) and recorded on the feed + job. |
| GET `/admin/rss-items` (`feedId, status, q`), GET `/:id` | Review queue (newest first). |
| POST `/admin/rss-items/:id/ignore` `{reason?}`, `/restore` | 200 |
| POST `/admin/rss-items/:id/create-draft` `{language?, categoryId?}` | rss.read + articles.create → 201 `{article (editor view), item}`; 409 `RSS_ITEM_ALREADY_DRAFTED` / `RSS_ITEM_NOT_DRAFTABLE`; 422 `RSS_ITEM_LANGUAGE_UNSUPPORTED` |

Every fetch is an `import_jobs` row (type `rss.fetch`, one `import_job_rows`
row per received item: `imported | duplicate | skipped | invalid`), visible in
`GET /admin/system/import-jobs`.

## 2. Visibility (readers)

`status = published AND published_at <= now() AND deleted_at IS NULL`; list:
market targeting (`article_markets` empty = every market) unless
`allMarkets=true`; at least one servable text. A text is **servable** unless it
is an unreviewed machine translation (`is_machine_translated AND
human_reviewed_at IS NULL`) — such texts are never served, listed in
`availableLanguages`, indexed or used for fallback (the preview shows them).
Language: requested language when servable, else the original language
(`isFallback: true`); `languageMode=strict` lists only articles available in
the requested language. Cars in `relatedVehicles` must be published
(brand, model, variant, not deleted). Drafts, in-review, scheduled (before
publication), archived and deleted articles are 404 publicly.

## 3. Workflow and permissions (`domain/article-workflow.ts`, unit-tested)

```
draft ─submit→ in_review ─approve→ in_review(approved) ─schedule→ scheduled ─(due)→ published
  ▲              │ withdraw / reject(note)                 ├─publish────────────────→ published
  └──────────────┘                              scheduled ─unschedule→ in_review (approval kept)
published ─archive→ archived ─unarchive→ published;  published/archived ─unpublish→ draft
```
| Action | Permission (route) | Extra rule |
|---|---|---|
| submit | articles.submit | own article, else also articles.update_any; original text required |
| withdraw | articles.submit (own) or articles.review | |
| approve / reject | articles.review | approve once; reject needs a note |
| schedule / publish | articles.publish | from in_review: needs a recorded approval **or** the caller also holds articles.review (approval then recorded in their name); never from draft; `publishIssues` must be empty |
| unschedule / unpublish / unarchive | articles.publish | unarchive re-checks publishIssues |
| archive | articles.archive | |

Seeded roles: editor = create/update own/submit (cannot publish, approve,
schedule, archive, restore, write corrections); content_reviewer = + review,
publish, archive, update_any, restore_revision, categories, RSS management.
`publishIssues` codes: `ORIGINAL_TRANSLATION_MISSING`,
`ORIGINAL_TRANSLATION_UNREVIEWED`, `BODY_EMPTY`, `COVER_NOT_LICENSED`,
`SPONSOR_NAME_MISSING` (the database triggers enforce the same rules at COMMIT).
Approval is "reviewed after the last submission"; any content edit during
review clears it (the reviewer approves the final text). Re-publishing keeps
the first `publishedAt`; `contentUpdatedAt` is set by content edits after the
first publication.

## 4. Versions, restore, corrections

Every content save (create, update, restore, mark-reviewed, draft from RSS)
writes `article_revisions` (full snapshot: texts, flags, category, tags,
markets, cars, cover, author, source, event date) in the same transaction with
an optimistic check on `current_version`. Workflow transitions do not create
versions (they are audited). Restore = new version with `restoredFromVersion`;
it drops references that no longer exist (deleted tags/cars/cover, inactive
category), keeps the slug of an already published article, keeps the current
featured flag when the caller lacks articles.publish, and re-runs the HTML
policy + media-rights checks. Corrections are separate public rows
(`article_corrections`), shown to readers in their language (fallback to the
other note); `isPublic=false` = internal note.

## 5. HTML policy and media rights (`domain/article-html.ts`, unit-tested)

Server-side, before storage: the shared `sanitizeArticleHtml` (headings,
lists, tables incl. colspan/scope, figure/figcaption, https links with
`rel="noopener noreferrer nofollow"`, code) with iframes limited to
**youtube-nocookie.com / player.vimeo.com**: YouTube `/embed/` URLs are rewritten
to youtube-nocookie (only `start,end,rel,controls,cc_lang_pref,hl` kept),
Vimeo gets `dnt=1`, sandbox + lazy loading are forced. Any other iframe is
**refused** (422 `ARTICLE_EMBED_NOT_ALLOWED`, `details.embeds`) instead of being
dropped silently. Every `<img>` must be a ready, licensed image of the media
library (matched by the storage key of its public URL) → otherwise 422
`ARTICLE_IMAGE_NOT_LICENSED` (`details.images`): no hot-linking of third-party
images. `bodyText` (plain text) is stored for search / reading time.

Article images (`POST /admin/articles/images`): decoded by sharp (JPEG, PNG,
WebP, AVIF/HEIF; corrupt/other files 422 `ARTICLE_IMAGE_INVALID`; ≥ 200 px wide;
≤ 15 MB), original kept **privately** (`private/articles/originals/…`, may hold
EXIF/GPS), metadata-free WebP renditions 480/960/1600 px published under
`public/articles/<uuid>/w<width>.webp` (immutable cache), `asset_licenses` row
(rights holder, licence type, attribution, URLs) + `media_assets` row (ready,
credit, alt/caption ar/en). Cover credit shown to readers = `creditText` →
licence attribution → rights holder.

## 6. Scheduling (idempotent)

`ArticleSchedulerService.publishDue()` publishes `scheduled` articles whose
`scheduled_at <= now` with a conditional update (`status = scheduled AND
scheduled_at <= now`) per article, so repeated runs / several instances never
double-publish; `publishedAt` = the planned time. Audit rows
`articles.publish_scheduled` (actor "scheduler") or
`articles.publish_scheduled_failed` (e.g. the cover lost its licence). Runs every
30 s through `ArticleSchedulerTrigger` (@nestjs/schedule `@Interval`), only on
instances with `JOBS_ENABLED` (same rule as BullMQ processors; e2e tests call
`publishDue()` directly). No BullMQ job is needed because the operation is
idempotent.

## 7. RSS import

- Fetching only through `NEWS_FETCHER` (SSRF-safe: https, allowed port, every
  DNS answer must be public unicast, redirects re-validated, 5 MB / timeouts,
  conditional GET with ETag / Last-Modified). Feed URLs are validated the same
  way when saved.
- Licence (`usage_policy`): `link_only` (default; API name for
  `headline_link_only`), `summary_only` (`summary_with_link`), `full_permitted`
  (`full_content_licensed`). Anything above link-only, and `allowImages`, needs a
  `permissionReference`; the server records `permissionConfirmedAt/ById` (kept
  while the licence settings do not change). **Link-only feeds: the excerpt is
  not even stored**; feed images are stored/shown only with `allowImages`.
- De-duplication (`rss-dedupe.ts`, unit-tested): canonical URL (lower-case
  host/scheme, no fragment/default port/credentials, tracking params `utm_*`,
  `fbclid`, `gclid`, … removed, params sorted, no trailing slash) → `urlHash`
  (global unique); `guidHash` (unique per feed); `contentHash` of the
  Arabic-normalized title + excerpt → later items become `duplicate` with
  `duplicateOfId`. Known items are skipped on refetch; a concurrent insert
  (P2002) counts as known.
- One open `rss.fetch` job per feed (import_jobs idempotency key
  `feed:<id>`); a "running" job older than 10 min is failed and replaced.
  Failures: `lastError` (secret-free code + reason), `consecutiveFailures`,
  exponential back-off of `nextFetchAt` (interval × 2^n, ≤ 24 h).
- Scheduled fetch: `RssSchedulerService.runDue()` every minute on
  `JOBS_ENABLED` instances; each due feed is claimed with a conditional update of
  `next_fetch_at` (10-minute lease) so instances never fetch the same feed
  concurrently.
- Draft from item (never auto-published, never "published by import"): DRAFT
  article in the item/feed language (`ar`/`en`, else 422), author = the editor,
  `sourceName` = feed name, `sourceUrl` = item URL, `rss_item_id` set, category =
  request or feed default, market = feed market. Content under the licence:
  link-only → title only (summary null, empty body: a person must write the
  article — `BODY_EMPTY` blocks publication); summary-only → excerpt as summary;
  full-permitted → excerpt as summary and first paragraph (the parser never
  extracts full articles). No cover is taken from the feed. The item is claimed
  (`new → drafted`) before the article is created and released on failure.
  Public detail shows `source.attribution` = feed `attributionText`.

## 8. Search index and events (for other teams)

- `ArticleSearchIndexService` upserts `search_documents` (entity `article`, one
  row per servable language: title, summary, body text ≤ 20k, tag + car names as
  keywords, slug, cover URL, `market_codes`, boost 1.2 when featured) when an
  article is published or a published one changes, and deletes the rows when it
  stops being public (unpublish/archive/delete). `reindexAll()` is exported for
  the search module's rebuild tool.
- Events (EventEmitter2): `article.published` and `article.unpublished` with
  `{articleId, slug, from, to}` — for notifications (dedupe key
  `article.published:<articleId>`), home caches, share pages.
- `ArticlesModule` exports `ArticlesPublicService` (list/detail for the home and
  share modules), `ArticlesAdminService`, `ArticlePresenter`,
  `ArticleMediaService`, `ArticleSearchIndexService`, `ArticleSchedulerService`.
  Category/tag reference mappers: `toCategoryRef` / `toTagRef`.

## 9. Deviations from the earlier draft of this contract

- Detail is served in every market (`marketMatch`) instead of 404
  `ARTICLE_NOT_IN_MARKET` (§4 "دون إخفاء إمكانية تصفح بقية المحتوى"; shared links
  must open). Lists are market-targeted unless `allMarkets=true`.
- `POST /admin/articles/:id/assist` (LLM translate/summarize) and
  `POST /admin/articles/images/import` were **not implemented**: the assistant
  provider is not configured/implemented, and importing third-party images by
  URL invites rights problems. Editors can store a machine translation with
  `isMachineTranslated: true`; it is served only after `mark-reviewed`.
- `DELETE /admin/articles/:id/translations/:locale` replaced by PATCH
  `translations.<locale> = null` (versioned like every edit).
- `return-to-draft` is `unpublish` (published/archived → draft); in_review →
  draft is `withdraw` / `reject`; scheduled → in_review is `unschedule`.
- Creates return 201; workflow / action endpoints return 200.

## 10. Other decisions

- Slugs: lower-case letters of any script (Arabic allowed), digits, single
  hyphens; UUID-shaped slugs and `preview/new/feed/rss` refused (public routes
  accept slug or id). Generated from the English title, else the original one;
  `-2`, `-3`… on collision.
- Admin and public text search use SQL `app_normalize_text()` (same Arabic
  normalization as the search index) with `LIKE` on title/summary(/body text).
  Adequate for editorial volumes; the search module's full-text index is the
  scalable path.
- `sort=popular` = most views over the last 7 days (content_daily_stats), then
  newest.
- Categories: two levels; both names required; inactive categories are hidden
  publicly (with their children) and cannot be newly assigned, existing
  assignments stay. Tags need at least one name.
- Admin reads send `Cache-Control: no-store`.

## 11. Verification (2026-09-25)

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean (whole project, after the vehicles agent's in-progress files settled) |
| `npx eslint src/modules/{articles,categories,tags,rss-import} test/articles-*.ts` | clean |
| `npx prettier --check` (same paths) | clean |
| `npx jest` (all unit tests) | 44 suites / 452 tests passed; mine: article-workflow, article-html, article-snapshot, preview-token, slug, rss-dedupe (36 tests) |
| `npm run test:e2e -- test/articles-workflow.e2e-spec.ts test/articles-public.e2e-spec.ts test/articles-rss.e2e-spec.ts test/articles-taxonomy.e2e-spec.ts` | 4 suites / 43 tests passed (own DB per run) |
| `npm run test:e2e -- test/foundation… api-hygiene… schema-phase2… audit-logs…` | 4 suites / 69 tests passed (no regression) |
| `npm run test:e2e` (whole repository, at the end of this stage) | 22 suites / 309 tests passed; no `evcar_test_*` database or `storage/test` left behind |
| `npm run openapi:export -- <scratchpad>/openapi.json` | 151 paths; 44 of this area; `backend/openapi.json` NOT rewritten (other agents add endpoints in parallel — integrator exports) |

e2e coverage: editor cannot publish/approve/schedule/archive (403), reviewer
publishes; publish from draft refused; reject needs a note; edits in review
clear the approval; version conflicts; own-article rule; editing live content
needs publish; slug lock; scheduled article invisible until due, idempotent job
(second run publishes nothing, one audit row); archive/unarchive/unpublish/
delete/undelete; revisions list/diff/restore (editor 403); language fallback +
strict mode; unreviewed machine translation never served, mark-reviewed (editor
403); market targeting + `allMarkets` + `marketMatch`; category/tag/type/text
filters; Arabic-normalized search; car filters (brand/model/variant/vehicle,
slug or id) + related cars/articles, unpublished cars hidden; sanitizer
(scripts, handlers, javascript:, YouTube → nocookie, foreign iframe 422,
hot-linked image 422); licensed image upload (422 for corrupt file / missing
attribution text) used as cover + inline figure, credit shown, public file
served; corrections (public vs internal, editor 403); preview token (no-store,
noindex, tampered → 401); view counter dedupe + `sort=popular`; Cache-Control /
Vary / ETag → 304; search_documents rows on publish/unpublish; categories/tags
public + admin (system category 409, in-use 409, two levels, inactive hidden and
not assignable, tag merge / force delete, audit row). RSS against a local HTTPS
fixture (throwaway self-signed cert, synthetic items): private / link-local /
internal-DNS / http / file URLs refused (+ a second app with the production
SSRF policy refusing 127.0.0.1, localhost, ::1, 10.x, *.local), redirect to an
internal host refused at fetch (job failed, feed lastError BLOCKED_ADDRESS),
licence modes need a permission reference (recorded by/when), content-hash and
cross-feed URL duplicates, 304 not-modified and refetch without duplicates,
import job + rows, link-only feeds store no excerpt/images, drafts respect the
licence and cannot be published with an empty body, draft twice → 409,
duplicates not draftable, ignore/restore, scheduled fetch picks due feeds only,
nothing published by import, non-feed answer → FEED_INVALID.

## 12. Schema change requests

1. **Per-language slugs** (task: "per-language slugs"): add to
   `ArticleTranslation` `slug String? @db.VarChar(200)` with a unique index
   `article_translations_slug_key` on `slug` (NULLs allowed), plus a CHECK
   `slug IS NULL OR slug ~ '^[\p{Ll}\p{Lo}\p{Nd}]+(-[\p{Ll}\p{Lo}\p{Nd}]+)*$'`
   (or validate in the service only). Service plan once applied: generate a slug
   per language from each title, lock each after first publication, resolve
   `/articles/:slug` against `articles.slug` then `article_translations.slug`
   (serving that language by default), expose `slugs: {ar?, en?}` and per-language
   `shareUrl`s; the share module resolves `/n/:slug` the same way.
   **Current workaround:** one language-neutral slug per article
   (`articles.slug`, from the English title when present) shared by both
   languages; the reader's language comes from `?lang`/`Accept-Language`.

## 13. Not done / not verified

- Admin screens (deferred by the product owner) and mobile news screens (other
  agent). `REQUIREMENTS_TRACKER.md` not edited (outside this area).
- LLM-assisted translation/summaries (assistant provider not
  configured/implemented); image import by URL.
- Per-language slugs (schema request above).
- Live RSS feeds of real publishers were not fetched (no network allowlist and
  no licences); only the local synthetic fixture.
- `backend/openapi.json` not re-exported (see §11).
- `npm run build` not run (shared `dist/`); the OpenAPI export and e2e boots
  compile the whole app.
- The scheduler triggers were exercised through their services, not through a
  running `@Interval` (tests run with jobs disabled).
