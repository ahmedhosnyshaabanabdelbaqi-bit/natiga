/**
 * Open Charge Map import through the providers/stations adapter with a
 * MOCKED transport (synthetic fixture, no network): idempotent upsert by
 * (provider, external_id), licence/attribution provenance, connector sync,
 * cross-source dedupe with manual merge, availability ingestion by external
 * reference, scheduling and permissions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StationSyncService } from '../src/modules/stations/services/station-sync.service';
import type { OutboundResponse } from '../src/providers/http/outbound-http';
import { OutboundHttp } from '../src/providers/http/outbound-http';
import { userWithRoles, type PlatformUser } from './platform-helpers';
import { createStation } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

type Poi = Record<string, unknown> & {
  ID: number;
  AddressInfo: Record<string, unknown>;
  Connections?: Record<string, unknown>[];
};

const FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, '../src/providers/stations/ocm/__fixtures__/ocm-poi.synthetic.json'),
    'utf8',
  ),
) as Poi[];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function reply(payload: unknown): OutboundResponse {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    url: 'https://api.openchargemap.io/v3/poi/',
    body,
    text: () => body.toString(),
    json: <T>() => JSON.parse(body.toString()) as T,
  };
}

interface JobView {
  id: string;
  status: string;
  progress: { total: number; processed: number; success: number; errors: number; skipped: number };
  options: Record<string, unknown>;
}

describe('Stations OCM sync (e2e, mocked transport)', () => {
  let t: TestApp;
  let manager: PlatformUser;
  let payload: Poi[] = clone(FIXTURE);
  const urls: string[] = [];
  const fakeHttp = {
    fetch: jest.fn((url: string) => {
      urls.push(url);
      return Promise.resolve(reply(payload));
    }),
    fetchOperatorEndpoint: jest.fn(),
  };

  beforeAll(async () => {
    t = await createTestApp({
      env: { OCM_API_KEY: 'e2e-fake-ocm-key' },
      override: (b) => b.overrideProvider(OutboundHttp).useValue(fakeHttp),
    });
    manager = await userWithRoles(t, ['station_manager']);
  });
  afterAll(async () => {
    await t?.close();
  });

  const run = async (body: Record<string, unknown> = {}, expected = 201) => {
    const res = await t
      .http()
      .post('/api/v1/admin/station-sync/ocm')
      .set(manager.auth)
      .send({ countryCode: 'EG', wait: true, ...body })
      .expect(expected);
    return res.body.data as JobView;
  };
  const stationOf = async (externalId: string) => {
    const rec = await t.prisma.providerRecord.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'ocm', externalId } },
    });
    return t.prisma.chargingStation.findUniqueOrThrow({
      where: { id: rec.stationId as string },
      include: { connectors: { orderBy: { maxPowerKw: 'desc' } }, operator: true },
    });
  };
  const counts = async () => ({
    stations: await t.prisma.chargingStation.count({ where: { dataSource: 'ocm' } }),
    connectors: await t.prisma.connector.count({ where: { station: { dataSource: 'ocm' } } }),
    records: await t.prisma.providerRecord.count({ where: { provider: 'ocm' } }),
    operators: await t.prisma.chargingOperator.count(),
  });

  it('lists the sources with their status and licence', async () => {
    const res = await t
      .http()
      .get('/api/v1/admin/station-sync/sources')
      .set(manager.auth)
      .expect(200);
    const ocm = res.body.data.find((s: { key: string }) => s.key === 'ocm');
    expect(ocm).toMatchObject({
      displayName: 'Open Charge Map',
      supportsSync: true,
      status: { configured: true, name: 'open_charge_map' },
      licence: { isOpenData: true },
      lastJob: null,
    });
  });

  it('imports the fixture: open-data records only, provenance and licence kept, review first', async () => {
    const job = await run();
    expect(job.status).toBe('completed');
    expect(job.progress).toMatchObject({
      total: 4,
      processed: 4,
      success: 2,
      skipped: 2,
      errors: 0,
    });
    // Key in a header, never in the URL.
    expect(urls[0]).not.toContain('e2e-fake-ocm-key');
    expect(new URL(urls[0]).searchParams.get('countrycode')).toBe('EG');

    const rows = await t
      .http()
      .get(`/api/v1/admin/station-sync/jobs/${job.id}?pageSize=10`)
      .set(manager.auth)
      .expect(200);
    const byId = Object.fromEntries(
      (rows.body.data.rows.data as { data: { externalId: string }; status: string }[]).map((r) => [
        r.data.externalId,
        r,
      ]),
    );
    expect(byId['900001'].status).toBe('imported');
    expect(byId['900002']).toMatchObject({
      status: 'skipped',
      data: { reason: 'licence_not_open_data' },
    });
    expect(byId['900004']).toMatchObject({
      status: 'skipped',
      data: { reason: 'invalid_coordinates' },
    });

    const a = await stationOf('900001');
    expect(a).toMatchObject({
      name: 'Synthetic Fixture Station A (not a real place)',
      dataSource: 'ocm',
      publicationStatus: 'pending_review',
      operationalStatus: 'operational',
      countryCode: 'EG',
      marketCode: 'EG',
      timezone: 'Africa/Cairo',
      accessType: 'public',
      accessRestrictions: 'Membership required. Access key or card required.',
      accessEntranceNote: 'Fixture: entrance from the north gate',
      usageCostText: 'FIXTURE: cost text is free text, never a tariff',
      publishedPointCount: 2,
      isAlwaysOpen: null,
      openingHours: null,
    });
    expect(a.attribution).toMatch(/Open Charge Map/);
    expect(a.operator?.name).toBe('Synthetic Operator Ltd (fixture)');
    // Unknown plug type skipped (never guessed); connectors not grouped into invented EVSEs.
    expect(a.connectors).toHaveLength(2);
    expect(a.connectors.every((c) => c.chargingPointId === null)).toBe(true);
    expect(a.connectors[0]).toMatchObject({
      connectorTypeCode: 'ccs2',
      currentType: 'DC',
      quantity: 2,
      operationalStatus: 'operational',
    });
    expect(Number(a.connectors[0].maxPowerKw)).toBe(60);
    expect(a.connectors[1]).toMatchObject({
      connectorTypeCode: 'type2',
      currentType: 'AC',
      phases: 3,
      operationalStatus: 'temporarily_unavailable',
    });
    expect(await t.prisma.tariff.count({ where: { stationId: a.id } })).toBe(0);

    const rec = await t.prisma.providerRecord.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'ocm', externalId: '900001' } },
    });
    expect(rec).toMatchObject({
      entityType: 'station',
      lastImportJobId: job.id,
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://openchargemap.org/site/poi/details/900001',
      removedAtSourceAt: null,
    });
    expect(rec.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await t.prisma.providerRecord.count({ where: { provider: 'ocm', entityType: 'connector' } }),
    ).toBe(3);

    const c = await stationOf('900003');
    expect(c).toMatchObject({
      countryCode: 'SA',
      marketCode: 'SA',
      timezone: 'Asia/Riyadh',
      operationalStatus: 'permanently_closed',
      // OCM "Private - For Staff, Visitors or Customers" = customers only.
      accessType: 'customers_only',
      operatorId: null,
    });
    const cRec = await t.prisma.providerRecord.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'ocm', externalId: '900003' } },
    });
    expect(cRec.removedAtSourceAt).not.toBeNull();
    expect(cRec.attribution).toMatch(/Synthetic Open Registry/);

    // Pending review: not on the public map yet.
    const map = await t.http().get('/api/v1/stations?lat=29.5&lng=30.5&radiusKm=5').expect(200);
    expect(map.body.data).toEqual([]);
  });

  it('re-running is idempotent: unchanged records are skipped, nothing is duplicated', async () => {
    const before = await counts();
    const job = await run();
    expect(job.progress).toMatchObject({ success: 0, skipped: 4, errors: 0 });
    expect(await counts()).toEqual(before);
    const rec = await t.prisma.providerRecord.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'ocm', externalId: '900001' } },
    });
    expect(rec.lastImportJobId).toBe(job.id);
  });

  it('a changed record updates the station and removes connectors gone at the source', async () => {
    payload = clone(FIXTURE);
    const a = payload[0];
    const conns = a.Connections as Record<string, unknown>[];
    conns[0].PowerKW = 75;
    a.Connections = [conns[0], conns[2]]; // Type 2 (800002) removed
    const before = await counts();
    const job = await run();
    expect(job.progress).toMatchObject({ success: 1, skipped: 3 });
    const station = await stationOf('900001');
    expect(station.connectors).toHaveLength(1);
    expect(Number(station.connectors[0].maxPowerKw)).toBe(75);
    expect(
      await t.prisma.providerRecord.findUnique({
        where: { provider_externalId: { provider: 'ocm', externalId: 'conn:800002' } },
      }),
    ).toBeNull();
    const after = await counts();
    expect(after.stations).toBe(before.stations);
    expect(after.connectors).toBe(before.connectors - 1);
    expect(after.operators).toBe(before.operators);
  });

  it('a manual station nearby is flagged as a possible duplicate; the import waits for review', async () => {
    const manual = await createStation(t, {
      name: 'Test Manual Station near fixture',
      lat: 28.0001,
      lng: 29.0,
      connectors: [{ type: 'ccs2', current: 'DC', kw: 60 }],
    });
    const near: Poi = clone(FIXTURE[0]);
    near.ID = 900010;
    near.UUID = null;
    near.AddressInfo = {
      ...near.AddressInfo,
      Title: 'Synthetic Near Twin',
      Latitude: 28.0,
      Longitude: 29.0,
    };
    near.Connections = [
      { ...(FIXTURE[0].Connections as Record<string, unknown>[])[0], ID: 800100 },
    ];
    near.OperatorID = null;
    near.OperatorInfo = null;
    const far: Poi = clone(near);
    far.ID = 900011;
    far.AddressInfo = {
      ...far.AddressInfo,
      Title: 'Synthetic Lonely',
      Latitude: 27.0,
      Longitude: 28.0,
    };
    far.Connections = [{ ...(FIXTURE[0].Connections as Record<string, unknown>[])[0], ID: 800101 }];
    payload = [near, far];

    const job = await run({ autoPublish: true });
    expect(job.progress).toMatchObject({ success: 2, errors: 0 });
    const twin = await stationOf('900010');
    const lonely = await stationOf('900011');
    expect(twin.publicationStatus).toBe('pending_review');
    expect(lonely.publicationStatus).toBe('published');

    const list = await t
      .http()
      .get(`/api/v1/admin/station-duplicates?stationId=${manual.id}`)
      .set(manager.auth)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    const pair = list.body.data[0];
    expect(pair.status).toBe('pending');
    expect(Number(pair.distanceM)).toBeGreaterThan(5);
    expect(Number(pair.distanceM)).toBeLessThan(20);
    expect(pair.reason).toMatch(/ocm|manual/);
    expect(pair.stations.map((s: { id: string }) => s.id).sort()).toEqual(
      [manual.id, twin.id].sort(),
    );

    // Manual merge: keep the staff-verified station.
    const merged = await t
      .http()
      .post(`/api/v1/admin/station-duplicates/${pair.id}/merge`)
      .set(manager.auth)
      .send({ keepStationId: manual.id, note: 'Test: same site' })
      .expect(200);
    expect(merged.body.data.status).toBe('merged');
    const loser = await t.prisma.chargingStation.findUniqueOrThrow({ where: { id: twin.id } });
    expect(loser).toMatchObject({ duplicateOfId: manual.id, publicationStatus: 'hidden' });
    const pub = await t.http().get(`/api/v1/stations/${twin.id}`).expect(404);
    expect(pub.body.error).toMatchObject({
      code: 'STATION_MERGED',
      details: { mergedIntoId: manual.id },
    });
    await t
      .http()
      .post(`/api/v1/admin/station-duplicates/${pair.id}/merge`)
      .set(manager.auth)
      .send({ keepStationId: manual.id })
      .expect(409);

    // The next sync (even with a changed payload) never recreates or republishes it.
    payload[0] = { ...payload[0], UsageCost: 'changed' };
    const again = await run({ autoPublish: true });
    expect(again.progress.errors).toBe(0);
    const still = await t.prisma.chargingStation.findUniqueOrThrow({ where: { id: twin.id } });
    expect(still).toMatchObject({ duplicateOfId: manual.id, publicationStatus: 'hidden' });
    expect(await t.prisma.chargingStation.count({ where: { name: 'Synthetic Near Twin' } })).toBe(
      1,
    );
  });

  it('scan + manual pair + dismiss', async () => {
    const a = await createStation(t, { name: 'Test Scan Alpha Station', lat: 26.0, lng: 27.0 });
    const b = await createStation(t, { name: 'Test Scan Alpha Station', lat: 26.001, lng: 27.0 });
    const scan = await t
      .http()
      .post('/api/v1/admin/station-duplicates/scan')
      .set(manager.auth)
      .send({ stationId: a.id })
      .expect(200);
    expect(scan.body.data).toEqual({ scanned: 1, flaggedPairs: 1 });
    const list = await t
      .http()
      .get(`/api/v1/admin/station-duplicates?stationId=${b.id}&status=pending`)
      .set(manager.auth)
      .expect(200);
    const id = list.body.data[0].id as string;
    expect(Number(list.body.data[0].nameSimilarity)).toBe(1);
    const dismissed = await t
      .http()
      .post(`/api/v1/admin/station-duplicates/${id}/dismiss`)
      .set(manager.auth)
      .send({ note: 'Test: two operators' })
      .expect(200);
    expect(dismissed.body.data.status).toBe('not_duplicate');
    // A reviewed pair is not reopened by a new scan.
    await t
      .http()
      .post('/api/v1/admin/station-duplicates/scan')
      .set(manager.auth)
      .send({ stationId: a.id })
      .expect(200);
    const after = await t.prisma.stationDuplicateCandidate.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe('not_duplicate');

    const c = await createStation(t, { lat: 10, lng: 10 });
    const manual = await t
      .http()
      .post('/api/v1/admin/station-duplicates')
      .set(manager.auth)
      .send({ stationId: c.id, otherStationId: a.id, note: 'Test' })
      .expect(201);
    expect(manual.body.data).toMatchObject({ status: 'pending', reason: 'manual' });
    await t
      .http()
      .post('/api/v1/admin/station-duplicates')
      .set(manager.auth)
      .send({ stationId: c.id, otherStationId: c.id })
      .expect(422);
  });

  it('live availability can be ingested by the source reference of a connector', async () => {
    payload = clone(FIXTURE);
    await run();
    const a = await stationOf('900001');
    await t.prisma.chargingStation.update({
      where: { id: a.id },
      data: { publicationStatus: 'published' },
    });
    const res = await t
      .http()
      .post('/api/v1/admin/station-availability/observations')
      .set(manager.auth)
      .send({
        provider: 'partner:fixture',
        observations: [
          {
            external: { provider: 'ocm', externalId: 'conn:800001' },
            status: 'available',
            observedAt: new Date(Date.now() - 30_000).toISOString(),
          },
          {
            external: { provider: 'ocm', externalId: 'conn:800001' },
            status: 'charging',
            observedAt: new Date(Date.now() - 3_600_000).toISOString(),
            ttlSeconds: 60,
          },
        ],
      })
      .expect(200);
    // The second one had already expired: not stored.
    expect(res.body.data).toMatchObject({ stored: 1, ignoredExpired: 1 });
    const avail = await t.http().get(`/api/v1/stations/${a.id}/availability`).expect(200);
    expect(avail.body.data.availability).toMatchObject({ isLive: true, status: 'available' });
    const refresh = await t
      .http()
      .post('/api/v1/admin/station-availability/refresh')
      .set(manager.auth)
      .send({ stationIds: [a.id] })
      .expect(200);
    // No live provider is integrated: nothing is pulled or invented.
    expect(refresh.body.data).toEqual({ provider: 'none', stored: 0 });
  });

  it('a sync with the same settings already running → 409; background runs can be polled', async () => {
    await t.prisma.importJob.create({
      data: {
        type: 'stations.ocm_sync',
        status: 'running',
        options: { idempotencyKey: 'ocm:AE:*:full' },
      },
    });
    const res = await t
      .http()
      .post('/api/v1/admin/station-sync/ocm')
      .set(manager.auth)
      .send({ countryCode: 'AE', wait: true })
      .expect(409);
    expect(res.body.error.code).toBe('STATION_SYNC_RUNNING');

    const started = await t
      .http()
      .post('/api/v1/admin/station-sync/ocm')
      .set(manager.auth)
      .send({ countryCode: 'SA' })
      .expect(201);
    const id = started.body.data.id as string;
    let status = started.body.data.status as string;
    for (
      let i = 0;
      i < 100 && !['completed', 'completed_with_errors', 'failed'].includes(status);
      i++
    ) {
      await new Promise((r) => setTimeout(r, 50));
      const job = await t
        .http()
        .get(`/api/v1/admin/station-sync/jobs/${id}`)
        .set(manager.auth)
        .expect(200);
      status = job.body.data.job.status as string;
    }
    expect(status).toBe('completed');
    const jobs = await t
      .http()
      .get('/api/v1/admin/station-sync/jobs')
      .set(manager.auth)
      .expect(200);
    expect(jobs.body.meta.total).toBeGreaterThanOrEqual(6);
  });

  it('schedule: stored per country; a due country is synced once', async () => {
    const put = await t
      .http()
      .put('/api/v1/admin/station-sync/schedule')
      .set(manager.auth)
      .send({ enabled: true, intervalHours: 24, countryCodes: ['EG'], autoPublish: false })
      .expect(200);
    expect(put.body.data).toMatchObject({
      enabled: true,
      intervalHours: 24,
      countryCodes: ['EG'],
      configured: true,
      lastRuns: {},
    });
    const sync = t.app.get(StationSyncService);
    const first = await sync.runScheduled();
    expect(first).toHaveLength(1);
    const job = await t.prisma.importJob.findUniqueOrThrow({ where: { id: first[0] } });
    expect(job.options).toMatchObject({ countryCode: 'EG', trigger: 'scheduled' });
    expect(await sync.runScheduled()).toEqual([]);
    const get = await t
      .http()
      .get('/api/v1/admin/station-sync/schedule')
      .set(manager.auth)
      .expect(200);
    expect(Object.keys(get.body.data.lastRuns as Record<string, string>)).toEqual(['EG']);
  });

  it('only station importers can run syncs', async () => {
    const editor = await userWithRoles(t, ['editor']);
    await t.http().post('/api/v1/admin/station-sync/ocm').set(editor.auth).send({}).expect(403);
    await t.http().get('/api/v1/admin/station-sync/sources').set(editor.auth).expect(403);
    await t.http().post('/api/v1/admin/station-sync/ocm').send({}).expect(401);
  });
});

describe('Stations OCM sync without OCM_API_KEY (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { OCM_API_KEY: '' } });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('answers 503 INTEGRATION_NOT_CONFIGURED and never pretends to sync', async () => {
    const manager = await userWithRoles(t, ['station_manager']);
    const res = await t
      .http()
      .post('/api/v1/admin/station-sync/ocm')
      .set(manager.auth)
      .send({ countryCode: 'EG', wait: true })
      .expect(503);
    expect(res.body.error.code).toBe('INTEGRATION_NOT_CONFIGURED');
    expect(await t.prisma.importJob.count({ where: { type: 'stations.ocm_sync' } })).toBe(0);
    const sources = await t
      .http()
      .get('/api/v1/admin/station-sync/sources')
      .set(manager.auth)
      .expect(200);
    const ocm = sources.body.data.find((s: { key: string }) => s.key === 'ocm');
    expect(ocm.status).toMatchObject({ configured: false, reason: 'OCM_API_KEY is not set.' });
    const schedule = await t
      .http()
      .get('/api/v1/admin/station-sync/schedule')
      .set(manager.auth)
      .expect(200);
    expect(schedule.body.data.configured).toBe(false);
  });
});
