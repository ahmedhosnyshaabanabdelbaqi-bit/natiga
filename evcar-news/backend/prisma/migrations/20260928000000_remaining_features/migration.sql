-- Remaining app features data model (stations, media & tours, personal data,
-- notifications, community, directory, encyclopedia, trips, ads):
--  * stations: provider records point at the local point / connector they
--    produced (+ licence URL, source URL, last import job); merged duplicates
--    (duplicate_of_id, never published) + reviewed duplicate candidates
--    (ordered pairs); user-suggested stations kept out of the map until
--    reviewed (GIST location); user photos moderated; check-ins record the
--    car used and waiting time; validated opening hours + IANA time zone;
--    report type connector_mismatch → different_connector
--  * media & tours: upload sessions with purpose, S3 multipart id/parts and
--    client metadata; multires config, processing attempts and credit line on
--    assets; attribution text required when a licence requires attribution;
--    scene pitch limits; seat positions driver/front_passenger/rear/third_row;
--    hotspot types info/detail_image/video/spec_link/scene_link with strict
--    field rules and media kind check; plain-text ar/en hotspot texts;
--    publishing (and later edits of a published tour) needs every scene
--    panorama AND hotspot file ready + licensed; files used by live content
--    keep ready + licence
--  * personal: current odometer, AC/DC per charging log (SoC end > start),
--    km-based reminder repeat, reminder types licence/custom, planned
--    departure of saved trips, user_interests (brands/models/categories)
--    replacing the untyped user_preferences.interests JSON
--  * notifications: station / campaign switches + global unsubscribe,
--    per-topic subscription columns with a unique target key, validated
--    time zone, deep-link format, device installation id + failure counter,
--    idempotent deliveries (partial unique indexes), deferred sends + skip
--    reasons
--  * community: real owner verifications behind the "verified owner" badge,
--    per-dimension ratings, votes with maintained counters, comments on car
--    model / variant pages (reply = same target), accepted answer belongs to
--    the question, content hash for duplicate detection, spam signals, user
--    mutes, one open report per reporter × target, one active block per
--    scope, labelled report reasons
--  * directory / encyclopedia / ads: emergency provider type, services,
--    24/7 flag, logo, verification note, sponsored until; encyclopedia
--    categories table (topic → category_key); ad surfaces for directory and
--    encyclopedia lists; anonymous daily ad counters
-- Generated DDL first (hand-edited: enum values renamed in place, column
-- renamed instead of drop + add), then raw SQL (Prisma ignores CHECKs,
-- triggers and partial indexes when diffing).

-- CreateEnum
CREATE TYPE "review_rating_dimension" AS ENUM ('range_real_world', 'charging', 'comfort', 'technology', 'build_quality', 'value_for_money', 'reliability', 'after_sales', 'station_reliability', 'station_access', 'station_price', 'station_amenities');

-- CreateEnum
CREATE TYPE "vote_target_type" AS ENUM ('review', 'comment', 'question', 'answer');

-- CreateEnum
CREATE TYPE "spam_signal_type" AS ENUM ('rate_limited', 'duplicate_content', 'link_spam', 'blocked_words', 'new_account', 'user_reports', 'other');

-- CreateEnum
CREATE TYPE "owner_verification_method" AS ENUM ('document_review', 'dealer_confirmation', 'other');

-- CreateEnum
CREATE TYPE "owner_verification_status" AS ENUM ('pending', 'approved', 'rejected', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "report_reason_scope" AS ENUM ('station', 'content');

-- CreateEnum
CREATE TYPE "station_suggestion_status" AS ENUM ('pending', 'approved', 'rejected', 'duplicate', 'withdrawn');

-- CreateEnum
CREATE TYPE "station_duplicate_status" AS ENUM ('pending', 'merged', 'not_duplicate');

-- AlterEnum (PostgreSQL >= 12: allowed in a transaction; the new values are
-- not used by this migration)
ALTER TYPE "ad_surface" ADD VALUE 'directory_list';
ALTER TYPE "ad_surface" ADD VALUE 'encyclopedia';

-- AlterEnum (renamed in place: stored rows and CHECK constraints keep working)
ALTER TYPE "hotspot_type" RENAME VALUE 'scene' TO 'scene_link';
ALTER TYPE "hotspot_type" RENAME VALUE 'image' TO 'detail_image';
ALTER TYPE "hotspot_type" RENAME VALUE 'spec' TO 'spec_link';

-- AlterEnum
ALTER TYPE "reminder_type" RENAME VALUE 'registration' TO 'licence';
ALTER TYPE "reminder_type" RENAME VALUE 'other' TO 'custom';

-- AlterEnum
ALTER TYPE "scene_position" RENAME VALUE 'driver_seat' TO 'driver';
ALTER TYPE "scene_position" RENAME VALUE 'rear_seats' TO 'rear';

-- AlterEnum
ALTER TYPE "service_provider_type" RENAME VALUE 'roadside_assistance' TO 'emergency';

-- AlterEnum
ALTER TYPE "station_report_type" RENAME VALUE 'connector_mismatch' TO 'different_connector';

-- DropIndex
DROP INDEX "encyclopedia_entries_topic_status_sort_order_idx";

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "downvote_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "edited_at" TIMESTAMPTZ(3),
ADD COLUMN     "upvote_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "charging_logs" ADD COLUMN     "current_type" "current_type";

-- AlterTable
ALTER TABLE "charging_stations" ADD COLUMN     "duplicate_of_id" UUID,
ADD COLUMN     "opening_hours_text" VARCHAR(500);

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "downvote_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "model_id" UUID,
ADD COLUMN     "upvote_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variant_id" UUID;

-- AlterTable
ALTER TABLE "device_tokens" ADD COLUMN     "failure_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "installation_id" VARCHAR(64),
ADD COLUMN     "last_failure_at" TIMESTAMPTZ(3);

-- AlterTable (topic → category_key renamed in place, keeps existing rows)
ALTER TABLE "encyclopedia_entries" RENAME COLUMN "topic" TO "category_key";
ALTER TABLE "encyclopedia_entries" ADD COLUMN     "content_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "review_note" VARCHAR(2000);

-- AlterTable
ALTER TABLE "interior_tours" ADD COLUMN     "review_note" VARCHAR(2000);

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "credit_text" VARCHAR(300),
ADD COLUMN     "multires_config" JSONB,
ADD COLUMN     "processing_attempts" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "processing_started_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "scheduled_for" TIMESTAMPTZ(3),
ADD COLUMN     "skip_reason" VARCHAR(64);

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "campaigns_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "station_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubscribed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notification_subscriptions" ADD COLUMN     "target_key" VARCHAR(160);

-- AlterTable
ALTER TABLE "provider_records" ADD COLUMN     "charging_point_id" UUID,
ADD COLUMN     "connector_id" UUID,
ADD COLUMN     "last_import_job_id" UUID,
ADD COLUMN     "license_url" VARCHAR(2048),
ADD COLUMN     "source_url" VARCHAR(2048);

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "downvote_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "edited_at" TIMESTAMPTZ(3),
ADD COLUMN     "upvote_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "notify_km_before" DECIMAL(10,1),
ADD COLUMN     "repeat_interval_km" DECIMAL(10,1);

-- AlterTable (the badge now needs an owner_verifications row: old free-text
-- verifications cannot back it, so any old badge is cleared)
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_verified_owner_chk";
UPDATE "reviews" SET "is_verified_owner" = false WHERE "is_verified_owner";
ALTER TABLE "reviews" DROP COLUMN "owner_verification_method",
DROP COLUMN "owner_verified_at",
ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "downvote_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "owner_verification_id" UUID,
ADD COLUMN     "upvote_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "service_providers" ADD COLUMN     "contact_verification_note" VARCHAR(500),
ADD COLUMN     "is_always_open" BOOLEAN,
ADD COLUMN     "logo_asset_id" UUID,
ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sponsored_until" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "station_checkins" ADD COLUMN     "variant_id" UUID,
ADD COLUMN     "wait_minutes" INTEGER,
ALTER COLUMN "comment" SET DATA TYPE VARCHAR(2000);

-- AlterTable
ALTER TABLE "station_media" ADD COLUMN     "status" "moderation_status" NOT NULL DEFAULT 'approved',
ADD COLUMN     "uploaded_by_id" UUID;

-- AlterTable
ALTER TABLE "tour_scenes" ADD COLUMN     "max_pitch" DECIMAL(6,2),
ADD COLUMN     "min_pitch" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "trip_plans" ADD COLUMN     "planned_departure_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "upload_sessions" ADD COLUMN     "last_chunk_at" TIMESTAMPTZ(3),
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "multipart_upload_id" VARCHAR(1024),
ADD COLUMN     "parts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "purpose" VARCHAR(64);

-- AlterTable
ALTER TABLE "user_preferences" DROP COLUMN "interests";

-- AlterTable
ALTER TABLE "user_vehicles" ADD COLUMN     "current_odometer_km" DECIMAL(10,1),
ADD COLUMN     "odometer_updated_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "review_ratings" (
    "review_id" UUID NOT NULL,
    "dimension" "review_rating_dimension" NOT NULL,
    "score" SMALLINT NOT NULL,

    CONSTRAINT "review_ratings_pkey" PRIMARY KEY ("review_id","dimension")
);

