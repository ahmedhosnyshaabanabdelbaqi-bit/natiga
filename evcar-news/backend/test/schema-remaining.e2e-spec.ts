/**
 * Data model of the remaining app features (migration
 * 20260928000000_remaining_features): stations (provider records,
 * duplicates, suggestions, opening hours, time zones), media & 360° tours
 * (hotspot types, plain-text translations, publish rules incl. hotspot
 * media, files in use), personal data, notifications, community (owner
 * verification, votes, comments, Q&A, reports, blocks, spam), directory,
 * encyclopedia, ads, and the reference + demo seeds. Every refused case is
 * paired with the legitimate write.
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client';
import { ContentReportReason, StationReportType } from '../src/generated/prisma/enums';
import {
  DEMO_IDS as I,
  DEMO_STATION_NAME_AR,
  demoPanoramaKeys,
  runDemoSeed,
} from '../src/cli/seed-data/demo-seed';
import {
  AD_PLACEMENTS,
  CONNECTOR_TYPES,
  ENCYCLOPEDIA_CATEGORIES,
  REPORT_REASONS,
} from '../src/cli/seed-data/reference';
import { runReferenceSeed } from '../src/cli/seed-data/reference-seed';
import { fromPostgresCode } from '../src/common/filters/all-exceptions.filter';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import { createTestApp, type TestApp } from './utils/test-app';

/** Error text (message + driver metadata) of a refused write; throws when it succeeded. */
async function refused(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (err) {
    const e = err as { message?: string; meta?: unknown };
    return `${e.message ?? ''} ${JSON.stringify(e.meta ?? {})}`;
  }
  throw new Error('expected the database to refuse this write');
}

