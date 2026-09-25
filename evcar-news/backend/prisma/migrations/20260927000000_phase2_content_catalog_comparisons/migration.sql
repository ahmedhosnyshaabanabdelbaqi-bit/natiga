-- Phase 2 data model (news, RSS, catalog, comparisons, search, analytics):
--  * articles: review note, content-updated date, corrections log, restore
--    trail on revisions; publish rules (original-language translation, no
--    unreviewed machine translation, licensed ready cover) checked at COMMIT
--  * categories: stable system keys (seeded defaults), default article type,
--    demo flags on categories/tags
--  * RSS: recorded permission for anything above headline+link (and for
--    images), attribution, scheduling, canonical URL + content hash dedupe,
--    duplicate-of link, per-item status reason / processed by
--  * catalog: trim display order, generation-level gallery images (enum kind,
--    one cover per target)
--  * comparisons: curated titles, anonymous view counter, share signature,
--    items pinned to an existing variant × market (composite FK), 2..4 items
--    checked at COMMIT
--  * search: documents visible in several markets (market_codes[]), aliases
--    can be deactivated and are flagged when seeded
--  * analytics: allowed entity types of the daily counters
-- Generated DDL first (hand-edited where Prisma would lose data), then raw
-- SQL (Prisma ignores CHECKs, triggers and partial indexes when diffing).

-- CreateEnum
CREATE TYPE "article_correction_kind" AS ENUM ('correction', 'clarification', 'update');

-- CreateEnum
CREATE TYPE "vehicle_media_kind" AS ENUM ('gallery', 'exterior', 'interior', 'detail');

-- DropIndex
DROP INDEX "comparison_items_variant_id_idx";

-- DropIndex
DROP INDEX "rss_items_status_idx";

-- DropIndex
DROP INDEX "search_documents_market_code_idx";

-- AlterTable
ALTER TABLE "article_revisions" ADD COLUMN     "restored_from_version" INTEGER;

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "content_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "review_note" VARCHAR(2000);

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "default_article_type" "article_type",
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "system_key" VARCHAR(64);

-- AlterTable
ALTER TABLE "comparisons" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_viewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "signature" CHAR(64),
ADD COLUMN     "title_ar" VARCHAR(200),
ADD COLUMN     "title_en" VARCHAR(200),
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "rss_feeds" ADD COLUMN     "allow_images" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attribution_text" VARCHAR(500),
ADD COLUMN     "license_url" VARCHAR(2048),
ADD COLUMN     "next_fetch_at" TIMESTAMPTZ(3),
ADD COLUMN     "permission_confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "permission_confirmed_by_id" UUID,
ADD COLUMN     "permission_reference" VARCHAR(1000);

-- AlterTable
ALTER TABLE "rss_items" ADD COLUMN     "canonical_url" VARCHAR(2048),
ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "duplicate_of_id" UUID,
ADD COLUMN     "feed_categories" VARCHAR(200)[] DEFAULT ARRAY[]::VARCHAR(200)[],
ADD COLUMN     "language" VARCHAR(10),
ADD COLUMN     "processed_at" TIMESTAMPTZ(3),
ADD COLUMN     "processed_by_id" UUID,
ADD COLUMN     "status_reason" VARCHAR(1000);

-- AlterTable
ALTER TABLE "search_aliases" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (market_code → market_codes[], back-filled before the drop)
ALTER TABLE "search_documents" ADD COLUMN     "market_codes" VARCHAR(8)[] DEFAULT ARRAY[]::VARCHAR(8)[];
UPDATE "search_documents"
  SET "market_codes" = CASE WHEN "market_code" IS NULL THEN ARRAY[]::VARCHAR(8)[] ELSE ARRAY["market_code"]::VARCHAR(8)[] END;
ALTER TABLE "search_documents" DROP COLUMN "market_code";

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (kind: VARCHAR → enum in place; unknown values become 'gallery')
ALTER TABLE "vehicle_media" ADD COLUMN     "generation_id" UUID;
ALTER TABLE "vehicle_media" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "vehicle_media" ALTER COLUMN "kind" TYPE "vehicle_media_kind" USING (
  CASE WHEN "kind" IN ('gallery', 'exterior', 'interior', 'detail') THEN "kind" ELSE 'gallery' END
)::"vehicle_media_kind";
ALTER TABLE "vehicle_media" ALTER COLUMN "kind" SET DEFAULT 'gallery';