-- CreateTable
CREATE TABLE "community_votes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" "vote_target_type" NOT NULL,
    "review_id" UUID,
    "comment_id" UUID,
    "question_id" UUID,
    "answer_id" UUID,
    "value" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mutes" (
    "user_id" UUID NOT NULL,
    "muted_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mutes_pkey" PRIMARY KEY ("user_id","muted_user_id")
);

-- CreateTable
CREATE TABLE "spam_signals" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "target_type" "community_target_type",
    "target_id" UUID,
    "signal" "spam_signal_type" NOT NULL,
    "score" SMALLINT NOT NULL DEFAULT 10,
    "content_hash" CHAR(64),
    "ip_hash" CHAR(64),
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spam_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "user_vehicle_id" UUID,
    "method" "owner_verification_method" NOT NULL,
    "status" "owner_verification_status" NOT NULL DEFAULT 'pending',
    "evidence_asset_id" UUID,
    "evidence_deleted_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(2000),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "owner_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_reasons" (
    "scope" "report_reason_scope" NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label_ar" VARCHAR(120) NOT NULL,
    "label_en" VARCHAR(120) NOT NULL,
    "description_ar" VARCHAR(500),
    "description_en" VARCHAR(500),
    "requires_details" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_reasons_pkey" PRIMARY KEY ("scope","code")
);

