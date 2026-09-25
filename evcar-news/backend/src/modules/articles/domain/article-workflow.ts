import { ContentStatus } from '../../../generated/prisma/enums';

/**
 * Editorial workflow of articles (REQUIREMENTS §5, §17, contract §4.5):
 *
 *   draft ──submit──▶ in_review ──approve──▶ in_review (approved)
 *     ▲                  │  │                    │
 *     └──withdraw/reject─┘  │                    ├─schedule──▶ scheduled ──(due)──▶ published
 *                           │                    └─publish──────────────────────────▶ published
 *   scheduled ──unschedule──▶ in_review (approval kept)      published ──archive──▶ archived
 *   published / archived ──unpublish──▶ draft                archived ──unarchive──▶ published
 *
 * Permissions (seeded roles): editors write and submit (articles.create /
 * update / submit); content reviewers approve or reject (articles.review);
 * articles.publish schedules / publishes / unpublishes; articles.archive
 * archives. Publishing or scheduling needs a completed review: an explicit
 * approval, or the publisher holds articles.review themself (the approval is
 * then recorded in their name). Nothing is ever published automatically
 * except a scheduled article whose time has come (it was approved before
 * being scheduled).
 */
export const WORKFLOW_ACTIONS = [
  'submit',
  'withdraw',
  'approve',
  'reject',
  'schedule',
  'unschedule',
  'publish',
  'unpublish',
  'archive',
  'unarchive',
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export interface WorkflowState {
  status: ContentStatus;
  /** reviewedAt set after the last submission (and not cleared by an edit). */
  approved: boolean;
  /** Caller is the author or creator of the article. */
  isOwn: boolean;
  deleted: boolean;
}

export type WorkflowDecision =
  | { ok: true; to: ContentStatus; implicitApproval: boolean }
  | {
      ok: false;
      reason: 'FORBIDDEN' | 'ARTICLE_INVALID_TRANSITION' | 'ARTICLE_NOT_APPROVED';
      /** Permissions that would allow the action (FORBIDDEN only). */
      missing?: string[];
    };

/** Route-level permission of each action (checked by the guard; repeated here for allowedActions). */
export const ACTION_PERMISSION: Record<WorkflowAction, string> = {
  submit: 'articles.submit',
  withdraw: 'articles.submit',
  approve: 'articles.review',
  reject: 'articles.review',
  schedule: 'articles.publish',
  unschedule: 'articles.publish',
  publish: 'articles.publish',
  unpublish: 'articles.publish',
  archive: 'articles.archive',
  unarchive: 'articles.publish',
};

const S = ContentStatus;

/** Target status for each action and the statuses it can start from. */
const TRANSITIONS: Record<WorkflowAction, { from: ContentStatus[]; to: ContentStatus }> = {
  submit: { from: [S.draft], to: S.in_review },
  withdraw: { from: [S.in_review], to: S.draft },
  approve: { from: [S.in_review], to: S.in_review },
  reject: { from: [S.in_review], to: S.draft },
  schedule: { from: [S.in_review, S.scheduled], to: S.scheduled },
  unschedule: { from: [S.scheduled], to: S.in_review },
  publish: { from: [S.in_review, S.scheduled], to: S.published },
  unpublish: { from: [S.published, S.archived], to: S.draft },
  archive: { from: [S.published], to: S.archived },
  unarchive: { from: [S.archived], to: S.published },
};

/**
 * Decides whether `action` is allowed for a caller holding `permissions`
 * on an article in `state`. Pure function (unit-tested); the service
 * applies the result.
 */
export function decideTransition(
  action: WorkflowAction,
  state: WorkflowState,
  permissions: ReadonlySet<string>,
): WorkflowDecision {
  const has = (p: string) => permissions.has(p);
  const rule = TRANSITIONS[action];
  if (state.deleted || !rule.from.includes(state.status)) {
    return { ok: false, reason: 'ARTICLE_INVALID_TRANSITION' };
  }
  switch (action) {
    case 'submit':
      // Authors submit their own work; submitting someone else's needs update_any.
      if (!has('articles.submit')) return forbidden('articles.submit');
      if (!state.isOwn && !has('articles.update_any')) return forbidden('articles.update_any');
      break;
    case 'withdraw':
      // The author takes the article back, or a reviewer sends it back.
      if (!(has('articles.submit') && state.isOwn) && !has('articles.review')) {
        return forbidden('articles.review');
      }
      break;
    case 'approve':
      if (!has('articles.review')) return forbidden('articles.review');
      if (state.approved) return { ok: false, reason: 'ARTICLE_INVALID_TRANSITION' };
      break;
    case 'reject':
      if (!has('articles.review')) return forbidden('articles.review');
      break;
    case 'schedule':
    case 'publish': {
      if (!has('articles.publish')) return forbidden('articles.publish');
      if (state.status === S.in_review && !state.approved) {
        if (!has('articles.review')) return { ok: false, reason: 'ARTICLE_NOT_APPROVED' };
        return { ok: true, to: rule.to, implicitApproval: true };
      }
      break;
    }
    case 'archive':
      if (!has('articles.archive')) return forbidden('articles.archive');
      break;
    default: {
      const needed = ACTION_PERMISSION[action];
      if (!has(needed)) return forbidden(needed);
    }
  }
  return { ok: true, to: rule.to, implicitApproval: false };
}

function forbidden(permission: string): WorkflowDecision {
  return { ok: false, reason: 'FORBIDDEN', missing: [permission] };
}

/** Actions the caller can perform now (drives the admin editor's buttons). */
export function allowedActions(
  state: WorkflowState,
  permissions: ReadonlySet<string>,
): WorkflowAction[] {
  return WORKFLOW_ACTIONS.filter((a) => decideTransition(a, state, permissions).ok);
}

/** Statuses whose content is live (or about to be): editing needs articles.publish. */
export const LIVE_STATUSES: readonly ContentStatus[] = [S.scheduled, S.published];

/**
 * Can the caller edit the article's content? Own articles need
 * articles.update, others articles.update_any; scheduled / published ones
 * additionally articles.publish (the change goes live immediately).
 */
export function editDecision(
  state: Pick<WorkflowState, 'status' | 'isOwn' | 'deleted'>,
  permissions: ReadonlySet<string>,
):
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'ARTICLE_ARCHIVED'
        | 'ARTICLE_NOT_OWNER'
        | 'ARTICLE_EDIT_NEEDS_PUBLISH'
        | 'ARTICLE_NOT_FOUND';
    } {
  if (state.deleted) return { ok: false, reason: 'ARTICLE_NOT_FOUND' };
  if (state.status === S.archived) return { ok: false, reason: 'ARTICLE_ARCHIVED' };
  const canEdit =
    permissions.has('articles.update_any') || (state.isOwn && permissions.has('articles.update'));
  if (!canEdit) return { ok: false, reason: 'ARTICLE_NOT_OWNER' };
  if (LIVE_STATUSES.includes(state.status) && !permissions.has('articles.publish')) {
    return { ok: false, reason: 'ARTICLE_EDIT_NEEDS_PUBLISH' };
  }
  return { ok: true };
}
