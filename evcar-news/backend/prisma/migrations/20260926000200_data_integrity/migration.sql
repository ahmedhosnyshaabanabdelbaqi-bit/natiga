-- Data integrity rules found in review (REQUIREMENTS §6, §7, §8, §10, §11, §22):
--  * vehicle inlets per variant × market (structured, for §11 compatibility)
--  * specs can be market-specific (market_code NULL = all markets)
--  * consumption always carries its test cycle (consumption_measurements)
--  * prices: source + local currency for official/dealer, no overlapping
--    official MSRP periods
--  * tours: scenes, hotspots and the initial scene belong to ONE tour; only
--    real panoramas are scenes; publishing needs ready + licensed assets and
--    a market where the variant exists
--  * stations: connectors may exist without a known EVSE grouping; published
--    point count / connector quantity / free-text cost as provided by
--    sources; references between station children stay within one station;
--    AC/DC must match the connector type
--  * personal: logs/reminders/trips only reference the user's own cars
--  * value conditions: charger condition for charging times, canonical spec
--    units / value columns, BEVs only have electric range and no fuel use
-- Generated DDL first, then raw SQL (Prisma ignores CHECKs, triggers,
-- partial and exclusion indexes when diffing).

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "consumption_kind" AS ENUM ('electricity', 'fuel');

-- CreateEnum
CREATE TYPE "consumption_mode" AS ENUM ('combined', 'charge_depleting', 'charge_sustaining', 'weighted');

-- DropForeignKey
ALTER TABLE "charging_logs" DROP CONSTRAINT "charging_logs_user_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "connectors" DROP CONSTRAINT "connectors_charging_point_id_fkey";

-- DropForeignKey
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_user_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "scene_hotspots" DROP CONSTRAINT "scene_hotspots_scene_id_fkey";

-- DropForeignKey
ALTER TABLE "scene_hotspots" DROP CONSTRAINT "scene_hotspots_target_scene_id_fkey";

-- DropIndex
DROP INDEX "vehicle_specifications_variant_id_spec_key_key";

-- AlterTable
ALTER TABLE "charging_stations" ADD COLUMN     "published_point_count" INTEGER,
ADD COLUMN     "usage_cost_text" TEXT;

-- AlterTable (station_id is back-filled from the charge point before NOT NULL)
ALTER TABLE "connectors" ADD COLUMN     "quantity" SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN     "station_id" UUID,
ALTER COLUMN "charging_point_id" DROP NOT NULL;
UPDATE "connectors" c SET "station_id" = p."station_id"
  FROM "charging_points" p WHERE p."id" = c."charging_point_id";
ALTER TABLE "connectors" ALTER COLUMN "station_id" SET NOT NULL;

-- AlterTable (tour_id is back-filled from the scene before NOT NULL)
ALTER TABLE "scene_hotspots" ADD COLUMN     "tour_id" UUID;
UPDATE "scene_hotspots" h SET "tour_id" = s."tour_id"
  FROM "tour_scenes" s WHERE s."id" = h."scene_id";
ALTER TABLE "scene_hotspots" ALTER COLUMN "tour_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_specifications" ADD COLUMN     "market_code" VARCHAR(8);