-- CreateTable
CREATE TABLE "encyclopedia_categories" (
    "key" VARCHAR(64) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "description_ar" VARCHAR(500),
    "description_en" VARCHAR(500),
    "icon_key" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "encyclopedia_categories_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ad_daily_stats" (
    "creative_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_daily_stats_pkey" PRIMARY KEY ("creative_id","day")
);

-- CreateTable
CREATE TABLE "user_interests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "brand_id" UUID,
    "model_id" UUID,
    "category_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_suggestions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "status" "station_suggestion_status" NOT NULL DEFAULT 'pending',
    "name" VARCHAR(300) NOT NULL,
    "operator_name" VARCHAR(200),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "address_text" VARCHAR(500),
    "city" VARCHAR(120),
    "country_code" CHAR(2) NOT NULL,
    "market_code" VARCHAR(8),
    "access_type" "station_access_type" NOT NULL DEFAULT 'unknown',
    "connectors" JSONB NOT NULL DEFAULT '[]',
    "opening_hours_text" VARCHAR(500),
    "notes" VARCHAR(2000),
    "photo_asset_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(2000),
    "created_station_id" UUID,
    "duplicate_of_station_id" UUID,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "station_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_duplicate_candidates" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "other_station_id" UUID NOT NULL,
    "distance_m" DECIMAL(10,1),
    "name_similarity" DECIMAL(4,3),
    "reason" VARCHAR(300),
    "status" "station_duplicate_status" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "station_duplicate_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_votes_review_id_idx" ON "community_votes"("review_id");

-- CreateIndex
CREATE INDEX "community_votes_comment_id_idx" ON "community_votes"("comment_id");

-- CreateIndex
CREATE INDEX "community_votes_question_id_idx" ON "community_votes"("question_id");

-- CreateIndex
CREATE INDEX "community_votes_answer_id_idx" ON "community_votes"("answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_user_id_review_id_key" ON "community_votes"("user_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_user_id_comment_id_key" ON "community_votes"("user_id", "comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_user_id_question_id_key" ON "community_votes"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_user_id_answer_id_key" ON "community_votes"("user_id", "answer_id");

-- CreateIndex
CREATE INDEX "user_mutes_muted_user_id_idx" ON "user_mutes"("muted_user_id");

-- CreateIndex
CREATE INDEX "spam_signals_user_id_created_at_idx" ON "spam_signals"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "spam_signals_target_type_target_id_idx" ON "spam_signals"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "spam_signals_content_hash_idx" ON "spam_signals"("content_hash");

-- CreateIndex
CREATE INDEX "spam_signals_ip_hash_created_at_idx" ON "spam_signals"("ip_hash", "created_at" DESC);

-- CreateIndex
CREATE INDEX "owner_verifications_user_id_status_idx" ON "owner_verifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "owner_verifications_status_created_at_idx" ON "owner_verifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "owner_verifications_variant_id_idx" ON "owner_verifications"("variant_id");

-- CreateIndex
CREATE INDEX "owner_verifications_user_vehicle_id_idx" ON "owner_verifications"("user_vehicle_id");

-- CreateIndex
CREATE INDEX "encyclopedia_categories_is_active_sort_order_idx" ON "encyclopedia_categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "ad_daily_stats_day_idx" ON "ad_daily_stats"("day");

-- CreateIndex
CREATE INDEX "user_interests_brand_id_idx" ON "user_interests"("brand_id");

-- CreateIndex
CREATE INDEX "user_interests_model_id_idx" ON "user_interests"("model_id");

-- CreateIndex
CREATE INDEX "user_interests_category_id_idx" ON "user_interests"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_interests_user_id_brand_id_key" ON "user_interests"("user_id", "brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_interests_user_id_model_id_key" ON "user_interests"("user_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_interests_user_id_category_id_key" ON "user_interests"("user_id", "category_id");

-- CreateIndex
CREATE INDEX "station_suggestions_location_gist" ON "station_suggestions" USING GIST ("location");

-- CreateIndex
CREATE INDEX "station_suggestions_status_created_at_idx" ON "station_suggestions"("status", "created_at");

-- CreateIndex
CREATE INDEX "station_suggestions_user_id_idx" ON "station_suggestions"("user_id");

-- CreateIndex
CREATE INDEX "station_duplicate_candidates_other_station_id_idx" ON "station_duplicate_candidates"("other_station_id");

-- CreateIndex
CREATE INDEX "station_duplicate_candidates_status_created_at_idx" ON "station_duplicate_candidates"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "station_duplicate_candidates_station_id_other_station_id_key" ON "station_duplicate_candidates"("station_id", "other_station_id");

-- CreateIndex
CREATE INDEX "answers_content_hash_idx" ON "answers"("content_hash");

-- CreateIndex
CREATE INDEX "charging_stations_duplicate_of_id_idx" ON "charging_stations"("duplicate_of_id");

-- CreateIndex
CREATE INDEX "comments_model_id_status_created_at_idx" ON "comments"("model_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "comments_variant_id_status_created_at_idx" ON "comments"("variant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "comments_content_hash_idx" ON "comments"("content_hash");

-- CreateIndex
CREATE INDEX "device_tokens_installation_id_idx" ON "device_tokens"("installation_id");

-- CreateIndex
CREATE INDEX "encyclopedia_entries_category_key_status_sort_order_idx" ON "encyclopedia_entries"("category_key", "status", "sort_order");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_scheduled_for_idx" ON "notification_deliveries"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notification_deliveries_device_token_id_idx" ON "notification_deliveries"("device_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_subscriptions_user_id_target_key_key" ON "notification_subscriptions"("user_id", "target_key");

-- CreateIndex
CREATE INDEX "provider_records_charging_point_id_idx" ON "provider_records"("charging_point_id");

-- CreateIndex
CREATE INDEX "provider_records_connector_id_idx" ON "provider_records"("connector_id");

-- CreateIndex
CREATE INDEX "provider_records_provider_last_seen_at_idx" ON "provider_records"("provider", "last_seen_at");

-- CreateIndex
CREATE INDEX "questions_content_hash_idx" ON "questions"("content_hash");

-- CreateIndex
CREATE INDEX "reviews_content_hash_idx" ON "reviews"("content_hash");

-- CreateIndex
CREATE INDEX "reviews_owner_verification_id_idx" ON "reviews"("owner_verification_id");

-- CreateIndex
CREATE INDEX "service_providers_market_code_city_idx" ON "service_providers"("market_code", "city");

-- CreateIndex
CREATE INDEX "station_checkins_variant_id_idx" ON "station_checkins"("variant_id");

-- CreateIndex
CREATE INDEX "station_media_station_id_status_sort_order_idx" ON "station_media"("station_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "upload_sessions_purpose_idx" ON "upload_sessions"("purpose");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_owner_verification_id_fkey" FOREIGN KEY ("owner_verification_id") REFERENCES "owner_verifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_muted_user_id_fkey" FOREIGN KEY ("muted_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spam_signals" ADD CONSTRAINT "spam_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_verifications" ADD CONSTRAINT "owner_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_verifications" ADD CONSTRAINT "owner_verifications_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_verifications" ADD CONSTRAINT "owner_verifications_user_vehicle_id_fkey" FOREIGN KEY ("user_vehicle_id") REFERENCES "user_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_verifications" ADD CONSTRAINT "owner_verifications_evidence_asset_id_fkey" FOREIGN KEY ("evidence_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_verifications" ADD CONSTRAINT "owner_verifications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_logo_asset_id_fkey" FOREIGN KEY ("logo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing entries keep their topic as category (the reference seed names the
-- system categories; unknown topics stay as admin-editable placeholders).
INSERT INTO "encyclopedia_categories" ("key", "name_ar", "name_en", "updated_at")
  SELECT DISTINCT "category_key", "category_key", "category_key", CURRENT_TIMESTAMP
  FROM "encyclopedia_entries"
  ON CONFLICT ("key") DO NOTHING;

-- AddForeignKey
ALTER TABLE "encyclopedia_entries" ADD CONSTRAINT "encyclopedia_entries_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "encyclopedia_categories"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "ad_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "charging_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_charging_point_id_fkey" FOREIGN KEY ("charging_point_id") REFERENCES "charging_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_last_import_job_id_fkey" FOREIGN KEY ("last_import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_checkins" ADD CONSTRAINT "station_checkins_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_media" ADD CONSTRAINT "station_media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_photo_asset_id_fkey" FOREIGN KEY ("photo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_created_station_id_fkey" FOREIGN KEY ("created_station_id") REFERENCES "charging_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_duplicate_of_station_id_fkey" FOREIGN KEY ("duplicate_of_station_id") REFERENCES "charging_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_duplicate_candidates" ADD CONSTRAINT "station_duplicate_candidates_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_duplicate_candidates" ADD CONSTRAINT "station_duplicate_candidates_other_station_id_fkey" FOREIGN KEY ("other_station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_duplicate_candidates" ADD CONSTRAINT "station_duplicate_candidates_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =============================================================================
-- Raw SQL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
-- Weekly opening hours: NULL (unknown) or an object whose keys are days
-- mon..sun; each day is an array (max 6) of ["HH:MM","HH:MM"] windows in the
-- place's local time (end "24:00" allowed, end < start = past midnight,
-- start = end refused); [] = closed that day; a missing day = unknown.
--   {"mon":[["08:00","22:00"]],"fri":[],"sat":[["10:00","14:00"],["16:00","24:00"]]}
CREATE OR REPLACE FUNCTION app_valid_opening_hours(h jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  d record;
  w jsonb;
BEGIN
  IF h IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(h) <> 'object' THEN
    RETURN false;
  END IF;
  FOR d IN SELECT key, value FROM jsonb_each(h) LOOP
    IF d.key NOT IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
       OR jsonb_typeof(d.value) <> 'array' OR jsonb_array_length(d.value) > 6 THEN
      RETURN false;
    END IF;
    FOR w IN SELECT value FROM jsonb_array_elements(d.value) LOOP
      IF jsonb_typeof(w) <> 'array' OR jsonb_array_length(w) <> 2
         OR jsonb_typeof(w->0) <> 'string' OR jsonb_typeof(w->1) <> 'string'
         OR (w->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR (w->>1) !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
         OR (w->>0) = (w->>1) THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END
$$;

-- IANA time zone check for any table with a "timezone" column (NULL allowed).
CREATE OR REPLACE FUNCTION app_timezone_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tz text := to_jsonb(NEW)->>'timezone';
BEGIN
  IF tz IS NOT NULL THEN
    BEGIN
      PERFORM now() AT TIME ZONE tz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '%_timezone_chk: "%" is not an IANA time zone', TG_TABLE_NAME, tz
        USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_timezone_chk';
    END;
  END IF;
  RETURN NEW;
END
$$;

-- location geography(Point,4326) from NOT NULL latitude / longitude.
CREATE OR REPLACE FUNCTION app_sync_location()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  RETURN NEW;
END
$$;

-- Scalar lists are created nullable by Prisma: never NULL here.
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_services_chk" CHECK (
  "services" IS NOT NULL AND array_position("services", NULL) IS NULL AND cardinality("services") <= 30
);

-- -----------------------------------------------------------------------------
-- Stations (REQUIREMENTS §10–11)
-- -----------------------------------------------------------------------------
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_opening_hours_chk" CHECK (
  app_valid_opening_hours("opening_hours")
  AND NOT ("is_always_open" IS TRUE AND "opening_hours" IS NOT NULL)
);
-- A merged duplicate is never published.
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_duplicate_chk" CHECK (
  "duplicate_of_id" IS NULL
  OR ("duplicate_of_id" <> "id" AND "publication_status" <> 'published')
);
CREATE TRIGGER charging_stations_timezone_check
  BEFORE INSERT OR UPDATE OF "timezone" ON "charging_stations"
  FOR EACH ROW EXECUTE FUNCTION app_timezone_check();

ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_entity_type_chk" CHECK (
  "entity_type" IN ('station', 'operator', 'point', 'connector', 'tariff')
);
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_provider_chk" CHECK (
  "provider" ~ '^[a-z][a-z0-9_:.-]{1,63}$' AND nullif(btrim("external_id"), '') IS NOT NULL
);
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_hash_chk" CHECK (
  "payload_hash" IS NULL OR "payload_hash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_urls_chk" CHECK (
  ("license_url" IS NULL OR "license_url" ~* '^https?://')
  AND ("source_url" IS NULL OR "source_url" ~* '^https?://')
);
-- A provider record's charge point / connector belongs to its station. Only
-- values that are SET are checked (insert, or a change of the point /
-- connector, or of the station to another non-NULL station), so the FK
-- "SET NULL" actions of a station delete cascade never trip it.
CREATE OR REPLACE FUNCTION provider_records_refs_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."charging_point_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."charging_point_id" IS DISTINCT FROM OLD."charging_point_id"
          OR (NEW."station_id" IS NOT NULL AND NEW."station_id" IS DISTINCT FROM OLD."station_id"))
     AND NOT EXISTS (
       SELECT 1 FROM "charging_points"
       WHERE "id" = NEW."charging_point_id" AND "station_id" IS NOT DISTINCT FROM NEW."station_id"
     ) THEN
    RAISE EXCEPTION 'provider_records_station_refs_chk: charge point % does not belong to station %', NEW."charging_point_id", NEW."station_id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'provider_records_station_refs_chk';
  END IF;
  IF NEW."connector_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."connector_id" IS DISTINCT FROM OLD."connector_id"
          OR (NEW."station_id" IS NOT NULL AND NEW."station_id" IS DISTINCT FROM OLD."station_id"))
     AND NOT EXISTS (
       SELECT 1 FROM "connectors"
       WHERE "id" = NEW."connector_id" AND "station_id" IS NOT DISTINCT FROM NEW."station_id"
     ) THEN
    RAISE EXCEPTION 'provider_records_station_refs_chk: connector % does not belong to station %', NEW."connector_id", NEW."station_id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'provider_records_station_refs_chk';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER provider_records_refs_check
  BEFORE INSERT OR UPDATE ON "provider_records"
  FOR EACH ROW EXECUTE FUNCTION provider_records_refs_check();

ALTER TABLE "station_checkins" ADD CONSTRAINT "station_checkins_wait_chk" CHECK (
  "wait_minutes" IS NULL OR "wait_minutes" BETWEEN 0 AND 1440
);

-- User suggestions: kept out of the public stations table until reviewed.
CREATE TRIGGER station_suggestions_sync_location
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "station_suggestions"
  FOR EACH ROW EXECUTE FUNCTION app_sync_location();
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_coordinates_chk" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
);
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_country_code_chk" CHECK (
  "country_code" ~ '^[A-Z]{2}$'
);
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_name_chk" CHECK (
  nullif(btrim("name"), '') IS NOT NULL
);
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_connectors_chk" CHECK (
  jsonb_typeof("connectors") = 'array' AND jsonb_array_length("connectors") <= 20
);
ALTER TABLE "station_suggestions" ADD CONSTRAINT "station_suggestions_review_chk" CHECK (
  "status" NOT IN ('approved', 'rejected', 'duplicate') OR "reviewed_at" IS NOT NULL
);

-- Duplicate pairs: ordered, reviewed when decided.
ALTER TABLE "station_duplicate_candidates" ADD CONSTRAINT "station_duplicate_candidates_order_chk" CHECK (
  "station_id" < "other_station_id"
);
ALTER TABLE "station_duplicate_candidates" ADD CONSTRAINT "station_duplicate_candidates_values_chk" CHECK (
  ("distance_m" IS NULL OR "distance_m" >= 0)
  AND ("name_similarity" IS NULL OR "name_similarity" BETWEEN 0 AND 1)
);
ALTER TABLE "station_duplicate_candidates" ADD CONSTRAINT "station_duplicate_candidates_review_chk" CHECK (
  "status" = 'pending' OR "reviewed_at" IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- Media & 360° tours (REQUIREMENTS §8–9)
-- -----------------------------------------------------------------------------
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_processing_attempts_chk" CHECK (
  "processing_attempts" >= 0
);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_multires_chk" CHECK (
  "multires_config" IS NULL OR jsonb_typeof("multires_config") = 'object'
);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_credit_chk" CHECK (
  "credit_text" IS NULL OR nullif(btrim("credit_text"), '') IS NOT NULL
);
-- A licence that requires attribution says what the credit is.
ALTER TABLE "asset_licenses" ADD CONSTRAINT "asset_licenses_attribution_chk" CHECK (
  NOT "attribution_required" OR nullif(btrim("attribution_text"), '') IS NOT NULL
);
ALTER TABLE "asset_licenses" ADD CONSTRAINT "asset_licenses_rights_holder_chk" CHECK (
  nullif(btrim("rights_holder"), '') IS NOT NULL
);
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_purpose_chk" CHECK (
  "purpose" IS NULL OR "purpose" ~ '^[a-z][a-z0-9_]{1,63}$'
);
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_json_chk" CHECK (
  jsonb_typeof("parts") = 'array' AND jsonb_typeof("metadata") = 'object'
);
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_pitch_limits_chk" CHECK (
  ("min_pitch" IS NULL OR "min_pitch" BETWEEN -90 AND 90)
  AND ("max_pitch" IS NULL OR "max_pitch" BETWEEN -90 AND 90)
  AND ("min_pitch" IS NULL OR "max_pitch" IS NULL OR "min_pitch" <= "max_pitch")
);