-- AlterTable
ALTER TABLE "vehicle_variants" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "article_corrections" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "kind" "article_correction_kind" NOT NULL DEFAULT 'correction',
    "note_ar" TEXT,
    "note_en" TEXT,
    "revision_version" INTEGER,
    "corrected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "article_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_corrections_article_id_corrected_at_idx" ON "article_corrections"("article_id", "corrected_at" DESC);

-- CreateIndex
CREATE INDEX "articles_status_is_featured_published_at_idx" ON "articles"("status", "is_featured", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_system_key_key" ON "categories"("system_key");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "comparison_items_variant_id_market_code_idx" ON "comparison_items"("variant_id", "market_code");

-- CreateIndex
CREATE INDEX "comparisons_signature_idx" ON "comparisons"("signature");

-- CreateIndex
CREATE INDEX "content_daily_stats_entity_type_day_idx" ON "content_daily_stats"("entity_type", "day");

-- CreateIndex
CREATE INDEX "rss_feeds_is_active_next_fetch_at_idx" ON "rss_feeds"("is_active", "next_fetch_at");

-- CreateIndex
CREATE INDEX "rss_items_status_fetched_at_idx" ON "rss_items"("status", "fetched_at" DESC);

-- CreateIndex
CREATE INDEX "rss_items_content_hash_idx" ON "rss_items"("content_hash");

-- CreateIndex
CREATE INDEX "rss_items_duplicate_of_id_idx" ON "rss_items"("duplicate_of_id");

-- CreateIndex
CREATE INDEX "search_aliases_entity_type_entity_id_idx" ON "search_aliases"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "search_documents_market_codes_gin" ON "search_documents" USING GIN ("market_codes");

-- CreateIndex
CREATE INDEX "vehicle_media_generation_id_sort_order_idx" ON "vehicle_media"("generation_id", "sort_order");

-- CreateIndex
CREATE INDEX "vehicle_variants_model_year_id_sort_order_idx" ON "vehicle_variants"("model_year_id", "sort_order");

-- AddForeignKey
ALTER TABLE "article_corrections" ADD CONSTRAINT "article_corrections_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_corrections" ADD CONSTRAINT "article_corrections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_items" ADD CONSTRAINT "rss_items_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "rss_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing comparison items must point at a variant_markets row before the
-- composite FK is added: missing rows are created with availability
-- 'unknown' (honest: nothing is claimed about the market).
INSERT INTO "variant_markets" ("id", "variant_id", "market_code", "availability", "notes", "created_at", "updated_at")
SELECT gen_random_uuid(), ci."variant_id", ci."market_code", 'unknown',
       'Created by migration 20260927000000_phase2_content_catalog_comparisons: referenced by a saved comparison.',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "variant_id", "market_code" FROM "comparison_items") ci
WHERE NOT EXISTS (
  SELECT 1 FROM "variant_markets" vm WHERE vm."variant_id" = ci."variant_id" AND vm."market_code" = ci."market_code"
);

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_variant_id_market_code_fkey" FOREIGN KEY ("variant_id", "market_code") REFERENCES "variant_markets"("variant_id", "market_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Raw SQL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Scalar lists are created nullable by Prisma: never NULL here.
-- -----------------------------------------------------------------------------
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_market_codes_chk" CHECK (
  "market_codes" IS NOT NULL
  AND array_position("market_codes", NULL) IS NULL
  AND array_to_string("market_codes", ',') ~ '^([A-Z]{2,8}(,|$))*$'
);
ALTER TABLE "rss_items" ADD CONSTRAINT "rss_items_feed_categories_chk" CHECK (
  "feed_categories" IS NOT NULL AND cardinality("feed_categories") <= 50
);

-- -----------------------------------------------------------------------------
-- Content
-- -----------------------------------------------------------------------------
ALTER TABLE "categories" ADD CONSTRAINT "categories_system_key_chk" CHECK (
  "system_key" IS NULL OR "system_key" ~ '^[a-z][a-z0-9_]{1,63}$'
);
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_restored_from_chk" CHECK (
  "restored_from_version" IS NULL OR ("restored_from_version" >= 1 AND "restored_from_version" < "version")
);
ALTER TABLE "article_translations" ADD CONSTRAINT "article_translations_reviewer_chk" CHECK (
  "human_reviewed_at" IS NULL OR "human_reviewed_by_id" IS NOT NULL
);
ALTER TABLE "article_corrections" ADD CONSTRAINT "article_corrections_note_chk" CHECK (
  nullif(btrim("note_ar"), '') IS NOT NULL OR nullif(btrim("note_en"), '') IS NOT NULL
);
ALTER TABLE "article_corrections" ADD CONSTRAINT "article_corrections_revision_chk" CHECK (
  "revision_version" IS NULL OR "revision_version" >= 1
);

