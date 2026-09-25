/**
 * Public stations API: PostGIS search accuracy on known coordinates, filters,
 * "open now" in the station time zone (Cairo / Riyadh / Dubai), detail,
 * live availability expiry and vehicle compatibility. All stations here are
 * synthetic test rows; real coordinates are only used as geometry.
 */
import { FixedClock, STATIONS_CLOCK } from '../src/modules/stations/common/clock';
import { bearer, createAndLogin } from './auth-test-helpers';
import { userWithRoles } from './platform-helpers';
import {
  createStation,
  createVariantWithInlets,
  idsOf,
  type ListBody,
  uniq,
} from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Stations public API (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock();

  beforeAll(async () => {
    t = await createTestApp({
      override: (b) => b.overrideProvider(STATIONS_CLOCK).useValue(clock),
    });
  });
  afterAll(async () => {
    await t?.close();
  });
  afterEach(() => clock.set(null));

  const list = async (query: string, expected = 200) => {
    const res = await t.http().get(`/api/v1/stations?${query}`).expect(expected);
    return res.body as ListBody;
  };

  describe('geo search accuracy (known coordinates)', () => {
    // Around Tahrir Square, Cairo (30.0444 N, 31.2357 E) — geometry only.
    const lat = 30.0444;
    const lng = 31.2357;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      ids.center = (await createStation(t, { name: uniq('Test Geo Center'), lat, lng })).id;
      // 0.009° of latitude at 30° N ≈ 997.6 m (WGS84).
      ids.north1km = (
        await createStation(t, { name: uniq('Test Geo North'), lat: lat + 0.009, lng })
      ).id;
      // 0.104° of longitude at 30.04° N ≈ 10.03 km.
      ids.east10km = (
        await createStation(t, { name: uniq('Test Geo East'), lat, lng: lng + 0.104 })
      ).id;
      ids.draft = (
        await createStation(t, { lat: lat + 0.001, lng, publicationStatus: 'draft' })
      ).id;
      ids.hidden = (
        await createStation(t, { lat: lat + 0.002, lng, publicationStatus: 'hidden' })
      ).id;
      const deleted = await createStation(t, { lat: lat + 0.003, lng });
      await t.prisma.chargingStation.update({
        where: { id: deleted.id },
        data: { deletedAt: new Date() },
      });
      ids.deleted = deleted.id;
      const merged = await createStation(t, { lat: lat + 0.004, lng, publicationStatus: 'hidden' });
      await t.prisma.chargingStation.update({
        where: { id: merged.id },
        data: { duplicateOfId: ids.center },
      });
      ids.merged = merged.id;
    });

    it('radius search returns the nearest first with geodesic distances in metres', async () => {
      const body = await list(`lat=${lat}&lng=${lng}&radiusKm=5`);
      expect(idsOf(body)).toEqual([ids.center, ids.north1km]);
      expect(body.data[0].distanceM).toBe(0);
      expect(body.data[1].distanceM).toBeGreaterThanOrEqual(990);
      expect(body.data[1].distanceM).toBeLessThanOrEqual(1005);
      expect(body.meta).toMatchObject({ total: 2, truncated: false, nextCursor: null });
    });

    it('a larger radius reaches the station ~10 km east', async () => {
      const body = await list(`lat=${lat}&lng=${lng}&radiusKm=10.2`);
      expect(idsOf(body)).toEqual([ids.center, ids.north1km, ids.east10km]);
      expect(body.data[2].distanceM).toBeGreaterThan(9950);
      expect(body.data[2].distanceM).toBeLessThan(10100);
      const smaller = await list(`lat=${lat}&lng=${lng}&radiusKm=9.9`);
      expect(idsOf(smaller)).not.toContain(ids.east10km);
    });

    it('bbox search is exact at the edges (lat/lng rectangle)', async () => {
      const inside = await list(`bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.009}`);
      expect(idsOf(inside).sort()).toEqual([ids.center, ids.north1km].sort());
      const edge = await list(`bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.0089}`);
      expect(idsOf(edge)).toEqual([ids.center]);
    });

    it('unpublished, hidden, deleted and merged stations never appear', async () => {
      const body = await list(`lat=${lat}&lng=${lng}&radiusKm=2`);
      for (const k of ['draft', 'hidden', 'deleted', 'merged']) {
        expect(idsOf(body)).not.toContain(ids[k]);
      }
    });

    it('sort=name orders alphabetically', async () => {
      const body = await list(`lat=${lat}&lng=${lng}&radiusKm=11&sort=name`);
      const names = body.data.map((s) => s.name);
      expect(names).toEqual(
        [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      );
    });

    it.each([
      ['', 'bbox'],
      [`lat=${lat}`, 'bbox'],
      ['bbox=31.3,30.1,31.2,30.0', 'bbox'],
      ['bbox=1,2,3', 'bbox'],
      ['lat=95&lng=31', 'lat'],
      [`lat=${lat}&lng=${lng}&radiusKm=500`, 'radiusKm'],
      [`lat=${lat}&lng=${lng}&limit=501`, 'limit'],
    ])('invalid geo query "%s" → 422 on %s', async (query, field) => {
      const res = await t.http().get(`/api/v1/stations?${query}`).expect(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    });
  });

  describe('filters', () => {
    // Synthetic desert area (no real stations are implied).
    const lat = 27.5;
    const lng = 26.5;
    const near = `lat=${lat}&lng=${lng}&radiusKm=20`;
    const ids: Record<string, string> = {};
    let op1: string;

    beforeAll(async () => {
      op1 = (await t.prisma.chargingOperator.create({ data: { name: uniq('Test Operator One') } }))
        .id;
      const op2 = (
        await t.prisma.chargingOperator.create({ data: { name: uniq('Test Operator Two') } })
      ).id;
      ids.s1 = (
        await createStation(t, {
          name: uniq('Test Filter Hub'),
          lat,
          lng,
          operatorId: op1,
          amenities: ['cafe', 'restroom'],
          points: 2,
          connectors: [
            { type: 'ccs2', current: 'DC', kw: 150, quantity: 2, pointIndex: 0 },
            { type: 'type2', current: 'AC', kw: 22, pointIndex: 1 },
          ],
        })
      ).id;
      ids.s2 = (
        await createStation(t, {
          name: 'Test محطة الواحة',
          lat: lat + 0.01,
          lng,
          operatorId: op2,
          accessType: 'customers_only',
          amenities: ['cafe'],
          connectors: [{ type: 'type2', current: 'AC', kw: 7.4 }],
        })
      ).id;
      ids.s3 = (
        await createStation(t, {
          lat: lat + 0.02,
          lng,
          accessType: 'private',
          connectors: [{ type: 'chademo', current: 'DC', kw: 50 }],
        })
      ).id;
      ids.s4 = (
        await createStation(t, {
          lat: lat + 0.03,
          lng,
          connectors: [{ type: 'ccs2', current: 'DC', kw: null }],
        })
      ).id;
      ids.s5 = (
        await createStation(t, {
          lat: lat + 0.04,
          lng,
          connectors: [
            { type: 'type2', current: 'AC', kw: 22 },
            { type: 'ccs2', current: 'DC', kw: 50 },
          ],
        })
      ).id;
      ids.s6 = (
        await createStation(t, {
          lat: lat + 0.05,
          lng,
          operationalStatus: 'permanently_closed',
          connectors: [{ type: 'ccs2', current: 'DC', kw: 100 }],
        })
      ).id;
    });

    const sorted = (a: string[]) => [...a].sort();

    it('connector type (closed stations only with includeClosed)', async () => {
      expect(sorted(idsOf(await list(`${near}&connectorTypes=ccs2`)))).toEqual(
        sorted([ids.s1, ids.s4, ids.s5]),
      );
      expect(sorted(idsOf(await list(`${near}&connectorTypes=ccs2&includeClosed=true`)))).toEqual(
        sorted([ids.s1, ids.s4, ids.s5, ids.s6]),
      );
    });

    it('AC / DC', async () => {
      expect(sorted(idsOf(await list(`${near}&current=AC`)))).toEqual(
        sorted([ids.s1, ids.s2, ids.s5]),
      );
      expect(sorted(idsOf(await list(`${near}&current=DC`)))).toEqual(
        sorted([ids.s1, ids.s3, ids.s4, ids.s5]),
      );
    });

    it('min power ignores connectors of unknown power (never treated as 0 or as enough)', async () => {
      expect(idsOf(await list(`${near}&minPowerKw=100`))).toEqual([ids.s1]);
    });

    it('type, current and power must be met by ONE connector', async () => {
      // s5 has type2 (22 kW) and ccs2 (50 kW): "type2 ≥ 50 kW" does not exist there.
      expect(idsOf(await list(`${near}&connectorTypes=type2&minPowerKw=50`))).toEqual([]);
      expect(idsOf(await list(`${near}&connectorTypes=type2&current=DC`))).toEqual([]);
    });

    it('operator, access (public only) and amenities', async () => {
      expect(idsOf(await list(`${near}&operatorId=${op1}`))).toEqual([ids.s1]);
      expect(sorted(idsOf(await list(`${near}&access=public`)))).toEqual(
        sorted([ids.s1, ids.s4, ids.s5]),
      );
      expect(idsOf(await list(`${near}&amenities=cafe,restroom`))).toEqual([ids.s1]);
      expect(sorted(idsOf(await list(`${near}&amenities=cafe`)))).toEqual(sorted([ids.s1, ids.s2]));
    });

    it('text search is Arabic-normalized (ة ≈ ه)', async () => {
      expect(idsOf(await list(`${near}&q=${encodeURIComponent('الواحه')}`))).toEqual([ids.s2]);
      expect(idsOf(await list(`${near}&q=${encodeURIComponent('test operator one')}`))).toEqual([
        ids.s1,
      ]);
    });

    it('lightweight list items: powers, currents, plug counts (not cars at once)', async () => {
      const body = await list(`${near}&connectorTypes=ccs2&minPowerKw=100`);
      expect(body.data[0]).toMatchObject({
        id: ids.s1,
        maxPowerKw: 150,
        currentTypes: ['AC', 'DC'],
        connectorTypes: ['ccs2', 'type2'],
        connectorCount: 3,
        pointCount: 2,
        accessType: 'public',
        operationalStatus: 'operational',
        openNow: 'open',
        isAlwaysOpen: true,
        compatibility: null,
        availability: { status: 'unknown', availableConnectors: null, liveConnectors: 0 },
        isDemo: false,
        dataSource: 'manual',
      });
      const unknownPower = await list(`${near}&connectorTypes=ccs2&current=DC&access=public`);
      const s4 = unknownPower.data.find((s) => s.id === ids.s4);
      expect(s4?.maxPowerKw).toBeNull();
      expect(s4?.pointCount).toBeNull();
    });

    it('cursor pagination walks every match once', async () => {
      const first = await list(`${near}&limit=2`);
      expect(first.data).toHaveLength(2);
      expect(first.meta.total).toBe(5);
      const second = await list(`${near}&limit=2&cursor=${first.meta.nextCursor}`);
      const third = await list(`${near}&limit=2&cursor=${second.meta.nextCursor}`);
      expect(third.meta.nextCursor).toBeNull();
      const all = [...idsOf(first), ...idsOf(second), ...idsOf(third)];
      expect(new Set(all).size).toBe(5);
    });

    it('clusters aggregate the same filters for low zoom levels', async () => {
      const res = await t
        .http()
        .get(`/api/v1/stations/clusters?bbox=${lng - 1},${lat - 1},${lng + 1},${lat + 1}&zoom=3`)
        .expect(200);
      expect(res.body.meta.total).toBe(5);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ count: 5, stationId: null });
      const single = await t
        .http()
        .get(
          `/api/v1/stations/clusters?bbox=${lng - 1},${lat - 1},${lng + 1},${lat + 1}&zoom=12&operatorId=${op1}`,
        )
        .expect(200);
      expect(single.body.data).toEqual([expect.objectContaining({ count: 1, stationId: ids.s1 })]);
    });
  });

  describe('open now across time zones', () => {
    const lat = 25.0;
    const lng = 35.5;
    const near = `lat=${lat}&lng=${lng}&radiusKm=30`;
    const ids: Record<string, string> = {};
    const hours = { fri: [['22:00', '23:00']], thu: [['08:00', '20:00']] };

    beforeAll(async () => {
      for (const [key, tz, d] of [
        ['cairo', 'Africa/Cairo', 0],
        ['riyadh', 'Asia/Riyadh', 0.01],
        ['dubai', 'Asia/Dubai', 0.02],
      ] as const) {
        ids[key] = (
          await createStation(t, {
            name: uniq(`Test Hours ${key}`),
            lat: lat + d,
            lng,
            timezone: tz,
            isAlwaysOpen: false,
            openingHours: hours,
          })
        ).id;
      }
      ids.unknown = (
        await createStation(t, { lat: lat + 0.03, lng, isAlwaysOpen: null, openingHours: null })
      ).id;
      ids.always = (await createStation(t, { lat: lat + 0.04, lng, isAlwaysOpen: true })).id;
    });

    it('Friday 19:30 UTC: open in Cairo and Riyadh (22:30), closed in Dubai (23:30)', async () => {
      clock.set(new Date('2026-09-25T19:30:00Z'));
      const body = await list(near);
      const state = Object.fromEntries(body.data.map((s) => [s.id, s.openNow]));
      expect(state[ids.cairo]).toBe('open');
      expect(state[ids.riyadh]).toBe('open');
      expect(state[ids.dubai]).toBe('closed');
      expect(state[ids.unknown]).toBe('unknown');
      expect(state[ids.always]).toBe('open');

      const openNow = await list(`${near}&openNow=true`);
      expect(idsOf(openNow).sort()).toEqual([ids.cairo, ids.riyadh, ids.always].sort());

      const dubai = await t.http().get(`/api/v1/stations/${ids.dubai}`).expect(200);
      expect(dubai.body.data.hours).toMatchObject({
        timezone: 'Asia/Dubai',
        isAlwaysOpen: false,
        openNow: { state: 'closed', reason: 'schedule', localTime: '23:30' },
      });
      // Saturday..Wednesday are unknown days: the next opening is not known.
      expect(dubai.body.data.hours.openNow.opensAt).toBeNull();
      const cairo = await t.http().get(`/api/v1/stations/${ids.cairo}`).expect(200);
      expect(cairo.body.data.hours.openNow).toMatchObject({
        state: 'open',
        localTime: '22:30',
        closesAt: '2026-09-25T20:00:00.000Z',
      });
    });

    it('winter (no DST in Egypt): Cairo is closed at 21:30 while Riyadh is open at 22:30', async () => {
      clock.set(new Date('2026-12-04T19:30:00Z'));
      const body = await list(near);
      const state = Object.fromEntries(body.data.map((s) => [s.id, s.openNow]));
      expect(state[ids.cairo]).toBe('closed');
      expect(state[ids.riyadh]).toBe('open');
      expect(state[ids.dubai]).toBe('closed');
    });

    it('weekly view keeps unknown days apart from closed days', async () => {
      const res = await t.http().get(`/api/v1/stations/${ids.riyadh}`).expect(200);
      const weekly = res.body.data.hours.weekly as { day: string; windows: unknown }[];
      expect(weekly.find((d) => d.day === 'fri')?.windows).toEqual([
        { start: '22:00', end: '23:00' },
      ]);
      expect(weekly.find((d) => d.day === 'mon')?.windows).toBeNull();
      const unknown = await t.http().get(`/api/v1/stations/${ids.unknown}`).expect(200);
      expect(unknown.body.data.hours).toMatchObject({
        weekly: null,
        isAlwaysOpen: null,
        openNow: { state: 'unknown', reason: 'unknown_schedule' },
      });
    });
  });

  describe('station page', () => {
    let stationId: string;
    let connectorIds: string[];
    let pointIds: string[];

    beforeAll(async () => {
      const op = await t.prisma.chargingOperator.create({
        data: { name: 'Test Detail Operator', nameAr: 'مشغل اختبار', phone: '+20 000' },
      });
      const s = await createStation(t, {
        name: 'Test Detail Station',
        slug: `test-detail-${Date.now().toString(36)}`,
        lat: 24.0,
        lng: 36.0,
        operatorId: op.id,
        points: 2,
        amenities: ['restroom', 'unknown_code'],
        isAlwaysOpen: false,
        openingHours: { mon: [['08:00', '22:00']], fri: [] },
        connectors: [
          { type: 'ccs2', current: 'DC', kw: 120, pointIndex: 0 },
          { type: 'type2', current: 'AC', kw: 22, pointIndex: 1 },
          { type: 'chademo', current: 'DC', kw: 50, pointIndex: null },
        ],
      });
      stationId = s.id;
      connectorIds = s.connectorIds;
      pointIds = s.pointIds;
      await t.prisma.chargingStation.update({
        where: { id: stationId },
        data: {
          nameAr: 'محطة اختبار التفاصيل',
          nameEn: 'Test Detail Station',
          paymentMethods: ['app', 'bank_card'],
          startMethods: ['rfid'],
          accessEntranceNote: 'Test: entrance B',
          usageCostText: 'Test free text price',
        },
      });
      await t.prisma.tariff.create({
        data: {
          stationId,
          connectorId: connectorIds[0],
          name: 'Test DC tariff',
          currencyCode: 'EGP',
          taxIncluded: true,
          taxPercent: 14,
          validFrom: new Date('2026-01-01T00:00:00Z'),
          elements: {
            create: [
              { componentType: 'energy', price: '7.5', priceUnit: 'per_kwh', sortOrder: 0 },
              {
                componentType: 'idle',
                price: '1',
                priceUnit: 'per_minute',
                graceMinutes: 10,
                sortOrder: 1,
              },
            ],
          },
        },
      });
      await t.prisma.providerRecord.create({
        data: {
          provider: 'ocm',
          externalId: `test-${stationId}`,
          entityType: 'station',
          stationId,
          dataLicense: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://openchargemap.org/site/poi/details/1',
          attribution: '© Open Charge Map contributors (test row)',
          lastSyncedAt: new Date('2026-09-01T00:00:00Z'),
        },
      });
    });

    it('serves operator, address, hours, points → connectors, tariffs and provenance', async () => {
      const res = await t.http().get(`/api/v1/stations/${stationId}?lang=en`).expect(200);
      const d = res.body.data;
      expect(d).toMatchObject({
        id: stationId,
        name: 'Test Detail Station',
        nameAr: 'محطة اختبار التفاصيل',
        operator: { name: 'Test Detail Operator', phone: '+20 000' },
        accessEntranceNote: 'Test: entrance B',
        accessType: 'public',
        accessTypeLabel: 'Public',
        operationalStatus: 'operational',
        operationalStatusLabel: 'Operational',
        connectorCount: 3,
        pointCount: 2,
        usageCostText: 'Test free text price',
        photos: [],
        amenities: [
          { code: 'restroom', label: 'Restrooms' },
          { code: 'unknown_code', label: 'unknown_code' },
        ],
        paymentMethods: [
          { code: 'app', label: 'Operator app' },
          { code: 'bank_card', label: 'Bank card' },
        ],
        compatibility: null,
      });
      expect(d.points.map((p: { id: string }) => p.id).sort()).toEqual([...pointIds].sort());
      const dcPoint = d.points.find((p: { connectors: { id: string }[] }) =>
        p.connectors.some((c) => c.id === connectorIds[0]),
      );
      expect(dcPoint.connectors[0]).toMatchObject({
        connectorType: { code: 'ccs2' },
        currentType: 'DC',
        maxPowerKw: 120,
        quantity: 1,
        availability: { status: 'unknown', freshness: 'none', source: null },
        compatibility: null,
      });
      expect(d.unassignedConnectors).toHaveLength(1);
      expect(d.unassignedConnectors[0]).toMatchObject({ chargingPointId: null, maxPowerKw: 50 });

      expect(d.tariffs).toHaveLength(1);
      expect(d.tariffs[0]).toMatchObject({
        name: 'Test DC tariff',
        connectorId: connectorIds[0],
        currency: 'EGP',
        isCurrent: true,
        taxIncluded: true,
        taxPercent: 14,
        reliability: 'unverified',
        elements: [
          {
            componentType: 'energy',
            componentLabel: 'Energy',
            price: { amount: '7.5000', currency: 'EGP' },
            priceUnit: 'per_kwh',
            unitLabel: 'per kWh',
          },
          {
            componentType: 'idle',
            priceUnit: 'per_minute',
            graceMinutes: 10,
            price: { amount: '1.0000', currency: 'EGP' },
          },
        ],
      });
      expect(d.source).toMatchObject({
        dataSource: 'manual',
        providers: [
          {
            provider: 'ocm',
            displayName: 'Open Charge Map',
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attribution: '© Open Charge Map contributors (test row)',
          },
        ],
      });
      expect(d.availability).toMatchObject({
        liveProviderConfigured: false,
        provider: null,
        isLive: false,
        status: 'unknown',
        counts: { available: 0, occupied: 0, outOfOrder: 0, unknown: 3 },
      });
      expect(d.community).toMatchObject({
        isLive: false,
        checkins: { total: 0, last30Days: 0, lastAt: null, successRate30d: null, recent: [] },
        reports: { openCount: 0, recent: [] },
      });
      expect(res.headers['cache-control']).toMatch(/public/);
    });

    it('Arabic labels and names by default; slug works too', async () => {
      const slug = (await t.prisma.chargingStation.findUniqueOrThrow({ where: { id: stationId } }))
        .slug as string;
      const res = await t.http().get(`/api/v1/stations/${slug}`).expect(200);
      expect(res.body.data).toMatchObject({
        id: stationId,
        name: 'محطة اختبار التفاصيل',
        operator: { name: 'مشغل اختبار' },
        accessTypeLabel: 'عامة',
      });
      expect(res.body.data.community.disclaimer).toMatch(/مجتمعية/);
    });

    it('distance from a given point', async () => {
      const res = await t.http().get(`/api/v1/stations/${stationId}?lat=24.009&lng=36`).expect(200);
      expect(res.body.data.distanceM).toBeGreaterThan(990);
      expect(res.body.data.distanceM).toBeLessThan(1005);
    });

    it('unpublished, unknown and merged stations', async () => {
      const draft = await createStation(t, { lat: 24.1, lng: 36, publicationStatus: 'draft' });
      await t.http().get(`/api/v1/stations/${draft.id}`).expect(404);
      await t.http().get('/api/v1/stations/01900000-0000-7000-8000-000000000000').expect(404);
      await t.http().get('/api/v1/stations/no-such-slug').expect(404);
      const merged = await createStation(t, { lat: 24.2, lng: 36, publicationStatus: 'hidden' });
      await t.prisma.chargingStation.update({
        where: { id: merged.id },
        data: { duplicateOfId: stationId },
      });
      const res = await t.http().get(`/api/v1/stations/${merged.id}`).expect(404);
      expect(res.body.error).toMatchObject({
        code: 'STATION_MERGED',
        details: { mergedIntoId: stationId },
      });
    });
  });

  describe('live availability (expired → unknown, never available by default)', () => {
    let stationId: string;
    let c: string[];
    let points: string[];

    beforeAll(async () => {
      const s = await createStation(t, {
        lat: 23.0,
        lng: 37.0,
        points: 2,
        connectors: [
          { type: 'ccs2', current: 'DC', kw: 60, pointIndex: 0 },
          { type: 'ccs2', current: 'DC', kw: 60, pointIndex: 0 },
          { type: 'type2', current: 'AC', kw: 22, pointIndex: 1 },
        ],
      });
      stationId = s.id;
      c = s.connectorIds;
      points = s.pointIds;
    });

    it('with only expired observations the station is unknown', async () => {
      const now = Date.now();
      await t.prisma.availabilityObservation.create({
        data: {
          provider: 'partner:test',
          stationId,
          connectorId: c[0],
          chargingPointId: points[0],
          status: 'available',
          observedAt: new Date(now - 30 * 60_000),
          expiresAt: new Date(now - 20 * 60_000),
        },
      });
      const res = await t.http().get(`/api/v1/stations/${stationId}/availability`).expect(200);
      const byId = Object.fromEntries(
        (res.body.data.connectors as { connectorId: string }[]).map((x) => [x.connectorId, x]),
      );
      expect(byId[c[0]]).toMatchObject({
        status: 'unknown',
        providerStatus: 'available',
        freshness: 'expired',
        source: 'partner:test',
      });
      expect(byId[c[2]]).toMatchObject({ status: 'unknown', freshness: 'none' });
      expect(res.body.data.availability).toMatchObject({ isLive: false, status: 'unknown' });
    });

    it('ingested live observations are shown with source and expiry, then expire', async () => {
      const manager = await userWithRoles(t, ['station_manager']);
      const observedAt = new Date(Date.now() - 60_000).toISOString();
      const ingest = await t
        .http()
        .post('/api/v1/admin/station-availability/observations')
        .set(manager.auth)
        .send({
          provider: 'partner:test',
          observations: [
            { connectorId: c[1], status: 'available', observedAt, ttlSeconds: 600 },
            { chargingPointId: points[1], status: 'charging', observedAt, ttlSeconds: 600 },
          ],
        })
        .expect(200);
      expect(ingest.body.data).toMatchObject({ stored: 2, ignoredExpired: 0 });

      const res = await t.http().get(`/api/v1/stations/${stationId}/availability`).expect(200);
      const byId = Object.fromEntries(
        (res.body.data.connectors as { connectorId: string }[]).map((x) => [x.connectorId, x]),
      );
      expect(byId[c[1]]).toMatchObject({
        status: 'available',
        freshness: 'live',
        source: 'partner:test',
      });
      // Point-level observation applies to the connector of that point.
      expect(byId[c[2]]).toMatchObject({ status: 'occupied', providerStatus: 'charging' });
      expect(res.body.data.availability).toMatchObject({
        isLive: true,
        status: 'available',
        counts: { available: 1, occupied: 1, outOfOrder: 0, unknown: 1 },
      });
      const listed = await list(`lat=23&lng=37&radiusKm=1`);
      expect(listed.data[0].availability).toEqual({
        status: 'available',
        availableConnectors: 1,
        liveConnectors: 2,
      });

      // 15 minutes later the readings have expired: unknown again.
      clock.set(new Date(Date.now() + 15 * 60_000));
      const later = await t.http().get(`/api/v1/stations/${stationId}/availability`).expect(200);
      expect(later.body.data.availability).toMatchObject({ isLive: false, status: 'unknown' });
      const later1 = (later.body.data.connectors as { connectorId: string }[]).find(
        (x) => x.connectorId === c[1],
      );
      expect(later1).toMatchObject({ status: 'unknown', freshness: 'expired' });
    });

    it('ingestion refuses unknown targets, future and station-level readings', async () => {
      const manager = await userWithRoles(t, ['station_manager']);
      const now = new Date().toISOString();
      for (const obs of [
        {
          connectorId: '01900000-0000-7000-8000-000000000000',
          status: 'available',
          observedAt: now,
        },
        { stationId, status: 'available', observedAt: now },
        {
          connectorId: c[0],
          status: 'available',
          observedAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ]) {
        await t
          .http()
          .post('/api/v1/admin/station-availability/observations')
          .set(manager.auth)
          .send({ provider: 'partner:test', observations: [obs] })
          .expect(422);
      }
      const user = await createAndLogin(t, ['user']);
      await t
        .http()
        .post('/api/v1/admin/station-availability/observations')
        .set(bearer(user.accessToken))
        .send({
          provider: 'partner:test',
          observations: [{ connectorId: c[0], status: 'available', observedAt: now }],
        })
        .expect(403);
    });
  });

  describe('compatibility with my vehicle (verified inlets only)', () => {
    const lat = 22.0;
    const lng = 38.0;
    const near = `lat=${lat}&lng=${lng}&radiusKm=10`;
    let variantId: string;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      variantId = await createVariantWithInlets(t, 'EG', [
        { type: 'ccs2', current: 'DC', kw: 150, reliability: 'verified' },
        { type: 'type2', current: 'AC', kw: 11, reliability: 'manufacturer_claim' },
        { type: 'chademo', current: 'DC', kw: 50, reliability: 'unverified' },
      ]);
      ids.x = (
        await createStation(t, {
          lat,
          lng,
          connectors: [{ type: 'ccs2', current: 'DC', kw: 60, quantity: 2 }],
        })
      ).id;
      ids.y = (
        await createStation(t, {
          lat: lat + 0.01,
          lng,
          connectors: [{ type: 'chademo', current: 'DC', kw: 50 }],
        })
      ).id;
      ids.z = (
        await createStation(t, {
          lat: lat + 0.02,
          lng,
          connectors: [
            { type: 'type2', current: 'AC', kw: 22 },
            { type: 'gbt_dc', current: 'DC', kw: 120 },
          ],
        })
      ).id;
      ids.w = (
        await createStation(t, {
          lat: lat + 0.03,
          lng,
          connectors: [{ type: 'ccs1', current: 'DC', kw: 150 }],
        })
      ).id;
    });

    it('filters to connectors matching a verified inlet (same plug and current, no adapters)', async () => {
      const body = await list(`${near}&vehicleVariantId=${variantId}`);
      expect(idsOf(body).sort()).toEqual([ids.x, ids.z].sort());
      const x = body.data.find((s) => s.id === ids.x);
      const z = body.data.find((s) => s.id === ids.z);
      expect(x?.compatibility).toEqual({ compatibleConnectors: 2, maxUsablePowerKw: 60 });
      expect(z?.compatibility).toEqual({ compatibleConnectors: 1, maxUsablePowerKw: 11 });
      expect(body.meta.compatibility).toMatchObject({
        variantId,
        marketCode: 'EG',
        ignoredInlets: 1,
        inlets: [
          { connectorType: { code: 'type2' }, currentType: 'AC', maxPowerKw: 11 },
          { connectorType: { code: 'ccs2' }, currentType: 'DC', maxPowerKw: 150 },
        ],
      });
      expect(res0(body.meta.compatibility)).toContain('2026');
    });

    it('compatibleOnly=false annotates every station', async () => {
      const body = await list(`${near}&vehicleVariantId=${variantId}&compatibleOnly=false`);
      expect(body.data).toHaveLength(4);
      expect(body.data.find((s) => s.id === ids.y)?.compatibility).toEqual({
        compatibleConnectors: 0,
        maxUsablePowerKw: null,
      });
      expect(body.data.find((s) => s.id === ids.w)?.compatibility?.compatibleConnectors).toBe(0);
    });

    it('station page flags each connector', async () => {
      const res = await t
        .http()
        .get(`/api/v1/stations/${ids.z}?vehicleVariantId=${variantId}`)
        .expect(200);
      const conns = res.body.data.unassignedConnectors as {
        connectorType: { code: string };
        compatibility: unknown;
      }[];
      expect(conns.find((c) => c.connectorType.code === 'type2')?.compatibility).toEqual({
        compatible: true,
        maxUsablePowerKw: 11,
      });
      expect(conns.find((c) => c.connectorType.code === 'gbt_dc')?.compatibility).toEqual({
        compatible: false,
        maxUsablePowerKw: null,
      });
    });

    it('no verified inlet data / trim not in market → 422, never "nothing is compatible"', async () => {
      const unverified = await createVariantWithInlets(t, 'EG', [
        { type: 'ccs2', current: 'DC', kw: 100, reliability: 'estimated' },
      ]);
      const r1 = await t
        .http()
        .get(`/api/v1/stations?${near}&vehicleVariantId=${unverified}`)
        .expect(422);
      expect(r1.body.error).toMatchObject({
        code: 'VEHICLE_COMPATIBILITY_UNKNOWN',
        details: { reason: 'no_verified_inlets', marketCode: 'EG' },
      });
      const r2 = await t
        .http()
        .get(`/api/v1/stations?${near}&vehicleVariantId=${variantId}&market=SA`)
        .expect(422);
      expect(r2.body.error.details.reason).toBe('variant_not_in_market');
      const r3 = await t
        .http()
        .get(`/api/v1/stations?${near}&vehicleVariantId=01900000-0000-7000-8000-000000000000`)
        .expect(422);
      expect(r3.body.error.details[0].field).toBe('vehicleVariantId');
    });

    it('garage car: needs sign-in, only my own car, uses the car market', async () => {
      const saVariant = await createVariantWithInlets(t, 'SA', [
        { type: 'ccs2', current: 'DC', kw: 100, reliability: 'verified' },
      ]);
      const me = await createAndLogin(t, ['user']);
      const other = await createAndLogin(t, ['user']);
      const car = await t.prisma.userVehicle.create({
        data: { userId: me.userId, variantId: saVariant, marketCode: 'SA' },
      });
      await t.http().get(`/api/v1/stations?${near}&userVehicleId=${car.id}`).expect(401);
      await t
        .http()
        .get(`/api/v1/stations?${near}&userVehicleId=${car.id}`)
        .set(bearer(other.accessToken))
        .expect(422);
      const res = await t
        .http()
        .get(`/api/v1/stations?${near}&userVehicleId=${car.id}&market=EG`)
        .set(bearer(me.accessToken))
        .expect(200);
      expect((res.body as ListBody).meta.compatibility).toMatchObject({ marketCode: 'SA' });
      expect(idsOf(res.body as ListBody)).toEqual([ids.x]);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  it('meta: connector types, labels and report reasons from the database', async () => {
    const res = await t.http().get('/api/v1/stations/meta?lang=en').expect(200);
    const d = res.body.data;
    expect(d.connectorTypes.map((c: { code: string }) => c.code)).toEqual(
      expect.arrayContaining(['type2', 'ccs2', 'ccs1', 'chademo', 'nacs', 'gbt_ac', 'gbt_dc']),
    );
    expect(d.reportTypes.map((r: { code: string }) => r.code)).toEqual(
      expect.arrayContaining([
        'not_working',
        'wrong_location',
        'different_connector',
        'price_changed',
        'access_restricted',
        'other',
      ]),
    );
    expect(d.reportTypes.find((r: { code: string }) => r.code === 'other').requiresDetails).toBe(
      true,
    );
    expect(d.liveAvailability).toEqual({ configured: false, provider: null });
    expect(d.notAvailableLabel).toBe('Not available');
    const ar = await t.http().get('/api/v1/stations/meta?lang=ar').expect(200);
    expect(ar.body.data.notAvailableLabel).toBe('غير متوفر');
  });
});

function res0(v: unknown): string {
  return (v as { vehicleName: string }).vehicleName;
}