-- Hotspot types (renamed above): each type uses exactly its own fields.
ALTER TABLE "scene_hotspots" DROP CONSTRAINT "scene_hotspots_type_chk";
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_type_chk" CHECK (
  (("type" = 'scene_link') = ("target_scene_id" IS NOT NULL))
  AND ("type" = 'scene_link' OR ("target_yaw" IS NULL AND "target_pitch" IS NULL))
  AND (("type" IN ('detail_image', 'video')) = ("media_asset_id" IS NOT NULL))
  AND (("type" = 'spec_link') = ("spec_key" IS NOT NULL))
);
-- detail_image → an image, video → a video.
CREATE OR REPLACE FUNCTION scene_hotspots_media_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k media_kind;
BEGIN
  IF NEW."media_asset_id" IS NOT NULL THEN
    SELECT "kind" INTO k FROM "media_assets" WHERE "id" = NEW."media_asset_id";
    IF FOUND AND ((NEW."type" = 'detail_image' AND k <> 'image') OR (NEW."type" = 'video' AND k <> 'video')) THEN
      RAISE EXCEPTION 'scene_hotspots_media_kind_chk: a % hotspot cannot use a % asset', NEW."type", k
        USING ERRCODE = 'check_violation', CONSTRAINT = 'scene_hotspots_media_kind_chk';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER scene_hotspots_media_check
  BEFORE INSERT OR UPDATE OF "type", "media_asset_id" ON "scene_hotspots"
  FOR EACH ROW EXECUTE FUNCTION scene_hotspots_media_check();