-- Publishing rules, checked at COMMIT (deferred constraint triggers) so that
-- an article and its translations can be written in one transaction in any
-- order (Prisma nested creates insert the article first):
--  * in_review / scheduled / published → a translation in original_language;
--  * scheduled / published → that translation is human written or human
--    reviewed (REQUIREMENTS §5: machine translation / summaries stay drafts),
--    and the cover asset, when set, is a ready image with a licence (§5
--    media rights).
CREATE OR REPLACE FUNCTION articles_content_check(aid uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  a record;
  t record;
  c record;
BEGIN
  SELECT "status", "original_language", "cover_asset_id", "deleted_at" INTO a
    FROM "articles" WHERE "id" = aid;
  IF NOT FOUND OR a."deleted_at" IS NOT NULL
     OR a."status" NOT IN ('in_review', 'scheduled', 'published') THEN
    RETURN;
  END IF;
  SELECT "is_machine_translated", "human_reviewed_at" INTO t
    FROM "article_translations" WHERE "article_id" = aid AND "locale" = a."original_language";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'articles_original_translation_chk: article % (status %) needs a translation in its original language %',
      aid, a."status", a."original_language"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'articles_original_translation_chk';
  END IF;
  IF a."status" IN ('scheduled', 'published') THEN
    IF t."is_machine_translated" AND t."human_reviewed_at" IS NULL THEN
      RAISE EXCEPTION 'articles_machine_translation_review_chk: article % cannot be %: its % text is an unreviewed machine translation',
        aid, a."status", a."original_language"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'articles_machine_translation_review_chk';
    END IF;
    IF a."cover_asset_id" IS NOT NULL THEN
      SELECT "kind", "status", "license_id" INTO c FROM "media_assets" WHERE "id" = a."cover_asset_id";
      IF FOUND AND (c."kind" <> 'image' OR c."status" <> 'ready' OR c."license_id" IS NULL) THEN
        RAISE EXCEPTION 'articles_cover_rights_chk: article % cannot be %: the cover must be a ready image with a recorded licence (kind %, status %)',
          aid, a."status", c."kind", c."status"
          USING ERRCODE = 'check_violation', CONSTRAINT = 'articles_cover_rights_chk';
      END IF;
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION articles_content_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM articles_content_check(NEW."id");
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION article_translations_content_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM articles_content_check(OLD."article_id");
  ELSE
    PERFORM articles_content_check(NEW."article_id");
    IF NEW."article_id" IS DISTINCT FROM OLD."article_id" THEN
      PERFORM articles_content_check(OLD."article_id");
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "articles_content_check"
  AFTER INSERT OR UPDATE OF "status", "original_language", "cover_asset_id", "deleted_at" ON "articles"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION articles_content_trigger();
CREATE CONSTRAINT TRIGGER "article_translations_content_check"
  AFTER UPDATE OF "article_id", "locale", "is_machine_translated", "human_reviewed_at" OR DELETE ON "article_translations"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION article_translations_content_trigger();

-- -----------------------------------------------------------------------------
-- RSS: licences and de-duplication
-- -----------------------------------------------------------------------------
-- Showing more than headline + link, or the feed's images, needs a recorded
-- permission (REQUIREMENTS §5: a feed is not a licence to republish).
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_permission_chk" CHECK (
  ("usage_policy" = 'headline_link_only' AND NOT "allow_images")
  OR ("permission_confirmed_at" IS NOT NULL AND nullif(btrim("permission_reference"), '') IS NOT NULL)
);
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_urls_chk" CHECK (
  ("license_url" IS NULL OR "license_url" ~* '^https?://')
  AND ("site_url" IS NULL OR "site_url" ~* '^https?://')
);
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_failures_chk" CHECK ("consecutive_failures" >= 0);
ALTER TABLE "rss_items" ADD CONSTRAINT "rss_items_hashes_chk" CHECK (
  "url_hash" ~ '^[0-9a-f]{64}$'
  AND ("guid_hash" IS NULL OR "guid_hash" ~ '^[0-9a-f]{64}$')
  AND ("content_hash" IS NULL OR "content_hash" ~ '^[0-9a-f]{64}$')
  AND (("guid" IS NULL) = ("guid_hash" IS NULL))
);
ALTER TABLE "rss_items" ADD CONSTRAINT "rss_items_urls_chk" CHECK (
  "url" ~* '^https?://'
  AND ("canonical_url" IS NULL OR "canonical_url" ~* '^https?://')
  AND ("image_url" IS NULL OR "image_url" ~* '^https?://')
);
ALTER TABLE "rss_items" ADD CONSTRAINT "rss_items_duplicate_chk" CHECK (
  "duplicate_of_id" IS NULL OR "duplicate_of_id" <> "id"
);

