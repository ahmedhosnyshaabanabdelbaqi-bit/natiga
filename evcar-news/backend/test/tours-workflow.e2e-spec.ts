/**
 * 360° interior tours (REQUIREMENTS §8–9): admin CRUD bound to trim +
 * market + drive side + interior colour, scenes and hotspots (plain ar/en
 * texts, per-type fields), publication blocked until every file is ready +
 * licensed + visually confirmed, reference tours need approval and show the
 * difference note, published tours are locked; the public API only serves
 * published tours with usable files (drafts, other statuses and expired
 * licences are hidden) and returns the viewer configuration.
 */
import { runDemoSeed, DEMO_IDS } from '../src/cli/seed-data/demo-seed';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import {
  auth,
  catalogTrim,
  confirmVisual,
  createLicense,
  flatImage,
  processInline,
  readyPanorama,
  syntheticPanorama,
  tourStaff,
  uploadAsset,
  type CatalogTrim,
  type TourStaff,
} from './tours-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface Problem {
  code: string;
}
const codes = (body: { error: { details: { problems: Problem[] } } }) =>
  body.error.details.problems.map((p) => p.code);

describe('360° tours: admin workflow and public API (e2e)', () => {
  let t: TestApp;
  let staff: TourStaff;
  let trim: CatalogTrim;
  let licenseId: string;

  const createTour = async (body: Record<string, unknown> = {}) => {
    const res = await t
      .http()
      .post('/api/v1/admin/tours')
      .set(auth(staff.manager))
      .send({
        variantId: trim.variantId,
        marketCode: 'EG',
        driveSide: 'lhd',
        interiorColorNameEn: 'Black',
        interiorColorNameAr: 'أسود',
        interiorColorHex: '#1f1f1f',
        titleEn: 'Test interior',
        titleAr: 'مقصورة اختبار',
        ...body,
      });
    if (res.status !== 201) throw new Error(`create tour ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data as { id: string; slug: string; [k: string]: unknown };
  };
  const addScene = (tourId: string, body: Record<string, unknown>) =>
    t.http().post(`/api/v1/admin/tours/${tourId}/scenes`).set(auth(staff.manager)).send(body);
  const addHotspot = (tourId: string, sceneId: string, body: Record<string, unknown>) =>
    t
      .http()
      .post(`/api/v1/admin/tours/${tourId}/scenes/${sceneId}/hotspots`)
      .set(auth(staff.manager))
      .send(body);
  const publish = (tourId: string) =>
    t.http().post(`/api/v1/admin/tours/${tourId}/publish`).set(auth(staff.reviewer));
  const texts = (en: string, ar: string) => ({ en: { title: en }, ar: { title: ar } });

  beforeAll(async () => {
    t = await createTestApp();
    staff = await tourStaff(t);
    trim = await catalogTrim(t);
    licenseId = (
      await createLicense(t, staff.manager, {
        licenseType: 'commissioned',
        rightsHolder: 'Test studio (synthetic fixtures)',
        attributionRequired: true,
        attributionText: '360° test grid © Test studio',
      })
    ).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('creating tours', () => {
    it('creates a draft bound to trim + market + drive side + colour', async () => {
      const tour = await createTour({ interiorColorNameEn: 'Grey / Red', interiorColorNameAr: 'رمادي' });
      expect(tour).toMatchObject({
        status: 'draft',
        matchType: 'exact',
        marketCode: 'EG',
        driveSide: 'lhd',
        interiorColorHex: '#1F1F1F',
        sceneCount: 0,
        variant: { id: trim.variantId, year: 2026, modelYearId: trim.modelYearId },
      });
      expect(tour.slug).toBe(`${trim.variantSlug}-eg-lhd-grey-red`);
      const readiness = tour.readiness as { publishable: boolean; problems: Problem[] };
      expect(readiness.publishable).toBe(false);
      expect(readiness.problems.map((p) => p.code)).toContain('no_scenes');
    });

    it('validates the binding and the reference rules; needs tours.write', async () => {
      const base = {
        variantId: trim.variantId,
        marketCode: 'EG',
        driveSide: 'lhd',
        interiorColorNameEn: 'Black',
        interiorColorNameAr: 'أسود',
      };
      const post = (who: typeof staff.manager, body: Record<string, unknown>) =>
        t.http().post('/api/v1/admin/tours').set(auth(who)).send(body);
      expect((await post(staff.manager, { ...base, variantId: '01900000-0000-7000-8000-000000000000' })).status).toBe(422);
      expect((await post(staff.manager, { ...base, marketCode: 'ZZ' })).status).toBe(422);
      expect((await post(staff.manager, { ...base, driveSide: 'center' })).status).toBe(422);
      const noNotes = await post(staff.manager, {
        ...base,
        matchType: 'reference_similar_trim',
        referenceVariantId: trim.otherVariantId,
      });
      expect(noNotes.status).toBe(422);
      expect(noNotes.body.error.details[0].field).toBe('differenceNoteAr');
      const sameTrim = await post(staff.manager, {
        ...base,
        matchType: 'reference_similar_trim',
        referenceVariantId: trim.variantId,
        differenceNoteAr: 'x',
        differenceNoteEn: 'x',
      });
      expect(sameTrim.status).toBe(422);
      expect((await post(staff.editor, base)).status).toBe(403);
      expect((await post(staff.user, base)).status).toBe(403);
      expect((await t.http().post('/api/v1/admin/tours').send(base)).status).toBe(401);
      expect((await t.http().get('/api/v1/admin/tours').set(auth(staff.user))).status).toBe(403);
      // The editor may read (tours.read).
      expect((await t.http().get('/api/v1/admin/tours').set(auth(staff.editor))).status).toBe(200);
    });
  });

  describe('publishing rules', () => {
    it('publishes only when the panorama is processed, licensed and visually confirmed', async () => {
      const tour = await createTour({ interiorColorNameEn: 'Sand', interiorColorNameAr: 'رملي' });
      const raw = await uploadAsset(t, staff.manager, await syntheticPanorama(2048), {
        kind: 'panorama',
      });
      const withScene = await addScene(tour.id, { assetId: raw.id, position: 'driver' }).expect(201);
      const scene = withScene.body.data.scenes[0];
      expect(scene).toMatchObject({ key: 'driver', isInitial: true, position: 'driver' });
      expect(withScene.body.data.initialSceneId).toBe(scene.id);
      await addHotspot(tour.id, scene.id, {
        type: 'info',
        yaw: 10,
        pitch: -5,
        iconKey: 'screen',
        texts: texts('Central screen', 'الشاشة المركزية'),
      }).expect(201);

      const first = await publish(tour.id);
      expect(first.status).toBe(409);
      expect(first.body.error.code).toBe('TOUR_NOT_PUBLISHABLE');
      expect(codes(first.body)).toEqual(
        expect.arrayContaining([
          'scene_asset_not_ready',
          'scene_asset_unlicensed',
          'scene_visual_check_missing',
        ]),
      );
      // Drafts never reach the apps.
      const listed = await t.http().get(`/api/v1/tours?variantId=${trim.variantId}`).expect(200);
      expect((listed.body.data as { id: string }[]).some((x) => x.id === tour.id)).toBe(false);
      await t.http().get(`/api/v1/tours/${tour.id}`).expect(404);
      await t.http().get(`/api/v1/tours/${tour.slug}`).expect(404);

      await processInline(t, raw.id);
      expect(codes((await publish(tour.id)).body)).toEqual([
        'scene_asset_unlicensed',
        'scene_visual_check_missing',
      ]);
      await t
        .http()
        .patch(`/api/v1/admin/media/assets/${raw.id}`)
        .set(auth(staff.manager))
        .send({ licenseId })
        .expect(200);
      expect(codes((await publish(tour.id)).body)).toEqual(['scene_visual_check_missing']);
      await confirmVisual(t, staff.manager, raw.id);

      // tours.write alone cannot publish.
      await t.http().post(`/api/v1/admin/tours/${tour.id}/publish`).set(auth(staff.manager)).expect(403);
      const ok = await publish(tour.id).expect(200);
      expect(ok.body.data).toMatchObject({ status: 'published', readiness: { publishable: false } });
      expect(ok.body.data.publishedAt).not.toBeNull();
      // (readiness now reports the tour itself as the published one? no: it excludes itself)
      const audit = await t.prisma.auditLog.findFirst({
        where: { entityId: tour.id, action: 'tours.status.published' },
      });
      expect(audit).not.toBeNull();

      // Live files keep their licence (database rule).
      const unlicense = await t
        .http()
        .patch(`/api/v1/admin/media/assets/${raw.id}`)
        .set(auth(staff.manager))
        .send({ licenseId: null });
      expect(unlicense.status).toBe(422);
      expect(unlicense.body.error.details.constraint).toBe('media_assets_in_use_chk');
      // …and cannot be deleted while used.
      const del = await t.http().delete(`/api/v1/admin/media/assets/${raw.id}`).set(auth(staff.manager));
      expect(del.status).toBe(409);

      const pub = await t.http().get(`/api/v1/tours?variantId=${trim.variantId}`).expect(200);
      expect((pub.body.data as { id: string }[]).map((x) => x.id)).toContain(tour.id);
      const featured = await t.http().get('/api/v1/tours/featured').expect(200);
      expect((featured.body.data as { id: string }[]).map((x) => x.id)).toContain(tour.id);
      await t.http().get(`/api/v1/tours/${tour.slug}`).expect(200);

      // Unpublish hides it again.
      await t.http().post(`/api/v1/admin/tours/${tour.id}/unpublish`).set(auth(staff.reviewer)).expect(200);
      await t.http().get(`/api/v1/tours/${tour.id}`).expect(404);
      await t.http().post(`/api/v1/admin/tours/${tour.id}/archive`).set(auth(staff.reviewer)).expect(200);
      await t.http().delete(`/api/v1/admin/tours/${tour.id}`).set(auth(staff.manager)).expect(204);
      await t.http().get(`/api/v1/admin/tours/${tour.id}`).set(auth(staff.manager)).expect(404);
    });

    it('runs the review workflow (submit → return with note → submit → publish)', async () => {
      const tour = await createTour({ interiorColorNameEn: 'Blue', interiorColorNameAr: 'أزرق' });
      await addScene(tour.id, {
        assetId: await readyPanorama(t, staff.manager, { licenseId }),
        position: 'driver',
      }).expect(201);
      await t.http().post(`/api/v1/admin/tours/${tour.id}/submit`).set(auth(staff.manager)).expect(200);
      const returned = await t
        .http()
        .post(`/api/v1/admin/tours/${tour.id}/return`)
        .set(auth(staff.reviewer))
        .send({ note: 'Horizon tilted in the driver scene.' })
        .expect(200);
      expect(returned.body.data).toMatchObject({
        status: 'draft',
        reviewNote: 'Horizon tilted in the driver scene.',
      });
      // Invalid transitions answer 409.
      const bad = await t
        .http()
        .post(`/api/v1/admin/tours/${tour.id}/unpublish`)
        .set(auth(staff.reviewer));
      expect(bad.status).toBe(409);
      expect(bad.body.error.code).toBe('TOUR_INVALID_TRANSITION');
      await t.http().post(`/api/v1/admin/tours/${tour.id}/submit`).set(auth(staff.manager)).expect(200);
      const pub = await publish(tour.id).expect(200);
      expect(pub.body.data.reviewNote).toBeNull();

      // A second published tour for the same trim / market / drive side / colour is refused.
      const twin = await createTour({ interiorColorNameEn: 'Blue', interiorColorNameAr: 'أزرق' });
      await addScene(twin.id, {
        assetId: await readyPanorama(t, staff.manager, { licenseId, tint: '#224488' }),
        position: 'driver',
      }).expect(201);
      const dup = await publish(twin.id);
      expect(dup.status).toBe(409);
      expect(codes(dup.body)).toContain('duplicate_published');
    });

    it('needs editor approval for a reference tour of a similar trim and shows the difference', async () => {
      const tour = await createTour({
        variantId: trim.otherVariantId,
        matchType: 'reference_similar_trim',
        referenceVariantId: trim.variantId,
        differenceNoteEn: 'Photographed in the Long Range trim: the Standard has cloth seats.',
        differenceNoteAr: 'صُوّرت في فئة المدى الطويل: الفئة القياسية بمقاعد قماشية.',
      });
      await addScene(tour.id, {
        assetId: await readyPanorama(t, staff.manager, { licenseId }),
        position: 'driver',
      }).expect(201);
      expect(codes((await publish(tour.id)).body)).toEqual(['reference_not_approved']);
      await t
        .http()
        .post(`/api/v1/admin/tours/${tour.id}/approve-reference`)
        .set(auth(staff.manager))
        .expect(403);
      const approved = await t
        .http()
        .post(`/api/v1/admin/tours/${tour.id}/approve-reference`)
        .set(auth(staff.reviewer))
        .expect(200);
      expect(approved.body.data.approvedById).toBe(staff.reviewer.userId);
      // Editing the difference note withdraws the approval.
      const edited = await t
        .http()
        .patch(`/api/v1/admin/tours/${tour.id}`)
        .set(auth(staff.manager))
        .send({ differenceNoteEn: 'Photographed in the Long Range trim (cloth seats in Standard).' })
        .expect(200);
      expect(edited.body.data.approvedAt).toBeNull();
      await t
        .http()
        .post(`/api/v1/admin/tours/${tour.id}/approve-reference`)
        .set(auth(staff.reviewer))
        .expect(200);
      await publish(tour.id).expect(200);

      const card = (
        await t.http().get(`/api/v1/tours?variantId=${trim.otherVariantId}&lang=en`).expect(200)
      ).body.data[0];
      expect(card).toMatchObject({
        id: tour.id,
        isReferenceForSimilarTrim: true,
        differenceNote: 'Photographed in the Long Range trim (cloth seats in Standard).',
        referenceVariantName: 'Long Range',
        variantName: 'Standard',
      });
      // Binding fields of a published tour are locked.
      const locked = await t
        .http()
        .patch(`/api/v1/admin/tours/${tour.id}`)
        .set(auth(staff.manager))
        .send({ differenceNoteEn: 'changed' });
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('TOUR_PUBLISHED_LOCKED');
      // Title edits stay possible.
      await t
        .http()
        .patch(`/api/v1/admin/tours/${tour.id}`)
        .set(auth(staff.manager))
        .send({ titleEn: 'Standard interior (reference)' })
        .expect(200);
      await t.http().delete(`/api/v1/admin/tours/${tour.id}`).set(auth(staff.manager)).expect(409);
    });
  });

  describe('scenes and hotspots', () => {
    let tourId: string;
    let driverId: string;
    let rearId: string;

    beforeAll(async () => {
      const tour = await createTour({ interiorColorNameEn: 'White', interiorColorNameAr: 'أبيض' });
      tourId = tour.id;
      const a = await addScene(tourId, {
        assetId: await readyPanorama(t, staff.manager, { licenseId }),
        position: 'driver',
      }).expect(201);
      driverId = a.body.data.scenes[0].id;
      const b = await addScene(tourId, {
        assetId: await readyPanorama(t, staff.manager, { licenseId, tint: '#3D2C8D' }),
        position: 'rear',
        initialYaw: 180,
        initialHfov: 90,
        minPitch: -60,
        maxPitch: 60,
      }).expect(201);
      rearId = b.body.data.scenes.find((s: { key: string }) => s.key === 'rear').id;
      expect(b.body.data.initialSceneId).toBe(driverId);
    });

    it('stores hotspot texts as plain text only (HTML stripped)', async () => {
      const res = await addHotspot(tourId, driverId, {
        type: 'info',
        yaw: -30,
        pitch: 0,
        texts: {
          en: {
            title: '<b>Screen</b><script>alert(1)</script>',
            body: 'Line 1<br>Line 2 &amp; <img src=x onerror=alert(1)>more',
          },
          ar: { title: '<i>الشاشة</i>', body: '&lt;b&gt;ليس وسمًا' },
        },
      }).expect(201);
      const h = res.body.data.scenes
        .find((s: { id: string }) => s.id === driverId)
        .hotspots.at(-1);
      expect(h.texts.en).toEqual({ title: 'Screen', body: 'Line 1\nLine 2 & more' });
      expect(h.texts.ar).toEqual({ title: 'الشاشة', body: '< b>ليس وسمًا' });
      const onlyTags = await addHotspot(tourId, driverId, {
        type: 'info',
        yaw: 0,
        pitch: 0,
        texts: { en: { title: '<b></b>' } },
      });
      expect(onlyTags.status).toBe(422);
      const none = await addHotspot(tourId, driverId, { type: 'info', yaw: 0, pitch: 0, texts: {} });
      expect(none.status).toBe(422);
    });

    it('checks the fields of each hotspot type', async () => {
      const image = await uploadAsset(t, staff.manager, await flatImage(1200, 800), {
        kind: 'image',
        licenseId,
      });
      const video = (
        await t
          .http()
          .post('/api/v1/admin/media/videos/embed')
          .set(auth(staff.manager))
          .send({ url: 'https://vimeo.com/123456789', licenseId })
          .expect(201)
      ).body.data;
      const bad = async (body: Record<string, unknown>) => {
        const res = await addHotspot(tourId, driverId, {
          yaw: 0,
          pitch: 0,
          texts: texts('x', 'س'),
          ...body,
        });
        expect(res.status).toBe(422);
      };
      await bad({ type: 'scene_link' });
      await bad({ type: 'scene_link', targetSceneId: driverId });
      await bad({ type: 'info', targetSceneId: rearId });
      await bad({ type: 'detail_image', mediaAssetId: video.id });
      await bad({ type: 'video', mediaAssetId: image.id });
      await bad({ type: 'spec_link', specKey: 'no.such_spec' });
      await bad({ type: 'info', iconKey: 'rocket' });
      await bad({ type: 'info', yaw: 200 });

      await addHotspot(tourId, driverId, {
        type: 'scene_link',
        yaw: 180,
        pitch: -5,
        targetSceneId: rearId,
        targetYaw: 0,
        iconKey: 'seat',
        texts: texts('Go to the rear seats', 'إلى المقاعد الخلفية'),
      }).expect(201);
      await addHotspot(tourId, rearId, {
        type: 'scene_link',
        yaw: 0,
        pitch: -5,
        targetSceneId: driverId,
        texts: texts('Back to the driver seat', 'إلى مقعد السائق'),
      }).expect(201);
      await addHotspot(tourId, driverId, {
        type: 'detail_image',
        yaw: 30,
        pitch: -20,
        mediaAssetId: image.id,
        texts: texts('Console detail', 'تفاصيل الكونسول'),
      }).expect(201);
      await addHotspot(tourId, driverId, {
        type: 'video',
        yaw: 60,
        pitch: 10,
        mediaAssetId: video.id,
        iconKey: 'video',
        texts: texts('Ambient light demo', 'فيديو الإضاءة'),
      }).expect(201);
      const spec = await addHotspot(tourId, driverId, {
        type: 'info',
        yaw: 90,
        pitch: 0,
        texts: texts('Battery', 'البطارية'),
      }).expect(201);
      // Changing the type: the new type's fields are required.
      const hotspotId = spec.body.data.scenes
        .find((s: { id: string }) => s.id === driverId)
        .hotspots.at(-1).id as string;
      await t
        .http()
        .patch(`/api/v1/admin/tours/${tourId}/hotspots/${hotspotId}`)
        .set(auth(staff.manager))
        .send({ type: 'spec_link' })
        .expect(422);
      await t
        .http()
        .patch(`/api/v1/admin/tours/${tourId}/hotspots/${hotspotId}`)
        .set(auth(staff.manager))
        .send({ type: 'spec_link', specKey: 'battery.usable_kwh', iconKey: 'battery' })
        .expect(200);
    });

    it('publishes and serves the full viewer configuration to the apps', async () => {
      // The image hotspot file must be processed before publishing.
      const blocked = await publish(tourId);
      expect(codes(blocked.body)).toEqual(['hotspot_media_asset_not_ready']);
      const img = await t.prisma.sceneHotspot.findFirstOrThrow({
        where: { tourId, type: 'detail_image' },
      });
      await processInline(t, img.mediaAssetId!);
      await t.prisma.vehicleSpecification.create({
        data: { variantId: trim.variantId, specKey: 'battery.usable_kwh', valueNum: '64.5', unit: 'kWh' },
      });
      await publish(tourId).expect(200);

      const en = await t.http().get(`/api/v1/tours/${tourId}?lang=en&maxWidth=2048`).expect(200);
      const d = en.body.data;
      expect(d).toMatchObject({
        id: tourId,
        title: 'Test interior',
        carName: 'Tour Test Brand Tour Model Long Range',
        modelYear: 2026,
        marketCode: 'EG',
        marketMatch: true,
        driveSide: 'lhd',
        interiorColorName: 'White',
        isDemo: false,
        demoLabel: null,
        initialSceneId: driverId,
        sceneCount: 2,
        isReferenceForSimilarTrim: false,
      });
      expect(d.mediaOrigin).toMatch(/^https?:\/\//);
      expect(d.previewUrl).toMatch(/preview-1024\.jpg$/);
      expect(d.seatScenes.map((s: { position: string }) => s.position)).toEqual(['driver', 'rear']);
      const driver = d.scenes[0];
      expect(driver).toMatchObject({
        key: 'driver',
        positionLabel: 'Driver seat',
        title: 'Driver seat',
        view: { yaw: 0, pitch: 0, hfov: 100, minPitch: null },
        attribution: {
          credit: '360° test grid © Test studio',
          rightsHolder: 'Test studio (synthetic fixtures)',
          licenseType: 'commissioned',
        },
      });
      expect(driver.panorama.preview).toMatchObject({ width: 1024, height: 512 });
      expect(driver.panorama.renditions.map((r: { width: number }) => r.width)).toEqual([2048]);
      expect(driver.panorama.recommendedRendition.width).toBe(2048);
      expect(driver.panorama.multires).toMatchObject({
        path: '/%l/%s%y_%x',
        fallbackPath: '/fallback/%s',
        extension: 'jpg',
        tileResolution: 512,
      });
      expect(driver.panorama.multires.basePath.startsWith(d.mediaOrigin)).toBe(true);
      expect(d.scenes[1].view).toMatchObject({ yaw: 180, hfov: 90, minPitch: -60, maxPitch: 60 });

      const byType = (type: string) =>
        driver.hotspots.find((h: { type: string }) => h.type === type);
      expect(byType('scene_link')).toMatchObject({
        title: 'Go to the rear seats',
        targetSceneId: rearId,
        targetYaw: 0,
        iconKey: 'seat',
      });
      expect(byType('detail_image').image.url).toMatch(/\.webp$/);
      expect(byType('detail_image').image.credit).toBe('360° test grid © Test studio');
      expect(byType('video').video).toMatchObject({
        kind: 'embed',
        provider: 'vimeo',
        url: 'https://player.vimeo.com/video/123456789',
      });
      expect(byType('spec_link').spec).toMatchObject({
        key: 'battery.usable_kwh',
        value: 64.5,
        unit: 'kWh',
        variantSlug: trim.variantSlug,
      });
      expect(byType('info').title).toBe('Screen');
      expect(d.attributions).toEqual([
        expect.objectContaining({ text: '360° test grid © Test studio', licenseType: 'commissioned' }),
      ]);

      // Arabic, by slug, other market, device limits, caching.
      const ar = await t.http().get(`/api/v1/tours/${d.slug}?lang=ar&market=SA`).expect(200);
      expect(ar.body.data).toMatchObject({ title: 'مقصورة اختبار', marketMatch: false });
      expect(ar.body.data.scenes[0].positionLabel).toBe('مقعد السائق');
      expect(ar.body.data.scenes[0].hotspots.find((h: { type: string }) => h.type === 'scene_link').title).toBe(
        'إلى المقاعد الخلفية',
      );
      expect(ar.body.data.scenes[0].panorama.recommendedRendition.width).toBe(2048);
      const tiny = await t.http().get(`/api/v1/tours/${tourId}?maxWidth=512`).expect(200);
      expect(tiny.body.data.scenes[0].panorama.renditions).toHaveLength(1);
      await t.http().get(`/api/v1/tours/${tourId}?maxWidth=99999`).expect(422);
      const sa = await t.http().get(`/api/v1/tours?variantId=${trim.variantId}&market=SA`).expect(200);
      expect(sa.body.data).toEqual([]);
      const etag = en.headers['etag'] as string;
      expect(en.headers['cache-control']).toMatch(/public/);
      await t
        .http()
        .get(`/api/v1/tours/${tourId}?lang=en&maxWidth=2048`)
        .set('If-None-Match', etag)
        .expect(304);
      // Lists by model year.
      const byYear = await t.http().get(`/api/v1/tours?modelYearId=${trim.modelYearId}`).expect(200);
      expect((byYear.body.data as { id: string }[]).map((x) => x.id)).toContain(tourId);
    });

    it('re-checks files swapped into a published tour and hides tours whose licence expired', async () => {
      const unprocessed = await uploadAsset(t, staff.manager, await syntheticPanorama(2048), {
        kind: 'panorama',
        licenseId,
      });
      const swap = await t
        .http()
        .patch(`/api/v1/admin/tours/${tourId}/scenes/${rearId}`)
        .set(auth(staff.manager))
        .send({ assetId: unprocessed.id });
      expect(swap.status).toBe(409);
      expect(swap.body.error.code).toBe('TOUR_PUBLISHED_ASSET_NOT_READY');
      const replacement = await readyPanorama(t, staff.manager, { licenseId, tint: '#AA3300' });
      await t
        .http()
        .patch(`/api/v1/admin/tours/${tourId}/scenes/${rearId}`)
        .set(auth(staff.manager))
        .send({ assetId: replacement, initialPitch: -10 })
        .expect(200);
      const locked = await t
        .http()
        .patch(`/api/v1/admin/tours/${tourId}`)
        .set(auth(staff.manager))
        .send({ variantId: trim.otherVariantId });
      expect(locked.status).toBe(409);

      // The licence expires: the tour disappears from the apps and publishing is refused.
      const yesterday = new Date(Date.now() - 86_400_000);
      await t.prisma.assetLicense.update({ where: { id: licenseId }, data: { validUntil: yesterday } });
      await t.http().get(`/api/v1/tours/${tourId}`).expect(404);
      const list = await t.http().get(`/api/v1/tours?variantId=${trim.variantId}`).expect(200);
      expect((list.body.data as { id: string }[]).some((x) => x.id === tourId)).toBe(false);
      const readiness = await t
        .http()
        .get(`/api/v1/admin/tours/${tourId}/readiness`)
        .set(auth(staff.manager))
        .expect(200);
      expect(readiness.body.data.problems.map((p: Problem) => p.code)).toContain(
        'scene_licence_expired',
      );
      await t.prisma.assetLicense.update({ where: { id: licenseId }, data: { validUntil: null } });
      await t.http().get(`/api/v1/tours/${tourId}`).expect(200);
    });
  });

  describe('demo seed', () => {
    it('serves the synthetic demo tour clearly labelled, with tiles after processing', async () => {
      const storage = t.app.get<StorageProvider>(STORAGE_PROVIDER);
      await runDemoSeed(t.prisma, { storage });
      const featured = await t.http().get('/api/v1/tours/featured?lang=en&market=EG').expect(200);
      const demo = (featured.body.data as { id: string; isDemo: boolean }[]).find(
        (x) => x.id === DEMO_IDS.tour,
      );
      expect(demo).toMatchObject({ isDemo: true, demoLabel: 'Demo — not a real car interior' });
      // Real tours come before demo tours on the home strip.
      const flags = (featured.body.data as { isDemo: boolean }[]).map((x) => x.isDemo);
      expect(flags.indexOf(true)).toBeGreaterThan(flags.lastIndexOf(false));

      const before = await t.http().get(`/api/v1/tours/${DEMO_IDS.tour}?lang=ar`).expect(200);
      expect(before.body.data.scenes[0].panorama.multires).toBeNull();
      expect(before.body.data.scenes[0].panorama.renditions.map((r: { width: number }) => r.width)).toEqual([2048]);
      // Processing the demo panorama (in use by a published tour) keeps it ready and adds tiles.
      await processInline(t, DEMO_IDS.panoramaDriver);
      const after = await t.http().get(`/api/v1/tours/${DEMO_IDS.tour}`).expect(200);
      expect(after.body.data.scenes[0].panorama.multires).not.toBeNull();
      expect(after.body.data.scenes[0].panorama.renditions.map((r: { width: number }) => r.width)).toEqual([
        2048, 4096,
      ]);
    });
  });
});
