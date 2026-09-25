import { ContentStatus } from '../../../generated/prisma/enums';
import {
  allowedActions,
  decideTransition,
  editDecision,
  WORKFLOW_ACTIONS,
  type WorkflowState,
} from './article-workflow';

const EDITOR = new Set(['articles.read', 'articles.create', 'articles.update', 'articles.submit']);
const REVIEWER = new Set([
  ...EDITOR,
  'articles.update_any',
  'articles.review',
  'articles.publish',
  'articles.archive',
  'articles.restore_revision',
]);
/** A publisher who is not a reviewer (custom role). */
const PUBLISHER_ONLY = new Set([...EDITOR, 'articles.publish']);

const state = (status: ContentStatus, extra: Partial<WorkflowState> = {}): WorkflowState => ({
  status,
  approved: false,
  isOwn: true,
  deleted: false,
  ...extra,
});

describe('article workflow', () => {
  it('editor: draft → in_review only', () => {
    expect(allowedActions(state('draft'), EDITOR)).toEqual(['submit']);
    expect(decideTransition('submit', state('draft'), EDITOR)).toEqual({
      ok: true,
      to: 'in_review',
      implicitApproval: false,
    });
    expect(allowedActions(state('in_review'), EDITOR)).toEqual(['withdraw']);
  });

  it('editors can never publish, schedule, approve or archive', () => {
    for (const status of Object.values(ContentStatus)) {
      for (const action of ['publish', 'schedule', 'approve', 'archive', 'unarchive'] as const) {
        const d = decideTransition(action, state(status, { approved: true }), EDITOR);
        expect(d.ok).toBe(false);
      }
    }
  });

  it("editors cannot submit someone else's article", () => {
    const d = decideTransition('submit', state('draft', { isOwn: false }), EDITOR);
    expect(d).toEqual({ ok: false, reason: 'FORBIDDEN', missing: ['articles.update_any'] });
  });

  it('reviewer publishes from review (implicit approval recorded)', () => {
    expect(decideTransition('publish', state('in_review'), REVIEWER)).toEqual({
      ok: true,
      to: 'published',
      implicitApproval: true,
    });
    expect(decideTransition('publish', state('in_review', { approved: true }), REVIEWER)).toEqual({
      ok: true,
      to: 'published',
      implicitApproval: false,
    });
  });

  it('a publisher without review permission needs a recorded approval', () => {
    expect(decideTransition('publish', state('in_review'), PUBLISHER_ONLY)).toEqual({
      ok: false,
      reason: 'ARTICLE_NOT_APPROVED',
    });
    expect(
      decideTransition('schedule', state('in_review', { approved: true }), PUBLISHER_ONLY).ok,
    ).toBe(true);
  });

  it('nothing is published straight from draft (review first)', () => {
    expect(decideTransition('publish', state('draft'), REVIEWER)).toEqual({
      ok: false,
      reason: 'ARTICLE_INVALID_TRANSITION',
    });
    expect(decideTransition('schedule', state('draft'), REVIEWER).ok).toBe(false);
  });

  it('approve once; reject goes back to draft', () => {
    expect(decideTransition('approve', state('in_review', { approved: true }), REVIEWER).ok).toBe(
      false,
    );
    expect(decideTransition('reject', state('in_review'), REVIEWER)).toMatchObject({
      ok: true,
      to: 'draft',
    });
  });

  it('scheduled → published / in_review; published → archived → published; unpublish → draft', () => {
    expect(
      decideTransition('publish', state('scheduled', { approved: true }), REVIEWER),
    ).toMatchObject({ to: 'published' });
    expect(decideTransition('unschedule', state('scheduled'), REVIEWER)).toMatchObject({
      to: 'in_review',
    });
    expect(decideTransition('archive', state('published'), REVIEWER)).toMatchObject({
      to: 'archived',
    });
    expect(decideTransition('unarchive', state('archived'), REVIEWER)).toMatchObject({
      to: 'published',
    });
    expect(decideTransition('unpublish', state('published'), REVIEWER)).toMatchObject({
      to: 'draft',
    });
    expect(decideTransition('unpublish', state('archived'), REVIEWER)).toMatchObject({
      to: 'draft',
    });
    expect(decideTransition('archive', state('draft'), REVIEWER).ok).toBe(false);
  });

  it('deleted articles allow no action', () => {
    for (const action of WORKFLOW_ACTIONS) {
      expect(decideTransition(action, state('draft', { deleted: true }), REVIEWER).ok).toBe(false);
    }
  });

  it('edit rules: own vs any, live content needs publish, archived is frozen', () => {
    expect(editDecision(state('draft'), EDITOR)).toEqual({ ok: true });
    expect(editDecision(state('draft', { isOwn: false }), EDITOR)).toEqual({
      ok: false,
      reason: 'ARTICLE_NOT_OWNER',
    });
    expect(editDecision(state('draft', { isOwn: false }), REVIEWER)).toEqual({ ok: true });
    expect(editDecision(state('published'), EDITOR)).toEqual({
      ok: false,
      reason: 'ARTICLE_EDIT_NEEDS_PUBLISH',
    });
    expect(editDecision(state('scheduled'), EDITOR).ok).toBe(false);
    expect(editDecision(state('published'), REVIEWER)).toEqual({ ok: true });
    expect(editDecision(state('archived'), REVIEWER)).toEqual({
      ok: false,
      reason: 'ARTICLE_ARCHIVED',
    });
  });
});
