/**
 * /me/favorites: strict per-user isolation, visibility rules and the
 * guest → account merge (REQUIREMENTS §14). Fictional test data only.
 */
import { randomBytes } from 'node:crypto';
import { seedTestCatalog, type TestCatalog } from './comparisons-helpers';
import { userWithRoles, type PlatformUser } from './platform-helpers';
import { createStation } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

const MISSING = '00000000-0000-4000-8000-000000000001';

describe('discovery: favorites (e2e)', () => {
  let t: TestApp;
  let a: PlatformUser;
  let b: PlatformUser;
  let cat: TestCatalog;
  let stationId: string;
  let hiddenStationId: string;
  let aPrivate: string;
  let anonymous: string;

  const shareId = () => randomBytes(6).toString('hex');
  const items = () => [
    { variantId: cat.a, marketCode: 'EG', position: 1 },
    { variantId: cat.b, marketCode: 'EG', position: 2 },
  ];

  beforeAll(async () => {
    t = await createTestApp();
    [a, b] = await Promise.all([userWithRoles(t, ['user']), userWithRoles(t, ['user'])]);
    cat = await seedTestCatalog(t.prisma);
    stationId = (await createStation(t, { lat: 30.1, lng: 31.3 })).id;
    hiddenStationId = (
      await createStation(t, { lat: 30.2, lng: 31.3, publicationStatus: 'hidden' })
    ).id;
    aPrivate = (
      await t.prisma.comparison.create({
        data: {
          userId: a.id,
          shareId: shareId(),
          title: 'A private label',
          marketCode: 'EG',
          items: { create: items() },
        },
      })
    ).id;
    anonymous = (
      await t.prisma.comparison.create({
        data: { shareId: shareId(), marketCode: 'EG', items: { create: items() } },
      })
    ).id;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('requires a signed-in user', async () => {
    await t.http().get('/api/v1/me/favorites').expect(401);
    await t.http().put(`/api/v1/me/favorites/model/${cat.modelId}`).expect(401);
    await t.http().post('/api/v1/me/favorites/merge').send({ items: [] }).expect(401);
  });

  it('adds idempotently (201 then 200) and lists newest first', async () => {
    const first = await t
      .http()
      .put(`/api/v1/me/favorites/model/${cat.modelId}`)
      .set(a.auth)
      .query({ lang: 'en' })
      .expect(201);
    expect(first.body.data).toMatchObject({
      type: 'model',
      id: cat.modelId,
      available: true,
      slug: 'e2e-volt-one',
    });
    await t.http().put(`/api/v1/me/favorites/model/${cat.modelId}`).set(a.auth).expect(200);
    await t.http().put(`/api/v1/me/favorites/variant/${cat.a}`).set(a.auth).expect(201);
    await t.http().put(`/api/v1/me/favorites/station/${stationId}`).set(a.auth).expect(201);

    const list = await t.http().get('/api/v1/me/favorites').set(a.auth).expect(200);
    expect(list.body.meta.total).toBe(3);
    expect(list.body.data.map((f: { type: string }) => f.type)).toEqual([
      'station',
      'variant',
      'model',
    ]);
    const byType = await t
      .http()
      .get('/api/v1/me/favorites')
      .query({ type: 'variant' })
      .set(a.auth)
      .expect(200);
    expect(byType.body.data).toHaveLength(1);
  });

  it('isolates users strictly', async () => {
    const other = await t.http().get('/api/v1/me/favorites').set(b.auth).expect(200);
    expect(other.body.meta.total).toBe(0);
    const keys = await t.http().get('/api/v1/me/favorites/keys').set(b.auth).expect(200);
    expect(keys.body.data).toEqual([]);
    // B deleting the same key never touches A's row.
    await t.http().delete(`/api/v1/me/favorites/model/${cat.modelId}`).set(b.auth).expect(204);
    const mine = await t.http().get('/api/v1/me/favorites/keys').set(a.auth).expect(200);
    expect(mine.body.data.map((k: { id: string }) => k.id)).toContain(cat.modelId);
  });

  it('only visible targets can be added', async () => {
    const draft = await t
      .http()
      .put(`/api/v1/me/favorites/variant/${cat.draft}`)
      .set(a.auth)
      .expect(404);
    expect(draft.body.error.code).toBe('FAVORITE_TARGET_NOT_FOUND');
    await t.http().put(`/api/v1/me/favorites/station/${hiddenStationId}`).set(a.auth).expect(404);
    await t.http().put(`/api/v1/me/favorites/article/${MISSING}`).set(a.auth).expect(404);
    await t.http().put(`/api/v1/me/favorites/brand/${cat.brandId}`).set(a.auth).expect(422);
    await t.http().put('/api/v1/me/favorites/model/not-a-uuid').set(a.auth).expect(404);
  });

  it('comparisons: own private / anonymous shares only, never another user’s', async () => {
    const own = await t
      .http()
      .put(`/api/v1/me/favorites/comparison/${aPrivate}`)
      .set(a.auth)
      .expect(201);
    expect(own.body.data.title).toBe('A private label');
    await t.http().put(`/api/v1/me/favorites/comparison/${aPrivate}`).set(b.auth).expect(404);
    const anon = await t
      .http()
      .put(`/api/v1/me/favorites/comparison/${anonymous}`)
      .set(b.auth)
      .expect(201);
    expect(anon.body.data.shareId).toBeTruthy();
  });

  it('keeps favorites whose target was unpublished, marked unavailable', async () => {
    await t.prisma.chargingStation.update({
      where: { id: stationId },
      data: { publicationStatus: 'hidden' },
    });
    const list = await t
      .http()
      .get('/api/v1/me/favorites')
      .query({ type: 'station' })
      .set(a.auth)
      .expect(200);
    expect(list.body.data[0]).toMatchObject({ id: stationId, available: false });
    await t.prisma.chargingStation.update({
      where: { id: stationId },
      data: { publicationStatus: 'published' },
    });
  });

  it('removes idempotently', async () => {
    await t.http().delete(`/api/v1/me/favorites/variant/${cat.a}`).set(a.auth).expect(204);
    await t.http().delete(`/api/v1/me/favorites/variant/${cat.a}`).set(a.auth).expect(204);
    const keys = await t.http().get('/api/v1/me/favorites/keys').set(a.auth).expect(200);
    expect(keys.body.data.map((k: { id: string }) => k.id)).not.toContain(cat.a);
  });

  it('merges guest favorites into the account', async () => {
    const saved = '2026-01-02T03:04:05.000Z';
    const res = await t
      .http()
      .post('/api/v1/me/favorites/merge')
      .set(b.auth)
      .send({
        items: [
          { type: 'variant', id: cat.a, savedAt: saved },
          { type: 'variant', id: cat.a },
          { type: 'model', id: cat.modelId },
          { type: 'variant', id: cat.draft },
          { type: 'station', id: MISSING },
          { type: 'comparison', id: aPrivate },
          { type: 'comparison', id: anonymous },
        ],
      })
      .expect(200);
    expect(res.body.data.added).toBe(2);
    expect(res.body.data.alreadyPresent).toBe(1);
    expect(res.body.data.skipped).toEqual(
      expect.arrayContaining([
        { type: 'variant', id: cat.draft, reason: 'not_found' },
        { type: 'station', id: MISSING, reason: 'not_found' },
        { type: 'comparison', id: aPrivate, reason: 'not_found' },
      ]),
    );
    const variantKey = res.body.data.keys.find((k: { id: string }) => k.id === cat.a);
    expect(variantKey.savedAt).toBe(saved);

    // Repeating the merge adds nothing.
    const again = await t
      .http()
      .post('/api/v1/me/favorites/merge')
      .set(b.auth)
      .send({ items: [{ type: 'model', id: cat.modelId }] })
      .expect(200);
    expect(again.body.data).toMatchObject({ added: 0, alreadyPresent: 1 });

    // A's favorites are untouched.
    const aKeys = await t.http().get('/api/v1/me/favorites/keys').set(a.auth).expect(200);
    expect(aKeys.body.data.map((k: { id: string }) => k.id)).not.toContain(anonymous);
  });

  it('validates the merge body', async () => {
    await t
      .http()
      .post('/api/v1/me/favorites/merge')
      .set(b.auth)
      .send({ items: [{ type: 'brand', id: cat.brandId }] })
      .expect(422);
    await t
      .http()
      .post('/api/v1/me/favorites/merge')
      .set(b.auth)
      .send({ items: Array.from({ length: 201 }, () => ({ type: 'model', id: cat.modelId })) })
      .expect(422);
  });
});