-- CreateTable
CREATE TABLE "variant_market_inlets" (
    "id" UUID NOT NULL,
    "variant_market_id" UUID NOT NULL,
    "connector_type_code" VARCHAR(32) NOT NULL,
    "current_type" "current_type" NOT NULL,
    "max_power_kw" DECIMAL(8,2),
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "variant_market_inlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumption_measurements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" VARCHAR(8),
    "cycle" "range_cycle" NOT NULL,
    "cycle_note" VARCHAR(100),
    "kind" "consumption_kind" NOT NULL,
    "mode" "consumption_mode",
    "value" DECIMAL(8,2) NOT NULL,
    "original_value" VARCHAR(50),
    "original_unit" VARCHAR(20),
    "conditions" TEXT,
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reliability" "reliability" NOT NULL DEFAULT 'unverified',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consumption_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variant_market_inlets_connector_type_code_current_type_idx" ON "variant_market_inlets"("connector_type_code", "current_type");

-- CreateIndex
CREATE UNIQUE INDEX "variant_market_inlets_variant_market_id_connector_type_code_key" ON "variant_market_inlets"("variant_market_id", "connector_type_code", "current_type");

-- CreateIndex
CREATE INDEX "consumption_measurements_variant_id_cycle_kind_idx" ON "consumption_measurements"("variant_id", "cycle", "kind");

-- CreateIndex
CREATE INDEX "consumption_measurements_market_code_idx" ON "consumption_measurements"("market_code");

-- CreateIndex
CREATE UNIQUE INDEX "charging_points_station_id_id_key" ON "charging_points"("station_id", "id");

-- CreateIndex
CREATE INDEX "connectors_station_id_idx" ON "connectors"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_station_id_id_key" ON "connectors"("station_id", "id");

-- CreateIndex
CREATE INDEX "scene_hotspots_tour_id_idx" ON "scene_hotspots"("tour_id");

-- CreateIndex
CREATE UNIQUE INDEX "tour_scenes_tour_id_id_key" ON "tour_scenes"("tour_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_vehicles_user_id_id_key" ON "user_vehicles"("user_id", "id");

-- CreateIndex
CREATE INDEX "vehicle_specifications_variant_id_spec_key_idx" ON "vehicle_specifications"("variant_id", "spec_key");

-- CreateIndex
CREATE INDEX "vehicle_specifications_market_code_idx" ON "vehicle_specifications"("market_code");

-- AddForeignKey
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_tour_id_scene_id_fkey" FOREIGN KEY ("tour_id", "scene_id") REFERENCES "tour_scenes"("tour_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene_hotspots" ADD CONSTRAINT "scene_hotspots_tour_id_target_scene_id_fkey" FOREIGN KEY ("tour_id", "target_scene_id") REFERENCES "tour_scenes"("tour_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_user_id_user_vehicle_id_fkey" FOREIGN KEY ("user_id", "user_vehicle_id") REFERENCES "user_vehicles"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_user_vehicle_id_fkey" FOREIGN KEY ("user_id", "user_vehicle_id") REFERENCES "user_vehicles"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_station_id_charging_point_id_fkey" FOREIGN KEY ("station_id", "charging_point_id") REFERENCES "charging_points"("station_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_market_inlets" ADD CONSTRAINT "variant_market_inlets_variant_market_id_fkey" FOREIGN KEY ("variant_market_id") REFERENCES "variant_markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_market_inlets" ADD CONSTRAINT "variant_market_inlets_connector_type_code_fkey" FOREIGN KEY ("connector_type_code") REFERENCES "connector_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_market_inlets" ADD CONSTRAINT "variant_market_inlets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_specifications" ADD CONSTRAINT "vehicle_specifications_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_measurements" ADD CONSTRAINT "consumption_measurements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "vehicle_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_measurements" ADD CONSTRAINT "consumption_measurements_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_measurements" ADD CONSTRAINT "consumption_measurements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "specification_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Raw SQL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vehicle specifications: one row per variant × key × market scope.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "vehicle_specifications_global_uniq"
  ON "vehicle_specifications" ("variant_id", "spec_key") WHERE "market_code" IS NULL;
CREATE UNIQUE INDEX "vehicle_specifications_market_uniq"
  ON "vehicle_specifications" ("variant_id", "spec_key", "market_code") WHERE "market_code" IS NOT NULL;

-- Values are stored in the definition's canonical unit and in the value
-- column of its data type (a NULL unit is completed from the definition).
CREATE OR REPLACE FUNCTION vehicle_specifications_check_definition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d record;
BEGIN
  SELECT "data_type", "unit" INTO d FROM "spec_definitions" WHERE "key" = NEW."spec_key";
  IF NOT FOUND THEN
    RETURN NEW; -- the foreign key reports the unknown key
  END IF;
  IF NEW."unit" IS NULL THEN
    NEW."unit" := d."unit";
  ELSIF d."unit" IS NULL OR NEW."unit" <> d."unit" THEN
    RAISE EXCEPTION 'vehicle_specifications_unit_chk: spec % must be stored in its canonical unit % (got %)',
      NEW."spec_key", coalesce(d."unit", '(none)'), NEW."unit"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_specifications_unit_chk';
  END IF;
  IF (d."data_type" = 'number' AND (NEW."value_num" IS NULL OR NEW."value_text" IS NOT NULL OR NEW."value_bool" IS NOT NULL))
     OR (d."data_type" = 'text' AND (NEW."value_text" IS NULL OR NEW."value_num" IS NOT NULL OR NEW."value_bool" IS NOT NULL))
     OR (d."data_type" = 'boolean' AND (NEW."value_bool" IS NULL OR NEW."value_num" IS NOT NULL OR NEW."value_text" IS NOT NULL)) THEN
    RAISE EXCEPTION 'vehicle_specifications_value_type_chk: spec % is of type % and must use only the matching value column',
      NEW."spec_key", d."data_type"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_specifications_value_type_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER vehicle_specifications_check_definition
  BEFORE INSERT OR UPDATE ON "vehicle_specifications"
  FOR EACH ROW EXECUTE FUNCTION vehicle_specifications_check_definition();

-- -----------------------------------------------------------------------------
-- Ranges / consumption vs powertrain: a BEV has only electric range and no
-- fuel consumption (a "total" range belongs to hybrids).
-- -----------------------------------------------------------------------------
-- (One function per table: PL/pgSQL must not reference a column the row
-- type of the other table does not have.)
CREATE OR REPLACE FUNCTION range_measurements_powertrain_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."range_type" <> 'electric' AND EXISTS (
    SELECT 1 FROM "vehicle_variants" WHERE "id" = NEW."variant_id" AND "powertrain_type" = 'BEV'
  ) THEN
    RAISE EXCEPTION 'range_measurements_bev_electric_chk: a BEV only has an electric range'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'range_measurements_bev_electric_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION consumption_measurements_powertrain_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" <> 'electricity' AND EXISTS (
    SELECT 1 FROM "vehicle_variants" WHERE "id" = NEW."variant_id" AND "powertrain_type" = 'BEV'
  ) THEN
    RAISE EXCEPTION 'consumption_measurements_bev_electric_chk: a BEV has no fuel consumption'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'consumption_measurements_bev_electric_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER range_measurements_powertrain_check
  BEFORE INSERT OR UPDATE ON "range_measurements"
  FOR EACH ROW EXECUTE FUNCTION range_measurements_powertrain_check();
CREATE TRIGGER consumption_measurements_powertrain_check
  BEFORE INSERT OR UPDATE ON "consumption_measurements"
  FOR EACH ROW EXECUTE FUNCTION consumption_measurements_powertrain_check();

-- Changing a variant to BEV is refused while hybrid-only data exists.
CREATE OR REPLACE FUNCTION vehicle_variants_powertrain_change_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."powertrain_type" = 'BEV' AND OLD."powertrain_type" IS DISTINCT FROM NEW."powertrain_type" AND (
       EXISTS (SELECT 1 FROM "range_measurements" WHERE "variant_id" = NEW."id" AND "range_type" <> 'electric')
    OR EXISTS (SELECT 1 FROM "consumption_measurements" WHERE "variant_id" = NEW."id" AND "kind" <> 'electricity')
  ) THEN
    RAISE EXCEPTION 'vehicle_variants_powertrain_data_chk: variant % has total range or fuel consumption data and cannot become a BEV', NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_variants_powertrain_data_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER vehicle_variants_powertrain_change_check
  BEFORE UPDATE OF "powertrain_type" ON "vehicle_variants"
  FOR EACH ROW EXECUTE FUNCTION vehicle_variants_powertrain_change_check();

-- -----------------------------------------------------------------------------
-- Consumption measurements, inlets, charging times.
-- -----------------------------------------------------------------------------
ALTER TABLE "consumption_measurements" ADD CONSTRAINT "consumption_measurements_value_chk" CHECK ("value" > 0);
ALTER TABLE "consumption_measurements" ADD CONSTRAINT "consumption_measurements_other_cycle_chk" CHECK ("cycle" <> 'OTHER' OR "cycle_note" IS NOT NULL);
ALTER TABLE "variant_market_inlets" ADD CONSTRAINT "variant_market_inlets_power_chk" CHECK ("max_power_kw" IS NULL OR "max_power_kw" > 0);
-- Charging time always states the charger condition: a power in kW or, when
-- the source gives none, a written condition.
ALTER TABLE "charging_time_measurements" ADD CONSTRAINT "charging_time_measurements_condition_chk" CHECK (
  "charger_power_kw" IS NOT NULL OR nullif(btrim("conditions"), '') IS NOT NULL
);

-- AC/DC of a connector or inlet must be supported by its connector type
-- (e.g. CHAdeMO is DC-only).
CREATE OR REPLACE FUNCTION connector_current_type_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
BEGIN
  SELECT "supports_ac", "supports_dc" INTO t FROM "connector_types" WHERE "code" = NEW."connector_type_code";
  IF FOUND AND ((NEW."current_type" = 'AC' AND NOT t."supports_ac") OR (NEW."current_type" = 'DC' AND NOT t."supports_dc")) THEN
    RAISE EXCEPTION '%_current_type_chk: % does not support % charging', TG_TABLE_NAME, NEW."connector_type_code", NEW."current_type"
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_current_type_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER connectors_current_type_check
  BEFORE INSERT OR UPDATE ON "connectors"
  FOR EACH ROW EXECUTE FUNCTION connector_current_type_check();
CREATE TRIGGER variant_market_inlets_current_type_check
  BEFORE INSERT OR UPDATE ON "variant_market_inlets"
  FOR EACH ROW EXECUTE FUNCTION connector_current_type_check();

-- -----------------------------------------------------------------------------
-- Prices: official MSRP / dealer prices need a source and the market's own
-- currency (anything converted is a labelled market_estimate); official MSRP
-- periods of one variant × market never overlap.
-- -----------------------------------------------------------------------------
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_source_chk" CHECK (
  "price_type" = 'market_estimate' OR "source_id" IS NOT NULL
);

