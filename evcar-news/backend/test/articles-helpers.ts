/**
 * Helpers of the articles-* e2e specs (news, categories, tags, RSS).
 */
import type { TestApp } from './utils/test-app';
import { userWithRoles, type PlatformUser } from './platform-helpers';

export interface NewsStaff {
  editor: PlatformUser;
  reviewer: PlatformUser;
  owner: PlatformUser;
}

export async function newsStaff(t: TestApp): Promise<NewsStaff> {
  const [editor, reviewer, owner] = await Promise.all([
    userWithRoles(t, ['editor']),
    userWithRoles(t, ['content_reviewer']),
    userWithRoles(t, ['owner']),
  ]);
  return { editor, reviewer, owner };
}

let seq = 0;
export function uniqueTitle(prefix = 'Test article'): string {
  seq += 1;
  return `${prefix} ${Date.now().toString(36)} ${seq}`;
}

export interface ArticleBody {
  originalLanguage?: 'ar' | 'en';
  translations?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/** POST /admin/articles (draft) and returns the admin view. */
export async function createDraft(
  t: TestApp,
  user: PlatformUser,
  body: ArticleBody = {},
): Promise<{ id: string; slug: string; currentVersion: number; [k: string]: unknown }> {
  const title = uniqueTitle();
  const res = await t
    .http()
    .post('/api/v1/admin/articles')
    .set(user.auth)
    .send({
      originalLanguage: 'en',
      translations: {
        en: {
          title,
          summary: 'A test summary written for automated tests.',
          bodyHtml: '<p>Test body written for automated tests only.</p>',
        },
      },
      ...body,
    });
  if (res.status !== 201) {
    throw new Error(`create failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/** draft → in_review (editor) → published (reviewer, implicit approval). */
export async function publishArticle(
  t: TestApp,
  staff: NewsStaff,
  body: ArticleBody = {},
): Promise<{ id: string; slug: string; currentVersion: number; [k: string]: unknown }> {
  const draft = await createDraft(t, staff.editor, body);
  await t
    .http()
    .post(`/api/v1/admin/articles/${draft.id}/submit`)
    .set(staff.editor.auth)
    .send({})
    .expect(200);
  const res = await t
    .http()
    .post(`/api/v1/admin/articles/${draft.id}/publish`)
    .set(staff.reviewer.auth)
    .send({});
  if (res.status !== 200) {
    throw new Error(`publish failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}