-- Hotspot texts: ar/en, plain text only (no markup ever reaches the viewer).
ALTER TABLE "scene_hotspot_translations" ADD CONSTRAINT "scene_hotspot_translations_locale_chk" CHECK (
  "locale" IN ('ar', 'en')
);
ALTER TABLE "scene_hotspot_translations" ADD CONSTRAINT "scene_hotspot_translations_plain_text_chk" CHECK (
  nullif(btrim("title"), '') IS NOT NULL
  AND "title" !~ '<[A-Za-z/!?]'
  AND ("body" IS NULL OR "body" !~ '<[A-Za-z/!?]')
);

-- Publishing a tour: every scene panorama AND every hotspot image / video is
-- ready + licensed, there is an initial scene, and the variant is offered in
-- the market. Replaces the review-2 version (which checked scenes only).
CREATE OR REPLACE FUNCTION interior_tour_assets_ok(tid uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM "tour_scenes" WHERE "tour_id" = tid)
    AND NOT EXISTS (
      SELECT 1 FROM "tour_scenes" s JOIN "media_assets" a ON a."id" = s."asset_id"
      WHERE s."tour_id" = tid
        AND (a."status" <> 'ready' OR a."license_id" IS NULL OR a."deleted_at" IS NOT NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM "scene_hotspots" h JOIN "media_assets" a ON a."id" = h."media_asset_id"
      WHERE h."tour_id" = tid
        AND (a."status" <> 'ready' OR a."license_id" IS NULL OR a."deleted_at" IS NOT NULL)
    )
$$;

CREATE OR REPLACE FUNCTION interior_tours_integrity_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."initial_scene_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "tour_scenes" WHERE "id" = NEW."initial_scene_id" AND "tour_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'interior_tours_initial_scene_chk: the initial scene must be a scene of tour %', NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_initial_scene_chk';
  END IF;
  IF NEW."status" = 'published' AND NEW."deleted_at" IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "variant_markets"
      WHERE "variant_id" = NEW."variant_id" AND "market_code" = NEW."market_code"
        AND "availability" IN ('available', 'coming_soon', 'discontinued')
    ) THEN
      RAISE EXCEPTION 'interior_tours_market_availability_chk: tour % cannot be published: variant is not offered in market %', NEW."id", NEW."market_code"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_market_availability_chk';
    END IF;
    IF NEW."initial_scene_id" IS NULL OR NOT interior_tour_assets_ok(NEW."id") THEN
      RAISE EXCEPTION 'interior_tours_publish_assets_chk: tour % cannot be published: every scene panorama and hotspot image/video must be ready and licensed, with an initial scene', NEW."id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_publish_assets_chk';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Changing the scenes / hotspot media of a PUBLISHED tour is re-checked at
-- COMMIT (so a scene can be swapped inside one transaction): unpublish first
-- to work on a tour whose new files are not ready yet.
CREATE OR REPLACE FUNCTION interior_tour_published_check(tid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF tid IS NOT NULL AND EXISTS (
    SELECT 1 FROM "interior_tours" WHERE "id" = tid AND "status" = 'published' AND "deleted_at" IS NULL
  ) AND NOT interior_tour_assets_ok(tid) THEN
    RAISE EXCEPTION 'interior_tours_publish_assets_chk: published tour % would have a scene or hotspot file that is not ready and licensed (or no scene)', tid
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_publish_assets_chk';
  END IF;
END
$$;
CREATE OR REPLACE FUNCTION tour_children_published_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM interior_tour_published_check(OLD."tour_id");
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM interior_tour_published_check(NEW."tour_id");
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER "tour_scenes_published_check"
  AFTER INSERT OR UPDATE OF "asset_id", "tour_id" OR DELETE ON "tour_scenes"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tour_children_published_trigger();
CREATE CONSTRAINT TRIGGER "scene_hotspots_published_check"
  AFTER INSERT OR UPDATE OF "media_asset_id", "tour_id" OR DELETE ON "scene_hotspots"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tour_children_published_trigger();

-- A file used by live content (published tour scene / hotspot, cover of a
-- scheduled or published article) keeps status ready, its licence and is not
-- deleted: replace it with a NEW asset version (previous_version_id) or
-- unpublish first. Re-processing tiles of such a file must keep it ready.
CREATE OR REPLACE FUNCTION media_assets_in_use_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."status" <> 'ready' OR NEW."license_id" IS NULL OR NEW."deleted_at" IS NOT NULL)
     AND (
       EXISTS (
         SELECT 1 FROM "tour_scenes" s JOIN "interior_tours" t ON t."id" = s."tour_id"
         WHERE s."asset_id" = NEW."id" AND t."status" = 'published' AND t."deleted_at" IS NULL)
       OR EXISTS (
         SELECT 1 FROM "scene_hotspots" h JOIN "interior_tours" t ON t."id" = h."tour_id"
         WHERE h."media_asset_id" = NEW."id" AND t."status" = 'published' AND t."deleted_at" IS NULL)
       OR EXISTS (
         SELECT 1 FROM "articles" a
         WHERE a."cover_asset_id" = NEW."id" AND a."status" IN ('scheduled', 'published') AND a."deleted_at" IS NULL)
     ) THEN
    RAISE EXCEPTION 'media_assets_in_use_chk: asset % is used by published content and must stay ready, licensed and not deleted', NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'media_assets_in_use_chk';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER media_assets_in_use_guard
  BEFORE UPDATE OF "status", "license_id", "deleted_at" ON "media_assets"
  FOR EACH ROW EXECUTE FUNCTION media_assets_in_use_guard();