CREATE OR REPLACE FUNCTION price_history_currency_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  local_currency text;
BEGIN
  IF NEW."price_type" IN ('official_msrp', 'dealer') THEN
    SELECT "currency_code" INTO local_currency FROM "markets" WHERE "code" = NEW."market_code";
    IF FOUND AND NEW."currency_code" <> local_currency THEN
      RAISE EXCEPTION 'price_history_local_currency_chk: % prices in market % must be in %, not % (a converted price is a market_estimate)',
        NEW."price_type", NEW."market_code", local_currency, NEW."currency_code"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'price_history_local_currency_chk';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER price_history_currency_check
  BEFORE INSERT OR UPDATE ON "price_history"
  FOR EACH ROW EXECUTE FUNCTION price_history_currency_check();

ALTER TABLE "price_history" ADD CONSTRAINT "price_history_official_no_overlap"
  EXCLUDE USING gist (
    "variant_id" WITH =,
    "market_code" WITH =,
    daterange("effective_from", "effective_to", '[]') WITH &&
  ) WHERE ("price_type" = 'official_msrp');

-- -----------------------------------------------------------------------------
-- Stations.
-- -----------------------------------------------------------------------------
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_quantity_chk" CHECK ("quantity" >= 1);
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_published_point_count_chk" CHECK (
  "published_point_count" IS NULL OR "published_point_count" >= 1
);

