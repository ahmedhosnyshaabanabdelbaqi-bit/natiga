/**
 * Localized errors of the tours module (ar/en).
 */
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { tr, type Bilingual } from '../../common/validation/messages';
import type { ReadinessIssue } from './domain/tour-readiness';

export function tourFieldError(field: string, rule: string, message: Bilingual): AppException {
  return AppException.validation([{ field, constraints: { [rule]: tr(message) } }]);
}

function err(status: HttpStatus, code: string, message: Bilingual, details?: unknown) {
  return new AppException({ status, code, message, details });
}

export function issueView(i: ReadinessIssue) {
  return {
    code: i.code,
    message: tr(i.message),
    ...(i.sceneId ? { sceneId: i.sceneId } : {}),
    ...(i.hotspotId ? { hotspotId: i.hotspotId } : {}),
    ...(i.assetId ? { assetId: i.assetId } : {}),
  };
}

export const TourErrors = {
  notFound: (entity = 'tour') =>
    new AppException({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      details: { entity },
    }),

  notPublishable: (problems: ReadinessIssue[]) =>
    err(
      HttpStatus.CONFLICT,
      'TOUR_NOT_PUBLISHABLE',
      {
        ar: 'لا يمكن نشر الجولة قبل جاهزية ملفاتها وتراخيصها وموافقاتها. راجع التفاصيل.',
        en: 'The tour cannot be published until its files, licences and approvals are complete. See details.',
      },
      { problems: problems.map(issueView) },
    ),

  publishedLocked: (fields: string[]) =>
    err(
      HttpStatus.CONFLICT,
      'TOUR_PUBLISHED_LOCKED',
      {
        ar: 'لا يمكن تغيير ربط جولة منشورة (الفئة، السوق، اتجاه القيادة، اللون، المرجع). ألغِ النشر أولًا.',
        en: 'The binding of a published tour (trim, market, drive side, colour, reference) cannot change. Unpublish it first.',
      },
      { fields },
    ),

  publishedAssetNotReady: (problems: ReadinessIssue[]) =>
    err(
      HttpStatus.CONFLICT,
      'TOUR_PUBLISHED_ASSET_NOT_READY',
      {
        ar: 'الجولة منشورة: الملف الجديد يجب أن يكون جاهزًا ومرخّصًا ومؤكدًا قبل استخدامه. ألغِ النشر للعمل على مسودة.',
        en: 'The tour is published: a new file must be ready, licensed and confirmed first. Unpublish to work on a draft.',
      },
      { problems: problems.map(issueView) },
    ),

  publishedNeedsScene: () =>
    err(HttpStatus.CONFLICT, 'TOUR_PUBLISHED_LAST_SCENE', {
      ar: 'لا يمكن حذف آخر مشهد من جولة منشورة. ألغِ النشر أولًا.',
      en: 'The last scene of a published tour cannot be deleted. Unpublish it first.',
    }),

  invalidTransition: (from: string, to: string) =>
    err(
      HttpStatus.CONFLICT,
      'TOUR_INVALID_TRANSITION',
      {
        ar: `لا يمكن نقل الجولة من الحالة "${from}" إلى "${to}".`,
        en: `The tour cannot move from "${from}" to "${to}".`,
      },
      { from, to },
    ),

  notReference: () =>
    err(HttpStatus.CONFLICT, 'TOUR_NOT_REFERENCE', {
      ar: 'الموافقة مطلوبة فقط للجولات المرجعية لفئة قريبة.',
      en: 'Approval only applies to reference tours of a similar trim.',
    }),

  publishedDelete: () =>
    err(HttpStatus.CONFLICT, 'TOUR_PUBLISHED', {
      ar: 'ألغِ نشر الجولة قبل حذفها.',
      en: 'Unpublish the tour before deleting it.',
    }),

  slugTaken: (slug: string) =>
    err(
      HttpStatus.CONFLICT,
      'SLUG_TAKEN',
      {
        ar: `المعرّف النصي (slug) "${slug}" مستخدم بالفعل.`,
        en: `The slug "${slug}" is already in use.`,
      },
      { slug },
    ),

  sceneKeyTaken: (key: string) =>
    err(
      HttpStatus.CONFLICT,
      'SCENE_KEY_TAKEN',
      {
        ar: `مفتاح المشهد "${key}" مستخدم في هذه الجولة.`,
        en: `The scene key "${key}" is already used in this tour.`,
      },
      { key },
    ),
};
