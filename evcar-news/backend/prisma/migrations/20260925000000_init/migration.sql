-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('pending', 'approved', 'rejected', 'hidden');

-- CreateEnum
CREATE TYPE "community_target_type" AS ENUM ('article', 'review', 'comment', 'question', 'answer', 'station_report', 'station_checkin', 'user');

-- CreateEnum
CREATE TYPE "content_report_reason" AS ENUM ('spam', 'abuse', 'off_topic', 'misinformation', 'personal_data', 'copyright', 'other');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('approve', 'reject', 'hide', 'restore', 'delete', 'warn_user', 'block_user', 'unblock_user');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('draft', 'in_review', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "article_type" AS ENUM ('news', 'review', 'test_drive', 'buying_guide', 'explainer', 'opinion');

-- CreateEnum
CREATE TYPE "rss_item_status" AS ENUM ('new', 'drafted', 'ignored', 'duplicate', 'failed');

-- CreateEnum
CREATE TYPE "rss_usage_policy" AS ENUM ('headline_link_only', 'summary_with_link', 'full_content_licensed');

-- CreateEnum
CREATE TYPE "service_provider_type" AS ENUM ('service_center', 'dealer', 'charger_installer', 'roadside_assistance', 'battery_service', 'other');

-- CreateEnum
CREATE TYPE "ad_campaign_status" AS ENUM ('draft', 'active', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "ad_surface" AS ENUM ('home', 'article_list', 'article_detail', 'car_list', 'car_detail', 'station_list', 'other');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "email_token_purpose" AS ENUM ('verify_email', 'reset_password', 'setup_password', 'change_email');

-- CreateEnum
CREATE TYPE "oauth_provider" AS ENUM ('google', 'apple');

-- CreateEnum
CREATE TYPE "client_type" AS ENUM ('web', 'mobile', 'cli');

-- CreateEnum
CREATE TYPE "theme_preference" AS ENUM ('system', 'light', 'dark');

-- CreateEnum
CREATE TYPE "unit_system" AS ENUM ('metric', 'imperial');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('image', 'panorama', 'video', 'document', 'model_3d', 'other');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'rejected');

-- CreateEnum
CREATE TYPE "media_projection" AS ENUM ('flat', 'equirectangular', 'cubemap');

-- CreateEnum
CREATE TYPE "storage_driver" AS ENUM ('local', 's3');

-- CreateEnum
CREATE TYPE "asset_variant_kind" AS ENUM ('thumbnail', 'preview', 'rendition', 'tile', 'cubemap_face', 'multires_config', 'poster');

-- CreateEnum
CREATE TYPE "upload_session_status" AS ENUM ('active', 'completed', 'aborted', 'expired');

-- CreateEnum
CREATE TYPE "license_type" AS ENUM ('owned', 'commissioned', 'press_kit', 'licensed', 'cc0', 'cc_by', 'cc_by_sa', 'permission', 'other');

-- CreateEnum
CREATE TYPE "tour_match_type" AS ENUM ('exact', 'reference_similar_trim');

-- CreateEnum
CREATE TYPE "scene_position" AS ENUM ('driver_seat', 'front_passenger', 'rear_seats', 'third_row', 'cargo', 'other');

-- CreateEnum
CREATE TYPE "hotspot_type" AS ENUM ('info', 'scene', 'image', 'video', 'spec');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'push', 'email');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('android', 'ios', 'web');

-- CreateEnum
CREATE TYPE "push_provider" AS ENUM ('fcm', 'apns');

-- CreateEnum
CREATE TYPE "notification_topic_type" AS ENUM ('brand', 'model', 'variant', 'market', 'category', 'station', 'price_alert');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

-- CreateEnum
CREATE TYPE "favorite_target_type" AS ENUM ('article', 'model', 'variant', 'station', 'comparison', 'tour');

-- CreateEnum
CREATE TYPE "charging_location_type" AS ENUM ('home', 'public', 'work', 'other');

-- CreateEnum
CREATE TYPE "reminder_type" AS ENUM ('maintenance', 'insurance', 'registration', 'tyres', 'other');

-- CreateEnum
CREATE TYPE "drive_side" AS ENUM ('lhd', 'rhd');

-- CreateEnum
CREATE TYPE "energy_type" AS ENUM ('electricity_residential', 'electricity_commercial', 'electricity_public_ac', 'electricity_public_dc', 'gasoline_80', 'gasoline_92', 'gasoline_95', 'diesel');

-- CreateEnum
CREATE TYPE "energy_price_unit" AS ENUM ('per_kwh', 'per_liter');

-- CreateEnum
CREATE TYPE "station_operational_status" AS ENUM ('operational', 'planned', 'temporarily_unavailable', 'permanently_closed', 'unknown');

-- CreateEnum
CREATE TYPE "station_publication_status" AS ENUM ('draft', 'pending_review', 'published', 'hidden', 'rejected');

-- CreateEnum
CREATE TYPE "station_access_type" AS ENUM ('public', 'customers_only', 'restricted', 'private', 'unknown');

-- CreateEnum
CREATE TYPE "station_data_source" AS ENUM ('manual', 'ocm', 'csv', 'partner', 'user_suggestion');

-- CreateEnum
CREATE TYPE "connector_format" AS ENUM ('socket', 'cable');

-- CreateEnum
CREATE TYPE "availability_status" AS ENUM ('available', 'charging', 'reserved', 'blocked', 'out_of_order', 'inoperative', 'unknown');

-- CreateEnum
CREATE TYPE "tariff_component_type" AS ENUM ('energy', 'time', 'flat', 'parking_time', 'idle');

-- CreateEnum
CREATE TYPE "tariff_price_unit" AS ENUM ('per_kwh', 'per_minute', 'per_hour', 'per_session');

-- CreateEnum
CREATE TYPE "station_report_type" AS ENUM ('not_working', 'wrong_location', 'connector_mismatch', 'price_changed', 'access_restricted', 'other');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'in_review', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "checkin_outcome" AS ENUM ('charged_successfully', 'waited_then_charged', 'could_not_charge', 'other');

-- CreateEnum
CREATE TYPE "import_job_status" AS ENUM ('pending', 'validating', 'ready', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "import_row_status" AS ENUM ('pending', 'valid', 'invalid', 'imported', 'updated', 'skipped', 'duplicate', 'failed');

-- CreateEnum
CREATE TYPE "search_entity_type" AS ENUM ('article', 'brand', 'model', 'variant', 'station', 'encyclopedia', 'tour', 'service_provider');

-- CreateEnum
CREATE TYPE "powertrain_type" AS ENUM ('BEV', 'PHEV', 'EREV', 'HEV');

-- CreateEnum
CREATE TYPE "body_type" AS ENUM ('sedan', 'hatchback', 'suv', 'crossover', 'coupe', 'convertible', 'wagon', 'pickup', 'van', 'mpv', 'other');

-- CreateEnum
CREATE TYPE "drive_type" AS ENUM ('fwd', 'rwd', 'awd');

-- CreateEnum
CREATE TYPE "reliability" AS ENUM ('verified', 'manufacturer_claim', 'estimated', 'unverified', 'disputed');

-- CreateEnum
CREATE TYPE "range_cycle" AS ENUM ('WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER');

-- CreateEnum
CREATE TYPE "range_type" AS ENUM ('electric', 'total');

-- CreateEnum
CREATE TYPE "price_type" AS ENUM ('official_msrp', 'dealer', 'market_estimate');

-- CreateEnum
CREATE TYPE "spec_data_type" AS ENUM ('number', 'text', 'boolean');

-- CreateEnum
CREATE TYPE "better_direction" AS ENUM ('higher', 'lower', 'none');

-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('manufacturer', 'official_document', 'press_release', 'homologation', 'independent_test', 'dealer', 'media_review', 'third_party_database', 'user_submitted', 'other');

-- CreateEnum
CREATE TYPE "market_availability" AS ENUM ('available', 'coming_soon', 'discontinued', 'not_available', 'unknown');

-- CreateEnum
CREATE TYPE "current_type" AS ENUM ('AC', 'DC');

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "variant_id" UUID,
    "station_id" UUID,
    "rating" SMALLINT NOT NULL,
    "title" VARCHAR(200),
    "body" TEXT NOT NULL,
    "pros" TEXT,
    "cons" TEXT,
    "ownership_months" INTEGER,
    "locale" VARCHAR(10) NOT NULL,
    "market_code" VARCHAR(8),
    "is_verified_owner" BOOLEAN NOT NULL DEFAULT false,
    "owner_verified_at" TIMESTAMPTZ(3),
    "owner_verification_method" VARCHAR(64),
    "status" "moderation_status" NOT NULL DEFAULT 'pending',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "article_id" UUID,
    "review_id" UUID,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "locale" VARCHAR(10),
    "status" "moderation_status" NOT NULL DEFAULT 'pending',
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "model_id" UUID,
    "variant_id" UUID,
    "station_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT,
    "locale" VARCHAR(10) NOT NULL,
    "market_code" VARCHAR(8),
    "status" "moderation_status" NOT NULL DEFAULT 'pending',
    "accepted_answer_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "user_id" UUID,
    "body" TEXT NOT NULL,
    "status" "moderation_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID,
    "target_type" "community_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" "content_report_reason" NOT NULL,
    "details" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "handled_by_id" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "moderator_id" UUID,
    "target_type" "community_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "action" "moderation_action_type" NOT NULL,
    "reason" TEXT,
    "report_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "blocked_by_id" UUID,
    "scope" VARCHAR(32) NOT NULL DEFAULT 'community',
    "reason" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_translations" (
    "id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tag_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "type" "article_type" NOT NULL DEFAULT 'news',
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "category_id" UUID,
    "author_id" UUID,
    "author_name" VARCHAR(200),
    "cover_asset_id" UUID,
    "original_language" VARCHAR(10) NOT NULL DEFAULT 'ar',
    "event_date" DATE,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "scheduled_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "source_name" VARCHAR(200),
    "source_url" VARCHAR(2048),
    "rss_item_id" UUID,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_sponsored" BOOLEAN NOT NULL DEFAULT false,
    "sponsor_name" VARCHAR(200),
    "allow_comments" BOOLEAN NOT NULL DEFAULT true,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_markets" (
    "article_id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,

    CONSTRAINT "article_markets_pkey" PRIMARY KEY ("article_id","market_code")
);

