# Phase 2 schema (phase2-schema) — decisions

Area: `backend/prisma/schema/*.prisma`, `backend/prisma/migrations/`,
`backend/src/cli/seed-data/*`, `backend/test/schema-phase2.e2e-spec.ts`.
Date: 2026-09-25. Stage run alone, before the phase-2 feature agents.

Migration: `20260927000000_phase2_content_catalog_comparisons` (generated
DDL, hand-edited where Prisma would lose data, then raw SQL). Applied to
`evcar_dev` together with the reference seed (no demo data there).

**No dependency added, `package.json` and `app.module.ts` unchanged.**
Reasons: slugs → `slugify()` already exists in
`src/common/i18n/arabic-normalize.ts`; hashing/short ids → `node:crypto`;
HTML → text → `sanitize-html` (installed); feeds → `fast-xml-parser` +
`NEWS_FETCHER`; admin already has Mantine TipTap (tables, images, YouTube,
links); mobile already has `flutter_widget_from_html_core` + `html`.

## 1. Gap analysis — what already existed (do not re-create)

Most of the phase-2 model was already in place from phase 1 / review 2:
article translations, markets, revisions (JSON snapshots), tags/categories
(+translations), vehicle links, `event_date` ≠ `published_at`, sponsored CHECK;
RSS feeds (usage policy, etag, failures) and items (guid hash per feed, URL
hash global); the whole catalog hierarchy with powertrain per variant,
`variant_markets`, `variant_market_inlets` (AC/DC per market), specs per
market scope with source/verified/reliability/original value, ranges and
consumption with cycles, charging curves + points, charging times (SoC window
+ charger condition), price history (type, currency, dates, source, no
overlapping MSRP), `vehicle_media`, `model_competitors`; `comparisons` +
items + `share_id`; polymorphic-safe `favorites` (one nullable FK per target
+ CHECK matching `target_type`); `search_documents` (tsvector + trigram, Arabic
normalization by trigger) and `search_aliases`; `content_daily_stats`;
home sections in `app_settings['home.sections']`.

## 2. What this stage changed

| Area | Change | Why |
|---|---|---|
| categories | `system_key` (unique, CHECK `^[a-z][a-z0-9_]{1,63}$`), `default_article_type`, `is_demo`, index (is_active, sort_order) | seeded defaults need a stable handle that survives admin renames; demo rows flagged |
| tags | `is_demo` | the demo seed must flag everything |
| articles | `review_note`, `content_updated_at`, index (status, is_featured, published_at) | reviewer feedback; reader-visible "edited" date separate from technical `updated_at`; top-story query |
| article_revisions | `restored_from_version` (CHECK `< version`) | restore creates a NEW version that records its origin — history is never rewritten |
| **article_corrections** (new) | kind `correction/clarification/update`, `note_ar`/`note_en` (≥1, CHECK), `revision_version`, `corrected_at`, `is_public`, `created_by_id` | public corrections log |
| article_translations | CHECK `human_reviewed_at` ⇒ `human_reviewed_by_id` | a human review names the reviewer |
| rss_feeds | `next_fetch_at`, `license_url`, `permission_confirmed_at/_by_id`, `permission_reference`, `allow_images`, `attribution_text`; CHECK `rss_feeds_permission_chk` | §5: a feed is not a licence. Summary-only (`summary_with_link`), full content and showing feed images all need a recorded permission |
| rss_items | `canonical_url`, `content_hash` (+index), `duplicate_of_id` (self FK), `language`, `feed_categories[]`, `status_reason`, `processed_at/_by_id`; hash/URL format CHECKs | third dedupe key (same story, other URL/feed), traceable import status |
| vehicle_variants | `sort_order` (+ index with model year) | trim display order |
| vehicle_media | `generation_id` (third possible target), `kind` → enum `vehicle_media_kind` (converted in place), one cover per target (3 partial unique indexes) | most press photos are per generation |
| comparisons | `title_ar/title_en` (curated display), `signature` (+index), `view_count`, `last_viewed_at`, `is_demo`; CHECKs (curated ⇒ no owner, published curated ⇒ both titles, non-curated ⇒ no curated fields, `share_id` `^[A-Za-z0-9_-]{6,24}$`, signature hex, count ≥ 0) | curated home comparisons, dedupe of anonymous shares, anonymous view counter |
| comparison_items | composite FK `(variant_id, market_code)` → `variant_markets` (RESTRICT); the migration creates missing `variant_markets` rows as `unknown` first | a variant is never compared in a market it has no record for (§7 "year, trim and market mandatory") |
| search_documents | `market_code` → `market_codes varchar(8)[]` (back-filled, GIN, CHECK codes `^[A-Z]{2,8}$`, never NULL) | an article targeted at EG+SA or a variant sold in 3 markets needs several markets |
| search_aliases | `is_active`, `is_system`, index (entity_type, entity_id), CHECKs (entity type ⇔ id, non-blank) | admins deactivate seeded aliases instead of deleting them (the seed would re-create them) |
| content_daily_stats | CHECK on `entity_type` values, index (entity_type, day) | integrity of the analytics counters |
| permissions | `search.manage` (admin/owner, content_reviewer, vehicle_data_manager) | alias management / reindex had no permission |

