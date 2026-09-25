import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';
import type { StorageProvider } from '../../providers/storage/storage.types';
import {
  DEMO_PANORAMA_PREVIEW,
  DEMO_PANORAMA_RENDITION,
  DEMO_PANORAMA_SIZE,
  renderDemoPanorama,
  type DemoPanoramaScene,
} from './demo-panorama';

/**
 * Demo seed — ONLY clearly labelled FICTIONAL sample data for local/demo
 * environments (never production). Every row has isDemo = true where the
 * table supports it, names carry "Demo"/"تجريبي", and no real brand, real
 * news, real price or real address is used. Stable ids make it idempotent.
 */
export const DEMO_IDS = {
  source: 'd0000000-0000-4000-8000-000000000001',
  brand: 'd0000000-0000-4000-8000-000000000010',
  model: 'd0000000-0000-4000-8000-000000000011',
  generation: 'd0000000-0000-4000-8000-000000000012',
  modelYear: 'd0000000-0000-4000-8000-000000000013',
  variantBev: 'd0000000-0000-4000-8000-000000000014',
  variantPhev: 'd0000000-0000-4000-8000-000000000015',
  curve: 'd0000000-0000-4000-8000-000000000016',
  category: 'd0000000-0000-4000-8000-000000000020',
  article: 'd0000000-0000-4000-8000-000000000021',
  tag: 'd0000000-0000-4000-8000-000000000022',
  comparison: 'd0000000-0000-4000-8000-000000000040',
  operator: 'd0000000-0000-4000-8000-000000000030',
  station: 'd0000000-0000-4000-8000-000000000031',
  point: 'd0000000-0000-4000-8000-000000000032',
  connectorDc: 'd0000000-0000-4000-8000-000000000033',
  connectorAc: 'd0000000-0000-4000-8000-000000000034',
  tariff: 'd0000000-0000-4000-8000-000000000035',
  observation: 'd0000000-0000-4000-8000-000000000036',
  station2: 'd0000000-0000-4000-8000-000000000037',
  station2Point1: 'd0000000-0000-4000-8000-000000000038',
  station2Point2: 'd0000000-0000-4000-8000-000000000039',
  station2Connector1: 'd0000000-0000-4000-8000-00000000003a',
  station2Connector2: 'd0000000-0000-4000-8000-00000000003b',
  license: 'd0000000-0000-4000-8000-000000000050',
  panoramaDriver: 'd0000000-0000-4000-8000-000000000051',
  panoramaRear: 'd0000000-0000-4000-8000-000000000052',
  tour: 'd0000000-0000-4000-8000-000000000053',
  sceneDriver: 'd0000000-0000-4000-8000-000000000054',
  sceneRear: 'd0000000-0000-4000-8000-000000000055',
  hotspotInfo: 'd0000000-0000-4000-8000-000000000056',
  hotspotSpec: 'd0000000-0000-4000-8000-000000000057',
  hotspotToRear: 'd0000000-0000-4000-8000-000000000058',
  hotspotToDriver: 'd0000000-0000-4000-8000-000000000059',
  encyclopediaEntry: 'd0000000-0000-4000-8000-000000000060',
  serviceProvider: 'd0000000-0000-4000-8000-000000000061',
} as const;

const DEMO_NOTE = 'FICTIONAL demo data for testing layouts — not a real product, price or place.';

/**
 * Demo station position: open water in the Mediterranean, far from any
 * address, so a demo marker can never be mistaken for a real place.
 */
export const DEMO_STATION_LOCATION = { latitude: 32.5, longitude: 30.5 } as const;
/** Second demo station and the demo service centre: open water as well. */
export const DEMO_STATION_2_LOCATION = { latitude: 32.45, longitude: 31.0 } as const;
export const DEMO_SERVICE_PROVIDER_LOCATION = { latitude: 32.4, longitude: 30.2 } as const;

/** Arabic / English names shown for the demo station (never a real place). */
export const DEMO_STATION_NAME_AR = 'محطة تجريبية (Demo)';
const DEMO_ADDRESS_AR = 'عنوان تجريبي — ليس مكانًا حقيقيًا (Demo)';
const DEMO_ADDRESS_EN = 'Demo address — not a real place';

/** Storage prefix of the synthetic demo panoramas (public: served like any tour file). */
export const DEMO_PANORAMA_PREFIX = 'public/demo/panoramas';