-- Charge points and connectors never move to another station (their
-- tariffs, observations, reports and check-ins would point across stations).
CREATE OR REPLACE FUNCTION station_child_station_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."station_id" <> OLD."station_id" THEN
    RAISE EXCEPTION '%_station_immutable_chk: station_id cannot change', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_station_immutable_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER charging_points_station_immutable
  BEFORE UPDATE OF "station_id" ON "charging_points"
  FOR EACH ROW EXECUTE FUNCTION station_child_station_immutable();
CREATE TRIGGER connectors_station_immutable
  BEFORE UPDATE OF "station_id" ON "connectors"
  FOR EACH ROW EXECUTE FUNCTION station_child_station_immutable();

-- Tariffs, availability observations, reports and check-ins: the referenced
-- charge point / connector must belong to the row's station (and the
-- connector to the charge point when both are given).
CREATE OR REPLACE FUNCTION station_child_refs_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  sid uuid := (j->>'station_id')::uuid;
  pid uuid := (j->>'charging_point_id')::uuid;
  cid uuid := (j->>'connector_id')::uuid;
  c record;
BEGIN
  IF pid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "charging_points" WHERE "id" = pid AND "station_id" = sid
  ) THEN
    RAISE EXCEPTION '%_station_refs_chk: charge point % does not belong to station %', TG_TABLE_NAME, pid, sid
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_station_refs_chk';
  END IF;
  IF cid IS NOT NULL THEN
    SELECT "station_id", "charging_point_id" INTO c FROM "connectors" WHERE "id" = cid;
    IF FOUND AND (c."station_id" <> sid
        OR (pid IS NOT NULL AND c."charging_point_id" IS NOT NULL AND c."charging_point_id" <> pid)) THEN
      RAISE EXCEPTION '%_station_refs_chk: connector % does not belong to station % / charge point %', TG_TABLE_NAME, cid, sid, pid
        USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_station_refs_chk';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tariffs_station_refs_check
  BEFORE INSERT OR UPDATE ON "tariffs"
  FOR EACH ROW EXECUTE FUNCTION station_child_refs_check();