Not added on purpose: market on charging curves/times (market differences are
modelled by per-market inlets; would add a `Market` relation that the markets
delete guard must track), a home "pins" table (top story = latest published
`is_featured` article visible in the market; curated comparisons have
`curated_order`), recommendation storage (stateless), per-user view history
(forbidden by §19), search query logs.

## 3. Rules enforced by the database (services must pre-validate)

Trigger messages start with the rule name; the exception filter maps SQLSTATE
23514 → 422 `VALIDATION_FAILED` with `details.constraint = <rule>` (verified
for the deferred ones too: the COMMIT error is a
`PrismaClientKnownRequestError`).

Deferred constraint triggers (checked at COMMIT, so nested creates work):
- `articles_original_translation_chk` — status in_review/scheduled/published
  needs a translation in `original_language` (also blocks deleting it or
  changing the article's original language away from it).
- `articles_machine_translation_review_chk` — scheduled/published: that
  translation must not be an unreviewed machine translation
  (`is_machine_translated AND human_reviewed_at IS NULL`). Other unreviewed
  MT translations may exist but the public API must not serve them.
- `articles_cover_rights_chk` — scheduled/published with a cover: the asset is
  `kind=image`, `status=ready`, `license_id` set. (Not re-checked if the asset
  later loses its licence — same limit as tours; media service should refuse
  that while the asset is used.)
- `comparisons_item_count_chk` — 2..4 items per comparison. Create comparison
  + items in one transaction (nested create), replace items with
  deleteMany + createMany in one `$transaction` (position is unique, so
  "swap" updates fail). Deleting a comparison is fine.

Plain CHECKs: see §2 table (names end in `_chk`); unique cover indexes
`vehicle_media_one_cover_{model,generation,variant}_uq`.

## 4. Seeds

- Reference seed (idempotent, every deploy): 7 default categories with ar+en
  names/descriptions, found by `system_key` (`news`, `reviews`, `test_drives`,
  `batteries_charging`, `software_ota`, `safety`, `buying_guides`), or an
  admin category with the same slug is adopted; only missing translations are
  added, nothing is overwritten. Search aliases: 34 → 101 (brand spellings
  ar↔Latin such as لوسيد/Lucid, شانجان/Changan, ديبال/Deepal, plus vocabulary
  such as هجينة قابلة للشحن/PHEV, شحن سريع/fast charging) — spellings only,
  no claims about models or markets; all flagged `is_system`, existing rows
  adopted. `search.manage` granted through the tracked/audited path.
- Demo seed: demo category/tag flagged `is_demo`, the demo article tagged, and
  one curated comparison `[DEMO] … (fictional)` / `[تجريبي] …` of the two
  fictional variants (BEV vs PHEV, EG), `is_demo = true`.
- `src/cli/seed-data/reference.spec.ts` validates the data (required
  categories, key/slug formats, ar+en names, no duplicate or useless aliases).

## 5. Conventions for the feature agents

- **Articles**: every save of editorial content writes an `article_revisions`
  row (`version = current_version + 1`, full snapshot incl. translations,
  tags, markets, vehicle links) and bumps `articles.current_version`; restore
  = new revision with `restored_from_version`. Set `content_updated_at` when a
  published article's content changes. Corrections are separate rows (not
  just text in the body). Public queries: `status='published' AND
  published_at <= now() AND deleted_at IS NULL` + market filter
  (`article_markets` empty = all markets) + translation filter (hide
  unreviewed MT). Top story: `is_featured` + newest.
