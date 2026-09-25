/**
 * Community writes about stations: reports (auth, duplicates, required
 * details, per-user limit, IP rate limit), check-ins (auth, 10-minute rule,
 * dated community data shown apart from live availability) and user
 * suggestions (review queue, never on the map). Synthetic data only.
 */
import { COMMUNITY_LIMITS } from '../src/modules/stations/services/station-community.service';
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createStation, createVariantWithInlets, idsOf, type ListBody } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Stations community writes (e2e)', () => {
  let t: TestApp;
  let user: LoggedIn;
  let station: { id: string; connectorIds: string[] };
  let otherStation: { id: string; connectorIds: string[] };

  beforeAll(async () => {
    t = await createTestApp();
    user = await createAndLogin(t, ['user']);
    station = await createStation(t, {
      lat: 21.0,
      lng: 39.0,
      connectors: [
        { type: 'ccs2', current: 'DC', kw: 60 },
        { type: 'type2', current: 'AC', kw: 22 },
      ],
    });
    otherStation = await createStation(t, { lat: 21.5, lng: 39.5 });
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('reports', () => {
    const url = () => `/api/v1/stations/${station.id}/reports`;

    it('guests cannot report (401)', async () => {
      await t.http().post(url()).send({ type: 'not_working' }).expect(401);
    });

    it('a signed-in user reports a problem; it waits for moderation', async () => {
      const res = await t
        .http()
        .post(`${url()}?lang=en`)
        .set(bearer(user.accessToken))
        .send({
          type: 'different_connector',
          connectorId: station.connectorIds[0],
          description: 'Test: the plug on site is CHAdeMO',
          suggestedData: { connectorTypeCode: 'chademo', currentType: 'DC' },
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        stationId: station.id,
        type: 'different_connector',
        typeLabel: 'Different connector',
        status: 'open',
        resolvedAt: null,
      });
      const row = await t.prisma.stationReport.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      expect(row.userId).toBe(user.userId);
      // Only an HMAC of the IP is stored.
      expect(row.reporterIpHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.suggestedData).toEqual({ connectorTypeCode: 'chademo', currentType: 'DC' });
    });

    it('the same open report twice → 409 STATION_REPORT_DUPLICATE', async () => {
      const res = await t
        .http()
        .post(url())
        .set(bearer(user.accessToken))
        .send({ type: 'different_connector' })
        .expect(409);
      expect(res.body.error.code).toBe('STATION_REPORT_DUPLICATE');
    });

    it('"other" needs a description; the connector must belong to the station', async () => {
      const r1 = await t
        .http()
        .post(url())
        .set(bearer(user.accessToken))
        .send({ type: 'other' })
        .expect(422);
      expect(r1.body.error.details[0].field).toBe('description');
      const r2 = await t
        .http()
        .post(url())
        .set(bearer(user.accessToken))
        .send({ type: 'not_working', connectorId: otherStation.connectorIds[0] })
        .expect(422);
      expect(r2.body.error.details[0].field).toBe('connectorId');
      await t.http().post(url()).set(bearer(user.accessToken)).send({ type: 'broken' }).expect(422);
      await t
        .http()
        .post(url())
        .set(bearer(user.accessToken))
        .send({ type: 'not_working', extra: 1 })
        .expect(422);
    });

    it('unpublished stations cannot be reported (404)', async () => {
      const draft = await createStation(t, { lat: 21.9, lng: 39.9, publicationStatus: 'draft' });
      await t
        .http()
        .post(`/api/v1/stations/${draft.id}/reports`)
        .set(bearer(user.accessToken))
        .send({ type: 'not_working' })
        .expect(404);
    });

    it('per-user limit: 20 reports in 24 h → 429 STATION_REPORT_LIMIT', async () => {
      const spammer = await createAndLogin(t, ['user']);
      const since = Date.now();
      await t.prisma.stationReport.createMany({
        data: Array.from({ length: COMMUNITY_LIMITS.reportsPerUserPerDay }, (_, i) => ({
          stationId: otherStation.id,
          userId: spammer.userId,
          type: 'other' as const,
          description: `Test ${i}`,
          status: 'resolved' as const,
          createdAt: new Date(since - i * 1000),
        })),
      });
      const res = await t
        .http()
        .post(url())
        .set(bearer(spammer.accessToken))
        .send({ type: 'not_working' })
        .expect(429);
      expect(res.body.error.code).toBe('STATION_REPORT_LIMIT');
    });

    it('my reports list shows the moderation status', async () => {
      const res = await t
        .http()
        .get('/api/v1/me/station-reports')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({ stationId: station.id, status: 'open' });
      await t.http().get('/api/v1/me/station-reports').expect(401);
    });

    it('recent reports appear in the community section, dated, without text or author', async () => {
      const res = await t.http().get(`/api/v1/stations/${station.id}?lang=en`).expect(200);
      expect(res.body.data.community.reports.openCount).toBe(1);
      expect(res.body.data.community.reports.recent[0]).toEqual({
        id: expect.any(String) as string,
        type: 'different_connector',
        typeLabel: 'Different connector',
        status: 'open',
        createdAt: expect.any(String) as string,
      });
      // Community data never changes live availability.
      expect(res.body.data.availability.status).toBe('unknown');
    });
  });

  describe('check-ins', () => {
    const url = () => `/api/v1/stations/${station.id}/checkins`;

    it('guests cannot check in (401)', async () => {
      await t.http().post(url()).send({ outcome: 'charged_successfully' }).expect(401);
    });

    it('records a dated check-in with the car used; once per 10 minutes per station', async () => {
      const variantId = await createVariantWithInlets(t, 'EG', [
        { type: 'ccs2', current: 'DC', kw: 100, reliability: 'verified' },
      ]);
      const res = await t
        .http()
        .post(url())
        .set(bearer(user.accessToken))
        .send({
          outcome: 'charged_successfully',
          connectorId: station.connectorIds[0],
          variantId,
          observedPowerKw: 48.5,
          waitMinutes: 5,
          comment: 'Test check-in comment',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        outcome: 'charged_successfully',
        observedPowerKw: 48.5,
        waitMinutes: 5,
        status: 'approved',
      });
      const again = await t
        .http()
        .post(url())
        .set(bearer(user.accessToken))
        .send({ outcome: 'could_not_charge' })
        .expect(429);
      expect(again.body.error.code).toBe('STATION_CHECKIN_TOO_SOON');
      expect(Number(again.headers['retry-after'])).toBeGreaterThan(500);

      const page = await t.http().get(`/api/v1/stations/${station.id}?lang=en`).expect(200);
      expect(page.body.data.community.checkins).toMatchObject({
        total: 1,
        last30Days: 1,
        successRate30d: null,
        recent: [
          {
            outcome: 'charged_successfully',
            outcomeLabel: 'Charged successfully',
            connectorType: { code: 'ccs2' },
            currentType: 'DC',
            observedPowerKw: 48.5,
            waitMinutes: 5,
            comment: 'Test check-in comment',
            vehicle: { id: variantId },
          },
        ],
      });
      expect(page.body.data.community.checkins.recent[0].vehicle.name).toContain('2026');
      expect(page.body.data.community.checkins.recent[0]).not.toHaveProperty('userId');
    });

    it('comments with links wait for a moderator; invalid values are refused', async () => {
      const other = await createAndLogin(t, ['user']);
      const res = await t
        .http()
        .post(url())
        .set(bearer(other.accessToken))
        .send({ outcome: 'other', comment: 'Test visit https://spam.example.invalid' })
        .expect(201);
      expect(res.body.data.status).toBe('pending');
      const page = await t.http().get(`/api/v1/stations/${station.id}`).expect(200);
      expect(page.body.data.community.checkins.total).toBe(1);

      const third = await createAndLogin(t, ['user']);
      for (const body of [
        { outcome: 'charged_successfully', waitMinutes: 2000 },
        { outcome: 'charged_successfully', observedPowerKw: 0 },
        { outcome: 'maybe' },
        { outcome: 'charged_successfully', variantId: '01900000-0000-7000-8000-000000000000' },
      ]) {
        await t.http().post(url()).set(bearer(third.accessToken)).send(body).expect(422);
      }
    });
  });

  describe('suggestions (review queue, never on the map)', () => {
    it('guests cannot suggest (401)', async () => {
      await t
        .http()
        .post('/api/v1/stations/suggestions')
        .send({ name: 'Test', latitude: 21, longitude: 39, countryCode: 'EG' })
        .expect(401);
    });

    it('stores a pending suggestion and lists nearby published stations', async () => {
      const res = await t
        .http()
        .post('/api/v1/stations/suggestions')
        .set(bearer(user.accessToken))
        .send({
          name: 'Test suggested station',
          operatorName: 'Test operator',
          latitude: 21.0003,
          longitude: 39.0,
          countryCode: 'EG',
          accessType: 'public',
          connectors: [
            { connectorTypeCode: 'ccs2', currentType: 'DC', maxPowerKw: 120, quantity: 2 },
          ],
          openingHoursText: 'Test: 24/7',
        })
        .expect(201);
      expect(res.body.data.suggestion).toMatchObject({
        status: 'pending',
        name: 'Test suggested station',
        countryCode: 'EG',
        reviewedAt: null,
        createdStationId: null,
      });
      expect(res.body.data.possibleDuplicates).toEqual([
        {
          id: station.id,
          name: expect.any(String) as string,
          distanceM: expect.any(Number) as number,
        },
      ]);
      expect(res.body.data.possibleDuplicates[0].distanceM).toBeGreaterThan(25);
      expect(res.body.data.possibleDuplicates[0].distanceM).toBeLessThan(40);

      const map = await t.http().get('/api/v1/stations?lat=21&lng=39&radiusKm=1').expect(200);
      expect(idsOf(map.body as ListBody)).toEqual([station.id]);
      const row = await t.prisma.stationSuggestion.findUniqueOrThrow({
        where: { id: res.body.data.suggestion.id },
      });
      expect(row.marketCode).toBe('EG');
    });

    it('validates connector types and AC/DC support', async () => {
      const bad = await t
        .http()
        .post('/api/v1/stations/suggestions')
        .set(bearer(user.accessToken))
        .send({
          name: 'Test',
          latitude: 21,
          longitude: 39,
          countryCode: 'EG',
          connectors: [{ connectorTypeCode: 'chademo', currentType: 'AC' }],
        })
        .expect(422);
      expect(bad.body.error.details[0].field).toBe('connectors[0].currentType');
      await t
        .http()
        .post('/api/v1/stations/suggestions')
        .set(bearer(user.accessToken))
        .send({
          name: 'Test',
          latitude: 21,
          longitude: 39,
          countryCode: 'EG',
          connectors: [{ connectorTypeCode: 'nope', currentType: 'AC' }],
        })
        .expect(422);
      await t
        .http()
        .post('/api/v1/stations/suggestions')
        .set(bearer(user.accessToken))
        .send({ name: 'Test', latitude: 91, longitude: 39, countryCode: 'eg' })
        .expect(422);
    });

    it('my suggestions: list and withdraw (only my own, only pending)', async () => {
      const mine = await t
        .http()
        .get('/api/v1/me/station-suggestions')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(mine.body.meta.total).toBe(1);
      const id = mine.body.data[0].id as string;
      const stranger = await createAndLogin(t, ['user']);
      await t
        .http()
        .post(`/api/v1/me/station-suggestions/${id}/withdraw`)
        .set(bearer(stranger.accessToken))
        .expect(404);
      const res = await t
        .http()
        .post(`/api/v1/me/station-suggestions/${id}/withdraw`)
        .set(bearer(user.accessToken))
        .expect(200);
      expect(res.body.data.status).toBe('withdrawn');
      const again = await t
        .http()
        .post(`/api/v1/me/station-suggestions/${id}/withdraw`)
        .set(bearer(user.accessToken))
        .expect(409);
      expect(again.body.error.code).toBe('STATION_SUGGESTION_NOT_PENDING');
    });

    it('too many pending suggestions → 429', async () => {
      const busy = await createAndLogin(t, ['user']);
      await t.prisma.stationSuggestion.createMany({
        data: Array.from({ length: COMMUNITY_LIMITS.pendingSuggestionsPerUser }, (_, i) => ({
          userId: busy.userId,
          name: `Test pending ${i}`,
          latitude: 20,
          longitude: 30,
          countryCode: 'EG',
        })),
      });
      const res = await t
        .http()
        .post('/api/v1/stations/suggestions')
        .set(bearer(busy.accessToken))
        .send({ name: 'Test one more', latitude: 20, longitude: 30, countryCode: 'EG' })
        .expect(429);
      expect(res.body.error.code).toBe('STATION_SUGGESTION_LIMIT');
    });
  });
});

describe('Stations report rate limit per IP (e2e, RATE_LIMIT_MULTIPLIER=1)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1', RATE_LIMIT_STORAGE: 'memory' } });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('the 11th report within an hour from one client is refused (429 RATE_LIMITED)', async () => {
    const stations = [];
    for (let i = 0; i < 11; i++) {
      stations.push(await createStation(t, { lat: 20 + i * 0.01, lng: 20 }));
    }
    // One account, 11 different stations (no duplicate): the IP budget applies
    // (login itself is limited to 10/min, so a single sign-in is used).
    const u = await createAndLogin(t, ['user']);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await t
        .http()
        .post(`/api/v1/stations/${stations[i].id}/reports`)
        .set(bearer(u.accessToken))
        .send({ type: 'not_working' });
      statuses.push(res.status);
      if (res.status === 429) expect(res.body.error.code).toBe('RATE_LIMITED');
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
