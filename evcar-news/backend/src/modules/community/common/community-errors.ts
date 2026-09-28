import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { tr, type Bilingual } from '../../../common/validation/messages';

/**
 * Localized errors of the community area (ar/en). Field errors use the
 * global validation shape:
 *   422 VALIDATION_FAILED, details: [{ field, constraints: { <rule>: <message> } }]
 */
export function fieldError(field: string, rule: string, message: Bilingual): AppException {
  return AppException.validation([{ field, constraints: { [rule]: tr(message) } }]);
}

function err(
  status: HttpStatus,
  code: string,
  message: Bilingual,
  details?: unknown,
  headers?: Record<string, string>,
) {
  return new AppException({ status, code, message, details, headers });
}

export const CommunityErrors = {
  notFound: (entity: string) =>
    new AppException({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      details: { entity },
    }),

  targetNotFound: (field: string) =>
    fieldError(field, 'exists', {
      ar: 'العنصر المطلوب غير موجود أو غير منشور.',
      en: 'The target does not exist or is not published.',
    }),

  emailNotVerified: () =>
    err(HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED', {
      ar: 'أكّد بريدك الإلكتروني أولًا لتتمكن من المشاركة في المجتمع.',
      en: 'Verify your e-mail address before posting in the community.',
    }),

  blocked: (details: { scope: string; expiresAt: string | null; reason: string | null }) =>
    err(
      HttpStatus.FORBIDDEN,
      'COMMUNITY_USER_BLOCKED',
      {
        ar: 'حسابك موقوف عن المشاركة في المجتمع حاليًا.',
        en: 'Your account is currently blocked from posting in the community.',
      },
      details,
    ),

  rateLimited: (retryAfterSeconds: number, details: Record<string, unknown>) =>
    err(
      HttpStatus.TOO_MANY_REQUESTS,
      'COMMUNITY_RATE_LIMITED',
      {
        ar: 'نشرت كثيرًا خلال وقت قصير. حاول مرة أخرى لاحقًا.',
        en: 'You are posting too often. Please try again later.',
      },
      { ...details, retryAfterSeconds },
      { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    ),

  tooManyLinks: (field: string, max: number) =>
    fieldError(field, 'maxLinks', {
      ar:
        max === 0
          ? 'لا يمكن إضافة روابط في المشاركات من الحسابات الجديدة.'
          : `عدد الروابط أكبر من المسموح (${max}).`,
      en:
        max === 0 ? 'New accounts cannot post links.' : `Too many links (at most ${max} allowed).`,
    }),

  duplicate: (existingId: string) =>
    err(
      HttpStatus.CONFLICT,
      'COMMUNITY_DUPLICATE_CONTENT',
      {
        ar: 'نشرت النص نفسه مؤخرًا.',
        en: 'You recently posted the same text.',
      },
      { existingId },
    ),

  reviewExists: (existingId: string) =>
    err(
      HttpStatus.CONFLICT,
      'COMMUNITY_REVIEW_EXISTS',
      {
        ar: 'لديك تقييم لهذا العنصر بالفعل. يمكنك تعديله بدل إضافة تقييم جديد.',
        en: 'You already reviewed this. Edit your review instead.',
      },
      { existingId },
    ),

  commentsClosed: () =>
    err(HttpStatus.CONFLICT, 'COMMUNITY_COMMENTS_CLOSED', {
      ar: 'التعليقات مغلقة على هذا المحتوى.',
      en: 'Comments are closed for this content.',
    }),

  notAuthor: () =>
    err(HttpStatus.FORBIDDEN, 'COMMUNITY_NOT_AUTHOR', {
      ar: 'يمكن لصاحب المشاركة فقط تنفيذ هذا الإجراء.',
      en: 'Only the author can do this.',
    }),

  notEditable: (status: string) =>
    err(
      HttpStatus.CONFLICT,
      'COMMUNITY_NOT_EDITABLE',
      {
        ar: 'لا يمكن تعديل هذه المشاركة في حالتها الحالية.',
        en: 'This post cannot be edited in its current state.',
      },
      { status },
    ),

  selfVote: () =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'COMMUNITY_SELF_VOTE', {
      ar: 'لا يمكنك التصويت على مشاركتك.',
      en: 'You cannot vote on your own post.',
    }),

  selfReport: () =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'COMMUNITY_SELF_REPORT', {
      ar: 'لا يمكنك الإبلاغ عن مشاركتك أو حسابك.',
      en: 'You cannot report your own post or account.',
    }),

  reportDuplicate: (reportId: string) =>
    err(
      HttpStatus.CONFLICT,
      'COMMUNITY_REPORT_DUPLICATE',
      {
        ar: 'أبلغت عن هذا المحتوى من قبل، وبلاغك قيد المراجعة.',
        en: 'You already reported this; your report is being reviewed.',
      },
      { reportId },
    ),

  verificationExists: (id: string, status: string) =>
    err(
      HttpStatus.CONFLICT,
      'OWNER_VERIFICATION_EXISTS',
      {
        ar: 'لديك طلب توثيق قائم أو معتمد لهذه الفئة.',
        en: 'You already have a pending or approved verification for this trim.',
      },
      { id, status },
    ),

  verificationState: (status: string, allowed: string[]) =>
    err(
      HttpStatus.CONFLICT,
      'OWNER_VERIFICATION_STATE',
      {
        ar: 'لا يمكن تنفيذ هذا الإجراء على الطلب في حالته الحالية.',
        en: 'This action is not possible in the current state of the request.',
      },
      { status, allowed },
    ),

  verificationNeedsEvidence: () =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'OWNER_VERIFICATION_NO_EVIDENCE', {
      ar: 'لا يمكن اعتماد التوثيق بالمستند دون مستند مرفوع للمراجعة.',
      en: 'A document review cannot be approved without an uploaded document.',
    }),

  blockExists: (blockId: string) =>
    err(
      HttpStatus.CONFLICT,
      'COMMUNITY_BLOCK_EXISTS',
      {
        ar: 'المستخدم محظور بالفعل في هذا النطاق.',
        en: 'The user is already blocked in this scope.',
      },
      { blockId },
    ),

  cannotBlockStaff: () =>
    err(HttpStatus.FORBIDDEN, 'COMMUNITY_CANNOT_BLOCK_STAFF', {
      ar: 'لا يمكن حظر نفسك أو حساب مالك أو مدير.',
      en: 'You cannot block yourself, an owner or an admin.',
    }),

  invalidTransition: (from: string, action: string) =>
    err(
      HttpStatus.CONFLICT,
      'COMMUNITY_INVALID_TRANSITION',
      {
        ar: 'لا يمكن تطبيق هذا الإجراء على المحتوى في حالته الحالية.',
        en: 'This action cannot be applied to the content in its current state.',
      },
      { from, action },
    ),
};