-- -----------------------------------------------------------------------------
-- Catalog gallery: exactly one target (model, generation or variant) and at
-- most one cover image per target.
-- -----------------------------------------------------------------------------
ALTER TABLE "vehicle_media" DROP CONSTRAINT "vehicle_media_target_chk";
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_target_chk" CHECK (
  num_nonnulls("model_id", "generation_id", "variant_id") = 1
);
CREATE UNIQUE INDEX "vehicle_media_one_cover_model_uq"
  ON "vehicle_media" ("model_id") WHERE "is_cover" AND "model_id" IS NOT NULL;
CREATE UNIQUE INDEX "vehicle_media_one_cover_generation_uq"
  ON "vehicle_media" ("generation_id") WHERE "is_cover" AND "generation_id" IS NOT NULL;
CREATE UNIQUE INDEX "vehicle_media_one_cover_variant_uq"
  ON "vehicle_media" ("variant_id") WHERE "is_cover" AND "variant_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Comparisons (REQUIREMENTS §7)
-- -----------------------------------------------------------------------------
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_curated_fields_chk" CHECK (
  "is_curated" OR ("curated_status" IS NULL AND "curated_order" IS NULL)
);
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_curated_owner_chk" CHECK (
  NOT "is_curated" OR "user_id" IS NULL
);
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_curated_titles_chk" CHECK (
  NOT "is_curated" OR "curated_status" <> 'published'
  OR (nullif(btrim("title_ar"), '') IS NOT NULL AND nullif(btrim("title_en"), '') IS NOT NULL)
);
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_view_count_chk" CHECK ("view_count" >= 0);
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_signature_chk" CHECK (
  "signature" IS NULL OR "signature" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_share_id_chk" CHECK (
  "share_id" ~ '^[A-Za-z0-9_-]{6,24}$'
);

-- 2..4 items per comparison, checked at COMMIT: create the comparison and its
-- items in ONE transaction (a Prisma nested create does), replace items in
-- one transaction. Items of a deleted comparison are ignored. (Upper bound is
-- also guaranteed by position 1..4 + UNIQUE(comparison_id, position).)
CREATE OR REPLACE FUNCTION comparisons_item_count_check(cid uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  IF cid IS NULL OR NOT EXISTS (SELECT 1 FROM "comparisons" WHERE "id" = cid) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM "comparison_items" WHERE "comparison_id" = cid;
  IF n < 2 OR n > 4 THEN
    RAISE EXCEPTION 'comparisons_item_count_chk: comparison % must have 2 to 4 items (has %)', cid, n
      USING ERRCODE = 'check_violation', CONSTRAINT = 'comparisons_item_count_chk';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION comparisons_item_count_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM comparisons_item_count_check(NEW."id");
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION comparison_items_count_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM comparisons_item_count_check(OLD."comparison_id");
  ELSE
    PERFORM comparisons_item_count_check(NEW."comparison_id");
    IF TG_OP = 'UPDATE' AND NEW."comparison_id" IS DISTINCT FROM OLD."comparison_id" THEN
      PERFORM comparisons_item_count_check(OLD."comparison_id");
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "comparisons_item_count"
  AFTER INSERT ON "comparisons"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION comparisons_item_count_trigger();
CREATE CONSTRAINT TRIGGER "comparison_items_count"
  AFTER INSERT OR UPDATE OF "comparison_id" OR DELETE ON "comparison_items"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION comparison_items_count_trigger();

-- -----------------------------------------------------------------------------
-- Search and analytics
-- -----------------------------------------------------------------------------
ALTER TABLE "search_aliases" ADD CONSTRAINT "search_aliases_entity_chk" CHECK (
  ("entity_type" IS NULL) = ("entity_id" IS NULL)
);
ALTER TABLE "search_aliases" ADD CONSTRAINT "search_aliases_text_chk" CHECK (
  nullif(btrim("term"), '') IS NOT NULL AND nullif(btrim("canonical"), '') IS NOT NULL
);
ALTER TABLE "content_daily_stats" ADD CONSTRAINT "content_daily_stats_entity_type_chk" CHECK (
  "entity_type" IN ('article', 'brand', 'model', 'variant', 'comparison', 'tour', 'station', 'encyclopedia')
);