-- -----------------------------------------------------------------------------
-- Personal data (REQUIREMENTS §13–14)
-- -----------------------------------------------------------------------------
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_current_odometer_chk" CHECK (
  "current_odometer_km" IS NULL OR "current_odometer_km" >= 0
);
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_soc_order_chk" CHECK (
  "soc_start" IS NULL OR "soc_end" IS NULL OR "soc_end" > "soc_start"
);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_km_chk" CHECK (
  ("repeat_interval_km" IS NULL OR "repeat_interval_km" > 0)
  AND ("notify_km_before" IS NULL OR "notify_km_before" >= 0)
);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_title_chk" CHECK (
  nullif(btrim("title"), '') IS NOT NULL
);
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_target_chk" CHECK (
  num_nonnulls("brand_id", "model_id", "category_id") = 1
);

-- -----------------------------------------------------------------------------
-- Notifications (REQUIREMENTS §16)
-- -----------------------------------------------------------------------------
CREATE TRIGGER notification_preferences_timezone_check
  BEFORE INSERT OR UPDATE OF "timezone" ON "notification_preferences"
  FOR EACH ROW EXECUTE FUNCTION app_timezone_check();
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_quiet_hours_tz_chk" CHECK (
  "quiet_hours_start" IS NULL OR "timezone" IS NOT NULL
);

-- Subscriptions: the columns match the topic; targetKey makes them unique.
ALTER TABLE "notification_subscriptions" DROP CONSTRAINT "notification_subscriptions_target_chk";
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_target_chk" CHECK (
  CASE "topic_type"
    WHEN 'brand' THEN "brand_id" IS NOT NULL AND num_nonnulls("model_id", "variant_id", "category_id", "station_id") = 0
    WHEN 'model' THEN "model_id" IS NOT NULL AND num_nonnulls("brand_id", "variant_id", "category_id", "station_id") = 0
    WHEN 'variant' THEN "variant_id" IS NOT NULL AND num_nonnulls("brand_id", "model_id", "category_id", "station_id") = 0
    WHEN 'category' THEN "category_id" IS NOT NULL AND num_nonnulls("brand_id", "model_id", "variant_id", "station_id") = 0
    WHEN 'station' THEN "station_id" IS NOT NULL AND num_nonnulls("brand_id", "model_id", "variant_id", "category_id", "market_code") = 0
    WHEN 'market' THEN "market_code" IS NOT NULL AND num_nonnulls("brand_id", "model_id", "variant_id", "category_id", "station_id") = 0
    WHEN 'price_alert' THEN "variant_id" IS NOT NULL AND "market_code" IS NOT NULL
      AND num_nonnulls("brand_id", "model_id", "category_id", "station_id") = 0
  END
);
-- "<topic>:<id>@<market|*>" (market topic: "market:<code>").
CREATE OR REPLACE FUNCTION notification_subscriptions_target_key()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."target_key" := NEW."topic_type"::text || ':'
    || coalesce(NEW."brand_id"::text, NEW."model_id"::text, NEW."variant_id"::text,
                NEW."category_id"::text, NEW."station_id"::text, NEW."market_code", '-')
    || CASE WHEN NEW."topic_type" = 'market' THEN '' ELSE '@' || coalesce(NEW."market_code", '*') END;
  RETURN NEW;
END
$$;
CREATE TRIGGER notification_subscriptions_target_key
  BEFORE INSERT OR UPDATE ON "notification_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION notification_subscriptions_target_key();
UPDATE "notification_subscriptions" SET "target_key" = NULL;
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_target_key_chk" CHECK (
  "target_key" IS NOT NULL
);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deep_link_chk" CHECK (
  "deep_link" IS NULL OR "deep_link" ~ '^(/($|[^/])|https://)'
);
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_deep_link_chk" CHECK (
  "deep_link" IS NULL OR "deep_link" ~ '^(/($|[^/])|https://)'
);
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_failures_chk" CHECK ("failure_count" >= 0);
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_skip_chk" CHECK (
  "status" <> 'skipped' OR "skip_reason" IS NOT NULL
);
-- Idempotent retries: one delivery per notification × device (push) and per
-- notification × channel (in-app / e-mail). Push rows whose token was deleted
-- (SET NULL) are excluded so deleting tokens never collides.
CREATE UNIQUE INDEX "notification_deliveries_device_uq"
  ON "notification_deliveries" ("notification_id", "device_token_id")
  WHERE "device_token_id" IS NOT NULL;
CREATE UNIQUE INDEX "notification_deliveries_channel_uq"
  ON "notification_deliveries" ("notification_id", "channel")
  WHERE "device_token_id" IS NULL AND "channel" <> 'push';

-- -----------------------------------------------------------------------------
-- Community (REQUIREMENTS §15)
-- -----------------------------------------------------------------------------
-- Normalized-text hash for duplicate / spam detection (same normalization as
-- search: app_normalize_text).
CREATE OR REPLACE FUNCTION community_content_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
BEGIN
  NEW."content_hash" := encode(sha256(convert_to(
    coalesce(app_normalize_text(concat_ws(' ', j->>'title', j->>'body', j->>'pros', j->>'cons')), ''),
    'UTF8')), 'hex');
  RETURN NEW;
END
$$;
CREATE TRIGGER reviews_content_hash BEFORE INSERT OR UPDATE OF "title", "body", "pros", "cons" ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION community_content_hash();
CREATE TRIGGER comments_content_hash BEFORE INSERT OR UPDATE OF "body" ON "comments"
  FOR EACH ROW EXECUTE FUNCTION community_content_hash();
CREATE TRIGGER questions_content_hash BEFORE INSERT OR UPDATE OF "title", "body" ON "questions"
  FOR EACH ROW EXECUTE FUNCTION community_content_hash();
CREATE TRIGGER answers_content_hash BEFORE INSERT OR UPDATE OF "body" ON "answers"
  FOR EACH ROW EXECUTE FUNCTION community_content_hash();