CREATE TRIGGER availability_observations_station_refs_check
  BEFORE INSERT OR UPDATE ON "availability_observations"
  FOR EACH ROW EXECUTE FUNCTION station_child_refs_check();
CREATE TRIGGER station_reports_station_refs_check
  BEFORE INSERT OR UPDATE ON "station_reports"
  FOR EACH ROW EXECUTE FUNCTION station_child_refs_check();
CREATE TRIGGER station_checkins_station_refs_check
  BEFORE INSERT OR UPDATE ON "station_checkins"
  FOR EACH ROW EXECUTE FUNCTION station_child_refs_check();

-- -----------------------------------------------------------------------------
-- Interior tours (§8): only real panoramas are scenes; the initial scene
-- belongs to the tour; publishing needs ready + licensed assets and a
-- market in which the variant exists.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tour_scenes_asset_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a record;
BEGIN
  SELECT "kind", "projection" INTO a FROM "media_assets" WHERE "id" = NEW."asset_id";
  IF FOUND AND (a."kind" <> 'panorama' OR a."projection" IS NULL OR a."projection" NOT IN ('equirectangular', 'cubemap')) THEN
    RAISE EXCEPTION 'tour_scenes_panorama_chk: tour scene asset % is not a 360° panorama (kind %, projection %)',
      NEW."asset_id", a."kind", coalesce(a."projection"::text, 'none')
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tour_scenes_panorama_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tour_scenes_asset_check
  BEFORE INSERT OR UPDATE OF "asset_id" ON "tour_scenes"
  FOR EACH ROW EXECUTE FUNCTION tour_scenes_asset_check();