-- CreateTable
CREATE TABLE "article_translations" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" TEXT,
    "body_html" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT,
    "seo_title" VARCHAR(300),
    "seo_description" VARCHAR(500),
    "is_machine_translated" BOOLEAN NOT NULL DEFAULT false,
    "human_reviewed_at" TIMESTAMPTZ(3),
    "human_reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "article_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_revisions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "content_status" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_tags" (
    "article_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id","tag_id")
);

-- CreateTable
CREATE TABLE "article_vehicle_links" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "brand_id" UUID,
    "model_id" UUID,
    "variant_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_vehicle_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rss_feeds" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "site_url" VARCHAR(2048),
    "language" VARCHAR(10),
    "market_code" VARCHAR(8),
    "default_category_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "fetch_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "usage_policy" "rss_usage_policy" NOT NULL DEFAULT 'headline_link_only',
    "license_notes" TEXT,
    "etag" VARCHAR(512),
    "last_modified" VARCHAR(128),
    "last_fetched_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rss_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rss_items" (
    "id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "guid" VARCHAR(2048),
    "guid_hash" CHAR(64),
    "url" VARCHAR(2048) NOT NULL,
    "url_hash" CHAR(64) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "summary" TEXT,
    "author" VARCHAR(200),
    "image_url" VARCHAR(2048),
    "published_at" TIMESTAMPTZ(3),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "rss_item_status" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rss_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "type" "service_provider_type" NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "description_en" TEXT,
    "description_ar" TEXT,
    "market_code" VARCHAR(8) NOT NULL,
    "city" VARCHAR(120),
    "address_en" VARCHAR(500),
    "address_ar" VARCHAR(500),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location" geography(Point,4326),
    "phone" VARCHAR(50),
    "whatsapp" VARCHAR(50),
    "email" VARCHAR(320),
    "website_url" VARCHAR(2048),
    "opening_hours" JSONB,
    "contact_verified_at" TIMESTAMPTZ(3),
    "contact_verified_by_id" UUID,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "is_sponsored" BOOLEAN NOT NULL DEFAULT false,
    "sponsor_label" VARCHAR(100),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_provider_brands" (
    "provider_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,

    CONSTRAINT "service_provider_brands_pkey" PRIMARY KEY ("provider_id","brand_id")
);