UPDATE "reviews" SET "body" = "body";
UPDATE "comments" SET "body" = "body";
UPDATE "questions" SET "title" = "title";
UPDATE "answers" SET "body" = "body";

-- Vote counters never go negative.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vote_counts_chk" CHECK ("upvote_count" >= 0 AND "downvote_count" >= 0);
ALTER TABLE "comments" ADD CONSTRAINT "comments_vote_counts_chk" CHECK ("upvote_count" >= 0 AND "downvote_count" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_vote_counts_chk" CHECK ("upvote_count" >= 0 AND "downvote_count" >= 0);
ALTER TABLE "answers" ADD CONSTRAINT "answers_vote_counts_chk" CHECK ("upvote_count" >= 0 AND "downvote_count" >= 0);

-- Verified owner badge = an APPROVED verification of the same user and the
-- same variant. Validated when the link is set; the flag always mirrors the
-- link; an anonymized review (author deleted) loses the badge.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_verified_owner_chk" CHECK (
  "is_verified_owner" = ("owner_verification_id" IS NOT NULL)
);
CREATE OR REPLACE FUNCTION reviews_owner_verification_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v record;
BEGIN
  IF NEW."user_id" IS NULL THEN
    NEW."owner_verification_id" := NULL;
  ELSIF NEW."owner_verification_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."owner_verification_id" IS DISTINCT FROM OLD."owner_verification_id"
          OR NEW."variant_id" IS DISTINCT FROM OLD."variant_id" OR NEW."user_id" IS DISTINCT FROM OLD."user_id") THEN
    SELECT "user_id", "variant_id", "status" INTO v FROM "owner_verifications" WHERE "id" = NEW."owner_verification_id";
    IF NOT FOUND OR v."status" <> 'approved' OR v."user_id" <> NEW."user_id"
       OR NEW."variant_id" IS NULL OR v."variant_id" <> NEW."variant_id" THEN
      RAISE EXCEPTION 'reviews_verified_owner_chk: review % needs an approved owner verification of its author for this variant', NEW."id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'reviews_verified_owner_chk';
    END IF;
  END IF;
  NEW."is_verified_owner" := NEW."owner_verification_id" IS NOT NULL;
  RETURN NEW;
END
$$;
CREATE TRIGGER reviews_owner_verification_check
  BEFORE INSERT OR UPDATE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION reviews_owner_verification_check();

ALTER TABLE "owner_verifications" ADD CONSTRAINT "owner_verifications_review_chk" CHECK (
  "status" NOT IN ('approved', 'rejected', 'revoked') OR "reviewed_at" IS NOT NULL
);
-- At most one open (pending / approved) verification per user × variant.
CREATE UNIQUE INDEX "owner_verifications_active_uq"
  ON "owner_verifications" ("user_id", "variant_id")
  WHERE "status" IN ('pending', 'approved');
-- Owner and variant are fixed; the garage car is the user's own car of that variant.
CREATE OR REPLACE FUNCTION owner_verifications_integrity_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."user_id" <> OLD."user_id" OR NEW."variant_id" <> OLD."variant_id") THEN
    RAISE EXCEPTION 'owner_verifications_immutable_chk: user and variant of a verification cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'owner_verifications_immutable_chk';
  END IF;
  IF NEW."user_vehicle_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "user_vehicles"
    WHERE "id" = NEW."user_vehicle_id" AND "user_id" = NEW."user_id" AND "variant_id" = NEW."variant_id"
  ) THEN
    RAISE EXCEPTION 'owner_verifications_vehicle_chk: the garage car must be the user''s own car of variant %', NEW."variant_id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'owner_verifications_vehicle_chk';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER owner_verifications_integrity_check
  BEFORE INSERT OR UPDATE ON "owner_verifications"
  FOR EACH ROW EXECUTE FUNCTION owner_verifications_integrity_check();
-- Leaving "approved" removes the badge from the reviews it backed.
CREATE OR REPLACE FUNCTION owner_verifications_status_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'approved' THEN
    UPDATE "reviews" SET "owner_verification_id" = NULL WHERE "owner_verification_id" = NEW."id";
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER owner_verifications_status_sync
  AFTER UPDATE OF "status" ON "owner_verifications"
  FOR EACH ROW EXECUTE FUNCTION owner_verifications_status_sync();

-- Rating dimensions: 1..5, car dimensions on variant reviews, station_* on
-- station reviews.
ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_score_chk" CHECK ("score" BETWEEN 1 AND 5);
CREATE OR REPLACE FUNCTION review_ratings_dimension_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_station boolean;
BEGIN
  SELECT "station_id" IS NOT NULL INTO is_station FROM "reviews" WHERE "id" = NEW."review_id";
  IF FOUND AND is_station <> (NEW."dimension"::text LIKE 'station\_%') THEN
    RAISE EXCEPTION 'review_ratings_dimension_chk: dimension % does not apply to this review', NEW."dimension"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'review_ratings_dimension_chk';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER review_ratings_dimension_check
  BEFORE INSERT OR UPDATE ON "review_ratings"
  FOR EACH ROW EXECUTE FUNCTION review_ratings_dimension_check();

-- Comments: exactly one target (article, review, car model, variant); a
-- reply has its parent's target.
ALTER TABLE "comments" DROP CONSTRAINT "comments_target_chk";
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_chk" CHECK (
  num_nonnulls("article_id", "review_id", "model_id", "variant_id") = 1
);
CREATE OR REPLACE FUNCTION comments_thread_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p record;
BEGIN
  IF NEW."parent_id" IS NOT NULL THEN
    SELECT "article_id", "review_id", "model_id", "variant_id" INTO p FROM "comments" WHERE "id" = NEW."parent_id";
    IF FOUND AND (p."article_id" IS DISTINCT FROM NEW."article_id" OR p."review_id" IS DISTINCT FROM NEW."review_id"
        OR p."model_id" IS DISTINCT FROM NEW."model_id" OR p."variant_id" IS DISTINCT FROM NEW."variant_id") THEN
      RAISE EXCEPTION 'comments_thread_chk: reply % must have the same target as its parent %', NEW."id", NEW."parent_id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'comments_thread_chk';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER comments_thread_check
  BEFORE INSERT OR UPDATE OF "parent_id", "article_id", "review_id", "model_id", "variant_id" ON "comments"
  FOR EACH ROW EXECUTE FUNCTION comments_thread_check();

-- The accepted answer is an answer of the question.
CREATE OR REPLACE FUNCTION questions_accepted_answer_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."accepted_answer_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "answers" WHERE "id" = NEW."accepted_answer_id" AND "question_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'questions_accepted_answer_chk: answer % does not belong to question %', NEW."accepted_answer_id", NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'questions_accepted_answer_chk';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER questions_accepted_answer_check
  BEFORE INSERT OR UPDATE OF "accepted_answer_id" ON "questions"
  FOR EACH ROW EXECUTE FUNCTION questions_accepted_answer_check();

