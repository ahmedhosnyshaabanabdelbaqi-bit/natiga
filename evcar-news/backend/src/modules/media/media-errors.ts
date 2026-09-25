/**
 * Localized errors of the media library (ar/en). Field errors use the
 * global validation shape: 422 VALIDATION_FAILED,
 * details: [{ field, constraints: { <rule>: <message> } }].
 */
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { tr, type Bilingual } from '../../common/validation/messages';
import type { ValidationProblem } from './domain/panorama-checks';

export function mediaFieldError(field: string, rule: string, message: Bilingual): AppException {
  return AppException.validation([{ field, constraints: { [rule]: tr(message) } }]);
}

function err(status: HttpStatus, code: string, message: Bilingual, details?: unknown) {
  return new AppException({ status, code, message, details });
}

export const MediaErrors = {
  notFound: (entity = 'media_asset') =>
    new AppException({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      details: { entity },
    }),

  sessionGone: (status: string) =>
    err(
      HttpStatus.GONE,
      'UPLOAD_SESSION_CLOSED',
      {
        ar: 'جلسة الرفع منتهية أو ملغاة. ابدأ رفعًا جديدًا.',
        en: 'The upload session has expired or was cancelled. Start a new upload.',
      },
      { status },
    ),

  offsetMismatch: (expectedOffset: number) =>
    err(
      HttpStatus.CONFLICT,
      'UPLOAD_OFFSET_MISMATCH',
      {
        ar: 'موضع الجزء المرسل لا يطابق ما استلمه الخادم. استأنف من الموضع المذكور.',
        en: 'The chunk offset does not match what the server has received. Resume from the given offset.',
      },
      { expectedOffset },
    ),

  offsetHeaderMissing: () =>
    err(HttpStatus.BAD_REQUEST, 'UPLOAD_OFFSET_REQUIRED', {
      ar: 'أرسل الترويسة Upload-Offset برقم صحيح.',
      en: 'Send the Upload-Offset header with an integer value.',
    }),

  emptyChunk: () =>
    err(HttpStatus.BAD_REQUEST, 'UPLOAD_CHUNK_EMPTY', {
      ar: 'الجزء المرسل فارغ. أرسل البيانات بنوع application/offset+octet-stream.',
      en: 'The chunk is empty. Send the bytes as application/offset+octet-stream.',
    }),

  chunkTooSmall: (minBytes: number) =>
    err(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'UPLOAD_CHUNK_TOO_SMALL',
      {
        ar: 'كل جزء عدا الأخير يجب ألا يقل عن 5 ميغابايت مع مزود التخزين الحالي.',
        en: 'Every chunk except the last one must be at least 5 MiB with the current storage provider.',
      },
      { minBytes },
    ),

  exceedsLength: (totalBytes: number) =>
    err(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'UPLOAD_EXCEEDS_LENGTH',
      {
        ar: 'البيانات المرسلة تتجاوز حجم الملف المعلن عند بدء الرفع.',
        en: 'The data sent exceeds the file size declared when the upload started.',
      },
      { totalBytes },
    ),

  tooManyParts: () =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'UPLOAD_TOO_MANY_PARTS', {
      ar: 'عدد الأجزاء تجاوز الحد (10000). استخدم أجزاء أكبر.',
      en: 'Too many chunks (max 10 000). Use larger chunks.',
    }),

  fileTooLarge: (maxBytes: number) =>
    err(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'UPLOAD_TOO_LARGE',
      {
        ar: 'حجم الملف أكبر من الحد المسموح لهذا النوع.',
        en: 'The file is larger than allowed for this kind.',
      },
      { maxBytes },
    ),

  incomplete: (receivedBytes: number, totalBytes: number) =>
    err(
      HttpStatus.CONFLICT,
      'UPLOAD_INCOMPLETE',
      {
        ar: 'لم يكتمل رفع الملف بعد. أرسل بقية الأجزاء ثم أعد المحاولة.',
        en: 'The upload is not complete yet. Send the remaining chunks, then retry.',
      },
      { receivedBytes, totalBytes },
    ),

  notOwner: () =>
    err(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, {
      ar: 'جلسة الرفع هذه تخص مستخدمًا آخر.',
      en: 'This upload session belongs to another user.',
    }),

  rejected: (assetId: string, problems: ValidationProblem[]) =>
    err(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MEDIA_REJECTED',
      {
        ar: `رُفض الملف: ${problems.map((p) => p.message.ar).join(' ')}`,
        en: `The file was rejected: ${problems.map((p) => p.message.en).join(' ')}`,
      },
      {
        assetId,
        problems: problems.map((p) => ({
          code: p.code,
          message: tr(p.message),
          ...(p.data ? { data: p.data } : {}),
        })),
      },
    ),

  rejectedWithoutAsset: (problems: ValidationProblem[]) =>
    err(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MEDIA_REJECTED',
      {
        ar: `رُفض الملف: ${problems.map((p) => p.message.ar).join(' ')}`,
        en: `The file was rejected: ${problems.map((p) => p.message.en).join(' ')}`,
      },
      { assetId: null, problems: problems.map((p) => ({ code: p.code, message: tr(p.message) })) },
    ),

  inUse: (counts: Record<string, number>) =>
    err(
      HttpStatus.CONFLICT,
      'IN_USE',
      {
        ar: 'الملف مستخدم في جولات أو محتوى آخر. أزل الارتباط أولًا.',
        en: 'The file is used by tours or other content. Remove those references first.',
      },
      { counts },
    ),

  licenseInUse: (assets: number) =>
    err(
      HttpStatus.CONFLICT,
      'IN_USE',
      {
        ar: 'الترخيص مسجّل على ملفات. أعد تعيين تلك الملفات أولًا.',
        en: 'The licence is assigned to files. Reassign those files first.',
      },
      { assets },
    ),

  notPanorama: () =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'MEDIA_NOT_PANORAMA', {
      ar: 'هذا الإجراء خاص بصور البانوراما 360°.',
      en: 'This action only applies to 360° panoramas.',
    }),

  notReadyForCheck: (status: string) =>
    err(
      HttpStatus.CONFLICT,
      'MEDIA_NOT_READY',
      {
        ar: 'انتظر حتى تكتمل معالجة الملف (المعاينة) قبل تأكيد الفحص البصري.',
        en: 'Wait until processing (the preview) has finished before confirming the visual check.',
      },
      { status },
    ),

  warningsNotAcknowledged: (codes: string[]) =>
    err(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MEDIA_WARNINGS_NOT_ACKNOWLEDGED',
      {
        ar: 'راجع كل التحذيرات وأقرّ بها صراحة قبل تأكيد صلاحية البانوراما.',
        en: 'Review and explicitly acknowledge every warning before confirming the panorama.',
      },
      { unacknowledged: codes },
    ),

  notProcessable: (kind: string, status: string) =>
    err(
      HttpStatus.CONFLICT,
      'MEDIA_NOT_PROCESSABLE',
      {
        ar: 'لا يمكن معالجة هذا الملف (نوعه أو حالته لا يسمح).',
        en: 'This file cannot be processed (its kind or status does not allow it).',
      },
      { kind, status },
    ),

  versionKindMismatch: () =>
    mediaFieldError('previousVersionId', 'sameKind', {
      ar: 'الإصدار الجديد يجب أن يكون من نفس نوع الملف السابق.',
      en: 'A new version must have the same kind as the previous file.',
    }),

  licenseForbidden: () =>
    AppException.forbidden({
      ar: 'تسجيل الترخيص على الملف يتطلب صلاحية تسجيل الحقوق والتراخيص.',
      en: 'Recording a licence on a file requires the licenses.write permission.',
    }),

  unknownLicense: (field = 'licenseId') =>
    mediaFieldError(field, 'exists', { ar: 'الترخيص غير موجود.', en: 'Unknown licence.' }),

  videoNotAllowed: () =>
    mediaFieldError('url', 'allowedHost', {
      ar: 'الرابط غير مسموح. المسموح فقط روابط YouTube أو Vimeo عبر https.',
      en: 'Link not allowed. Only https YouTube or Vimeo links are accepted.',
    }),
};