-- CreateTable
CREATE TABLE "encyclopedia_entries" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "topic" VARCHAR(64) NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "technical_reviewed_by_id" UUID,
    "technical_reviewed_at" TIMESTAMPTZ(3),
    "cover_asset_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "encyclopedia_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encyclopedia_entry_translations" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" TEXT,
    "body_html" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "encyclopedia_entry_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "surface" "ad_surface" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_creatives" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "advertiser_name" VARCHAR(200) NOT NULL,
    "status" "ad_campaign_status" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "disclosure_label_en" VARCHAR(50) NOT NULL DEFAULT 'Sponsored',
    "disclosure_label_ar" VARCHAR(50) NOT NULL DEFAULT 'إعلان',
    "target_markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creatives" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "asset_id" UUID,
    "headline" VARCHAR(200),
    "body" VARCHAR(500),
    "target_url" VARCHAR(2048) NOT NULL,
    "locale" VARCHAR(10),
    "weight" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT,
    "display_name" VARCHAR(100) NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'ar',
    "status" "user_status" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "group" VARCHAR(64) NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "previous_refresh_token_hash" CHAR(64),
    "client_type" "client_type" NOT NULL DEFAULT 'mobile',
    "device_name" VARCHAR(200),
    "user_agent" VARCHAR(512),
    "ip" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_rotated_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(100),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "preferred_language" VARCHAR(10),
    "preferred_market_code" VARCHAR(8),
    "theme" "theme_preference" NOT NULL DEFAULT 'system',
    "unit_system" "unit_system" NOT NULL DEFAULT 'metric',
    "font_scale" DECIMAL(3,2),
    "interests" JSONB NOT NULL DEFAULT '{}',
    "location_consent_at" TIMESTAMPTZ(3),
    "analytics_consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "email_token_purpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "email" VARCHAR(320),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "requested_ip" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "oauth_provider" NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "kind" "media_kind" NOT NULL,
    "status" "media_status" NOT NULL DEFAULT 'uploading',
    "storage_driver" "storage_driver" NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "bucket" VARCHAR(255),
    "original_filename" VARCHAR(255),
    "mime_type" VARCHAR(100),
    "size_bytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" DECIMAL(10,2),
    "checksum_sha256" CHAR(64),
    "projection" "media_projection",
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "processing_progress" SMALLINT NOT NULL DEFAULT 0,
    "processing_error" TEXT,
    "processed_at" TIMESTAMPTZ(3),
    "license_id" UUID,
    "alt_text_en" VARCHAR(500),
    "alt_text_ar" VARCHAR(500),
    "caption_en" VARCHAR(1000),
    "caption_ar" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "uploaded_by_id" UUID,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_licenses" (
    "id" UUID NOT NULL,
    "license_type" "license_type" NOT NULL,
    "rights_holder" VARCHAR(300) NOT NULL,
    "attribution_text" TEXT,
    "attribution_required" BOOLEAN NOT NULL DEFAULT false,
    "license_url" VARCHAR(2048),
    "source_url" VARCHAR(2048),
    "permitted_uses" TEXT,
    "restrictions" TEXT,
    "valid_from" DATE,
    "valid_until" DATE,
    "proof_asset_id" UUID,
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_variants" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "kind" "asset_variant_kind" NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "mime_type" VARCHAR(100),
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" BIGINT,
    "level" SMALLINT,
    "face" VARCHAR(1),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "kind" "media_kind" NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "declared_mime_type" VARCHAR(100),
    "total_bytes" BIGINT NOT NULL,
    "received_bytes" BIGINT NOT NULL DEFAULT 0,
    "chunk_size_bytes" INTEGER,
    "expected_sha256" CHAR(64),
    "temp_key" VARCHAR(1024) NOT NULL,
    "status" "upload_session_status" NOT NULL DEFAULT 'active',
    "asset_id" UUID,
    "error" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interior_tours" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "drive_side" "drive_side" NOT NULL,
    "interior_color_name_en" VARCHAR(100) NOT NULL,
    "interior_color_name_ar" VARCHAR(100) NOT NULL,
    "interior_color_hex" CHAR(7),
    "title_en" VARCHAR(200),
    "title_ar" VARCHAR(200),
    "description_en" TEXT,
    "description_ar" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "match_type" "tour_match_type" NOT NULL DEFAULT 'exact',
    "reference_variant_id" UUID,
    "difference_note_en" TEXT,
    "difference_note_ar" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "initial_scene_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "interior_tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_scenes" (
    "id" UUID NOT NULL,
    "tour_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "position" "scene_position" NOT NULL DEFAULT 'other',
    "title_en" VARCHAR(200),
    "title_ar" VARCHAR(200),
    "asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "initial_yaw" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "initial_pitch" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "initial_hfov" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "min_hfov" DECIMAL(6,2),
    "max_hfov" DECIMAL(6,2),
    "north_offset" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tour_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scene_hotspots" (
    "id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "type" "hotspot_type" NOT NULL,
    "yaw" DECIMAL(6,2) NOT NULL,
    "pitch" DECIMAL(6,2) NOT NULL,
    "target_scene_id" UUID,
    "target_yaw" DECIMAL(6,2),
    "target_pitch" DECIMAL(6,2),
    "media_asset_id" UUID,
    "spec_key" VARCHAR(100),
    "icon_key" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scene_hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scene_hotspot_translations" (
    "id" UUID NOT NULL,
    "hotspot_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scene_hotspot_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exterior_spins" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8),
    "color_name_en" VARCHAR(100),
    "color_name_ar" VARCHAR(100),
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "exterior_spins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exterior_spin_frames" (
    "id" UUID NOT NULL,
    "spin_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "frame_index" INTEGER NOT NULL,

    CONSTRAINT "exterior_spin_frames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "news_enabled" BOOLEAN NOT NULL DEFAULT true,
    "price_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "community_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" VARCHAR(5),
    "quiet_hours_end" VARCHAR(5),
    "timezone" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "topic_type" "notification_topic_type" NOT NULL,
    "brand_id" UUID,
    "model_id" UUID,
    "variant_id" UUID,
    "market_code" VARCHAR(8),
    "category_id" UUID,
    "station_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT,
    "locale" VARCHAR(10) NOT NULL,
    "deep_link" VARCHAR(1024),
    "data" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" VARCHAR(200),
    "campaign_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "token" VARCHAR(1024) NOT NULL,
    "platform" "device_platform" NOT NULL,
    "provider" "push_provider" NOT NULL,
    "app_version" VARCHAR(32),
    "locale" VARCHAR(10),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "device_token_id" UUID,
    "status" "delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "provider_message_id" VARCHAR(255),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "title_en" VARCHAR(300),
    "title_ar" VARCHAR(300),
    "body_en" TEXT,
    "body_ar" TEXT,
    "deep_link" VARCHAR(1024),
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" "campaign_status" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" "favorite_target_type" NOT NULL,
    "article_id" UUID,
    "model_id" UUID,
    "variant_id" UUID,
    "station_id" UUID,
    "comparison_id" UUID,
    "tour_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "share_id" VARCHAR(24) NOT NULL,
    "title" VARCHAR(200),
    "market_code" VARCHAR(8) NOT NULL,
    "is_curated" BOOLEAN NOT NULL DEFAULT false,
    "curated_status" "content_status",
    "curated_order" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_items" (
    "id" UUID NOT NULL,
    "comparison_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparison_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vehicles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "nickname" VARCHAR(100),
    "purchase_date" DATE,
    "initial_odometer_km" DECIMAL(10,1),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_vehicle_id" UUID NOT NULL,
    "station_id" UUID,
    "charged_at" TIMESTAMPTZ(3) NOT NULL,
    "energy_kwh" DECIMAL(8,3) NOT NULL,
    "cost" DECIMAL(12,2),
    "currency_code" CHAR(3),
    "odometer_km" DECIMAL(10,1),
    "soc_start" DECIMAL(5,2),
    "soc_end" DECIMAL(5,2),
    "duration_minutes" DECIMAL(8,2),
    "charger_power_kw" DECIMAL(8,2),
    "location_type" "charging_location_type" NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charging_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_vehicle_id" UUID,
    "type" "reminder_type" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "due_date" DATE,
    "due_odometer_km" DECIMAL(10,1),
    "repeat_interval_months" INTEGER,
    "notify_days_before" INTEGER NOT NULL DEFAULT 7,
    "last_notified_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_vehicle_id" UUID,
    "variant_id" UUID,
    "title" VARCHAR(200),
    "origin_label" VARCHAR(300) NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lng" DOUBLE PRECISION NOT NULL,
    "destination_label" VARCHAR(300) NOT NULL,
    "destination_lat" DOUBLE PRECISION NOT NULL,
    "destination_lng" DOUBLE PRECISION NOT NULL,
    "start_soc_percent" DECIMAL(5,2) NOT NULL,
    "min_arrival_soc_percent" DECIMAL(5,2) NOT NULL,
    "assumptions" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "routing_provider" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trip_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "symbol_ar" VARCHAR(16),
    "symbol_en" VARCHAR(16),
    "decimals" SMALLINT NOT NULL DEFAULT 2,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "markets" (
    "code" VARCHAR(8) NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "default_language" VARCHAR(10) NOT NULL DEFAULT 'ar',
    "unit_system" "unit_system" NOT NULL DEFAULT 'metric',
    "drive_side" "drive_side" NOT NULL DEFAULT 'lhd',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL,
    "namespace" VARCHAR(64) NOT NULL,
    "key" VARCHAR(191) NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_checked_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "last_error_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "quote_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "source_name" VARCHAR(200),
    "source_url" VARCHAR(2048),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_prices" (
    "id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "energy_type" "energy_type" NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "unit" "energy_price_unit" NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "energy_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_operators" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200),
    "website_url" VARCHAR(2048),
    "phone" VARCHAR(50),
    "email" VARCHAR(320),
    "logo_asset_id" UUID,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charging_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_stations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(200),
    "name" VARCHAR(300) NOT NULL,
    "name_ar" VARCHAR(300),
    "name_en" VARCHAR(300),
    "operator_id" UUID,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "address_line" VARCHAR(500),
    "address_ar" VARCHAR(500),
    "address_en" VARCHAR(500),
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "postal_code" VARCHAR(20),
    "country_code" CHAR(2) NOT NULL,
    "market_code" VARCHAR(8),
    "access_entrance_note" TEXT,
    "access_type" "station_access_type" NOT NULL DEFAULT 'unknown',
    "access_restrictions" TEXT,
    "opening_hours" JSONB,
    "is_always_open" BOOLEAN,
    "timezone" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(320),
    "website_url" VARCHAR(2048),
    "payment_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "start_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "operational_status" "station_operational_status" NOT NULL DEFAULT 'unknown',
    "publication_status" "station_publication_status" NOT NULL DEFAULT 'draft',
    "data_source" "station_data_source" NOT NULL DEFAULT 'manual',
    "data_license" VARCHAR(200),
    "attribution" TEXT,
    "last_verified_at" TIMESTAMPTZ(3),
    "source_updated_at" TIMESTAMPTZ(3),
    "search_text" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "charging_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_points" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "evse_id" VARCHAR(64),
    "label" VARCHAR(64),
    "physical_reference" VARCHAR(64),
    "floor_level" VARCHAR(16),
    "parking_restrictions" TEXT,
    "operational_status" "station_operational_status" NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charging_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_types" (
    "code" VARCHAR(32) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "supports_ac" BOOLEAN NOT NULL,
    "supports_dc" BOOLEAN NOT NULL,
    "typical_max_ac_kw" DECIMAL(8,2),
    "typical_max_dc_kw" DECIMAL(8,2),
    "standard" VARCHAR(200),
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icon_key" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "connector_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "connectors" (
    "id" UUID NOT NULL,
    "charging_point_id" UUID NOT NULL,
    "connector_type_code" VARCHAR(32) NOT NULL,
    "format" "connector_format",
    "current_type" "current_type" NOT NULL,
    "max_power_kw" DECIMAL(8,2),
    "max_voltage" INTEGER,
    "max_amperage" INTEGER,
    "phases" SMALLINT,
    "operational_status" "station_operational_status" NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariffs" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "charging_point_id" UUID,
    "connector_id" UUID,
    "name" VARCHAR(200),
    "currency_code" CHAR(3) NOT NULL,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "tax_included" BOOLEAN,
    "tax_percent" DECIMAL(5,2),
    "notes" TEXT,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_elements" (
    "id" UUID NOT NULL,
    "tariff_id" UUID NOT NULL,
    "component_type" "tariff_component_type" NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "price_unit" "tariff_price_unit" NOT NULL,
    "step_size" INTEGER,
    "grace_minutes" INTEGER,
    "min_power_kw" DECIMAL(8,2),
    "max_power_kw" DECIMAL(8,2),
    "current_type" "current_type",
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tariff_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_records" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(200) NOT NULL,
    "entity_type" VARCHAR(32) NOT NULL DEFAULT 'station',
    "station_id" UUID,
    "operator_id" UUID,
    "payload" JSONB,
    "payload_hash" CHAR(64),
    "data_license" VARCHAR(200),
    "attribution" TEXT,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMPTZ(3),
    "removed_at_source_at" TIMESTAMPTZ(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_observations" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "station_id" UUID NOT NULL,
    "charging_point_id" UUID,
    "connector_id" UUID,
    "status" "availability_status" NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "raw_payload" JSONB,

    CONSTRAINT "availability_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_reports" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "connector_id" UUID,
    "user_id" UUID,
    "type" "station_report_type" NOT NULL,
    "description" TEXT,
    "suggested_data" JSONB,
    "photo_asset_id" UUID,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "reporter_ip_hash" CHAR(64),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "station_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_checkins" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "user_id" UUID,
    "connector_id" UUID,
    "outcome" "checkin_outcome" NOT NULL,
    "observed_power_kw" DECIMAL(8,2),
    "comment" TEXT,
    "status" "moderation_status" NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_media" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "caption" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_label" VARCHAR(320),
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "diff" JSONB,
    "ip" INET,
    "user_agent" VARCHAR(512),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "status" "import_job_status" NOT NULL DEFAULT 'pending',
    "source" VARCHAR(500),
    "file_asset_id" UUID,
    "options" JSONB NOT NULL DEFAULT '{}',
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job_rows" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" "import_row_status" NOT NULL DEFAULT 'pending',
    "data" JSONB NOT NULL,
    "errors" JSONB,
    "entity_type" VARCHAR(64),
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_job_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_documents" (
    "id" UUID NOT NULL,
    "entity_type" "search_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "market_code" VARCHAR(8),
    "title" VARCHAR(500) NOT NULL,
    "subtitle" VARCHAR(500),
    "body" TEXT,
    "keywords" TEXT,
    "slug" VARCHAR(200),
    "image_url" VARCHAR(2048),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "boost" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(3),
    "normalized_title" TEXT,
    "normalized_text" TEXT,
    "search_vector" tsvector,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_aliases" (
    "id" UUID NOT NULL,
    "term" VARCHAR(200) NOT NULL,
    "canonical" VARCHAR(200) NOT NULL,
    "term_normalized" VARCHAR(200),
    "canonical_normalized" VARCHAR(200),
    "locale" VARCHAR(10),
    "entity_type" "search_entity_type",
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_daily_stats" (
    "id" UUID NOT NULL,
    "entity_type" VARCHAR(32) NOT NULL,
    "entity_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "comparisons" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "country_code" CHAR(2),
    "website_url" VARCHAR(2048),
    "logo_asset_id" UUID,
    "description_en" TEXT,
    "description_ar" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_models" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "body_type" "body_type",
    "segment" VARCHAR(32),
    "description_en" TEXT,
    "description_ar" TEXT,
    "hero_asset_id" UUID,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "car_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "code" VARCHAR(32),
    "start_year" INTEGER,
    "end_year" INTEGER,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_years" (
    "id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "model_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_variants" (
    "id" UUID NOT NULL,
    "model_year_id" UUID NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(160) NOT NULL,
    "name_ar" VARCHAR(160) NOT NULL,
    "trim_code" VARCHAR(64),
    "powertrain_type" "powertrain_type" NOT NULL,
    "body_type" "body_type",
    "drive_type" "drive_type",
    "seats" SMALLINT,
    "doors" SMALLINT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_markets" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "availability" "market_availability" NOT NULL DEFAULT 'unknown',
    "local_name_en" VARCHAR(200),
    "local_name_ar" VARCHAR(200),
    "drive_side" "drive_side",
    "launch_date" DATE,
    "discontinued_at" DATE,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "variant_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_definitions" (
    "key" VARCHAR(100) NOT NULL,
    "group" VARCHAR(50) NOT NULL,
    "data_type" "spec_data_type" NOT NULL,
    "unit" VARCHAR(20),
    "better_direction" "better_direction" NOT NULL DEFAULT 'none',
    "label_en" VARCHAR(200) NOT NULL,
    "label_ar" VARCHAR(200) NOT NULL,
    "description_en" TEXT,
    "description_ar" TEXT,
    "is_key_spec" BOOLEAN NOT NULL DEFAULT false,
    "is_comparable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_definitions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "specification_sources" (
    "id" UUID NOT NULL,
    "type" "source_type" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "publisher" VARCHAR(200),
    "url" VARCHAR(2048),
    "document_date" DATE,
    "accessed_at" TIMESTAMPTZ(3),
    "market_code" VARCHAR(8),
    "language" VARCHAR(10),
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "specification_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_specifications" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "spec_key" VARCHAR(100) NOT NULL,
    "value_num" DECIMAL(18,6),
    "value_text" TEXT,
    "value_bool" BOOLEAN,
    "unit" VARCHAR(20),
    "original_value" VARCHAR(200),
    "original_unit" VARCHAR(20),
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "notes" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "range_measurements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8),
    "cycle" "range_cycle" NOT NULL,
    "cycle_note" VARCHAR(100),
    "range_type" "range_type" NOT NULL,
    "value_km" DECIMAL(8,1) NOT NULL,
    "original_value" VARCHAR(50),
    "original_unit" VARCHAR(20),
    "wheel_size_inch" DECIMAL(4,1),
    "conditions" TEXT,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "range_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_curves" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "current_type" "current_type" NOT NULL DEFAULT 'DC',
    "label" VARCHAR(200),
    "charger_max_power_kw" DECIMAL(8,2),
    "battery_temp_c" DECIMAL(5,1),
    "preconditioned" BOOLEAN,
    "conditions" TEXT,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charging_curves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_curve_points" (
    "id" UUID NOT NULL,
    "curve_id" UUID NOT NULL,
    "soc_percent" DECIMAL(5,2) NOT NULL,
    "power_kw" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "charging_curve_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charging_time_measurements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "current_type" "current_type" NOT NULL,
    "from_soc" DECIMAL(5,2) NOT NULL,
    "to_soc" DECIMAL(5,2) NOT NULL,
    "duration_minutes" DECIMAL(8,2) NOT NULL,
    "charger_power_kw" DECIMAL(8,2),
    "peak_power_kw" DECIMAL(8,2),
    "average_power_kw" DECIMAL(8,2),
    "onboard_charger_limit_kw" DECIMAL(8,2),
    "conditions" TEXT,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charging_time_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "price_type" "price_type" NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_media" (
    "id" UUID NOT NULL,
    "model_id" UUID,
    "variant_id" UUID,
    "asset_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL DEFAULT 'gallery',
    "caption_en" VARCHAR(500),
    "caption_ar" VARCHAR(500),
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_competitors" (
    "model_id" UUID NOT NULL,
    "competitor_model_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_competitors_pkey" PRIMARY KEY ("model_id","competitor_model_id")
);

-- CreateIndex
CREATE INDEX "reviews_variant_id_status_created_at_idx" ON "reviews"("variant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_station_id_status_created_at_idx" ON "reviews"("station_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_status_created_at_idx" ON "reviews"("status", "created_at");

-- CreateIndex
CREATE INDEX "comments_article_id_status_created_at_idx" ON "comments"("article_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "comments_review_id_status_created_at_idx" ON "comments"("review_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- CreateIndex
CREATE INDEX "comments_user_id_idx" ON "comments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_accepted_answer_id_key" ON "questions"("accepted_answer_id");

-- CreateIndex
CREATE INDEX "questions_model_id_status_created_at_idx" ON "questions"("model_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "questions_variant_id_status_created_at_idx" ON "questions"("variant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "questions_station_id_status_idx" ON "questions"("station_id", "status");

-- CreateIndex
CREATE INDEX "questions_status_created_at_idx" ON "questions"("status", "created_at");

-- CreateIndex
CREATE INDEX "questions_user_id_idx" ON "questions"("user_id");

-- CreateIndex
CREATE INDEX "answers_question_id_status_created_at_idx" ON "answers"("question_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "answers_user_id_idx" ON "answers"("user_id");

-- CreateIndex
CREATE INDEX "content_reports_target_type_target_id_idx" ON "content_reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "content_reports_status_created_at_idx" ON "content_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "content_reports_reporter_id_idx" ON "content_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "moderation_actions_target_type_target_id_idx" ON "moderation_actions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "moderation_actions_moderator_id_created_at_idx" ON "moderation_actions"("moderator_id", "created_at");

-- CreateIndex
CREATE INDEX "user_blocks_user_id_revoked_at_idx" ON "user_blocks"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_category_id_locale_key" ON "category_translations"("category_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tag_translations_tag_id_locale_key" ON "tag_translations"("tag_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "articles_rss_item_id_key" ON "articles"("rss_item_id");

-- CreateIndex
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "articles_category_id_status_idx" ON "articles"("category_id", "status");

-- CreateIndex
CREATE INDEX "articles_author_id_idx" ON "articles"("author_id");

-- CreateIndex
CREATE INDEX "articles_type_status_idx" ON "articles"("type", "status");

-- CreateIndex
CREATE INDEX "articles_scheduled_at_idx" ON "articles"("scheduled_at");

-- CreateIndex
CREATE INDEX "article_markets_market_code_idx" ON "article_markets"("market_code");

-- CreateIndex
CREATE INDEX "article_translations_locale_idx" ON "article_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "article_translations_article_id_locale_key" ON "article_translations"("article_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "article_revisions_article_id_version_key" ON "article_revisions"("article_id", "version");

-- CreateIndex
CREATE INDEX "article_tags_tag_id_idx" ON "article_tags"("tag_id");

-- CreateIndex
CREATE INDEX "article_vehicle_links_brand_id_idx" ON "article_vehicle_links"("brand_id");

-- CreateIndex
CREATE INDEX "article_vehicle_links_model_id_idx" ON "article_vehicle_links"("model_id");

-- CreateIndex
CREATE INDEX "article_vehicle_links_variant_id_idx" ON "article_vehicle_links"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_vehicle_links_article_id_brand_id_key" ON "article_vehicle_links"("article_id", "brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_vehicle_links_article_id_model_id_key" ON "article_vehicle_links"("article_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_vehicle_links_article_id_variant_id_key" ON "article_vehicle_links"("article_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rss_feeds_url_key" ON "rss_feeds"("url");

-- CreateIndex
CREATE INDEX "rss_feeds_is_active_last_fetched_at_idx" ON "rss_feeds"("is_active", "last_fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "rss_items_url_hash_key" ON "rss_items"("url_hash");

-- CreateIndex
CREATE INDEX "rss_items_feed_id_published_at_idx" ON "rss_items"("feed_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "rss_items_status_idx" ON "rss_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rss_items_feed_id_guid_hash_key" ON "rss_items"("feed_id", "guid_hash");

-- CreateIndex
CREATE UNIQUE INDEX "service_providers_slug_key" ON "service_providers"("slug");

-- CreateIndex
CREATE INDEX "service_providers_location_gist" ON "service_providers" USING GIST ("location");

-- CreateIndex
CREATE INDEX "service_providers_market_code_type_status_idx" ON "service_providers"("market_code", "type", "status");

-- CreateIndex
CREATE INDEX "service_provider_brands_brand_id_idx" ON "service_provider_brands"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "encyclopedia_entries_slug_key" ON "encyclopedia_entries"("slug");

-- CreateIndex
CREATE INDEX "encyclopedia_entries_topic_status_sort_order_idx" ON "encyclopedia_entries"("topic", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "encyclopedia_entry_translations_entry_id_locale_key" ON "encyclopedia_entry_translations"("entry_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placements_key_key" ON "ad_placements"("key");

-- CreateIndex
CREATE INDEX "ad_campaigns_status_starts_at_ends_at_idx" ON "ad_campaigns"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "ad_creatives_placement_id_is_active_idx" ON "ad_creatives"("placement_id", "is_active");

-- CreateIndex
CREATE INDEX "ad_creatives_campaign_id_idx" ON "ad_creatives"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_previous_refresh_token_hash_idx" ON "user_sessions"("previous_refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "user_oauth_accounts_user_id_idx" ON "user_oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_oauth_accounts_provider_provider_user_id_key" ON "user_oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_kind_status_idx" ON "media_assets"("kind", "status");

-- CreateIndex
CREATE INDEX "media_assets_checksum_sha256_idx" ON "media_assets"("checksum_sha256");

-- CreateIndex
CREATE INDEX "media_assets_license_id_idx" ON "media_assets"("license_id");

-- CreateIndex
CREATE INDEX "media_assets_uploaded_by_id_idx" ON "media_assets"("uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_variants_asset_id_kind_label_key" ON "asset_variants"("asset_id", "kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_asset_id_key" ON "upload_sessions"("asset_id");

-- CreateIndex
CREATE INDEX "upload_sessions_user_id_status_idx" ON "upload_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "upload_sessions_status_expires_at_idx" ON "upload_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "interior_tours_slug_key" ON "interior_tours"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "interior_tours_initial_scene_id_key" ON "interior_tours"("initial_scene_id");

-- CreateIndex
CREATE INDEX "interior_tours_variant_id_market_code_status_idx" ON "interior_tours"("variant_id", "market_code", "status");

-- CreateIndex
CREATE INDEX "interior_tours_status_published_at_idx" ON "interior_tours"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "tour_scenes_tour_id_sort_order_idx" ON "tour_scenes"("tour_id", "sort_order");

-- CreateIndex
CREATE INDEX "tour_scenes_asset_id_idx" ON "tour_scenes"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "tour_scenes_tour_id_key_key" ON "tour_scenes"("tour_id", "key");

-- CreateIndex
CREATE INDEX "scene_hotspots_scene_id_sort_order_idx" ON "scene_hotspots"("scene_id", "sort_order");

-- CreateIndex
CREATE INDEX "scene_hotspots_target_scene_id_idx" ON "scene_hotspots"("target_scene_id");

-- CreateIndex
CREATE UNIQUE INDEX "scene_hotspot_translations_hotspot_id_locale_key" ON "scene_hotspot_translations"("hotspot_id", "locale");

-- CreateIndex
CREATE INDEX "exterior_spins_variant_id_status_idx" ON "exterior_spins"("variant_id", "status");

-- CreateIndex
CREATE INDEX "exterior_spin_frames_asset_id_idx" ON "exterior_spin_frames"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "exterior_spin_frames_spin_id_frame_index_key" ON "exterior_spin_frames"("spin_id", "frame_index");

-- CreateIndex
CREATE INDEX "notification_subscriptions_user_id_topic_type_idx" ON "notification_subscriptions"("user_id", "topic_type");

-- CreateIndex
CREATE INDEX "notification_subscriptions_brand_id_idx" ON "notification_subscriptions"("brand_id");

-- CreateIndex
CREATE INDEX "notification_subscriptions_model_id_idx" ON "notification_subscriptions"("model_id");

-- CreateIndex
CREATE INDEX "notification_subscriptions_variant_id_idx" ON "notification_subscriptions"("variant_id");

-- CreateIndex
CREATE INDEX "notification_subscriptions_category_id_idx" ON "notification_subscriptions"("category_id");

-- CreateIndex
CREATE INDEX "notification_subscriptions_station_id_idx" ON "notification_subscriptions"("station_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_campaign_id_idx" ON "notifications"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at");

-- CreateIndex
CREATE INDEX "notification_campaigns_status_scheduled_at_idx" ON "notification_campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "favorites_user_id_target_type_created_at_idx" ON "favorites"("user_id", "target_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_article_id_key" ON "favorites"("user_id", "article_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_model_id_key" ON "favorites"("user_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_variant_id_key" ON "favorites"("user_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_station_id_key" ON "favorites"("user_id", "station_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_comparison_id_key" ON "favorites"("user_id", "comparison_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_tour_id_key" ON "favorites"("user_id", "tour_id");

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_share_id_key" ON "comparisons"("share_id");

-- CreateIndex
CREATE INDEX "comparisons_user_id_created_at_idx" ON "comparisons"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comparisons_is_curated_curated_status_curated_order_idx" ON "comparisons"("is_curated", "curated_status", "curated_order");

-- CreateIndex
CREATE INDEX "comparison_items_variant_id_idx" ON "comparison_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "comparison_items_comparison_id_position_key" ON "comparison_items"("comparison_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "comparison_items_comparison_id_variant_id_market_code_key" ON "comparison_items"("comparison_id", "variant_id", "market_code");

-- CreateIndex
CREATE INDEX "user_vehicles_user_id_idx" ON "user_vehicles"("user_id");

-- CreateIndex
CREATE INDEX "user_vehicles_variant_id_idx" ON "user_vehicles"("variant_id");

-- CreateIndex
CREATE INDEX "charging_logs_user_id_charged_at_idx" ON "charging_logs"("user_id", "charged_at" DESC);

-- CreateIndex
CREATE INDEX "charging_logs_user_vehicle_id_charged_at_idx" ON "charging_logs"("user_vehicle_id", "charged_at" DESC);

-- CreateIndex
CREATE INDEX "reminders_user_id_completed_at_due_date_idx" ON "reminders"("user_id", "completed_at", "due_date");

-- CreateIndex
CREATE INDEX "reminders_due_date_idx" ON "reminders"("due_date");

-- CreateIndex
CREATE INDEX "trip_plans_user_id_created_at_idx" ON "trip_plans"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "markets_enabled_sort_order_idx" ON "markets"("enabled", "sort_order");

-- CreateIndex
CREATE INDEX "translations_locale_namespace_idx" ON "translations"("locale", "namespace");

-- CreateIndex
CREATE UNIQUE INDEX "translations_namespace_key_locale_key" ON "translations"("namespace", "key", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "integration_settings_provider_key" ON "integration_settings"("provider");

-- CreateIndex
CREATE INDEX "integration_settings_category_idx" ON "integration_settings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_base_currency_quote_currency_effective_at_key" ON "exchange_rates"("base_currency", "quote_currency", "effective_at");

-- CreateIndex
CREATE INDEX "energy_prices_market_code_energy_type_effective_from_idx" ON "energy_prices"("market_code", "energy_type", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "charging_operators_name_idx" ON "charging_operators"("name");

-- CreateIndex
CREATE UNIQUE INDEX "charging_stations_slug_key" ON "charging_stations"("slug");

-- CreateIndex
CREATE INDEX "charging_stations_location_gist" ON "charging_stations" USING GIST ("location");

-- CreateIndex
CREATE INDEX "charging_stations_search_text_trgm" ON "charging_stations" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "charging_stations_publication_status_operational_status_idx" ON "charging_stations"("publication_status", "operational_status");

-- CreateIndex
CREATE INDEX "charging_stations_market_code_idx" ON "charging_stations"("market_code");

-- CreateIndex
CREATE INDEX "charging_stations_operator_id_idx" ON "charging_stations"("operator_id");

-- CreateIndex
CREATE INDEX "charging_stations_country_code_city_idx" ON "charging_stations"("country_code", "city");

-- CreateIndex
CREATE INDEX "charging_points_station_id_idx" ON "charging_points"("station_id");

-- CreateIndex
CREATE INDEX "connectors_charging_point_id_idx" ON "connectors"("charging_point_id");

-- CreateIndex
CREATE INDEX "connectors_connector_type_code_current_type_idx" ON "connectors"("connector_type_code", "current_type");

-- CreateIndex
CREATE INDEX "tariffs_station_id_idx" ON "tariffs"("station_id");

-- CreateIndex
CREATE INDEX "tariffs_charging_point_id_idx" ON "tariffs"("charging_point_id");

-- CreateIndex
CREATE INDEX "tariffs_connector_id_idx" ON "tariffs"("connector_id");

-- CreateIndex
CREATE INDEX "tariff_elements_tariff_id_idx" ON "tariff_elements"("tariff_id");

-- CreateIndex
CREATE INDEX "provider_records_station_id_idx" ON "provider_records"("station_id");

-- CreateIndex
CREATE INDEX "provider_records_operator_id_idx" ON "provider_records"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_records_provider_external_id_key" ON "provider_records"("provider", "external_id");

-- CreateIndex
CREATE INDEX "availability_observations_station_id_expires_at_idx" ON "availability_observations"("station_id", "expires_at");

-- CreateIndex
CREATE INDEX "availability_observations_connector_id_observed_at_idx" ON "availability_observations"("connector_id", "observed_at" DESC);

-- CreateIndex
CREATE INDEX "availability_observations_charging_point_id_observed_at_idx" ON "availability_observations"("charging_point_id", "observed_at" DESC);

-- CreateIndex
CREATE INDEX "station_reports_status_created_at_idx" ON "station_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "station_reports_station_id_created_at_idx" ON "station_reports"("station_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "station_reports_user_id_idx" ON "station_reports"("user_id");

-- CreateIndex
CREATE INDEX "station_checkins_station_id_created_at_idx" ON "station_checkins"("station_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "station_checkins_user_id_idx" ON "station_checkins"("user_id");

-- CreateIndex
CREATE INDEX "station_media_asset_id_idx" ON "station_media"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "station_media_station_id_asset_id_key" ON "station_media"("station_id", "asset_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "import_jobs_type_created_at_idx" ON "import_jobs"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "import_job_rows_job_id_status_idx" ON "import_job_rows"("job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_job_rows_job_id_row_number_key" ON "import_job_rows"("job_id", "row_number");

-- CreateIndex
CREATE INDEX "search_documents_normalized_title_trgm" ON "search_documents" USING GIN ("normalized_title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "search_documents_search_vector_gin" ON "search_documents" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "search_documents_entity_type_is_published_idx" ON "search_documents"("entity_type", "is_published");

-- CreateIndex
CREATE INDEX "search_documents_market_code_idx" ON "search_documents"("market_code");

-- CreateIndex
CREATE UNIQUE INDEX "search_documents_entity_type_entity_id_locale_key" ON "search_documents"("entity_type", "entity_id", "locale");

-- CreateIndex
CREATE INDEX "search_aliases_term_trgm" ON "search_aliases" USING GIN ("term_normalized" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "search_aliases_canonical_normalized_idx" ON "search_aliases"("canonical_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "search_aliases_term_canonical_key" ON "search_aliases"("term", "canonical");

-- CreateIndex
CREATE INDEX "content_daily_stats_day_entity_type_idx" ON "content_daily_stats"("day", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "content_daily_stats_entity_type_entity_id_day_key" ON "content_daily_stats"("entity_type", "entity_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_status_sort_order_idx" ON "brands"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "car_models_slug_key" ON "car_models"("slug");

-- CreateIndex
CREATE INDEX "car_models_brand_id_idx" ON "car_models"("brand_id");

-- CreateIndex
CREATE INDEX "car_models_status_sort_order_idx" ON "car_models"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "generations_model_id_slug_key" ON "generations"("model_id", "slug");

-- CreateIndex
CREATE INDEX "model_years_year_idx" ON "model_years"("year");

-- CreateIndex
CREATE UNIQUE INDEX "model_years_generation_id_year_key" ON "model_years"("generation_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_variants_slug_key" ON "vehicle_variants"("slug");

-- CreateIndex
CREATE INDEX "vehicle_variants_powertrain_type_status_idx" ON "vehicle_variants"("powertrain_type", "status");

-- CreateIndex
CREATE INDEX "vehicle_variants_status_published_at_idx" ON "vehicle_variants"("status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_variants_model_year_id_powertrain_type_name_en_key" ON "vehicle_variants"("model_year_id", "powertrain_type", "name_en");

-- CreateIndex
CREATE INDEX "variant_markets_market_code_availability_idx" ON "variant_markets"("market_code", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "variant_markets_variant_id_market_code_key" ON "variant_markets"("variant_id", "market_code");

-- CreateIndex
CREATE INDEX "spec_definitions_group_sort_order_idx" ON "spec_definitions"("group", "sort_order");

-- CreateIndex
CREATE INDEX "specification_sources_type_idx" ON "specification_sources"("type");

-- CreateIndex
CREATE INDEX "vehicle_specifications_spec_key_idx" ON "vehicle_specifications"("spec_key");

-- CreateIndex
CREATE INDEX "vehicle_specifications_source_id_idx" ON "vehicle_specifications"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_specifications_variant_id_spec_key_key" ON "vehicle_specifications"("variant_id", "spec_key");

-- CreateIndex
CREATE INDEX "range_measurements_variant_id_cycle_range_type_idx" ON "range_measurements"("variant_id", "cycle", "range_type");

-- CreateIndex
CREATE INDEX "charging_curves_variant_id_idx" ON "charging_curves"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "charging_curve_points_curve_id_soc_percent_key" ON "charging_curve_points"("curve_id", "soc_percent");

-- CreateIndex
CREATE INDEX "charging_time_measurements_variant_id_current_type_idx" ON "charging_time_measurements"("variant_id", "current_type");

-- CreateIndex
CREATE INDEX "price_history_variant_id_market_code_effective_from_idx" ON "price_history"("variant_id", "market_code", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "price_history_market_code_price_type_idx" ON "price_history"("market_code", "price_type");

-- CreateIndex
CREATE INDEX "vehicle_media_model_id_sort_order_idx" ON "vehicle_media"("model_id", "sort_order");

-- CreateIndex
CREATE INDEX "vehicle_media_variant_id_sort_order_idx" ON "vehicle_media"("variant_id", "sort_order");

-- CreateIndex
CREATE INDEX "vehicle_media_asset_id_idx" ON "vehicle_media"("asset_id");

-- CreateIndex
CREATE INDEX "model_competitors_competitor_model_id_idx" ON "model_competitors"("competitor_model_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_accepted_answer_id_fkey" FOREIGN KEY ("accepted_answer_id") REFERENCES "answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "content_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_by_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_translations" ADD CONSTRAINT "tag_translations_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_rss_item_id_fkey" FOREIGN KEY ("rss_item_id") REFERENCES "rss_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_markets" ADD CONSTRAINT "article_markets_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_markets" ADD CONSTRAINT "article_markets_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_translations" ADD CONSTRAINT "article_translations_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_vehicle_links" ADD CONSTRAINT "article_vehicle_links_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_vehicle_links" ADD CONSTRAINT "article_vehicle_links_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_vehicle_links" ADD CONSTRAINT "article_vehicle_links_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_vehicle_links" ADD CONSTRAINT "article_vehicle_links_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_items" ADD CONSTRAINT "rss_items_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "rss_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_provider_brands" ADD CONSTRAINT "service_provider_brands_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_provider_brands" ADD CONSTRAINT "service_provider_brands_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encyclopedia_entries" ADD CONSTRAINT "encyclopedia_entries_technical_reviewed_by_id_fkey" FOREIGN KEY ("technical_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encyclopedia_entries" ADD CONSTRAINT "encyclopedia_entries_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encyclopedia_entry_translations" ADD CONSTRAINT "encyclopedia_entry_translations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "encyclopedia_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "ad_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_preferred_market_code_fkey" FOREIGN KEY ("preferred_market_code") REFERENCES "markets"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "asset_licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_licenses" ADD CONSTRAINT "asset_licenses_proof_asset_id_fkey" FOREIGN KEY ("proof_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_reference_variant_id_fkey" FOREIGN KEY ("reference_variant_id") REFERENCES "vehicle_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_initial_scene_id_fkey" FOREIGN KEY ("initial_scene_id") REFERENCES "tour_scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "interior_tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "tour_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_target_scene_id_fkey" FOREIGN KEY ("target_scene_id") REFERENCES "tour_scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_spec_key_fkey" FOREIGN KEY ("spec_key") REFERENCES "spec_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_hotspot_translations" ADD CONSTRAINT "scene_hotspot_translations_hotspot_id_fkey" FOREIGN KEY ("hotspot_id") REFERENCES "scene_hotspots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exterior_spins" ADD CONSTRAINT "exterior_spins_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exterior_spins" ADD CONSTRAINT "exterior_spins_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exterior_spin_frames" ADD CONSTRAINT "exterior_spin_frames_spin_id_fkey" FOREIGN KEY ("spin_id") REFERENCES "exterior_spins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exterior_spin_frames" ADD CONSTRAINT "exterior_spin_frames_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "notification_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_token_id_fkey" FOREIGN KEY ("device_token_id") REFERENCES "device_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "interior_tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_user_vehicle_id_fkey" FOREIGN KEY ("user_vehicle_id") REFERENCES "user_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_vehicle_id_fkey" FOREIGN KEY ("user_vehicle_id") REFERENCES "user_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_user_vehicle_id_fkey" FOREIGN KEY ("user_vehicle_id") REFERENCES "user_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_fkey" FOREIGN KEY ("base_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_currency_fkey" FOREIGN KEY ("quote_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_prices" ADD CONSTRAINT "energy_prices_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_prices" ADD CONSTRAINT "energy_prices_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_prices" ADD CONSTRAINT "energy_prices_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_operators" ADD CONSTRAINT "charging_operators_logo_asset_id_fkey" FOREIGN KEY ("logo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "charging_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_points" ADD CONSTRAINT "charging_points_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_charging_point_id_fkey" FOREIGN KEY ("charging_point_id") REFERENCES "charging_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_connector_type_code_fkey" FOREIGN KEY ("connector_type_code") REFERENCES "connector_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_charging_point_id_fkey" FOREIGN KEY ("charging_point_id") REFERENCES "charging_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_elements" ADD CONSTRAINT "tariff_elements_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_records" ADD CONSTRAINT "provider_records_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "charging_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_observations" ADD CONSTRAINT "availability_observations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_observations" ADD CONSTRAINT "availability_observations_charging_point_id_fkey" FOREIGN KEY ("charging_point_id") REFERENCES "charging_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_observations" ADD CONSTRAINT "availability_observations_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_photo_asset_id_fkey" FOREIGN KEY ("photo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_checkins" ADD CONSTRAINT "station_checkins_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_checkins" ADD CONSTRAINT "station_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_checkins" ADD CONSTRAINT "station_checkins_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_media" ADD CONSTRAINT "station_media_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_media" ADD CONSTRAINT "station_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_asset_id_fkey" FOREIGN KEY ("logo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_hero_asset_id_fkey" FOREIGN KEY ("hero_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_years" ADD CONSTRAINT "model_years_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_model_year_id_fkey" FOREIGN KEY ("model_year_id") REFERENCES "model_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_markets" ADD CONSTRAINT "variant_markets_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_markets" ADD CONSTRAINT "variant_markets_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_markets" ADD CONSTRAINT "variant_markets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specification_sources" ADD CONSTRAINT "specification_sources_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_specifications" ADD CONSTRAINT "vehicle_specifications_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_specifications" ADD CONSTRAINT "vehicle_specifications_spec_key_fkey" FOREIGN KEY ("spec_key") REFERENCES "spec_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_specifications" ADD CONSTRAINT "vehicle_specifications_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "range_measurements" ADD CONSTRAINT "range_measurements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "range_measurements" ADD CONSTRAINT "range_measurements_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "range_measurements" ADD CONSTRAINT "range_measurements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_curves" ADD CONSTRAINT "charging_curves_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_curves" ADD CONSTRAINT "charging_curves_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_curve_points" ADD CONSTRAINT "charging_curve_points_curve_id_fkey" FOREIGN KEY ("curve_id") REFERENCES "charging_curves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_time_measurements" ADD CONSTRAINT "charging_time_measurements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_time_measurements" ADD CONSTRAINT "charging_time_measurements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_competitors" ADD CONSTRAINT "model_competitors_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_competitors" ADD CONSTRAINT "model_competitors_competitor_model_id_fkey" FOREIGN KEY ("competitor_model_id") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written SQL (not expressible in Prisma schema).
-- Prisma ignores functions, triggers, CHECK constraints and partial indexes
-- when diffing, so these survive future `prisma migrate dev` runs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Text normalization used for search (MUST stay identical to
-- src/common/i18n/arabic-normalize.ts → normalizeSearchText()):
--   NFKD → strip combining marks (Latin accents, Arabic harakat, hamza/madda
--   marks, Quranic marks, tatweel) → ٱ→ا, ى→ي, ة→ه, Persian ی→ي, ک→ك,
--   Arabic-Indic digits → ASCII → lower-case → collapse whitespace → trim.
--   (NFKD already turns أ/إ/آ/ؤ/ئ into bare letters + a mark.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_normalize_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    lower(
      translate(
        regexp_replace(
          normalize(input, NFKD),
          '[̀-ͯؐ-ًؚ-ٰٟۖ-ۭـ]',
          '',
          'g'
        ),
        'ٱىةیک٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        'ايهيك01234567890123456789'
      )
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- -----------------------------------------------------------------------------
-- Derived columns maintained by triggers (instead of GENERATED columns, which
-- Prisma cannot represent).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION charging_stations_sync_derived()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  NEW."search_text" := app_normalize_text(concat_ws(' ',
    NEW."name", NEW."name_ar", NEW."name_en", NEW."address_line",
    NEW."address_ar", NEW."address_en", NEW."city", NEW."region"));
  RETURN NEW;
END
$$;

CREATE TRIGGER charging_stations_sync_derived
  BEFORE INSERT OR UPDATE ON "charging_stations"
  FOR EACH ROW EXECUTE FUNCTION charging_stations_sync_derived();

CREATE OR REPLACE FUNCTION service_providers_sync_derived()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL THEN
    NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  ELSE
    NEW."location" := NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER service_providers_sync_derived
  BEFORE INSERT OR UPDATE ON "service_providers"
  FOR EACH ROW EXECUTE FUNCTION service_providers_sync_derived();

CREATE OR REPLACE FUNCTION search_documents_sync_derived()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."normalized_title" := app_normalize_text(NEW."title");
  NEW."normalized_text" := app_normalize_text(concat_ws(' ',
    NEW."title", NEW."subtitle", NEW."keywords", NEW."body"));
  NEW."search_vector" :=
       setweight(to_tsvector('simple', coalesce(app_normalize_text(NEW."title"), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(app_normalize_text(concat_ws(' ', NEW."subtitle", NEW."keywords")), '')), 'B')
    || setweight(to_tsvector('simple', coalesce(app_normalize_text(NEW."body"), '')), 'C');
  RETURN NEW;
END
$$;

CREATE TRIGGER search_documents_sync_derived
  BEFORE INSERT OR UPDATE ON "search_documents"
  FOR EACH ROW EXECUTE FUNCTION search_documents_sync_derived();

CREATE OR REPLACE FUNCTION search_aliases_sync_derived()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."term_normalized" := app_normalize_text(NEW."term");
  NEW."canonical_normalized" := app_normalize_text(NEW."canonical");
  RETURN NEW;
END
$$;

CREATE TRIGGER search_aliases_sync_derived
  BEFORE INSERT OR UPDATE ON "search_aliases"
  FOR EACH ROW EXECUTE FUNCTION search_aliases_sync_derived();

-- -----------------------------------------------------------------------------
-- CHECK constraints
-- -----------------------------------------------------------------------------
-- identity
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_chk" CHECK ("email" = lower(btrim("email")) AND "email" LIKE '%_@_%');
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_chk" CHECK ("failed_login_count" >= 0);
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_font_scale_chk" CHECK ("font_scale" IS NULL OR "font_scale" BETWEEN 0.5 AND 3);
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_expiry_chk" CHECK ("expires_at" > "created_at");
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_expiry_chk" CHECK ("expires_at" > "created_at");

-- settings / markets
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_code_chk" CHECK ("code" ~ '^[A-Z]{3}$');
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_decimals_chk" CHECK ("decimals" BETWEEN 0 AND 4);
ALTER TABLE "markets" ADD CONSTRAINT "markets_code_chk" CHECK ("code" ~ '^[A-Z]{2,8}$');
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_chk" CHECK ("rate" > 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_pair_chk" CHECK ("base_currency" <> "quote_currency");
ALTER TABLE "energy_prices" ADD CONSTRAINT "energy_prices_price_chk" CHECK ("price" >= 0);
ALTER TABLE "energy_prices" ADD CONSTRAINT "energy_prices_dates_chk" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- vehicles
ALTER TABLE "brands" ADD CONSTRAINT "brands_country_code_chk" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "generations" ADD CONSTRAINT "generations_years_chk" CHECK (
  ("start_year" IS NULL OR "start_year" BETWEEN 1900 AND 2100)
  AND ("end_year" IS NULL OR "end_year" BETWEEN 1900 AND 2100)
  AND ("start_year" IS NULL OR "end_year" IS NULL OR "start_year" <= "end_year"));
ALTER TABLE "model_years" ADD CONSTRAINT "model_years_year_chk" CHECK ("year" BETWEEN 1990 AND 2100);
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_seats_chk" CHECK ("seats" IS NULL OR "seats" BETWEEN 1 AND 12);
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_doors_chk" CHECK ("doors" IS NULL OR "doors" BETWEEN 1 AND 6);
ALTER TABLE "variant_markets" ADD CONSTRAINT "variant_markets_dates_chk" CHECK ("launch_date" IS NULL OR "discontinued_at" IS NULL OR "discontinued_at" >= "launch_date");
ALTER TABLE "vehicle_specifications" ADD CONSTRAINT "vehicle_specifications_has_value_chk" CHECK (num_nonnulls("value_num", "value_text", "value_bool") >= 1);
ALTER TABLE "range_measurements" ADD CONSTRAINT "range_measurements_value_chk" CHECK ("value_km" > 0);
ALTER TABLE "range_measurements" ADD CONSTRAINT "range_measurements_wheel_chk" CHECK ("wheel_size_inch" IS NULL OR "wheel_size_inch" > 0);
ALTER TABLE "range_measurements" ADD CONSTRAINT "range_measurements_other_cycle_chk" CHECK ("cycle" <> 'OTHER' OR "cycle_note" IS NOT NULL);
ALTER TABLE "charging_curves" ADD CONSTRAINT "charging_curves_power_chk" CHECK ("charger_max_power_kw" IS NULL OR "charger_max_power_kw" > 0);
ALTER TABLE "charging_curve_points" ADD CONSTRAINT "charging_curve_points_soc_chk" CHECK ("soc_percent" BETWEEN 0 AND 100);
ALTER TABLE "charging_curve_points" ADD CONSTRAINT "charging_curve_points_power_chk" CHECK ("power_kw" >= 0);
ALTER TABLE "charging_time_measurements" ADD CONSTRAINT "charging_time_measurements_soc_chk" CHECK (
  "from_soc" BETWEEN 0 AND 100 AND "to_soc" BETWEEN 0 AND 100 AND "from_soc" < "to_soc");
ALTER TABLE "charging_time_measurements" ADD CONSTRAINT "charging_time_measurements_duration_chk" CHECK ("duration_minutes" > 0);
ALTER TABLE "charging_time_measurements" ADD CONSTRAINT "charging_time_measurements_power_chk" CHECK (
  ("charger_power_kw" IS NULL OR "charger_power_kw" > 0)
  AND ("peak_power_kw" IS NULL OR "peak_power_kw" > 0)
  AND ("average_power_kw" IS NULL OR "average_power_kw" > 0)
  AND ("onboard_charger_limit_kw" IS NULL OR "onboard_charger_limit_kw" > 0)
  AND ("peak_power_kw" IS NULL OR "average_power_kw" IS NULL OR "average_power_kw" <= "peak_power_kw"));
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_dates_chk" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_target_chk" CHECK (num_nonnulls("model_id", "variant_id") = 1);
ALTER TABLE "model_competitors" ADD CONSTRAINT "model_competitors_self_chk" CHECK ("model_id" <> "competitor_model_id");

-- content
ALTER TABLE "articles" ADD CONSTRAINT "articles_scheduled_chk" CHECK ("status" <> 'scheduled' OR "scheduled_at" IS NOT NULL);
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_chk" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
ALTER TABLE "articles" ADD CONSTRAINT "articles_sponsor_chk" CHECK (NOT "is_sponsored" OR "sponsor_name" IS NOT NULL);
ALTER TABLE "articles" ADD CONSTRAINT "articles_version_chk" CHECK ("current_version" >= 1);
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_version_chk" CHECK ("version" >= 1);
ALTER TABLE "article_vehicle_links" ADD CONSTRAINT "article_vehicle_links_target_chk" CHECK (num_nonnulls("brand_id", "model_id", "variant_id") = 1);
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_interval_chk" CHECK ("fetch_interval_minutes" >= 5);
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_https_chk" CHECK ("url" ~* '^https://');

-- media & tours
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_progress_chk" CHECK ("processing_progress" BETWEEN 0 AND 100);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_chk" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_size_chk" CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_version_chk" CHECK ("version" >= 1);
ALTER TABLE "asset_licenses" ADD CONSTRAINT "asset_licenses_dates_chk" CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_until" >= "valid_from");
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_dimensions_chk" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_face_chk" CHECK ("face" IS NULL OR "face" IN ('f', 'b', 'l', 'r', 'u', 'd'));
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_bytes_chk" CHECK ("total_bytes" > 0 AND "received_bytes" >= 0 AND "received_bytes" <= "total_bytes");
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_chunk_chk" CHECK ("chunk_size_bytes" IS NULL OR "chunk_size_bytes" > 0);
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_match_chk" CHECK (
  ("match_type" = 'exact' AND "reference_variant_id" IS NULL)
  OR ("match_type" = 'reference_similar_trim'
      AND "reference_variant_id" IS NOT NULL
      AND "reference_variant_id" <> "variant_id"
      AND "difference_note_ar" IS NOT NULL
      AND "difference_note_en" IS NOT NULL));
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_reference_approval_chk" CHECK (
  "status" <> 'published' OR "match_type" = 'exact' OR ("approved_at" IS NOT NULL AND "approved_by_id" IS NOT NULL));
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_published_chk" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
ALTER TABLE "interior_tours" ADD CONSTRAINT "interior_tours_color_hex_chk" CHECK ("interior_color_hex" IS NULL OR "interior_color_hex" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_view_chk" CHECK (
  "initial_yaw" BETWEEN -180 AND 180
  AND "initial_pitch" BETWEEN -90 AND 90
  AND "initial_hfov" BETWEEN 10 AND 150
  AND ("min_hfov" IS NULL OR "min_hfov" BETWEEN 10 AND 150)
  AND ("max_hfov" IS NULL OR "max_hfov" BETWEEN 10 AND 150)
  AND ("min_hfov" IS NULL OR "max_hfov" IS NULL OR "min_hfov" <= "max_hfov")
  AND ("north_offset" IS NULL OR "north_offset" BETWEEN -360 AND 360));
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_position_chk" CHECK (
  "yaw" BETWEEN -180 AND 180 AND "pitch" BETWEEN -90 AND 90
  AND ("target_yaw" IS NULL OR "target_yaw" BETWEEN -180 AND 180)
  AND ("target_pitch" IS NULL OR "target_pitch" BETWEEN -90 AND 90));
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_type_chk" CHECK (
  ("type" <> 'scene' OR "target_scene_id" IS NOT NULL)
  AND ("type" NOT IN ('image', 'video') OR "media_asset_id" IS NOT NULL)
  AND ("type" <> 'spec' OR "spec_key" IS NOT NULL));
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_self_link_chk" CHECK ("target_scene_id" IS NULL OR "target_scene_id" <> "scene_id");
ALTER TABLE "exterior_spin_frames" ADD CONSTRAINT "exterior_spin_frames_index_chk" CHECK ("frame_index" >= 0);

-- stations
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_coordinates_chk" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_country_code_chk" CHECK ("country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "connector_types" ADD CONSTRAINT "connector_types_current_chk" CHECK ("supports_ac" OR "supports_dc");
ALTER TABLE "connector_types" ADD CONSTRAINT "connector_types_power_chk" CHECK (
  ("typical_max_ac_kw" IS NULL OR ("typical_max_ac_kw" > 0 AND "supports_ac"))
  AND ("typical_max_dc_kw" IS NULL OR ("typical_max_dc_kw" > 0 AND "supports_dc")));
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_power_chk" CHECK ("max_power_kw" IS NULL OR "max_power_kw" > 0);
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_electrical_chk" CHECK (
  ("max_voltage" IS NULL OR "max_voltage" > 0)
  AND ("max_amperage" IS NULL OR "max_amperage" > 0)
  AND ("phases" IS NULL OR "phases" IN (1, 3)));
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_tax_chk" CHECK ("tax_percent" IS NULL OR "tax_percent" BETWEEN 0 AND 100);
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_validity_chk" CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_to" > "valid_from");
ALTER TABLE "tariff_elements" ADD CONSTRAINT "tariff_elements_price_chk" CHECK ("price" >= 0);
ALTER TABLE "tariff_elements" ADD CONSTRAINT "tariff_elements_unit_chk" CHECK (
  ("component_type" <> 'energy' OR "price_unit" = 'per_kwh')
  AND ("component_type" <> 'flat' OR "price_unit" = 'per_session')
  AND ("component_type" NOT IN ('time', 'parking_time', 'idle') OR "price_unit" IN ('per_minute', 'per_hour')));
ALTER TABLE "tariff_elements" ADD CONSTRAINT "tariff_elements_limits_chk" CHECK (
  ("step_size" IS NULL OR "step_size" > 0)
  AND ("grace_minutes" IS NULL OR "grace_minutes" >= 0)
  AND ("min_power_kw" IS NULL OR "min_power_kw" >= 0)
  AND ("max_power_kw" IS NULL OR "max_power_kw" > 0)
  AND ("min_power_kw" IS NULL OR "max_power_kw" IS NULL OR "min_power_kw" <= "max_power_kw"));
ALTER TABLE "tariff_elements" ADD CONSTRAINT "tariff_elements_time_chk" CHECK (
  ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-4]):[0-5][0-9]$')
  AND "days_of_week" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]);
ALTER TABLE "availability_observations" ADD CONSTRAINT "availability_observations_expiry_chk" CHECK ("expires_at" > "observed_at");
ALTER TABLE "station_checkins" ADD CONSTRAINT "station_checkins_power_chk" CHECK ("observed_power_kw" IS NULL OR "observed_power_kw" > 0);

-- community
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_chk" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_chk" CHECK (num_nonnulls("variant_id", "station_id") = 1);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_verified_owner_chk" CHECK (NOT "is_verified_owner" OR ("owner_verified_at" IS NOT NULL AND "owner_verification_method" IS NOT NULL));
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_ownership_chk" CHECK ("ownership_months" IS NULL OR "ownership_months" >= 0);
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_chk" CHECK (num_nonnulls("article_id", "review_id") = 1);
ALTER TABLE "comments" ADD CONSTRAINT "comments_self_parent_chk" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "questions" ADD CONSTRAINT "questions_target_chk" CHECK (num_nonnulls("model_id", "variant_id", "station_id") <= 1);

-- personal
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_target_chk" CHECK (
  num_nonnulls("article_id", "model_id", "variant_id", "station_id", "comparison_id", "tour_id") = 1
  AND CASE "target_type"
    WHEN 'article' THEN "article_id" IS NOT NULL
    WHEN 'model' THEN "model_id" IS NOT NULL
    WHEN 'variant' THEN "variant_id" IS NOT NULL
    WHEN 'station' THEN "station_id" IS NOT NULL
    WHEN 'comparison' THEN "comparison_id" IS NOT NULL
    WHEN 'tour' THEN "tour_id" IS NOT NULL
  END);
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_curated_chk" CHECK (NOT "is_curated" OR "curated_status" IS NOT NULL);
ALTER TABLE "comparison_items" ADD CONSTRAINT "comparison_items_position_chk" CHECK ("position" BETWEEN 1 AND 4);
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_odometer_chk" CHECK ("initial_odometer_km" IS NULL OR "initial_odometer_km" >= 0);
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_energy_chk" CHECK ("energy_kwh" > 0);
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_cost_chk" CHECK ("cost" IS NULL OR ("cost" >= 0 AND "currency_code" IS NOT NULL));
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_soc_chk" CHECK (
  ("soc_start" IS NULL OR "soc_start" BETWEEN 0 AND 100)
  AND ("soc_end" IS NULL OR "soc_end" BETWEEN 0 AND 100));
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_misc_chk" CHECK (
  ("odometer_km" IS NULL OR "odometer_km" >= 0)
  AND ("duration_minutes" IS NULL OR "duration_minutes" > 0)
  AND ("charger_power_kw" IS NULL OR "charger_power_kw" > 0));
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_due_chk" CHECK ("due_date" IS NOT NULL OR "due_odometer_km" IS NOT NULL);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_numbers_chk" CHECK (
  "notify_days_before" >= 0
  AND ("repeat_interval_months" IS NULL OR "repeat_interval_months" > 0)
  AND ("due_odometer_km" IS NULL OR "due_odometer_km" >= 0));
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_soc_chk" CHECK (
  "start_soc_percent" BETWEEN 0 AND 100 AND "min_arrival_soc_percent" BETWEEN 0 AND 100);
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_coordinates_chk" CHECK (
  "origin_lat" BETWEEN -90 AND 90 AND "origin_lng" BETWEEN -180 AND 180
  AND "destination_lat" BETWEEN -90 AND 90 AND "destination_lng" BETWEEN -180 AND 180);

-- notifications
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_quiet_hours_chk" CHECK (
  ("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL)
  AND ("quiet_hours_start" IS NULL OR "quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("quiet_hours_end" IS NULL OR "quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_target_chk" CHECK (
  num_nonnulls("brand_id", "model_id", "variant_id", "market_code", "category_id", "station_id") >= 1);
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempts_chk" CHECK ("attempts" >= 0);

-- directory / encyclopedia / ads
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_coordinates_chk" CHECK (
  ("latitude" IS NULL) = ("longitude" IS NULL)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180));
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_sponsor_chk" CHECK (NOT "is_sponsored" OR "sponsor_label" IS NOT NULL);
ALTER TABLE "encyclopedia_entries" ADD CONSTRAINT "encyclopedia_entries_review_chk" CHECK ("status" <> 'published' OR "technical_reviewed_at" IS NOT NULL);
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_max_creatives_chk" CHECK ("max_creatives" >= 1);
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_dates_chk" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_weight_chk" CHECK ("weight" >= 1);
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_https_chk" CHECK ("target_url" ~* '^https://');

-- system
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_counts_chk" CHECK (
  "total_rows" >= 0 AND "processed_rows" >= 0 AND "success_rows" >= 0 AND "error_rows" >= 0 AND "skipped_rows" >= 0);
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_number_chk" CHECK ("row_number" >= 0);
ALTER TABLE "content_daily_stats" ADD CONSTRAINT "content_daily_stats_counts_chk" CHECK (
  "views" >= 0 AND "shares" >= 0 AND "comparisons" >= 0 AND "favorites" >= 0);
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_boost_chk" CHECK ("boost" > 0);

-- -----------------------------------------------------------------------------
-- Partial unique indexes (business rules)
-- -----------------------------------------------------------------------------
-- At most one published tour per variant × market × drive side × interior colour.
CREATE UNIQUE INDEX "interior_tours_one_published_uq"
  ON "interior_tours" ("variant_id", "market_code", "drive_side", "interior_color_name_en")
  WHERE "status" = 'published' AND "deleted_at" IS NULL;
-- At most one primary car per user.
CREATE UNIQUE INDEX "user_vehicles_one_primary_uq"
  ON "user_vehicles" ("user_id") WHERE "is_primary";
-- One live review per user per variant.
CREATE UNIQUE INDEX "reviews_one_per_user_variant_uq"
  ON "reviews" ("user_id", "variant_id")
  WHERE "user_id" IS NOT NULL AND "variant_id" IS NOT NULL AND "deleted_at" IS NULL;
-- One live review per user per station.
CREATE UNIQUE INDEX "reviews_one_per_user_station_uq"
  ON "reviews" ("user_id", "station_id")
  WHERE "user_id" IS NOT NULL AND "station_id" IS NOT NULL AND "deleted_at" IS NULL;
