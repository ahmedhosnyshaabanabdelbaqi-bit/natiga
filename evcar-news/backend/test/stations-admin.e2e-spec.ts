/**
 * Admin stations API: RBAC, staff-verified stations (manual source), points,
 * connectors, tariffs, publication rules, operators, report / check-in
 * moderation and the suggestion review queue. Audited. Synthetic data only.
 */
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createStation, idsOf, type ListBody } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Stations admin API (e2e)', () => {
  let t: TestApp;
  let manager: PlatformUser;
  let owner: PlatformUser;
  let editor: PlatformUser;
  let user: LoggedIn;

  beforeAll(async () => {
    t = await createTestApp();
    [manager, owner, editor] = await Promise.all([
      userWithRoles(t, ['station_manager']),
      userWithRoles(t, ['owner']),
      userWithRoles(t, ['editor']),
    ]);
    user = await createAndLogin(t, ['user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = {
    name: 'Test Admin Station',
    latitude: 19.0,
    longitude: 41.0,
    countryCode: 'EG',
  };

  it('permissions are enforced on the server', async () => {
    await t.http().get('/api/v1/admin/stations').expect(401);
    await t.http().get('/api/v1/admin/stations').set(bearer(user.accessToken)).expect(403);
    await t.http().get('/api/v1/admin/stations').set(editor.auth).expect(403);
    await t.http().post('/api/v1/admin/stations').set(editor.auth).send(base).expect(403);
    await t.http().get('/api/v1/admin/station-reports').set(editor.auth).expect(403);
    await t.http().get('/api/v1/admin/stations').set(manager.auth).expect(200);
  });

  describe('stations, points, connectors, publication', () => {
    let id: string;

    it('creates a staff-verified draft with market defaults and audits it', async () => {
      const res = await t
        .http()
        .post('/api/v1/admin/stations')
        .set(manager.auth)
        .send({ ...base, nameAr: 'محطة اختبار الإدارة', amenities: ['cafe'], accessType: 'public' })
        .expect(201);
      id = res.body.data.id;
      expect(res.body.data).toMatchObject({
        name: 'Test Admin Station',
        dataSource: 'manual',
        publicationStatus: 'draft',
        marketCode: 'EG',
        timezone: 'Africa/Cairo',
        attribution: 'EV Car News editorial data (verified by staff)',
        connectors: [],
        points: [],
        possibleDuplicates: [],
        openNow: { state: 'unknown' },
      });
      expect(res.body.data.lastVerifiedAt).not.toBeNull();
      const audit = await waitForAudit(t, 'stations.create');
      expect(audit).toMatchObject({ entityId: id, actorId: manager.id });
      // Draft: not public.
      await t.http().get(`/api/v1/stations/${id}`).expect(404);
    });

    it('validates hours, time zone, market and the 24/7 rule (422 with field paths)', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ openingHours: { mon: [['8:00', '22:00']] } }, 'openingHours.mon[0]'],
        [{ openingHours: { funday: [] } }, 'openingHours.funday'],
        [{ isAlwaysOpen: true, openingHours: { mon: [['08:00', '22:00']] } }, 'openingHours'],
        [{ timezone: 'Mars/Base' }, 'timezone'],
        [{ marketCode: 'ZZ' }, 'marketCode'],
        [{ countryCode: 'KW' }, 'timezone'],
        [{ websiteUrl: 'javascript:alert(1)' }, 'websiteUrl'],
        [{ amenities: ['Bad Code'] }, 'amenities'],
      ];
      for (const [patch, field] of cases) {
        const res = await t
          .http()
          .post('/api/v1/admin/stations')
          .set(manager.auth)
          .send({ ...base, ...patch })
          .expect(422);
        expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
      }
    });

    it('publishing needs connectors; points and connectors are validated', async () => {
      const r = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/publication`)
        .set(manager.auth)
        .send({ status: 'published' })
        .expect(422);
      expect(r.body.error.details[0].field).toBe('status');

      const withPoint = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/points`)
        .set(manager.auth)
        .send({ label: 'EVSE A', evseId: 'EG*TST*E1', operationalStatus: 'operational' })
        .expect(201);
      const pointId = withPoint.body.data.points[0].id as string;

      const bad = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/connectors`)
        .set(manager.auth)
        .send({ connectorTypeCode: 'chademo', currentType: 'AC' })
        .expect(422);
      expect(bad.body.error.details[0].field).toBe('connector[0].currentType');
      await t
        .http()
        .post(`/api/v1/admin/stations/${id}/connectors`)
        .set(manager.auth)
        .send({ connectorTypeCode: 'nope', currentType: 'AC' })
        .expect(422);

      const other = await createStation(t, { lat: 18, lng: 40, points: 1 });
      await t
        .http()
        .post(`/api/v1/admin/stations/${id}/connectors`)
        .set(manager.auth)
        .send({ connectorTypeCode: 'ccs2', currentType: 'DC', chargingPointId: other.pointIds[0] })
        .expect(404);

      const ok = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/connectors`)
        .set(manager.auth)
        .send({
          connectorTypeCode: 'ccs2',
          currentType: 'DC',
          chargingPointId: pointId,
          maxPowerKw: 180,
          quantity: 1,
          format: 'cable',
          operationalStatus: 'operational',
        })
        .expect(201);
      expect(ok.body.data.connectors[0]).toMatchObject({
        connectorTypeCode: 'ccs2',
        chargingPointId: pointId,
        maxPowerKw: 180,
      });

      // A point with connectors cannot be deleted.
      const inUse = await t
        .http()
        .delete(`/api/v1/admin/stations/${id}/points/${pointId}`)
        .set(manager.auth)
        .expect(409);
      expect(inUse.body.error.code).toBe('IN_USE');

      const pub = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/publication`)
        .set(manager.auth)
        .send({ status: 'published' })
        .expect(200);
      expect(pub.body.data.publicationStatus).toBe('published');
      const audit = await waitForAudit(t, 'stations.publication.published');
      expect(audit.entityId).toBe(id);

      const map = await t.http().get('/api/v1/stations?lat=19&lng=41&radiusKm=1').expect(200);
      expect(idsOf(map.body as ListBody)).toEqual([id]);
      // The last connector of a published station cannot be removed.
      const connectorId = ok.body.data.connectors[0].id as string;
      await t
        .http()
        .delete(`/api/v1/admin/stations/${id}/connectors/${connectorId}`)
        .set(manager.auth)
        .expect(422);
    });

    it('PATCH edits hours and keeps the three statuses separate', async () => {
      const res = await t
        .http()
        .patch(`/api/v1/admin/stations/${id}`)
        .set(manager.auth)
        .send({
          isAlwaysOpen: false,
          openingHours: { mon: [['08:00', '22:00']], fri: [] },
          operationalStatus: 'temporarily_unavailable',
          paymentMethods: ['app'],
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        isAlwaysOpen: false,
        operationalStatus: 'temporarily_unavailable',
        publicationStatus: 'published',
      });
      const pub = await t.http().get(`/api/v1/stations/${id}?lang=en`).expect(200);
      expect(pub.body.data.operationalStatus).toBe('temporarily_unavailable');
      expect(pub.body.data.availability.status).toBe('unknown');
      await t
        .http()
        .patch(`/api/v1/admin/stations/${id}`)
        .set(manager.auth)
        .send({ isAlwaysOpen: true })
        .expect(422);
      await t
        .http()
        .patch(`/api/v1/admin/stations/${id}`)
        .set(manager.auth)
        .send({ publicationStatus: 'published' })
        .expect(422);
    });

    it('slugs are unique', async () => {
      await t
        .http()
        .patch(`/api/v1/admin/stations/${id}`)
        .set(manager.auth)
        .send({ slug: 'test-admin-station' })
        .expect(200);
      const res = await t
        .http()
        .post('/api/v1/admin/stations')
        .set(manager.auth)
        .send({ ...base, latitude: 17, slug: 'test-admin-station' })
        .expect(409);
      expect(res.body.error.code).toBe('SLUG_TAKEN');
    });

    it('creates and publishes in one call when connectors are given', async () => {
      const res = await t
        .http()
        .post('/api/v1/admin/stations')
        .set(manager.auth)
        .send({
          ...base,
          name: 'Test One Call Station',
          latitude: 16,
          publish: true,
          connectors: [{ connectorTypeCode: 'type2', currentType: 'AC', maxPowerKw: 22 }],
        })
        .expect(201);
      expect(res.body.data.publicationStatus).toBe('published');
      await t
        .http()
        .post('/api/v1/admin/stations')
        .set(manager.auth)
        .send({ ...base, latitude: 15, publish: true })
        .expect(422);
    });

    it('tariffs by unit with fees, taxes, currency and dates', async () => {
      const bad = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/tariffs`)
        .set(manager.auth)
        .send({
          currencyCode: 'EGP',
          elements: [{ componentType: 'energy', price: '5', priceUnit: 'per_minute' }],
        })
        .expect(422);
      expect(bad.body.error.details[0].field).toBe('elements[0].priceUnit');
      await t
        .http()
        .post(`/api/v1/admin/stations/${id}/tariffs`)
        .set(manager.auth)
        .send({
          currencyCode: 'XXX',
          elements: [{ componentType: 'flat', price: '5', priceUnit: 'per_session' }],
        })
        .expect(422);
      await t
        .http()
        .post(`/api/v1/admin/stations/${id}/tariffs`)
        .set(manager.auth)
        .send({
          currencyCode: 'EGP',
          validFrom: '2026-02-01T00:00:00Z',
          validTo: '2026-01-01T00:00:00Z',
          elements: [{ componentType: 'flat', price: '5', priceUnit: 'per_session' }],
        })
        .expect(422);

      const created = await t
        .http()
        .post(`/api/v1/admin/stations/${id}/tariffs?lang=en`)
        .set(manager.auth)
        .send({
          name: 'Test tariff',
          currencyCode: 'EGP',
          taxIncluded: false,
          taxPercent: 14,
          validFrom: '2026-01-01T00:00:00Z',
          reliability: 'verified',
          verifiedAt: '2026-09-01T00:00:00Z',
          elements: [
            { componentType: 'energy', price: '6.25', priceUnit: 'per_kwh' },
            { componentType: 'flat', price: 10, priceUnit: 'per_session' },
            {
              componentType: 'parking_time',
              price: '15',
              priceUnit: 'per_hour',
              startTime: '22:00',
              endTime: '06:00',
            },
            { componentType: 'idle', price: '1.5', priceUnit: 'per_minute', graceMinutes: 15 },
          ],
        })
        .expect(201);
      const tariffId = created.body.data.id as string;
      expect(created.body.data).toMatchObject({
        currency: 'EGP',
        taxIncluded: false,
        taxPercent: 14,
        reliability: 'verified',
        isCurrent: true,
      });
      expect(created.body.data.elements.map((e: { unitLabel: string }) => e.unitLabel)).toEqual([
        'per kWh',
        'per session',
        'per hour',
        'per minute',
      ]);
      expect(created.body.data.elements[1].price).toEqual({ amount: '10.0000', currency: 'EGP' });

      const updated = await t
        .http()
        .patch(`/api/v1/admin/stations/${id}/tariffs/${tariffId}`)
        .set(manager.auth)
        .send({ elements: [{ componentType: 'energy', price: '7', priceUnit: 'per_kwh' }] })
        .expect(200);
      expect(updated.body.data.elements).toHaveLength(1);
      const pub = await t.http().get(`/api/v1/stations/${id}`).expect(200);
      expect(pub.body.data.tariffs[0].elements[0].price).toEqual({
        amount: '7.0000',
        currency: 'EGP',
      });

      const list = await t
        .http()
        .get(`/api/v1/admin/stations/${id}/tariffs`)
        .set(manager.auth)
        .expect(200);
      expect(list.body.meta.total).toBe(1);
      await t
        .http()
        .delete(`/api/v1/admin/stations/${id}/tariffs/${tariffId}`)
        .set(manager.auth)
        .expect(204);
    });

    it('deleting needs stations.delete (owner); a deleted station disappears', async () => {
      await t.http().delete(`/api/v1/admin/stations/${id}`).set(manager.auth).expect(403);
      await t.http().delete(`/api/v1/admin/stations/${id}`).set(owner.auth).expect(204);
      await t.http().get(`/api/v1/stations/${id}`).expect(404);
      const admin = await t.http().get(`/api/v1/admin/stations/${id}`).set(owner.auth).expect(200);
      expect(admin.body.data.deletedAt).not.toBeNull();
    });

    it('admin list filters', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/stations?dataSource=manual&publicationStatus=published&q=one%20call')
        .set(manager.auth)
        .expect(200);
      expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(['Test One Call Station']);
    });
  });

  it('photos: only ready + licensed images are shown, with their credit', async () => {
    const s = await createStation(t, { lat: 11, lng: 40 });
    const license = await t.prisma.assetLicense.create({
      data: {
        licenseType: 'owned',
        rightsHolder: 'Test Rights Holder',
        attributionRequired: true,
        attributionText: 'Photo: Test Photographer',
      },
    });
    const ready = await t.prisma.mediaAsset.create({
      data: {
        kind: 'image',
        status: 'ready',
        storageDriver: 'local',
        storageKey: `public/test/stations/${s.id}/ready.jpg`,
        width: 1600,
        height: 900,
        licenseId: license.id,
        altTextEn: 'Test chargers',
      },
    });
    const unlicensed = await t.prisma.mediaAsset.create({
      data: {
        kind: 'image',
        status: 'ready',
        storageDriver: 'local',
        storageKey: `public/test/stations/${s.id}/unlicensed.jpg`,
      },
    });
    for (const asset of [ready, unlicensed]) {
      await t
        .http()
        .post(`/api/v1/admin/stations/${s.id}/photos`)
        .set(manager.auth)
        .send({ assetId: asset.id, caption: 'Test caption' })
        .expect(201);
    }
    const page = await t.http().get(`/api/v1/stations/${s.id}?lang=en`).expect(200);
    expect(page.body.data.photos).toHaveLength(1);
    expect(page.body.data.photos[0]).toMatchObject({
      id: ready.id,
      credit: 'Photo: Test Photographer',
      licenseType: 'owned',
      caption: 'Test caption',
      alt: 'Test chargers',
      width: 1600,
    });
    expect(page.body.data.photos[0].url).toMatch(
      new RegExp(`^https?://.+/test/stations/${s.id}/ready\\.jpg$`),
    );
    await t
      .http()
      .delete(`/api/v1/admin/stations/${s.id}/photos/${ready.id}`)
      .set(manager.auth)
      .expect(200);
    const after = await t.http().get(`/api/v1/stations/${s.id}`).expect(200);
    expect(after.body.data.photos).toEqual([]);
  });

  it('operators: create, edit, refuse deleting one in use', async () => {
    const created = await t
      .http()
      .post('/api/v1/admin/charging-operators')
      .set(manager.auth)
      .send({ name: 'Test Operator Admin', nameAr: 'مشغل', websiteUrl: 'https://example.invalid' })
      .expect(201);
    const opId = created.body.data.id as string;
    await t
      .http()
      .patch(`/api/v1/admin/charging-operators/${opId}`)
      .set(manager.auth)
      .send({ phone: '+20 1' })
      .expect(200);
    await createStation(t, { lat: 14, lng: 40, operatorId: opId });
    const res = await t
      .http()
      .delete(`/api/v1/admin/charging-operators/${opId}`)
      .set(manager.auth)
      .expect(409);
    expect(res.body.error.code).toBe('IN_USE');
    const list = await t
      .http()
      .get('/api/v1/admin/charging-operators?q=operator%20admin')
      .set(manager.auth)
      .expect(200);
    expect(list.body.data[0]).toMatchObject({ id: opId, phone: '+20 1', stationCount: 1 });
  });

  it('report moderation: resolve, the reporter sees the outcome, audited', async () => {
    const s = await createStation(t, { lat: 13, lng: 40 });
    const report = await t
      .http()
      .post(`/api/v1/stations/${s.id}/reports`)
      .set(bearer(user.accessToken))
      .send({ type: 'not_working', description: 'Test: screen dark' })
      .expect(201);
    const reportId = report.body.data.id as string;
    const queue = await t
      .http()
      .get(`/api/v1/admin/station-reports?status=open&stationId=${s.id}`)
      .set(manager.auth)
      .expect(200);
    expect(queue.body.data[0]).toMatchObject({
      id: reportId,
      type: 'not_working',
      description: 'Test: screen dark',
      reporter: { id: user.userId },
    });
    const done = await t
      .http()
      .patch(`/api/v1/admin/station-reports/${reportId}`)
      .set(manager.auth)
      .send({ status: 'resolved', resolutionNote: 'Test: operator fixed it' })
      .expect(200);
    expect(done.body.data).toMatchObject({ status: 'resolved', resolvedBy: { id: manager.id } });
    const audit = await waitForAudit(t, 'station-reports.update');
    expect(audit.entityId).toBe(reportId);
    const mine = await t
      .http()
      .get('/api/v1/me/station-reports')
      .set(bearer(user.accessToken))
      .expect(200);
    expect(mine.body.data.find((r: { id: string }) => r.id === reportId)).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Test: operator fixed it',
    });
    await t
      .http()
      .patch(`/api/v1/admin/station-reports/${reportId}`)
      .set(bearer(user.accessToken))
      .send({ status: 'rejected' })
      .expect(403);
  });

  it('check-in moderation hides a check-in from the community section', async () => {
    const s = await createStation(t, { lat: 12, lng: 40 });
    const c = await t
      .http()
      .post(`/api/v1/stations/${s.id}/checkins`)
      .set(bearer(user.accessToken))
      .send({ outcome: 'could_not_charge', comment: 'Test rude comment' })
      .expect(201);
    await t
      .http()
      .patch(`/api/v1/admin/station-checkins/${c.body.data.id}`)
      .set(manager.auth)
      .send({ status: 'hidden' })
      .expect(200);
    const page = await t.http().get(`/api/v1/stations/${s.id}`).expect(200);
    expect(page.body.data.community.checkins.total).toBe(0);
  });

  describe('suggestion review queue', () => {
    const suggest = async (name: string, lat: number) => {
      const res = await t
        .http()
        .post('/api/v1/stations/suggestions')
        .set(bearer(user.accessToken))
        .send({
          name,
          latitude: lat,
          longitude: 45,
          countryCode: 'SA',
          accessType: 'public',
          connectors: [
            { connectorTypeCode: 'ccs2', currentType: 'DC', maxPowerKw: 120, quantity: 2 },
            { connectorTypeCode: 'type2', currentType: 'AC', maxPowerKw: 22 },
          ],
        })
        .expect(201);
      return res.body.data.suggestion.id as string;
    };

    it('approve → a station with the suggested connectors (source user_suggestion)', async () => {
      const id = await suggest('Test Suggested Approve', 24.5);
      const view = await t
        .http()
        .get(`/api/v1/admin/station-suggestions/${id}`)
        .set(manager.auth)
        .expect(200);
      expect(view.body.data).toMatchObject({ status: 'pending', nearbyStations: [] });
      const res = await t
        .http()
        .post(`/api/v1/admin/station-suggestions/${id}/approve`)
        .set(manager.auth)
        .send({ nameAr: 'محطة مقترحة', publish: true, reviewNote: 'Test: checked on site' })
        .expect(200);
      const station = res.body.data.station;
      expect(res.body.data.suggestion).toMatchObject({
        status: 'approved',
        createdStationId: station.id,
        reviewNote: 'Test: checked on site',
      });
      expect(station).toMatchObject({
        name: 'Test Suggested Approve',
        nameAr: 'محطة مقترحة',
        dataSource: 'user_suggestion',
        publicationStatus: 'published',
        marketCode: 'SA',
        timezone: 'Asia/Riyadh',
        lastVerifiedAt: null,
      });
      expect(station.connectors).toHaveLength(2);
      expect(
        station.connectors.find(
          (c: { connectorTypeCode: string }) => c.connectorTypeCode === 'ccs2',
        ),
      ).toMatchObject({
        quantity: 2,
        maxPowerKw: 120,
        chargingPointId: null,
      });
      const audit = await waitForAudit(t, 'station-suggestions.approve');
      expect(audit).toMatchObject({ entityId: id, actorId: manager.id });
      const mine = await t
        .http()
        .get('/api/v1/me/station-suggestions')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(mine.body.data.find((s: { id: string }) => s.id === id)).toMatchObject({
        status: 'approved',
        createdStationId: station.id,
      });
      const again = await t
        .http()
        .post(`/api/v1/admin/station-suggestions/${id}/approve`)
        .set(manager.auth)
        .send({})
        .expect(409);
      expect(again.body.error.code).toBe('STATION_SUGGESTION_NOT_PENDING');
    });

    it('reject and duplicate close the suggestion without a station', async () => {
      const r = await suggest('Test Suggested Reject', 24.6);
      const rejected = await t
        .http()
        .post(`/api/v1/admin/station-suggestions/${r}/reject`)
        .set(manager.auth)
        .send({ reviewNote: 'Test: not a charger' })
        .expect(200);
      expect(rejected.body.data).toMatchObject({ status: 'rejected', createdStationId: null });

      const existing = await createStation(t, { lat: 24.7, lng: 45 });
      const d = await suggest('Test Suggested Duplicate', 24.7);
      const dup = await t
        .http()
        .post(`/api/v1/admin/station-suggestions/${d}/duplicate`)
        .set(manager.auth)
        .send({ stationId: existing.id })
        .expect(200);
      expect(dup.body.data).toMatchObject({
        status: 'duplicate',
        duplicateOfStationId: existing.id,
      });
      expect(dup.body.data.nearbyStations[0]).toMatchObject({ id: existing.id, distanceM: 0 });

      const pending = await t
        .http()
        .get('/api/v1/admin/station-suggestions?status=pending')
        .set(manager.auth)
        .expect(200);
      expect(pending.body.data.map((s: { id: string }) => s.id)).not.toContain(r);
    });
  });
});
