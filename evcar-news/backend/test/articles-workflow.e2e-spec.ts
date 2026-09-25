/**
 * Articles: editorial workflow, permissions, versions, scheduling and
 * visibility to readers (REQUIREMENTS §5, §17, §18).
 */
import { ArticleSchedulerService } from '../src/modules/articles/services/article-scheduler.service';
import {
  createDraft,
  newsStaff,
  publishArticle,
  uniqueTitle,
  type NewsStaff,
} from './articles-helpers';
import { userWithRoles } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Articles workflow (e2e)', () => {
  let t: TestApp;
  let staff: NewsStaff;

  beforeAll(async () => {
    t = await createTestApp();
    staff = await newsStaff(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  const admin = (path: string) => `/api/v1/admin/articles${path}`;

  it('an editor creates a draft (version 1 + revision) that readers cannot see', async () => {
    const draft = await createDraft(t, staff.editor);
    expect(draft).toMatchObject({ status: 'draft', currentVersion: 1, approved: false });
    expect(draft.allowedActions).toEqual(['submit']);
    expect(draft.shareUrl).toBe(`https://evcar.news/n/${draft.slug}`);
    const revisions = await t.prisma.articleRevision.count({ where: { articleId: draft.id } });
    expect(revisions).toBe(1);

    await t.http().get(`/api/v1/articles/${draft.slug}`).expect(404);
    await t.http().get(`/api/v1/articles/${draft.id}`).expect(404);
    const list = await t.http().get('/api/v1/articles?pageSize=100&allMarkets=true').expect(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).not.toContain(draft.id);
  });

  it('guests and plain users cannot use the admin API', async () => {
    await t.http().get(admin('')).expect(401);
    const reader = await userWithRoles(t, ['user']);
    await t.http().get(admin('')).set(reader.auth).expect(403);
    await t.http().post(admin('')).set(reader.auth).send({}).expect(403);
  });

  it('an editor cannot publish, approve or schedule; a content reviewer can publish', async () => {
    const draft = await createDraft(t, staff.editor);
    await t
      .http()
      .post(admin(`/${draft.id}/submit`))
      .set(staff.editor.auth)
      .send({})
      .expect(200);

    for (const action of ['publish', 'approve', 'archive']) {
      const res = await t
        .http()
        .post(admin(`/${draft.id}/${action}`))
        .set(staff.editor.auth)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    await t
      .http()
      .post(admin(`/${draft.id}/schedule`))
      .set(staff.editor.auth)
      .send({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() })
      .expect(403);

    const approved = await t
      .http()
      .post(admin(`/${draft.id}/approve`))
      .set(staff.reviewer.auth)
      .send({ note: 'Looks good' })
      .expect(200);
    expect(approved.body.data).toMatchObject({ status: 'in_review', approved: true });

    const published = await t
      .http()
      .post(admin(`/${draft.id}/publish`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    expect(published.body.data.status).toBe('published');
    expect(published.body.data.publishedAt).toBeTruthy();

    const pub = await t.http().get(`/api/v1/articles/${draft.slug}`).expect(200);
    expect(pub.body.data).toMatchObject({ id: draft.id, slug: draft.slug, language: 'en' });
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'articles.publish', entityId: draft.id },
    });
    expect(audit?.actorId).toBe(staff.reviewer.id);
  });

  it('publishing a draft that was never submitted is refused (review first)', async () => {
    const draft = await createDraft(t, staff.editor);
    const res = await t
      .http()
      .post(admin(`/${draft.id}/publish`))
      .set(staff.owner.auth)
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('ARTICLE_INVALID_TRANSITION');
  });

  it('a reviewer rejects with a note: back to draft, note visible', async () => {
    const draft = await createDraft(t, staff.editor);
    await t
      .http()
      .post(admin(`/${draft.id}/submit`))
      .set(staff.editor.auth)
      .send({})
      .expect(200);
    await t
      .http()
      .post(admin(`/${draft.id}/reject`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(422);
    const res = await t
      .http()
      .post(admin(`/${draft.id}/reject`))
      .set(staff.reviewer.auth)
      .send({ note: 'Add the source of the range figure' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      status: 'draft',
      reviewNote: 'Add the source of the range figure',
    });
  });

  it('content edits during review clear the approval', async () => {
    const draft = await createDraft(t, staff.editor);
    await t
      .http()
      .post(admin(`/${draft.id}/submit`))
      .set(staff.editor.auth)
      .send({})
      .expect(200);
    const approved = await t
      .http()
      .post(admin(`/${draft.id}/approve`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    const edited = await t
      .http()
      .patch(admin(`/${draft.id}`))
      .set(staff.editor.auth)
      .send({
        expectedVersion: approved.body.data.currentVersion,
        translations: { en: { title: `${uniqueTitle()} edited` } },
      })
      .expect(200);
    expect(edited.body.data).toMatchObject({ approved: false, currentVersion: 2 });
    // An editor cannot publish, a publisher without review permission would need approval again.
    const res = await t
      .http()
      .post(admin(`/${draft.id}/approve`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    expect(res.body.data.approved).toBe(true);
  });

  it('optimistic versioning: a stale expectedVersion is a 409', async () => {
    const draft = await createDraft(t, staff.editor);
    await t
      .http()
      .patch(admin(`/${draft.id}`))
      .set(staff.editor.auth)
      .send({ expectedVersion: 1, translations: { en: { summary: 'Changed once' } } })
      .expect(200);
    const res = await t
      .http()
      .patch(admin(`/${draft.id}`))
      .set(staff.editor.auth)
      .send({ expectedVersion: 1, translations: { en: { summary: 'Changed twice' } } })
      .expect(409);
    expect(res.body.error.code).toBe('ARTICLE_VERSION_CONFLICT');
    // A save without changes does not create a version.
    const same = await t
      .http()
      .patch(admin(`/${draft.id}`))
      .set(staff.editor.auth)
      .send({ expectedVersion: 2, translations: { en: { summary: 'Changed once' } } })
      .expect(200);
    expect(same.body.data.currentVersion).toBe(2);
  });

  it('editors edit only their own articles; published ones need the publish permission', async () => {
    const other = await userWithRoles(t, ['editor']);
    const draft = await createDraft(t, staff.editor);
    const res = await t
      .http()
      .patch(admin(`/${draft.id}`))
      .set(other.auth)
      .send({ expectedVersion: 1, translations: { en: { summary: 'Not mine' } } })
      .expect(403);
    expect(res.body.error.code).toBe('ARTICLE_NOT_OWNER');

    const published = await publishArticle(t, staff);
    const edit = await t
      .http()
      .patch(admin(`/${published.id}`))
      .set(staff.editor.auth)
      .send({ expectedVersion: published.currentVersion, translations: { en: { summary: 'x' } } })
      .expect(403);
    expect(edit.body.error.code).toBe('ARTICLE_EDIT_NEEDS_PUBLISH');

    // The reviewer (publish permission) edits it: "updated" date for readers.
    const ok = await t
      .http()
      .patch(admin(`/${published.id}`))
      .set(staff.reviewer.auth)
      .send({
        expectedVersion: published.currentVersion,
        translations: { en: { bodyHtml: '<p>Updated body with a new paragraph.</p>' } },
      })
      .expect(200);
    expect(ok.body.data.contentUpdatedAt).toBeTruthy();
    const pub = await t.http().get(`/api/v1/articles/${published.slug}`).expect(200);
    expect(pub.body.data.contentUpdatedAt).toBeTruthy();
    expect(pub.body.data.bodyHtml).toContain('Updated body');
  });

  it('the slug is locked once published', async () => {
    const published = await publishArticle(t, staff);
    const res = await t
      .http()
      .patch(admin(`/${published.id}`))
      .set(staff.owner.auth)
      .send({ expectedVersion: published.currentVersion, slug: 'another-slug-value' })
      .expect(409);
    expect(res.body.error.code).toBe('ARTICLE_SLUG_LOCKED');
  });

  it('scheduled articles appear only once due; the job is idempotent', async () => {
    const draft = await createDraft(t, staff.editor);
    await t
      .http()
      .post(admin(`/${draft.id}/submit`))
      .set(staff.editor.auth)
      .send({})
      .expect(200);
    await t
      .http()
      .post(admin(`/${draft.id}/schedule`))
      .set(staff.reviewer.auth)
      .send({ scheduledAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(422);
    const at = new Date(Date.now() + 3600_000);
    const scheduled = await t
      .http()
      .post(admin(`/${draft.id}/schedule`))
      .set(staff.reviewer.auth)
      .send({ scheduledAt: at.toISOString() })
      .expect(200);
    expect(scheduled.body.data).toMatchObject({ status: 'scheduled', approved: true });

    const scheduler = t.app.get(ArticleSchedulerService);
    expect((await scheduler.publishDue()).published).not.toContain(draft.id);
    await t.http().get(`/api/v1/articles/${draft.slug}`).expect(404);

    // Time passes: the planned time is now in the past.
    const planned = new Date(Date.now() - 1000);
    await t.prisma.article.update({ where: { id: draft.id }, data: { scheduledAt: planned } });
    const first = await scheduler.publishDue();
    expect(first.published).toContain(draft.id);
    const second = await scheduler.publishDue();
    expect(second.published).not.toContain(draft.id);

    const row = await t.prisma.article.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.status).toBe('published');
    expect(row.publishedAt?.getTime()).toBe(planned.getTime());
    const pub = await t.http().get(`/api/v1/articles/${draft.slug}`).expect(200);
    expect(pub.body.data.id).toBe(draft.id);
    const audit = await t.prisma.auditLog.count({
      where: { action: 'articles.publish_scheduled', entityId: draft.id },
    });
    expect(audit).toBe(1);
  });

  it('archive hides an article; unarchive shows it again; live articles cannot be deleted', async () => {
    const published = await publishArticle(t, staff);
    await t
      .http()
      .delete(admin(`/${published.id}`))
      .set(staff.owner.auth)
      .expect(409);
    await t
      .http()
      .post(admin(`/${published.id}/archive`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    await t.http().get(`/api/v1/articles/${published.slug}`).expect(404);
    await t
      .http()
      .post(admin(`/${published.id}/unarchive`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    await t.http().get(`/api/v1/articles/${published.slug}`).expect(200);
    await t
      .http()
      .post(admin(`/${published.id}/unpublish`))
      .set(staff.reviewer.auth)
      .send({})
      .expect(200);
    await t.http().get(`/api/v1/articles/${published.slug}`).expect(404);
    await t
      .http()
      .delete(admin(`/${published.id}`))
      .set(staff.owner.auth)
      .expect(204);
    await t
      .http()
      .get(admin(`/${published.id}`))
      .set(staff.owner.auth)
      .expect(200);
    const list = await t.http().get(admin('?deleted=only')).set(staff.owner.auth).expect(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).toContain(published.id);
    await t
      .http()
      .post(admin(`/${published.id}/undelete`))
      .set(staff.owner.auth)
      .expect(200);
  });

  it('revisions: list, diff and restore as a new version', async () => {
    const draft = await createDraft(t, staff.editor);
    const originalTitle = (
      await t
        .http()
        .get(admin(`/${draft.id}`))
        .set(staff.editor.auth)
        .expect(200)
    ).body.data.translations.en.title as string;
    await t
      .http()
      .patch(admin(`/${draft.id}`))
      .set(staff.editor.auth)
      .send({ expectedVersion: 1, translations: { en: { title: 'Second title' } } })
      .expect(200);
    const list = await t
      .http()
      .get(admin(`/${draft.id}/revisions`))
      .set(staff.editor.auth);
    expect(list.body.data.map((r: { version: number }) => r.version)).toEqual([2, 1]);
    const diff = await t
      .http()
      .get(admin(`/${draft.id}/revisions/2/diff`))
      .set(staff.editor.auth)
      .expect(200);
    expect(diff.body.data.changes).toEqual([
      { field: 'translations.en.title', before: originalTitle, after: 'Second title' },
    ]);
    // Editors lack articles.restore_revision; reviewers have it.
    await t
      .http()
      .post(admin(`/${draft.id}/revisions/1/restore`))
      .set(staff.editor.auth)
      .send({ expectedVersion: 2 })
      .expect(403);
    const restored = await t
      .http()
      .post(admin(`/${draft.id}/revisions/1/restore`))
      .set(staff.reviewer.auth)
      .send({ expectedVersion: 2 })
      .expect(200);
    expect(restored.body.data.currentVersion).toBe(3);
    expect(restored.body.data.translations.en.title).toBe(originalTitle);
    const rev3 = await t.prisma.articleRevision.findUniqueOrThrow({
      where: { articleId_version: { articleId: draft.id, version: 3 } },
    });
    expect(rev3.restoredFromVersion).toBe(1);
  });
});
