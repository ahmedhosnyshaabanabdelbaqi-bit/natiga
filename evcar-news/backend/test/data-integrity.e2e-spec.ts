/**
 * Database integrity rules (migration 20260926000200_data_integrity). Each
 * case replays a probe from the review that the schema used to ACCEPT and
 * checks that it is now refused — and that the legitimate variant of the
 * same data is still accepted.
 */
import { randomUUID } from 'node:crypto';
import { DEMO_IDS as I, runDemoSeed } from '../src/cli/seed-data/demo-seed';
import { createTestApp, type TestApp } from './utils/test-app';

/** Resolves to the error text (message + driver metadata) or throws when the write succeeded. */
async function refused(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (err) {
    const e = err as { message?: string; meta?: unknown };
    return `${e.message ?? ''} ${JSON.stringify(e.meta ?? {})}`;
  }
  throw new Error('expected the database to refuse this write');
}

describe('Database integrity rules (e2e)', () => {
  let t: TestApp;
  let db: TestApp['prisma'];

  beforeAll(async () => {
    t = await createTestApp();
    db = t.prisma;
    await runDemoSeed(db);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('catalog', () => {
    it('specs can differ per market (warranty EG vs SA), still one row per scope', async () => {
      const base = { variantId: I.variantBev, specKey: 'warranty.vehicle_years', unit: 'year' };
      await db.vehicleSpecification.create({ data: { ...base, valueNum: '5' } });
      await db.vehicleSpecification.create({ data: { ...base, valueNum: '5', marketCode: 'EG' } });
      await db.vehicleSpecification.create({ data: { ...base, valueNum: '6', marketCode: 'SA' } });
      expect(
        await refused(
          db.vehicleSpecification.create({ data: { ...base, valueNum: '7', marketCode: 'SA' } }),
        ),
      ).toMatch(/vehicle_specifications_market_uniq|Unique constraint/);
      expect(
        await refused(db.vehicleSpecification.create({ data: { ...base, valueNum: '8' } })),
      ).toMatch(/vehicle_specifications_global_uniq|Unique constraint/);
    });

    it('specs are stored in the canonical unit and the value column of their type', async () => {
      expect(
        await refused(
          db.vehicleSpecification.create({
            data: {
              variantId: I.variantBev,
              specKey: 'dimensions.length_mm',
              valueNum: '15',
              unit: 'ft',
            },
          }),
        ),
      ).toMatch(/vehicle_specifications_unit_chk|canonical unit/);
      expect(
        await refused(
          db.vehicleSpecification.create({
            data: { variantId: I.variantBev, specKey: 'comfort.heat_pump', valueNum: '1' },
          }),
        ),
      ).toMatch(/vehicle_specifications_value_type_chk|value column/);
      // A missing unit is completed from the definition.
      const ok = await db.vehicleSpecification.create({
        data: { variantId: I.variantBev, specKey: 'dimensions.length_mm', valueNum: '4500' },
      });
      expect(ok.unit).toBe('mm');
    });

    it('a BEV has no "total" range and no fuel consumption', async () => {
      expect(
        await refused(
          db.rangeMeasurement.create({
            data: { variantId: I.variantBev, cycle: 'WLTP', rangeType: 'total', valueKm: '500' },
          }),
        ),
      ).toMatch(/range_measurements_bev_electric_chk|electric range/);
      expect(
        await refused(
          db.consumptionMeasurement.create({
            data: { variantId: I.variantBev, cycle: 'WLTP', kind: 'fuel', value: '1' },
          }),
        ),
      ).toMatch(/consumption_measurements_bev_electric_chk|fuel/);
      expect(
        await refused(
          db.vehicleVariant.update({
            where: { id: I.variantPhev },
            data: { powertrainType: 'BEV' },
          }),
        ),
      ).toMatch(/vehicle_variants_powertrain_data_chk|cannot become a BEV/);
    });

    it('consumption always carries its cycle (and a note for OTHER)', async () => {
      expect(
        await refused(
          db.consumptionMeasurement.create({
            data: { variantId: I.variantBev, cycle: 'OTHER', kind: 'electricity', value: '150' },
          }),
        ),
      ).toMatch(/consumption_measurements_other_cycle_chk/);
      const epa = await db.consumptionMeasurement.create({
        data: { variantId: I.variantBev, cycle: 'EPA', kind: 'electricity', value: '175' },
      });
      expect(epa.cycle).toBe('EPA');
    });

    it('comparison metadata: battery capacity is not a "bigger wins" metric', async () => {
      const defs = await db.specDefinition.findMany({
        where: { key: { in: ['battery.gross_kwh', 'battery.usable_kwh'] } },
      });
      expect(defs.map((d) => d.betterDirection)).toEqual(['none', 'none']);
      expect(
        await db.specDefinition.count({
          where: {
            key: {
              in: ['charging.ac_port', 'charging.dc_port', 'efficiency.consumption_wh_km'],
            },
          },
        }),
      ).toBe(0);
    });

    it('a charging time needs its charger condition (power or written condition)', async () => {
      const base = {
        variantId: I.variantBev,
        currentType: 'DC' as const,
        fromSoc: '10',
        toSoc: '80',
        durationMinutes: '28',
      };
      expect(await refused(db.chargingTimeMeasurement.create({ data: base }))).toMatch(
        /charging_time_measurements_condition_chk/,
      );
      await db.chargingTimeMeasurement.create({
        data: { ...base, conditions: 'Manufacturer: on a 150 kW+ DC charger' },
      });
    });

    it('charge inlets are structured per market and must match AC/DC of the plug type', async () => {
      await db.variantMarket.create({
        data: { variantId: I.variantBev, marketCode: 'SA', availability: 'available' },
      });
      const sa = await db.variantMarket.findUniqueOrThrow({
        where: { variantId_marketCode: { variantId: I.variantBev, marketCode: 'SA' } },
      });
      // Same trim, different inlet in another market (e.g. GB/T for an import).
      await db.variantMarketInlet.create({
        data: { variantMarketId: sa.id, connectorTypeCode: 'gbt_dc', currentType: 'DC' },
      });
      expect(
        await refused(
          db.variantMarketInlet.create({
            data: { variantMarketId: sa.id, connectorTypeCode: 'chademo', currentType: 'AC' },
          }),
        ),
      ).toMatch(/variant_market_inlets_current_type_chk|does not support/);
      const eg = await db.variantMarketInlet.findMany({
        where: { variantMarket: { variantId: I.variantBev, marketCode: 'EG' } },
        orderBy: { connectorTypeCode: 'asc' },
      });
      expect(eg.map((i) => [i.connectorTypeCode, i.currentType])).toEqual([
        ['ccs2', 'DC'],
        ['type2', 'AC'],
      ]);
    });
  });

  describe('prices', () => {
    const price = {
      variantId: I.variantPhev,
      marketCode: 'EG',
      priceType: 'official_msrp' as const,
      sourceId: I.source,
    };

    it('official prices need the market currency and a source', async () => {
      expect(
        await refused(
          db.priceHistory.create({
            data: {
              ...price,
              amount: '50000',
              currencyCode: 'USD',
              effectiveFrom: new Date('2026-01-01'),
            },
          }),
        ),
      ).toMatch(/price_history_local_currency_chk|must be in EGP/);
      expect(
        await refused(
          db.priceHistory.create({
            data: {
              ...price,
              sourceId: null,
              amount: '1500000',
              currencyCode: 'EGP',
              effectiveFrom: new Date('2026-01-01'),
            },
          }),
        ),
      ).toMatch(/price_history_source_chk/);
      // A converted/foreign-currency figure is only possible as a labelled estimate.
      await db.priceHistory.create({
        data: {
          ...price,
          priceType: 'market_estimate',
          sourceId: null,
          amount: '31000',
          currencyCode: 'USD',
          effectiveFrom: new Date('2026-01-01'),
        },
      });
    });

    it('official MSRP periods never overlap', async () => {
      await db.priceHistory.create({
        data: {
          ...price,
          amount: '1500000',
          currencyCode: 'EGP',
          effectiveFrom: new Date('2026-01-01'),
        },
      });
      expect(
        await refused(
          db.priceHistory.create({
            data: {
              ...price,
              amount: '1750000',
              currencyCode: 'EGP',
              effectiveFrom: new Date('2026-01-01'),
            },
          }),
        ),
      ).toMatch(/price_history_official_no_overlap|exclusion|conflicting key/i);
      // Closing the first period makes room for the next one.
      await db.priceHistory.updateMany({
        where: { variantId: I.variantPhev, priceType: 'official_msrp' },
        data: { effectiveTo: new Date('2026-06-30') },
      });
      await db.priceHistory.create({
        data: {
          ...price,
          amount: '1750000',
          currencyCode: 'EGP',
          effectiveFrom: new Date('2026-07-01'),
        },
      });
    });
  });

  describe('stations', () => {
    let s2: string;
    let s2Connector: string;

    beforeAll(async () => {
      const station = await db.chargingStation.create({
        data: {
          name: '[TEST] second station',
          latitude: 32.6,
          longitude: 30.6,
          countryCode: 'EG',
          timezone: 'Africa/Cairo',
          publishedPointCount: 4,
          usageCostText: 'as published by the source',
          isDemo: true,
        },
      });
      s2 = station.id;
      // Grouping unknown (e.g. Open Charge Map): connectors without a charge point.
      const c = await db.connector.create({
        data: { stationId: s2, connectorTypeCode: 'ccs2', currentType: 'DC', quantity: 2 },
      });
      s2Connector = c.id;
    });

    it('stores what the source publishes without inventing EVSEs', async () => {
      const station = await db.chargingStation.findUniqueOrThrow({
        where: { id: s2 },
        include: { connectors: true, points: true },
      });
      expect(station.publishedPointCount).toBe(4);
      expect(station.points).toHaveLength(0);
      expect(station.connectors[0]).toMatchObject({ chargingPointId: null, quantity: 2 });
      expect(
        await refused(
          db.connector.create({
            data: { stationId: s2, connectorTypeCode: 'type2', currentType: 'AC', quantity: 0 },
          }),
        ),
      ).toMatch(/connectors_quantity_chk/);
    });

    it('a connector must match the AC/DC capability of its type', async () => {
      expect(
        await refused(
          db.connector.create({
            data: { stationId: s2, connectorTypeCode: 'chademo', currentType: 'AC' },
          }),
        ),
      ).toMatch(/connectors_current_type_chk|does not support/);
    });

    it("a connector cannot hang under another station's charge point, nor move", async () => {
      expect(
        await refused(
          db.connector.create({
            data: {
              stationId: s2,
              chargingPointId: I.point,
              connectorTypeCode: 'type2',
              currentType: 'AC',
            },
          }),
        ),
      ).toMatch(/Foreign key|connectors_station_id_charging_point_id_fkey/i);
      expect(
        await refused(
          db.connector.update({ where: { id: s2Connector }, data: { stationId: I.station } }),
        ),
      ).toMatch(/connectors_station_immutable_chk|cannot change/);
    });

    it('observations, tariffs, reports and check-ins only reference their own station', async () => {
      const now = new Date();
      const later = new Date(now.getTime() + 60_000);
      expect(
        await refused(
          db.availabilityObservation.create({
            data: {
              provider: 'test',
              stationId: I.station,
              connectorId: s2Connector,
              status: 'available',
              observedAt: now,
              expiresAt: later,
            },
          }),
        ),
      ).toMatch(/availability_observations_station_refs_chk/);
      expect(
        await refused(
          db.tariff.create({
            data: { stationId: s2, chargingPointId: I.point, currencyCode: 'EGP' },
          }),
        ),
      ).toMatch(/tariffs_station_refs_chk/);
      expect(
        await refused(
          db.stationReport.create({
            data: { stationId: I.station, connectorId: s2Connector, type: 'connector_mismatch' },
          }),
        ),
      ).toMatch(/station_reports_station_refs_chk/);
      expect(
        await refused(
          db.stationCheckin.create({
            data: { stationId: I.station, connectorId: s2Connector, outcome: 'other' },
          }),
        ),
      ).toMatch(/station_checkins_station_refs_chk/);
      // Consistent references are fine.
      await db.availabilityObservation.create({
        data: {
          provider: 'test',
          stationId: s2,
          connectorId: s2Connector,
          status: 'unknown',
          observedAt: now,
          expiresAt: later,
        },
      });
    });
  });

  describe('interior tours', () => {
    let license: string;

    async function panorama(overrides: Record<string, unknown> = {}) {
      return db.mediaAsset.create({
        data: {
          kind: 'panorama',
          projection: 'equirectangular',
          status: 'ready',
          storageDriver: 'local',
          storageKey: `private/test/${randomUUID()}.jpg`,
          width: 8192,
          height: 4096,
          licenseId: license,
          isDemo: true,
          ...overrides,
        },
      });
    }

    async function tour(variantId: string, marketCode = 'EG') {
      return db.interiorTour.create({
        data: {
          slug: `t-${randomUUID()}`,
          variantId,
          marketCode,
          driveSide: 'lhd',
          interiorColorNameEn: 'Black',
          interiorColorNameAr: 'أسود',
          isDemo: true,
        },
      });
    }

    async function scene(tourId: string, assetId: string, key = 'driver') {
      return db.tourScene.create({ data: { tourId, key, assetId, position: 'driver_seat' } });
    }

    beforeAll(async () => {
      license = (
        await db.assetLicense.create({
          data: { licenseType: 'owned', rightsHolder: 'Test rights holder', isDemo: true },
        })
      ).id;
    });

    it('a flat image is never a 360° scene', async () => {
      const a = await tour(I.variantBev);
      const flat = await db.mediaAsset.create({
        data: {
          kind: 'image',
          projection: 'flat',
          status: 'ready',
          storageDriver: 'local',
          storageKey: `private/test/${randomUUID()}.jpg`,
          width: 1600,
          height: 900,
        },
      });
      expect(await refused(scene(a.id, flat.id))).toMatch(/tour_scenes_panorama_chk/);
      // …and a scene's panorama cannot be turned into a flat image later.
      const pano = await panorama();
      await scene(a.id, pano.id);
      expect(
        await refused(
          db.mediaAsset.update({ where: { id: pano.id }, data: { projection: 'flat' } }),
        ),
      ).toMatch(/tour_scenes_panorama_chk/);
    });

    it("hotspots and the initial scene never point into another trim's tour", async () => {
      const a = await tour(I.variantBev);
      const b = await tour(I.variantPhev);
      const sa = await scene(a.id, (await panorama()).id, 'driver');
      const sa2 = await scene(a.id, (await panorama()).id, 'rear');
      const sb = await scene(b.id, (await panorama()).id, 'driver');

      expect(
        await refused(
          db.sceneHotspot.create({
            data: {
              tourId: a.id,
              sceneId: sa.id,
              type: 'scene',
              yaw: 0,
              pitch: 0,
              targetSceneId: sb.id,
            },
          }),
        ),
      ).toMatch(/Foreign key|scene_hotspots_tour_id_target_scene_id_fkey/i);
      expect(
        await refused(
          db.sceneHotspot.create({
            data: { tourId: b.id, sceneId: sa.id, type: 'info', yaw: 0, pitch: 0 },
          }),
        ),
      ).toMatch(/Foreign key|scene_hotspots_tour_id_scene_id_fkey/i);
      await db.sceneHotspot.create({
        data: {
          tourId: a.id,
          sceneId: sa.id,
          type: 'scene',
          yaw: 10,
          pitch: 0,
          targetSceneId: sa2.id,
        },
      });

      expect(
        await refused(
          db.interiorTour.update({ where: { id: a.id }, data: { initialSceneId: sb.id } }),
        ),
      ).toMatch(/interior_tours_initial_scene_chk/);
      await db.interiorTour.update({ where: { id: a.id }, data: { initialSceneId: sa.id } });
    });

    it('publishing needs ready, licensed panoramas and a market where the variant exists', async () => {
      // Market where the variant is not offered.
      await db.variantMarket.create({
        data: { variantId: I.variantPhev, marketCode: 'AE', availability: 'not_available' },
      });
      const ae = await tour(I.variantPhev, 'AE');
      const sae = await scene(ae.id, (await panorama()).id);
      await db.interiorTour.update({ where: { id: ae.id }, data: { initialSceneId: sae.id } });
      expect(
        await refused(
          db.interiorTour.update({
            where: { id: ae.id },
            data: { status: 'published', publishedAt: new Date() },
          }),
        ),
      ).toMatch(/interior_tours_market_availability_chk/);

      // Unlicensed or still-processing panoramas block publishing.
      const eg = await tour(I.variantBev, 'EG');
      const unlicensed = await panorama({ licenseId: null });
      const s1 = await scene(eg.id, unlicensed.id);
      await db.interiorTour.update({ where: { id: eg.id }, data: { initialSceneId: s1.id } });
      const publish = () =>
        db.interiorTour.update({
          where: { id: eg.id },
          data: { status: 'published', publishedAt: new Date() },
        });
      expect(await refused(publish())).toMatch(/interior_tours_publish_assets_chk/);
      await db.mediaAsset.update({
        where: { id: unlicensed.id },
        data: { licenseId: license, status: 'processing' },
      });
      expect(await refused(publish())).toMatch(/interior_tours_publish_assets_chk/);
      await db.mediaAsset.update({ where: { id: unlicensed.id }, data: { status: 'ready' } });
      const published = await publish();
      expect(published.status).toBe('published');
    });
  });

  describe('personal data isolation', () => {
    it("a user's log, reminder or trip can only reference that user's own car", async () => {
      const [a, b] = await Promise.all(
        ['a', 'b'].map((x) =>
          db.user.create({
            data: { email: `iso-${x}-${randomUUID()}@example.com`, displayName: x },
          }),
        ),
      );
      const carB = await db.userVehicle.create({
        data: { userId: b.id, variantId: I.variantBev, marketCode: 'EG' },
      });
      expect(
        await refused(
          db.chargingLog.create({
            data: { userId: a.id, userVehicleId: carB.id, chargedAt: new Date(), energyKwh: '20' },
          }),
        ),
      ).toMatch(/Foreign key|charging_logs_user_id_user_vehicle_id_fkey/i);
      expect(
        await refused(
          db.reminder.create({
            data: {
              userId: a.id,
              userVehicleId: carB.id,
              type: 'maintenance',
              title: 'x',
              dueDate: new Date(),
            },
          }),
        ),
      ).toMatch(/Foreign key|reminders_user_id_user_vehicle_id_fkey/i);
      const trip = {
        originLabel: 'A',
        originLat: 30,
        originLng: 31,
        destinationLabel: 'B',
        destinationLat: 31,
        destinationLng: 31,
        startSocPercent: '80',
        minArrivalSocPercent: '15',
      };
      expect(
        await refused(
          db.tripPlan.create({ data: { ...trip, userId: a.id, userVehicleId: carB.id } }),
        ),
      ).toMatch(/trip_plans_vehicle_owner_chk/);
      // The owner can.
      await db.chargingLog.create({
        data: { userId: b.id, userVehicleId: carB.id, chargedAt: new Date(), energyKwh: '20' },
      });
      await db.tripPlan.create({ data: { ...trip, userId: b.id, userVehicleId: carB.id } });
    });
  });
});
