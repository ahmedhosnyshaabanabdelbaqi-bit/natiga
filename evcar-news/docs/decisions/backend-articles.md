# Backend news: articles, categories, tags, RSS import (backend-articles) — decisions

Area: `backend/src/modules/{articles,categories,tags,rss-import}`, tests
`backend/test/articles-*.e2e-spec.ts`, `backend/test/rss-*.e2e-spec.ts`, unit
specs next to the code. Date: 2026-09-25. Requirements: REQUIREMENTS §5, §17,
§18, §19, §20; contract ARCHITECTURE §4.3.

> STATUS: work in progress — the API contract below is written first so the
> admin / mobile agents can align. Final verification results are in §9.

## 1. API contract (all under `/api/v1`)

Conventions: `{data}` / `{data, meta}` envelopes, errors `{error:{code,...}}`,
`?lang=ar|en` + `?market=EG` on every route. Every admin route is audited
automatically (entity type `article`, `category`, `tag`, `rss_feed`,
`rss_item`).

### 1.1 Public (guests allowed)

| Method + path | Notes |
|---|---|
| GET `/articles` | `page,pageSize,category(slug|id),tag(slug|id),type,q,brandId,modelId,variantId,featured,languageMode=fallback|strict,sort=latest|oldest` (+ `lang`, `market`). Only visible articles (see §3). ETag + `Cache-Control: public, max-age=60`. |
| GET `/articles/:slug` | Full article (slug or id). 404 `NOT_FOUND`; 404 `ARTICLE_NOT_IN_MARKET` (`details.markets`) when the article targets other markets. |
| POST `/articles/:slug/view` | 204. Anonymous counter (content_daily_stats), deduped per client for 30 min in Redis (keyed by an HMAC of the IP, nothing stored in the DB about the reader), rate-limited. |
| GET `/articles/preview/:token` | Unpublished preview (any status) with a signed token from the admin; `Cache-Control: no-store`, `X-Robots-Tag: noindex`. 401 `PREVIEW_TOKEN_INVALID` / `PREVIEW_TOKEN_EXPIRED`. |
| GET `/categories` | Active categories (tree via `parentId`), name in request language + `nameAr/nameEn`. ETag. |
| GET `/categories/:slug` | One active category. |
| GET `/tags` | `q,page,pageSize`; only tags used by at least one visible article. |
| GET `/tags/:slug` | One tag. |

Public list item (`PublicArticleSummaryDto`):
`{id, slug, type, title, summary|null, language, requestedLanguage, isFallback,
availableLanguages[], category{id,slug,name}|null, tags[{id,slug,name}],
coverImage{url,width,height,alt,credit,licenseType,sourceUrl}|null,
author{name}|null, publishedAt, contentUpdatedAt|null, eventDate|null,
isFeatured, isSponsored, sponsorName|null, isDemo, shareUrl}`.
`language` = language actually served; `isFallback = language !== requestedLanguage`.
Detail adds `{bodyHtml, seoTitle, seoDescription, source{name,url,attribution}|null,
corrections[{kind,note,noteLanguage,correctedAt}], relatedArticles[summary],
relatedVehicles[{type:'brand'|'model'|'variant',id,slug,name}], markets[],
updatedAt, allowComments}`.

### 1.2 Admin

Articles (`/admin/articles`):