- **RSS**: `urlHash = sha256(canonicalUrl)` (lower-case scheme/host, drop
  fragment, default port and tracking params `utm_*`, `fbclid`, `gclid`;
  keep other query params), `guidHash = sha256(guid)`, `contentHash =
  sha256(normalizeSearchText(title) + "\n" + normalizeSearchText(summary ?? ''))`,
  lower-case hex. Insert with the unique keys; a content-hash match → status
  `duplicate` + `duplicate_of_id`. Converting creates a DRAFT article with
  `rss_item_id`, `source_name/url` and the feed's attribution; respect
  `usage_policy` (headline+link only by default) and `allow_images`.
- **Catalog**: public variant visibility = variant, model and brand
  `status='published'` + `deleted_at IS NULL`; per-market availability from
  `variant_markets`; specs: market row first, then global row
  (`market_code IS NULL`).
- **Comparisons**: `share_id` = random base62/base64url (6–24 chars);
  `signature = sha256(items sorted by position joined as "variantId@MARKET")`
  → reuse an existing anonymous comparison with the same signature;
  increment `view_count` (and `content_daily_stats` `comparisons` for each
  variant) without storing who viewed.
- **Search**: one `search_documents` row per entity × locale, upserted on
  publish/update, deleted (or `is_published=false`) on unpublish/delete;
  `market_codes` from `article_markets` / `variant_markets` (empty = all).
  Query = `app_normalize_text(q)` (+ canonicals of ACTIVE aliases whose
  `term_normalized` matches) against `search_vector` / trigram on
  `normalized_title`. No index rebuild tool exists yet (search agent).
- **Stats**: `INSERT … ON CONFLICT (entity_type, entity_id, day) DO UPDATE`
  (tested); dedupe repeated views in Redis with a short TTL if needed — never
  in the DB.
- **Categories/aliases admin**: refuse deleting a category with `system_key`
  or an alias with `is_system` (409) and offer deactivation.

## 6. Verification (2026-09-25)

`npm run prisma:check-drift` → in sync; `typecheck`, `lint`, `format:check`
clean; `npm test` 38 suites / 410 tests (incl. the new
`reference.spec.ts`, 6 tests); `npm run test:e2e` (all) 16 suites / 216
tests incl. the new `schema-phase2` spec (20 tests); `npm run build` OK;
`openapi:export` unchanged (63 paths); no leftover test/drift databases;
`prisma migrate deploy` + reference seed run twice on `evcar_dev` (second run
adds nothing; the 34 phase-1 aliases were adopted as system rows and
`search.manage` was granted to 4 roles with `roles.permissions.seed_grant`
audit rows).

## 7. Not done / limits

- No services, endpoints, admin or mobile screens (feature agents).
- Existing comparisons with < 2 items (none exist) are not re-validated; the
  rule applies to new writes.
- `REQUIREMENTS_TRACKER.md` not edited (outside this area).

## 8. Schema change requests

None pending.