-- Votes: +1 / -1, exactly one target matching target_type; counters on the
-- target maintained here.
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_value_chk" CHECK ("value" IN (-1, 1));
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_target_chk" CHECK (
  num_nonnulls("review_id", "comment_id", "question_id", "answer_id") = 1
  AND CASE "target_type"
    WHEN 'review' THEN "review_id" IS NOT NULL
    WHEN 'comment' THEN "comment_id" IS NOT NULL
    WHEN 'question' THEN "question_id" IS NOT NULL
    WHEN 'answer' THEN "answer_id" IS NOT NULL
  END
);
CREATE OR REPLACE FUNCTION community_votes_apply(v community_votes, sign integer)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  up integer := CASE WHEN v."value" = 1 THEN sign ELSE 0 END;
  down integer := CASE WHEN v."value" = -1 THEN sign ELSE 0 END;
BEGIN
  IF v."review_id" IS NOT NULL THEN
    UPDATE "reviews" SET "upvote_count" = "upvote_count" + up, "downvote_count" = "downvote_count" + down WHERE "id" = v."review_id";
  ELSIF v."comment_id" IS NOT NULL THEN
    UPDATE "comments" SET "upvote_count" = "upvote_count" + up, "downvote_count" = "downvote_count" + down WHERE "id" = v."comment_id";
  ELSIF v."question_id" IS NOT NULL THEN
    UPDATE "questions" SET "upvote_count" = "upvote_count" + up, "downvote_count" = "downvote_count" + down WHERE "id" = v."question_id";
  ELSIF v."answer_id" IS NOT NULL THEN
    UPDATE "answers" SET "upvote_count" = "upvote_count" + up, "downvote_count" = "downvote_count" + down WHERE "id" = v."answer_id";
  END IF;
END
$$;
CREATE OR REPLACE FUNCTION community_votes_counts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM community_votes_apply(OLD, -1);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM community_votes_apply(NEW, 1);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER community_votes_counts
  AFTER INSERT OR UPDATE OR DELETE ON "community_votes"
  FOR EACH ROW EXECUTE FUNCTION community_votes_counts();

-- One open report per reporter × target.
CREATE UNIQUE INDEX "content_reports_one_open_uq"
  ON "content_reports" ("reporter_id", "target_type", "target_id")
  WHERE "reporter_id" IS NOT NULL AND "status" IN ('open', 'in_review');

ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_scope_chk" CHECK ("scope" IN ('community', 'all'));
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_expiry_chk" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at");
CREATE UNIQUE INDEX "user_blocks_one_active_uq"
  ON "user_blocks" ("user_id", "scope") WHERE "revoked_at" IS NULL;
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_self_chk" CHECK ("user_id" <> "muted_user_id");

ALTER TABLE "spam_signals" ADD CONSTRAINT "spam_signals_score_chk" CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "spam_signals" ADD CONSTRAINT "spam_signals_target_chk" CHECK (("target_type" IS NULL) = ("target_id" IS NULL));
ALTER TABLE "spam_signals" ADD CONSTRAINT "spam_signals_hashes_chk" CHECK (
  ("content_hash" IS NULL OR "content_hash" ~ '^[0-9a-f]{64}$')
  AND ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "spam_signals" ADD CONSTRAINT "spam_signals_details_chk" CHECK (jsonb_typeof("details") = 'object');

-- Deleting an account also drops the IP hashes linked to it (the rows stay,
-- anonymized, through ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION users_delete_scrub()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "spam_signals" SET "ip_hash" = NULL WHERE "user_id" = OLD."id" AND "ip_hash" IS NOT NULL;
  UPDATE "station_reports" SET "reporter_ip_hash" = NULL WHERE "user_id" = OLD."id" AND "reporter_ip_hash" IS NOT NULL;
  RETURN OLD;
END
$$;
CREATE TRIGGER users_delete_scrub
  BEFORE DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_delete_scrub();

-- Report reason labels only exist for real enum values of their scope.
ALTER TABLE "report_reasons" ADD CONSTRAINT "report_reasons_code_chk" CHECK (
  ("scope" = 'station' AND "code" = ANY (enum_range(NULL::station_report_type)::text[]))
  OR ("scope" = 'content' AND "code" = ANY (enum_range(NULL::content_report_reason)::text[]))
);
ALTER TABLE "report_reasons" ADD CONSTRAINT "report_reasons_labels_chk" CHECK (
  nullif(btrim("label_ar"), '') IS NOT NULL AND nullif(btrim("label_en"), '') IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- Directory, encyclopedia, ads (REQUIREMENTS §15–16)
-- -----------------------------------------------------------------------------
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_opening_hours_chk" CHECK (
  app_valid_opening_hours("opening_hours")
  AND NOT ("is_always_open" IS TRUE AND "opening_hours" IS NOT NULL)
);
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_website_chk" CHECK (
  "website_url" IS NULL OR "website_url" ~* '^https?://'
);
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_sponsored_until_chk" CHECK (
  "sponsored_until" IS NULL OR "is_sponsored"
);
ALTER TABLE "encyclopedia_categories" ADD CONSTRAINT "encyclopedia_categories_key_chk" CHECK (
  "key" ~ '^[a-z][a-z0-9_]{1,63}$'
);
ALTER TABLE "encyclopedia_categories" ADD CONSTRAINT "encyclopedia_categories_names_chk" CHECK (
  nullif(btrim("name_ar"), '') IS NOT NULL AND nullif(btrim("name_en"), '') IS NOT NULL
);
ALTER TABLE "encyclopedia_entry_translations" ADD CONSTRAINT "encyclopedia_entry_translations_locale_chk" CHECK (
  "locale" IN ('ar', 'en')
);
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_counts_chk" CHECK ("impressions" >= 0 AND "clicks" >= 0);
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_disclosure_chk" CHECK (
  nullif(btrim("disclosure_label_ar"), '') IS NOT NULL AND nullif(btrim("disclosure_label_en"), '') IS NOT NULL
);
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_markets_chk" CHECK (
  "target_markets" IS NOT NULL
  AND array_position("target_markets", NULL) IS NULL
  AND array_to_string("target_markets", ',') ~ '^([A-Z]{2,8}(,|$))*$'
);
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_locale_chk" CHECK ("locale" IS NULL OR "locale" IN ('ar', 'en'));

-- -----------------------------------------------------------------------------
-- Analytics: directory entries have daily counters too.
-- -----------------------------------------------------------------------------
ALTER TABLE "content_daily_stats" DROP CONSTRAINT "content_daily_stats_entity_type_chk";
ALTER TABLE "content_daily_stats" ADD CONSTRAINT "content_daily_stats_entity_type_chk" CHECK (
  "entity_type" IN ('article', 'brand', 'model', 'variant', 'comparison', 'tour', 'station', 'encyclopedia', 'service_provider')
);