| Method + path | Permission | Notes |
|---|---|---|
| GET `/admin/articles` | articles.read | `page,pageSize,q,status,type,categoryId,tagId,authorId,market,language,approved,includeDeleted,sort` |
| GET `/admin/articles/authors` | articles.read | staff users who can write (`{id,displayName}`) for the author picker |
| GET `/admin/articles/:id` | articles.read | full editor view incl. translations, workflow `allowedActions` for the caller |
| POST `/admin/articles` | articles.create | creates a DRAFT (revision 1) |
| PATCH `/admin/articles/:id` | articles.update (own) / articles.update_any | `expectedVersion` → 409 `ARTICLE_VERSION_CONFLICT`; editing scheduled/published needs articles.publish; archived → 409 |
| DELETE `/admin/articles/:id` | articles.delete | soft delete; 409 `ARTICLE_IS_LIVE` for scheduled/published |
| POST `/admin/articles/:id/undelete` | articles.delete | |
| POST `/admin/articles/:id/submit` | articles.submit | draft → in_review |
| POST `/admin/articles/:id/withdraw` | articles.submit | in_review → draft |
| POST `/admin/articles/:id/approve` | articles.review | in_review → in_review (approved) |
| POST `/admin/articles/:id/reject` | articles.review | in_review → draft, `note` required |
| POST `/admin/articles/:id/schedule` | articles.publish | approved in_review / scheduled → scheduled (`scheduledAt` in the future) |
| POST `/admin/articles/:id/unschedule` | articles.publish | scheduled → in_review (approval kept) |
| POST `/admin/articles/:id/publish` | articles.publish | approved in_review / scheduled / archived (was published) → published |
| POST `/admin/articles/:id/archive` | articles.archive | published → archived |
| POST `/admin/articles/:id/return-to-draft` | articles.publish | in_review / scheduled / published / archived → draft |
| GET `/admin/articles/:id/revisions` | articles.read | paginated, newest first |
| GET `/admin/articles/:id/revisions/:version` | articles.read | full snapshot |
| GET `/admin/articles/:id/revisions/:version/diff?against=` | articles.read | field diff + word diff of body text |
| POST `/admin/articles/:id/revisions/:version/restore` | articles.restore_revision | new version with `restoredFromVersion` |
| GET/POST `/admin/articles/:id/corrections`, PATCH/DELETE `…/:correctionId` | read: articles.read, write: articles.publish | public corrections log |
| POST `/admin/articles/:id/preview-token` | articles.read | `{ttlMinutes?}` → `{token, expiresAt, url}` |
| DELETE `/admin/articles/:id/translations/:locale` | articles.update(_any) | not the original language |
| POST `/admin/articles/:id/translations/:locale/mark-reviewed` | articles.review | human review of a machine translation |
| POST `/admin/articles/:id/assist` | articles.update(_any) | `{task:'translate'|'summarize', locale, sourceLocale?}`; needs the assistant provider (503 `INTEGRATION_NOT_CONFIGURED` otherwise); result is always an unreviewed machine text |
| POST `/admin/articles/images` | articles.create or articles.update + media.upload | multipart `file` + licence fields → media asset (ready, licensed) |
| POST `/admin/articles/images/import` | same | `{url(https), licence fields}` fetched through the SSRF-safe fetcher |

Categories (`/admin/categories`, write: categories.write, read: articles.read or
categories.write): GET list, GET `/:id`, POST, PATCH `/:id`, DELETE `/:id`
(409 `CATEGORY_IS_SYSTEM` for seeded categories → deactivate; 409
`CATEGORY_IN_USE` with counts).

Tags (`/admin/tags`, write: tags.write, read: articles.read or tags.write): GET
list (`q,page,pageSize`), GET `/:id`, POST, PATCH `/:id`, DELETE `/:id` (409
`TAG_IN_USE` unless `?force=true`), POST `/:id/merge` `{targetId}`.

RSS (`/admin/rss-feeds`, `/admin/rss-items`, read: rss.read, write: rss.manage):
feeds CRUD + POST `/admin/rss-feeds/:id/fetch` (fetch now, synchronous, returns
the import summary); items list/get, POST `/admin/rss-items/:id/ignore`,
`/restore`, `/create-draft` (articles.create + rss.read).
Feed licence mode `licenseMode`: `link_only` (default) | `summary_only` |
`full_permitted` (DB enum `headline_link_only | summary_with_link |
full_content_licensed`); anything but `link_only`, and `allowImages`, needs
`permissionReference` (the server records who confirmed it and when).
