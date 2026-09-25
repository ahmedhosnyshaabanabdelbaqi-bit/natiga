/**
 * Admin categories and tags (REQUIREMENTS §5, §17): permissions, bilingual
 * names, system categories, usage protection, tag merge, audit.
 */
import { createDraft, newsStaff, uniqueTitle, type NewsStaff } from './articles-helpers';
import { waitForAudit } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Categories and tags administration (e2e)', () => {
  let t: TestApp;
  let staff: NewsStaff;
  const cats = '/api/v1/admin/categories';
  const tags = '/api/v1/admin/tags';

  beforeAll(async () => {
    t = await createTestApp();
    staff = await newsStaff(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('categories: reviewers manage them, editors only read', async () => {
    const list = await t.http().get(cats).set(staff.editor.auth).expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(7);
    expect(list.body.data[0]).toHaveProperty('usage');
    await t
      .http()
      .post(cats)
      .set(staff.editor.auth)
      .send({ nameAr: 'تصنيف', nameEn: 'Category' })
      .expect(403);
    await t.http().post(cats).set(staff.reviewer.auth).send({ nameEn: 'Only English' }).expect(422);

    const suffix = Date.now().toString(36);
    const created = await t
      .http()
      .post(cats)
      .set(staff.reviewer.auth)
      .send({
        nameAr: 'شواحن منزلية',
        nameEn: `Home chargers ${suffix}`,
        defaultArticleType: 'buying_guide',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      slug: `home-chargers-${suffix}`,
      systemKey: null,
      isActive: true,
      defaultArticleType: 'buying_guide',
    });
    const audit = await waitForAudit(t, 'categories.create');
    expect(audit.entityId).toBe(created.body.data.id);

    await t
      .http()
      .post(cats)
      .set(staff.reviewer.auth)
      .send({ slug: created.body.data.slug, nameAr: 'x', nameEn: 'x' })
      .expect(409);

    // Two levels only.
    const child = await t
      .http()
      .post(cats)
      .set(staff.reviewer.auth)
      .send({ nameAr: 'فرعي', nameEn: `Child ${suffix}`, parentId: created.body.data.id })
      .expect(201);
    const grand = await t
      .http()
      .post(cats)
      .set(staff.reviewer.auth)
      .send({ nameAr: 'فرعي 2', nameEn: `Grandchild ${suffix}`, parentId: child.body.data.id })
      .expect(422);
    expect(grand.body.error.code).toBe('CATEGORY_PARENT_INVALID');
    await t
      .http()
      .patch(`${cats}/${created.body.data.id}`)
      .set(staff.reviewer.auth)
      .send({ parentId: created.body.data.id })
      .expect(422);

    // Draft articles in a category get its default article type.
    const draft = await createDraft(t, staff.editor, { categoryId: created.body.data.id });
    expect(draft.type).toBe('buying_guide');

    const inUse = await t
      .http()
      .delete(`${cats}/${created.body.data.id}`)
      .set(staff.reviewer.auth)
      .expect(409);
    expect(inUse.body.error.code).toBe('CATEGORY_IN_USE');
    await t.http().delete(`${cats}/${child.body.data.id}`).set(staff.reviewer.auth).expect(204);
  });

  it('system categories are renamed / deactivated, never deleted', async () => {
    const system = await t.prisma.category.findFirstOrThrow({ where: { systemKey: 'safety' } });
    const res = await t.http().delete(`${cats}/${system.id}`).set(staff.owner.auth).expect(409);
    expect(res.body.error.code).toBe('CATEGORY_IS_SYSTEM');
    const renamed = await t
      .http()
      .patch(`${cats}/${system.id}`)
      .set(staff.owner.auth)
      .send({ nameEn: 'Safety & ADAS', isActive: false })
      .expect(200);
    expect(renamed.body.data).toMatchObject({ nameEn: 'Safety & ADAS', isActive: false });
    const pub = await t.http().get('/api/v1/categories?lang=en').expect(200);
    expect(pub.body.data.map((c: { id: string }) => c.id)).not.toContain(system.id);
    await t.http().get(`/api/v1/categories/${system.slug}`).expect(404);
    // Inactive categories cannot be newly assigned.
    const refused = await t
      .http()
      .post('/api/v1/admin/articles')
      .set(staff.editor.auth)
      .send({
        originalLanguage: 'en',
        categoryId: system.id,
        translations: { en: { title: uniqueTitle(), bodyHtml: '<p>x</p>' } },
      })
      .expect(422);
    expect(refused.body.error.code).toBe('ARTICLE_REFERENCE_INVALID');
    await t
      .http()
      .patch(`${cats}/${system.id}`)
      .set(staff.owner.auth)
      .send({ isActive: true })
      .expect(200);
  });

  it('tags: editors create; usage-protected delete; merge moves articles', async () => {
    await t.http().post(tags).set(staff.editor.auth).send({}).expect(422);
    const a = await t
      .http()
      .post(tags)
      .set(staff.editor.auth)
      .send({ nameAr: 'بطاريات LFP' })
      .expect(201);
    expect(a.body.data.slug).toBe('بطاريات-lfp');
    const b = await t
      .http()
      .post(tags)
      .set(staff.editor.auth)
      .send({ nameEn: `LFP batteries ${Date.now().toString(36)}` })
      .expect(201);
    const draft = await createDraft(t, staff.editor, { tagIds: [a.body.data.id] });

    const used = await t
      .http()
      .delete(`${tags}/${a.body.data.id}`)
      .set(staff.editor.auth)
      .expect(409);
    expect(used.body.error.code).toBe('TAG_IN_USE');
    await t
      .http()
      .post(`${tags}/${a.body.data.id}/merge`)
      .set(staff.editor.auth)
      .send({ targetId: a.body.data.id })
      .expect(422);
    const merged = await t
      .http()
      .post(`${tags}/${a.body.data.id}/merge`)
      .set(staff.editor.auth)
      .send({ targetId: b.body.data.id })
      .expect(200);
    expect(merged.body.data).toMatchObject({ id: b.body.data.id, articleCount: 1 });
    await t.http().get(`${tags}/${a.body.data.id}`).set(staff.editor.auth).expect(404);
    const links = await t.prisma.articleTag.findMany({ where: { articleId: draft.id } });
    expect(links.map((l) => l.tagId)).toEqual([b.body.data.id]);

    await t
      .http()
      .delete(`${tags}/${b.body.data.id}?force=true`)
      .set(staff.editor.auth)
      .expect(204);
    expect(await t.prisma.articleTag.count({ where: { articleId: draft.id } })).toBe(0);

    const list = await t.http().get(`${tags}?q=lfp`).set(staff.editor.auth).expect(200);
    expect(list.body.meta).toBeDefined();
  });
});