export interface DemoSeedSummary {
  variants: number;
  articles: number;
  comparisons: number;
  stations: number;
  tours: number;
  encyclopediaEntries: number;
  serviceProviders: number;
}

export interface DemoSeedOptions {
  /**
   * Storage for the synthetic demo panorama files. Without it the demo 360°
   * tour is not created (a tour row must never point at missing files).
   */
  storage?: StorageProvider;
}

export async function runDemoSeed(
  prisma: PrismaClient,
  opts: DemoSeedOptions = {},
): Promise<DemoSeedSummary> {
  const market = await prisma.market.findUnique({ where: { code: 'EG' } });
  if (!market) throw new Error('Run the reference seed (npm run db:seed) before the demo seed.');

  await prisma.$transaction(
    async (tx) => {
      const I = DEMO_IDS;
      await tx.specificationSource.upsert({
        where: { id: I.source },
        create: {
          id: I.source,
          type: 'other',
          title: 'Demo data (fictional)',
          notes: DEMO_NOTE,
          isDemo: true,
        },
        update: {},
      });

      // --- vehicle hierarchy -------------------------------------------------
      await tx.brand.upsert({
        where: { id: I.brand },
        create: {
          id: I.brand,
          slug: 'demo-motors',
          nameEn: 'Demo Motors',
          nameAr: 'ديمو موتورز (تجريبي)',
          descriptionEn: DEMO_NOTE,
          descriptionAr: 'بيانات تجريبية وهمية لاختبار الواجهات.',
          status: 'published',
          isDemo: true,
        },
        update: {},
      });
      await tx.carModel.upsert({
        where: { id: I.model },
        create: {
          id: I.model,
          brandId: I.brand,
          slug: 'demo-motors-ev-one',
          nameEn: 'Demo EV One',
          nameAr: 'ديمو EV ون (تجريبي)',
          bodyType: 'crossover',
          status: 'published',
          isDemo: true,
        },
        update: {},
      });
      await tx.generation.upsert({
        where: { id: I.generation },
        create: {
          id: I.generation,
          modelId: I.model,
          slug: 'gen-1',
          nameEn: 'First generation (demo)',
          nameAr: 'الجيل الأول (تجريبي)',
          startYear: 2025,
          isDemo: true,
        },
        update: {},
      });
      await tx.modelYear.upsert({
        where: { id: I.modelYear },
        create: { id: I.modelYear, generationId: I.generation, year: 2025, isDemo: true },
        update: {},
      });
      // Same trim name, two powertrains: they are separate variants and never share specs.
      for (const v of [
        { id: I.variantBev, slug: 'demo-ev-one-2025-standard-bev', powertrainType: 'BEV' as const },
        {
          id: I.variantPhev,
          slug: 'demo-ev-one-2025-standard-phev',
          powertrainType: 'PHEV' as const,
        },
      ]) {
        await tx.vehicleVariant.upsert({
          where: { id: v.id },
          create: {
            id: v.id,
            modelYearId: I.modelYear,
            slug: v.slug,
            nameEn: 'Standard (demo)',
            nameAr: 'ستاندرد (تجريبي)',
            powertrainType: v.powertrainType,
            bodyType: 'crossover',
            driveType: 'fwd',
            seats: 5,
            doors: 5,
            status: 'published',
            publishedAt: new Date('2025-01-01T00:00:00Z'),
            isDemo: true,
          },
          update: {},
        });
        await tx.variantMarket.upsert({
          where: { variantId_marketCode: { variantId: v.id, marketCode: 'EG' } },
          create: {
            variantId: v.id,
            marketCode: 'EG',
            availability: 'available',
            driveSide: 'lhd',
            notes: DEMO_NOTE,
          },
          update: {},
        });
      }

      const specs: {
        variantId: string;
        specKey: string;
        valueNum?: string;
        valueText?: string;
        valueBool?: boolean;
        unit?: string;
      }[] = [
        { variantId: I.variantBev, specKey: 'battery.gross_kwh', valueNum: '64', unit: 'kWh' },
        { variantId: I.variantBev, specKey: 'battery.usable_kwh', valueNum: '60', unit: 'kWh' },
        { variantId: I.variantBev, specKey: 'charging.ac_max_kw', valueNum: '11', unit: 'kW' },
        { variantId: I.variantBev, specKey: 'charging.dc_peak_kw', valueNum: '150', unit: 'kW' },
        { variantId: I.variantBev, specKey: 'performance.power_kw', valueNum: '150', unit: 'kW' },
        { variantId: I.variantBev, specKey: 'charging.v2l', valueBool: true },
        { variantId: I.variantPhev, specKey: 'battery.usable_kwh', valueNum: '18', unit: 'kWh' },
        { variantId: I.variantPhev, specKey: 'charging.ac_max_kw', valueNum: '6.6', unit: 'kW' },
      ];
      for (const s of specs) {
        // Global rows (market_code NULL); unique per variant × key via a partial index.
        const exists = await tx.vehicleSpecification.findFirst({
          where: { variantId: s.variantId, specKey: s.specKey, marketCode: null },
          select: { id: true },
        });
        if (!exists) {
          await tx.vehicleSpecification.create({
            data: { ...s, sourceId: I.source, reliability: 'unverified', notes: DEMO_NOTE },
          });
        }
      }

      // Consumption always with its test cycle; the PHEV value is the weighted one.
      if (
        (await tx.consumptionMeasurement.count({
          where: { variantId: { in: [I.variantBev, I.variantPhev] } },
        })) === 0
      ) {
        await tx.consumptionMeasurement.createMany({
          data: [
            {
              variantId: I.variantBev,
              cycle: 'WLTP',
              kind: 'electricity',
              mode: 'combined',
              value: '160',
              sourceId: I.source,
              reliability: 'unverified',
              conditions: DEMO_NOTE,
            },
            {
              variantId: I.variantPhev,
              cycle: 'WLTP',
              kind: 'fuel',
              mode: 'weighted',
              value: '1.5',
              sourceId: I.source,
              reliability: 'unverified',
              conditions: DEMO_NOTE,
            },
          ],
        });
      }

      // Charging inlets per market (structured, for station compatibility).
      const bevEg = await tx.variantMarket.findUniqueOrThrow({
        where: { variantId_marketCode: { variantId: I.variantBev, marketCode: 'EG' } },
        select: { id: true },
      });
      for (const inlet of [
        { connectorTypeCode: 'ccs2', currentType: 'DC' as const, maxPowerKw: '150' },
        { connectorTypeCode: 'type2', currentType: 'AC' as const, maxPowerKw: '11' },
      ]) {
        await tx.variantMarketInlet.upsert({
          where: {
            variantMarketId_connectorTypeCode_currentType: {
              variantMarketId: bevEg.id,
              connectorTypeCode: inlet.connectorTypeCode,
              currentType: inlet.currentType,
            },
          },
          create: {
            variantMarketId: bevEg.id,
            ...inlet,
            sourceId: I.source,
            reliability: 'unverified',
            notes: DEMO_NOTE,
          },
          update: {},
        });
      }

      // Ranges carry their cycle; PHEV has separate electric and total range.
      if (
        (await tx.rangeMeasurement.count({
          where: { variantId: { in: [I.variantBev, I.variantPhev] } },
        })) === 0
      ) {
        await tx.rangeMeasurement.createMany({
          data: [
            {
              variantId: I.variantBev,
              cycle: 'WLTP',
              rangeType: 'electric',
              valueKm: '420',
              sourceId: I.source,
              reliability: 'unverified',
            },
            {
              variantId: I.variantPhev,
              cycle: 'WLTP',
              rangeType: 'electric',
              valueKm: '90',
              sourceId: I.source,
              reliability: 'unverified',
            },
            {
              variantId: I.variantPhev,
              cycle: 'WLTP',
              rangeType: 'total',
              valueKm: '900',
              sourceId: I.source,
              reliability: 'unverified',
            },
          ],
        });
        await tx.chargingTimeMeasurement.create({
          data: {
            variantId: I.variantBev,
            currentType: 'DC',
            fromSoc: '10',
            toSoc: '80',
            durationMinutes: '30',
            chargerPowerKw: '150',
            peakPowerKw: '150',
            conditions: DEMO_NOTE,
            sourceId: I.source,
            reliability: 'unverified',
          },
        });
      }
      await tx.chargingCurve.upsert({
        where: { id: I.curve },
        create: {
          id: I.curve,
          variantId: I.variantBev,
          currentType: 'DC',
          label: 'Demo curve (fictional)',
          chargerMaxPowerKw: '150',
          sourceId: I.source,
          reliability: 'unverified',
          points: {
            create: [
              { socPercent: '10', powerKw: '140' },
              { socPercent: '30', powerKw: '150' },
              { socPercent: '50', powerKw: '120' },
              { socPercent: '80', powerKw: '60' },
              { socPercent: '100', powerKw: '10' },
            ],
          },
        },
        update: {},
      });
      if ((await tx.priceHistory.count({ where: { variantId: I.variantBev } })) === 0) {
        await tx.priceHistory.create({
          data: {
            variantId: I.variantBev,
            marketCode: 'EG',
            amount: '1500000',
            currencyCode: 'EGP',
            priceType: 'official_msrp',
            effectiveFrom: new Date('2025-01-01'),
            sourceId: I.source,
            reliability: 'unverified',
            notes: DEMO_NOTE,
            isDemo: true,
          },
        });
      }

      // --- content ---------------------------------------------------------------
      await tx.category.upsert({
        where: { id: I.category },
        create: {
          id: I.category,
          slug: 'demo',
          sortOrder: 999,
          isDemo: true,
          translations: {
            create: [
              { locale: 'ar', name: 'تجريبي' },
              { locale: 'en', name: 'Demo' },
            ],
          },
        },
        // Databases seeded before the flag existed.
        update: { isDemo: true },
      });
      await tx.tag.upsert({
        where: { id: I.tag },
        create: {
          id: I.tag,
          slug: 'demo-tag',
          isDemo: true,
          translations: {
            create: [
              { locale: 'ar', name: 'وسم تجريبي' },
              { locale: 'en', name: 'Demo tag' },
            ],
          },
        },
        update: { isDemo: true },
      });
      await tx.article.upsert({
        where: { id: I.article },
        create: {
          id: I.article,
          slug: 'demo-sample-article',
          type: 'news',
          status: 'published',
          categoryId: I.category,
          authorName: 'Demo',
          originalLanguage: 'ar',
          publishedAt: new Date('2025-01-01T00:00:00Z'),
          isDemo: true,
          translations: {
            create: [
              {
                locale: 'ar',
                title: '[تجريبي] مقال تجريبي لاختبار واجهة الأخبار',
                summary: 'هذا نص تجريبي وهمي لاختبار عرض الأخبار فقط، وليس خبرًا حقيقيًا.',
                bodyHtml:
                  '<p>هذا مقال تجريبي وهمي أُنشئ لاختبار التصميم والقراءة. لا يحتوي على معلومات حقيقية.</p>',
                bodyText:
                  'هذا مقال تجريبي وهمي أُنشئ لاختبار التصميم والقراءة. لا يحتوي على معلومات حقيقية.',
              },
              {
                locale: 'en',
                title: '[DEMO] Sample article for testing the news layout',
                summary: 'Fictional placeholder text for layout testing only. Not real news.',
                bodyHtml:
                  '<p>This is a fictional demo article created to test layout and reading. It contains no real information.</p>',
                bodyText:
                  'This is a fictional demo article created to test layout and reading. It contains no real information.',
              },
            ],
          },
          vehicleLinks: { create: [{ variantId: I.variantBev }] },
          tags: { create: [{ tagId: I.tag }] },
        },
        update: {},
      });

      // --- comparisons -------------------------------------------------------------
      // A curated comparison of the two fictional variants (same trim name,
      // different powertrains): exercises electric vs total range handling.
      await tx.comparison.upsert({
        where: { id: I.comparison },
        create: {
          id: I.comparison,
          shareId: 'demo-cmp-0001',
          titleAr: '[تجريبي] مقارنة تجريبية: كهربائية بالكامل أم هجينة قابلة للشحن',
          titleEn: '[DEMO] Demo comparison: BEV vs PHEV (fictional)',
          marketCode: 'EG',
          isCurated: true,
          curatedStatus: 'published',
          curatedOrder: 999,
          isDemo: true,
          items: {
            create: [
              { variantId: I.variantBev, marketCode: 'EG', position: 1 },
              { variantId: I.variantPhev, marketCode: 'EG', position: 2 },
            ],
          },
        },
        update: {},
      });

      // --- stations (no real address; clearly labelled) ------------------------------
      await tx.chargingOperator.upsert({
        where: { id: I.operator },
        create: {
          id: I.operator,
          name: 'Demo Charging Operator (fictional)',
          nameAr: 'مشغل شحن تجريبي (وهمي)',
          isDemo: true,
        },
        update: {},
      });
      const station1Labels = {
        name: '[DEMO] Demo Charging Station (fictional)',
        nameAr: DEMO_STATION_NAME_AR,
        nameEn: '[DEMO] Demo Charging Station (fictional)',
        addressAr: DEMO_ADDRESS_AR,
        addressEn: DEMO_ADDRESS_EN,
        isDemo: true,
      };
      await tx.chargingStation.upsert({
        where: { id: I.station },
        create: {
          id: I.station,
          slug: 'demo-charging-station',
          ...station1Labels,
          operatorId: I.operator,
          // Open sea ~150 km off the Egyptian coast (Mediterranean): visible when
          // testing the EG map, but never a real street address (§22).
          latitude: DEMO_STATION_LOCATION.latitude,
          longitude: DEMO_STATION_LOCATION.longitude,
          countryCode: 'EG',
          marketCode: 'EG',
          timezone: 'Africa/Cairo',
          isAlwaysOpen: true,
          accessType: 'public',
          paymentMethods: ['app'],
          startMethods: ['app'],
          operationalStatus: 'operational',
          publicationStatus: 'published',
          dataSource: 'manual',
          dataLicense: 'Demo data (fictional)',
          attribution: DEMO_NOTE,
        },
        // Demo labelling converges on databases seeded by older versions.
        update: station1Labels,
      });
      await tx.chargingPoint.upsert({
        where: { id: I.point },
        create: {
          id: I.point,
          stationId: I.station,
          label: 'Demo EVSE 1',
          operationalStatus: 'operational',
        },
        update: {},
      });
      await tx.connector.upsert({
        where: { id: I.connectorDc },
        create: {
          id: I.connectorDc,
          stationId: I.station,
          chargingPointId: I.point,
          connectorTypeCode: 'ccs2',
          format: 'cable',
          currentType: 'DC',
          maxPowerKw: '150',
        },
        update: {},
      });
      await tx.connector.upsert({
        where: { id: I.connectorAc },
        create: {
          id: I.connectorAc,
          stationId: I.station,
          chargingPointId: I.point,
          connectorTypeCode: 'type2',
          format: 'socket',
          currentType: 'AC',
          maxPowerKw: '22',
          phases: 3,
        },
        update: {},
      });
      await tx.tariff.upsert({
        where: { id: I.tariff },
        create: {
          id: I.tariff,
          stationId: I.station,
          name: 'Demo tariff (fictional)',
          currencyCode: 'EGP',
          taxIncluded: null,
          sourceId: I.source,
          reliability: 'unverified',
          notes: DEMO_NOTE,
          isDemo: true,
          elements: {
            create: [
              { componentType: 'energy', price: '5', priceUnit: 'per_kwh', sortOrder: 1 },
              {
                componentType: 'idle',
                price: '2',
                priceUnit: 'per_minute',
                graceMinutes: 15,
                sortOrder: 2,
              },
            ],
          },
        },
        update: {},
      });

      // Provenance as a sync would write it (unique provider + external id).
      await tx.providerRecord.upsert({
        where: { provider_externalId: { provider: 'demo', externalId: 'demo-station-1' } },
        create: {
          provider: 'demo',
          externalId: 'demo-station-1',
          entityType: 'station',
          stationId: I.station,
          dataLicense: 'Demo data (fictional)',
          attribution: DEMO_NOTE,
        },
        update: {},
      });
      // A live-availability observation that EXPIRED long ago: consumers must
      // show "unknown", never "available" (REQUIREMENTS §11, §22).
      await tx.availabilityObservation.upsert({
        where: { id: I.observation },
        create: {
          id: I.observation,
          provider: 'demo',
          stationId: I.station,
          chargingPointId: I.point,
          connectorId: I.connectorDc,
          status: 'available',
          observedAt: new Date('2025-01-01T00:00:00Z'),
          expiresAt: new Date('2025-01-01T00:10:00Z'),
          rawPayload: { demo: true, note: DEMO_NOTE },
        },
        update: {},
      });

      // Second station: AC only, customers only, weekly opening hours
      // (closed on Friday) — exercises "open now" and access filters.
      const station2Labels = {
        name: '[DEMO] Demo AC Station 2 (fictional)',
        nameAr: 'محطة تجريبية 2 (Demo)',
        nameEn: '[DEMO] Demo AC Station 2 (fictional)',
        addressAr: DEMO_ADDRESS_AR,
        addressEn: DEMO_ADDRESS_EN,
        isDemo: true,
      };
      const week = [['08:00', '22:00']];
      await tx.chargingStation.upsert({
        where: { id: I.station2 },
        create: {
          id: I.station2,
          slug: 'demo-charging-station-2',
          ...station2Labels,
          operatorId: I.operator,
          latitude: DEMO_STATION_2_LOCATION.latitude,
          longitude: DEMO_STATION_2_LOCATION.longitude,
          countryCode: 'EG',
          marketCode: 'EG',
          timezone: 'Africa/Cairo',
          isAlwaysOpen: false,
          openingHours: {
            mon: week,
            tue: week,
            wed: week,
            thu: week,
            fri: [],
            sat: week,
            sun: week,
          },
          accessType: 'customers_only',
          accessRestrictions: 'Demo: customers of the (fictional) site only.',
          paymentMethods: ['rfid', 'app'],
          startMethods: ['rfid', 'app'],
          amenities: ['restroom', 'cafe'],
          operationalStatus: 'operational',
          publicationStatus: 'published',
          dataSource: 'manual',
          dataLicense: 'Demo data (fictional)',
          attribution: DEMO_NOTE,
        },
        update: station2Labels,
      });
      for (const [pointId, connectorId, label] of [
        [I.station2Point1, I.station2Connector1, 'Demo AC 1'],
        [I.station2Point2, I.station2Connector2, 'Demo AC 2'],
      ] as const) {
        await tx.chargingPoint.upsert({
          where: { id: pointId },
          create: { id: pointId, stationId: I.station2, label, operationalStatus: 'operational' },
          update: {},
        });
        await tx.connector.upsert({
          where: { id: connectorId },
          create: {
            id: connectorId,
            stationId: I.station2,
            chargingPointId: pointId,
            connectorTypeCode: 'type2',
            format: 'socket',
            currentType: 'AC',
            maxPowerKw: '22',
            phases: 3,
          },
          update: {},
        });
      }

      // --- encyclopedia & services directory ------------------------------------
      await tx.encyclopediaEntry.upsert({
        where: { id: I.encyclopediaEntry },
        create: {
          id: I.encyclopediaEntry,
          slug: 'demo-encyclopedia-entry',
          categoryKey: 'connectors',
          status: 'published',
          technicalReviewedAt: new Date('2025-01-01T00:00:00Z'),
          publishedAt: new Date('2025-01-01T00:00:00Z'),
          sortOrder: 999,
          isDemo: true,
          translations: {
            create: [
              {
                locale: 'ar',
                title: '[تجريبي] مادة موسوعة تجريبية',
                summary: 'نص تجريبي وهمي لاختبار عرض الموسوعة فقط.',
                bodyHtml:
                  '<p>هذه مادة تجريبية وهمية لاختبار التصميم فقط. لا تحتوي على معلومات تقنية.</p>',
                bodyText: 'هذه مادة تجريبية وهمية لاختبار التصميم فقط. لا تحتوي على معلومات تقنية.',
              },
              {
                locale: 'en',
                title: '[DEMO] Sample encyclopedia entry',
                summary: 'Fictional placeholder text for layout testing only.',
                bodyHtml:
                  '<p>This is a fictional demo entry for layout testing. It contains no technical information.</p>',
                bodyText:
                  'This is a fictional demo entry for layout testing. It contains no technical information.',
              },
            ],
          },
        },
        update: {},
      });
      await tx.serviceProvider.upsert({
        where: { id: I.serviceProvider },
        create: {
          id: I.serviceProvider,
          slug: 'demo-service-centre',
          type: 'service_center',
          nameAr: '[تجريبي] مركز خدمة تجريبي (Demo)',
          nameEn: '[DEMO] Demo service centre (fictional)',
          descriptionAr: 'بيانات تجريبية وهمية لاختبار دليل الخدمات.',
          descriptionEn: DEMO_NOTE,
          marketCode: 'EG',
          addressAr: DEMO_ADDRESS_AR,
          addressEn: DEMO_ADDRESS_EN,
          latitude: DEMO_SERVICE_PROVIDER_LOCATION.latitude,
          longitude: DEMO_SERVICE_PROVIDER_LOCATION.longitude,
          openingHours: { mon: week, tue: week, wed: week, thu: week, sat: week },
          services: ['battery_check'],
          // No phone / e-mail and NOT verified: nothing to call.
          status: 'published',
          isDemo: true,
        },
        update: {},
      });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  if (opts.storage) await seedDemoTour(prisma, opts.storage);

  return {
    variants: await prisma.vehicleVariant.count({ where: { isDemo: true } }),
    articles: await prisma.article.count({ where: { isDemo: true } }),
    comparisons: await prisma.comparison.count({ where: { isDemo: true } }),
    stations: await prisma.chargingStation.count({ where: { isDemo: true } }),
    tours: await prisma.interiorTour.count({ where: { isDemo: true } }),
    encyclopediaEntries: await prisma.encyclopediaEntry.count({ where: { isDemo: true } }),
    serviceProviders: await prisma.serviceProvider.count({ where: { isDemo: true } }),
  };
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Storage keys of one demo panorama (original + preview + 2048 rendition). */
export function demoPanoramaKeys(assetId: string) {
  const base = `${DEMO_PANORAMA_PREFIX}/${assetId}`;
  return {
    original: `${base}/original.jpg`,
    preview: `${base}/preview-1024.jpg`,
    rendition: `${base}/rendition-2048.jpg`,
  };
}

/**
 * Demo 360° tour of the fictional BEV (EG, LHD, "Demo grey"): two scenes
 * (driver, rear) with synthetic generated panoramas, an info hotspot, a
 * spec link and scene links both ways. Clearly labelled demo everywhere
 * (REQUIREMENTS §8: a demo panorama may test the viewer if it is labelled
 * and never attributed to a real car).
 */
async function seedDemoTour(prisma: PrismaClient, storage: StorageProvider): Promise<void> {
  const I = DEMO_IDS;
  const scenes: { scene: DemoPanoramaScene; assetId: string }[] = [
    { scene: 'driver', assetId: I.panoramaDriver },
    { scene: 'rear', assetId: I.panoramaRear },
  ];
  const files = new Map<string, { original: Buffer; preview: Buffer; rendition: Buffer }>();
  for (const { scene, assetId } of scenes) {
    const keys = demoPanoramaKeys(assetId);
    const f = await renderDemoPanorama(scene);
    files.set(assetId, f);
    const cache = { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' };
    for (const [key, body] of [
      [keys.original, f.original],
      [keys.preview, f.preview],
      [keys.rendition, f.rendition],
    ] as const) {
      if (!(await storage.exists(key))) await storage.put(key, body, cache);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.assetLicense.upsert({
        where: { id: I.license },
        create: {
          id: I.license,
          licenseType: 'owned',
          rightsHolder: 'EV Car News — synthetic demo image generated by the demo seed',
          attributionRequired: false,
          permittedUses: 'Viewer testing in demo environments only.',
          notes: DEMO_NOTE,
          isDemo: true,
        },
        update: {},
      });
      for (const { scene, assetId } of scenes) {
        const f = files.get(assetId)!;
        const keys = demoPanoramaKeys(assetId);
        await tx.mediaAsset.upsert({
          where: { id: assetId },
          create: {
            id: assetId,
            kind: 'panorama',
            projection: 'equirectangular',
            status: 'ready',
            storageDriver: storage.driver,
            storageKey: keys.original,
            originalFilename: `demo-${scene}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: f.original.length,
            width: DEMO_PANORAMA_SIZE.width,
            height: DEMO_PANORAMA_SIZE.height,
            checksumSha256: sha256(f.original),
            metadata: { demo: true, synthetic: true },
            processingProgress: 100,
            processedAt: new Date('2025-01-01T00:00:00Z'),
            licenseId: I.license,
            altTextEn: `[DEMO] Synthetic test panorama (${scene}) — not a real car interior`,
            altTextAr: `[تجريبي] بانوراما اصطناعية للاختبار (${scene === 'driver' ? 'السائق' : 'الخلف'}) — ليست مقصورة حقيقية`,
            isDemo: true,
          },
          update: {},
        });
        for (const v of [
          {
            kind: 'preview' as const,
            label: 'preview',
            storageKey: keys.preview,
            ...DEMO_PANORAMA_PREVIEW,
            sizeBytes: f.preview.length,
          },
          {
            kind: 'rendition' as const,
            label: '2048',
            storageKey: keys.rendition,
            ...DEMO_PANORAMA_RENDITION,
            sizeBytes: f.rendition.length,
          },
        ]) {
          await tx.assetVariant.upsert({
            where: { assetId_kind_label: { assetId, kind: v.kind, label: v.label } },
            create: { assetId, mimeType: 'image/jpeg', ...v },
            update: {},
          });
        }
      }

      await tx.interiorTour.upsert({
        where: { id: I.tour },
        create: {
          id: I.tour,
          slug: 'demo-ev-one-2025-standard-bev-eg-demo-grey',
          variantId: I.variantBev,
          marketCode: 'EG',
          driveSide: 'lhd',
          interiorColorNameEn: 'Demo grey (fictional)',
          interiorColorNameAr: 'رمادي تجريبي (وهمي)',
          interiorColorHex: '#8A8F98',
          titleEn: '[DEMO] Synthetic 360° test panorama — not a real car interior',
          titleAr: '[تجريبي] بانوراما 360° اصطناعية لاختبار العارض — ليست مقصورة سيارة حقيقية',
          descriptionEn: DEMO_NOTE,
          descriptionAr: 'صور اصطناعية مولدة لاختبار العارض فقط، وليست لسيارة حقيقية.',
          isDemo: true,
        },
        update: {},
      });
      const sceneRows = [
        {
          id: I.sceneDriver,
          key: 'driver',
          position: 'driver' as const,
          assetId: I.panoramaDriver,
          sortOrder: 1,
          titleEn: 'Driver seat (demo)',
          titleAr: 'مقعد السائق (تجريبي)',
          initialYaw: 0,
        },
        {
          id: I.sceneRear,
          key: 'rear',
          position: 'rear' as const,
          assetId: I.panoramaRear,
          sortOrder: 2,
          titleEn: 'Rear seats (demo)',
          titleAr: 'المقاعد الخلفية (تجريبي)',
          initialYaw: 0,
        },
      ];
      for (const row of sceneRows) {
        await tx.tourScene.upsert({
          where: { id: row.id },
          create: { ...row, tourId: I.tour, initialPitch: 0, initialHfov: 100 },
          update: {},
        });
      }
      const hotspots = [
        {
          id: I.hotspotInfo,
          sceneId: I.sceneDriver,
          type: 'info' as const,
          yaw: 0,
          pitch: -15,
          iconKey: 'info',
          texts: {
            ar: { title: '[تجريبي] نقطة معلومات', body: 'نص تجريبي لاختبار نقاط المعلومات فقط.' },
            en: { title: '[DEMO] Info hotspot', body: 'Demo text for testing info hotspots only.' },
          },
        },
        {
          id: I.hotspotSpec,
          sceneId: I.sceneDriver,
          type: 'spec_link' as const,
          yaw: 45,
          pitch: -10,
          specKey: 'battery.usable_kwh',
          iconKey: 'battery',
          texts: {
            ar: { title: '[تجريبي] مواصفة مرتبطة', body: null },
            en: { title: '[DEMO] Linked spec', body: null },
          },
        },
        {
          id: I.hotspotToRear,
          sceneId: I.sceneDriver,
          type: 'scene_link' as const,
          yaw: 180,
          pitch: -5,
          targetSceneId: I.sceneRear,
          targetYaw: 0,
          targetPitch: 0,
          iconKey: 'seat',
          texts: {
            ar: { title: 'إلى المقاعد الخلفية', body: null },
            en: { title: 'Go to the rear seats', body: null },
          },
        },
        {
          id: I.hotspotToDriver,
          sceneId: I.sceneRear,
          type: 'scene_link' as const,
          yaw: 0,
          pitch: -5,
          targetSceneId: I.sceneDriver,
          targetYaw: 0,
          targetPitch: 0,
          iconKey: 'seat',
          texts: {
            ar: { title: 'إلى مقعد السائق', body: null },
            en: { title: 'Go to the driver seat', body: null },
          },
        },
      ];
      for (const [index, { texts, ...h }] of hotspots.entries()) {
        await tx.sceneHotspot.upsert({
          where: { id: h.id },
          create: { ...h, tourId: I.tour, sortOrder: index + 1 },
          update: {},
        });
        for (const locale of ['ar', 'en'] as const) {
          await tx.sceneHotspotTranslation.upsert({
            where: { hotspotId_locale: { hotspotId: h.id, locale } },
            create: { hotspotId: h.id, locale, ...texts[locale] },
            update: {},
          });
        }
      }
      const tour = await tx.interiorTour.findUniqueOrThrow({
        where: { id: I.tour },
        select: { status: true },
      });
      if (tour.status !== 'published') {
        await tx.interiorTour.update({
          where: { id: I.tour },
          data: {
            initialSceneId: I.sceneDriver,
            status: 'published',
            publishedAt: new Date('2025-01-01T00:00:00Z'),
          },
        });
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}
