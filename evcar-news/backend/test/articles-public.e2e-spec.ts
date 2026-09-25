/**
 * Public news API: visibility, language fallback, market targeting, filters,
 * HTML policy + media rights, corrections, previews, view counter, caching,
 * categories and tags (REQUIREMENTS §3, §5, §19).
 */
import sharp from 'sharp';
import { ArticleSearchIndexService } from '../src/modules/articles/services/article-search-index.service';
import {
  createDraft,
  newsStaff,
  publishArticle,
  uniqueTitle,
  type NewsStaff,
} from './articles-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface Summary {
  id: string;
  slug: string;
  language: string;
  isFallback: boolean;
  availableLanguages: string[];
  [k: string]: unknown;
}

describe('Public articles API (e2e)', () => {
  let t: TestApp;
  let staff: NewsStaff;

  beforeAll(async () => {
    t = await createTestApp();
    staff = await newsStaff(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  const ids = (body: any): string[] => (body as { data: Summary[] }).data.map((a) => a.id);

  it('serves the request language, else the original language (isFallback)', async () => {
    const ar = await publishArticle(t, staff, {
      originalLanguage: 'ar',
      translations: {
        ar: {
          title: `خبر تجريبي للاختبار ${uniqueTitle('')}`,
          summary: 'ملخص مكتوب للاختبارات الآلية فقط.',
          bodyHtml: '<p>نص مكتوب للاختبارات الآلية فقط.</p>',
        },
      },
    });
    const en = await t.http().get(`/api/v1/articles/${ar.slug}?lang=en`).expect(200);
    expect(en.body.data).toMatchObject({
      language: 'ar',
      requestedLanguage: 'en',
      isFallback: true,
      availableLanguages: ['ar'],
    });
    const list = await t.http().get('/api/v1/articles?lang=en&pageSize=100').expect(200);
    const item = (list.body.data as Summary[]).find((a) => a.id === ar.id);
    expect(item).toMatchObject({ language: 'ar', isFallback: true });
    const strict = await t
      .http()
      .get('/api/v1/articles?lang=en&languageMode=strict&pageSize=100')
      .expect(200);
    expect(ids(strict.body)).not.toContain(ar.id);
    const arabic = await t.http().get(`/api/v1/articles/${ar.slug}`).set('Accept-Language', 'ar');
    expect(arabic.body.data).toMatchObject({ language: 'ar', isFallback: false });
  });

  it('unreviewed machine translations are never served; a review makes them public', async () => {
    const a = await publishArticle(t, staff);
    const added = await t
      .http()
      .patch(`/api/v1/admin/articles/${a.id}`)
      .set(staff.reviewer.auth)
      .send({
        expectedVersion: a.currentVersion,
        translations: {
          ar: {
            title: 'ترجمة آلية للاختبار',
            bodyHtml: '<p>نص مترجم آليًا للاختبار.</p>',
            isMachineTranslated: true,
          },
        },
      })
      .expect(200);
    expect(added.body.data.translations.ar.servable).toBe(false);
    const before = await t.http().get(`/api/v1/articles/${a.slug}?lang=ar`).expect(200);
    expect(before.body.data).toMatchObject({ language: 'en', isFallback: true });
    expect(before.body.data.availableLanguages).toEqual(['en']);

    // Editors cannot "un-flag" a machine text; a reviewer marks it reviewed.
    await t
      .http()
      .patch(`/api/v1/admin/articles/${a.id}`)
      .set(staff.reviewer.auth)
      .send({
        expectedVersion: added.body.data.currentVersion,
        translations: { ar: { isMachineTranslated: false } },
      })
      .expect(422);
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/translations/ar/mark-reviewed`)
      .set(staff.editor.auth)
      .send({ expectedVersion: added.body.data.currentVersion })
      .expect(403);
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/translations/ar/mark-reviewed`)
      .set(staff.reviewer.auth)
      .send({ expectedVersion: added.body.data.currentVersion })
      .expect(200);
    const after = await t.http().get(`/api/v1/articles/${a.slug}?lang=ar`).expect(200);
    expect(after.body.data).toMatchObject({
      language: 'ar',
      isFallback: false,
      machineTranslated: true,
    });
  });

  it('market targeting: hidden in other markets unless allMarkets; detail always served', async () => {
    const sa = await publishArticle(t, staff, { marketCodes: ['SA'] });
    const eg = await t.http().get('/api/v1/articles?pageSize=100&market=EG').expect(200);
    expect(ids(eg.body)).not.toContain(sa.id);
    const saList = await t
      .http()
      .get('/api/v1/articles?pageSize=100')
      .set('X-Market', 'SA')
      .expect(200);
    expect(ids(saList.body)).toContain(sa.id);
    const all = await t.http().get('/api/v1/articles?pageSize=100&allMarkets=true').expect(200);
    expect(ids(all.body)).toContain(sa.id);
    const detail = await t.http().get(`/api/v1/articles/${sa.slug}?market=EG`).expect(200);
    expect(detail.body.data).toMatchObject({ marketMatch: false, marketCodes: ['SA'] });
    const global = await publishArticle(t, staff);
    const egAgain = await t.http().get('/api/v1/articles?pageSize=100&market=EG').expect(200);
    expect(ids(egAgain.body)).toContain(global.id);
  });

  it('filters by category (incl. sub-categories), tag, type, featured and text', async () => {
    const category = await t.prisma.category.findFirstOrThrow({ where: { systemKey: 'reviews' } });
    const tag = await t
      .http()
      .post('/api/v1/admin/tags')
      .set(staff.editor.auth)
      .send({ nameEn: `Fast charging ${uniqueTitle('')}`, nameAr: 'شحن سريع' })
      .expect(201);
    const word = `zyxquux${Date.now().toString(36)}`;
    const a = await publishArticle(t, staff, {
      type: 'review',
      categoryId: category.id,
      tagIds: [tag.body.data.id],
      translations: {
        en: {
          title: `Long-term review ${word}`,
          bodyHtml: '<p>Body text for filters.</p>',
        },
      },
    });
    const byCategory = await t.http().get(`/api/v1/articles?category=${category.slug}`).expect(200);
    expect(ids(byCategory.body)).toContain(a.id);
    const byTag = await t.http().get(`/api/v1/articles?tag=${tag.body.data.slug}`).expect(200);
    expect(ids(byTag.body)).toEqual([a.id]);
    const byType = await t.http().get('/api/v1/articles?type=review&pageSize=100').expect(200);
    expect(ids(byType.body)).toContain(a.id);
    const byText = await t.http().get(`/api/v1/articles?q=${word.toUpperCase()}`).expect(200);
    expect(ids(byText.body)).toEqual([a.id]);
    const unknown = await t.http().get('/api/v1/articles?category=no-such-category').expect(200);
    expect(unknown.body.meta.total).toBe(0);
    const summary = (byTag.body.data as Summary[])[0];
    expect(summary).toMatchObject({
      type: 'review',
      category: { id: category.id, slug: category.slug },
      tags: [{ id: tag.body.data.id }],
      author: { name: staff.editor.email ? expect.any(String) : null },
      isSponsored: false,
      isDemo: false,
    });
  });

  it('Arabic text search is normalized (alef / ta marbuta / diacritics)', async () => {
    const a = await publishArticle(t, staff, {
      originalLanguage: 'ar',
      translations: {
        ar: {
          title: `إطلاق سيارة كهربائيّة جديدة ${Date.now()}`,
          bodyHtml: '<p>نص تجريبي للاختبار.</p>',
        },
      },
    });
    const res = await t
      .http()
      .get(`/api/v1/articles?q=${encodeURIComponent('اطلاق سياره كهربائية')}&pageSize=100`)
      .expect(200);
    expect(ids(res.body)).toContain(a.id);
  });

  it('filters by car (brand / model / variant, slug or id) and lists related cars', async () => {
    const suffix = Date.now().toString(36);
    const brand = await t.prisma.brand.create({
      data: {
        slug: `tb-${suffix}`,
        nameEn: 'Test Brand',
        nameAr: 'ماركة اختبار',
        status: 'published',
      },
    });
    const model = await t.prisma.carModel.create({
      data: {
        brandId: brand.id,
        slug: `tb-${suffix}-m1`,
        nameEn: 'Model One',
        nameAr: 'موديل واحد',
        status: 'published',
      },
    });
    const generation = await t.prisma.generation.create({
      data: { modelId: model.id, slug: 'g1', nameEn: 'Gen 1', nameAr: 'الجيل 1' },
    });
    const year = await t.prisma.modelYear.create({
      data: { generationId: generation.id, year: 2026 },
    });
    const variant = await t.prisma.vehicleVariant.create({
      data: {
        modelYearId: year.id,
        slug: `tb-${suffix}-m1-2026-lr`,
        nameEn: 'Long Range',
        nameAr: 'المدى الطويل',
        powertrainType: 'BEV',
        status: 'published',
      },
    });
    const aboutModel = await publishArticle(t, staff, {
      vehicleLinks: [{ type: 'model', id: model.id }],
    });
    const aboutVariant = await publishArticle(t, staff, {
      vehicleLinks: [{ type: 'variant', id: variant.id }],
    });
    const byBrand = await t.http().get(`/api/v1/articles?brand=${brand.slug}`).expect(200);
    expect(ids(byBrand.body).sort()).toEqual([aboutModel.id, aboutVariant.id].sort());
    const byModel = await t.http().get(`/api/v1/articles?model=${model.id}`).expect(200);
    expect(ids(byModel.body).sort()).toEqual([aboutModel.id, aboutVariant.id].sort());
    const byVariant = await t.http().get(`/api/v1/articles?vehicle=${variant.slug}`).expect(200);
    expect(ids(byVariant.body).sort()).toEqual([aboutModel.id, aboutVariant.id].sort());

    const detail = await t.http().get(`/api/v1/articles/${aboutVariant.slug}?lang=en`).expect(200);
    expect(detail.body.data.relatedVehicles).toEqual([
      {
        type: 'variant',
        id: variant.id,
        slug: variant.slug,
        name: 'Model One Long Range',
        brandName: 'Test Brand',
        modelSlug: model.slug,
        modelYear: 2026,
      },
    ]);
    expect(detail.body.data.relatedArticles.map((r: Summary) => r.id)).toContain(aboutModel.id);

    // Unpublished cars are not shown to readers.
    await t.prisma.vehicleVariant.update({ where: { id: variant.id }, data: { status: 'draft' } });
    const hidden = await t.http().get(`/api/v1/articles/${aboutVariant.slug}`).expect(200);
    expect(hidden.body.data.relatedVehicles).toEqual([]);
  });

  it('sanitizes HTML server-side and enforces the embed / image rights policy', async () => {
    const draft = await createDraft(t, staff.editor, {
      translations: {
        en: {
          title: uniqueTitle(),
          bodyHtml:
            '<h2 onclick="x()">Specs</h2><script>alert(1)</script><table><tr><td>Range</td><td>500 km (WLTP)</td></tr></table>' +
            '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com">ok</a></p>' +
            '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&start=10"></iframe>',
        },
      },
    });
    const body = (draft as unknown as { translations: { en: { bodyHtml: string } } }).translations
      .en.bodyHtml;
    expect(body).not.toMatch(/<script|onclick|javascript:|autoplay/);
    expect(body).toContain('<table>');
    expect(body).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=10');
    expect(body).toContain('rel="noopener noreferrer nofollow"');

    const badEmbed = await t
      .http()
      .post('/api/v1/admin/articles')
      .set(staff.editor.auth)
      .send({
        originalLanguage: 'en',
        translations: {
          en: { title: uniqueTitle(), bodyHtml: '<iframe src="https://evil.example/x"></iframe>' },
        },
      })
      .expect(422);
    expect(badEmbed.body.error.code).toBe('ARTICLE_EMBED_NOT_ALLOWED');

    const hotlink = await t
      .http()
      .post('/api/v1/admin/articles')
      .set(staff.editor.auth)
      .send({
        originalLanguage: 'en',
        translations: {
          en: { title: uniqueTitle(), bodyHtml: '<img src="https://images.example.com/car.jpg">' },
        },
      })
      .expect(422);
    expect(hotlink.body.error.code).toBe('ARTICLE_IMAGE_NOT_LICENSED');
    expect(hotlink.body.error.details.images).toEqual(['https://images.example.com/car.jpg']);
  });

  it('uploads a licensed image, uses it as cover and inline figure, shows the credit', async () => {
    const png = await sharp({
      create: { width: 1200, height: 675, channels: 3, background: { r: 10, g: 92, b: 255 } },
    })
      .png()
      .toBuffer();
    await t
      .http()
      .post('/api/v1/admin/articles/images')
      .set(staff.editor.auth)
      .field('licenseType', 'press_kit')
      .field('rightsHolder', 'Test Rights Holder')
      .field('attributionRequired', 'true')
      .attach('file', png, { filename: 'cover.png', contentType: 'image/png' })
      .expect(422);
    await t
      .http()
      .post('/api/v1/admin/articles/images')
      .set(staff.editor.auth)
      .field('licenseType', 'press_kit')
      .field('rightsHolder', 'Test')
      .attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' })
      .expect(422);
    const upload = await t
      .http()
      .post('/api/v1/admin/articles/images')
      .set(staff.editor.auth)
      .field('licenseType', 'press_kit')
      .field('rightsHolder', 'Test Rights Holder')
      .field('creditText', 'Test Photographer')
      .field('altTextEn', 'A blue test image')
      .attach('file', png, { filename: 'cover.png', contentType: 'image/png' })
      .expect(201);
    const image = upload.body.data;
    expect(image).toMatchObject({ credit: 'Test Photographer', licenseType: 'press_kit' });
    expect(image.variants.map((v: { width: number }) => v.width)).toEqual([480, 960, 1200]);
    expect(image.html).toContain('<figure>');

    const a = await publishArticle(t, staff, {
      coverAssetId: image.id,
      translations: {
        en: { title: uniqueTitle(), bodyHtml: `<p>Intro</p>${image.html as string}` },
      },
    });
    const pub = await t.http().get(`/api/v1/articles/${a.slug}?lang=en`).expect(200);
    expect(pub.body.data.coverImage).toMatchObject({
      id: image.id,
      credit: 'Test Photographer',
      alt: 'A blue test image',
      licenseType: 'press_kit',
    });
    expect(pub.body.data.bodyHtml).toContain(image.url);
    // The public file is served.
    const path = new URL(image.url as string).pathname;
    await t.http().get(path).expect(200);
  });

  it('corrections log is public; internal notes are not', async () => {
    const a = await publishArticle(t, staff);
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/corrections`)
      .set(staff.editor.auth)
      .send({ noteEn: 'x' })
      .expect(403);
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/corrections`)
      .set(staff.reviewer.auth)
      .send({})
      .expect(422);
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/corrections`)
      .set(staff.reviewer.auth)
      .send({
        kind: 'correction',
        noteEn: 'The range figure was corrected to WLTP.',
        noteAr: 'صُحح رقم المدى إلى WLTP.',
      })
      .expect(201);
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/corrections`)
      .set(staff.reviewer.auth)
      .send({ noteEn: 'Internal only', isPublic: false })
      .expect(201);
    const en = await t.http().get(`/api/v1/articles/${a.slug}?lang=en`).expect(200);
    expect(en.body.data.corrections).toEqual([
      expect.objectContaining({
        kind: 'correction',
        note: 'The range figure was corrected to WLTP.',
        noteLanguage: 'en',
      }),
    ]);
  });

  it('signed preview links show drafts without caching; bad tokens are 401', async () => {
    const draft = await createDraft(t, staff.editor);
    const token = await t
      .http()
      .post(`/api/v1/admin/articles/${draft.id}/preview-token`)
      .set(staff.editor.auth)
      .send({ ttlMinutes: 30 })
      .expect(200);
    const res = await t.http().get(`/api/v1/articles/preview/${token.body.data.token}`).expect(200);
    expect(res.body.data).toMatchObject({ id: draft.id, preview: true, status: 'draft' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    const bad = await t
      .http()
      .get(`/api/v1/articles/preview/${token.body.data.token}x`)
      .expect(401);
    expect(bad.body.error.code).toBe('PREVIEW_TOKEN_INVALID');
  });

  it('anonymous view counter: once per reader per window, nothing personal stored', async () => {
    const a = await publishArticle(t, staff);
    await t
      .http()
      .post(`/api/v1/articles/${a.slug}/view`)
      .set('User-Agent', 'reader-a')
      .expect(204);
    await t
      .http()
      .post(`/api/v1/articles/${a.slug}/view`)
      .set('User-Agent', 'reader-a')
      .expect(204);
    await t.http().post(`/api/v1/articles/${a.id}/view`).set('User-Agent', 'reader-b').expect(204);
    const stats = await t.prisma.contentDailyStat.findMany({
      where: { entityType: 'article', entityId: a.id },
    });
    expect(stats).toHaveLength(1);
    expect(stats[0].views).toBe(2);
    await t.http().post('/api/v1/articles/no-such-article/view').expect(404);
    const popular = await t.http().get('/api/v1/articles?sort=popular&pageSize=1').expect(200);
    expect(ids(popular.body)).toEqual([a.id]);
  });

  it('public GETs carry Cache-Control, Vary and an ETag (304 on If-None-Match)', async () => {
    const a = await publishArticle(t, staff);
    const first = await t.http().get(`/api/v1/articles/${a.slug}`).expect(200);
    expect(first.headers['cache-control']).toContain('public');
    expect(first.headers['vary']).toContain('Accept-Language');
    const etag = first.headers['etag'];
    expect(etag).toBeTruthy();
    await t.http().get(`/api/v1/articles/${a.slug}`).set('If-None-Match', etag).expect(304);
    const list = await t.http().get('/api/v1/articles').expect(200);
    expect(list.headers['etag']).toBeTruthy();
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('search index rows follow publication', async () => {
    const a = await publishArticle(t, staff);
    const docs = await t.prisma.searchDocument.findMany({
      where: { entityType: 'article', entityId: a.id },
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ locale: 'en', slug: a.slug, isPublished: true });
    await t
      .http()
      .post(`/api/v1/admin/articles/${a.id}/unpublish`)
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    expect(
      await t.prisma.searchDocument.count({ where: { entityType: 'article', entityId: a.id } }),
    ).toBe(0);
    await t.app.get(ArticleSearchIndexService).reindexAll();
  });

  it('categories and tags (public)', async () => {
    const cats = await t.http().get('/api/v1/categories?lang=en').expect(200);
    const keys = cats.body.data as Array<{ slug: string; name: string; articleCount: number }>;
    expect(keys.length).toBeGreaterThanOrEqual(7);
    expect(keys.every((c) => c.name && typeof c.articleCount === 'number')).toBe(true);
    const reviews = await t.prisma.category.findFirstOrThrow({ where: { systemKey: 'reviews' } });
    const one = await t.http().get(`/api/v1/categories/${reviews.slug}?lang=ar`).expect(200);
    expect(one.body.data.name).toBe(one.body.data.nameAr);
    await t.http().get('/api/v1/categories/no-such').expect(404);

    const tags = await t.http().get('/api/v1/tags').expect(200);
    expect(tags.body.meta).toBeDefined();
    // Only tags used by visible articles are listed.
    const unused = await t
      .http()
      .post('/api/v1/admin/tags')
      .set(staff.editor.auth)
      .send({ nameEn: `Unused ${uniqueTitle('')}` })
      .expect(201);
    const again = await t.http().get('/api/v1/tags?pageSize=100').expect(200);
    expect(again.body.data.map((x: { id: string }) => x.id)).not.toContain(unused.body.data.id);
    await t.http().get(`/api/v1/tags/${unused.body.data.slug}`).expect(200);
  });
});