describe('Remaining features data model (e2e)', () => {
  let t: TestApp;
  let db: TestApp['prisma'];
  let storage: StorageProvider;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.prisma;
    storage = t.app.get<StorageProvider>(STORAGE_PROVIDER);
    await runDemoSeed(db, { storage });
  });
  afterAll(async () => {
    await t?.close();
  });

  const user = (label = 'u') =>
    db.user.create({
      data: { email: `${label}-${randomUUID()}@example.test`, displayName: label },
    });
  const baseStation = () => ({
    name: `Test station ${randomUUID()}`,
    latitude: 32.3,
    longitude: 30.3,
    countryCode: 'EG',
    timezone: 'Africa/Cairo',
    isDemo: true,
  });

  describe('reference and demo seeds', () => {
    it('seeds connector types incl. domestic sockets and ChaoJi, with AC/DC flags', async () => {
      const rows = await db.connectorType.findMany({ orderBy: { code: 'asc' } });
      expect(rows.map((r) => r.code)).toEqual(CONNECTOR_TYPES.map((c) => c.code).sort());
      const byCode = new Map(rows.map((r) => [r.code, r]));
      expect(byCode.get('schuko')).toMatchObject({ supportsAc: true, supportsDc: false });
      expect(byCode.get('bs1363')).toMatchObject({ supportsAc: true, supportsDc: false });
      expect(byCode.get('chaoji')).toMatchObject({ supportsAc: false, supportsDc: true });
      expect(byCode.get('chaoji')?.typicalMaxDcKw).toBeNull();
    });

    it('seeds encyclopedia categories, report reasons for every enum value and disabled ad placements', async () => {
      const cats = await db.encyclopediaCategory.findMany({ where: { isSystem: true } });
      expect(cats.map((c) => c.key).sort()).toEqual(
        ENCYCLOPEDIA_CATEGORIES.map((c) => c.key).sort(),
      );
      const reasons = await db.reportReason.findMany();
      expect(reasons).toHaveLength(REPORT_REASONS.length);
      expect(
        reasons
          .filter((r) => r.scope === 'station')
          .map((r) => r.code)
          .sort(),
      ).toEqual(Object.values(StationReportType).sort());
      expect(
        reasons
          .filter((r) => r.scope === 'content')
          .map((r) => r.code)
          .sort(),
      ).toEqual(Object.values(ContentReportReason).sort());
      const placements = await db.adPlacement.findMany();
      expect(placements.map((p) => p.key).sort()).toEqual(AD_PLACEMENTS.map((a) => a.key).sort());
      expect(placements.every((p) => !p.isEnabled)).toBe(true);
      // A label for a value that is not in the enum is refused.
      expect(
        await refused(
          db.reportReason.create({
            data: { scope: 'station', code: 'bogus', labelAr: 'س', labelEn: 'x' },
          }),
        ),
      ).toMatch(/report_reasons_code_chk/);
    });

    it('grants owner-verification review to community moderators', async () => {
      const role = await db.role.findUnique({
        where: { key: 'community_moderator' },
        include: { permissions: { include: { permission: true } } },
      });
      expect(role?.permissions.map((p) => p.permission.key)).toContain('community.verify_owners');
    });

    it('re-running the reference seed adds nothing and adopts placeholder categories', async () => {
      // A category created by the migration for an old entry topic (name = key).
      await db.encyclopediaCategory.delete({ where: { key: 'warranty' } });
      await db.encyclopediaCategory.create({
        data: { key: 'warranty', nameAr: 'warranty', nameEn: 'warranty' },
      });
      const summary = await runReferenceSeed(db);
      expect(summary).toMatchObject({
        encyclopediaCategoriesAdded: 0,
        reportReasonsAdded: 0,
        adPlacementsAdded: 0,
      });
      expect(
        await db.encyclopediaCategory.findUnique({ where: { key: 'warranty' } }),
      ).toMatchObject({ isSystem: true, nameEn: 'Warranty', nameAr: 'الضمان' });
    });

    it('demo stations are fictional, at sea, and their live status is expired', async () => {
      const s = await db.chargingStation.findUniqueOrThrow({ where: { id: I.station } });
      expect(s.nameAr).toBe(DEMO_STATION_NAME_AR);
      expect(s.isDemo).toBe(true);
      expect(s.addressEn).toMatch(/not a real place/);
      const obs = await db.availabilityObservation.findUniqueOrThrow({
        where: { id: I.observation },
      });
      expect(obs.expiresAt.getTime()).toBeLessThan(Date.now());
      const s2 = await db.chargingStation.findUniqueOrThrow({
        where: { id: I.station2 },
        include: { connectors: true, points: true },
      });
      expect(s2.points).toHaveLength(2);
      expect(s2.connectors.every((c) => c.currentType === 'AC')).toBe(true);
      expect(s2.openingHours).toMatchObject({ fri: [] });
    });

    it('the demo tour is published with synthetic, licensed, ready panoramas stored in storage', async () => {
      const tour = await db.interiorTour.findUniqueOrThrow({
        where: { id: I.tour },
        include: {
          scenes: { include: { asset: { include: { variants: true, license: true } } } },
        },
      });
      expect(tour).toMatchObject({
        status: 'published',
        isDemo: true,
        initialSceneId: I.sceneDriver,
      });
      expect(tour.titleEn).toMatch(/DEMO/);
      expect(tour.scenes.map((s) => s.position).sort()).toEqual(['driver', 'rear']);
      for (const scene of tour.scenes) {
        expect(scene.asset).toMatchObject({
          kind: 'panorama',
          projection: 'equirectangular',
          status: 'ready',
          width: 4096,
          height: 2048,
          isDemo: true,
        });
        expect(scene.asset.license?.isDemo).toBe(true);
        expect(scene.asset.variants.map((v) => v.kind).sort()).toEqual(['preview', 'rendition']);
        const keys = demoPanoramaKeys(scene.assetId);
        expect(await storage.exists(keys.original)).toBe(true);
        expect(await storage.exists(keys.preview)).toBe(true);
      }
      const hotspots = await db.sceneHotspot.findMany({
        where: { tourId: I.tour },
        include: { translations: true },
      });
      expect(hotspots.map((h) => h.type).sort()).toEqual([
        'info',
        'scene_link',
        'scene_link',
        'spec_link',
      ]);
      expect(hotspots.every((h) => h.translations.length === 2)).toBe(true);
      // Idempotent (also with storage).
      const again = await runDemoSeed(db, { storage });
      expect(again).toMatchObject({ tours: 1, stations: 2, encyclopediaEntries: 1 });
    });
  });

  describe('stations', () => {
    it('validates opening hours and never mixes them with 24/7', async () => {
      const ok = {
        mon: [['08:00', '22:00']],
        fri: [],
        sat: [
          ['22:00', '02:00'],
          ['10:00', '24:00'],
        ],
      };
      await db.chargingStation.create({ data: { ...baseStation(), openingHours: ok } });
      for (const bad of [
        { monday: [['08:00', '22:00']] },
        { mon: [['8:00', '22:00']] },
        { mon: [['08:00', '08:00']] },
        { mon: ['08:00-22:00'] },
        [['08:00', '22:00']],
      ]) {
        expect(
          await refused(
            db.chargingStation.create({ data: { ...baseStation(), openingHours: bad } }),
          ),
        ).toMatch(/charging_stations_opening_hours_chk/);
      }
      expect(
        await refused(
          db.chargingStation.create({
            data: { ...baseStation(), isAlwaysOpen: true, openingHours: ok },
          }),
        ),
      ).toMatch(/charging_stations_opening_hours_chk/);
    });

    it('refuses a time zone that is not IANA (422 with the rule name)', async () => {
      const err = await db.chargingStation
        .create({ data: { ...baseStation(), timezone: 'Mars/Olympus' } })
        .catch((e: unknown) => e);
      expect(String((err as Error).message)).toMatch(/charging_stations_timezone_chk/);
      expect(fromPostgresCode(err as Prisma.PrismaClientKnownRequestError)).toMatchObject({
        status: 422,
        details: { constraint: 'charging_stations_timezone_chk' },
      });
    });

    it('merged duplicates are never published; candidate pairs are ordered and unique', async () => {
      const a = await db.chargingStation.create({ data: baseStation() });
      const b = await db.chargingStation.create({ data: baseStation() });
      expect(
        await refused(
          db.chargingStation.update({
            where: { id: b.id },
            data: { duplicateOfId: a.id, publicationStatus: 'published' },
          }),
        ),
      ).toMatch(/charging_stations_duplicate_chk/);
      await db.chargingStation.update({
        where: { id: b.id },
        data: { duplicateOfId: a.id, publicationStatus: 'hidden' },
      });
      const [lo, hi] = [a.id, b.id].sort();
      expect(
        await refused(
          db.stationDuplicateCandidate.create({ data: { stationId: hi, otherStationId: lo } }),
        ),
      ).toMatch(/station_duplicate_candidates_order_chk/);
      await db.stationDuplicateCandidate.create({
        data: { stationId: lo, otherStationId: hi, distanceM: '12.5', nameSimilarity: '0.92' },
      });
      expect(
        await refused(
          db.stationDuplicateCandidate.create({ data: { stationId: lo, otherStationId: hi } }),
        ),
      ).toMatch(/Unique constraint|station_duplicate_candidates_station_id_other_station_id_key/);
    });

    it('provider records point at entities of their own station and survive a station delete', async () => {
      const a = await db.chargingStation.create({
        data: {
          ...baseStation(),
          connectors: { create: [{ connectorTypeCode: 'ccs2', currentType: 'DC' }] },
          points: { create: [{ label: 'P1' }] },
        },
        include: { connectors: true, points: true },
      });
      const b = await db.chargingStation.create({ data: baseStation() });
      expect(
        await refused(
          db.providerRecord.create({
            data: {
              provider: 'ocm',
              externalId: `conn:${randomUUID()}`,
              entityType: 'connector',
              stationId: b.id,
              connectorId: a.connectors[0].id,
            },
          }),
        ),
      ).toMatch(/provider_records_station_refs_chk/);
      expect(
        await refused(
          db.providerRecord.create({
            data: { provider: 'OCM!', externalId: 'x', entityType: 'station' },
          }),
        ),
      ).toMatch(/provider_records_provider_chk/);
      expect(
        await refused(
          db.providerRecord.create({
            data: { provider: 'ocm', externalId: 'y', entityType: 'pump' },
          }),
        ),
      ).toMatch(/provider_records_entity_type_chk/);
      const ext = `conn:${randomUUID()}`;
      await db.providerRecord.createMany({
        data: [
          {
            provider: 'ocm',
            externalId: `poi:${randomUUID()}`,
            entityType: 'station',
            stationId: a.id,
          },
          {
            provider: 'ocm',
            externalId: ext,
            entityType: 'connector',
            stationId: a.id,
            connectorId: a.connectors[0].id,
          },
          {
            provider: 'ocm',
            externalId: `evse:${randomUUID()}`,
            entityType: 'point',
            stationId: a.id,
            chargingPointId: a.points[0].id,
          },
        ],
      });
      // Hard delete (cascades children): provenance rows stay, links become NULL.
      await db.chargingStation.delete({ where: { id: a.id } });
      const rec = await db.providerRecord.findUniqueOrThrow({
        where: { provider_externalId: { provider: 'ocm', externalId: ext } },
      });
      expect(rec).toMatchObject({ stationId: null, connectorId: null });
    });

    it('user suggestions get a PostGIS location and need a review decision', async () => {
      const u = await user('suggest');
      const s = await db.stationSuggestion.create({
        data: {
          userId: u.id,
          name: 'اقتراح محطة (test)',
          latitude: 32.31,
          longitude: 30.31,
          countryCode: 'EG',
          connectors: [{ connectorTypeCode: 'type2', currentType: 'AC', maxPowerKw: 22 }],
        },
      });
      const [row] = await db.$queryRaw<{ lat: number; lng: number }[]>`
        SELECT ST_Y("location"::geometry) AS lat, ST_X("location"::geometry) AS lng
        FROM "station_suggestions" WHERE "id" = ${s.id}::uuid`;
      expect([row.lat, row.lng]).toEqual([32.31, 30.31]);
      expect(
        await refused(
          db.stationSuggestion.update({ where: { id: s.id }, data: { status: 'approved' } }),
        ),
      ).toMatch(/station_suggestions_review_chk/);
      expect(
        await refused(
          db.stationSuggestion.update({ where: { id: s.id }, data: { connectors: { ccs2: 1 } } }),
        ),
      ).toMatch(/station_suggestions_connectors_chk/);
      await db.stationSuggestion.update({
        where: { id: s.id },
        data: { status: 'duplicate', reviewedAt: new Date(), duplicateOfStationId: I.station },
      });
    });

    it('reports use the product vocabulary; check-ins record the car and waiting time', async () => {
      await db.stationReport.create({
        data: { stationId: I.station, connectorId: I.connectorDc, type: 'different_connector' },
      });
      expect(
        await refused(
          db.stationCheckin.create({
            data: { stationId: I.station, outcome: 'could_not_charge', waitMinutes: -1 },
          }),
        ),
      ).toMatch(/station_checkins_wait_chk/);
      await db.stationCheckin.create({
        data: {
          stationId: I.station,
          connectorId: I.connectorDc,
          variantId: I.variantBev,
          outcome: 'charged_successfully',
          observedPowerKw: '48.5',
          waitMinutes: 0,
        },
      });
    });
  });

  describe('media & 360° tours', () => {
    let license: string;

    const asset = (data: Partial<Prisma.MediaAssetUncheckedCreateInput> = {}) =>
      db.mediaAsset.create({
        data: {
          kind: 'panorama',
          projection: 'equirectangular',
          status: 'ready',
          storageDriver: 'local',
          storageKey: `private/test/${randomUUID()}.jpg`,
          width: 4096,
          height: 2048,
          licenseId: license,
          isDemo: true,
          ...data,
        },
      });

    async function draftTour(color = `Test ${randomUUID()}`) {
      const tour = await db.interiorTour.create({
        data: {
          slug: `t-${randomUUID()}`,
          variantId: I.variantBev,
          marketCode: 'EG',
          driveSide: 'lhd',
          interiorColorNameEn: color,
          interiorColorNameAr: 'لون اختبار',
          isDemo: true,
        },
      });
      const scene = await db.tourScene.create({
        data: { tourId: tour.id, key: 'driver', position: 'driver', assetId: (await asset()).id },
      });
      await db.interiorTour.update({ where: { id: tour.id }, data: { initialSceneId: scene.id } });
      return { tour, scene };
    }
    const publish = (id: string) =>
      db.interiorTour.update({
        where: { id },
        data: { status: 'published', publishedAt: new Date() },
      });

    beforeAll(async () => {
      license = (
        await db.assetLicense.create({
          data: { licenseType: 'owned', rightsHolder: 'Test rights holder', isDemo: true },
        })
      ).id;
    });

    it('a licence that requires attribution states the credit', async () => {
      expect(
        await refused(
          db.assetLicense.create({
            data: { licenseType: 'cc_by', rightsHolder: 'X', attributionRequired: true },
          }),
        ),
      ).toMatch(/asset_licenses_attribution_chk/);
      await db.assetLicense.create({
        data: {
          licenseType: 'cc_by',
          rightsHolder: 'X',
          attributionRequired: true,
          attributionText: 'Photo: X (CC BY 4.0)',
        },
      });
    });

    it('each hotspot type uses exactly its own fields and the right media kind', async () => {
      const { tour, scene } = await draftTour();
      const scene2 = await db.tourScene.create({
        data: { tourId: tour.id, key: 'rear', position: 'rear', assetId: (await asset()).id },
      });
      const h = { tourId: tour.id, sceneId: scene.id, yaw: 10, pitch: 0 };
      expect(
        await refused(
          db.sceneHotspot.create({ data: { ...h, type: 'info', targetSceneId: scene2.id } }),
        ),
      ).toMatch(/scene_hotspots_type_chk/);
      expect(await refused(db.sceneHotspot.create({ data: { ...h, type: 'scene_link' } }))).toMatch(
        /scene_hotspots_type_chk/,
      );
      expect(await refused(db.sceneHotspot.create({ data: { ...h, type: 'spec_link' } }))).toMatch(
        /scene_hotspots_type_chk/,
      );
      const video = await asset({ kind: 'video', projection: null, width: 1920, height: 1080 });
      expect(
        await refused(
          db.sceneHotspot.create({ data: { ...h, type: 'detail_image', mediaAssetId: video.id } }),
        ),
      ).toMatch(/scene_hotspots_media_kind_chk/);
      await db.sceneHotspot.create({ data: { ...h, type: 'video', mediaAssetId: video.id } });
      await db.sceneHotspot.create({
        data: { ...h, type: 'spec_link', specKey: 'battery.usable_kwh' },
      });
      await db.sceneHotspot.create({
        data: { ...h, type: 'scene_link', targetSceneId: scene2.id, targetYaw: 90 },
      });
    });

    it('hotspot texts are ar/en plain text only', async () => {
      const { tour, scene } = await draftTour();
      const hs = await db.sceneHotspot.create({
        data: { tourId: tour.id, sceneId: scene.id, type: 'info', yaw: 0, pitch: 0 },
      });
      expect(
        await refused(
          db.sceneHotspotTranslation.create({
            data: {
              hotspotId: hs.id,
              locale: 'ar',
              title: 'شاشة',
              body: '<img src=x onerror=alert(1)>',
            },
          }),
        ),
      ).toMatch(/scene_hotspot_translations_plain_text_chk/);
      expect(
        await refused(
          db.sceneHotspotTranslation.create({
            data: { hotspotId: hs.id, locale: 'fr', title: 'x' },
          }),
        ),
      ).toMatch(/scene_hotspot_translations_locale_chk/);
      await db.sceneHotspotTranslation.create({
        data: { hotspotId: hs.id, locale: 'en', title: 'Screen', body: 'Range < 400 km & 5 > 3' },
      });
    });

    it('publishing needs every hotspot image / video ready and licensed too', async () => {
      const { tour, scene } = await draftTour();
      const image = await asset({
        kind: 'image',
        projection: 'flat',
        width: 1600,
        height: 900,
        licenseId: null,
      });
      await db.sceneHotspot.create({
        data: {
          tourId: tour.id,
          sceneId: scene.id,
          type: 'detail_image',
          yaw: 0,
          pitch: 0,
          mediaAssetId: image.id,
        },
      });
      expect(await refused(publish(tour.id))).toMatch(/interior_tours_publish_assets_chk/);
      await db.mediaAsset.update({ where: { id: image.id }, data: { licenseId: license } });
      expect((await publish(tour.id)).status).toBe('published');
    });

    it('a published tour and its files stay consistent (checked at COMMIT / on the asset)', async () => {
      const { tour, scene } = await draftTour();
      await publish(tour.id);
      // A new scene whose file is still processing.
      const processing = await asset({ status: 'processing' });
      expect(
        await refused(
          db.tourScene.create({
            data: { tourId: tour.id, key: 'rear', position: 'rear', assetId: processing.id },
          }),
        ),
      ).toMatch(/interior_tours_publish_assets_chk/);
      // Swapping the scene file inside one transaction is fine when the new one is ready.
      const ready = await asset();
      await db.tourScene.update({ where: { id: scene.id }, data: { assetId: ready.id } });
      // The live file cannot lose its licence, leave "ready" or be deleted.
      for (const data of [
        { licenseId: null },
        { status: 'processing' as const },
        { deletedAt: new Date() },
      ]) {
        expect(await refused(db.mediaAsset.update({ where: { id: ready.id }, data }))).toMatch(
          /media_assets_in_use_chk/,
        );
      }
      // …nor through deleting its licence record.
      const own = await db.assetLicense.create({
        data: { licenseType: 'owned', rightsHolder: 'Y' },
      });
      await db.mediaAsset.update({ where: { id: ready.id }, data: { licenseId: own.id } });
      expect(await refused(db.assetLicense.delete({ where: { id: own.id } }))).toMatch(
        /media_assets_in_use_chk/,
      );
      // Unpublished → the file is free again.
      await db.interiorTour.update({ where: { id: tour.id }, data: { status: 'draft' } });
      await db.mediaAsset.update({ where: { id: ready.id }, data: { status: 'processing' } });
    });

    it('upload sessions record purpose, multipart parts and metadata', async () => {
      const base = {
        kind: 'panorama' as const,
        filename: 'pano.jpg',
        totalBytes: 10_000_000n,
        tempKey: `tmp/uploads/${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      };
      expect(
        await refused(db.uploadSession.create({ data: { ...base, purpose: 'Tour Scene' } })),
      ).toMatch(/upload_sessions_purpose_chk/);
      const s = await db.uploadSession.create({
        data: {
          ...base,
          purpose: 'tour_scene',
          multipartUploadId: 'abc',
          parts: [{ partNumber: 1, etag: '"e1"' }],
          metadata: { filename: 'pano.jpg' },
        },
      });
      expect(s.receivedBytes).toBe(0n);
    });
  });

  describe('personal data', () => {
    it('interests have exactly one target and are unique per user', async () => {
      const u = await user('interest');
      expect(
        await refused(
          db.userInterest.create({ data: { userId: u.id, brandId: I.brand, modelId: I.model } }),
        ),
      ).toMatch(/user_interests_target_chk/);
      await db.userInterest.create({ data: { userId: u.id, brandId: I.brand } });
      await db.userInterest.create({ data: { userId: u.id, modelId: I.model } });
      await db.userInterest.create({ data: { userId: u.id, categoryId: I.category } });
      expect(
        await refused(db.userInterest.create({ data: { userId: u.id, brandId: I.brand } })),
      ).toMatch(/Unique constraint/);
    });

    it('charging logs: SoC end after start, AC/DC optional; reminders by licence / km', async () => {
      const u = await user('garage');
      const car = await db.userVehicle.create({
        data: {
          userId: u.id,
          variantId: I.variantBev,
          marketCode: 'EG',
          currentOdometerKm: '12000',
          odometerUpdatedAt: new Date(),
        },
      });
      const log = { userId: u.id, userVehicleId: car.id, chargedAt: new Date(), energyKwh: '30' };
      expect(
        await refused(db.chargingLog.create({ data: { ...log, socStart: '80', socEnd: '20' } })),
      ).toMatch(/charging_logs_soc_order_chk/);
      await db.chargingLog.create({
        data: {
          ...log,
          socStart: '20',
          socEnd: '80',
          currentType: 'DC',
          locationType: 'public',
          stationId: I.station,
          cost: '150',
          currencyCode: 'EGP',
        },
      });
      expect(
        await refused(
          db.reminder.create({
            data: {
              userId: u.id,
              type: 'maintenance',
              title: 'Service',
              dueOdometerKm: '15000',
              repeatIntervalKm: '0',
            },
          }),
        ),
      ).toMatch(/reminders_km_chk/);
      await db.reminder.create({
        data: {
          userId: u.id,
          userVehicleId: car.id,
          type: 'licence',
          title: 'Licence renewal',
          dueDate: new Date('2027-01-01'),
          repeatIntervalMonths: 36,
        },
      });
      await db.reminder.create({
        data: {
          userId: u.id,
          userVehicleId: car.id,
          type: 'custom',
          title: 'Tyre rotation',
          dueOdometerKm: '20000',
          repeatIntervalKm: '10000',
          notifyKmBefore: '500',
        },
      });
    });
  });

  describe('notifications', () => {
    it('subscription columns match the topic and a repeated subscribe is a conflict', async () => {
      const u = await user('subs');
      expect(
        await refused(
          db.notificationSubscription.create({
            data: { userId: u.id, topicType: 'brand', brandId: I.brand, stationId: I.station },
          }),
        ),
      ).toMatch(/notification_subscriptions_target_chk/);
      expect(
        await refused(
          db.notificationSubscription.create({
            data: { userId: u.id, topicType: 'price_alert', variantId: I.variantBev },
          }),
        ),
      ).toMatch(/notification_subscriptions_target_chk/);
      const a = await db.notificationSubscription.create({
        data: { userId: u.id, topicType: 'brand', brandId: I.brand },
      });
      expect(a.targetKey).toBe(`brand:${I.brand}@*`);
      const b = await db.notificationSubscription.create({
        data: { userId: u.id, topicType: 'brand', brandId: I.brand, marketCode: 'EG' },
      });
      expect(b.targetKey).toBe(`brand:${I.brand}@EG`);
      const m = await db.notificationSubscription.create({
        data: { userId: u.id, topicType: 'market', marketCode: 'SA' },
      });
      expect(m.targetKey).toBe('market:SA');
      const p = await db.notificationSubscription.create({
        data: { userId: u.id, topicType: 'price_alert', variantId: I.variantBev, marketCode: 'EG' },
      });
      expect(p.targetKey).toBe(`price_alert:${I.variantBev}@EG`);
      expect(
        await refused(
          db.notificationSubscription.create({
            data: { userId: u.id, topicType: 'brand', brandId: I.brand },
          }),
        ),
      ).toMatch(/Unique constraint/);
    });

    it('preferences: IANA time zone, quiet hours need it; deep links are app paths or https', async () => {
      const u = await user('prefs');
      expect(
        await refused(
          db.notificationPreference.create({
            data: { userId: u.id, quietHoursStart: '22:00', quietHoursEnd: '07:00' },
          }),
        ),
      ).toMatch(/notification_preferences_quiet_hours_tz_chk/);
      expect(
        await refused(
          db.notificationPreference.create({ data: { userId: u.id, timezone: 'Cairo' } }),
        ),
      ).toMatch(/notification_preferences_timezone_chk/);
      await db.notificationPreference.create({
        data: {
          userId: u.id,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          timezone: 'Africa/Cairo',
          campaignsEnabled: false,
        },
      });
      const n = { userId: u.id, type: 'article.published', title: 't', locale: 'ar' };
      for (const deepLink of ['//evil.example/x', 'javascript:alert(1)', 'http://evcar.news/n/x']) {
        expect(await refused(db.notification.create({ data: { ...n, deepLink } }))).toMatch(
          /notifications_deep_link_chk/,
        );
      }
      await db.notification.create({ data: { ...n, deepLink: '/cars/demo-ev-one' } });
      await db.notification.create({ data: { ...n, deepLink: 'https://evcar.news/n/x' } });
    });

    it('deliveries are idempotent per channel / device and survive token deletion', async () => {
      const u = await user('push');
      const notif = await db.notification.create({
        data: { userId: u.id, type: 'reminder.due', title: 'Due', locale: 'en', dedupeKey: 'r:1' },
      });
      const [t1, t2] = await Promise.all(
        [1, 2].map((i) =>
          db.deviceToken.create({
            data: {
              userId: u.id,
              token: `tok-${i}-${randomUUID()}`,
              platform: 'android',
              provider: 'fcm',
              installationId: `inst-${i}`,
            },
          }),
        ),
      );
      await db.notificationDelivery.create({
        data: { notificationId: notif.id, channel: 'in_app' },
      });
      expect(
        await refused(
          db.notificationDelivery.create({ data: { notificationId: notif.id, channel: 'in_app' } }),
        ),
      ).toMatch(/notification_deliveries_channel_uq|Unique constraint/);
      for (const tk of [t1, t2]) {
        await db.notificationDelivery.create({
          data: { notificationId: notif.id, channel: 'push', deviceTokenId: tk.id },
        });
      }
      expect(
        await refused(
          db.notificationDelivery.create({
            data: { notificationId: notif.id, channel: 'push', deviceTokenId: t1.id },
          }),
        ),
      ).toMatch(/notification_deliveries_device_uq|Unique constraint/);
      expect(
        await refused(
          db.notificationDelivery.create({
            data: { notificationId: notif.id, channel: 'email', status: 'skipped' },
          }),
        ),
      ).toMatch(/notification_deliveries_skip_chk/);
      await db.deviceToken.deleteMany({ where: { id: { in: [t1.id, t2.id] } } });
      expect(
        await db.notificationDelivery.count({
          where: { notificationId: notif.id, channel: 'push', deviceTokenId: null },
        }),
      ).toBe(2);
    });
  });

  describe('community', () => {
    it('the verified-owner badge needs an approved verification of the same user and variant', async () => {
      const [owner, other] = await Promise.all([user('owner'), user('other')]);
      const pending = await db.ownerVerification.create({
        data: { userId: owner.id, variantId: I.variantBev, method: 'document_review' },
      });
      const review = {
        userId: owner.id,
        variantId: I.variantBev,
        rating: 4,
        body: 'Good car (test review)',
        locale: 'en',
      };
      expect(
        await refused(db.review.create({ data: { ...review, ownerVerificationId: pending.id } })),
      ).toMatch(/reviews_verified_owner_chk/);
      // Setting the flag directly has no effect (it mirrors the link).
      const r0 = await db.review.create({ data: { ...review, isVerifiedOwner: true } });
      expect(r0.isVerifiedOwner).toBe(false);
      await db.review.delete({ where: { id: r0.id } });

      expect(
        await refused(
          db.ownerVerification.update({ where: { id: pending.id }, data: { status: 'approved' } }),
        ),
      ).toMatch(/owner_verifications_review_chk/);
      const approved = await db.ownerVerification.update({
        where: { id: pending.id },
        data: { status: 'approved', reviewedAt: new Date() },
      });
      // Another user's verification, or another variant, cannot back the badge.
      expect(
        await refused(
          db.review.create({
            data: { ...review, userId: other.id, ownerVerificationId: approved.id },
          }),
        ),
      ).toMatch(/reviews_verified_owner_chk/);
      expect(
        await refused(
          db.review.create({
            data: { ...review, variantId: I.variantPhev, ownerVerificationId: approved.id },
          }),
        ),
      ).toMatch(/reviews_verified_owner_chk/);
      const r = await db.review.create({ data: { ...review, ownerVerificationId: approved.id } });
      expect(r.isVerifiedOwner).toBe(true);

      // Revoking removes the badge.
      await db.ownerVerification.update({
        where: { id: approved.id },
        data: { status: 'revoked' },
      });
      expect(await db.review.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
        isVerifiedOwner: false,
        ownerVerificationId: null,
      });

      // The garage car of a verification is the user's own car of that variant.
      const car = await db.userVehicle.create({
        data: { userId: other.id, variantId: I.variantBev, marketCode: 'EG' },
      });
      expect(
        await refused(
          db.ownerVerification.create({
            data: {
              userId: owner.id,
              variantId: I.variantBev,
              userVehicleId: car.id,
              method: 'dealer_confirmation',
            },
          }),
        ),
      ).toMatch(/owner_verifications_vehicle_chk/);
    });

    it('deleting the author anonymizes the review and removes the badge', async () => {
      const owner = await user('leaver');
      const v = await db.ownerVerification.create({
        data: {
          userId: owner.id,
          variantId: I.variantBev,
          method: 'document_review',
          status: 'approved',
          reviewedAt: new Date(),
        },
      });
      const r = await db.review.create({
        data: {
          userId: owner.id,
          variantId: I.variantBev,
          rating: 5,
          body: 'Leaving soon',
          locale: 'ar',
          ownerVerificationId: v.id,
        },
      });
      await db.spamSignal.create({
        data: { userId: owner.id, signal: 'rate_limited', ipHash: 'a'.repeat(64) },
      });
      await db.user.delete({ where: { id: owner.id } });
      expect(await db.review.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
        userId: null,
        isVerifiedOwner: false,
        ownerVerificationId: null,
      });
      expect(await db.spamSignal.count({ where: { ipHash: 'a'.repeat(64) } })).toBe(0);
    });

    it('votes keep the counters, one per user per target', async () => {
      const [author, v1, v2] = await Promise.all([user('a'), user('v1'), user('v2')]);
      const q = await db.question.create({
        data: { userId: author.id, title: 'Home charger?', locale: 'en', modelId: I.model },
      });
      await db.communityVote.create({
        data: { userId: v1.id, targetType: 'question', questionId: q.id, value: 1 },
      });
      const down = await db.communityVote.create({
        data: { userId: v2.id, targetType: 'question', questionId: q.id, value: -1 },
      });
      expect(await db.question.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({
        upvoteCount: 1,
        downvoteCount: 1,
      });
      await db.communityVote.update({ where: { id: down.id }, data: { value: 1 } });
      expect(await db.question.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({
        upvoteCount: 2,
        downvoteCount: 0,
      });
      await db.communityVote.delete({ where: { id: down.id } });
      expect((await db.question.findUniqueOrThrow({ where: { id: q.id } })).upvoteCount).toBe(1);
      expect(
        await refused(
          db.communityVote.create({
            data: { userId: v1.id, targetType: 'question', questionId: q.id, value: 1 },
          }),
        ),
      ).toMatch(/Unique constraint/);
      expect(
        await refused(
          db.communityVote.create({
            data: { userId: v2.id, targetType: 'answer', questionId: q.id, value: 1 },
          }),
        ),
      ).toMatch(/community_votes_target_chk/);
      expect(
        await refused(
          db.communityVote.create({
            data: { userId: v2.id, targetType: 'question', questionId: q.id, value: 5 },
          }),
        ),
      ).toMatch(/community_votes_value_chk/);
    });

    it('comments on car pages; a reply keeps its parent target; the accepted answer is an answer of the question', async () => {
      const u = await user('c');
      const top = await db.comment.create({
        data: { userId: u.id, modelId: I.model, body: 'Nice model' },
      });
      expect(
        await refused(
          db.comment.create({
            data: { userId: u.id, variantId: I.variantBev, parentId: top.id, body: 'reply' },
          }),
        ),
      ).toMatch(/comments_thread_chk/);
      await db.comment.create({
        data: { userId: u.id, modelId: I.model, parentId: top.id, body: 'reply' },
      });
      expect(
        await refused(
          db.comment.create({
            data: { userId: u.id, modelId: I.model, variantId: I.variantBev, body: 'x' },
          }),
        ),
      ).toMatch(/comments_target_chk/);

      const q1 = await db.question.create({ data: { title: 'Q1', locale: 'en' } });
      const q2 = await db.question.create({ data: { title: 'Q2', locale: 'en' } });
      const a2 = await db.answer.create({ data: { questionId: q2.id, body: 'A2' } });
      expect(
        await refused(
          db.question.update({ where: { id: q1.id }, data: { acceptedAnswerId: a2.id } }),
        ),
      ).toMatch(/questions_accepted_answer_chk/);
      await db.question.update({ where: { id: q2.id }, data: { acceptedAnswerId: a2.id } });
    });

    it('rating dimensions fit the review target; content hashes ignore diacritics and spacing', async () => {
      const u = await user('r');
      const r = await db.review.create({
        data: { userId: u.id, stationId: I.station, rating: 3, body: 'شاحن  سريع', locale: 'ar' },
      });
      expect(
        await refused(
          db.reviewRating.create({ data: { reviewId: r.id, dimension: 'comfort', score: 4 } }),
        ),
      ).toMatch(/review_ratings_dimension_chk/);
      expect(
        await refused(
          db.reviewRating.create({
            data: { reviewId: r.id, dimension: 'station_reliability', score: 6 },
          }),
        ),
      ).toMatch(/review_ratings_score_chk/);
      await db.reviewRating.create({
        data: { reviewId: r.id, dimension: 'station_reliability', score: 4 },
      });
      const c1 = await db.comment.create({ data: { articleId: I.article, body: 'شاحنٌ سريع' } });
      const c2 = await db.comment.create({ data: { articleId: I.article, body: ' شاحن   سريع ' } });
      expect(c1.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(c1.contentHash).toBe(c2.contentHash);
    });

    it('one open report per reporter and target; blocks and mutes are consistent', async () => {
      const [a, b] = await Promise.all([user('rep'), user('target')]);
      const report = {
        reporterId: a.id,
        targetType: 'user' as const,
        targetId: b.id,
        reason: 'spam' as const,
      };
      const first = await db.contentReport.create({ data: report });
      expect(await refused(db.contentReport.create({ data: report }))).toMatch(
        /content_reports_one_open_uq|Unique constraint/,
      );
      await db.contentReport.update({ where: { id: first.id }, data: { status: 'resolved' } });
      await db.contentReport.create({ data: report });

      expect(
        await refused(db.userMute.create({ data: { userId: a.id, mutedUserId: a.id } })),
      ).toMatch(/user_mutes_self_chk/);
      await db.userMute.create({ data: { userId: a.id, mutedUserId: b.id } });
      expect(
        await refused(db.userBlock.create({ data: { userId: b.id, scope: 'everything' } })),
      ).toMatch(/user_blocks_scope_chk/);
      await db.userBlock.create({ data: { userId: b.id, scope: 'community' } });
      expect(
        await refused(db.userBlock.create({ data: { userId: b.id, scope: 'community' } })),
      ).toMatch(/user_blocks_one_active_uq|Unique constraint/);
    });
  });

  describe('directory, encyclopedia, ads', () => {
    it('service providers: opening hours, sponsorship and the emergency type', async () => {
      const base = {
        type: 'emergency' as const,
        nameAr: 'خدمة طوارئ (اختبار)',
        nameEn: 'Emergency (test)',
        marketCode: 'EG',
        isDemo: true,
      };
      expect(
        await refused(
          db.serviceProvider.create({
            data: { ...base, slug: `sp-${randomUUID()}`, openingHours: { daily: [] } },
          }),
        ),
      ).toMatch(/service_providers_opening_hours_chk/);
      expect(
        await refused(
          db.serviceProvider.create({
            data: { ...base, slug: `sp-${randomUUID()}`, sponsoredUntil: new Date() },
          }),
        ),
      ).toMatch(/service_providers_sponsored_until_chk/);
      await db.serviceProvider.create({
        data: {
          ...base,
          slug: `sp-${randomUUID()}`,
          isAlwaysOpen: true,
          services: ['towing'],
          isSponsored: true,
          sponsorLabel: 'Sponsored',
          sponsoredUntil: new Date(Date.now() + 86_400_000),
        },
      });
    });

    it('encyclopedia entries belong to a known category and have ar/en texts', async () => {
      expect(
        await refused(
          db.encyclopediaEntry.create({ data: { slug: `e-${randomUUID()}`, categoryKey: 'nope' } }),
        ),
      ).toMatch(/Foreign key|encyclopedia_entries_category_key_fkey/i);
      const e = await db.encyclopediaEntry.create({
        data: { slug: `e-${randomUUID()}`, categoryKey: 'batteries' },
      });
      expect(
        await refused(
          db.encyclopediaEntryTranslation.create({
            data: { entryId: e.id, locale: 'de', title: 'x' },
          }),
        ),
      ).toMatch(/encyclopedia_entry_translations_locale_chk/);
      // Publishing still needs the technical review (phase-1 rule).
      expect(
        await refused(
          db.encyclopediaEntry.update({
            where: { id: e.id },
            data: { status: 'published', publishedAt: new Date() },
          }),
        ),
      ).toMatch(/encyclopedia_entries_review_chk/);
    });

    it('ad counters are anonymous daily totals', async () => {
      const campaign = await db.adCampaign.create({
        data: { name: 'Test', advertiserName: 'Advertiser (test)', isDemo: true },
      });
      const placement = await db.adPlacement.findUniqueOrThrow({
        where: { key: 'home.after_latest_news' },
      });
      const creative = await db.adCreative.create({
        data: {
          campaignId: campaign.id,
          placementId: placement.id,
          targetUrl: 'https://example.test/ad',
        },
      });
      for (let i = 0; i < 3; i++) {
        await db.$executeRaw`
          INSERT INTO "ad_daily_stats" ("creative_id", "day", "impressions", "clicks")
          VALUES (${creative.id}::uuid, CURRENT_DATE, 1, 0)
          ON CONFLICT ("creative_id", "day") DO UPDATE
            SET "impressions" = "ad_daily_stats"."impressions" + 1`;
      }
      expect(
        (await db.adDailyStat.findFirstOrThrow({ where: { creativeId: creative.id } })).impressions,
      ).toBe(3);
      expect(
        await refused(
          db.adCampaign.create({
            data: { name: 'x', advertiserName: 'y', disclosureLabelEn: '  ' },
          }),
        ),
      ).toMatch(/ad_campaigns_disclosure_chk/);
    });
  });
});