CREATE OR REPLACE FUNCTION media_assets_tour_scene_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."kind" <> 'panorama' OR NEW."projection" IS NULL OR NEW."projection" NOT IN ('equirectangular', 'cubemap'))
     AND EXISTS (SELECT 1 FROM "tour_scenes" WHERE "asset_id" = NEW."id") THEN
    RAISE EXCEPTION 'tour_scenes_panorama_chk: asset % is used by a tour scene and must stay a 360° panorama', NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tour_scenes_panorama_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER media_assets_tour_scene_guard
  BEFORE UPDATE OF "kind", "projection" ON "media_assets"
  FOR EACH ROW EXECUTE FUNCTION media_assets_tour_scene_guard();

CREATE OR REPLACE FUNCTION interior_tours_integrity_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."initial_scene_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "tour_scenes" WHERE "id" = NEW."initial_scene_id" AND "tour_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'interior_tours_initial_scene_chk: the initial scene must be a scene of tour %', NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_initial_scene_chk';
  END IF;
  IF NEW."status" = 'published' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "variant_markets"
      WHERE "variant_id" = NEW."variant_id" AND "market_code" = NEW."market_code"
        AND "availability" IN ('available', 'coming_soon', 'discontinued')
    ) THEN
      RAISE EXCEPTION 'interior_tours_market_availability_chk: tour % cannot be published: variant is not offered in market %', NEW."id", NEW."market_code"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_market_availability_chk';
    END IF;
    IF NEW."initial_scene_id" IS NULL
       OR NOT EXISTS (SELECT 1 FROM "tour_scenes" WHERE "tour_id" = NEW."id")
       OR EXISTS (
         SELECT 1 FROM "tour_scenes" s JOIN "media_assets" a ON a."id" = s."asset_id"
         WHERE s."tour_id" = NEW."id" AND (a."status" <> 'ready' OR a."license_id" IS NULL)
       ) THEN
      RAISE EXCEPTION 'interior_tours_publish_assets_chk: tour % cannot be published: every scene needs a ready, licensed panorama and an initial scene', NEW."id"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'interior_tours_publish_assets_chk';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER interior_tours_integrity_check
  BEFORE INSERT OR UPDATE ON "interior_tours"
  FOR EACH ROW EXECUTE FUNCTION interior_tours_integrity_check();

-- -----------------------------------------------------------------------------
-- Personal data (§22 isolation): trip plans only reference the user's own car
-- (charging logs and reminders use composite foreign keys).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trip_plans_vehicle_owner_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."user_vehicle_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "user_vehicles" WHERE "id" = NEW."user_vehicle_id" AND "user_id" = NEW."user_id"
  ) THEN
    RAISE EXCEPTION 'trip_plans_vehicle_owner_chk: trip plan % references a car of another user', NEW."id"
      USING ERRCODE = 'check_violation', CONSTRAINT = 'trip_plans_vehicle_owner_chk';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trip_plans_vehicle_owner_check
  BEFORE INSERT OR UPDATE ON "trip_plans"
  FOR EACH ROW EXECUTE FUNCTION trip_plans_vehicle_owner_check();

-- -----------------------------------------------------------------------------
-- Reference data: comparison metadata (§7). Battery capacity is context, not a
-- "bigger wins" metric; consumption moved to consumption_measurements (with
-- its cycle); free-text ports were replaced by variant_market_inlets.
-- The reference seed keeps these in sync; this fixes existing databases.
-- -----------------------------------------------------------------------------
UPDATE "spec_definitions" SET "better_direction" = 'none'
  WHERE "key" IN ('battery.gross_kwh', 'battery.usable_kwh');
DELETE FROM "spec_definitions" d
  WHERE d."key" IN ('charging.ac_port', 'charging.dc_port', 'efficiency.consumption_wh_km', 'efficiency.fuel_l_100km')
    AND NOT EXISTS (SELECT 1 FROM "vehicle_specifications" v WHERE v."spec_key" = d."key")
    AND NOT EXISTS (SELECT 1 FROM "scene_hotspots" h WHERE h."spec_key" = d."key");
