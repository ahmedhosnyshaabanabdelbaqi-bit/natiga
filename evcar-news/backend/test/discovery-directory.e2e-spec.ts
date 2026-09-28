/**
 * Encyclopedia (technical review workflow + safety rule) and services
 * directory (verified contacts, sponsored labelling, editorial order).
 * REQUIREMENTS §15–16. Fictional test data only.
 */
import { createEntry, createProvider } from './discovery-helpers';
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

const CHECKLIST = {
  facts_verified: true,
  no_safety_bypass: true,
  no_unsafe_electrical_instructions: true,
  qualified_electrician_referral: true,
  units_and_standards_correct: true,
  translations_consistent: true,
};

describe('discovery: encyclopedia + services directory (e2e)', () => {
  let t: TestApp;
  let editor: PlatformUser;
  let reviewer: PlatformUser;
  let stationManager: PlatformUser;
  let owner: PlatformUser;
  let plain: PlatformUser;

  beforeAll(async () => {
    t = await createTestApp();
    [editor, reviewer, stationManager, owner, plain] = await Promise.all([
      userWithRoles(t, ['editor']),
      userWithRoles(t, ['content_reviewer']),
      userWithRoles(t, ['station_manager']),
      userWithRoles(t, ['owner']),
      userWithRoles(t, ['user']),
    ]);
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('encyclopedia', () => {
    let id: string;
    let slug: string;

    it('public categories are listed with counts', async () => {
      const res = await t.http().get('/api/v1/encyclopedia/categories?lang=ar').expect(200);
      const keys = res.body.data.map((c: { key: string }) => c.key);
      expect(keys).toEqual(
        expect.arrayContaining(['home_charging', 'fast_charging', 'connectors']),
      );
      expect(res.body.data[0].name).toBeTruthy();
    });

    it('editor creates a draft (sanitized HTML) that is not public', async () => {
      const res = await t
        .http()
        .post('/api/v1/admin/encyclopedia/entries')
        .set(editor.auth)
        .send({
          categoryKey: 'home_charging',
          translations: {
            en: {
              title: 'Choosing a home wallbox (test)',
              summary: 'Automated test entry.',
              bodyHtml:
                '<p>Have a qualified electrician install it.</p><script>alert(1)</script><p onclick="x()">ok</p>',
            },
            ar: {
              title: 'اختيار شاحن منزلي (اختبار)',
              bodyHtml: '<p>يجب أن يركبه كهربائي مؤهل.</p>',
            },
          },
        })
        .expect(201);
      id = res.body.data.id;
      slug = res.body.data.slug;
      expect(res.body.data.status).toBe('draft');
      const en = res.body.data.translations.find((x: { locale: string }) => x.locale === 'en');
      expect(en.bodyHtml).not.toContain('<script');
      expect(en.bodyHtml).not.toContain('onclick');
      await t.http().get(`/api/v1/encyclopedia/${slug}`).expect(404);
      await t
        .http()
        .post('/api/v1/admin/encyclopedia/entries')
        .set(plain.auth)
        .send({ categoryKey: 'home_charging', translations: { en: { title: 'x', bodyHtml: 'y' } } })
        .expect(403);
    });

    it('blocks obviously unsafe electrical instructions', async () => {
      const bad = await t
        .http()
        .post('/api/v1/admin/encyclopedia/entries')
        .set(editor.auth)
        .send({
          categoryKey: 'home_charging',
          translations: {
            en: { title: 'Unsafe (test)', bodyHtml: '<p>To charge faster, bypass the RCD.</p>' },
          },
        })
        .expect(201);
      const res = await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${bad.body.data.id}/submit`)
        .set(editor.auth)
        .expect(422);
      expect(JSON.stringify(res.body.error.details)).toContain('unsafeElectricalInstructions');
    });

    it('cannot be published before the technical review', async () => {
      await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/submit`)
        .set(editor.auth)
        .expect(200);
      const res = await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/publish`)
        .set(reviewer.auth)
        .expect(409);
      expect(res.body.error.code).toBe('ENCYCLOPEDIA_REVIEW_REQUIRED');
      // Content is locked while in review.
      const locked = await t
        .http()
        .patch(`/api/v1/admin/encyclopedia/entries/${id}`)
        .set(editor.auth)
        .send({ translations: { en: { title: 'Changed', bodyHtml: '<p>x</p>' } } })
        .expect(409);
      expect(locked.body.error.code).toBe('ENCYCLOPEDIA_ENTRY_LOCKED');
    });

    it('review needs every checklist item + attestation, by someone else than the author', async () => {
      await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/review`)
        .set(editor.auth)
        .send({ checklist: CHECKLIST, attestation: true })
        .expect(403); // editors cannot review
      const partial = await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/review`)
        .set(reviewer.auth)
        .send({ checklist: { ...CHECKLIST, no_safety_bypass: false }, attestation: true })
        .expect(422);
      expect(JSON.stringify(partial.body.error.details)).toContain('checklist.no_safety_bypass');
      await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/review`)
        .set(reviewer.auth)
        .send({ checklist: CHECKLIST, attestation: false })
        .expect(422);
      const ok = await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/review`)
        .set(reviewer.auth)
        .send({ checklist: CHECKLIST, attestation: true, note: 'Checked against standards.' })
        .expect(200);
      expect(ok.body.data.review.checklist).toEqual(CHECKLIST);
      expect(ok.body.data.allowedActions).toContain('publish');
      const audit = await waitForAudit(t, 'encyclopedia.technical_review');
      expect(audit.entityId).toBe(id);
      expect(audit.actorId).toBe(reviewer.id);
      expect(JSON.stringify(audit.after)).toContain('attestation');
    });

    it('the author cannot review their own entry', async () => {
      const own = await t
        .http()
        .post('/api/v1/admin/encyclopedia/entries')
        .set(owner.auth)
        .send({
          categoryKey: 'connectors',
          translations: { en: { title: 'Owner entry (test)', bodyHtml: '<p>Test body.</p>' } },
        })
        .expect(201);
      await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${own.body.data.id}/submit`)
        .set(owner.auth)
        .expect(200);
      const res = await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${own.body.data.id}/review`)
        .set(owner.auth)
        .send({ checklist: CHECKLIST, attestation: true })
        .expect(409);
      expect(res.body.error.code).toBe('ENCYCLOPEDIA_SELF_REVIEW');
    });

    it('published entry is public with the reviewed badge and a safety notice', async () => {
      await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/publish`)
        .set(reviewer.auth)
        .expect(200);
      const res = await t.http().get(`/api/v1/encyclopedia/${slug}?lang=ar`).expect(200);
      expect(res.body.data).toMatchObject({
        title: 'اختيار شاحن منزلي (اختبار)',
        language: 'ar',
        isFallback: false,
        review: { reviewed: true, label: 'راجعه مختص تقني' },
        category: { key: 'home_charging' },
      });
      expect(res.body.data.safetyNotice).toContain('كهربائي مؤهل');
      const list = await t
        .http()
        .get('/api/v1/encyclopedia?category=home_charging&lang=en')
        .expect(200);
      expect(list.body.data.map((e: { id: string }) => e.id)).toContain(id);
      const q = await t.http().get('/api/v1/encyclopedia').query({ q: 'wallbox' }).expect(200);
      expect(q.body.data.map((e: { id: string }) => e.id)).toEqual([id]);
    });

    it('unpublish returns to draft and clears the review', async () => {
      const res = await t
        .http()
        .post(`/api/v1/admin/encyclopedia/entries/${id}/unpublish`)
        .set(reviewer.auth)
        .expect(200);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.review.reviewedAt).toBeNull();
      await t.http().get(`/api/v1/encyclopedia/${slug}`).expect(404);
    });

    it('unreviewed entries never reach the public list', async () => {
      const unreviewed = await createEntry(t, {
        titleEn: 'Unreviewed (test)',
        status: 'in_review',
      });
      const list = await t.http().get('/api/v1/encyclopedia?pageSize=100').expect(200);
      expect(list.body.data.map((e: { id: string }) => e.id)).not.toContain(unreviewed.id);
    });

    it('system categories cannot be deleted; custom ones can', async () => {
      await t
        .http()
        .delete('/api/v1/admin/encyclopedia/categories/home_charging')
        .set(owner.auth)
        .expect(409);
      await t
        .http()
        .post('/api/v1/admin/encyclopedia/categories')
        .set(owner.auth)
        .send({ key: 'test_etiquette', nameAr: 'آداب الشحن', nameEn: 'Charging etiquette' })
        .expect(201);
      await t
        .http()
        .delete('/api/v1/admin/encyclopedia/categories/test_etiquette')
        .set(owner.auth)
        .expect(204);
    });
  });

  describe('services directory', () => {
    let alpha: string;
    let beta: string;
    let gamma: string;

    beforeAll(async () => {
      // Fictional providers in a unique city; order must be verified first, then name.
      alpha = (
        await createProvider(t, {
          nameEn: 'Alpha test centre',
          city: 'Testopolis',
          verified: true,
          lat: 30.0,
          lng: 31.0,
          isAlwaysOpen: true,
        })
      ).id;
      beta = (
        await createProvider(t, {
          nameEn: 'Beta test centre',
          city: 'Testopolis',
          sponsored: true,
          lat: 30.01,
          lng: 31.0,
        })
      ).id;
      gamma = (
        await createProvider(t, {
          nameEn: 'Gamma test centre',
          city: 'Testopolis',
          lat: 30.2,
          lng: 31.0,
          openingHours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        })
      ).id;
      await createProvider(t, { nameEn: 'Draft test centre', city: 'Testopolis', status: 'draft' });
    });

    it('editorial order ignores sponsorship; sponsored entries are labelled separately', async () => {
      const res = await t
        .http()
        .get('/api/v1/services')
        .query({ city: 'testopolis', lang: 'en' })
        .expect(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([alpha, beta, gamma]);
      const b = res.body.data[1];
      expect(b).toMatchObject({ isSponsored: true, sponsorLabel: 'Sponsored (test)' });
      expect(res.body.data[0]).toMatchObject({ isSponsored: false, sponsorLabel: null });
      expect(res.body.meta.sponsored.map((p: { id: string }) => p.id)).toEqual([beta]);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.data[0].contact).toMatchObject({ verified: true, stale: false });
      expect(res.body.data[0].contact.label).toMatch(/^Verified on /);
      expect(res.body.data[2].contact).toMatchObject({
        verified: false,
        verifiedAt: null,
        label: 'Contact details have not been verified',
      });
    });

    it('expired sponsorship is no longer flagged', async () => {
      await t.prisma.serviceProvider.update({
        where: { id: beta },
        data: { sponsoredUntil: new Date(Date.now() - 1000) },
      });
      const res = await t.http().get('/api/v1/services').query({ city: 'Testopolis' }).expect(200);
      expect(res.body.meta.sponsored).toEqual([]);
      const b = res.body.data.find((p: { id: string }) => p.id === beta);
      expect(b).toMatchObject({ isSponsored: false, sponsorLabel: null });
      await t.prisma.serviceProvider.update({
        where: { id: beta },
        data: { sponsoredUntil: null },
      });
    });

    it('orders by distance around a point and filters open now', async () => {
      const res = await t
        .http()
        .get('/api/v1/services')
        .query({ lat: 30.3, lng: 31.0, radiusKm: 50, city: 'Testopolis' })
        .expect(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([gamma, beta, alpha]);
      expect(res.body.data[0].distanceM).toBeGreaterThan(0);
      const open = await t
        .http()
        .get('/api/v1/services')
        .query({ city: 'Testopolis', openNow: 'true' })
        .expect(200);
      expect(open.body.data.map((p: { id: string }) => p.id)).toEqual([alpha]);
    });

    it('types and detail', async () => {
      const types = await t.http().get('/api/v1/services/types?lang=ar').expect(200);
      const sc = types.body.data.find((x: { type: string }) => x.type === 'service_center');
      expect(sc.label).toBe('مركز خدمة');
      expect(sc.count).toBeGreaterThanOrEqual(3);
      const detail = await t.http().get(`/api/v1/services/${gamma}`).expect(200);
      expect(detail.body.data.openingHours[0]).toEqual({ day: 'mon', windows: [] });
      expect(detail.body.data.openNow).toBe('closed');
    });

    it('admin: create → publish, sponsorship needs ads.manage, contact verification', async () => {
      const forbidden = await t
        .http()
        .post('/api/v1/admin/services')
        .set(stationManager.auth)
        .send({
          type: 'charger_installer',
          nameAr: 'مركّب شواحن اختبار',
          nameEn: 'Test installer',
          marketCode: 'EG',
          isSponsored: true,
          sponsorLabel: 'Ad',
        })
        .expect(403);
      expect(forbidden.body.error.code).toBe('SPONSORSHIP_PERMISSION_REQUIRED');

      const created = await t
        .http()
        .post('/api/v1/admin/services')
        .set(stationManager.auth)
        .send({
          type: 'charger_installer',
          nameAr: 'مركّب شواحن اختبار',
          nameEn: 'Test installer',
          marketCode: 'EG',
          city: 'Testopolis',
          phone: '+20 111 000 0000',
          openingHours: { mon: [['09:00', '17:00']] },
        })
        .expect(201);
      const pid = created.body.data.id;
      expect(created.body.data.status).toBe('draft');
      await t.http().get(`/api/v1/services/${pid}`).expect(404);

      await t
        .http()
        .post(`/api/v1/admin/services/${pid}/verify-contact`)
        .set(stationManager.auth)
        .send({ note: 'Called the listed number (test).' })
        .expect(200);
      await t
        .http()
        .post(`/api/v1/admin/services/${pid}/publish`)
        .set(stationManager.auth)
        .expect(200);
      const pub = await t.http().get(`/api/v1/services/${pid}`).expect(200);
      expect(pub.body.data.contact.verified).toBe(true);

      // Changing the phone clears the verification.
      const upd = await t
        .http()
        .patch(`/api/v1/admin/services/${pid}`)
        .set(stationManager.auth)
        .send({ phone: '+20 122 000 0000' })
        .expect(200);
      expect(upd.body.data.contactVerifiedAt).toBeNull();

      // Sponsored without label is rejected; the owner (ads.manage) can sponsor with a label.
      await t
        .http()
        .patch(`/api/v1/admin/services/${pid}`)
        .set(owner.auth)
        .send({ isSponsored: true })
        .expect(422);
      const sp = await t
        .http()
        .patch(`/api/v1/admin/services/${pid}`)
        .set(owner.auth)
        .send({ isSponsored: true, sponsorLabel: 'إعلان' })
        .expect(200);
      expect(sp.body.data.isSponsored).toBe(true);
      const audit = await waitForAudit(t, 'services.update');
      expect(audit.entityId).toBe(pid);

      // Invalid opening hours / unknown market → 422.
      await t
        .http()
        .patch(`/api/v1/admin/services/${pid}`)
        .set(stationManager.auth)
        .send({ openingHours: { mon: [['25:00', '26:00']] } })
        .expect(422);
      await t
        .http()
        .post('/api/v1/admin/services')
        .set(stationManager.auth)
        .send({ type: 'dealer', nameAr: 'x', nameEn: 'x', marketCode: 'ZZ' })
        .expect(422);
      await t.http().get('/api/v1/admin/services').set(plain.auth).expect(403);
    });
  });
});
